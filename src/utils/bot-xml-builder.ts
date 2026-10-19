// Builds trade bots for the AI Trade panel from the Destroyer template.
// Pure functions with no framework imports.
import { submarketFor } from './destroyer-rules';

export type BotKind = 'over' | 'under' | 'even' | 'odd' | 'matches' | 'differs';

/**
 * untilLoss: keeps trading on every tick after a win and stops on the first loss.
 * untilWin:  retries after every loss (waiting for the entry digit again) and stops on the first win.
 * single:    places one trade and stops.
 */
export type BotLoop = 'untilLoss' | 'untilWin' | 'single';

export interface BotSpec {
    symbol: string;
    kind: BotKind;
    prediction?: number; // barrier for over/under, digit for matches/differs
    stake: number;
    loop: BotLoop;
    entryDigits?: number[]; // wait for one of these last digits before the first purchase
}

const CONTRACT: Record<BotKind, { contract: string; tradeType: string }> = {
    over: { contract: 'DIGITOVER', tradeType: 'overunder' },
    under: { contract: 'DIGITUNDER', tradeType: 'overunder' },
    even: { contract: 'DIGITEVEN', tradeType: 'evenodd' },
    odd: { contract: 'DIGITODD', tradeType: 'evenodd' },
    matches: { contract: 'DIGITMATCH', tradeType: 'matchesdiffers' },
    differs: { contract: 'DIGITDIFF', tradeType: 'matchesdiffers' },
};

const NOTIFY = (id: string, type: string, text: string) =>
    `<block type="notify" id="${id}"><field name="NOTIFICATION_TYPE">${type}</field><field name="NOTIFICATION_SOUND">silent</field><value name="MESSAGE"><block type="text" id="${id}t"><field name="TEXT">${text}</field></block></value></block>`;

const AFTER_PURCHASE: Record<BotLoop, string> = {
    single: '<block type="after_purchase" id="b117" x="0" y="1500"></block>',
    untilLoss:
        '<block type="after_purchase" id="b117" x="0" y="1500"><statement name="AFTERPURCHASE_STACK">' +
        '<block type="controls_if" id="x1"><mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>' +
        '<value name="IF0"><block type="contract_check_result" id="x2"><field name="CHECK_RESULT">win</field></block></value>' +
        '<statement name="DO0"><block type="trade_again" id="x3"></block></statement>' +
        `<statement name="ELSE">${NOTIFY('x4', 'warn', 'Loss - bot stopped')}</statement>` +
        '</block></statement></block>',
    untilWin:
        '<block type="after_purchase" id="b117" x="0" y="1500"><statement name="AFTERPURCHASE_STACK">' +
        '<block type="controls_if" id="x1"><mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>' +
        '<value name="IF0"><block type="contract_check_result" id="x2"><field name="CHECK_RESULT">win</field></block></value>' +
        `<statement name="DO0">${NOTIFY('x4', 'success', 'Match - bot stopped')}</statement>` +
        '<statement name="ELSE"><block type="variables_set" id="x5"><field name="VAR" id="vHit">EntryHit</field>' +
        '<value name="VALUE"><block type="math_number" id="x6"><field name="NUM">0</field></block></value>' +
        '<next><block type="trade_again" id="x3"></block></next></block></statement>' +
        '</block></statement></block>',
};

const setNum = (xml: string, id: string, val: number | string) =>
    xml.replace(new RegExp(`(<block type="math_number" id="${id}"><field name="NUM">)[^<]*`), `$1${val}`);

/** Replaces one whole <block type="..."> ... </block> (including nested blocks). */
export function replaceBlock(xml: string, type: string, replacement: string): string {
    const start = xml.indexOf(`<block type="${type}"`);
    if (start < 0) return xml;
    let depth = 0;
    let i = start;
    while (i < xml.length) {
        const open = xml.indexOf('<block', i);
        const close = xml.indexOf('</block>', i);
        if (close < 0) return xml;
        if (open >= 0 && open < close) {
            depth += 1;
            i = open + 6;
        } else {
            depth -= 1;
            i = close + 8;
            if (depth === 0) return xml.slice(0, start) + replacement + xml.slice(i);
        }
    }
    return xml;
}

export function buildBotXml(template: string, spec: BotSpec): string {
    const { contract, tradeType } = CONTRACT[spec.kind];
    let x = template.replace(/DIGIT(OVER|UNDER|DIFF|MATCH|EVEN|ODD)/g, contract);
    x = x.replace(/(<field name="TRADETYPE_LIST">)[^<]*/, `$1${tradeType}`);
    x = x.replace(/(<field name="SYMBOL_LIST">)[^<]*/, `$1${spec.symbol}`);
    x = x.replace(/(<field name="SUBMARKET_LIST">)[^<]*/, `$1${submarketFor(spec.symbol)}`);

    if (spec.kind === 'even' || spec.kind === 'odd') {
        // Even/Odd has no barrier: drop the prediction input.
        x = x.replace('has_prediction="true"', 'has_prediction="false"');
        x = x.replace(/<value name="PREDICTION">.*?<\/block><\/value>/, '');
    } else {
        x = setNum(x, 'b19', spec.prediction ?? 0);
    }

    x = setNum(x, 'b1', spec.stake);

    if (spec.entryDigits && spec.entryDigits.length) {
        const e = [spec.entryDigits[0], spec.entryDigits[1] ?? spec.entryDigits[0], spec.entryDigits[2] ?? spec.entryDigits[0]];
        x = setNum(x, 'b17', 0); // EntryHit = 0: wait for an entry digit
        ['b22', 'b25', 'b29'].forEach((id, i) => (x = setNum(x, id, e[i])));
    } else {
        x = setNum(x, 'b17', 1); // EntryHit = 1: buy right away
    }

    return replaceBlock(x, 'after_purchase', AFTER_PURCHASE[spec.loop]);
}
