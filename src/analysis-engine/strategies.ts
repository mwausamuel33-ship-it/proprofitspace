import { BacktestSummary, Candidate, Contract, exactP, isUsable, walkForward } from './backtest';
import { Interval, digitDistribution, overUnderAnalysis, transitionAnalysis } from './distribution';
import { holm } from './math';
import { breakEvenProbability } from './payout';
import { classifyRegime, RegimeInfo } from './regime';
import { TICK_WINDOWS } from './tick-buffer';

export type SignalStatus = 'STRONG EVIDENCE' | 'WEAK EVIDENCE' | 'INSUFFICIENT EVIDENCE' | 'NO TRADE';
export type StrategyName = 'OverUnder' | 'EvenOdd' | 'MatchesDiffers' | 'DigitTransition' | 'MarketRegime';
/** Profit per 1 staked for a contract, from a live Deriv proposal. Return null when it is not known. */
export type PayoutLookup = (contract: Contract, barrier: number | null) => number | null;

export type StrategyInput = {
    market: string;
    digits: number[]; // consecutive ticks, oldest first
    hasGap?: boolean;
    primaryWindow?: number; // default 200
    payout: PayoutLookup;
};

export type StrategyResult = {
    market: string;
    strategy: StrategyName;
    contract: Contract | null;
    barrier: number | null; // barrier, or the target digit
    label: string | null;
    window: number;
    observations: number;
    distribution: { label: string; observed: number; expected: number; count: number; n: number }[];
    estimatedProbability: number | null; // next-tick win probability, shrunk towards the fair-digit value
    breakEvenProbability: number | null;
    evidence: {
        pValue: number | null; // exact test, primary window
        adjustedP: number | null; // Holm-corrected across every option and window tested
        testsInFamily: number;
        omnibusP: number | null; // chi-square test of the whole distribution
        confidenceInterval: Interval | null; // 95% Wilson interval for the observed share
    };
    windowAgreement: { agreeing: number; tested: number; windows: { window: number; share: number; pValue: number; agrees: boolean }[] };
    historical: {
        steps: number;
        trades: number;
        wins: number;
        winRate: number | null;
        winRateCI: Interval | null;
        meanReturn: number | null;
        returnCI: Interval | null;
    };
    sample: { size: number; minimum: number; complete: boolean; hasGap: boolean };
    status: SignalStatus;
    explanation: string[];
    regime?: RegimeInfo;
};

const MIN_PRIMARY = 100; // smallest primary window we will make a call on
const MIN_TRADES = 30; // out-of-sample trades needed before a backtest means anything
const SHRINK_K = 200; // weight, in ticks, given to the fair-digit probability
const CONFIRM_WINDOWS = [300, 400, 500];

type Builder = (digits: number[], payout: PayoutLookup) => Candidate[];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtP = (p: number) => (p < 0.001 ? '< 0.001' : p.toFixed(3));

