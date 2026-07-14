import { AgentRuntime, Character } from "@elizaos/core";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createServer } from "http";
import { robinhoodChainPlugin } from "./plugins/robinhood-chain.js";
// @ts-ignore - plugin-sql has type resolution issues with bundler moduleResolution
import sqlPlugin from "@elizaos/plugin-sql";

// ─── Bulletproof health server (catecoin-scanner pattern) ───────────────
// Container MUST NOT exit on Akash. /health lets the provider probe liveness.
// Failures here are logged but never crash the process.
function startHealthServer(port = 8080): void {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.on("error", (err) => {
    console.error("[health] server error (non-fatal):", err);
  });

  try {
    server.listen(port, "0.0.0.0", () => {
      console.log(`[health] listening on :${port}`);
    });
  } catch (err) {
    console.error("[health] failed to start (non-fatal):", err);
  }
}

async function loadCharacter(): Promise<Character> {
  // process.cwd() is safe in ESM (unlike __dirname which is undefined in ESM).
  // In container WORKDIR=/app, characters/ sits at /app/characters/.
  const characterPath = resolve(
    process.cwd(),
    "characters/trader.character.json",
  );

  if (!existsSync(characterPath)) {
    throw new Error(`Character file not found: ${characterPath}`);
  }

  const character = JSON.parse(
    readFileSync(characterPath, "utf-8"),
  ) as Character;

  return character;
}

async function startAgent(): Promise<void> {
  console.log("[RobinhoodChainTrader] Starting agent...");

  const character = await loadCharacter();

  const runtime = new AgentRuntime({
    character,
    plugins: [sqlPlugin, robinhoodChainPlugin],
    settings: {},
  });

  await runtime.initialize();

  console.log(
    `[RobinhoodChainTrader] Agent initialized with character: ${character.name}`,
  );
  console.log("[RobinhoodChainTrader] Monitoring Robinhood Chain (ID 4663)");
  console.log(
    "[RobinhoodChainTrader] Watchlist: CASHCAT, JUGGERNAUT, ROBINHOOD, VLAD, REPE",
  );
}

// ─── Bulletproof keep-alive ────────────────────────────────────────────
// If the agent crashes, retry forever with exponential backoff.
// NEVER let the container exit — Akash expects long-running services.
async function runWithRetry(): Promise<void> {
  const MAX_BACKOFF_MS = 60_000;
  let attempt = 0;

  for (;;) {
    attempt += 1;
    try {
      await startAgent();
      console.log(
        "[RobinhoodChainTrader] agent setup complete; holding open",
      );
      return; // setup done — fall through to keep-alive hold
    } catch (err) {
      const backoff = Math.min(5_000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      console.error(
        `[keep-alive] agent attempt ${attempt} failed, retrying in ${backoff}ms:`,
        err,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

// Final fallback: hold the event loop open even if every retry path returns.
// Health server keeps answering /health so Akash sees the pod as live.
function keepAlive(): void {
  const tick = () => {
    // intentional no-op heartbeat hold
  };
  setInterval(tick, 60_000);
}

async function main(): Promise<void> {
  // Catch fatal signals — log instead of silently dying. NEVER re-throw.
  process.on("uncaughtException", (err) => {
    console.error("[fatal] uncaughtException (non-exiting):", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[fatal] unhandledRejection (non-exiting):", reason);
  });

  startHealthServer(8080);

  // Start agent in background — never let its failure tear down the process.
  runWithRetry().catch((err) => {
    console.error("[fatal] runWithRetry escaped (non-exiting):", err);
  });

  keepAlive();
}

main();
