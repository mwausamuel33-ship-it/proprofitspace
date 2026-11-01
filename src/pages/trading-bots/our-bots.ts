/**
 * The DBot XML bots built in our sessions, generated in code so they load straight into Bot Builder.
 * Every bot has take-profit / stop-loss protection. Digits are random: none of them can promise profit.
 */
export type TOurBot = { id: string; name: string; rating: number; description: string; xml: () => string };

const makeDsl = (vars: string[]) => {
  let n = 0;
  const id = () => `b${++n}`;
  const vid = (v: string) => `v${vars.indexOf(v)}`;
  const num = (x: number) => `<block type="math_number" id="${id()}"><field name="NUM">${x}</field></block>`;
  const get = (v: string) => `<block type="variables_get" id="${id()}"><field name="VAR" id="${vid(v)}">${v}</field></block>`;
  const setv = (v: string, val: string) => `<block type="variables_set" id="${id()}"><field name="VAR" id="${vid(v)}">${v}</field><value name="VALUE">${val}</value>`;
  const arith = (op: string, a: string, b: string) => `<block type="math_arithmetic" id="${id()}"><field name="OP">${op}</field><value name="A">${a}</value><value name="B">${b}</value></block>`;
  const cmp = (op: string, a: string, b: string) => `<block type="logic_compare" id="${id()}"><field name="OP">${op}</field><value name="A">${a}</value><value name="B">${b}</value></block>`;
  const or = (a: string, b: string) => `<block type="logic_operation" id="${id()}"><field name="OP">OR</field><value name="A">${a}</value><value name="B">${b}</value></block>`;
  const rnd = (x: string) => `<block type="math_round" id="${id()}"><field name="OP">ROUND</field><value name="NUM">${x}</value></block>`;
  const tp = () => `<block type="total_profit" id="${id()}"></block>`;
  const ld = () => `<block type="last_digit" id="${id()}"></block>`;
  const txt = (t: string) => `<block type="text" id="${id()}"><field name="TEXT">${t}</field></block>`;
  const notify = (kind: string, t: string) => `<block type="notify" id="${id()}"><field name="NOTIFICATION_TYPE">${kind}</field><field name="NOTIFICATION_SOUND">silent</field><value name="MESSAGE">${txt(t)}</value>`;
  const chain = (st: string[]) => {
    let out = '';
    for (const s of [...st].reverse()) out = s + (out ? `<next>${out}</next>` : '') + '</block>';
    return out;
  };
  const ifs = (cond: string, doo: string[], els?: string[]) => {
    let s = `<block type="controls_if" id="${id()}">${els ? '<mutation else="1"></mutation>' : ''}<value name="IF0">${cond}</value><statement name="DO0">${chain(doo)}</statement>`;
    if (els) s += `<statement name="ELSE">${chain(els)}</statement>`;
    return s;
  };
  const purchase = (t: string) => `<block type="purchase" id="${id()}"><field name="PURCHASE_LIST">${t}</field>`;
  const win = () => `<block type="contract_check_result" id="${id()}"><field name="CHECK_RESULT">win</field></block>`;
  const again = () => `<block type="trade_again" id="${id()}">`;
  const market = (symbol: string, cat: string, type: string) => chain([
    `<block type="trade_definition_market" id="${id()}" deletable="false" movable="false"><field name="MARKET_LIST">synthetic_index</field><field name="SUBMARKET_LIST">random_index</field><field name="SYMBOL_LIST">${symbol}</field>`,
    `<block type="trade_definition_tradetype" id="${id()}" deletable="false" movable="false"><field name="TRADETYPECAT_LIST">${cat}</field><field name="TRADETYPE_LIST">${type}</field>`,
    `<block type="trade_definition_contracttype" id="${id()}" deletable="false" movable="false"><field name="TYPE_LIST">both</field>`,
    `<block type="trade_definition_candleinterval" id="${id()}" deletable="false" movable="false"><field name="CANDLEINTERVAL_LIST">60</field>`,
    `<block type="trade_definition_restartbuysell" id="${id()}" deletable="false" movable="false"><field name="TIME_MACHINE_ENABLED">FALSE</field>`,
    `<block type="trade_definition_restartonerror" id="${id()}" deletable="false" movable="false"><field name="RESTARTONERROR">TRUE</field>`,
  ]);
  const assemble = (mkt: string, opts: string, init: string[], before: string[], after: string[]) =>
    '<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false"><variables>'
    + vars.map((v) => `<variable id="${vid(v)}">${v}</variable>`).join('') + '</variables>'
    + `<block type="trade_definition" id="${id()}" deletable="false" x="0" y="0"><statement name="TRADE_OPTIONS">${mkt}</statement>`
    + `<statement name="INITIALIZATION">${chain(init)}</statement><statement name="SUBMARKET">${opts}</statement></block>`
    + `<block type="before_purchase" id="${id()}" deletable="false" x="0" y="1000"><statement name="BEFOREPURCHASE_STACK">${chain(before)}</statement></block>`
    + `<block type="after_purchase" id="${id()}" x="0" y="1400"><statement name="AFTERPURCHASE_STACK">${chain(after)}</statement></block></xml>`;
  const digitOpts = (stakeVar: string, predVar: string) =>
    `<block type="trade_definition_tradeoptions" id="${id()}"><mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="true"></mutation>`
    + `<field name="DURATIONTYPE_LIST">t</field><value name="DURATION">${num(1)}</value><value name="AMOUNT">${get(stakeVar)}</value><value name="PREDICTION">${get(predVar)}</value></block>`;
  return { num, get, setv, arith, cmp, or, rnd, tp, ld, notify, chain, ifs, purchase, win, again, market, assemble, digitOpts };
};

