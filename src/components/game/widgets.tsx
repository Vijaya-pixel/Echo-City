/**
 * Small reusable game widgets: the pixel top hat + chit, countdown bar,
 * secret identity card, episode title card, confetti, player chip and the
 * mute / CRT toggles.
 */

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui'
import { setSetting, useSettings } from '@/lib/game-client'
import type { Location } from '@/game/data'
import type { Assignment } from '@/game/types'
import { PixelAvatar } from './PixelAvatar'

// ── Digital countdown ───────────────────────────────────────────────────────

// Seven-segment digits: segments a..g (top, top-right, bottom-right, bottom,
// bottom-left, top-left, middle). Unlit segments stay faintly visible, like a
// real LED display.
const SEG_ON: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
}
// Polygons in a 12x20 digit box (bevelled ends, small gaps between segments).
const SEG_SHAPE: Record<string, string> = {
  a: '2,0.5 10,0.5 8.5,2.5 3.5,2.5',
  b: '10.5,1 11.5,2 11.5,9 10.5,10 9.5,9 9.5,3',
  c: '10.5,10 11.5,11 11.5,18 10.5,19 9.5,17 9.5,11',
  d: '3.5,17.5 8.5,17.5 10,19.5 2,19.5',
  e: '1.5,10 2.5,11 2.5,17 1.5,19 0.5,18 0.5,11',
  f: '1.5,1 2.5,3 2.5,9 1.5,10 0.5,9 0.5,2',
  g: '2.5,10 3.5,9 8.5,9 9.5,10 8.5,11 3.5,11',
}

function Digit({ d, x, color }: { d: string; x: number; color: string }) {
  const on = SEG_ON[d] ?? ''
  return (
    <g transform={`translate(${x} 0)`}>
      {Object.entries(SEG_SHAPE).map(([k, pts]) => (
        <polygon key={k} points={pts} fill={color} opacity={on.includes(k) ? 1 : 0.1} />
      ))}
    </g>
  )
}

/** Digital LED countdown (m:ss). `total` is kept for API compatibility. */
export function TimerBar({ remaining, label }: { remaining: number; total: number; label?: string }) {
  const secs = Math.max(0, Math.ceil(remaining / 1000))
  const color = secs <= 5 ? '#ff4d6d' : secs <= 10 ? '#ffc95a' : '#3ee6ff'
  const text = `${Math.floor(secs / 60)}${String(secs % 60).padStart(2, '0')}`
  return (
    <div className="w-full" aria-live="off" aria-label={`${label ?? 'Time'}: ${secs} seconds`}>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">
          {secs === 0 ? (
            <span className="inline-flex items-center gap-2 text-hero">
              Moving on <WorkingDots />
            </span>
          ) : (
            (label ?? 'Time')
          )}
        </span>
        <div
          className={`rounded-lg border border-white/10 bg-[#05040e] px-2.5 py-1.5 ${secs <= 5 ? 'timer-danger' : ''}`}
          style={{ boxShadow: `inset 0 0 12px rgb(0 0 0 / 0.8), 0 0 14px -6px ${color}` }}
        >
          <svg viewBox="0 0 48 20" width={67} height={28} style={{ filter: `drop-shadow(0 0 3px ${color})` }} aria-hidden>
            <Digit d={text[0]} x={0} color={color} />
            <g className={secs > 0 ? 'colon-blink' : undefined}>
              <rect x={14} y={5.5} width={2} height={2} fill={color} />
              <rect x={14} y={12.5} width={2} height={2} fill={color} />
            </g>
            <Digit d={text[1]} x={18} color={color} />
            <Digit d={text[2]} x={33} color={color} />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── Secret identity card ────────────────────────────────────────────────────

const ROLE_COPY: Record<Assignment['shownRole'], { title: string; tone: string; note: string; short: string }> = {
  hero: { title: '', tone: 'px-panel-hero text-hero', note: 'The Glitch has no word. Find them.', short: 'Find the player with no word.' },
  villain: { title: 'YOU ARE THE GLITCH', tone: 'px-panel-villain text-villain', note: 'You have no word. Read the clues, bluff, and don\'t get caught.', short: 'No word. Bluff from the clues.' },
}

/** Flips over on mount (sprite-style). Tap to hide/show so neighbours can't peek. */
export function SecretCard({ assignment, compact = false }: { assignment: Assignment | undefined; compact?: boolean }) {
  const [flipped, setFlipped] = useState(false)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 500)
    return () => clearTimeout(t)
  }, [])
  if (!assignment) {
    return <div className="px-panel p-4 text-center text-muted-foreground">Dealing your card...</div>
  }
  const role = ROLE_COPY[assignment.shownRole]
  const front = (
    <div className={`px-panel ${role.tone} flex flex-col items-center justify-center gap-2 p-5 text-center ${compact ? 'min-h-28' : 'min-h-40'}`}>
      {role.title && <div className="font-display text-[11px] font-extrabold">{role.title}</div>}
      <div className="eyebrow">Your word</div>
      {hidden ? (
        <div className="font-display text-sm text-muted-foreground">TAP TO SHOW</div>
      ) : assignment.word ? (
        <div className="font-display text-3xl font-black text-foreground">{assignment.word.toUpperCase()}</div>
      ) : (
        <div className="font-display text-2xl font-black text-villain">NO WORD</div>
      )}
      <p className="max-w-xs text-muted-foreground">{compact ? role.short : role.note}</p>
    </div>
  )
  return (
    <button
      type="button"
      onClick={() => setHidden((h) => !h)}
      className={`flip block w-full text-left ${flipped ? 'is-flipped' : ''}`}
      aria-label={hidden ? 'Show my secret card' : 'Hide my secret card'}
    >
      <div className="flip-inner">
        <div className="flip-face">
          <div className={`px-panel flex items-center justify-center ${compact ? 'min-h-28' : 'min-h-40'}`}>
            <span className="font-display text-3xl text-hero">?</span>
          </div>
        </div>
        <div className="flip-face flip-back">{front}</div>
      </div>
    </button>
  )
}

