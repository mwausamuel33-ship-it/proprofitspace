import { TDigitStat } from './digit-stats';

export const LOW_DIGIT_THRESHOLD = 10.5;

export type TThresholdSignal = {
    contract_type: 'DIGITOVER' | 'DIGITUNDER';
    barrier: number;
    triggering_digits: { digit: number; percentage: number }[];
};

export function evaluateThresholdSignal(stats: TDigitStat[], sample_size: number): TThresholdSignal[] {
    if (sample_size < 20) {
        return [];
    }

    const signals: TThresholdSignal[] = [];

    const getPercentage = (digit: number) => stats.find(s => s.digit === digit)?.percentage ?? 0;

    const p0 = getPercentage(0);
    const p1 = getPercentage(1);
    const p2 = getPercentage(2);
    const p7 = getPercentage(7);
    const p8 = getPercentage(8);
    const p9 = getPercentage(9);

    const over_candidates = [p0, p1, p2];
    const under_candidates = [p7, p8, p9];

    const hasOverStrong = over_candidates.every(p => p < LOW_DIGIT_THRESHOLD);
    const hasOverWeak = p0 < LOW_DIGIT_THRESHOLD && p1 < LOW_DIGIT_THRESHOLD;

    const hasUnderStrong = under_candidates.every(p => p < LOW_DIGIT_THRESHOLD);
    const hasUnderWeak = p9 < LOW_DIGIT_THRESHOLD && p8 < LOW_DIGIT_THRESHOLD;

    if (hasOverStrong) {
        signals.push({
            contract_type: 'DIGITOVER',
            barrier: 2,
            triggering_digits: [
                { digit: 0, percentage: p0 },
                { digit: 1, percentage: p1 },
                { digit: 2, percentage: p2 },
            ],
        });
    } else if (hasOverWeak) {
        signals.push({
            contract_type: 'DIGITOVER',
            barrier: 1,
            triggering_digits: [
                { digit: 0, percentage: p0 },
                { digit: 1, percentage: p1 },
            ],
        });
    }

    if (hasUnderStrong) {
        signals.push({
            contract_type: 'DIGITUNDER',
            barrier: 7,
            triggering_digits: [
                { digit: 7, percentage: p7 },
                { digit: 8, percentage: p8 },
                { digit: 9, percentage: p9 },
            ],
        });
    } else if (hasUnderWeak) {
        signals.push({
            contract_type: 'DIGITUNDER',
            barrier: 8,
            triggering_digits: [
                { digit: 8, percentage: p8 },
                { digit: 9, percentage: p9 },
            ],
        });
    }

    return signals;
}
