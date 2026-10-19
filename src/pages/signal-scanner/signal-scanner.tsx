import { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useDestroyerScanner } from '@/hooks/useDestroyerScanner';
import { useStore } from '@/hooks/useStore';
import { DEFAULT_THRESHOLD, DestroyerStrength, FAIR_SHARE } from '@/utils/destroyer-rules';
import { assessStake } from '@/utils/stake-guard';
import { generateDestroyerBotXml } from '@/utils/signal-bot-xml';
import { load } from '@/external/bot-skeleton';
import { Localize } from '@deriv-com/translations';
import '@/styles/pps-theme.scss';
import { AccountBadge, SessionResults, StakeGuard } from './scanner-widgets';
import './signal-scanner.scss';

const SCAN_INTERVAL_MS = 20000;
const LOSING_ZONE = [0, 1, 2, 7, 8, 9];

const STARS: Record<DestroyerStrength, number> = { strong: 3, good: 2, weak: 1 };
const STRENGTH_LABEL: Record<DestroyerStrength, string> = { strong: 'Strong', good: 'Good', weak: 'Weak' };
const STRENGTH_HINT: Record<DestroyerStrength, string> = {
    strong: `Every losing digit is below ${FAIR_SHARE}%`,
    good: `Losing digits average below ${FAIR_SHARE}%, but one is above it`,
    weak: `Below your threshold, but losing digits average ${FAIR_SHARE}% or more`,
};

type TFilter = 'all' | 'strong' | 'over' | 'under';

const Countdown = ({
    nextAt,
    scanning,
    onScanNow,
}: {
    nextAt: number | null;
    scanning: boolean;
    onScanNow: () => void;
}) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, []);

    const remaining_ms = nextAt ? Math.max(0, nextAt - now) : 0;
    const seconds = Math.ceil(remaining_ms / 1000);
    const pct = nextAt ? Math.min(100, Math.max(0, 100 - (remaining_ms / SCAN_INTERVAL_MS) * 100)) : 0;

    return (
        <div className='pps-sc__countdown'>
            <div className='pps-sc__countdown-top'>
                <span className='pps-sc__live'>
                    <i className={classNames('pps-sc__dot', { 'pps-sc__dot--busy': scanning })} />
                    {scanning ? 'Scanning markets…' : nextAt ? `Next scan in ${seconds}s` : 'Waiting for first scan…'}
                </span>
                <button className='pps-sc__scan-now' onClick={onScanNow} disabled={scanning}>
                    Scan now
                </button>
            </div>
            <div className='pps-sc__bar'>
                <div
                    className={classNames('pps-sc__bar-fill', { 'pps-sc__bar-fill--busy': scanning })}
                    style={{ width: scanning ? '100%' : `${pct}%` }}
                />
            </div>
        </div>
    );
};

