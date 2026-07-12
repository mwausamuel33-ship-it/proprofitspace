import { useEffect, useMemo, useState } from 'react';
import { DigitGauges, EvenOddBars, MarketSelect } from '@/components/market-analysis';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import { useTickHistory } from '@/hooks/useTickHistory';
import {
    computeDigitDistribution,
    computeEvenOdd,
    getDecimalPlaces,
    getLastDigit,
    getSyntheticMarkets,
} from '@/utils/digit-stats';
import { Localize, localize } from '@deriv-com/translations';
import './bulk-trader.scss';

const MAX_FETCH = 5000;
const MIN_WINDOW = 50;
const MAX_WINDOW = 5000;
const MAX_TRADES = 25;
const RESULT_HISTORY_LENGTH = 8;

type TStatus = { type: 'success' | 'error' | 'info'; message: string } | null;

const BulkTrader = () => {
    const { connectionStatus, isAuthorized, authData } = useApiBase();
    const [markets, setMarkets] = useState<{ symbol: string; display_name: string }[]>([]);
    const [symbol, setSymbol] = useState('');
    const [ticks_window_input, setTicksWindowInput] = useState('1000');
    const [ticks_window, setTicksWindow] = useState(1000);
    const [ticks_per_trade, setTicksPerTrade] = useState('1');
    const [stake, setStake] = useState('0.5');
    const [no_of_trades, setNoOfTrades] = useState('1');
    const [status, setStatus] = useState<TStatus>(null);
    const [is_submitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            const list = getSyntheticMarkets();
            if (list.length) {
                setMarkets(list);
                setSymbol(prev => prev || list[0].symbol);
            }
        }
    }, [connectionStatus]);

    const { prices, current_price, error } = useTickHistory(symbol, MAX_FETCH);
    const decimals = useMemo(() => getDecimalPlaces(symbol), [symbol, markets]);
    const windowed_prices = useMemo(() => prices.slice(-ticks_window), [prices, ticks_window]);
    const digits = useMemo(() => windowed_prices.map(p => getLastDigit(p, decimals)), [windowed_prices, decimals]);
    const stats = useMemo(() => computeDigitDistribution(digits), [digits]);
    const current_digit = digits.length ? digits[digits.length - 1] : null;
    const even_odd = useMemo(() => computeEvenOdd(digits), [digits]);
    const recent_results = useMemo(
        () => digits.slice(-RESULT_HISTORY_LENGTH).map(d => (d % 2 === 0 ? 'E' : 'O')),
        [digits]
    );

    const commitTicksWindow = () => {
        const parsed = Number(ticks_window_input);
        const clamped = Number.isFinite(parsed)
            ? Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, Math.round(parsed)))
            : ticks_window;
        setTicksWindow(clamped);
        setTicksWindowInput(String(clamped));
    };

    const placeTrade = async (contract_type: 'DIGITEVEN' | 'DIGITODD') => {
        if (!api_base?.api) {
            setStatus({ type: 'error', message: localize('Not connected to Deriv API.') });
            return;
        }
        if (!isAuthorized) {
            setStatus({ type: 'error', message: localize('Please log in to place real trades.') });
            return;
        }

        const amount = Number(stake);
        const duration = Math.max(1, Math.round(Number(ticks_per_trade) || 1));
        const trade_count = Math.min(MAX_TRADES, Math.max(1, Math.round(Number(no_of_trades) || 1)));
        const currency = authData?.currency || 'USD';

        if (!Number.isFinite(amount) || amount <= 0) {
            setStatus({ type: 'error', message: localize('Enter a valid stake amount.') });
            return;
        }

        const confirmed = window.confirm(
            localize('This will place {{count}} real {{type}} trade(s) of {{amount}} {{currency}} each on {{symbol}}. Continue?', {
                count: trade_count,
                type: contract_type === 'DIGITEVEN' ? 'Even' : 'Odd',
                amount,
                currency,
                symbol,
            })
        );
        if (!confirmed) return;

        setIsSubmitting(true);
        setStatus({ type: 'info', message: localize('Placing trade(s)…') });

        let succeeded = 0;
        let last_error = '';

        for (let i = 0; i < trade_count; i += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                // api-base.ts types `send` as returning void, but it resolves a Promise at
                // runtime (see ticks_service.js) — cast is required to use the real behaviour.
                const proposal: any = await (api_base.api as any).send({
                    proposal: 1,
                    amount,
                    basis: 'stake',
                    contract_type,
                    currency,
                    duration,
                    duration_unit: 't',
                    symbol,
                });
                if (proposal?.error) {
                    last_error = proposal.error.message;
                    continue; // eslint-disable-line no-continue
                }
                // eslint-disable-next-line no-await-in-loop
                const buy: any = await (api_base.api as any).send({
                    buy: proposal.proposal.id,
                    price: proposal.proposal.ask_price,
                });
                if (buy?.error) {
                    last_error = buy.error.message;
                } else {
                    succeeded += 1;
                }
            } catch (e: any) {
                last_error = e?.message || 'Unknown error';
            }
        }

        setIsSubmitting(false);
        if (succeeded === trade_count) {
            setStatus({ type: 'success', message: localize('{{count}} trade(s) placed successfully.', { count: succeeded }) });
        } else if (succeeded > 0) {
            setStatus({
                type: 'error',
                message: localize('{{succeeded}}/{{total}} trade(s) placed. Last error: {{error}}', {
                    succeeded,
                    total: trade_count,
                    error: last_error,
                }),
            });
        } else {
            setStatus({ type: 'error', message: last_error || localize('Failed to place trade(s).') });
        }
    };

    return (
        <div className='bulk-trader'>
            <div className='bulk-trader__row'>
                <MarketSelect markets={markets} value={symbol} onChange={setSymbol} label={localize('Market')} />
                <div className='bulk-trader__trade-type'>
                    <label className='bulk-trader__label'>{localize('Trade Type')}</label>
                    <div className='bulk-trader__static-select'>Even/Odd</div>
                </div>
            </div>

            <div className='bulk-trader__field'>
                <label className='bulk-trader__label'>{localize('Number of Ticks')}</label>
                <input
                    className='bulk-trader__input'
                    type='number'
                    min={MIN_WINDOW}
                    max={MAX_WINDOW}
                    value={ticks_window_input}
                    onChange={e => setTicksWindowInput(e.target.value)}
                    onBlur={commitTicksWindow}
                    onKeyDown={e => e.key === 'Enter' && commitTicksWindow()}
                />
            </div>

            <div className='bulk-trader__current-tick'>
                <span className='bulk-trader__current-tick-label'>{localize('Current Tick')}</span>
                <span className='bulk-trader__current-tick-value'>
                    {current_price !== null ? current_price.toFixed(decimals) : '—'}
                </span>
            </div>

            <DigitGauges stats={stats} current_digit={current_digit} />

            <div className='bulk-trader__history'>
                {recent_results.map((r, i) => (
                    <span
                        key={i}
                        className={`bulk-trader__history-badge bulk-trader__history-badge--${r === 'E' ? 'even' : 'odd'}`}
                    >
                        {r}
                    </span>
                ))}
            </div>

            <div className='bulk-trader__row'>
                <div className='bulk-trader__field'>
                    <label className='bulk-trader__label'>{localize('Ticks')}</label>
                    <input
                        className='bulk-trader__input'
                        type='number'
                        min={1}
                        value={ticks_per_trade}
                        onChange={e => setTicksPerTrade(e.target.value)}
                    />
                </div>
                <div className='bulk-trader__field'>
                    <label className='bulk-trader__label'>{localize('Stake')}</label>
                    <input
                        className='bulk-trader__input'
                        type='number'
                        min={0}
                        step='0.01'
                        value={stake}
                        onChange={e => setStake(e.target.value)}
                    />
                </div>
                <div className='bulk-trader__field'>
                    <label className='bulk-trader__label'>{localize('No of Trades')}</label>
                    <input
                        className='bulk-trader__input'
                        type='number'
                        min={1}
                        max={MAX_TRADES}
                        value={no_of_trades}
                        onChange={e => setNoOfTrades(e.target.value)}
                    />
                </div>
            </div>

            <EvenOddBars even_percentage={even_odd.even_percentage} odd_percentage={even_odd.odd_percentage} />

            <div className='bulk-trader__actions'>
                <button
                    className='bulk-trader__action bulk-trader__action--even'
                    disabled={is_submitting || !symbol}
                    onClick={() => placeTrade('DIGITEVEN')}
                >
                    {localize('Even')} — {even_odd.even_percentage.toFixed(2)}%
                </button>
                <button
                    className='bulk-trader__action bulk-trader__action--odd'
                    disabled={is_submitting || !symbol}
                    onClick={() => placeTrade('DIGITODD')}
                >
                    {localize('Odd')} — {even_odd.odd_percentage.toFixed(2)}%
                </button>
            </div>

            {!isAuthorized && (
                <div className='bulk-trader__notice'>
                    <Localize i18n_default_text='Log in to place real trades. You can still use the live stats above without an account.' />
                </div>
            )}

            {status && <div className={`bulk-trader__status bulk-trader__status--${status.type}`}>{status.message}</div>}
            {error && <div className='bulk-trader__status bulk-trader__status--error'>{error}</div>}
        </div>
    );
};

export default BulkTrader;
