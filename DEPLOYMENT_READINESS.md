# Deployment Readiness — Robinhood Eliza Trading Agent

> **Repo:** `github.com/ToXMon/robinhood-eliza-agent`  
> **Chain:** Robinhood Chain (Arbitrum Orbit L2, mainnet ID 4663, testnet ID 46630)  
> **Runtime:** Node 20, ElizaOS 1.7.2, ethers v6

---

## Section 1: Pre-Deployment Checklist

Run every item locally before pushing to GitHub.

- [ ] **Code typechecks:**
  ```bash
  npm run typecheck
  # Expected: exit 0, no errors
  ```

- [ ] **Docker builds locally:**
  ```bash
  docker build -t test .
  docker run -p 8080:8080 test
  curl -s http://localhost:8080/health
  # Expected: {"status":"ok","ts":...}
  ```

- [ ] **No secrets in codebase:**
  ```bash
  grep -r 'PRIVATE_KEY=' --include='*.ts' --include='*.json' --include='*.yml' . \
    | grep -v '.env.example' \
    | grep -v 'process.env' \
    | grep -v '$'
  # Expected: no output (no hardcoded secret values)
  ```

- [ ] **.env.example has all required vars documented:**
  ```bash
  cat .env.example
  # Must contain: CHAIN_ID, ALCHEMY_API_KEY, PRIVATE_KEY, SCAN_INTERVAL_MS,
  # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RPC_URL (commented)
  ```

- [ ] **.gitignore includes .env, node_modules, dist:**
  ```bash
  grep -E '^\.env$|^node_modules/|^dist/' .gitignore
  # Expected: all three lines present
  ```

---

## Section 2: GitHub Repository Setup

1. **Create repo:**
   ```bash
   gh repo create ToXMon/robinhood-eliza-agent --public --source=. --push
   ```
   Or create via GitHub UI at `github.com/new` with name `robinhood-eliza-agent`.

