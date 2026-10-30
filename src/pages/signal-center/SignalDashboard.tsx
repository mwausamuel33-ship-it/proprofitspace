import React from 'react';
import { useProProfit } from './useProProfit';
import { FamilyCfg, JournalRow, RecoveryChoice, TraderConfig } from './auto-trader';
import { Candidate, FAMILIES, FAMILY_LABEL, Family, ScanRow, entryHintFor } from './signal-engine';
import { AccuConfig, AccuState, accuPlanner } from './accumulator';
import { riskPlan } from './risk';

const C = { bg: '#0b1220', card: '#111827', line: '#1f2937', text: '#e5e7eb', dim: '#9ca3af', green: '#22c55e', red: '#ef4444', blue: '#38bdf8', amber: '#f59e0b' };
const card: React.CSSProperties = { background: C.card, color: C.text, borderRadius: 16, padding: 16, marginBottom: 14, border: `1px solid ${C.line}` };
const h: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 10 };
const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 });
const btn = (on: boolean, color = C.green): React.CSSProperties => ({
  padding: '9px 16px', borderRadius: 10, border: 0, fontWeight: 700, fontSize: 14, cursor: 'pointer',
  background: on ? color : '#374151', color: '#fff',
});
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.bg, color: C.text, fontSize: 14 };

// Own scroll area so the page scrolls on laptop and phone (leaves room for the site's header, tabs and run panel)
const CSS = `.pp-sc{box-sizing:border-box;height:calc(100vh - 240px);height:calc(100dvh - 240px);overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding-bottom:110px}`;

const WINDOWS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const RULES: Record<Family, string> = {
  overunder: 'Trigger: Over 5 / Under 5. Over 5 trades the strongest of Over 3/2/1; Under 5 trades the strongest of Under 6/7/8/9.',
  evenodd: 'Trades Even or Odd when every window favours it.',
  matchesdiffers: 'Trades the digit that every window favours (Matches) or avoids (Differs).',
};

const Tile = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
  <div style={{ background: C.bg, borderRadius: 12, padding: '10px 12px' }}>
    <div style={{ fontSize: 12, color: C.dim }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: color || C.text }}>{value}</div>
  </div>
);

/** One cell per window (50..1000): green = beats fair odds in that window, red = below. */
const HeatStrip = ({ c }: { c: Candidate }) => (
  <div style={{ display: 'flex', gap: 3, margin: '6px 0' }}>
    {c.zs.map((z, i) => (
      <div key={i} title={`${WINDOWS[i]} ticks: z ${z.toFixed(2)}`}
        style={{ flex: 1, height: 14, borderRadius: 3, background: z > 0 ? C.green : C.red, opacity: Math.min(1, 0.35 + Math.abs(z) / 3) }} />
    ))}
  </div>
);

/** Number box that keeps what you type (even while the page refreshes) and saves valid numbers as you go. */
const NumInput = ({ value, onCommit }: { value: number; onCommit: (v: number) => void }) => {
  const [text, setText] = React.useState(String(value));
  const [focus, setFocus] = React.useState(false);
  React.useEffect(() => { if (!focus) setText(String(value)); }, [value, focus]);
  return (
    <input style={input} type="text" inputMode="decimal" value={text}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => {
        const t = e.target.value;
        if (/^\d*\.?\d*$/.test(t)) { setText(t); const v = parseFloat(t); if (!Number.isNaN(v)) onCommit(v); }
      }} />
  );
};

const Field = ({ label, value, onCommit, hint }: { label: string; value: number; onCommit: (v: number) => void; hint?: string }) => (
  <label style={{ fontSize: 12, color: C.dim }}>
    {label}
    <NumInput value={value} onCommit={onCommit} />
    {hint && <span style={{ fontSize: 11 }}>{hint}</span>}
  </label>
);

