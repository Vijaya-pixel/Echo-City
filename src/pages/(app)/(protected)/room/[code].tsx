/**
 * /room/:code — one night in Echo City.
 *
 * Reads everything live with useQuery. Note what the browser can and cannot
 * see: `assignments` and `votes` are read: 'own', so these queries only ever
 * return THIS player's rows, even though they ask for the whole round. The
 * truth (villain, both words) arrives only via `games.result` at the reveal.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useMutations, usePresence, useQuery } from 'deepspace'
import { Button } from '@/components/ui'
import type { Assignment, Clue, Game, Player, Sus, Vote } from '@/game/types'
import { callAction, syncServerClock, useAdvanceOnExpire } from '@/lib/game-client'
import { SceneBackdrop } from '@/components/game/PixelScene'
import { PhaseTracker, SettingsToggles, SignalLoader } from '@/components/game/widgets'
import { ChitReveal, CluePhase, DiscussPhase, DrawPhase, Lobby, useIsRevealingCard, type RoomState } from '@/components/game/phases'
import { LastGuessPhase, RevealPhase, VotePhase } from '@/components/game/endgame'

const NONE = '__none__' // placeholder id so hooks can always run

export default function RoomPage() {
  const { code = '' } = useParams()
  const roomCode = code.toUpperCase()
  const { userId } = useAuth()
  const myId = userId ?? ''

  const games = useQuery<Game>('games', { where: { code: roomCode }, limit: 1 })
  const game = games.records[0]
  const gameId = game?.recordId ?? NONE
  const round = game?.data.round ?? -1

  const players = useQuery<Player>('players', { where: { gameId }, orderBy: 'createdAt', orderDir: 'asc' })
  const clues = useQuery<Clue>('clues', { where: { gameId, round }, orderBy: 'turn', orderDir: 'asc' })
  // Only my own rows ever arrive here (read: 'own').
  const assignments = useQuery<Assignment>('assignments', { where: { gameId, round } })
  const votes = useQuery<Vote>('votes', { where: { gameId, round } })
  // Live suspicion taps (public). Voter = voterId (AI) or createdBy (humans).
  const susRows = useQuery<Sus>('sus', { where: { gameId, round } })
  const susMut = useMutations<Sus>('sus')
  const { isOnline } = usePresence()

  const seated = players.records.some((p) => p.data.userId === myId)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    void syncServerClock()
  }, [])

  // Auto-join when you open a room link you're not seated in yet.
  useEffect(() => {
    if (!game || !myId || players.status !== 'ready' || seated || joinError) return
    void callAction('joinRoom', { code: roomCode }).then((r) => {
      if (!r.success) setJoinError(r.error)
    })
  }, [game, myId, players.status, seated, joinError, roomCode])

  const g = game?.data
  const phaseKey = g ? `${g.round}:${g.status}:${g.turnIndex}` : 'none'
  const remaining = useAdvanceOnExpire(seated ? game?.recordId : undefined, phaseKey, g?.phaseEndsAt ?? 0)
  const revealing = useIsRevealingCard(g ?? ({ status: 'lobby', drawnAt: 0 } as Game))

  const aliasMap = useMemo(() => new Map(players.records.map((p) => [p.data.userId, p.data.alias])), [players.records])

  if (games.status === 'loading') return <Centered><SignalLoader label="CONNECTING TO ECHO CITY" sub="Picking up the signal…" /></Centered>
  if (!game || !g) {
    return (
      <Centered>
        <p>No room with code {roomCode}.</p>
        <Link to="/home" className="mt-4 inline-block text-hero underline">
          Back to HQ
        </Link>
      </Centered>
    )
  }
  if (!seated) {
    return (
      <Centered>
        {joinError ? (
          <>
            <p>{joinError}</p>
            <Button variant="secondary" className="mt-4" onClick={() => setJoinError(null)}>
              Try again
            </Button>
          </>
        ) : (
          <SignalLoader label="JOINING THE CREW" sub="Finding you a seat…" />
        )}
      </Centered>
    )
  }

  const s: RoomState = {
    game,
    players: players.records,
    myId,
    assignment: assignments.records.find((a) => a.data.ownerId === myId)?.data,
    clues: clues.records,
    myVote: votes.records.find((v) => v.data.voterId === myId)?.data,
    isOnline,
    // Your own hero name always carries "(you)" so you can find yourself on every screen.
    alias: (id) => (id ? `${aliasMap.get(id) ?? 'Unknown hero'}${id === myId ? ' (you)' : ''}` : 'no one'),
    remaining,
    sus: (() => {
      const counts = new Map<string, number>()
      let mine: { recordId: string; targetId: string }[] = []
      for (const row of susRows.records) {
        counts.set(row.data.targetId, (counts.get(row.data.targetId) ?? 0) + 1)
        if (!row.data.voterId && row.createdBy === myId) mine = [...mine, { recordId: row.recordId, targetId: row.data.targetId }]
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      return {
        count: (id: string) => counts.get(id) ?? 0,
        mine: (id: string) => mine.some((m) => m.targetId === id),
        topId: top && top[1] > 0 && [...counts.values()].filter((v) => v === top[1]).length === 1 ? top[0] : null,
        max: Math.max(1, players.records.length - 1),
        toggle: (id: string) => {
          const existing = mine.find((m) => m.targetId === id)
          if (existing) void susMut.remove(existing.recordId)
          else if (susMut.ready) void susMut.create({ gameId, round, targetId: id })
        },
      }
    })(),
  }

  const inRound = g.status !== 'lobby' && g.status !== 'draw'

  return (
    <div className="relative min-h-full overflow-x-hidden">
      {/* Backdrop: Echo City (the only setting), dimmed a little more during a round. */}
      <SceneBackdrop scene="echo-dusk" dim={inRound ? 'medium' : 'light'} />


      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <header className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-[10px] text-magenta">{g.round > 0 ? `ROUND ${g.round}` : 'LOBBY'}</div>
            <div className="truncate text-muted-foreground">
              Room {g.code}
              {aliasMap.get(myId) ? ` · You are ${aliasMap.get(myId)}` : ''}
            </div>
          </div>
          {g.status !== 'lobby' && <PhaseTracker status={g.status} />}
          <SettingsToggles />
        </header>


        <div key={`${g.round}:${g.status}:${revealing ? 'r' : ''}`} className="phase-enter">
        {g.status === 'lobby' && <Lobby s={s} />}
        {g.status === 'draw' && <DrawPhase />}
        {g.status === 'clues' && (revealing ? <ChitReveal s={s} /> : <CluePhase s={s} />)}
        {g.status === 'discuss' && <DiscussPhase s={s} />}
        {g.status === 'vote' && <VotePhase s={s} />}
        {g.status === 'lastguess' && <LastGuessPhase s={s} />}
        {g.status === 'reveal' && <RevealPhase s={s} />}
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center text-muted-foreground">{children}</div>
}
