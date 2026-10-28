import { AppClient } from './api-client';
import { Signal, SignalEngine } from './signal-engine';

export type Mode = 'alert' | 'shadow' | 'auto';
export type RecoveryMode = 'payout' | 'multiplier';

export interface TraderConfig {
  mode: Mode;
  allowReal: boolean;
  initialStake: number;
  recoveryMode: RecoveryMode;  // payout = exact loss/payout maths, multiplier = fixed multiplier
  recoveryBarrier: 2 | 3;      // recovery = DIGITOVER <barrier>
  recoveryTarget: number;      // extra profit on top of recovered loss (payout mode)
  multiplier: number;          // stake multiplier (multiplier mode)
  waitRecoveryDigit: boolean;  // wait for last digit above the recovery barrier
  takeProfit: number;
  stopLoss: number;
  maxSteps: number;
  maxStake: number;
  cooldownMs: number;
  minConfidence: number;
}

export const DEFAULT_TRADER: TraderConfig = {
  mode: 'alert', allowReal: false, initialStake: 1, recoveryMode: 'payout', recoveryBarrier: 3,
  recoveryTarget: 0, multiplier: 2.1, waitRecoveryDigit: true, takeProfit: 10, stopLoss: 30,
  maxSteps: 6, maxStake: 50, cooldownMs: 5000, minConfidence: 90,
};

export interface JournalRow {
  ts: number; market: string; label: string; stake: number; profit: number; step: number;
}
export interface TraderState {
  status: 'idle' | 'trading' | 'stopped';
  stopReason?: string;
  note: string;
  sessionProfit: number;
  step: number;
  journal: JournalRow[];
}

/** Lets the app's own Summary / Transactions / Journal panels show our trades. */
export interface Reporter {
  contract: (c: any) => void;
  log: (msg: string, kind: 'info' | 'success' | 'error') => void;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fresh = (): TraderState => ({ status: 'idle', note: 'Waiting for a signal', sessionProfit: 0, step: 0, journal: [] });

export class AutoTrader {
  state: TraderState = fresh();
  reporter: Reporter = { contract: () => {}, log: () => {} };
  private locked = false;
  private cooldownUntil = 0;
  private killed = false;
  onUpdate: (s: TraderState) => void = () => {};

  constructor(private client: AppClient, private engine: SignalEngine, public cfg: TraderConfig) {}

  private emit() { this.onUpdate({ ...this.state, journal: [...this.state.journal] }); }
  private note(n: string) { this.state.note = n; this.emit(); }
  private stop(reason: string) {
    this.state.status = 'stopped'; this.state.stopReason = reason; this.state.note = reason;
    this.reporter.log(`Signal Center stopped: ${reason}`, 'error');
    this.emit();
  }

  kill() { this.killed = true; this.stop('Kill switch pressed'); }
  reset() { this.killed = false; this.locked = false; this.state = fresh(); this.emit(); }

  /** Call for every fresh signal. Only acts in auto mode. */
  async onSignal(s: Signal) {
    const c = this.cfg;
    if (c.mode !== 'auto' || this.locked || this.killed || this.state.status === 'stopped') return;
    if (Date.now() > s.expiresAt || s.confidence < c.minConfidence || Date.now() < this.cooldownUntil) return;
    if (!this.client.isVirtual && !c.allowReal) { this.stop('Real account blocked - enable allowReal'); return; }
    this.locked = true;
    this.state.status = 'trading'; this.emit();
    try {
      await this.client.refresh(); // account may have been switched
      if (!this.client.isVirtual && !c.allowReal) { this.stop('Real account blocked - enable allowReal'); return; }
      await this.cycle(s);
    }
    catch (e) { this.stop(`Error: ${(e as Error).message}`); }
    finally {
      this.locked = false;
      this.cooldownUntil = Date.now() + c.cooldownMs;
      if (this.state.status === 'trading') { this.state.status = 'idle'; this.state.step = 0; this.state.note = 'Waiting for a signal'; this.emit(); }
    }
  }

  private limitHit(): string | null {
    const c = this.cfg, p = this.state.sessionProfit;
    if (p >= c.takeProfit) return 'Take profit reached';
    if (p <= -c.stopLoss) return 'Stop loss reached';
    return null;
  }

