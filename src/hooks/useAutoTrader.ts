import { useCallback, useEffect, useRef, useState } from 'react';
import { load } from '@/external/bot-skeleton';
import { scanMarkets, useDestroyerScanner } from '@/hooks/useDestroyerScanner';
import {
    AUTOPILOT_SEQUENCE,
    AutopilotMarket,
    MarketDigits,
    SignalFilter,
    evenOddRuns,
    pickAutopilotMarket,
    pickEvenOdd,
    pickMatches,
    pickSmartSignal,
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
    maxRecovery: number; // Even/Odd: recovery trades allowed (the stake multiplies after each loss)
    threshold: number;
    minStrength: DestroyerStrength; // SmartScan only
    allowReal: boolean;
    maxGap: number; // Matches: largest % gap between the two most frequent digits
    maxTries: number; // Matches: tries on one market before scanning again
    runsPerScan: number; // SmartScan: winning runs on one market before scanning again
    signalFilter: SignalFilter; // SmartScan: Over 1, Under 8, or both
    confirmEvery: boolean; // SmartScan: wait for hit + confirmation before every trade, not just the first
    recoverySteps: number; // SmartScan / Autopilot: recovery trades allowed while recovering at a flat stake
    evenOddRecovery: 'same' | 'flip'; // Even/Odd: recover on the same side, or flip to the other side
}

