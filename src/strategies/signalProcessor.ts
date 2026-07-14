import { readFileSync } from "fs";
import { resolve } from "path";
import { fetchTokenPrice } from "../actions/getTokenPrice.js";
import { checkTokenSafety } from "../actions/checkSafety.js";
import { assessTokenForTrading } from "./riskManager.js";

export type SignalAction = "BUY" | "SELL" | "HOLD" | "AVOID";

export interface ProcessedSignal {
  tokenAddress: string;
  tokenName: string;
  priceUsd: string | null;
  safetyScore: number;
  liquidityUsd: number | null;
  riskPassed: boolean;
  riskReasons: string[];
  action: SignalAction;
  timestamp: string;
}

export interface RawAlert {
  tokenAddress: string;
  tokenName: string;
  alertType: string;
  message: string;
}

export async function processSignal(
  alert: RawAlert
): Promise<ProcessedSignal> {
  const [price, safety] = await Promise.all([
    fetchTokenPrice(alert.tokenAddress),
    checkTokenSafety(alert.tokenAddress),
  ]);

  const assessment = assessTokenForTrading(
    safety.score,
    price.liquidityUsd ?? null,
    safety.top10Pct,
    safety.redFlags
  );

  let action: SignalAction = "HOLD";
  if (!assessment.passed) {
    action = "AVOID";
  } else if (safety.score >= 70 && (price.liquidityUsd ?? 0) >= 10000) {
    action = "BUY";
  }

  return {
    tokenAddress: alert.tokenAddress,
    tokenName: alert.tokenName,
    priceUsd: price.priceUsd,
    safetyScore: safety.score,
    liquidityUsd: price.liquidityUsd,
    riskPassed: assessment.passed,
    riskReasons: assessment.reasons,
    action,
    timestamp: new Date().toISOString(),
  };
}

export async function processWatchlist(): Promise<ProcessedSignal[]> {
  const watchlistPath = resolve(process.cwd(), "data/token-watchlist.json");
  const watchlist = JSON.parse(readFileSync(watchlistPath, "utf-8")) as Array<{
    address: string;
    name: string;
  }>;

  const results: ProcessedSignal[] = [];
  for (const token of watchlist) {
    try {
      const signal = await processSignal({
        tokenAddress: token.address,
        tokenName: token.name,
        alertType: "watchlist_scan",
        message: `Scanning ${token.name}`,
      });
      results.push(signal);
    } catch (err) {
      console.error(`[signalProcessor] Error for ${token.name}:`, err);
    }
  }

  return results;
}

export function filterBuyCandidates(
  signals: ProcessedSignal[]
): ProcessedSignal[] {
  return signals.filter((s) => s.action === "BUY");
}
