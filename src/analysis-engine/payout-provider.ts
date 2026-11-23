import { Contract } from './backtest';
import { payoutRateFromProposal } from './payout';
import { PayoutLookup } from './strategies';
import { DerivTransport } from './transport';

export type PayoutRequest = { contract: Contract; barrier: number | null };

const usesBarrier = (c: Contract): boolean => c !== 'DIGITEVEN' && c !== 'DIGITODD';

/** Every contract the strategies may price for the current settings. */
export const payoutRequestsFor = (barrier: number): PayoutRequest[] => [
    { contract: 'DIGITOVER', barrier },
    { contract: 'DIGITUNDER', barrier },
    { contract: 'DIGITEVEN', barrier: null },
    { contract: 'DIGITODD', barrier: null },
    ...[...Array(10).keys()].flatMap(d => [
        { contract: 'DIGITMATCH' as const, barrier: d },
        { contract: 'DIGITDIFF' as const, barrier: d },
    ]),
];

/**
 * Real payouts from Deriv `proposal` quotes (1 tick, 1 stake). Nothing is assumed: a contract that has
 * not been priced, or whose quote has expired, answers null and the engine says NO TRADE.
 */
export class PayoutProvider {
    private cache = new Map<string, { rate: number; at: number }>();
    lastError: string | null = null;

    constructor(
        private transport: DerivTransport,
        private symbol: string,
        private options: { currency?: string; ttlMs?: number; now?: () => number; concurrency?: number } = {}
    ) {}

    private now(): number {
        return this.options.now ? this.options.now() : Date.now();
    }

    private key(contract: Contract, barrier: number | null): string {
        return `${contract}:${usesBarrier(contract) ? barrier : ''}`;
    }

    lookup: PayoutLookup = (contract, barrier) => {
        const hit = this.cache.get(this.key(contract, barrier));
        if (!hit || this.now() - hit.at > (this.options.ttlMs ?? 600000)) return null;
        return hit.rate;
    };

    /** Price whatever is missing or expired. Safe to call often. */
    async refresh(wanted: PayoutRequest[]): Promise<void> {
        const todo = new Map<string, PayoutRequest>();
        wanted.forEach(w => {
            if (this.lookup(w.contract, w.barrier) === null) todo.set(this.key(w.contract, w.barrier), w);
        });
        const queue = [...todo.values()];
        const worker = async () => {
            for (let w = queue.shift(); w; w = queue.shift()) {
                try {
                    const res: any = await this.transport.send({
                        proposal: 1,
                        amount: 1,
                        basis: 'stake',
                        contract_type: w.contract,
                        currency: this.options.currency ?? 'USD',
                        duration: 1,
                        duration_unit: 't',
                        symbol: this.symbol,
                        ...(usesBarrier(w.contract) ? { barrier: String(w.barrier) } : {}),
                    });
                    if (res?.error) {
                        this.lastError = res.error.message || 'Deriv refused a price request';
                        continue;
                    }
                    const rate = payoutRateFromProposal(Number(res?.proposal?.ask_price), Number(res?.proposal?.payout));
                    if (rate === null) this.lastError = `No usable payout for ${w.contract}`;
                    else this.cache.set(this.key(w.contract, w.barrier), { rate, at: this.now() });
                } catch (e) {
                    this.lastError = e instanceof Error ? e.message : String(e);
                }
            }
        };
        await Promise.all(Array.from({ length: this.options.concurrency ?? 4 }, worker));
    }
}
