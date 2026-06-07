"use client"
import { useEffect } from "react"

export function SwRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return // avoid caching during dev
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  }, [])
  return null
}
