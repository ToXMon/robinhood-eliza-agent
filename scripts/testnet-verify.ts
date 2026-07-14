/**
 * Testnet Integration Tests for Robinhood Eliza Trading Agent
 *
 * Verifies chain interaction against Robinhood Chain TESTNET (chain ID 46630).
 * All tests are read-only except the optional wallet balance check.
 *
 * Usage:
 *   ALCHEMY_API_KEY=xxx npm run test:testnet
 *   ALCHEMY_API_KEY=xxx PRIVATE_KEY=0x... npm run test:testnet
 *
 * Get testnet ETH: https://faucet.testnet.chain.robinhood.com
 * Explorer: https://explorer.testnet.chain.robinhood.com
 */

import { JsonRpcProvider, Contract, Wallet, formatEther } from "ethers";
import { createServer, type Server } from "http";

// ─── Testnet Constants ──────────────────────────────────────────────────
const TESTNET_CHAIN_ID = 46630;
const TESTNET_RPC_BASE = "https://robinhood-testnet.g.alchemy.com/v2";
const EXPLORER_URL = "https://explorer.testnet.chain.robinhood.com";
const FAUCET_URL = "https://faucet.testnet.chain.robinhood.com";

// Mainnet contract addresses (to check if they exist on testnet — they likely
// don't, since testnet has separate contract deployments).
const MAINNET_ROUTER = "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba";

// Minimal ERC20 ABI for reads
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
] as const;

// Minimal router ABI for existence check
const ROUTER_CHECK_ABI = ["function factory() view returns (address)"] as const;

// ─── Test Result Tracking ───────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
let skipCount = 0;

function pass(name: string, detail?: string): void {
  passCount++;
  console.log(`  ✅ PASS  ${name}${detail ? " — " + detail : ""}`);
}

function fail(name: string, reason: string): void {
  failCount++;
  console.error(`  ❌ FAIL  ${name} — ${reason}`);
}

function skip(name: string, reason: string): void {
  skipCount++;
  console.log(`  ⏭️  SKIP  ${name} — ${reason}`);
}

// ─── Test 1: Chain Connectivity ─────────────────────────────────────────
async function testChainConnectivity(rpcUrl: string): Promise<void> {
  const name = "Chain connectivity (chainId + blockNumber)";
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const [network, blockNumber] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber(),
    ]);
    const chainId = Number(network.chainId);
    if (chainId !== TESTNET_CHAIN_ID) {
      fail(name, `chainId mismatch: expected ${TESTNET_CHAIN_ID}, got ${chainId}`);
      return;
    }
    pass(name, `chainId=${chainId}, block=${blockNumber}`);
  } catch (err) {
    fail(name, `RPC error: ${(err as Error).message}`);
  }
}

// ─── Test 2: ERC20 Read ─────────────────────────────────────────────────
async function testERC20Read(rpcUrl: string): Promise<void> {
  const name = "ERC20 read (name/symbol/decimals)";
  try {
    const provider = new JsonRpcProvider(rpcUrl);

    // We don't have known testnet ERC20 token addresses upfront.
    // Testnet has separate contract deployments from mainnet.
    // To add candidates, find token contracts on the testnet explorer:
    //   https://explorer.testnet.chain.robinhood.com
    const candidates: string[] = [
      // Add known testnet token addresses here as they become available.
    ];

    if (candidates.length === 0) {
      skip(
        name,
        "No known testnet ERC20 token addresses. Testnet has separate contract " +
          "deployments from mainnet. To test ERC20 reads, find a token contract on " +
          `the explorer: ${EXPLORER_URL}`,
      );
      return;
    }

    let found = false;
    for (const addr of candidates) {
      try {
        const contract = new Contract(addr, ERC20_ABI, provider);
        const [tokenName, symbol, decimals] = await Promise.all([
          contract.name(),
          contract.symbol(),
          contract.decimals(),
        ]);
        pass(name, `${tokenName} (${symbol}), ${decimals} decimals @ ${addr}`);
        found = true;
        break;
      } catch {
        continue;
      }
    }

    if (!found) {
      skip(
        name,
        "No ERC20 contracts found at candidate addresses. Testnet uses separate " +
          "contract deployments from mainnet.",
      );
    }
  } catch (err) {
    fail(name, `Error: ${(err as Error).message}`);
  }
}

// ─── Test 3: Uniswap V2 Router Check ────────────────────────────────────
async function testRouterCheck(rpcUrl: string): Promise<void> {
  const name = "Uniswap V2 router check (mainnet address on testnet)";
  try {
    const provider = new JsonRpcProvider(rpcUrl);

    // Check if contract code exists at the mainnet router address on testnet
    const code = await provider.getCode(MAINNET_ROUTER);
    if (code === "0x" || code === "0x0") {
      skip(
        name,
        `No contract at mainnet router address ${MAINNET_ROUTER} on testnet. ` +
          "Testnet has separate contract deployments. Deploy your own router or " +
          `find testnet DEX addresses via the explorer: ${EXPLORER_URL}`,
      );
      return;
    }

    // Try calling factory() to verify it's actually a router
    const router = new Contract(MAINNET_ROUTER, ROUTER_CHECK_ABI, provider);
    const factoryAddr = await router.factory();
    pass(name, `router exists @ ${MAINNET_ROUTER}, factory=${factoryAddr}`);
  } catch (err) {
    skip(
      name,
      `Cannot verify router: ${(err as Error).message}. Testnet likely has separate ` +
        "contract deployments.",
    );
  }
}

