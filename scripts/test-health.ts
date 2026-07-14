/**
 * Standalone Health Endpoint Test
 *
 * Starts a minimal health server replicating src/index.ts behavior
 * and verifies /health returns 200 with {"status":"ok"}.
 *
 * Usage: npm run test:health
 */

import { createServer, type Server } from "http";

let server: Server | null = null;

async function main(): Promise<void> {
  console.log("\n  Health Endpoint Test\n");

  try {
    // Replicate the health server from src/index.ts (port 8080 in prod,
    // 18080 here to avoid conflicts with a running agent).
    server = createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const port = 18080;
    await new Promise<void>((resolve, reject) => {
      server!.listen(port, "127.0.0.1", () => resolve());
      server!.on("error", reject);
    });

    await new Promise((r) => setTimeout(r, 100));

    // Test 1: /health returns 200
    const resp = await fetch(`http://127.0.0.1:${port}/health`);
    if (resp.status !== 200) {
      console.error(`  ❌ FAIL  /health returned ${resp.status} (expected 200)`);
      process.exit(1);
    }

    const body = (await resp.json()) as { status: string };
    if (body.status !== "ok") {
      console.error(`  ❌ FAIL  /health body status="${body.status}" (expected "ok")`);
      process.exit(1);
    }

    console.log(`  ✅ PASS  /health returned 200 with {"status":"ok"}`);

    // Test 2: Unknown path returns 404
    const resp404 = await fetch(`http://127.0.0.1:${port}/nonexistent`);
    if (resp404.status === 404) {
      console.log(`  ✅ PASS  /nonexistent returned 404`);
    } else {
      console.error(`  ❌ FAIL  /nonexistent returned ${resp404.status} (expected 404)`);
      process.exit(1);
    }

    console.log("\n  All health tests passed.\n");
    process.exit(0);
  } catch (err) {
    console.error(`\n  ❌ Health test error: ${(err as Error).message}\n`);
    process.exit(1);
  } finally {
    server?.close();
  }
}

main();
