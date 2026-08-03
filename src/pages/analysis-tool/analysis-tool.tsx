import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import classNames from 'classnames';
import { SignalCard } from '@/components/market-analysis';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { useTickHistory } from '@/hooks/useTickHistory';
import {
    computeDigitDistribution,
    computeEvenOdd,
    getDecimalPlaces,
    getLastDigit,
    getSyntheticMarkets,
} from '@/utils/digit-stats';
import { computeDigitStats, computeEvenOddSignal, computeOverUnderSignal, TSignal } from '@/utils/signal-engine';
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

    const { prices, current_price, is_loading, error } = useTickHistory(symbol, MAX_FETCH);

    const decimals = useMemo(() => getDecimalPlaces(symbol), [symbol, markets]);

    const windowed_prices = useMemo(() => prices.slice(-ticks_window), [prices, ticks_window]);
    const digits = useMemo(
        () => windowed_prices.map(p => getLastDigit(p, decimals)),
        [windowed_prices, decimals]
    );
    const stats = useMemo(() => computeDigitStats(digits), [digits]);
    const current_digit = digits.length ? digits[digits.length - 1] : null;
    const even_odd = useMemo(() => computeEvenOdd(digits), [digits]);
    const even_count = useMemo(() => digits.filter(d => d % 2 === 0).length, [digits]);
    const _odd_count = useMemo(() => digits.length - even_count, [digits, even_count]);

    const even_odd_signal = useMemo(() => computeEvenOddSignal(digits, windowed_prices), [digits, windowed_prices]);
    const over_under_signal = useMemo(() => computeOverUnderSignal(digits, barrier, windowed_prices), [digits, barrier, windowed_prices]);

    const commitTicksWindow = () => {
        const parsed = Number(ticks_window_input);
        const clamped = Number.isFinite(parsed) ? Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, Math.round(parsed))) : ticks_window;
        setTicksWindow(clamped);
        setTicksWindowInput(String(clamped));
    };

    const handleTrade = (signal: TSignal) => {
        console.log('Trade signal:', signal);
    };

    return (
        <div className='pps-analysis-tool'>
            <div className='pps-analysis-tool__header'>
                <h2 className='pps-analysis-tool__title'>
                    <Localize i18n_default_text='AI Signal Center' />
                </h2>
                <p className='pps-analysis-tool__subtitle'>
                    <Localize i18n_default_text='Advanced market analysis with AI-powered signals' />
                </p>
            </div>

            <div className='pps-analysis-tool__controls'>
                <div className='pps-analysis-tool__control'>
                    <label className='pps-analysis-tool__label'>
                        <Localize i18n_default_text='Market' />
                    </label>
                    <select
                        className='pps-analysis-tool__select'
                        value={symbol}
                        onChange={e => setSymbol(e.target.value)}
                    >
                        {markets.map(m => (
                            <option key={m.symbol} value={m.symbol}>{m.display_name || m.symbol}</option>
                        ))}
                    </select>
                </div>
                <div className='pps-analysis-tool__control'>
                    <label className='pps-analysis-tool__label'>
                        <Localize i18n_default_text='Ticks Window' />
                    </label>
                    <input
                        className='pps-analysis-tool__input'
                        type='number'
                        min={MIN_WINDOW}
                        max={MAX_WINDOW}
                        value={ticks_window_input}
                        onChange={e => setTicksWindowInput(e.target.value)}
                        onBlur={commitTicksWindow}
                        onKeyDown={e => e.key === 'Enter' && commitTicksWindow()}
                    />
                </div>
                <div className='pps-analysis-tool__control'>
                    <label className='pps-analysis-tool__label'>
                        <Localize i18n_default_text='Over/Under Barrier' />
                    </label>
                    <select
                        className='pps-analysis-tool__select'
                        value={barrier}
                        onChange={e => setBarrier(Number(e.target.value))}
                    >
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className='pps-analysis-tool__price-bar'>
                <span className='pps-analysis-tool__price'>
                    {current_price !== null ? current_price.toFixed(decimals) : '—'}
                </span>
                <span className='pps-analysis-tool__current-digit'>{current_digit ?? '—'}</span>
            </div>

            {error && <div className='pps-analysis-tool__error'>{error}</div>}

            {is_loading && (
                <div className='pps-analysis-tool__loading'>
                    <div className='skeleton' style={{ height: '2rem', width: '200px' }} />
                </div>
            )}

            <div className='pps-analysis-tool__section'>
                <div className='pps-analysis-tool__section-header'>
                    <span>
                        <Localize i18n_default_text='Last {{count}} ticks digit distribution' values={{ count: ticks_window }} />
                    </span>
                    <span className='pps-analysis-tool__progress'>
                        {Math.min(windowed_prices.length, ticks_window)}/{ticks_window}
                    </span>
                </div>
                <div className='pps-analysis-tool__digit-grid'>
                    {stats.map(({ digit, percentage, is_hot, is_cold, streak }) => (
                        <div
                            key={digit}
                            className={classNames('pps-digit-item', {
                                'pps-digit-item--hot': is_hot,
                                'pps-digit-item--cold': is_cold,
                            })}
                        >
                            <span className='pps-digit-item__digit'>{digit}</span>
                            <span className='pps-digit-item__pct'>{percentage.toFixed(1)}%</span>
                            {streak > 0 && <span className='pps-digit-item__streak'>🔥{streak}</span>}
                        </div>
                    ))}
                </div>
            </div>

            <div className='pps-analysis-tool__section'>
                <div className='pps-analysis-tool__section-header'>
                    <span><Localize i18n_default_text='Even/Odd Balance' /></span>
                </div>
                <div className='pps-even-odd-bar'>
                    <div className='pps-even-odd-bar__fill pps-even-odd-bar__fill--even' style={{ width: `${even_odd.even_percentage || 1}%` }}>
                        <span>Even {even_odd.even_percentage.toFixed(1)}%</span>
                    </div>
                    <div className='pps-even-odd-bar__fill pps-even-odd-bar__fill--odd' style={{ width: `${even_odd.odd_percentage || 1}%` }}>
                        <span>Odd {even_odd.odd_percentage.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            <div className='pps-analysis-tool__section'>
                <div className='pps-analysis-tool__section-header'>
                    <span><Localize i18n_default_text='AI Signal Center' /></span>
                </div>
                <p className='pps-analysis-tool__disclaimer'>
                    <Localize i18n_default_text='Signals are statistical measures of digit skew, not predictions. Confidence reflects how likely the observed deviation is real rather than noise.' />
                </p>
                <div className='pps-analysis-tool__signal-grid'>
                    <SignalCard
                        title='Even/Odd'
                        market={symbol}
                        signal={even_odd_signal}
                        onTrade={handleTrade}
                    />
                    <SignalCard
                        title={`Over/Under (barrier ${barrier})`}
                        market={symbol}
                        signal={over_under_signal}
                        onTrade={handleTrade}
                    />
                </div>
            </div>
        </div>
    );
});

export default AnalysisTool;
