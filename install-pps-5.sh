#!/usr/bin/env bash
# ProProfitSpace update 5: floating AI Trade button with SmartScan and Autopilot.
# Run from the repo root:  bash install-pps-5.sh
cd "$(dirname "$0")" || exit 1
[ -d src ] || { echo "src/ not found. Put this file in ~/proprofitspace/proprofitspace and run: bash install-pps-5.sh"; exit 1; }
[ -f src/pages/signal-scanner/scanner-widgets.tsx ] || { echo "Update 3 is missing. Run install-pps-3.sh first."; exit 1; }
[ -f src/pages/main/main.tsx ] || { echo "src/pages/main/main.tsx not found."; exit 1; }

mkdir -p src/xml src/utils src/hooks src/pages/auto-trader
B=.pps-backup5-$(date +%H%M%S); mkdir -p "$B"
for f in src/xml/sammee_autopilot.xml src/utils/autopilot-rules.ts src/utils/signal-bot-xml.ts src/hooks/useAutoTrader.ts src/pages/auto-trader/auto-trader.tsx src/pages/auto-trader/auto-trader.scss src/pages/main/main.tsx; do
  [ -f "$f" ] && mkdir -p "$B/$(dirname $f)" && cp "$f" "$B/$f"
done
cat > src/xml/sammee_autopilot.xml <<'PPS_EOF'
<xml xmlns="http://www.w3.org/1999/xhtml" is_dbot="true" collection="false"><variables><variable id="vInit">InitialStake</variable><variable id="vStake">Stake</variable><variable id="vMart">Martingale</variable><variable id="vMode">Mode</variable><variable id="vRuns">Runs</variable><variable id="vMaxRuns">MaxRuns</variable><variable id="vPred">Prediction</variable><variable id="vHit">EntryHit</variable><variable id="vRec">RecoverySteps</variable><variable id="vMaxRec">MaxRecoverySteps</variable></variables><block type="trade_definition" id="b115" deletable="false" x="0" y="0"><statement name="TRADE_OPTIONS"><block type="trade_definition_market" id="b109" deletable="false" movable="false"><field name="MARKET_LIST">synthetic_index</field><field name="SUBMARKET_LIST">random_index</field><field name="SYMBOL_LIST">R_100</field><next><block type="trade_definition_tradetype" id="b110" deletable="false" movable="false"><field name="TRADETYPECAT_LIST">digits</field><field name="TRADETYPE_LIST">overunder</field><next><block type="trade_definition_contracttype" id="b111" deletable="false" movable="false"><field name="TYPE_LIST">DIGITOVER</field><next><block type="trade_definition_candleinterval" id="b112" deletable="false" movable="false"><field name="CANDLEINTERVAL_LIST">60</field><next><block type="trade_definition_restartbuysell" id="b113" deletable="false" movable="false"><field name="TIME_MACHINE_ENABLED">FALSE</field><next><block type="trade_definition_restartonerror" id="b114" deletable="false" movable="false"><field name="RESTARTONERROR">TRUE</field></block></next></block></next></block></next></block></next></block></next></block></statement><statement name="INITIALIZATION"><block type="variables_set" id="b2"><field name="VAR" id="vInit">InitialStake</field><value name="VALUE"><block type="math_number" id="b1"><field name="NUM">1</field></block></value><next><block type="variables_set" id="b4"><field name="VAR" id="vStake">Stake</field><value name="VALUE"><block type="variables_get" id="b3"><field name="VAR" id="vInit">InitialStake</field></block></value><next><block type="variables_set" id="b6"><field name="VAR" id="vMart">Martingale</field><value name="VALUE"><block type="math_number" id="b5"><field name="NUM">2</field></block></value><next><block type="variables_set" id="b8"><field name="VAR" id="vMaxRuns">MaxRuns</field><value name="VALUE"><block type="math_number" id="b7"><field name="NUM">3</field></block></value><next><block type="variables_set" id="b10"><field name="VAR" id="vMaxRec">MaxRecoverySteps</field><value name="VALUE"><block type="math_number" id="b9"><field name="NUM">4</field></block></value><next><block type="variables_set" id="b12"><field name="VAR" id="vMode">Mode</field><value name="VALUE"><block type="math_number" id="b11"><field name="NUM">0</field></block></value><next><block type="variables_set" id="b14"><field name="VAR" id="vRuns">Runs</field><value name="VALUE"><block type="math_number" id="b13"><field name="NUM">0</field></block></value><next><block type="variables_set" id="b16"><field name="VAR" id="vRec">RecoverySteps</field><value name="VALUE"><block type="math_number" id="b15"><field name="NUM">0</field></block></value><next><block type="variables_set" id="b18"><field name="VAR" id="vHit">EntryHit</field><value name="VALUE"><block type="math_number" id="b17"><field name="NUM">0</field></block></value><next><block type="variables_set" id="b20"><field name="VAR" id="vPred">Prediction</field><value name="VALUE"><block type="math_number" id="b19"><field name="NUM">1</field></block></value></block></next></block></next></block></next></block></next></block></next></block></next></block></next></block></next></block></next></block></statement><statement name="SUBMARKET"><block type="trade_definition_tradeoptions" id="b103"><mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="true"/><field name="DURATIONTYPE_LIST">t</field><value name="DURATION"><shadow type="math_number_positive" id="b104"><field name="NUM">1</field></shadow></value><value name="AMOUNT"><shadow type="math_number_positive" id="b105"><field name="NUM">1</field></shadow><block type="variables_get" id="b106"><field name="VAR" id="vStake">Stake</field></block></value><value name="PREDICTION"><shadow type="math_number_positive" id="b107"><field name="NUM">1</field></shadow><block type="variables_get" id="b108"><field name="VAR" id="vPred">Prediction</field></block></value></block></statement></block><block type="before_purchase" id="b116" deletable="false" x="0" y="900"><statement name="BEFOREPURCHASE_STACK"><block type="controls_if" id="b38"><value name="IF0"><block type="logic_compare" id="b34"><field name="OP">EQ</field><value name="A"><block type="variables_get" id="b32"><field name="VAR" id="vHit">EntryHit</field></block></value><value name="B"><block type="math_number" id="b33"><field name="NUM">0</field></block></value></block></value><statement name="DO0"><block type="controls_if" id="b37"><value name="IF0"><block type="logic_operation" id="b31"><field name="OP">OR</field><value name="A"><block type="logic_operation" id="b27"><field name="OP">OR</field><value name="A"><block type="logic_compare" id="b23"><field name="OP">EQ</field><value name="A"><block type="last_digit" id="b21"/></value><value name="B"><block type="math_number" id="b22"><field name="NUM">2</field></block></value></block></value><value name="B"><block type="logic_compare" id="b26"><field name="OP">EQ</field><value name="A"><block type="last_digit" id="b24"/></value><value name="B"><block type="math_number" id="b25"><field name="NUM">5</field></block></value></block></value></block></value><value name="B"><block type="logic_compare" id="b30"><field name="OP">EQ</field><value name="A"><block type="last_digit" id="b28"/></value><value name="B"><block type="math_number" id="b29"><field name="NUM">6</field></block></value></block></value></block></value><statement name="DO0"><block type="variables_set" id="b36"><field name="VAR" id="vHit">EntryHit</field><value name="VALUE"><block type="math_number" id="b35"><field name="NUM">1</field></block></value></block></statement></block></statement><next><block type="controls_if" id="b43"><value name="IF0"><block type="logic_compare" id="b41"><field name="OP">EQ</field><value name="A"><block type="variables_get" id="b39"><field name="VAR" id="vHit">EntryHit</field></block></value><value name="B"><block type="math_number" id="b40"><field name="NUM">1</field></block></value></block></value><statement name="DO0"><block type="purchase" id="b42"><field name="PURCHASE_LIST">DIGITOVER</field></block></statement></block></next></block></statement></block><block type="after_purchase" id="b117" x="0" y="1500"/></xml>
PPS_EOF
cat > src/utils/autopilot-rules.ts <<'PPS_EOF'
// Rules for SmartScan and Autopilot. Pure functions with no framework imports.
import { compareSignals, DEFAULT_THRESHOLD, DestroyerSignal, DestroyerStrength, evaluateDestroyer, FAIR_SHARE, submarketFor } from './destroyer-rules';

