// Rules for SmartScan and Autopilot. Pure functions with no framework imports.
import { compareSignals, DEFAULT_THRESHOLD, DestroyerSignal, DestroyerStrength, evaluateDestroyer, FAIR_SHARE } from './destroyer-rules';

export interface MarketDigits {
    symbol: string;
    display_name: string;
    digit_pct: number[]; // % of ticks for digits 0..9
}

/* ------------------------------------------------------------------ SmartScan */

const RANK: Record<DestroyerStrength, number> = { strong: 0, good: 1, weak: 2 };

export interface BestSignal {
    symbol: string;
    display_name: string;
    signal: DestroyerSignal;
}

/** Best Over/Under signal across all markets, no weaker than `minStrength`. */
export function pickBestSignal(
    rows: MarketDigits[],
    threshold = DEFAULT_THRESHOLD,
    minStrength: DestroyerStrength = 'good'
): BestSignal | null {
    const found: BestSignal[] = [];
    rows.forEach(r => {
        const signal = evaluateDestroyer(r.digit_pct, threshold);
        if (signal && RANK[signal.strength] <= RANK[minStrength]) {
            found.push({ symbol: r.symbol, display_name: r.display_name, signal });
        }
    });
    found.sort((a, b) => compareSignals(a.signal, b.signal));
    return found[0] ?? null;
}

/* ------------------------------------------------------------------ Autopilot */

export interface DiffersPick {
    symbol: string;
    display_name: string;
    digit: number; // the barrier: the contract wins when the last digit is NOT this digit
    pct: number;
}

/** The digit with the lowest percentage across all scanned markets. */
export function pickDiffers(rows: MarketDigits[]): DiffersPick | null {
    let best: DiffersPick | null = null;
    for (const r of rows) {
        for (let digit = 0; digit < r.digit_pct.length; digit++) {
            const pct = r.digit_pct[digit];
            if (best === null || pct < best.pct) {
                best = { symbol: r.symbol, display_name: r.display_name, digit, pct };
            }
        }
    }
    return best;
}

export interface OverPick {
    symbol: string;
    display_name: string;
    level: 1 | 2 | 3 | 4; // Over 1 .. Over 4
    losingDigits: number[]; // 0..level
    avgLosingPct: number;
    strength: DestroyerStrength;
}

/** Best market for "Over <level>": every losing digit (0..level) must sit below `threshold`. */
export function pickOver(rows: MarketDigits[], level: 1 | 2 | 3 | 4, threshold = DEFAULT_THRESHOLD): OverPick | null {
    const losing = Array.from({ length: level + 1 }, (_, d) => d);
    let best: OverPick | null = null;
    for (const r of rows) {
        if (!losing.every(d => r.digit_pct[d] < threshold)) continue;
        const avg = losing.reduce((sum, d) => sum + r.digit_pct[d], 0) / losing.length;
        const max = Math.max(...losing.map(d => r.digit_pct[d]));
        const strength: DestroyerStrength = max < FAIR_SHARE ? 'strong' : avg < FAIR_SHARE ? 'good' : 'weak';
        if (best === null || avg < best.avgLosingPct) {
            best = { symbol: r.symbol, display_name: r.display_name, level, losingDigits: losing, avgLosingPct: avg, strength };
        }
    }
    return best;
}

/**
 * Recovery after a loss: Over 4 (higher payout) when a market has all of digits 0-4 below 10%,
 * otherwise Over 3 when a market has digits 0-3 below the threshold.
 */
export function pickRecovery(rows: MarketDigits[], threshold = DEFAULT_THRESHOLD): OverPick | null {
    return pickOver(rows, 4, FAIR_SHARE) ?? pickOver(rows, 3, threshold);
}

export const AUTOPILOT_SEQUENCE = ['differs', 'over1', 'over2'] as const;
export type AutopilotStep = (typeof AUTOPILOT_SEQUENCE)[number];

/* ------------------------------------------------------------------ Even / Odd */

export interface EvenOddPick {
    symbol: string;
    display_name: string;
    side: 'even' | 'odd';
    topDigit: number; // the digit with the highest percentage
    topPct: number;
    entryDigit: number; // the lowest-percentage digit of the same parity
    entryPct: number;
    evenPct: number; // % of ticks that end on an even digit
    oddPct: number; // % of ticks that end on an odd digit
}

/**
 * The market whose most frequent digit stands out most. If that digit is even we trade Even, if odd we
 * trade Odd. The entry point is the least frequent digit of the same parity.
 */
