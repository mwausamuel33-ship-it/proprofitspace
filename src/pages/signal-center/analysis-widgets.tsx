/** Analysis Tool widgets: digit circles with tick-window tabs, and per-strategy market suggestions. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '@/styles/pps-theme.scss';
import { AccuAnalyzer } from './accumulator';
import { AppClient, digitOf } from './api-client';
import { Candidate, DEFAULT_ENGINE, SignalEngine } from './signal-engine';
import './analysis-widgets.scss';

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

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

type DigitStat = { digit: number; percentage: number; is_hot: boolean; is_cold: boolean; streak: number };
const RADIUS = 21;
const CIRC = 2 * Math.PI * RADIUS;

/** Digits 0-9 as circles: digit and percentage inside, ring = share relative to the most frequent digit
 *  (as in Deriv's digit stats), green = most frequent, red = least frequent, pointer = latest digit. */
export const DigitCircles = ({ stats, current, window: win, onWindow }: {
  stats: DigitStat[]; current: number | null; window: number; onWindow: (n: number) => void;
}) => {
  const max = Math.max(...stats.map((s) => s.percentage), 0.0001);
  return (
    <div className='pps-dg'>
      <div className='pps-dg__tabs' role='tablist' aria-label='Ticks window'>
        {WINDOW_TABS.map((w) => (
          <button key={w} role='tab' aria-selected={w === win} className={cx('pps-dg__tab', w === win && 'is-active')} onClick={() => onWindow(w)}>{w}</button>
        ))}
      </div>
      <div className='pps-dg__grid'>
        {stats.map((s) => (
          <div key={s.digit} className={cx('pps-dg__item', s.is_hot && 'is-hot', s.is_cold && 'is-cold', s.digit === current && 'is-current')}>
            <svg className='pps-dg__ring' viewBox='0 0 48 48' aria-hidden='true'>
              <circle className='pps-dg__track' cx='24' cy='24' r={RADIUS} />
              <circle className='pps-dg__bar' cx='24' cy='24' r={RADIUS} strokeDasharray={`${(s.percentage / max) * CIRC} ${CIRC}`} />
            </svg>
            <span className='pps-dg__digit'>{s.digit}</span>
            <span className='pps-dg__pct'>{s.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <p className='pps-dg__legend'>Last {win} ticks. Green is the most frequent digit, red the least; the pointer marks the latest digit.</p>
    </div>
  );
};

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
  <div className='pps-sugg__card'>
    <h4 className='pps-sugg__title'>{title}</h4>
    <p className='pps-sugg__sub'>{note}</p>
    {items.length === 0 && <p className='pps-sugg__empty'>No market qualifies yet.</p>}
    {items.map((it, i) => (
      <div key={i} className='pps-sugg__item'>
        <div className='pps-sugg__head'>
          <b>{it.market}</b>
          <span className={cx('pps-sugg__badge', it.good && 'is-strong')}>{it.good ? 'Strong' : 'Weak'}</span>
        </div>
        <div className='pps-sugg__what'>{it.title}</div>
        <div className='pps-sugg__why'>{it.detail}</div>
      </div>
    ))}
  </div>
);

/** Best markets for every strategy we use. Statistical skew only, not a prediction. */
export const MarketSuggestions = () => {
  const { data, status } = useSuggestions();
  return (
    <div className='pps-sugg'>
      <p className='pps-sugg__note'>{status}. Strong means all {DEFAULT_ENGINE.windows.length} windows (50 to 1000 ticks) favour it.</p>
      {!data && <p className='pps-sugg__empty'>Analysing Volatility, 1s Volatility and Jump markets...</p>}
      {data && (
        <div className='pps-sugg__grid'>
          <Group title='Over / Under' note='Safer Over 1-2 / Under 8-7 picks' items={data.overunder} />
          <Group title='Even / Odd' note='Run count follows your AI Trade rule' items={data.evenodd} />
          <Group title='Matches / Differs' note='Digit all windows favour or avoid' items={data.matchesdiffers} />
          <Group title='Over 1 entry bot' note='Entry on last digit 4, 7 or 9' items={data.over1} />
          <Group title='Accumulators' note='Calm markets, no recent spike' items={data.accu} />
        </div>
      )}
    </div>
  );
};