/** Entry points: the bot waits for confirmation instead of buying blind. */
const EntryCard = ({ cfg, setCfg }: { cfg: TraderConfig; setCfg: (p: Partial<TraderConfig>) => void }) => (
  <div style={card}>
    <div style={h}>Entry points (no blind entries)</div>
    <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
      After a signal appears the bot waits until it is still strong and the latest digit(s) confirm the contract. If that does not happen in time, the signal is skipped. This stops entries in the middle of a cold streak; it cannot change the odds of a random digit.
    </div>
    <div style={grid(150)}>
      <label style={{ fontSize: 12, color: C.dim }}>Entry filter
        <select style={input} value={cfg.entryMode} onChange={(e) => setCfg({ entryMode: e.target.value as TraderConfig['entryMode'] })}>
          <option value="off">Off (buy at once)</option>
          <option value="standard">Standard (1 confirming digit)</option>
          <option value="strict">Strict (2 in a row + recent hit rate)</option>
        </select>
      </label>
      <Field label="Entry timeout (seconds)" value={cfg.entryTimeoutMs / 1000} onCommit={(v) => setCfg({ entryTimeoutMs: v * 1000 })} />
    </div>
  </div>
);

const candColor = (c?: Candidate) => (!c ? C.dim : c.aligned === WINDOWS.length ? C.green : c.aligned >= 9 ? C.amber : C.dim);
const Cell = ({ c }: { c?: Candidate }) => (
  c ? <span style={{ color: candColor(c), fontWeight: 700 }}>{c.label} {c.aligned}/{WINDOWS.length} {c.confidence}%</span> : <span style={{ color: C.dim }}>-</span>
);