export function pickEvenOdd(rows: MarketDigits[]): EvenOddPick | null {
    let best: EvenOddPick | null = null;
    for (const r of rows) {
        let top = 0;
        for (let d = 1; d < r.digit_pct.length; d++) {
            if (r.digit_pct[d] > r.digit_pct[top]) top = d;
        }
        const side: 'even' | 'odd' = top % 2 === 0 ? 'even' : 'odd';
        let entry = top;
        for (let d = 0; d < r.digit_pct.length; d++) {
            if (d % 2 === top % 2 && r.digit_pct[d] < r.digit_pct[entry]) entry = d;
        }
        let evenPct = 0;
        let oddPct = 0;
        r.digit_pct.forEach((v, d) => (d % 2 === 0 ? (evenPct += v) : (oddPct += v)));
        const pick: EvenOddPick = {
            symbol: r.symbol,
            display_name: r.display_name,
            side,
            topDigit: top,
            topPct: r.digit_pct[top],
            entryDigit: entry,
            entryPct: r.digit_pct[entry],
            evenPct,
            oddPct,
        };
        if (best === null || pick.topPct > best.topPct) best = pick;
    }
    return best;
}

/**
 * How many winning runs to trade on an Even/Odd market before scanning again.
 * Top digit at 12% or more: 15 runs, plus 2 for every further 0.5 points (at most 25).
 * Below 12%: 4 to 6 runs (4 under 11%, 5 under 11.5%, 6 otherwise).
 */
export function evenOddRuns(topPct: number): number {
    if (topPct >= 12) return Math.min(25, 15 + 2 * Math.floor((topPct - 12) / 0.5));
    if (topPct < 11) return 4;
    if (topPct < 11.5) return 5;
    return 6;
}

export interface EvenOddRecoveryPick {
    symbol: string;
    display_name: string;
    side: 'even' | 'odd';
    total: number; // % of ticks that land on the chosen parity
    strict: boolean; // true when the five most frequent digits are all even (or all odd)
}

/**
 * Recovery market. Strict rule: the five most frequent digits are all even (Even market) or all odd
 * (Odd market). That is rare, so if no market qualifies we fall back to the market with the biggest
 * even/odd imbalance.
 */
export function pickEvenOddRecovery(rows: MarketDigits[]): EvenOddRecoveryPick | null {
    let strictBest: EvenOddRecoveryPick | null = null;
    let looseBest: EvenOddRecoveryPick | null = null;
    let looseGap = -1;

    for (const r of rows) {
        let evenTotal = 0;
        let oddTotal = 0;
        r.digit_pct.forEach((pct, d) => {
            if (d % 2 === 0) evenTotal += pct;
            else oddTotal += pct;
        });
        const top5 = r.digit_pct
            .map((pct, d) => ({ pct, d }))
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 5);
        const allEven = top5.every(x => x.d % 2 === 0);
        const allOdd = top5.every(x => x.d % 2 === 1);

        if (allEven || allOdd) {
            const side: 'even' | 'odd' = allEven ? 'even' : 'odd';
            const total = allEven ? evenTotal : oddTotal;
            if (strictBest === null || total > strictBest.total) {
                strictBest = { symbol: r.symbol, display_name: r.display_name, side, total, strict: true };
            }
        }

        const gap = Math.abs(evenTotal - oddTotal);
        if (gap > looseGap) {
            looseGap = gap;
            const side: 'even' | 'odd' = evenTotal >= oddTotal ? 'even' : 'odd';
            looseBest = {
                symbol: r.symbol,
                display_name: r.display_name,
                side,
                total: side === 'even' ? evenTotal : oddTotal,
                strict: false,
            };
        }
    }

    return strictBest ?? looseBest;
}

/* ------------------------------------------------------------------ Matches */

export interface MatchesPick {
    symbol: string;
    display_name: string;
    entryDigit: number; // the most frequent digit: wait for it, then buy
    matchDigit: number; // the second most frequent digit: the digit we predict
    topPct: number;
    secondPct: number;
    gap: number; // topPct - secondPct
}

