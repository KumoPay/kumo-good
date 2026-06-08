# Deploying Kumo to a subdomain (e.g. `good.kumoapp.xyz`)

Kumo is two services in one pnpm monorepo:

| Service | Path | Host | URL |
|---|---|---|---|
| **Web app** (Next.js PWA + landing) | `apps/web` | **Vercel** | `good.kumoapp.xyz` |
| **Relayer** (pays gas, holds the hot key) | `services/relayer` | **Google Cloud Run** | its `*.run.app` URL (no custom domain needed) |

The app code is **domain-agnostic** — all in-app URLs use `window.location.origin`, and the
relayer URL is a server-side env var. So this needs **no code changes**: one DNS record for the
web app, and the relayer's Cloud Run URL wired into the web app's `RELAYER_URL`.

> **The relayer needs no custom domain.** Only the web app (`good.kumoapp.xyz`) is user-facing.
> The Vercel `/api/relay*` routes call the relayer **server-side**, so the Cloud Run
> `https://kumo-relayer-….run.app` URL is all you need.

---

## ✅ Checklist (tick as you go)

**Relayer — Google Cloud Run** (do this first; you need its URL for the web app)
- [ ] `gcloud` installed + `gcloud auth login`, project selected
- [ ] Enable APIs + create an Artifact Registry repo (one-time)
- [ ] Put `RELAYER_PK` in Secret Manager
- [ ] Build image (`cloudbuild.yaml`) → deploy with **`--max-instances=1`** + env vars
- [ ] Copy the service URL → that's your `RELAYER_URL`

**Web app — Vercel**
- [ ] Import repo, **Root Directory = `apps/web`**
- [ ] Env: `RELAYER_URL = https://kumo-relayer-….run.app`
- [ ] Deploy, then add domain `good.kumoapp.xyz`
- [ ] Node version 20/22 if prompted

**DNS** (your `kumoapp.xyz` provider)
- [ ] `CNAME good` → the value Vercel shows (`cname.vercel-dns.com`)

**Verify**
- [ ] `curl https://kumo-relayer-….run.app/health` → ok
- [ ] `curl https://good.kumoapp.xyz/api/relay` → same JSON
- [ ] Open the app, create wallet, run a small payment

**Before public launch**
- [ ] Rotate `RELAYER_PK` (demo key was exposed in a transcript)
- [ ] Fund relayer with cUSD (+ a little CELO)

---

## 1. Relayer → Google Cloud Run

A portable root [`Dockerfile`](Dockerfile) + a
[`cloudbuild.yaml`](services/relayer/cloudbuild.yaml) are included. The build context is the
**repo root** so the pnpm workspace (`packages/shared`) is visible.

### One-time setup
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create kumo --repository-format=docker --location=us-central1

# store the funded signer as a secret (never in git / env files)
printf '0xYOUR_RELAYER_PRIVATE_KEY' | gcloud secrets create relayer-pk --data-file=-
```

### Build + deploy
```bash
# build the image (uses the root Dockerfile, context = repo root) → Artifact Registry
gcloud builds submit --config services/relayer/cloudbuild.yaml .

# deploy: ONE instance (lock-safe), scales to zero (free), public so the web app can call it
gcloud run deploy kumo-relayer \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/kumo/relayer:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --max-instances 1 \
  --min-instances 0 \
  --memory 512Mi \
  --set-env-vars GD_ENV=production,CHAIN_ID=42220,CELO_RPC_URL=https://forno.celo.org,FEE_CURRENCY=0x765DE816845861e75A25fCA122bb6898B8B1282a,ALLOW_ORIGIN=https://good.kumoapp.xyz \
  --set-secrets RELAYER_PK=relayer-pk:latest
```
The command prints a **Service URL** like `https://kumo-relayer-abc123-uc.a.run.app`. That's your
`RELAYER_URL` for Vercel (step 2). Don't set `PORT` — Cloud Run injects it and the relayer reads it.

> **Quick/demo shortcut:** skip Secret Manager and pass the key inline by appending
> `,RELAYER_PK=0x…` to `--set-env-vars` (and dropping `--set-secrets`). Secret Manager is the
> better habit for anything beyond a throwaway demo.

