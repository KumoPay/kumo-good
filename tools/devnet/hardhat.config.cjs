// Local fork of Celo mainnet so the full G$ flow runs for free against the REAL
// G$ / Identity / UBI contracts. chainId is pinned to 42220 so EIP-2612 permit
// domains match mainnet exactly.
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 42220,
      forking: { url: process.env.FORK_RPC || "https://forno.celo.org" },
      // Celo blocks are quick; mining on demand keeps the demo snappy.
      mining: { auto: true },
    },
  },
}
