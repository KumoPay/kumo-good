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
  Link as LinkIcon,
  Globe,
  Face,
  CheckCircle,
  Eye,
  Lock,
  Download,
  Trash,
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
  if (!address) return <Onboarding onCreate={onCreateWallet} />

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
        <TopBar online={online} relayer={relayer} streak={streak} onToggle={undefined} />
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
            }}
            onImport={(pk) => {
              try {
                importWallet(pk)
                const a = getAddress()
                setAddress(a)
                if (a) refreshChain(a)
              } catch (e) {
                flash((e as Error).message)
              }
            }}
            flash={flash}
          />
        )}
      </div>

      {isTab && <TabBar screen={screen} setScreen={setScreen} queueCount={pending(queue).length} />}
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
function Onboarding({ onCreate }: { onCreate: () => void }) {
  const rows = [
    { icon: <Mic size={20} />, t: "Say it", s: "Voice or text — “send 5 to Maria”." },
    { icon: <Lock size={20} />, t: "Sign offline", s: "Your key never leaves this browser." },
    { icon: <Wifi size={20} />, t: "Settles itself", s: "Gas paid in cUSD by a relayer." },
  ]
  return (
    <main className="app-shell">
      <div
        className="animate-float-up flex min-h-full flex-col px-6 pb-8 pt-12"
        style={{ background: "linear-gradient(180deg,#ffffff 0%,#f5f3ff 60%,#ede9fe 100%)" }}
      >
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <KumoMascot state="waving" width={188} parens coin />
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
          <PillButton size="block" onClick={onCreate} iconRight={<Arrow size={18} />}>
            Create my wallet
          </PillButton>
          <button onClick={onCreate} className="press w-full py-1.5 text-center font-display text-[14.5px] font-bold text-violet2-deep">
            Import an existing key
          </button>
          <p className="px-4 text-center text-[12px] leading-relaxed text-muted">A non-custodial wallet is generated in this browser. Only you hold the key.</p>
        </div>
      </div>
    </main>
  )
}

function TopBar({ online, relayer, streak, onToggle }: { online: boolean; relayer: RelayerInfo | null; streak: Streak; onToggle?: () => void }) {
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-100 bg-white/85 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <KumoMark size={32} />
        <span className="font-display text-[16px] font-extrabold tracking-tight">Kumo</span>
      </div>
      <div className="flex items-center gap-2">
        {streak.count > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-display text-[12px] font-bold text-amber-700">
            <Flame size={13} /> {streak.count}
          </span>
        )}
        <OnlineChip online={online} onClick={onToggle} asButton={!!onToggle} />
      </div>
    </div>
  )
}

function FlowHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-100 bg-white/90 px-3 backdrop-blur">
      <button onClick={onBack} aria-label="Back" className="press grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-slate-100">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <span className="font-display text-[16px] font-extrabold text-ink">{title}</span>
      <div className="flex w-9 justify-end">{right}</div>
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
  const { balance, portfolio, identity, ubi, queue, onPay, onClaim, onRequest, onActivity, busy, online, streak } = props
  const pend = pending(queue)
  const canClaim = ubi != null && ubi > 0n
  return (
    <div className="animate-float-up space-y-4 pt-4">
      {/* greeting + state-reactive mascot */}
      <div className="flex items-center gap-3 px-1">
        <KumoMascot state={online ? "signal" : "offline"} width={56} float={false} />
        <div>
          <div className="font-display text-[17px] font-extrabold leading-tight text-ink">Hi there 👋</div>
          <div className="text-[12.5px] font-semibold" style={{ color: online ? "#16a34a" : "#7c5cff" }}>
            {online ? "Online · everything settles itself" : "Offline · I’ll queue your payments"}
          </div>
        </div>
      </div>

      {/* balance card */}
      <Card className="relative overflow-hidden !p-0">
        <div className="absolute -right-8 -top-10 opacity-20">
          <CloudMark size={130} color="#C7B5FF" />
        </div>
        <div className="relative p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Your balance</Eyebrow>
            {identity?.isWhitelisted ? (
              <Chip tone="green" icon={<CheckCircle size={14} />}>
                Verified human
              </Chip>
            ) : (
              <Chip tone="slate" icon={<Shield size={14} />}>
                Not verified
              </Chip>
            )}
          </div>
          <div className="mt-2 flex items-end justify-between">
            <GAmount value={balance == null ? "—" : fmtG(balance)} size="text-[42px]" />
            {streak.count > 0 && (
              <Chip tone="amber" icon={<Flame size={14} />}>
                {streak.count}
              </Chip>
            )}
          </div>
          {!online && pend.length > 0 && (
            <button onClick={onActivity} className="press mt-4 flex w-full items-center gap-2.5 rounded-xl bg-lilac/25 px-3.5 py-2.5 text-left">
              <WifiOff size={18} className="shrink-0 text-violet2-deep" />
              <span className="flex-1 text-[13px] font-semibold text-violet2-deep">{pend.length} queued · settles when you reconnect</span>
              <Arrow size={16} className="shrink-0 text-violet2-deep" />
            </button>
          )}
        </div>
      </Card>

      {/* primary actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onPay} className="press flex flex-col items-start gap-6 rounded-card bg-cyan p-4 text-ink shadow-glow">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/55">
            <ArrowUp size={22} />
          </span>
          <span className="font-display text-[17px] font-extrabold">Pay</span>
        </button>
        <button
          onClick={onClaim}
          disabled={busy || !canClaim}
          className="press flex flex-col items-start gap-6 rounded-card bg-gradient-to-br from-violet2 to-violet2-soft p-4 text-white shadow-violetglow disabled:opacity-60"
        >
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20">
            <Coin size={22} />
          </span>
          <span className="font-display text-[17px] font-extrabold leading-tight">
            {canClaim ? (
              <>
                Claim {fmtG(ubi!)} G$
                <br />
                <span className="text-[12px] font-bold text-white/75">Today’s UBI</span>
              </>
            ) : (
              <>
                UBI claimed
                <br />
                <span className="text-[12px] font-bold text-white/75">Come back tomorrow</span>
              </>
            )}
          </span>
        </button>
      </div>

      <button
        onClick={onRequest}
        className="press flex w-full items-center justify-center gap-2.5 rounded-card bg-white p-4 font-display text-[15px] font-extrabold text-ink shadow-card ring-[1.5px] ring-inset ring-ink/85"
      >
        <QrCode size={20} /> Request money (QR)
      </button>

      {/* portfolio */}
      <div>
        <div className="mb-2 px-1">
          <Eyebrow>Portfolio</Eyebrow>
        </div>
        {portfolio.length === 0 ? (
          <Card className="text-sm text-slate2">{online ? "Loading your tokens…" : "Reconnect to load your tokens."}</Card>
        ) : (
          <Card className="!p-2">
            {portfolio.map((t, i) => (
              <TokenRow key={t.symbol} t={t} last={i === portfolio.length - 1} />
            ))}
          </Card>
        )}
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
                <button className="text-[11px] font-semibold text-muted" onClick={() => onRemove(e.id)}>
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
    <div className="animate-float-up flex min-h-full flex-col pt-2">
      <div className="text-center">
        <Eyebrow className="justify-center">Pay or claim</Eyebrow>
        <h2 className="mt-1 font-display text-[22px] font-black text-ink">Say what you want to do</h2>
      </div>

      {/* mic */}
      <div className="my-7 grid place-items-center">
        <div className="relative grid h-[132px] w-[132px] place-items-center">
          {micActive && (
            <>
              <span className="absolute inset-0 rounded-full bg-lilac/40 animate-halo" />
              <span className="absolute inset-0 rounded-full bg-lilac/30 animate-halo" style={{ animationDelay: "0.5s" }} />
            </>
          )}
          <button
            onClick={toggleVoice}
            disabled={vstate === "transcribing"}
            aria-label={micActive ? "Stop" : "Start voice input"}
            className={`press relative grid h-[104px] w-[104px] place-items-center rounded-full text-white shadow-violetglow disabled:opacity-70 ${micActive ? "bg-violet2-deep" : "bg-violet2"}`}
          >
            <Mic size={40} />
          </button>
        </div>
        <p className="mt-3 h-5 font-display text-[13px] font-bold" style={{ color: micActive || vstate === "transcribing" ? "#6d28d9" : "#94a3b8" }}>
          {micLabel}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold text-muted">{offlineVoice ? "On-device · works offline" : "Voice uses the network · enable offline voice in Wallet"}</p>
      </div>

      <Field textarea rows={3} value={text} onChange={setText} placeholder="send 5 to 0x… for lunch — or — claim my UBI and send 2 to mom" />

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            onClick={() => setText(c.fill)}
            className="press rounded-full bg-cyan/30 px-3 py-1.5 font-display text-[12.5px] font-bold text-ink hover:bg-cyan/45"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-auto grid grid-cols-[auto_1fr] gap-3 pt-7">
        <PillButton variant="secondary" size="lg" onClick={onScan} icon={<Scan size={18} />}>
          Scan QR
        </PillButton>
        <PillButton size="lg" disabled={!text.trim()} onClick={() => onSubmit(text)} iconRight={<Arrow size={18} />}>
          Review
        </PillButton>
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
  return (
    <div className="animate-float-up flex min-h-full flex-col pt-2">
      <div className="mb-5 text-center">
        <Eyebrow className="justify-center">Scan to pay</Eyebrow>
        <h2 className="mt-1 font-display text-[22px] font-black text-ink">Point at a payment QR</h2>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-3xl bg-ink" style={{ background: "radial-gradient(120% 120% at 50% 0%, #1b2336 0%, #0B1020 70%)" }}>
        {supported ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
        ) : (
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 30% 30%, #7c5cff55, transparent 40%), radial-gradient(circle at 70% 70%, #7FE8FF44, transparent 45%)" }} />
        )}
        {/* corner brackets */}
        {[
          ["top-6 left-6", "border-t-4 border-l-4 rounded-tl-xl"],
          ["top-6 right-6", "border-t-4 border-r-4 rounded-tr-xl"],
          ["bottom-6 left-6", "border-b-4 border-l-4 rounded-bl-xl"],
          ["bottom-6 right-6", "border-b-4 border-r-4 rounded-br-xl"],
        ].map(([pos, b], i) => (
          <span key={i} className={`absolute ${pos} h-12 w-12 ${b} border-cyan`} />
        ))}
        <span className="absolute left-8 right-8 h-0.5 bg-cyan shadow-glow animate-scanline" style={{ top: "20%" }} />
        <div className="absolute inset-x-0 bottom-5 text-center text-[13px] font-semibold text-white/70">{supported ? "Point at a QR" : "Camera unavailable — paste a link"}</div>
      </div>

      <div className="my-5 flex items-center gap-3 text-muted">
        <span className="flex-1 border-t border-dashed border-lilac-soft" />
        <span className="font-display text-[12px] font-bold">or paste a link</span>
        <span className="flex-1 border-t border-dashed border-lilac-soft" />
      </div>

      <Field value={paste} onChange={setPaste} mono placeholder="https://…?r=kumo-good:pay:v1:…" prefix={<LinkIcon size={16} />} />
      <PillButton variant="secondary" size="block" className="mt-3" disabled={!paste.trim()} onClick={() => onResult(paste.trim())}>
        Use link
      </PillButton>
    </div>
  )
}

