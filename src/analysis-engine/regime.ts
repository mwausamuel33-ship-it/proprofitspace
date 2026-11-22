import { chiSquareSf } from './math';
import { digitDistribution } from './distribution';

export type Regime =
    | 'NORMAL_RANDOM_LIKE'
    | 'SHORT_TERM_IMBALANCE'
    | 'PERSISTENT_IMBALANCE'
    | 'CHANGING_DISTRIBUTION'
    | 'LOW_VARIATION'
    | 'INSUFFICIENT_EVIDENCE';

export type RegimeInfo = {
    regime: Regime;
    observations: number;
    shortChiSquareP: number | null; // last 200 ticks
    longChiSquareP: number | null; // everything available, up to 1000
    lowVariationP: number | null; // chance of digits being THIS uniform if they were random
    halvesHomogeneityP: number | null; // do the older and newer half have the same distribution?
    explanation: string;
};

/** Do two groups of digits share one distribution? Chi-square test of homogeneity (2 x 10 table). */
export const homogeneityTest = (a: number[], b: number[]): { statistic: number; df: number; pValue: number } => {
    const count = (d: number[]) => {
        const c = new Array<number>(10).fill(0);
        d.forEach(x => {
            c[x] += 1;
        });
        return c;
    };
    const ca = count(a);
    const cb = count(b);
    const total = a.length + b.length;
    let statistic = 0;
    let columns = 0;
    for (let j = 0; j < 10; j++) {
        const col = ca[j] + cb[j];
        if (!col) continue;
        columns += 1;
        const ea = (a.length * col) / total;
        const eb = (b.length * col) / total;
        statistic += (ca[j] - ea) ** 2 / ea + (cb[j] - eb) ** 2 / eb;
    }
    const df = columns - 1;
    return { statistic, df, pValue: df > 0 ? chiSquareSf(statistic, df) : 1 };
};

const ALPHA = 0.01;

/** Classify digit behaviour from measured tests only. At least 400 consecutive ticks are needed. */
export const classifyRegime = (digits: number[], hasGap = false): RegimeInfo => {
    const n = digits.length;
    const empty = { observations: n, shortChiSquareP: null, longChiSquareP: null, lowVariationP: null, halvesHomogeneityP: null };
    if (hasGap) return { ...empty, regime: 'INSUFFICIENT_EVIDENCE', explanation: 'There is a gap in the ticks, so the regime cannot be measured reliably.' };
    if (n < 400) return { ...empty, regime: 'INSUFFICIENT_EVIDENCE', explanation: `Only ${n} consecutive ticks; at least 400 are needed.` };
    const longDigits = digits.slice(-1000);
    const shortP = digitDistribution(digits.slice(-200)).chiSquare.pValue;
    const longP = digitDistribution(longDigits).chiSquare.pValue;
    const lowP = 1 - longP;
    const half = Math.floor(longDigits.length / 2);
    const homogeneityP = homogeneityTest(longDigits.slice(0, half), longDigits.slice(half)).pValue;
    const base = { observations: n, shortChiSquareP: shortP, longChiSquareP: longP, lowVariationP: lowP, halvesHomogeneityP: homogeneityP };
    if (homogeneityP < ALPHA)
        return { ...base, regime: 'CHANGING_DISTRIBUTION', explanation: 'The older and newer halves of the data have significantly different digit distributions.' };
    if (shortP < ALPHA && longP < ALPHA)
        return { ...base, regime: 'PERSISTENT_IMBALANCE', explanation: 'The digit distribution is significantly uneven in both the short and the long window, and stable between halves.' };
    if (shortP < ALPHA)
        return { ...base, regime: 'SHORT_TERM_IMBALANCE', explanation: 'The last 200 ticks are significantly uneven but the longer window is not.' };
    if (lowP < ALPHA)
        return { ...base, regime: 'LOW_VARIATION', explanation: 'The digits are more evenly spread than random digits normally are.' };
    return { ...base, regime: 'NORMAL_RANDOM_LIKE', explanation: 'No test shows a departure from random-like digits at the 1% level.' };
};