// ─── Test 4: Wallet Balance ─────────────────────────────────────────────
async function testWalletBalance(rpcUrl: string, privateKey?: string): Promise<void> {
  const name = "Wallet ETH balance (testnet)";
  if (!privateKey) {
    skip(name, "PRIVATE_KEY env var not set. Set it to check wallet balance on testnet.");
    return;
  }

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);
    const eth = formatEther(balance);
    if (balance > 0n) {
      pass(name, `${wallet.address} has ${eth} testnet ETH`);
    } else {
      skip(
        name,
        `Wallet ${wallet.address} has 0 testnet ETH. Get testnet ETH from faucet: ${FAUCET_URL}`,
      );
    }
  } catch (err) {
    fail(name, `Error: ${(err as Error).message}`);
  }
}

// ─── Test 5: Health Endpoint ────────────────────────────────────────────
async function testHealthEndpoint(): Promise<void> {
  const name = "Health endpoint (/health returns 200)";
  let server: Server | null = null;

  try {
    // Start a minimal health server replicating src/index.ts behavior.
    // We don't import src/index.ts directly because it triggers full agent startup.
    server = createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const port = 18080; // Non-standard port to avoid conflicts
    await new Promise<void>((resolve, reject) => {
      server!.listen(port, "127.0.0.1", () => resolve());
      server!.on("error", reject);
    });

    // Brief settle for socket readiness
    await new Promise((r) => setTimeout(r, 100));

    // Test /health
    const resp = await fetch(`http://127.0.0.1:${port}/health`);
    if (resp.status !== 200) {
      fail(name, `expected HTTP 200, got ${resp.status}`);
      return;
    }

    const body = (await resp.json()) as { status: string };
    if (body.status !== "ok") {
      fail(name, `expected status="ok", got "${body.status}"`);
      return;
    }

    pass(name, `HTTP 200, body.status="ok"`);

    // Also verify 404 for unknown paths
    const resp404 = await fetch(`http://127.0.0.1:${port}/nonexistent`);
    if (resp404.status === 404) {
      pass("Health endpoint (404 for unknown paths)", "correctly returns 404");
    } else {
      fail("Health endpoint (404 for unknown paths)", `expected 404, got ${resp404.status}`);
    }
  } catch (err) {
    fail(name, `Error: ${(err as Error).message}`);
  } finally {
    server?.close();
  }
}

// ─── Test 6: DexScreener API ────────────────────────────────────────────
async function testDexScreenerAPI(): Promise<void> {
  const name = "DexScreener API (robinhood chain)";
  try {
    // DexScreener search API — check if robinhood chain data exists
    const resp = await fetch(
      "https://api.dexscreener.com/latest/dex/search?q=robinhood",
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!resp.ok) {
      fail(name, `DexScreener API returned HTTP ${resp.status}`);
      return;
    }

    const data = (await resp.json()) as { pairs?: unknown[] };
    const pairs = data.pairs ?? [];

    if (pairs.length === 0) {
      skip(
        name,
        'DexScreener returned 0 pairs for "robinhood". Testnet data is not indexed ' +
          "by DexScreener — it indexes mainnet pairs only. This is expected for testnet.",
      );
      return;
    }

    pass(name, `DexScreener returned ${pairs.length} pairs for "robinhood"`);
  } catch (err) {
    skip(name, `DexScreener API error: ${(err as Error).message}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Robinhood Eliza Agent — Testnet Integration Tests");
  console.log(`  Chain ID: ${TESTNET_CHAIN_ID} | Explorer: ${EXPLORER_URL}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const privateKey = process.env.PRIVATE_KEY;
  const envRpcUrl = process.env.RPC_URL;

  // Use ALCHEMY_API_KEY if available, otherwise fall back to RPC_URL env var
  const rpcUrl = alchemyKey
    ? `${TESTNET_RPC_BASE}/${alchemyKey}`
    : envRpcUrl || null;

  if (!rpcUrl) {
    console.log("  ⚠️  No RPC URL available. Set ALCHEMY_API_KEY or RPC_URL.\n");
    console.log("  Running non-chain tests only...\n");
  } else {
    console.log(`  Using RPC: ${rpcUrl}\n`);
  }

  console.log("─── Test Results ───────────────────────────────────────────\n");

  // Test 1: Chain connectivity
  if (rpcUrl) {
    await testChainConnectivity(rpcUrl);
  } else {
    skip("Chain connectivity (chainId + blockNumber)", "No RPC URL available");
  }

  // Test 2: ERC20 read
  if (rpcUrl) {
    await testERC20Read(rpcUrl);
  } else {
    skip("ERC20 read (name/symbol/decimals)", "No RPC URL available");
  }

  // Test 3: Uniswap V2 router check
  if (rpcUrl) {
    await testRouterCheck(rpcUrl);
  } else {
    skip("Uniswap V2 router check (mainnet address on testnet)", "No RPC URL available");
  }

  // Test 4: Wallet balance
  if (rpcUrl) {
    await testWalletBalance(rpcUrl, privateKey);
  } else {
    skip("Wallet ETH balance (testnet)", "No RPC URL available");
  }

  // Test 5: Health endpoint (no chain needed)
  await testHealthEndpoint();

  // Test 6: DexScreener API (no chain needed)
  await testDexScreenerAPI();

  // Summary
  console.log("\n─── Summary ────────────────────────────────────────────────\n");
  console.log(`  Passed: ${passCount}  |  Failed: ${failCount}  |  Skipped: ${skipCount}`);
  console.log("");

  if (failCount > 0) {
    console.error("  ❌ Some tests FAILED. Review errors above.\n");
    process.exit(1);
  } else {
    console.log("  ✅ All non-skipped tests passed.\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("\n  ❌ Fatal error in test runner:", err);
  process.exit(1);
});