export interface MarketDigits {
    symbol: string;
    display_name: string;
    digit_pct: number[]; // % of ticks for digits 0..9
}

/* ------------------------------------------------------------------ SmartScan */

const RANK: Record<DestroyerStrength, number> = { strong: 0, good: 1, weak: 2 };

export interface BestSignal {
    symbol: string;
    display_name: string;
    signal: DestroyerSignal;
}

/** Best Over/Under signal across all markets, no weaker than `minStrength`. */
export function pickBestSignal(
    rows: MarketDigits[],
    threshold = DEFAULT_THRESHOLD,
    minStrength: DestroyerStrength = 'good'
): BestSignal | null {
    const found: BestSignal[] = [];
    rows.forEach(r => {
        const signal = evaluateDestroyer(r.digit_pct, threshold);
        if (signal && RANK[signal.strength] <= RANK[minStrength]) {
            found.push({ symbol: r.symbol, display_name: r.display_name, signal });
        }
    });
    found.sort((a, b) => compareSignals(a.signal, b.signal));
    return found[0] ?? null;
}

/* ------------------------------------------------------------------ Autopilot */

export interface DiffersPick {
    symbol: string;
    display_name: string;
    digit: number; // the barrier: the contract wins when the last digit is NOT this digit
    pct: number;
}

