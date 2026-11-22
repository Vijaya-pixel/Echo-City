/**
 * Small reusable game widgets: the pixel top hat + chit, countdown bar,
 * secret identity card, episode title card, confetti, player chip and the
 * mute / CRT toggles.
 */

import { useEffect, useState } from 'react'
import { Monitor, MonitorOff, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui'
import { setSetting, useSettings } from '@/lib/game-client'
import type { Location } from '@/game/data'
import type { Assignment } from '@/game/types'
import { PixelAvatar } from './PixelAvatar'

// ── Hat + chit ──────────────────────────────────────────────────────────────

/** Pixel top hat. When `location` is set, a chit rises out and unfolds (synced via drawnAt). */
export function Hat({ location, animate = true }: { location?: Location; animate?: boolean }) {
  return (
    <div className="relative mx-auto flex h-64 w-64 flex-col items-center justify-end">
      {location && (
        <div className={`absolute top-0 z-10 ${animate ? 'chit-rise' : ''}`}>
          <div className={`px-panel px-panel-hero bg-foreground px-4 py-3 text-center ${animate ? 'chit-unfold' : ''}`}>
            <div className="text-4xl leading-none">{location.emoji}</div>
            <div className="mt-2 font-display text-[10px] text-background">{location.name.toUpperCase()}</div>
          </div>
        </div>
      )}
      <svg viewBox="0 0 32 24" width={192} height={144} shapeRendering="crispEdges" className={`pixel ${location ? '' : 'hat-wobble'}`} aria-label="Top hat">
        {/* brim */}
        <rect x={2} y={20} width={28} height={3} fill="#05060f" />
        <rect x={3} y={20} width={26} height={1} fill="#36428a" />
        {/* crown */}
        <rect x={7} y={4} width={18} height={16} fill="#151c3d" />
        <rect x={7} y={4} width={18} height={2} fill="#36428a" />
        <rect x={8} y={6} width={2} height={14} fill="#1f2a5a" />
        {/* band */}
        <rect x={7} y={15} width={18} height={3} fill="#ff4560" />
        <rect x={20} y={15} width={3} height={3} fill="#ffcc33" />
        {/* opening */}
        <rect x={9} y={3} width={14} height={1} fill="#05060f" />
      </svg>
    </div>
  )
}

// ── Countdown bar ───────────────────────────────────────────────────────────

export function TimerBar({ remaining, total, label }: { remaining: number; total: number; label?: string }) {
  const secs = Math.ceil(remaining / 1000)
  const pct = total ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
  const danger = secs <= 10
  return (
    <div className="w-full" aria-live="off">
      <div className="mb-1 flex items-center justify-between font-display text-[10px] text-muted-foreground">
        <span>{label ?? 'TIME'}</span>
        <span className={danger ? 'timer-danger text-villain' : 'text-foreground'}>{String(secs).padStart(2, '0')}</span>
      </div>
      <div className="h-4 w-full border-4 border-border bg-background">
        <div className={`timer-bar h-full ${danger ? 'bg-villain' : 'bg-lime'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Secret identity card ────────────────────────────────────────────────────

const ROLE_COPY: Record<Assignment['shownRole'], { title: string; tone: string; note: string }> = {
  unknown: {
    title: 'HERO?',
    tone: 'px-panel-hero text-hero',
    note: 'One of you has a different word. Maybe it is you.',
  },
  hero: { title: 'HERO', tone: 'px-panel-hero text-hero', note: 'Find the villain. They do not know the word.' },
  villain: {
    title: 'VILLAIN',
    tone: 'px-panel-villain text-villain',
    note: 'You have no word. Blend in. If caught, you get one last guess.',
  },
  detective: {
    title: 'DETECTIVE',
    tone: 'px-panel-detective text-detective',
    note: 'You may scan one player this round.',
  },
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
    <div className={`px-panel ${role.tone} flex flex-col items-center justify-center gap-2 p-4 text-center ${compact ? 'min-h-28' : 'min-h-56'}`}>
      <div className="font-display text-[10px] text-muted-foreground">YOUR SECRET IDENTITY</div>
      <div className="font-display text-base">{role.title}</div>
      <div className="text-muted-foreground">Location: {assignment.category}</div>
      {hidden ? (
        <div className="font-display text-sm text-muted-foreground">TAP TO SHOW</div>
      ) : assignment.word ? (
        <div className="font-display text-lg text-foreground">{assignment.word.toUpperCase()}</div>
      ) : (
        <div className="font-display text-sm text-villain">NO WORD</div>
      )}
      {!compact && <p className="max-w-xs text-muted-foreground">{role.note}</p>}
      {assignment.scanResult && (
        <div className={`font-display text-[10px] ${assignment.scanResult === 'villain' ? 'text-villain' : 'text-lime'}`}>
          SCAN: {assignment.scanResult.toUpperCase()}
        </div>
      )}
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
          <div className={`px-panel flex items-center justify-center ${compact ? 'min-h-28' : 'min-h-56'}`}>
            <span className="font-display text-3xl text-hero">?</span>
          </div>
        </div>
        <div className="flip-face flip-back">{front}</div>
      </div>
    </button>
  )
}

// ── Episode title card ──────────────────────────────────────────────────────

/** "EPISODE 2 · THE VOTE" slides across for 2.4s whenever `phaseKey` changes. */
export function TitleCard({ phaseKey, episode, title }: { phaseKey: string; episode: number; title: string }) {
  const [visibleKey, setVisibleKey] = useState<string | null>(phaseKey)
  useEffect(() => {
    setVisibleKey(phaseKey)
    const t = setTimeout(() => setVisibleKey(null), 2400)
    return () => clearTimeout(t)
  }, [phaseKey])
  if (visibleKey !== phaseKey) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/3 z-50 overflow-hidden">
      <div className="title-card border-y-4 border-magenta bg-background py-4 text-center">
        <div className="font-display text-[10px] text-magenta">EPISODE {episode}</div>
        <div className="mt-2 font-display text-lg text-foreground sm:text-2xl">{title}</div>
      </div>
    </div>
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
        <div className="truncate font-display text-[10px] leading-relaxed text-foreground">{alias}</div>
        {children}
      </div>
    </div>
  )
}

// ── Settings toggles ────────────────────────────────────────────────────────

export function SettingsToggles() {
  const { muted, crt } = useSettings()
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => setSetting('muted', !muted)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
        {muted ? <VolumeX /> : <Volume2 />}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setSetting('crt', !crt)} aria-label={crt ? 'Turn off scanlines' : 'Turn on scanlines'} title="CRT scanlines">
        {crt ? <Monitor /> : <MonitorOff />}
      </Button>
    </div>
  )
}
