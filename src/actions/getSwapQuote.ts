import type { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { ethers } from "ethers";
import { getProvider } from "../chain/provider.js";
import { getUniswapV2Router, CONTRACTS } from "../chain/contracts.js";

interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  priceImpact: string;
}

export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<SwapQuote> {
  const provider = getProvider();
  const router = getUniswapV2Router(provider);
  const amountInWei = ethers.parseUnits(amountIn, 18);
  const path = [tokenIn, tokenOut];

  const amounts = await router.getAmountsOut(amountInWei, path);
  const amountOutWei = amounts[1];

  // Estimate price impact via reserves
  const factoryAddr = await router.factory();
  const factoryContract = new ethers.Contract(
    factoryAddr,
    ["function getPair(address,address) view returns (address)"],
    provider
  );
  const pairAddress = await factoryContract.getPair(tokenIn, tokenOut);

  let priceImpact = "N/A";
  if (pairAddress !== ethers.ZeroAddress) {
    const pairContract = new ethers.Contract(
      pairAddress,
      ["function getReserves() view returns (uint112,uint112,uint32)"],
      provider
    );
    const [reserve0, reserve1] = await pairContract.getReserves();
    const reserveIn = reserve0 > 0 ? reserve0 : reserve1;
    const impact =
      (BigInt(amountInWei) * BigInt(10000)) /
      (BigInt(reserveIn) + BigInt(amountInWei));
    priceImpact = `${Number(impact) / 100}%`;
  }

  return {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut: ethers.formatUnits(amountOutWei, 18),
    priceImpact,
  };
}

export const getSwapQuoteAction: Action = {
  name: "GET_SWAP_QUOTE",
  description:
    "Get a swap quote from Uniswap V2 router for token pair on Robinhood Chain",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text ?? "").toLowerCase();
    return text.includes("quote") || text.includes("swap");
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<void> => {
    const text = message.content.text ?? "";
    const addresses = text.match(/0x[a-fA-F0-9]{40}/g);
    if (!addresses || addresses.length < 2) {
      console.log("[getSwapQuote] Need two token addresses");
      return;
    }
    const amountMatch = text.match(/amount[:\s]+([\d.]+)/i);
    const amount = amountMatch ? amountMatch[1] : "1";
    try {
      const quote = await getSwapQuote(addresses[0], addresses[1], amount);
      console.log(`[getSwapQuote] ${quote.amountIn} -> ${quote.amountOut}`);
      console.log(`  Price impact: ${quote.priceImpact}`);
      return;
    } catch (err) {
      console.error("[getSwapQuote] Error:", err);
      return;
    }
  },
  examples: [],
};
