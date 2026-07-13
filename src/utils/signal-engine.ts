/**
 * AI Signal Center — core computation engine.
 *
 * Every synthetic index digit is, by design, close to uniformly distributed 0-9
 * (that's the product). A "signal" here is a *statistically measured deviation*
 * from that fair-market baseline over the current tick window — not a
 * prediction of the future. Confidence is a genuine two-tailed significance
 * score (via a normal approximation to the binomial), so it naturally goes up
 * with a bigger deviation AND a bigger sample size, and stays low on thin data.
 * That's deliberate: it keeps the "AI" honest instead of inventing numbers.
 */

export type TSignalStrength = 'weak' | 'moderate' | 'strong';
export type TRiskLevel = 'low' | 'medium' | 'high';
export type TContractType = 'DIGITEVEN' | 'DIGITODD' | 'DIGITOVER' | 'DIGITUNDER';

export type TSignal = {
    contract_type: TContractType;
    label: string;
    barrier: number | null;
    observed_percentage: number;
    expected_percentage: number;
    deviation: number;
    z_score: number;
    confidence: number; // 0-99, statistical confidence the deviation is real (not noise)
    strength: TSignalStrength;
    risk_level: TRiskLevel;
    sample_size: number;
    reason: string;
};

/** Minimum ticks before a signal is considered statistically meaningful at all. */
export const MIN_SAMPLE = 20;

/** Abramowitz & Stegun 7.1.26 approximation of the error function. */
const erf = (x: number): number => {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
    return sign * y;
};

const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.sqrt(2)));

type TSideEval = { z: number; confidence: number; observed_p: number };

/** Evaluates one binary side (e.g. "even", or "over barrier") against its fair-market probability p0. */
const evaluateSide = (favourable_count: number, n: number, p0: number): TSideEval | null => {
    if (p0 <= 0 || p0 >= 1 || n < MIN_SAMPLE) {
        return { z: 0, confidence: 0, observed_p: n ? favourable_count / n : 0 };
    }
    const observed_p = favourable_count / n;
    const se = Math.sqrt((p0 * (1 - p0)) / n);
    if (se === 0) return { z: 0, confidence: 0, observed_p };
    const z = (observed_p - p0) / se;
    const two_tailed_p = 2 * (1 - normalCdf(Math.abs(z)));
    const confidence = Math.max(0, Math.min(99, (1 - two_tailed_p) * 100));
    return { z, confidence, observed_p };
};

const strengthFromZ = (abs_z: number): TSignalStrength => {
    if (abs_z >= 2) return 'strong';
    if (abs_z >= 1) return 'moderate';
    return 'weak';
};

/** Risk of acting on this signal — inverse of statistical confidence, used for stake sizing. */
const riskFromConfidence = (confidence: number): TRiskLevel => {
    if (confidence >= 90) return 'low';
    if (confidence >= 70) return 'medium';
    return 'high';
};

const buildReason = (label: string, observed_pct: number, expected_pct: number, n: number, confidence: number): string => {
    if (n < MIN_SAMPLE) {
        return `Collecting ticks — need at least ${MIN_SAMPLE} in this window (have ${n}) before a signal is statistically meaningful.`;
    }
    const deviation = Math.abs(observed_pct - expected_pct);
    if (confidence < 70) {
        return `${label} sits at ${observed_pct}% over the last ${n} ticks, close to the ${expected_pct}% a fair market would show — not enough deviation yet to trade on.`;
    }
    return `${label} has printed ${observed_pct}% of the last ${n} ticks vs an expected ${expected_pct}% (${deviation.toFixed(1)} pt deviation). Confidence this is a real skew rather than noise: ${confidence.toFixed(0)}%.`;
};

/** Computes the Even/Odd signal for the current digit window. */
export const computeEvenOddSignal = (digits: number[]): TSignal => {
    const n = digits.length;
    const even_count = digits.filter(d => d % 2 === 0).length;
    const odd_count = n - even_count;
    const favour_even = even_count >= odd_count;
    const favourable_count = favour_even ? even_count : odd_count;

    const evaluation = evaluateSide(favourable_count, n, 0.5) as TSideEval;
    const observed_percentage = n ? Number(((favourable_count / n) * 100).toFixed(1)) : 0;
    const strength = strengthFromZ(Math.abs(evaluation.z));
    const risk_level = riskFromConfidence(evaluation.confidence);
    const label = favour_even ? 'Even' : 'Odd';

    return {
        contract_type: favour_even ? 'DIGITEVEN' : 'DIGITODD',
        label,
        barrier: null,
        observed_percentage,
        expected_percentage: 50,
        deviation: Number((observed_percentage - 50).toFixed(1)),
        z_score: Number(evaluation.z.toFixed(2)),
        confidence: Number(evaluation.confidence.toFixed(1)),
        strength,
        risk_level,
        sample_size: n,
        reason: buildReason(label, observed_percentage, 50, n, evaluation.confidence),
    };
};

/**
 * Computes the Over/Under signal for a given barrier digit (0-9), matching Deriv's
 * DIGITOVER/DIGITUNDER semantics: OVER wins on digit > barrier, UNDER wins on digit < barrier
 * (the barrier digit itself favours neither side).
 */
export const computeOverUnderSignal = (digits: number[], barrier: number): TSignal => {
    const n = digits.length;
    const over_count = digits.filter(d => d > barrier).length;
    const under_count = digits.filter(d => d < barrier).length;
    const p_over = (9 - barrier) / 10;
    const p_under = barrier / 10;

    const over_eval = evaluateSide(over_count, n, p_over);
    const under_eval = evaluateSide(under_count, n, p_under);

    let pick: 'over' | 'under' = 'over';
    if (under_eval && (!over_eval || Math.abs(under_eval.z) > Math.abs(over_eval.z))) {
        pick = 'under';
    }
    const chosen = (pick === 'over' ? over_eval : under_eval) as TSideEval;
    const expected_percentage = Number(((pick === 'over' ? p_over : p_under) * 100).toFixed(1));
    const observed_percentage = Number((chosen.observed_p * 100).toFixed(1));
    const strength = strengthFromZ(Math.abs(chosen.z));
    const risk_level = riskFromConfidence(chosen.confidence);
    const label = pick === 'over' ? `Over ${barrier}` : `Under ${barrier}`;

    return {
        contract_type: pick === 'over' ? 'DIGITOVER' : 'DIGITUNDER',
        label,
        barrier,
        observed_percentage,
        expected_percentage,
        deviation: Number((observed_percentage - expected_percentage).toFixed(1)),
        z_score: Number(chosen.z.toFixed(2)),
        confidence: Number(chosen.confidence.toFixed(1)),
        strength,
        risk_level,
        sample_size: n,
        reason: buildReason(label, observed_percentage, expected_percentage, n, chosen.confidence),
    };
};

/**
 * Suggests a stake as a conservative fraction of account balance, scaled down as
 * risk_level rises (i.e. as statistical confidence falls). Falls back to a fixed
 * minimum when balance is unknown/zero (e.g. logged out) — never suggests trading
 * a fraction of nothing.
 */
export const suggestStake = (balance: number, risk_level: TRiskLevel, min_stake = 0.35): number => {
    const fraction = risk_level === 'low' ? 0.02 : risk_level === 'medium' ? 0.01 : 0.005;
    if (!balance || balance <= 0) return min_stake;
    return Math.max(min_stake, Number((balance * fraction).toFixed(2)));
};
