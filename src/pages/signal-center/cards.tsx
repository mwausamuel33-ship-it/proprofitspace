import React from 'react';
import { AccuConfig, AccuState, accuPlanner } from './accumulator';
import { FamilyCfg, JournalRow, RecoveryChoice, TraderConfig } from './auto-trader';
import { riskPlan } from './risk';
import { Candidate, DEFAULT_ENGINE, entryHintFor, FAMILIES, FAMILY_LABEL, Family, ScanRow, Signal } from './signal-engine';
import type { useProProfit } from './useProProfit';
import { Card, Check, cx, Field, Row, SelectField, Stat } from './ui';

export type Ctl = ReturnType<typeof useProProfit>;
const WINDOWS = DEFAULT_ENGINE.windows;
const N = WINDOWS.length;

const RULES: Record<Family, string> = {
  overunder: 'Trigger Over 5 / Under 5. Over 5 trades the safest of Over 1-2; Under 5 the safest of Under 8-7.',
  evenodd: 'Even or Odd when every window favours it.',
  matchesdiffers: 'The digit every window favours (Matches) or avoids (Differs).',
};

const level = (z: number) => (Math.abs(z) < 1 ? 1 : Math.abs(z) < 2 ? 2 : 3);
const HeatStrip = ({ c }: { c: Candidate }) => (
  <div className='pps-sig-heat'>
    {c.zs.map((z, i) => (
      <span key={i} title={`${WINDOWS[i]} ticks: z ${z.toFixed(2)}`} className={cx('pps-sig-heat__cell', z > 0 ? 'is-up' : 'is-down', `is-l${level(z)}`)} />
    ))}
  </div>
);

/* ---------- session ---------- */
export const SessionCard = ({ p }: { p: Ctl }) => {
  const { cfg, setCfg, trader, account } = p;
  const rows = trader.journal;
  const wins = rows.filter((r) => r.profit > 0).length;
  const pl = trader.sessionProfit;
  return (
    <Card>
      <div className='pps-sig__top'>
        <h2 className='pps-sig__title'>Signal Center</h2>
        <div className='pps-sig__acct'>
          <span className={cx('pps-sig-pill', account.virtual ? 'is-good' : 'is-bad')}>{account.virtual ? 'Demo' : 'Real'}</span>
          <span>{account.balance} {account.currency}</span>
          <span className='is-muted'>feed {p.status}</span>
        </div>
      </div>
      <p className={cx('pps-sig__state', `is-${trader.status}`)}>{trader.status} - {trader.note}</p>
      <div className='pps-sig-grid pps-sig-grid--sm'>
        <Stat label='Session P/L' value={pl} tone={pl >= 0 ? 'good' : 'bad'} />
        <Stat label='Trades' value={rows.length} />
        <Stat label='Wins' value={wins} tone='good' />
        <Stat label='Losses' value={rows.length - wins} tone='bad' />
        <Stat label='Win rate' value={`${rows.length ? Math.round((wins / rows.length) * 100) : 0}%`} />
        <Stat label='Recovery step' value={`${trader.step}/${cfg.maxSteps}`} tone={trader.step ? 'warn' : undefined} />
      </div>
      <div className='pps-sig-actions'>
        <div className='pps-sig-seg' role='group' aria-label='Mode'>
          {(['alert', 'shadow', 'auto'] as const).map((m) => (
            <button key={m} className={cx('pps-sig-seg__btn', cfg.mode === m && 'is-active')} onClick={() => setCfg({ mode: m })}>{m}</button>
          ))}
        </div>
        <button className='pps-sig-btn pps-sig-btn--danger' onClick={p.kill}>Kill switch</button>
        <button className='pps-sig-btn' onClick={p.reset}>Reset session</button>
        <Check label='Allow real account' checked={cfg.allowReal} onChange={(v) => setCfg({ allowReal: v })} />
      </div>
      <p className='pps-sig-note'>Statistical tool. Digits are random, so nothing here guarantees profit. Test on a demo account first.</p>
    </Card>
  );
};

