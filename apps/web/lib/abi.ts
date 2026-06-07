import { parseAbi } from "viem"

// G$ (EIP-2612 SuperToken) — the bits the web app reads.
export const gTokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function nonces(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
])

// GoodDollar Identity (verified by isWhitelisted on-chain; confirmed live).
export const identityAbi = parseAbi([
  "function isWhitelisted(address account) view returns (bool)",
  "function lastAuthenticated(address account) view returns (uint256)",
])

// GoodDollar UBIScheme — daily claim.
export const ubiAbi = parseAbi([
  "function checkEntitlement(address member) view returns (uint256)",
  "function currentDay() view returns (uint256)",
  "function claim() returns (bool)",
])