/** The digit with the lowest percentage across all scanned markets. */
export function pickDiffers(rows: MarketDigits[]): DiffersPick | null {
    let best: DiffersPick | null = null;
    rows.forEach(r => {
        r.digit_pct.forEach((pct, digit) => {
            if (!best || pct < best.pct) best = { symbol: r.symbol, display_name: r.display_name, digit, pct };
        });
    });
    return best;
}

export interface OverPick {
    symbol: string;
    display_name: string;
    level: 1 | 2 | 3 | 4; // Over 1 .. Over 4
    losingDigits: number[]; // 0..level
    avgLosingPct: number;
    strength: DestroyerStrength;
}

/** Best market for "Over <level>": every losing digit (0..level) must sit below `threshold`. */
export function pickOver(rows: MarketDigits[], level: 1 | 2 | 3 | 4, threshold = DEFAULT_THRESHOLD): OverPick | null {
    const losing = Array.from({ length: level + 1 }, (_, d) => d);
    let best: OverPick | null = null;
    rows.forEach(r => {
        if (!losing.every(d => r.digit_pct[d] < threshold)) return;
        const avg = losing.reduce((s, d) => s + r.digit_pct[d], 0) / losing.length;
        const max = Math.max(...losing.map(d => r.digit_pct[d]));
        const strength: DestroyerStrength = max < FAIR_SHARE ? 'strong' : avg < FAIR_SHARE ? 'good' : 'weak';
        if (!best || avg < best.avgLosingPct) {
            best = { symbol: r.symbol, display_name: r.display_name, level, losingDigits: losing, avgLosingPct: avg, strength };
        }
    });
    return best;
}

/**
 * Recovery after a loss: Over 4 (higher payout) when a market has all of digits 0-4 below 10%,
 * otherwise Over 3 when a market has digits 0-3 below the threshold.
 */
export function pickRecovery(rows: MarketDigits[], threshold = DEFAULT_THRESHOLD): OverPick | null {
    return pickOver(rows, 4, FAIR_SHARE) ?? pickOver(rows, 3, threshold);
}

export const AUTOPILOT_SEQUENCE = ['differs', 'over1', 'over2'] as const;
export type AutopilotStep = (typeof AUTOPILOT_SEQUENCE)[number];

/* ------------------------------------------------------------------ bot XML (single trade) */

export interface AutopilotStage {
    symbol: string;
    kind: 'differs' | 'over';
    prediction: number;
    stake: number;
    entryDigits?: [number, number, number]; // Over only: wait for one of these last digits
}