/* ---------- strategies ---------- */
export const StrategiesCard = ({ p }: { p: Ctl }) => {
  const { cfg, setFamily, setOnly } = p;
  const enabled = FAMILIES.filter((f) => cfg.families[f].enabled);
  return (
    <Card title='Strategies to auto-run' hint={enabled.length ? enabled.map((f) => FAMILY_LABEL[f]).join(', ') : 'none'}>
      {FAMILIES.map((f) => (
        <div key={f} className='pps-sig-row'>
          <Check label={FAMILY_LABEL[f]} checked={cfg.families[f].enabled} onChange={(v) => setFamily(f, { enabled: v })} />
          <button className={cx('pps-sig-btn pps-sig-btn--sm', enabled.length === 1 && enabled[0] === f && 'is-active')} onClick={() => setOnly(f)}>Trade this only</button>
        </div>
      ))}
      <div className='pps-sig-actions'><button className='pps-sig-btn pps-sig-btn--sm' onClick={() => setOnly('all')}>Enable all</button></div>
    </Card>
  );
};

const FamilyCard = ({ f, fc, board, rows, setFamily }: {
  f: Family; fc: FamilyCfg; board: Candidate[]; rows: JournalRow[]; setFamily: (f: Family, patch: Partial<FamilyCfg>) => void;
}) => {
  const mine = rows.filter((r) => r.family === f);
  const pl = Math.round(mine.reduce((a, r) => a + r.profit, 0) * 100) / 100;
  return (
    <Card title={FAMILY_LABEL[f]} hint={fc.enabled ? 'auto-run on' : 'off'} on={fc.enabled}>
      <p className='pps-sig-note'>{RULES[f]} All {N} windows (50 to 1000 ticks) must agree. Session: {mine.length} trades, P/L {pl}.</p>
      {board.length === 0 && <p className='pps-sig-empty'>Analysing markets...</p>}
      {board.map((c, i) => (
        <div key={i} className='pps-sig-cand'>
          <Row left={<b>{c.market} - {c.label}</b>} right={`${c.aligned}/${N} windows - ${c.confidence}%`} tone={c.aligned === N ? 'good' : undefined} />
          <HeatStrip c={c} />
        </div>
      ))}
      <div className='pps-sig-grid'>
        <Field label='Stake' value={fc.stake} onCommit={(v) => setFamily(f, { stake: v })} />
        <Field label='Min confidence %' value={fc.minConfidence} onCommit={(v) => setFamily(f, { minConfidence: v })} />
        <SelectField label='Recovery contract' value={fc.recovery} onChange={(v) => setFamily(f, { recovery: v as RecoveryChoice })}
          options={[['smart', 'Smart (safest strong)'], ['over2', 'Over 2'], ['over3', 'Over 3'], ['same', 'Same contract']]} />
      </div>
    </Card>
  );
};
export const FamilyCards = ({ p }: { p: Ctl }) => (
  <>{FAMILIES.map((f) => <FamilyCard key={f} f={f} fc={p.cfg.families[f]} board={p.boards[f]} rows={p.trader.journal} setFamily={p.setFamily} />)}</>
);

