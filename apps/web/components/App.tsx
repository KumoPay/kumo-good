"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  type PaymentIntent,
  type SplitIntent,
  type QueuedItem,
  type Hex,
  isExpired,
  expiresInLabel,
  itemLabel,
  parsePaymentRequest,
  buildPaymentRequest,
  splitEvenly,
  toBaseUnits,
} from "@kumo-good/shared"
import { getAccount, getAddress, createWallet, clearWallet, loadKey, importWallet } from "@/lib/wallet"
import { getBalance, getIdentity, getUbiEntitlement, getCurrentDay, claimUbi, type IdentityStatus } from "@/lib/gd"
import { fetchRelayerInfo, getCachedRelayer, buildSignedPayment, buildSignedSplit, buildClaimEntry, settle, settleSplit, settleClaim, type RelayerInfo } from "@/lib/relay"
import { readQueue, addToQueue, updateEntry, removeEntry, pending } from "@/lib/queue"
import { parsePlan, startVoice, voiceSupported, type Action, type VoiceHandle } from "@/lib/parse"
import { startFaceVerification } from "@/lib/identity"
import { toQrDataUrl, startScan, barcodeScanSupported, type ScanHandle } from "@/lib/qr"
import { getStreak, recordClaim, type Streak } from "@/lib/streak"
import { useOnline } from "@/lib/useOnline"
import { fmtG, shortAddr, txLink, relTime, isAddress } from "@/lib/format"
import { IS_MAINNET, G_TOKEN_ADDR, CHAIN_ID } from "@/lib/config"
import { Mic, Send, Check, Clock, Wifi, WifiOff, Shield, Gift, Wallet, Home, Arrow, Copy, Camera, QrCode, Flame } from "@/components/Icons"

type Screen = "home" | "pay" | "sign" | "settled" | "activity" | "identity" | "wallet" | "scan" | "request" | "plan" | "split"

