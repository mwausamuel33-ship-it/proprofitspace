/**
 * Accumulator module. Accumulators pay compound growth per tick while the price stays inside a barrier;
 * a tick outside it loses the whole stake. There is no recovery/martingale here: a loss is the stake.
 * Premium parts: calm-market entry, per-market expected-value estimate from the live barrier, a take-profit
 * target in ticks, knockout-streak stop, balance-based stake, shadow mode that scores entries without money.
 * NOTE: ticks are random, so this cannot guarantee profit; shadow mode shows whether the filters help.
 */
import { AppClient } from './api-client';
import { Reporter } from './auto-trader';

export type AccuMode = 'off' | 'shadow' | 'auto';
export interface AccuConfig {
  mode: AccuMode;
  stake: number;
  autoStake: boolean;     // stake = riskPct % of balance
  riskPct: number;
  growthRate: number;     // 0.01 .. 0.05 per tick
  targetTicks: number;    // auto take profit after this many ticks of growth
  calmEntry: boolean;     // only enter after a calm stretch (no recent spike)
  maxEdgeLossPct: number; // skip when the estimated expected loss is worse than this %
  maxLossStreak: number;  // stop after this many knockouts in a row
  takeProfit: number;     // session limits (money)
  stopLoss: number;
  cooldownMs: number;
  recovery: 'off' | 'capped';  // capped = win back a knockout with a limited, calculated stake
  recoveryGrowth: number;      // growth rate for recovery trades (higher growth = smaller stake needed)
  recoveryTicks: number;       // target ticks for recovery trades
  maxRecoveryTries: number;    // recovery attempts per knockout before the loss is accepted
  cycleRiskPct: number;        // max % of balance one knockout + recovery cycle may risk
  defensiveTrades: number;     // after a knockout, trade smaller for this many trades
  defensiveMult: number;       // stake multiplier while defensive
  goalPct: number;             // stop for the session at this % gain of the starting balance (0 = off)
  lossPct: number;             // stop for the session at this % loss of the starting balance (0 = off)
  maxTrades: number;           // trades per session (0 = unlimited) - fewer trades, less margin paid
}
export const DEFAULT_ACCU: AccuConfig = {
  mode: 'off', stake: 1, autoStake: false, riskPct: 0.5, growthRate: 0.01, targetTicks: 5, calmEntry: true,
  maxEdgeLossPct: 6, maxLossStreak: 3, takeProfit: 5, stopLoss: 15, cooldownMs: 3000,
  recovery: 'off', recoveryGrowth: 0.05, recoveryTicks: 5, maxRecoveryTries: 2, cycleRiskPct: 3,
  defensiveTrades: 2, defensiveMult: 0.5, goalPct: 5, lossPct: 5, maxTrades: 20,
};

export interface PlannerRow { g: number; n: number; profitPct: number; needSurvive: number; recoveryMult: number; allowed: boolean }
/** Maths table: for each growth rate / target, the survival rate needed to break even and the stake needed to win back one loss. */
export function accuPlanner(balance: number, cfg: AccuConfig): PlannerRow[] {
  const base = cfg.autoStake ? Math.max(0.35, (balance * cfg.riskPct) / 100) : cfg.stake;
  const cap = (balance * cfg.cycleRiskPct) / 100;
  const rows: PlannerRow[] = [];
  for (const g of [0.01, 0.02, 0.03, 0.04, 0.05]) for (const n of [3, 5, 8, 10]) {
    const G = Math.pow(1 + g, n);
    const mult = 1 / (G - 1);
    rows.push({ g, n, profitPct: (G - 1) * 100, needSurvive: (1 / G) * 100, recoveryMult: mult, allowed: base + base * mult <= cap });
  }
  return rows;
}

