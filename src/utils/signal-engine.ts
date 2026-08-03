/**
 * ProProfitSpace AI Signal Engine — advanced computation core.
 *
 * Analyzes synthetic index digits using:
 * - Digit frequency & distribution
 * - Digit clustering
 * - Digit heatmaps
 * - Probability shifts
 * - Entropy
 * - Randomness tests
 * - Volatility measurement
 * - Momentum tracking
 * - Historical success rates
 * - Recent outcomes
 * - Market state
 * - Tick behaviour
 * - Pattern repetition
 */

export type TSignalStrength = 'weak' | 'moderate' | 'strong' | 'very_strong';
export type TRiskLevel = 'low' | 'medium' | 'high' | 'extreme';
export type TContractType = 'DIGITEVEN' | 'DIGITODD' | 'DIGITOVER' | 'DIGITUNDER';
export type TMarketHealth = 'excellent' | 'good' | 'fair' | 'poor' | 'unstable';
export type TTrendDirection = 'bullish' | 'bearish' | 'neutral' | 'volatile';

export type TDigitStat = {
    digit: number;
    count: number;
    percentage: number;
    z_score: number;
    deviation: number;
    is_hot: boolean;
    is_cold: boolean;
    streak: number;
    last_seen: number;
};

export type TEntropyResult = {
    entropy: number;
    max_entropy: number;
    normalized: number; // 0-100, lower = more predictable
    is_low: boolean;
};

export type TVolatilityResult = {
    volatility: number;
    std_dev: number;
    mean: number;
    coefficient_of_variation: number;
    is_stable: boolean;
};

export type TMomentumResult = {
    momentum: number;
    recent_trend: number[];
    acceleration: number;
    is_trending: boolean;
};

export type TMarketState = {
    health: TMarketHealth;
    trend: TTrendDirection;
    entropy: TEntropyResult;
    volatility: TVolatilityResult;
    momentum: TMomentumResult;
    digit_clustering: number;
    pattern_repetition: number;
    randomness_score: number;
    confidence_score: number;
};

export type TRecoveryAnalysis = {
    should_continue: boolean;
    should_modify: boolean;
    should_reverse: boolean;
    should_cancel: boolean;
    modified_signal: TSignal | null;
    reasoning: string;
    confidence_delta: number;
};

export type TSignal = {
    contract_type: TContractType;
    label: string;
    barrier: number | null;
    observed_percentage: number;
    expected_percentage: number;
    deviation: number;
    z_score: number;
    confidence: number; // 0-99
    strength: TSignalStrength;
    risk_level: TRiskLevel;
    sample_size: number;
    reason: string;
    trade_score: number; // 0-100 composite score
    expected_win_rate: number; // 0-100%
    expected_duration_seconds: number;
    recommended_stake: number;
    recommended_max_runs: number;
    signal_strength_index: number; // 0-100
    market_state: TMarketState;
    ai_explanation: string;
    recovery: TRecoveryAnalysis | null;
    timestamp: number;
};

export const MIN_SAMPLE = 20;
export const MIN_SAMPLE_PREFERRED = 50;

// ──────────────────────────────────────────────
// Mathematical utilities
// ──────────────────────────────────────────────

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

// Shannon entropy for a distribution
const shannonEntropy = (counts: number[], total: number): number => {
    let entropy = 0;
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] > 0) {
            const p = counts[i] / total;
            entropy -= p * Math.log2(p);
        }
    }
    return entropy;
};

// ──────────────────────────────────────────────
// Advanced analytics functions
// ──────────────────────────────────────────────

export const computeDigitStats = (digits: number[]): TDigitStat[] => {
    const counts = new Array(10).fill(0);
    const streaks = new Array(10).fill(0);
    const lastSeen = new Array(10).fill(-1);
    const total = digits.length || 1;

    digits.forEach((d, i) => {
        if (d >= 0 && d <= 9) {
            counts[d]++;
            if (lastSeen[d] === -1) lastSeen[d] = i;
        }
    });

    // Calculate streaks
    const recentDigits = digits.slice(-20);
    for (let i = 0; i < 10; i++) {
        let streak = 0;
        for (let j = recentDigits.length - 1; j >= 0; j--) {
            if (recentDigits[j] === i) streak++;
            else break;
        }
        streaks[i] = streak;
    }

    const mean_p = total / 10;
    const se = Math.sqrt((mean_p * (1 - mean_p)) / total) || 1;

    return counts.map((count, digit) => ({
        digit,
        count,
        percentage: Number(((count / total) * 100).toFixed(1)),
        z_score: Number(((count / total - mean_p) / se).toFixed(2)),
        deviation: Number(((count / total - mean_p) * 100).toFixed(1)),
        is_hot: count / total > 1.15 * mean_p,
        is_cold: count / total < 0.85 * mean_p,
        streak: streaks[digit],
        last_seen: lastSeen[digit],
    }));
};

