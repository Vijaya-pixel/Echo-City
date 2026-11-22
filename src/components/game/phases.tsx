/**
 * Phase screens, part 1: lobby, hat draw, clues, discussion (+ chat) and the
 * detective scan. Each screen reads live state passed in as `RoomState` and
 * only ever *asks* the server to change things via callAction.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutations, useQuery } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import { DIFFICULTIES, MAX_BOTS, MAX_PLAYERS, MIN_PLAYERS, TIMERS, getLocation, isBotId } from '@/game/data'
import type { Assignment, Chat, Clue, Game, Player, Vote } from '@/game/types'
import { callAction, serverNow, sfx, useCountdown } from '@/lib/game-client'
import { PlayerChip, SecretCard, SignalLoader, TimerBar, WorkingDots } from './widgets'
import { PixelAvatar } from './PixelAvatar'

type Rec<T> = { recordId: string; data: T; createdBy: string }

export interface RoomState {
  game: Rec<Game>
  players: Rec<Player>[]
  myId: string
  assignment: Assignment | undefined
  clues: Rec<Clue>[]
  myVote: Vote | undefined
  isOnline: (userId: string) => boolean
  alias: (userId: string | null | undefined) => string
  /** ms until the current phase deadline (server clock). */
  remaining: number
  /** Live suspicion: public counts per player + toggling my own tap. */
  sus: {
    count: (userId: string) => number
    mine: (userId: string) => boolean
    /** The single most-suspected player (null on ties / no taps). */
    topId: string | null
    max: number
    toggle: (userId: string) => void
  }
}

/** True while players can tap SUS (clues, discussion). Voting is separate. */
export function susOpen(g: Game) {
  return g.status === 'clues' || g.status === 'discuss'
}

/**
 * Suspicion meter + SUS toggle for one player. The meter is public (everyone
 * sees how suspected each player is); the button flags/unflags them.
 */
export function SusControl({ s, userId, compact = false, canFlag = true }: { s: RoomState; userId: string; compact?: boolean; canFlag?: boolean }) {
  const n = s.sus.count(userId)
  const pct = Math.min(100, (n / s.sus.max) * 100)
  const isMe = userId === s.myId
  const mine = s.sus.mine(userId)
  const hot = s.sus.topId === userId
  const open = susOpen(s.game.data) && canFlag
  if (!n && (isMe || !open)) return null
  return (
    <div className={`flex items-center gap-2 ${compact ? 'mt-1' : 'mt-1.5'}`}>
      {n > 0 ? (
        <>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-label={`${n} sus`}>
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${hot ? 'bg-villain' : 'bg-[#ff8fb0]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-[11px] font-bold tabular-nums ${hot ? 'text-villain' : 'text-[#ff8fb0]'}`}>{n} sus</span>
        </>
      ) : (
        <div className="flex-1" aria-label="0 sus" />
      )}
      {!isMe && open && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            sfx.vote()
            s.sus.toggle(userId)
          }}
          aria-pressed={mine}
          className={`sus-pop rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] transition-colors ${
            mine ? 'border-villain bg-villain text-white shadow-[0_0_12px_-2px_var(--color-villain)]' : 'border-white/20 text-muted-foreground hover:border-villain hover:text-villain'
          }`}
        >
          Sus
        </button>
      )}
    </div>
  )
}