// ── Phase tracker ───────────────────────────────────────────────────────────

const PHASES = [
  { key: 'clues', label: 'Clues' },
  { key: 'discuss', label: 'Discuss' },
  { key: 'vote', label: 'Vote' },
  { key: 'reveal', label: 'Results' },
] as const

/**
 * Compact step tracker in the room header: shows where the round is without
 * covering the game. The active step pulses once when it changes.
 */
export function PhaseTracker({ status }: { status: string }) {
  const current = status === 'draw' ? 'clues' : status === 'lastguess' ? 'vote' : status
  const idx = PHASES.findIndex((p) => p.key === current)
  return (
    <ol className="flex items-center gap-1" aria-label="Round progress">
      {PHASES.map((p, i) => {
        const state = i < idx ? 'done' : i === idx ? 'now' : 'next'
        return (
          <li key={p.key} className="flex items-center gap-1">
            <span
              key={state === 'now' ? `${p.key}-now` : p.key}
              aria-current={state === 'now' ? 'step' : undefined}
              className={`rounded-full px-2.5 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] transition-colors sm:px-3 ${
                state === 'now'
                  ? 'phase-now bg-hero text-white shadow-[0_0_14px_-2px_var(--color-hero)]'
                  : state === 'done'
                    ? 'text-hero'
                    : 'text-muted-foreground/60'
              }`}
            >
              {p.label}
            </span>
            {i < PHASES.length - 1 && <span className={`h-px w-3 sm:w-5 ${i < idx ? 'bg-hero' : 'bg-white/15'}`} aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

// ── Confetti ────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['var(--color-hero)', 'var(--color-lime)', 'var(--color-detective)', 'var(--color-magenta)']

export function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 48 }, (_, i) => ({
      x: `${Math.floor(Math.random() * 100)}%`,
      d: `${(Math.random() * 0.8).toFixed(2)}s`,
      c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{ ['--x' as string]: p.x, ['--d' as string]: p.d, ['--c' as string]: p.c }}
        />
      ))}
    </div>
  )
}

// ── Player chip ─────────────────────────────────────────────────────────────

export function PlayerChip({
  userId,
  alias,
  online,
  highlight,
  evil,
  children,
}: {
  userId: string
  alias: string
  online?: boolean
  highlight?: 'turn' | 'me' | 'villain' | null
  evil?: boolean
  children?: React.ReactNode
}) {
  const tone =
    highlight === 'villain' ? 'px-panel-villain' : highlight === 'turn' ? 'px-panel-hero turn-pulse' : highlight === 'me' ? 'px-panel-detective' : ''
  return (
    <div className={`px-panel ${tone} flex items-center gap-3 p-2`}>
      <div className="relative shrink-0">
        <PixelAvatar seed={userId} size={40} evil={evil} title={alias} />
        {online !== undefined && (
          <span
            className={`absolute -bottom-1 -right-1 h-3 w-3 border-2 border-shadow ${online ? 'bg-lime' : 'bg-muted-foreground'}`}
            aria-label={online ? 'online' : 'offline'}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="break-words font-display text-[10px] leading-relaxed text-foreground">{alias}</div>
        {children}
      </div>
    </div>
  )
}

// ── Settings toggles ────────────────────────────────────────────────────────

export function SettingsToggles() {
  const { muted } = useSettings()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setSetting('muted', !muted)}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off (click to turn on)' : 'Sound on (click to mute)'}
    >
      {muted ? <VolumeX /> : <Volume2 />}
    </Button>
  )
}

// ── Signal loader ───────────────────────────────────────────────────────────

/** Neon "incoming signal" loader: pulsing equalizer bars + a short status line. */
export function SignalLoader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center" role="status" aria-live="polite">
      <div className="flex h-10 items-end gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className="signal-bar w-2 rounded-sm bg-hero"
            style={{ animationDelay: `${i * 0.11}s`, boxShadow: '0 0 10px var(--color-hero)' }}
          />
        ))}
      </div>
      <div className="font-display text-sm font-extrabold tracking-[0.18em] text-foreground">{label}</div>
      {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** Tiny animated "working" dots for inline status lines. */
export function WorkingDots() {
  return (
    <span className="inline-flex items-center gap-1 align-middle" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="working-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}