const evaluate = (
    strategy: StrategyName,
    input: StrategyInput,
    build: Builder,
    omnibus: (digits: number[]) => number | null
): StrategyResult => {
    const { market, digits, payout } = input;
    const hasGap = !!input.hasGap;
    const primaryWindow = input.primaryWindow ?? 200;
    const n = digits.length;
    const used = Math.min(primaryWindow, n);
    const complete = n >= primaryWindow;
    const primary = build(digits.slice(-used), payout).filter(isUsable);

    // Every option in every window of 50+ ticks is one family of tests, corrected together (Holm).
    const windows = TICK_WINDOWS.filter(w => w >= 50 && w <= n);
    const family: { w: number; id: string; p: number }[] = [];
    const perWindow = new Map<number, Candidate[]>();
    windows.forEach(w => {
        const cands = build(digits.slice(-w), payout).filter(isUsable);
        perWindow.set(w, cands);
        cands.forEach(c => family.push({ w, id: c.id, p: exactP(c.k, c.n, c.p0) }));
    });
    const adjustedAll = holm(family.map(f => f.p));

    // Back the option that has been over-represented; if none has, show the most unusual one for context.
    const favourable = primary.filter(c => c.k / c.n > c.p0);
    const pool = favourable.length ? favourable : primary;
    const chosen = pool.reduce<Candidate | null>(
        (best, c) => (!best || exactP(c.k, c.n, c.p0) < exactP(best.k, best.n, best.p0) ? c : best),
        null
    );
    const pValue = chosen ? exactP(chosen.k, chosen.n, chosen.p0) : null;
    const famIndex = chosen ? family.findIndex(f => f.w === used && f.id === chosen.id) : -1;
    const adjustedP = famIndex >= 0 ? adjustedAll[famIndex] : null;

    const agreement = CONFIRM_WINDOWS.filter(w => perWindow.has(w)).map(w => {
        const c = perWindow.get(w)!.find(x => chosen && x.id === chosen.id);
        const share = c ? c.k / c.n : 0;
        const p = c ? exactP(c.k, c.n, c.p0) : 1;
        return { window: w, share, pValue: p, agrees: !!c && share > c.p0 && p < 0.05 };
    });
    const agreeing = agreement.filter(a => a.agrees).length;

    const back: BacktestSummary | null = complete && n > primaryWindow ? walkForward(digits, primaryWindow, d => build(d, payout)) : null;
    const rate = chosen ? chosen.payoutRate : null;
    const estimated = chosen ? (chosen.k + SHRINK_K * chosen.p0) / (chosen.n + SHRINK_K) : null;
    const breakEven = rate !== null ? breakEvenProbability(rate) : null;
    const ci = chosen
        ? (() => {
              const z = 1.959963984540054;
              const p = chosen.k / chosen.n;
              const denom = 1 + (z * z) / chosen.n;
              const centre = (p + (z * z) / (2 * chosen.n)) / denom;
              const half = (z * Math.sqrt((p * (1 - p)) / chosen.n + (z * z) / (4 * chosen.n * chosen.n))) / denom;
              return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
          })()
        : null;

    const why: string[] = [];
    let status: SignalStatus = 'NO TRADE';
    const need = Math.max(primaryWindow, MIN_PRIMARY);
    if (hasGap) {
        status = 'INSUFFICIENT EVIDENCE';
        why.push('There is a gap in the ticks, so the window is not a continuous record.');
    } else if (!complete || used < MIN_PRIMARY) {
        status = 'INSUFFICIENT EVIDENCE';
        why.push(`Only ${n} ticks are available; ${need} are needed for this window.`);
    } else if (!chosen || !favourable.length) {
        why.push(`Nothing is above its fair-digit share in the last ${used} ticks, so there is nothing to back.`);
    } else if (rate === null) {
        why.push('The payout for this contract is not known, so profitability cannot be assessed.');
    } else if (adjustedP === null || adjustedP >= 0.05) {
        why.push(
            `${chosen.label} is at ${pct(chosen.k / chosen.n)} against ${pct(chosen.p0)} expected (p = ${fmtP(pValue!)}), ` +
                `but that is not significant after correcting for ${family.length} tests (adjusted p = ${adjustedP === null ? 'n/a' : fmtP(adjustedP)}).`
        );
    } else if (estimated! <= breakEven!) {
        why.push(
            `The estimated win probability for ${chosen.label} is ${pct(estimated!)}, not above the ${pct(breakEven!)} needed to break even at this payout.`
        );
    } else if (!back || back.trades < MIN_TRADES) {
        status = 'INSUFFICIENT EVIDENCE';
        why.push(`The rule made only ${back ? back.trades : 0} out-of-sample trades; at least ${MIN_TRADES} are needed to judge it.`);
    } else if (!back.payoutKnown || !back.returnCI) {
        why.push('The payout was unknown for some backtest trades, so the backtest cannot be scored.');
    } else if (back.returnCI.high <= 0) {
        why.push(
            `Out-of-sample, the same rule did not beat break-even: ${back.trades} trades, average return ${(back.meanReturn! * 100).toFixed(1)}% per stake (95% interval ${(back.returnCI.low * 100).toFixed(1)}% to ${(back.returnCI.high * 100).toFixed(1)}%).`
        );
    } else if (adjustedP < 0.01 && agreeing >= 2 && back.returnCI.low > 0) {
        status = 'STRONG EVIDENCE';
        why.push(
            `${chosen.label}: ${pct(chosen.k / chosen.n)} against ${pct(chosen.p0)} expected, adjusted p = ${fmtP(adjustedP)}, confirmed in ${agreeing} of ${agreement.length} longer windows, ` +
                `and the rule beat break-even out-of-sample over ${back.trades} trades (average ${(back.meanReturn! * 100).toFixed(1)}% per stake, interval ${(back.returnCI.low * 100).toFixed(1)}% to ${(back.returnCI.high * 100).toFixed(1)}%).`
        );
    } else {
        status = 'WEAK EVIDENCE';
        why.push(
            `${chosen.label}: ${pct(chosen.k / chosen.n)} against ${pct(chosen.p0)} expected, adjusted p = ${fmtP(adjustedP)}, but it is not confirmed strongly enough: ` +
                `longer windows agree in ${agreeing} of ${agreement.length}, out-of-sample average ${(back.meanReturn! * 100).toFixed(1)}% per stake (interval ${(back.returnCI.low * 100).toFixed(1)}% to ${(back.returnCI.high * 100).toFixed(1)}%).`
        );
    }
    why.push('Windows overlap, so agreement between them is descriptive and is not independent evidence.');

    return {
        market,
        strategy,
        contract: chosen ? chosen.contract : null,
        barrier: chosen ? chosen.barrier : null,
        label: chosen ? chosen.label : null,
        window: used,
        observations: n,
        distribution: primary.map(c => ({ label: c.label, observed: c.k / c.n, expected: c.p0, count: c.k, n: c.n })),
        estimatedProbability: estimated,
        breakEvenProbability: breakEven,
        evidence: { pValue, adjustedP, testsInFamily: family.length, omnibusP: complete ? omnibus(digits.slice(-used)) : null, confidenceInterval: ci },
        windowAgreement: { agreeing, tested: agreement.length, windows: agreement },
        historical: {
            steps: back ? back.steps : 0,
            trades: back ? back.trades : 0,
            wins: back ? back.wins : 0,
            winRate: back ? back.winRate : null,
            winRateCI: back ? back.winRateCI : null,
            meanReturn: back ? back.meanReturn : null,
            returnCI: back ? back.returnCI : null,
        },
        sample: { size: n, minimum: need, complete, hasGap },
        status,
        explanation: why,
    };
};

