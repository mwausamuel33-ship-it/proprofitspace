import { benjaminiHochberg, binomialTwoSidedP, chiSquareSf, wilsonInterval } from './math';

export type Interval = { low: number; high: number };

export type DigitRow = {
    digit: number;
    count: number;
    share: number;
    expected: number;
    deviation: number;
    zScore: number;
    pValue: number; // exact binomial test against 10%
    adjustedP: number; // Benjamini-Hochberg across the ten digits
};

export type DigitDistribution = {
    n: number;
    rows: DigitRow[];
    // Ties are returned together; nothing is broken by digit order.
    mostFrequent: number[];
    secondMostFrequent: number[];
    secondLeastFrequent: number[];
    leastFrequent: number[];
    chiSquare: { statistic: number; df: number; pValue: number; adequate: boolean };
};

const countDigits = (digits: number[]): number[] => {
    const counts = new Array<number>(10).fill(0);
    digits.forEach(d => {
        counts[d] += 1;
    });
    return counts;
};

/** Frequency of digits 0-9 with exact tests against the uniform 10% model. */
export const digitDistribution = (digits: number[]): DigitDistribution => {
    const n = digits.length;
    const counts = countDigits(digits);
    const expectedCount = n / 10;
    const pValues = counts.map(c => binomialTwoSidedP(c, n, 0.1));
    const adjusted = benjaminiHochberg(pValues);
    const rows = counts.map((count, digit) => ({
        digit,
        count,
        share: n ? count / n : 0,
        expected: 0.1,
        deviation: n ? count / n - 0.1 : 0,
        zScore: n ? (count - n * 0.1) / Math.sqrt(n * 0.1 * 0.9) : 0,
        pValue: pValues[digit],
        adjustedP: adjusted[digit],
    }));
    const levels = [...new Set(counts)].sort((a, b) => b - a);
    const at = (level: number | undefined): number[] =>
        level === undefined ? [] : counts.flatMap((c, d) => (c === level ? [d] : []));
    const statistic = expectedCount > 0 ? counts.reduce((s, c) => s + (c - expectedCount) ** 2 / expectedCount, 0) : 0;
    return {
        n,
        rows,
        mostFrequent: at(levels[0]),
        secondMostFrequent: at(levels[1]),
        secondLeastFrequent: at(levels[levels.length - 2]),
        leastFrequent: at(levels[levels.length - 1]),
        chiSquare: { statistic, df: 9, pValue: n ? chiSquareSf(statistic, 9) : 1, adequate: expectedCount >= 5 },
    };
};

export type SideStat = { count: number; share: number; expected: number; deviation: number; ci: Interval; pValue: number };

const sideStat = (count: number, n: number, expected: number): SideStat => ({
    count,
    share: n ? count / n : 0,
    expected,
    deviation: n ? count / n - expected : 0,
    ci: wilsonInterval(count, n),
    pValue: binomialTwoSidedP(count, n, expected),
});

export type EvenOddAnalysis = { n: number; even: SideStat; odd: SideStat };

export const evenOddAnalysis = (digits: number[]): EvenOddAnalysis => {
    const n = digits.length;
    const even = digits.filter(d => d % 2 === 0).length;
    return { n, even: sideStat(even, n, 0.5), odd: sideStat(n - even, n, 0.5) };
};

export type OverUnderAnalysis = {
    n: number;
    barrier: number;
    under: SideStat; // digits below the barrier
    equal: SideStat; // the barrier digit itself: wins neither side
    over: SideStat; // digits above the barrier
    chiSquare: { statistic: number; df: number; pValue: number; adequate: boolean };
};

export const overUnderAnalysis = (digits: number[], barrier: number): OverUnderAnalysis => {
    const n = digits.length;
    const under = digits.filter(d => d < barrier).length;
    const equal = digits.filter(d => d === barrier).length;
    const over = n - under - equal;
    const cells = [
        { o: under, p: barrier / 10 },
        { o: equal, p: 0.1 },
        { o: over, p: (9 - barrier) / 10 },
    ].filter(c => c.p > 0);
    const statistic = cells.reduce((s, c) => s + (c.o - n * c.p) ** 2 / (n * c.p), 0);
    const df = cells.length - 1;
    return {
        n,
        barrier,
        under: sideStat(under, n, barrier / 10),
        equal: sideStat(equal, n, 0.1),
        over: sideStat(over, n, (9 - barrier) / 10),
        chiSquare: {
            statistic,
            df,
            pValue: n && df > 0 ? chiSquareSf(statistic, df) : 1,
            adequate: cells.every(c => n * c.p >= 5),
        },
    };
};

export type MatchesDiffersAnalysis = { n: number; target: number; matches: SideStat; differs: SideStat; digits: DigitRow[] };

export const matchesDiffersAnalysis = (digits: number[], target: number): MatchesDiffersAnalysis => {
    const n = digits.length;
    const hits = digits.filter(d => d === target).length;
    return {
        n,
        target,
        matches: sideStat(hits, n, 0.1),
        differs: sideStat(n - hits, n, 0.9),
        digits: digitDistribution(digits).rows,
    };
};

export type TransitionAnalysis = {
    pairs: number;
    counts: number[][]; // counts[from][to]
    conditional: (number | null)[][]; // P(next = to | current = from)
    chiSquare: { statistic: number; df: number; pValue: number; adequate: boolean };
};

/** Digit-to-next-digit table. Pass digits from consecutive ticks only. */
export const transitionAnalysis = (digits: number[]): TransitionAnalysis => {
    const counts = Array.from({ length: 10 }, () => new Array<number>(10).fill(0));
    for (let i = 1; i < digits.length; i++) counts[digits[i - 1]][digits[i]] += 1;
    const pairs = Math.max(0, digits.length - 1);
    const rowTotals = counts.map(r => r.reduce((a, b) => a + b, 0));
    const colTotals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(j => counts.reduce((a, r) => a + r[j], 0));
    const conditional = counts.map((r, i) => r.map(c => (rowTotals[i] ? c / rowTotals[i] : null)));
    let statistic = 0;
    let lowCells = 0;
    let cellCount = 0;
    counts.forEach((r, i) =>
        r.forEach((c, j) => {
            if (!rowTotals[i] || !colTotals[j]) return;
            const e = (rowTotals[i] * colTotals[j]) / pairs;
            statistic += (c - e) ** 2 / e;
            cellCount += 1;
            if (e < 5) lowCells += 1;
        })
    );
    const rows = rowTotals.filter(t => t > 0).length;
    const cols = colTotals.filter(t => t > 0).length;
    const df = (rows - 1) * (cols - 1);
    return {
        pairs,
        counts,
        conditional,
        chiSquare: {
            statistic,
            df,
            pValue: df > 0 ? chiSquareSf(statistic, df) : 1,
            adequate: cellCount > 0 && lowCells / cellCount <= 0.2, // Cochran's rule of thumb
        },
    };
};
