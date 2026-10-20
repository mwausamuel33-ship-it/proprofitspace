import { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DEFAULT_AUTO_CONFIG, TAutoConfig, TMode, useAutoTrader } from '@/hooks/useAutoTrader';
import { AccountBadge } from '@/pages/signal-scanner/scanner-widgets';
import {
    evenOddRuns,
    pickBestSignal,
    pickDiffers,
    pickEvenOdd,
    pickEvenOddRecovery,
    pickMatches,
    pickOver,
    pickRecovery,
} from '@/utils/autopilot-rules';
import { DestroyerStrength } from '@/utils/destroyer-rules';
import '@/styles/pps-theme.scss';
import './auto-trader.scss';

const STARS: Record<DestroyerStrength, string> = { strong: '★★★', good: '★★', weak: '★' };

const TABS: { id: TMode; label: string }[] = [
    { id: 'smartscan', label: 'SmartScan' },
    { id: 'evenodd', label: 'Even/Odd' },
    { id: 'matches', label: 'Matches' },
    { id: 'autopilot', label: 'Autopilot' },
];

const Field = ({
    label,
    value,
    onChange,
    step = 1,
    min = 0,
    disabled,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    step?: number;
    min?: number;
    disabled?: boolean;
}) => (
    <label className='pps-ai__field'>
        <span>{label}</span>
        <input
            type='number'
            inputMode='decimal'
            step={step}
            min={min}
            value={value}
            disabled={disabled}
            onChange={e => onChange(Number(e.target.value))}
        />
    </label>
);

