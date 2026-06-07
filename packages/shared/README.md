# @kumo-good/shared

Chain-agnostic core for kumo-good — **zod is the only dependency**, so it stays
portable across the web app and the relayer. Ported from Kumo's `packages/shared`
and retargeted from USDC/Solana to **G$ on Celo**.

| Module | Exports |
|---|---|
| `payment-intent.ts` | `PaymentIntentSchema` (recipient, amount, memo, optional stream `period`), `isStreamIntent`. The `private` flag from the Solana original is intentionally dropped (no privacy layer for G$). |
| `prompt.ts` | `SYSTEM_PROMPT_INTENT_PARSER` + few-shot examples + `PAYMENT_INTENT_JSON_SCHEMA` (for on-device grammar-constrained sampling). |
| `regex-parser.ts` | `parseIntentRegex` (single send) + `parseCommand` — multi-verb planner (`claim`/`send`/`balance`) for the voice agent + claim-and-send. |
| `permit.ts` | `buildPermitTypedData` (EIP-712 for G$ EIP-2612), `permitDeadline`, `RelayPermitTransferSchema`/`RelayResultSchema` (relayer wire format). |
| `claim.ts` | `RelayClaimSchema`/`RelayClaimResultSchema` — the gasless UBI-claim wire format. |
| `payment-request.ts` | `buildPaymentRequest`/`parsePaymentRequest` — QR/deep-link payment requests (Pay-by-QR + request-money). |
| `constants.ts` | All Celo/GoodDollar addresses + chain config; `G_DECIMALS = 18` (the docs say 2 — they're wrong); `gdConfig(env)`. |
| `units.ts` | `toBaseUnits`/`fromBaseUnits`/`formatUnits` (18-dec safe). |
| `streaming.ts` | `flowRatePerSecond` + `CFA_FORWARDER_ABI` for Superfluid G$ streams. |
| `queue.ts` | `QueuedItemSchema` — discriminated union (`payment` \| `claim`) + status state machine + `isExpired`/`expiresInLabel`/`itemLabel`. |
| `hash.ts`, `intent-payload.ts` | canonical intent hash; QR/transport payload carrying the signed permit. |

```bash
pnpm --filter @kumo-good/shared test       # 17 tests
pnpm --filter @kumo-good/shared typecheck
```