export const DEFAULT_AUTO_CONFIG: TAutoConfig = {
    stake: 1,
    martingale: 2,
    takeProfit: 5,
    stopLoss: 15,
    maxRuns: 100,
    maxRecovery: 4,
    threshold: 10.5,
    minStrength: 'good',
    allowReal: false,
    maxGap: 0.5,
    maxTries: 30,
    runsPerScan: 20,
    signalFilter: 'both',
    confirmEvery: false,
    recoverySteps: 6,
    evenOddRecovery: 'same',
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
const RECOVERED_MSG = 'LOSS_RECOVERED';
const SINGLE_BOT_MAX_MS = 5 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const round2 = (n: number) => Math.round(n * 100) / 100;
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

/**
 * Watches the live stats of one bot run. When the first loss shows up it remembers the profit level the bot was at
 * just before that loss; `recovered` is true once the profit is back at (or above) that level.
 */
const makeRecoveryTracker = () => {
    let seen: TStats = { won: 0, lost: 0, profit: 0 };
    let target: number | null = null;
    return {
        observe(live: TStats) {
            if (live.won < seen.won || live.lost < seen.lost) {
                seen = { won: live.won, lost: live.lost, profit: live.profit }; // summary was reset
                return;
            }
            if (target === null && live.lost > seen.lost) target = seen.profit;
            seen = { won: live.won, lost: live.lost, profit: live.profit };
        },
        get recovered() {
            return target !== null && seen.profit >= target - 0.005;
        },
    };
};

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
            await sleep(1000);
        }
        throw new Error('Could not read market data. Check your connection.');
    };

    const ensureWorkspace = async () => {
        if (!window.location.hash.includes('bot_builder')) window.location.hash = 'bot_builder';
        for (let i = 0; i < 80; i++) {
            const ws = window.Blockly?.derivWorkspace;
            if (ws) return ws;
            await sleep(125);
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
        await sleep(350);
        checkActive();

        await run_panel.onRunButtonClick();

        let started = false;
        for (let i = 0; i < 150; i++) {
            if (isRunning()) {
                started = true;
                break;
            }
            await sleep(100);
            checkActive();
        }
        if (!started) throw new Error('The bot did not start. Press Run manually once to check for a pop-up.');

        let stopReason: string | null = null;
        const t0 = Date.now();
        while (isRunning() || run_panel?.has_open_contract) {
            await sleep(150);
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
        await sleep(600); // let the transaction list update

        return { ...diff(before, readStats()), stopReason };
    };

    const botFor = (spec: BotSpec) => generateBotXml(spec);

    /* ---------- SmartScan (Over 1 / Under 8) and Even/Odd ----------
     * Scan once and trade that market on every tick. After a loss, recover on the same market inside the bot,
     * and only then scan again and switch to the best market. */

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
            let runs = 0;
            let untilRecovered = false;
            let note = '';

            if (m === 'smartscan') {
                const best = pickSmartSignal(rows, c.threshold, c.minStrength, c.signalFilter);
                if (best) {
                    const over = best.signal.side === 'over';
                    const barrier = best.signal.prediction; // Over 1 or Under 8
                    const recBarrier = over ? 2 : 7; // recover with Over 2 / Under 7
                    runs = Math.max(1, Math.round(c.runsPerScan));
                    untilRecovered = true;
                    title = `${best.signal.label} on ${best.display_name} (${best.signal.strength})`;
                    note = over
                        ? `Waits for 0 or 1, then an over digit. After a loss: Over 2 until recovered.`
                        : `Waits for 8 or 9, then an under digit. After a loss: Under 7 until recovered.`;
                    spec = {
                        symbol: best.symbol,
                        kind: best.signal.side,
                        prediction: barrier,
                        stake: c.stake,
                        loop: 'recover',
                        martingale: c.martingale,
                        maxRuns: runs,
                        confirm: { side: best.signal.side, barrier, every: c.confirmEvery },
                        recovery: {
                            barrier: recBarrier,
                            winsNeeded: 1,
                            untilRecovered: true,
                            maxSteps: Math.max(1, Math.round(c.recoverySteps)),
                            escalate: false,
                        },
                    };
                }
            } else {
                const p = pickEvenOdd(rows);
                if (p) {
                    runs = evenOddRuns(p.topPct);
                    const flip = c.evenOddRecovery === 'flip';
                    const other = p.side === 'even' ? 'Odd' : 'Even';
                    title = `${p.side === 'even' ? 'Even' : 'Odd'} on ${p.display_name} (even ${p.evenPct.toFixed(1)}% vs odd ${p.oddPct.toFixed(1)}%)`;
                    note = flip ? `After a loss: ${other} on this market, then back.` : 'After a loss: same side again.';
                    spec = {
                        symbol: p.symbol,
                        kind: p.side,
                        stake: c.stake,
                        loop: 'recover',
                        martingale: c.martingale,
                        maxRuns: runs,
                        recovery: { flip, winsNeeded: 1, maxSteps: c.maxRecovery, escalate: true },
                    };
                }
            }

            if (!spec) {
                waits += 1;
                setStage('No market fits yet. Scanning again in 5s…');
                if (waits === 1 || waits % 12 === 0) addLog('info', 'No market fits the rules yet. Scanning again soon.');
                await sleepActive(5000);
                continue;
            }
            waits = 0;

            addLog('info', `${title}. ${runs} runs. ${note}`);
            setStage(`Trading ${title}`);
            const tracker = makeRecoveryTracker();
            const r = await runBot(
                botFor(spec),
                `AI - ${title}`,
                live => {
                    tracker.observe(live);
                    // SmartScan recovery keeps trading until the profit is back where it was before the loss
                    if (untilRecovered && tracker.recovered) return RECOVERED_MSG;
                    return limitHit(c, live);
                },
                Infinity
            );
            tracker.observe(r);
            commit(r);

            if (r.stopReason && r.stopReason !== RECOVERED_MSG) {
                addLog('warn', r.stopReason);
                return;
            }
            if (!activeRef.current) return;

            if (r.won + r.lost === 0) {
                noResult += 1;
                addLog('warn', 'The bot finished without a result. Check the Journal tab.');
                if (noResult >= 2) {
                    addLog('bad', 'Stopped: two bots in a row produced no result.');
                    return;
                }
                continue;
            }
            noResult = 0;

            if (r.lost === 0) {
                addLog('good', `${r.won} runs won. Session ${signed(sess.current.pnl)}. Scanning for the best market.`);
            } else if (untilRecovered) {
                // The bot ends when the loss is recovered, or when it runs out of recovery trades.
                if (tracker.recovered) {
                    addLog('good', `Loss recovered. Session ${signed(sess.current.pnl)}. Scanning for the best market.`);
                } else {
                    addLog('bad', `Stopped: ${c.recoverySteps} recovery trades did not recover the loss. Session ${signed(sess.current.pnl)}.`);
                    return;
                }
            } else if (r.lost >= c.maxRecovery + 1) {
                addLog('bad', `Stopped: the loss and ${c.maxRecovery} recovery trades in a row did not win. Session ${signed(sess.current.pnl)}.`);
                return;
            } else {
                addLog('good', `Recovered after ${r.lost} loss${r.lost === 1 ? '' : 'es'}. Session ${signed(sess.current.pnl)}. Scanning for the best market.`);
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
                setStage(`No market has its top two digits within ${c.maxGap}%. Scanning again in 5s…`);
                if (waits === 1 || waits % 12 === 0) addLog('info', `No market has its top two digits within ${c.maxGap} points yet.`);
                await sleepActive(5000);
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

    /* ---------- Autopilot: Differs -> Over 1 -> Over 2 on ONE volatility ----------
     * After a loss it recovers with Over 2 on the same volatility until the loss is recovered. */

    const runAutopilot = async (c: TAutoConfig) => {
        let rows = await scanOnce();
        let market: AutopilotMarket | null = null;
        let step = 0;
        let debt = 0; // money still to win back (negative while recovering)
        let recoveryTrades = 0;
        let recoveryStake = 0;
        let waits = 0;
        let noResult = 0;

        while (activeRef.current) {
            const lim = limitHit(c);
            if (lim) {
                addLog('warn', lim);
                return;
            }

            const recovering = debt < 0;
            if (!market) {
                market = pickAutopilotMarket(rows, c.threshold);
                if (!market) {
                    waits += 1;
                    setStage('No volatility fits yet. Scanning again in 5s…');
                    if (waits === 1 || waits % 12 === 0) addLog('info', 'No volatility has digits 0 and 1 below the threshold yet. Scanning again soon.');
                    await sleepActive(5000);
                    rows = await scanOnce();
                    continue;
                }
                waits = 0;
                step = 0;
                addLog('info', `One volatility for every step: ${market.display_name}.`);
            }

            let spec: BotSpec;
            let title: string;
            let stake = c.stake;

            if (recovering) {
                stake = recoveryStake;
                title = `Recovery Over 2 on ${market.display_name}`;
                spec = { symbol: market.symbol, kind: 'over', prediction: 2, stake, loop: 'single' };
            } else {
                const kind = AUTOPILOT_SEQUENCE[step % AUTOPILOT_SEQUENCE.length];
                if (kind === 'differs') {
                    title = `Differs ${market.differsDigit} on ${market.display_name} (digit at ${market.differsPct.toFixed(1)}%)`;
                    spec = { symbol: market.symbol, kind: 'differs', prediction: market.differsDigit, stake, loop: 'single' };
                } else if (kind === 'over1') {
                    title = `Over 1 on ${market.display_name}`;
                    spec = { symbol: market.symbol, kind: 'over', prediction: 1, stake, loop: 'single' };
                } else if (market.over2Ok) {
                    title = `Over 2 on ${market.display_name}`;
                    spec = { symbol: market.symbol, kind: 'over', prediction: 2, stake, loop: 'single' };
                } else {
                    addLog('info', 'Digit 2 is not low enough on this volatility, so Over 2 is skipped.');
                    step += 1;
                    continue;
                }
            }

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

            if (recovering) {
                recoveryTrades += 1;
                debt = round2(debt + r.profit);
                if (debt >= 0) {
                    addLog('good', `Loss recovered. Session ${signed(sess.current.pnl)}. Scanning for the next volatility.`);
                    debt = 0;
                    recoveryTrades = 0;
                    market = null;
                    rows = await scanOnce();
                } else if (recoveryTrades >= c.recoverySteps) {
                    addLog('bad', `Stopped: ${c.recoverySteps} recovery trades did not recover the loss. Session ${signed(sess.current.pnl)}.`);
                    return;
                } else {
                    addLog(r.profit >= 0 ? 'good' : 'bad', `Recovery trade ${signed(r.profit)}. Still ${Math.abs(debt).toFixed(2)} to recover.`);
                }
            } else if (r.lost > 0) {
                debt = round2(r.profit); // negative: the amount lost
                recoveryTrades = 0;
                recoveryStake = round2(c.stake * c.martingale);
                addLog('bad', `Loss ${r.profit.toFixed(2)}. Recovering with Over 2 at stake ${recoveryStake.toFixed(2)} on the same volatility.`);
                step += 1;
            } else {
                addLog('good', `Win ${signed(r.profit)}. Session ${signed(sess.current.pnl)}.`);
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