const setNum = (xml: string, id: string, val: number | string) =>
    xml.replace(new RegExp(`(<block type="math_number" id="${id}"><field name="NUM">)[^<]*`), `$1${val}`);

/** Patches the single-trade template (sammee_autopilot.xml) for one stage. */
export function patchAutopilotXml(xml: string, s: AutopilotStage): string {
    const differs = s.kind === 'differs';
    let x = xml.replace(/DIGIT(OVER|UNDER|DIFF)/g, differs ? 'DIGITDIFF' : 'DIGITOVER');
    x = x.replace(/(<field name="TRADETYPE_LIST">)[^<]*/, `$1${differs ? 'matchesdiffers' : 'overunder'}`);
    x = x.replace(/(<field name="SYMBOL_LIST">)[^<]*/, `$1${s.symbol}`);
    x = x.replace(/(<field name="SUBMARKET_LIST">)[^<]*/, `$1${submarketFor(s.symbol)}`);
    x = setNum(x, 'b19', s.prediction); // Prediction (barrier)
    x = setNum(x, 'b1', s.stake); // InitialStake
    if (differs) {
        x = setNum(x, 'b17', 1); // EntryHit = 1: buy immediately, no entry-digit wait
    } else {
        const e = s.entryDigits ?? [2, 5, 6];
        x = setNum(x, 'b17', 0);
        ['b22', 'b25', 'b29'].forEach((id, i) => (x = setNum(x, id, e[i])));
    }
    return x;
}
PPS_EOF
cat > src/utils/signal-bot-xml.ts <<'PPS_EOF'
import strategyXml from '@/xml/signal_martingale.xml';
import destroyerXml from '@/xml/sammee_destroyer.xml';
import autopilotXml from '@/xml/sammee_autopilot.xml';
import { AutopilotStage, patchAutopilotXml } from '@/utils/autopilot-rules';
import { DestroyerSignal, patchDestroyerXml, PatchOptions } from '@/utils/destroyer-rules';

type TSignal = {
    symbol: string;
    display_name: string;
    contract_type: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';
    barrier: number | null;
    confidence: number;
};

/** Builds the Sammee Destroyer bot (entry digits + recovery) for a scanner signal. */
export const generateDestroyerBotXml = (signal: DestroyerSignal, options: PatchOptions): string =>
    patchDestroyerXml(destroyerXml as string, signal, options);

/** Single-trade bot for one Autopilot stage (Differs or Over). The bot stops after the contract settles. */
export const generateAutopilotBotXml = (stage: AutopilotStage): string =>
    patchAutopilotXml(autopilotXml as string, stage);

