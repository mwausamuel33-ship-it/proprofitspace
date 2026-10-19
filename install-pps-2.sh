#!/usr/bin/env bash
# ProProfitSpace update 2: strength ratings, scan countdown, mobile-friendly scanner, martingale 2.
# Run from the repo root:  bash install-pps-2.sh
cd "$(dirname "$0")" || exit 1
[ -d src ] || { echo "src/ not found. Put this file in ~/proprofitspace/proprofitspace and run: bash install-pps-2.sh"; exit 1; }
[ -f src/xml/sammee_destroyer.xml ] || { echo "src/xml/sammee_destroyer.xml is missing. Run install-pps.sh first."; exit 1; }

mkdir -p src/utils src/hooks src/pages/signal-scanner
B=.pps-backup2-$(date +%H%M%S); mkdir -p "$B"
for f in src/utils/destroyer-rules.ts src/hooks/useDestroyerScanner.ts src/pages/signal-scanner/signal-scanner.tsx src/pages/signal-scanner/signal-scanner.scss src/xml/sammee_destroyer.xml; do
  [ -f "$f" ] && mkdir -p "$B/$(dirname $f)" && cp "$f" "$B/$f"
done

python3 - <<'PY'
import re
f = 'src/xml/sammee_destroyer.xml'
x = open(f).read()
pat = r'(id="b5"><field name="NUM">)[^<]*'
assert re.search(pat, x), "Martingale block not found"
open(f, 'w').write(re.sub(pat, r'\g<1>2', x))
print("bot template: Martingale set to 2")
PY
cat > src/utils/destroyer-rules.ts <<'PPS_EOF'
// Destroyer rules: pick Over/Under from last-N-tick digit percentages, and patch the bot XML.
// Pure functions with no imports, so they are easy to test.

export type DestroyerSide = 'over' | 'under';

export type DestroyerStrength = 'strong' | 'good' | 'weak';

export interface DestroyerSignal {
    side: DestroyerSide;
    prediction: number; // barrier: Over 1/2 or Under 8/7
    recoveryPrediction: number; // barrier used after a loss (martingale mode)
    entryDigits: [number, number, number]; // last digits that trigger the purchase
    losingDigits: number[]; // digits that make this contract lose
    avgLosingPct: number; // average % of the losing digits (lower = stronger signal)
    maxLosingPct: number; // highest % among the losing digits
    deviation: number; // points the losing digits sit below the fair 10% share (higher = stronger)
    strength: DestroyerStrength; // strong: all losing digits < 10%; good: average < 10%; weak: otherwise
    label: string; // 'Over 2', 'Under 8', ...
    reason: string;
}

export const DEFAULT_THRESHOLD = 10.5; // percent
export const FAIR_SHARE = 10; // percent each digit should hold on average

export const OVER_ENTRY: [number, number, number] = [2, 5, 6];
export const UNDER_ENTRY: [number, number, number] = [4, 7, 9];

const rate = (p: number[], losing: number[]) => {
    const avg = losing.reduce((sum, d) => sum + p[d], 0) / losing.length;
    const max = Math.max(...losing.map(d => p[d]));
    const strength: DestroyerStrength = max < FAIR_SHARE ? 'strong' : avg < FAIR_SHARE ? 'good' : 'weak';
    return { avg, max, deviation: FAIR_SHARE - avg, strength };
};

const STRENGTH_RANK: Record<DestroyerStrength, number> = { strong: 0, good: 1, weak: 2 };

/** Sort helper: strongest tier first, then the bigger deviation below 10%. */
export const compareSignals = (a: DestroyerSignal, b: DestroyerSignal) =>
    STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] || b.deviation - a.deviation;

