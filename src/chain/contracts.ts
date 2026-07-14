import { ethers } from "ethers";

export const CHAIN_ID = 4663;
export const TESTNET_CHAIN_ID = 46630;

export const CONTRACTS = {
  uniswapV2Router: "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba",
  uniswapV2Factory: "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;

export const UNISWAP_V2_ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function getAmountsIn(uint amountOut, address[] path) view returns (uint[] amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] amounts)",
  "function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] amounts)",
  "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external payable returns (uint[] amounts)",
  "function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] amounts)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function removeLiquidityETH(address token, uint liquidity, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external returns (uint amountToken, uint amountETH)",
  "function WETH() view returns (address)",
  "function factory() view returns (address)",
] as const;

export const UNISWAP_V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairsLength() view returns (uint)",
  "function allPairs(uint) view returns (address pair)",
  "function createPair(address tokenA, address tokenB) returns (address pair)",
] as const;

export const UNISWAP_V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function price0CumulativeLast() view returns (uint256)",
  "function price1CumulativeLast() view returns (uint256)",
  "function kLast() view returns (uint256)",
] as const;

export function getERC20(
  address: string,
  provider: ethers.Provider | ethers.Signer
): ethers.Contract {
  return new ethers.Contract(address, ERC20_ABI, provider);
}

export function getUniswapV2Router(
  provider: ethers.Provider | ethers.Signer
): ethers.Contract {
  return new ethers.Contract(
    CONTRACTS.uniswapV2Router,
    UNISWAP_V2_ROUTER_ABI,
    provider
  );
}

export function getUniswapV2Factory(
  address: string,
  provider: ethers.Provider | ethers.Signer
): ethers.Contract {
  return new ethers.Contract(address, UNISWAP_V2_FACTORY_ABI, provider);
}

export function getUniswapV2Pair(
  address: string,
  provider: ethers.Provider | ethers.Signer
): ethers.Contract {
  return new ethers.Contract(address, UNISWAP_V2_PAIR_ABI, provider);
}

export function getDeadline(): number {
  return Math.floor(Date.now() / 1000) + 60 * 20;
}
