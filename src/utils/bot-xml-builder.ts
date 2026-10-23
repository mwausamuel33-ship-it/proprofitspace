// Builds trade bots for the AI Trade panel from the Destroyer template.
// Pure functions with no framework imports.
import { submarketFor } from './destroyer-rules';

export type BotKind = 'over' | 'under' | 'even' | 'odd' | 'matches' | 'differs';

/**
 * untilLoss: keeps trading on every tick after a win and stops on the first loss.
 * untilWin:  retries after every loss (waiting for the entry digit again) and stops on the first win.
 * single:    places one trade and stops.
 * recover:   trades on every tick (no entry digit) for `maxRuns` wins. After a loss it recovers on the same
 *            market as described by `recovery`, then the bot stops.
 */
export type BotLoop = 'untilLoss' | 'untilWin' | 'single' | 'recover';

export interface BotSpec {
    symbol: string;
    kind: BotKind;
    prediction?: number; // barrier for over/under, digit for matches/differs
    stake: number;
    loop: BotLoop;
    entryDigits?: number[]; // wait for one of these last digits before the first purchase
    martingale?: number; // recover loop
    maxRuns?: number; // recover loop: wins before the bot stops
    recovery?: RecoverySpec; // recover loop
    confirm?: ConfirmSpec; // recover loop: wait for a hit digit, then a confirming digit, before buying
}

/**
 * Entry filter. Over <barrier>: a "hit" is a last digit <= barrier (a losing digit), the confirmation is a digit above it.
 * Under <barrier>: a hit is a last digit >= barrier, the confirmation is a digit below it.
 * `every`: repeat hit + confirmation before every trade; otherwise only before the first one.
 */
export interface ConfirmSpec {
    side: 'over' | 'under';
    barrier: number;
    every: boolean;
}

