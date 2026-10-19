import { useCallback, useEffect, useRef, useState } from 'react';
import { load } from '@/external/bot-skeleton';
import { scanMarkets, useDestroyerScanner } from '@/hooks/useDestroyerScanner';
import {
    AUTOPILOT_SEQUENCE,
    EvenOddRecoveryPick,
    MarketDigits,
    OverPick,
    pickBestSignal,
    pickDiffers,
    pickEvenOdd,
    pickEvenOddRecovery,
    pickMatches,
    pickOver,
    pickRecovery,
} from '@/utils/autopilot-rules';
import { BotSpec } from '@/utils/bot-xml-builder';
import { DestroyerStrength } from '@/utils/destroyer-rules';
import { generateBotXml } from '@/utils/signal-bot-xml';
import { useStore as useStore_ } from '@/hooks/useStore';

export type TMode = 'smartscan' | 'evenodd' | 'matches' | 'autopilot';
export type TStatus = 'idle' | 'running' | 'stopping';

export interface TAutoConfig {
    stake: number;
    martingale: number;
    takeProfit: number; // stop when session profit reaches this
    stopLoss: number; // stop when session loss reaches this
    maxRuns: number; // stop after this many trades
    maxRecovery: number; // recovery trades allowed in a row
    threshold: number;
    minStrength: DestroyerStrength; // SmartScan only
    allowReal: boolean;
    maxGap: number; // Matches: largest % gap between the two most frequent digits
    maxTries: number; // Matches: tries on one market before scanning again
    recovery: 'evenodd' | 'over'; // Autopilot recovery type
}

export const DEFAULT_AUTO_CONFIG: TAutoConfig = {
    stake: 1,
    martingale: 2,
    takeProfit: 5,
    stopLoss: 15,
    maxRuns: 100,
    maxRecovery: 3,
    threshold: 10.5,
    minStrength: 'good',
    allowReal: false,
    maxGap: 0.5,
    maxTries: 30,
    recovery: 'evenodd',
};

export type TLogKind = 'info' | 'good' | 'bad' | 'warn';
export interface TLogLine {
    id: number;
    t: number;
    kind: TLogKind;
    msg: string;
}

interface TStats {
    won: number;
    lost: number;
    profit: number;
}

const STOP_MSG = 'AUTO_TRADE_STOPPED';
const TRIES_MSG = 'NO_MATCH_IN_TRIES';
const SINGLE_BOT_MAX_MS = 5 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const round2 = (n: number) => Math.round(n * 100) / 100;
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

