// Destroyer rules: pick Over/Under from last-N-tick digit percentages, and patch the bot XML.
// Pure functions with no imports, so they are easy to test.

export type DestroyerSide = 'over' | 'under';

export interface DestroyerSignal {
    side: DestroyerSide;
    prediction: number; // barrier: Over 1/2 or Under 8/7
    recoveryPrediction: number; // barrier used after a loss (martingale mode)
    entryDigits: [number, number, number]; // last digits that trigger the purchase
    losingDigits: number[]; // digits that make this contract lose
    avgLosingPct: number; // average % of the losing digits (lower = stronger signal)
    label: string; // 'Over 2', 'Under 8', ...
    reason: string;
}

export const DEFAULT_THRESHOLD = 10.5; // percent

export const OVER_ENTRY: [number, number, number] = [2, 5, 6];
export const UNDER_ENTRY: [number, number, number] = [4, 7, 9];

/** digitPct: array of 10 numbers (percent of ticks for digit 0..9). */
export function evaluateDestroyer(digitPct: number[], threshold = DEFAULT_THRESHOLD): DestroyerSignal | null {
    if (!digitPct || digitPct.length !== 10) return null;
    const p = digitPct;
    const below = (d: number) => p[d] < threshold;
    const candidates: DestroyerSignal[] = [];

    // OVER: losing digits for Over 2 are 0,1,2; for Over 1 they are 0,1
    if (below(0) && below(1)) {
        const all3 = below(2);
        const prediction = all3 ? 2 : 1;
        const losing = all3 ? [0, 1, 2] : [0, 1];
        candidates.push({
            side: 'over',
            prediction,
            recoveryPrediction: prediction + 2,
            entryDigits: OVER_ENTRY,
            losingDigits: losing,
            avgLosingPct: losing.reduce((s, d) => s + p[d], 0) / losing.length,
            label: `Over ${prediction}`,
            reason: all3 ? '0, 1 and 2 are all below the threshold' : '0 and 1 are below the threshold',
        });
    }

    // UNDER: losing digits for Under 7 are 7,8,9; for Under 8 they are 8,9
    if (below(8) && below(9)) {
        const all3 = below(7);
        const prediction = all3 ? 7 : 8;
        const losing = all3 ? [7, 8, 9] : [8, 9];
        candidates.push({
            side: 'under',
            prediction,
            recoveryPrediction: prediction - 2,
            entryDigits: UNDER_ENTRY,
            losingDigits: losing,
            avgLosingPct: losing.reduce((s, d) => s + p[d], 0) / losing.length,
            label: `Under ${prediction}`,
            reason: all3 ? '7, 8 and 9 are all below the threshold' : '8 and 9 are below the threshold',
        });
    }

    if (!candidates.length) return null;
    // If both sides qualify, take the one whose losing digits are rarest.
    candidates.sort((a, b) => a.avgLosingPct - b.avgLosingPct);
    return candidates[0];
}

/** Jump indices live in their own submarket; everything else we scan is a continuous index. */
export const submarketFor = (symbol: string): string => (/^JD/i.test(symbol) ? 'jump_index' : 'random_index');

const setNum = (xml: string, id: string, val: number | string) =>
    xml.replace(new RegExp(`(<block type="math_number" id="${id}"><field name="NUM">)[^<]*`), `$1${val}`);

export interface PatchOptions {
    symbol: string; // e.g. 'R_100', '1HZ50V', 'JD25'
    stake?: number;
    martingale?: number;
    maxRuns?: number;
    maxRecoverySteps?: number;
}

/** Takes the destroyer template XML text and applies a signal to it. */
export function patchDestroyerXml(xml: string, s: DestroyerSignal, o: PatchOptions): string {
    const contract = s.side === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
    let x = xml.replace(/DIGIT(OVER|UNDER)/g, contract);
    x = x.replace(/(<field name="SYMBOL_LIST">)[^<]*/, `$1${o.symbol}`);
    x = x.replace(/(<field name="SUBMARKET_LIST">)[^<]*/, `$1${submarketFor(o.symbol)}`);
    x = setNum(x, 'b19', s.prediction);
    x = setNum(x, 'b63', s.recoveryPrediction);
    ['b22', 'b25', 'b29'].forEach((id, i) => (x = setNum(x, id, s.entryDigits[i])));
    if (o.stake !== undefined) x = setNum(x, 'b1', o.stake);
    if (o.martingale !== undefined) x = setNum(x, 'b5', o.martingale);
    if (o.maxRuns !== undefined) x = setNum(x, 'b7', o.maxRuns);
    if (o.maxRecoverySteps !== undefined) x = setNum(x, 'b9', o.maxRecoverySteps);
    return x;
}
