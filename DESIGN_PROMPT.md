# Design prompt — kumo-good (paste into Claude)

> Copy everything in the "PROMPT" block below into Claude (or Claude in design/artifact
> mode). It asks for a single, self-contained, interactive prototype: a landing page +
> the full in-app experience, in the Kumo visual language, adapted to the G$ wallet.

---

## PROMPT

Design and build a **single self-contained interactive prototype** (one React file using
**Tailwind CSS**, no external image/asset dependencies — use **inline SVG** for all icons
and the mascot, and realistic placeholder data). It has two parts: a **marketing landing
page** and a **phone-framed app** with working navigation between every screen. Render the
landing full-width; render the app inside a centered ~390px phone frame. Include a small
top toggle to switch between "Landing" and "App".

### Product context
**kumo-good** is an offline-first, voice-driven **G$ (GoodDollar) wallet** that runs in the
browser (installable PWA, no app store). Its promise: **pay or claim your daily UBI with no
internet** — you speak or type a payment, your phone signs it offline, and it settles itself
when the signal returns. **Users never need to hold a gas token** (a relayer pays gas in
cUSD). It runs on the Celo network. Tone: warm, human, reassuring, a little playful — this
is money for people in low-connectivity places, so it must feel trustworthy and simple, not
"crypto-bro."

### Brand & visual language (keep these colors — they are the Kumo palette)
Light, airy, "cloud" aesthetic. Soft pastels on white/cream, navy ink, generous rounding,
soft shadows, gentle motion.

