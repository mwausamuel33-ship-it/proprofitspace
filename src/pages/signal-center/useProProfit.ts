import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { AppClient, digitOf } from './api-client';
import { Candidate, DEFAULT_ENGINE, Family, FAMILIES, RISK_PRESETS, ScanRow, Signal, SignalEngine } from './signal-engine';
import { AutoTrader, DEFAULT_TRADER, FamilyCfg, TraderConfig, TraderState } from './auto-trader';
import { AccuConfig, AccuState, AccuTrader, DEFAULT_ACCU } from './accumulator';

export function useProProfit() {
  const store: any = useStore();
  const client = useMemo(() => new AppClient(), []);
  const engine = useMemo(() => new SignalEngine(DEFAULT_ENGINE), []);
  const trader = useMemo(() => new AutoTrader(client, engine, { ...DEFAULT_TRADER }), [client, engine]);
  const accu = useMemo(() => new AccuTrader(client, { ...DEFAULT_ACCU }, () => trader.cfg.allowReal, DEFAULT_ENGINE.markets), [client, trader]);

  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [report, setReport] = useState(engine.report());
  const [boards, setBoards] = useState<Record<Family, Candidate[]>>({ overunder: [], evenodd: [], matchesdiffers: [] });
  const [tstate, setTstate] = useState<TraderState>(trader.state);
  const [cfg, setCfgState] = useState<TraderConfig>(trader.cfg);
  const [account, setAccount] = useState({ virtual: false, balance: 0, currency: 'USD' });
  const [astate, setAstate] = useState<AccuState>(accu.state);
  const [acfg, setAccuCfgState] = useState<AccuConfig>(accu.cfg);
  const [scan, setScan] = useState<ScanRow[]>([]);
  const offs = useRef<(() => void)[]>([]);

  // Which safer Over/Under contracts the engine may pick (safest / standard / wide)
  useEffect(() => { engine.allowed = RISK_PRESETS[cfg.contractRisk]; }, [engine, cfg.contractRisk]);

  // Feed trades into the site's Summary / Transactions / Journal panels (never let a UI error stop trading)
  useEffect(() => {
    trader.reporter = {
      contract: (c) => {
        try { store?.transactions?.onBotContractEvent(c); } catch { /* ignore */ }
        try { store?.summary_card?.onBotContractEvent(c); } catch { /* ignore */ }
      },
      log: (msg, kind) => {
        try {
          if (kind === 'error') store?.journal?.onError(msg);
          else store?.journal?.onNotify({ message: msg, className: kind === 'success' ? 'journal__text--success' : '', message_type: kind === 'success' ? 'success' : 'notify', sound: 'silent' });
        } catch { /* ignore */ }
      },
    };
    accu.reporter = trader.reporter;
  }, [store, trader, accu]);

  useEffect(() => {
    let alive = true;
    client.onStatus = setStatus;
    trader.onUpdate = setTstate;
    accu.onUpdate = setAstate;

    const start = async () => {
      // wait until the site's shared Deriv connection is ready
      while (alive && !client.ready()) await new Promise((r) => setTimeout(r, 1500));
      if (!alive) return;
      await client.connect();
      setAccount({ virtual: client.isVirtual, balance: client.balance, currency: client.currency });
      for (const m of DEFAULT_ENGINE.markets) {
        if (!alive) return;
        try {
          const h = await client.history(m, 1000);
          engine.bootstrap(m, h.prices.map((p) => digitOf(p, h.pip)));
          accu.bootstrap(m, h.prices);
          const off = await client.subscribeTicks(m, (t) => {
            accu.onTick(m, t.quote);
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
    start().catch((e) => setTstate((s) => ({ ...s, status: 'stopped', stopReason: e.message, note: e.message })));

    const iv = setInterval(() => {
      setReport(engine.report());
      setScan(engine.scanTable());
      setBoards(Object.fromEntries(FAMILIES.map((f) => [f, engine.leaderboard(f, 3)])) as Record<Family, Candidate[]>);
      setAccount({ virtual: client.isVirtual, balance: client.balance, currency: client.currency });
    }, 1500);
    const av = setInterval(() => { accu.step(); }, 1500);
    return () => { alive = false; clearInterval(iv); clearInterval(av); offs.current.forEach((f) => f()); offs.current = []; client.close(); };
  }, [client, engine, trader, accu]);

  const setCfg = useCallback((patch: Partial<TraderConfig>) => {
    trader.cfg = { ...trader.cfg, ...patch };
    setCfgState(trader.cfg);
  }, [trader]);

  const setFamily = useCallback((f: Family, patch: Partial<FamilyCfg>) => {
    trader.cfg = { ...trader.cfg, families: { ...trader.cfg.families, [f]: { ...trader.cfg.families[f], ...patch } } };
    setCfgState(trader.cfg);
  }, [trader]);

  const setOnly = useCallback((f: Family | 'all') => {
    const fams = { ...trader.cfg.families };
    (Object.keys(fams) as Family[]).forEach((k) => { fams[k] = { ...fams[k], enabled: f === 'all' || k === f }; });
    trader.cfg = { ...trader.cfg, families: fams };
    setCfgState(trader.cfg);
  }, [trader]);

  const setAccu = useCallback((patch: Partial<AccuConfig>) => {
    accu.cfg = { ...accu.cfg, ...patch };
    setAccuCfgState(accu.cfg);
  }, [accu]);

  return { status, signals, report, boards, setFamily, setOnly, scan, accu: astate, accuCfg: acfg, setAccu, trader: tstate, cfg, setCfg, account, kill: () => { trader.kill(); accu.kill(); }, reset: () => { trader.reset(); accu.reset(); } };
}
