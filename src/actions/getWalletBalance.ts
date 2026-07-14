import type { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getProvider } from "../chain/provider.js";
import { getWalletAddress } from "../chain/wallet.js";
import { getERC20 } from "../chain/contracts.js";

export interface WalletBalance {
  address: string;
  ethBalance: string;
  tokens: Array<{ symbol: string; address: string; balance: string; decimals: number }>;
}

export async function getWalletBalance(): Promise<WalletBalance> {
  const provider = getProvider();
  const address = getWalletAddress();
  const ethBalance = await provider.getBalance(address);

  // Load watchlist tokens
  const watchlistPath = resolve(process.cwd(), "data/token-watchlist.json");
  const watchlist = JSON.parse(readFileSync(watchlistPath, "utf-8")) as Array<{
    address: string;
    name: string;
  }>;

  const tokens: WalletBalance["tokens"] = [];
  for (const token of watchlist) {
    try {
      const contract = getERC20(token.address, provider);
      const [balance, decimals, symbol] = await Promise.all([
        contract.balanceOf(address),
        contract.decimals(),
        contract.symbol(),
      ]);
      tokens.push({
        symbol,
        address: token.address,
        balance: ethers.formatUnits(balance, decimals),
        decimals,
      });
    } catch {
      // Skip tokens that error
    }
  }

  return {
    address,
    ethBalance: ethers.formatEther(ethBalance),
    tokens,
  };
}

export const getWalletBalanceAction: Action = {
  name: "GET_WALLET_BALANCE",
  description: "Check wallet balance: ETH + all watchlist tokens",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text ?? "").toLowerCase();
    return text.includes("balance") || text.includes("wallet");
  },
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<void> => {
    try {
      const result = await getWalletBalance();
      console.log(`[getWalletBalance] Address: ${result.address}`);
      console.log(`  ETH: ${result.ethBalance}`);
      for (const t of result.tokens) {
        console.log(`  ${t.symbol}: ${t.balance}`);
      }
      return;
    } catch (err) {
      console.error("[getWalletBalance] Error:", err);
      return;
    }
  },
  examples: [],
};
