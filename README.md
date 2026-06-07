# kumo-good

**An offline-first, voice-driven G$ (GoodDollar) wallet that runs entirely in your browser.**
Speak a payment with no signal, sign it locally, and it settles itself the moment you're back online — gas paid in cUSD, so users never need to hold CELO.

> GoodBuilders hackathon entry on **Celo**. Reuses the portable IP from [Kumo](../kumo-app) (the natural-language intent parser, the offline queue/retry state machine, the connectivity-aware UX), rebuilt for **G$** with EIP-2612 permits + a gasless relayer. It's a **PWA** — installable on a phone, no APK.

---

## Why this matters

GoodDollar mints daily G$ UBI to verified humans in emerging markets — but claiming and spending it assumes a live connection. kumo-good removes that assumption: say a payment in your own words with **no signal**, your phone signs an EIP-2612 permit locally (the key never leaves the browser), it's queued on-device, and a relayer settles it on reconnect — **paying gas in cUSD** so the user only ever holds G$.

## The hero flow

1. **Say it** — voice (Web Speech API) or text → an on-device parser turns *"send 5 to 0x…1234 for lunch"* into a structured intent. No network needed.
2. **Sign it offline** — the app builds an EIP-2612 `permit(owner, spender=relayer, value, deadline)` and signs it with viem. Works in airplane mode.
3. **It queues** — stored in the browser with an *"expires in 14 days"* countdown.
4. **It settles itself** — on reconnect the relayer submits `permit()` + `transferFrom()`, paying gas in **cUSD**. The recipient's G$ balance updates; you get a Celoscan link.

## What's built — and proven

| Status | Proof |
|---|---|
| ✅ EIP-2612 permit works on the **live** G$ SuperToken | `pnpm relayer:validate` — read-only against Celo mainnet: confirms `decimals()==18`, the on-chain `DOMAIN_SEPARATOR` matches our EIP-712 domain, and a viem-signed permit simulates successfully. |
| ✅ Full **permit → transferFrom** moving real G$ | `pnpm fork` then `pnpm verify:fork` — on a local Celo-mainnet fork: funds an owner with real G$ (impersonating the 92M-G$ UBIScheme whale), signs a permit **offline**, relayer settles, asserts the recipient received the G$. |
| ✅ Relayer service | dry-run + live modes, allowance-aware, balance-checked, gas in cUSD/native; 8 unit tests + live HTTP integration. |
| ✅ Mobile-web PWA | builds, typechecks; in-browser wallet, voice, offline queue, permit signing, settle-on-reconnect, plus **live GoodDollar reads** (Identity whitelist, daily UBI entitlement). |

```
pnpm -r typecheck   # all packages clean
pnpm -r test        # shared: 17 ✓   relayer: 8 ✓
```

## Features

Beyond the hero send, kumo-good implements the full strong-tier feature set:

| Feature | What it does |
|---|---|
| **Offline auto-claim UBI** | Say *"claim my UBI"* (even offline) → queues → settles **gaslessly** on reconnect. |
| **Voice multi-action agent** | *"claim my UBI and send 5 to mom"* → an ordered plan (claim → send) run in sequence. |
| **Claim-and-send combo** | One utterance becomes two queued settlements, run in nonce order. |
| **Gasless claim** | Relayer claims via `claimFor` where available, else gas-grants the user (Faucet `canTop` → `true`). |
| **Pay-by-QR (offline)** | Scan a merchant QR (native `BarcodeDetector`) → sign offline → settle on reconnect. |
| **Request-money links** | Generate a QR/link to be paid; the payer signs offline. |
| **In-app face verification** | `@goodsdks/citizen-sdk` `generateFVLink` → verify in-app and return whitelisted (graceful fallback). |
| **Claim streak** (gamified) | Local, offline streak counter with a one-day grace, driven by `UBIScheme.currentDay()`. |

## Architecture

| Package | Role |
|---|---|
| [`packages/shared`](packages/shared) | Chain-agnostic core (zod only): NL→intent parser + system prompt, EIP-712 permit builder, G$/Celo constants, unit math, offline-queue schema + state machine, Superfluid flow-rate helper. |
| [`services/relayer`](services/relayer) | Node service: applies the permit (granting itself an allowance) and runs `transferFrom`, paying gas in cUSD via Celo fee abstraction. Dry-run mode needs no key. |
| [`apps/web`](apps/web) | Next.js **PWA** — the product. In-browser non-custodial wallet, Web Speech voice, localStorage offline queue + service worker, viem EIP-712 signing, same-origin relayer proxy, Identity/UBI screens. |
| [`tools/devnet`](tools/devnet) | Hardhat local Celo-fork + funding so the full flow runs for free against the real contracts. |

