/**
 * The "Over 1-2-3" digit strategy and its Under mirror (Under 8-7-6), for the smart scan.
 *
 * Over (read left to right on the 0-9 digit stats):
 *  - Digits 0,1 (then 2, then 3) must each be below 10%. All of 0-3 below 10% allows Over 3,
 *    0-2 allows Over 2, 0-1 allows Over 1.
 *  - Digits 4-9 need at least two digits at 11% or more. If not, digits at 10.7% or more that are
 *    still increasing are accepted as a weaker setup.
 *  - The most and second most frequent digits (green and blue bars) must both sit in 4-9.
 *  - Entry: the tick pointer must land on the least appearing digit of 1, 2, 3. Then, within 2 ticks,
 *    a digit from 4-8 must show up: run the bot immediately.
 *  - Digits 0 and 9 are never an entry trigger or confirmation digit.
 * Under is the exact mirror (digit d becomes 9 - d): Under 8-7-6, trigger 8/7/6, confirm 1-5.
 */
export type Direction = 'over' | 'under';
export type Strength = 'strong' | 'good' | 'weak';

export type StrategyResult = {
    direction: Direction;
    /** the market passes every rule of the strategy */
    qualifies: boolean;
    strength: Strength;
    contract: 'DIGITOVER' | 'DIGITUNDER';
    /** Over 1/2/3 or Under 8/7/6 */
    barrier: number | null;
    /** the digit the tick pointer has to land on */
    trigger: number | null;
    /** run the bot when one of these shows up within 2 ticks of the trigger */
    confirm_digits: number[];
    /** the entry condition is met on the latest tick: run the bot now */
    ready: boolean;
    reasons: string[];
    percentages: number[];
};

export const STRATEGY_DEFAULTS = {
    window: 1000, // ticks used for the digit percentages
    min_ticks: 100, // below this the percentages mean nothing
    low: 10, // "below 10%"
    high: 11, // "at least two digits at 11%"
    fallback: 10.7, // "still 10.7% and above, increasing"
    trend_window: 200, // recent ticks used to tell whether a digit is increasing
    confirm_window: 2, // ticks after the trigger in which a confirm digit must appear
};
export type TStrategyOptions = Partial<typeof STRATEGY_DEFAULTS>;

const percentages = (digits: number[]): number[] => {
    const counts = new Array(10).fill(0);
    digits.forEach(d => {
        counts[d]++;
    });
    return counts.map(c => (digits.length ? (c / digits.length) * 100 : 0));
};

const CONFIRM_OVER = [4, 5, 6, 7, 8];
const TRIGGERS_OVER = [1, 2, 3];

type TCore = Omit<StrategyResult, 'direction' | 'contract'>;

/** The Over rules, written once. Under runs the same code on mirrored digits. */
const evaluateOver = (
    digits: number[],
    o: typeof STRATEGY_DEFAULTS,
    label: (d: number) => number,
    name: 'Over' | 'Under'
): TCore => {
    const range = (a: number, b: number) => `${Math.min(label(a), label(b))}-${Math.max(label(a), label(b))}`;
    const win = digits.slice(-o.window);
    const pct = percentages(win);
    const base: TCore = {
        qualifies: false,
        strength: 'weak',
        barrier: null,
        trigger: null,
        confirm_digits: CONFIRM_OVER,
        ready: false,
        reasons: [],
        percentages: pct,
    };
    if (win.length < o.min_ticks) {
        base.reasons.push(`Only ${win.length} ticks so far, need ${o.min_ticks}`);
        return base;
    }
    const recent = percentages(digits.slice(-o.trend_window));

    // 1. how far up the low digits stay below 10% decides Over 1, 2 or 3
    let barrier: number | null = null;
    for (const b of [1, 2, 3]) {
        if (pct.slice(0, b + 1).every(p => p < o.low)) barrier = b;
        else break;
    }
    if (barrier === null) {
        base.reasons.push(`Digits ${label(0)} and ${label(1)} must both be below ${o.low}%`);
        return base;
    }
    base.barrier = barrier;

    // 2. digits 4-9: at least two at 11%+, or 10.7%+ and still increasing
    const zone = [4, 5, 6, 7, 8, 9];
    const strong = zone.filter(d => pct[d] >= o.high);
    const accepted = zone.filter(d => pct[d] >= o.high || (pct[d] >= o.fallback && recent[d] > pct[d]));
    if (accepted.length < 2) {
        base.reasons.push(`Need two of digits ${range(4, 9)} at ${o.high}%+ (or ${o.fallback}%+ and rising)`);
        return base;
    }

    // 3. green and blue bars (most and second most frequent) must be in 4-9
    const order = [...Array(10).keys()].sort((a, b) => pct[b] - pct[a]);
    if (!order.slice(0, 2).every(d => zone.includes(d))) {
        base.reasons.push(`The two most frequent digits (green and blue bars) must be among ${range(4, 9)}`);
        return base;
    }

    // 4. entry: least appearing of 1, 2, 3 is the trigger
    const trigger = TRIGGERS_OVER.reduce((best, d) => (pct[d] < pct[best] ? d : best), TRIGGERS_OVER[0]);
    base.trigger = trigger;
    base.qualifies = true;
    base.strength = strong.length >= 2 && barrier >= 2 ? 'strong' : 'good';
    base.reasons.push(`${name} ${label(barrier)} setup: wait for digit ${label(trigger)}, then a digit from ${range(4, 8)} within ${o.confirm_window} ticks`);

    // 5. is the entry on the latest tick? trigger one or two ticks ago, confirm digit now
    const last = digits.slice(-(o.confirm_window + 1)).reverse(); // [latest, 1 ago, 2 ago]
    const confirmed = (d: number) => CONFIRM_OVER.includes(d);
    if (last.length > 0 && confirmed(last[0])) {
        const one_ago = last[1] === trigger;
        const two_ago = last[2] === trigger && !confirmed(last[1]);
        base.ready = one_ago || two_ago;
    }
    return base;
};

export const evaluateDigitStrategy = (
    direction: Direction,
    digits: number[],
    options: TStrategyOptions = {}
): StrategyResult => {
    const o = { ...STRATEGY_DEFAULTS, ...options };
    const over = direction === 'over';
    const mirror = (d: number) => 9 - d;
    const core = over
        ? evaluateOver(digits, o, d => d, 'Over')
        : evaluateOver(digits.map(mirror), o, mirror, 'Under');
    if (over) return { ...core, direction, contract: 'DIGITOVER' };
    return {
        ...core,
        direction,
        contract: 'DIGITUNDER',
        barrier: core.barrier === null ? null : mirror(core.barrier),
        trigger: core.trigger === null ? null : mirror(core.trigger),
        confirm_digits: core.confirm_digits.map(mirror).sort((a, b) => a - b),
        percentages: [...core.percentages].reverse(),
    };
};

/** Best of both directions for one market (null when neither qualifies). */
export const evaluateBothDirections = (digits: number[], options: TStrategyOptions = {}): StrategyResult | null => {
    const results = (['over', 'under'] as Direction[]).map(d => evaluateDigitStrategy(d, digits, options));
    const ok = results.filter(r => r.qualifies);
    if (!ok.length) return null;
    const rank = { strong: 2, good: 1, weak: 0 };
    return ok.sort((a, b) => rank[b.strength] - rank[a.strength] || Number(b.ready) - Number(a.ready))[0];
};
