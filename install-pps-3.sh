#!/usr/bin/env bash
# ProProfitSpace update 3: DEMO/REAL badge, stake guard, session results.
# Run from the repo root:  bash install-pps-3.sh
cd "$(dirname "$0")" || exit 1
[ -d src ] || { echo "src/ not found. Put this file in ~/proprofitspace/proprofitspace and run: bash install-pps-3.sh"; exit 1; }
[ -f src/hooks/useDestroyerScanner.ts ] || { echo "Update 2 is missing. Run install-pps-2.sh first."; exit 1; }

mkdir -p src/utils src/pages/signal-scanner src/pages/dashboard
B=.pps-backup3-$(date +%H%M%S); mkdir -p "$B"
for f in src/pages/signal-scanner/signal-scanner.tsx src/pages/signal-scanner/signal-scanner.scss src/pages/dashboard/dashboard.tsx src/pages/dashboard/dashboard-pps.scss; do
  [ -f "$f" ] && mkdir -p "$B/$(dirname $f)" && cp "$f" "$B/$f"
done
cat > src/utils/stake-guard.ts <<'PPS_EOF'
// Stake guard: how risky is this stake + martingale for the current balance?
// Pure functions with no imports.

export type GuardLevel = 'ok' | 'warn' | 'danger';

export interface StakeAssessment {
    level: GuardLevel;
    stakePct: number | null; // stake as % of balance
    worstCase: number; // total staked if the first trade and every recovery step all lose
    worstCasePct: number | null;
    messages: string[];
}

/** The Destroyer bot allows 4 recovery steps after the first loss (MaxRecoverySteps). */
export const RECOVERY_STEPS = 4;

export const STAKE_WARN_PCT = 2; // % of balance
export const STAKE_DANGER_PCT = 5;
export const WORST_WARN_PCT = 10;
export const WORST_DANGER_PCT = 25;

export function assessStake(
    stake: number,
    martingale: number,
    balance: number,
    recoverySteps = RECOVERY_STEPS
): StakeAssessment {
    const m = martingale > 0 ? martingale : 1;
    const n = recoverySteps + 1; // first trade + recovery trades
    const worstCase = m === 1 ? stake * n : (stake * (Math.pow(m, n) - 1)) / (m - 1);

    const hasBalance = Number.isFinite(balance) && balance > 0;
    const stakePct = hasBalance ? (stake / balance) * 100 : null;
    const worstCasePct = hasBalance ? (worstCase / balance) * 100 : null;

    let level: GuardLevel = 'ok';
    if (stakePct !== null && worstCasePct !== null) {
        if (worstCasePct > WORST_DANGER_PCT || stakePct > STAKE_DANGER_PCT) level = 'danger';
        else if (worstCasePct > WORST_WARN_PCT || stakePct > STAKE_WARN_PCT) level = 'warn';
    }

    const messages: string[] = [];
    if (level !== 'ok' && stakePct !== null && worstCasePct !== null) {
        messages.push(`Stake is ${stakePct.toFixed(1)}% of your balance.`);
        messages.push(
            `If the first trade and all ${recoverySteps} recovery steps lose, you lose about ${worstCase.toFixed(2)} (${worstCasePct.toFixed(0)}% of your balance).`
        );
    }

    return { level, stakePct, worstCase, worstCasePct, messages };
}
PPS_EOF
cat > src/pages/signal-scanner/scanner-widgets.tsx <<'PPS_EOF'
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { assessStake } from '@/utils/stake-guard';
import './scanner-widgets.scss';

/** DEMO / REAL / logged-out label with the balance. */
export const AccountBadge = observer(() => {
    const { client } = useStore();

    if (!client.is_logged_in) {
        return (
            <span className='pps-w-badge pps-w-badge--out'>
                <i /> Not logged in · log in to trade
            </span>
        );
    }

    const is_demo = !!client.is_virtual;
    const balance = Number(client.balance);

    return (
        <span className={`pps-w-badge ${is_demo ? 'pps-w-badge--demo' : 'pps-w-badge--real'}`}>
            <i /> {is_demo ? 'DEMO ACCOUNT' : 'REAL MONEY'} ·{' '}
            {Number.isFinite(balance) ? balance.toFixed(2) : client.balance} {client.currency}
        </span>
    );
});

