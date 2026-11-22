/**
 * Phase screens, part 2: vote, the blind villain's last guess, and the reveal
 * (VS-style unmasking, words, tally, points and the AI narrator).
 */

import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { TIMERS } from '@/game/data'
import { callAction, sfx, useSettings } from '@/lib/game-client'
import { PixelAvatar } from './PixelAvatar'
import { ClueBoard, useAction, type RoomState } from './phases'
import { Confetti, SignalLoader, TimerBar, WorkingDots } from './widgets'

// ── Vote ────────────────────────────────────────────────────────────────────

export function VotePhase({ s }: { s: RoomState }) {
  const g = s.game.data
  const { busy, run } = useAction()
  const voted = s.players.filter((p) => p.data.votedRound === g.round).length
  const myTarget = s.myVote?.targetId
  const need = Math.floor(s.players.length / 2) + 1

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="px-panel p-4">
        <TimerBar remaining={s.remaining} total={TIMERS.vote} label={`VOTES ${voted}/${s.players.length}`} />
        <p className="mt-3 text-center text-muted-foreground">
          {myTarget ? (
            <span className="inline-flex items-center gap-2">
              Vote locked in: <b className="text-foreground">{s.alias(myTarget)}</b>. {voted >= s.players.length ? 'Counting votes' : `Waiting for ${s.players.length - voted} more`} <WorkingDots />
            </span>
          ) : (
            `Tap who you think is the Glitch. Catching them needs ${need} of ${s.players.length} votes.`
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {s.players.map((p) => {
          const id = p.data.userId
          const isMe = id === s.myId
          const chosen = myTarget === id
          return (
            <div
              key={p.recordId}
              className={`px-panel flex flex-col items-center p-3 text-center ${chosen ? 'px-panel-villain' : ''} ${isMe ? 'opacity-60' : ''}`}
            >
              <button
                type="button"
                disabled={isMe || !!myTarget || busy}
                onClick={() => {
                  sfx.vote()
                  void run('castVote', { gameId: s.game.recordId, targetId: id })
                }}
                className={`tap flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl disabled:cursor-default ${
                  !isMe && !myTarget ? 'hover:brightness-110' : ''
                }`}
                aria-pressed={chosen}
                aria-label={`Vote for ${p.data.alias}`}
              >
                <PixelAvatar seed={id} size={56} title={p.data.alias} />
                <span className="font-display text-[10px] leading-relaxed">{s.alias(id)}</span>
                <span className="text-muted-foreground">
                  {isMe ? 'you' : p.data.votedRound === g.round ? 'has voted' : 'deciding...'}
                </span>
              </button>
            </div>
          )
        })}
      </div>
      <ClueBoard s={s} />
    </div>
  )
}

// ── Last guess (Shadow Protocol / blind mode) ─────────────────────────────────────────────

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
            : 'The Glitch gets one last guess at your word...'}
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

  if (!r) return <SignalLoader label="COUNTING VOTES" sub="Unmasking the Glitch…" />

  const amVillain = r.villainId === s.myId
  const iWon = amVillain ? r.winner === 'villain' : r.winner === 'heroes'
  const villain = s.alias(r.villainId)
  const reason =
    r.reason === 'caught'
      ? amVillain ? 'You got caught.' : 'The villain got caught.'
      : r.reason === 'stole'
        ? `Caught, but guessed the word "${r.guess}".`
        : r.accusedId
          ? `Wrong player voted out: ${s.alias(r.accusedId)}.`
          : (() => {
              const ranked = Object.entries(r.tally).sort((a, b) => b[1] - a[1])
              const need = Math.floor(s.players.length / 2) + 1
              if (!ranked.length || ranked[0][1] === 0) return 'No votes were cast. Nobody got caught.'
              if (ranked[1]?.[1] === ranked[0][1]) return `Votes tied at ${ranked[0][1]} each. Nobody got caught.`
              return `${s.alias(ranked[0][0])} got ${ranked[0][1]} of ${s.players.length} votes, but catching needs ${need}. Nobody got caught.`
            })()
  const rows = [...s.players].sort((a, b) => (r.points[b.data.userId] ?? 0) - (r.points[a.data.userId] ?? 0) || (b.data.score ?? 0) - (a.data.score ?? 0))

  return (
    <div className={`mx-auto flex w-full max-w-xl flex-col gap-4 ${shake ? 'shake' : ''}`}>
      {iWon && <Confetti />}

      {/* 1. Did I win? */}
      <section className={`px-panel ${iWon ? 'px-panel-lime' : 'px-panel-villain'} p-5 text-center`}>
        <h2 className={`text-3xl sm:text-4xl ${iWon ? 'text-lime' : 'text-villain'}`}>{iWon ? 'YOU WON' : 'YOU LOST'}</h2>
        <p className="mt-2 text-lg text-foreground">{reason}</p>
      </section>

      {/* 2. Who was the Glitch + the words */}
      <section className="px-panel flex items-center gap-4 p-4">
        <PixelAvatar seed={r.villainId} size={64} evil title={villain} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">The Glitch was</div>
          <div className="font-display text-lg font-extrabold text-villain">{villain}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-hero/50 px-3 py-1">
              Heroes: <b className="text-foreground">{r.wordA}</b>
            </span>
            <span className="rounded-full border border-villain/50 px-3 py-1">
              Glitch: <b className="text-foreground">{r.wordB || 'no word'}</b>
            </span>
          </div>
        </div>
      </section>

      {/* 3. Scores */}
      <section className="px-panel p-2">
        <ul className="flex flex-col">
          {rows.map((p) => {
            const id = p.data.userId
            const pts = r.points[id] ?? 0
            const votedFor = r.votes[id]
            return (
              <li key={p.recordId} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${id === s.myId ? 'bg-hero/10' : ''}`}>
                <PixelAvatar seed={id} size={32} evil={id === r.villainId} title={p.data.alias} />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-semibold ${id === r.villainId ? 'text-villain' : 'text-foreground'}`}>{s.alias(id)}</div>
                  <div className="truncate text-xs text-muted-foreground">voted {votedFor ? s.alias(votedFor) : 'nobody'}</div>
                </div>
                <span className={`font-display text-sm font-extrabold ${pts ? 'text-lime' : 'text-muted-foreground'}`}>+{pts}</span>
                <span className="w-14 text-right text-sm text-muted-foreground">{p.data.score ?? 0} pts</span>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        {isHost ? (
          <Button size="lg" className="flex-1" loading={busy} disabled={busy} onClick={() => run('startRound', { gameId: s.game.recordId })}>
            Play next round
          </Button>
        ) : (
          <p className="flex-1 text-center text-muted-foreground">Standing by: the host starts the next round.</p>
        )}
        <Narrator s={s} />
      </div>
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
    <Button variant="secondary" size="icon" onClick={play} disabled={muted || state === 'loading' || state === 'error'} aria-label="Replay narrator" title={state === 'error' ? 'Narrator unavailable' : 'Replay narrator'}>
      {state === 'loading' ? '…' : <Volume2 className="h-4 w-4" aria-hidden />}
    </Button>
  )
}
