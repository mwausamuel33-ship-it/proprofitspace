import {
    TickBuffer, benjaminiHochberg, binomialTwoSidedP, chiSquareSf, deriveStatus, digitDistribution, evenOddAnalysis,
    holm, lastDigit, logGamma, matchesDiffersAnalysis, normalCdf, overUnderAnalysis, transitionAnalysis, wilsonInterval,
} from '..';

// Small seeded generator so the calibration tests are repeatable.
const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const fairDigits = (n: number, next: () => number) => Array.from({ length: n }, () => Math.floor(next() * 10));

describe('numerical helpers (against independently computed values)', () => {
    it('logGamma', () => {
        expect(logGamma(1)).toBeCloseTo(0, 10);
        expect(logGamma(0.5)).toBeCloseTo(0.5723649429247001, 10);
        expect(logGamma(10)).toBeCloseTo(12.801827480081469, 9);
    });
    it('normalCdf', () => {
        expect(normalCdf(0)).toBeCloseTo(0.5, 12);
        expect(normalCdf(1.959963984540054)).toBeCloseTo(0.975, 10);
        expect(normalCdf(-1.959963984540054)).toBeCloseTo(0.025, 10);
        expect(normalCdf(-3)).toBeCloseTo(0.0013498980316301, 10);
    });
    it('chiSquareSf matches published critical values', () => {
        expect(chiSquareSf(16.918977604620448, 9)).toBeCloseTo(0.05, 8);
        expect(chiSquareSf(3.841458820694124, 1)).toBeCloseTo(0.05, 8);
        expect(chiSquareSf(21.665994333461924, 9)).toBeCloseTo(0.01, 8);
    });
    it('exact binomial test', () => {
        expect(binomialTwoSidedP(60, 100, 0.5)).toBeCloseTo(0.05688793364098016, 8);
        expect(binomialTwoSidedP(50, 100, 0.5)).toBeCloseTo(1, 8);
        expect(binomialTwoSidedP(0, 10, 0.5)).toBeCloseTo(2 / 1024, 10);
        // reference values computed independently with exact rational arithmetic
        expect(binomialTwoSidedP(130, 1000, 0.1)).toBeCloseTo(0.0022017261448612, 9);
        expect(binomialTwoSidedP(80, 1000, 0.1)).toBeCloseTo(0.03486880520245615, 9);
        expect(binomialTwoSidedP(104, 1000, 0.1)).toBeCloseTo(0.6731491740475838, 9);
    });
    it('Wilson interval', () => {
        const ci = wilsonInterval(5, 10);
        expect(ci.low).toBeCloseTo(0.2366, 3);
        expect(ci.high).toBeCloseTo(0.7634, 3);
        expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    });
    it('multiple-testing corrections', () => {
        expect(benjaminiHochberg([0.01, 0.04, 0.03, 0.005])).toEqual([0.02, 0.04, 0.04, 0.02]);
        const h = holm([0.01, 0.04, 0.03, 0.005]);
        expect(h[3]).toBeCloseTo(0.02, 12);
        expect(h[0]).toBeCloseTo(0.03, 12);
        expect(h[2]).toBeCloseTo(0.06, 12);
        expect(h[1]).toBeCloseTo(0.06, 12);
    });
});

describe('digit extraction uses the market precision', () => {
    it('keeps trailing zeros', () => {
        expect(lastDigit(1234.5, 2)).toBe(0);
        expect(lastDigit(6543.21, 2)).toBe(1);
        expect(lastDigit(100.25, 3)).toBe(0);
        expect(lastDigit('100.250', 3)).toBe(0);
        expect(lastDigit('7.5', 1)).toBe(5);
        expect(lastDigit(42, 0)).toBe(2);
    });
    it('refuses to guess', () => {
        expect(lastDigit(NaN, 2)).toBeNull();
        expect(lastDigit('abc', 2)).toBeNull();
        expect(lastDigit(100.25, -1)).toBeNull();
        expect(lastDigit(100.25, 2.5)).toBeNull();
    });
});