/** Shows how big the stake is next to the balance and what a full losing chain would cost. */
export const StakeGuard = observer(({ stake, martingale }: { stake: number; martingale: number }) => {
    const { client } = useStore();
    const a = assessStake(stake, martingale, Number(client.balance));

    return (
        <div className={`pps-w-guard pps-w-guard--${a.level}`}>
            <div className='pps-w-guard__line'>
                <span>Worst-case losing chain</span>
                <b>
                    {a.worstCase.toFixed(2)} {client.currency}
                    {a.worstCasePct !== null && <em> ({a.worstCasePct.toFixed(0)}% of balance)</em>}
                </b>
            </div>
            {a.level !== 'ok' && (
                <div className='pps-w-guard__msg'>
                    {a.level === 'danger' ? 'High risk. ' : 'Careful. '}
                    {a.messages.join(' ')}
                </div>
            )}
        </div>
    );
});

/** Win/loss and profit for the current session (the same numbers as the Summary panel). */
export const SessionResults = observer(() => {
    const { client, transactions } = useStore();
    const s: any = (transactions as any)?.statistics ?? {};
    const won = Number(s.won_contracts) || 0;
    const lost = Number(s.lost_contracts) || 0;
    const runs = won + lost;
    const profit = Number(s.total_profit) || 0;
    const rate = runs ? (won / runs) * 100 : null;

    return (
        <div className='pps-w-results'>
            <div className='pps-w-results__tile'>
                <span>Runs</span>
                <b>{runs}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Won</span>
                <b className='pps-w-up'>{won}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Lost</span>
                <b className='pps-w-down'>{lost}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Win rate</span>
                <b>{rate === null ? '—' : `${rate.toFixed(0)}%`}</b>
            </div>
            <div className='pps-w-results__tile'>
                <span>Net P/L</span>
                <b className={profit > 0 ? 'pps-w-up' : profit < 0 ? 'pps-w-down' : ''}>
                    {profit > 0 ? '+' : ''}
                    {profit.toFixed(2)} {client.currency}
                </b>
            </div>
        </div>
    );
});
PPS_EOF
cat > src/pages/signal-scanner/scanner-widgets.scss <<'PPS_EOF'
.pps-w-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    border: 1px solid transparent;

    i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentcolor;
    }

    &--demo {
        color: #34d399;
        background: rgba(52, 211, 153, 0.12);
        border-color: rgba(52, 211, 153, 0.4);
    }
    &--real {
        color: #fb7185;
        background: rgba(251, 113, 133, 0.14);
        border-color: rgba(251, 113, 133, 0.55);
    }
    &--out {
        color: #9fb0cc;
        background: rgba(148, 163, 184, 0.12);
        border-color: rgba(148, 163, 184, 0.3);
    }
}

.pps-w-guard {
    margin-top: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: #121d36;
    color: #e8eef9;
    font-size: 13px;

    &__line {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        color: #9fb0cc;

        b {
            color: #e8eef9;
        }
        em {
            font-style: normal;
            color: #9fb0cc;
            font-weight: 600;
        }
    }

    &__msg {
        margin-top: 6px;
        line-height: 1.4;
    }

    &--warn {
        border-color: rgba(251, 191, 36, 0.6);
        background: rgba(251, 191, 36, 0.1);
        .pps-w-guard__msg {
            color: #fbbf24;
        }
    }

    &--danger {
        border-color: rgba(251, 113, 133, 0.7);
        background: rgba(251, 113, 133, 0.12);
        .pps-w-guard__msg {
            color: #fb7185;
            font-weight: 700;
        }
    }
}

.pps-w-results {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;

    @media (max-width: 720px) {
        grid-template-columns: repeat(2, 1fr);
    }

    &__tile {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 14px;
        background: #121d36;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;

        span {
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #9fb0cc;
        }

        b {
            font-size: 18px;
            font-weight: 800;
            color: #e8eef9;
        }
    }
}

