import { useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { computeEvenOddSignal, MIN_SAMPLE } from '@/utils/signal-engine';
import { computeDigitDistribution, getDecimalPlaces, getLastDigit } from '@/utils/digit-stats';
import { evaluateThresholdSignal } from '@/utils/digit-threshold-rules';

type TScannerSignal = {
    symbol: string;
    display_name: string;
    contract_type: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';
    barrier: number | null;
    label: string;
    confidence: number;
    triggering_digits?: { digit: number; percentage: number }[];
    detected_at: number;
};

type TScanResult = {
    symbol: string;
    signals: TScannerSignal[];
};

const DEFAULT_INTERVAL_MS = 25000;
const CONCURRENCY = 5;
const HISTORY_COUNT = 300;

export const useMultiMarketScanner = (
    options: { interval_ms?: number; enabled?: boolean } = {}
): { signals: TScannerSignal[]; is_scanning: boolean; last_scan: number | null; error: string | null } => {
    const { interval_ms = DEFAULT_INTERVAL_MS, enabled = true } = options;
    const [signals, setSignals] = useState<TScannerSignal[]>([]);
    const [is_scanning, setIsScanning] = useState(false);
    const [last_scan, setLastScan] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abort_ref = useRef(false);
    const cache_ref = useRef<Map<string, { prices: number[]; times: number[]; ts: number }>>(new Map());
    const CACHE_TTL = interval_ms * 1.5;

    const getDecimalPlacesLocal = (symbol: string) => getDecimalPlaces(symbol);

    const scanMarket = async (symbol: string): Promise<TScanResult> => {
        const cached = cache_ref.current.get(symbol);
        const now = Date.now();
        if (cached && now - cached.ts < CACHE_TTL) {
            return evaluateMarket(symbol, cached.prices, cached.times);
        }

        if (!api_base?.api) {
            return { symbol, signals: [] };
        }

        try {
            const response: any = await (api_base.api as any).send({
                ticks_history: symbol,
                count: HISTORY_COUNT,
                end: 'latest',
                style: 'ticks',
            });

            if (response?.error) {
                return { symbol, signals: [] };
            }

            const history_prices: string[] = response?.history?.prices || [];
            const history_times: (string | number)[] = response?.history?.times || [];
            const prices = history_prices.map((p: string) => Number(p));
            const times = history_times.map((t: string | number) => Number(t));

            if (prices.length > 0) {
                cache_ref.current.set(symbol, { prices, times, ts: now });
            }

            return evaluateMarket(symbol, prices, times);
        } catch {
            return { symbol, signals: [] };
        }
    };

    const evaluateMarket = (symbol: string, prices: number[], times: number[]): TScanResult => {
        const decimals = getDecimalPlacesLocal(symbol);
        const digits = prices.map(p => getLastDigit(p, decimals));
        const sample_size = digits.length;

        if (sample_size < MIN_SAMPLE) {
            return { symbol, signals: [] };
        }

        const stats = computeDigitDistribution(digits);
        const threshold_signals = evaluateThresholdSignal(stats, sample_size);
        const threshold_results: TScannerSignal[] = threshold_signals.map(sig => ({
            symbol,
            display_name: '',
            contract_type: sig.contract_type,
            barrier: sig.barrier,
            label: `${sig.contract_type === 'DIGITOVER' ? 'Over' : 'Under'} ${sig.barrier}`,
            confidence: 100,
            triggering_digits: sig.triggering_digits,
            detected_at: Date.now(),
        }));

        const even_odd_signal = computeEvenOddSignal(digits);
        const even_odd_results: TScannerSignal[] = [];

        if (even_odd_signal.sample_size >= MIN_SAMPLE && even_odd_signal.confidence >= 70) {
            even_odd_results.push({
                symbol,
                display_name: '',
                contract_type: even_odd_signal.contract_type,
                barrier: null,
                label: even_odd_signal.label,
                confidence: even_odd_signal.confidence,
                detected_at: Date.now(),
            });
        }

        return { symbol, signals: [...threshold_results, ...even_odd_results] };
    };

    const runScan = async () => {
        if (!enabled || !api_base?.active_symbols) return;
        setError(null);

        const markets = api_base.active_symbols
            .filter((s: any) => s.market === 'synthetic_index' && (s.submarket === 'random_index' || s.submarket === 'jump_index'))
            .map((s: any) => ({
                symbol: s.symbol || s.underlying_symbol,
                display_name: s.display_name || s.symbol,
            }));

        if (markets.length === 0) return;

        setIsScanning(true);

        const results: TScanResult[] = [];
        for (let i = 0; i < markets.length; i += CONCURRENCY) {
            if (abort_ref.current) break;
            const batch = markets.slice(i, i + CONCURRENCY);
            const batch_results = await Promise.all(batch.map(m => scanMarket(m.symbol)));
            results.push(...batch_results);
        }

        if (!abort_ref.current) {
            const all_signals: TScannerSignal[] = [];
            results.forEach(r => {
                const market = markets.find(m => m.symbol === r.symbol);
                r.signals.forEach(sig => {
                    all_signals.push({
                        ...sig,
                        display_name: market?.display_name || sig.symbol,
                    });
                });
            });
            setSignals(all_signals);
            setLastScan(Date.now());
        }

        setIsScanning(false);
    };

    useEffect(() => {
        abort_ref.current = false;
        if (enabled) {
            runScan();
        }

        return () => {
            abort_ref.current = true;
            if (timer_ref.current) {
                clearTimeout(timer_ref.current);
                timer_ref.current = null;
            }
        };
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            if (timer_ref.current) {
                clearTimeout(timer_ref.current);
                timer_ref.current = null;
            }
            return;
        }

        const scheduleNext = () => {
            if (abort_ref.current) return;
            timer_ref.current = setTimeout(() => {
                runScan();
                scheduleNext();
            }, interval_ms);
        };

        scheduleNext();

        return () => {
            if (timer_ref.current) {
                clearTimeout(timer_ref.current);
                timer_ref.current = null;
            }
        };
    }, [enabled, interval_ms]);

    return { signals, is_scanning, last_scan, error };
};
