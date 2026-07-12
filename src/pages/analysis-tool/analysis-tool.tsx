import { useEffect, useMemo, useState } from 'react';
import { DigitCircles, EvenOddBars, MarketSelect } from '@/components/market-analysis';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
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
import { Localize } from '@deriv-com/translations';
import './analysis-tool.scss';

const MAX_FETCH = 5000;
const MIN_WINDOW = 50;
const MAX_WINDOW = 5000;

const AnalysisTool = () => {
    const { connectionStatus } = useApiBase();
    const [markets, setMarkets] = useState<{ symbol: string; display_name: string }[]>([]);
    const [symbol, setSymbol] = useState('');
    const [ticks_window_input, setTicksWindowInput] = useState('1000');
    const [ticks_window, setTicksWindow] = useState(1000);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            const list = getSyntheticMarkets();
            if (list.length) {
                setMarkets(list);
                setSymbol(prev => prev || list[0].symbol);
            }
        }
    }, [connectionStatus]);

    const { prices, current_price, is_loading, error } = useTickHistory(symbol, MAX_FETCH);

    const decimals = useMemo(() => getDecimalPlaces(symbol), [symbol, markets]);

    const windowed_prices = useMemo(() => prices.slice(-ticks_window), [prices, ticks_window]);
    const digits = useMemo(
        () => windowed_prices.map(p => getLastDigit(p, decimals)),
        [windowed_prices, decimals]
    );
    const stats = useMemo(() => computeDigitDistribution(digits), [digits]);
    const most_frequent_digit = useMemo(() => getMostFrequentDigit(stats), [stats]);
    const least_frequent_digit = useMemo(() => getLeastFrequentDigit(stats), [stats]);
    const current_digit = digits.length ? digits[digits.length - 1] : null;
    const even_odd = useMemo(() => computeEvenOdd(digits), [digits]);

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

            {is_loading && <div className='analysis-tool__loading'><Localize i18n_default_text='Loading ticks…' /></div>}
        </div>
    );
};

export default AnalysisTool;
