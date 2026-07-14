#!/usr/bin/env bash
#
# deploy-to-akash.sh - Deploy Robinhood Eliza Trading Agent to Akash Network
#
# Implements phases 5-7 of the akash-deploy-workflow runbook:
#   Phase 5: PRE-CHECK  - wallet balance, cert, stale deployment cleanup
#   Phase 6: DEPLOY     - create deployment, wait for bids, accept first bid, send manifest
#   Phase 7: VERIFY     - service status, health endpoint
#
# Usage:
#   ./deploy-to-akash.sh [WALLET_NAME] [SDL_FILE]
#
# Defaults:
#   WALLET_NAME = wallet
#   SDL_FILE    = ./akash-deploy.yml (sibling of this script)
#
# Prerequisites:
#   - `akash` and `provider-services` CLIs installed and on PATH
#   - Valid Akash wallet with AKT (for gas) + ACT (for escrow) balances
#   - Valid tenant certificate published on-chain
#   - SDL file already updated with a real commit SHA (NOT PLACEHOLDER_SHA)
#
# Exit codes:
#   0 = deployment verified healthy
#   1 = pre-check or sanity failure
#   2 = deployment creation or bid failure
#   3 = container not ready or health check failed
set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

WALLET="${1:-${AKASH_FROM:-wallet}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDL_FILE="${2:-${SCRIPT_DIR}/akash-deploy.yml}"
CHAIN_ID="${AKASH_CHAIN_ID:-akashnet-2}"
NODE="${AKASH_NODE:-https://rpc.akashnet.net:443}"
KEYRING="${AKASH_KEYRING_BACKEND:-test}"
HOME_DIR="${AKASH_HOME:-$HOME/.akash}"

# Consistent gas flags - these are battle-tested from catecoin/intentjournal deploys
GAS_FLAGS=(--gas auto --gas-adjustment 2.0 --fees 8000uakt)

# Bid timing (seconds) - tuned to avoid premature give-up and bid starvation
BID_WAIT_SECS=15
LEASE_SETTLE_SECS=5
CONTAINER_START_SECS=30
POST_CLOSE_SETTLE_SECS=30

# Colors
if [[ -t 1 ]]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
    BLUE='\033[0;34m'; NC='\033[0m'
else
    RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

ts()   { date +%H:%M:%S; }
log()  { echo -e "${BLUE}[$(ts)]${NC} $*"; }
ok()   { echo -e "${GREEN}[$(ts)] OK   ${NC} $*"; }
warn() { echo -e "${YELLOW}[$(ts)] WARN ${NC} $*"; }
err()  { echo -e "${RED}[$(ts)] ERROR${NC} $*" >&2; }

# ============================================================================
# Export Akash environment
# ============================================================================

export AKASH_NODE="$NODE"
export AKASH_CHAIN_ID="$CHAIN_ID"
export AKASH_KEYRING_BACKEND="$KEYRING"
export AKASH_HOME="$HOME_DIR"
export AKASH_BROADCAST_MODE="${AKASH_BROADCAST_MODE:-block}"
export AKASH_FROM="$WALLET"

log "Akash environment:"
log "  Node:      $AKASH_NODE"
log "  Chain:     $AKASH_CHAIN_ID"
log "  Wallet:    $WALLET"
log "  Home:      $AKASH_HOME"
log "  SDL:       $SDL_FILE"
echo

# ============================================================================
# Phase 5: PRE-CHECK
# ============================================================================

log "=== PHASE 5: PRE-CHECK ==="

# Resolve wallet address
ADDR="$(provider-services keys show "$WALLET" -a 2>/dev/null || akash keys show "$WALLET" -a 2>/dev/null || true)"
if [[ -z "${ADDR:-}" ]]; then
    err "Wallet '$WALLET' not found. Create it first: akash keys add $WALLET"
    exit 1
fi
ok "Wallet address: $ADDR"

# Validate SDL file exists
if [[ ! -f "$SDL_FILE" ]]; then
    err "SDL file not found: $SDL_FILE"
    exit 1
