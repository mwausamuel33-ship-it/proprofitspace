import { useEffect, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';

const MAX_HISTORY = 5000;

type TUseTickHistoryResult = {
    prices: number[];
    current_price: number | null;
    is_loading: boolean;
    error: string | null;
};

/**
 * Subscribes to live ticks for a symbol and keeps a rolling window of prices.
 * Cleans up its own subscription (by id) on symbol change / unmount so it never
 * disturbs other consumers of the shared websocket connection (e.g. a running bot).
 */
export const useTickHistory = (symbol: string, count = 1000): TUseTickHistoryResult => {
    const [prices, setPrices] = useState<number[]>([]);
    const [is_loading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const subscription_id_ref = useRef<string | null>(null);
    const message_sub_ref = useRef<{ unsubscribe: () => void } | null>(null);
    const symbol_ref = useRef(symbol);

    useEffect(() => {
        symbol_ref.current = symbol;
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        setPrices([]);

        const cleanup = async () => {
            if (message_sub_ref.current) {
                message_sub_ref.current.unsubscribe();
                message_sub_ref.current = null;
            }
            const id = subscription_id_ref.current;
            subscription_id_ref.current = null;
            if (id && api_base?.api) {
                try {
                    // api-base.ts types `send` as returning void, but it resolves a Promise at
                    // runtime (see ticks_service.js) — cast is required to use the real behaviour.
                    await (api_base.api as any).send({ forget: id });
                } catch {
                    // subscription may already be gone — safe to ignore
                }
            }
        };

        const start = async () => {
            await cleanup();
            if (!symbol || !api_base?.api) {
                setIsLoading(false);
                setError(!symbol ? null : 'Not connected to Deriv API');
                return;
            }
            try {
                const response: any = await (api_base.api as any).send({
                    ticks_history: symbol,
                    adjust_start_time: 1,
                    count,
                    end: 'latest',
                    style: 'ticks',
                    subscribe: 1,
                });
                if (cancelled || symbol_ref.current !== symbol) return;

                if (response?.error) {
                    setError(response.error.message || 'Unable to load tick history');
                    setIsLoading(false);
                    return;
                }

                const history_prices: string[] = response?.history?.prices || [];
                setPrices(history_prices.map((p: string) => Number(p)));
                if (response?.subscription?.id) {
                    subscription_id_ref.current = response.subscription.id;
                }
                setIsLoading(false);

                message_sub_ref.current = api_base.api.onMessage().subscribe(({ data }: any) => {
                    if (cancelled || symbol_ref.current !== symbol) return;
                    if (data?.msg_type === 'tick' && data?.tick?.symbol === symbol) {
                        if (data.tick?.id) subscription_id_ref.current = data.tick.id;
                        const quote = Number(data.tick.quote);
                        setPrices(prev => {
                            const next = [...prev, quote];
                            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
                        });
                    }
                });
            } catch (e: any) {
                if (!cancelled) {
                    setError(e?.message || 'Unable to subscribe to ticks');
                    setIsLoading(false);
                }
            }
        };

        start();

        return () => {
            cancelled = true;
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, count]);

    return {
        prices,
        current_price: prices.length ? prices[prices.length - 1] : null,
        is_loading,
        error,
    };
};
