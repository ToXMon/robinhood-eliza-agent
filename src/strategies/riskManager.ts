import { ethers } from "ethers";
import { getProvider } from "../chain/provider.js";

export const RISK_RULES = {
  MAX_POSITION_SIZE_PCT: 5,
  STOP_LOSS_PCT: 40,
  MIN_SAFETY_SCORE: 40,
  MIN_LIQUIDITY_USD: 5000,
  MAX_TOP10_HOLDERS_PCT: 50,
  MAX_SLIPPAGE_PCT: 1,
} as const;

export interface RiskAssessment {
  passed: boolean;
  reasons: string[];
  maxPositionWei: bigint;
}

export async function getTotalPortfolioValue(
  walletAddress: string
): Promise<bigint> {
  const provider = getProvider();
  const ethBalance = await provider.getBalance(walletAddress);
  // Portfolio value = ETH balance (simplified, no token USD conversion in scaffold)
  return ethBalance;
}

export async function checkPositionLimits(
  walletAddress: string,
  amountInWei: bigint
): Promise<boolean> {
  const portfolioValue = await getTotalPortfolioValue(walletAddress);
  const maxPosition =
    (portfolioValue * BigInt(RISK_RULES.MAX_POSITION_SIZE_PCT)) / BigInt(100);

  if (amountInWei > maxPosition) {
    console.warn(
      `[riskManager] Position ${ethers.formatEther(amountInWei)} ETH exceeds max ${ethers.formatEther(maxPosition)} ETH (${RISK_RULES.MAX_POSITION_SIZE_PCT}% of portfolio)`
    );
    return false;
  }
  return true;
}

export function shouldStopLoss(
  entryPrice: number,
  currentPrice: number
): boolean {
  if (entryPrice <= 0) return false;
  const dropPct = ((entryPrice - currentPrice) / entryPrice) * 100;
  return dropPct >= RISK_RULES.STOP_LOSS_PCT;
}

export function assessTokenForTrading(
  safetyScore: number,
  liquidityUsd: number | null,
  top10Pct: number | null,
  redFlags: string[]
): RiskAssessment {
  const reasons: string[] = [];
  let passed = true;

  if (safetyScore < RISK_RULES.MIN_SAFETY_SCORE) {
    passed = false;
    reasons.push(
      `Safety score ${safetyScore} below minimum ${RISK_RULES.MIN_SAFETY_SCORE}`
    );
  }

  if (liquidityUsd !== null && liquidityUsd < RISK_RULES.MIN_LIQUIDITY_USD) {
    passed = false;
    reasons.push(
      `Liquidity $${liquidityUsd} below minimum $${RISK_RULES.MIN_LIQUIDITY_USD}`
    );
  }

  if (top10Pct !== null && top10Pct > RISK_RULES.MAX_TOP10_HOLDERS_PCT) {
    passed = false;
    reasons.push(
      `Top 10 holders ${top10Pct.toFixed(1)}% above max ${RISK_RULES.MAX_TOP10_HOLDERS_PCT}%`
    );
  }

  const BLOCKLIST_FLAGS = [
    "mint_function_unrestricted",
    "honeypot_suspected",
    "deployer_rugs_history",
  ];

  for (const flag of BLOCKLIST_FLAGS) {
    if (redFlags.includes(flag)) {
      passed = false;
      reasons.push(`Hard block: ${flag}`);
    }
  }

  return {
    passed,
    reasons,
    maxPositionWei: BigInt(0),
  };
}
