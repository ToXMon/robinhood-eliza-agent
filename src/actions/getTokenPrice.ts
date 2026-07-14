import type { Action, IAgentRuntime, Memory, State } from "@elizaos/core";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

interface TokenPriceResult {
  tokenAddress: string;
  priceUsd: string | null;
  priceNative: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  pairAddress: string | null;
  dexId: string | null;
}

export async function fetchTokenPrice(
  tokenAddress: string
): Promise<TokenPriceResult> {
  const url = `${DEXSCREENER_API}/tokens/${tokenAddress}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`DexScreener API error: ${resp.status}`);
  }
  const data = (await resp.json()) as any;
  const pairs = data?.pairs ?? [];

  if (pairs.length === 0) {
    return {
      tokenAddress,
      priceUsd: null,
      priceNative: null,
      liquidityUsd: null,
      volume24h: null,
      pairAddress: null,
      dexId: null,
    };
  }

  const best = pairs.reduce((max: any, p: any) => {
    const liq = parseFloat(p?.liquidity?.usd ?? "0");
    const maxLiq = parseFloat(max?.liquidity?.usd ?? "0");
    return liq > maxLiq ? p : max;
  }, pairs[0]);

  return {
    tokenAddress,
    priceUsd: best?.priceUsd ?? null,
    priceNative: best?.priceNative ?? null,
    liquidityUsd: best?.liquidity?.usd ? parseFloat(best.liquidity.usd) : null,
    volume24h: best?.volume?.h24 ? parseFloat(best.volume.h24) : null,
    pairAddress: best?.pairAddress ?? null,
    dexId: best?.dexId ?? null,
  };
}

export const getTokenPriceAction: Action = {
  name: "GET_TOKEN_PRICE",
  description:
    "Fetch current token price, liquidity, and volume from DexScreener",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text ?? "").toLowerCase();
    return text.includes("price") || text.includes("token");
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<void> => {
    const text = message.content.text ?? "";
    const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
    if (!addressMatch) {
      console.log("[getTokenPrice] No token address found in message");
      return;
    }
    try {
      const result = await fetchTokenPrice(addressMatch[0]);
      console.log(`[getTokenPrice] ${result.tokenAddress}:`);
      console.log(`  Price: $${result.priceUsd ?? "N/A"}`);
      console.log(`  Liquidity: $${result.liquidityUsd ?? "N/A"}`);
      console.log(`  24h Volume: $${result.volume24h ?? "N/A"}`);
      return;
    } catch (err) {
      console.error("[getTokenPrice] Error:", err);
      return;
    }
  },
  examples: [],
};