/* ---------- account protection ---------- */
export const AccountCard = ({ cfg, setCfg, balance, currency }: { cfg: TraderConfig; setCfg: (p: Partial<TraderConfig>) => void; balance: number; currency: string }) => {
  const plan = riskPlan(balance, cfg, cfg.families.overunder.stake);
  const num = (k: keyof TraderConfig) => (v: number) => setCfg({ [k]: v } as Partial<TraderConfig>);
  const useRecommended = () => {
    const fams = { ...cfg.families };
    (Object.keys(fams) as Family[]).forEach((k) => { fams[k] = { ...fams[k], stake: plan.recommended }; });
    setCfg({ families: fams });
  };
  // One click for a $2-$5 account: Even/Odd only, minimum stake, one recovery step, tight limits.
  const smallAccount = () => setCfg({
    families: {
      overunder: { ...cfg.families.overunder, enabled: false },
      evenodd: { ...cfg.families.evenodd, enabled: true, stake: 0.35, minConfidence: 90, recovery: 'same' },
      matchesdiffers: { ...cfg.families.matchesdiffers, enabled: false },
    },
    entryMode: 'standard', autoStake: false, runsPerSignal: 1, recoveryStages: 1, recoveryMode: 'payout', recoveryTarget: 0,
    maxSteps: 1, maxStake: 1, takeProfit: 1, stopLoss: 1, stopLossPct: 30, maxCycleRiskPct: 40, cooldownMs: 5000,
  });
  return (
    <Card title='Account protection' hint='a recovery that would break the cycle limit is blocked'>
      <div className='pps-sig-grid pps-sig-grid--sm'>
        <Stat label='Balance' value={`${balance} ${currency}`} />
        <Stat label='Recommended stake' value={plan.recommended} tone='good' />
        <Stat label='Max risk per cycle' value={plan.cap} tone='warn' />
        <Stat label='Session stop loss' value={plan.stopLoss} tone='bad' />
      </div>
      <div className='pps-sig-grid'>
        <Field label='Risk per trade (% of balance)' value={cfg.riskPerTradePct} onCommit={num('riskPerTradePct')} />
        <Field label='Max risk per cycle (%)' value={cfg.maxCycleRiskPct} onCommit={num('maxCycleRiskPct')} />
        <Field label='Stop loss (% of start balance)' value={cfg.stopLossPct} onCommit={num('stopLossPct')} hint='0 = fixed stop loss' />
        <SelectField label='Over/Under contract risk' value={cfg.contractRisk} onChange={(v) => setCfg({ contractRisk: v as TraderConfig['contractRisk'] })}
          options={[['safest', 'Safest: Over 1 / Under 8'], ['standard', 'Standard: Over 1-2 / Under 8-7'], ['wide', 'Wide: Over 1-3 / Under 9-7']]} />
      </div>
      <div className='pps-sig-actions'>
        <Check label='Auto stake from balance' checked={cfg.autoStake} onChange={(v) => setCfg({ autoStake: v })} />
        <button className='pps-sig-btn pps-sig-btn--sm' onClick={useRecommended}>Use recommended stake ({plan.recommended})</button>
        <button className='pps-sig-btn pps-sig-btn--sm' title='Even/Odd only, 0.35 stake, one recovery step, stop after about 1 of loss' onClick={smallAccount}>Small account preset</button>
      </div>
      <h4 className='pps-sig-sub'>Worst case if every recovery trade loses (stake {plan.stake})</h4>
      {plan.chain.map((s) => (
        <Row key={s.step} left={`${s.label}: stake ${s.stake}`} right={`at risk ${s.atRisk} - ${s.ok ? 'allowed' : 'blocked'}`} tone={s.ok ? undefined : 'bad'} />
      ))}
    </Card>
  );
};

/* ---------- entry points ---------- */
export const EntryCard = ({ cfg, setCfg }: { cfg: TraderConfig; setCfg: (p: Partial<TraderConfig>) => void }) => (
  <Card title='Entry points' hint='waits for confirmation instead of buying blind'>
    <div className='pps-sig-grid'>
      <SelectField label='Entry filter' value={cfg.entryMode} onChange={(v) => setCfg({ entryMode: v as TraderConfig['entryMode'] })}
        options={[['off', 'Off (buy at once)'], ['standard', 'Standard (1 confirming digit)'], ['strict', 'Strict (2 in a row)']]} />
      <Field label='Entry timeout (seconds)' value={cfg.entryTimeoutMs / 1000} onCommit={(v) => setCfg({ entryTimeoutMs: v * 1000 })} />
    </div>
  </Card>
);

/* ---------- market scanner ---------- */
const Cell = ({ c }: { c?: Candidate }) => (
  c ? <span className={cx('pps-sig-cell', c.aligned === N ? 'is-good' : c.aligned >= 9 ? 'is-warn' : 'is-muted')}>{c.label} {c.aligned}/{N} {c.confidence}%</span> : <span className='is-muted'>-</span>
);
export const ScannerCard = ({ rows }: { rows: ScanRow[] }) => (
  <Card title='Market scanner' hint={`green = all ${N} windows agree`}>
    <div className='pps-sig-scroll-x'>
      <div className='pps-sig-table pps-sig-table--scan'>
        <div className='pps-sig-table__row pps-sig-table__row--head'><span>Market</span><span>Over / Under</span><span>Even / Odd</span><span>Matches / Differs</span><span>Hot / cold</span></div>
        {rows.length === 0 && <p className='pps-sig-empty'>Analysing markets...</p>}
        {rows.map((r) => (
          <div key={r.market} className='pps-sig-table__row'>
            <b>{r.market}</b><Cell c={r.ou} /><Cell c={r.eo} /><Cell c={r.md} /><span>{r.hot} / {r.cold}</span>
          </div>
        ))}
      </div>
    </div>
  </Card>
);

