import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppClient, digitOf } from './api-client';
import { DEFAULT_ENGINE, Signal, SignalEngine } from './signal-engine';
import { AutoTrader, DEFAULT_TRADER, TraderConfig, TraderState } from './auto-trader';

export function useProProfit() {
  const client = useMemo(() => new AppClient(), []);
  const engine = useMemo(() => new SignalEngine(DEFAULT_ENGINE), []);
  const trader = useMemo(() => new AutoTrader(client, engine, { ...DEFAULT_TRADER }), [client, engine]);

  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [report, setReport] = useState(engine.report());
  const [tstate, setTstate] = useState<TraderState>(trader.state);
  const [cfg, setCfgState] = useState<TraderConfig>(trader.cfg);
  const [account, setAccount] = useState({ virtual: false, balance: 0, currency: 'USD' });
  const offs = useRef<(() => void)[]>([]);

  useEffect(() => {
    let alive = true;
    client.onStatus = setStatus;
    trader.onUpdate = setTstate;

    const start = async () => {
      // wait until the site's shared Deriv connection is ready
      while (alive && !client.ready()) await new Promise((r) => setTimeout(r, 1500));
      if (!alive) return;
      await client.connect();
      setAccount({ virtual: client.isVirtual, balance: client.balance, currency: client.currency });
      for (const m of DEFAULT_ENGINE.markets) {
        if (!alive) return;
        try {
          const h = await client.history(m, 500);
          engine.bootstrap(m, h.prices.map((p) => digitOf(p, h.pip)));
          const off = await client.subscribeTicks(m, (t) => {
            const fresh = engine.ingest(m, digitOf(t.quote, t.pip_size ?? h.pip));
            if (fresh.length) {
              setSignals((prev) => [...fresh, ...prev].slice(0, 25));
              fresh.forEach((s) => trader.onSignal(s));
            }
          });
          offs.current.push(off);
        } catch { /* skip markets this account cannot access */ }
      }
    };
    start().catch((e) => setTstate((s) => ({ ...s, status: 'stopped', stopReason: e.message })));

    const iv = setInterval(() => {
      setReport(engine.report());
      setAccount({ virtual: client.isVirtual, balance: client.balance, currency: client.currency });
    }, 1500);
    return () => { alive = false; clearInterval(iv); offs.current.forEach((f) => f()); offs.current = []; client.close(); };
  }, [client, engine, trader]);

  const setCfg = useCallback((patch: Partial<TraderConfig>) => {
    trader.cfg = { ...trader.cfg, ...patch };
    setCfgState(trader.cfg);
  }, [trader]);

  return { status, signals, report, trader: tstate, cfg, setCfg, account, kill: () => trader.kill(), reset: () => trader.reset() };
}
