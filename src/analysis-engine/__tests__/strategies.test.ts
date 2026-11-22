import {
    PayoutLookup, breakEvenProbability, classifyRegime, contractWins, digitTransitionStrategy, evenOddStrategy,
    expectedReturnPerUnit, homogeneityTest, marketRegimeStrategy, matchesDiffersStrategy, overUnderStrategy,
    payoutRateFromProposal, walkForward, Candidate,
} from '..';

const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const fair = (n: number, next: () => number) => Array.from({ length: n }, () => Math.floor(next() * 10));

// A payout table that returns 95% of the stake on average, like Deriv's digit contracts.
const fairProb = (contract: string, barrier: number | null): number => {
    switch (contract) {
        case 'DIGITOVER': return (9 - (barrier as number)) / 10;
        case 'DIGITUNDER': return (barrier as number) / 10;
        case 'DIGITMATCH': return 0.1;
        case 'DIGITDIFF': return 0.9;
        default: return 0.5;
    }
};
const payout: PayoutLookup = (c, b) => 0.95 / fairProb(c, b) - 1;
const noPayout: PayoutLookup = () => null;

describe('payout maths', () => {
    it('break-even and expected return', () => {
        expect(breakEvenProbability(0.19)).toBeCloseTo(0.8403, 4);
        expect(breakEvenProbability(1)).toBeCloseTo(0.5, 12);
        expect(expectedReturnPerUnit(0.8, 0.19)).toBeCloseTo(-0.048, 12);
        expect(expectedReturnPerUnit(0.5, 1)).toBeCloseTo(0, 12);
    });
    it('payout rate from a proposal', () => {
        expect(payoutRateFromProposal(1, 1.19)).toBeCloseTo(0.19, 12);
        expect(payoutRateFromProposal(0, 1.19)).toBeNull();
        expect(payoutRateFromProposal(1, 1)).toBeNull();
    });
});

describe('contract rules', () => {
    it('barrier digit wins neither Over nor Under', () => {
        expect(contractWins('DIGITOVER', 5, 5)).toBe(false);
        expect(contractWins('DIGITUNDER', 5, 5)).toBe(false);
        expect(contractWins('DIGITOVER', 5, 6)).toBe(true);
        expect(contractWins('DIGITUNDER', 5, 4)).toBe(true);
        expect(contractWins('DIGITMATCH', 3, 3)).toBe(true);
        expect(contractWins('DIGITDIFF', 3, 3)).toBe(false);
        expect(contractWins('DIGITEVEN', null, 0)).toBe(true);
        expect(contractWins('DIGITODD', null, 0)).toBe(false);
    });
});

describe('walk-forward backtest has no look-ahead', () => {
    const build = (d: number[]): Candidate[] => [
        { id: 'O5', contract: 'DIGITOVER', barrier: 5, label: 'Over 5', p0: 0.4, k: d.filter(x => x > 5).length, n: d.length, payoutRate: 1.375 },
    ];
    it('decisions never depend on the tick being predicted or on later ticks', () => {
        const next = rng(3);
        const digits = Array.from({ length: 600 }, (_, i) => (i < 300 ? Math.floor(next() * 10) : 6 + Math.floor(next() * 4)));
        const base = walkForward(digits, 100, build);
        const changedLast = digits.slice();
        changedLast[599] = (changedLast[599] + 5) % 10;
        expect(walkForward(changedLast, 100, build).decisions).toEqual(base.decisions);
        const changedMid = digits.slice();
        changedMid[350] = 0;
        const after = walkForward(changedMid, 100, build).decisions;
        // step i predicts tick 100 + i, using ticks before it: tick 350 can only change decisions from step 251 (tick 351) on
        expect(after.slice(0, 251)).toEqual(base.decisions.slice(0, 251));
    });
    it('only counts ticks after the training window', () => {
        const r = walkForward(Array(300).fill(7), 100, build);
        expect(r.steps).toBe(200);
        expect(r.trades).toBe(200);
        expect(r.wins).toBe(200);
    });
});

describe('strategies on fair random digits: they must not manufacture signals', () => {
    it('Over/Under 5, Even/Odd and Matches/Differs never report STRONG evidence and almost never WEAK', () => {
        const next = rng(2024);
        const runs = 120;
        const tally: Record<string, number> = {};
        for (let i = 0; i < runs; i++) {
            const digits = fair(1000, next);
            const input = { market: 'R_100', digits, payout };
            [overUnderStrategy({ ...input, barrier: 5 }), evenOddStrategy(input), matchesDiffersStrategy(input), digitTransitionStrategy(input)].forEach(r => {
                const key = `${r.strategy}:${r.status}`;
                tally[key] = (tally[key] ?? 0) + 1;
            });
        }
        const count = (status: string) => Object.entries(tally).filter(([k]) => k.endsWith(status)).reduce((s, [, v]) => s + v, 0);
        // eslint-disable-next-line no-console
        console.log('fair-data outcomes over', runs, 'markets per strategy:', JSON.stringify(tally));
        expect(count(':STRONG EVIDENCE')).toBe(0);
        expect(count(':WEAK EVIDENCE')).toBeLessThanOrEqual(2);
    });
});

