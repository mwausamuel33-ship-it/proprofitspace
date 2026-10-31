/** Analysis Tool widgets: visible digit circles with tick-window tabs, and per-strategy market suggestions. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccuAnalyzer } from './accumulator';
import { AppClient, digitOf } from './api-client';
import { Candidate, DEFAULT_ENGINE, SignalEngine } from './signal-engine';

export const ANALYSIS_MARKETS = [
  'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
  '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V', '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
  'JD10', 'JD25', 'JD50', 'JD75', 'JD100',
];
export const WINDOW_TABS = [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

/** Volatility (plain and 1s) and Jump indices only. */
export const isAnalysisMarket = (s: string) => /^(R_\d+|1HZ\d+V|JD\d+)$/.test(s);
export const marketOrder = (s: string) => {
  const n = Number((s.match(/\d+/) || ['0'])[0]);
  return (s.startsWith('R_') ? 0 : s.startsWith('1HZ') ? 1000 : 2000) + n;
};
export const marketName = (s: string) => {
  const v = s.match(/^R_(\d+)$/), h = s.match(/^1HZ(\d+)V$/), j = s.match(/^JD(\d+)$/);
  return v ? `Volatility ${v[1]}` : h ? `Volatility ${h[1]} (1s)` : j ? `Jump ${j[1]}` : s;
};

const C = { bg: '#0b1220', card: '#111827', line: '#1f2937', text: '#e5e7eb', dim: '#9ca3af', green: '#22c55e', red: '#ef4444', blue: '#38bdf8', amber: '#f59e0b' };

type DigitStat = { digit: number; percentage: number; is_hot: boolean; is_cold: boolean; streak: number };