function RequestScreen({ address, flash }: { address: Hex; flash: (m: string) => void }) {
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [label, setLabel] = useState("")
  const [qr, setQr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const make = async () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return flash("Enter an amount")
    const uri = buildPaymentRequest({ to: address, amount: amt, ...(memo ? { memo } : {}), ...(label ? { label } : {}), token: G_TOKEN_ADDR, chainId: CHAIN_ID })
    const url = `${window.location.origin}/app?r=${encodeURIComponent(uri)}`
    setLink(url)
    setQr(await toQrDataUrl(url))
  }
  return (
    <div className="animate-float-up pt-2">
      <div className="mb-5 text-center">
        <Eyebrow className="justify-center">Request money</Eyebrow>
        <h2 className="mt-1 font-display text-[22px] font-black text-ink">Make a “pay me” QR</h2>
      </div>

      {qr && link ? (
        <Card className="flex flex-col items-center !py-6">
          <div className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="payment request QR" className="h-44 w-44 rounded-xl" />
          </div>
          <div className="mt-3 text-center">
            <GAmount value={amount || "0"} size="text-[26px]" />
            <div className="mt-0.5 text-[13px] font-semibold text-slate2">
              to {label || "you"}
              {memo ? ` · ${memo}` : ""}
            </div>
          </div>
          <Chip tone="lilac" className="mt-3" icon={<WifiOff size={13} />}>
            Works offline
          </Chip>
          <PillButton variant="secondary" size="block" className="mt-4" icon={<Copy size={18} />} onClick={() => { navigator.clipboard?.writeText(link); flash("Link copied") }}>
            Copy link
          </PillButton>
          <button className="press mt-2 font-display text-[13px] font-bold text-violet2-deep" onClick={() => { setQr(null); setLink(null) }}>
            New request
          </button>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            <Field label="Amount" value={amount} onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} inputMode="decimal" suffix="G$" placeholder="30" />
            <Field label="Your name / stall (optional)" value={label} onChange={setLabel} placeholder="Tea Stall" />
            <Field label="Memo (optional)" value={memo} onChange={setMemo} placeholder="chai" />
          </div>
          <PillButton size="block" className="mt-5" icon={<QrCode size={18} />} onClick={make}>
            Create QR
          </PillButton>
        </>
      )}
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
  const { intent, recipientInput, setRecipientInput, online, busy, onSign, selfAddr } = props
  const isStream = !!intent.period
  return (
    <div className="animate-float-up flex min-h-full flex-col pt-2">
      <div className="text-center">
        <Eyebrow className="justify-center">Confirm payment</Eyebrow>
        <div className="mt-4 grid place-items-center">
          <GAmount value={intent.amount} size="text-[52px]" />
          <div className="mt-1 text-[14px] font-semibold text-slate2">to {isAddress(recipientInput) ? shortAddr(recipientInput) : intent.recipient}</div>
          {isStream && <div className="mt-1 text-[13px] font-bold text-violet2-deep">streaming · per {intent.period}</div>}
        </div>
      </div>

      <Card className="mt-7 !py-1">
        <KvRow label="To">
          <span className="font-mono text-[13px]">{isAddress(recipientInput) ? shortAddr(recipientInput) : "—"}</span>
        </KvRow>
        <KvRow label="For">{intent.memo || "—"}</KvRow>
        <KvRow label="Expires in">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={15} className="text-violet2" />
            14 days
          </span>
        </KvRow>
        <KvRow label="Gas" last>
          <Chip tone="lilac">Paid by relayer · cUSD</Chip>
        </KvRow>
      </Card>

      {!isAddress(recipientInput) && (
        <Card className="mt-3 space-y-2">
          <Eyebrow>Recipient address</Eyebrow>
          <input
            className="field font-mono text-sm"
            placeholder="0x…"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
          />
          <button className="press font-display text-[12px] font-bold text-violet2-deep" onClick={() => setRecipientInput(selfAddr)}>
            use my own address (for testing)
          </button>
        </Card>
      )}

      <div className="mt-5 flex items-center justify-center">
        {online ? (
          <Chip tone="cyan" icon={<Wifi size={14} />}>
            Online · settles instantly
          </Chip>
        ) : (
          <Chip tone="lilac" icon={<WifiOff size={14} />}>
            Offline · will queue &amp; settle later
          </Chip>
        )}
      </div>

      <div className="mt-auto pt-7">
        {isStream ? (
          <PillButton variant="ghost" size="block" disabled>
            Streaming coming soon
          </PillButton>
        ) : (
          <PillButton size="block" variant={online ? "primary" : "violet"} disabled={busy} icon={online ? <Shield size={18} /> : <Lock size={18} />} onClick={onSign}>
            {busy ? "Signing…" : online ? "Sign & pay" : "Sign offline"}
          </PillButton>
        )}
        <SignFootnote />
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
  const [verifying, setVerifying] = useState(false)
  const verify = async () => {
    setVerifying(true)
    const res = await startFaceVerification(`${window.location.origin}/app?verified=1`)
    setVerifying(false)
    if (!res.bound) flash("Opening GoodDollar verification…")
    window.location.href = res.url
  }
  return (
    <div className="animate-float-up space-y-4 pt-4">
      <h2 className="px-1 font-display text-[22px] font-black text-ink">Identity &amp; UBI</h2>

      {/* verification */}
      <Card className={verified ? "ring-1 ring-emerald-100" : ""}>
        <div className="flex items-center gap-3.5">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${verified ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
            {verified ? <CheckCircle size={26} /> : <Face size={26} />}
          </span>
          <div className="flex-1">
            <div className="font-display text-[16px] font-extrabold text-ink">{verified ? "Verified human" : "Not verified"}</div>
            <div className="text-[13px] text-slate2">{verified ? `GoodDollar Identity · ${shortAddr(address)}` : "Verify to unlock your UBI claim."}</div>
          </div>
          {!verified && (
            <PillButton size="sm" onClick={verify} disabled={verifying} icon={<Face size={16} />}>
              {verifying ? "…" : "Verify"}
            </PillButton>
          )}
        </div>
      </Card>

      {/* streak */}
      <Card>
        <div className="flex items-center justify-between">
          <Eyebrow>Claim streak</Eyebrow>
          <Chip tone="amber" icon={<Flame size={14} />}>
            best {streak.best}
          </Chip>
        </div>
        <div className="mt-3 flex items-center justify-between">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span
              key={i}
              className={`grid h-8 w-8 place-items-center rounded-full font-display text-[13px] font-extrabold ${
                i < streak.count ? "bg-violet2 text-white" : i === streak.count ? "bg-cyan/40 text-ink ring-2 ring-cyan" : "bg-slate-100 text-muted"
              }`}
            >
              {i < streak.count ? <Flame size={15} /> : d}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[13.5px] font-semibold text-slate2">{streak.count}-day claim streak · keep it going!</p>
      </Card>

      {/* UBI entitlement */}
      <Card className="relative overflow-hidden">
        <div className="absolute -bottom-8 -right-6 opacity-15">
          <CloudMark size={110} color="#7FE8FF" />
        </div>
        <div className="relative">
          <Eyebrow>Daily UBI entitlement</Eyebrow>
          <div className="mt-2 flex items-end justify-between">
            <GAmount value={ubi == null ? "—" : fmtG(ubi)} size="text-[34px]" />
            <Chip tone="lilac">Gasless · relayer</Chip>
          </div>
          <PillButton size="block" className="mt-4" variant="violet" disabled={busy || !canClaim} icon={<Coin size={18} />} onClick={onClaim}>
            {canClaim ? "Claim today’s UBI" : "Already claimed today"}
          </PillButton>
          <p className="mt-2 text-center text-[12px] text-muted">Gasless via the relayer. Verification is required to receive UBI.</p>
        </div>
      </Card>
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
    <Card>
      <div className="flex items-center justify-between">
        <Eyebrow>Offline voice</Eyebrow>
        {downloaded ? (
          <Chip tone="green" icon={<Check size={13} />}>
            Ready
          </Chip>
        ) : (
          <Chip tone="lilac">Optional</Chip>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-lilac/30 text-violet2-deep">
          <Mic size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-extrabold text-ink">{VOICE_MODEL_LABEL}</div>
          <div className="text-[12px] text-muted">{VOICE_MODEL_SIZE_LABEL} · one-time download · stays on your device</div>
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
        <PillButton variant="violet" size="block" className="mt-4" icon={<Download size={18} />} onClick={onDownload}>
          Download {VOICE_MODEL_SIZE_LABEL}
        </PillButton>
      )}

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
      <p className="mt-2 text-[12px] text-muted">Lets you dictate payments with no signal. Without it, voice uses the network and typing always works.</p>
    </Card>
  )
}

function WalletScreen({ address, relayer, onReset, onImport, flash }: { address: Hex; relayer: RelayerInfo | null; onReset: () => void; onImport: (pk: string) => void; flash: (m: string) => void }) {
  const [revealed, setRevealed] = useState(false)
  const [importPk, setImportPk] = useState("")
  const [copied, setCopied] = useState(false)
  const pk = revealed ? loadKey() : null
  const copyAddr = () => {
    navigator.clipboard?.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="animate-float-up space-y-4 pt-4">
      <h2 className="px-1 font-display text-[22px] font-black text-ink">Wallet</h2>

      {/* address */}
      <Card>
        <Eyebrow>Your address</Eyebrow>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan/30 text-ink">
            <Wallet size={18} />
          </span>
          <span className="flex-1 truncate font-mono text-[14px] text-ink">{shortAddr(address)}</span>
          <button onClick={copyAddr} aria-label="Copy address" className="press grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-ink hover:bg-slate-200">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </Card>

      {/* reveal key */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>Private key</Eyebrow>
            <div className="mt-1 text-[13px] text-slate2">Burner wallet · back it up</div>
          </div>
          <button onClick={() => setRevealed((v) => !v)} className="press inline-flex items-center gap-1.5 font-display text-[13px] font-bold text-violet2-deep">
            {revealed ? <Lock size={15} /> : <Eye size={15} />}
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
        {pk ? (
          <button
            className="mt-2.5 block w-full break-all rounded-xl bg-ink/95 px-3.5 py-3 text-left font-mono text-[12.5px] text-cyan"
            onClick={() => { navigator.clipboard?.writeText(pk); flash("Private key copied") }}
          >
            {pk}
          </button>
        ) : (
          <div className="mt-2.5 rounded-xl bg-ink/95 px-3.5 py-3 font-mono text-[12.5px] text-transparent select-none" style={{ textShadow: "0 0 9px rgba(255,255,255,0.55)" }}>
            •••• •••• •••• •••• •••• •••• •••• ••••
          </div>
        )}
        <p className="mt-2 text-[12px] text-muted">Stored only in this browser. Export it to keep your funds.</p>
      </Card>

      {/* network */}
      <Card className="!py-1">
        <KvRow label="Chain">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {IS_MAINNET ? "Celo" : String(relayer?.chainId ?? CHAIN_ID)}
          </span>
        </KvRow>
        <KvRow label="Relayer">{relayer?.relayerAddress ? shortAddr(relayer.relayerAddress) : relayer?.dryRun ? "dry-run" : "not connected"}</KvRow>
        <KvRow label="Gas paid in" last>
          <Chip tone="green">{relayer?.feeCurrency ?? "—"}</Chip>
        </KvRow>
      </Card>

      {/* offline voice */}
      <OfflineVoiceCard flash={flash} />

      {/* import */}
      <Card className="space-y-2">
        <Eyebrow>Import a different key</Eyebrow>
        <input className="field font-mono text-xs" placeholder="0x… private key" value={importPk} onChange={(e) => setImportPk(e.target.value)} />
        <PillButton variant="secondary" size="block" disabled={!importPk.trim()} icon={<Download size={18} />} onClick={() => { onImport(importPk); setImportPk("") }}>
          Import
        </PillButton>
      </Card>

      <PillButton variant="danger" size="block" icon={<Trash size={18} />} onClick={() => { if (confirm("Reset wallet? Export your key first or funds are lost.")) onReset() }}>
        Reset wallet
      </PillButton>
      <p className="px-6 text-center text-[12px] text-muted">Resetting erases this in-browser wallet. Make sure you’ve saved your key.</p>
    </div>
  )
}

// --- small UI ---------------------------------------------------------------
function Toast({ message }: { message: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] animate-pop">
      <div className="flex items-center gap-2.5 rounded-full bg-ink py-2.5 pl-3 pr-4 text-white shadow-cardlg">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500">
          <Check size={15} />
        </span>
        <span className="font-display text-[14px] font-bold">{message}</span>
      </div>
    </div>
  )
}

function TabBar({ screen, setScreen, queueCount }: { screen: Screen; setScreen: (s: Screen) => void; queueCount: number }) {
  const tabs: { id: Screen; icon: (p: { size?: number; stroke?: number; style?: React.CSSProperties }) => React.ReactNode; label: string; badge?: number }[] = [
    { id: "home", icon: Home, label: "Home" },
    { id: "activity", icon: ActivityIcon, label: "Activity", badge: queueCount },
    { id: "identity", icon: IdentityIcon, label: "Identity" },
    { id: "wallet", icon: Wallet, label: "Wallet" },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[440px] items-stretch justify-around border-t border-slate-100 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-1 backdrop-blur">
      {tabs.map((t) => {
        const active = screen === t.id
        const Icon = t.icon
        return (
          <button
            key={t.id}
            onClick={() => setScreen(t.id)}
            aria-label={t.label}
            aria-current={active}
            className="press relative flex flex-1 flex-col items-center justify-center gap-1 pt-1.5"
          >
            {active && <span className="absolute top-0 h-1 w-8 rounded-full bg-violet2" />}
            <span style={{ color: active ? "#7c5cff" : "#94a3b8" }}>
              <Icon size={23} stroke={active ? 2.3 : 1.9} />
            </span>
            <span className="font-display text-[11px] font-bold" style={{ color: active ? "#7c5cff" : "#94a3b8" }}>
              {t.label}
            </span>
            {t.badge ? (
              <span className="absolute right-3 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-violet2 px-1 text-[10px] font-bold text-white">{t.badge}</span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