/** Original generator, kept so the other pages that use it keep working. */
export const generateSignalBotXml = (signal: TSignal): string => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(strategyXml, 'application/xml');

    const symbolField = xmlDoc.querySelector('field[name="SYMBOL_LIST"]');
    if (symbolField) {
        symbolField.textContent = signal.symbol;
    }

    const tradeTypeCatField = xmlDoc.querySelector('field[name="TRADETYPECAT_LIST"]');
    if (tradeTypeCatField) {
        tradeTypeCatField.textContent = 'digits';
    }

    const tradeTypeField = xmlDoc.querySelector('field[name="TRADETYPE_LIST"]');
    if (tradeTypeField) {
        if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
            tradeTypeField.textContent = 'overunder';
        } else {
            tradeTypeField.textContent = 'evenodd';
        }
    }

    const purchaseField = xmlDoc.querySelector('field[name="PURCHASE_LIST"]');
    if (purchaseField) {
        if (signal.contract_type === 'DIGITOVER') {
            purchaseField.textContent = 'OVER';
        } else if (signal.contract_type === 'DIGITUNDER') {
            purchaseField.textContent = 'UNDER';
        } else if (signal.contract_type === 'DIGITEVEN') {
            purchaseField.textContent = 'EVEN';
        } else if (signal.contract_type === 'DIGITODD') {
            purchaseField.textContent = 'ODD';
        }
    }

    const mutation = xmlDoc.querySelector('block[type="trade_definition_tradeoptions"] > mutation');
    if (mutation) {
        if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
            mutation.setAttribute('has_prediction', 'true');
        } else {
            mutation.setAttribute('has_prediction', 'false');
        }
    }

    if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
        const predictionValue = xmlDoc.querySelector('value[strategy_value="last_digit_prediction"]');
        if (predictionValue) {
            const shadow = predictionValue.querySelector('shadow');
            if (shadow) {
                const numField = shadow.querySelector('field[name="NUM"]');
                if (numField) {
                    numField.textContent = String(signal.barrier ?? 5);
                }
            }
        }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);
};
PPS_EOF
cat > src/hooks/useAutoTrader.ts <<'PPS_EOF'
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
PPS_EOF
cat > src/pages/auto-trader/auto-trader.tsx <<'PPS_EOF'
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
PPS_EOF
cat > src/pages/auto-trader/auto-trader.scss <<'PPS_EOF'
.pps-ai {
    --ai-bg: #0b1324;
    --ai-surface: #121d36;
    --ai-border: rgba(148, 163, 184, 0.25);
    --ai-text: #e8eef9;
    --ai-muted: #9fb0cc;
    --ai-accent: #22d3ee;
    --ai-good: #34d399;
    --ai-bad: #fb7185;
    --ai-warn: #fbbf24;

    position: fixed;
    right: 16px;
    bottom: 56px;
    z-index: 1500;
    font-family: Inter, system-ui, sans-serif;

    @media (max-width: 1023px) {
        bottom: 100px;
        right: 12px;
    }

    &__fab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border: none;
        border-radius: 999px;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        color: #04101f;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 10px 30px rgba(34, 211, 238, 0.35);
        transition:
            transform 0.15s ease,
            box-shadow 0.15s ease;

        &:hover {
            transform: translateY(-2px);
        }

        &--on {
            box-shadow: 0 10px 34px rgba(52, 211, 153, 0.5);
        }
    }

    &__dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: rgba(4, 16, 31, 0.55);

        &--on {
            background: #04101f;
            animation: pps-ai-pulse 1.2s infinite;
        }
    }

    &__panel {
        position: absolute;
        right: 0;
        bottom: 58px;
        width: min(400px, calc(100vw - 24px));
        max-height: min(80vh, 720px);
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--ai-bg);
        color: var(--ai-text);
        border: 1px solid var(--ai-border);
        border-radius: 16px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
        animation: pps-rise 0.25s ease both;
        font-size: 13px;
        line-height: 1.4;

        @media (max-width: 720px) {
            position: fixed;
            left: 8px;
            right: 8px;
            bottom: 160px;
            width: auto;
            max-height: calc(100vh - 230px);

            @supports (height: 100dvh) {
                max-height: calc(100dvh - 230px);
            }
        }
    }

    &__head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;

        b {
            display: block;
            font-size: 17px;
            font-weight: 800;
        }
        span {
            font-size: 12px;
            color: var(--ai-muted);
        }
    }

    &__x {
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 8px;
        background: rgba(148, 163, 184, 0.15);
        color: var(--ai-text);
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
    }

    &__tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        padding: 4px;
        background: var(--ai-surface);
        border-radius: 12px;
    }

    &__tab {
        padding: 9px;
        border: none;
        border-radius: 9px;
        background: transparent;
        color: var(--ai-muted);
        font-weight: 800;
        font-size: 13px;
        cursor: pointer;

        &--on {
            background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(99, 102, 241, 0.22));
            color: var(--ai-text);
        }

        &:disabled {
            cursor: default;
            opacity: 0.6;
        }
    }

    &__body {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    &__desc {
        margin: 0;
        color: var(--ai-muted);
    }

    &__note {
        margin: 0;
        font-size: 12px;
        color: var(--ai-warn);
    }

    &__preview {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 12px;
        background: var(--ai-surface);
        border-left: 3px solid var(--ai-accent);
        border-radius: 8px;

        span {
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--ai-muted);
        }
    }

    &__none {
        color: var(--ai-muted);
    }

    &__steps {
        display: grid;
        gap: 6px;
    }

    &__step {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: var(--ai-surface);
        border-radius: 10px;

        i {
            flex: none;
            display: grid;
            place-items: center;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: linear-gradient(135deg, #22d3ee, #6366f1);
            color: #04101f;
            font-style: normal;
            font-weight: 900;
            font-size: 12px;
        }

        b {
            display: block;
            font-size: 13px;
        }
        span {
            font-size: 12px;
            color: var(--ai-muted);
        }

        &--rec i {
            background: var(--ai-bad);
        }
    }

    &__grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;

        @media (max-width: 420px) {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    &__field,
    &__select {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 11px;
        font-weight: 700;
        color: var(--ai-muted);

        input,
        select {
            width: 100%;
            padding: 8px;
            background: var(--ai-surface);
            color: var(--ai-text);
            border: 1px solid var(--ai-border);
            border-radius: 8px;
            font-size: 16px;

            &:focus {
                outline: none;
                border-color: var(--ai-accent);
            }
            &:disabled {
                opacity: 0.55;
            }
        }
    }

    &__real {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--ai-muted);
    }

    &__live {
        display: grid;
        gap: 8px;
        padding: 10px 12px;
        background: var(--ai-surface);
        border: 1px solid rgba(52, 211, 153, 0.4);
        border-radius: 10px;
    }

    &__stage {
        font-weight: 700;
        color: var(--ai-good);
    }

    &__tiles {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;

        span {
            display: block;
            font-size: 10px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--ai-muted);
        }
        b {
            font-size: 14px;
        }
    }

    &__up {
        color: var(--ai-good);
    }
    &__down {
        color: var(--ai-bad);
    }

    &__go {
        padding: 13px;
        border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        color: #04101f;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;

        &--stop {
            background: var(--ai-bad);
            color: #fff;
        }
        &:disabled {
            opacity: 0.6;
            cursor: default;
        }
    }

    &__log {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        background: var(--ai-surface);
        border-radius: 10px;
        font-size: 12px;
        max-height: 150px;
        overflow-y: auto;
    }

    &__line {
        color: var(--ai-muted);

        em {
            font-style: normal;
            font-family: monospace;
            font-size: 11px;
            opacity: 0.7;
        }

        &--good {
            color: var(--ai-good);
        }
        &--bad {
            color: var(--ai-bad);
        }
        &--warn {
            color: var(--ai-warn);
        }
    }
}

