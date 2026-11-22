/** Break-even maths for a contract that pays `payoutRate` profit per 1 staked when it wins and loses the stake otherwise. */

/** Win probability needed just to break even: 1 / (1 + payoutRate). */
export const breakEvenProbability = (payoutRate: number): number => 1 / (1 + payoutRate);

/** Expected profit per 1 staked when the true win probability is `probability`. */
export const expectedReturnPerUnit = (probability: number, payoutRate: number): number => probability * (1 + payoutRate) - 1;

/** Profit per 1 staked from a Deriv `proposal` response (payout / ask_price - 1). Null when the numbers are unusable. */
export const payoutRateFromProposal = (askPrice: number, payout: number): number | null =>
    askPrice > 0 && payout > askPrice ? payout / askPrice - 1 : null;