const SignalScanner = observer(() => {
    const { client } = useStore();
    const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
    const [stake, setStake] = useState(1);
    const [maxRuns, setMaxRuns] = useState(3);
    const [martingale, setMartingale] = useState(2);
    const [filter, setFilter] = useState<TFilter>('all');
    const { rows, signals, is_scanning, last_scan, next_scan_at, scanNow } = useDestroyerScanner({
        threshold,
        interval_ms: SCAN_INTERVAL_MS,
    });

    const strong_count = signals.filter(s => s.signal.strength === 'strong').length;
    const visible = useMemo(
        () =>
            signals.filter(s => {
                if (filter === 'strong') return s.signal.strength === 'strong';
                if (filter === 'over') return s.signal.side === 'over';
                if (filter === 'under') return s.signal.side === 'under';
                return true;
            }),
        [signals, filter]
    );

    const formatTime = (epoch: number) =>
        new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const handleLoadAndTrade = async (row: (typeof signals)[0]) => {
        // Safety check: confirm on real accounts and when the stake looks too big for the balance.
        const is_real = client.is_logged_in && !client.is_virtual;
        const guard = assessStake(stake, martingale, Number(client.balance));
        const warnings: string[] = [];
        if (is_real) warnings.push('This is a REAL money account.');
        if (guard.level !== 'ok') warnings.push(...guard.messages);
        if (
            warnings.length &&
            !window.confirm(`${warnings.join('\n')}\n\nLoad ${row.signal.label} on ${row.display_name}?`)
        ) {
            return;
        }

        const xmlString = generateDestroyerBotXml(row.signal, {
            symbol: row.symbol,
            stake,
            maxRuns,
            martingale,
        });

        const workspace = window.Blockly?.derivWorkspace;
        if (!workspace) {
            window.location.hash = 'bot_builder';
            return;
        }

        await load({
            block_string: xmlString,
            file_name: `Destroyer - ${row.display_name} - ${row.signal.label}`,
            strategy_id: null,
            workspace,
            from: 'signal_scanner',
            drop_event: {},
            showIncompatibleStrategyDialog: false,
            show_snackbar: true,
        });

        workspace.strategy_to_load = xmlString;
        window.location.hash = 'bot_builder';
    };

    const filters: { id: TFilter; label: string; count: number }[] = [
        { id: 'all', label: 'All', count: signals.length },
        { id: 'strong', label: 'Strong', count: strong_count },
        { id: 'over', label: 'Over', count: signals.filter(s => s.signal.side === 'over').length },
        { id: 'under', label: 'Under', count: signals.filter(s => s.signal.side === 'under').length },
    ];

    return (
        <div className='pps-sc-page'>
            <div className='pps-sc'>
                <div className='pps-sc__header'>
                    <div>
                        <p className='pps-sc__eyebrow'>
                            <Localize i18n_default_text='Destroyer Scanner' />
                        </p>
                        <h2 className='pps-sc__title'>
                            <Localize i18n_default_text='Every Volatility and Jump index, scanned live' />
                        </h2>
                    </div>
                    {last_scan && <span className='pps-sc__time'>Last scan {formatTime(last_scan)}</span>}
                </div>

                <Countdown nextAt={next_scan_at} scanning={is_scanning} onScanNow={scanNow} />

                <div className='pps-sc__account'>
                    <AccountBadge />
                </div>

                <div className='pps-sc__stats'>
                    <div className='pps-sc__stat'>
                        <b>{signals.length}</b>
                        <span>Signals</span>
                    </div>
                    <div className='pps-sc__stat pps-sc__stat--good'>
                        <b>{strong_count}</b>
                        <span>Strong</span>
                    </div>
                    <div className='pps-sc__stat'>
                        <b>{rows.length}</b>
                        <span>Markets</span>
                    </div>
                </div>

                <div className='pps-sc__results'>
                    <SessionResults />
                </div>

                <div className='pps-sc__controls'>
                    <label className='pps-sc__field'>
                        <span>Threshold %</span>
                        <input
                            type='number'
                            inputMode='decimal'
                            step='0.1'
                            min='5'
                            max='15'
                            value={threshold}
                            onChange={e => setThreshold(Number(e.target.value) || DEFAULT_THRESHOLD)}
                        />
                    </label>
                    <label className='pps-sc__field'>
                        <span>Stake</span>
                        <input
                            type='number'
                            inputMode='decimal'
                            step='0.1'
                            min='0.35'
                            value={stake}
                            onChange={e => setStake(Number(e.target.value) || 1)}
                        />
                    </label>
                    <label className='pps-sc__field'>
                        <span>Martingale ×</span>
                        <input
                            type='number'
                            inputMode='decimal'
                            step='0.1'
                            min='1.1'
                            value={martingale}
                            onChange={e => setMartingale(Number(e.target.value) || 2)}
                        />
                    </label>
                    <label className='pps-sc__field'>
                        <span>Max runs</span>
                        <input
                            type='number'
                            inputMode='numeric'
                            min='1'
                            max='20'
                            value={maxRuns}
                            onChange={e => setMaxRuns(Math.max(1, Number(e.target.value) || 3))}
                        />
                    </label>
                </div>

                <StakeGuard stake={stake} martingale={martingale} />

                <div className='pps-sc__rules'>
                    <div>
                        <b>Over</b> · 0,1 low → Over 1 · 0,1,2 low → Over 2 · entry on 2, 5, 6
                    </div>
                    <div>
                        <b>Under</b> · 9,8 low → Under 8 · 9,8,7 low → Under 7 · entry on 4, 7, 9
                    </div>
                    <div>
                        <b>Rating</b> · ★★★ Strong: every losing digit under {FAIR_SHARE}% · ★★ Good: average under{' '}
                        {FAIR_SHARE}% · ★ Weak: under {threshold}% only
                    </div>
                </div>

                <div className='pps-sc__filters'>
                    {filters.map(f => (
                        <button
                            key={f.id}
                            className={classNames('pps-sc__filter', { 'pps-sc__filter--on': filter === f.id })}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label} <em>{f.count}</em>
                        </button>
                    ))}
                </div>

                {visible.length === 0 ? (
                    <div className='pps-sc__empty'>
                        {rows.length === 0
                            ? 'Waiting for tick history from the first scan…'
                            : 'No market matches right now. Try another filter, a lower threshold, or wait for the next scan.'}
                    </div>
                ) : (
                    <div className='pps-sc__list'>
                        <div className='pps-sc__row pps-sc__row--head'>
                            <span className='pps-sc__rank'>#</span>
                            <span className='pps-sc__main'>Market</span>
                            <span className='pps-sc__badgecell'>Signal</span>
                            <span className='pps-sc__rating'>Strength</span>
                            <span className='pps-sc__losing'>Losing digits</span>
                            <span className='pps-sc__entry'>Entry</span>
                            <span className='pps-sc__action' />
                        </div>
                        {visible.map((row, idx) => (
                            <div
                                key={row.symbol}
                                className={classNames('pps-sc__row', `pps-sc__row--${row.signal.strength}`)}
                            >
                                <span className='pps-sc__rank'>{idx + 1}</span>
                                <div className='pps-sc__main'>
                                    <div className='pps-sc__market'>{row.display_name}</div>
                                    <div className='pps-sc__sub'>Scanned {formatTime(row.scanned_at)}</div>
                                </div>
                                <span className='pps-sc__badgecell'>
                                    <span
                                        className={classNames('pps-sc__badge', {
                                            'pps-sc__badge--over': row.signal.side === 'over',
                                            'pps-sc__badge--under': row.signal.side === 'under',
                                        })}
                                    >
                                        {row.signal.label}
                                    </span>
                                </span>
                                <div className='pps-sc__rating' title={STRENGTH_HINT[row.signal.strength]}>
                                    <span className={`pps-sc__stars pps-sc__stars--${row.signal.strength}`}>
                                        {'★'.repeat(STARS[row.signal.strength])}
                                        <i>{'★'.repeat(3 - STARS[row.signal.strength])}</i>
                                    </span>
                                    <span className='pps-sc__rating-text'>
                                        {STRENGTH_LABEL[row.signal.strength]}
                                        <small>
                                            {Math.abs(row.signal.deviation) < 0.05
                                                ? '0.0'
                                                : `${row.signal.deviation > 0 ? '−' : '+'}${Math.abs(row.signal.deviation).toFixed(1)}`}{' '}
                                            pts
                                        </small>
                                    </span>
                                </div>
                                <div className='pps-sc__losing pps-sc__chips'>
                                    {row.signal.losingDigits.map(d => (
                                        <span
                                            key={d}
                                            className={classNames('pps-sc__chip', {
                                                'pps-sc__chip--under10': row.digit_pct[d] < FAIR_SHARE,
                                            })}
                                        >
                                            <b>{d}</b>
                                            {row.digit_pct[d].toFixed(1)}%
                                        </span>
                                    ))}
                                </div>
                                <div className='pps-sc__entry pps-sc__chips'>
                                    {row.signal.entryDigits.map(d => (
                                        <span key={d} className='pps-sc__chip pps-sc__chip--entry'>
                                            {d}
                                        </span>
                                    ))}
                                </div>
                                <div className='pps-sc__action'>
                                    <button className='pps-sc__btn' onClick={() => handleLoadAndTrade(row)}>
                                        Load &amp; Trade
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <h3 className='pps-sc__section'>All markets (last-digit %)</h3>
                <div className='pps-sc__scroll'>
                    <table className='pps-sc__table'>
                        <thead>
                            <tr>
                                <th>Market</th>
                                {Array.from({ length: 10 }, (_, d) => (
                                    <th key={d}>{d}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.symbol}>
                                    <td className='pps-sc__tmarket'>{row.display_name}</td>
                                    {row.digit_pct.map((pct, d) => (
                                        <td
                                            key={d}
                                            className={classNames('pps-sc__cell', {
                                                'pps-sc__cell--low': LOSING_ZONE.includes(d) && pct < threshold,
                                                'pps-sc__cell--strong': LOSING_ZONE.includes(d) && pct < FAIR_SHARE,
                                            })}
                                        >
                                            {pct.toFixed(1)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p className='pps-sc__note'>
                    Strength measures how far the losing digits sit below their fair 10% share in the last 1000 ticks. It
                    describes past ticks and does not change the odds of the next one. Test on a demo account first and
                    keep stake and max runs small.
                </p>
            </div>
        </div>
    );
});

export default SignalScanner;
