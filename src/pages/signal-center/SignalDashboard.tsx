import React from 'react';
import { useProProfit } from './useProProfit';
import { FamilyCfg, JournalRow, RecoveryChoice, TraderConfig } from './auto-trader';
import { Candidate, FAMILIES, FAMILY_LABEL, Family } from './signal-engine';

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
