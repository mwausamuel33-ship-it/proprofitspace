import React from 'react';
import { useProProfit } from './useProProfit';

const box: React.CSSProperties = { background: '#111827', color: '#e5e7eb', borderRadius: 14, padding: 14, marginBottom: 12 };
const btn = (on: boolean): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 10, border: 0, marginRight: 8, fontWeight: 700,
  background: on ? '#16a34a' : '#374151', color: '#fff',
});

export default function SignalDashboard() {
  const p = useProProfit();
  const { cfg, setCfg, trader, account } = p;
  const num = (k: keyof typeof cfg) => (
    <input type="number" step="any" defaultValue={cfg[k] as number} style={{ width: 70, marginRight: 8 }}
      onChange={(e) => setCfg({ [k]: Number(e.target.value) } as any)} />
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 12 }}>
      <div style={box}>
        <b>ProProfit Signal Center</b> - {p.status}
        <div>{account.virtual ? 'DEMO' : 'REAL'} account - {account.balance} {account.currency}</div>
        <div style={{ margin: '10px 0' }}>
          {(['alert', 'shadow', 'auto'] as const).map((m) => (
            <button key={m} style={btn(cfg.mode === m)} onClick={() => setCfg({ mode: m })}>{m.toUpperCase()}</button>
          ))}
        </div>
        <label><input type="checkbox" checked={cfg.allowReal} onChange={(e) => setCfg({ allowReal: e.target.checked })} /> Allow real account</label>
      </div>

      <div style={box}>
        <b>Risk and recovery</b>
        <div style={{ marginTop: 8, lineHeight: 2.2 }}>
          Stake {num('initialStake')} TP {num('takeProfit')} SL {num('stopLoss')}<br />
          Max steps {num('maxSteps')} Max stake {num('maxStake')} Min conf {num('minConfidence')}<br />
          Recovery Over{' '}
          <select value={cfg.recoveryBarrier} onChange={(e) => setCfg({ recoveryBarrier: Number(e.target.value) as 2 | 3 })}>
            <option value={2}>2</option><option value={3}>3</option>
          </select>
        </div>
        <div style={{ marginTop: 8 }}>
          Session P/L: <b style={{ color: trader.sessionProfit >= 0 ? '#4ade80' : '#f87171' }}>{trader.sessionProfit}</b>
          {' '}- {trader.status}{trader.stopReason ? ` (${trader.stopReason})` : ''} - recovery step {trader.step}
        </div>
        <div style={{ marginTop: 8 }}>
          <button style={{ ...btn(false), background: '#dc2626' }} onClick={p.kill}>KILL SWITCH</button>
          <button style={btn(false)} onClick={p.reset}>Reset session</button>
        </div>
      </div>

      <div style={box}>
        <b>Live signals</b>
        {p.signals.length === 0 && <div style={{ opacity: 0.6 }}>Scanning markets...</div>}
        {p.signals.slice(0, 8).map((s) => (
          <div key={s.id} style={{ borderTop: '1px solid #374151', padding: '6px 0' }}>
            <b>{s.market}</b> {s.label} - confidence {s.confidence}%
            <div style={{ fontSize: 12, opacity: 0.7 }}>{new Date(s.ts).toLocaleTimeString()} - {s.reasons.join(' | ')}</div>
          </div>
        ))}
      </div>

      <div style={box}>
        <b>Signal scoreboard (real results)</b>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Observed hit rate vs the theoretical rate for the same contract.</div>
        {p.report.map((r) => (
          <div key={r.type}>{r.type}: {r.observed}% observed vs {r.theoretical}% expected ({r.n} signals)</div>
        ))}
      </div>

      <div style={box}>
        <b>Trade journal</b>
        {trader.journal.slice(-10).reverse().map((j, i) => (
          <div key={i} style={{ color: j.profit >= 0 ? '#4ade80' : '#f87171' }}>
            {new Date(j.ts).toLocaleTimeString()} {j.market} {j.label} stake {j.stake} - {j.profit}
          </div>
        ))}
      </div>
    </div>
  );
}
