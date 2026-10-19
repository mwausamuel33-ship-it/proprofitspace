import { useCallback, useEffect, useRef, useState } from 'react';
import { load } from '@/external/bot-skeleton';
import { useDestroyerScanner } from '@/hooks/useDestroyerScanner';
import { useStore } from '@/hooks/useStore';
import {
    AUTOPILOT_SEQUENCE,
    MarketDigits,
    pickBestSignal,
    pickDiffers,
    pickOver,
    pickRecovery,
} from '@/utils/autopilot-rules';
import { DestroyerStrength } from '@/utils/destroyer-rules';
import { generateAutopilotBotXml, generateDestroyerBotXml } from '@/utils/signal-bot-xml';
import { assessStake } from '@/utils/stake-guard';

export type TMode = 'smartscan' | 'autopilot';
export type TStatus = 'idle' | 'running' | 'stopping';

export interface TAutoConfig {
    stake: number;
    martingale: number;
    takeProfit: number; // stop when session profit reaches this
    stopLoss: number; // stop when session loss reaches this
    maxRuns: number; // SmartScan: bots to run. Autopilot: trades to place.
    maxRecovery: number; // Autopilot: recovery trades allowed in a row
    threshold: number;
    minStrength: DestroyerStrength; // SmartScan only
    allowReal: boolean;
}

export const DEFAULT_AUTO_CONFIG: TAutoConfig = {
    stake: 1,
    martingale: 2,
    takeProfit: 5,
    stopLoss: 15,
    maxRuns: 6,
    maxRecovery: 3,
    threshold: 10.5,
    minStrength: 'good',
    allowReal: false,
};

export type TLogKind = 'info' | 'good' | 'bad' | 'warn';
export interface TLogLine {
    id: number;
    t: number;
    kind: TLogKind;
    msg: string;
}

const MAX_RUN_MS = 5 * 60 * 1000; // a single bot must finish within 5 minutes
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const round2 = (n: number) => Math.round(n * 100) / 100;

const STOP_MSG = 'AUTO_TRADE_STOPPED';