/** Stake = round(loss / payout rate, 2) - the stake that wins the loss back in one trade. */
const recoveryStake = (d: ReturnType<typeof makeDsl>) =>
  d.arith('DIVIDE', d.rnd(d.arith('MULTIPLY', d.arith('DIVIDE', d.get('Loss'), d.get('PayoutRate')), d.num(100))), d.num(100));

/** Over 5 / Under 5 alternating on Volatility 100; Over 3 (or 2) payout-based recovery after a loss. */
const alternateRecovery = () => {
  const V = ['Stake', 'InitialStake', 'RecoveryBarrier', 'PayoutRate', 'TakeProfit', 'StopLoss', 'Mode', 'Leg', 'Dir', 'Prediction', 'CycleStart', 'Loss'];
  const d = makeDsl(V);
  const init = [
    d.setv('InitialStake', d.num(1)), d.setv('Stake', d.get('InitialStake')), d.setv('RecoveryBarrier', d.num(3)),
    d.setv('PayoutRate', d.num(0.58)), d.setv('TakeProfit', d.num(10)), d.setv('StopLoss', d.num(30)), d.setv('Mode', d.num(0)),
    d.setv('Leg', d.num(1)), d.setv('Dir', d.num(1)), d.setv('Prediction', d.num(5)), d.setv('CycleStart', d.num(0)), d.setv('Loss', d.num(0)),
    d.ifs(d.cmp('EQ', d.get('RecoveryBarrier'), d.num(2)), [d.setv('PayoutRate', d.num(0.36))], [d.setv('PayoutRate', d.num(0.58))]),
  ];
  const after = [
    d.ifs(d.cmp('EQ', d.get('Mode'), d.num(0)), [d.setv('Leg', d.arith('MINUS', d.num(3), d.get('Leg')))]),
    d.ifs(d.win(),
      [d.setv('Mode', d.num(0)), d.setv('Stake', d.get('InitialStake')), d.setv('CycleStart', d.tp())],
      [d.setv('Mode', d.num(1)), d.setv('Loss', d.arith('MINUS', d.get('CycleStart'), d.tp())), d.setv('Stake', recoveryStake(d))]),
    d.ifs(d.cmp('EQ', d.get('Mode'), d.num(1)),
      [d.setv('Dir', d.num(1)), d.setv('Prediction', d.get('RecoveryBarrier'))],
      [d.setv('Dir', d.get('Leg')), d.setv('Prediction', d.num(5))]),
    d.ifs(d.or(d.cmp('GTE', d.tp(), d.get('TakeProfit')), d.cmp('LTE', d.tp(), d.arith('MINUS', d.num(0), d.get('StopLoss')))),
      [d.notify('warn', 'Take profit / stop loss reached - bot stopped')], [d.again()]),
  ];
  const before = [d.ifs(d.cmp('EQ', d.get('Dir'), d.num(1)), [d.purchase('DIGITOVER')], [d.purchase('DIGITUNDER')])];
  return d.assemble(d.market('R_100', 'digits', 'overunder'), d.digitOpts('Stake', 'Prediction'), init, before, after);
};

