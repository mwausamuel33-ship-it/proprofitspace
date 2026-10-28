/**
 * ProProfit signal engine.
 * Scores digit contracts per market with multi-window z-scores and tracks
 * every emitted signal in shadow mode so the REAL hit rate is always visible.
 * NOTE: scores describe recent history. They are not predictions - digits are random.
 */
export type ContractKind = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';

export interface Signal {
  id: string;
  ts: number;
  expiresAt: number;
  market: string;
  contract: ContractKind;
  barrier?: number;
  label: string;
  confidence: number; // 0-100
  z: number;
  expected: number; // theoretical win probability
  reasons: string[];
}

export interface EngineConfig {
  markets: string[];
  windows: [number, number, number];
  minConfidence: number;
  ttlMs: number;
  signalCooldownMs: number;
  overBarriers: number[];
  underBarriers: number[];
  includeEvenOdd: boolean;
}

export const DEFAULT_ENGINE: EngineConfig = {
  markets: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
  windows: [50, 100, 500],
  minConfidence: 90,
  ttlMs: 4000,
  signalCooldownMs: 6000,
  overBarriers: [1, 2, 3, 4],
  underBarriers: [5, 6, 7, 8],
  includeEvenOdd: true,
};

export interface ShadowStat { n: number; wins: number; expectedSum: number }

const cdf = (z: number) => {
  // Abramowitz-Stegun normal CDF approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

const wins = (k: ContractKind, b: number | undefined, d: number) =>
  k === 'DIGITOVER' ? d > (b as number) : k === 'DIGITUNDER' ? d < (b as number) : k === 'DIGITEVEN' ? d % 2 === 0 : d % 2 === 1;

export class SignalEngine {
  private digits = new Map<string, number[]>();
  private lastSignal = new Map<string, number>();
  private pending: { s: Signal }[] = [];
  readonly stats = new Map<string, ShadowStat>();
  private seq = 0;
  constructor(public cfg: EngineConfig = DEFAULT_ENGINE) {}

  bootstrap(market: string, digits: number[]) {
    this.digits.set(market, digits.slice(-this.maxWin()));
  }
  private maxWin() { return Math.max(...this.cfg.windows); }

  lastDigit(market: string): number | undefined {
    const a = this.digits.get(market);
    return a?.[a.length - 1];
  }
  ready(market: string) { return (this.digits.get(market)?.length ?? 0) >= this.cfg.windows[1]; }

  /** Feed one tick. Resolves shadow trades for this market and returns fresh signals. */
  ingest(market: string, digit: number, now = Date.now()): Signal[] {
    const arr = this.digits.get(market) ?? [];
    arr.push(digit);
    if (arr.length > this.maxWin()) arr.shift();
    this.digits.set(market, arr);

    // shadow-resolve: 1-tick contracts resolve on the next tick after signal
    this.pending = this.pending.filter(({ s }) => {
      if (s.market !== market || now <= s.ts) return true;
      const key = this.key(s);
      const st = this.stats.get(key) ?? { n: 0, wins: 0, expectedSum: 0 };
      st.n++; st.expectedSum += s.expected;
      if (wins(s.contract, s.barrier, digit)) st.wins++;
      this.stats.set(key, st);
      return false;
    });
    return this.scanMarket(market, now);
  }

  private key(s: Signal) { return `${s.contract}${s.barrier ?? ''}`; }

  private candidates() {
    const c: { k: ContractKind; b?: number; p: number; label: string }[] = [];
    this.cfg.overBarriers.forEach((b) => c.push({ k: 'DIGITOVER', b, p: (9 - b) / 10, label: `Over ${b}` }));
    this.cfg.underBarriers.forEach((b) => c.push({ k: 'DIGITUNDER', b, p: b / 10, label: `Under ${b}` }));
    if (this.cfg.includeEvenOdd) {
      c.push({ k: 'DIGITEVEN', p: 0.5, label: 'Even' });
      c.push({ k: 'DIGITODD', p: 0.5, label: 'Odd' });
    }
    return c;
  }

  scanMarket(market: string, now = Date.now()): Signal[] {
    if (!this.ready(market)) return [];
    if (now - (this.lastSignal.get(market) ?? 0) < this.cfg.signalCooldownMs) return [];
    const arr = this.digits.get(market)!;
    const out: Signal[] = [];
    for (const c of this.candidates()) {
      const zs = this.cfg.windows.map((w) => {
        const slice = arr.slice(-w);
        const obs = slice.filter((d) => wins(c.k, c.b, d)).length / slice.length;
        return (obs - c.p) / Math.sqrt((c.p * (1 - c.p)) / slice.length);
      });
      const recent = arr.slice(-20).filter((d) => wins(c.k, c.b, d)).length / 20;
      const agree = zs.every((z) => z > 0) && recent >= c.p;
      const z = 0.2 * zs[0] + 0.5 * zs[1] + 0.3 * zs[2];
      const confidence = Math.round(cdf(z) * 100);
      if (!agree || confidence < this.cfg.minConfidence) continue;
      out.push({
        id: `${market}-${++this.seq}`, ts: now, expiresAt: now + this.cfg.ttlMs, market,
        contract: c.k, barrier: c.b, label: c.label, confidence, z: +z.toFixed(2), expected: c.p,
        reasons: [
          `z50 ${zs[0].toFixed(1)} / z100 ${zs[1].toFixed(1)} / z500 ${zs[2].toFixed(1)}`,
          `last 20 ticks hit ${(recent * 100).toFixed(0)}% vs ${(c.p * 100).toFixed(0)}% expected`,
        ],
      });
    }
    out.sort((a, b) => b.confidence - a.confidence);
    const best = out.slice(0, 1);
    if (best.length) {
      this.lastSignal.set(market, now);
      best.forEach((s) => this.pending.push({ s }));
    }
    return best;
  }

  /** Honest scoreboard: observed vs theoretical win rate per signal type. */
  report() {
    return [...this.stats.entries()].map(([k, s]) => ({
      type: k, n: s.n,
      observed: s.n ? +((s.wins / s.n) * 100).toFixed(1) : 0,
      theoretical: s.n ? +((s.expectedSum / s.n) * 100).toFixed(1) : 0,
    }));
  }
}
