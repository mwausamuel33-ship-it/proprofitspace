import { ConnectionState, DerivTransport, MarketFeed, PayoutProvider, buildSnapshot, parseHistory, payoutRequestsFor } from '..';

class MockTransport implements DerivTransport {
    state: ConnectionState = 'open';
    calls: string[] = [];
    subs: { request: any; cb: (m: any) => void; cancelled: boolean }[] = [];
    requests: any[] = [];
    respond: (req: any) => Promise<any> = async () => ({});
    private listeners = new Set<(s: ConnectionState) => void>();
    async send(req: Record<string, unknown>) {
        this.calls.push('send');
        this.requests.push(req);
        return this.respond(req);
    }
    async subscribe(req: Record<string, unknown>, cb: (m: any) => void) {
        this.calls.push('subscribe');
        const sub = { request: req, cb, cancelled: false };
        this.subs.push(sub);
        return () => {
            sub.cancelled = true;
        };
    }
    onConnectionChange(cb: (s: ConnectionState) => void) {
        this.listeners.add(cb);
        cb(this.state);
        return () => {
            this.listeners.delete(cb);
        };
    }
    set(state: ConnectionState) {
        this.state = state;
        [...this.listeners].forEach(l => l(state));
    }
    push(tick: any) {
        this.subs.filter(s => !s.cancelled).forEach(s => s.cb({ tick }));
    }
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const quoteOf = (e: number) => 100 + (e % 10) / 100;
const history = (epochs: number[]) => ({ history: { prices: epochs.map(quoteOf), times: epochs }, pip_size: 2 });
const flush = () => new Promise(r => setTimeout(r, 0));
const tick = (epoch: number, symbol = 'R_100') => ({ epoch, quote: quoteOf(epoch), pip_size: 2, symbol });

describe('parseHistory', () => {
    it('refuses unusable responses instead of guessing', () => {
        expect(() => parseHistory({ error: { message: 'bad' } })).toThrow('bad');
        expect(() => parseHistory({ history: { prices: [1, 2], times: [1] }, pip_size: 2 })).toThrow();
        expect(() => parseHistory({ history: { prices: [], times: [] }, pip_size: 2 })).toThrow();
        expect(() => parseHistory({ history: { prices: [1], times: [1] } })).toThrow('pip_size');
        expect(parseHistory(history([5, 6]))).toEqual([
            { epoch: 5, quote: 100.05, pipSize: 2 },
            { epoch: 6, quote: 100.06, pipSize: 2 },
        ]);
    });
});

describe('MarketFeed', () => {
    it('subscribes before it asks for history, then reports LIVE', async () => {
        const t = new MockTransport();
        t.respond = async () => history(range(1000, 1999));
        const feed = new MarketFeed(t, 'R_100', { now: () => 2000 });
        feed.start();
        await flush();
        expect(t.calls).toEqual(['subscribe', 'send']);
        expect(t.subs[0].request).toEqual({ ticks: 'R_100', subscribe: 1 });
        expect(t.requests[0]).toMatchObject({ ticks_history: 'R_100', count: 1000, end: 'latest', style: 'ticks' });
        expect(feed.buffer.size).toBe(1000);
        expect(feed.buffer.all().every(x => x.source === 'history')).toBe(true);
        expect(feed.status()).toBe('LIVE');
        expect(feed.loading).toBe(false);
    });

    it('keeps live ticks that arrive while history is loading, without duplicates', async () => {
        const t = new MockTransport();
        let release!: (v: any) => void;
        t.respond = () => new Promise(r => (release = r));
        const feed = new MarketFeed(t, 'R_100', { now: () => 2001 });
        feed.start();
        await flush();
        expect(feed.loading).toBe(true);
        t.push(tick(2000));
        t.push(tick(1999)); // also inside the history
        release(history(range(1000, 1999)));
        await flush();
        const last = feed.buffer.all().slice(-2);
        expect(last.map(x => x.epoch)).toEqual([1999, 2000]);
        expect(last.map(x => x.source)).toEqual(['history', 'live']);
        expect(feed.buffer.counters.duplicate).toBe(1);
    });

    it('ignores ticks for other markets', async () => {
        const t = new MockTransport();
        t.respond = async () => history(range(1000, 1099));
        const feed = new MarketFeed(t, 'R_100', { now: () => 1100 });
        feed.start();
        await flush();
        t.push(tick(1100, 'R_50'));
        expect(feed.buffer.size).toBe(100);
        t.push(tick(1100));
        expect(feed.buffer.size).toBe(101);
    });

    it('walks through DISCONNECTED, RECONNECTING and LIVE, and refills the gap after reconnecting', async () => {
        const t = new MockTransport();
        t.respond = async () => history(range(1000, 1999));
        let now = 2000;
        const feed = new MarketFeed(t, 'R_100', { now: () => now });
        feed.start();
        await flush();
        t.set('closed');
        expect(feed.status()).toBe('DISCONNECTED');
        expect(t.subs[0].cancelled).toBe(true);
        t.set('connecting');
        expect(feed.status()).toBe('RECONNECTING');
        t.respond = async () => history(range(1011, 2010)); // ticks that arrived while we were away
        now = 2011;
        t.set('open');
        await flush();
        expect(t.subs).toHaveLength(2);
        expect(feed.buffer.lastEpoch).toBe(2010);
        expect(feed.buffer.contiguousTail()).toHaveLength(1000);
        expect(feed.status()).toBe('LIVE');
    });

    it('reports STALE when ticks stop arriving', async () => {
        const t = new MockTransport();
        t.respond = async () => history(range(1000, 1099));
        let now = 1100;
        const feed = new MarketFeed(t, 'R_100', { now: () => now });
        feed.start();
        await flush();
        expect(feed.status()).toBe('LIVE');
        now = 1160;
        expect(feed.status()).toBe('STALE');
    });

    it('a failed history load keeps the old data, records the error and still keeps live ticks', async () => {
        const t = new MockTransport();
        t.respond = async () => history(range(1000, 1099));
        const feed = new MarketFeed(t, 'R_100', { now: () => 1101 });
        feed.start();
        await flush();
        t.set('closed');
        t.respond = async () => ({ history: { prices: [1, 2], times: [1] }, pip_size: 2 });
        let release!: (v: any) => void;
        t.respond = () => new Promise(r => (release = r));
        t.set('open');
        await flush();
        t.push(tick(1100));
        release({ history: { prices: [1, 2], times: [1] }, pip_size: 2 });
        await flush();
        expect(feed.lastError).toContain('no usable');
        expect(feed.buffer.size).toBe(101);
        expect(feed.buffer.lastEpoch).toBe(1100);
        expect(feed.loading).toBe(false);
    });

    it('stop() cancels the subscription and ignores later ticks', async () => {
        const t = new MockTransport();
        t.respond = async () => history(range(1000, 1099));
        const feed = new MarketFeed(t, 'R_100', { now: () => 1100 });
        feed.start();
        await flush();
        feed.stop();
        expect(t.subs[0].cancelled).toBe(true);
        t.push(tick(1100));
        expect(feed.buffer.size).toBe(100);
    });
});

describe('PayoutProvider', () => {
    const quote = (req: any) => ({ proposal: { ask_price: 1, payout: req.contract_type === 'DIGITOVER' ? 1.19 : 1.95 } });
    it('prices contracts from real proposals, caches them and lets them expire', async () => {
        const t = new MockTransport();
        t.respond = async req => quote(req);
        let now = 0;
        const p = new PayoutProvider(t, 'R_100', { now: () => now, ttlMs: 1000 });
        expect(p.lookup('DIGITOVER', 1)).toBeNull();
        await p.refresh([{ contract: 'DIGITOVER', barrier: 1 }, { contract: 'DIGITEVEN', barrier: null }]);
        expect(p.lookup('DIGITOVER', 1)).toBeCloseTo(0.19, 12);
        expect(p.lookup('DIGITEVEN', null)).toBeCloseTo(0.95, 12);
        expect(p.lookup('DIGITOVER', 2)).toBeNull(); // a different barrier was never priced
        expect(t.requests[0]).toEqual({ proposal: 1, amount: 1, basis: 'stake', contract_type: 'DIGITOVER', currency: 'USD', duration: 1, duration_unit: 't', symbol: 'R_100', barrier: '1' });
        expect('barrier' in t.requests[1]).toBe(false);
        await p.refresh([{ contract: 'DIGITOVER', barrier: 1 }]);
        expect(t.requests).toHaveLength(2); // served from the cache
        now = 2000;
        expect(p.lookup('DIGITOVER', 1)).toBeNull();
        await p.refresh([{ contract: 'DIGITOVER', barrier: 1 }]);
        expect(t.requests).toHaveLength(3);
    });
    it('turns errors into null payouts, never into guesses', async () => {
        const t = new MockTransport();
        t.respond = async () => ({ error: { message: 'contract not offered' } });
        const p = new PayoutProvider(t, 'R_100');
        await p.refresh([{ contract: 'DIGITUNDER', barrier: 4 }]);
        expect(p.lookup('DIGITUNDER', 4)).toBeNull();
        expect(p.lastError).toBe('contract not offered');
        t.respond = async () => {
            throw new Error('socket closed');
        };
        await expect(p.refresh([{ contract: 'DIGITUNDER', barrier: 4 }])).resolves.toBeUndefined();
        expect(p.lastError).toBe('socket closed');
    });
    it('lists every contract the strategies need', () => {
        const wanted = payoutRequestsFor(5);
        expect(wanted).toHaveLength(24);
        expect(new Set(wanted.map(w => `${w.contract}:${w.barrier}`)).size).toBe(24);
    });
});

describe('buildSnapshot', () => {
    it('gives one consistent view: status, tick counts, 12 windows and every strategy result', async () => {
        const t = new MockTransport();
        let seed = 12345;
        const next = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
        const epochs = range(1000, 1999);
        const quotes = epochs.map((_, i) => Number((100 + (i % 50) * 0.1 + Math.floor(next() * 10) / 100).toFixed(2)));
        t.respond = async req =>
            req.ticks_history
                ? { history: { prices: quotes, times: epochs }, pip_size: 2 }
                : { proposal: { ask_price: 1, payout: 0.95 / (req.contract_type === 'DIGITOVER' ? (9 - Number(req.barrier)) / 10 : req.contract_type === 'DIGITUNDER' ? Number(req.barrier) / 10 : req.contract_type === 'DIGITMATCH' ? 0.1 : req.contract_type === 'DIGITDIFF' ? 0.9 : 0.5) } };
        const feed = new MarketFeed(t, 'R_100', { now: () => 2000 });
        feed.start();
        await flush();
        const payouts = new PayoutProvider(t, 'R_100');
        await payouts.refresh(payoutRequestsFor(5));
        t.push({ epoch: 2000, quote: 111.11, pip_size: 2, symbol: 'R_100' });
        const snap = buildSnapshot(feed, payouts.lookup, { primaryWindow: 200, barrier: 5 });
        expect(snap.status).toBe('LIVE');
        expect(snap.ticks).toMatchObject({ size: 1000, live: 1 });
        expect(snap.ticks.history).toBe(999);
        expect(snap.latest).toEqual({ digit: 1, quote: '111.11', epoch: 2000 });
        expect(snap.windows.map(w => w.window)).toEqual([10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
        expect(snap.windows.every(w => w.complete)).toBe(true);
        expect(snap.distribution.n).toBe(200);
        expect(snap.windows[3].underShare + snap.windows[3].equalShare + snap.windows[3].overShare).toBeCloseTo(1, 12);
        const statuses = Object.values(snap.results).map(r => r.status);
        statuses.forEach(s => expect(['NO TRADE', 'INSUFFICIENT EVIDENCE', 'WEAK EVIDENCE', 'STRONG EVIDENCE']).toContain(s));
        expect(statuses).not.toContain('STRONG EVIDENCE');
        expect(snap.results.marketRegime.regime).toBeDefined();
    });
});
