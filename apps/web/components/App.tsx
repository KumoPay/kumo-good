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
import { getAccount, getAddress, createWallet, clearWallet, importWallet, isLocked, unlock, restore, canRestore, revealKey } from "@/lib/wallet"
import { getBalance, getIdentity, getUbiEntitlement, getCurrentDay, claimUbi, type IdentityStatus } from "@/lib/gd"
import { fetchRelayerInfo, getCachedRelayer, buildSignedPayment, buildSignedSplit, buildClaimEntry, settle, settleSplit, settleClaim, type RelayerInfo } from "@/lib/relay"
import { readQueue, addToQueue, updateEntry, removeEntry, pending } from "@/lib/queue"
import { getPortfolio, type TokenBalance } from "@/lib/tokens"
import { parsePlan, startVoice, voiceSupported, type Action, type VoiceHandle } from "@/lib/parse"
import { startFaceVerification } from "@/lib/identity"
import { toQrDataUrl, startScan, barcodeScanSupported, type ScanHandle } from "@/lib/qr"
import { getStreak, recordClaim, type Streak } from "@/lib/streak"
import { useOnline } from "@/lib/useOnline"
import {
  isVoiceEnabled,
  setVoiceEnabled,
  isVoiceDownloaded,
  downloadVoiceModel,
  transcribe,
  voiceModelSupported,
  VOICE_MODEL_LABEL,
  VOICE_MODEL_SIZE_LABEL,
  type VoiceProgress,
} from "@/lib/whisper"
import { startRecording, micSupported, type RecordHandle } from "@/lib/record"
import { fmtG, fmtToken, shortAddr, txLink, relTime, isAddress } from "@/lib/format"
import { IS_MAINNET, G_TOKEN_ADDR, CHAIN_ID } from "@/lib/config"
import {
  KumoMascot,
  KumoMark,
  CloudMark,
  PillButton,
  Eyebrow,
  Chip,
  Card,
  KvRow,
  StatusPill,
  OnlineChip,
  GAmount,
  Field,
  type ItemStatus,
} from "@/components/Kumo"
import {
  Mic,
  Check,
  Clock,
  Wifi,
  WifiOff,
  Shield,
  Coin,
  Wallet,
  Home,
  Activity as ActivityIcon,
  Identity as IdentityIcon,
  Arrow,
  ArrowUp,
  ArrowDown,
  Copy,
  Camera,
  QrCode,
  Flame,
  Scan,
  Split,
  List,
  Bolt,
  ChevR,
  Link as LinkIcon,
  Users,
  Globe,
  Face,
  CheckCircle,
  Eye,
  Lock,
  Download,
  Trash,
  Info,
  Bell,
  Gift,
  Message,
  Send,
  User,
  Sparkle,
} from "@/components/Icons"

type Screen = "home" | "pay" | "sign" | "settled" | "activity" | "identity" | "wallet" | "scan" | "request" | "plan" | "split"

