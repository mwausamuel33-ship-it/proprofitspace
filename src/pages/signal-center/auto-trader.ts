import { AppClient } from './api-client';
import { ContractRisk, Family, Signal, SignalEngine } from './signal-engine';
import { effectiveStop, riskPlan } from './risk';

export type Mode = 'alert' | 'shadow' | 'auto';
export type RecoveryMode = 'payout' | 'multiplier';
export type RecoveryChoice = 'smart' | 'over2' | 'over3' | 'same';

/** Each strategy family is switched on/off and tuned separately. */
export interface FamilyCfg {
  enabled: boolean;
  stake: number;
  minConfidence: number;
  recovery: RecoveryChoice;    // smart = safest strong contract (Over 1-3 / Under 6-9) that fits max stake
}

export interface TraderConfig {
  mode: Mode;
  allowReal: boolean;
  families: Record<Family, FamilyCfg>;
  runsPerSignal: number;       // trades taken while a signal stays strong
  stayConfidence: number;      // signal must stay at/above this to keep trading it
  recoveryMode: RecoveryMode;  // payout = exact loss/payout maths, multiplier = fixed multiplier
  recoveryStages: number;      // recover the loss in 1, 2 or 3 wins (smaller, safer stakes)
  recoveryTarget: number;      // extra profit on top of the recovered loss
  multiplier: number;
  waitRecoveryDigit: boolean;  // wait for a favourable last digit before a recovery trade
  takeProfit: number;
  stopLoss: number;
  maxSteps: number;
  maxStake: number;
  cooldownMs: number;
  scanMs: number;              // how long to collect signals before picking the best market
  autoStake: boolean;          // size the first stake from the account balance
  riskPerTradePct: number;     // % of balance risked on a first trade
  maxCycleRiskPct: number;     // max % of balance one loss + recovery cycle may risk
  stopLossPct: number;         // session stop loss as % of starting balance (0 = off)
  contractRisk: ContractRisk;  // which safer Over/Under contracts may be traded
}

export const DEFAULT_TRADER: TraderConfig = {
  mode: 'alert', allowReal: false,
  families: {
    overunder: { enabled: true, stake: 1, minConfidence: 90, recovery: 'smart' },
    evenodd: { enabled: false, stake: 1, minConfidence: 90, recovery: 'smart' },
    matchesdiffers: { enabled: false, stake: 1, minConfidence: 92, recovery: 'smart' },
  },
  runsPerSignal: 3, stayConfidence: 80,
  recoveryMode: 'payout', recoveryStages: 1, recoveryTarget: 0, multiplier: 2.1, waitRecoveryDigit: true,
  takeProfit: 10, stopLoss: 30, maxSteps: 6, maxStake: 50, cooldownMs: 5000, scanMs: 1500,
  autoStake: false, riskPerTradePct: 1, maxCycleRiskPct: 5, stopLossPct: 10, contractRisk: 'standard',
};

export interface JournalRow {
  ts: number; family: Family; market: string; label: string; stake: number; profit: number; step: number;
}
export interface TraderState {
  status: 'idle' | 'trading' | 'stopped';
  stopReason?: string;
  note: string;
  sessionProfit: number;
  step: number;
  startBalance: number;
  journal: JournalRow[];
}

/** Lets the app's own Summary / Transactions / Journal panels show our trades. */
export interface Reporter {
  contract: (c: any) => void;
  log: (msg: string, kind: 'info' | 'success' | 'error') => void;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fresh = (): TraderState => ({ status: 'idle', note: 'Waiting for a signal', sessionProfit: 0, step: 0, startBalance: 0, journal: [] });
type Pick = { kind: string; barrier?: number; label: string };

export class AutoTrader {
  state: TraderState = fresh();
  reporter: Reporter = { contract: () => {}, log: () => {} };
  private locked = false;
  private cooldownUntil = 0;
  private killed = false;
  private cycleBalance = 0;
  private queue: Signal[] = [];
  private scanTimer?: ReturnType<typeof setTimeout>;
  onUpdate: (s: TraderState) => void = () => {};

  constructor(private client: AppClient, private engine: SignalEngine, public cfg: TraderConfig) {}

  private emit() { this.onUpdate({ ...this.state, journal: [...this.state.journal] }); }
  private note(n: string) { this.state.note = n; this.emit(); }
  private stop(reason: string) {
    this.state.status = 'stopped'; this.state.stopReason = reason; this.state.note = reason;
    this.reporter.log(`Signal Center stopped: ${reason}`, 'error');
    this.emit();
  }

  kill() { this.killed = true; this.queue = []; this.stop('Kill switch pressed'); }
  reset() { this.killed = false; this.locked = false; this.queue = []; this.state = fresh(); this.emit(); }

