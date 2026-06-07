"use client"
// Claim-streak gamification. Computed locally from the UBIScheme day counter so
// it renders offline. One grace day: missing a single day keeps the streak alive.

const KEY = "kumo-good.streak.v1"

export type Streak = { count: number; best: number; lastDay: number; days: number[] }

const empty: Streak = { count: 0, best: 0, lastDay: 0, days: [] }

export function getStreak(): Streak {
  if (typeof localStorage === "undefined") return empty
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Streak>) }
  } catch {
    return empty
  }
}

/** Record a successful claim on UBIScheme day `day`. Returns the updated streak. */
export function recordClaim(day: number): Streak {
  const s = getStreak()
  if (day <= 0 || s.lastDay === day) return s // already counted today
  if (s.lastDay === 0 || s.lastDay === day - 1) s.count += 1 // consecutive (or first)
  else if (s.lastDay === day - 2) s.count += 1 // one grace day — keep the streak
  else s.count = 1 // streak broken
  s.lastDay = day
  s.best = Math.max(s.best, s.count)
  s.days = Array.from(new Set([...s.days, day])).slice(-60)
  localStorage.setItem(KEY, JSON.stringify(s))
  return s
}
