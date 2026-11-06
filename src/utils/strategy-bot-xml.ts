import { DestroyerSignal, submarketFor } from '@/utils/destroyer-rules';

export type TStrategyBotOptions = {
    symbol: string;
    stake?: number;
    martingale?: number;
    maxRuns?: number;
    maxRecoverySteps?: number;
    takeProfit?: number;
    stopLoss?: number;
};

/**
 * Bot for a smart-scan signal: wait for the trigger digit, run when a confirm digit follows within 2 ticks,
 * recover with martingale on the recovery contract (Over 3 / Under 6), stop on take profit, stop loss or max runs.
 */
export const buildStrategyBotXml = (signal: DestroyerSignal, options: TStrategyBotOptions): string => {
    const stake = options.stake ?? 0.5;
    const settings: [string, number][] = [
        ['BaseStake', stake],
        ['Mult', options.martingale ?? 2],
        ['MaxSteps', options.maxRecoverySteps ?? 2],
        ['MaxRuns', options.maxRuns ?? 3],
        ['TP', options.takeProfit ?? Math.round(stake * 10 * 100) / 100],
        ['SL', options.stopLoss ?? Math.round(stake * 20 * 100) / 100],
        ['RecPrediction', signal.recoveryPrediction],
        ['Stake', stake],
        ['Prediction', signal.prediction],
        ['Phase', 1],
        ['Step', 0],
        ['Runs', 0],
    ];
    const kind = signal.side === 'over' ? 'DIGITOVER' : 'DIGITUNDER';
    const trigger = signal.trigger ?? signal.entryDigits[0];
    const confirm = signal.confirmDigits?.length ? signal.confirmDigits : signal.side === 'over' ? [4, 5, 6, 7, 8] : [1, 2, 3, 4, 5];
    const confirm_min = Math.min(...confirm);
    const confirm_max = Math.max(...confirm);

    let n = 0;
    const used = new Set<string>();
    const blk = (type: string, body = '', mut = '', extra = '') => `<block type="${type}" id="b${++n}"${extra}>${mut}${body}</block>`;
    const field = (name: string, v: string | number) => `<field name="${name}">${v}</field>`;
    const val = (name: string, x: string) => `<value name="${name}">${x}</value>`;
    const chain = (blocks: string[]) => {
        let s = '';
        [...blocks].reverse().forEach(b => {
            s = b.slice(0, -8) + (s ? `<next>${s}</next>` : '') + '</block>';
        });
        return s;
    };
    const stmt = (name: string, blocks: string[]) => `<statement name="${name}">${chain(blocks)}</statement>`;
    const num = (x: number) => blk('math_number', field('NUM', x));
    const get = (v: string) => {
        used.add(v);
        return blk('variables_get', `<field name="VAR" id="v_${v}">${v}</field>`);
    };
    const setv = (v: string, e: string) => {
        used.add(v);
        return blk('variables_set', `<field name="VAR" id="v_${v}">${v}</field>${val('VALUE', e)}`);
    };
    const ar = (op: string, a: string, b: string) => blk('math_arithmetic', field('OP', op) + val('A', a) + val('B', b));
    const cmp = (op: string, a: string, b: string) => blk('logic_compare', field('OP', op) + val('A', a) + val('B', b));
    const and = (a: string, b: string) => blk('logic_operation', field('OP', 'AND') + val('A', a) + val('B', b));
    const or = (a: string, b: string) => blk('logic_operation', field('OP', 'OR') + val('A', a) + val('B', b));
    const not = (a: string) => blk('logic_negate', val('BOOL', a));
    const round2 = (e: string) =>
        ar('DIVIDE', blk('math_round', field('OP', 'ROUND') + val('NUM', ar('MULTIPLY', e, num(100)))), num(100));
    const when = (cond: string, then: string[], otherwise?: string[]) =>
        blk(
            'controls_if',
            val('IF0', cond) + stmt('DO0', then) + (otherwise ? stmt('ELSE', otherwise) : ''),
            otherwise ? '<mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>' : ''
        );
    const fixed = ' deletable="false" movable="false"';

    // digit n ticks back (1 = the latest tick)
    const digitAgo = (k: number) =>
        blk(
            'lists_getIndex',
            field('MODE', 'GET') + field('WHERE', 'FROM_END') + val('VALUE', blk('lastDigitList')) + val('AT', num(k)),
            '<mutation xmlns="http://www.w3.org/1999/xhtml" statement="false" at="true"></mutation>'
        );
    const isConfirm = (k: number) => and(cmp('GTE', digitAgo(k), num(confirm_min)), cmp('LTE', digitAgo(k), num(confirm_max)));
    // confirm digit now, and the trigger was 1 tick ago, or 2 ticks ago with no confirm digit in between
    const entry = and(
        isConfirm(1),
        or(cmp('EQ', digitAgo(2), num(trigger)), and(cmp('EQ', digitAgo(3), num(trigger)), not(isConfirm(2))))
    );

    const market = [
        blk('trade_definition_market', field('MARKET_LIST', 'synthetic_index') + field('SUBMARKET_LIST', submarketFor(options.symbol)) + field('SYMBOL_LIST', options.symbol), '', fixed),
        blk('trade_definition_tradetype', field('TRADETYPE_CATEGORY_LIST', 'digits') + field('TRADETYPE_LIST', 'overunder'), '', fixed),
        blk('trade_definition_contracttype', field('TYPE_LIST', kind), '', fixed),
        blk('trade_definition_candleinterval', field('CANDLEINTERVAL_LIST', '60'), '', fixed),
        blk('trade_definition_restartbuysell', field('TIME_MACHINE_ENABLED', 'FALSE'), '', fixed),
        blk('trade_definition_restartonerror', field('RESTARTONERROR', 'TRUE'), '', fixed),
    ];
    const shadow = (x: number) => `<shadow type="math_number_positive" id="b${++n}"><field name="NUM">${x}</field></shadow>`;
    const options_block = blk(
        'trade_definition_tradeoptions',
        field('DURATIONTYPE_LIST', 't') +
            field('CURRENCY_LIST', 'USD') +
            val('DURATION', shadow(1)) +
            val('AMOUNT', shadow(1) + get('Stake')) +
            val('PREDICTION', shadow(1) + get('Prediction')),
        '<mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="true"></mutation>'
    );
    const definition = blk(
        'trade_definition',
        stmt('TRADE_OPTIONS', market) + stmt('INITIALIZATION', settings.map(([name, v]) => setv(name, num(v)))) + stmt('SUBMARKET', [options_block]),
        '',
        ' deletable="false" x="0" y="0"'
    );

    const buy = () => blk('purchase', field('PURCHASE_LIST', kind));
    const before = blk(
        'before_purchase',
        stmt('BEFOREPURCHASE_STACK', [when(cmp('EQ', get('Phase'), num(2)), [buy()], [when(entry, [buy()])])]),
        '',
        ' deletable="false" x="0" y="600"'
    );
    const during = blk('during_purchase', '<statement name="DURING_PURCHASE_STACK"></statement>', '', ' deletable="false" x="450" y="600"');

    // a cycle ends on any win, or when the martingale steps run out: back to the base trade
    const to_base = () => [
        setv('Runs', ar('ADD', get('Runs'), num(1))),
        setv('Step', num(0)),
        setv('Phase', num(1)),
        setv('Prediction', num(signal.prediction)),
        setv('Stake', get('BaseStake')),
    ];
    const profit = setv('LastProfit', blk('read_details', field('DETAIL_INDEX', '4')));
    const after = blk(
        'after_purchase',
        stmt('AFTERPURCHASE_STACK', [
            profit,
            when(cmp('GT', get('LastProfit'), num(0)), to_base(), [
                setv('Step', ar('ADD', get('Step'), num(1))),
                when(cmp('GT', get('Step'), get('MaxSteps')), to_base(), [
                    setv('Phase', num(2)),
                    setv('Prediction', get('RecPrediction')),
                    setv('Stake', round2(ar('MULTIPLY', get('Stake'), get('Mult')))),
                ]),
            ]),
            when(cmp('LT', get('Stake'), num(0.35)), [setv('Stake', num(0.35))]),
            when(
                and(
                    and(cmp('GT', blk('total_profit'), ar('MINUS', num(0), get('SL'))), cmp('LT', blk('total_profit'), get('TP'))),
                    cmp('LT', get('Runs'), get('MaxRuns'))
                ),
                [blk('trade_again')]
            ),
        ]),
        '',
        ' deletable="false" x="0" y="1100"'
    );

    const variables = `<variables>${[...used].sort().map(v => `<variable id="v_${v}">${v}</variable>`).join('')}</variables>`;
    return `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">${variables}${definition}${before}${during}${after}</xml>`;
};