  /** Collects signals for a short window, then trades the strongest one (best market). */
  onSignal(s: Signal) {
    const c = this.cfg;
    if (c.mode !== 'auto' || this.locked || this.killed || this.state.status === 'stopped') return;
    const fam = c.families[s.family];
    if (!fam.enabled || s.confidence < fam.minConfidence || Date.now() < this.cooldownUntil) return;
    this.queue.push(s);
    if (!this.scanTimer) {
      this.note('Scanning markets for the best signal...');
      this.scanTimer = setTimeout(() => { this.scanTimer = undefined; this.pickBest(); }, c.scanMs);
    }
  }

  private async pickBest() {
    const now = Date.now();
    const valid = this.queue.filter((s) => s.expiresAt > now);
    this.queue = [];
    if (!valid.length || this.locked || this.killed || this.state.status === 'stopped') { this.note('Waiting for a signal'); return; }
    const best = valid.sort((a, b) => b.confidence - a.confidence)[0];
    const c = this.cfg;
    if (!this.client.isVirtual && !c.allowReal) { this.stop('Real account blocked - enable allowReal'); return; }
    this.locked = true;
    this.state.status = 'trading'; this.emit();
    try {
      await this.client.refresh(); // account may have been switched
      if (!this.state.startBalance) this.state.startBalance = this.client.balance;
      if (!this.client.isVirtual && !c.allowReal) { this.stop('Real account blocked - enable allowReal'); return; }
      await this.cycle(best);
    }
    catch (e) { this.stop(`Error: ${(e as Error).message}`); }
    finally {
      this.locked = false;
      this.cooldownUntil = Date.now() + c.cooldownMs;
      if (this.state.status === 'trading') { this.state.status = 'idle'; this.state.step = 0; this.state.note = 'Waiting for a signal'; this.emit(); }
    }
  }

  /** Max total a loss + recovery cycle may risk, from the balance at the start of the cycle. */
  private cycleCap() { return r2((this.cycleBalance * this.cfg.maxCycleRiskPct) / 100); }

  private firstStake(manual: number) {
    return this.cfg.autoStake ? riskPlan(this.cycleBalance, this.cfg, manual).stake : manual;
  }

  private limitHit(): string | null {
    const c = this.cfg, p = this.state.sessionProfit;
    if (p >= c.takeProfit) return 'Take profit reached';
    if (p <= -effectiveStop(this.state.startBalance || this.client.balance, c)) return 'Stop loss reached';
    return null;
  }

  /** One trade: place it, record it, report it, check take-profit / stop-loss. */
  private async exec(sig: Signal, pick: Pick, stake: number, step: number): Promise<{ profit: number; stopped: boolean }> {
    const market = sig.market;
    this.state.step = step;
    this.note(step === 0 ? `Trading ${pick.label} on ${market} - stake ${stake}` : `Recovery step ${step}/${this.cfg.maxSteps}: ${pick.label} on ${market} - stake ${stake}`);
    const res = await this.trade(market, pick.kind, pick.barrier, stake, pick.label);
    this.state.sessionProfit = r2(this.state.sessionProfit + res.profit);
    await this.client.refresh(); // keep the balance current for the protection checks
    this.state.journal.push({ ts: Date.now(), family: sig.family, market, label: pick.label, stake, profit: res.profit, step });
    this.emit();
    this.reporter.log(`${res.profit > 0 ? 'WIN' : 'LOSS'} ${market} ${pick.label} stake ${stake} -> ${res.profit} (session ${this.state.sessionProfit})`, res.profit > 0 ? 'success' : 'error');
    const lim = this.limitHit();
    if (lim) { this.stop(lim); return { profit: res.profit, stopped: true }; }
    return { profit: res.profit, stopped: false };
  }

  private async cycle(sig: Signal) {
    const c = this.cfg, fam = c.families[sig.family];
    let pick: Pick = { kind: sig.contract, barrier: sig.barrier, label: sig.label };
    let runs = 0;
    this.reporter.log(`Signal ${sig.market} ${sig.label} (${sig.confidence}% confidence)`, 'info');

    for (;;) {
      if (this.killed) return;
      this.cycleBalance = this.client.balance;
      const stake = this.firstStake(fam.stake);
      const cap = this.cycleCap();
      if (stake > cap || stake > c.maxStake || stake > this.client.balance) { this.stop(`Balance protection: stake ${stake} is above the limit (cycle risk cap ${cap}, max stake ${c.maxStake})`); return; }
      const res = await this.exec(sig, pick, stake, 0);
      if (res.stopped) return;
      if (res.profit <= 0) { await this.recover(sig, stake); return; }   // loss -> recover, then rescan
      runs++;
      if (runs >= c.runsPerSignal) { this.reporter.log(`${runs} runs done on ${sig.market} - rescanning markets`, 'info'); return; }
      const next = this.engine.check(sig, c.stayConfidence);
      if (!next) { this.reporter.log(`Signal on ${sig.market} weakened - rescanning markets`, 'info'); return; }
      pick = { kind: next.contract, barrier: next.barrier, label: sig.family === 'overunder' ? `${next.label} (bias ${sig.trigger.label})` : next.label };
    }
  }

