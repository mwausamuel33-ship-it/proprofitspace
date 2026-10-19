import { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DEFAULT_AUTO_CONFIG, TAutoConfig, TMode, useAutoTrader } from '@/hooks/useAutoTrader';
import { AccountBadge, StakeGuard } from '@/pages/signal-scanner/scanner-widgets';
import { pickBestSignal, pickDiffers, pickOver, pickRecovery } from '@/utils/autopilot-rules';
import { DestroyerStrength } from '@/utils/destroyer-rules';
import '@/styles/pps-theme.scss';
import './auto-trader.scss';

const STARS: Record<DestroyerStrength, string> = { strong: '★★★', good: '★★', weak: '★' };

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

    // live previews from the latest scan
    const rows = t.scan.rows;
    const best = pickBestSignal(rows, cfg.threshold, cfg.minStrength);
    const differs = pickDiffers(rows);
    const over1 = pickOver(rows, 1, cfg.threshold);
    const over2 = pickOver(rows, 2, cfg.threshold);
    const recovery = pickRecovery(rows, cfg.threshold);

    return (
        <div className='pps-ai'>
            {open && (
                <div className='pps-ai__panel' role='dialog' aria-label='AI Trade'>
                    <div className='pps-ai__head'>
                        <div>
                            <b>AI Trade</b>
                            <span>Automatic trading with limits</span>
                        </div>
                        <button className='pps-ai__x' onClick={() => setOpen(false)} aria-label='Close'>
                            ×
                        </button>
                    </div>

                    <AccountBadge />

                    <div className='pps-ai__tabs'>
                        <button
                            className={classNames('pps-ai__tab', { 'pps-ai__tab--on': tab === 'smartscan' })}
                            onClick={() => setTab('smartscan')}
                            disabled={running}
                        >
                            SmartScan
                        </button>
                        <button
                            className={classNames('pps-ai__tab', { 'pps-ai__tab--on': tab === 'autopilot' })}
                            onClick={() => setTab('autopilot')}
                            disabled={running}
                        >
                            Autopilot
                        </button>
                    </div>

                    {tab === 'smartscan' ? (
                        <div className='pps-ai__body'>
                            <p className='pps-ai__desc'>
                                Finds the best Over or Under signal, loads the Destroyer bot, presses Run, and repeats with the
                                next best signal when the bot finishes.
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
                            <div className='pps-ai__grid'>
                                <Field label='Stake' value={cfg.stake} step={0.1} min={0.35} onChange={v => set('stake', v)} disabled={running} />
                                <Field label='Martingale ×' value={cfg.martingale} step={0.1} min={1} onChange={v => set('martingale', v)} disabled={running} />
                                <Field label='Take profit' value={cfg.takeProfit} step={0.5} onChange={v => set('takeProfit', v)} disabled={running} />
                                <Field label='Stop loss' value={cfg.stopLoss} step={0.5} onChange={v => set('stopLoss', v)} disabled={running} />
                                <Field label='Max bots' value={cfg.maxRuns} onChange={v => set('maxRuns', Math.max(1, v))} disabled={running} />
                                <Field label='Threshold %' value={cfg.threshold} step={0.1} min={5} onChange={v => set('threshold', v)} disabled={running} />
                            </div>
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
                    ) : (
                        <div className='pps-ai__body'>
                            <p className='pps-ai__desc'>Runs a repeating sequence of single trades, each on the right market:</p>
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
                                        <b>After a loss: Over 3 or 4</b>
                                        <span>{recovery ? `Over ${recovery.level} · ${recovery.display_name}` : 'No market fits yet'}</span>
                                    </div>
                                </div>
                            </div>
                            <p className='pps-ai__note'>
                                Differs pays only about 9–10% of the stake on a win but loses the whole stake on a loss. The
                                lowest-percentage digit is not less likely to come next.
                            </p>
                            <div className='pps-ai__grid'>
                                <Field label='Stake' value={cfg.stake} step={0.1} min={0.35} onChange={v => set('stake', v)} disabled={running} />
                                <Field label='Martingale ×' value={cfg.martingale} step={0.1} min={1} onChange={v => set('martingale', v)} disabled={running} />
                                <Field label='Take profit' value={cfg.takeProfit} step={0.5} onChange={v => set('takeProfit', v)} disabled={running} />
                                <Field label='Stop loss' value={cfg.stopLoss} step={0.5} onChange={v => set('stopLoss', v)} disabled={running} />
                                <Field label='Max trades' value={cfg.maxRuns} onChange={v => set('maxRuns', Math.max(1, v))} disabled={running} />
                                <Field label='Max recovery' value={cfg.maxRecovery} onChange={v => set('maxRecovery', Math.max(1, v))} disabled={running} />
                                <Field label='Threshold %' value={cfg.threshold} step={0.1} min={5} onChange={v => set('threshold', v)} disabled={running} />
                            </div>
                        </div>
                    )}

                    <StakeGuard stake={cfg.stake} martingale={cfg.martingale} />

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
                            Start {tab === 'smartscan' ? 'SmartScan' : 'Autopilot'}
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
                {running ? `${t.mode === 'autopilot' ? 'Autopilot' : 'SmartScan'} · ${fmt(t.pnl)}` : 'AI Trade'}
            </button>
        </div>
    );
});

export default AutoTrader;