/* ---------- accumulators ---------- */
const Planner = ({ balance, cfg }: { balance: number; cfg: AccuConfig }) => (
  <>
    <h4 className='pps-sig-sub'>Recovery planner</h4>
    <p className='pps-sig-note'>Needs = how often a position must hit the target to break even. Recovery stake = multiple of the lost stake needed to win it back in one trade. Green fits your cycle limit.</p>
    <div className='pps-sig-scroll-x'>
      <div className='pps-sig-table pps-sig-table--plan'>
        <div className='pps-sig-table__row pps-sig-table__row--head'><span>Growth</span><span>Ticks</span><span>Profit</span><span>Needs</span><span>Recovery stake</span></div>
        {accuPlanner(balance, cfg).filter((r) => r.n === 5 || r.n === 10).map((r) => (
          <div key={`${r.g}-${r.n}`} className={cx('pps-sig-table__row', r.allowed && 'is-good')}>
            <span>{Math.round(r.g * 100)}%</span><span>{r.n}</span><span>{r.profitPct.toFixed(1)}%</span><span>{r.needSurvive.toFixed(1)}%</span><span>{r.recoveryMult.toFixed(1)}x the loss</span>
          </div>
        ))}
      </div>
    </div>
  </>
);

const GROWTH: [number, string][] = [[0.01, '1%'], [0.02, '2%'], [0.03, '3%'], [0.04, '4%'], [0.05, '5%']];
export const AccumulatorCard = ({ s, cfg, setCfg, balance }: { s: AccuState; cfg: AccuConfig; setCfg: (p: Partial<AccuConfig>) => void; balance: number }) => {
  const wins = s.rows.filter((r) => r.profit > 0).length;
  const n = (k: keyof AccuConfig) => (v: number) => setCfg({ [k]: v } as Partial<AccuConfig>);
  const sh = s.shadow;
  return (
    <Card title='Accumulators' hint='a knockout loses the whole stake' on={cfg.mode === 'auto'}>
      <p className='pps-sig-note'>Calm-market entry, expected value from the live barrier, take profit after a target number of ticks. Recovery is off by default and, when on, uses a calculated stake inside a cycle limit.</p>
      <p className={cx('pps-sig__state', `is-${s.status}`)}>{cfg.mode} - {s.status} - {s.note}</p>
      <div className='pps-sig-grid pps-sig-grid--sm'>
        <Stat label='Session P/L' value={s.sessionProfit} tone={s.sessionProfit >= 0 ? 'good' : 'bad'} />
        <Stat label='Trades' value={s.rows.length} />
        <Stat label='Target hit' value={wins} tone='good' />
        <Stat label='Knockouts' value={s.rows.length - wins} tone='bad' />
        <Stat label='Knockout streak' value={`${s.lossStreak}/${cfg.maxLossStreak}`} tone={s.lossStreak ? 'warn' : undefined} />
        <Stat label='Still to recover' value={s.cycleLoss} tone={s.cycleLoss ? 'warn' : undefined} />
      </div>
      <div className='pps-sig-actions'>
        <div className='pps-sig-seg' role='group' aria-label='Accumulator mode'>
          {(['off', 'shadow', 'auto'] as const).map((m) => (
            <button key={m} className={cx('pps-sig-seg__btn', cfg.mode === m && 'is-active')} onClick={() => setCfg({ mode: m })}>{m}</button>
          ))}
        </div>
        <Check label='Auto stake from balance' checked={cfg.autoStake} onChange={(v) => setCfg({ autoStake: v })} />
        <Check label='Calm-market entry only' checked={cfg.calmEntry} onChange={(v) => setCfg({ calmEntry: v })} />
      </div>
      <div className='pps-sig-grid'>
        <Field label='Stake' value={cfg.stake} onCommit={n('stake')} />
        <Field label='Auto stake (% of balance)' value={cfg.riskPct} onCommit={n('riskPct')} />
        <SelectField label='Growth rate per tick' value={cfg.growthRate} onChange={(v) => setCfg({ growthRate: Number(v) })} options={GROWTH} />
        <Field label='Take profit after (ticks)' value={cfg.targetTicks} onCommit={n('targetTicks')} />
        <Field label='Skip if expected loss worse than (%)' value={cfg.maxEdgeLossPct} onCommit={n('maxEdgeLossPct')} />
        <Field label='Stop after knockouts in a row' value={cfg.maxLossStreak} onCommit={n('maxLossStreak')} />
        <Field label='Session take profit' value={cfg.takeProfit} onCommit={n('takeProfit')} />
        <Field label='Session stop loss' value={cfg.stopLoss} onCommit={n('stopLoss')} />
        <Field label='Cooldown (ms)' value={cfg.cooldownMs} onCommit={n('cooldownMs')} />
      </div>
      <h4 className='pps-sig-sub'>Growth plan and recovery</h4>
      <div className='pps-sig-grid'>
        <SelectField label='Recovery after a knockout' value={cfg.recovery} onChange={(v) => setCfg({ recovery: v as AccuConfig['recovery'] })}
          options={[['off', 'Off (accept the loss)'], ['capped', 'Capped (calculated stake)']]} />
        <SelectField label='Recovery growth rate' value={cfg.recoveryGrowth} onChange={(v) => setCfg({ recoveryGrowth: Number(v) })} options={GROWTH} />
        <Field label='Recovery target (ticks)' value={cfg.recoveryTicks} onCommit={n('recoveryTicks')} />
        <Field label='Max recovery attempts' value={cfg.maxRecoveryTries} onCommit={n('maxRecoveryTries')} />
        <Field label='Max risk per cycle (%)' value={cfg.cycleRiskPct} onCommit={n('cycleRiskPct')} />
        <Field label='Smaller stakes after a knockout (trades)' value={cfg.defensiveTrades} onCommit={n('defensiveTrades')} />
        <Field label='Stake multiplier while smaller' value={cfg.defensiveMult} onCommit={n('defensiveMult')} />
        <Field label='Session goal (% gain)' value={cfg.goalPct} onCommit={n('goalPct')} />
        <Field label='Session loss limit (%)' value={cfg.lossPct} onCommit={n('lossPct')} />
        <Field label='Max trades per session' value={cfg.maxTrades} onCommit={n('maxTrades')} />
      </div>
      <Planner balance={balance} cfg={cfg} />
      <h4 className='pps-sig-sub'>Calmest markets now</h4>
      {s.board.length === 0 && <p className='pps-sig-empty'>{cfg.mode === 'off' ? 'Switch to Shadow or Auto to start scanning.' : 'Collecting data...'}</p>}
      {s.board.map((b) => (
        <Row key={b.market} left={<><b>{b.market}</b> calm {b.calm.score}/100{b.calm.spike ? ' (recent spike)' : ''}</>}
          right={b.ev !== undefined ? `expected ${(b.ev * 100).toFixed(1)}%, breach ${((b.breach ?? 0) * 100).toFixed(1)}% per tick` : 'no quote yet'} tone={b.ev !== undefined && b.ev >= 0 ? 'good' : undefined} />
      ))}
      <h4 className='pps-sig-sub'>Shadow results (no money)</h4>
      <p className='pps-sig-note'>{sh.n === 0 ? 'No shadow entries scored yet.' : `${sh.survived}/${sh.n} reached the target (${Math.round((sh.survived / sh.n) * 100)}% observed vs ${Math.round((sh.expected / sh.n) * 100)}% expected)`}</p>
      <h4 className='pps-sig-sub'>Journal</h4>
      {s.rows.length === 0 && <p className='pps-sig-empty'>No trades yet.</p>}
      {s.rows.slice(-10).reverse().map((r, i) => (
        <Row key={i} left={`${new Date(r.ts).toLocaleTimeString()} ${r.market} ${r.rec ? 'recovery ' : ''}${r.kind}`} right={`stake ${r.stake}  ${r.profit}`} tone={r.profit > 0 ? 'good' : 'bad'} />
      ))}
    </Card>
  );
};