export const useAutoTrader = (cfg: TAutoConfig, panel_open: boolean) => {
    const store: any = useStore();
    const { client, run_panel, transactions } = store;

    const [status, setStatus] = useState<TStatus>('idle');
    const [mode, setMode] = useState<TMode | null>(null);
    const [stage, setStage] = useState('');
    const [pnl, setPnl] = useState(0);
    const [trades, setTrades] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    const [log, setLog] = useState<TLogLine[]>([]);

    const scan = useDestroyerScanner({ threshold: cfg.threshold, enabled: panel_open || status !== 'idle' });

    // Latest values for the long-running loop (it must not read stale closures).
    const rowsRef = useRef<MarketDigits[]>([]);
    const lastScanRef = useRef<number | null>(null);
    const scanNowRef = useRef(scan.scanNow);
    const cfgRef = useRef(cfg);
    const activeRef = useRef(false);
    const logId = useRef(0);
    rowsRef.current = scan.rows;
    lastScanRef.current = scan.last_scan;
    scanNowRef.current = scan.scanNow;
    cfgRef.current = cfg;

    const addLog = useCallback((kind: TLogKind, msg: string) => {
        logId.current += 1;
        setLog(prev => [...prev.slice(-39), { id: logId.current, t: Date.now(), kind, msg }]);
    }, []);

    const checkActive = () => {
        if (!activeRef.current) throw new Error(STOP_MSG);
    };

    /* ---------- helpers that talk to the app ---------- */

    const readStats = () => {
        const s: any = transactions?.statistics ?? {};
        return {
            won: Number(s.won_contracts) || 0,
            lost: Number(s.lost_contracts) || 0,
            profit: Number(s.total_profit) || 0,
        };
    };

    const isRunning = () => !!run_panel?.is_running;

    const freshRows = async (): Promise<MarketDigits[]> => {
        const age = Date.now() - (lastScanRef.current ?? 0);
        if (lastScanRef.current && age < 15000) return rowsRef.current;
        const before = lastScanRef.current;
        scanNowRef.current();
        const t0 = Date.now();
        while (Date.now() - t0 < 45000) {
            await sleep(500);
            checkActive();
            if (lastScanRef.current && lastScanRef.current !== before) break;
        }
        return rowsRef.current;
    };

    const waitNextScan = async () => {
        const before = lastScanRef.current;
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
            await sleep(500);
            checkActive();
            if (lastScanRef.current !== before) return;
        }
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

    /** Loads one bot, presses Run, waits until it finishes, and returns what happened. */
    const runBot = async (xml: string, name: string) => {
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
        await sleep(1200);
        checkActive();

        await run_panel.onRunButtonClick();

        let started = false;
        for (let i = 0; i < 60; i++) {
            if (isRunning()) {
                started = true;
                break;
            }
            await sleep(250);
            checkActive();
        }
        if (!started) throw new Error('The bot did not start. Press Run manually once to check for a pop-up.');

        const t0 = Date.now();
        while (isRunning() || run_panel?.has_open_contract) {
            await sleep(500);
            if (!activeRef.current) break;
            if (Date.now() - t0 > MAX_RUN_MS) {
                run_panel.stopBot();
                throw new Error('The bot ran for over 5 minutes, so it was stopped.');
            }
        }
        await sleep(2000); // let the transaction list update

        const after = readStats();
        const dWon = after.won >= before.won ? after.won - before.won : after.won;
        const dLost = after.lost >= before.lost ? after.lost - before.lost : after.lost;
        const dProfit = after.profit >= before.profit || dWon + dLost > 0 ? after.profit - before.profit : after.profit;
        return { won: dWon, lost: dLost, profit: dProfit };
    };

    /* ---------- the two modes ---------- */

    const account = () => ({
        balance: Number(client?.balance) || 0,
        currency: client?.currency || '',
    });

    const apply = (r: { won: number; lost: number; profit: number }, pnlRef: { v: number }) => {
        pnlRef.v = round2(pnlRef.v + r.profit);
        setPnl(pnlRef.v);
        setTrades(n => n + r.won + r.lost);
        setWins(n => n + r.won);
        setLosses(n => n + r.lost);
    };

    const limitReached = (c: TAutoConfig, p: number, done: number): string | null => {
        if (p >= c.takeProfit) return `Take profit reached (+${p.toFixed(2)}).`;
        if (p <= -c.stopLoss) return `Stop loss reached (${p.toFixed(2)}).`;
        if (done >= c.maxRuns) return `Max runs reached (${c.maxRuns}).`;
        return null;
    };

    const runSmartScan = async (c: TAutoConfig) => {
        const pnlRef = { v: 0 };
        let bots = 0;
        let idleScans = 0;
        while (activeRef.current) {
            const stopMsg = limitReached(c, pnlRef.v, bots);
            if (stopMsg) {
                addLog('warn', stopMsg);
                return;
            }
            setStage('Scanning for the best signal…');
            const rows = await freshRows();
            const best = pickBestSignal(rows, c.threshold, c.minStrength);
            if (!best) {
                idleScans += 1;
                setStage('Waiting for a signal…');
                if (idleScans === 1 || idleScans % 5 === 0) addLog('info', 'No signal that strong yet. Waiting for the next scan.');
                await waitNextScan();
                continue;
            }
            idleScans = 0;

            const guard = assessStake(c.stake, c.martingale, account().balance);
            if (guard.level === 'danger') {
                addLog('bad', `Stopped: stake is too large for your balance. ${guard.messages.join(' ')}`);
                return;
            }

            const label = `${best.signal.label} on ${best.display_name} (${best.signal.strength})`;
            addLog('info', `Best signal: ${label}. Loading the bot…`);
            setStage(`Trading ${label}`);
            const xml = generateDestroyerBotXml(best.signal, {
                symbol: best.symbol,
                stake: c.stake,
                martingale: c.martingale,
                maxRuns: 1,
            });
            const r = await runBot(xml, `SmartScan - ${best.display_name} - ${best.signal.label}`);
            bots += 1;
            apply(r, pnlRef);
            if (r.won + r.lost === 0) {
                addLog('warn', 'The bot finished without a result. Check the Journal tab.');
            } else {
                addLog(
                    r.profit >= 0 ? 'good' : 'bad',
                    `Finished: ${r.won} won, ${r.lost} lost, ${r.profit >= 0 ? '+' : ''}${r.profit.toFixed(2)}. Session ${pnlRef.v >= 0 ? '+' : ''}${pnlRef.v.toFixed(2)}.`
                );
            }
        }
    };

    const runAutopilot = async (c: TAutoConfig) => {
        const pnlRef = { v: 0 };
        let done = 0;
        let step = 0; // index into the Differs -> Over 1 -> Over 2 sequence
        let recoveryCount = 0;
        let stake = c.stake;
        let skips = 0;
        let noResult = 0;

        while (activeRef.current) {
            const stopMsg = limitReached(c, pnlRef.v, done);
            if (stopMsg) {
                addLog('warn', stopMsg);
                return;
            }
            if (stake > account().balance * 0.25 && account().balance > 0) {
                addLog('bad', `Stopped: the next stake (${stake.toFixed(2)}) is over 25% of your balance.`);
                return;
            }

            const recovering = recoveryCount > 0;
            const kind = recovering ? 'recovery' : AUTOPILOT_SEQUENCE[step % AUTOPILOT_SEQUENCE.length];
            setStage(recovering ? `Recovery ${recoveryCount}/${c.maxRecovery}: finding Over 3 or 4…` : `Next: ${kind}`);

            // find a market that fits this step (wait up to 3 scans)
            let xml = '';
            let title = '';
            for (let attempt = 0; attempt < 3 && !xml; attempt++) {
                const rows = await freshRows();
                if (kind === 'differs') {
                    const p = pickDiffers(rows);
                    if (p) {
                        title = `Differs ${p.digit} on ${p.display_name} (digit at ${p.pct.toFixed(1)}%)`;
                        xml = generateAutopilotBotXml({ symbol: p.symbol, kind: 'differs', prediction: p.digit, stake });
                    }
                } else if (kind === 'over1' || kind === 'over2') {
                    const level = kind === 'over1' ? 1 : 2;
                    const p = pickOver(rows, level, c.threshold);
                    if (p) {
                        title = `Over ${level} on ${p.display_name} (${p.strength})`;
                        xml = generateAutopilotBotXml({
                            symbol: p.symbol,
                            kind: 'over',
                            prediction: level,
                            stake,
                            entryDigits: [2, 5, 6],
                        });
                    }
                } else {
                    const p = pickRecovery(rows, c.threshold);
                    if (p) {
                        title = `Recovery Over ${p.level} on ${p.display_name} (${p.strength})`;
                        xml = generateAutopilotBotXml({
                            symbol: p.symbol,
                            kind: 'over',
                            prediction: p.level,
                            stake,
                            entryDigits: [5, 6, 7],
                        });
                    }
                }
                if (!xml) await waitNextScan();
            }

            if (!xml) {
                if (recovering) {
                    addLog('bad', 'Stopped: no market met the Over 3 or Over 4 recovery conditions.');
                    return;
                }
                skips += 1;
                addLog('warn', `No market fits "${kind}" right now. Skipping to the next step.`);
                if (skips >= 6) {
                    addLog('bad', 'Stopped: no step found a suitable market after 6 tries.');
                    return;
                }
                step += 1;
                continue;
            }
            skips = 0;

            addLog('info', `${title}, stake ${stake.toFixed(2)}`);
            setStage(`Trading: ${title}`);
            const r = await runBot(xml, `Autopilot - ${title}`);
            done += 1;
            apply(r, pnlRef);

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
                addLog('good', `Win ${r.profit >= 0 ? '+' : ''}${r.profit.toFixed(2)}. Session ${pnlRef.v >= 0 ? '+' : ''}${pnlRef.v.toFixed(2)}.`);
                if (recovering) addLog('good', 'Recovery complete. Back to the normal sequence.');
                recoveryCount = 0;
                stake = c.stake;
                step += 1;
            } else {
                recoveryCount += 1;
                addLog('bad', `Loss ${r.profit.toFixed(2)}. Session ${pnlRef.v >= 0 ? '+' : ''}${pnlRef.v.toFixed(2)}.`);
                if (recoveryCount > c.maxRecovery) {
                    addLog('bad', `Stopped: ${c.maxRecovery} recovery trades in a row did not win it back.`);
                    return;
                }
                stake = round2(stake * c.martingale);
                step += 1; // after the recovery wins, carry on with the next step
            }
        }
    };

    /* ---------- start / stop ---------- */

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
            if (c.stake < 0.35) {
                addLog('bad', 'The minimum stake is 0.35.');
                return;
            }
            const guard = assessStake(c.stake, c.martingale, Number(client.balance), m === 'autopilot' ? c.maxRecovery : undefined);
            if (guard.level === 'danger') {
                addLog('bad', `Blocked: ${guard.messages.join(' ')} Lower the stake or the martingale.`);
                return;
            }
            if (
                real &&
                !window.confirm(
                    `REAL MONEY: ${m === 'smartscan' ? 'SmartScan' : 'Autopilot'} will place trades by itself.\nStake ${c.stake}, take profit ${c.takeProfit}, stop loss ${c.stopLoss}.\n\nStart?`
                )
            ) {
                return;
            }

            activeRef.current = true;
            setMode(m);
            setStatus('running');
            setPnl(0);
            setTrades(0);
            setWins(0);
            setLosses(0);
            addLog('info', `${m === 'smartscan' ? 'SmartScan' : 'Autopilot'} started on ${client.is_virtual ? 'DEMO' : 'REAL'} account.`);

            try {
                if (m === 'smartscan') await runSmartScan(c);
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
                addLog('info', 'Finished.');
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