describe('TickBuffer', () => {
    const t = (epoch: number, quote: number) => ({ epoch, quote, pipSize: 2 });
    it('rejects duplicates, conflicts, out-of-order and invalid ticks', () => {
        const b = new TickBuffer();
        expect(b.ingestLive(t(100, 10.11))).toBe('added');
        expect(b.ingestLive(t(100, 10.11))).toBe('duplicate');
        expect(b.ingestLive(t(100, 10.12))).toBe('conflict');
        expect(b.ingestLive(t(101, 10.13))).toBe('added');
        expect(b.ingestLive(t(99, 10.1))).toBe('out_of_order');
        expect(b.ingestLive({ epoch: 0, quote: 10, pipSize: 2 })).toBe('invalid');
        expect(b.ingestLive({ epoch: 102, quote: NaN, pipSize: 2 })).toBe('invalid');
        expect(b.size).toBe(2);
        expect(b.counters).toMatchObject({ added: 2, duplicate: 1, conflict: 1, outOfOrder: 1, invalid: 2 });
    });
    it('keeps history and live ticks in order without duplicates when they overlap', () => {
        const b = new TickBuffer();
        b.beginHistoryLoad();
        expect(b.ingestLive(t(104, 10.4))).toBe('queued');
        expect(b.ingestLive(t(105, 10.5))).toBe('queued');
        b.completeHistoryLoad([t(101, 10.1), t(102, 10.2), t(103, 10.3), t(104, 10.4)]);
        expect(b.all().map(x => x.epoch)).toEqual([101, 102, 103, 104, 105]);
        expect(b.all().map(x => x.source)).toEqual(['history', 'history', 'history', 'history', 'live']);
        expect(b.counters.duplicate).toBe(1);
    });
    it('trims to capacity and keeps the newest ticks', () => {
        const b = new TickBuffer(1000);
        for (let i = 1; i <= 1200; i++) b.ingestLive({ epoch: 1000 + i, quote: 100 + (i % 10) / 100, pipSize: 2 });
        expect(b.size).toBe(1000);
        expect(b.all()[0].epoch).toBe(1201);
        expect(b.lastEpoch).toBe(2200);
    });
    it('marks gaps and reports the contiguous tail', () => {
        const b = new TickBuffer();
        [1, 2, 3, 4, 5].forEach(i => b.ingestLive(t(1000 + i, 10 + i / 100)));
        b.ingestLive(t(1030, 10.5)); // 25 seconds missing
        b.ingestLive(t(1031, 10.51));
        expect(b.counters.gaps).toBe(1);
        expect(b.contiguousTail().map(x => x.epoch)).toEqual([1030, 1031]);
        expect(b.window(10).hasGap).toBe(true);
        expect(b.window(2).hasGap).toBe(false);
        expect(b.window(10).complete).toBe(false);
    });
    it('stores digits at pip precision and the original quote text', () => {
        const b = new TickBuffer();
        b.ingestLive({ epoch: 5, quote: '1234.50', pipSize: 2 });
        expect(b.all()[0]).toMatchObject({ digit: 0, quoteText: '1234.50', source: 'live' });
    });
});

describe('connection status', () => {
    const base = { connected: true, reconnecting: false, lastTickEpoch: 1000, medianIntervalSeconds: 1, nowEpoch: 1003 };
    it('covers every state', () => {
        expect(deriveStatus(base)).toBe('LIVE');
        expect(deriveStatus({ ...base, nowEpoch: 1020 })).toBe('STALE');
        expect(deriveStatus({ ...base, lastTickEpoch: null })).toBe('STALE');
        expect(deriveStatus({ ...base, reconnecting: true })).toBe('RECONNECTING');
        expect(deriveStatus({ ...base, connected: false })).toBe('DISCONNECTED');
    });
});

