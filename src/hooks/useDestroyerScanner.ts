import { useEffect, useMemo, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { DEFAULT_THRESHOLD, DestroyerSignal, evaluateDestroyer } from '@/utils/destroyer-rules';
import { getDecimalPlaces, getLastDigit } from '@/utils/digit-stats';

export type TDestroyerRow = {
    symbol: string;
    display_name: string;
    digit_pct: number[]; // % of ticks for digits 0..9
    sample: number;
    scanned_at: number;
};

export type TDestroyerSignalRow = TDestroyerRow & { signal: DestroyerSignal };

const CONCURRENCY = 5;
const MIN_TICKS = 200;

type TOptions = { interval_ms?: number; ticks?: number; threshold?: number; enabled?: boolean };

/**
 * Scans every Volatility and Jump index, computes the last-digit distribution over the
 * last `ticks` ticks, and applies the Destroyer rules. Changing `threshold` re-evaluates
 * instantly without a rescan.
 */
export const useDestroyerScanner = ({
    interval_ms = 20000,
    ticks = 1000,
    threshold = DEFAULT_THRESHOLD,
    enabled = true,
}: TOptions = {}) => {
    const [rows, setRows] = useState<TDestroyerRow[]>([]);
    const [is_scanning, setIsScanning] = useState(false);
    const [last_scan, setLastScan] = useState<number | null>(null);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const scanSymbol = async (symbol: string, display_name: string): Promise<TDestroyerRow | null> => {
            try {
                const response: any = await (api_base.api as any).send({
                    ticks_history: symbol,
                    count: ticks,
                    end: 'latest',
                    style: 'ticks',
                });
                if (response?.error) return null;
                const prices: number[] = (response?.history?.prices || []).map((p: string) => Number(p));
                if (prices.length < MIN_TICKS) return null;
                const decimals = getDecimalPlaces(symbol);
                const counts = new Array(10).fill(0);
                prices.forEach(p => {
                    const d = getLastDigit(p, decimals);
                    if (d >= 0 && d <= 9) counts[d]++;
                });
                const total = prices.length;
                return {
                    symbol,
                    display_name,
                    digit_pct: counts.map(c => (c / total) * 100),
                    sample: total,
                    scanned_at: Date.now(),
                };
            } catch {
                return null;
            }
        };

        const run = async () => {
            if (cancelled) return;
            const markets = ((api_base?.active_symbols as any[]) || [])
                .filter(s => s.market === 'synthetic_index' && (s.submarket === 'random_index' || s.submarket === 'jump_index'))
                .map(s => ({
                    symbol: (s.symbol || s.underlying_symbol) as string,
                    display_name: (s.display_name || s.symbol) as string,
                }));

            if (!markets.length || !api_base?.api) {
                timer = setTimeout(run, 3000); // connection not ready yet, try again shortly
                return;
            }

            setIsScanning(true);
            const result: TDestroyerRow[] = [];
            for (let i = 0; i < markets.length; i += CONCURRENCY) {
                if (cancelled) return;
                const batch = markets.slice(i, i + CONCURRENCY);
                const done = await Promise.all(batch.map(m => scanSymbol(m.symbol, m.display_name)));
                done.forEach(r => r && result.push(r));
            }
            if (cancelled) return;
            setRows(result);
            setLastScan(Date.now());
            setIsScanning(false);
            timer = setTimeout(run, interval_ms);
        };

        run();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, interval_ms, ticks]);

    const signals = useMemo<TDestroyerSignalRow[]>(() => {
        const out: TDestroyerSignalRow[] = [];
        rows.forEach(r => {
            const signal = evaluateDestroyer(r.digit_pct, threshold);
            if (signal) out.push({ ...r, signal });
        });
        return out.sort((a, b) => a.signal.avgLosingPct - b.signal.avgLosingPct);
    }, [rows, threshold]);

    return { rows, signals, is_scanning, last_scan };
};
