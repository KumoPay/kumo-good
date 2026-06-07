import { parseAbi } from "viem"

// Minimal ABI for an EIP-2612 ERC-20 (the G$ SuperToken implements all of these).
export const erc2612Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
])

// Celo FeeCurrencyDirectory — used to confirm a chosen feeCurrency is allowlisted.
export const feeCurrencyDirectoryAbi = parseAbi([
  "function getCurrencies() view returns (address[])",
  "function getExchangeRate(address token) view returns (uint256 numerator, uint256 denominator)",
])

// GoodDollar UBI — classic UBIScheme (claim is msg.sender-only) + the
// GoodCollective UBIPool variant (claimFor lets an operator claim for a user).
export const ubiSchemeAbi = parseAbi([
  "function checkEntitlement(address member) view returns (uint256)",
  "function currentDay() view returns (uint256)",
  "function claim() returns (bool)",
  "function claimFor(address account) returns (bool)",
])