describe('digit distribution', () => {
    it('reports ties together instead of picking one by digit order', () => {
        const d = digitDistribution([0, 0, 1, 1, 2, 3, 3, 3, 4, 4, 4, 5, 6, 7, 8, 9]);
        expect(d.mostFrequent).toEqual([3, 4]);
        expect(d.secondMostFrequent).toEqual([0, 1]);
        expect(d.leastFrequent).toEqual([2, 5, 6, 7, 8, 9]);
        expect(d.rows[3].count).toBe(3);
    });
    it('is calibrated on fair digits: chi-square rejects about 5% at the 5% level', () => {
        const next = rng(42);
        let rejected = 0;
        const runs = 600;
        for (let i = 0; i < runs; i++) if (digitDistribution(fairDigits(1000, next)).chiSquare.pValue < 0.05) rejected++;
        expect(rejected / runs).toBeGreaterThan(0.025);
        expect(rejected / runs).toBeLessThan(0.08);
    });
    it('finds a real imbalance', () => {
        const next = rng(7);
        const biased = Array.from({ length: 1000 }, () => (next() < 0.25 ? 7 : Math.floor(next() * 10)));
        const d = digitDistribution(biased);
        expect(d.chiSquare.pValue).toBeLessThan(1e-10);
        expect(d.mostFrequent).toEqual([7]);
        expect(d.rows[7].adjustedP).toBeLessThan(0.001);
    });
});

describe('Even/Odd, Over/Under, Matches/Differs, transitions', () => {
    it('Even/Odd counts and exact test', () => {
        const r = evenOddAnalysis([...Array(60).fill(2), ...Array(40).fill(3)]);
        expect(r.even.count).toBe(60);
        expect(r.even.pValue).toBeCloseTo(0.05688793364098016, 8);
        expect(r.even.ci.low).toBeLessThan(0.6);
        expect(r.even.ci.high).toBeGreaterThan(0.6);
    });
    it('Over/Under never counts the barrier digit as a win for either side', () => {
        const r = overUnderAnalysis([5, 5, 5, 4, 6, 0, 9, 5], 5);
        expect(r.under.count).toBe(2);
        expect(r.equal.count).toBe(4);
        expect(r.over.count).toBe(2);
        expect(r.under.expected).toBeCloseTo(0.5, 12);
        expect(r.over.expected).toBeCloseTo(0.4, 12);
        expect(overUnderAnalysis([0, 9, 5], 0).under.count).toBe(0);
        expect(overUnderAnalysis([0, 9, 5], 9).over.count).toBe(0);
    });
    it('Over/Under test is calibrated on fair digits', () => {
        const next = rng(99);
        let rejected = 0;
        const runs = 600;
        for (let i = 0; i < runs; i++) if (overUnderAnalysis(fairDigits(500, next), 5).chiSquare.pValue < 0.05) rejected++;
        expect(rejected / runs).toBeGreaterThan(0.025);
        expect(rejected / runs).toBeLessThan(0.08);
    });
    it('Matches/Differs', () => {
        const r = matchesDiffersAnalysis([3, 3, 1, 2, 3, 4, 5, 6, 7, 8], 3);
        expect(r.matches.count).toBe(3);
        expect(r.differs.count).toBe(7);
        expect(r.matches.expected).toBeCloseTo(0.1, 12);
        expect(r.differs.expected).toBeCloseTo(0.9, 12);
        expect(r.digits).toHaveLength(10);
    });
    it('transitions: fair digits look independent, a deterministic pattern does not', () => {
        const fair = transitionAnalysis(fairDigits(1000, rng(5)));
        expect(fair.chiSquare.df).toBe(81);
        expect(fair.chiSquare.pValue).toBeGreaterThan(0.01);
        const patterned = transitionAnalysis(Array.from({ length: 1000 }, (_, i) => i % 10));
        expect(patterned.chiSquare.pValue).toBeLessThan(1e-10);
        expect(patterned.conditional[7][8]).toBe(1);
        expect(transitionAnalysis([1, 2]).counts[1][2]).toBe(1);
    });
});
