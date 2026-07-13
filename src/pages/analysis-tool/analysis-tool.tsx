import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DigitCircles, EvenOddBars, MarketSelect, SignalCard } from '@/components/market-analysis';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import { useSignalEngine } from '@/hooks/useSignalEngine';
import { useStore } from '@/hooks/useStore';
import { useTickHistory } from '@/hooks/useTickHistory';
import {
    computeDigitDistribution,
    computeEvenOdd,
    getDecimalPlaces,
    getLastDigit,
    getLeastFrequentDigit,
    getMostFrequentDigit,
    getSyntheticMarkets,
} from '@/utils/digit-stats';
import { suggestStake } from '@/utils/signal-engine';
import { Localize } from '@deriv-com/translations';
import './analysis-tool.scss';

const MAX_FETCH = 5000;
const MIN_WINDOW = 50;
const MAX_WINDOW = 5000;

const AnalysisTool = observer(() => {
    const { connectionStatus } = useApiBase();
    const { client } = useStore() ?? {};
    const [markets, setMarkets] = useState<{ symbol: string; display_name: string }[]>([]);
    const [symbol, setSymbol] = useState('');
    const [ticks_window_input, setTicksWindowInput] = useState('1000');
    const [ticks_window, setTicksWindow] = useState(1000);
    const [barrier, setBarrier] = useState(5);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            const list = getSyntheticMarkets();
            if (list.length) {
                setMarkets(list);
                setSymbol(prev => prev || list[0].symbol);
            }
        }
    }, [connectionStatus]);

    const { prices, times, current_price, is_loading, error } = useTickHistory(symbol, MAX_FETCH);

    const decimals = useMemo(() => getDecimalPlaces(symbol), [symbol, markets]);

    const windowed_prices = useMemo(() => prices.slice(-ticks_window), [prices, ticks_window]);
    const windowed_times = useMemo(() => times.slice(-ticks_window), [times, ticks_window]);
    const digits = useMemo(
        () => windowed_prices.map(p => getLastDigit(p, decimals)),
        [windowed_prices, decimals]
    );
    const stats = useMemo(() => computeDigitDistribution(digits), [digits]);
    const most_frequent_digit = useMemo(() => getMostFrequentDigit(stats), [stats]);
    const least_frequent_digit = useMemo(() => getLeastFrequentDigit(stats), [stats]);
    const current_digit = digits.length ? digits[digits.length - 1] : null;
    const even_odd = useMemo(() => computeEvenOdd(digits), [digits]);

    const { even_odd: even_odd_signal, over_under: over_under_signal, avg_interval_seconds } = useSignalEngine(
        digits,
        windowed_times,
        barrier
    );
    const balance = Number(client?.balance) || 0;
    const currency = client?.currency || '';

    const commitTicksWindow = () => {
        const parsed = Number(ticks_window_input);
        const clamped = Number.isFinite(parsed) ? Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, Math.round(parsed))) : ticks_window;
        setTicksWindow(clamped);
        setTicksWindowInput(String(clamped));
    };

    return (
        <div className='analysis-tool'>
            <MarketSelect markets={markets} value={symbol} onChange={setSymbol} />

            <div className='analysis-tool__price-bar'>
                <span className='analysis-tool__price'>
                    {current_price !== null ? current_price.toFixed(decimals) : '—'}
                </span>
                <span className='analysis-tool__current-digit'>{current_digit ?? '—'}</span>
            </div>

            <div className='analysis-tool__window-row'>
                <label className='analysis-tool__window-label'>
                    <Localize i18n_default_text='Ticks window:' />
                </label>
                <input
                    className='analysis-tool__window-input'
                    type='number'
                    min={MIN_WINDOW}
                    max={MAX_WINDOW}
                    value={ticks_window_input}
                    onChange={e => setTicksWindowInput(e.target.value)}
                    onBlur={commitTicksWindow}
                    onKeyDown={e => e.key === 'Enter' && commitTicksWindow()}
                />
                <span className='analysis-tool__window-hint'>({MIN_WINDOW}–{MAX_WINDOW})</span>
            </div>

            {error && <div className='analysis-tool__error'>{error}</div>}

            <div className='analysis-tool__section'>
                <div className='analysis-tool__section-header'>
                    <span>
                        <Localize
                            i18n_default_text='Last {{count}} ticks digit distribution'
                            values={{ count: ticks_window }}
                        />
                    </span>
                    <span className='analysis-tool__progress'>
                        {Math.min(windowed_prices.length, ticks_window)}/{ticks_window}
                    </span>
                </div>
                <DigitCircles
                    stats={stats}
                    current_digit={current_digit}
                    most_frequent_digit={most_frequent_digit}
                    least_frequent_digit={least_frequent_digit}
                />
            </div>

            <div className='analysis-tool__section'>
                <div className='analysis-tool__section-header'>
                    <span>
                        <Localize i18n_default_text='Even/Odd' />
                    </span>
                </div>
                <EvenOddBars even_percentage={even_odd.even_percentage} odd_percentage={even_odd.odd_percentage} />
            </div>

            <div className='analysis-tool__section'>
                <div className='analysis-tool__section-header'>
                    <span>
                        <Localize i18n_default_text='AI Signal Center' />
                    </span>
                    <label className='analysis-tool__barrier-picker'>
                        <Localize i18n_default_text='Over/Under barrier:' />
                        <select
                            className='analysis-tool__barrier-select'
                            value={barrier}
                            onChange={e => setBarrier(Number(e.target.value))}
                        >
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <p className='analysis-tool__disclaimer'>
                    <Localize i18n_default_text='Signals are statistical measures of digit skew, not predictions. Confidence reflects how likely the observed deviation is real rather than noise.' />
                </p>
                <div className='analysis-tool__signal-grid'>
                    <SignalCard
                        title='Even/Odd'
                        signal={even_odd_signal}
                        suggested_stake={suggestStake(balance, even_odd_signal.risk_level)}
                        currency={currency}
                        avg_interval_seconds={avg_interval_seconds}
                    />
                    <SignalCard
                        title={`Over/Under (barrier ${barrier})`}
                        signal={over_under_signal}
                        suggested_stake={suggestStake(balance, over_under_signal.risk_level)}
                        currency={currency}
                        avg_interval_seconds={avg_interval_seconds}
                    />
                </div>
            </div>

            {is_loading && <div className='analysis-tool__loading'><Localize i18n_default_text='Loading ticks…' /></div>}
        </div>
    );
});

export default AnalysisTool;
