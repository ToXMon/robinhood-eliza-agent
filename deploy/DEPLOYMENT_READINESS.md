# Deployment Readiness Checklist

## ✅ Code Complete
- [x] ElizaOS scaffold with plugin-evm (package.json, tsconfig, src/)
- [x] Trading character (characters/trader.character.json)
- [x] ethers.js price/quote/swap actions (src/actions/*)
- [x] Risk manager with memecoin guide rules (src/strategies/riskManager.ts)
- [x] Signal processor integrating catecoin-scanner pattern (src/strategies/signalProcessor.ts)
- [x] Dockerfile multi-stage, node:20-slim, zero secrets
- [x] .dockerignore (excludes node_modules, .env, .git, state/, logs/, *.md)
- [x] Bulletproof keep-alive src/index.ts (health :8080, no process.exit, no __dirname)
- [x] 4 ESM __dirname bugs fixed (index.ts, getWalletBalance, scanSignals, signalProcessor)
- [x] Akash SDL (deploy/akash-deploy.yml): version 2.0, uact pricing, port 8080→80, 0.5 CPU/512Mi
- [x] GitHub Actions CI/CD (.github/workflows/docker-publish.yml): push to main → GHCR
- [x] TypeScript typecheck: PASS
- [x] Secret scan: zero secrets in Dockerfile + .dockerignore + SDL

## 🔲 External Prerequisites (User Action Required)

### Blocker 1 — CI Run (for GHCR image)
- [ ] Push robinhood-eliza-agent to github.com/ToXMon/robinhood-eliza-agent
- [ ] Wait for GitHub Actions workflow `Build and Push to GHCR` to complete
- [ ] Verify image public at `https://github.com/ToXMon/robinhood-eliza-agent/pkgs/container/robinhood-eliza-agent`
- [ ] Retrieve the `sha-XXXXXXX` tag (7-char commit prefix)
- [ ] Update `deploy/akash-deploy.yml` replacing `sha-PLACEHOLDER_SHA` with actual tag

### Blocker 2 — Akash Wallet Funding
- [ ] Fund Akash wallet with `AKT` for gas (5+ AKT recommended)
- [ ] Mint `ACT` via BME: `akash tx bme mint-act 5000000uakt --from wallet -y` (need 1+ ACT = 1,000,000 uact)
- [ ] Create client certificate: `provider-services tx cert create client --from wallet`

### Blocker 3 — Testnet Swap Test (item 9)
- [ ] Fund wallet with testnet ETH on Robinhood Chain testnet (chain ID 46630)
- [ ] Set `CHAIN_ID=46630`, `RPC_URL=<testnet RPC>`, `PRIVATE_KEY=<testnet private key>` in .env
- [ ] Run locally: `npm run dev` then trigger EXECUTE_SWAP action
- [ ] Verify tx on `https://robinhoodchain-testnet.blockscout.com`

### Blocker 4 — Akash Deploy (item 10)
- [ ] Validate SDL: `provider-services sdl-to-manifest deploy/akash-deploy.yml`
- [ ] Create deployment: `provider-services tx deployment create deploy/akash-deploy.yml --from wallet ...`
- [ ] Accept bid, send manifest, wait 30s
- [ ] Verify: `provider-services service-status --dseq $DSEQ --provider $PROVIDER --service agent --from wallet`
  - Expected: `ready_replicas: 1, available_replicas: 1`
- [ ] Curl health: `curl -s http://URI.ingress.../health` → `{"status":"ok"}`

## Secrets Required at Deploy Time (NOT in files)
These env vars must be injected via Akash Console UI or provider-services at deploy time:

| Env Var | Purpose | Source |
|---------|---------|--------|
| `ALCHEMY_API_KEY` | RPC + indexed data | https://alchemy.com (free tier) |
| `PRIVATE_KEY` | Wallet signer (testnet/mainnet) | Your wallet |
| `TELEGRAM_BOT_TOKEN` | Alerts (optional) | @BotFather |
| `TELEGRAM_CHAT_ID` | Alert target (optional) | GetUpdates API |
