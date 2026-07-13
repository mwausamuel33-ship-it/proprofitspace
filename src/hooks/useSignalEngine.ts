import { useEffect, useState } from 'react';
import { computeEvenOddSignal, computeOverUnderSignal, MIN_SAMPLE, TSignal } from '@/utils/signal-engine';

/** How many consecutive ticks a signal must hold its direction before it's "active" (not just forming). */
const STABILITY_TICKS = 5;
/** How many recent inter-tick gaps to average for the "next tick in ~Xs" estimate. */
const INTERVAL_SAMPLE = 20;

export type TSignalStatus = 'collecting' | 'forming' | 'active';

export type TTrackedSignal = TSignal & {
    status: TSignalStatus;
    stable_ticks: number;
};

type TMeta = { contract_type: string; stable_ticks: number };

/**
 * Digit contracts (Even/Odd, Over/Under) settle on the very next tick — there is no
 * multi-second "entry window" to count down. What IS honest and useful is: (a) how
 * many consecutive ticks a signal has held, so a trader can see it's not flickering,
 * and (b) a real estimate of when the next tick will land, from actual tick timestamps
 * — not a made-up countdown.
 */
export const useSignalEngine = (digits: number[], times: number[], barrier: number) => {
    const even_odd_signal = computeEvenOddSignal(digits);
    const over_under_signal = computeOverUnderSignal(digits, barrier);

    const [even_odd_meta, setEvenOddMeta] = useState<TMeta>({ contract_type: '', stable_ticks: 0 });
    const [over_under_meta, setOverUnderMeta] = useState<TMeta>({ contract_type: '', stable_ticks: 0 });

    // `digits` gets a new array reference on every incoming tick (sliding window), so this
    // effect fires once per tick — which is exactly the cadence we need to count "consecutive
    // ticks holding the same direction".
    useEffect(() => {
        setEvenOddMeta(prev =>
            prev.contract_type === even_odd_signal.contract_type
                ? { ...prev, stable_ticks: prev.stable_ticks + 1 }
                : { contract_type: even_odd_signal.contract_type, stable_ticks: 1 }
        );
        setOverUnderMeta(prev =>
            prev.contract_type === over_under_signal.contract_type
                ? { ...prev, stable_ticks: prev.stable_ticks + 1 }
                : { contract_type: over_under_signal.contract_type, stable_ticks: 1 }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digits]);

    const attachStatus = (signal: TSignal, meta: TMeta): TTrackedSignal => {
        let status: TSignalStatus = 'collecting';
        if (signal.sample_size >= MIN_SAMPLE) {
            status = meta.stable_ticks >= STABILITY_TICKS ? 'active' : 'forming';
        }
        return { ...signal, status, stable_ticks: meta.stable_ticks };
    };

    // Real average inter-tick gap from actual timestamps, not a guess.
    const recent_times = times.slice(-INTERVAL_SAMPLE);
    let avg_interval_seconds: number | null = null;
    if (recent_times.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < recent_times.length; i++) {
            gaps.push(recent_times[i] - recent_times[i - 1]);
        }
        const avg = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
        avg_interval_seconds = avg > 0 ? Number(avg.toFixed(1)) : null;
    }

    return {
        even_odd: attachStatus(even_odd_signal, even_odd_meta),
        over_under: attachStatus(over_under_signal, over_under_meta),
        avg_interval_seconds,
    };
};