/** Every market at a glance: best candidate of each strategy and how many windows agree. */
const ScannerCard = ({ rows }: { rows: ScanRow[] }) => (
  <div style={card}>
    <div style={h}>Market scanner</div>
    <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>Best candidate per strategy for every market. Green = all {WINDOWS.length} windows agree.</div>
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 640, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 1.2fr 1.5fr 0.8fr', gap: 6, fontSize: 12, color: C.dim, paddingBottom: 4 }}>
          <span>Market</span><span>Over / Under</span><span>Even / Odd</span><span>Matches / Differs</span><span>Hot / cold</span>
        </div>
        {rows.length === 0 && <div style={{ color: C.dim }}>Analysing markets...</div>}
        {rows.map((r) => (
          <div key={r.market} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 1.2fr 1.5fr 0.8fr', gap: 6, padding: '4px 0', borderTop: `1px solid ${C.line}` }}>
            <b>{r.market}</b><Cell c={r.ou} /><Cell c={r.eo} /><Cell c={r.md} /><span>{r.hot} / {r.cold}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/** Accumulator maths: survival rate needed to break even, and the stake needed to win back one loss. */
const AccuPlanner = ({ balance, cfg }: { balance: number; cfg: AccuConfig }) => {
  const rows = accuPlanner(balance, cfg).filter((r) => r.n === 5 || r.n === 10);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Recovery planner (your balance and settings)</div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>
        "Needs" is how often a position must reach the target just to break even. "Recovery stake" is how many times the lost stake you must bet to win it back in one trade. Green = fits inside your cycle risk limit.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 420, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1fr 1fr 1.3fr', gap: 6, color: C.dim }}>
            <span>Growth</span><span>Ticks</span><span>Profit</span><span>Needs</span><span>Recovery stake</span>
          </div>
          {rows.map((r) => (
            <div key={`${r.g}-${r.n}`} style={{ display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1fr 1fr 1.3fr', gap: 6, padding: '2px 0', color: r.allowed ? C.green : C.dim }}>
              <span>{Math.round(r.g * 100)}%</span><span>{r.n}</span><span>{r.profitPct.toFixed(1)}%</span><span>{r.needSurvive.toFixed(1)}%</span><span>{r.recoveryMult.toFixed(1)}x the loss</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Accumulators: compound growth per tick inside a barrier. Recovery is optional, calculated and capped. */
const AccumulatorCard = ({ s, cfg, setCfg, balance }: { s: AccuState; cfg: AccuConfig; setCfg: (p: Partial<AccuConfig>) => void; balance: number }) => {
  const wins = s.rows.filter((r) => r.profit > 0).length;
  const knock = s.rows.length - wins;
  const n = (k: keyof AccuConfig) => (v: number) => setCfg({ [k]: v } as Partial<AccuConfig>);
  const col = s.status === 'trading' ? C.green : s.status === 'stopped' ? C.red : C.blue;
  const sh = s.shadow;
  return (
    <div style={{ ...card, borderColor: cfg.mode === 'auto' ? C.green : C.line }}>
      <div style={h}>Accumulators</div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>
        The payout grows every tick the price stays inside the barrier; one tick outside loses the whole stake. Recovery is OFF by default; if you turn it on it uses a calculated, capped stake and never doubles blindly. The bot only enters calm markets, estimates the expected value from the live barrier, takes profit after your target ticks, and pauses after a knockout streak.
      </div>
      <div style={{ color: col, fontWeight: 700, marginBottom: 10 }}>{cfg.mode.toUpperCase()} - {s.status.toUpperCase()} - {s.note}</div>
      <div style={grid(110)}>
        <Tile label="Session P/L" value={s.sessionProfit} color={s.sessionProfit >= 0 ? C.green : C.red} />
        <Tile label="Trades" value={s.rows.length} />
        <Tile label="Target hit" value={wins} color={C.green} />
        <Tile label="Knockouts" value={knock} color={C.red} />
        <Tile label="Knockout streak" value={`${s.lossStreak}/${cfg.maxLossStreak}`} color={s.lossStreak ? C.amber : C.text} />
        <Tile label="Still to recover" value={s.cycleLoss} color={s.cycleLoss ? C.amber : C.text} />
        <Tile label="Smaller-stake trades left" value={s.defensive} />
      </div>
      <div style={{ margin: '12px 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(['off', 'shadow', 'auto'] as const).map((m) => (
          <button key={m} style={btn(cfg.mode === m)} onClick={() => setCfg({ mode: m })}>{m.toUpperCase()}</button>
        ))}
      </div>
      <div style={grid(130)}>
        <Field label="Stake" value={cfg.stake} onCommit={n('stake')} />
        <Field label="Auto stake (% of balance)" value={cfg.riskPct} onCommit={n('riskPct')} />
        <label style={{ fontSize: 12, color: C.dim }}>Growth rate per tick
          <select style={input} value={cfg.growthRate} onChange={(e) => setCfg({ growthRate: Number(e.target.value) })}>
            {[0.01, 0.02, 0.03, 0.04, 0.05].map((g) => <option key={g} value={g}>{Math.round(g * 100)}%</option>)}
          </select>
        </label>
        <Field label="Take profit after (ticks)" value={cfg.targetTicks} onCommit={n('targetTicks')} />
        <Field label="Skip if expected loss worse than (%)" value={cfg.maxEdgeLossPct} onCommit={n('maxEdgeLossPct')} />
        <Field label="Stop after knockouts in a row" value={cfg.maxLossStreak} onCommit={n('maxLossStreak')} />
        <Field label="Session take profit" value={cfg.takeProfit} onCommit={n('takeProfit')} />
        <Field label="Session stop loss" value={cfg.stopLoss} onCommit={n('stopLoss')} />
        <Field label="Cooldown (ms)" value={cfg.cooldownMs} onCommit={n('cooldownMs')} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 4px' }}>Growth plan and recovery</div>
      <div style={grid(130)}>
        <label style={{ fontSize: 12, color: C.dim }}>Recovery after a knockout
          <select style={input} value={cfg.recovery} onChange={(e) => setCfg({ recovery: e.target.value as AccuConfig['recovery'] })}>
            <option value="off">Off (accept the loss)</option>
            <option value="capped">Capped recovery (calculated stake)</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: C.dim }}>Recovery growth rate
          <select style={input} value={cfg.recoveryGrowth} onChange={(e) => setCfg({ recoveryGrowth: Number(e.target.value) })}>
            {[0.01, 0.02, 0.03, 0.04, 0.05].map((g) => <option key={g} value={g}>{Math.round(g * 100)}%</option>)}
          </select>
        </label>
        <Field label="Recovery target (ticks)" value={cfg.recoveryTicks} onCommit={n('recoveryTicks')} />
        <Field label="Max recovery attempts" value={cfg.maxRecoveryTries} onCommit={n('maxRecoveryTries')} />
        <Field label="Max risk per cycle (% of balance)" value={cfg.cycleRiskPct} onCommit={n('cycleRiskPct')} />
        <Field label="Smaller stakes after a knockout (trades)" value={cfg.defensiveTrades} onCommit={n('defensiveTrades')} />
        <Field label="Stake multiplier while smaller" value={cfg.defensiveMult} onCommit={n('defensiveMult')} />
        <Field label="Session goal (% gain, then stop)" value={cfg.goalPct} onCommit={n('goalPct')} />
        <Field label="Session loss limit (% of balance)" value={cfg.lossPct} onCommit={n('lossPct')} />
        <Field label="Max trades per session" value={cfg.maxTrades} onCommit={n('maxTrades')} />
      </div>
      <AccuPlanner balance={balance} cfg={cfg} />
      <div style={{ margin: '10px 0', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <label><input type="checkbox" checked={cfg.autoStake} onChange={(e) => setCfg({ autoStake: e.target.checked })} /> Auto stake from balance</label>
        <label><input type="checkbox" checked={cfg.calmEntry} onChange={(e) => setCfg({ calmEntry: e.target.checked })} /> Calm-market entry only</label>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Calmest markets now</div>
      {s.board.length === 0 && <div style={{ color: C.dim }}>{cfg.mode === 'off' ? 'Switch to SHADOW or AUTO to start scanning.' : 'Collecting data...'}</div>}
      {s.board.map((b) => (
        <div key={b.market} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderTop: `1px solid ${C.line}` }}>
          <span><b>{b.market}</b> calm {b.calm.score}/100{b.calm.spike ? ' (recent spike)' : ''}</span>
          <span style={{ color: b.ev !== undefined && b.ev >= 0 ? C.green : C.dim }}>
            {b.ev !== undefined ? `expected ${(b.ev * 100).toFixed(1)}% - breach ${((b.breach ?? 0) * 100).toFixed(1)}% per tick` : 'no quote yet'}
          </span>
        </div>
      ))}

      <div style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 4px' }}>Shadow results (no money)</div>
      <div style={{ color: C.dim }}>
        {sh.n === 0 ? 'No shadow entries scored yet.' : `${sh.survived}/${sh.n} reached the ${cfg.targetTicks}-tick target (${Math.round((sh.survived / sh.n) * 100)}% observed vs ${Math.round((sh.expected / sh.n) * 100)}% expected)`}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 4px' }}>Accumulator journal</div>
      {s.rows.length === 0 && <div style={{ color: C.dim }}>No trades yet.</div>}
      {s.rows.slice(-10).reverse().map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0', color: r.profit > 0 ? C.green : C.red }}>
          <span>{new Date(r.ts).toLocaleTimeString()} {r.market} {r.rec ? 'recovery ' : ''}{r.kind}</span>
          <span>stake {r.stake} - {r.profit}</span>
        </div>
      ))}
    </div>
  );
};

/** Shows what to stake for this balance and checks that recovery cannot blow the account. */
const AccountCard = ({ cfg, setCfg, balance, currency }: { cfg: TraderConfig; setCfg: (p: Partial<TraderConfig>) => void; balance: number; currency: string }) => {
  const plan = riskPlan(balance, cfg, cfg.families.overunder.stake);
  const useRecommended = () => {
    const fams = { ...cfg.families };
    (Object.keys(fams) as Family[]).forEach((k) => { fams[k] = { ...fams[k], stake: plan.recommended }; });
    setCfg({ families: fams });
  };
  const num = (k: keyof TraderConfig) => (v: number) => setCfg({ [k]: v } as Partial<TraderConfig>);
  return (
    <div style={card}>
      <div style={h}>Account protection</div>
      <div style={{ ...grid(130), marginBottom: 10 }}>
        <Tile label="Balance" value={`${balance} ${currency}`} />
        <Tile label="Recommended stake" value={plan.recommended} color={C.green} />
        <Tile label="Max risk per cycle" value={plan.cap} color={C.amber} />
        <Tile label="Session stop loss" value={plan.stopLoss} color={C.red} />
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
        The first stake is chosen so a loss plus the first recovery trade still fits inside the cycle risk limit. Any recovery trade that would break the limit is blocked and the bot stops.
      </div>
      <div style={grid(130)}>
        <Field label="Risk per trade (% of balance)" value={cfg.riskPerTradePct} onCommit={num('riskPerTradePct')} />
        <Field label="Max risk per cycle (% of balance)" value={cfg.maxCycleRiskPct} onCommit={num('maxCycleRiskPct')} />
        <Field label="Stop loss (% of starting balance)" value={cfg.stopLossPct} onCommit={num('stopLossPct')} hint="0 = use the fixed stop loss" />
        <label style={{ fontSize: 12, color: C.dim }}>Over/Under contract risk
          <select style={input} value={cfg.contractRisk} onChange={(e) => setCfg({ contractRisk: e.target.value as TraderConfig['contractRisk'] })}>
            <option value="safest">Safest: Over 1 / Under 8</option>
            <option value="standard">Standard: Over 1-2 / Under 8-7</option>
            <option value="wide">Wide: Over 1-3 / Under 9-7</option>
          </select>
        </label>
      </div>
      <div style={{ margin: '10px 0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>
          <input type="checkbox" checked={cfg.autoStake} onChange={(e) => setCfg({ autoStake: e.target.checked })} /> Auto stake from balance
        </label>
        <button style={btn(false, C.blue)} onClick={useRecommended}>Use recommended stake ({plan.recommended})</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Worst case if every recovery trade loses (stake in use: {plan.stake})</div>
      {plan.chain.map((s) => (
        <div key={s.step} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: s.ok ? C.text : C.red }}>
          <span>{s.label}: stake {s.stake}</span>
          <span>total at risk {s.atRisk} - {s.ok ? 'allowed' : 'BLOCKED by protection'}</span>
        </div>
      ))}
    </div>
  );
};

const FamilyCard = ({ f, fc, board, rows, setFamily }: {
  f: Family; fc: FamilyCfg; board: Candidate[]; rows: JournalRow[]; setFamily: (f: Family, patch: Partial<FamilyCfg>) => void;
}) => {
  const famRows = rows.filter((r) => r.family === f);
  const famPl = Math.round(famRows.reduce((a, r) => a + r.profit, 0) * 100) / 100;
  return (
    <div style={{ ...card, borderColor: fc.enabled ? C.green : C.line }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{FAMILY_LABEL[f]}</div>
        <span style={{ fontSize: 12, fontWeight: 700, color: fc.enabled ? C.green : C.dim }}>{fc.enabled ? 'AUTO-RUN ON' : 'OFF'}</span>
      </div>
      <div style={{ fontSize: 12, color: C.dim, margin: '4px 0 6px' }}>{RULES[f]}</div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>
        All {WINDOWS.length} windows (50 to 1000 ticks) must agree. Session: {famRows.length} trades, P/L {famPl}.
      </div>

      {board.length === 0 && <div style={{ color: C.dim }}>Analysing markets...</div>}
      {board.map((c, i) => (
        <div key={i} style={{ padding: '6px 0', borderTop: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>{c.market} - {c.label}</b>
            <span style={{ color: c.aligned === WINDOWS.length ? C.green : C.dim, fontWeight: 700 }}>
              {c.aligned}/{WINDOWS.length} windows - {c.confidence}%
            </span>
          </div>
          <HeatStrip c={c} />
        </div>
      ))}

      <div style={{ ...grid(120), marginTop: 10 }}>
        <Field label="Stake" value={fc.stake} onCommit={(v) => setFamily(f, { stake: v })} />
        <Field label="Min confidence %" value={fc.minConfidence} onCommit={(v) => setFamily(f, { minConfidence: v })} />
        <label style={{ fontSize: 12, color: C.dim }}>Recovery contract
          <select style={input} value={fc.recovery} onChange={(e) => setFamily(f, { recovery: e.target.value as RecoveryChoice })}>
            <option value="smart">Smart (safest strong)</option>
            <option value="over2">Over 2</option>
            <option value="over3">Over 3</option>
            <option value="same">Same contract</option>
          </select>
        </label>
      </div>
    </div>
  );
};

export default function SignalDashboard() {
  const p = useProProfit();
  const { cfg, setCfg, setFamily, setOnly, trader, account } = p;

  const rows = trader.journal;
  const wins = rows.filter((r) => r.profit > 0).length;
  const losses = rows.length - wins;
  const winRate = rows.length ? Math.round((wins / rows.length) * 100) : 0;
  const pl = trader.sessionProfit;
  const stateColor = trader.status === 'trading' ? C.green : trader.status === 'stopped' ? C.red : C.blue;
  const enabled = FAMILIES.filter((f) => cfg.families[f].enabled);
  const num = (k: keyof TraderConfig) => (v: number) => setCfg({ [k]: v } as Partial<TraderConfig>);

  return (
    <div className="pp-sc">
      <style>{CSS}</style>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 12, fontSize: 14 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>ProProfit Signal Center</div>
            <div>
              <span style={{ padding: '4px 10px', borderRadius: 999, fontWeight: 700, fontSize: 12, background: account.virtual ? '#14532d' : '#7f1d1d', color: '#fff' }}>
                {account.virtual ? 'DEMO' : 'REAL'}
              </span>{' '}
              <span style={{ color: C.dim }}>{account.balance} {account.currency} - feed {p.status}</span>
            </div>
          </div>
          <div style={{ margin: '12px 0', color: stateColor, fontWeight: 700 }}>
            {trader.status.toUpperCase()} - {trader.note}
          </div>
          <div style={{ ...grid(110) }}>
            <Tile label="Session P/L" value={pl} color={pl >= 0 ? C.green : C.red} />
            <Tile label="Trades" value={rows.length} />
            <Tile label="Wins" value={wins} color={C.green} />
            <Tile label="Losses" value={losses} color={C.red} />
            <Tile label="Win rate" value={`${winRate}%`} />
            <Tile label="Recovery step" value={`${trader.step}/${cfg.maxSteps}`} color={trader.step ? C.amber : C.text} />
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {(['alert', 'shadow', 'auto'] as const).map((m) => (
              <button key={m} style={btn(cfg.mode === m)} onClick={() => setCfg({ mode: m })}>{m.toUpperCase()}</button>
            ))}
            <button style={btn(true, C.red)} onClick={p.kill}>KILL SWITCH</button>
            <button style={btn(false)} onClick={p.reset}>Reset session</button>
            <label style={{ color: C.dim }}><input type="checkbox" checked={cfg.allowReal} onChange={(e) => setCfg({ allowReal: e.target.checked })} /> Allow real account</label>
          </div>
        </div>

        <div style={card}>
          <div style={h}>Strategies to auto-run</div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>
            Tick the strategies you want, or press "Trade this only" to run just one. Currently: {enabled.length ? enabled.map((f) => FAMILY_LABEL[f]).join(', ') : 'none'}.
          </div>
          {FAMILIES.map((f) => (
            <div key={f} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
              <label style={{ fontWeight: 700 }}>
                <input type="checkbox" checked={cfg.families[f].enabled} onChange={(e) => setFamily(f, { enabled: e.target.checked })} /> {FAMILY_LABEL[f]}
              </label>
              <button style={btn(enabled.length === 1 && enabled[0] === f, C.blue)} onClick={() => setOnly(f)}>Trade this only</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button style={btn(false)} onClick={() => setOnly('all')}>Enable all</button></div>
        </div>

        <AccountCard cfg={cfg} setCfg={setCfg} balance={account.balance} currency={account.currency} />

        <EntryCard cfg={cfg} setCfg={setCfg} />

        <ScannerCard rows={p.scan} />

        <AccumulatorCard s={p.accu} cfg={p.accuCfg} setCfg={p.setAccu} balance={account.balance} />

        {FAMILIES.map((f) => (
          <FamilyCard key={f} f={f} fc={cfg.families[f]} board={p.boards[f]} rows={rows} setFamily={setFamily} />
        ))}

        <div style={card}>
          <div style={h}>Runs and recovery (shared by all strategies)</div>
          <div style={grid(130)}>
            <Field label="Runs per strong signal" value={cfg.runsPerSignal} onCommit={num('runsPerSignal')} hint="then rescan best market" />
            <Field label="Keep trading while confidence >=" value={cfg.stayConfidence} onCommit={num('stayConfidence')} hint="signal weakens = stop" />
            <label style={{ fontSize: 12, color: C.dim }}>Recover in stages
              <select style={input} value={cfg.recoveryStages} onChange={(e) => setCfg({ recoveryStages: Number(e.target.value) })}>
                <option value={1}>1 win (full)</option>
                <option value={2}>2 wins (safer stakes)</option>
                <option value={3}>3 wins (safest stakes)</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: C.dim }}>Recovery mode
              <select style={input} value={cfg.recoveryMode} onChange={(e) => setCfg({ recoveryMode: e.target.value as TraderConfig['recoveryMode'] })}>
                <option value="payout">Payout-based (exact)</option>
                <option value="multiplier">Multiplier</option>
              </select>
            </label>
            <Field label="Recovery profit target" value={cfg.recoveryTarget} onCommit={num('recoveryTarget')} hint="payout mode" />
            <Field label="Multiplier" value={cfg.multiplier} onCommit={num('multiplier')} hint="multiplier mode" />
            <label style={{ fontSize: 12, color: C.dim, alignSelf: 'end', paddingBottom: 10 }}>
              <input type="checkbox" checked={cfg.waitRecoveryDigit} onChange={(e) => setCfg({ waitRecoveryDigit: e.target.checked })} /> Wait for a favourable digit before recovery
            </label>
          </div>
        </div>

        <div style={card}>
          <div style={h}>Risk limits</div>
          <div style={grid(130)}>
            <Field label="Take profit" value={cfg.takeProfit} onCommit={num('takeProfit')} />
            <Field label="Stop loss" value={cfg.stopLoss} onCommit={num('stopLoss')} />
            <Field label="Max stake" value={cfg.maxStake} onCommit={num('maxStake')} />
            <Field label="Max recovery steps" value={cfg.maxSteps} onCommit={num('maxSteps')} />
            <Field label="Cooldown (ms)" value={cfg.cooldownMs} onCommit={num('cooldownMs')} />
            <Field label="Scan window (ms)" value={cfg.scanMs} onCommit={num('scanMs')} hint="collect signals, trade best" />
          </div>
        </div>

        <div style={card}>
          <div style={h}>Live signals</div>
          {p.signals.length === 0 && <div style={{ color: C.dim }}>Waiting for a signal where every window agrees...</div>}
          {p.signals.slice(0, 8).map((s) => (
            <div key={s.id} style={{ borderTop: `1px solid ${C.line}`, padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b>{FAMILY_LABEL[s.family]}: {s.market} - {s.label}</b>
                <span style={{ color: s.confidence >= 95 ? C.green : C.blue, fontWeight: 700 }}>{s.confidence}%</span>
              </div>
              <div style={{ fontSize: 12, color: C.dim }}>{new Date(s.ts).toLocaleTimeString()} - {s.reasons.join(' | ')}</div>
              <div style={{ fontSize: 12, color: C.blue }}>Entry point: {entryHintFor(s, cfg.entryMode)}</div>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={h}>Signal scoreboard (real results)</div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>Observed hit rate vs the theoretical rate for the traded contract.</div>
          {p.report.length === 0 && <div style={{ color: C.dim }}>Collecting results...</div>}
          {p.report.map((r) => (
            <div key={r.type} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{r.type}</span>
              <span>{r.observed}% observed vs {r.theoretical}% expected ({r.n})</span>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={h}>Trade journal</div>
          {rows.length === 0 && <div style={{ color: C.dim }}>No trades yet.</div>}
          {rows.slice(-15).reverse().map((j, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', color: j.profit >= 0 ? C.green : C.red }}>
              <span>{new Date(j.ts).toLocaleTimeString()} {j.market} {j.label}</span>
              <span>stake {j.stake} - {j.profit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
