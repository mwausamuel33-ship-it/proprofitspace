/**
 * ProProfit signal engine (multi-window, per strategy family).
 * A candidate only becomes a signal when it beats its fair-odds baseline in EVERY window
 * (50,100,200 ... 1000 ticks) and the combined score clears the confidence bar.
 * Every signal is also tracked in shadow mode so the REAL hit rate is always visible.
 * NOTE: scores describe recent history. They are not predictions - digits are random.
 */
export type Family = 'overunder' | 'evenodd' | 'matchesdiffers';
export type ContractKind = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'DIGITMATCH' | 'DIGITDIFF';
export const FAMILIES: Family[] = ['overunder', 'evenodd', 'matchesdiffers'];
export const FAMILY_LABEL: Record<Family, string> = { overunder: 'Over / Under', evenodd: 'Even / Odd', matchesdiffers: 'Matches / Differs' };

export interface Candidate {
  market: string;
  family: Family;
  contract: ContractKind;
  barrier?: number;
  label: string;
  p: number;            // fair win probability
  zs: number[];         // z-score per window
  aligned: number;      // windows where the candidate beats fair odds
  meanZ: number;
  confidence: number;   // 0-100
  recent: number;       // hit rate over last 20 ticks
}

export interface Signal {
  id: string;
  ts: number;
  expiresAt: number;
  market: string;
  family: Family;
  contract: ContractKind;
  barrier?: number;
  label: string;
  confidence: number;
  z: number;
  expected: number;
  windows: number[];
  zs: number[];
  reasons: string[];
}

export interface EngineConfig {
  markets: string[];
  windows: number[];
  minConfidence: number;
  ttlMs: number;
  signalCooldownMs: number;
  overBarriers: number[];
  underBarriers: number[];
}

export const DEFAULT_ENGINE: EngineConfig = {
  markets: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
  windows: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
  minConfidence: 80,
  ttlMs: 4000,
  signalCooldownMs: 6000,
  overBarriers: [1, 2, 3, 4],
  underBarriers: [5, 6, 7, 8],
};

export interface ShadowStat { n: number; wins: number; expectedSum: number }

