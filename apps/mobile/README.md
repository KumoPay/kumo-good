# apps/mobile

**Deferred — the [web PWA](../web) is the shipping product.** Per the hackathon
decision, kumo-good targets a fully browser-based, mobile-installable PWA (no APK),
so the React Native app is not built in this round.

The PWA already delivers the mobile experience: voice input (Web Speech API),
non-custodial in-browser signing (viem), an offline queue with auto-flush, and
installability (manifest + service worker).

A future native build (Expo, RN 0.83.6 per the Kumo pin) would add **on-device
Llama 3.2 + Whisper** for fully-offline NL parsing — the one piece the web can't
do without a network speech service. It would reuse `@kumo-good/shared` unchanged
(viem signing, the offline-queue schema, the permit builder).