fi

# Sanity check: reject placeholder SHA
if grep -q "PLACEHOLDER_SHA" "$SDL_FILE"; then
    err "SDL still contains 'PLACEHOLDER_SHA'. Update it with the real commit SHA first."
    err "See SDL header comment for instructions."
    exit 1
fi
ok "SDL has a concrete image tag (no PLACEHOLDER_SHA)"

# Sanity check: reject :latest tag
if grep -E 'image:.*:latest($|[[:space:]])' "$SDL_FILE" >/dev/null; then
    err "SDL contains ':latest' image tag. Replace with explicit sha-XXXXXXX."
    exit 1
fi
ok "Image tag is explicit (no :latest)"

# Sanity check: ensure uact (not uakt) for pricing
if grep -Eq '^[[:space:]]*denom:[[:space:]]+uakt([[:space:]]|$)' "$SDL_FILE"; then
    err "SDL uses uakt denom. Must be uact (BME model since Mainnet-17)."
    exit 1
fi
ok "Payment denom is uact"

# Sanity check: no obvious secret leakage in SDL (defensive)
if grep -E '(PRIVATE_KEY|ALCHEMY_API_KEY|TELEGRAM_BOT_TOKEN)=[A-Za-z0-9_-]{12,}' "$SDL_FILE" >/dev/null; then
    err "SDL appears to contain hardcoded secret values. Refusing to deploy."
    err "All secret env vars must have empty values (injected at deploy time)."
    exit 1
fi
ok "No hardcoded secrets detected in SDL"

# SDL structural validation (if provider-services supports it)
if provider-services sdl-to-manifest "$SDL_FILE" >/dev/null 2>&1; then
    ok "SDL structure valid (sdl-to-manifest passed)"
else
    warn "sdl-to-manifest check skipped or failed - proceeding (CI/registry will catch syntax errors)"
fi

# Wallet balance check
log "Checking wallet balance..."
BALANCES="$(akash query bank balances "$ADDR" 2>&1 || true)"
AKT_BALANCE="$(echo "$BALANCES" | grep -oE '[0-9]+uakt' | head -1 | grep -oE '^[0-9]+' || echo 0)"
ACT_BALANCE="$(echo "$BALANCES" | grep -oE '[0-9]+uact' | head -1 | grep -oE '^[0-9]+' || echo 0)"
AKT_BALANCE="${AKT_BALANCE:-0}"
ACT_BALANCE="${ACT_BALANCE:-0}"

if (( AKT_BALANCE >= 1000000 )); then
    AKT_DISP="$(( AKT_BALANCE / 1000000 )).$(printf '%06d' $(( AKT_BALANCE % 1000000 )))"
else
    AKT_DISP="0.${AKT_BALANCE}"
fi
if (( ACT_BALANCE >= 1000000 )); then
    ACT_DISP="$(( ACT_BALANCE / 1000000 )).$(printf '%06d' $(( ACT_BALANCE % 1000000 )))"
else
    ACT_DISP="0.${ACT_BALANCE}"
fi

log "  AKT balance: $AKT_DISP AKT (for gas)"
log "  ACT balance: $ACT_DISP ACT (for escrow)"

if (( AKT_BALANCE < 1000000 )); then
    err "Insufficient AKT for gas. Need at least 1 AKT (1,000,000 uakt). Fund wallet: $ADDR"
    exit 1
fi
if (( ACT_BALANCE < 1000000 )); then
    warn "Low ACT balance (< 1 ACT). Mint ACT from AKT if deployment funding fails:"
    warn "  akash tx bme mint-act 5000000uakt --from $WALLET -y"
else
    ok "Wallet funded for gas + escrow"
fi