/** Markets where the two most frequent digits are within `maxGap` points of each other. Smallest gap wins. */
export function pickMatches(rows: MarketDigits[], maxGap = 0.5): MatchesPick | null {
    let best: MatchesPick | null = null;
    for (const r of rows) {
        const sorted = r.digit_pct.map((pct, d) => ({ pct, d })).sort((a, b) => b.pct - a.pct);
        const first = sorted[0];
        const second = sorted[1];
        const gap = first.pct - second.pct;
        if (gap > maxGap) continue;
        if (best === null || gap < best.gap) {
            best = {
                symbol: r.symbol,
                display_name: r.display_name,
                entryDigit: first.d,
                matchDigit: second.d,
                topPct: first.pct,
                secondPct: second.pct,
                gap,
            };
        }
    }
    return best;
}

/* ------------------------------------------------------------------ SmartScan: prefer Over 1 */

export type SignalFilter = 'both' | 'over' | 'under';

/** Best market for Over 1 (digits 0 and 1 below the threshold), no weaker than `minStrength`. */
export function pickOver1Signal(
    rows: MarketDigits[],
    threshold = DEFAULT_THRESHOLD,
    minStrength: DestroyerStrength = 'good'
): BestSignal | null {
    let best: BestSignal | null = null;
    for (const r of rows) {
        const p0 = r.digit_pct[0];
        const p1 = r.digit_pct[1];
        if (!(p0 < threshold && p1 < threshold)) continue;
        const avg = (p0 + p1) / 2;
        const max = Math.max(p0, p1);
        const strength: DestroyerStrength = max < FAIR_SHARE ? 'strong' : avg < FAIR_SHARE ? 'good' : 'weak';
        if (RANK[strength] > RANK[minStrength]) continue;
        const signal: DestroyerSignal = {
            side: 'over',
            prediction: 1,
            recoveryPrediction: 3,
            entryDigits: [2, 5, 6],
            losingDigits: [0, 1],
            avgLosingPct: avg,
            maxLosingPct: max,
            deviation: FAIR_SHARE - avg,
            strength,
            label: 'Over 1',
            reason: '0 and 1 are below the threshold',
        };
        if (best === null || compareSignals(signal, best.signal) < 0) {
            best = { symbol: r.symbol, display_name: r.display_name, signal };
        }
    }
    return best;
}

/** Best market for Under 8 (digits 8 and 9 below the threshold), no weaker than `minStrength`. Mirror of Over 1. */
export function pickUnder8Signal(
    rows: MarketDigits[],
    threshold = DEFAULT_THRESHOLD,
    minStrength: DestroyerStrength = 'good'
): BestSignal | null {
    let best: BestSignal | null = null;
    for (const r of rows) {
        const p8 = r.digit_pct[8];
        const p9 = r.digit_pct[9];
        if (!(p8 < threshold && p9 < threshold)) continue;
        const avg = (p8 + p9) / 2;
        const max = Math.max(p8, p9);
        const strength: DestroyerStrength = max < FAIR_SHARE ? 'strong' : avg < FAIR_SHARE ? 'good' : 'weak';
        if (RANK[strength] > RANK[minStrength]) continue;
        const signal: DestroyerSignal = {
            side: 'under',
            prediction: 8,
            recoveryPrediction: 7,
            entryDigits: [7, 4, 3],
            losingDigits: [8, 9],
            avgLosingPct: avg,
            maxLosingPct: max,
            deviation: FAIR_SHARE - avg,
            strength,
            label: 'Under 8',
            reason: '8 and 9 are below the threshold',
        };
        if (best === null || compareSignals(signal, best.signal) < 0) {
            best = { symbol: r.symbol, display_name: r.display_name, signal };
        }
    }
    return best;
}

/** SmartScan pick: Over 1 and/or Under 8, whichever the filter allows. With 'both' the stronger signal wins. */
export function pickSmartSignal(
    rows: MarketDigits[],
    threshold = DEFAULT_THRESHOLD,
    minStrength: DestroyerStrength = 'good',
    filter: SignalFilter = 'both'
): BestSignal | null {
    const over1 = filter === 'under' ? null : pickOver1Signal(rows, threshold, minStrength);
    const under8 = filter === 'over' ? null : pickUnder8Signal(rows, threshold, minStrength);
    if (over1 && under8) return compareSignals(over1.signal, under8.signal) <= 0 ? over1 : under8;
    return over1 ?? under8;
}

/* ------------------------------------------------------------------ Under recovery + Autopilot helpers */

export interface UnderPick {
    symbol: string;
    display_name: string;
    barrier: 5 | 6; // Under 5 or Under 6
    avgLosingPct: number;
}