/** Over 1 / Under 8 alternating with an entry-digit filter, safest-contract recovery and hard limits. */
const premiumOver1Under8 = () => {
  const V = ['Stake', 'InitialStake', 'RecoveryBarrier', 'PayoutRate', 'TakeProfit', 'StopLoss', 'Mode', 'Leg', 'Dir', 'Prediction', 'CycleStart', 'Loss', 'UseFilter', 'RecoverySteps', 'MaxSteps', 'MaxStake'];
  const d = makeDsl(V);
  const noFilter = () => d.cmp('EQ', d.get('UseFilter'), d.num(0));
  const init = [
    d.setv('InitialStake', d.num(1)), d.setv('Stake', d.get('InitialStake')), d.setv('RecoveryBarrier', d.num(3)), d.setv('PayoutRate', d.num(0.58)),
    d.setv('TakeProfit', d.num(10)), d.setv('StopLoss', d.num(30)), d.setv('UseFilter', d.num(1)), d.setv('MaxSteps', d.num(6)), d.setv('MaxStake', d.num(50)),
    d.setv('Mode', d.num(0)), d.setv('Leg', d.num(1)), d.setv('Dir', d.num(1)), d.setv('Prediction', d.num(1)), d.setv('CycleStart', d.num(0)),
    d.setv('Loss', d.num(0)), d.setv('RecoverySteps', d.num(0)),
    d.ifs(d.cmp('EQ', d.get('RecoveryBarrier'), d.num(2)), [d.setv('PayoutRate', d.num(0.36))], [d.setv('PayoutRate', d.num(0.58))]),
  ];
  const before = [d.ifs(d.cmp('EQ', d.get('Mode'), d.num(1)),
    [d.ifs(d.or(noFilter(), d.cmp('GT', d.ld(), d.get('RecoveryBarrier'))), [d.purchase('DIGITOVER')])],
    [d.ifs(d.cmp('EQ', d.get('Dir'), d.num(1)),
      [d.ifs(d.or(noFilter(), d.cmp('LTE', d.ld(), d.num(1))), [d.purchase('DIGITOVER')])],
      [d.ifs(d.or(noFilter(), d.cmp('GTE', d.ld(), d.num(8))), [d.purchase('DIGITUNDER')])])])];
  const stop = d.or(
    d.or(d.cmp('GTE', d.tp(), d.get('TakeProfit')), d.cmp('LTE', d.tp(), d.arith('MINUS', d.num(0), d.get('StopLoss')))),
    d.or(d.cmp('GT', d.get('RecoverySteps'), d.get('MaxSteps')), d.cmp('GT', d.get('Stake'), d.get('MaxStake'))));
  const after = [
    d.ifs(d.cmp('EQ', d.get('Mode'), d.num(0)), [d.setv('Leg', d.arith('MINUS', d.num(3), d.get('Leg')))]),
    d.ifs(d.win(),
      [d.setv('Mode', d.num(0)), d.setv('Stake', d.get('InitialStake')), d.setv('CycleStart', d.tp()), d.setv('RecoverySteps', d.num(0))],
      [d.setv('Mode', d.num(1)), d.setv('RecoverySteps', d.arith('ADD', d.get('RecoverySteps'), d.num(1))),
        d.setv('Loss', d.arith('MINUS', d.get('CycleStart'), d.tp())), d.setv('Stake', recoveryStake(d))]),
    d.ifs(d.cmp('EQ', d.get('Mode'), d.num(1)),
      [d.setv('Dir', d.num(1)), d.setv('Prediction', d.get('RecoveryBarrier'))],
      [d.setv('Dir', d.get('Leg')), d.ifs(d.cmp('EQ', d.get('Leg'), d.num(1)), [d.setv('Prediction', d.num(1))], [d.setv('Prediction', d.num(8))])]),
    d.ifs(stop, [d.notify('warn', 'Bot stopped: take profit, stop loss, max recovery steps or max stake reached')], [d.again()]),
  ];
  return d.assemble(d.market('R_100', 'digits', 'overunder'), d.digitOpts('Stake', 'Prediction'), init, before, after);
};

