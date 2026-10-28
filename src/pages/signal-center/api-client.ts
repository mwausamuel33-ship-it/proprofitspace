/**
 * Adapter over the app's EXISTING shared Deriv connection (api_base.api).
 * No separate login or websocket - uses whichever account is active in the site.
 */
import { api_base } from '@/external/bot-skeleton';
import { isDemoAccount } from '@/utils/account-helpers';

const getApi = () => (api_base as any)?.api as any;
const errMsg = (e: any) => {
  const m = e?.error?.message ?? e?.message ?? 'API error';
  const d = e?.error?.details;
  return d ? `${m} ${JSON.stringify(d)}` : m;
};

export const digitOf = (price: number, pip: number) => Number(price.toFixed(pip).slice(-1));

export class AppClient {
  isVirtual = false; // treated as REAL until proven demo (safe default)
  currency = 'USD';
  balance = 0;
  onStatus: (s: 'connecting' | 'open' | 'closed') => void = () => {};
  private handlers = new Map<string, Set<(t: any) => void>>();
  private subIds = new Map<string, string>();
  private msgSub?: { unsubscribe: () => void };

  ready() { return !!getApi(); }

  async send(payload: any): Promise<any> {
    const a = getApi();
    if (!a) throw new Error('Not connected to Deriv - log in first');
    try {
      const r = await a.send(payload);
      if (r?.error) throw r;
      return r;
    } catch (e) { throw new Error(errMsg(e)); }
  }

  /** Re-read account type/balance (call before trading: user may have switched account). */
  async refresh() {
    let loginid = '';
    try {
      const b = await this.send({ balance: 1 });
      this.currency = b.balance.currency || this.currency;
      this.balance = b.balance.balance;
      loginid = b.balance.loginid || '';
    } catch { /* keep previous */ }
    if (!loginid) loginid = (api_base as any)?.account_id || '';
    // unknown account => treated as REAL (safe default)
    this.isVirtual = loginid ? isDemoAccount(loginid) : false;
  }

  async connect() {
    const a = getApi();
    if (!a) throw new Error('Not connected to Deriv - log in first');
    this.onStatus('connecting');
    await this.refresh();
    this.msgSub?.unsubscribe();
    this.msgSub = a.onMessage().subscribe((m: any) => {
      const msg = m?.data && typeof m.data === 'object' && (m.data.tick || m.data.msg_type) ? m.data : m;
      const t = msg?.tick;
      if (t?.symbol) this.handlers.get(t.symbol)?.forEach((h) => h(t));
    });
    this.onStatus('open');
  }

  async history(symbol: string, count = 500): Promise<{ prices: number[]; pip: number }> {
    const r = await this.send({ ticks_history: symbol, count, end: 'latest', style: 'ticks' });
    return { prices: r.history.prices, pip: r.pip_size ?? 2 };
  }

  /** Subscribe to a symbol's ticks without disturbing other consumers. Returns unsubscribe. */
  async subscribeTicks(symbol: string, cb: (tick: any) => void): Promise<() => void> {
    const set = this.handlers.get(symbol) ?? new Set();
    this.handlers.set(symbol, set);
    set.add(cb);
    if (set.size === 1) {
      try {
        const r = await this.send({ ticks: symbol, subscribe: 1 });
        const id = r?.subscription?.id;
        if (id) this.subIds.set(symbol, id);
      } catch { /* e.g. already subscribed elsewhere - ticks still arrive via onMessage */ }
    }
    return () => {
      set.delete(cb);
      const id = this.subIds.get(symbol);
      if (set.size === 0 && id) {
        this.subIds.delete(symbol);
        this.send({ forget: id }).catch(() => {});
      }
    };
  }

  close() {
    this.msgSub?.unsubscribe();
    this.msgSub = undefined;
    this.handlers.clear();
    this.subIds.forEach((id) => this.send({ forget: id }).catch(() => {}));
    this.subIds.clear();
    this.onStatus('closed');
  }
}
