// Stake guard: how risky is this stake + martingale for the current balance?
// Pure functions with no imports.

export type GuardLevel = 'ok' | 'warn' | 'danger';

export interface StakeAssessment {
    level: GuardLevel;
    stakePct: number | null; // stake as % of balance
    worstCase: number; // total staked if the first trade and every recovery step all lose
    worstCasePct: number | null;
    messages: string[];
}

/** The Destroyer bot allows 4 recovery steps after the first loss (MaxRecoverySteps). */
export const RECOVERY_STEPS = 4;

export const STAKE_WARN_PCT = 2; // % of balance
export const STAKE_DANGER_PCT = 5;
export const WORST_WARN_PCT = 10;
export const WORST_DANGER_PCT = 25;

export function assessStake(
    stake: number,
    martingale: number,
    balance: number,
    recoverySteps = RECOVERY_STEPS
): StakeAssessment {
    const m = martingale > 0 ? martingale : 1;
    const n = recoverySteps + 1; // first trade + recovery trades
    const worstCase = m === 1 ? stake * n : (stake * (Math.pow(m, n) - 1)) / (m - 1);

    const hasBalance = Number.isFinite(balance) && balance > 0;
    const stakePct = hasBalance ? (stake / balance) * 100 : null;
    const worstCasePct = hasBalance ? (worstCase / balance) * 100 : null;

    let level: GuardLevel = 'ok';
    if (stakePct !== null && worstCasePct !== null) {
        if (worstCasePct > WORST_DANGER_PCT || stakePct > STAKE_DANGER_PCT) level = 'danger';
        else if (worstCasePct > WORST_WARN_PCT || stakePct > STAKE_WARN_PCT) level = 'warn';
    }

    const messages: string[] = [];
    if (level !== 'ok' && stakePct !== null && worstCasePct !== null) {
        messages.push(`Stake is ${stakePct.toFixed(1)}% of your balance.`);
        messages.push(
            `If the first trade and all ${recoverySteps} recovery steps lose, you lose about ${worstCase.toFixed(2)} (${worstCasePct.toFixed(0)}% of your balance).`
        );
    }

    return { level, stakePct, worstCase, worstCasePct, messages };
}
