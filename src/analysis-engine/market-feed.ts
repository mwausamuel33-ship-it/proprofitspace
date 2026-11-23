import { DataStatus, deriveStatus } from './status';
import { RawTick, TickBuffer } from './tick-buffer';
import { ConnectionState, DerivTransport } from './transport';

/** Turn a ticks_history response into raw ticks. Throws, rather than guessing, when anything is missing. */
export const parseHistory = (response: any): RawTick[] => {
    if (response?.error) throw new Error(response.error.message || 'Deriv returned an error for ticks_history');
    const prices = response?.history?.prices;
    const times = response?.history?.times;
    const pipSize = response?.pip_size;
    if (!Array.isArray(prices) || !Array.isArray(times) || prices.length === 0 || prices.length !== times.length) {
        throw new Error('ticks_history returned no usable prices and times');
    }
    if (!Number.isInteger(pipSize)) throw new Error('ticks_history did not say how many decimals this market uses (pip_size)');
    return prices.map((quote: number | string, i: number) => ({ epoch: Number(times[i]), quote, pipSize }));
};

/**
 * One market's data pipeline: history first, then live ticks, merged into a validated TickBuffer.
 * The live subscription starts BEFORE history is requested, so no tick can fall in between;
 * the buffer drops the overlap. After a reconnect the history is loaded again to fill any gap.
 */
export class MarketFeed {
    readonly buffer = new TickBuffer(1000);
    lastError: string | null = null;
    historyLoadedAt: number | null = null;
    loading = false;
    private state: ConnectionState = 'closed';
    private cancelLive: (() => void) | null = null;
    private stopConnection: (() => void) | null = null;
    private listeners = new Set<() => void>();
    private generation = 0; // makes work that finishes after stop() or a reconnect harmless

    constructor(
        private transport: DerivTransport,
        readonly symbol: string,
        private options: { count?: number; now?: () => number } = {}
    ) {}

    private now(): number {
        return this.options.now ? this.options.now() : Date.now() / 1000;
    }

    start(): void {
        if (this.stopConnection) return;
        this.stopConnection = this.transport.onConnectionChange(state => {
            const previous = this.state;
            this.state = state;
            if (state !== 'open') {
                this.generation += 1;
                this.dropLive();
                this.loading = false;
            }
            this.emit();
            if (state === 'open' && previous !== 'open') void this.load();
        });
    }

    stop(): void {
        this.generation += 1;
        this.dropLive();
        this.stopConnection?.();
        this.stopConnection = null;
        this.listeners.clear();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    status(): DataStatus {
        return deriveStatus({
            connected: this.state === 'open',
            reconnecting: this.state === 'connecting',
            lastTickEpoch: this.buffer.lastEpoch,
            medianIntervalSeconds: this.buffer.medianInterval(),
            nowEpoch: this.now(),
        });
    }

    private emit(): void {
        this.listeners.forEach(l => l());
    }

    private dropLive(): void {
        this.cancelLive?.();
        this.cancelLive = null;
    }

    private async load(): Promise<void> {
        const generation = ++this.generation;
        this.loading = true;
        this.buffer.beginHistoryLoad();
        this.emit();
        try {
            const cancel = await this.transport.subscribe({ ticks: this.symbol, subscribe: 1 }, m => this.onMessage(generation, m));
            if (generation !== this.generation) {
                cancel();
                return;
            }
            this.cancelLive = cancel;
            const response = await this.transport.send({
                ticks_history: this.symbol,
                adjust_start_time: 1,
                count: this.options.count ?? 1000,
                end: 'latest',
                style: 'ticks',
            });
            if (generation !== this.generation) return;
            this.buffer.completeHistoryLoad(parseHistory(response));
            this.historyLoadedAt = this.now();
            this.lastError = null;
        } catch (e) {
            if (generation !== this.generation) return;
            this.buffer.abortHistoryLoad();
            this.lastError = e instanceof Error ? e.message : String(e);
        }
        this.loading = false;
        this.emit();
    }

    private onMessage(generation: number, message: any): void {
        if (generation !== this.generation) return;
        if (message?.error) {
            this.lastError = message.error.message || 'Deriv returned an error on the tick stream';
            this.emit();
            return;
        }
        const t = message?.tick;
        if (!t || t.symbol !== this.symbol) return;
        this.buffer.ingestLive({ epoch: Number(t.epoch), quote: t.quote, pipSize: t.pip_size });
        this.emit();
    }
}