/** Over 1 only after a 4, 7 or 9; 3 runs then stop; a loss is recovered once with Over 3 (stake x 1.8) and the bot stops. */
const over1Entry479 = () => {
  const V = ['Stake', 'InitialStake', 'Martingale', 'MaxRuns', 'Runs', 'Mode', 'Prediction', 'StopLoss'];
  const d = makeDsl(V);
  const init = [
    d.setv('InitialStake', d.num(1)), d.setv('Stake', d.get('InitialStake')), d.setv('Martingale', d.num(1.8)), d.setv('MaxRuns', d.num(3)),
    d.setv('Runs', d.num(0)), d.setv('Mode', d.num(0)), d.setv('Prediction', d.num(1)), d.setv('StopLoss', d.num(30)),
  ];
  const entry = d.or(d.or(d.cmp('EQ', d.ld(), d.num(4)), d.cmp('EQ', d.ld(), d.num(7))), d.cmp('EQ', d.ld(), d.num(9)));
  const before = [d.ifs(d.cmp('EQ', d.get('Mode'), d.num(1)), [d.purchase('DIGITOVER')], [d.ifs(entry, [d.purchase('DIGITOVER')])])];
  const nextStake = d.arith('DIVIDE', d.rnd(d.arith('MULTIPLY', d.arith('MULTIPLY', d.get('Stake'), d.get('Martingale')), d.num(100))), d.num(100));
  const after = [d.ifs(d.win(),
    [d.ifs(d.cmp('EQ', d.get('Mode'), d.num(1)),
      [d.notify('success', 'Loss recovered - bot stopped')],
      [d.setv('Runs', d.arith('ADD', d.get('Runs'), d.num(1))), d.setv('Stake', d.get('InitialStake')),
        d.ifs(d.cmp('GTE', d.get('Runs'), d.get('MaxRuns')), [d.notify('success', 'Runs complete - bot stopped')], [d.again()])])],
    [d.setv('Mode', d.num(1)), d.setv('Prediction', d.num(3)), d.setv('Stake', nextStake),
      d.ifs(d.cmp('LTE', d.tp(), d.arith('MINUS', d.num(0), d.get('StopLoss'))), [d.notify('warn', 'Stop loss reached - bot stopped')], [d.again()])])];
  return d.assemble(d.market('R_100', 'digits', 'overunder'), d.digitOpts('Stake', 'Prediction'), init, before, after);
};

