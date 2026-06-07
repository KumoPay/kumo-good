*kumo-good* — offline-first G$ wallet for Celo
_Last updated: 2026-06-07_

In one line: a browser wallet (no app store) that lets you *pay or claim your daily UBI with no internet*. It settles itself when signal returns. Users never need to hold a gas token.

---

*What we have today (12 features)*

1. 💸 *Offline payments* — send G$ with no signal; settles automatically on reconnect
2. 🎙️ *Voice & text input* — say "send 5 to Maria" instead of tapping
3. 🌱 *Gasless UBI claim* — claim daily UBI without owning a gas token; works offline
4. 🤖 *Voice multi-action agent* — one sentence → several actions ("claim my UBI and send 5 to mom")
5. ⚡ *Claim-and-send combo* — claim, then pay, in a single command
6. 📷 *Pay-by-QR* — scan a merchant QR and pay, even offline
7. 🔗 *Request money (QR / link)* — generate a "pay me X" QR or link to share
8. 🪪 *In-app face verification* — prove you're human (required for UBI) without leaving the app
9. 🔥 *Claim streak* — daily-claim streak counter to build the habit
10. 🔑 *In-browser wallet* — no install, no seed-phrase friction; key stays in the browser
11. 📊 *Live balance / identity / UBI* — see your G$, verified status, and today's UBI amount
12. 📱 *Installable PWA* — "Add to home screen"; opens even with no signal
13. ✂️ *Claim-and-Split* — "split 30 between Ama, Kofi and Esi" — one signature, pays everyone (works offline)

---

*Honest status*
The code runs against real Celo mainnet contracts. The only thing between "demo" and "live" is funding — fund the relayer with a little gas, fund a wallet with G$, and face-verify it. No code is blocking.

---

*Just shipped: Claim-and-Split* ✂️ ✅

"Split 30 G$ between Ama, Kofi, and Esi" — spoken offline, one confirmation, all three get paid on reconnect.

Use cases: bill-splitting, group savings (ROSCA / susu / tanda), paying a crew, market-stall splits.

How it works: you sign ONE offline permit for the total; on reconnect the relayer fans it out to each person. Reuses the engine we already built — no new smart contracts, no new permissions. Go-live still just needs the relayer funded (💰).

---

*Why not the bigger ideas*

❌ *Claim from community pools* — feature is switched off on mainnet (outside our control)
❌ *Engagement Rewards (earn G$ for actions)* — requires GoodDollar's approval; worth applying for, not the centerpiece
⏳ *Streaming payments* — works, but needs online setup once; a "wow" feature for later
❌ *Savings / yield* — not doable without holding users' funds

---

*Suggested order*

1. Fund the relayer → run first real mainnet payment (validates payments + split)
2. ✅ Claim-and-Split — done
3. Claim-links for users without a wallet yet
4. Apply for GoodDollar Engagement Rewards approval (long lead time, start now)