const count = (d: number[], test: (x: number) => boolean): number => d.filter(test).length;
const digitCounts = (d: number[]): number[] => {
    const c = new Array<number>(10).fill(0);
    d.forEach(x => {
        c[x] += 1;
    });
    return c;
};

export const overUnderStrategy = (input: StrategyInput & { barrier: number }): StrategyResult => {
    const b = input.barrier;
    return evaluate(
        'OverUnder',
        input,
        (d, payout) => [
            { id: `DIGITOVER:${b}`, contract: 'DIGITOVER', barrier: b, label: `Over ${b}`, p0: (9 - b) / 10, k: count(d, x => x > b), n: d.length, payoutRate: payout('DIGITOVER', b) },
            { id: `DIGITUNDER:${b}`, contract: 'DIGITUNDER', barrier: b, label: `Under ${b}`, p0: b / 10, k: count(d, x => x < b), n: d.length, payoutRate: payout('DIGITUNDER', b) },
        ],
        d => overUnderAnalysis(d, b).chiSquare.pValue
    );
};

export const evenOddStrategy = (input: StrategyInput): StrategyResult =>
    evaluate(
        'EvenOdd',
        input,
        (d, payout) => {
            const even = count(d, x => x % 2 === 0);
            return [
                { id: 'DIGITEVEN', contract: 'DIGITEVEN', barrier: null, label: 'Even', p0: 0.5, k: even, n: d.length, payoutRate: payout('DIGITEVEN', null) },
                { id: 'DIGITODD', contract: 'DIGITODD', barrier: null, label: 'Odd', p0: 0.5, k: d.length - even, n: d.length, payoutRate: payout('DIGITODD', null) },
            ];
        },
        () => null
    );