  /** Recover the loss with less risky contracts, in 1-3 stages, until the loss is won back. */
  private async recover(sig: Signal, firstLoss: number) {
    const c = this.cfg, fam = c.families[sig.family];
    let remaining = r2(firstLoss), stagesLeft = Math.max(1, Math.round(c.recoveryStages)), step = 1, lastStake = firstLoss;
    this.reporter.log(`Loss on ${sig.market}: recovering ${remaining} in ${stagesLeft} stage(s) with safer contracts`, 'info');

    while (remaining > 0.009) {
      if (this.killed) return;
      if (step > c.maxSteps) return this.stop('Max recovery steps reached');
      const target = r2(remaining / stagesLeft + (stagesLeft === 1 ? c.recoveryTarget : 0));
      const ch = await this.chooseRecovery(sig, fam.recovery, target, lastStake, remaining);
      if (!ch) return this.stop(`Balance protection: no safe recovery fits the limits (loss ${remaining}, cycle cap ${this.cycleCap()})`);
      this.reporter.log(`Recovery step ${step}: ${ch.label} on ${sig.market}, stake ${ch.stake} (to recover ${remaining}, target ${target})`, 'info');
      if (c.waitRecoveryDigit) { this.note(`Recovery step ${step}: waiting for a favourable digit on ${sig.market}`); await this.waitDigit(sig.market, ch.kind, ch.barrier, 30000); }
      const res = await this.exec(sig, ch, ch.stake, step);
      if (res.stopped) return;
      lastStake = ch.stake;
      if (res.profit > 0) {
        remaining = r2(remaining - res.profit);
        stagesLeft = Math.max(1, stagesLeft - 1);
        if (remaining > 0.009) this.reporter.log(`Recovery win: ${remaining} still to recover`, 'info');
      } else {
        remaining = r2(remaining + ch.stake);
      }
      step++;
    }
    this.reporter.log(`Loss recovered on ${sig.market} - rescanning markets`, 'success');
  }

  /** Pick the safest strong contract on this market whose required stake fits the limits. */
  private async chooseRecovery(sig: Signal, choice: RecoveryChoice, target: number, lastStake: number, remaining: number): Promise<(Pick & { stake: number }) | null> {
    const c = this.cfg;
    let opts: Pick[];
    if (choice === 'over2') opts = [{ kind: 'DIGITOVER', barrier: 2, label: 'Recovery Over 2' }];
    else if (choice === 'over3') opts = [{ kind: 'DIGITOVER', barrier: 3, label: 'Recovery Over 3' }];
    else if (choice === 'same') opts = [{ kind: sig.contract, barrier: sig.barrier, label: `Recovery ${sig.label}` }];
    else {
      opts = this.engine.recoveryOptions(sig.market).map((x) => ({ kind: x.contract, barrier: x.barrier, label: `Recovery ${x.label}` }));
      if (!opts.length) opts = [{ kind: 'DIGITOVER', barrier: 3, label: 'Recovery Over 3' }];
    }
    for (const o of opts) {
      try {
        let stake: number;
        if (c.recoveryMode === 'multiplier') stake = r2(Math.max(0.35, lastStake * c.multiplier));
        else {
          const rate = await this.profitRate(sig.market, o.kind, o.barrier, Math.max(0.35, target));
          stake = r2(Math.max(0.35, target / rate));
        }
        if (stake <= c.maxStake && stake <= this.client.balance && r2(remaining + stake) <= this.cycleCap()) return { ...o, stake };
      } catch { /* try the next contract */ }
    }
    return null;
  }

  private waitDigit(market: string, kind: string, barrier: number | undefined, timeoutMs: number) {
    if (barrier === undefined || (kind !== 'DIGITOVER' && kind !== 'DIGITUNDER')) return Promise.resolve();
    return new Promise<void>((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const d = this.engine.lastDigit(market);
        const ok = d !== undefined && (kind === 'DIGITOVER' ? d > barrier : d < barrier);
        if (ok || Date.now() - t0 > timeoutMs || this.killed) { clearInterval(iv); res(); }
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