/** One leg of a hedge pair: run the HIGHER/RISE leg in one tab and the LOWER/FALL leg in another, on the same account. */
const hedgeLeg = (ttype: 'higherlower' | 'risefall', contract: 'CALL' | 'PUT', sign: '-' | '+' | null) => {
  const d = makeDsl(['Stake', 'TakeProfit', 'StopLoss', 'Offset']);
  const hb = sign !== null;
  const init = [d.setv('Stake', d.num(1)), d.setv('TakeProfit', d.num(10)), d.setv('StopLoss', d.num(30)), d.setv('Offset', d.num(1))];
  const after = [d.ifs(d.or(d.cmp('GTE', d.tp(), d.get('TakeProfit')), d.cmp('LTE', d.tp(), d.arith('MINUS', d.num(0), d.get('StopLoss')))),
    [d.notify('warn', 'Take profit / stop loss reached - bot stopped')], [d.again()])];
  const before = [d.purchase(contract)];
  const opts = `<block type="trade_definition_tradeoptions" id="hx"><mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="${hb}" has_second_barrier="false" has_prediction="false"></mutation>`
    + (hb ? `<field name="BARRIEROFFSETTYPE_LIST">${sign}</field>` : '')
    + `<field name="DURATIONTYPE_LIST">t</field><value name="DURATION">${d.num(5)}</value><value name="AMOUNT">${d.get('Stake')}</value>`
    + (hb ? `<value name="BARRIEROFFSET">${d.get('Offset')}</value>` : '') + '</block>';
  return d.assemble(d.market('1HZ100V', 'callput', ttype), opts, init, before, after);
};

export const OUR_BOTS: TOurBot[] = [
  {
    id: 'over5-under5-alternate', name: 'OVER5 UNDER5 ALTERNATE RECOVERY', rating: 5, xml: alternateRecovery,
    description: 'Alternates Over 5 and Under 5 on Volatility 100. After a loss it recovers with Over 3 using an exact payout-based stake, then goes back to alternating. Take profit and stop loss built in.',
  },
  {
    id: 'premium-over1-under8', name: 'PREMIUM OVER1 UNDER8 RECOVERY', rating: 5, xml: premiumOver1Under8,
    description: 'Alternates Over 1 and Under 8 and only enters after a matching last digit. Recovery uses Over 3 with a calculated stake, with max recovery steps, max stake, take profit and stop loss limits.',
  },
  {
    id: 'over1-entry-479', name: 'OVER1 ENTRY 4-7-9 PRO', rating: 5, xml: over1Entry479,
    description: 'Trades Over 1 only when the last digit is 4, 7 or 9, for 3 runs. A loss is recovered once with Over 3 (stake x 1.8) and the bot stops straight after the recovery. Stop loss included.',
  },
  {
    id: 'hedge-higher-leg', name: 'HEDGE HIGHER LEG (VOL 100 1S)', rating: 5, xml: () => hedgeLeg('higherlower', 'CALL', '-'),
    description: 'Higher leg of the two-sided hedge: 5 ticks, barrier offset 1. Load the Lower leg in a second browser tab and run both together on the same account.',
  },
  {
    id: 'hedge-lower-leg', name: 'HEDGE LOWER LEG (VOL 100 1S)', rating: 5, xml: () => hedgeLeg('higherlower', 'PUT', '+'),
    description: 'Lower leg of the two-sided hedge: 5 ticks, barrier offset 1. Run it together with the Higher leg in another tab. When price stays between the barriers both legs win.',
  },
  {
    id: 'hedge-rise-leg', name: 'HEDGE RISE LEG (VOL 100 1S)', rating: 5, xml: () => hedgeLeg('risefall', 'CALL', null),
    description: 'Rise leg of the symmetric hedge (no barrier, equal payout). Run the Fall leg in a second tab at the same time.',
  },
  {
    id: 'hedge-fall-leg', name: 'HEDGE FALL LEG (VOL 100 1S)', rating: 5, xml: () => hedgeLeg('risefall', 'PUT', null),
    description: 'Fall leg of the symmetric hedge (no barrier, equal payout). Run it together with the Rise leg in another tab.',
  },
];
