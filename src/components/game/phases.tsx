/**
 * Phase screens, part 1: lobby, hat draw, clues, discussion (+ chat) and the
 * detective scan. Each screen reads live state passed in as `RoomState` and
 * only ever *asks* the server to change things via callAction.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutations, useQuery } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import { DIFFICULTIES, MAX_BOTS, MAX_PLAYERS, MIN_PLAYERS, MODES, TIMERS, getLocation, isBotId } from '@/game/data'
import type { Assignment, Chat, Clue, Game, Player, Vote } from '@/game/types'
import { callAction, serverNow, sfx, useCountdown } from '@/lib/game-client'
import { Hat, PlayerChip, SecretCard, TimerBar } from './widgets'

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

export function Lobby({ s }: { s: RoomState }) {
  const { game, players, myId } = s
  const g = game.data
  const isHost = g.hostId === myId
  const { busy, run } = useAction()
  const { success } = useToast()
  const enough = players.length >= MIN_PLAYERS
  const botCount = players.filter((p) => p.data.isBot).length
  const canAddBot = botCount < MAX_BOTS && players.length < MAX_PLAYERS

  const copyInvite = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/room/${g.code}`)
    success('Invite link copied')
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <section className="px-panel p-4 text-center">
        <div className="font-display text-[10px] text-muted-foreground">ROOM CODE</div>
        <div className="mt-3 flex justify-center gap-2" aria-label={`Room code ${g.code.split('').join(' ')}`}>
          {g.code.split('').map((ch, i) => (
            <span key={i} className="px-chip flex h-14 w-12 items-center justify-center bg-hero font-display text-xl text-hero-foreground">
              {ch}
            </span>
          ))}
        </div>
        <div className="mt-4 text-muted-foreground">
          {MODES[g.mode].label} · {DIFFICULTIES[g.difficulty].label}
        </div>
        <Button variant="secondary" size="sm" className="mt-4" onClick={copyInvite}>
          Copy invite link
        </Button>
      </section>

      <section>
        <h2 className="mb-3 text-xs text-hero">THE LEAGUE ({players.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {players.map((p) => (
            <PlayerChip
              key={p.recordId}
              userId={p.data.userId}
              alias={p.data.alias}
              online={p.data.isBot ? true : s.isOnline(p.data.userId)}
              highlight={p.data.userId === myId ? 'me' : null}
            >
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span>{p.data.isBot ? `AI · ${p.data.personality}` : p.data.userId === g.hostId ? 'Host' : 'Hero'}</span>
                {p.data.isBot && isHost && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => run('removeBot', { gameId: game.recordId, botUserId: p.data.userId })}
                    aria-label={`Remove ${p.data.alias}`}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </PlayerChip>
          ))}
        </div>
        {isHost && (
          <Button variant="secondary" className="mt-4 w-full" disabled={!canAddBot || busy} onClick={() => run('addBot', { gameId: game.recordId })}>
            {canAddBot ? `Add AI player (${botCount}/${MAX_BOTS})` : botCount >= MAX_BOTS ? `Max ${MAX_BOTS} AI players` : 'Room is full'}
          </Button>
        )}
      </section>

      {isHost ? (
        <Button size="lg" disabled={!enough || busy} loading={busy} onClick={() => run('startRound', { gameId: game.recordId })}>
          {enough ? 'Start episode' : `Need ${MIN_PLAYERS - players.length} more`}
        </Button>
      ) : (
        <p className="text-center text-muted-foreground">Waiting for the host to start the episode...</p>
      )}
    </div>
  )
}

// ── Hat draw ────────────────────────────────────────────────────────────────

export function DrawPhase({ s }: { s: RoomState }) {
  const g = s.game.data
  const isDrawer = g.drawerId === s.myId
  const { busy, run } = useAction()
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 text-center">
      <p className="font-display text-[10px] leading-relaxed text-muted-foreground">
        {isDrawer ? 'YOU WERE CHOSEN TO DRAW' : `${s.alias(g.drawerId).toUpperCase()} IS DRAWING`}
      </p>
      <Hat />
      {isDrawer && (
        <Button size="lg" loading={busy} disabled={busy} onClick={() => run('drawChit', { gameId: s.game.recordId }).then(sfx.draw)}>
          Draw a chit
        </Button>
      )}
      <TimerBar remaining={s.remaining} total={TIMERS.draw} label="AUTO-DRAW IN" />
    </div>
  )
}

/** The synced chit unfold + secret card, shown for the first few seconds after the draw. */
export function ChitReveal({ s }: { s: RoomState }) {
  const location = getLocation(s.game.data.location)
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
      <p className="font-display text-[10px] text-muted-foreground">TONIGHT'S LOCATION</p>
      <Hat location={location} />
      <SecretCard assignment={s.assignment} />
    </div>
  )
}

// ── Clue board ──────────────────────────────────────────────────────────────

export function ClueBoard({ s }: { s: RoomState }) {
  const g = s.game.data
  const current = g.status === 'clues' ? g.turnOrder[g.turnIndex % g.turnOrder.length] : null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {g.turnOrder.map((id) => {
        const mine = s.clues.filter((c) => c.data.playerId === id).sort((a, b) => a.data.turn - b.data.turn)
        return (
          <PlayerChip
            key={id}
            userId={id}
            alias={s.alias(id)}
            highlight={id === current ? 'turn' : id === s.myId ? 'me' : null}
          >
            <div className="flex flex-wrap gap-x-3 text-lg leading-tight">
              {mine.length === 0 ? (
                <span className="text-muted-foreground">{id === current ? 'thinking...' : '—'}</span>
              ) : (
                mine.map((c) => (
                  <span key={c.recordId} className={c.data.text === '…' ? 'text-muted-foreground' : 'text-foreground'}>
                    {c.data.text === '…' ? '(passed)' : c.data.text}
                  </span>
                ))
              )}
            </div>
          </PlayerChip>
        )
      })}
    </div>
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

  useEffect(() => {
    if (myTurn) {
      sfx.turn()
      inputRef.current?.focus()
    }
  }, [myTurn, g.turnIndex])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await run('submitClue', { gameId: s.game.recordId, text: text.trim() })
    if (r.success) setText('')
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-4">
        <SecretCard assignment={s.assignment} compact />
        <DetectiveScan s={s} />
      </div>
      <div className="flex flex-col gap-4">
        <div className="px-panel p-4">
          <div className="mb-3 font-display text-[10px] leading-relaxed text-muted-foreground">
            LAP {lap}/{laps} · {myTurn ? <span className="text-hero">YOUR TURN</span> : `${s.alias(current).toUpperCase()}'S TURN`}
          </div>
          {myTurn ? (
            <form onSubmit={submit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value.replace(/\s/g, ''))}
                placeholder="One-word clue"
                maxLength={24}
                aria-label="Your one-word clue"
                autoComplete="off"
              />
              <Button type="submit" disabled={!text.trim() || busy} loading={busy}>
                Send
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground">Watch the clues. Who sounds off?</p>
          )}
          <div className="mt-4">
            <TimerBar remaining={s.remaining} total={isBotId(current) ? TIMERS.botTurn : TIMERS.clueTurn} label="TURN" />
          </div>
        </div>
        <ClueBoard s={s} />
      </div>
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
        <SecretCard assignment={s.assignment} compact />
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
      <div className="mb-2 font-display text-[10px] text-muted-foreground">INTERROGATION ROOM</div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {records.length === 0 && <p className="text-muted-foreground">Who gave the weird clue? Make your case.</p>}
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