const cdf = (z: number) => {
  // Abramowitz-Stegun normal CDF approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

export const wins = (k: ContractKind, b: number | undefined, d: number) => {
  switch (k) {
    case 'DIGITOVER': return d > (b as number);
    case 'DIGITUNDER': return d < (b as number);
    case 'DIGITEVEN': return d % 2 === 0;
    case 'DIGITODD': return d % 2 === 1;
    case 'DIGITMATCH': return d === b;
    default: return d !== b;
  }
};

type Spec = { family: Family; k: ContractKind; b?: number; p: number; label: string; digits: number[] };

export class SignalEngine {
  private digits = new Map<string, number[]>();
  private lastSignal = new Map<string, number>();
  private latest = new Map<string, Candidate[]>();
  private pending: { s: Signal }[] = [];
  readonly stats = new Map<string, ShadowStat>();
  private seq = 0;
  private specs: Spec[];

  constructor(public cfg: EngineConfig = DEFAULT_ENGINE) {
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const s: Spec[] = [];
    cfg.overBarriers.forEach((b) => s.push({ family: 'overunder', k: 'DIGITOVER', b, p: (9 - b) / 10, label: `Over ${b}`, digits: all.filter((d) => d > b) }));
    cfg.underBarriers.forEach((b) => s.push({ family: 'overunder', k: 'DIGITUNDER', b, p: b / 10, label: `Under ${b}`, digits: all.filter((d) => d < b) }));
    s.push({ family: 'evenodd', k: 'DIGITEVEN', p: 0.5, label: 'Even', digits: [0, 2, 4, 6, 8] });
    s.push({ family: 'evenodd', k: 'DIGITODD', p: 0.5, label: 'Odd', digits: [1, 3, 5, 7, 9] });
    all.forEach((d) => s.push({ family: 'matchesdiffers', k: 'DIGITMATCH', b: d, p: 0.1, label: `Matches ${d}`, digits: [d] }));
    all.forEach((d) => s.push({ family: 'matchesdiffers', k: 'DIGITDIFF', b: d, p: 0.9, label: `Differs ${d}`, digits: all.filter((x) => x !== d) }));
    this.specs = s;
  }

  private maxWin() { return Math.max(...this.cfg.windows); }
  bootstrap(market: string, digits: number[]) { this.digits.set(market, digits.slice(-this.maxWin())); }
  lastDigit(market: string): number | undefined { const a = this.digits.get(market); return a?.[a.length - 1]; }
  ready(market: string) { return (this.digits.get(market)?.length ?? 0) >= this.maxWin(); }

  /** Score every candidate of one market across all windows (one pass over the digits). */
  analyze(market: string): Candidate[] {
    const arr = this.digits.get(market);
    if (!arr || arr.length < this.maxWin()) return [];
    const wins_ = this.cfg.windows;
    const counts = new Array(10).fill(0);
    const snaps: number[][] = [];
    let wi = 0;
    for (let i = 1; i <= this.maxWin() && wi < wins_.length; i++) {
      counts[arr[arr.length - i]]++;
      if (i === wins_[wi]) { snaps.push([...counts]); wi++; }
    }
    const last20 = arr.slice(-20);
    return this.specs.map((sp) => {
      const zs = wins_.map((w, j) => {
        const n = snaps[j].reduce((a, b) => a + b, 0);
        const hit = sp.digits.reduce((a, d) => a + snaps[j][d], 0);
        return (hit / n - sp.p) / Math.sqrt((sp.p * (1 - sp.p)) / n);
      });
      const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
      return {
        market, family: sp.family, contract: sp.k, barrier: sp.b, label: sp.label, p: sp.p, zs,
        aligned: zs.filter((z) => z > 0).length, meanZ,
        confidence: Math.round(cdf(meanZ) * 100),
        recent: last20.filter((d) => wins(sp.k, sp.b, d)).length / 20,
      };
    });
  }

  /** Feed one tick. Resolves shadow trades for this market and returns fresh signals. */
  ingest(market: string, digit: number, now = Date.now()): Signal[] {
    const arr = this.digits.get(market) ?? [];
    arr.push(digit);
    if (arr.length > this.maxWin()) arr.shift();
    this.digits.set(market, arr);

    this.pending = this.pending.filter(({ s }) => {
      if (s.market !== market || now <= s.ts) return true;
      const key = this.key(s);
      const st = this.stats.get(key) ?? { n: 0, wins: 0, expectedSum: 0 };
      st.n++; st.expectedSum += s.expected;
      if (wins(s.contract, s.barrier, digit)) st.wins++;
      this.stats.set(key, st);
      return false;
    });

    const cands = this.analyze(market);
    this.latest.set(market, cands);
    const out: Signal[] = [];
    for (const fam of FAMILIES) {
      const lk = `${market}|${fam}`;
      if (now - (this.lastSignal.get(lk) ?? 0) < this.cfg.signalCooldownMs) continue;
      const best = cands
        .filter((c) => c.family === fam && c.aligned === this.cfg.windows.length && c.confidence >= this.cfg.minConfidence && c.recent >= c.p)
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (!best) continue;
      this.lastSignal.set(lk, now);
      const s: Signal = {
        id: `${market}-${++this.seq}`, ts: now, expiresAt: now + this.cfg.ttlMs, market, family: fam,
        contract: best.contract, barrier: best.barrier, label: best.label, confidence: best.confidence,
        z: +best.meanZ.toFixed(2), expected: best.p, windows: this.cfg.windows, zs: best.zs,
        reasons: [
          `${best.aligned}/${this.cfg.windows.length} windows favour it, mean z ${best.meanZ.toFixed(2)}`,
          `last 20 ticks hit ${(best.recent * 100).toFixed(0)}% vs ${(best.p * 100).toFixed(0)}% expected`,
        ],
      };
      this.pending.push({ s });
      out.push(s);
    }
    return out;
  }

  /** Best candidates of a family across all markets (even when not yet a full signal). */
  leaderboard(family: Family, n = 3): Candidate[] {
    const all: Candidate[] = [];
    for (const c of this.latest.values()) all.push(...c.filter((x) => x.family === family));
    return all.sort((a, b) => b.aligned - a.aligned || b.meanZ - a.meanZ).slice(0, n);
  }

  private key(s: Signal) { return s.family === 'overunder' ? `${s.contract}${s.barrier}` : s.contract; }

  /** Honest scoreboard: observed vs theoretical win rate per signal type. */
  report() {
    return [...this.stats.entries()].map(([k, s]) => ({
      type: k, n: s.n,
      observed: s.n ? +((s.wins / s.n) * 100).toFixed(1) : 0,
      theoretical: s.n ? +((s.expectedSum / s.n) * 100).toFixed(1) : 0,
    }));
  }
}
