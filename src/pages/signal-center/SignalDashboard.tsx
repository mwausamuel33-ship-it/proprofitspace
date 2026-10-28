import React from 'react';
import { useProProfit } from './useProProfit';
import { TraderConfig } from './auto-trader';

const C = { bg: '#0b1220', card: '#111827', line: '#1f2937', text: '#e5e7eb', dim: '#9ca3af', green: '#22c55e', red: '#ef4444', blue: '#38bdf8', amber: '#f59e0b' };
const card: React.CSSProperties = { background: C.card, color: C.text, borderRadius: 16, padding: 16, marginBottom: 14, border: `1px solid ${C.line}` };
const h: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 10 };
const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 });
const btn = (on: boolean, color = C.green): React.CSSProperties => ({
  padding: '10px 18px', borderRadius: 10, border: 0, fontWeight: 700, fontSize: 14, cursor: 'pointer',
  background: on ? color : '#374151', color: '#fff',
});
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.bg, color: C.text, fontSize: 14 };

const Tile = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
  <div style={{ background: C.bg, borderRadius: 12, padding: '10px 12px' }}>
    <div style={{ fontSize: 12, color: C.dim }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: color || C.text }}>{value}</div>
  </div>
);

export default function SignalDashboard() {
  const p = useProProfit();
  const { cfg, setCfg, trader, account } = p;

  const rows = trader.journal;
  const wins = rows.filter((r) => r.profit > 0).length;
  const losses = rows.length - wins;
  const winRate = rows.length ? Math.round((wins / rows.length) * 100) : 0;
  const pl = trader.sessionProfit;

  const Num = ({ label, k, hint }: { label: string; k: keyof TraderConfig; hint?: string }) => (
    <label style={{ fontSize: 12, color: C.dim }}>
      {label}
      <input style={input} type="number" step="any" defaultValue={cfg[k] as number}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setCfg({ [k]: v } as Partial<TraderConfig>); }} />
      {hint && <span style={{ fontSize: 11 }}>{hint}</span>}
    </label>
  );

  const stateColor = trader.status === 'trading' ? C.green : trader.status === 'stopped' ? C.red : C.blue;

  return (
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
        <div style={h}>Execution and risk</div>
        <div style={grid(120)}>
          <Num label="Stake" k="initialStake" />
          <Num label="Take profit" k="takeProfit" />
          <Num label="Stop loss" k="stopLoss" />
          <Num label="Max stake" k="maxStake" />
          <Num label="Min confidence %" k="minConfidence" />
          <Num label="Cooldown (ms)" k="cooldownMs" />
        </div>
      </div>

      <div style={card}>
        <div style={h}>Recovery</div>
        <div style={grid(130)}>
          <label style={{ fontSize: 12, color: C.dim }}>Recovery mode
            <select style={input} value={cfg.recoveryMode} onChange={(e) => setCfg({ recoveryMode: e.target.value as TraderConfig['recoveryMode'] })}>
              <option value="payout">Payout-based (exact)</option>
              <option value="multiplier">Multiplier</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: C.dim }}>Recovery contract
            <select style={input} value={cfg.recoveryBarrier} onChange={(e) => setCfg({ recoveryBarrier: Number(e.target.value) as 2 | 3 })}>
              <option value={2}>Over 2</option>
              <option value={3}>Over 3</option>
            </select>
          </label>
          <Num label="Max recovery steps" k="maxSteps" />
          <Num label="Recovery profit target" k="recoveryTarget" hint="payout mode" />
          <Num label="Multiplier" k="multiplier" hint="multiplier mode" />
          <label style={{ fontSize: 12, color: C.dim, alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" checked={cfg.waitRecoveryDigit} onChange={(e) => setCfg({ waitRecoveryDigit: e.target.checked })} /> Wait for digit above barrier
          </label>
        </div>
      </div>

      <div style={card}>
        <div style={h}>Live signals</div>
        {p.signals.length === 0 && <div style={{ color: C.dim }}>Scanning markets...</div>}
        {p.signals.slice(0, 8).map((s) => (
          <div key={s.id} style={{ borderTop: `1px solid ${C.line}`, padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{s.market} - {s.label}</b>
              <span style={{ color: s.confidence >= 95 ? C.green : C.blue, fontWeight: 700 }}>{s.confidence}%</span>
            </div>
            <div style={{ height: 4, background: C.bg, borderRadius: 4, margin: '4px 0' }}>
              <div style={{ height: 4, borderRadius: 4, width: `${s.confidence}%`, background: s.confidence >= 95 ? C.green : C.blue }} />
            </div>
            <div style={{ fontSize: 12, color: C.dim }}>{new Date(s.ts).toLocaleTimeString()} - {s.reasons.join(' | ')}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={h}>Signal scoreboard (real results)</div>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>Observed hit rate vs the theoretical rate for the same contract.</div>
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
  );
}