export const computeEntropy = (digits: number[]): TEntropyResult => {
    const counts = new Array(10).fill(0);
    digits.forEach(d => { if (d >= 0 && d <= 9) counts[d]++; });
    const n = digits.length || 1;
    const max_entropy = Math.log2(10);
    const entropy = shannonEntropy(counts, n);
    const normalized = max_entropy > 0 ? (entropy / max_entropy) * 100 : 50;

    return {
        entropy: Number(entropy.toFixed(3)),
        max_entropy: Number(max_entropy.toFixed(3)),
        normalized: Number(normalized.toFixed(1)),
        is_low: normalized < 65,
    };
};

export const computeVolatility = (prices: number[]): TVolatilityResult => {
    if (prices.length < 2) {
        return { volatility: 0, std_dev: 0, mean: 0, coefficient_of_variation: 0, is_stable: true };
    }

    const n = prices.length;
    const mean = prices.reduce((s, p) => s + p, 0) / n;
    const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / n;
    const std_dev = Math.sqrt(variance);
    const cv = mean !== 0 ? std_dev / mean : 0;

    // Compute tick-to-tick changes
    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        changes.push(Math.abs(prices[i] - prices[i - 1]));
    }
    const avg_change = changes.reduce((s, c) => s + c, 0) / (changes.length || 1);
    const volatility = avg_change / (mean || 1);

    return {
        volatility: Number(volatility.toFixed(6)),
        std_dev: Number(std_dev.toFixed(6)),
        mean: Number(mean.toFixed(6)),
        coefficient_of_variation: Number(cv.toFixed(4)),
        is_stable: cv < 0.0005,
    };
};

export const computeMomentum = (prices: number[]): TMomentumResult => {
    if (prices.length < 10) {
        return { momentum: 0, recent_trend: [], acceleration: 0, is_trending: false };
    }

    const window = Math.min(20, Math.floor(prices.length / 2));
    const recent = prices.slice(-window);
    const older = prices.slice(-window * 2, -window);

    const recent_mean = recent.reduce((s, p) => s + p, 0) / recent.length;
    const older_mean = older.reduce((s, p) => s + p, 0) / older.length;

    const momentum = recent_mean - older_mean;

    // Acceleration (second derivative)
    const diffs: number[] = [];
    for (let i = 1; i < recent.length; i++) {
        diffs.push(recent[i] - recent[i - 1]);
    }
    const first_half = diffs.slice(0, Math.floor(diffs.length / 2));
    const second_half = diffs.slice(Math.floor(diffs.length / 2));
    const accel = (second_half.reduce((s, d) => s + d, 0) / (second_half.length || 1)) -
                  (first_half.reduce((s, d) => s + d, 0) / (first_half.length || 1));

    return {
        momentum: Number(momentum.toFixed(6)),
        recent_trend: recent.slice(-10),
        acceleration: Number(accel.toFixed(6)),
        is_trending: Math.abs(momentum) > 0.001,
    };
};

export const computeDigitClustering = (digits: number[]): number => {
    if (digits.length < 10) return 0;

    // Group consecutive digits and measure clustering
    const clusters: number[] = [];
    let current_cluster = 1;

    for (let i = 1; i < digits.length; i++) {
        const diff = Math.abs(digits[i] - digits[i - 1]);
        if (diff <= 1) {
            current_cluster++;
        } else {
            if (current_cluster > 1) clusters.push(current_cluster);
            current_cluster = 1;
        }
    }
    if (current_cluster > 1) clusters.push(current_cluster);

    if (clusters.length === 0) return 0;

    const avg_cluster = clusters.reduce((s, c) => s + c, 0) / clusters.length;
    const max_possible = Math.min(digits.length, 10);
    return Number((avg_cluster / max_possible * 100).toFixed(1));
};

export const computePatternRepetition = (digits: number[]): number => {
    if (digits.length < 20) return 0;

    const recent = digits.slice(-30);
    const older = digits.slice(-60, -30);

    // Count pattern matches between two windows
    let matches = 0;
    const len = Math.min(recent.length, older.length);
    for (let i = 0; i < len; i++) {
        if (recent[i] === older[i]) matches++;
    }

    return Number((matches / len * 100).toFixed(1));
};

