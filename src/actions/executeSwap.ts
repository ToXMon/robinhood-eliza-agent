import type { Action, IAgentRuntime, Memory, State } from "@elizaos/core";
import { ethers } from "ethers";
import { getProvider } from "../chain/provider.js";
import { getConnectedWallet } from "../chain/wallet.js";
import {
  getUniswapV2Router,
  getERC20,
  getDeadline,
} from "../chain/contracts.js";
import { checkPositionLimits } from "../strategies/riskManager.js";

export interface SwapResult {
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
}

export async function executeTokenSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippagePct: number = 1
): Promise<SwapResult> {
  const provider = getProvider();
  const wallet = getConnectedWallet(provider);
  const router = getUniswapV2Router(wallet);
  const amountInWei = ethers.parseUnits(amountIn, 18);

  // Risk check
  const allowed = await checkPositionLimits(wallet.address, amountInWei);
  if (!allowed) {
    throw new Error("Position size exceeds risk limits");
  }

  // Approve router if needed (token -> token swaps)
  const weth = await router.WETH();
  if (tokenIn.toLowerCase() !== weth.toLowerCase()) {
    const token = getERC20(tokenIn, wallet);
    const allowance = await token.allowance(
      wallet.address,
      await router.getAddress()
    );
    if (allowance < amountInWei) {
      const approveTx = await token.approve(
        await router.getAddress(),
        ethers.MaxUint256
      );
      await approveTx.wait();
      console.log(`[executeSwap] Approved router for ${tokenIn}`);
    }
  }

  // Get expected output
  const amounts = await router.getAmountsOut(amountInWei, [tokenIn, tokenOut]);
  const expectedOut = amounts[1];
  const amountOutMin =
    (expectedOut * BigInt(100 - slippagePct)) / BigInt(100);
  const deadline = getDeadline();
  const path = [tokenIn, tokenOut];

  let tx: ethers.TransactionResponse;
  if (tokenIn.toLowerCase() === weth.toLowerCase()) {
    // ETH -> Token
    tx = await router.swapExactETHForTokens(
      amountOutMin,
      path,
      wallet.address,
      deadline,
      { value: amountInWei }
    );
  } else if (tokenOut.toLowerCase() === weth.toLowerCase()) {
    // Token -> ETH
    tx = await router.swapExactTokensForETH(
      amountInWei,
      amountOutMin,
      path,
      wallet.address,
      deadline
    );
  } else {
    // Token -> Token
    tx = await router.swapExactTokensForTokens(
      amountInWei,
      amountOutMin,
      path,
      wallet.address,
      deadline
    );
  }

  console.log(`[executeSwap] TX sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[executeSwap] TX confirmed in block ${receipt?.blockNumber}`);

  return {
    txHash: tx.hash,
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin: ethers.formatUnits(amountOutMin, 18),
  };
}

export const executeSwapAction: Action = {
  name: "EXECUTE_SWAP",
  description:
    "Execute a token swap on Uniswap V2 router with risk management checks",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text ?? "").toLowerCase();
    return (
      text.includes("swap") && (text.includes("execute") || text.includes("buy") || text.includes("sell"))
    );
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<void> => {
    const text = message.content.text ?? "";
    const addresses = text.match(/0x[a-fA-F0-9]{40}/g);
    if (!addresses || addresses.length < 2) {
      console.log("[executeSwap] Need two token addresses");
      return;
    }
    const amountMatch = text.match(/amount[:\s]+([\d.]+)/i);
    const amount = amountMatch ? amountMatch[1] : "0.01";
    try {
      const result = await executeTokenSwap(addresses[0], addresses[1], amount);
      console.log(`[executeSwap] Success: ${result.txHash}`);
      return;
    } catch (err) {
      console.error("[executeSwap] Error:", err);
      return;
    }
  },
  examples: [],
};