/** Digits 0-9 as clear circles: ring fill = share of ticks, green = hottest, red = coldest, glow = latest digit. */
export const DigitCircles = ({ stats, current, window: win, onWindow }: {
  stats: DigitStat[]; current: number | null; window: number; onWindow: (n: number) => void;
}) => (
  <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {WINDOW_TABS.map((w) => (
        <button key={w} onClick={() => onWindow(w)}
          style={{ padding: '6px 12px', borderRadius: 999, border: 0, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: w === win ? C.blue : '#1f2937', color: w === win ? '#04111d' : C.text }}>
          {w} ticks
        </button>
      ))}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
      {stats.map((s) => {
        const ring = s.is_hot ? C.green : s.is_cold ? C.red : C.blue;
        const fill = Math.min(100, s.percentage * 5);
        return (
          <div key={s.digit} style={{ textAlign: 'center', width: 74 }}>
            <div style={{
              width: 70, height: 70, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
              background: `conic-gradient(${ring} ${fill}%, #243044 0)`,
              boxShadow: s.digit === current ? `0 0 0 3px ${C.amber}, 0 0 14px ${C.amber}` : 'none',
            }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#fff' }}>
                {s.digit}
              </div>
            </div>
            <div style={{ marginTop: 6, fontWeight: 700, color: ring }}>{s.percentage.toFixed(1)}%</div>
            <div style={{ fontSize: 11, color: C.dim }}>{s.is_hot ? 'hottest' : s.is_cold ? 'coldest' : s.digit === current ? 'latest' : '\u00a0'}</div>
          </div>
        );
      })}
    </div>
    <div style={{ marginTop: 8, fontSize: 12, color: C.dim, textAlign: 'center' }}>
      Ring fill = share of the last {win} ticks (a full ring is 20%, a fair digit is 10%). Amber glow = latest digit.
    </div>
  </div>
);

export type Item = { market: string; title: string; detail: string; good: boolean };
export type Suggest = { overunder: Item[]; evenodd: Item[]; matchesdiffers: Item[]; over1: Item[]; accu: Item[] };

const win = (c: Candidate) => `${c.aligned}/${DEFAULT_ENGINE.windows.length} windows agree, ${c.confidence}% confidence`;
const top = <T,>(a: T[], n = 3) => a.slice(0, n);
const byStrength = (a: Candidate, b: Candidate) => b.aligned - a.aligned || b.meanZ - a.meanZ;

/** Pure: turn the analysed markets into per-strategy suggestions. */
export function buildSuggestions(engine: SignalEngine, acc: AccuAnalyzer, freqs: Record<string, number[]>, markets: string[]): Suggest {
  const all = markets.flatMap((m) => engine.analyze(m));
  const full = DEFAULT_ENGINE.windows.length;

  const ou = all.filter((c) => c.family === 'overunder' && c.barrier === 5).sort(byStrength);
  const overunder = top(ou).map((c) => ({
    market: marketName(c.market),
    title: c.contract === 'DIGITOVER' ? 'Over 5 bias: trade Over 1 or Over 2' : 'Under 5 bias: trade Under 8 or Under 7',
    detail: win(c), good: c.aligned === full,
  }));

  const eo = all.filter((c) => c.family === 'evenodd').sort(byStrength);
  const evenodd = top(eo).map((c) => {
    const f = freqs[c.market] ?? [], tot = f.reduce((a, b) => a + b, 0) || 1;
    const topDigit = f.indexOf(Math.max(...f)), topPct = (Math.max(...f) / tot) * 100;
    return {
      market: marketName(c.market),
      title: `${c.label} favoured: suggested ${topPct >= 12 ? '15+ runs' : '4-6 runs'}`,
      detail: `${win(c)}; top digit ${topDigit} at ${topPct.toFixed(1)}%`, good: c.aligned === full,
    };
  });

  const md = all.filter((c) => c.family === 'matchesdiffers').sort(byStrength);
  const matchesdiffers = top(md).map((c) => ({
    market: marketName(c.market), title: c.label, detail: win(c), good: c.aligned === full,
  }));

  const o1 = all.filter((c) => c.contract === 'DIGITOVER' && c.barrier === 1).sort(byStrength);
  const over1 = top(o1).map((c) => ({
    market: marketName(c.market),
    title: 'Over 1: enter on last digit 4, 7 or 9, 3 runs, recover with Over 3',
    detail: win(c), good: c.aligned === full,
  }));

  const calm = markets.map((m) => ({ m, c: acc.calm(m) })).filter((x) => x.c).sort((a, b) => b.c!.score - a.c!.score);
  const accu = top(calm).map((x) => ({
    market: marketName(x.m), title: 'Calmest market for accumulators',
    detail: `calm ${x.c!.score}/100${x.c!.spike ? ' (recent spike - wait)' : ''}`, good: !!x.c!.ok,
  }));

  return { overunder, evenodd, matchesdiffers, over1, accu };
}

/** Polls tick history (no live subscriptions) every 30s for all analysis markets. */
export function useSuggestions() {
  const client = useMemo(() => new AppClient(), []);
  const engine = useMemo(() => new SignalEngine({ ...DEFAULT_ENGINE, markets: ANALYSIS_MARKETS }), []);
  const acc = useMemo(() => new AccuAnalyzer(), []);
  const freqs = useRef<Record<string, number[]>>({});
  const [data, setData] = useState<Suggest | null>(null);
  const [status, setStatus] = useState('Loading market data...');

  useEffect(() => {
    let alive = true;
    const loadAll = async () => {
      if (!client.ready()) { setStatus('Waiting for the connection...'); return; }
      let ok = 0;
      const queue = [...ANALYSIS_MARKETS];
      const worker = async () => {
        for (;;) {
          const m = queue.shift();
          if (!m || !alive) return;
          try {
            const h = await client.history(m, 1000);
            const ds = h.prices.map((p) => digitOf(p, h.pip));
            engine.bootstrap(m, ds);
            engine.refresh(m);
            acc.bootstrap(m, h.prices);
            const f = new Array(10).fill(0);
            ds.forEach((d) => { f[d]++; });
            freqs.current[m] = f;
            ok++;
          } catch { /* market not offered on this account - skip */ }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (!alive) return;
      setData(buildSuggestions(engine, acc, freqs.current, ANALYSIS_MARKETS));
      setStatus(ok ? `Updated ${new Date().toLocaleTimeString()} from ${ok} markets` : 'No market data yet');
    };
    loadAll();
    const iv = setInterval(loadAll, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [client, engine, acc]);

  return { data, status };
}

const Group = ({ title, note, items }: { title: string; note: string; items: Item[] }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
    <div style={{ fontWeight: 800, color: C.text }}>{title}</div>
    <div style={{ fontSize: 12, color: C.dim, margin: '2px 0 8px' }}>{note}</div>
    {items.length === 0 && <div style={{ color: C.dim }}>No market qualifies yet.</div>}
    {items.map((it, i) => (
      <div key={i} style={{ borderTop: `1px solid ${C.line}`, padding: '6px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <b style={{ color: C.text }}>{it.market}</b>
          <span style={{ color: it.good ? C.green : C.dim, fontWeight: 700, fontSize: 12 }}>{it.good ? 'STRONG' : 'weak'}</span>
        </div>
        <div style={{ fontSize: 13, color: C.blue }}>{it.title}</div>
        <div style={{ fontSize: 12, color: C.dim }}>{it.detail}</div>
      </div>
    ))}
  </div>
);

/** Best markets for every strategy we use. Statistical skew only - not a prediction. */
export const MarketSuggestions = () => {
  const { data, status } = useSuggestions();
  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>
        {status}. A market is STRONG only when all {DEFAULT_ENGINE.windows.length} windows (50 to 1000 ticks) favour it. These describe past ticks, not future ones.
      </div>
      {!data && <div style={{ color: C.dim }}>Analysing Volatility, 1s Volatility and Jump markets...</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Group title="Over / Under" note="Safer Over 1-2 / Under 8-7 picks" items={data.overunder} />
          <Group title="Even / Odd" note="Run count follows your AI Trade rule" items={data.evenodd} />
          <Group title="Matches / Differs" note="Digit that all windows favour or avoid" items={data.matchesdiffers} />
          <Group title="Over 1 entry bot" note="Entry on last digit 4, 7 or 9" items={data.over1} />
          <Group title="Accumulators" note="Calm markets, no recent spike" items={data.accu} />
        </div>
      )}
    </div>
  );
};