/** Market where every losing digit (barrier..9) of "Under <barrier>" is below `threshold`. */
export function pickUnder(rows: MarketDigits[], barrier: 5 | 6, threshold = DEFAULT_THRESHOLD): UnderPick | null {
    const losing = Array.from({ length: 10 - barrier }, (_, i) => barrier + i);
    let best: UnderPick | null = null;
    for (const r of rows) {
        if (!losing.every(d => r.digit_pct[d] < threshold)) continue;
        const avg = losing.reduce((sum, d) => sum + r.digit_pct[d], 0) / losing.length;
        if (best === null || avg < best.avgLosingPct) {
            best = { symbol: r.symbol, display_name: r.display_name, barrier, avgLosingPct: avg };
        }
    }
    return best;
}

export type RecoveryType = 'evenodd' | 'over' | 'under' | 'auto';

export interface RecoveryChoice {
    kind: 'over' | 'under' | 'even' | 'odd';
    symbol: string;
    display_name: string;
    barrier?: number; // Over/Under
    label: string; // 'Over 4', 'Under 6', 'Even', ...
    note: string; // short explanation for the log
}

/** The recovery market for Autopilot. 'auto' takes the strongest Over/Under recovery, else Even/Odd. */
export function pickRecoveryChoice(rows: MarketDigits[], type: RecoveryType, threshold = DEFAULT_THRESHOLD): RecoveryChoice | null {
    const over = (): RecoveryChoice | null => {
        const p = pickRecovery(rows, threshold);
        return p ? { kind: 'over', symbol: p.symbol, display_name: p.display_name, barrier: p.level, label: `Over ${p.level}`, note: `digits 0-${p.level} are low` } : null;
    };
    const under = (): RecoveryChoice | null => {
        const p = pickUnder(rows, 5, FAIR_SHARE) ?? pickUnder(rows, 6, threshold);
        return p ? { kind: 'under', symbol: p.symbol, display_name: p.display_name, barrier: p.barrier, label: `Under ${p.barrier}`, note: `digits ${p.barrier}-9 are low` } : null;
    };
    const evenOdd = (): RecoveryChoice | null => {
        const p = pickEvenOddRecovery(rows);
        if (!p) return null;
        const label = p.side === 'even' ? 'Even' : 'Odd';
        return {
            kind: p.side,
            symbol: p.symbol,
            display_name: p.display_name,
            label,
            note: p.strict ? `its five most frequent digits are all ${p.side}` : `strongest ${p.side} lean, ${p.total.toFixed(1)}%`,
        };
    };

    if (type === 'over') return over();
    if (type === 'under') return under();
    if (type === 'evenodd') return evenOdd();
    return over() ?? under() ?? evenOdd();
}

/** One volatility for every Autopilot step: Differs, Over 1 and Over 2 all trade this market. */
export interface AutopilotMarket {
    symbol: string;
    display_name: string;
    digit_pct: number[];
    over2Ok: boolean; // digit 2 is below the threshold too
    differsDigit: number; // the lowest-percentage digit of this market
    differsPct: number;
}

export function pickAutopilotMarket(rows: MarketDigits[], threshold = DEFAULT_THRESHOLD): AutopilotMarket | null {
    let best: AutopilotMarket | null = null;
    let bestScore = Infinity;
    for (const r of rows) {
        const p = r.digit_pct;
        if (!(p[0] < threshold && p[1] < threshold)) continue; // Over 1 must fit
        const over2Ok = p[2] < threshold;
        const score = over2Ok ? (p[0] + p[1] + p[2]) / 3 : 100 + (p[0] + p[1]) / 2; // markets that fit Over 2 too come first
        if (score < bestScore) {
            let low = 0;
            for (let d = 1; d < p.length; d++) if (p[d] < p[low]) low = d;
            bestScore = score;
            best = { symbol: r.symbol, display_name: r.display_name, digit_pct: p, over2Ok, differsDigit: low, differsPct: p[low] };
        }
    }
    return best;
}

/* ------------------------------------------------------------------ SmartScan: Over 1 / Over 2 / Under 8 / Under 7 */

/** auto: the strength of the signal picks the barrier. safer: Over 1 / Under 8. riskier: Over 2 / Under 7. */
export type RiskChoice = 'auto' | 'safer' | 'riskier';

export interface SmartPick {
    symbol: string;
    display_name: string;
    side: 'over' | 'under';
    prediction: 1 | 2 | 7 | 8;
    label: string; // 'Over 1', 'Over 2', 'Under 8', 'Under 7'
    strength: DestroyerStrength;
    deviation: number; // points the losing digits sit below the fair 10%
    losingDigits: number[]; // the digits that lose this contract; they are watched while trading
    trigger: number; // trigger digit: Over uses 1, Under uses 8
    confirmGt?: number; // Over: the confirmation digit is above this
    confirmLt?: number; // Under: the confirmation digit is below this (digit 0 is not used)
    baseline: number[]; // digit percentages when the market was picked
}