/* ---------- risk, signals, scoreboard, journal ---------- */
export const RiskCard = ({ cfg, setCfg }: { cfg: TraderConfig; setCfg: (p: Partial<TraderConfig>) => void }) => {
  const num = (k: keyof TraderConfig) => (v: number) => setCfg({ [k]: v } as Partial<TraderConfig>);
  return (
    <Card title='Runs, recovery and limits' hint='shared by all strategies'>
      <div className='pps-sig-grid'>
        <Field label='Runs per strong signal' value={cfg.runsPerSignal} onCommit={num('runsPerSignal')} hint='then rescan' />
        <Field label='Keep trading while confidence >=' value={cfg.stayConfidence} onCommit={num('stayConfidence')} />
        <SelectField label='Recover in stages' value={cfg.recoveryStages} onChange={(v) => setCfg({ recoveryStages: Number(v) })}
          options={[[1, '1 win (full)'], [2, '2 wins (safer stakes)'], [3, '3 wins (safest stakes)']]} />
        <SelectField label='Recovery mode' value={cfg.recoveryMode} onChange={(v) => setCfg({ recoveryMode: v as TraderConfig['recoveryMode'] })}
          options={[['payout', 'Payout-based (exact)'], ['multiplier', 'Multiplier']]} />
        <Field label='Recovery profit target' value={cfg.recoveryTarget} onCommit={num('recoveryTarget')} />
        <Field label='Multiplier' value={cfg.multiplier} onCommit={num('multiplier')} />
        <Field label='Take profit' value={cfg.takeProfit} onCommit={num('takeProfit')} />
        <Field label='Stop loss' value={cfg.stopLoss} onCommit={num('stopLoss')} />
        <Field label='Max stake' value={cfg.maxStake} onCommit={num('maxStake')} />
        <Field label='Max recovery steps' value={cfg.maxSteps} onCommit={num('maxSteps')} />
        <Field label='Cooldown (ms)' value={cfg.cooldownMs} onCommit={num('cooldownMs')} />
        <Field label='Scan window (ms)' value={cfg.scanMs} onCommit={num('scanMs')} hint='collect signals, trade best' />
      </div>
      <Check label='Wait for a favourable digit before recovery' checked={cfg.waitRecoveryDigit} onChange={(v) => setCfg({ waitRecoveryDigit: v })} />
    </Card>
  );
};