.pps-w-up {
    color: #34d399 !important;
}
.pps-w-down {
    color: #fb7185 !important;
}
PPS_EOF
cat > src/pages/signal-scanner/signal-scanner.tsx <<'PPS_EOF'
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
PPS_EOF
cat > src/pages/signal-scanner/signal-scanner.scss <<'PPS_EOF'
// The page scrolls inside its own box, so every signal is reachable on phones.
.pps-sc-page {
    height: calc(100vh - 180px);
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;

    @supports (height: 100dvh) {
        height: calc(100dvh - 180px);
    }

    @media (max-width: 1023px) {
        height: calc(100vh - 215px);

        @supports (height: 100dvh) {
            height: calc(100dvh - 215px);
        }
    }
}

.pps-sc {
    --sc-bg: #0b1324;
    --sc-surface: #121d36;
    --sc-surface-2: #182646;
    --sc-border: rgba(148, 163, 184, 0.2);
    --sc-text: #e8eef9;
    --sc-muted: #9fb0cc;
    --sc-accent: #22d3ee;
    --sc-good: #34d399;
    --sc-warn: #fbbf24;
    --sc-bad: #fb7185;

    max-width: 1100px;
    margin: 12px auto 24px;
    padding: 20px;
    background: var(--sc-bg);
    color: var(--sc-text);
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.4;

    @media (max-width: 720px) {
        margin: 8px;
        padding: 14px;
    }

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
    }

    &__eyebrow {
        margin: 0 0 4px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sc-accent);
    }

    &__title {
        margin: 0;
        font-size: 21px;
        font-weight: 800;
        color: var(--sc-text);

        @media (max-width: 720px) {
            font-size: 18px;
        }
    }

    &__time {
        font-size: 12px;
        color: var(--sc-muted);
        font-family: monospace;
    }

    /* ---- countdown ---- */
    &__countdown {
        margin-top: 16px;
        padding: 12px 14px;
        background: var(--sc-surface);
        border: 1px solid var(--sc-border);
        border-radius: 12px;
    }

    &__countdown-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    }

    &__live {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 14px;
        color: var(--sc-text);
    }

    &__dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--sc-good);
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.6);
        animation: pps-sc-pulse 2s infinite;

        &--busy {
            background: var(--sc-accent);
            animation-duration: 0.8s;
        }
    }

    &__scan-now {
        padding: 6px 12px;
        background: transparent;
        color: var(--sc-accent);
        border: 1px solid var(--sc-accent);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;

        &:disabled {
            opacity: 0.4;
            cursor: default;
        }
    }

    &__bar {
        height: 5px;
        margin-top: 10px;
        background: rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        overflow: hidden;
    }

    &__bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #22d3ee, #6366f1);
        border-radius: 999px;
        transition: width 0.25s linear;

        &--busy {
            animation: pps-sc-shimmer 1s linear infinite;
            background-size: 200% 100%;
        }
    }

    &__account {
        margin-top: 12px;
    }

    &__results {
        margin-top: 12px;
    }

    /* ---- stats ---- */
    &__stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-top: 12px;
    }

    &__stat {
        display: flex;
        flex-direction: column;
        padding: 10px 14px;
        background: var(--sc-surface);
        border: 1px solid var(--sc-border);
        border-radius: 12px;

        b {
            font-size: 22px;
            font-weight: 800;
            color: var(--sc-text);
        }

        span {
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--sc-muted);
        }

        &--good b {
            color: var(--sc-good);
        }
    }

    /* ---- controls ---- */
    &__controls {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-top: 12px;
        padding: 14px;
        background: var(--sc-surface);
        border: 1px solid var(--sc-border);
        border-radius: 12px;

        @media (max-width: 720px) {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: var(--sc-muted);
        font-weight: 600;

        input {
            width: 100%;
            padding: 9px 10px;
            background: var(--sc-bg);
            color: var(--sc-text);
            border: 1px solid var(--sc-border);
            border-radius: 8px;
            font-size: 16px; // 16px stops iOS zooming into the field

            &:focus {
                outline: none;
                border-color: var(--sc-accent);
            }
        }
    }

    &__rules {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 8px;
        margin-top: 12px;
        color: var(--sc-muted);
        font-size: 12.5px;

        > div {
            padding: 10px 12px;
            background: var(--sc-surface);
            border-left: 3px solid var(--sc-accent);
            border-radius: 8px;
        }

        b {
            color: var(--sc-text);
        }
    }

    /* ---- filters ---- */
    &__filters {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 18px 0 10px;
    }

    &__filter {
        padding: 6px 14px;
        background: var(--sc-surface);
        color: var(--sc-muted);
        border: 1px solid var(--sc-border);
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;

        em {
            font-style: normal;
            margin-inline-start: 4px;
            color: var(--sc-text);
        }

        &--on {
            background: rgba(34, 211, 238, 0.14);
            color: var(--sc-accent);
            border-color: var(--sc-accent);
        }
    }

    &__empty {
        padding: 24px;
        text-align: center;
        color: var(--sc-muted);
        background: var(--sc-surface);
        border: 1px dashed var(--sc-border);
        border-radius: 12px;
    }

    /* ---- signal rows ---- */
    &__list {
        border: 1px solid var(--sc-border);
        border-radius: 12px;
        overflow: hidden;
        background: var(--sc-surface);
    }

    &__row {
        display: grid;
        grid-template-columns: 28px minmax(140px, 1.3fr) 96px 130px minmax(150px, 1.2fr) 110px 118px;
        grid-template-areas: 'rank main badge rating losing entry action';
        gap: 8px 12px;
        align-items: center;
        padding: 12px 14px;
        border-top: 1px solid var(--sc-border);
        border-left: 3px solid transparent;

        &--head {
            padding-top: 9px;
            padding-bottom: 9px;
            background: var(--sc-surface-2);
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--sc-muted);
            border-top: none;

            @media (max-width: 720px) {
                display: none;
            }
        }

        &--strong {
            border-left-color: var(--sc-good);
        }
        &--good {
            border-left-color: var(--sc-warn);
        }
        &--weak {
            border-left-color: rgba(148, 163, 184, 0.45);
        }

        @media (max-width: 720px) {
            grid-template-columns: 24px 1fr auto;
            grid-template-areas:
                'rank main badge'
                '. rating rating'
                '. losing losing'
                '. entry action';
        }
    }

    &__rank {
        grid-area: rank;
        font-family: monospace;
        font-size: 12px;
        color: var(--sc-muted);
    }
    &__main {
        grid-area: main;
        min-width: 0;
    }
    &__badgecell {
        grid-area: badge;
    }
    &__rating {
        grid-area: rating;
    }
    &__losing {
        grid-area: losing;
    }
    &__entry {
        grid-area: entry;
    }
    &__action {
        grid-area: action;
        text-align: right;
    }

    &__market {
        font-weight: 700;
        color: var(--sc-text);
    }

    &__sub {
        font-size: 11px;
        color: var(--sc-muted);
        font-family: monospace;
    }

    &__badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 6px;
        font-weight: 800;
        font-size: 12px;
        text-transform: uppercase;
        white-space: nowrap;

        &--over {
            background: rgba(52, 211, 153, 0.15);
            color: var(--sc-good);
        }
        &--under {
            background: rgba(251, 113, 133, 0.15);
            color: var(--sc-bad);
        }
    }

    &__rating {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__stars {
        font-size: 15px;
        letter-spacing: 1px;
        white-space: nowrap;

        i {
            font-style: normal;
            opacity: 0.22;
        }

        &--strong {
            color: var(--sc-good);
        }
        &--good {
            color: var(--sc-warn);
        }
        &--weak {
            color: var(--sc-muted);
        }
    }

    &__rating-text {
        display: flex;
        flex-direction: column;
        font-weight: 700;
        font-size: 13px;
        color: var(--sc-text);
        line-height: 1.15;

        small {
            font-size: 11px;
            font-weight: 600;
            color: var(--sc-muted);
            font-family: monospace;
        }
    }

    &__chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }

    &__chip {
        display: inline-flex;
        gap: 6px;
        align-items: baseline;
        padding: 3px 8px;
        background: var(--sc-bg);
        border: 1px solid var(--sc-border);
        border-radius: 6px;
        font-size: 12px;
        font-family: monospace;
        color: var(--sc-muted);

        b {
            color: var(--sc-text);
            font-size: 14px;
        }

        &--under10 {
            color: var(--sc-good);
            border-color: rgba(52, 211, 153, 0.45);
        }

        &--entry {
            color: var(--sc-accent);
            font-weight: 800;
            font-size: 14px;
        }
    }

    &__btn {
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        color: #04101f;
        font-weight: 800;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;

        &:hover {
            filter: brightness(1.1);
        }

        @media (max-width: 720px) {
            padding: 10px 18px;
        }
    }

    /* ---- all-markets table ---- */
    &__section {
        margin: 26px 0 10px;
        font-size: 15px;
        font-weight: 700;
        color: var(--sc-text);
    }

    &__scroll {
        overflow-x: auto;
        border: 1px solid var(--sc-border);
        border-radius: 12px;
        -webkit-overflow-scrolling: touch;
    }

    &__table {
        width: 100%;
        border-collapse: collapse;
        background: var(--sc-surface);

        th,
        td {
            padding: 6px 8px;
            font-size: 12px;
            text-align: center;
            border-top: 1px solid var(--sc-border);
        }

        th {
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--sc-muted);
            background: var(--sc-surface-2);
            border-top: none;
        }

        th:first-child,
        td:first-child {
            text-align: left;
            position: sticky;
            left: 0;
            background: var(--sc-surface);
        }

        th:first-child {
            background: var(--sc-surface-2);
        }
    }

    &__tmarket {
        font-weight: 600;
        white-space: nowrap;
        color: var(--sc-text);
    }

    &__cell {
        font-family: monospace;
        color: var(--sc-muted);

        &--low {
            background: rgba(251, 191, 36, 0.14);
            color: var(--sc-warn);
            font-weight: 700;
        }

        &--strong {
            background: rgba(52, 211, 153, 0.2);
            color: var(--sc-good);
            font-weight: 800;
        }
    }

    &__note {
        margin: 18px 0 0;
        font-size: 12px;
        color: var(--sc-muted);
    }
}

