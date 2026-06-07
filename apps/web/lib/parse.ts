"use client"
import { parseIntentRegex, parseCommand, type PaymentIntent, type Action } from "@kumo-good/shared"

// Fully on-device parsing: Web Speech API for voice, the shared deterministic
// regex parser for NL → intent. No network required, so it works in airplane mode.

export function parseText(text: string): PaymentIntent | null {
  return parseIntentRegex(text)
}

/** Parse one utterance into an ordered action plan (claim / send / balance). */
export function parsePlan(text: string): Action[] {
  return parseCommand(text)
}
export type { Action }

type SR = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function SpeechRecognitionCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function voiceSupported(): boolean {
  return SpeechRecognitionCtor() != null
}

export type VoiceHandle = { stop: () => void }

/** Start dictation. Calls onText with interim + final transcripts. */
export function startVoice(opts: {
  lang?: string
  onText: (text: string, final: boolean) => void
  onError: (msg: string) => void
  onEnd: () => void
}): VoiceHandle {
  const Ctor = SpeechRecognitionCtor()
  if (!Ctor) {
    opts.onError("voice not supported in this browser")
    return { stop: () => {} }
  }
  const rec = new Ctor()
  rec.lang = opts.lang ?? "en-US"
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  rec.onresult = (e) => {
    let text = ""
    let final = false
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript
      if (e.results[i].isFinal) final = true
    }
    opts.onText(text, final)
  }
  rec.onerror = (e) => opts.onError(e.error || "voice error")
  rec.onend = () => opts.onEnd()
  rec.start()
  return { stop: () => rec.stop() }
}
