/**
 * Phase screens, part 2: vote, the blind villain's last guess, and the reveal
 * (VS-style unmasking, words, tally, points and the AI narrator).
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '@/components/ui'
import { TIMERS } from '@/game/data'
import { callAction, sfx, useSettings } from '@/lib/game-client'
import { PixelAvatar } from './PixelAvatar'
import { ClueBoard, useAction, type RoomState } from './phases'
import { Confetti, PlayerChip, TimerBar } from './widgets'

// ── Vote ────────────────────────────────────────────────────────────────────

export function VotePhase({ s }: { s: RoomState }) {
  const g = s.game.data
  const { busy, run } = useAction()
  const voted = s.players.filter((p) => p.data.votedRound === g.round).length
  const myTarget = s.myVote?.targetId

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="px-panel p-4">
        <TimerBar remaining={s.remaining} total={TIMERS.vote} label={`VOTES ${voted}/${s.players.length}`} />
        <p className="mt-3 text-center text-muted-foreground">
          {myTarget ? `You voted for ${s.alias(myTarget)}. Waiting for the others...` : 'Who is the villain? Tap to vote. Votes are final.'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {s.players.map((p) => {
          const id = p.data.userId
          const isMe = id === s.myId
          const chosen = myTarget === id
          return (
            <button
              key={p.recordId}
              type="button"
              disabled={isMe || !!myTarget || busy}
              onClick={() => {
                sfx.vote()
                void run('castVote', { gameId: s.game.recordId, targetId: id })
              }}
              className={`px-panel flex min-h-36 flex-col items-center justify-center gap-2 p-3 text-center disabled:cursor-default ${
                chosen ? 'px-panel-villain' : ''
              } ${!isMe && !myTarget ? 'hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5' : ''} ${isMe ? 'opacity-60' : ''}`}
              aria-pressed={chosen}
            >
              <PixelAvatar seed={id} size={56} title={p.data.alias} />
              <span className="font-display text-[10px] leading-relaxed">{p.data.alias}</span>
              <span className="text-muted-foreground">
                {isMe ? 'you' : p.data.votedRound === g.round ? 'has voted' : 'deciding...'}
              </span>
            </button>
          )
        })}
      </div>
      <ClueBoard s={s} />
    </div>
  )
}

// ── Last guess (Blind Villain) ─────────────────────────────────────────────

export function LastGuessPhase({ s }: { s: RoomState }) {
  const amVillain = s.assignment?.shownRole === 'villain'
  const [guess, setGuess] = useState('')
  const { busy, run } = useAction()
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 text-center">
      <div className="px-panel px-panel-villain p-4">
        <div className="font-display text-sm text-villain">VILLAIN CAUGHT!</div>
        <p className="mt-3 text-muted-foreground">
          {amVillain
            ? 'One chance to steal the win: what is the heroes’ secret word?'
            : 'The villain gets one last guess at your word...'}
        </p>
        {amVillain && (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void run('lastGuess', { gameId: s.game.recordId, guess })
            }}
          >
            <Input value={guess} onChange={(e) => setGuess(e.target.value)} maxLength={40} placeholder="Your guess" aria-label="Your guess" autoFocus />
            <Button type="submit" variant="destructive" disabled={!guess.trim() || busy} loading={busy}>
              Guess
            </Button>
          </form>
        )}
        <div className="mt-4">
          <TimerBar remaining={s.remaining} total={TIMERS.lastGuess} label="LAST GUESS" />
        </div>
      </div>
      <ClueBoard s={s} />
    </div>
  )
}

// ── Reveal ──────────────────────────────────────────────────────────────────

export function RevealPhase({ s }: { s: RoomState }) {
  const g = s.game.data
  const r = g.result
  const isHost = g.hostId === s.myId
  const { busy, run } = useAction()
  const heroesWon = r?.winner === 'heroes'
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (!r) return
    if (heroesWon) {
      sfx.caught()
      setShake(true)
      const t = setTimeout(() => setShake(false), 600)
      return () => clearTimeout(t)
    }
    sfx.escaped()
  }, [r, heroesWon])

  if (!r) return <p className="text-center text-muted-foreground">Counting votes...</p>

  const headline =
    r.reason === 'caught' ? 'VILLAIN UNMASKED!' : r.reason === 'stole' ? 'THE VILLAIN STOLE THE NIGHT' : 'THE VILLAIN ESCAPED'
  const scoreboard = [...s.players].sort((a, b) => (b.data.score ?? 0) - (a.data.score ?? 0))

  return (
    <div className={`mx-auto flex w-full max-w-3xl flex-col gap-6 ${shake ? 'shake' : ''}`}>
      {heroesWon && <Confetti />}
      <h2 className={`text-center text-base sm:text-xl ${heroesWon ? 'text-lime' : 'text-villain'}`}>{headline}</h2>

      {/* VS: accused vs the real villain */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="vs-left px-panel flex flex-col items-center gap-2 p-3 text-center">
          <div className="font-display text-[10px] text-muted-foreground">ACCUSED</div>
          {r.accusedId ? (
            <>
              <PixelAvatar seed={r.accusedId} size={72} evil={r.accusedId === r.villainId} />
              <span className="font-display text-[10px] leading-relaxed">{s.alias(r.accusedId)}</span>
            </>
          ) : (
            <span className="py-6 text-muted-foreground">No majority</span>
          )}
        </div>
        <div className="vs-pop font-display text-xl text-magenta">VS</div>
        <div className="vs-right px-panel px-panel-villain flex flex-col items-center gap-2 p-3 text-center">
          <div className="font-display text-[10px] text-villain">THE VILLAIN</div>
          <PixelAvatar seed={r.villainId} size={72} evil />
          <span className="font-display text-[10px] leading-relaxed">{s.alias(r.villainId)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="px-panel px-panel-hero p-3">
          <div className="font-display text-[10px] text-hero">HEROES' WORD</div>
          <div className="mt-2 font-display text-sm">{r.wordA.toUpperCase()}</div>
        </div>
        <div className="px-panel px-panel-villain p-3">
          <div className="font-display text-[10px] text-villain">VILLAIN'S WORD</div>
          <div className="mt-2 font-display text-sm">{r.wordB ? r.wordB.toUpperCase() : 'NONE'}</div>
          {r.guess && <div className="mt-1 text-muted-foreground">guessed: {r.guess}</div>}
        </div>
      </div>

      <Narrator s={s} />

      <section className="px-panel p-4">
        <h3 className="mb-3 text-[10px] text-muted-foreground">THE VOTE</h3>
        <ul className="space-y-2">
          {s.players.map((p) => {
            const id = p.data.userId
            const count = r.tally[id] ?? 0
            const votedFor = r.votes[id]
            return (
              <li key={p.recordId} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <div>
                  <span className={id === r.villainId ? 'text-villain' : 'text-foreground'}>{p.data.alias}</span>
                  <span className="text-muted-foreground"> → {votedFor ? s.alias(votedFor) : 'no vote'}</span>
                  <div className="mt-1 h-3 border-2 border-border bg-background">
                    <div className="h-full bg-villain" style={{ width: `${(count / Math.max(1, s.players.length)) * 100}%` }} />
                  </div>
                </div>
                <span className="font-display text-[10px] text-lime">+{r.points[id] ?? 0}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="px-panel p-4">
        <h3 className="mb-3 text-[10px] text-muted-foreground">SCOREBOARD</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scoreboard.map((p, i) => (
            <PlayerChip key={p.recordId} userId={p.data.userId} alias={`${i + 1}. ${p.data.alias}`} evil={p.data.userId === r.villainId}>
              <span className="text-hero">{p.data.score ?? 0} pts</span>
            </PlayerChip>
          ))}
        </div>
      </section>

      {isHost ? (
        <Button size="lg" loading={busy} disabled={busy} onClick={() => run('startRound', { gameId: s.game.recordId })}>
          Next episode
        </Button>
      ) : (
        <p className="text-center text-muted-foreground">Waiting for the host to start the next episode...</p>
      )}
    </div>
  )
}

/**
 * Plays the ElevenLabs narration once per reveal (unless muted). The server
 * only allows one narration per player per round, so we keep the audio here
 * for replays instead of re-requesting it.
 */
function Narrator({ s }: { s: RoomState }) {
  const { muted } = useSettings()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const requested = useRef(false)
  const round = s.game.data.round

  const load = async (autoplay: boolean) => {
    if (requested.current) return
    requested.current = true
    setState('loading')
    const r = await callAction<{ audio: string }>('narrate', { gameId: s.game.recordId })
    if (!r.success) {
      setState('error')
      return
    }
    setAudioUrl(r.data.audio)
    setState('ready')
    if (autoplay) {
      const a = new Audio(r.data.audio)
      audioRef.current = a
      a.play().catch(() => {
        /* autoplay blocked: the replay button still works */
      })
    }
  }

  useEffect(() => {
    if (!muted) void load(true)
    // Only once per round.
  }, [round])

  useEffect(() => {
    if (muted) audioRef.current?.pause()
  }, [muted])

  const play = () => {
    if (!audioUrl) return void load(true)
    audioRef.current?.pause()
    audioRef.current = new Audio(audioUrl)
    void audioRef.current.play().catch(() => undefined)
  }

  return (
    <div className="flex items-center justify-center gap-3 text-muted-foreground">
      <span className="font-display text-[10px]">NARRATOR</span>
      {state === 'loading' && <span>warming up the mic...</span>}
      {state === 'error' && <span>narrator unavailable tonight</span>}
      {(state === 'ready' || state === 'idle') && (
        <Button variant="secondary" size="sm" onClick={play} disabled={muted}>
          {muted ? 'Muted' : state === 'idle' ? 'Play' : 'Replay'}
        </Button>
      )}
    </div>
  )
}