2. **Push code:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:ToXMon/robinhood-eliza-agent.git
   git push -u origin main
   ```

3. **Wait for GitHub Actions CI to complete:**
   - Workflow: `.github/workflows/docker-publish.yml`
   - Builds Docker image and pushes to GitHub Container Registry (GHCR)
   - Monitor at: `github.com/ToXMon/robinhood-eliza-agent/actions`
   - CI must show green checkmark (success)

4. **Make GHCR package PUBLIC:**
   - Navigate to: GitHub → Profile → Packages → `robinhood-eliza-agent`
   - Package settings → Change visibility → **Public**
   - Akash providers cannot pull private images

5. **Get image tag (7-char commit SHA):**
   ```bash
   gh api repos/ToXMon/robinhood-eliza-agent/actions/runs \
     --jq '.workflow_runs[] | select(.conclusion=="success") | .head_sha[:7]' \
     | head -1
   ```
   Example output: `a1b2c3d`
   - Full image tag: `ghcr.io/toxmon/robinhood-eliza-agent:sha-a1b2c3d`

---

## Section 3: Akash Wallet Preparation

Using the known working configuration from previous deployments (catecoin-scanner, intentjournal).

| Setting | Value |
|---------|-------|
| Key name | `wallet` (**NOT** `tolu`) |
| Keyring backend | `test` |
| Broadcast mode | `block` |
| Wallet address | `akash1jw93z5t6veshx3w4hs2mkl8004qh57cm855jp0` |
| Balance needed | 5+ AKT (gas), 1+ ACT (1,000,000 uact for escrow) |

### Environment Setup
```bash
export AKASH_NODE=https://rpc.akashnet.net:443
export AKASH_CHAIN_ID=akashnet-2
export AKASH_KEYRING_BACKEND=test
export AKASH_BROADCAST_MODE=block
export AKASH_HOME=/root/.akash
export AKASH_FROM=wallet
```

### Check Wallet Balance
```bash
akash query bank balances akash1jw93z5t6veshx3w4hs2mkl8004qh57cm855jp0
```
- Need: 5+ AKT for gas fees, 1+ ACT (1,000,000 uact) for deployment escrow

### Mint ACT if Needed
```bash
akash tx bme mint-act 5000000uakt --from wallet -y
```
- Converts 5 AKT to 5 ACT (BME burn-mint equilibrium, epoch-based ~1 min)

### Check Certificate
```bash
ls /root/.akash/*.pem
```
- If missing, create one:
  ```bash
  provider-services tx cert create client --from wallet
  ```

---

## Section 4: Akash Deployment

1. **Update SDL image tag:**
   - Open `deploy/akash-deploy.yml`
   - Replace `PLACEHOLDER_SHA` with the actual 7-char commit SHA from Section 2
   - Example: `image: ghcr.io/toxmon/robinhood-eliza-agent:sha-a1b2c3d`
   - **CRITICAL:** Never use `:latest` or unpinned tags

2. **Deploy:**
   ```bash
   cd /a0/usr/workdir/robinhood-eliza-agent
   bash deploy/deploy-to-akash.sh
   ```
   The deploy script handles:
   - Wallet balance check
   - Stale deployment cleanup (closes all active deployments first)
   - SDL validation (rejects `PLACEHOLDER_SHA`, `:latest`, `uakt` denom)
   - Deployment creation
   - Bid acceptance (accepts first bid immediately)
   - Manifest send
   - Health verification

3. **CRITICAL: Accept FIRST bid immediately**
   - Do NOT wait for competing bids
   - Do NOT rapid-cycle deployments
   - 12+ create/close cycles cause bid starvation (providers stop bidding on your address)
   - If bids are starved: wait 2+ hours, then make ONE clean deployment

4. **Gas flags (battle-tested):**
   ```bash
   --gas auto --gas-adjustment 2.0 --fees 8000uakt
   ```
   These are embedded in the deploy script. Do not modify without testing.

---

## Section 5: Post-Deployment Verification

After the deploy script completes, verify manually:

### Service Status
```bash
provider-services service-status \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --service agent \
  --from wallet
```
**Expected:** `ready_replicas: 1, available_replicas: 1`

### Health Check
```bash
curl -s http://<URI>/health
```
**Expected:** `{"status":"ok","ts":...}`

- Replace `<URI>` with the ingress URL from service-status output
- Format: `http://XXXXX.ingress.<provider-domain>`

### Lease Logs
```bash
provider-services lease-logs \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --service agent \
  --from wallet | tail -20
```
**Expected:** Logs showing:
- `[health] listening on :8080`
- `[RobinhoodChainTrader] Starting agent...`
- `[RobinhoodChainTrader] Monitoring Robinhood Chain (ID 4663)`

---

## Section 6: Troubleshooting

### 0 Bids (No Providers Bidding)
**Cause:** Bid starvation from rapid-cycle deployments (12+ create/close cycles).  
**Fix:**
1. Wait 2+ hours for bid cooldown
2. Close all active deployments:
   ```bash
   provider-services tx deployment close --dseq <DSEQ> --from wallet --gas auto --gas-adjustment 2.0 --fees 8000uakt -y
   ```
3. Make ONE clean deployment (accept first bid immediately)
4. Do NOT rapid-cycle

### ImagePullBackOff
**Cause:** GHCR package not public, or provider has GHCR connectivity issues.  
**Fix:**
1. Verify package is public:
   ```bash
   TOKEN=$(curl -s 'https://ghcr.io/token?scope=repository:toxmon/robinhood-eliza-agent:pull' | jq -r .token)
   curl -s -o /dev/null -w '%{http_code}\n' \
     "https://ghcr.io/v2/toxmon/robinhood-eliza-agent/manifests/sha-<SHA>" \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Accept: application/vnd.oci.image.manifest.v1+json'
   # Expected: 200
   ```
2. If public but still failing: use Frankfurt/EWSP providers (better GHCR connectivity)
3. Avoid Vietnam provider `akash1sjwuwre4qprcaa34f6324yz7m8nn0awvc75gp5` (known GHCR issues)

### ready_replicas=0 (Container Exiting)
**Cause:** Container is crashing or exiting.  
**Fix:**
1. Check lease logs:
   ```bash
   provider-services lease-logs --dseq $DSEQ --provider $PROVIDER --service agent --from wallet
   ```
2. Common causes:
   - Health server not starting (verify `src/index.ts` keep-alive works)
   - Missing environment variables (all secrets must be injected)
   - Character file not found (verify `characters/trader.character.json` exists in image)
3. Test locally first:
   ```bash
   docker build -t test . && docker run -p 8080:8080 test
   curl http://localhost:8080/health
   ```

### GHCR Login Timeout in CI
**Cause:** Transient network timeout during `docker login` step in GitHub Actions.  
**Fix:**
1. Push an empty commit to re-trigger CI:
   ```bash
   git commit --allow-empty -m "ci: re-trigger - GHCR login timeout was transient"
   git push
   ```
2. Wait for new CI run to complete
3. Update SDL with new commit SHA if the SHA changed

---

## Secrets Required at Deploy Time

These env vars must be injected via Akash Console UI or the SDL `env` section (with empty values — real values injected at deploy time):

| Env Var | Purpose | Source |
|---------|---------|--------|
| `ALCHEMY_API_KEY` | RPC + indexed data | https://alchemy.com (free tier) |
| `PRIVATE_KEY` | Wallet signer (mainnet) | Your wallet |
| `TELEGRAM_BOT_TOKEN` | Alerts (optional) | @BotFather |
| `TELEGRAM_CHAT_ID` | Alert target (optional) | GetUpdates API |

**Never commit secrets to the repository.** The SDL uses empty values; inject real values during deployment.