@keyframes pps-sc-pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.55);
    }
    70% {
        box-shadow: 0 0 0 8px rgba(52, 211, 153, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
    }
}

@keyframes pps-sc-shimmer {
    0% {
        background-position: 0% 0;
    }
    100% {
        background-position: -200% 0;
    }
}
PPS_EOF
cat > src/pages/dashboard/dashboard.tsx <<'PPS_EOF'
import React, { useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize, Localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';
import { SessionResults } from '../signal-scanner/scanner-widgets';
import Landing from './landing';
import './dashboard.scss';
import './dashboard-pps.scss';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const LANDING_KEY = 'pps_landing_seen';

const readLandingSeen = () => {
    try {
        return localStorage.getItem(LANDING_KEY) === '1';
    } catch {
        return false;
    }
};

const RULE_CARDS = [
    { label: 'Over rule', value: '0,1,2 < 10.5%', note: 'Over 1 or Over 2 · entry on 2, 5, 6' },
    { label: 'Under rule', value: '9,8,7 < 10.5%', note: 'Under 8 or Under 7 · entry on 4, 7, 9' },
    { label: 'Markets', value: 'Vol + Jump', note: 'All indices, last 1000 ticks' },
    { label: 'Recovery', value: 'Martingale', note: 'Safer barrier after a loss, capped steps' },
];

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client, google_drive } = useStore();
    const { dashboard_strategies } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();
    const is_logged_in = client.is_logged_in;
    const [show_landing, setShowLanding] = useState(() => !readLandingSeen());

    const launchApp = () => {
        try {
            localStorage.setItem(LANDING_KEY, '1');
        } catch {
            /* storage blocked: the landing page just shows again next visit */
        }
        setShowLanding(false);
    };

    return (
        <React.Fragment>
            {show_landing && <Landing onLaunch={launchApp} />}
            <div
                className={classNames('pps-dashboard', {
                    'pps-dashboard--tour-active': active_tour,
                })}
            >
                <div className='pps-dashboard__content'>
                    {is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}

                    <div className='pps-dashboard__hero'>
                        <div className='pps-dashboard__hero-text'>
                            <h1 className='pps-dashboard__title'>ProProfitSpace</h1>
                            <p className='pps-dashboard__subtitle'>
                                <Localize i18n_default_text='Scan every Volatility and Jump index, then load the Destroyer bot in one click' />
                            </p>
                        </div>
                        <div className='pps-dashboard__hero-actions'>
                            <button className='pps-dashboard__hero-btn' onClick={() => handleTabChange(5)}>
                                <Localize i18n_default_text='Open Scanner' />
                            </button>
                            <button
                                className='pps-dashboard__hero-btn pps-dashboard__hero-btn--secondary'
                                onClick={() => handleTabChange(1)}
                            >
                                <Localize i18n_default_text='Bot Builder' />
                            </button>
                        </div>
                    </div>

                    {is_logged_in && (
                        <div className='pps-dashboard__results'>
                            <SessionResults />
                        </div>
                    )}

                    <div className='pps-dashboard__stats'>
                        {RULE_CARDS.map(card => (
                            <div key={card.label} className='pps-dashboard__stat'>
                                <span className='pps-dashboard__stat-label'>{card.label}</span>
                                <span className='pps-dashboard__stat-value'>{card.value}</span>
                                <span className='pps-dashboard__stat-note'>{card.note}</span>
                            </div>
                        ))}
                    </div>

                    <div className='quick-panel'>
                        <div
                            className={classNames('tab__dashboard__header', {
                                'tab__dashboard__header--listed': isDesktop && has_dashboard_strategies,
                            })}
                        >
                            {!has_dashboard_strategies && (
                                <Text
                                    className='title'
                                    as='h2'
                                    color='prominent'
                                    size={isDesktop ? 'sm' : 's'}
                                    lineHeight='xxl'
                                    weight='bold'
                                >
                                    {localize('Load or build your bot')}
                                </Text>
                            )}
                            <Text
                                as='p'
                                color='prominent'
                                lineHeight='s'
                                size={isDesktop ? 's' : 'xxs'}
                                className={classNames('subtitle', { 'subtitle__has-list': has_dashboard_strategies })}
                            >
                                {is_google_drive_configured
                                    ? localize(
                                          'Import a bot from your computer or Google Drive, build it from scratch, or start with a quick strategy.'
                                      )
                                    : localize(
                                          'Import a bot from your computer, build it from scratch, or start with a quick strategy.'
                                      )}
                            </Text>
                        </div>
                        <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} />
                    </div>
                </div>
            </div>
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
PPS_EOF
cat > src/pages/dashboard/dashboard-pps.scss <<'PPS_EOF'
// Loaded after dashboard.scss. Fixed colours so the cards stay readable in any theme.
.pps-dashboard {
    &__hero {
        background: linear-gradient(135deg, #0b1324, #17224a);
        border: 1px solid rgba(148, 163, 184, 0.25);
    }

    &__title {
        font-size: 30px;
        background: linear-gradient(135deg, #22d3ee, #a5b4fc);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    &__subtitle {
        font-size: 14px;
        color: #b6c4df;
    }

    &__hero-btn {
        font-size: 14px;
        color: #04101f;
        background: linear-gradient(135deg, #22d3ee, #6366f1);

        &--secondary {
            color: #22d3ee;
            background: transparent;
            border: 1px solid #22d3ee;
        }
    }

    &__stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 16px;
        background: #0f1a33;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 14px;
    }

    &__stat-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        color: #8fa3c4;
    }

    &__stat-value {
        font-size: 20px;
        font-weight: 800;
        color: #f1f6ff;
    }

    &__stat-note {
        font-size: 12px;
        color: #9fb0cc;
    }
}

// The My computer / Bot Builder / Quick strategy cards were stacking vertically.
// This lays out whatever the Cards component renders as a wrapping row.
.pps-dashboard .quick-panel > :last-child {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 16px;
    align-items: stretch;

    > * {
        flex: 1 1 200px;
        max-width: 280px;
    }
}

.pps-dashboard__results {
    margin: 12px 0;
}
PPS_EOF

echo
echo "Done. Backups are in $B"
for f in src/utils/stake-guard.ts src/pages/signal-scanner/scanner-widgets.tsx src/pages/signal-scanner/scanner-widgets.scss src/pages/signal-scanner/signal-scanner.tsx src/pages/signal-scanner/signal-scanner.scss src/pages/dashboard/dashboard.tsx src/pages/dashboard/dashboard-pps.scss; do
  [ -s "$f" ] && echo "OK  $f" || echo "MISSING $f"
done