export default function App() {
  const online = useOnline()
  const [ready, setReady] = useState(false)
  const [address, setAddress] = useState<Hex | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [identity, setIdentity] = useState<IdentityStatus | null>(null)
  const [ubi, setUbi] = useState<bigint | null>(null)
  const [relayer, setRelayer] = useState<RelayerInfo | null>(null)
  const [queue, setQueue] = useState<QueuedItem[]>([])
  const [streak, setStreak] = useState<Streak>({ count: 0, best: 0, lastDay: 0, days: [] })
  const [screen, setScreen] = useState<Screen>("home")
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // pay-flow draft + multi-action plan
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [recipientInput, setRecipientInput] = useState("")
  const [plan, setPlan] = useState<Action[] | null>(null)
  const [splitDraft, setSplitDraft] = useState<{ split: SplitIntent; claimFirst: boolean } | null>(null)
  const [settledEntry, setSettledEntry] = useState<QueuedItem | null>(null)

  const flash = useCallback((m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 3400)
  }, [])

  const refreshChain = useCallback(async (addr: Hex) => {
    const [bal, idn, ent] = await Promise.allSettled([getBalance(addr), getIdentity(addr), getUbiEntitlement(addr)])
    if (bal.status === "fulfilled") setBalance(bal.value)
    if (idn.status === "fulfilled") setIdentity(idn.value)
    if (ent.status === "fulfilled") setUbi(ent.value)
  }, [])

  const afterClaim = useCallback(() => {
    getCurrentDay()
      .then((d) => setStreak(recordClaim(d)))
      .catch(() => {})
  }, [])

  // settle a single queued item (used by flush, the plan runner, and single sends)
  const settleOne = useCallback(
    async (entry: QueuedItem) => {
      // Idempotency guard: only act if this entry is still un-settled. Stops a
      // concurrent flush / "Settle all" / plan-runner from re-submitting the same
      // signed permit (which would replay transferFrom legs → double-pay).
      const live = readQueue().find((x) => x.id === entry.id)
      if (!live || (live.status !== "queued" && live.status !== "failed")) return
      updateEntry(entry.id, { status: "settling" })
      setQueue(readQueue())
      if (entry.kind === "claim") {
        const res = await settleClaim(entry.owner as Hex)
        if (res.ok && res.selfClaim) {
          const acct = getAccount()
          if (!acct) {
            updateEntry(entry.id, { status: "failed", failureReason: "no wallet" })
          } else {
            const c = await claimUbi(acct)
            if (c.ok) {
              updateEntry(entry.id, { status: "settled", ...(c.txHash ? { txHash: c.txHash } : {}) })
              afterClaim()
            } else updateEntry(entry.id, { status: "failed", failureReason: c.error })
          }
        } else if (res.ok) {
          updateEntry(entry.id, { status: "settled", ...(res.txHash ? { txHash: res.txHash } : {}) })
          afterClaim()
        } else updateEntry(entry.id, { status: "failed", failureReason: res.error })
      } else if (entry.kind === "split") {
        const res = await settleSplit(entry.relay)
        const firstHash = res.legs?.find((l) => l.ok && l.txHash)?.txHash ?? res.permitTxHash
        if (res.ok) {
          updateEntry(entry.id, { status: "settled", ...(firstHash ? { txHash: firstHash } : {}) })
        } else if (res.partial) {
          // The consumed permit nonce blocks the remaining legs, so this won't
          // auto-complete; the user re-creates a split for the unpaid remainder.
          const paid = res.legs?.filter((l) => l.ok).length ?? 0
          updateEntry(entry.id, {
            status: "failed",
            failureReason: `paid ${paid}/${entry.relay.legs.length} recipients; the rest didn't go through — create a new split for them`,
            ...(firstHash ? { txHash: firstHash } : {}),
          })
        } else {
          updateEntry(entry.id, { status: "failed", failureReason: res.error })
        }
      } else {
        const res = await settle(entry.relay)
        if (res.ok) updateEntry(entry.id, { status: "settled", ...(res.txHash ? { txHash: res.txHash } : {}) })
        else updateEntry(entry.id, { status: "failed", failureReason: res.error })
      }
      setQueue(readQueue())
    },
    [afterClaim],
  )

  const flushing = useRef(false)
  const flush = useCallback(async () => {
    if (flushing.current) return // only one settle loop at a time (reconnect + "Settle all" can race)
    flushing.current = true
    try {
      const todo = pending(readQueue())
      for (const e of todo) {
        const live = readQueue().find((x) => x.id === e.id) // re-read: skip anything already in flight
        if (!live || (live.status !== "queued" && live.status !== "failed")) continue
        if (isExpired(live, Math.floor(Date.now() / 1000))) {
          updateEntry(live.id, { status: "expired" })
          setQueue(readQueue())
          continue
        }
        await settleOne(live)
      }
      if (address) refreshChain(address)
    } finally {
      flushing.current = false
    }
  }, [address, refreshChain, settleOne])

  // boot + deep links (payment-request ?r=, FV return ?verified=1)
  useEffect(() => {
    const addr = getAddress()
    setAddress(addr)
    setQueue(readQueue())
    setRelayer(getCachedRelayer())
    setStreak(getStreak())
    setReady(true)
    if (addr && navigator.onLine) {
      fetchRelayerInfo().then(setRelayer)
      refreshChain(addr)
    }
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get("verified")) {
        if (addr) refreshChain(addr)
        flash("Welcome back — checking your verification…")
        window.history.replaceState({}, "", url.pathname)
      }
      const r = url.searchParams.get("r")
      if (r && r.includes("kumo-good:pay:v1:")) {
        const req = parsePaymentRequest(r)
        if (req.amount) {
          setIntent({ recipient: req.label ?? req.to, amount: req.amount, ...(req.memo ? { memo: req.memo } : {}) })
          setRecipientInput(req.to)
          setScreen("sign")
        } else {
          setRecipientInput(req.to)
          flash(`Enter an amount to pay ${req.label ?? shortAddr(req.to)}`)
          setScreen("pay")
        }
        window.history.replaceState({}, "", url.pathname)
      }
    } catch {
      /* ignore malformed deep links */
    }
  }, [refreshChain, flash])

  // flush on reconnect
  const wasOnline = useRef(online)
  useEffect(() => {
    if (online && !wasOnline.current) {
      fetchRelayerInfo().then(setRelayer)
      if (address) refreshChain(address)
      flush()
    }
    wasOnline.current = online
  }, [online, address, flush, refreshChain])

  // --- actions ---------------------------------------------------------------
  const onCreateWallet = () => {
    createWallet()
    const addr = getAddress()
    setAddress(addr)
    if (addr && navigator.onLine) {
      fetchRelayerInfo().then(setRelayer)
      refreshChain(addr)
    }
  }

  const submitText = (text: string) => {
    const actions = parsePlan(text)
    if (actions.length === 0) return flash("Couldn't parse that. Try: split 30 between A, B and C")
    const splitAction = actions.find((a) => a.type === "split")
    if (splitAction && splitAction.type === "split") {
      setSplitDraft({ split: splitAction.split, claimFirst: actions.some((a) => a.type === "claim") })
      setScreen("split")
      return
    }
    if (actions.length === 1 && actions[0].type === "balance") return flash(`Balance: ${balance == null ? "—" : fmtG(balance)} G$`)
    if (actions.length === 1 && actions[0].type === "send") {
      setIntent(actions[0].intent)
      setRecipientInput(isAddress(actions[0].intent.recipient) ? actions[0].intent.recipient : "")
      setScreen("sign")
      return
    }
    setPlan(actions) // claim-only or multi-step
    setScreen("plan")
  }

  // build + settle a single payment (Pay → Sign → Settled)
  const onSign = async () => {
    if (!intent) return
    const recipient = recipientInput.trim()
    if (!isAddress(recipient)) return flash("Enter the recipient's 0x address")
    if (intent.period) return flash("Streaming is on the roadmap — send a one-off for now")
    if (!getCachedRelayer()?.relayerAddress) return flash("Relayer not set up — connect once while it's running")
    setBusy(true)
    try {
      const entry = await buildSignedPayment(intent, recipient as Hex)
      addToQueue(entry)
      setQueue(readQueue())
      if (online) {
        await settleOne(entry)
        const done = readQueue().find((e) => e.id === entry.id)
        if (done?.status === "settled") {
          setSettledEntry(done)
          setScreen("settled")
          if (address) refreshChain(address)
        } else {
          setScreen("activity")
          flash(done?.failureReason ?? "Settle failed")
        }
      } else {
        setScreen("activity")
        flash("Signed offline — settles when you reconnect")
      }
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // claim UBI (offline-queue, or gasless settle now)
  const onClaim = async () => {
    if (!address) return
    setBusy(true)
    try {
      const entry = buildClaimEntry(address)
      addToQueue(entry)
      setQueue(readQueue())
      if (!online) {
        flash("Queued — your UBI claims itself when you reconnect")
        setScreen("activity")
        return
      }
      await settleOne(entry)
      const done = readQueue().find((e) => e.id === entry.id)
      if (done?.status === "settled") flash("UBI claimed 🎉")
      else flash(done?.failureReason?.includes("verif") || done?.failureReason?.includes("whitelist") ? "Verify your identity to claim UBI" : done?.failureReason ?? "Claim failed")
      if (address) refreshChain(address)
    } finally {
      setBusy(false)
    }
  }

  // run a multi-action plan in order (claim, then sends)
  const runPlan = async (actions: Action[], recipients: Record<number, string>) => {
    setBusy(true)
    try {
      const built: QueuedItem[] = []
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i]
        if (a.type === "claim") {
          built.push(addToQueue(buildClaimEntry(address!)))
        } else if (a.type === "send") {
          const rcpt = (recipients[i] ?? "").trim()
          if (!isAddress(rcpt)) {
            flash(`Enter an address for "send ${a.intent.amount} G$"`)
            setBusy(false)
            return
          }
          built.push(addToQueue(await buildSignedPayment(a.intent, rcpt as Hex)))
        }
      }
      setQueue(readQueue())
      setPlan(null)
      if (!online) {
        flash("Plan signed offline — runs when you reconnect")
        setScreen("activity")
        return
      }
      for (const e of built) await settleOne(e)
      if (address) refreshChain(address)
      setScreen("activity")
      flash("Plan settled")
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // sign one permit for a SUM, fan it out to N recipients (optionally claim first)
  const runSplit = async (split: SplitIntent, recipients: string[], claimFirst: boolean) => {
    if (!address) return
    const resolved: Hex[] = []
    for (let i = 0; i < recipients.length; i++) {
      const r = (recipients[i] ?? "").trim()
      if (!isAddress(r)) return flash(`Enter an address for recipient ${i + 1}`)
      resolved.push(r as Hex)
    }
    if (!getCachedRelayer()?.relayerAddress) return flash("Relayer not set up — connect once while it's running")
    setBusy(true)
    try {
      const built: QueuedItem[] = []
      if (claimFirst) built.push(addToQueue(buildClaimEntry(address)))
      built.push(addToQueue(await buildSignedSplit(split, resolved)))
      setQueue(readQueue())
      setSplitDraft(null)
      if (!online) {
        flash("Split signed offline — pays everyone when you reconnect")
        setScreen("activity")
        return
      }
      for (const e of built) await settleOne(e)
      if (address) refreshChain(address)
      setScreen("activity")
      flash("Split settled")
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <main className="app-shell items-center justify-center" />
  if (!address) return <Onboarding onCreate={onCreateWallet} />

  return (
    <main className="app-shell relative">
      <TopBar online={online} relayer={relayer} streak={streak} />
      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-2">
        {screen === "home" && (
          <HomeScreen
            balance={balance} identity={identity} ubi={ubi} queue={queue} online={online} streak={streak} busy={busy}
            onPay={() => { setIntent(null); setRecipientInput(""); setScreen("pay") }}
            onClaim={onClaim}
            onRequest={() => setScreen("request")}
            onActivity={() => setScreen("activity")}
          />
        )}
        {screen === "pay" && (
          <PayScreen onSubmit={submitText} onBack={() => setScreen("home")} onScan={() => setScreen("scan")} flash={flash} selfAddr={address} />
        )}
        {screen === "scan" && (
          <ScanScreen onClose={() => setScreen("pay")} flash={flash} onResult={(text) => {
            try {
              const req = parsePaymentRequest(text)
              setRecipientInput(req.to)
              if (req.amount) { setIntent({ recipient: req.label ?? req.to, amount: req.amount, ...(req.memo ? { memo: req.memo } : {}) }); setScreen("sign") }
              else { flash(`Enter an amount to pay ${req.label ?? shortAddr(req.to)}`); setScreen("pay") }
            } catch { flash("Not a kumo-good payment QR") }
          }} />
        )}
        {screen === "request" && <RequestScreen address={address} flash={flash} onBack={() => setScreen("home")} />}
        {screen === "sign" && intent && (
          <SignScreen intent={intent} recipientInput={recipientInput} setRecipientInput={setRecipientInput} online={online} busy={busy} onSign={onSign} onBack={() => setScreen("pay")} selfAddr={address} />
        )}
        {screen === "plan" && plan && (
          <PlanScreen actions={plan} online={online} busy={busy} selfAddr={address} onRun={runPlan} onBack={() => { setPlan(null); setScreen("pay") }} />
        )}
        {screen === "split" && splitDraft && (
          <SplitScreen draft={splitDraft} online={online} busy={busy} selfAddr={address} onRun={runSplit} onBack={() => { setSplitDraft(null); setScreen("pay") }} />
        )}
        {screen === "settled" && settledEntry && <SettledScreen entry={settledEntry} onDone={() => setScreen("home")} onActivity={() => setScreen("activity")} />}
        {screen === "activity" && <ActivityScreen queue={queue} online={online} onFlush={flush} onRemove={(id) => { removeEntry(id); setQueue(readQueue()) }} />}
        {screen === "identity" && <IdentityScreen identity={identity} ubi={ubi} address={address} streak={streak} onClaim={onClaim} busy={busy} flash={flash} />}
        {screen === "wallet" && <WalletScreen address={address} relayer={relayer} onReset={() => { clearWallet(); setAddress(null) }} onImport={(pk) => { try { importWallet(pk); const a = getAddress(); setAddress(a); if (a) refreshChain(a) } catch (e) { flash((e as Error).message) } }} flash={flash} />}
      </div>
      {(screen === "home" || screen === "activity" || screen === "identity" || screen === "wallet") && (
        <TabBar screen={screen} setScreen={setScreen} queueCount={pending(queue).length} />
      )}
      {toast && <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] animate-fade-up rounded-full bg-surface-2 px-4 py-2.5 text-sm text-text shadow-card ring-1 ring-line">{toast}</div>}
    </main>
  )
}

// ---------------------------------------------------------------------------
function Onboarding({ onCreate }: { onCreate: () => void }) {
  return (
    <main className="app-shell items-center justify-center p-7 text-center">
      <div className="animate-fade-up">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-gold text-3xl font-black text-ink shadow-glow">G$</div>
        <h1 className="text-3xl font-extrabold tracking-tight">kumo-good</h1>
        <p className="mx-auto mt-3 max-w-xs text-muted">Speak a G$ payment <span className="text-text">offline</span>. It settles itself when you&apos;re back online — no CELO needed.</p>
        <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
          <Feature icon={<Mic className="h-5 w-5" />} title="Say it" body="Voice or text → an on-device parser turns it into a payment or a UBI claim." />
          <Feature icon={<WifiOff className="h-5 w-5" />} title="Sign offline" body="Your phone signs locally. The key never leaves the browser." />
          <Feature icon={<Wifi className="h-5 w-5" />} title="Settles itself" body="On reconnect a relayer submits it, gas paid in cUSD." />
        </div>
        <button className="btn-primary mt-8 w-full max-w-sm" onClick={onCreate}>Create my wallet <Arrow className="h-5 w-5" /></button>
        <p className="mt-3 text-xs text-muted">A non-custodial burner wallet is generated in this browser.</p>
      </div>
    </main>
  )
}
function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card flex gap-3 py-4">
      <div className="mt-0.5 text-gold">{icon}</div>
      <div><div className="font-semibold">{title}</div><div className="text-sm text-muted">{body}</div></div>
    </div>
  )
}

function TopBar({ online, relayer, streak }: { online: boolean; relayer: RelayerInfo | null; streak: Streak }) {
  return (
    <div className="flex items-center justify-between px-4 pt-5">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold text-sm font-black text-ink">G$</div>
        <div className="leading-tight">
          <div className="text-sm font-bold">kumo-good</div>
          <div className="text-[11px] text-muted">{IS_MAINNET ? "Celo" : `chain ${relayer?.chainId ?? CHAIN_ID}`}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {streak.count > 0 && <span className="chip text-gold"><Flame className="h-3.5 w-3.5" /> {streak.count}</span>}
        <span className={`chip ${online ? "text-ok" : "text-danger"}`}>{online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{online ? "online" : "offline"}</span>
      </div>
    </div>
  )
}

function HomeScreen(props: {
  balance: bigint | null; identity: IdentityStatus | null; ubi: bigint | null; queue: QueuedItem[]; online: boolean; streak: Streak; busy: boolean
  onPay: () => void; onClaim: () => void; onRequest: () => void; onActivity: () => void
}) {
  const { balance, identity, ubi, queue, onPay, onClaim, onRequest, onActivity, busy, online } = props
  const pend = pending(queue)
  const recent = queue.slice(0, 4)
  const canClaim = ubi != null && ubi > 0n
  return (
    <div className="space-y-4 pt-4">
      <div className="card animate-fade-up bg-gradient-to-b from-surface-2 to-surface">
        <div className="label">G$ balance</div>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-4xl font-extrabold tracking-tight">{balance == null ? "—" : fmtG(balance)}</span>
          <span className="mb-1 font-semibold text-gold">G$</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {identity?.isWhitelisted ? <span className="chip text-ok"><Shield className="h-3.5 w-3.5" /> verified human</span> : <span className="chip text-muted"><Shield className="h-3.5 w-3.5" /> not verified</span>}
        </div>
      </div>

      {pend.length > 0 && (
        <button onClick={onActivity} className="card flex w-full animate-fade-up items-center justify-between text-left">
          <div className="flex items-center gap-3"><Clock className="h-5 w-5 text-gold" /><div><div className="font-semibold">{pend.length} queued</div><div className="text-xs text-muted">{online ? "settling…" : "settles when you reconnect"}</div></div></div>
          <Arrow className="h-5 w-5 text-muted" />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button className="btn-primary h-24 flex-col gap-1.5" onClick={onPay}><Send className="h-6 w-6" /> Pay</button>
        <button className="btn-ghost h-24 flex-col gap-1.5 disabled:opacity-60" onClick={onClaim} disabled={busy || !canClaim}><Gift className="h-6 w-6 text-gold" />{canClaim ? `Claim ${fmtG(ubi!)} G$` : "UBI claimed"}</button>
      </div>
      <button className="btn-ghost w-full" onClick={onRequest}><QrCode className="h-5 w-5 text-gold" /> Request money (QR)</button>

      <div>
        <div className="label mb-2 px-1">Recent</div>
        {recent.length === 0 ? <div className="card text-sm text-muted">No activity yet. Tap Pay, or Claim your UBI.</div> : <div className="space-y-2">{recent.map((e) => <ActivityRow key={e.id} e={e} />)}</div>}
      </div>
    </div>
  )
}

function PayScreen({ onSubmit, onBack, onScan, flash, selfAddr }: { onSubmit: (t: string) => void; onBack: () => void; onScan: () => void; flash: (m: string) => void; selfAddr: Hex }) {
  const [text, setText] = useState("")
  const [listening, setListening] = useState(false)
  const handle = useRef<VoiceHandle | null>(null)
  const toggleVoice = () => {
    if (listening) { handle.current?.stop(); setListening(false); return }
    if (!voiceSupported()) return flash("Voice isn't supported here — type instead")
    setListening(true); setText("")
    handle.current = startVoice({ onText: (t) => setText(t), onError: (m) => { flash(m); setListening(false) }, onEnd: () => setListening(false) })
  }
  return (
    <div className="space-y-5 pt-4">
      <BackHeader title="New payment" onBack={onBack} />
      <div className="grid place-items-center py-5">
        <button onClick={toggleVoice} className={`grid h-28 w-28 place-items-center rounded-full bg-gold text-ink shadow-glow transition ${listening ? "animate-pulse-ring" : ""}`}><Mic className="h-12 w-12" /></button>
        <div className="mt-3 text-sm text-muted">{listening ? "Listening… e.g. “claim my UBI and send 5 to…”" : "Tap to speak, type, or scan"}</div>
      </div>
      <textarea className="field min-h-[84px] resize-none" placeholder="e.g. send 5 to 0x… for lunch — or — claim my UBI and send 2 to mom" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button className="chip" onClick={() => setText(`send 5 to ${selfAddr}`)}>send 5 to me</button>
        <button className="chip" onClick={() => setText("claim my UBI")}>claim my UBI</button>
        <button className="chip" onClick={() => setText(`claim my UBI and send 2 to ${selfAddr}`)}>claim + send</button>
        <button className="chip" onClick={() => setText("split 30 between Ama, Kofi and Esi")}>split 30 three ways</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button className="btn-ghost" onClick={onScan}><Camera className="h-5 w-5 text-gold" /> Scan QR</button>
        <button className="btn-primary" onClick={() => onSubmit(text)} disabled={!text.trim()}>Review <Arrow className="h-5 w-5" /></button>
      </div>
    </div>
  )
}

function ScanScreen({ onClose, onResult, flash }: { onClose: () => void; onResult: (text: string) => void; flash: (m: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scan = useRef<ScanHandle | null>(null)
  const [paste, setPaste] = useState("")
  const supported = barcodeScanSupported()
  useEffect(() => {
    let live = true
    if (supported && videoRef.current) {
      startScan(videoRef.current, (t) => { if (live) onResult(t) }, (e) => flash(e)).then((h) => { scan.current = h })
    }
    return () => { live = false; scan.current?.stop() }
  }, [supported, onResult, flash])
  return (
    <div className="space-y-4 pt-4">
      <BackHeader title="Scan to pay" onBack={() => { scan.current?.stop(); onClose() }} />
      {supported ? (
        <div className="overflow-hidden rounded-xl2 border border-line bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
        </div>
      ) : (
        <div className="card text-sm text-muted">Camera scanning isn&apos;t available in this browser. Paste the payment link below.</div>
      )}
      <div className="card space-y-2">
        <div className="label">Or paste a payment link</div>
        <input className="field text-sm" placeholder="https://…?r=kumo-good:pay:v1:…" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn-ghost w-full" disabled={!paste.trim()} onClick={() => onResult(paste.trim())}>Use link</button>
      </div>
    </div>
  )
}

function RequestScreen({ address, flash, onBack }: { address: Hex; flash: (m: string) => void; onBack: () => void }) {
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [label, setLabel] = useState("")
  const [qr, setQr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const make = async () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return flash("Enter an amount")
    const uri = buildPaymentRequest({ to: address, amount: amt, ...(memo ? { memo } : {}), ...(label ? { label } : {}), token: G_TOKEN_ADDR, chainId: CHAIN_ID })
    const url = `${window.location.origin}/?r=${encodeURIComponent(uri)}`
    setLink(url)
    setQr(await toQrDataUrl(url))
  }
  return (
    <div className="space-y-4 pt-4">
      <BackHeader title="Request money" onBack={onBack} />
      {qr && link ? (
        <div className="card flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="payment request QR" className="h-56 w-56 rounded-xl2" />
          <div className="text-center text-sm text-muted">Show this to the payer. They scan, sign offline, and it settles on reconnect.</div>
          <button className="btn-ghost w-full" onClick={() => { navigator.clipboard?.writeText(link); flash("Link copied") }}><Copy className="h-4 w-4" /> Copy link</button>
          <button className="text-xs text-gold" onClick={() => { setQr(null); setLink(null) }}>New request</button>
        </div>
      ) : (
        <div className="card space-y-3">
          <div><div className="label mb-1">Amount (G$)</div><input className="field" inputMode="decimal" placeholder="30" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><div className="label mb-1">Your name / stall (optional)</div><input className="field" placeholder="Tea Stall" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div><div className="label mb-1">Memo (optional)</div><input className="field" placeholder="chai" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
          <button className="btn-primary w-full" onClick={make}><QrCode className="h-5 w-5" /> Create QR</button>
        </div>
      )}
    </div>
  )
}

function SignScreen(props: { intent: PaymentIntent; recipientInput: string; setRecipientInput: (s: string) => void; online: boolean; busy: boolean; onSign: () => void; onBack: () => void; selfAddr: Hex }) {
  const { intent, recipientInput, setRecipientInput, online, busy, onSign, onBack, selfAddr } = props
  const isStream = !!intent.period
  return (
    <div className="space-y-4 pt-4">
      <BackHeader title="Confirm payment" onBack={onBack} />
      <div className="card space-y-3 animate-fade-up">
        <div className="text-center"><div className="text-5xl font-extrabold tracking-tight">{intent.amount}<span className="ml-2 align-middle text-2xl text-gold">G$</span></div>{isStream && <div className="mt-1 text-sm text-gold">streaming · per {intent.period}</div>}</div>
        <Row label="To">{isAddress(recipientInput) ? <span className="font-mono text-sm">{shortAddr(recipientInput)}</span> : <span className="text-sm text-muted">{intent.recipient}</span>}</Row>
        {intent.memo && <Row label="For"><span className="text-sm">{intent.memo}</span></Row>}
        <Row label="Expires"><span className="text-sm">in 14 days</span></Row>
        <Row label="Gas"><span className="text-sm">paid by relayer in cUSD</span></Row>
      </div>
      {!isAddress(recipientInput) && (
        <div className="card space-y-2">
          <div className="label">Recipient address</div>
          <input className="field font-mono text-sm" placeholder="0x…" value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} />
          <button className="text-xs text-gold" onClick={() => setRecipientInput(selfAddr)}>use my own address (for testing)</button>
        </div>
      )}
      <div className={`chip w-full justify-center ${online ? "text-muted" : "text-gold"}`}>{online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{online ? "Will settle immediately" : "Offline — queues and settles on reconnect"}</div>
      {isStream ? <button className="btn-ghost w-full" disabled>Streaming coming soon</button> : <button className="btn-primary w-full" onClick={onSign} disabled={busy}>{busy ? "Signing…" : online ? "Sign & pay" : "Sign offline"} <Check className="h-5 w-5" /></button>}
    </div>
  )
}

function PlanScreen({ actions, online, busy, selfAddr, onRun, onBack }: { actions: Action[]; online: boolean; busy: boolean; selfAddr: Hex; onRun: (a: Action[], r: Record<number, string>) => void; onBack: () => void }) {
  const [recips, setRecips] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    actions.forEach((a, i) => { if (a.type === "send" && isAddress(a.intent.recipient)) init[i] = a.intent.recipient })
    return init
  })
  return (
    <div className="space-y-4 pt-4">
      <BackHeader title="Your plan" onBack={onBack} />
      <div className="space-y-2">
        {actions.map((a, i) => (
          <div key={i} className="card space-y-2">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-xs font-bold text-gold">{i + 1}</span>
              {a.type === "claim" && <span className="font-semibold"><Gift className="mr-1 inline h-4 w-4 text-gold" /> Claim your UBI</span>}
              {a.type === "send" && <span className="font-semibold"><Send className="mr-1 inline h-4 w-4 text-gold" /> Send {a.intent.amount} G$ {a.intent.memo ? `· ${a.intent.memo}` : ""}</span>}
              {a.type === "balance" && <span className="font-semibold">Check balance</span>}
            </div>
            {a.type === "send" && !isAddress(recips[i] ?? a.intent.recipient) && (
              <div className="space-y-1">
                <input className="field font-mono text-xs" placeholder={`0x… (${a.intent.recipient})`} value={recips[i] ?? ""} onChange={(e) => setRecips({ ...recips, [i]: e.target.value })} />
                <button className="text-xs text-gold" onClick={() => setRecips({ ...recips, [i]: selfAddr })}>use my address</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn-primary w-full" onClick={() => onRun(actions, recips)} disabled={busy}>{busy ? "Running…" : online ? "Run plan" : "Sign plan offline"} <Check className="h-5 w-5" /></button>
    </div>
  )
}

function SplitScreen({ draft, online, busy, selfAddr, onRun, onBack }: { draft: { split: SplitIntent; claimFirst: boolean }; online: boolean; busy: boolean; selfAddr: Hex; onRun: (s: SplitIntent, r: string[], claimFirst: boolean) => void; onBack: () => void }) {
  const { split, claimFirst } = draft
  const n = split.recipients.length
  const [recips, setRecips] = useState<string[]>(() => split.recipients.map((r) => (isAddress(r) ? r : "")))
  const shares = splitEvenly(toBaseUnits(split.total), n)
  const set = (i: number, v: string) => setRecips((prev) => prev.map((x, j) => (j === i ? v : x)))
  return (
    <div className="space-y-4 pt-4">
      <BackHeader title="Split a payment" onBack={onBack} />
      <div className="card text-center animate-fade-up">
        <div className="text-5xl font-extrabold tracking-tight">{split.total}<span className="ml-2 align-middle text-2xl text-gold">G$</span></div>
        <div className="mt-1 text-sm text-muted">split {n} ways · {fmtG(shares[0])} G$ each{split.memo ? ` · ${split.memo}` : ""}</div>
        {claimFirst && <div className="mt-2 chip mx-auto w-fit text-gold"><Gift className="h-3.5 w-3.5" /> claims your UBI first</div>}
      </div>
      <div className="space-y-2">
        {split.recipients.map((name, i) => (
          <div key={i} className="card space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{isAddress(name) ? shortAddr(name) : name}</span>
              <span className="text-sm text-gold">{fmtG(shares[i])} G$</span>
            </div>
            {!isAddress(recips[i]) && (
              <div className="space-y-1">
                <input className="field font-mono text-xs" placeholder="0x… address" value={recips[i]} onChange={(e) => set(i, e.target.value)} />
                <button className="text-xs text-gold" onClick={() => set(i, selfAddr)}>use my address</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className={`chip w-full justify-center ${online ? "text-muted" : "text-gold"}`}>{online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{online ? "One signature — everyone gets paid" : "Offline — one signature now, pays everyone on reconnect"}</div>
      <button className="btn-primary w-full" onClick={() => onRun(split, recips, claimFirst)} disabled={busy}>{busy ? "Signing…" : online ? "Sign & split" : "Sign split offline"} <Check className="h-5 w-5" /></button>
    </div>
  )
}

function SettledScreen({ entry, onDone, onActivity }: { entry: QueuedItem; onDone: () => void; onActivity: () => void }) {
  return (
    <div className="flex flex-col items-center pt-10 text-center">
      <div className="grid h-24 w-24 animate-fade-up place-items-center rounded-full bg-ok/15 text-ok"><Check className="h-12 w-12" /></div>
      <h2 className="mt-5 text-2xl font-bold">{entry.status === "settled" ? "Sent!" : "Queued"}</h2>
      <p className="mt-1 text-muted">{itemLabel(entry)}{entry.kind === "payment" ? ` to ${shortAddr(entry.relay.recipient)}` : entry.kind === "split" ? ` to ${entry.split.recipients.length} recipients` : ""}</p>
      {entry.txHash ? <a className="chip mt-4 text-gold" href={txLink(entry.txHash)} target="_blank" rel="noreferrer">View on Celoscan <Arrow className="h-3.5 w-3.5" /></a> : null}
      <div className="mt-8 w-full space-y-2"><button className="btn-primary w-full" onClick={onDone}>Done</button><button className="btn-ghost w-full" onClick={onActivity}>View activity</button></div>
    </div>
  )
}

function ActivityScreen({ queue, online, onFlush, onRemove }: { queue: QueuedItem[]; online: boolean; onFlush: () => void; onRemove: (id: string) => void }) {
  const pend = pending(queue)
  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Activity</h2>{pend.length > 0 && online && <button className="chip text-gold" onClick={onFlush}>Settle all ({pend.length})</button>}</div>
      {queue.length === 0 ? <div className="card text-sm text-muted">Nothing here yet.</div> : <div className="space-y-2">{queue.map((e) => <ActivityRow key={e.id} e={e} onRemove={onRemove} expanded />)}</div>}
    </div>
  )
}

function ActivityRow({ e, onRemove, expanded }: { e: QueuedItem; onRemove?: (id: string) => void; expanded?: boolean }) {
  const now = Math.floor(Date.now() / 1000)
  const color = e.status === "settled" ? "text-ok" : e.status === "failed" || e.status === "expired" ? "text-danger" : "text-gold"
  return (
    <div className="card flex items-center justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {e.kind === "claim" ? <Gift className="h-4 w-4 text-gold" /> : <Send className="h-4 w-4 text-muted" />}
          <span className="font-semibold">{itemLabel(e)}</span>
          {e.kind === "payment" && <span className="text-xs text-muted">→ {shortAddr(e.relay.recipient)}</span>}
          {e.kind === "split" && <span className="text-xs text-muted">→ {e.split.recipients.length} recipients</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          <span className={color}>{statusLabel(e.status)}</span>
          <span className="text-muted">· {relTime(e.createdAt)}</span>
          {(e.kind === "payment" || e.kind === "split") && e.status === "queued" && <span className="text-muted">· {expiresInLabel(e.relay.deadline, now)}</span>}
        </div>
        {expanded && e.failureReason && <div className="mt-1 truncate text-xs text-danger">{e.failureReason}</div>}
      </div>
      <div className="flex items-center gap-2">
        {e.txHash && <a className="text-gold" href={txLink(e.txHash)} target="_blank" rel="noreferrer"><Arrow className="h-4 w-4" /></a>}
        {expanded && onRemove && (e.status === "settled" || e.status === "failed" || e.status === "expired") && <button className="text-xs text-muted" onClick={() => onRemove(e.id)}>clear</button>}
      </div>
    </div>
  )
}

function IdentityScreen({ identity, ubi, address, streak, onClaim, busy, flash }: { identity: IdentityStatus | null; ubi: bigint | null; address: Hex; streak: Streak; onClaim: () => void; busy: boolean; flash: (m: string) => void }) {
  const canClaim = ubi != null && ubi > 0n
  const [verifying, setVerifying] = useState(false)
  const verify = async () => {
    setVerifying(true)
    const res = await startFaceVerification(`${window.location.origin}/?verified=1`)
    setVerifying(false)
    if (!res.bound) flash("Opening GoodDollar verification…")
    window.location.href = res.url
  }
  return (
    <div className="space-y-4 pt-6">
      <h2 className="text-xl font-bold">Identity &amp; UBI</h2>
      <div className="card space-y-3">
        <div className="flex items-center gap-3"><Shield className={`h-8 w-8 ${identity?.isWhitelisted ? "text-ok" : "text-muted"}`} /><div><div className="font-semibold">{identity?.isWhitelisted ? "Verified human" : "Not verified"}</div><div className="text-xs text-muted">GoodDollar Identity · {shortAddr(address)}</div></div></div>
        {!identity?.isWhitelisted && <button className="btn-ghost w-full" onClick={verify} disabled={verifying}>{verifying ? "Preparing…" : "Verify with face scan"} <Arrow className="h-4 w-4" /></button>}
      </div>
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3"><Flame className="h-7 w-7 text-gold" /><div><div className="font-semibold">{streak.count}-day claim streak</div><div className="text-xs text-muted">best {streak.best} · keep claiming daily</div></div></div>
      </div>
      <div className="card space-y-3">
        <div className="label">Daily UBI entitlement</div>
        <div className="text-3xl font-extrabold">{ubi == null ? "—" : fmtG(ubi)} <span className="text-xl text-gold">G$</span></div>
        <button className="btn-primary w-full" onClick={onClaim} disabled={busy || !canClaim}><Gift className="h-5 w-5" /> {canClaim ? "Claim today's UBI" : "Already claimed today"}</button>
        <p className="text-xs text-muted">Gasless via the relayer. Verification is required to receive UBI.</p>
      </div>
    </div>
  )
}

function WalletScreen({ address, relayer, onReset, onImport, flash }: { address: Hex; relayer: RelayerInfo | null; onReset: () => void; onImport: (pk: string) => void; flash: (m: string) => void }) {
  const [revealed, setRevealed] = useState(false)
  const [importPk, setImportPk] = useState("")
  const pk = revealed ? loadKey() : null
  const copy = (v: string, label: string) => { navigator.clipboard?.writeText(v); flash(`${label} copied`) }
  return (
    <div className="space-y-4 pt-6">
      <h2 className="text-xl font-bold">Wallet</h2>
      <div className="card space-y-2"><div className="label">Address</div><button className="flex items-center justify-between gap-2" onClick={() => copy(address, "Address")}><span className="font-mono text-sm">{shortAddr(address)}</span><Copy className="h-4 w-4 text-muted" /></button></div>
      <div className="card space-y-2"><div className="label">Private key (burner)</div>{pk ? <button className="break-all text-left font-mono text-xs text-gold" onClick={() => copy(pk, "Private key")}>{pk}</button> : <button className="btn-ghost w-full" onClick={() => setRevealed(true)}>Reveal private key</button>}<p className="text-xs text-muted">Stored only in this browser. Export it to keep your funds.</p></div>
      <div className="card space-y-2"><div className="label">Network</div><KV k="Chain" v={String(relayer?.chainId ?? CHAIN_ID)} /><KV k="Relayer" v={relayer?.relayerAddress ? shortAddr(relayer.relayerAddress) : relayer?.dryRun ? "dry-run" : "not connected"} /><KV k="Gas paid in" v={relayer?.feeCurrency ?? "—"} /></div>
      <div className="card space-y-2"><div className="label">Import a different key</div><input className="field font-mono text-xs" placeholder="0x… private key" value={importPk} onChange={(e) => setImportPk(e.target.value)} /><button className="btn-ghost w-full" onClick={() => { onImport(importPk); setImportPk("") }} disabled={!importPk.trim()}>Import</button></div>
      <button className="btn-ghost w-full text-danger" onClick={() => { if (confirm("Reset wallet? Export your key first or funds are lost.")) onReset() }}>Reset wallet</button>
    </div>
  )
}

// --- small UI helpers ------------------------------------------------------
function statusLabel(s: QueuedItem["status"]): string {
  return { queued: "queued", settling: "settling…", settled: "settled", failed: "failed", expired: "expired" }[s]
}
function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="flex items-center gap-3"><button className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-2" onClick={onBack}><Arrow className="h-4 w-4 rotate-180" /></button><h2 className="text-lg font-bold">{title}</h2></div>
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b border-dashed border-line pb-2 last:border-0 last:pb-0"><span className="label">{label}</span>{children}</div>
}
function KV({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-muted">{k}</span><span className="font-mono">{v}</span></div>
}
function TabBar({ screen, setScreen, queueCount }: { screen: Screen; setScreen: (s: Screen) => void; queueCount: number }) {
  const tabs: { id: Screen; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: "home", icon: <Home className="h-5 w-5" />, label: "Home" },
    { id: "activity", icon: <Clock className="h-5 w-5" />, label: "Activity", badge: queueCount },
    { id: "identity", icon: <Shield className="h-5 w-5" />, label: "Identity" },
    { id: "wallet", icon: <Wallet className="h-5 w-5" />, label: "Wallet" },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[440px] items-center justify-around border-t border-line bg-ink/90 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 backdrop-blur">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => setScreen(t.id)} className={`relative flex flex-col items-center gap-1 px-3 py-1 text-[11px] ${screen === t.id ? "text-gold" : "text-muted"}`}>{t.icon}{t.label}{t.badge ? <span className="absolute right-1.5 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-ink">{t.badge}</span> : null}</button>
      ))}
    </nav>
  )
}
