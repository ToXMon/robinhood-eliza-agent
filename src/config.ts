import dotenv from "dotenv";

dotenv.config();

export interface Config {
  chainId: number;
  alchemyApiKey: string;
  privateKey: string;
  rpcUrl: string;
  scanIntervalMs: number;
  telegramBotToken: string | null;
  telegramChatId: string | null;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string): string | null {
  return process.env[key] ?? null;
}

export function loadConfig(): Config {
  const privateKey = requireEnv("PRIVATE_KEY");

  // ALCHEMY_API_KEY is optional when RPC_URL is set directly (e.g. testnet).
  const alchemyApiKey = optionalEnv("ALCHEMY_API_KEY") ?? "";
  const rpcUrl =
    process.env.RPC_URL ??
    (alchemyApiKey
      ? `https://robinhood-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
      : "https://rpc.mainnet.chain.robinhood.com");

  return {
    chainId: parseInt(process.env.CHAIN_ID ?? "4663", 10),
    alchemyApiKey,
    privateKey,
    rpcUrl,
    scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS ?? "60000", 10),
    telegramBotToken: optionalEnv("TELEGRAM_BOT_TOKEN"),
    telegramChatId: optionalEnv("TELEGRAM_CHAT_ID"),
  };
}