**Palette**
- Ink / text: `#0B1020` (primary), `#64748b` (secondary/slate), `#94a3b8` (muted)
- Background: `#FFFFFF` and cream `#FAFCFF`; soft hero gradients `white → #f5f3ff → #ede9fe`
- Primary action (cyan): `#7FE8FF` with a soft glow `0 6px 18px rgba(127,232,255,0.45)`
- Accent violet (active states, links, emphasis): `#7c5cff`, deep `#6d28d9`, soft `#8b5cf6`
- Accent lilac (secondary chips, decoration, sleep-Z's): `#C7B5FF` / `#c4b5fd`
- Sky (soft fills/hover): `#B7F1FF`
- Disabled / hairlines: `#C4CCD8`, slate-100/200 borders, **dashed lilac** dividers `#c4b5fd`
- Success green (G$ amounts / verified): a friendly green is OK as a *small* accent for
  "G$" coin marks and "verified", but keep cyan + lilac + violet dominant.

**Typography**: Inter for display/headings (weights 800–900, tight letter-spacing
≈ -0.02em), Nunito Sans for body. Big bold balances; uppercase tracked "eyebrow" labels.

**Components / motifs**
- Buttons: **fully rounded pills**. Primary = cyan fill, navy text, cyan glow. Secondary =
  white with a 1.5px navy inset ring. Disabled = `#C4CCD8`. All "pressable" (scale 0.98 on
  press).
- Cards: white, radius ~18px, soft shadow `0 8px 20px rgba(11,16,32,0.05)`.
- Chips/pills: translucent cyan `rgba(127,232,255,.35)` or lilac `rgba(199,181,255,.45)`.
- Rows: key/value lines with **dashed** bottom dividers; uppercase tracked keys.
- Eyebrow labels: 10–11px, bold, `tracking-[0.18em]`, uppercase, navy/50.
- Gentle animations: mascot "breathe" (float up/down 3s), signal-wave rings, sleep "z"
  drifting up, success sparkles, mic "pulse halo" in lilac while listening, hero glow that
  follows the cursor. Respect `prefers-reduced-motion`.

**The Kumo mascot (build it as inline SVG — no PNG)**: a friendly rounded **cloud**
character (kumo = "cloud" in Japanese) with two simple dot eyes and a soft smile. It nods to
G$ by holding/emitting a tiny gold **"G$" coin**. It has expression states reused across
screens:
- **cheerful** (default), **waving** (hero/onboarding),
- **signal waves** = cyan radio rings from one side (used for "online / settles itself"),
- **sleeping** = lilac "z z z" drifting up (used for "offline / queued"),
- **celebrating** = sparkles (used for success / claimed / settled).
Wrap it with playful soft parentheses `❨ ❩` in lilac as a signature flourish.

---

### PART 1 — Landing page (full width)
Sticky translucent top nav (blur): left = cloud mark + "kumo-good"; center links =
Features · How it works · About; right = a small "Celo" network pill + a primary pill button
**"Open the app →"** (switches the prototype to the App view).

1. **Hero** — soft gradient bg with cursor-follow glow. Big headline:
   **"Pay and claim your UBI — even offline."** Sub: "Speak a G$ payment, sign it on your
   phone with no signal, and it settles itself when you're back online. No gas token, ever."
   Primary CTA **"Open the app →"**, secondary "See how it works". The waving cloud mascot
   rises into the hero.
2. **How it works** — 3 steps with circular line-icons connected by a dashed lilac line:
   **1. Say it** ("send 5 to Maria" or "claim my UBI" — voice or text) ·
   **2. Sign offline** (your phone signs locally; the key never leaves the browser) ·
   **3. Settles itself** (on reconnect a relayer submits it; gas paid in cUSD).
3. **Features grid** — gradient feature tiles (rounded-2xl, icon in a rounded square, hover
   lift). Cover the real features, grouped:
   - 💸 Offline payments — send G$ with no signal; settles on reconnect
   - 🎙️ Voice & text — natural language → a payment or a claim, fully on-device
   - 🌱 Gasless UBI claim — claim your daily UBI without owning a gas token
   - ✂️ Claim-and-Split — "split 30 between Ama, Kofi and Esi" → one signature pays everyone
   - 🤖 Voice multi-action — "claim my UBI and send 5 to mom" → an ordered plan
   - 📷 Pay-by-QR & 🔗 Request money — scan or generate a "pay me X" QR/link, works offline
   - 🪪 In-app face verification — prove you're a real human (required for UBI)
   - 🔥 Claim streak — a daily-claim streak to build the habit
   - 🔑 In-browser wallet & 📱 Installable PWA — no install friction; "add to home screen"
4. **Trust strip** — short reassurance line: "Runs on Celo · non-custodial · your key stays
   on your device."
5. **Bottom CTA banner** — violet/indigo gradient card: "Built to keep paying even when the
   signal dies." + "Open the app →", with the waving mascot.
6. **Footer** — cloud mark + "Pay when the signal disappears.", Product/Resources/Legal link
   columns, © line, social icons.

---

### PART 2 — The app (inside a ~390px phone frame)
Persistent **top bar**: cloud mark + "kumo-good"; right side shows a streak flame chip
("🔥 4") and an **online/offline** chip (cyan wifi "online" / lilac "offline"). Persistent
**bottom tab bar** (active color violet `#7c5cff`, idle `#94a3b8`): **Home · Activity ·
Identity · Wallet**. Build these screens with working navigation:

1. **Onboarding / login (wallet)** — the welcome + create-wallet screen. Centered waving
   cloud mascot, "Welcome to kumo-good", sub "Pay when the signal disappears." Three little
   feature rows (Say it / Sign offline / Settles itself — gas paid in cUSD). Primary button
   **"Create my wallet →"** and a small secondary "Import an existing key". Caption: "A
   non-custodial wallet is generated in this browser." (This is the app's login page.)
2. **Home** — big **G$ balance** card (e.g. "255.92 G$") with a "verified human" chip and
   the streak flame; a "N queued · settles when you reconnect" banner when offline; two big
   actions **Pay** (cyan) and **Claim 1.2 G$** (UBI); a "Request money (QR)" button; a
   "Recent" activity list.
3. **Pay** — a large round **mic** button (lilac pulse halo while "listening"), a text area
   ("send 5 to 0x… for lunch — or — claim my UBI and send 2 to mom"), example chips ("send 5
   to me", "claim my UBI", "claim + send", "split 30 three ways"), and **Scan QR** + **Review**.
4. **Scan to pay** — camera viewport placeholder + "paste a payment link" fallback.
5. **Request money** — amount / your name / memo inputs → generates a QR + "Copy link".
6. **Confirm payment (sign)** — big amount + "G$", rows: To (address), For (memo), Expires
   in 14 days, Gas "paid by relayer in cUSD"; an online/offline status pill; button
   **"Sign & pay"** (online) / **"Sign offline"** (offline).
7. **Split (Claim-and-Split)** — header big total "30 G$", subline "split 3 ways · 10 G$
   each", an optional "claims your UBI first" chip; a list of recipient cards each showing
   the person, their **share** (e.g. "10 G$"), and an address input with "use my address";
   button **"Sign & split"** / **"Sign split offline"**. Caption: "One signature — everyone
   gets paid."
8. **Plan (multi-action)** — numbered steps (e.g. 1. Claim your UBI, 2. Send 5 G$) with
   address inputs where needed; button "Run plan" / "Sign plan offline".
9. **Settled (success)** — celebrating mascot with sparkles, "Sent!" / "Queued", the amount
   and recipient(s), a "View on Celoscan →" chip, "Done" / "View activity".
10. **Activity** — queued/settling/settled/failed/expired items, oldest grouping; status
    pills in the right colors (queued/settling = violet, settled = green, failed/expired =
    red); "expires in 14 days" hints; a "Settle all (N)" action when online; tx links.
11. **Identity & UBI** — a "Verified human / Not verified" card with "Verify with face scan";
    a claim-streak card ("4-day claim streak · best 6"); a "Daily UBI entitlement" card with
    the amount and "Claim today's UBI" (note: gasless via the relayer).
12. **Wallet** — address (copyable), "Reveal private key" (burner), a Network section
    (Chain / Relayer / Gas paid in), "Import a different key", and a red "Reset wallet".

### Interactions
Make the prototype clickable: nav toggle (Landing ↔ App), tab bar switches screens, "Open
the app" enters onboarding, "Create my wallet" → Home, Pay → Confirm/Split → Settled →
Activity, an online/offline toggle that changes copy ("Sign & pay" ↔ "Sign offline", shows
the queued banner, flips the mascot to sleeping-z's when offline). Use realistic G$ numbers
and short 0x… addresses. Keep it accessible (focus states, aria-labels) and responsive.

### Deliverable
One polished, self-contained React + Tailwind artifact, inline SVG only, that I can click
through end to end. Prioritize a clean, friendly, production-quality feel in the Kumo palette
above. Start with the landing, then the app.
