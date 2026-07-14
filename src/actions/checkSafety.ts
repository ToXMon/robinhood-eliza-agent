import type { Action, IAgentRuntime, Memory, State } from "@elizaos/core";

const BLOCKSCOUT_API = "https://robinhoodchain.blockscout.com/api/v2";
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

export interface SafetyResult {
  tokenAddress: string;
  score: number;
  findings: string[];
  redFlags: string[];
  verified: boolean;
  liquidityUsd: number | null;
  holderCount: number | null;
  top10Pct: number | null;
  deployerRugs: number;
}

const RED_FLAG_PATTERNS = [
  "mint_function_unrestricted",
  "honeypot_suspected",
  "proxy_unverified",
  "high_buy_sell_tax",
];

export async function checkTokenSafety(
  tokenAddress: string
): Promise<SafetyResult> {
  const findings: string[] = [];
  const redFlags: string[] = [];
  let score = 100;
  let verified = false;
  let liquidityUsd: number | null = null;
  let holderCount: number | null = null;
  let top10Pct: number | null = null;
  let deployerRugs = 0;

  // 1. Contract verification
  try {
    const resp = await fetch(
      `${BLOCKSCOUT_API}/smart-contracts/${tokenAddress}`
    );
    if (resp.ok) {
      const data = (await resp.json()) as any;
      verified = data?.is_verified ?? false;
      if (!verified) {
        score -= 10;
        findings.push("Contract not verified (-10)");
      } else {
        findings.push("Contract verified (+0)");
      }
    }
  } catch {
    findings.push("Could not check contract verification");
    score -= 5;
  }

  // 2. Holder concentration via Blockscout
  try {
    const resp = await fetch(
      `${BLOCKSCOUT_API}/tokens/${tokenAddress}/holders`
    );
    if (resp.ok) {
      const data = (await resp.json()) as any;
      const holders = data?.items ?? [];
      holderCount = holders.length;
      if (holders.length > 0) {
        const top10 = holders.slice(0, 10);
        // Estimate concentration (Blockscout returns balances)
        const totalSupply = holders.reduce(
          (sum: number, h: any) => sum + parseFloat(h?.value ?? "0"),
          0
        );
        const top10Sum = top10.reduce(
          (sum: number, h: any) => sum + parseFloat(h?.value ?? "0"),
          0
        );
        if (totalSupply > 0) {
          top10Pct = (top10Sum / totalSupply) * 100;
          if (top10Pct > 50) {
            score -= 20;
            findings.push(`Top 10 holders: ${top10Pct.toFixed(1)}% (-20)`);
            redFlags.push("high_holder_concentration");
          }
        }
      }
    }
  } catch {
    findings.push("Could not check holder concentration");
  }

  // 3. Liquidity via DexScreener
  try {
    const resp = await fetch(`${DEXSCREENER_API}/tokens/${tokenAddress}`);
    if (resp.ok) {
      const data = (await resp.json()) as any;
      const pairs = data?.pairs ?? [];
      if (pairs.length > 0) {
        const liq = parseFloat(pairs[0]?.liquidity?.usd ?? "0");
        liquidityUsd = liq;
        if (liq < 5000) {
          score -= 15;
          findings.push(`Low liquidity: $${liq.toFixed(0)} (-15)`);
        } else {
          findings.push(`Liquidity: $${liq.toFixed(0)} OK`);
        }
      }
    }
  } catch {
    findings.push("Could not check DexScreener liquidity");
  }

  // 4. Deployer history check
  try {
    const resp = await fetch(
      `${BLOCKSCOUT_API}/smart-contracts/${tokenAddress}`
    );
    if (resp.ok) {
      const data = (await resp.json()) as any;
      const deployer = data?.creator?.hash;
      if (deployer) {
        const depResp = await fetch(
          `${BLOCKSCOUT_API}/addresses/${deployer}/transactions`
        );
        if (depResp.ok) {
          const depData = (await depResp.json()) as any;
          const txCount = depData?.items?.length ?? 0;
          if (txCount > 100) {
            score -= 10;
            findings.push(`Deployer high activity: ${txCount} txs (-10)`);
          }
        }
      }
    }
  } catch {
    // Non-blocking
  }

  score = Math.max(0, Math.min(100, score));

  return {
    tokenAddress,
    score,
    findings,
    redFlags,
    verified,
    liquidityUsd,
    holderCount,
    top10Pct,
    deployerRugs,
  };
}

export const checkSafetyAction: Action = {
  name: "CHECK_SAFETY",
  description:
    "Check token contract safety score (0-100) via Blockscout + DexScreener",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text ?? "").toLowerCase();
    return text.includes("safety") || text.includes("safe") || text.includes("rug");
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<void> => {
    const addressMatch = (message.content.text ?? "").match(/0x[a-fA-F0-9]{40}/);
    if (!addressMatch) {
      console.log("[checkSafety] No token address found");
      return;
    }
    try {
      const result = await checkTokenSafety(addressMatch[0]);
      console.log(`[checkSafety] Score: ${result.score}/100`);
      console.log(`  Verified: ${result.verified}`);
      console.log(`  Findings:`);
      for (const f of result.findings) console.log(`    - ${f}`);
      if (result.redFlags.length > 0) {
        console.log(`  RED FLAGS: ${result.redFlags.join(", ")}`);
      }
      return;
    } catch (err) {
      console.error("[checkSafety] Error:", err);
      return;
    }
  },
  examples: [],
};