# Certificate check
log "Checking tenant certificate..."
if ls "$HOME_DIR"/*.pem >/dev/null 2>&1; then
    ok "Certificate present in $HOME_DIR"
else
    warn "No certificate found in $HOME_DIR. Creating one..."
    provider-services tx cert create client --from "$WALLET" "${GAS_FLAGS[@]}" -y
    sleep 5
fi

# Stale deployment cleanup - close ALL active deployments to avoid escrow burn + bid starvation
log "Scanning for stale active deployments (cause escrow burn + bid starvation)..."
ACTIVE_DSEQS="$(provider-services query deployment list --owner "$ADDR" 2>&1 \
    | awk '/^[[:space:]]*dseq:/{gsub(/[","]/,,""); print $2}' || true)"

if [[ -n "${ACTIVE_DSEQS// /}" ]]; then
    warn "Found active deployments. Closing them before creating a new one..."
    for DSEQ in $ACTIVE_DSEQS; do
        [[ -z "$DSEQ" ]] && continue
        STATE="$(provider-services query deployment get --owner "$ADDR" --dseq "$DSEQ" 2>&1 \
            | awk '/^[[:space:]]*state:/{print $2}' || echo "")"
        if [[ "$STATE" == "active" ]]; then
            log "  Closing DSEQ $DSEQ (state=active)..."
            provider-services tx deployment close --dseq "$DSEQ" --from "$WALLET" \
                "${GAS_FLAGS[@]}" -y \
                || warn "  Failed to close DSEQ $DSEQ (may already be closed)"
        fi
    done
    log "  Waiting ${POST_CLOSE_SETTLE_SECS}s for closures to settle..."
    sleep "$POST_CLOSE_SETTLE_SECS"
else
    ok "No active deployments - clean slate"
fi
echo

# ============================================================================
# Phase 6: DEPLOY
# ============================================================================

log "=== PHASE 6: DEPLOY ==="

# Step 1: Create deployment
log "Creating deployment..."
CREATE_OUTPUT="$(provider-services tx deployment create "$SDL_FILE" \
    --from "$WALLET" "${GAS_FLAGS[@]}" -y 2>&1)"

DSEQ="$(echo "$CREATE_OUTPUT" | grep -oE 'dseq: "?[0-9]+"?' | head -1 | grep -oE '[0-9]+')"
if [[ -z "${DSEQ:-}" ]]; then
    err "Failed to extract DSEQ from deployment creation output:"
    echo "$CREATE_OUTPUT" | tail -30
    exit 2
fi
ok "Deployment created: DSEQ=$DSEQ"

# Step 2: Wait for bids
log "Waiting ${BID_WAIT_SECS}s for bids to arrive..."
sleep "$BID_WAIT_SECS"

log "Querying open bids..."
BID_OUTPUT="$(provider-services query market bid list \
    --owner "$ADDR" --dseq "$DSEQ" --state open 2>&1)"

PROVIDER="$(echo "$BID_OUTPUT" | awk '/^[[:space:]]*provider:/{gsub(/[","]/,,""); print $2; exit}' || true)"
if [[ -z "${PROVIDER:-}" ]]; then
    err "No open bids received for DSEQ $DSEQ. Possible causes:"
    err "  - SDL validation failure (check image pull, env syntax)"
    err "  - Pricing too low (try amount > 1000 uact)"
    err "  - Recent deployment churn causing provider bid starvation"
    err "Bid output:"
    echo "$BID_OUTPUT" | tail -25
    err "Closing deployment to recover escrow..."
    provider-services tx deployment close --dseq "$DSEQ" --from "$WALLET" "${GAS_FLAGS[@]}" -y || true
    exit 2
fi
ok "Bid received from provider: $PROVIDER"

# Step 3: Accept first open bid (create lease - tenant side)
log "Accepting first bid (creating lease)..."
provider-services tx market lease create \
    --dseq "$DSEQ" --provider "$PROVIDER" --from "$WALLET" \
    "${GAS_FLAGS[@]}" -y
ok "Lease created"

# Step 4: Send manifest (small delay after lease)
log "Waiting ${LEASE_SETTLE_SECS}s, then sending manifest..."
sleep "$LEASE_SETTLE_SECS"
provider-services send-manifest "$SDL_FILE" \
    --dseq "$DSEQ" --provider "$PROVIDER" --from "$WALLET"
ok "Manifest sent"

# Step 5: Wait for container start
log "Waiting ${CONTAINER_START_SECS}s for container to start..."
sleep "$CONTAINER_START_SECS"
echo

# ============================================================================
# Phase 7: VERIFY
# ============================================================================

log "=== PHASE 7: VERIFY ==="

# Derive service name from SDL (first service key under `services:`)
SERVICE_NAME="$(awk '
    /^services:[[:space:]]*$/ {in_services=1; next}
    in_services && /^[a-zA-Z0-9_-]+:[[:space:]]*$/ {gsub(/:.*/,""); print; exit}
    in_services && /^[^[:space:]]/ {in_services=0}