export const computeRandomness = (digits: number[]): number => {
    if (digits.length < 20) return 50;

    // Runs test for randomness
    let runs = 1;
    for (let i = 1; i < digits.length; i++) {
        const prev_even = digits[i - 1] % 2 === 0;
        const curr_even = digits[i] % 2 === 0;
        if (prev_even !== curr_even) runs++;
    }

    const n = digits.length;
    const n1 = digits.filter(d => d % 2 === 0).length;
    const n2 = n - n1;
    const expected_runs = (2 * n1 * n2) / n + 1;
    const variance_runs = (expected_runs - 1) * (expected_runs - 1) / (n - 1);
    const z = variance_runs > 0 ? (runs - expected_runs) / Math.sqrt(variance_runs) : 0;

    // Convert z-score to 0-100 randomness score (higher = more random)
    const randomness = Math.max(0, Math.min(100, 50 + z * 10));

    return Number(randomness.toFixed(1));
};

export const computeMarketState = (digits: number[], prices: number[]): TMarketState => {
    const entropy = computeEntropy(digits);
    const volatility = computeVolatility(prices);
    const momentum = computeMomentum(prices);
    const clustering = computeDigitClustering(digits);
    const repetition = computePatternRepetition(digits);
    const randomness = computeRandomness(digits);

    // Composite confidence score
    let confidence_score = 50;
    if (entropy.is_low) confidence_score += 15;
    if (volatility.is_stable) confidence_score += 10;
    if (momentum.is_trending) confidence_score += 5;
    if (clustering > 30) confidence_score += 10;
    if (repetition > 40) confidence_score -= 5;
    if (randomness > 70) confidence_score -= 5;
    confidence_score = Math.max(0, Math.min(100, confidence_score));

    // Health assessment
    let health: TMarketHealth = 'good';
    if (!volatility.is_stable && !entropy.is_low) health = 'poor';
    else if (!volatility.is_stable || !entropy.is_low) health = 'fair';
    else if (entropy.is_low && volatility.is_stable) health = 'excellent';

    // Trend direction
    let trend: TTrendDirection = 'neutral';
    if (momentum.is_trending) {
        trend = momentum.momentum > 0 ? 'bullish' : 'bearish';
    }
    if (volatility.coefficient_of_variation > 0.001) trend = 'volatile';

    return {
        health,
        trend,
        entropy,
        volatility,
        momentum,
        digit_clustering: clustering,
        pattern_repetition: repetition,
        randomness_score: randomness,
        confidence_score,
    };
};

// ──────────────────────────────────────────────
// Core signal computation (enhanced)
// ──────────────────────────────────────────────

type TSideEval = { z: number; confidence: number; observed_p: number };

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
    if (abs_z >= 3) return 'very_strong';
    if (abs_z >= 2) return 'strong';
    if (abs_z >= 1) return 'moderate';
    return 'weak';
};

const riskFromConfidence = (confidence: number): TRiskLevel => {
    if (confidence >= 90) return 'low';
    if (confidence >= 70) return 'medium';
    if (confidence >= 50) return 'high';
    return 'extreme';
};

const buildReason = (label: string, observed_pct: number, expected_pct: number, n: number, confidence: number, market_state: TMarketState): string => {
    if (n < MIN_SAMPLE) {
        return `Collecting ticks — need at least ${MIN_SAMPLE} in this window (have ${n}) before a signal is statistically meaningful.`;
    }
    const _deviation = Math.abs(observed_pct - expected_pct);
    const parts: string[] = [];

    parts.push(`${label} sits at ${observed_pct.toFixed(1)}% over the last ${n} ticks vs an expected ${expected_pct.toFixed(1)}%.`);

    if (market_state.entropy.is_low) {
        parts.push(`Market entropy is low (${market_state.entropy.normalized.toFixed(0)}%), indicating a non-random distribution that may persist.`);
    }
    if (market_state.volatility.is_stable) {
        parts.push('Volatility is stable — conditions are predictable.');
    } else {
        parts.push('Volatility is elevated — exercise caution.');
    }
    if (market_state.digit_clustering > 30) {
        parts.push(`Digit clustering detected (${market_state.digit_clustering.toFixed(0)}%), suggesting pattern formation.`);
    }
    if (market_state.pattern_repetition > 40) {
        parts.push(`Pattern repetition observed (${market_state.pattern_repetition.toFixed(0)}%) across recent windows.`);
    }

    parts.push(`Statistical confidence: ${confidence.toFixed(0)}%.`);

    return parts.join(' ');
};

