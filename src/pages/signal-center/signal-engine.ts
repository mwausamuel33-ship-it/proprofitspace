/**
 * ProProfit signal engine: 3 strategy families, 11 analysis windows (50..1000 ticks).
 * A trigger only fires when it beats fair odds in EVERY window and the combined score is high.
 * Over/Under: the trigger is Over 5 / Under 5; the trade is the strongest SAFER contract
 * (Over 3/2/1 or Under 6/7/8/9). All signals are shadow-tracked so the real hit rate is visible.
 * NOTE: scores describe recent history, not the future - digits are random.
 */
export type Family = 'overunder' | 'evenodd' | 'matchesdiffers';
export type ContractKind = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'DIGITMATCH' | 'DIGITDIFF';
export const FAMILIES: Family[] = ['overunder', 'evenodd', 'matchesdiffers'];
export const FAMILY_LABEL: Record<Family, string> = { overunder: 'Over / Under', evenodd: 'Even / Odd', matchesdiffers: 'Matches / Differs' };
export const SAFE_OVER = [1, 2, 3];
export const SAFE_UNDER = [9, 8, 7, 6];

export interface Candidate {
  market: string; family: Family; contract: ContractKind; barrier?: number; label: string;
  p: number; zs: number[]; aligned: number; meanZ: number; confidence: number; recent: number;
}
export interface Trigger { contract: ContractKind; barrier?: number; label: string }
export interface Signal {
  id: string; ts: number; expiresAt: number; market: string; family: Family;
  contract: ContractKind; barrier?: number; label: string;
  trigger: Trigger; confidence: number; z: number; expected: number; reasons: string[];
}
export interface EngineConfig {
  markets: string[]; windows: number[]; minConfidence: number; ttlMs: number; signalCooldownMs: number;
  overBarriers: number[]; underBarriers: number[];
}
export const DEFAULT_ENGINE: EngineConfig = {
  markets: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
  windows: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
  minConfidence: 80, ttlMs: 6000, signalCooldownMs: 6000,
  overBarriers: [1, 2, 3, 4, 5], underBarriers: [5, 6, 7, 8, 9],
};
export interface ShadowStat { n: number; wins: number; expectedSum: number }

