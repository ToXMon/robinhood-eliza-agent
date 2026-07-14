import { Wallet, JsonRpcProvider } from "ethers";
import { loadConfig } from "../config.js";

let _wallet: Wallet | null = null;

export function getWallet(): Wallet {
  if (!_wallet) {
    const config = loadConfig();
    _wallet = new Wallet(config.privateKey);
  }
  return _wallet;
}

export function getConnectedWallet(provider: JsonRpcProvider): Wallet {
  return getWallet().connect(provider);
}

export function getWalletAddress(): string {
  return getWallet().address;
}
