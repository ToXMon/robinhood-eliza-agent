# Robinhood Chain Trading Agent (ElizaOS)

Autonomous trading agent for Robinhood Chain memecoins built on ElizaOS with ethers.js for chain interaction.

## Setup

1. Copy `.env.example` to `.env` and fill in your values
2. `npm install`
3. `npm run build`
4. `npm start`

## Architecture

- **Chain Layer**: ethers.js provider, wallet, and contract ABIs for Robinhood Chain (chain ID 4663)
- **Actions**: ElizaOS actions for price queries, swap quotes, swaps, safety checks, signal scanning
- **Strategies**: Risk management rules from memecoin trading guide, signal processing
- **Plugin**: Custom ElizaOS plugin wrapping all Robinhood Chain actions

## Safety Rules

- Max position size: 5% of portfolio
- Stop loss: 40%
- Min safety score: 40
- Min liquidity: $5,000
- Max top 10 holders: 50%

## Token Watchlist

CASHCAT, JUGGERNAUT, ROBINHOOD, VLAD, REPE

## Chain Details

- Type: Arbitrum Orbit L2
- Chain ID: 4663 (mainnet) / 46630 (testnet)
- Gas token: ETH
- Explorer: https://robinhoodchain.blockscout.com
- DEX: Uniswap V2