/** Run a server action with a busy flag and a toast on error. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const { error } = useToast()
  const run = async (name: string, params: Record<string, unknown>) => {
    setBusy(true)
    const r = await callAction(name, params)
    setBusy(false)
    if (!r.success) error(r.error)
    return r
  }
  return { busy, run }
}

// ── Lobby ───────────────────────────────────────────────────────────────────

/** Minimal lobby: who's here, add AI, one big Start. Rules appear in-game. */
export function Lobby({ s }: { s: RoomState }) {
  const { game, players, myId } = s
  const g = game.data
  const isHost = g.hostId === myId
  const { busy, run } = useAction()
  const { success } = useToast()
  const need = Math.max(0, MIN_PLAYERS - players.length)
  const enough = need === 0
  const botCount = players.filter((p) => p.data.isBot).length
  const canAddBot = botCount < MAX_BOTS && players.length < MAX_PLAYERS

  const copyInvite = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/room/${g.code}`)
    success('Invite link copied')
  }

  return (
    <section className="px-panel px-panel-hero mx-auto flex w-full max-w-md flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-hero">PLAYERS</h2>
        <span className="text-sm text-muted-foreground">{players.length} joined</span>
      </div>

      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.recordId}>
            <PlayerChip
              userId={p.data.userId}
              alias={s.alias(p.data.userId)}
              online={p.data.isBot ? true : s.isOnline(p.data.userId)}
              highlight={p.data.userId === myId ? 'me' : null}
            >
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{p.data.isBot ? 'AI player' : p.data.userId === g.hostId ? 'Host' : 'Player'}</span>
                {!!p.data.isBot && isHost && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run('removeBot', { gameId: game.recordId, botUserId: p.data.userId })}
                    className="text-xs font-semibold text-muted-foreground hover:text-villain"
                    aria-label={`Remove ${p.data.alias}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            </PlayerChip>
          </li>
        ))}
      </ul>

      {isHost ? (
        <>
          {canAddBot && (
            <Button variant="secondary" disabled={busy} onClick={() => run('addBot', { gameId: game.recordId })}>
              + Add AI player
            </Button>
          )}
          <Button size="lg" disabled={!enough || busy} loading={busy} onClick={() => run('startRound', { gameId: game.recordId })}>
            {enough ? 'Start game' : `Add ${need} more to start`}
          </Button>
        </>
      ) : (
        <SignalLoader label="STANDING BY" sub="The host will start the round any second." />
      )}

      <p className="text-center text-sm text-muted-foreground">
        Playing with friends? Share code <span className="font-display font-bold tracking-[0.2em] text-foreground">{g.code}</span>{' '}
        ·{' '}
        <button type="button" onClick={copyInvite} className="font-semibold text-hero hover:underline">
          Copy link
        </button>
      </p>
    </section>
  )
}

// ── Location scan ────────────────────────────────────────────────────────────────

/** Brief moment while the server deals the words (rounds start straight away). */
export function DrawPhase() {
  return <SignalLoader label="ENCRYPTING SECRET WORDS" sub="One of them is a glitch…" />
}

/** The word card, shown for the first few seconds of the round. */
export function ChitReveal({ s }: { s: RoomState }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pt-6 text-center">
      <SecretCard assignment={s.assignment} />
    </div>
  )
}

// ── Clue board ──────────────────────────────────────────────────────────────

/** One compact strip: your word (or none), where you are, and what it means. */
export function WordStrip({ a }: { a: Assignment | undefined }) {
  if (!a) return <div className="px-panel p-3 text-center text-muted-foreground">Dealing your card...</div>
  const note: Record<Assignment['shownRole'], string> = {
    unknown: 'Someone has a different word. It might be you.',
    hero: 'You are a hero. One player is the Glitch with no word.',
    villain: 'You are the Glitch. No word: bluff from the clues.',
    detective: 'You are the detective: you can scan one player.',
  }
  return (
    <div className={`px-panel ${a.shownRole === 'villain' ? 'px-panel-villain' : 'px-panel-hero'} flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3`}>
      <span className="eyebrow">Your word</span>
      <span className={`font-display text-xl font-extrabold ${a.word ? 'text-foreground' : 'text-villain'}`}>{a.word ? a.word.toUpperCase() : 'NO WORD'}</span>
      <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">{note[a.shownRole]}</span>
    </div>
  )
}

