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
import { useAuth, usePresence, useQuery } from 'deepspace'
import { Button } from '@/components/ui'
import { EPISODE_TITLES, getLocation } from '@/game/data'
import type { Assignment, Clue, Game, Player, Vote } from '@/game/types'
import { callAction, syncServerClock, useAdvanceOnExpire } from '@/lib/game-client'
import { LocationBackdrop } from '@/components/game/LocationBackdrop'
import { Skyline } from '@/components/game/Skyline'
import { SettingsToggles, TitleCard } from '@/components/game/widgets'
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

  if (games.status === 'loading') return <Centered>Tuning in...</Centered>
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
          'Taking your seat...'
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
    alias: (id) => (id ? (aliasMap.get(id) ?? 'Unknown hero') : 'no one'),
    remaining,
  }

  const location = getLocation(g.location)
  const inRound = g.status !== 'lobby' && g.status !== 'draw'

  return (
    <div className="relative min-h-full overflow-x-hidden">
      {/* Backdrop: skyline in the lobby/draw, tonight's location during the round. */}
      {inRound && location ? (
        <div className="fixed inset-0 -z-0 opacity-40">
          <LocationBackdrop locationId={location.id} />
        </div>
      ) : (
        <Skyline className="fixed h-56 opacity-70" />
      )}

      <TitleCard
        phaseKey={`${g.round}:${g.status}`}
        episode={Math.max(1, g.round)}
        title={g.status === 'clues' && revealing && location ? location.name.toUpperCase() : EPISODE_TITLES[g.status]}
      />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <header className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-[10px] text-magenta">
              {g.round > 0 ? `EPISODE ${g.round}` : 'PRE-SHOW'} · {EPISODE_TITLES[g.status]}
            </div>
            <div className="truncate text-muted-foreground">
              Room {g.code}
              {location && inRound ? ` · ${location.emoji} ${location.name}` : ''}
            </div>
          </div>
          <SettingsToggles />
        </header>

        {g.status === 'lobby' && <Lobby s={s} />}
        {g.status === 'draw' && <DrawPhase s={s} />}
        {g.status === 'clues' && (revealing ? <ChitReveal s={s} /> : <CluePhase s={s} />)}
        {g.status === 'discuss' && <DiscussPhase s={s} />}
        {g.status === 'vote' && <VotePhase s={s} />}
        {g.status === 'lastguess' && <LastGuessPhase s={s} />}
        {g.status === 'reveal' && <RevealPhase s={s} />}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center text-muted-foreground">{children}</div>
}