### ⚠️ `--max-instances 1` is mandatory
The relayer's double-pay guard is an **in-memory lock**
([`relayer.ts`](services/relayer/src/relayer.ts)). With more than one instance the lock wouldn't be
shared and a permit could be double-submitted. Cloud Run defaults to autoscaling — pinning to 1 is
what makes it safe. (The web app on Vercel can scale freely; the relayer cannot.)

### Free tier + cold starts
`--min-instances 0` keeps it in Cloud Run's **free tier** (2M req/mo, generous CPU/RAM seconds) —
you only consume quota while handling requests. The trade-off is a **cold start** (~2–5 s) on the
first request after idle. If a just-woken relayer makes the first settlement feel slow:
- **Keep it warm**: a free uptime pinger (UptimeRobot / cron-job.org) or **Cloud Scheduler**
  (3 free jobs) hitting `…run.app/health` every ~5 min.
- Or set `--min-instances 1` for always-on (leaves the free tier — small monthly cost).

### Updating later
Re-run the two `gcloud builds submit` + `gcloud run deploy` commands. Cloud Run rolls out a new
revision with zero downtime.

> Console alternative: Cloud Run → **Create Service → Deploy from repository**, connect
> `KumoPay/kumo-good`, set **Dockerfile path = `Dockerfile`** (repo root), region
> `us-central1`, **Max instances = 1**, allow unauthenticated, and add the same env vars/secret.

---

## 2. Web app → Vercel

1. **New Project** → import this repo.
2. **Root Directory: `apps/web`** (Vercel auto-detects Next.js + the pnpm workspace and installs
   from the repo root — `packages/shared` resolves automatically).
3. **Environment Variables** (Production):
   - `RELAYER_URL = https://kumo-relayer-….run.app` *(the Cloud Run URL from step 1 — the
     same-origin `/api/relay*` proxy forwards here)*
   - *(optional overrides; sensible mainnet defaults exist)* `NEXT_PUBLIC_GD_ENV=production`,
     `NEXT_PUBLIC_CHAIN_ID=42220`, `NEXT_PUBLIC_CELO_RPC_URL=https://forno.celo.org`
4. Deploy. Then **Settings → Domains → add `good.kumoapp.xyz`** and paste the CNAME it gives you
   into DNS (step 3). HTTPS is automatic.

> Node: the repo targets Node ≥ 20. If Vercel's default differs, set it in **Settings → General →
> Node.js Version** (20 or 22).

The PWA is already correct for any domain: `manifest.start_url = /app`, the service worker scopes
to `/`, and the install icon is bundled — nothing domain-specific to change.

---

## 3. DNS (at whoever hosts `kumoapp.xyz`)

One record — independent of `www`, so the main site is untouched:

| Record | Name | Points to |
|---|---|---|
| CNAME | `good` | the value Vercel shows you (e.g. `cname.vercel-dns.com`) |

(No record for the relayer — its Cloud Run URL is used directly by the web app.)

---

## 4. Verify

```bash
# relayer is up and reports its config (no secrets)
curl https://kumo-relayer-….run.app/health

# web app proxies to it (same JSON, same-origin)
curl https://good.kumoapp.xyz/api/relay
```

Then open `https://good.kumoapp.xyz`, **Open the app**, create a wallet, and run a small payment.
(If the very first settlement after a quiet period is slow, that's the Cloud Run cold start — see
the keep-warm note above.)

---

## 5. Before a real public launch
- **Rotate `RELAYER_PK`** — the current demo key appeared in a chat transcript. Generate a fresh
  signer, fund it, and store it only in Secret Manager.
- Fund the relayer with CELO (gas) — it pays gas in cUSD via CIP-64, but keep a little CELO too.
- Consider rate-limiting `/relay*`; `ALLOW_ORIGIN` is already pinned to your domain above.
- Lock down `--allow-unauthenticated` only if you add a shared-secret header between Vercel and the
  relayer (otherwise the public URL is callable by anyone — fine for a demo, tighten for prod).