/** digitPct: array of 10 numbers (percent of ticks for digit 0..9). */
export function evaluateDestroyer(digitPct: number[], threshold = DEFAULT_THRESHOLD): DestroyerSignal | null {
    if (!digitPct || digitPct.length !== 10) return null;
    const p = digitPct;
    const below = (d: number) => p[d] < threshold;
    const candidates: DestroyerSignal[] = [];

    // OVER: losing digits for Over 2 are 0,1,2; for Over 1 they are 0,1
    if (below(0) && below(1)) {
        const all3 = below(2);
        const prediction = all3 ? 2 : 1;
        const losing = all3 ? [0, 1, 2] : [0, 1];
        const r = rate(p, losing);
        candidates.push({
            side: 'over',
            prediction,
            recoveryPrediction: prediction + 2,
            entryDigits: OVER_ENTRY,
            losingDigits: losing,
            avgLosingPct: r.avg,
            maxLosingPct: r.max,
            deviation: r.deviation,
            strength: r.strength,
            label: `Over ${prediction}`,
            reason: all3 ? '0, 1 and 2 are all below the threshold' : '0 and 1 are below the threshold',
        });
    }

    // UNDER: losing digits for Under 7 are 7,8,9; for Under 8 they are 8,9
    if (below(8) && below(9)) {
        const all3 = below(7);
        const prediction = all3 ? 7 : 8;
        const losing = all3 ? [7, 8, 9] : [8, 9];
        const r = rate(p, losing);
        candidates.push({
            side: 'under',
            prediction,
            recoveryPrediction: prediction - 2,
            entryDigits: UNDER_ENTRY,
            losingDigits: losing,
            avgLosingPct: r.avg,
            maxLosingPct: r.max,
            deviation: r.deviation,
            strength: r.strength,
            label: `Under ${prediction}`,
            reason: all3 ? '7, 8 and 9 are all below the threshold' : '8 and 9 are below the threshold',
        });
    }

    if (!candidates.length) return null;
    // If both sides qualify, take the stronger one.
    candidates.sort(compareSignals);
    return candidates[0];
}

/** Jump indices live in their own submarket; everything else we scan is a continuous index. */
export const submarketFor = (symbol: string): string => (/^JD/i.test(symbol) ? 'jump_index' : 'random_index');

const setNum = (xml: string, id: string, val: number | string) =>
    xml.replace(new RegExp(`(<block type="math_number" id="${id}"><field name="NUM">)[^<]*`), `$1${val}`);

export interface PatchOptions {
    symbol: string; // e.g. 'R_100', '1HZ50V', 'JD25'
    stake?: number;
    martingale?: number;
    maxRuns?: number;
    maxRecoverySteps?: number;
}

/** Takes the destroyer template XML text and applies a signal to it. */
export function patchDestroyerXml(xml: string, s: DestroyerSignal, o: PatchOptions): string {
    const contract = s.side === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
    let x = xml.replace(/DIGIT(OVER|UNDER)/g, contract);
    x = x.replace(/(<field name="SYMBOL_LIST">)[^<]*/, `$1${o.symbol}`);
    x = x.replace(/(<field name="SUBMARKET_LIST">)[^<]*/, `$1${submarketFor(o.symbol)}`);
    x = setNum(x, 'b19', s.prediction);
    x = setNum(x, 'b63', s.recoveryPrediction);
    ['b22', 'b25', 'b29'].forEach((id, i) => (x = setNum(x, id, s.entryDigits[i])));
    if (o.stake !== undefined) x = setNum(x, 'b1', o.stake);
    if (o.martingale !== undefined) x = setNum(x, 'b5', o.martingale);
    if (o.maxRuns !== undefined) x = setNum(x, 'b7', o.maxRuns);
    if (o.maxRecoverySteps !== undefined) x = setNum(x, 'b9', o.maxRecoverySteps);
    return x;
}
PPS_EOF
cat > src/hooks/useDestroyerScanner.ts <<'PPS_EOF'
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { compareSignals, DEFAULT_THRESHOLD, DestroyerSignal, evaluateDestroyer } from '@/utils/destroyer-rules';
import { getDecimalPlaces, getLastDigit } from '@/utils/digit-stats';

export type TDestroyerRow = {
    symbol: string;
    display_name: string;
    digit_pct: number[]; // % of ticks for digits 0..9
    sample: number;
    scanned_at: number;
};

export type TDestroyerSignalRow = TDestroyerRow & { signal: DestroyerSignal };

const CONCURRENCY = 5;
const MIN_TICKS = 200;

type TOptions = { interval_ms?: number; ticks?: number; threshold?: number; enabled?: boolean };

/**
 * Scans every Volatility and Jump index, computes the last-digit distribution over the
 * last `ticks` ticks, and applies the Destroyer rules. Changing `threshold` re-evaluates
 * instantly without a rescan.
 */