  private async cycle(sig: Signal) {
    const c = this.cfg;
    let kind = sig.contract, barrier = sig.barrier, label = sig.label;
    let stake = c.initialStake, cycleLoss = 0, step = 0;
    const market = sig.market;
    this.reporter.log(`Signal ${market} ${label} (${sig.confidence}% confidence)`, 'info');

    for (;;) {
      if (this.killed) return;
      this.note(step === 0 ? `Trading ${label} on ${market} - stake ${stake}` : `Recovering step ${step}/${c.maxSteps} on ${market} - stake ${stake}`);
      const res = await this.trade(market, kind, barrier, stake, label);
      this.state.sessionProfit = r2(this.state.sessionProfit + res.profit);
      this.state.journal.push({ ts: Date.now(), market, label, stake, profit: res.profit, step });
      this.state.step = step; this.emit();
      this.reporter.log(
        `${res.profit > 0 ? 'WIN' : 'LOSS'} ${market} ${label} stake ${stake} -> ${res.profit} (session ${this.state.sessionProfit})`,
        res.profit > 0 ? 'success' : 'error',
      );

      const lim = this.limitHit();
      if (lim) return this.stop(lim);
      if (res.profit > 0) return; // win (normal or recovery) -> rescan for best market

      cycleLoss = r2(cycleLoss + stake);
      step++;
      if (step > c.maxSteps) return this.stop('Max recovery steps reached');

      kind = 'DIGITOVER'; barrier = c.recoveryBarrier; label = `Recovery Over ${barrier}`;
      if (c.recoveryMode === 'multiplier') {
        stake = r2(Math.max(0.35, stake * c.multiplier));
      } else {
        const rate = await this.profitRate(market, kind, barrier, Math.max(0.35, cycleLoss));
        stake = r2(Math.max(0.35, (cycleLoss + c.recoveryTarget) / rate));
      }
      if (stake > c.maxStake) return this.stop('Max stake reached');
      this.reporter.log(`Recovery step ${step}: Over ${barrier} on ${market}, stake ${stake} (loss to recover ${cycleLoss})`, 'info');
      if (c.waitRecoveryDigit) {
        this.note(`Recovery step ${step}: waiting for a digit above ${barrier} on ${market}`);
        await this.waitDigitAbove(market, barrier, 30000);
      }
    }
  }

  private waitDigitAbove(market: string, barrier: number, timeoutMs: number) {
    return new Promise<void>((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const d = this.engine.lastDigit(market);
        if ((d !== undefined && d > barrier) || Date.now() - t0 > timeoutMs || this.killed) { clearInterval(iv); res(); }
      }, 50);
    });
  }

  private async profitRate(market: string, kind: string, barrier: number | undefined, stake: number) {
    const p = await this.client.send({
      proposal: 1, amount: stake, basis: 'stake', contract_type: kind, currency: this.client.currency,
      duration: 1, duration_unit: 't', underlying_symbol: market, ...(barrier !== undefined && { barrier: String(barrier) }),
    });
    const rate = p.proposal.payout / p.proposal.ask_price - 1;
    if (!(rate > 0)) throw new Error('Could not read payout rate');
    return rate;
  }

  private async trade(market: string, kind: string, barrier: number | undefined, stake: number, label: string): Promise<{ profit: number }> {
    const prop = await this.client.send({
      proposal: 1, amount: stake, basis: 'stake', contract_type: kind, currency: this.client.currency,
      duration: 1, duration_unit: 't', underlying_symbol: market, ...(barrier !== undefined && { barrier: String(barrier) }),
    });
    const buy = await this.client.send({ buy: prop.proposal.id, price: prop.proposal.ask_price });
    const id = buy.buy.contract_id;
    const base = {
      contract_id: id, id: String(id), contract_type: kind, underlying: market, display_name: market,
      currency: this.client.currency, buy_price: buy.buy.buy_price, payout: buy.buy.payout,
      date_start: buy.buy.start_time, shortcode: buy.buy.shortcode, longcode: buy.buy.longcode || label,
      transaction_ids: { buy: buy.buy.transaction_id }, is_sold: 0, status: 'open', profit: 0,
    };
    this.reporter.contract(base);
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      await new Promise((r) => setTimeout(r, 600));
      const r = await this.client.send({ proposal_open_contract: 1, contract_id: id });
      const c = r.proposal_open_contract;
      if (c) this.reporter.contract({ ...base, ...c, id: c.id ?? base.id });
      if (c?.is_sold) return { profit: Number(c.profit) };
    }
    throw new Error('Contract result timeout');
  }
}
