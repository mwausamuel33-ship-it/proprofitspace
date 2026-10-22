import { useCallback, useEffect, useMemo, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { compareSignals, DEFAULT_THRESHOLD, DestroyerSignal, evaluateDestroyer } from '@/utils/destroyer-rules';
import { getDecimalPlaces, getLastDigit } from '@/utils/digit-stats';

export type TDestroyerRow = {
    symbol: string;
    display_name: string;
    digit_pct: number[]; // % of ticks for digits 0..9
    sample: number;
    scanned_at: number;
};

export type TDestroyerSignalRow = TDestroyerRow & { signal: DestroyerSignal };

const CONCURRENCY = 16; // all Volatility markets in one go
const MIN_TICKS = 200;

const scanSymbol = async (symbol: string, display_name: string, ticks: number): Promise<TDestroyerRow | null> => {
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

/**
 * One scan of every Volatility index (Jump indices are not scanned). Returns null while the
 * connection is not ready yet. Used by the hook below and by the AI Trade engine.
 */
export const scanMarkets = async (ticks = 1000, isCancelled: () => boolean = () => false): Promise<TDestroyerRow[] | null> => {
    const markets = ((api_base?.active_symbols as any[]) || [])
        .filter(s => s.market === 'synthetic_index' && s.submarket === 'random_index')
        .map(s => ({
            symbol: (s.symbol || s.underlying_symbol) as string,
            display_name: (s.display_name || s.symbol || s.underlying_symbol) as string,
        }));

    if (!markets.length || !api_base?.api) return null;

    const result: TDestroyerRow[] = [];
    for (let i = 0; i < markets.length; i += CONCURRENCY) {
        if (isCancelled()) return result;
        const batch = markets.slice(i, i + CONCURRENCY);
        const done = await Promise.all(batch.map(m => scanSymbol(m.symbol, m.display_name, ticks)));
        done.forEach(r => r && result.push(r));
    }
    return result;
};

type TOptions = { interval_ms?: number; ticks?: number; threshold?: number; enabled?: boolean };

/**
 * Keeps scanning in the background while `enabled`, and re-evaluates the Destroyer rules when
 * `threshold` changes (no rescan needed).
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
    const [next_scan_at, setNextScanAt] = useState<number | null>(null);
    const [refresh, setRefresh] = useState(0);

    /** Scan right away instead of waiting for the countdown. */
    const scanNow = useCallback(() => setRefresh(n => n + 1), []);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const run = async () => {
            if (cancelled) return;
            setIsScanning(true);
            setNextScanAt(null);
            const result = await scanMarkets(ticks, () => cancelled);
            if (cancelled) return;
            if (!result) {
                setIsScanning(false);
                timer = setTimeout(run, 3000); // connection not ready yet, try again shortly
                return;
            }
            setRows(result);
            setLastScan(Date.now());
            setIsScanning(false);
            setNextScanAt(Date.now() + interval_ms);
            timer = setTimeout(run, interval_ms);
        };

        run();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, interval_ms, ticks, refresh]);

    const signals = useMemo<TDestroyerSignalRow[]>(() => {
        const out: TDestroyerSignalRow[] = [];
        rows.forEach(r => {
            const signal = evaluateDestroyer(r.digit_pct, threshold);
            if (signal) out.push({ ...r, signal });
        });
        return out.sort((a, b) => compareSignals(a.signal, b.signal));
    }, [rows, threshold]);

    return { rows, signals, is_scanning, last_scan, next_scan_at, scanNow };
};
