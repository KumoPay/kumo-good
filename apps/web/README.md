# apps/web

The product: an offline-first **G$ wallet PWA** (Next.js). Installable on a phone,
no APK — everything runs in the browser.

**Features**
- **Non-custodial in-browser wallet** (`lib/wallet.ts`) — a burner EVM key in localStorage; export/import/reset.
- **Voice + text intent** (`lib/parse.ts`) — Web Speech API dictation → the shared regex parser (fully offline).
- **Offline queue** (`lib/queue.ts`) — localStorage entries + status state machine; auto-flushes on reconnect (`online` listener). Service worker (`public/sw.js`) makes the shell load offline.
- **EIP-712 permit signing** (`lib/relay.ts`) — builds + signs the G$ permit with viem; caches nonce + relayer spender for offline use.
- **Settle via relayer** — browser POSTs to same-origin `/api/relay`, which proxies to `RELAYER_URL` (no CORS, relayer URL stays server-side).
- **Live GoodDollar reads** (`lib/gd.ts`) — G$ balance, Identity `isWhitelisted`, daily UBI `checkEntitlement`, `claim()`.

**Run**
```bash
cp .env.example .env.local      # set RELAYER_URL + network
pnpm --filter web dev           # http://localhost:3000
```
Open it on your phone (same LAN, or deploy to Vercel). Toggle airplane mode to see the offline → settle flow.

**Screens** (`components/App.tsx`): Onboarding · Home (balance, UBI, streak, queue) · Pay (voice/text/scan) · Scan (camera QR) · Request (generate a payment QR) · Confirm (sign offline) · Plan (multi-action review) · Settled (Celoscan) · Activity (queue + auto-flush) · Identity & UBI (in-app face verification, claim, streak) · Wallet.

**Strong-tier features** (`lib/`):
- **Gasless / offline UBI claim** — `relay.ts` `settleClaim` → `/api/claim`; queued offline, settled on reconnect (`gd.ts` self-claim fallback).
- **Voice multi-action agent** — `parse.ts` `parsePlan` → ordered claim/send plan; `claim-and-send` combos.
- **Pay-by-QR + request links** — `qr.ts` (BarcodeDetector scan + `qrcode` generation) over the shared `payment-request` schema; deep-link `?r=` handling.
- **In-app face verification** — `identity.ts` lazy-loads `@goodsdks/citizen-sdk` `generateFVLink` with a graceful fallback.
- **Claim streak** — `streak.ts` (offline, one grace day).

Env: copy `.env.example` → `.env.local` (`RELAYER_URL`, `NEXT_PUBLIC_*` network).
