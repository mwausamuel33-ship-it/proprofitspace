import type { DestroyerSignal } from '@/utils/destroyer-rules';
import type { StrategyResult } from '@/utils/digit-strategy';

/** Turns a digit-strategy result into the signal shape the scanner pages already use. */
export const strategyToSignal = (r: StrategyResult | null): DestroyerSignal | null => {
    if (!r || !r.qualifies || r.barrier === null || r.trigger === null) return null;
    const over = r.direction === 'over';
    // Over b loses on digits 0..b, Under b loses on digits b..9
    const losing = over
        ? Array.from({ length: r.barrier + 1 }, (_, i) => i)
        : Array.from({ length: 10 - r.barrier }, (_, i) => r.barrier! + i);
    const pct = r.percentages;
    const avg = losing.reduce((sum, d) => sum + pct[d], 0) / losing.length;
    const max = Math.max(...losing.map(d => pct[d]));
    return {
        side: r.direction,
        prediction: r.barrier,
        recoveryPrediction: over ? 3 : 6,
        entryDigits: [r.trigger, r.trigger, r.trigger],
        losingDigits: losing,
        avgLosingPct: avg,
        maxLosingPct: max,
        deviation: 10 - avg,
        strength: r.strength,
        label: `${over ? 'Over' : 'Under'} ${r.barrier}`,
        reason: r.reasons.join('. '),
        trigger: r.trigger,
        confirmDigits: r.confirm_digits,
        ready: r.ready,
    };
};