describe('strategies detect real, planted edges', () => {
    it('Over 5 with a 55% true win rate is reported as STRONG', () => {
        const next = rng(11);
        const digits = Array.from({ length: 1000 }, () => (next() < 0.55 ? 6 + Math.floor(next() * 4) : Math.floor(next() * 6)));
        const r = overUnderStrategy({ market: 'R_100', digits, payout, barrier: 5 });
        expect(r.label).toBe('Over 5');
        expect(r.status).toBe('STRONG EVIDENCE');
        expect(r.estimatedProbability!).toBeGreaterThan(r.breakEvenProbability!);
        expect(r.historical.returnCI!.low).toBeGreaterThan(0);
        expect(r.explanation[0]).toContain('Over 5');
    });
    it('a digit that appears 25% of the time is found by Matches/Differs', () => {
        const next = rng(5);
        const digits = Array.from({ length: 1000 }, () => (next() < 0.25 ? 7 : Math.floor(next() * 10)));
        const r = matchesDiffersStrategy({ market: 'R_100', digits, payout });
        expect(r.label).toBe('Matches 7');
        expect(r.status).toBe('STRONG EVIDENCE');
    });
});

describe('honest refusals', () => {
    const next = rng(8);
    const digits = fair(1000, next);
    it('NO TRADE when the payout is unknown', () => {
        const next2 = rng(11);
        const planted = Array.from({ length: 1000 }, () => (next2() < 0.55 ? 6 + Math.floor(next2() * 4) : Math.floor(next2() * 6)));
        const r = overUnderStrategy({ market: 'R_100', digits: planted, payout: noPayout, barrier: 5 });
        expect(r.status).toBe('NO TRADE');
        expect(r.explanation[0]).toContain('payout');
    });
    it('INSUFFICIENT EVIDENCE with too few ticks or a gap', () => {
        expect(overUnderStrategy({ market: 'R_100', digits: digits.slice(0, 60), payout, barrier: 5 }).status).toBe('INSUFFICIENT EVIDENCE');
        expect(overUnderStrategy({ market: 'R_100', digits, payout, barrier: 5, hasGap: true }).status).toBe('INSUFFICIENT EVIDENCE');
        expect(overUnderStrategy({ market: 'R_100', digits, payout, barrier: 5, primaryWindow: 50 }).status).toBe('INSUFFICIENT EVIDENCE');
    });
    it('the barrier digit is not counted for either side', () => {
        const r = overUnderStrategy({ market: 'R_100', digits: Array(300).fill(5), payout, barrier: 5 });
        expect(r.distribution.map(d => d.count)).toEqual([0, 0]);
        expect(r.status).toBe('NO TRADE');
    });
    it('every result has the same shape', () => {
        const input = { market: 'R_100', digits, payout };
        const results = [overUnderStrategy({ ...input, barrier: 5 }), evenOddStrategy(input), matchesDiffersStrategy(input), digitTransitionStrategy(input), marketRegimeStrategy(input)];
        results.forEach(r => {
            expect(Object.keys(r).sort()).toEqual(
                ['barrier', 'breakEvenProbability', 'contract', 'distribution', 'estimatedProbability', 'evidence', 'explanation', 'historical', 'label', 'market', 'observations', 'regime', 'sample', 'status', 'strategy', 'window', 'windowAgreement']
                    .filter(k => k !== 'regime' || r.strategy === 'MarketRegime')
            );
            expect(['STRONG EVIDENCE', 'WEAK EVIDENCE', 'INSUFFICIENT EVIDENCE', 'NO TRADE']).toContain(r.status);
            expect(r.explanation.length).toBeGreaterThan(0);
        });
    });
});

describe('market regimes', () => {
    it('homogeneity test: same source passes, different sources fail', () => {
        const next = rng(1);
        expect(homogeneityTest(fair(500, next), fair(500, next)).pValue).toBeGreaterThan(0.01);
        expect(homogeneityTest(fair(500, next), Array(500).fill(3)).pValue).toBeLessThan(1e-10);
    });
    it('mostly NORMAL_RANDOM_LIKE on fair digits (about 1% flag rate per test)', () => {
        const next = rng(77);
        let normal = 0;
        const runs = 300;
        for (let i = 0; i < runs; i++) if (classifyRegime(fair(1000, next)).regime === 'NORMAL_RANDOM_LIKE') normal++;
        expect(normal / runs).toBeGreaterThan(0.93);
    });
    it('detects persistent imbalance, changing distribution and over-uniform digits', () => {
        const next = rng(5);
        const biased = (n: number) => Array.from({ length: n }, () => (next() < 0.2 ? 7 : Math.floor(next() * 10)));
        expect(classifyRegime(biased(1000)).regime).toBe('PERSISTENT_IMBALANCE');
        expect(classifyRegime([...fair(500, next), ...biased(500)]).regime).toBe('CHANGING_DISTRIBUTION');
        expect(classifyRegime(Array.from({ length: 1000 }, (_, i) => i % 10)).regime).toBe('LOW_VARIATION');
        expect(classifyRegime(fair(300, next)).regime).toBe('INSUFFICIENT_EVIDENCE');
        expect(classifyRegime(fair(1000, next), true).regime).toBe('INSUFFICIENT_EVIDENCE');
    });
});