/** Clues in turn order: given clue, "giving a clue…", or "waiting". */
export function ClueBoard({ s }: { s: RoomState }) {
  const g = s.game.data
  const current = g.status === 'clues' ? g.turnOrder[g.turnIndex % g.turnOrder.length] : null
  return (
    <section className="px-panel p-2">
      <ul className="flex flex-col">
        {g.turnOrder.map((id) => {
          const mine = s.clues.filter((c) => c.data.playerId === id).sort((a, b) => a.data.turn - b.data.turn)
          const isCurrent = id === current
          const hot = s.sus.topId === id
          return (
            <li
              key={id}
              className={`flex items-center gap-3 rounded-xl px-2 py-2 ${isCurrent ? 'bg-hero/10 ring-1 ring-hero/60' : hot ? 'bg-villain/10 ring-1 ring-villain/50' : ''}`}
            >
              <PixelAvatar seed={id} size={36} title={s.alias(id)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-muted-foreground">{s.alias(id)}</div>
                <div className="flex flex-wrap gap-x-3 text-lg font-bold leading-tight">
                  {mine.length ? (
                    mine.map((c) => (
                      <span key={c.recordId} className={c.data.text === '…' ? 'font-normal text-muted-foreground' : 'text-foreground'}>
                        {c.data.text === '…' ? '(passed)' : c.data.text}
                      </span>
                    ))
                  ) : isCurrent ? (
                    <span className="inline-flex items-center gap-2 font-normal text-hero">giving a clue <WorkingDots /></span>
                  ) : (
                    <span className="font-normal text-muted-foreground/60">waiting</span>
                  )}
                </div>
              </div>
              <div className="w-36 shrink-0">
                <SusControl s={s} userId={id} compact canFlag={mine.length > 0 || g.status !== 'clues'} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function CluePhase({ s }: { s: RoomState }) {
  const g = s.game.data
  const current = g.turnOrder[g.turnIndex % g.turnOrder.length]
  const myTurn = current === s.myId
  const lap = Math.floor(g.turnIndex / g.turnOrder.length) + 1
  const laps = DIFFICULTIES[g.difficulty].laps
  const [text, setText] = useState('')
  const { busy, run } = useAction()
  const inputRef = useRef<HTMLInputElement>(null)
  const word = s.assignment?.word

  useEffect(() => {
    if (myTurn) {
      sfx.turn()
      inputRef.current?.focus()
    }
  }, [myTurn, g.turnIndex])

  const [sent, setSent] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const word = text.trim()
    setSent(word)
    const r = await run('submitClue', { gameId: s.game.recordId, text: word })
    if (r.success) setText('')
    else setSent(null)
  }
  // Clear the "sent" note once the turn has moved on.
  useEffect(() => setSent(null), [g.turnIndex])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <WordStrip a={s.assignment} />

      <section className={`px-panel ${myTurn ? 'px-panel-hero' : ''} p-4`}>
        {myTurn ? (
          <>
            <h2 className="text-base text-hero">YOUR TURN</h2>
            <p className="mt-1 text-muted-foreground">
              {word ? (
                <>
                  Give a <b className="text-foreground">one-word hint</b> for <b className="text-foreground">{word.toUpperCase()}</b>. Don&apos;t say the word itself.
                </>
              ) : (
                <>You have no word. Give a one-word clue that fits the others.</>
              )}
            </p>
            {sent ? (
              <p className="mt-3 inline-flex items-center gap-2 text-hero">
                Clue “{sent}” sent. Passing the turn <WorkingDots />
              </p>
            ) : (
            <form onSubmit={submit} className="mt-3 flex gap-2">
              <Input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value.replace(/\s/g, ''))}
                placeholder="Type one word"
                maxLength={24}
                aria-label="Your one-word clue"
                autoComplete="off"
              />
              <Button type="submit" disabled={!text.trim() || busy} loading={busy}>
                Send
              </Button>
            </form>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3">
            <PixelAvatar seed={current} size={44} title={s.alias(current)} />
            <div>
              <h2 className="text-sm text-foreground">{s.alias(current).toUpperCase()}</h2>
              <p className="inline-flex items-center gap-2 text-muted-foreground">is giving a clue <WorkingDots /></p>
            </div>
          </div>
        )}
        <div className="mt-3">
          <TimerBar remaining={s.remaining} total={isBotId(current) ? TIMERS.botTurn : TIMERS.clueTurn} label={laps > 1 ? `Clue round ${lap} of ${laps}` : 'Time left'} />
        </div>
      </section>

      <DetectiveScan s={s} />
      <ClueBoard s={s} />
    </div>
  )
}

// ── Discussion + chat ───────────────────────────────────────────────────────

export function DiscussPhase({ s }: { s: RoomState }) {
  const isHost = s.game.data.hostId === s.myId
  const { busy, run } = useAction()
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-4">
        <div className="px-panel p-4">
          <TimerBar remaining={s.remaining} total={TIMERS.discuss} label="DISCUSSION" />
          {isHost && (
            <Button variant="secondary" size="sm" className="mt-4 w-full" disabled={busy} loading={busy} onClick={() => run('skipDiscussion', { gameId: s.game.recordId })}>
              Skip to vote
            </Button>
          )}
        </div>
        <WordStrip a={s.assignment} />
        <DetectiveScan s={s} />
        <ClueBoard s={s} />
      </div>
      <ChatBox s={s} />
    </div>
  )
}

/**
 * Live chat written straight from the browser (the one client-writable
 * collection). The author shown is the server-stamped `createdBy`.
 */
export function ChatBox({ s }: { s: RoomState }) {
  const gameId = s.game.recordId
  const round = s.game.data.round
  const { records } = useQuery<Chat>('chats', { where: { gameId, round }, orderBy: 'createdAt', orderDir: 'asc', limit: 200 })
  const { ready, create } = useMutations<Chat>('chats')
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [records.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = text.trim().slice(0, 200)
    if (!t) return
    await create({ gameId, round, text: t })
    setText('')
  }

  return (
    <div className="px-panel flex h-[60vh] min-h-80 flex-col p-3 md:h-auto">
      <div className="mb-2 font-display text-[10px] text-muted-foreground">DISCUSSION CHAT</div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {records.length === 0 && <p className="text-muted-foreground">Whose clue didn't fit? Say who you suspect, and tap SUS on them.</p>}
        {records.map((m) => (
          <p key={m.recordId} className="break-words leading-tight">
            <span className={m.createdBy === s.myId ? 'text-detective' : 'text-hero'}>{s.alias(m.createdBy)}:</span>{' '}
            {m.data.text}
          </p>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Say something..." aria-label="Chat message" disabled={!ready} />
        <Button type="submit" size="sm" disabled={!ready || !text.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}

// ── Detective scan ──────────────────────────────────────────────────────────

/** Only rendered for the Detective (their own assignment row says so). */
export function DetectiveScan({ s }: { s: RoomState }) {
  const a = s.assignment
  const { busy, run } = useAction()
  const targets = useMemo(() => s.players.filter((p) => p.data.userId !== s.myId), [s.players, s.myId])
  if (!a || a.shownRole !== 'detective') return null
  if (a.scanResult) {
    return (
      <div className="px-panel px-panel-detective p-3 text-center">
        <div className="font-display text-[10px] text-detective">SCAN RESULT</div>
        <p className="mt-2">
          {s.alias(a.scanTargetId)} is{' '}
          <span className={a.scanResult === 'villain' ? 'text-villain' : 'text-lime'}>{a.scanResult === 'villain' ? 'THE VILLAIN' : 'A HERO'}</span>
        </p>
      </div>
    )
  }
  return (
    <div className="px-panel px-panel-detective p-3">
      <div className="mb-2 font-display text-[10px] text-detective">SCAN ONE PLAYER</div>
      <div className="flex flex-wrap gap-2">
        {targets.map((p) => (
          <Button
            key={p.recordId}
            variant="detective"
            size="sm"
            disabled={busy}
            onClick={() => run('scan', { gameId: s.game.recordId, targetId: p.data.userId })}
          >
            {p.data.alias}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** True during the first seconds after the draw (chit + card animation window). */
export function useIsRevealingCard(g: Game) {
  const left = useCountdown(g.status === 'clues' && g.drawnAt ? g.drawnAt + TIMERS.cardReveal : 0)
  return g.status === 'clues' && g.drawnAt > 0 && left > 0 && serverNow() < g.drawnAt + TIMERS.cardReveal
}
