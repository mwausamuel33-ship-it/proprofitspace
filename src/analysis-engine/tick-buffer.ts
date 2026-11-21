import { lastDigit } from './digits';

export const TICK_WINDOWS = [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;

export type TickSource = 'history' | 'live';
export type RawTick = { epoch: number; quote: number | string; pipSize: number };
export type Tick = {
    epoch: number;
    quote: number;
    quoteText: string; // the quote at its pip precision, as received
    pipSize: number;
    digit: number;
    source: TickSource;
    gapBefore: boolean; // true when ticks are missing between this tick and the one before it
};
export type IngestResult = 'added' | 'queued' | 'duplicate' | 'conflict' | 'out_of_order' | 'invalid';

/**
 * Rolling, chronologically ordered buffer of validated ticks for one market.
 * It never invents ticks: bad, duplicate and out-of-order ticks are rejected and counted.
 */
export class TickBuffer {
    private ticks: Tick[] = [];
    private loadingHistory = false;
    private pending: RawTick[] = [];
    readonly counters = { added: 0, duplicate: 0, conflict: 0, outOfOrder: 0, invalid: 0, gaps: 0 };

    constructor(readonly capacity = 1000) {}

    get size(): number {
        return this.ticks.length;
    }

    get lastEpoch(): number | null {
        return this.ticks.length ? this.ticks[this.ticks.length - 1].epoch : null;
    }

    all(): readonly Tick[] {
        return this.ticks;
    }

    /** Call before requesting history. Live ticks that arrive meanwhile are queued, not lost. */
    beginHistoryLoad(): void {
        this.loadingHistory = true;
        this.pending = [];
    }

    /** Replace the buffer with the history, then replay queued live ticks (duplicates are dropped). */
    completeHistoryLoad(history: RawTick[]): void {
        this.ticks = [];
        [...history].sort((a, b) => a.epoch - b.epoch).forEach(t => this.append(t, 'history'));
        this.loadingHistory = false;
        const queued = this.pending;
        this.pending = [];
        queued.forEach(t => this.append(t, 'live'));
    }

    ingestLive(raw: RawTick): IngestResult {
        if (this.loadingHistory) {
            this.pending.push(raw);
            return 'queued';
        }
        return this.append(raw, 'live');
    }

    /** Median seconds between ticks over the last 50 ticks (null until there are 3 ticks). */
    medianInterval(): number | null {
        const recent = this.ticks.slice(-51);
        if (recent.length < 3) return null;
        const gaps: number[] = [];
        for (let i = 1; i < recent.length; i++) gaps.push(recent[i].epoch - recent[i - 1].epoch);
        gaps.sort((a, b) => a - b);
        return gaps[Math.floor(gaps.length / 2)];
    }

    /** The last `size` ticks, with flags saying whether the window is full and whether it spans a gap. */
    window(size: number): { ticks: Tick[]; digits: number[]; complete: boolean; hasGap: boolean } {
        const ticks = this.ticks.slice(-size);
        return {
            ticks,
            digits: ticks.map(t => t.digit),
            complete: ticks.length >= size,
            hasGap: ticks.slice(1).some(t => t.gapBefore),
        };
    }

    /** The ticks since the most recent gap: the only stretch where "next digit" pairs are valid. */
    contiguousTail(): Tick[] {
        for (let i = this.ticks.length - 1; i >= 0; i--) {
            if (this.ticks[i].gapBefore) return this.ticks.slice(i);
        }
        return this.ticks.slice();
    }

    private find(epoch: number): Tick | undefined {
        let lo = 0;
        let hi = this.ticks.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const e = this.ticks[mid].epoch;
            if (e === epoch) return this.ticks[mid];
            if (e < epoch) lo = mid + 1;
            else hi = mid - 1;
        }
        return undefined;
    }

    private append(raw: RawTick, source: TickSource): IngestResult {
        const quote = typeof raw.quote === 'string' ? Number(raw.quote) : raw.quote;
        const digit = lastDigit(raw.quote, raw.pipSize);
        if (!Number.isInteger(raw.epoch) || raw.epoch <= 0 || !Number.isFinite(quote) || digit === null) {
            this.counters.invalid++;
            return 'invalid';
        }
        const last = this.ticks[this.ticks.length - 1];
        if (last && raw.epoch <= last.epoch) {
            const existing = this.find(raw.epoch);
            if (!existing) {
                this.counters.outOfOrder++;
                return 'out_of_order';
            }
            if (existing.quote === quote) {
                this.counters.duplicate++;
                return 'duplicate';
            }
            this.counters.conflict++;
            return 'conflict';
        }
        const median = this.medianInterval();
        const limit = Math.max(5, 2.5 * (median ?? 2));
        const gapBefore = !!last && raw.epoch - last.epoch > limit;
        if (gapBefore) this.counters.gaps++;
        this.ticks.push({
            epoch: raw.epoch,
            quote,
            quoteText: typeof raw.quote === 'string' ? raw.quote : quote.toFixed(raw.pipSize),
            pipSize: raw.pipSize,
            digit,
            source,
            gapBefore,
        });
        if (this.ticks.length > this.capacity) this.ticks.shift();
        this.counters.added++;
        return 'added';
    }
}
