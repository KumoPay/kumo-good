# services/relayer

Node service that settles offline-signed G$ payments. Accepts an EIP-2612 permit
+ transfer request, applies the permit (granting itself an allowance) and runs
`transferFrom(owner → recipient)` on G$ — paying gas in **cUSD** via Celo fee
abstraction, so the user never needs CELO.

## Run

```bash
cp .env.example .env        # edit as needed; no RELAYER_PK ⇒ dry-run mode
pnpm --filter relayer dev   # http://localhost:8787
```

- **Dry-run** (no `RELAYER_PK`): validates requests and *simulates* against the
  live chain but never submits — safe for local dev.
- **Live**: set a funded `RELAYER_PK`. The relayer EOA pays gas in `FEE_CURRENCY`
  (cUSD on mainnet, native CELO on a fork).

## Endpoints

| Route | Purpose |
|---|---|
| `GET /health` | liveness + config + the `relayerAddress` clients must use as the permit `spender` |
| `POST /relay` | settle a `RelayPermitTransfer` (see `@kumo-good/shared`) |
| `POST /claim` | gasless UBI claim for a user — tries `claimFor` (UBIPool), else **gas-grants** the user so the browser self-claims (`selfClaim: true`). Reads real `checkEntitlement` first. |

## Scripts

| Command | What it does |
|---|---|
| `pnpm --filter relayer validate` | **Milestone-1 gate** — proves the live G$ SuperToken accepts a viem-signed EIP-2612 permit (read-only, no funds). |
| `pnpm --filter relayer e2e` | signs a permit with a fresh key and POSTs to a running relayer (expects "insufficient G$", proving the full HTTP→chain path). |
| `pnpm --filter relayer test` | unit tests (validation + dry-run state machine). |

## Why two sequential txs (not one atomic)

The permit's `spender` is the relayer itself, so only the relayer can spend the
granted allowance — there is no front-running window between `permit()` and
`transferFrom()`. On retry the relayer skips `permit()` if the allowance already
covers the value. (A Multicall3-based single-tx variant is a possible future
enhancement.)
