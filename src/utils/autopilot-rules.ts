// Rules for SmartScan and Autopilot. Pure functions with no framework imports.
import { compareSignals, DEFAULT_THRESHOLD, DestroyerSignal, DestroyerStrength, evaluateDestroyer, FAIR_SHARE, submarketFor } from './destroyer-rules';

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
    rows.forEach(r => {
        r.digit_pct.forEach((pct, digit) => {
            if (!best || pct < best.pct) best = { symbol: r.symbol, display_name: r.display_name, digit, pct };
        });
    });
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
    rows.forEach(r => {
        if (!losing.every(d => r.digit_pct[d] < threshold)) return;
        const avg = losing.reduce((s, d) => s + r.digit_pct[d], 0) / losing.length;
        const max = Math.max(...losing.map(d => r.digit_pct[d]));
        const strength: DestroyerStrength = max < FAIR_SHARE ? 'strong' : avg < FAIR_SHARE ? 'good' : 'weak';
        if (!best || avg < best.avgLosingPct) {
            best = { symbol: r.symbol, display_name: r.display_name, level, losingDigits: losing, avgLosingPct: avg, strength };
        }
    });
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

/* ------------------------------------------------------------------ bot XML (single trade) */

export interface AutopilotStage {
    symbol: string;
    kind: 'differs' | 'over';
    prediction: number;
    stake: number;
    entryDigits?: [number, number, number]; // Over only: wait for one of these last digits
}

const setNum = (xml: string, id: string, val: number | string) =>
    xml.replace(new RegExp(`(<block type="math_number" id="${id}"><field name="NUM">)[^<]*`), `$1${val}`);

/** Patches the single-trade template (sammee_autopilot.xml) for one stage. */
export function patchAutopilotXml(xml: string, s: AutopilotStage): string {
    const differs = s.kind === 'differs';
    let x = xml.replace(/DIGIT(OVER|UNDER|DIFF)/g, differs ? 'DIGITDIFF' : 'DIGITOVER');
    x = x.replace(/(<field name="TRADETYPE_LIST">)[^<]*/, `$1${differs ? 'matchesdiffers' : 'overunder'}`);
    x = x.replace(/(<field name="SYMBOL_LIST">)[^<]*/, `$1${s.symbol}`);
    x = x.replace(/(<field name="SUBMARKET_LIST">)[^<]*/, `$1${submarketFor(s.symbol)}`);
    x = setNum(x, 'b19', s.prediction); // Prediction (barrier)
    x = setNum(x, 'b1', s.stake); // InitialStake
    if (differs) {
        x = setNum(x, 'b17', 1); // EntryHit = 1: buy immediately, no entry-digit wait
    } else {
        const e = s.entryDigits ?? [2, 5, 6];
        x = setNum(x, 'b17', 0);
        ['b22', 'b25', 'b29'].forEach((id, i) => (x = setNum(x, id, e[i])));
    }
    return x;
}
