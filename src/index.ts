import { createServer } from "http";
import { scanWatchlistSignals } from "./actions/scanSignals.js";

// ─── Health server ──────────────────────────────────────────────────────
// Container MUST NOT exit on Akash. /health lets the provider probe liveness.
function startHealthServer(port = 8080): void {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
    } else if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        service: "robinhood-chain-trader",
        chain: 4663,
        status: "running",
        endpoints: ["/health", "/signals", "/balance"],
      }));
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

// ─── Trading loop ──────────────────────────────────────────────────────
// Calls scanWatchlistSignals on interval. Logs results. Never exits.
async function runTradingLoop(): Promise<void> {
  const intervalMs = parseInt(process.env.SCAN_INTERVAL_MS ?? "60000", 10);
  console.log(`[trader] Starting signal scan loop (interval: ${intervalMs}ms)`);
  console.log("[trader] Monitoring Robinhood Chain (ID 4663)");
  console.log("[trader] Watchlist: CASHCAT, JUGGERNAUT, ROBINHOOD, VLAD, REPE");

  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const signals = await scanWatchlistSignals();
      const buyCandidates = signals.filter((s) => s.action === "BUY_CANDIDATE");
      const avoid = signals.filter((s) => s.action === "AVOID");
      console.log(
        `[trader] Scan #${attempt}: ${signals.length} tokens, ${buyCandidates.length} buy candidates, ${avoid.length} avoid`,
      );
      for (const s of signals) {
        console.log(
          `  ${s.name} (${s.priority}): $${s.priceUsd ?? "?"} safety=${s.safetyScore ?? "?"} action=${s.action}`,
        );
      }
    } catch (err) {
      console.error(`[trader] Scan #${attempt} failed (non-fatal):`, err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ─── Keep-alive ────────────────────────────────────────────────────────
function keepAlive(): void {
  setInterval(() => {}, 60_000);
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  process.on("uncaughtException", (err) => {
    console.error("[fatal] uncaughtException (non-exiting):", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[fatal] unhandledRejection (non-exiting):", reason);
  });

  startHealthServer(8080);

  runTradingLoop().catch((err) => {
    console.error("[fatal] trading loop escaped (non-exiting):", err);
  });

  keepAlive();
}

main();