export interface Calm { ok: boolean; ratio: number; spike: boolean; score: number }
export interface Assessment { breach: number; survive: number; ev: number }
export interface AccuBoardRow { market: string; calm: Calm; ev?: number; breach?: number; distance?: number }
export interface AccuRow { ts: number; market: string; stake: number; profit: number; ticks: number; kind: 'target' | 'knockout' | 'closed'; rec?: boolean }
export interface AccuState {
  status: 'idle' | 'trading' | 'stopped';
  note: string;
  stopReason?: string;
  sessionProfit: number;
  lossStreak: number;
  startBalance: number;
  cycleLoss: number;      // net loss still to win back in the current cycle
  tries: number;          // recovery attempts used in this cycle
  defensive: number;      // trades left at reduced stake
  rows: AccuRow[];
  shadow: { n: number; survived: number; expected: number };
  board: AccuBoardRow[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fresh = (): AccuState => ({
  status: 'idle', note: 'Scanning for a calm market', sessionProfit: 0, lossStreak: 0, startBalance: 0, cycleLoss: 0, tries: 0, defensive: 0,
  rows: [], shadow: { n: 0, survived: 0, expected: 0 }, board: [],
});

export class AccuAnalyzer {
  private prices = new Map<string, number[]>();
  bootstrap(m: string, prices: number[]) { this.prices.set(m, prices.slice(-600)); }
  push(m: string, price: number) {
    const a = this.prices.get(m) ?? [];
    a.push(price); if (a.length > 600) a.shift();
    this.prices.set(m, a);
  }
  last(m: string): number | undefined { const a = this.prices.get(m); return a?.[a.length - 1]; }
  private moves(m: string): number[] {
    const a = this.prices.get(m) ?? [];
    const out: number[] = [];
    for (let i = 1; i < a.length; i++) out.push(Math.abs(a[i] - a[i - 1]));
    return out;
  }
  /** Calm = recent movement not above its long-run level and no spike in the last 5 ticks. */
  calm(m: string): Calm | undefined {
    const mv = this.moves(m);
    if (mv.length < 120) return undefined;
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    const ratio = mean(mv.slice(-20)) / (mean(mv) || 1);
    const sorted = [...mv].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const spike = Math.max(...mv.slice(-5)) >= p95;
    const score = Math.max(0, Math.round((Math.min(1.5, Math.max(0, 1.5 - ratio)) / 1.5) * 100) - (spike ? 40 : 0));
    return { ok: ratio <= 1 && !spike, ratio: +ratio.toFixed(2), spike, score };
  }
  /** Estimated odds from how often a tick moved at least `distance` over the last 500 moves. */
  assess(m: string, distance: number, g: number, n: number): Assessment | undefined {
    const mv = this.moves(m).slice(-500);
    if (mv.length < 100 || !(distance > 0)) return undefined;
    const breach = mv.filter((x) => x >= distance).length / mv.length;
    const survive = Math.pow(1 - breach, n);
    return { breach: +breach.toFixed(4), survive, ev: survive * Math.pow(1 + g, n) - 1 };
  }
}

type Virtual = { m: string; prev: number; distance: number; left: number; n: number; expected: number };

export class AccuTrader {
  state: AccuState = fresh();
  reporter: Reporter = { contract: () => {}, log: () => {} };
  analyzer = new AccuAnalyzer();
  onUpdate: (s: AccuState) => void = () => {};
  private busy = false;
  private killed = false;
  private cooldownUntil = 0;
  private virtual?: Virtual;
  private cycleBal = 0;

  constructor(private client: AppClient, public cfg: AccuConfig, private allowReal: () => boolean, private markets: string[]) {}

  private emit() { this.onUpdate({ ...this.state, rows: [...this.state.rows], board: [...this.state.board] }); }
  private note(n: string) { if (n !== this.state.note) { this.state.note = n; this.emit(); } }
  private stop(reason: string) {
    this.state.status = 'stopped'; this.state.stopReason = reason; this.state.note = reason;
    this.reporter.log(`Accumulator stopped: ${reason}`, 'error');
    this.emit();
  }
  kill() { this.killed = true; this.stop('Kill switch pressed'); }
  reset() { this.killed = false; this.busy = false; this.virtual = undefined; this.state = fresh(); this.emit(); }

  bootstrap(m: string, prices: number[]) { this.analyzer.bootstrap(m, prices); }

  /** Every tick: keep prices, and score the shadow position if one is open. */
  onTick(m: string, price: number) {
    this.analyzer.push(m, price);
    const v = this.virtual;
    if (!v || v.m !== m) return;
    const move = Math.abs(price - v.prev);
    v.prev = price;
    const s = this.state.shadow;
    if (move >= v.distance) { s.n++; s.expected += v.expected; this.virtual = undefined; this.emit(); return; }
    v.left--;
    if (v.left <= 0) { s.n++; s.survived++; s.expected += v.expected; this.virtual = undefined; this.emit(); }
  }

  private stakeNow() {
    const c = this.cfg;
    return c.autoStake ? Math.max(0.35, Math.floor(((this.client.balance * c.riskPct) / 100) * 100) / 100) : c.stake;
  }
  private tpAmount(stake: number, g = this.cfg.growthRate, n = this.cfg.targetTicks) { return r2(stake * (Math.pow(1 + g, n) - 1)); }

  /** What to trade next: a normal trade, a capped recovery trade, or accept the loss when recovery would break the limits. */
  private plan(): { kind: 'normal' | 'recovery'; g: number; n: number; stake: number } {
    const c = this.cfg, s = this.state;
    if (s.cycleLoss > 0.009 && c.recovery === 'capped') {
      const need = r2(Math.max(0.35, s.cycleLoss / (Math.pow(1 + c.recoveryGrowth, c.recoveryTicks) - 1)));
      const cap = r2((this.cycleBal * c.cycleRiskPct) / 100);
      const why = s.tries >= c.maxRecoveryTries ? `${s.tries} recovery attempts used`
        : r2(s.cycleLoss + need) > cap ? `recovery needs stake ${need} for loss ${s.cycleLoss}, above the cycle cap ${cap}`
        : need > this.client.balance ? 'stake would exceed the balance' : '';
      if (!why) return { kind: 'recovery', g: c.recoveryGrowth, n: c.recoveryTicks, stake: need };
      this.reporter.log(`Accumulator: loss of ${s.cycleLoss} accepted (${why})`, 'info');
      s.cycleLoss = 0; s.tries = 0;
    }
    return { kind: 'normal', g: c.growthRate, n: c.targetTicks, stake: Math.max(0.35, r2(this.stakeNow() * (s.defensive > 0 ? c.defensiveMult : 1))) };
  }

  /** Called on a timer. Scans markets, picks the best calm one, then trades (auto) or scores it (shadow). */
  async step() {
    const c = this.cfg;
    if (c.mode === 'off' || this.busy || this.killed || this.state.status === 'stopped' || this.virtual || Date.now() < this.cooldownUntil) return;
    this.busy = true;
    try { await this.scan(); }
    catch (e) { this.note(`Scan error: ${(e as Error).message}`); }
    finally { this.busy = false; }
  }

  private async barrierDistance(m: string, stake: number, g: number, n: number): Promise<number | undefined> {
    const p = await this.client.send({
      proposal: 1, amount: stake, basis: 'stake', contract_type: 'ACCU', currency: this.client.currency,
      growth_rate: g, underlying_symbol: m, limit_order: { take_profit: this.tpAmount(stake, g, n) },
    });
    const d = p.proposal?.contract_details;
    const dist = Number(d?.barrier_spot_distance ?? (d?.high_barrier !== undefined && d?.low_barrier !== undefined ? (Number(d.high_barrier) - Number(d.low_barrier)) / 2 : NaN));
    return Number.isFinite(dist) && dist > 0 ? dist : undefined;
  }

  private async scan() {
    const c = this.cfg;
    const ranked = this.markets
      .map((m) => ({ m, calm: this.analyzer.calm(m) }))
      .filter((x): x is { m: string; calm: Calm } => !!x.calm)
      .sort((a, b) => b.calm.score - a.calm.score);
    this.state.board = ranked.slice(0, 5).map((x) => ({ market: x.m, calm: x.calm }));
    if (!ranked.length) { this.note('Collecting tick history...'); return; }
    const pool = (c.calmEntry ? ranked.filter((x) => x.calm.ok) : ranked).slice(0, 3);
    if (!pool.length) { this.note('Waiting for a calm market (recent spike or high movement everywhere)'); this.emit(); return; }

    if (this.state.cycleLoss <= 0.009) this.cycleBal = this.client.balance;
    const pl = this.plan();
    const stake = pl.stake;
    let best: { m: string; ev: number; dist: number; a: Assessment } | undefined;
    for (const x of pool) {
      try {
        const dist = await this.barrierDistance(x.m, stake, pl.g, pl.n);
        if (!dist) continue;
        const a = this.analyzer.assess(x.m, dist, pl.g, pl.n);
        const row = this.state.board.find((b) => b.market === x.m);
        if (a && row) { row.ev = a.ev; row.breach = a.breach; row.distance = dist; }
        if (a && (!best || a.ev > best.ev)) best = { m: x.m, ev: a.ev, dist, a };
      } catch { /* market or growth rate not offered - skip it */ }
    }
    this.emit();
    if (!best) { this.note('No accumulator quote available (check growth rate / market)'); return; }
    if (best.ev < -c.maxEdgeLossPct / 100) { this.note(`Best market ${best.m}: expected ${(best.ev * 100).toFixed(1)}% is worse than your ${c.maxEdgeLossPct}% limit - waiting`); return; }

    if (c.mode === 'shadow') {
      const price = this.analyzer.last(best.m);
      if (price === undefined) return;
      this.virtual = { m: best.m, prev: price, distance: best.dist, left: pl.n, n: pl.n, expected: best.a.survive };
      this.reporter.log(`Accumulator shadow entry ${best.m}: expected ${(best.ev * 100).toFixed(1)}%, survive ${(best.a.survive * 100).toFixed(0)}%`, 'info');
      this.note(`Shadow position on ${best.m} (${pl.n} ticks)`);
      this.cooldownUntil = Date.now() + c.cooldownMs;
      return;
    }
    await this.tradeAuto(best.m, pl, best.ev);
  }

  private async tradeAuto(m: string, pl: { kind: 'normal' | 'recovery'; g: number; n: number; stake: number }, ev: number) {
    const c = this.cfg, stake = pl.stake;
    await this.client.refresh();
    if (!this.client.isVirtual && !this.allowReal()) { this.stop('Real account blocked - enable "Allow real account"'); return; }
    if (!this.state.startBalance) this.state.startBalance = this.client.balance;
    if (pl.kind === 'normal' && stake > this.client.balance * 0.05) { this.stop(`Balance protection: stake ${stake} is above 5% of the balance`); return; }
    this.state.status = 'trading';
    this.note(`${pl.kind === 'recovery' ? `Recovery ${this.state.tries + 1}/${c.maxRecoveryTries}` : 'Accumulator'} ${m}: stake ${stake}, growth ${(pl.g * 100).toFixed(0)}%, target ${pl.n} ticks (expected ${(ev * 100).toFixed(1)}%)`);
    try {
      const prop = await this.client.send({
        proposal: 1, amount: stake, basis: 'stake', contract_type: 'ACCU', currency: this.client.currency,
        growth_rate: pl.g, underlying_symbol: m, limit_order: { take_profit: this.tpAmount(stake, pl.g, pl.n) },
      });
      const buy = await this.client.send({ buy: prop.proposal.id, price: prop.proposal.ask_price });
      const id = buy.buy.contract_id;
      const base = {
        contract_id: id, id: String(id), contract_type: 'ACCU', underlying: m, display_name: m, currency: this.client.currency,
        buy_price: buy.buy.buy_price, payout: buy.buy.payout, date_start: buy.buy.start_time, shortcode: buy.buy.shortcode,
        longcode: buy.buy.longcode || 'Accumulator', transaction_ids: { buy: buy.buy.transaction_id }, is_sold: 0, status: 'open', profit: 0,
      };
      this.reporter.contract(base);
      const t0 = Date.now();
      let profit = NaN, ticks = 0;
      while (Date.now() - t0 < 180000 && !this.killed) {
        await new Promise((r) => setTimeout(r, 700));
        const r = await this.client.send({ proposal_open_contract: 1, contract_id: id });
        const poc = r.proposal_open_contract;
        if (poc) { this.reporter.contract({ ...base, ...poc, id: poc.id ?? base.id }); ticks = Number(poc.tick_count ?? ticks); }
        if (poc?.is_sold) { profit = Number(poc.profit); break; }
      }
      if (Number.isNaN(profit)) {   // safety: close an open position if we gave up waiting
        const s = await this.client.send({ sell: id, price: 0 });
        profit = Number(s.sell?.sold_for ?? 0) - stake;
      }
      this.record(m, stake, profit, ticks, pl.kind === 'recovery');
    } catch (e) { this.stop(`Error: ${(e as Error).message}`); }
    finally { if (this.state.status === 'trading') this.state.status = 'idle'; this.cooldownUntil = Date.now() + c.cooldownMs; this.emit(); }
  }

  private record(m: string, stake: number, profit: number, ticks: number, rec: boolean) {
    const c = this.cfg, s = this.state;
    s.sessionProfit = r2(s.sessionProfit + profit);
    s.lossStreak = profit > 0 ? 0 : s.lossStreak + 1;
    s.rows.push({ ts: Date.now(), market: m, stake, profit, ticks, kind: profit > 0 ? 'target' : 'knockout', rec });
    this.reporter.log(`${profit > 0 ? 'WIN' : 'KNOCKOUT'} ${rec ? 'recovery ' : ''}accumulator ${m} stake ${stake} -> ${profit} (session ${s.sessionProfit})`, profit > 0 ? 'success' : 'error');

    if (rec) {
      s.tries++;
      if (profit > 0) { s.cycleLoss = r2(s.cycleLoss - profit); if (s.cycleLoss <= 0.009) { s.cycleLoss = 0; s.tries = 0; this.reporter.log('Accumulator: loss recovered', 'success'); } }
      else s.cycleLoss = r2(s.cycleLoss + stake);
    } else if (profit <= 0) {
      s.cycleLoss = c.recovery === 'capped' ? stake : 0; s.tries = 0; s.defensive = c.defensiveTrades;
    } else if (s.defensive > 0) s.defensive--;

    const start = s.startBalance || this.client.balance;
    const tp = Math.min(c.takeProfit, c.goalPct > 0 ? (start * c.goalPct) / 100 : Infinity);
    const sl = Math.min(c.stopLoss, c.lossPct > 0 ? (start * c.lossPct) / 100 : Infinity);
    if (s.sessionProfit >= tp) this.stop('Session goal reached - profit locked');
    else if (s.sessionProfit <= -sl) this.stop('Session loss limit reached');
    else if (c.maxTrades > 0 && s.rows.length >= c.maxTrades) this.stop(`Trade limit reached (${c.maxTrades})`);
    else if (s.lossStreak >= c.maxLossStreak) this.stop(`${s.lossStreak} knockouts in a row - paused for safety`);
  }
}