export const matchesDiffersStrategy = (input: StrategyInput): StrategyResult =>
    evaluate(
        'MatchesDiffers',
        input,
        (d, payout) => {
            const c = digitCounts(d);
            return [...Array(10).keys()].flatMap(j => [
                { id: `DIGITMATCH:${j}`, contract: 'DIGITMATCH' as const, barrier: j, label: `Matches ${j}`, p0: 0.1, k: c[j], n: d.length, payoutRate: payout('DIGITMATCH', j) },
                { id: `DIGITDIFF:${j}`, contract: 'DIGITDIFF' as const, barrier: j, label: `Differs ${j}`, p0: 0.9, k: d.length - c[j], n: d.length, payoutRate: payout('DIGITDIFF', j) },
            ]);
        },
        d => digitDistribution(d).chiSquare.pValue
    );

/** Does the digit that follows depend on the digit before it? Tested as "Matches j after the current digit". */
export const digitTransitionStrategy = (input: StrategyInput): StrategyResult =>
    evaluate(
        'DigitTransition',
        input,
        (d, payout) => {
            const last = d[d.length - 1];
            const next = new Array<number>(10).fill(0);
            let seen = 0;
            for (let i = 0; i < d.length - 1; i++) {
                if (d[i] === last) {
                    next[d[i + 1]] += 1;
                    seen += 1;
                }
            }
            return next.map((k, j) => ({
                id: `AFTER${last}:DIGITMATCH:${j}`,
                contract: 'DIGITMATCH' as const,
                barrier: j,
                label: `Matches ${j} after a ${last}`,
                p0: 0.1,
                k,
                n: seen,
                payoutRate: payout('DIGITMATCH', j),
            }));
        },
        d => transitionAnalysis(d).chiSquare.pValue
    );

/** Describes how the digits are behaving. A regime is a description, never a trade signal. */
export const marketRegimeStrategy = (input: StrategyInput): StrategyResult => {
    const info = classifyRegime(input.digits, input.hasGap);
    const n = input.digits.length;
    const dist = digitDistribution(input.digits.slice(-1000));
    return {
        market: input.market,
        strategy: 'MarketRegime',
        contract: null,
        barrier: null,
        label: info.regime,
        window: Math.min(1000, n),
        observations: n,
        distribution: dist.rows.map(r => ({ label: `Digit ${r.digit}`, observed: r.share, expected: 0.1, count: r.count, n: dist.n })),
        estimatedProbability: null,
        breakEvenProbability: null,
        evidence: { pValue: info.longChiSquareP, adjustedP: null, testsInFamily: 4, omnibusP: info.longChiSquareP, confidenceInterval: null },
        windowAgreement: { agreeing: 0, tested: 0, windows: [] },
        historical: { steps: 0, trades: 0, wins: 0, winRate: null, winRateCI: null, meanReturn: null, returnCI: null },
        sample: { size: n, minimum: 400, complete: n >= 400, hasGap: !!input.hasGap },
        status: info.regime === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT EVIDENCE' : 'NO TRADE',
        explanation: [info.explanation, 'A regime label describes the digits. It is not a trading signal.'],
        regime: info,
    };
};
