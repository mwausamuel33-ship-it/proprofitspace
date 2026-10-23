import { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DEFAULT_AUTO_CONFIG, TAutoConfig, TMode, useAutoTrader } from '@/hooks/useAutoTrader';
import { AccountBadge } from '@/pages/signal-scanner/scanner-widgets';
import { useStore } from '@/hooks/useStore';
import {
    evenOddRuns,
    pickAutopilotMarket,
    pickEvenOdd,
    pickMatches,
    pickSmartMarket,
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

/** Demo / Real switch. It stores the chosen account and reloads, the way the app restores its last account. */
const AccountSwitch = observer(() => {
    const store: any = useStore();
    const client = store.client;
    const ids: string[] = client?.all_loginids ?? [];
    const accounts: any = client?.accounts ?? {};
    const demoId = ids.find(id => accounts[id]?.is_virtual);
    const realId = ids.find(id => accounts[id] && !accounts[id].is_virtual);
    const current: string = client?.loginid ?? '';

    if (!client?.is_logged_in || (!demoId && !realId)) return null;

    const go = (id?: string) => {
        if (!id || id === current) return;
        try {
            localStorage.setItem('active_loginid', id);
        } catch {
            /* storage blocked */
        }
        window.location.reload();
    };

    return (
        <div className='pps-ai__switch' role='group' aria-label='Account'>
            <button
                className={classNames('pps-ai__switch-btn', { 'pps-ai__switch-btn--on': current === demoId })}
                onClick={() => go(demoId)}
                disabled={!demoId}
            >
                Demo
            </button>
            <button
                className={classNames('pps-ai__switch-btn pps-ai__switch-btn--real', { 'pps-ai__switch-btn--on': current === realId })}
                onClick={() => go(realId)}
                disabled={!realId}
            >
                Real
            </button>
        </div>
    );
});

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
    const best = pickSmartMarket(rows, cfg.threshold, cfg.minStrength, cfg.signalFilter, cfg.riskChoice);
    const evenOdd = pickEvenOdd(rows);
    const matches = pickMatches(rows, cfg.maxGap);
    const apMarket = pickAutopilotMarket(rows, cfg.threshold);

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
                    <AccountSwitch />

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
                                Scans once and picks a market. Over 1 / Over 2: digits 0, 1 and 2 are below the threshold, the
                                trigger digit is 1 and the confirmation is a digit above the barrier. Under 8 / Under 7: digits
                                8 and 9 (and 7 for Under 7) are below it, the trigger digit is 8 and the confirmation is a digit
                                below the barrier. A loss is recovered on the same barrier. If a losing digit rises, the bot stops
                                once it is in profit and the next scan picks another volatility.
                            </p>
                            <div className='pps-ai__preview'>
                                <span>Best signal now</span>
                                {best ? (
                                    <b>
                                        {best.label} · {best.display_name} · {STARS[best.strength]}
                                    </b>
                                ) : (
                                    <b className='pps-ai__none'>{rows.length ? 'None strong enough yet' : 'Scanning…'}</b>
                                )}
                            </div>
                            <div className='pps-ai__grid'>
                                <Field label='Stake' value={cfg.stake} step={0.1} onChange={v => set('stake', v)} disabled={running} />
                                <Field label='Martingale ×' value={cfg.martingale} step={0.1} min={1} onChange={v => set('martingale', v)} disabled={running} />
                                <Field label='Take profit' value={cfg.takeProfit} step={0.5} onChange={v => set('takeProfit', v)} disabled={running} />
                                <Field label='Stop loss' value={cfg.stopLoss} step={0.5} onChange={v => set('stopLoss', v)} disabled={running} />
                                <Field label='Stop if digits rise %' value={cfg.riseTrigger} step={0.1} min={0.1} onChange={v => set('riseTrigger', Math.max(0.1, v))} disabled={running} />
                                <Field label='Max trades' value={cfg.maxRuns} onChange={v => set('maxRuns', Math.max(1, v))} disabled={running} />
                                <Field label='Threshold %' value={cfg.threshold} step={0.1} min={5} onChange={v => set('threshold', v)} disabled={running} />
                            </div>
                            <label className='pps-ai__select'>
                                <span>Markets to trade</span>
                                <select
                                    value={cfg.signalFilter}
                                    disabled={running}
                                    onChange={e => set('signalFilter', e.target.value as TAutoConfig['signalFilter'])}
                                >
                                    <option value='both'>Over and Under markets (best strength)</option>
                                    <option value='over'>Over markets only (Over 1 / Over 2)</option>
                                    <option value='under'>Under markets only (Under 8 / Under 7)</option>
                                </select>
                            </label>
                            <label className='pps-ai__select'>
                                <span>Barrier</span>
                                <select
                                    value={cfg.riskChoice}
                                    disabled={running}
                                    onChange={e => set('riskChoice', e.target.value as TAutoConfig['riskChoice'])}
                                >
                                    <option value='auto'>Auto: stronger signal trades Over 2 / Under 7</option>
                                    <option value='safer'>Safer: Over 1 / Under 8</option>
                                    <option value='riskier'>Riskier: Over 2 / Under 7</option>
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
                            <label className='pps-ai__real'>
                                <input
                                    type='checkbox'
                                    checked={cfg.confirmEvery}
                                    disabled={running}
                                    onChange={e => set('confirmEvery', e.target.checked)}
                                />
                                Wait for the trigger digit and confirmation before every trade (slower)
                            </label>
                            <p className='pps-ai__note'>
                                After a loss the stake is multiplied (rounded to cents) and the same barrier is traded until the
                                bot is back in profit. Take profit and stop loss end the session. 1-second volatilities use
                                2-tick contracts, the others 1 tick. The market's lowest digit (red bar) must not be one of the
                                losing digits.
                            </p>
                        </div>
                    )}

                    {tab === 'evenodd' && (
                        <div className='pps-ai__body'>
                            <p className='pps-ai__desc'>
                                Scans the digit percentages. If the even digits lead in total it trades Even, if the odd digits
                                lead it trades Odd, starting at once. Top digit 12% or more: 15 runs or more. Below 12%: 4 to 6
                                runs. After a loss it recovers on the same market, then scans again.
                            </p>
                            <div className='pps-ai__preview'>
                                <span>Best market now</span>
                                {evenOdd ? (
                                    <b>
                                        {evenOdd.side === 'even' ? 'Even' : 'Odd'} · {evenOdd.display_name}
                                        <small>
                                            even {evenOdd.evenPct.toFixed(1)}% vs odd {evenOdd.oddPct.toFixed(1)}% · top digit{' '}
                                            {evenOdd.topDigit} ({evenOdd.topPct.toFixed(1)}%) · {evenOddRuns(evenOdd.topPct)} runs
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
                                    value={cfg.evenOddRecovery}
                                    disabled={running}
                                    onChange={e => set('evenOddRecovery', e.target.value as TAutoConfig['evenOddRecovery'])}
                                >
                                    <option value='same'>Same side again (Even stays Even)</option>
                                    <option value='flip'>Flip side, then back (Even to Odd)</option>
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
                                Scans once, picks one volatility and runs Differs, Over 1 and Over 2 on it in turn. After a loss it
                                recovers with Over 2 on the same volatility until the loss is won back, then scans for a new one.
                            </p>
                            <div className='pps-ai__preview'>
                                <span>One volatility for every step</span>
                                {apMarket ? (
                                    <b>{apMarket.display_name}</b>
                                ) : (
                                    <b className='pps-ai__none'>{rows.length ? 'No volatility fits yet' : 'Scanning…'}</b>
                                )}
                            </div>
                            <div className='pps-ai__steps'>
                                <div className='pps-ai__step'>
                                    <i>1</i>
                                    <div>
                                        <b>Differs</b>
                                        <span>
                                            {apMarket ? `${apMarket.differsDigit} (${apMarket.differsPct.toFixed(1)}%)` : 'Waiting for a market'}
                                        </span>
                                    </div>
                                </div>
                                <div className='pps-ai__step'>
                                    <i>2</i>
                                    <div>
                                        <b>Over 1</b>
                                        <span>{apMarket ? 'Digits 0 and 1 are low' : 'Waiting for a market'}</span>
                                    </div>
                                </div>
                                <div className='pps-ai__step'>
                                    <i>3</i>
                                    <div>
                                        <b>Over 2</b>
                                        <span>{apMarket ? (apMarket.over2Ok ? 'Digits 0, 1 and 2 are low' : 'Skipped: digit 2 is not low') : 'Waiting for a market'}</span>
                                    </div>
                                </div>
                                <div className='pps-ai__step pps-ai__step--rec'>
                                    <i>↺</i>
                                    <div>
                                        <b>After a loss</b>
                                        <span>{apMarket ? `Over 2 on ${apMarket.display_name} until recovered` : 'Waiting for a market'}</span>
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
                                <Field label='Recovery trades' value={cfg.recoverySteps} onChange={v => set('recoverySteps', Math.max(1, v))} disabled={running} />
                                <Field label='Threshold %' value={cfg.threshold} step={0.1} min={5} onChange={v => set('threshold', v)} disabled={running} />
                            </div>
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
