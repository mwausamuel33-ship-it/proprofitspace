/** Account-aware risk planning: recommended stake, cycle risk cap, stop loss and the worst-case recovery chain. */
import type { TraderConfig } from './auto-trader';

const PAYOUT = 0.95;                       // Deriv pays about 95% of fair odds
const SAFE_RATE = PAYOUT / 0.8 - 1;        // Over 1 / Under 8 pay about 19% profit
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface RiskStep { step: number; label: string; stake: number; atRisk: number; ok: boolean }
export interface RiskPlan {
  balance: number;
  recommended: number;   // suggested first stake
  stake: number;         // stake actually in use (auto = recommended)
  cap: number;           // max total a loss + recovery cycle may risk
  stopLoss: number;      // effective session stop loss
  chain: RiskStep[];     // worst case: every recovery trade loses
}

export const effectiveStop = (startBalance: number, cfg: TraderConfig) =>
  cfg.stopLossPct > 0 && startBalance > 0 ? r2(Math.min(cfg.stopLoss, (startBalance * cfg.stopLossPct) / 100)) : cfg.stopLoss;

export function riskPlan(balance: number, cfg: TraderConfig, manualStake: number): RiskPlan {
  const k = Math.max(1, Math.round(cfg.recoveryStages));
  const cap = r2((balance * cfg.maxCycleRiskPct) / 100);
  const byRisk = (balance * cfg.riskPerTradePct) / 100;
  const byCycle = cap / (1 + 1 / (k * SAFE_RATE));   // first loss + first recovery stake must fit the cap
  const recommended = Math.max(0.35, Math.floor(Math.min(byRisk, byCycle, cfg.maxStake) * 100) / 100);
  const stake = cfg.autoStake ? recommended : manualStake;

  const chain: RiskStep[] = [{ step: 0, label: 'First trade', stake, atRisk: stake, ok: stake <= cap && stake <= cfg.maxStake }];
  let net = stake, prev = stake;
  for (let i = 1; i <= cfg.maxSteps && chain[chain.length - 1].ok; i++) {
    const target = net / k + (k === 1 ? cfg.recoveryTarget : 0);
    const s = r2(Math.max(0.35, cfg.recoveryMode === 'multiplier' ? prev * cfg.multiplier : target / SAFE_RATE));
    const ok = net + s <= cap && s <= cfg.maxStake && s <= balance;
    chain.push({ step: i, label: `Recovery ${i}`, stake: s, atRisk: r2(net + s), ok });
    net = r2(net + s); prev = s;
  }
  return { balance, recommended, stake, cap, stopLoss: effectiveStop(balance, cfg), chain };
}