export interface RecoverySpec {
    barrier?: number; // Over/Under: barrier used while recovering (e.g. Over 2, Over 3, Under 7)
    flip?: boolean; // Even/Odd: trade the opposite side while recovering, then the bot stops
    winsNeeded: number; // recovery wins needed to finish the recovery
    maxSteps: number; // recovery trades allowed
    escalate: boolean; // multiply the stake again after each recovery loss (the first loss always multiplies once)
    untilRecovered?: boolean; // keep recovering (win or lose) until the loss is won back, up to maxSteps trades; the AI Trade hook ends the bot once the profit is back
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

const AFTER_PURCHASE: Record<Exclude<BotLoop, 'recover'>, string> = {
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

/** Replaces the whole block that starts at `marker` (for example '<block type="math_arithmetic" id="x"'), nested blocks included. */
export function replaceBlockAt(xml: string, marker: string, replacement: string): string {
    const start = xml.indexOf(marker);
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

/** Replaces one whole <block type="..."> ... </block> (including nested blocks). */
export function replaceBlock(xml: string, type: string, replacement: string): string {
    return replaceBlockAt(xml, `<block type="${type}"`, replacement);
}

/* ---------- small block-XML helpers for the 'recover' loop ---------- */

type TVar = readonly [string, string];
const V = {
    stake: ['vStake', 'Stake'],
    mart: ['vMart', 'Martingale'],
    mode: ['vMode', 'Mode'],
    runs: ['vRuns', 'Runs'],
    maxRuns: ['vMaxRuns', 'MaxRuns'],
    pred: ['vPred', 'Prediction'],
    rec: ['vRec', 'RecoverySteps'],
    maxRec: ['vMaxRec', 'MaxRecoverySteps'],
    hit: ['vHit', 'EntryHit'],
} as const;

const makeBlocks = () => {
    let n = 0;
    const id = () => `g${++n}`;
    const num = (v: number) => `<block type="math_number" id="${id()}"><field name="NUM">${v}</field></block>`;
    const get = (v: TVar) => `<block type="variables_get" id="${id()}"><field name="VAR" id="${v[0]}">${v[1]}</field></block>`;
    const setVar = (v: TVar, value: string, next?: string) =>
        `<block type="variables_set" id="${id()}"><field name="VAR" id="${v[0]}">${v[1]}</field><value name="VALUE">${value}</value>${next ? `<next>${next}</next>` : ''}</block>`;
    const cmp = (op: string, a: string, b: string) =>
        `<block type="logic_compare" id="${id()}"><field name="OP">${op}</field><value name="A">${a}</value><value name="B">${b}</value></block>`;
    const arith = (op: string, a: string, b: string) =>
        `<block type="math_arithmetic" id="${id()}"><field name="OP">${op}</field><value name="A">${a}</value><value name="B">${b}</value></block>`;
    const round = (x: string) => `<block type="math_round" id="${id()}"><field name="OP">ROUND</field><value name="NUM">${x}</value></block>`;
    const ifElse = (cond: string, thenX: string, elseX?: string, next?: string) =>
        `<block type="controls_if" id="${id()}">${elseX !== undefined ? '<mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>' : ''}<value name="IF0">${cond}</value><statement name="DO0">${thenX}</statement>${elseX !== undefined ? `<statement name="ELSE">${elseX}</statement>` : ''}${next ? `<next>${next}</next>` : ''}</block>`;
    const lastDigit = () => `<block type="last_digit" id="${id()}"></block>`;
    const and = (a: string, c: string) => `<block type="logic_operation" id="${id()}"><field name="OP">AND</field><value name="A">${a}</value><value name="B">${c}</value></block>`;
    /** An `if` with no else, usable inside chain(). */
    const when = (cond: string, thenX: string) => (next?: string) => ifElse(cond, thenX, undefined, next);
    const notify = (type: string, text: string) =>
        `<block type="notify" id="${id()}"><field name="NOTIFICATION_TYPE">${type}</field><field name="NOTIFICATION_SOUND">silent</field><value name="MESSAGE"><block type="text" id="${id()}"><field name="TEXT">${text}</field></block></value></block>`;
    const again = () => `<block type="trade_again" id="${id()}"></block>`;
    const purchase = (contract: string) => `<block type="purchase" id="${id()}"><field name="PURCHASE_LIST">${contract}</field></block>`;
    const result = (r: 'win' | 'loss') => `<block type="contract_check_result" id="${id()}"><field name="CHECK_RESULT">${r}</field></block>`;
    const stakeTimesMartingale = () =>
        arith('DIVIDE', round(arith('MULTIPLY', arith('MULTIPLY', get(V.stake), get(V.mart)), num(100))), num(100));

    /** Chains statements with <next>. Each item receives the next statement's XML. */
    const chain = (...items: Array<(next?: string) => string>) => {
        let out = '';
        for (let i = items.length - 1; i >= 0; i--) out = items[i](out || undefined);
        return out;
    };
    const set = (v: TVar, value: string) => (next?: string) => setVar(v, value, next);

    return { num, get, cmp, arith, round, ifElse, notify, again, purchase, result, stakeTimesMartingale, chain, set, lastDigit, and, when };
};

/** The purchase and after-purchase blocks of the 'recover' loop. */
export function buildRecoverBlocks(main: string, flipTo: string | null, r: RecoverySpec, confirm?: ConfirmSpec) {
    const b = makeBlocks();

    const buy = flipTo ? b.ifElse(b.cmp('EQ', b.get(V.mode), b.num(0)), b.purchase(main), b.purchase(flipTo)) : b.purchase(main);

    // Without a filter: buy on every tick. With one, EntryHit walks 0 (waiting for a hit digit) -> 1 (hit seen,
    // waiting for the confirming digit) -> 2 (armed: buy on every tick).
    let purchaseStack = buy;
    if (confirm) {
        const hitOp = confirm.side === 'over' ? 'LTE' : 'GTE';
        const confirmOp = confirm.side === 'over' ? 'GT' : 'LT';
        purchaseStack = b.chain(
            b.when(
                b.and(b.cmp('EQ', b.get(V.hit), b.num(0)), b.cmp(hitOp, b.lastDigit(), b.num(confirm.barrier))),
                b.chain(b.set(V.hit, b.num(1)))
            ),
            b.when(
                b.and(b.cmp('EQ', b.get(V.hit), b.num(1)), b.cmp(confirmOp, b.lastDigit(), b.num(confirm.barrier))),
                b.chain(b.set(V.hit, b.num(2)))
            ),
            b.when(b.cmp('EQ', b.get(V.hit), b.num(2)), buy)
        );
    }
    const before = `<block type="before_purchase" id="b116" deletable="false" x="0" y="900"><statement name="BEFOREPURCHASE_STACK">${purchaseStack}</statement></block>`;

    // After each recovery trade (untilRecovered): count it, stop when the allowed trades are used up, else go again.
    const recoveryTradeDone = () =>
        b.chain(
            b.set(V.rec, b.arith('ADD', b.get(V.rec), b.num(1))),
            () =>
                b.ifElse(
                    b.cmp('GTE', b.get(V.rec), b.get(V.maxRec)),
                    b.notify('error', 'Recovery trades used up - bot stopped'),
                    b.again()
                )
        );

    // a win: in the normal phase count the run, in recovery count recovery wins
    const normalWin = b.chain(
        b.set(V.runs, b.arith('ADD', b.get(V.runs), b.num(1))),
        () =>
            b.ifElse(
                b.cmp('GTE', b.get(V.runs), b.get(V.maxRuns)),
                b.notify('success', 'Runs complete - bot stopped'),
                // with "every trade" the filter starts again before the next trade
                confirm?.every ? b.chain(b.set(V.hit, b.num(0)), () => b.again()) : b.again()
            )
    );
    const recoveryWin = r.untilRecovered
        ? recoveryTradeDone()
        : r.winsNeeded > 1
          ? b.chain(
                b.set(V.runs, b.arith('ADD', b.get(V.runs), b.num(1))),
                () =>
                    b.ifElse(
                        b.cmp('GTE', b.get(V.runs), b.num(r.winsNeeded)),
                        b.notify('success', 'Recovery complete - bot stopped'),
                        b.again()
                    )
            )
          : b.notify('success', 'Recovery complete - bot stopped');
    const onWin = b.ifElse(b.cmp('EQ', b.get(V.mode), b.num(0)), normalWin, recoveryWin);

    // a loss: the first one starts the recovery, later ones continue or end it
    const firstLoss = b.chain(
        b.set(V.mode, b.num(1)),
        b.set(V.runs, b.num(0)),
        ...(r.barrier !== undefined ? [b.set(V.pred, b.num(r.barrier))] : []),
        b.set(V.stake, b.stakeTimesMartingale()),
        b.set(V.rec, b.num(r.untilRecovered ? 0 : 1)),
        ...(confirm ? [b.set(V.hit, b.num(2))] : []), // recovery trades are placed right away
        () => b.again()
    );
    const nextLoss = r.untilRecovered
        ? recoveryTradeDone()
        : b.chain(
              b.set(V.rec, b.arith('ADD', b.get(V.rec), b.num(1))),
              () =>
                  b.ifElse(
                      b.cmp('GT', b.get(V.rec), b.get(V.maxRec)),
                      b.notify('error', 'Recovery ended - bot stopped'),
                      b.chain(...(r.escalate ? [b.set(V.stake, b.stakeTimesMartingale())] : []), () => b.again())
                  )
          );
    const onLoss = b.ifElse(b.cmp('EQ', b.get(V.mode), b.num(0)), firstLoss, nextLoss);

    const after = `<block type="after_purchase" id="b117" x="0" y="1500"><statement name="AFTERPURCHASE_STACK">${b.ifElse(b.result('win'), onWin, onLoss)}</statement></block>`;
    return { before, after };
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

    if (spec.loop === 'recover' && spec.confirm) {
        x = setNum(x, 'b17', 0); // EntryHit = 0: wait for a hit digit, then a confirming digit
    } else if (spec.entryDigits && spec.entryDigits.length) {
        const e = [spec.entryDigits[0], spec.entryDigits[1] ?? spec.entryDigits[0], spec.entryDigits[2] ?? spec.entryDigits[0]];
        x = setNum(x, 'b17', 0); // EntryHit = 0: wait for an entry digit
        ['b22', 'b25', 'b29'].forEach((id, i) => (x = setNum(x, id, e[i])));
    } else {
        x = setNum(x, 'b17', 1); // EntryHit = 1: buy right away
    }

    if (spec.loop === 'recover') {
        const rec = spec.recovery ?? { winsNeeded: 1, maxSteps: 3, escalate: true };
        x = setNum(x, 'b5', spec.martingale ?? 2); // Martingale
        x = setNum(x, 'b7', spec.maxRuns ?? 20); // MaxRuns
        x = setNum(x, 'b9', rec.maxSteps); // MaxRecoverySteps
        const flipTo = rec.flip && (spec.kind === 'even' || spec.kind === 'odd') ? (spec.kind === 'even' ? 'DIGITODD' : 'DIGITEVEN') : null;
        if (flipTo) x = x.replace(/(<field name="TYPE_LIST">)[^<]*/, '$1both'); // allow both contract types
        const { before, after } = buildRecoverBlocks(contract, flipTo, rec, spec.confirm);
        x = replaceBlock(x, 'before_purchase', before);
        return replaceBlock(x, 'after_purchase', after);
    }

    return replaceBlock(x, 'after_purchase', AFTER_PURCHASE[spec.loop]);
}

/* ------------------------------------------------------------------ the simple over/under martingale bot (SmartScan) */

export interface SimpleBotSpec {
    symbol: string;
    side: 'over' | 'under';
    prediction: number; // the barrier: Over 1, Over 2, Under 7, Under 8
    stake: number;
    martingale: number; // stake multiplier after each loss; the bot goes back to the base stake after a win
    durationTicks: number; // 2 for the 1-second volatilities, 1 for the plain ones
    trigger: number; // trigger digit: when it appears we start watching for a confirmation digit
    confirmGt?: number; // Over: the confirmation digit is above this
    confirmLt?: number; // Under: the confirmation digit is below this (digit 0 is not used)
    confirmEvery?: boolean; // wait for trigger + confirmation before every trade, not only the first
}

// The app enforces take profit and stop loss (it also knows about the whole session), so the bot's own limits are out of reach.
const BIG_LIMIT = 1000000000;

/**
 * Patches the attached bot (src/xml/sammee_simple_over.xml): market, barrier, stake, martingale, tick duration and
 * the entry. Entry: wait for the trigger digit, then a confirmation digit, then buy on every tick (or repeat the
 * trigger + confirmation before every trade). A loss multiplies the stake (rounded to cents), a win resets it.
 */
export function buildSimpleBotXml(template: string, spec: SimpleBotSpec): string {
    const contract = spec.side === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
    let x = template.replace(/DIGIT(OVER|UNDER)/g, contract);
    x = x.replace(/(<field name="SYMBOL_LIST">)[^<]*/, `$1${spec.symbol}`);
    x = x.replace(/(<field name="SUBMARKET_LIST">)[^<]*/, `$1${submarketFor(spec.symbol)}`);

    const shadow = (id: string, val: number) => {
        x = x.replace(new RegExp(`(<shadow type="math_number_positive" id="${id}">\\s*<field name="NUM">)[^<]*`), `$1${val}`);
    };
    shadow('opt_pred_shadow', spec.prediction);
    shadow('opt_amt_shadow', spec.stake);
    shadow('opt_dur_shadow', spec.durationTicks);
    x = setNum(x, 'i1v', spec.stake); // stake
    x = setNum(x, 'i2v', spec.stake); // stakeW: the stake after a win
    x = setNum(x, 'i3v', BIG_LIMIT); // stoploss (enforced by the app)
    x = setNum(x, 'i4v', BIG_LIMIT); // takeprofit (enforced by the app)
    x = setNum(x, 'i5v', spec.durationTicks);
    x = setNum(x, 'i6v', spec.martingale);

    const b = makeBlocks();
    const ENTRY: TVar = ['v_entry', 'entryStage'];

    // a new variable, set to 0 at the start: 0 = waiting for the trigger, 1 = trigger seen, 2 = confirmed
    x = x.replace('</variables>', '<variable id="v_entry">entryStage</variable></variables>');
    const afterI6 = x.indexOf('</value>', x.indexOf('id="i6v"'));
    const closeI6 = x.indexOf('</block>', afterI6);
    x = `${x.slice(0, closeI6)}<next>${b.set(ENTRY, b.num(0))()}</next>${x.slice(closeI6)}`;

    // purchase only after the trigger digit and then a confirmation digit
    const confirm =
        spec.side === 'over'
            ? b.cmp('GT', b.lastDigit(), b.num(spec.confirmGt ?? spec.prediction))
            : b.and(b.cmp('LT', b.lastDigit(), b.num(spec.confirmLt ?? spec.prediction)), b.cmp('GT', b.lastDigit(), b.num(0)));
    const stack = b.chain(
        b.when(
            b.and(b.cmp('EQ', b.get(ENTRY), b.num(0)), b.cmp('EQ', b.lastDigit(), b.num(spec.trigger))),
            b.set(ENTRY, b.num(1))()
        ),
        b.when(b.and(b.cmp('EQ', b.get(ENTRY), b.num(1)), confirm), b.set(ENTRY, b.num(2))()),
        b.when(b.cmp('EQ', b.get(ENTRY), b.num(2)), b.purchase(contract))
    );
    x = replaceBlock(
        x,
        'before_purchase',
        `<block type="before_purchase" id="bp1" deletable="false" x="0" y="500"><statement name="BEFOREPURCHASE_STACK">${stack}</statement></block>`
    );

    // after a loss: stake x martingale, rounded to cents (the API refuses more than 2 decimals)
    const rounded = b.arith(
        'DIVIDE',
        b.round(b.arith('MULTIPLY', b.arith('MULTIPLY', b.get(['v_stake', 'stake']), b.get(['v_martingale', 'martingaleAfterLoss'])), b.num(100))),
        b.num(100)
    );
    x = replaceBlockAt(x, '<block type="math_arithmetic" id="ap_loss_bump_v"', rounded);

    // optional: trigger + confirmation again before every trade
    if (spec.confirmEvery) {
        const marker = '<statement name="AFTERPURCHASE_STACK">';
        const at = x.indexOf(marker, x.indexOf('<block type="after_purchase"')) + marker.length;
        const resetOpen = `<block type="variables_set" id="er1"><field name="VAR" id="v_entry">entryStage</field><value name="VALUE"><block type="math_number" id="er2"><field name="NUM">0</field></block></value><next>`;
        x = x.slice(0, at) + resetOpen + x.slice(at);
        const end = x.lastIndexOf('</statement>');
        x = `${x.slice(0, end)}</next></block>${x.slice(end)}`;
    }

    return x;
}
