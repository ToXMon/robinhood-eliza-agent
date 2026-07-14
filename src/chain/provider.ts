import { JsonRpcProvider } from "ethers";
import { loadConfig } from "../config.js";

let _provider: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (!_provider) {
    const config = loadConfig();
    _provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  }
  return _provider;
}

export async function getNetworkInfo(): Promise<{
  chainId: number;
  blockNumber: number;
}> {
  const provider = getProvider();
  const [network, blockNumber] = await Promise.all([
    provider.getNetwork(),
    provider.getBlockNumber(),
  ]);
  return {
    chainId: Number(network.chainId),
    blockNumber,
  };
}