const lowestDigitOf = (p: number[]) => {
    let low = 0;
    for (let d = 1; d < p.length; d++) if (p[d] < p[low]) low = d;
    return low;
};

const rateDigits = (p: number[], digits: number[]) => {
    const avg = digits.reduce((sum, d) => sum + p[d], 0) / digits.length;
    const max = Math.max(...digits.map(d => p[d]));
    const strength: DestroyerStrength = max < FAIR_SHARE ? 'strong' : avg < FAIR_SHARE ? 'good' : 'weak';
    return { avg, strength };
};

/**
 * SmartScan markets (all digit percentages are over the last 1000 ticks).
 *  - Over 1 / Over 2: digits 0, 1 and 2 are all below the threshold. Trigger digit 1, then a digit above the barrier.
 *  - Under 8: digits 8 and 9 are below the threshold. Under 7: digits 7, 8 and 9 are below it.
 *    Trigger digit 8, then a digit below the barrier (digit 0 is not used).
 *  - The lowest-percentage digit of the market (the red bar) must not be one of the losing digits of the chosen
 *    barrier: 0 and 1 for Over 1, 0-2 for Over 2, 8 and 9 for Under 8, 7-9 for Under 7.
 *  - auto: a strong signal trades the riskier barrier (Over 2 / Under 7), anything else the safer one.
 * Markets in `exclude` are skipped.
 */
export function pickSmartMarket(
    rows: MarketDigits[],
    threshold = DEFAULT_THRESHOLD,
    minStrength: DestroyerStrength = 'good',
    filter: SignalFilter = 'both',
    risk: RiskChoice = 'auto',
    exclude: string[] = []
): SmartPick | null {
    let best: SmartPick | null = null;

    const consider = (pick: SmartPick) => {
        if (RANK[pick.strength] > RANK[minStrength]) return;
        if (best === null || RANK[pick.strength] < RANK[best.strength] || (pick.strength === best.strength && pick.deviation > best.deviation)) {
            best = pick;
        }
    };

    for (const r of rows) {
        if (exclude.includes(r.symbol)) continue;
        const p = r.digit_pct;
        const low = lowestDigitOf(p);

        if (filter !== 'under' && p[0] < threshold && p[1] < threshold && p[2] < threshold) {
            const rated = rateDigits(p, [0, 1, 2]);
            const over1Ok = low !== 0 && low !== 1;
            const over2Ok = over1Ok && low !== 2;
            const want2 = risk === 'riskier' || (risk === 'auto' && rated.strength === 'strong');
            const prediction: 1 | 2 | null = want2 && over2Ok ? 2 : over1Ok ? 1 : null;
            if (prediction) {
                consider({
                    symbol: r.symbol,
                    display_name: r.display_name,
                    side: 'over',
                    prediction,
                    label: `Over ${prediction}`,
                    strength: rated.strength,
                    deviation: FAIR_SHARE - rated.avg,
                    losingDigits: prediction === 2 ? [0, 1, 2] : [0, 1],
                    trigger: 1,
                    confirmGt: prediction,
                    baseline: p,
                });
            }
        }

        if (filter !== 'over' && p[8] < threshold && p[9] < threshold) {
            const under8Ok = low !== 8 && low !== 9;
            const under7Ok = under8Ok && p[7] < threshold && low !== 7;
            const rated7 = rateDigits(p, [7, 8, 9]);
            const want7 = risk === 'riskier' || (risk === 'auto' && rated7.strength === 'strong');
            const prediction: 7 | 8 | null = want7 && under7Ok ? 7 : under8Ok ? 8 : null;
            if (prediction) {
                const rated = prediction === 7 ? rated7 : rateDigits(p, [8, 9]);
                consider({
                    symbol: r.symbol,
                    display_name: r.display_name,
                    side: 'under',
                    prediction,
                    label: `Under ${prediction}`,
                    strength: rated.strength,
                    deviation: FAIR_SHARE - rated.avg,
                    losingDigits: prediction === 7 ? [7, 8, 9] : [8, 9],
                    trigger: 8,
                    confirmLt: prediction,
                    baseline: p,
                });
            }
        }
    }
    return best;
}
