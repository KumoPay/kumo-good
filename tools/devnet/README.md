# tools/devnet

A local **Celo-mainnet fork** (Hardhat) so the full G$ flow runs for free against
the *real* G$ / Identity / UBI contracts — no real money, no mock contracts.

```bash
pnpm --filter devnet fork      # forks https://forno.celo.org at :8545, chainId 42220
pnpm --filter devnet verify    # full proof: fund owner with real G$ → sign permit offline → relayer settles
```

`verify-fork.ts` funds a demo owner by impersonating the UBIScheme whale (~92M G$),
has the owner sign an EIP-2612 permit offline, then has a relayer submit
`permit()` + `transferFrom()` and asserts the recipient actually received the G$.

chainId is pinned to **42220** so the EIP-2612 permit domain matches mainnet exactly.
Gas is paid in native (fork) CELO via `hardhat_setBalance`.