@keyframes pps-ai-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.25;
    }
}
PPS_EOF

# ---- mount the floating button in the main page (adds 2 lines to main.tsx) ----
python3 - <<'PY'
p = 'src/pages/main/main.tsx'
s = open(p).read()
if 'AutoTrader' in s:
    print("main.tsx already has the AI Trade button")
else:
    a = "import { useStore } from '@/hooks/useStore';"
    b = "{/* Trade Type Confirmation Modal */}"
    if a not in s or b not in s:
        print("WARNING: could not find the place to add the button in main.tsx. Tell Claude.")
    else:
        s = s.replace(a, a + "\nimport AutoTrader from '@/pages/auto-trader/auto-trader';", 1)
        s = s.replace(b, "<AutoTrader />\n\n            " + b, 1)
        open(p, 'w').write(s)
        print("main.tsx: AI Trade button added")
PY

# ---- pre-flight: does this build know the Matches/Differs trade type? ----
if grep -rq "matchesdiffers" src/external/bot-skeleton 2>/dev/null; then
  echo "CHECK OK: Matches/Differs trade type found"
else
  echo "WARNING: 'matchesdiffers' not found in src/external/bot-skeleton. Autopilot's Differs step may not load. Tell Claude."
fi

echo
echo "Done. Backups are in $B"
for f in src/xml/sammee_autopilot.xml src/utils/autopilot-rules.ts src/utils/signal-bot-xml.ts src/hooks/useAutoTrader.ts src/pages/auto-trader/auto-trader.tsx src/pages/auto-trader/auto-trader.scss; do
  [ -s "$f" ] && echo "OK  $f" || echo "MISSING $f"
done