export const useAutoTrader = (cfg: TAutoConfig, panel_open: boolean) => {
    const store: any = useStore_();
    const { client, run_panel, transactions } = store;

    const [status, setStatus] = useState<TStatus>('idle');
    const [mode, setMode] = useState<TMode | null>(null);
    const [stage, setStage] = useState('');
    const [pnl, setPnl] = useState(0);
    const [trades, setTrades] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    const [log, setLog] = useState<TLogLine[]>([]);

    // The background scanner only runs while the panel is open and nothing is trading.
    const scan = useDestroyerScanner({ threshold: cfg.threshold, enabled: panel_open && status === 'idle' });

    const cfgRef = useRef(cfg);
    const activeRef = useRef(false);
    const logId = useRef(0);
    const sess = useRef({ pnl: 0, wins: 0, losses: 0 });
    cfgRef.current = cfg;

    const addLog = useCallback((kind: TLogKind, msg: string) => {
        logId.current += 1;
        setLog(prev => [...prev.slice(-39), { id: logId.current, t: Date.now(), kind, msg }]);
    }, []);

    const checkActive = () => {
        if (!activeRef.current) throw new Error(STOP_MSG);
    };

    const sleepActive = async (ms: number) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            await sleep(400);
            checkActive();
        }
    };

    /* ---------- session numbers ---------- */

    const publish = (live?: TStats) => {
        const p = sess.current.pnl + (live?.profit ?? 0);
        const w = sess.current.wins + (live?.won ?? 0);
        const l = sess.current.losses + (live?.lost ?? 0);
        setPnl(round2(p));
        setWins(w);
        setLosses(l);
        setTrades(w + l);
    };

    const commit = (r: TStats) => {
        sess.current.pnl = round2(sess.current.pnl + r.profit);
        sess.current.wins += r.won;
        sess.current.losses += r.lost;
        publish();
    };

    /** Returns a reason to stop (take profit, stop loss, max trades), or null. */
    const limitHit = (c: TAutoConfig, live?: TStats): string | null => {
        const p = sess.current.pnl + (live?.profit ?? 0);
        const n = sess.current.wins + sess.current.losses + (live ? live.won + live.lost : 0);
        if (p >= c.takeProfit) return `Take profit reached (${signed(p)}).`;
        if (p <= -c.stopLoss) return `Stop loss reached (${signed(p)}).`;
        if (n >= c.maxRuns) return `Max trades reached (${c.maxRuns}).`;
        return null;
    };

    /* ---------- talking to the app ---------- */

    const readStats = (): TStats => {
        const s: any = transactions?.statistics ?? {};
        return {
            won: Number(s.won_contracts) || 0,
            lost: Number(s.lost_contracts) || 0,
            profit: Number(s.total_profit) || 0,
        };
    };

    // Handles the summary being reset (counts drop) by treating the new values as the change.
    const diff = (before: TStats, after: TStats): TStats => {
        const intact = after.won >= before.won && after.lost >= before.lost;
        return intact
            ? { won: after.won - before.won, lost: after.lost - before.lost, profit: after.profit - before.profit }
            : { ...after };
    };

    const isRunning = () => !!run_panel?.is_running;

    const scanOnce = async (): Promise<MarketDigits[]> => {
        setStage('Scanning markets…');
        for (let i = 0; i < 20; i++) {
            checkActive();
            const r = await scanMarkets(1000, () => !activeRef.current);
            checkActive();
            if (r && r.length) return r;
            await sleep(1500);
        }
        throw new Error('Could not read market data. Check your connection.');
    };

    const ensureWorkspace = async () => {
        if (!window.location.hash.includes('bot_builder')) window.location.hash = 'bot_builder';
        for (let i = 0; i < 40; i++) {
            const ws = window.Blockly?.derivWorkspace;
            if (ws) return ws;
            await sleep(250);
            checkActive();
        }
        throw new Error('The Bot Builder workspace did not open.');
    };

    /**
     * Loads one bot, presses Run and waits until it stops. `monitor` is checked about 3 times a second
     * and can return a reason to stop the bot early (take profit, stop loss, ...).
     */
    const runBot = async (
        xml: string,
        name: string,
        monitor?: (live: TStats) => string | null,
        maxMs = SINGLE_BOT_MAX_MS
    ) => {
        const workspace = await ensureWorkspace();
        const before = readStats();

        await load({
            block_string: xml,
            file_name: name,
            strategy_id: null,
            workspace,
            from: 'auto_trader',
            drop_event: {},
            showIncompatibleStrategyDialog: false,
            show_snackbar: false,
        });
        workspace.strategy_to_load = xml;
        await sleep(700);
        checkActive();

        await run_panel.onRunButtonClick();

        let started = false;
        for (let i = 0; i < 75; i++) {
            if (isRunning()) {
                started = true;
                break;
            }
            await sleep(200);
            checkActive();
        }
        if (!started) throw new Error('The bot did not start. Press Run manually once to check for a pop-up.');

        let stopReason: string | null = null;
        const t0 = Date.now();
        while (isRunning() || run_panel?.has_open_contract) {
            await sleep(300);
            if (!activeRef.current) break;
            if (monitor && !stopReason) {
                const live = diff(before, readStats());
                publish(live);
                const reason = monitor(live);
                if (reason) {
                    stopReason = reason;
                    run_panel.stopBot();
                }
            }
            if (Date.now() - t0 > maxMs) {
                run_panel.stopBot();
                throw new Error('The bot ran longer than expected, so it was stopped.');
            }
        }
        await sleep(1000); // let the transaction list update

        return { ...diff(before, readStats()), stopReason };
    };

    const botFor = (spec: BotSpec) => generateBotXml(spec);

    /* ---------- recovery: Even/Odd (or Over 3/4 for Autopilot) ---------- */

    const recoverEvenOdd = async (c: TAutoConfig): Promise<boolean> => {
        setStage('Loss. Scanning for an Even/Odd recovery market…');
        const rows = await scanOnce();
        const pick = pickEvenOddRecovery(rows);
        if (!pick) {
            addLog('bad', 'Stopped: no market data for recovery.');
            return false;
        }
        const label = `${pick.side === 'even' ? 'Even' : 'Odd'} on ${pick.display_name}`;
        addLog(
            'info',
            pick.strict
                ? `Recovery market: ${label} (its five most frequent digits are all ${pick.side}, ${pick.total.toFixed(1)}%).`
                : `Recovery market: ${label} (no market had all five top digits ${pick.side}, so this is the strongest ${pick.side} lean, ${pick.total.toFixed(1)}%).`
        );

        let stake = round2(c.stake * c.martingale);
        for (let step = 1; step <= c.maxRecovery; step++) {
            checkActive();
            const lim = limitHit(c);
            if (lim) {
                addLog('warn', lim);
                return false;
            }
            setStage(`Recovery ${step}/${c.maxRecovery}: ${label}, stake ${stake.toFixed(2)}`);
            const r = await runBot(
                botFor({ symbol: pick.symbol, kind: pick.side, stake, loop: 'single' }),
                `Recovery ${step} - ${label}`
            );
            commit(r);
            if (r.won > 0) {
                addLog('good', `Recovery won ${signed(r.profit)}. Session ${signed(sess.current.pnl)}.`);
                return true;
            }
            if (r.lost === 0) {
                addLog('bad', 'Stopped: the recovery trade produced no result. Check the Journal tab.');
                return false;
            }
            addLog('bad', `Recovery ${step} lost ${r.profit.toFixed(2)}.`);
            stake = round2(stake * c.martingale);
        }
        addLog('bad', `Stopped: ${c.maxRecovery} recovery trades in a row did not win.`);
        return false;
    };

    /* ---------- SmartScan (Over/Under) and Even/Odd: scan once, trade every tick until a loss ---------- */

    const runContinuous = async (c: TAutoConfig, m: 'smartscan' | 'evenodd') => {
        let waits = 0;
        let noResult = 0;
        while (activeRef.current) {
            const lim = limitHit(c);
            if (lim) {
                addLog('warn', lim);
                return;
            }

            const rows = await scanOnce();
            let spec: BotSpec | null = null;
            let title = '';

            if (m === 'smartscan') {
                const best = pickBestSignal(rows, c.threshold, c.minStrength);
                if (best) {
                    title = `${best.signal.label} on ${best.display_name} (${best.signal.strength})`;
                    spec = {
                        symbol: best.symbol,
                        kind: best.signal.side,
                        prediction: best.signal.prediction,
                        stake: c.stake,
                        loop: 'untilLoss',
                        entryDigits: best.signal.entryDigits,
                    };
                }
            } else {
                const p = pickEvenOdd(rows);
                if (p) {
                    title = `${p.side === 'even' ? 'Even' : 'Odd'} on ${p.display_name} (top digit ${p.topDigit} at ${p.topPct.toFixed(1)}%, entry on ${p.entryDigit})`;
                    spec = { symbol: p.symbol, kind: p.side, stake: c.stake, loop: 'untilLoss', entryDigits: [p.entryDigit] };
                }
            }

            if (!spec) {
                waits += 1;
                setStage('No market fits yet. Scanning again in 15s…');
                if (waits === 1 || waits % 6 === 0) addLog('info', 'No market fits the rules yet. Scanning again soon.');
                await sleepActive(15000);
                continue;
            }
            waits = 0;

            addLog('info', `${title}. Trading every tick until a loss.`);
            setStage(`Trading ${title}`);
            const r = await runBot(botFor(spec), `AI - ${title}`, live => limitHit(c, live), Infinity);
            commit(r);

            if (r.stopReason) {
                addLog('warn', r.stopReason);
                return;
            }
            if (!activeRef.current) return;

            if (r.lost > 0) {
                noResult = 0;
                addLog('bad', `Loss after ${r.won} win${r.won === 1 ? '' : 's'}. Session ${signed(sess.current.pnl)}. Recovering.`);
                const ok = await recoverEvenOdd(c);
                if (!ok) return;
            } else if (r.won === 0) {
                noResult += 1;
                addLog('warn', 'The bot finished without a result. Check the Journal tab.');
                if (noResult >= 2) {
                    addLog('bad', 'Stopped: two bots in a row produced no result.');
                    return;
                }
            }
        }
    };

    /* ---------- Matches ---------- */

    const runMatches = async (c: TAutoConfig) => {
        let waits = 0;
        while (activeRef.current) {
            const lim = limitHit(c);
            if (lim) {
                addLog('warn', lim);
                return;
            }
            const rows = await scanOnce();
            const p = pickMatches(rows, c.maxGap);
            if (!p) {
                waits += 1;
                setStage(`No market has its top two digits within ${c.maxGap}%. Scanning again in 15s…`);
                if (waits === 1 || waits % 6 === 0) addLog('info', `No market has its top two digits within ${c.maxGap} points yet.`);
                await sleepActive(15000);
                continue;
            }
            waits = 0;
            const title = `Match ${p.matchDigit} on ${p.display_name} (entry ${p.entryDigit}, gap ${p.gap.toFixed(2)})`;
            addLog('info', `${title}. Retrying until it matches, up to ${c.maxTries} tries.`);
            setStage(`Trading ${title}`);
            const r = await runBot(
                botFor({
                    symbol: p.symbol,
                    kind: 'matches',
                    prediction: p.matchDigit,
                    stake: c.stake,
                    loop: 'untilWin',
                    entryDigits: [p.entryDigit],
                }),
                `AI - ${title}`,
                live => limitHit(c, live) ?? (live.lost >= c.maxTries ? TRIES_MSG : null),
                Infinity
            );
            commit(r);

            if (r.stopReason === TRIES_MSG) {
                addLog('warn', `No match in ${c.maxTries} tries. Scanning again.`);
                continue;
            }
            if (r.stopReason) {
                addLog('warn', r.stopReason);
                return;
            }
            if (!activeRef.current) return;
            if (r.won > 0) addLog('good', `Match after ${r.lost + r.won} tries. Session ${signed(sess.current.pnl)}.`);
        }
    };

    /* ---------- Autopilot: Differs -> Over 1 -> Over 2, with recovery ---------- */

    const runAutopilot = async (c: TAutoConfig) => {
        let rows = await scanOnce();
        let step = 0;
        let recoveryCount = 0;
        let stake = c.stake;
        let skips = 0;
        let rescans = 0;
        let noResult = 0;
        let recPick: EvenOddRecoveryPick | OverPick | null = null;

        while (activeRef.current) {
            const lim = limitHit(c);
            if (lim) {
                addLog('warn', lim);
                return;
            }

            const recovering = recoveryCount > 0;
            let spec: BotSpec | null = null;
            let title = '';

            if (recovering) {
                if (!recPick) {
                    setStage('Loss. Scanning for a recovery market…');
                    rows = await scanOnce();
                    recPick = c.recovery === 'evenodd' ? pickEvenOddRecovery(rows) : pickRecovery(rows, c.threshold);
                    if (!recPick) {
                        addLog('bad', 'Stopped: no market met the recovery conditions.');
                        return;
                    }
                }
                if ('level' in recPick) {
                    title = `Recovery Over ${recPick.level} on ${recPick.display_name}`;
                    spec = { symbol: recPick.symbol, kind: 'over', prediction: recPick.level, stake, loop: 'single', entryDigits: [5, 6, 7] };
                } else {
                    title = `Recovery ${recPick.side === 'even' ? 'Even' : 'Odd'} on ${recPick.display_name}${recPick.strict ? '' : ' (best lean)'}`;
                    spec = { symbol: recPick.symbol, kind: recPick.side, stake, loop: 'single' };
                }
            } else {
                const kind = AUTOPILOT_SEQUENCE[step % AUTOPILOT_SEQUENCE.length];
                if (kind === 'differs') {
                    const p = pickDiffers(rows);
                    if (p) {
                        title = `Differs ${p.digit} on ${p.display_name} (digit at ${p.pct.toFixed(1)}%)`;
                        spec = { symbol: p.symbol, kind: 'differs', prediction: p.digit, stake, loop: 'single' };
                    }
                } else {
                    const level = kind === 'over1' ? 1 : 2;
                    const p = pickOver(rows, level, c.threshold);
                    if (p) {
                        title = `Over ${level} on ${p.display_name} (${p.strength})`;
                        spec = { symbol: p.symbol, kind: 'over', prediction: level, stake, loop: 'single', entryDigits: [2, 5, 6] };
                    }
                }
            }

            if (!spec) {
                skips += 1;
                step += 1;
                if (skips >= AUTOPILOT_SEQUENCE.length) {
                    rescans += 1;
                    if (rescans > 3) {
                        addLog('bad', 'Stopped: no step found a suitable market after 3 rescans.');
                        return;
                    }
                    addLog('warn', 'No step fits the current scan. Scanning again.');
                    await sleepActive(10000);
                    rows = await scanOnce();
                    skips = 0;
                }
                continue;
            }
            skips = 0;
            rescans = 0;

            addLog('info', `${title}, stake ${stake.toFixed(2)}`);
            setStage(`Trading: ${title}`);
            const r = await runBot(botFor(spec), `Autopilot - ${title}`);
            commit(r);

            if (r.won + r.lost === 0) {
                noResult += 1;
                addLog('warn', 'That trade finished without a result. Check the Journal tab.');
                if (noResult >= 2) {
                    addLog('bad', 'Stopped: two trades in a row produced no result.');
                    return;
                }
                continue;
            }
            noResult = 0;

            if (r.won > 0 && r.lost === 0) {
                addLog('good', `Win ${signed(r.profit)}. Session ${signed(sess.current.pnl)}.`);
                if (recovering) {
                    addLog('good', 'Recovery complete. Scanning again and back to the normal sequence.');
                    recoveryCount = 0;
                    recPick = null;
                    stake = c.stake;
                    rows = await scanOnce();
                }
                step += 1;
            } else {
                recoveryCount += 1;
                addLog('bad', `Loss ${r.profit.toFixed(2)}. Session ${signed(sess.current.pnl)}.`);
                if (recoveryCount > c.maxRecovery) {
                    addLog('bad', `Stopped: ${c.maxRecovery} recovery trades in a row did not win it back.`);
                    return;
                }
                stake = round2(stake * c.martingale);
                step += 1;
            }
        }
    };

    /* ---------- start / stop ---------- */

    const NAMES: Record<TMode, string> = {
        smartscan: 'SmartScan',
        evenodd: 'Even/Odd',
        matches: 'Matches',
        autopilot: 'Autopilot',
    };

    const start = useCallback(
        async (m: TMode) => {
            if (activeRef.current) return;
            const c = { ...cfgRef.current };

            if (!client?.is_logged_in) {
                addLog('bad', 'Log in first. The bot needs an account to trade on.');
                return;
            }
            const real = !client.is_virtual;
            if (real && !c.allowReal) {
                addLog('bad', 'This is a REAL money account. Switch to your demo account, or tick "Allow real money".');
                return;
            }
            if (!(c.stake > 0)) {
                addLog('bad', 'Enter a stake.');
                return;
            }
            if (
                real &&
                !window.confirm(
                    `REAL MONEY: ${NAMES[m]} will place trades by itself.\nStake ${c.stake}, take profit ${c.takeProfit}, stop loss ${c.stopLoss}.\n\nStart?`
                )
            ) {
                return;
            }

            activeRef.current = true;
            sess.current = { pnl: 0, wins: 0, losses: 0 };
            publish();
            setMode(m);
            setStatus('running');
            addLog('info', `${NAMES[m]} started on ${client.is_virtual ? 'DEMO' : 'REAL'} account.`);

            try {
                if (m === 'smartscan' || m === 'evenodd') await runContinuous(c, m);
                else if (m === 'matches') await runMatches(c);
                else await runAutopilot(c);
            } catch (e: any) {
                if (e?.message === STOP_MSG) addLog('info', 'Stopped by you.');
                else addLog('bad', e?.message || 'Something went wrong, so it stopped.');
            } finally {
                activeRef.current = false;
                setStatus('idle');
                setStage('');
                try {
                    if (isRunning()) run_panel.stopBot();
                } catch {
                    /* nothing to stop */
                }
                addLog('info', `Finished. Session ${signed(sess.current.pnl)}.`);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [client, run_panel, transactions]
    );

    const stop = useCallback(() => {
        if (!activeRef.current) return;
        activeRef.current = false;
        setStatus('stopping');
        try {
            if (run_panel?.is_running) run_panel.stopBot();
        } catch {
            /* ignore */
        }
    }, [run_panel]);

    useEffect(
        () => () => {
            activeRef.current = false; // leaving the page ends the loop
        },
        []
    );

    return { status, mode, stage, pnl, trades, wins, losses, log, start, stop, scan, currency: client?.currency || '' };
};