export default function App() {
  const online = useOnline()
  const [ready, setReady] = useState(false)
  const [address, setAddress] = useState<Hex | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [portfolio, setPortfolio] = useState<TokenBalance[]>([])
  const [identity, setIdentity] = useState<IdentityStatus | null>(null)
  const [ubi, setUbi] = useState<bigint | null>(null)
  const [relayer, setRelayer] = useState<RelayerInfo | null>(null)
  const [queue, setQueue] = useState<QueuedItem[]>([])
  const [streak, setStreak] = useState<Streak>({ count: 0, best: 0, lastDay: 0, days: [] })
  const [screen, setScreen] = useState<Screen>("home")
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false) // passkey wallet exists but not unlocked this session

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
    const [bal, idn, ent, port] = await Promise.allSettled([getBalance(addr), getIdentity(addr), getUbiEntitlement(addr), getPortfolio(addr)])
    if (bal.status === "fulfilled") setBalance(bal.value)
    if (idn.status === "fulfilled") setIdentity(idn.value)
    if (ent.status === "fulfilled") setUbi(ent.value)
    if (port.status === "fulfilled") setPortfolio(port.value) // keep last-known on RPC failure
  }, [])

  const afterClaim = useCallback(() => {
    getCurrentDay()
      .then((d) => setStreak(recordClaim(d)))
      .catch(() => {})
  }, [])

  // After returning from GoodDollar face verification, whitelisting is written
  // on-chain asynchronously by GoodServer — poll until it lands (~up to 60s).
  const pollVerification = useCallback(
    async (addr: Hex) => {
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        try {
          const idn = await getIdentity(addr)
          if (idn.isWhitelisted) {
            setIdentity(idn)
            refreshChain(addr)
            flash("Verified! You can claim your UBI 🎉")
            return
          }
        } catch {
          /* keep polling */
        }
      }
      flash("Verification is still processing — reopen Identity in a minute")
    },
    [refreshChain, flash],
  )

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
    setLocked(isLocked())
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
        flash("Welcome back — confirming your verification…")
        window.history.replaceState({}, "", url.pathname)
        if (addr) pollVerification(addr)
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
  }, [refreshChain, flash, pollVerification])

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
  const onCreateWallet = async () => {
    setBusy(true)
    try {
      const { address: addr, secured } = await createWallet()
      setAddress(addr)
      setLocked(false)
      flash(secured ? "Wallet created — secured with Face ID 🔒" : "Wallet created on this device")
      if (addr && navigator.onLine) {
        fetchRelayerInfo().then(setRelayer)
        refreshChain(addr)
      }
    } catch (e) {
      flash((e as Error).message || "Couldn't create the wallet")
    } finally {
      setBusy(false)
    }
  }

  // unlock a passkey wallet with Face ID / fingerprint
  const onUnlock = async () => {
    setBusy(true)
    try {
      const addr = await unlock()
      setAddress(addr)
      setLocked(false)
      if (navigator.onLine) {
        fetchRelayerInfo().then(setRelayer)
        refreshChain(addr)
      }
    } catch (e) {
      flash((e as Error).message || "Unlock failed — try again")
    } finally {
      setBusy(false)
    }
  }

  // restore a passkey wallet on a new device / after clearing storage (Face ID → same key)
  const onRestore = async () => {
    setBusy(true)
    try {
      const addr = await restore()
      setAddress(addr)
      setLocked(false)
      flash("Wallet restored 🔑")
      if (navigator.onLine) {
        fetchRelayerInfo().then(setRelayer)
        refreshChain(addr)
      }
    } catch (e) {
      flash((e as Error).message || "Restore failed — try again")
    } finally {
      setBusy(false)
    }
  }

  // import an existing private key (plain burner — not passkey-encrypted)
  const onImportWallet = (pk: string) => {
    try {
      importWallet(pk)
      const a = getAddress()
      setAddress(a)
      setLocked(false)
      flash("Wallet imported")
      if (a && navigator.onLine) {
        fetchRelayerInfo().then(setRelayer)
        refreshChain(a)
      }
    } catch (e) {
      flash((e as Error).message || "Invalid private key")
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
        setSettledEntry(readQueue().find((e) => e.id === entry.id) ?? entry)
        setScreen("settled")
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
  if (locked) return <UnlockScreen onUnlock={onUnlock} onReset={() => { clearWallet(); setAddress(null); setLocked(false) }} busy={busy} />
  if (!address) return <Onboarding onCreate={onCreateWallet} onImport={onImportWallet} onRestore={onRestore} busy={busy} />

  const isTab = screen === "home" || screen === "activity" || screen === "identity" || screen === "wallet"
  const flowTitle: Partial<Record<Screen, string>> = {
    pay: "Pay",
    scan: "Scan to pay",
    request: "Request money",
    sign: "Confirm",
    split: "Split",
    plan: "Plan",
  }

  return (
    <main className="app-shell relative">
      {isTab ? (
        <TopBar />
      ) : screen !== "settled" ? (
        <FlowHeader title={flowTitle[screen] ?? ""} onBack={() => backFrom(screen, setScreen, setPlan, setSplitDraft)} right={<OnlineChip online={online} asButton={false} />} />
      ) : null}

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-2">
        {screen === "home" && (
          <HomeScreen
            balance={balance}
            portfolio={portfolio}
            identity={identity}
            ubi={ubi}
            queue={queue}
            online={online}
            streak={streak}
            busy={busy}
            onPay={() => {
              setIntent(null)
              setRecipientInput("")
              setScreen("pay")
            }}
            onClaim={onClaim}
            onRequest={() => setScreen("request")}
            onActivity={() => setScreen("activity")}
          />
        )}
        {screen === "pay" && <PayScreen onSubmit={submitText} onScan={() => setScreen("scan")} flash={flash} selfAddr={address} />}
        {screen === "scan" && (
          <ScanScreen
            flash={flash}
            onResult={(text) => {
              try {
                const req = parsePaymentRequest(text)
                setRecipientInput(req.to)
                if (req.amount) {
                  setIntent({ recipient: req.label ?? req.to, amount: req.amount, ...(req.memo ? { memo: req.memo } : {}) })
                  setScreen("sign")
                } else {
                  flash(`Enter an amount to pay ${req.label ?? shortAddr(req.to)}`)
                  setScreen("pay")
                }
              } catch {
                flash("Not a Kumo payment QR")
              }
            }}
          />
        )}
        {screen === "request" && <RequestScreen address={address} flash={flash} />}
        {screen === "sign" && intent && (
          <SignScreen intent={intent} recipientInput={recipientInput} setRecipientInput={setRecipientInput} online={online} busy={busy} onSign={onSign} selfAddr={address} />
        )}
        {screen === "plan" && plan && <PlanScreen actions={plan} online={online} busy={busy} selfAddr={address} onRun={runPlan} />}
        {screen === "split" && splitDraft && <SplitScreen draft={splitDraft} online={online} busy={busy} selfAddr={address} onRun={runSplit} />}
        {screen === "settled" && settledEntry && <SettledScreen entry={settledEntry} online={online} onDone={() => setScreen("home")} onActivity={() => setScreen("activity")} />}
        {screen === "activity" && <ActivityScreen queue={queue} online={online} onFlush={flush} onRemove={(id) => { removeEntry(id); setQueue(readQueue()) }} />}
        {screen === "identity" && <IdentityScreen identity={identity} ubi={ubi} address={address} streak={streak} onClaim={onClaim} busy={busy} flash={flash} />}
        {screen === "wallet" && (
          <WalletScreen
            address={address}
            relayer={relayer}
            onReset={() => {
              clearWallet()
              setAddress(null)
              setLocked(false)
            }}
            onImport={(pk) => {
              try {
                importWallet(pk)
                const a = getAddress()
                setAddress(a)
                setLocked(false)
                if (a) refreshChain(a)
              } catch (e) {
                flash((e as Error).message)
              }
            }}
            flash={flash}
          />
        )}
      </div>

      {isTab && (
        <TabBar
          screen={screen}
          setScreen={setScreen}
          queueCount={pending(queue).length}
          onPay={() => {
            setIntent(null)
            setRecipientInput("")
            setScreen("pay")
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </main>
  )
}

// route Back from a flow screen to its parent
function backFrom(
  screen: Screen,
  setScreen: (s: Screen) => void,
  setPlan: (p: Action[] | null) => void,
  setSplitDraft: (d: { split: SplitIntent; claimFirst: boolean } | null) => void,
) {
  if (screen === "scan") return setScreen("pay")
  if (screen === "sign") return setScreen("pay")
  if (screen === "plan") {
    setPlan(null)
    return setScreen("pay")
  }
  if (screen === "split") {
    setSplitDraft(null)
    return setScreen("pay")
  }
  setScreen("home")
}

// ---------------------------------------------------------------------------
const ONBOARDING_MASCOT = "/kumo-states/state-00-transparent.png"
const LOGO_SUPERIOR = "/kumo-states/logo-superior.png"
const NAV_KUMO_MARK = "/kumo-states/nav-kumo.png"
const PROFILE_MASCOT = "/kumo-states/state-00-signal-transparent.png"
const SCAN_KUMO = "/kumo-states/scan-kumo.png"
const STREAK_FLAME = "/kumo-states/streak-flame.png"

// ---------------------------------------------------------------------------
function Onboarding({ onCreate, onImport, onRestore, busy }: { onCreate: () => void; onImport: (pk: string) => void; onRestore: () => void; busy: boolean }) {
  const [mode, setMode] = useState<"intro" | "import">("intro")
  const [pk, setPk] = useState("")
  const [restorable, setRestorable] = useState(false)
  useEffect(() => setRestorable(canRestore()), [])
  const bg = "linear-gradient(180deg,#ffffff 0%,#f5f3ff 60%,#ede9fe 100%)"

  if (mode === "import") {
    return (
      <main className="app-shell">
        <div className="animate-float-up flex min-h-full flex-col px-6 pb-8 pt-6" style={{ background: bg }}>
          <button onClick={() => setMode("intro")} className="press -ml-1 inline-flex w-fit items-center gap-1 font-display text-[14px] font-bold text-violet2-deep">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            Back
          </button>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <KumoMascot state="cheerful" width={140} parens />
            <h1 className="mt-5 font-display text-[26px] font-black tracking-[-0.02em] text-ink">Use an existing wallet</h1>
            <p className="mt-2 max-w-[280px] text-[14px] font-semibold text-slate2">Paste your private key — it’s stored only on this device.</p>
            <input
              value={pk}
              onChange={(e) => setPk(e.target.value)}
              placeholder="0x… private key"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="field mt-6 w-full font-mono text-[13px]"
            />
          </div>
          <div className="space-y-3 pt-7">
            <PillButton size="block" disabled={!pk.trim()} onClick={() => onImport(pk.trim())} icon={<Download size={18} />}>
              Import wallet
            </PillButton>
            <p className="px-4 text-center text-[12px] leading-relaxed text-muted">An imported key is kept in this browser (not passkey-encrypted). Only paste a key you control.</p>
          </div>
        </div>
      </main>
    )
  }

  const rows = [
    { icon: <Face size={20} />, t: "Secured by you", s: "Unlocked with Face ID / fingerprint." },
    { icon: <Lock size={20} />, t: "Sign offline", s: "Your key never leaves this device." },
    { icon: <Wifi size={20} />, t: "Settles itself", s: "Gas paid by a relayer." },
  ]
  return (
    <main className="app-shell">
      <div className="animate-float-up flex min-h-full flex-col px-6 pb-8 pt-12" style={{ background: bg }}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <KumoMascot state="waving" width={180} parens coin />
          <h1 className="mt-6 font-display text-[30px] font-black tracking-[-0.02em] text-ink">Welcome to Kumo</h1>
          <p className="mt-2 text-[16px] font-semibold text-slate2">Pay when the signal disappears.</p>
          <div className="mt-8 w-full space-y-2.5">
            {rows.map((r) => (
              <div key={r.t} className="flex items-center gap-3.5 rounded-2xl bg-white/80 px-4 py-3 text-left shadow-card backdrop-blur">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lilac/30 text-violet2-deep">{r.icon}</span>
                <div>
                  <div className="font-display text-[15px] font-extrabold text-ink">{r.t}</div>
                  <div className="text-[13px] text-slate2">{r.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 pt-7">
          <PillButton size="block" disabled={busy} onClick={onCreate} icon={<Face size={18} />} iconRight={busy ? undefined : <Arrow size={18} />}>
            {busy ? "Creating…" : "Create my wallet"}
          </PillButton>
          <div className="flex items-center justify-center gap-4">
            {restorable && (
              <button onClick={onRestore} disabled={busy} className="press py-1.5 font-display text-[14.5px] font-bold text-violet2-deep disabled:opacity-50">
                Restore with passkey
              </button>
            )}
            {restorable && <span className="h-3 w-px bg-hair" />}
            <button onClick={() => setMode("import")} disabled={busy} className="press py-1.5 font-display text-[14.5px] font-bold text-violet2-deep disabled:opacity-50">
              Use an existing key
            </button>
          </div>
          <p className="px-4 text-center text-[12px] leading-relaxed text-muted">
            A new wallet is generated and secured with your passkey (Face ID / fingerprint). The same passkey restores it on your other devices.
          </p>
        </div>
      </div>
    </main>
  )
}

// Passkey wallet exists but isn't unlocked this session → Face ID to unlock.
function UnlockScreen({ onUnlock, onReset, busy }: { onUnlock: () => void; onReset: () => void; busy: boolean }) {
  return (
    <main className="app-shell">
      <div
        className="animate-float-up flex min-h-full flex-col items-center justify-center px-6 pb-8 pt-12 text-center"
        style={{ background: "linear-gradient(180deg,#ffffff 0%,#f5f3ff 60%,#ede9fe 100%)" }}
      >
        <KumoMascot state="sleeping" width={170} parens />
        <h1 className="mt-6 font-display text-[28px] font-black tracking-[-0.02em] text-ink">Welcome back</h1>
        <p className="mt-2 max-w-[260px] text-[15px] font-semibold text-slate2">Unlock your wallet with Face ID or your fingerprint.</p>
        <div className="mt-8 w-full space-y-3">
          <PillButton size="block" variant="violet" disabled={busy} onClick={onUnlock} icon={<Lock size={18} />}>
            {busy ? "Unlocking…" : "Unlock"}
          </PillButton>
          <button onClick={onReset} className="press w-full py-1.5 text-center font-display text-[13px] font-bold text-muted">
            Reset wallet
          </button>
        </div>
      </div>
    </main>
  )
}

function TopBar() {
  return (
    <div className="safe-top sticky top-0 z-20 flex min-h-[60px] items-center justify-between bg-white px-5 py-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_SUPERIOR}
        alt="kumo·good"
        className="h-[52px] w-auto max-w-[min(78vw,240px)] object-contain object-left"
        draggable={false}
      />
      <button type="button" aria-label="Notifications" className="press grid h-10 w-10 place-items-center rounded-full text-[#3D4F6E]">
        <Bell size={23} stroke={1.7} />
      </button>
    </div>
  )
}

function FlowHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="safe-top sticky top-0 z-20 flex min-h-14 items-center justify-between gap-2 bg-white/80 px-4 backdrop-blur-sm">
      <button onClick={onBack} aria-label="Back" className="press grid h-10 w-10 place-items-center rounded-xl border border-[#E2E8F0] bg-white text-[#0B1020] shadow-sm">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <span className="font-display text-[17px] font-bold text-[#0B1020]">{title}</span>
      <div className="flex min-w-10 justify-end">{right}</div>
    </div>
  )
}

function HomeScreen(props: {
  balance: bigint | null
  portfolio: TokenBalance[]
  identity: IdentityStatus | null
  ubi: bigint | null
  queue: QueuedItem[]
  online: boolean
  streak: Streak
  busy: boolean
  onPay: () => void
  onClaim: () => void
  onRequest: () => void
  onActivity: () => void
}) {
  const { balance, identity, ubi, queue, onPay, onClaim, onRequest, onActivity, busy, online, streak } = props
  const pend = pending(queue)
  const canClaim = ubi != null && ubi > 0n
  const verified = !!identity?.isWhitelisted
  const recent = [...queue].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)

  const streakCount = streak.count > 0 ? streak.count : streak.best > 0 ? streak.best : 0

  return (
    <div className="animate-float-up space-y-3.5 pb-2 pt-1">
      {/* balance hero card */}
      <div
        className="relative min-h-[152px] overflow-hidden rounded-[24px] px-5 pb-6 pt-5 shadow-[0_8px_24px_rgba(124,92,255,0.08)]"
        style={{ background: "linear-gradient(120deg, #EDE9FE 0%, #E6F3FC 48%, #D6EAFE 100%)" }}
      >
        <div className="relative z-10 max-w-[62%]">
          <p className="font-display text-[13px] font-medium text-[#5B6E8C]">Total balance</p>
          <p className="mt-1 font-display text-[clamp(32px,9.5vw,42px)] font-bold leading-none tracking-[-0.02em] text-[#0B1020]">
            G$ {balance == null ? "—" : fmtG(balance)}
          </p>
          <p className="mt-1.5 font-display text-[14px] font-medium text-[#5B6E8C]">GoodDollar</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={NAV_KUMO_MARK}
          alt=""
          width={130}
          height={130}
          className="pointer-events-none absolute -bottom-12 -right-1 h-[132px] w-[132px] object-contain"
          draggable={false}
        />
      </div>

      {/* status pills */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-center gap-2 rounded-full bg-[#E8F8EF] px-4 py-2.5 font-display text-[13px] font-semibold text-[#16A34A]">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-400"}`} />
          {online ? "Online" : "Offline"}
        </div>
        <div className={`flex items-center justify-center gap-2 rounded-full px-4 py-2.5 font-display text-[13px] font-semibold ${verified ? "bg-[#E8F2FF] text-[#3B6FE0]" : "bg-slate-100 text-slate2"}`}>
          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-white ${verified ? "bg-[#3B6FE0]" : "bg-slate-400"}`}>
            <Check size={11} stroke={2.8} />
          </span>
          {verified ? "Verified" : "Not verified"}
        </div>
      </div>

      {/* streak */}
      <div
        className="flex items-center gap-3 rounded-[18px] px-4 py-3.5"
        style={{ background: "linear-gradient(90deg, #FFF6EE 0%, #FFF0E4 50%, #FFF6EE 100%)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={STREAK_FLAME} alt="" className="h-6 w-6 shrink-0 object-contain" draggable={false} />
        <div className="min-w-0 flex-1 text-center">
          <div className="font-display text-[15px] font-bold text-[#0B1020]">
            {streakCount > 0 ? `${streakCount} day streak` : "Start your streak"}
          </div>
          <div className="text-[12.5px] font-medium text-[#9AA5B8]">Keep it going!</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={STREAK_FLAME} alt="" className="h-9 w-9 shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(255,120,40,0.35)]" draggable={false} />
      </div>

      {!online && pend.length > 0 && (
        <button onClick={onActivity} className="press flex w-full items-center gap-2.5 rounded-[16px] bg-lilac/20 px-3.5 py-3 text-left">
          <WifiOff size={18} className="shrink-0 text-violet2-deep" />
          <span className="flex-1 text-[13px] font-semibold text-violet2-deep">{pend.length} queued · settles when you reconnect</span>
          <Arrow size={16} className="shrink-0 text-violet2-deep" />
        </button>
      )}

      {/* actions */}
      <div className="pt-1">
        <h2 className="font-display text-[18px] font-bold text-[#0B1020]">What would you like to do?</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <button onClick={onPay} className="press flex flex-col items-center gap-3 rounded-[18px] bg-white px-2 py-5 shadow-[0_4px_16px_rgba(11,16,32,0.06)]">
            <span className="grid h-11 w-11 place-items-center text-[#7C5CFF]">
              <Send size={24} stroke={1.85} />
            </span>
            <span className="font-display text-[13px] font-bold text-[#0B1020]">Pay</span>
          </button>
          <button
            onClick={onClaim}
            disabled={busy || !canClaim}
            className="press flex flex-col items-center gap-3 rounded-[18px] bg-white px-2 py-5 shadow-[0_4px_16px_rgba(11,16,32,0.06)] disabled:opacity-55"
          >
            <span className="grid h-11 w-11 place-items-center text-[#EAB308]">
              <Gift size={24} stroke={1.85} />
            </span>
            <span className="text-center font-display text-[13px] font-bold leading-tight text-[#0B1020]">Claim UBI</span>
          </button>
          <button onClick={onRequest} className="press flex flex-col items-center gap-3 rounded-[18px] bg-white px-2 py-5 shadow-[0_4px_16px_rgba(11,16,32,0.06)]">
            <span className="grid h-11 w-11 place-items-center text-[#7C5CFF]">
              <QrCode size={24} stroke={1.85} />
            </span>
            <span className="font-display text-[13px] font-bold text-[#0B1020]">Request</span>
          </button>
        </div>
      </div>

      {/* recent activity */}
      <div className="pt-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[18px] font-bold text-[#0B1020]">Recent activity</h2>
          <button type="button" onClick={onActivity} className="press font-display text-[13px] font-semibold text-[#7C5CFF]">
            View all
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-[18px] bg-white px-4 py-5 text-center text-[13px] font-medium text-[#9AA5B8] shadow-[0_4px_16px_rgba(11,16,32,0.06)]">
            No activity yet — pay or claim to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_4px_16px_rgba(11,16,32,0.06)]">
            {recent.map((e, i) => (
              <HomeActivityRow key={e.id} entry={e} last={i === recent.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HomeActivityRow({ entry, last }: { entry: QueuedItem; last?: boolean }) {
  const isClaim = entry.kind === "claim"
  const isPayment = entry.kind === "payment"
  const name = isPayment
    ? (isAddress(entry.intent.recipient) ? shortAddr(entry.intent.recipient) : entry.intent.recipient)
    : isClaim
      ? "UBI"
      : itemLabel(entry)
  const amount =
    entry.kind === "payment"
      ? entry.intent.amount
      : entry.kind === "split"
        ? entry.split.total
        : entry.kind === "claim"
          ? "UBI"
          : "—"
  const incoming = isClaim
  const subtitle = isClaim ? "Claimed" : isPayment ? "You sent" : "Split payment"
  const displayName = name.length > 18 ? shortAddr(name as string) : name
  return (
    <div className={`flex items-center gap-3.5 px-4 py-4 ${last ? "" : "border-b border-slate-100/80"}`}>
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#E8E0FF] to-[#D6EAFE] font-display text-[16px] font-bold text-[#7C5CFF]">
        {displayName[0]?.toUpperCase() ?? "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-bold text-[#0B1020]">{displayName}</div>
        <div className="truncate text-[13px] font-medium text-[#9AA5B8]">{subtitle}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`font-display text-[15px] font-bold ${incoming || entry.status === "settled" ? "text-[#16A34A]" : "text-[#0B1020]"}`}>
          {incoming ? "+" : ""} G$ {amount}
        </div>
        <div className="text-[12px] font-medium text-[#9AA5B8]">{relTime(entry.createdAt)}</div>
      </div>
    </div>
  )
}

// reusable activity row (Home compact + Activity expanded)
function ActivityRow({ e, last, compact, onRemove }: { e: QueuedItem; last?: boolean; compact?: boolean; onRemove?: (id: string) => void }) {
  const now = Math.floor(Date.now() / 1000)
  const isClaim = e.kind === "claim"
  const incoming = isClaim // UBI claims add to your wallet
  const label = itemLabel(e)
  const to = e.kind === "payment" ? shortAddr(e.relay.recipient) : e.kind === "split" ? `${e.split.recipients.length} recipients` : ""
  return (
    <div className={`flex items-center gap-3 px-2.5 py-2.5 ${last ? "" : "border-b border-slate-100"}`}>
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          isClaim ? "bg-emerald-100 text-emerald-600" : incoming ? "bg-lilac/35 text-violet2-deep" : "bg-cyan/30 text-ink"
        }`}
      >
        {isClaim ? <Coin size={20} /> : <ArrowUp size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[14.5px] font-bold text-ink">{label}</div>
        <div className="truncate text-[12px] text-muted">
          {to ? `${to} · ` : ""}
          {relTime(e.createdAt)}
        </div>
        {!compact && e.failureReason && <div className="mt-1 truncate text-[11.5px] text-red-600">{e.failureReason}</div>}
        {!compact && (e.kind === "payment" || e.kind === "split") && e.status === "queued" && (
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-violet2-deep">
            <Clock size={13} /> {expiresInLabel(e.relay.deadline, now)}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        {compact ? (
          <div
            className="font-display text-[11px] font-bold"
            style={{ color: e.status === "settled" ? "#16a34a" : e.status === "failed" || e.status === "expired" ? "#dc2626" : "#7c5cff" }}
          >
            {e.status}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <StatusPill status={e.status as ItemStatus} />
            <div className="flex items-center gap-2">
              {e.txHash && (
                <a className="text-violet2-deep" href={txLink(e.txHash)} target="_blank" rel="noreferrer" aria-label="View on Celoscan">
                  <Globe size={15} />
                </a>
              )}
              {onRemove && (e.status === "settled" || e.status === "failed" || e.status === "expired") && (
                <button className="press min-h-[44px] px-2 py-2 text-[12px] font-semibold text-muted" onClick={() => onRemove(e.id)}>
                  clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// a single token holding (Home portfolio)
function TokenRow({ t, last }: { t: TokenBalance; last?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-2.5 py-2.5 ${last ? "" : "border-b border-slate-100"}`}>
      <TokenMark symbol={t.symbol} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[14.5px] font-bold text-ink">{t.name}</div>
        <div className="text-[12px] text-muted">{t.symbol}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-[15px] font-extrabold text-ink">{fmtToken(t.balance, t.decimals)}</div>
        <div className="text-[11px] font-bold font-display text-muted">{t.symbol}</div>
      </div>
    </div>
  )
}

function TokenMark({ symbol }: { symbol: string }) {
  if (symbol === "G$") return <span className="grid h-10 w-10 shrink-0 place-items-center"><Coin size={36} /></span>
  if (symbol === "CELO")
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="#0B1020" strokeWidth="2.4" />
          <circle cx="12" cy="12" r="3.4" fill="#0B1020" />
        </svg>
      </span>
    )
  if (symbol === "cUSD")
    return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan/35 font-display text-[16px] font-black text-ink">$</span>
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 font-display font-bold text-slate2">{symbol[0]}</span>
}

type VoiceState = "idle" | "listening" | "recording" | "transcribing"

function PaySoundWaves({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="36" viewBox="0 0 22 36" aria-hidden="true" className={`shrink-0 ${active ? "text-[#7FE8FF]" : "text-[#B7F1FF]"}`}>
      <path d="M2 10c4 4 4 12 0 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 6c6 6 6 18 0 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
    </svg>
  )
}

function PayScreen({ onSubmit, onScan, flash, selfAddr }: { onSubmit: (t: string) => void; onScan: () => void; flash: (m: string) => void; selfAddr: Hex }) {
  const [text, setText] = useState("")
  const [vstate, setVstate] = useState<VoiceState>("idle")
  const [offlineVoice, setOfflineVoice] = useState(false) // on-device Whisper enabled + downloaded
  const speech = useRef<VoiceHandle | null>(null)
  const recorder = useRef<RecordHandle | null>(null)

  useEffect(() => {
    setOfflineVoice(isVoiceEnabled() && isVoiceDownloaded() && micSupported())
    return () => {
      speech.current?.stop()
      recorder.current?.cancel()
    }
  }, [])

  const toggleVoice = async () => {
    // On-device Whisper path: record → transcribe.
    if (vstate === "recording") {
      const r = recorder.current
      recorder.current = null
      if (!r) return setVstate("idle")
      setVstate("transcribing")
      try {
        const audio = await r.stop()
        if (audio.length < 1600) {
          flash("Didn't catch that — try again")
        } else {
          setText(await transcribe(audio))
        }
      } catch (e) {
        flash((e as Error).message)
      } finally {
        setVstate("idle")
      }
      return
    }
    if (vstate === "transcribing") return // working — ignore taps
    if (vstate === "listening") {
      speech.current?.stop()
      setVstate("idle")
      return
    }
    // Start. Prefer on-device Whisper (true offline); else Web Speech (needs network).
    if (isVoiceEnabled() && isVoiceDownloaded() && micSupported()) {
      try {
        setText("")
        recorder.current = await startRecording()
        setVstate("recording")
      } catch {
        flash("Microphone permission is needed for voice")
        setVstate("idle")
      }
      return
    }
    if (!voiceSupported()) return flash("Turn on offline voice in Wallet, or just type your command")
    setVstate("listening")
    setText("")
    speech.current = startVoice({
      onText: (t) => setText(t),
      onError: (m) => { flash(m); setVstate("idle") },
      onEnd: () => setVstate((s) => (s === "listening" ? "idle" : s)),
    })
  }

  const micActive = vstate === "recording" || vstate === "listening"
  const micLabel =
    vstate === "recording" ? "Recording… tap to stop" : vstate === "transcribing" ? "Transcribing…" : vstate === "listening" ? "Listening…" : "Tap to speak"

  const chips = [
    { label: "send 5 to me", fill: `send 5 to ${selfAddr}` },
    { label: "claim my UBI", fill: "claim my UBI" },
    { label: "claim + send", fill: `claim my UBI and send 2 to ${selfAddr}` },
    { label: "split 30 three ways", fill: "split 30 between Ama, Kofi and Esi" },
  ]
  return (
    <div
      className="animate-float-up relative flex min-h-full flex-col pb-2 pt-1"
      style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 45%, #F7F4FF 100%)" }}
    >
      <Sparkle size={16} className="pointer-events-none absolute left-6 top-16 text-[#D8CCFF] opacity-80" />
      <Sparkle size={12} className="pointer-events-none absolute right-10 top-28 text-[#C7B5FF] opacity-70" />
      <Sparkle size={14} className="pointer-events-none absolute left-10 top-[42%] text-[#E0D4FF] opacity-60" />

      <div className="text-center">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#A78BFA]">Pay or claim</p>
        <h2 className="mt-2 font-display text-[24px] font-bold leading-tight text-[#0B1020]">Say what you want to do</h2>
      </div>

      {/* mic */}
      <div className="relative my-8 flex flex-col items-center">
        <div className="flex items-center gap-5">
          <PaySoundWaves active={micActive} />
          <div className="relative grid h-[128px] w-[128px] place-items-center">
            <span className="absolute inset-0 rounded-full bg-[#C7B5FF]/25 blur-md" />
            <span className="absolute inset-[6px] rounded-full ring-2 ring-white/80" />
            {micActive && (
              <>
                <span className="absolute inset-0 rounded-full bg-violet2/20 animate-halo" />
                <span className="absolute inset-0 rounded-full bg-lilac/30 animate-halo" style={{ animationDelay: "0.5s" }} />
              </>
            )}
            <button
              onClick={toggleVoice}
              disabled={vstate === "transcribing"}
              aria-label={micActive ? "Stop" : "Start voice input"}
              className="press relative grid h-[96px] w-[96px] place-items-center rounded-full text-white shadow-[0_12px_32px_rgba(124,92,255,0.45)] disabled:opacity-70"
              style={{ background: micActive ? "linear-gradient(145deg, #6D28D9 0%, #7C5CFF 100%)" : "linear-gradient(145deg, #7C5CFF 0%, #8B5CF6 100%)" }}
            >
              <Mic size={38} />
            </button>
          </div>
          <PaySoundWaves active={micActive} />
        </div>
        <p className="mt-5 font-display text-[15px] font-semibold text-[#7C5CFF]">{micLabel}</p>
        <p className="mt-1 max-w-[260px] text-center text-[12px] font-medium text-[#9AA5B8]">
          {offlineVoice ? "On-device · works offline" : "Voice uses the network · enable offline voice in Wallet"}
        </p>
      </div>

      {/* command input */}
      <div className="rounded-[22px] border border-[#E8E4F8] bg-white px-4 py-4 shadow-[0_4px_24px_rgba(124,92,255,0.07)] transition-[border-color,box-shadow] focus-within:border-[#C7B5FF] focus-within:shadow-[0_6px_28px_rgba(124,92,255,0.14)]">
        <textarea
          id="pay-command"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="What do you want to do?"
          className="min-h-[92px] w-full resize-none border-0 bg-transparent font-display text-[16px] leading-[1.6] text-[#0B1020] placeholder:font-medium placeholder:text-[#B8C0D0] focus:outline-none"
          aria-label="Payment command"
        />
      </div>

      <div className="mt-5">
        <p className="mb-2.5 px-0.5 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#A78BFA]">Quick ideas</p>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setText(c.fill)}
              className={`press min-h-[40px] rounded-full px-4 py-2 font-display text-[12.5px] font-semibold transition-colors ${
                text === c.fill
                  ? "bg-[#7C5CFF] text-white shadow-[0_4px_14px_rgba(124,92,255,0.3)]"
                  : "border border-[#E0D9FF] bg-white text-[#5B6478] hover:border-[#C7B5FF]/60"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
        <button
          type="button"
          onClick={onScan}
          className="press flex h-[52px] items-center justify-center gap-2 rounded-full border border-[#0B1020]/85 bg-white font-display text-[15px] font-bold text-[#0B1020]"
        >
          <Scan size={18} />
          Scan QR
        </button>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => onSubmit(text)}
          className="press flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#C7B5FF] font-display text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(124,92,255,0.25)] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          Review
          <Arrow size={18} />
        </button>
      </div>
    </div>
  )
}

function ScanScreen({ onResult, flash }: { onResult: (text: string) => void; flash: (m: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scan = useRef<ScanHandle | null>(null)
  const [paste, setPaste] = useState("")
  const supported = barcodeScanSupported()
  useEffect(() => {
    let live = true
    if (supported && videoRef.current) {
      startScan(videoRef.current, (t) => { if (live) onResult(t) }, (e) => flash(e)).then((h) => { scan.current = h })
    }
    return () => {
      live = false
      scan.current?.stop()
    }
  }, [supported, onResult, flash])

  const brackets: [string, string][] = [
    ["top-6 left-6", "border-t-[3px] border-l-[3px] rounded-tl-xl"],
    ["top-6 right-6", "border-t-[3px] border-r-[3px] rounded-tr-xl"],
    ["bottom-[4.5rem] left-6", "border-b-[3px] border-l-[3px] rounded-bl-xl"],
    ["bottom-[4.5rem] right-6", "border-b-[3px] border-r-[3px] rounded-br-xl"],
  ]

  return (
    <div
      className="animate-float-up flex min-h-full flex-col pb-2 pt-1"
      style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 45%, #F7F4FF 100%)" }}
    >
      <div className="mb-6 text-center">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#8B9BB5]">Scan to pay</p>
        <h2 className="mt-2 font-display text-[24px] font-bold leading-tight text-[#0B1020]">Point it at a payment QR</h2>
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-[40px] bg-[#1A2030] shadow-[0_12px_40px_rgba(11,16,32,0.18)]">
        {supported ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} className="absolute inset-0 h-full w-full scale-105 object-cover blur-[3px]" muted playsInline />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(160deg, rgba(30,35,50,0.95) 0%, rgba(15,20,35,0.98) 50%), radial-gradient(circle at 30% 25%, rgba(124,92,255,0.25), transparent 45%), radial-gradient(circle at 70% 75%, rgba(127,232,255,0.15), transparent 50%)",
            }}
          />
        )}
        <div className="absolute inset-0 bg-black/30" />

        {brackets.map(([pos, b], i) => (
          <span key={i} className={`pointer-events-none absolute ${pos} z-10 h-10 w-10 ${b} border-white/85`} />
        ))}
        <span className="pointer-events-none absolute left-7 right-7 z-10 h-[2px] rounded-full bg-[#7FE8FF] shadow-[0_0_14px_rgba(127,232,255,0.85)] animate-scanline" />

        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SCAN_KUMO} alt="" className="h-[32%] w-auto max-w-[38%] object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.3)]" draggable={false} />
        </div>

        <p className="absolute inset-x-0 bottom-6 z-20 text-center font-display text-[13px] font-medium text-white/85">
          {supported ? "Align the QR code within the frame" : "Camera unavailable — paste a link below"}
        </p>
      </div>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-[#DDE3ED]" />
        <span className="font-display text-[13px] font-medium text-[#8B9BB5]">or paste a link</span>
        <span className="h-px flex-1 bg-[#DDE3ED]" />
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#4A90E2]">
          <LinkIcon size={18} />
        </span>
        <input
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="https://pay.kumogood.com/checkout/abc123"
          className="w-full rounded-2xl border border-[#E2E8F0] bg-white py-3.5 pl-11 pr-4 font-display text-[14px] text-[#0B1020] placeholder:text-[#B8C0D0] focus:border-[#4A90E2]/50 focus:outline-none focus:ring-2 focus:ring-[#4A90E2]/15"
          aria-label="Payment link"
        />
      </div>

      <button
        type="button"
        disabled={!paste.trim()}
        onClick={() => onResult(paste.trim())}
        className="press mt-3 flex h-[52px] w-full items-center justify-center rounded-2xl bg-[#E8F4FF] font-display text-[16px] font-bold text-[#0B1020] transition-colors disabled:cursor-not-allowed disabled:bg-[#F1F5F9] disabled:text-[#B8C0D0]"
      >
        Use link
      </button>
    </div>
  )
}

function RequestField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  suffix,
  inputMode,
  amount,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  suffix?: React.ReactNode
  inputMode?: "text" | "decimal"
  amount?: boolean
}) {
  return (
    <div className="w-full">
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] bg-[#E8DEFF] text-[#8B5CF6]">{icon}</div>
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-[#8E84AD]">{label}</span>
      </div>
      <div className="flex items-center rounded-[22px] bg-white px-5 py-[18px] shadow-[0_4px_24px_rgba(11,16,32,0.07)]">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          className={`min-w-0 flex-1 border-0 bg-transparent text-left font-display text-[#0B1020] placeholder:text-[#B8C0D0] focus:outline-none ${
            amount ? "text-[26px] font-bold tracking-tight placeholder:font-bold" : "text-[18px] font-semibold placeholder:font-medium"
          }`}
        />
        {suffix}
      </div>
    </div>
  )
}

const QR_LOADING_CELLS = (() => {
  const filled = new Set<number>()
  const mark = (r: number, c: number, size = 11) => {
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) filled.add((r + dr) * size + (c + dc))
  }
  mark(0, 0)
  mark(0, 8)
  mark(8, 0)
  ;[10, 11, 12, 20, 21, 32, 33, 34, 43, 54, 55, 65, 66, 76, 77, 87, 88, 98, 99, 45, 56, 67, 78].forEach((i) => filled.add(i))
  return filled
})()

function RequestQrLoading() {
  return (
    <div className="relative rounded-[28px] bg-white px-6 py-8 shadow-[0_8px_32px_rgba(124,92,255,0.12)] animate-pop" aria-busy="true" aria-label="Creating QR code">
      <div className="flex flex-col items-center">
        <div className="relative rounded-[20px] bg-white p-4 shadow-[0_4px_24px_rgba(11,16,32,0.08)]">
          <div className="relative h-[168px] w-[168px] overflow-hidden rounded-xl bg-[#FAFAFF]">
            <div className="grid h-full w-full grid-cols-11 grid-rows-11 gap-[2px] p-1">
              {Array.from({ length: 121 }, (_, i) => {
                const on = QR_LOADING_CELLS.has(i)
                const wave = (i % 11) + Math.floor(i / 11)
                return (
                  <span
                    key={i}
                    className={`rounded-[1px] ${on ? "animate-qr-pulse bg-[#0A0E27]" : "bg-[#E8E4F8] opacity-35"}`}
                    style={{ animationDelay: `${wave * 0.06}s` }}
                  />
                )
              })}
            </div>
            <span className="pointer-events-none absolute inset-x-2 top-[18%] z-10 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[#7FE8FF] to-transparent opacity-90 shadow-[0_0_16px_rgba(127,232,255,0.9)] animate-scanline" />
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-[#7FE8FF]/10 via-transparent to-[#C7B5FF]/10 animate-qr-glow" />
          </div>
          <div className="pointer-events-none absolute -bottom-3 left-1/2 z-20 -translate-x-1/2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SCAN_KUMO} alt="" className="h-11 w-11 animate-breathe object-contain drop-shadow-md" draggable={false} />
          </div>
        </div>

        <p className="mt-7 font-display text-[16px] font-bold text-[#6B66E5]">Creating your QR…</p>
        <p className="mt-1 font-display text-[13px] font-medium text-[#9AA5B8]">Encoding your payment link</p>

        <div className="relative mt-5 h-1.5 w-52 overflow-hidden rounded-full bg-[#EDE9FE]">
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-[#40E0D0] to-[#4776E6] animate-qr-bar" />
        </div>
      </div>
    </div>
  )
}

function RequestScreen({ address, flash }: { address: Hex; flash: (m: string) => void }) {
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [label, setLabel] = useState("")
  const [qr, setQr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const make = async () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return flash("Enter an amount")
    setCreating(true)
    setQr(null)
    setLink(null)
    try {
      const uri = buildPaymentRequest({ to: address, amount: amt, ...(memo ? { memo } : {}), ...(label ? { label } : {}), token: G_TOKEN_ADDR, chainId: CHAIN_ID })
      const url = `${window.location.origin}/app?r=${encodeURIComponent(uri)}`
      setLink(url)
      const [dataUrl] = await Promise.all([toQrDataUrl(url), new Promise<void>((r) => setTimeout(r, 850))])
      setQr(dataUrl)
    } catch (e) {
      flash((e as Error).message)
    } finally {
      setCreating(false)
    }
  }
  return (
    <div
      className="animate-float-up relative min-h-full pb-2 pt-1"
      style={{ background: "linear-gradient(180deg, #F3EFFF 0%, #FAF8FF 30%, #F7F4FF 65%, #EDE9FE 100%)" }}
    >
      <Sparkle size={14} className="pointer-events-none absolute left-8 top-14 text-white opacity-90" />
      <Sparkle size={10} className="pointer-events-none absolute right-12 top-24 text-[#E0D4FF] opacity-80" />
      <Sparkle size={12} className="pointer-events-none absolute left-14 top-[38%] text-white opacity-70" />
      <Sparkle size={11} className="pointer-events-none absolute right-8 top-[52%] text-[#DDD6FE] opacity-75" />
      <Sparkle size={13} className="pointer-events-none absolute left-10 bottom-40 text-white opacity-65" />

      <div className="relative mb-8 text-center">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-[#8E84AD]">Request money</p>
        <h2 className="mt-3 font-display text-[30px] font-bold leading-[1.15] tracking-tight text-[#0A0E27]">Make a “pay me” QR</h2>
      </div>

      {creating ? (
        <RequestQrLoading />
      ) : qr && link ? (
        <div className="relative rounded-[28px] bg-white px-6 py-8 shadow-[0_8px_32px_rgba(124,92,255,0.12)] animate-pop">
          <div className="flex flex-col items-center">
            <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_24px_rgba(11,16,32,0.08)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="payment request QR" className="h-[200px] w-[200px] rounded-xl" />
            </div>
            <div className="mt-5 text-center">
              <GAmount value={amount || "0"} size="text-[32px]" />
              <div className="mt-1 font-display text-[15px] font-semibold text-[#6B66E5]">
                to {label || "you"}
                {memo ? ` · ${memo}` : ""}
              </div>
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#EDE9FE] px-3.5 py-1.5 font-display text-[12.5px] font-bold text-[#6B66E5]">
              <WifiOff size={14} />
              Works offline
            </span>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(link); flash("Link copied") }}
              className="press mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-full border border-[#C7B5FF] bg-white font-display text-[15px] font-bold text-[#0A0E27]"
            >
              <Copy size={18} className="text-[#6B66E5]" />
              Copy link
            </button>
            <button
              type="button"
              className="press mt-4 font-display text-[14px] font-bold text-[#6B66E5]"
              onClick={() => {
                setQr(null)
                setLink(null)
                setAmount("")
                setMemo("")
                setLabel("")
              }}
            >
              New request
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex w-full flex-col space-y-5">
          <RequestField
            icon={<Wallet size={16} />}
            label="Amount"
            amount
            value={amount}
            onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
            placeholder="30"
            inputMode="decimal"
            suffix={
              <>
                <span className="mx-4 h-7 w-px shrink-0 bg-[#E2E8F0]" />
                <span className="shrink-0 font-display text-[18px] font-semibold text-[#9AA5B8]">G$</span>
              </>
            }
          />
          <RequestField icon={<Home size={16} />} label="Your name / stall (optional)" value={label} onChange={setLabel} placeholder="Tea Stall" />
          <RequestField icon={<Message size={16} />} label="Memo (optional)" value={memo} onChange={setMemo} placeholder="chai" />
          <button
            type="button"
            disabled={creating}
            onClick={make}
            className="press mt-3 flex h-[56px] w-full items-center justify-center rounded-full font-display text-[17px] font-bold text-white shadow-[0_10px_28px_rgba(74,144,226,0.35)] disabled:opacity-70"
            style={{ background: "linear-gradient(90deg, #40E0D0 0%, #00BFFF 100%)" }}
          >
            <span className="flex items-center">
              <QrCode size={22} />
              <span className="mx-5 h-6 w-px bg-white/55" />
              Create QR
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

function ReviewRow({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#F0F2F8] py-3.5 last:border-0">
      <span className="shrink-0 font-display text-[14px] font-semibold text-[#8B9BB5]">{label}</span>
      <div className={`min-w-0 text-right font-display text-[14px] font-bold ${accent ? "text-[#4A90E2]" : "text-[#0A0E27]"}`}>{children}</div>
    </div>
  )
}

function SignScreen(props: {
  intent: PaymentIntent
  recipientInput: string
  setRecipientInput: (s: string) => void
  online: boolean
  busy: boolean
  onSign: () => void
  selfAddr: Hex
}) {
  const { intent, recipientInput, setRecipientInput, busy, onSign, selfAddr } = props
  const isStream = !!intent.period
  const amtNum = Number(intent.amount)
  const amtDisplay = Number.isFinite(amtNum) ? amtNum.toFixed(2) : intent.amount
  const resolvedAddr = isAddress(recipientInput) ? recipientInput : isAddress(intent.recipient) ? intent.recipient : ""
  const toName = isAddress(intent.recipient) ? shortAddr(intent.recipient) : intent.recipient

  return (
    <div className="animate-float-up flex min-h-full flex-col pb-2 pt-1" style={{ background: "#F8F9FD" }}>
      <div className="rounded-[24px] bg-white px-5 py-6 shadow-[0_4px_24px_rgba(11,16,32,0.06)]">
        <div className="border-b border-[#F0F2F8] pb-5 text-center">
          <div className="font-display text-[32px] font-bold tracking-tight text-[#0A0E27]">G$ {amtDisplay}</div>
          <div className="mt-1 font-display text-[14px] font-medium text-[#9AA5B8]">≈ ${amtDisplay} USD</div>
          {isStream && <div className="mt-1 font-display text-[13px] font-bold text-[#6B66E5]">streaming · per {intent.period}</div>}
        </div>

        <div className="pt-1">
          <ReviewRow label="To">
            <div>
              <div>{toName}</div>
              {resolvedAddr && <div className="mt-0.5 font-mono text-[12px] font-medium text-[#9AA5B8]">{shortAddr(resolvedAddr)}</div>}
            </div>
          </ReviewRow>
          <ReviewRow label="Network">GoodDollar ({IS_MAINNET ? "Celo" : "Alfajores"})</ReviewRow>
          <ReviewRow label="Fee" accent>
            Sponsored
          </ReviewRow>
          <ReviewRow label="Memo">{intent.memo || "—"}</ReviewRow>
        </div>
      </div>

      {!isAddress(recipientInput) && (
        <div className="mt-4 space-y-2 rounded-[20px] bg-white px-4 py-4 shadow-[0_4px_20px_rgba(11,16,32,0.05)]">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.1em] text-[#8E84AD]">Recipient address</span>
          <input
            className="w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 font-mono text-sm text-[#0A0E27] placeholder:text-[#B8C0D0] focus:border-[#4A90E2]/50 focus:outline-none focus:ring-2 focus:ring-[#4A90E2]/15"
            placeholder="0x…"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
          />
          <button type="button" className="press font-display text-[12px] font-bold text-[#6B66E5]" onClick={() => setRecipientInput(selfAddr)}>
            use my own address (for testing)
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 overflow-hidden rounded-[20px] bg-[#E3F2FD] px-4 py-3">
        <p className="flex-1 font-display text-[14px] font-semibold leading-snug text-[#4A90E2]">You can sign this offline.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ONBOARDING_MASCOT} alt="" className="h-14 w-14 shrink-0 object-contain" draggable={false} />
      </div>

      <div className="mt-auto pt-6">
        {isStream ? (
          <button type="button" disabled className="flex h-[52px] w-full items-center justify-center rounded-full bg-slate-200 font-display text-[16px] font-bold text-slate-400">
            Streaming coming soon
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onSign}
            className="press flex h-[52px] w-full items-center justify-center rounded-full font-display text-[16px] font-bold text-white shadow-[0_8px_24px_rgba(126,84,233,0.35)] disabled:opacity-70"
            style={{ background: "linear-gradient(90deg, #8E54E9 0%, #4776E6 100%)" }}
          >
            {busy ? "Signing…" : "Sign payment"}
          </button>
        )}
      </div>
    </div>
  )
}

function SignFootnote() {
  return <p className="mt-3 px-3 text-center text-[12px] leading-relaxed text-muted">Signed locally on this device. The key never leaves your browser.</p>
}

function PlanScreen({ actions, online, busy, selfAddr, onRun }: { actions: Action[]; online: boolean; busy: boolean; selfAddr: Hex; onRun: (a: Action[], r: Record<number, string>) => void }) {
  const [recips, setRecips] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    actions.forEach((a, i) => {
      if (a.type === "send" && isAddress(a.intent.recipient)) init[i] = a.intent.recipient
    })
    return init
  })
  return (
    <div className="animate-float-up flex min-h-full flex-col pt-2">
      <div className="mb-6 text-center">
        <Eyebrow className="justify-center">Voice multi-action</Eyebrow>
        <h2 className="mt-1 font-display text-[22px] font-black text-ink">Your plan, in order</h2>
      </div>

      <div className="relative pl-2">
        <div className="absolute bottom-10 left-[26px] top-3 border-l-2 border-dashed border-lilac-soft" />
        <div className="space-y-3">
          {actions.map((a, i) => (
            <div key={i} className="relative flex gap-3.5">
              <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet2 font-display text-[14px] font-extrabold text-white shadow-violetglow">
                {i + 1}
              </span>
              <Card className="flex-1 !p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lilac/25 text-violet2-deep">
                    {a.type === "claim" ? <Coin size={18} /> : a.type === "send" ? <ArrowUp size={18} /> : <List size={18} />}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-[15px] font-extrabold text-ink">
                      {a.type === "claim" && "Claim your UBI"}
                      {a.type === "send" && `Send ${a.intent.amount} G$`}
                      {a.type === "balance" && "Check balance"}
                    </div>
                    <div className="truncate text-[12px] text-muted">
                      {a.type === "claim" && "Today’s entitlement"}
                      {a.type === "send" && (a.intent.memo ? a.intent.memo : "From your balance")}
                      {a.type === "balance" && "Read-only"}
                    </div>
                  </div>
                </div>
                {a.type === "send" && !isAddress(recips[i] ?? a.intent.recipient) && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-cream px-3 py-2 font-mono text-[13px] text-ink focus:border-violet2/60 focus:outline-none"
                      placeholder={`0x… (${a.intent.recipient})`}
                      value={recips[i] ?? ""}
                      onChange={(e) => setRecips({ ...recips, [i]: e.target.value })}
                    />
                    <button className="press shrink-0 px-2 font-display text-[12px] font-bold text-violet2-deep" onClick={() => setRecips({ ...recips, [i]: selfAddr })}>
                      use mine
                    </button>
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-7">
        <PillButton size="block" variant={online ? "primary" : "violet"} disabled={busy} icon={<List size={18} />} onClick={() => onRun(actions, recips)}>
          {busy ? "Running…" : online ? "Run plan" : "Sign plan offline"}
        </PillButton>
        <SignFootnote />
      </div>
    </div>
  )
}

function SplitScreen({ draft, online, busy, selfAddr, onRun }: { draft: { split: SplitIntent; claimFirst: boolean }; online: boolean; busy: boolean; selfAddr: Hex; onRun: (s: SplitIntent, r: string[], claimFirst: boolean) => void }) {
  const { split } = draft
  const n = split.recipients.length
  const [recips, setRecips] = useState<string[]>(() => split.recipients.map((r) => (isAddress(r) ? r : "")))
  const [claimFirst, setClaimFirst] = useState(draft.claimFirst)
  const shares = splitEvenly(toBaseUnits(split.total), n)
  const set = (i: number, v: string) => setRecips((prev) => prev.map((x, j) => (j === i ? v : x)))
  const colors = ["bg-cyan/35", "bg-lilac/45", "bg-emerald-100", "bg-amber-100", "bg-sky"]
  return (
    <div className="animate-float-up flex min-h-full flex-col pt-2">
      <div className="text-center">
        <Eyebrow className="justify-center">Claim-and-Split</Eyebrow>
        <div className="mt-3 grid place-items-center">
          <GAmount value={split.total} size="text-[46px]" />
          <div className="mt-1 text-[14px] font-semibold text-slate2">
            split {n} ways · {fmtG(shares[0])} G$ each{split.memo ? ` · ${split.memo}` : ""}
          </div>
        </div>
      </div>

      <button
        onClick={() => setClaimFirst((v) => !v)}
        className={`press mt-5 inline-flex items-center gap-2 self-center rounded-full px-3.5 py-1.5 font-display text-[13px] font-bold ${claimFirst ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate2"}`}
      >
        <span className={`grid h-4 w-4 place-items-center rounded-full ${claimFirst ? "bg-emerald-500 text-white" : "bg-slate-300 text-white"}`}>{claimFirst && <Check size={12} />}</span>
        Claims your UBI first
      </button>

      <div className="mt-5 space-y-3">
        {split.recipients.map((name, i) => (
          <Card key={i} className="!p-3.5">
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-full font-display font-extrabold text-ink ${colors[i % colors.length]}`}>
                {isAddress(name) ? "0x" : name[0]?.toUpperCase()}
              </span>
              <div className="flex-1">
                <div className="font-display text-[15px] font-extrabold text-ink">{isAddress(name) ? shortAddr(name) : name}</div>
                <div className="text-[12px] text-muted">recipient {i + 1}</div>
              </div>
              <Chip tone="green">{fmtG(shares[i])} G$</Chip>
            </div>
            {!isAddress(recips[i]) && (
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  value={recips[i]}
                  onChange={(e) => set(i, e.target.value)}
                  placeholder="0x… address"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-cream px-3 py-2 font-mono text-[13px] text-ink placeholder:text-muted focus:border-violet2/60 focus:outline-none"
                />
                <button onClick={() => set(i, selfAddr)} className="press shrink-0 whitespace-nowrap px-2 font-display text-[12px] font-bold text-violet2-deep">
                  use mine
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-auto pt-7">
        <PillButton size="block" variant={online ? "primary" : "violet"} disabled={busy} icon={<Split size={18} />} onClick={() => onRun(split, recips, claimFirst)}>
          {busy ? "Signing…" : online ? "Sign & split" : "Sign split offline"}
        </PillButton>
        <p className="mt-3 text-center text-[12px] text-muted">One signature — everyone gets paid.</p>
      </div>
    </div>
  )
}

function SettledScreen({ entry, online, onDone, onActivity }: { entry: QueuedItem; online: boolean; onDone: () => void; onActivity: () => void }) {
  const queued = entry.status !== "settled"
  const isClaim = entry.kind === "claim"
  const title = queued ? (isClaim ? "Queued" : "Queued") : isClaim ? "Claimed!" : "Sent!"
  const to =
    entry.kind === "payment"
      ? `to ${shortAddr(entry.relay.recipient)}`
      : entry.kind === "split"
        ? `to ${entry.split.recipients.length} recipients`
        : "added to your wallet"
  return (
    <div className="animate-float-up flex min-h-full flex-col items-center justify-center px-2 py-10 text-center" style={{ background: "linear-gradient(180deg,#ffffff 0%,#f5f3ff 70%,#ede9fe 100%)" }}>
      <KumoMascot state={queued ? "sleeping" : "celebrating"} width={180} coin />
      <h1 className="mt-6 font-display text-[32px] font-black text-ink">{title}</h1>
      <p className="mt-2 max-w-[260px] text-[15px] font-semibold text-slate2">
        {queued ? "Saved offline. It settles itself the moment you reconnect." : online ? "Settled on Celo — gas paid by the relayer." : "Done."}
      </p>

      <Card className="mt-7 w-full !py-4">
        <div className="flex items-center justify-center gap-2">
          <span className="font-display text-[18px] font-bold text-ink">{itemLabel(entry)}</span>
        </div>
        <div className="mt-1 text-[13px] font-semibold text-slate2">{to}</div>
        <div className="mt-3 flex justify-center">
          {entry.txHash ? (
            <a
              href={txLink(entry.txHash)}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-display text-[12.5px] font-bold text-slate2 hover:bg-slate-200"
            >
              <Globe size={14} /> View on Celoscan <Arrow size={13} />
            </a>
          ) : (
            <StatusPill status={entry.status as ItemStatus} />
          )}
        </div>
      </Card>

      <div className="mt-7 grid w-full grid-cols-2 gap-3">
        <PillButton variant="secondary" size="lg" onClick={onActivity} icon={<ActivityIcon size={18} />}>
          Activity
        </PillButton>
        <PillButton size="lg" onClick={onDone}>
          Done
        </PillButton>
      </div>
    </div>
  )
}

function ActivityScreen({ queue, online, onFlush, onRemove }: { queue: QueuedItem[]; online: boolean; onFlush: () => void; onRemove: (id: string) => void }) {
  const pend = queue.filter((a) => a.status === "queued" || a.status === "settling")
  const done = queue.filter((a) => a.status === "settled")
  const problem = queue.filter((a) => a.status === "failed" || a.status === "expired")
  const Group = ({ title, items }: { title: string; items: QueuedItem[] }) =>
    items.length ? (
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <Eyebrow>{title}</Eyebrow>
        </div>
        <Card className="!p-2">
          {items.map((e, i) => (
            <ActivityRow key={e.id} e={e} last={i === items.length - 1} onRemove={onRemove} />
          ))}
        </Card>
      </div>
    ) : null
  return (
    <div className="animate-float-up pt-4">
      <div className="mb-4 flex items-center justify-between px-1">
        <h2 className="font-display text-[22px] font-black text-ink">Activity</h2>
        {pend.length > 0 && online && (
          <PillButton size="sm" variant="violet" onClick={onFlush} icon={<Bolt size={14} />}>
            Settle all ({pend.length})
          </PillButton>
        )}
      </div>
      {!online && pend.length > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-lilac/25 px-4 py-3">
          <WifiOff size={18} className="shrink-0 text-violet2-deep" />
          <span className="text-[13px] font-semibold text-violet2-deep">{pend.length} waiting offline · settles when you reconnect</span>
        </div>
      )}
      {queue.length === 0 ? (
        <Card className="text-sm text-slate2">Nothing here yet. Tap Pay, or Claim your UBI.</Card>
      ) : (
        <>
          <Group title="Pending" items={pend} />
          <Group title="Needs attention" items={problem} />
          <Group title="Settled" items={done} />
        </>
      )}
    </div>
  )
}

function IdentityScreen({ identity, ubi, address, streak, onClaim, busy, flash }: { identity: IdentityStatus | null; ubi: bigint | null; address: Hex; streak: Streak; onClaim: () => void; busy: boolean; flash: (m: string) => void }) {
  const canClaim = ubi != null && ubi > 0n
  const verified = !!identity?.isWhitelisted
  const streakBest = Math.max(streak.best, streak.count)
  const [verifying, setVerifying] = useState(false)
  const days = ["M", "T", "W", "T", "F", "S", "S"]
  const verify = async () => {
    setVerifying(true)
    const res = await startFaceVerification(`${window.location.origin}/app?verified=1`)
    setVerifying(false)
    if (!res.bound) flash("Opening GoodDollar verification…")
    window.location.href = res.url
  }
  return (
    <div
      className="animate-float-up relative min-h-full space-y-4 pb-2 pt-2"
      style={{ background: "linear-gradient(180deg, #F8FBFF 0%, #FAF8FF 45%, #F5F2FF 100%)" }}
    >
      <Sparkle size={12} className="pointer-events-none absolute right-8 top-6 text-[#E0D4FF] opacity-70" />
      <Sparkle size={10} className="pointer-events-none absolute left-6 top-24 text-white opacity-80" />
      <Sparkle size={11} className="pointer-events-none absolute right-12 top-[42%] text-[#DDD6FE] opacity-60" />

      <div className="relative px-0.5">
        <h2 className="font-display text-[28px] font-bold tracking-tight text-[#0A0E27]">Identity &amp; UBI</h2>
        <p className="mt-1 font-display text-[14px] font-medium text-[#9AA5B8]">Your identity. Your rewards.</p>
      </div>

      <button
        type="button"
        onClick={verified ? undefined : verify}
        disabled={verifying}
        className="press relative w-full rounded-[22px] bg-white px-4 py-4 text-left shadow-[0_4px_24px_rgba(11,16,32,0.06)] disabled:opacity-80"
      >
        {verified && (
          <span className="mb-3 inline-flex rounded-full bg-[#D1FAE5] px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-[#059669]">
            Verified
          </span>
        )}
        <div className="flex items-center gap-3.5">
          <span
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${
              verified ? "bg-gradient-to-br from-[#A7F3D0] to-[#6EE7B7] text-emerald-700" : "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-600"
            }`}
          >
            {verified ? <Shield size={28} /> : <Face size={28} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-display text-[16px] font-bold text-[#0A0E27]">
              {verified ? "Verified human" : verifying ? "Opening verification…" : "Not verified"}
              {verified && <CheckCircle size={16} className="text-emerald-500" />}
            </div>
            <div className="mt-0.5 text-[13px] font-medium text-[#9AA5B8]">
              {verified ? `GoodDollar Identity · ${shortAddr(address)}` : "Verify to unlock your UBI claim."}
            </div>
          </div>
          <ChevR size={18} className="shrink-0 text-[#C4CBD8]" />
        </div>
      </button>

      <div className="rounded-[22px] bg-white px-4 py-4 shadow-[0_4px_24px_rgba(11,16,32,0.06)]">
        <div className="flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-[#8E84AD]">Claim streak</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#EDE9FE] px-2.5 py-1 font-display text-[11px] font-bold text-[#6B66E5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={STREAK_FLAME} alt="" className="h-4 w-4 object-contain" draggable={false} />
            best {streakBest}
          </span>
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-1">
          {days.map((d, i) => {
            const completed = i < streak.count
            const current = i === streak.count
            return (
              <span
                key={i}
                className={`grid h-9 w-9 place-items-center rounded-full font-display text-[12px] font-bold ${
                  completed
                    ? "bg-[#7C5CFF] text-white shadow-[0_4px_12px_rgba(124,92,255,0.28)]"
                    : current
                      ? "bg-[#E8F4FF] text-[#4A90E2] ring-2 ring-[#7FE8FF]"
                      : "bg-[#F1F5F9] text-[#B8C0D0]"
                }`}
              >
                {completed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={STREAK_FLAME} alt="" className="h-4 w-4 object-contain brightness-[1.8] saturate-50" draggable={false} />
                ) : current ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={NAV_KUMO_MARK} alt="" className="h-5 w-5 object-contain" draggable={false} />
                ) : (
                  d
                )}
              </span>
            )
          })}
        </div>
        <p className="mt-3.5 font-display text-[13px] font-semibold text-[#9AA5B8]">
          <span className="text-[#6B66E5]">{streak.count}-day claim streak</span> · keep it going!
        </p>
      </div>

      <div className="relative overflow-hidden rounded-[22px] bg-white px-4 py-4 shadow-[0_4px_24px_rgba(11,16,32,0.06)]">
        <div className="pointer-events-none absolute -bottom-6 -right-4 opacity-50">
          <CloudMark size={90} color="#B7F1FF" />
        </div>
        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-[#7CB8E8]">Daily UBI entitlement</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E8F4FF] px-2.5 py-1 font-display text-[11px] font-bold text-[#4A90E2]">
              <Bolt size={12} />
              Gasless · relayer
            </span>
          </div>
          <div className="mt-2">
            <GAmount value={ubi == null ? "0" : fmtG(ubi)} size="text-[36px]" />
          </div>
          <button
            type="button"
            disabled={busy || !canClaim}
            onClick={onClaim}
            className="press mt-4 flex h-[52px] w-full items-center justify-center gap-2 rounded-full font-display text-[15px] font-bold text-[#0A0E27] shadow-[0_4px_16px_rgba(127,232,255,0.25)] disabled:shadow-none"
            style={{
              background: canClaim ? "linear-gradient(90deg, #7FE8FF 0%, #B7F1FF 100%)" : "linear-gradient(90deg, #E8F4FF 0%, #EDF6FF 100%)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NAV_KUMO_MARK} alt="" className="h-6 w-6 object-contain" draggable={false} />
            {busy ? "Claiming…" : canClaim ? "Claim today's UBI" : "Already claimed today"}
          </button>
          <p className="mt-3 text-center font-display text-[12px] font-medium text-[#9AA5B8]">Gasless via the relayer. Verification is required to receive UBI.</p>
        </div>
      </div>
    </div>
  )
}

function ProfileLabel({ children, color = "#7CB8E8" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color }}>
      {children}
    </span>
  )
}

function ProfileCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[22px] bg-white px-4 py-4 shadow-[0_4px_24px_rgba(11,16,32,0.06)] ${className}`}>
      {children}
    </div>
  )
}

// Offline voice (on-device Whisper) — download / enable, lives on the Wallet (options) screen.
function OfflineVoiceCard({ flash }: { flash: (m: string) => void }) {
  const [supported, setSupported] = useState(true)
  const [downloaded, setDownloaded] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<VoiceProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupported(voiceModelSupported() && micSupported())
    setDownloaded(isVoiceDownloaded())
    setEnabled(isVoiceEnabled())
  }, [])

  const onDownload = async () => {
    setError(null)
    setDownloading(true)
    try {
      await downloadVoiceModel((p) => setProgress(p))
      setDownloaded(true)
      setEnabled(true)
      setVoiceEnabled(true)
      flash("Offline voice ready 🎤")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
      setProgress(null)
    }
  }

  const toggle = () => {
    const v = !enabled
    setEnabled(v)
    setVoiceEnabled(v)
  }

  const pct = progress ? Math.round(progress.pct * 100) : 0
  const mb = (n: number) => `${Math.round(n / 1e6)} MB`

  return (
    <ProfileCard className="relative">
      <span className="absolute right-4 top-4 rounded-full bg-[#EDE9FE] px-2.5 py-0.5 font-display text-[10px] font-bold text-[#6B66E5]">
        {downloaded ? "Ready" : "Optional"}
      </span>

      <div className="flex items-start gap-3.5 pr-16">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EDE9FE] text-[#6B66E5]">
          <Mic size={22} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <ProfileLabel color="#8E84AD">Offline voice</ProfileLabel>
          <div className="mt-1 font-display text-[15px] font-bold text-[#0A0E27]">{VOICE_MODEL_LABEL}</div>
          <div className="mt-0.5 font-display text-[12px] font-medium text-[#9AA5B8]">
            {VOICE_MODEL_SIZE_LABEL}, one-time download, stays on your device
          </div>
        </div>
      </div>

      {!supported ? (
        <p className="mt-3 text-[12px] text-muted">This browser can’t run on-device voice. You can still type, or use online voice where supported.</p>
      ) : downloading ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-violet2 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between font-display text-[12px] font-bold text-slate2">
            <span>{pct}% {progress ? `· ${mb(progress.loadedBytes)} / ${mb(progress.totalBytes)}` : "· starting…"}</span>
            <span className="text-violet2-deep">downloading…</span>
          </div>
        </div>
      ) : downloaded ? (
        <button onClick={toggle} className="press mt-4 flex w-full items-center justify-between rounded-xl bg-cream px-3.5 py-2.5">
          <span className="font-display text-[13.5px] font-bold text-ink">Use voice offline</span>
          <span className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-violet2" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onDownload}
          className="press relative mt-4 flex h-[52px] w-full items-center justify-center gap-2 overflow-hidden rounded-full font-display text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(124,92,255,0.35)]"
          style={{ background: "linear-gradient(90deg, #8E54E9 0%, #6B66E5 45%, #4776E6 100%)" }}
        >
          <Download size={18} />
          Download {VOICE_MODEL_SIZE_LABEL}
          <Sparkle size={10} className="pointer-events-none absolute left-[18%] top-3 text-white/70" />
          <Sparkle size={8} className="pointer-events-none absolute right-[22%] bottom-3 text-white/60" />
        </button>
      )}

      {error && <p className="mt-2 font-display text-[12px] font-semibold text-red-600">{error}</p>}
      <p className="mt-3 flex items-start gap-1.5 font-display text-[12px] font-medium leading-relaxed text-[#9AA5B8]">
        <Sparkle size={12} className="mt-0.5 shrink-0 text-[#C7B5FF]" />
        Lets you dictate payments with no signal. Without it, voice uses the network and typed input still works.
      </p>
    </ProfileCard>
  )
}

function WalletScreen({ address, relayer, onReset, onImport, flash }: { address: Hex; relayer: RelayerInfo | null; onReset: () => void; onImport: (pk: string) => void; flash: (m: string) => void }) {
  const [pk, setPk] = useState<string | null>(null)
  const [importPk, setImportPk] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copied, setCopied] = useState(false)
  const toggleReveal = async () => {
    if (pk) return setPk(null)
    try {
      setPk(await revealKey()) // prompts Face ID for a passkey-secured wallet
    } catch (e) {
      flash((e as Error).message || "Couldn't reveal the key")
    }
  }
  const copyAddr = () => {
    navigator.clipboard?.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="animate-float-up relative -mx-5 min-h-full pb-2">
      <div
        className="relative overflow-hidden px-5 pb-8 pt-1"
        style={{ background: "linear-gradient(180deg, #C8E4FF 0%, #DDEFFF 28%, #EEF6FF 55%, #F8FBFF 85%, #FFFFFF 100%)" }}
      >
        <Sparkle size={10} className="pointer-events-none absolute left-10 top-16 text-white opacity-80" />
        <Sparkle size={8} className="pointer-events-none absolute right-16 top-6 text-[#DDD6FE] opacity-70" />
        <Sparkle size={9} className="pointer-events-none absolute left-1/3 top-28 text-white opacity-60" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="max-w-[58%] pt-3">
            <h2 className="font-display text-[28px] font-bold tracking-tight text-[#0A0E27]">Wallet</h2>
            <p className="mt-1 font-display text-[14px] font-medium text-[#9AA5B8]">Your secure, cloud-powered wallet.</p>
          </div>
          <div className="relative -mr-1 w-[148px] shrink-0 pt-1">
            <div
              className="pointer-events-none absolute bottom-[2%] left-1/2 h-10 w-[80%] -translate-x-1/2 rounded-full blur-2xl"
              style={{ background: "radial-gradient(ellipse at center, rgba(183,241,255,0.75) 0%, rgba(183,241,255,0) 70%)" }}
              aria-hidden
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={PROFILE_MASCOT}
              alt=""
              width={132}
              height={132}
              className="relative z-10 mx-auto h-[118px] w-[118px] object-contain"
              draggable={false}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-5 pt-1">
        <ProfileCard>
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#E8F4FF] text-[#4A90E2]">
              <Wallet size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <ProfileLabel>Your address</ProfileLabel>
              <p className="mt-1 truncate font-display text-[16px] font-bold text-[#0A0E27]">{shortAddr(address)}</p>
            </div>
            <button
              type="button"
              onClick={copyAddr}
              aria-label="Copy address"
              className="press grid h-10 w-10 shrink-0 place-items-center text-[#4A90E2]"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </ProfileCard>

        <ProfileCard>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EDE9FE] text-[#6B66E5]">
                <Shield size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <ProfileLabel color="#8E84AD">Private key</ProfileLabel>
                <p className="mt-1 font-display text-[13px] font-medium text-[#9AA5B8]">Burner wallet, back it up</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleReveal}
              className="press inline-flex shrink-0 items-center gap-1.5 font-display text-[13px] font-bold text-[#6B66E5]"
            >
              {pk ? <Lock size={15} /> : <Eye size={15} />}
              {pk ? "Hide" : "Reveal"}
            </button>
          </div>
          {pk ? (
            <button
              type="button"
              className="relative mt-4 block w-full overflow-hidden rounded-full bg-[#0B1020] px-4 py-3.5 text-left font-mono text-[12px] text-[#7FE8FF]"
              onClick={() => {
                navigator.clipboard?.writeText(pk)
                flash("Private key copied")
              }}
            >
              <span className="block truncate">{pk}</span>
              <Sparkle size={10} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/80" />
            </button>
          ) : (
            <div className="relative mt-4 overflow-hidden rounded-full bg-[#0B1020] px-4 py-3.5">
              <p
                className="truncate font-mono text-[13px] tracking-[0.22em] text-transparent select-none"
                style={{ textShadow: "0 0 10px rgba(255,255,255,0.65)" }}
              >
                ••••••••••••••••••••••••••••••••
              </p>
              <Sparkle size={10} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/80" />
              <Sparkle size={7} className="pointer-events-none absolute right-9 top-[38%] text-white/50" />
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 font-display text-[12px] font-medium leading-relaxed text-[#9AA5B8]">
            <Lock size={12} className="mt-0.5 shrink-0 text-[#B8C0D0]" />
            Stored only in this browser. Export it to keep your funds safe.
          </p>
        </ProfileCard>

        <ProfileCard className="!py-2">
          <div className="flex items-center justify-between gap-4 border-b border-dashed border-[#E2E8F0] py-3">
            <span className="inline-flex items-center gap-2">
              <LinkIcon size={14} className="text-[#7CB8E8]" />
              <ProfileLabel>Chain</ProfileLabel>
            </span>
            <span className="inline-flex items-center gap-1.5 font-display text-[14px] font-bold text-[#0A0E27]">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {IS_MAINNET ? "Celo" : String(relayer?.chainId ?? CHAIN_ID)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-dashed border-[#E2E8F0] py-3">
            <span className="inline-flex items-center gap-2">
              <Users size={14} className="text-[#7CB8E8]" />
              <ProfileLabel>Relayer</ProfileLabel>
            </span>
            <span className="truncate font-display text-[14px] font-bold text-[#0A0E27]">
              {relayer?.relayerAddress ? shortAddr(relayer.relayerAddress) : relayer?.dryRun ? "dry-run" : "not connected"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="inline-flex items-center gap-2">
              <Bolt size={14} className="text-[#7CB8E8]" />
              <ProfileLabel>Gas paid in</ProfileLabel>
            </span>
            <span className="rounded-full bg-[#D1FAE5] px-3 py-1 font-display text-[12px] font-bold text-emerald-700">
              {relayer?.feeCurrency ?? "cUSD"}
            </span>
          </div>
        </ProfileCard>

        <OfflineVoiceCard flash={flash} />

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="press mx-auto flex min-h-[44px] items-center justify-center gap-1 font-display text-[13px] font-semibold text-[#9AA5B8]"
        >
          {showAdvanced ? "Hide advanced" : "Advanced options"}
          <ChevR size={14} className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
        </button>

        {showAdvanced && (
          <div className="space-y-3">
            <ProfileCard className="space-y-3">
              <ProfileLabel color="#8E84AD">Import a different key</ProfileLabel>
              <input
                className="field font-mono text-xs"
                placeholder="0x… private key"
                value={importPk}
                onChange={(e) => setImportPk(e.target.value)}
              />
              <PillButton
                variant="secondary"
                size="block"
                disabled={!importPk.trim()}
                icon={<Download size={18} />}
                onClick={() => {
                  onImport(importPk)
                  setImportPk("")
                }}
              >
                Import
              </PillButton>
            </ProfileCard>
            <PillButton
              variant="danger"
              size="block"
              icon={<Trash size={18} />}
              onClick={() => {
                if (confirm("Reset wallet? Export your key first or funds are lost.")) onReset()
              }}
            >
              Reset wallet
            </PillButton>
            <p className="px-2 text-center font-display text-[12px] font-medium text-[#9AA5B8]">
              Resetting erases this in-browser wallet. Make sure you&apos;ve saved your key.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// --- small UI ---------------------------------------------------------------
function Toast({ message }: { message: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto w-fit max-w-[min(90%,calc(100%-2rem))] animate-pop">
      <div className="flex items-center gap-2.5 rounded-full bg-ink py-2.5 pl-3 pr-4 text-white shadow-cardlg">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500">
          <Check size={15} />
        </span>
        <span className="font-display text-[14px] font-bold">{message}</span>
      </div>
    </div>
  )
}

function TabBar({
  screen,
  setScreen,
  queueCount,
  onPay,
}: {
  screen: Screen
  setScreen: (s: Screen) => void
  queueCount: number
  onPay: () => void
}) {
  const sideTabs: {
    id: Screen
    icon: (p: { size?: number; stroke?: number }) => React.ReactNode
    label: string
    badge?: number
  }[] = [
    { id: "home", icon: Home, label: "Home" },
    { id: "activity", icon: Wallet, label: "Activity", badge: queueCount },
    { id: "identity", icon: IdentityIcon, label: "Identity" },
    { id: "wallet", icon: User, label: "Profile" },
  ]

  const tabBtn = (t: (typeof sideTabs)[number]) => {
    const active = screen === t.id
    const Icon = t.icon
    return (
      <button
        key={t.id}
        onClick={() => setScreen(t.id)}
        aria-label={t.label}
        aria-current={active}
        className="press relative flex min-h-[52px] flex-1 flex-col items-center justify-end gap-1 pb-1.5 pt-6"
      >
        <span style={{ color: active ? "#0B1020" : "#94a3b8" }}>
          <Icon size={22} stroke={active ? 2.2 : 1.8} />
        </span>
        <span className="font-display text-[11px] font-semibold" style={{ color: active ? "#0B1020" : "#94a3b8" }}>
          {t.label}
        </span>
        {t.badge ? (
          <span className="absolute right-2 top-5 grid h-4 min-w-4 place-items-center rounded-full bg-violet2 px-1 text-[10px] font-bold text-white">
            {t.badge}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-full border-t border-slate-100/90 bg-white pb-[max(env(safe-area-inset-bottom),8px)] shadow-[0_-4px_20px_rgba(11,16,32,0.04)] md:max-w-[440px]">
      <div className="relative flex items-end justify-between px-2">
        {sideTabs.slice(0, 2).map(tabBtn)}
        <div className="flex w-[76px] shrink-0 flex-col items-center justify-end pb-1.5">
          <button
            type="button"
            onClick={onPay}
            aria-label="Pay with Kumo"
            className="press absolute -top-8 grid h-[62px] w-[62px] place-items-center rounded-full shadow-[0_10px_28px_rgba(127,232,255,0.65)] ring-4 ring-white"
            style={{ background: "linear-gradient(180deg, #C8F4FF 0%, #7FE8FF 50%, #5DD4F5 100%)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NAV_KUMO_MARK} alt="" width={42} height={42} className="h-[42px] w-[42px] object-contain" draggable={false} />
          </button>
          <span className="h-[24px]" aria-hidden="true" />
        </div>
        {sideTabs.slice(2).map(tabBtn)}
      </div>
    </nav>
  )
}