const AutoTrader = observer(() => {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<TMode>('smartscan');
    const [cfg, setCfg] = useState<TAutoConfig>(DEFAULT_AUTO_CONFIG);
    const t = useAutoTrader(cfg, open);

    const running = t.status !== 'idle';
    const set = <K extends keyof TAutoConfig>(k: K, v: TAutoConfig[K]) => setCfg(c => ({ ...c, [k]: v }));
    const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
    const time = (e: number) => new Date(e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // live previews from the latest background scan
    const rows = t.scan.rows;
    const best = pickBestSignal(rows, cfg.threshold, cfg.minStrength);
    const evenOdd = pickEvenOdd(rows);
    const matches = pickMatches(rows, cfg.maxGap);
    const recoveryEO = pickEvenOddRecovery(rows);
    const differs = pickDiffers(rows);
    const over1 = pickOver(rows, 1, cfg.threshold);
    const over2 = pickOver(rows, 2, cfg.threshold);
    const recoveryOver = pickRecovery(rows, cfg.threshold);

    const recoveryLine = recoveryEO
        ? `${recoveryEO.side === 'even' ? 'Even' : 'Odd'} · ${recoveryEO.display_name}${recoveryEO.strict ? '' : ' (best lean)'}`
        : 'Scanning…';

    return (
        <div className='pps-ai'>
            {open && (
                <div className='pps-ai__panel' role='dialog' aria-label='AI Trade'>
                    <div className='pps-ai__head'>
                        <div>
                            <b>AI Trade</b>
                            <span>Scans once, then trades until a loss</span>
                        </div>
                        <button className='pps-ai__x' onClick={() => setOpen(false)} aria-label='Close'>
                            ×
                        </button>
                    </div>

                    <AccountBadge />

                    <div className='pps-ai__tabs'>
                        {TABS.map(x => (
                            <button
                                key={x.id}
                                className={classNames('pps-ai__tab', { 'pps-ai__tab--on': tab === x.id })}
                                onClick={() => setTab(x.id)}
                                disabled={running}
                            >
                                {x.label}
                            </button>
                        ))}
                    </div>

                    {tab === 'smartscan' && (
                        <div className='pps-ai__body'>
                            <p className='pps-ai__desc'>
                                Scans once, picks the best Over/Under signal and trades it on every tick. After a loss it
                                recovers on the same market, and only then scans again and switches to the best market.
                            </p>
                            <div className='pps-ai__preview'>
                                <span>Best signal now</span>
                                {best ? (
                                    <b>
                                        {best.signal.label} · {best.display_name} · {STARS[best.signal.strength]}
                                    </b>
                                ) : (
                                    <b className='pps-ai__none'>{rows.length ? 'None strong enough yet' : 'Scanning…'}</b>
                                )}
                            </div>
                            {cfg.recoveryMode === 'evenodd' && (
                                <div className='pps-ai__preview'>
                                    <span>Recovery market now</span>
                                    <b>{recoveryLine}</b>
                                </div>
                            )}
                            <div className='pps-ai__grid'>
                                <Field label='Stake' value={cfg.stake} step={0.1} onChange={v => set('stake', v)} disabled={running} />
                                <Field label='Martingale ×' value={cfg.martingale} step={0.1} min={1} onChange={v => set('martingale', v)} disabled={running} />
                                <Field label='Take profit' value={cfg.takeProfit} step={0.5} onChange={v => set('takeProfit', v)} disabled={running} />
                                <Field label='Stop loss' value={cfg.stopLoss} step={0.5} onChange={v => set('stopLoss', v)} disabled={running} />
                                <Field label='Runs per scan' value={cfg.runsPerScan} onChange={v => set('runsPerScan', Math.max(1, v))} disabled={running} />
                                <Field label='Max trades' value={cfg.maxRuns} onChange={v => set('maxRuns', Math.max(1, v))} disabled={running} />
                                <Field label='Max recovery' value={cfg.maxRecovery} onChange={v => set('maxRecovery', Math.max(1, v))} disabled={running} />
                                <Field label='Threshold %' value={cfg.threshold} step={0.1} min={5} onChange={v => set('threshold', v)} disabled={running} />
                            </div>
                            <label className='pps-ai__select'>
                                <span>Recovery after a loss</span>
                                <select
                                    value={cfg.recoveryMode}
                                    disabled={running}
                                    onChange={e => set('recoveryMode', e.target.value as TAutoConfig['recoveryMode'])}
                                >
                                    <option value='same'>Same market (fast, in the bot)</option>
                                    <option value='evenodd'>Best Even/Odd market (scans)</option>
                                </select>
                            </label>
                            <label className='pps-ai__select'>
                                <span>Minimum strength</span>
                                <select
                                    value={cfg.minStrength}
                                    disabled={running}
                                    onChange={e => set('minStrength', e.target.value as DestroyerStrength)}
                                >
                                    <option value='strong'>Strong only (★★★)</option>
                                    <option value='good'>Good or better (★★)</option>
                                    <option value='weak'>Any signal (★)</option>
                                </select>
                            </label>
                        </div>
                    )}

                    {tab === 'evenodd' && (
                        <div className='pps-ai__body'>
                            <p className='pps-ai__desc'>
                                Finds the market whose most frequent digit stands out. An even top digit means Even, an odd one
                                means Odd, entering on the least frequent digit of that type. Top digit 12% or more: 15 runs or
                                more. Below 12%: 4 to 6 runs. After a loss it recovers on the same market, then scans again.
                            </p>
                            <div className='pps-ai__preview'>
                                <span>Best market now</span>
                                {evenOdd ? (
                                    <b>
                                        {evenOdd.side === 'even' ? 'Even' : 'Odd'} · {evenOdd.display_name}
                                        <small>
                                            top digit {evenOdd.topDigit} ({evenOdd.topPct.toFixed(1)}%) · entry on{' '}
                                            {evenOdd.entryDigit} ({evenOdd.entryPct.toFixed(1)}%) · {evenOddRuns(evenOdd.topPct)} runs
                                        </small>
                                    </b>
                                ) : (
                                    <b className='pps-ai__none'>Scanning…</b>
                                )}
                            </div>
                            <div className='pps-ai__grid'>
                                <Field label='Stake' value={cfg.stake} step={0.1} onChange={v => set('stake', v)} disabled={running} />
                                <Field label='Martingale ×' value={cfg.martingale} step={0.1} min={1} onChange={v => set('martingale', v)} disabled={running} />
                                <Field label='Take profit' value={cfg.takeProfit} step={0.5} onChange={v => set('takeProfit', v)} disabled={running} />
                                <Field label='Stop loss' value={cfg.stopLoss} step={0.5} onChange={v => set('stopLoss', v)} disabled={running} />
                                <Field label='Max trades' value={cfg.maxRuns} onChange={v => set('maxRuns', Math.max(1, v))} disabled={running} />
                                <Field label='Max recovery' value={cfg.maxRecovery} onChange={v => set('maxRecovery', Math.max(1, v))} disabled={running} />
                            </div>
                            <label className='pps-ai__select'>
                                <span>Recovery after a loss</span>
                                <select
                                    value={cfg.recoveryMode}
                                    disabled={running}
                                    onChange={e => set('recoveryMode', e.target.value as TAutoConfig['recoveryMode'])}
                                >
                                    <option value='same'>Same market (fast, in the bot)</option>
                                    <option value='evenodd'>Best Even/Odd market (scans)</option>
                                </select>
                            </label>
                        </div>
                    )}

                    {tab === 'matches' && (
                        <div className='pps-ai__body'>
                            <p className='pps-ai__desc'>
                                Looks for a market where the two most frequent digits are almost level. It waits for the most
                                frequent digit to appear, then predicts the second most frequent one, retrying until it matches.
                            </p>
                            <div className='pps-ai__preview'>
                                <span>Best market now</span>
                                {matches ? (
                                    <b>
                                        Match {matches.matchDigit} · {matches.display_name}
                                        <small>
                                            entry on {matches.entryDigit} · gap {matches.gap.toFixed(2)} points
                                        </small>
                                    </b>
                                ) : (
                                    <b className='pps-ai__none'>
                                        {rows.length ? `No market within ${cfg.maxGap} points yet` : 'Scanning…'}
                                    </b>
                                )}
                            </div>
                            <div className='pps-ai__grid'>
                                <Field label='Stake' value={cfg.stake} step={0.1} onChange={v => set('stake', v)} disabled={running} />
                                <Field label='Take profit' value={cfg.takeProfit} step={0.5} onChange={v => set('takeProfit', v)} disabled={running} />
                                <Field label='Stop loss' value={cfg.stopLoss} step={0.5} onChange={v => set('stopLoss', v)} disabled={running} />
                                <Field label='Max gap (pts)' value={cfg.maxGap} step={0.1} min={0.1} onChange={v => set('maxGap', v)} disabled={running} />
                                <Field label='Tries per scan' value={cfg.maxTries} onChange={v => set('maxTries', Math.max(1, v))} disabled={running} />
                                <Field label='Max trades' value={cfg.maxRuns} onChange={v => set('maxRuns', Math.max(1, v))} disabled={running} />
                            </div>
                            <p className='pps-ai__note'>
                                A match wins about 1 trade in 10 and pays roughly 9 times the stake. Expect long losing runs, and
                                it uses a flat stake with no martingale.
                            </p>
                        </div>
                    )}

                    {tab === 'autopilot' && (
                        <div className='pps-ai__body'>
                            <p className='pps-ai__desc'>
                                Scans once, then runs single trades in order, each on the market that fits. After a loss it scans
                                again and recovers.
                            </p>
                            <div className='pps-ai__steps'>
                                <div className='pps-ai__step'>
                                    <i>1</i>
                                    <div>
                                        <b>Differs</b>
                                        <span>{differs ? `${differs.digit} on ${differs.display_name} (${differs.pct.toFixed(1)}%)` : 'Scanning…'}</span>
                                    </div>
                                </div>
                                <div className='pps-ai__step'>
                                    <i>2</i>
                                    <div>
                                        <b>Over 1</b>
                                        <span>{over1 ? over1.display_name : 'No market fits yet'}</span>
                                    </div>
                                </div>
                                <div className='pps-ai__step'>
                                    <i>3</i>
                                    <div>
                                        <b>Over 2</b>
                                        <span>{over2 ? over2.display_name : 'No market fits yet'}</span>
                                    </div>
                                </div>
                                <div className='pps-ai__step pps-ai__step--rec'>
                                    <i>↺</i>
                                    <div>
                                        <b>After a loss</b>
                                        <span>
                                            {cfg.recovery === 'evenodd'
                                                ? recoveryLine
                                                : recoveryOver
                                                  ? `Over ${recoveryOver.level} · ${recoveryOver.display_name}`
                                                  : 'No market fits yet'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <p className='pps-ai__note'>
                                Differs pays only about 9–10% of the stake on a win but loses the whole stake on a loss. Each step
                                loads its own bot, so this mode is slower per trade than the others.
                            </p>
                            <div className='pps-ai__grid'>
                                <Field label='Stake' value={cfg.stake} step={0.1} onChange={v => set('stake', v)} disabled={running} />
                                <Field label='Martingale ×' value={cfg.martingale} step={0.1} min={1} onChange={v => set('martingale', v)} disabled={running} />
                                <Field label='Take profit' value={cfg.takeProfit} step={0.5} onChange={v => set('takeProfit', v)} disabled={running} />
                                <Field label='Stop loss' value={cfg.stopLoss} step={0.5} onChange={v => set('stopLoss', v)} disabled={running} />
                                <Field label='Max trades' value={cfg.maxRuns} onChange={v => set('maxRuns', Math.max(1, v))} disabled={running} />
                                <Field label='Max recovery' value={cfg.maxRecovery} onChange={v => set('maxRecovery', Math.max(1, v))} disabled={running} />
                                <Field label='Threshold %' value={cfg.threshold} step={0.1} min={5} onChange={v => set('threshold', v)} disabled={running} />
                            </div>
                            <label className='pps-ai__select'>
                                <span>Recovery type</span>
                                <select
                                    value={cfg.recovery}
                                    disabled={running}
                                    onChange={e => set('recovery', e.target.value as TAutoConfig['recovery'])}
                                >
                                    <option value='evenodd'>Even/Odd market</option>
                                    <option value='over'>Over 3 or Over 4</option>
                                </select>
                            </label>
                        </div>
                    )}

                    <label className='pps-ai__real'>
                        <input
                            type='checkbox'
                            checked={cfg.allowReal}
                            disabled={running}
                            onChange={e => set('allowReal', e.target.checked)}
                        />
                        Allow real money (off by default, demo only)
                    </label>

                    {running && (
                        <div className='pps-ai__live'>
                            <div className='pps-ai__stage'>{t.stage || 'Working…'}</div>
                            <div className='pps-ai__tiles'>
                                <div>
                                    <span>Session P/L</span>
                                    <b className={t.pnl >= 0 ? 'pps-ai__up' : 'pps-ai__down'}>
                                        {fmt(t.pnl)} {t.currency}
                                    </b>
                                </div>
                                <div>
                                    <span>Won / Lost</span>
                                    <b>
                                        {t.wins} / {t.losses}
                                    </b>
                                </div>
                                <div>
                                    <span>Trades</span>
                                    <b>{t.trades}</b>
                                </div>
                            </div>
                        </div>
                    )}

                    {running ? (
                        <button className='pps-ai__go pps-ai__go--stop' onClick={t.stop} disabled={t.status === 'stopping'}>
                            {t.status === 'stopping' ? 'Stopping…' : 'Stop'}
                        </button>
                    ) : (
                        <button className='pps-ai__go' onClick={() => t.start(tab)}>
                            Start {TABS.find(x => x.id === tab)?.label}
                        </button>
                    )}

                    {t.log.length > 0 && (
                        <div className='pps-ai__log'>
                            {[...t.log]
                                .slice(-8)
                                .reverse()
                                .map(l => (
                                    <div key={l.id} className={`pps-ai__line pps-ai__line--${l.kind}`}>
                                        <em>{time(l.t)}</em> {l.msg}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            <button
                className={classNames('pps-ai__fab', { 'pps-ai__fab--on': running })}
                onClick={() => setOpen(o => !o)}
                aria-label='AI Trade'
            >
                <span className={classNames('pps-ai__dot', { 'pps-ai__dot--on': running })} />
                {running ? `${TABS.find(x => x.id === t.mode)?.label ?? 'AI'} · ${fmt(t.pnl)}` : 'AI Trade'}
            </button>
        </div>
    );
});

export default AutoTrader;
