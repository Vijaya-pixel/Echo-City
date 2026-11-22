/**
 * Browser-side helpers for talking to the game server and keeping time.
 *
 * - callAction: POST /api/actions/:name with the user's bearer token.
 * - Server clock: countdowns use the server's clock (offset measured once),
 *   so a phone with a wrong clock still sees the right timer.
 * - useAdvanceOnExpire: when a phase timer hits zero, ask the server to
 *   advance. The server re-checks the time and uses locks, so it's fine that
 *   every client calls it.
 * - Settings: mute + CRT toggle, remembered in localStorage.
 * - 8-bit blips via the Web Audio API (no audio files).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getAuthToken } from 'deepspace'

export type ActionResponse<T> = { success: true; data: T } | { success: false; error: string }

export async function callAction<T = Record<string, unknown>>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'Please sign in first.' }
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as ActionResponse<T> | { error?: string } | null
    if (body && 'success' in body) return body
    return { success: false, error: (body as { error?: string } | null)?.error ?? `Request failed (${res.status})` }
  } catch {
    return { success: false, error: 'Network error. Check your connection.' }
  }
}

// ── Server clock ────────────────────────────────────────────────────────────

let clockOffset = 0 // serverNow - localNow
let clockSynced = false

/** Measure the server clock offset once per page load. */
export async function syncServerClock(): Promise<void> {
  if (clockSynced) return
  const sentAt = Date.now()
  const r = await callAction<{ now: number }>('serverTime')
  if (r.success) {
    const rtt = Date.now() - sentAt
    clockOffset = r.data.now + rtt / 2 - Date.now()
    clockSynced = true
  }
}

export const serverNow = () => Date.now() + clockOffset

/** Re-renders every 250ms and returns ms left until `endsAt` (server clock). */
export function useCountdown(endsAt: number): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [endsAt])
  return endsAt ? Math.max(0, endsAt - serverNow()) : 0
}

/**
 * When `endsAt` passes, call `advance` for this game. Retries every 3s while
 * the phase hasn't moved (e.g. the first call raced another client).
 */
export function useAdvanceOnExpire(gameId: string | undefined, phaseKey: string, endsAt: number) {
  const remaining = useCountdown(endsAt)
  const lastCall = useRef(0)
  useEffect(() => {
    lastCall.current = 0
  }, [phaseKey])
  useEffect(() => {
    if (!gameId || !endsAt || remaining > 0) return
    const now = Date.now()
    if (now - lastCall.current < 3000) return
    lastCall.current = now
    // Small random jitter so a room full of clients doesn't fire in lockstep.
    const t = setTimeout(() => void callAction('advance', { gameId }), Math.random() * 400)
    return () => clearTimeout(t)
  }, [gameId, endsAt, remaining])
  return remaining
}

// ── Settings (mute + CRT) ──────────────────────────────────────────────────

type Settings = { muted: boolean; crt: boolean }
const listeners = new Set<() => void>()
let settings: Settings = { muted: false, crt: true }
if (typeof window !== 'undefined') {
  try {
    settings = { ...settings, ...JSON.parse(localStorage.getItem('echo-settings') ?? '{}') }
  } catch {
    /* ignore bad JSON */
  }
  document.documentElement.dataset.crt = settings.crt ? 'on' : 'off'
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings = { ...settings, [key]: value }
  localStorage.setItem('echo-settings', JSON.stringify(settings))
  document.documentElement.dataset.crt = settings.crt ? 'on' : 'off'
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => settings,
    () => settings,
  )
}

// ── 8-bit sound effects ─────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null

/** Square-wave notes, e.g. blip([660, 880]). Silent when muted. */
export function blip(freqs: number[], noteMs = 80) {
  if (settings.muted || typeof window === 'undefined') return
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = f
      const start = ctx.currentTime + (i * noteMs) / 1000
      gain.gain.setValueAtTime(0.06, start)
      gain.gain.setValueAtTime(0, start + noteMs / 1000)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + noteMs / 1000)
    })
  } catch {
    /* audio not available */
  }
}

export const sfx = {
  turn: () => blip([660, 990]),
  vote: () => blip([440, 330]),
  draw: () => blip([392, 523, 659, 784], 70),
  caught: () => blip([523, 659, 784, 1047, 784, 1047], 90),
  escaped: () => blip([392, 330, 262, 196], 140),
}