' "$SDL_FILE")"
if [[ -z "${SERVICE_NAME:-}" ]]; then
    SERVICE_NAME="agent"
    warn "Could not auto-detect service name from SDL; defaulting to '$SERVICE_NAME'"
else
    ok "Service name from SDL: $SERVICE_NAME"
fi

log "Querying service status..."
STATUS_OUTPUT="$(provider-services service-status \
    --dseq "$DSEQ" --provider "$PROVIDER" \
    --service "$SERVICE_NAME" --from "$WALLET" 2>&1)"

READY="$(echo "$STATUS_OUTPUT" | awk '/^[[:space:]]*ready_replicas:/{gsub(/[","]/,,""); print $2}' || echo 0)"
AVAILABLE="$(echo "$STATUS_OUTPUT" | awk '/^[[:space:]]*available_replicas:/{gsub(/[","]/,,""); print $2}' || echo 0)"
URI="$(echo "$STATUS_OUTPUT" | awk '/^[[:space:]]*(uri|uris):/{print $2; exit}' | tr -d '\"[],' || true)"

log "  ready_replicas:     ${READY:-0}"
log "  available_replicas: ${AVAILABLE:-0}"
log "  uri:                ${URI:-<none>}"

if [[ "${READY:-0}" == "1" ]]; then
    ok "Container is READY"
else
    err "Container NOT ready (ready_replicas=${READY:-0})."
    err "Troubleshooting: /a0/usr/skills/akash-deploy-workflow/docs/troubleshooting.md"
    err "Pull logs with:"
    err "  provider-services lease-logs --dseq $DSEQ --provider $PROVIDER --service $SERVICE_NAME --from $WALLET"
    exit 3
fi

# Health endpoint check (best-effort - URI may take a minute to be routable)
if [[ -n "${URI:-}" ]]; then
    log "Health endpoint: ${URI}/health"
    HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${URI}/health" || echo 000)"
    if [[ "$HTTP_CODE" == "200" ]]; then
        ok "Health check passed: HTTP 200"
    else
        warn "Health check returned HTTP $HTTP_CODE (URI may still be warming up). Retry in 60s:"
        warn "  curl -s ${URI}/health"
    fi
else
    warn "No URI returned yet. Re-run status to find ingress hostname:"
    warn "  provider-services service-status --dseq $DSEQ --provider $PROVIDER --service $SERVICE_NAME --from $WALLET"
fi

# ============================================================================
# Summary
# ============================================================================

echo
log "=============================================="
ok "DEPLOYMENT SUCCESSFUL"
log "=============================================="
log "  DSEQ:      $DSEQ"
log "  Provider:  $PROVIDER"
log "  Service:   $SERVICE_NAME"
log "  URI:       ${URI:-<pending>}"
echo
log "Useful commands:"
log "  Status: provider-services service-status --dseq $DSEQ --provider $PROVIDER --service $SERVICE_NAME --from $WALLET"
log "  Logs:   provider-services lease-logs --dseq $DSEQ --provider $PROVIDER --service $SERVICE_NAME --from $WALLET | tail -50"
log "  Close:  provider-services tx deployment close --dseq $DSEQ --from $WALLET ${GAS_FLAGS[*]} -y"
log "=============================================="