## Quickstart

Requires Node ≥ 20 and pnpm 9. `pnpm install` once.

### A — Full free demo on a local fork (real G$, no real money) ⭐
```bash
pnpm fork                      # terminal 1 — forks Celo mainnet at :8545
pnpm verify:fork               # terminal 2 — proves offline permit → settle with real G$
```
To drive it from the browser, point the relayer + web app at the fork (`CHAIN_ID=42220`, `CELO_RPC_URL=http://127.0.0.1:8545`, `FEE_CURRENCY=native`, and a fork-funded `RELAYER_PK`), then `pnpm relayer:dev` + `pnpm web:dev`.

### B — UI dev (dry-run relayer, reads live mainnet)
```bash
pnpm relayer:dev               # terminal 1 — :8787, dry-run (no key needed)
pnpm web:dev                   # terminal 2 — open http://localhost:3000 (works on your phone over LAN)
```

### C — Real public demo on Celo mainnet
Set a funded `RELAYER_PK` (a little cUSD covers gas) in `services/relayer/.env`, set `RELAYER_URL` for the web app, deploy. Same code — only env changes.

## How offline settlement works (the technical heart)

G$ (`0x62B8…9c7A`) is a Superfluid **Pure SuperToken** that is ERC-20 + EIP-2612 compatible. That gives the offline path:

- **Offline:** intent → `permit(owner, spender=relayer, value, deadline=now+14d, nonce)` EIP-712 typed data → signed with viem (key in the browser) → queued.
- **On reconnect:** relayer submits `permit()` then `transferFrom(owner, recipient, value)` in two txs. Safe without a contract because the permit's `spender` **is** the relayer — no one else can spend the allowance, and retries skip `permit()` if the allowance already covers the value.
- **Gas:** paid in **cUSD** via Celo's CIP-64 fee abstraction (G$ itself is *not* a registered fee currency, so cUSD is used). Priced with the Celo-extended `eth_gasPrice`.

## G$ / GoodDollar integration depth

- **Payments:** EIP-2612 permit + relayer + Celo fee abstraction (gas in cUSD); offline-signed, QR-payable, requestable.
- **Identity:** live `isWhitelisted` read + **in-app face verification** via `@goodsdks/citizen-sdk` `generateFVLink` (wallet-bound, returns to the PWA).
- **UBI:** live `checkEntitlement` + **gasless, offline-queueable claim** (relayer `claimFor`/Faucet gas-grant), claim-and-send combos, and a claim streak.
- **AI agent:** on-device multi-verb parser turns one utterance into an ordered claim/send plan.
- **Streaming (roadmap):** the parser already emits recurring "per month" intents; `packages/shared` includes the Superfluid `CFAv1Forwarder.setFlowrate` flow-rate helper to open a G$ stream on reconnect.

All addresses (G$, cUSD, Identity `0xC361…2F42`, UBIScheme `0x43d7…e4A1`, EngagementRewards, CFAv1Forwarder) live in [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts).

## Tracks & judging

- **G$ Utility & Payments** (primary) · **AI Agents** (NL/voice intent parsing) · **Gamified** (UBI/engagement) · **Creator & Community** (Superfluid streaming, roadmap).
- *Working product* — live PWA + relayer, runnable now. *Integration depth* — real permit/identity/UBI against the actual contracts, proven on a fork. *Scalability* — config-driven, stateless relayer, one-env-var switch from fork → mainnet.

## A note on networks

GoodDollar's real contracts (G$ with permit, Identity, UBI) live on **Celo mainnet** (its dev/staging environments are *also* on mainnet); there is no usable Alfajores deployment. So kumo-good targets **Celo mainnet contracts** and uses a **local mainnet fork** for free, faithful testing — never mock contracts.

## Status

Hero flow + the full strong-tier feature set implemented and verified (shared 24 tests, relayer 12 tests, web builds; `/claim` reads real on-chain entitlement). Next: the streaming (`setFlowrate`) path through the offline queue, and the Engagement-Rewards invite loop (server-signed via the relayer's app key).