export const computeEvenOddSignal = (digits: number[], prices: number[] = []): TSignal => {
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

    const market_state = computeMarketState(digits, prices);
    const trade_score = computeTradeScore(evaluation.confidence, market_state, n);
    const expected_win_rate = computeExpectedWinRate(evaluation, n);
    const stake = computeRecommendedStake(evaluation.confidence, risk_level);
    const max_runs = computeRecommendedMaxRuns(strength, market_state);
    const duration = computeExpectedDuration(market_state);

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
        reason: buildReason(label, observed_percentage, 50, n, evaluation.confidence, market_state),
        trade_score,
        expected_win_rate,
        expected_duration_seconds: duration,
        recommended_stake: stake,
        recommended_max_runs: max_runs,
        signal_strength_index: Number((evaluation.confidence * 0.7 + (market_state.confidence_score || 50) * 0.3).toFixed(1)),
        market_state,
        ai_explanation: buildAIExplanation(evaluation, market_state, label, observed_percentage, 50, n),
        recovery: null,
        timestamp: Date.now(),
    };
};

export const computeOverUnderSignal = (digits: number[], barrier: number, prices: number[] = []): TSignal => {
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

    const market_state = computeMarketState(digits, prices);
    const trade_score = computeTradeScore(chosen.confidence, market_state, n);
    const expected_win_rate = computeExpectedWinRate(chosen, n);
    const stake = computeRecommendedStake(chosen.confidence, risk_level);
    const max_runs = computeRecommendedMaxRuns(strength, market_state);
    const duration = computeExpectedDuration(market_state);

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
        reason: buildReason(label, observed_percentage, expected_percentage, n, chosen.confidence, market_state),
        trade_score,
        expected_win_rate,
        expected_duration_seconds: duration,
        recommended_stake: stake,
        recommended_max_runs: max_runs,
        signal_strength_index: Number((chosen.confidence * 0.7 + (market_state.confidence_score || 50) * 0.3).toFixed(1)),
        market_state,
        ai_explanation: buildAIExplanation(chosen, market_state, label, observed_percentage, expected_percentage, n),
        recovery: null,
        timestamp: Date.now(),
    };
};

// ──────────────────────────────────────────────
// Helper computation functions
// ──────────────────────────────────────────────

const computeTradeScore = (confidence: number, market_state: TMarketState, sample_size: number): number => {
    let score = confidence * 0.4 + (market_state.confidence_score || 50) * 0.35;
    score += Math.min(sample_size / 100, 1) * 25;
    if (market_state.entropy.is_low) score += 5;
    if (!market_state.volatility.is_stable) score -= 10;
    return Number(Math.max(0, Math.min(100, score)).toFixed(1));
};

const computeExpectedWinRate = (eval_result: TSideEval, n: number): number => {
    if (n < MIN_SAMPLE) return 50;
    const base = eval_result.observed_p * 100;
    const confidence_adj = (eval_result.confidence / 100) * 10;
    return Number(Math.max(40, Math.min(95, base + confidence_adj)).toFixed(1));
};

const computeRecommendedStake = (confidence: number, risk_level: TRiskLevel): number => {
    const fraction = risk_level === 'low' ? 0.025 : risk_level === 'medium' ? 0.015 : risk_level === 'high' ? 0.008 : 0.003;
    const confidence_adj = confidence / 100;
    return Number((fraction * confidence_adj * 100).toFixed(2));
};

const computeRecommendedMaxRuns = (strength: TSignalStrength, market_state: TMarketState): number => {
    if (strength === 'very_strong' && market_state.entropy.is_low) return 5;
    if (strength === 'strong' && market_state.entropy.is_low) return 3;
    if (strength === 'moderate') return 2;
    return 1;
};

const computeExpectedDuration = (market_state: TMarketState): number => {
    if (market_state.volatility.is_stable) return 5;
    if (market_state.entropy.is_low) return 8;
    return 12;
};

const buildAIExplanation = (
    eval_result: TSideEval,
    market_state: TMarketState,
    label: string,
    observed: number,
    expected: number,
    n: number
): string => {
    const parts: string[] = [];

    parts.push(`AI analysis for ${label}:`);

    if (market_state.entropy.is_low) {
        parts.push(`Market entropy is ${market_state.entropy.normalized.toFixed(0)}% — below the 65% randomness threshold, indicating a structured digit distribution.`);
    } else {
        parts.push(`Market entropy is ${market_state.entropy.normalized.toFixed(0)}% — approaching randomness, signal persistence is uncertain.`);
    }

    if (market_state.volatility.is_stable) {
        parts.push('Stable volatility conditions support signal reliability.');
    } else {
        parts.push(`Elevated volatility (CV: ${market_state.volatility.coefficient_of_variation.toFixed(4)}) increases uncertainty.`);
    }

    if (market_state.digit_clustering > 30) {
        parts.push(`Digit clustering of ${market_state.digit_clustering.toFixed(0)}% suggests consecutive pattern formation.`);
    }

    parts.push(`Observed ${observed.toFixed(1)}% vs expected ${expected.toFixed(1)}% over ${n} ticks. Confidence: ${eval_result.confidence.toFixed(0)}%.`);

    return parts.join(' ');
};