export const SignalsCard = ({ signals, mode }: { signals: Signal[]; mode: TraderConfig['entryMode'] }) => (
  <Card title='Live signals'>
    {signals.length === 0 && <p className='pps-sig-empty'>Waiting for a signal where every window agrees...</p>}
    {signals.slice(0, 8).map((s) => (
      <div key={s.id} className='pps-sig-cand'>
        <Row left={<b>{FAMILY_LABEL[s.family]}: {s.market} - {s.label}</b>} right={`${s.confidence}%`} tone={s.confidence >= 95 ? 'good' : 'info'} />
        <p className='pps-sig-note'>{new Date(s.ts).toLocaleTimeString()} - {s.reasons.join(' | ')}</p>
        <p className='pps-sig-note is-info'>Entry: {entryHintFor(s, mode)}</p>
      </div>
    ))}
  </Card>
);

export const ScoreboardCard = ({ report }: { report: Ctl['report'] }) => (
  <Card title='Signal scoreboard' hint='observed vs theoretical hit rate'>
    {report.length === 0 && <p className='pps-sig-empty'>Collecting results...</p>}
    {report.map((r) => <Row key={r.type} left={r.type} right={`${r.observed}% observed vs ${r.theoretical}% expected (${r.n})`} />)}
  </Card>
);

export const JournalCard = ({ rows }: { rows: JournalRow[] }) => (
  <Card title='Trade journal'>
    {rows.length === 0 && <p className='pps-sig-empty'>No trades yet.</p>}
    {rows.slice(-15).reverse().map((j, i) => (
      <Row key={i} left={`${new Date(j.ts).toLocaleTimeString()} ${j.market} ${j.label}`} right={`stake ${j.stake}  ${j.profit}`} tone={j.profit >= 0 ? 'good' : 'bad'} />
    ))}
  </Card>
);
