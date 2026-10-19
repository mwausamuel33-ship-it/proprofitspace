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
        const pick: EvenOddPick = {
            symbol: r.symbol,
            display_name: r.display_name,
            side,
            topDigit: top,
            topPct: r.digit_pct[top],
            entryDigit: entry,
            entryPct: r.digit_pct[entry],
        };
        if (best === null || pick.topPct > best.topPct) best = pick;
    }
    return best;
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