export const useDestroyerScanner = ({
    interval_ms = 20000,
    ticks = 1000,
    threshold = DEFAULT_THRESHOLD,
    enabled = true,
}: TOptions = {}) => {
    const [rows, setRows] = useState<TDestroyerRow[]>([]);
    const [is_scanning, setIsScanning] = useState(false);
    const [last_scan, setLastScan] = useState<number | null>(null);
    const [next_scan_at, setNextScanAt] = useState<number | null>(null);
    const [refresh, setRefresh] = useState(0);

    /** Scan right away instead of waiting for the countdown. */
    const scanNow = useCallback(() => setRefresh(n => n + 1), []);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const scanSymbol = async (symbol: string, display_name: string): Promise<TDestroyerRow | null> => {
            try {
                const response: any = await (api_base.api as any).send({
                    ticks_history: symbol,
                    count: ticks,
                    end: 'latest',
                    style: 'ticks',
                });
                if (response?.error) return null;
                const prices: number[] = (response?.history?.prices || []).map((p: string) => Number(p));
                if (prices.length < MIN_TICKS) return null;
                const decimals = getDecimalPlaces(symbol);
                const counts = new Array(10).fill(0);
                prices.forEach(p => {
                    const d = getLastDigit(p, decimals);
                    if (d >= 0 && d <= 9) counts[d]++;
                });
                const total = prices.length;
                return {
                    symbol,
                    display_name,
                    digit_pct: counts.map(c => (c / total) * 100),
                    sample: total,
                    scanned_at: Date.now(),
                };
            } catch {
                return null;
            }
        };

        const run = async () => {
            if (cancelled) return;
            const markets = ((api_base?.active_symbols as any[]) || [])
                .filter(s => s.market === 'synthetic_index' && (s.submarket === 'random_index' || s.submarket === 'jump_index'))
                .map(s => ({
                    symbol: (s.symbol || s.underlying_symbol) as string,
                    display_name: (s.display_name || s.symbol) as string,
                }));

            if (!markets.length || !api_base?.api) {
                timer = setTimeout(run, 3000); // connection not ready yet, try again shortly
                return;
            }

            setIsScanning(true);
            setNextScanAt(null);
            const result: TDestroyerRow[] = [];
            for (let i = 0; i < markets.length; i += CONCURRENCY) {
                if (cancelled) return;
                const batch = markets.slice(i, i + CONCURRENCY);
                const done = await Promise.all(batch.map(m => scanSymbol(m.symbol, m.display_name)));
                done.forEach(r => r && result.push(r));
            }
            if (cancelled) return;
            setRows(result);
            setLastScan(Date.now());
            setIsScanning(false);
            setNextScanAt(Date.now() + interval_ms);
            timer = setTimeout(run, interval_ms);
        };

        run();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, interval_ms, ticks, refresh]);

    const signals = useMemo<TDestroyerSignalRow[]>(() => {
        const out: TDestroyerSignalRow[] = [];
        rows.forEach(r => {
            const signal = evaluateDestroyer(r.digit_pct, threshold);
            if (signal) out.push({ ...r, signal });
        });
        return out.sort((a, b) => compareSignals(a.signal, b.signal));
    }, [rows, threshold]);

    return { rows, signals, is_scanning, last_scan, next_scan_at, scanNow };
};
PPS_EOF
cat > src/pages/signal-scanner/signal-scanner.tsx <<'PPS_EOF'
import { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useDestroyerScanner } from '@/hooks/useDestroyerScanner';
import { DEFAULT_THRESHOLD, DestroyerStrength, FAIR_SHARE } from '@/utils/destroyer-rules';
import { generateDestroyerBotXml } from '@/utils/signal-bot-xml';
import { load } from '@/external/bot-skeleton';
import { Localize } from '@deriv-com/translations';
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

echo
echo "Done. Backups are in $B"
for f in src/utils/destroyer-rules.ts src/hooks/useDestroyerScanner.ts src/pages/signal-scanner/signal-scanner.tsx src/pages/signal-scanner/signal-scanner.scss src/xml/sammee_destroyer.xml; do
  [ -s "$f" ] && echo "OK  $f" || echo "MISSING $f"
done
