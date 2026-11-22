import type { Interval } from './distribution';
import { binomialTwoSidedP, wilsonInterval } from './math';

export type Contract = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'DIGITMATCH' | 'DIGITDIFF';

export const contractWins = (contract: Contract, barrier: number | null, digit: number): boolean => {
    switch (contract) {
        case 'DIGITOVER':
            return digit > (barrier as number);
        case 'DIGITUNDER':
            return digit < (barrier as number);
        case 'DIGITEVEN':
            return digit % 2 === 0;
        case 'DIGITODD':
            return digit % 2 === 1;
        case 'DIGITMATCH':
            return digit === barrier;
        default:
            return digit !== barrier;
    }
};

/** One thing a strategy could bet on, with its counts in one window of ticks. */
export type Candidate = {
    id: string;
    contract: Contract;
    barrier: number | null;
    label: string;
    p0: number; // win probability if the digits are fair
    k: number; // times it would have won in the window
    n: number; // observations in the window
    payoutRate: number | null; // profit per 1 staked; null when unknown
};

const pCache = new Map<string, number>();
/** Exact two-sided binomial p-value, cached because backtests ask for the same (k, n, p) many times. */
export const exactP = (k: number, n: number, p0: number): number => {
    const key = `${k}|${n}|${p0}`;
    let p = pCache.get(key);
    if (p === undefined) {
        p = binomialTwoSidedP(k, n, p0);
        pCache.set(key, p);
    }
    return p;
};

export const isUsable = (c: Candidate): boolean => c.p0 > 0 && c.p0 < 1 && c.n > 0;

/**
 * The rule every strategy trades: take the candidate that has been significantly MORE frequent than fair
 * (share above p0 and p below alpha divided by the number of candidates tested). Null when none qualifies.
 */
export const selectFavourable = (candidates: Candidate[], alpha = 0.05): Candidate | null => {
    const usable = candidates.filter(isUsable);
    let best: Candidate | null = null;
    let bestP = 1;
    usable.forEach(c => {
        if (c.k / c.n <= c.p0) return;
        const p = exactP(c.k, c.n, c.p0);
        if (p < alpha / usable.length && p < bestP) {
            best = c;
            bestP = p;
        }
    });
    return best;
};

export type BacktestSummary = {
    trainWindow: number;
    steps: number; // ticks that were predicted
    trades: number; // steps where the rule decided to bet
    wins: number;
    winRate: number | null;
    winRateCI: Interval | null;
    payoutKnown: boolean;
    meanReturn: number | null; // average profit per 1 staked
    returnCI: Interval | null;
    decisions: (string | null)[]; // candidate id chosen at each step (for look-ahead checks)
};

/**
 * Walk-forward test with no look-ahead: the decision for tick t is built only from the `trainWindow`
 * ticks BEFORE t, then judged on tick t, which the decision never saw.
 */
export const walkForward = (
    digits: number[],
    trainWindow: number,
    build: (training: number[]) => Candidate[],
    alpha = 0.05
): BacktestSummary => {
    const decisions: (string | null)[] = [];
    let trades = 0;
    let wins = 0;
    let payoutKnown = true;
    const returns: number[] = [];
    for (let t = trainWindow; t < digits.length; t++) {
        const chosen = selectFavourable(build(digits.slice(t - trainWindow, t)), alpha);
        decisions.push(chosen ? chosen.id : null);
        if (!chosen) continue;
        const won = contractWins(chosen.contract, chosen.barrier, digits[t]);
        trades += 1;
        if (won) wins += 1;
        if (chosen.payoutRate === null) payoutKnown = false;
        else returns.push(won ? chosen.payoutRate : -1);
    }
    const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
    let returnCI: Interval | null = null;
    if (payoutKnown && mean !== null && returns.length >= 2) {
        const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
        const half = (1.959963984540054 * Math.sqrt(variance)) / Math.sqrt(returns.length);
        returnCI = { low: mean - half, high: mean + half };
    }
    return {
        trainWindow,
        steps: Math.max(0, digits.length - trainWindow),
        trades,
        wins,
        winRate: trades ? wins / trades : null,
        winRateCI: trades ? wilsonInterval(wins, trades) : null,
        payoutKnown,
        meanReturn: payoutKnown ? mean : null,
        returnCI,
        decisions,
    };
};
