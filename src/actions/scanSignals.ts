import type { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fetchTokenPrice } from "./getTokenPrice.js";
import { checkTokenSafety } from "./checkSafety.js";

export interface TokenSignal {
  name: string;
  address: string;
  priority: string;
  priceUsd: string | null;
  safetyScore: number | null;
  liquidityUsd: number | null;
  action: string;
}

export async function scanWatchlistSignals(): Promise<TokenSignal[]> {
  const watchlistPath = resolve(process.cwd(), "data/token-watchlist.json");
  const watchlist = JSON.parse(readFileSync(watchlistPath, "utf-8")) as Array<{
    address: string;
    name: string;
    priority: string;
  }>;

  const signals: TokenSignal[] = [];

  for (const token of watchlist) {
    try {
      const [price, safety] = await Promise.all([
        fetchTokenPrice(token.address),
        checkTokenSafety(token.address),
      ]);

      let action = "HOLD";
      if (safety.score >= 60 && (price.liquidityUsd ?? 0) >= 5000) {
        action = "WATCH";
      }
      if (safety.score >= 75 && (price.liquidityUsd ?? 0) >= 10000) {
        action = "BUY_CANDIDATE";
      }
      if (safety.score < 40 || safety.redFlags.length > 0) {
        action = "AVOID";
      }

      signals.push({
        name: token.name,
        address: token.address,
        priority: token.priority,
        priceUsd: price.priceUsd,
        safetyScore: safety.score,
        liquidityUsd: price.liquidityUsd,
        action,
      });
    } catch {
      signals.push({
        name: token.name,
        address: token.address,
        priority: token.priority,
        priceUsd: null,
        safetyScore: null,
        liquidityUsd: null,
        action: "ERROR",
      });
    }
  }

  return signals;
}

export const scanSignalsAction: Action = {
  name: "SCAN_SIGNALS",
  description: "Scan all watchlist tokens for price + safety signals",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text ?? "").toLowerCase();
    return text.includes("scan") || text.includes("signal") || text.includes("alert");
  },
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<void> => {
    try {
      const signals = await scanWatchlistSignals();
      console.log(`[scanSignals] ${signals.length} tokens scanned:`);
      for (const s of signals) {
        console.log(
          `  ${s.name} [${s.priority}] | $${s.priceUsd ?? "N/A"} | Safety: ${s.safetyScore ?? "N/A"} | ${s.action}`
        );
      }
      return;
    } catch (err) {
      console.error("[scanSignals] Error:", err);
      return;
    }
  },
  examples: [],
};
