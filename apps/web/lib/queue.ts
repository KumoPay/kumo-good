"use client"
import { QueuedItemSchema, type QueuedItem, type QueueStatus } from "@kumo-good/shared"

// localStorage-backed offline queue. Holds the @kumo-good/shared discriminated
// union (payment | claim); the schema + status state machine live in shared.

const KEY = "kumo-good.queue.v1"

export function readQueue(): QueuedItem[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    if (!Array.isArray(raw)) return []
    return raw
      .map((e) => (e && typeof e === "object" && !("kind" in e) ? { kind: "payment", ...e } : e)) // migrate pre-union entries
      .map((e) => QueuedItemSchema.safeParse(e))
      .flatMap((r) => (r.success ? [r.data] : []))
  } catch {
    return []
  }
}

function writeQueue(q: QueuedItem[]) {
  localStorage.setItem(KEY, JSON.stringify(q))
}

export function addToQueue(entry: QueuedItem): QueuedItem {
  const q = readQueue()
  q.unshift(entry)
  writeQueue(q)
  return entry
}

export type QueuePatch = { status?: QueueStatus; txHash?: string; failureReason?: string }

export function updateEntry(id: string, patch: QueuePatch) {
  const q = readQueue().map((e) => (e.id === id ? ({ ...e, ...patch, updatedAt: Math.floor(Date.now() / 1000) } as QueuedItem) : e))
  writeQueue(q)
}

export function removeEntry(id: string) {
  writeQueue(readQueue().filter((e) => e.id !== id))
}

/** Items still needing to be (re)settled, oldest first (nonce / claim order). */
export function pending(q: QueuedItem[]): QueuedItem[] {
  return q.filter((e) => e.status === "queued" || e.status === "failed").sort((a, b) => a.createdAt - b.createdAt)
}

export function countByStatus(q: QueuedItem[], status: QueueStatus): number {
  return q.filter((e) => e.status === status).length
}
