import type { Plugin } from "@elizaos/core";
import { getTokenPriceAction } from "../actions/getTokenPrice.js";
import { getSwapQuoteAction } from "../actions/getSwapQuote.js";
import { executeSwapAction } from "../actions/executeSwap.js";
import { checkSafetyAction } from "../actions/checkSafety.js";
import { scanSignalsAction } from "../actions/scanSignals.js";
import { getWalletBalanceAction } from "../actions/getWalletBalance.js";

export const robinhoodChainPlugin: Plugin = {
  name: "robinhood-chain",
  description:
    "Robinhood Chain trading plugin: price, quotes, swaps, safety, signals, balance",
  actions: [
    getTokenPriceAction,
    getSwapQuoteAction,
    executeSwapAction,
    checkSafetyAction,
    scanSignalsAction,
    getWalletBalanceAction,
  ],
  providers: [],
  evaluators: [],
  services: [],
};

export default robinhoodChainPlugin;