const cdf = (z: number) => {
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

const isTrigger = (c: Candidate) => c.family === 'overunder' && c.barrier === 5;
const isSafe = (c: Candidate) =>
  c.family === 'overunder' && ((c.contract === 'DIGITOVER' && SAFE_OVER.includes(c.barrier as number)) || (c.contract === 'DIGITUNDER' && SAFE_UNDER.includes(c.barrier as number)));

type Spec = { family: Family; k: ContractKind; b?: number; p: number; label: string; digits: number[] };

export class SignalEngine {
  private digits = new Map<string, number[]>();
  private lastSignal = new Map<string, number>();
  private latest = new Map<string, Candidate[]>();
  private pending: { s: Signal; pick: Candidate }[] = [];
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
  private N() { return this.cfg.windows.length; }
  bootstrap(market: string, digits: number[]) { this.digits.set(market, digits.slice(-this.maxWin())); }
  lastDigit(market: string): number | undefined { const a = this.digits.get(market); return a?.[a.length - 1]; }
  ready(market: string) { return (this.digits.get(market)?.length ?? 0) >= this.maxWin(); }

  /** Score every candidate of one market across all windows (one pass over the digits). */
  analyze(market: string): Candidate[] {
    const arr = this.digits.get(market);
    if (!arr || arr.length < this.maxWin()) return [];
    const W = this.cfg.windows;
    const counts = new Array(10).fill(0);
    const snaps: number[][] = [];
    let wi = 0;
    for (let i = 1; i <= this.maxWin() && wi < W.length; i++) {
      counts[arr[arr.length - i]]++;
      if (i === W[wi]) { snaps.push([...counts]); wi++; }
    }
    const last20 = arr.slice(-20);
    return this.specs.map((sp) => {
      const zs = W.map((_, j) => {
        const n = snaps[j].reduce((a, b) => a + b, 0);
        const hit = sp.digits.reduce((a, d) => a + snaps[j][d], 0);
        return (hit / n - sp.p) / Math.sqrt((sp.p * (1 - sp.p)) / n);
      });
      const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
      return {
        market, family: sp.family, contract: sp.k, barrier: sp.b, label: sp.label, p: sp.p, zs,
        aligned: zs.filter((z) => z > 0).length, meanZ, confidence: Math.round(cdf(meanZ) * 100),
        recent: last20.filter((d) => wins(sp.k, sp.b, d)).length / 20,
      };
    });
  }

  /** Strongest SAFER Over/Under contract (all windows aligned) in the trigger's direction. */
  private pickSafe(cands: Candidate[], dir: 'over' | 'under'): Candidate | undefined {
    return cands
      .filter((c) => isSafe(c) && c.contract === (dir === 'over' ? 'DIGITOVER' : 'DIGITUNDER') && c.aligned === this.N())
      .sort((a, b) => b.confidence - a.confidence || b.p - a.p)[0];
  }

  /** Feed one tick. Resolves shadow trades for this market and returns fresh signals. */
  ingest(market: string, digit: number, now = Date.now()): Signal[] {
    const arr = this.digits.get(market) ?? [];
    arr.push(digit);
    if (arr.length > this.maxWin()) arr.shift();
    this.digits.set(market, arr);

    this.pending = this.pending.filter(({ s, pick }) => {
      if (s.market !== market || now <= s.ts) return true;
      const key = s.family === 'overunder' ? `${pick.contract}${pick.barrier}` : pick.contract;
      const st = this.stats.get(key) ?? { n: 0, wins: 0, expectedSum: 0 };
      st.n++; st.expectedSum += pick.p;
      if (wins(pick.contract, pick.barrier, digit)) st.wins++;
      this.stats.set(key, st);
      return false;
    });

    const cands = this.analyze(market);
    this.latest.set(market, cands);
    const out: Signal[] = [];
    for (const fam of FAMILIES) {
      const lk = `${market}|${fam}`;
      if (now - (this.lastSignal.get(lk) ?? 0) < this.cfg.signalCooldownMs) continue;
      const trig = cands
        .filter((c) => c.family === fam && (fam !== 'overunder' || isTrigger(c)) && c.aligned === this.N() && c.confidence >= this.cfg.minConfidence && c.recent >= c.p)
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (!trig) continue;
      const pick = fam === 'overunder' ? this.pickSafe(cands, trig.contract === 'DIGITOVER' ? 'over' : 'under') : trig;
      if (!pick) continue;
      this.lastSignal.set(lk, now);
      const s: Signal = {
        id: `${market}-${++this.seq}`, ts: now, expiresAt: now + this.cfg.ttlMs, market, family: fam,
        contract: pick.contract, barrier: pick.barrier,
        label: fam === 'overunder' ? `${pick.label} (bias ${trig.label})` : pick.label,
        trigger: { contract: trig.contract, barrier: trig.barrier, label: trig.label },
        confidence: trig.confidence, z: +trig.meanZ.toFixed(2), expected: pick.p,
        reasons: [
          `${trig.aligned}/${this.N()} windows favour ${trig.label}, mean z ${trig.meanZ.toFixed(2)}`,
          `last 20 ticks hit ${(trig.recent * 100).toFixed(0)}% vs ${(trig.p * 100).toFixed(0)}% expected`,
        ],
      };
      this.pending.push({ s, pick });
      out.push(s);
    }
    return out;
  }

  /** Is the signal still strong? Returns the (re-picked) contract to trade, or null if it weakened. */
  check(sig: Signal, stayConfidence: number): Candidate | null {
    const cands = this.latest.get(sig.market) ?? [];
    const trig = cands.find((c) => c.family === sig.family && c.contract === sig.trigger.contract && c.barrier === sig.trigger.barrier);
    if (!trig || trig.aligned !== this.N() || trig.confidence < stayConfidence) return null;
    if (sig.family !== 'overunder') return trig;
    return this.pickSafe(cands, sig.trigger.contract === 'DIGITOVER' ? 'over' : 'under') ?? null;
  }

  /** Less-risky contracts for recovery on this market, best first (Over 1-3 / Under 6-9). */
  recoveryOptions(market: string, n = 4): Candidate[] {
    return (this.latest.get(market) ?? []).filter(isSafe)
      .sort((a, b) => b.aligned - a.aligned || b.confidence - a.confidence || b.p - a.p).slice(0, n);
  }

  /** Best candidates of a family across all markets (triggers only for Over/Under). */
  leaderboard(family: Family, n = 3): Candidate[] {
    const all: Candidate[] = [];
    for (const c of this.latest.values()) all.push(...c.filter((x) => x.family === family && (family !== 'overunder' || isTrigger(x))));
    return all.sort((a, b) => b.aligned - a.aligned || b.meanZ - a.meanZ).slice(0, n);
  }

  /** Honest scoreboard: observed vs theoretical win rate per traded contract. */
  report() {
    return [...this.stats.entries()].map(([k, s]) => ({
      type: k, n: s.n,
      observed: s.n ? +((s.wins / s.n) * 100).toFixed(1) : 0,
      theoretical: s.n ? +((s.expectedSum / s.n) * 100).toFixed(1) : 0,
    }));
  }
}