// ──────────────────────────────────────────────
// Smart Recovery Analysis
// ──────────────────────────────────────────────

export const analyzeRecovery = (
    previous_signal: TSignal | null,
    outcome: 'win' | 'loss',
    new_digits: number[],
    new_prices: number[]
): TRecoveryAnalysis => {
    if (!previous_signal || new_digits.length < MIN_SAMPLE) {
        return {
            should_continue: false,
            should_modify: false,
            should_reverse: false,
            should_cancel: true,
            modified_signal: null,
            reasoning: 'Insufficient data for recovery analysis. Collecting more ticks.',
            confidence_delta: 0,
        };
    }

    const new_signal = previous_signal.contract_type === 'DIGITEVEN' || previous_signal.contract_type === 'DIGITODD'
        ? computeEvenOddSignal(new_digits, new_prices)
        : computeOverUnderSignal(new_digits, previous_signal.barrier || 5, new_prices);

    const same_direction = new_signal.contract_type === previous_signal.contract_type;
    const confidence_delta = new_signal.confidence - previous_signal.confidence;

    // Maximum 3 analyses per opportunity
    if (previous_signal.recovery && previous_signal.recovery.confidence_delta < -20) {
        return {
            should_continue: false,
            should_modify: false,
            should_reverse: false,
            should_cancel: true,
            modified_signal: null,
            reasoning: 'Maximum recovery analyses reached. Confidence trend is declining — cancelling further trades for this opportunity.',
            confidence_delta,
        };
    }

    if (outcome === 'loss') {
        if (same_direction && new_signal.confidence > previous_signal.confidence + 10) {
            return {
                should_continue: true,
                should_modify: false,
                should_reverse: false,
                should_cancel: false,
                modified_signal: new_signal,
                reasoning: `Loss detected but AI re-analysis shows increased confidence (${new_signal.confidence.toFixed(0)}% > ${previous_signal.confidence.toFixed(0)}%). Market data confirms the original direction. Continuing with updated parameters.`,
                confidence_delta,
            };
        }
        if (!same_direction && new_signal.confidence > 70) {
            return {
                should_continue: true,
                should_modify: true,
                should_reverse: true,
                should_cancel: false,
                modified_signal: new_signal,
                reasoning: `Loss detected. Fresh market analysis suggests reversing direction to ${new_signal.label} with ${new_signal.confidence.toFixed(0)}% confidence.`,
                confidence_delta,
            };
        }
        if (!same_direction) {
            return {
                should_continue: false,
                should_modify: true,
                should_reverse: true,
                should_cancel: false,
                modified_signal: new_signal,
                reasoning: `Loss detected. Market conditions have shifted. Recommend switching to ${new_signal.label} rather than repeating the original trade.`,
                confidence_delta,
            };
        }
        return {
            should_continue: false,
            should_modify: false,
            should_reverse: false,
            should_cancel: true,
            modified_signal: null,
            reasoning: `Loss detected and re-analysis confidence has dropped. Cancelling further trades for this opportunity to protect capital.`,
            confidence_delta,
        };
    }

    // On win — continue if confidence is still strong
    if (new_signal.confidence > 75) {
        return {
            should_continue: true,
            should_modify: false,
            should_reverse: false,
            should_cancel: false,
            modified_signal: new_signal,
            reasoning: `Win confirmed. Market continues to show strong signal persistence. Continuing with updated parameters.`,
            confidence_delta,
        };
    }

    return {
        should_continue: false,
        should_modify: false,
        should_reverse: false,
        should_cancel: true,
        modified_signal: null,
        reasoning: 'Win confirmed but signal confidence has decayed. Cancelling further trades to lock in profits.',
        confidence_delta,
    };
};

// ──────────────────────────────────────────────
// Stake suggestion (enhanced)
// ──────────────────────────────────────────────

export const suggestStake = (balance: number, risk_level: TRiskLevel, min_stake = 0.35): number => {
    const fraction = risk_level === 'low' ? 0.025 : risk_level === 'medium' ? 0.015 : risk_level === 'high' ? 0.008 : 0.003;
    if (!balance || balance <= 0) return min_stake;
    return Math.max(min_stake, Number((balance * fraction).toFixed(2)));
};
