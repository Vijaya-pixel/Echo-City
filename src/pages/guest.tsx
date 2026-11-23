/**
 * /guest — play one Night Shift round as a guest, against 3 rule-based bots.
 *
 * DeepSpace doesn't allow anonymous accounts, so guest play runs entirely in
 * the browser: no sign-in, no server, nothing saved, no stats. It reuses the
 * same rule-based bot logic as the real game (src/game/bots.ts). Signing in
 * unlocks multiplayer rooms and stats.
 *
 * Static page (top level of src/pages): no auth fetch and no WebSocket.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { SceneBackdrop } from '../components/game/PixelScene'
import { PixelAvatar } from '../components/game/PixelAvatar'
import { Confetti, TimerBar, WorkingDots } from '../components/game/widgets'
import { Button, Input } from '@/components/ui'
import { LOCATIONS, PERSONALITIES, makeAlias, normalizeWord, pick, shuffle, type Personality } from '@/game/data'
import { ruleClue, ruleGuess, ruleOpener, rulePick, ruleReply } from '@/game/bots'

const ME = 'guest-you'
const BOT_THINK_MS = 1300
const CLUE_MS = 20_000
const DISCUSS_MS = 30_000
const VOTE_MS = 20_000

interface P {
  id: string
  alias: string
  bot: boolean
  personality: Personality
}
interface Line {
  from: string
  text: string
}
type Phase = 'reveal' | 'clues' | 'discuss' | 'vote' | 'lastguess' | 'results'

function newRound() {
  const taken: string[] = []
  const players: P[] = [{ id: ME, alias: 'You', bot: false, personality: 'cautious' }]
  for (let i = 0; i < 3; i++) {
    const alias = makeAlias(taken)
    taken.push(alias)
    players.push({ id: `bot-${i}`, alias, bot: true, personality: pick(PERSONALITIES) })
  }
  const word = pick(pick(LOCATIONS[0].pairs.rookie))
  return { players, order: shuffle(players.map((p) => p.id)), glitch: pick(players).id, word }
}

/** Countdown to a deadline (ms), re-rendering ~4x a second. */
function useCountdown(deadline: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, deadline - now)
}

export default function GuestPage() {
  const [round, setRound] = useState(newRound)
  const { players, order, glitch, word } = round
  const [phase, setPhase] = useState<Phase>('reveal')
  const [deadline, setDeadline] = useState(() => Date.now() + 4000)
  const [turn, setTurn] = useState(0)
  const [clues, setClues] = useState<Record<string, string>>({})
  const [chat, setChat] = useState<Line[]>([])
  const [sus, setSus] = useState<Record<string, string[]>>({}) // targetId -> voterIds
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [guess, setGuess] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const botLines = useRef<Record<string, number>>({})
  const remaining = useCountdown(deadline)

  const amGlitch = glitch === ME
  const myWord = amGlitch ? '' : word
  const name = (id: string) => players.find((p) => p.id === id)?.alias ?? '?'
  const wordOf = (id: string) => (id === glitch ? '' : word)
  const current = order[turn]

  const candidates = (self: string) =>
    players
      .filter((p) => p.id !== self)
      .map((p) => ({ id: p.id, clues: clues[p.id] ? [clues[p.id]] : [], sus: (sus[p.id] ?? []).length }))

  const say = (botId: string, text: string) => {
    const n = botLines.current[botId] ?? 0
    if (n >= 3) return
    botLines.current[botId] = n + 1
    setChat((c) => [...c, { from: botId, text }])
  }

  // Phase timers / bot actions
  useEffect(() => {
    if (remaining > 0) return
    if (phase === 'reveal') {
      setPhase('clues')
      setDeadline(Date.now() + (players.find((p) => p.id === order[0])!.bot ? BOT_THINK_MS : CLUE_MS))
    } else if (phase === 'clues') {
      const p = players.find((x) => x.id === current)!
      const text = p.bot ? ruleClue(wordOf(p.id), Object.values(clues), Math.random) : '…'
      giveClue(p.id, text)
    } else if (phase === 'discuss') {
      startVote()
    } else if (phase === 'vote') {
      resolve(votes)
    } else if (phase === 'lastguess') {
      finish(guess ?? '')
    }
  }, [remaining, phase])

  function giveClue(id: string, text: string) {
    const next = { ...clues, [id]: text }
    setClues(next)
    const t = turn + 1
    if (t >= order.length) {
      // Discussion: each bot taps SUS on its suspect and says one line.
      const nextSus: Record<string, string[]> = {}
      for (const b of players.filter((p) => p.bot)) {
        const cands = players.filter((p) => p.id !== b.id).map((p) => ({ id: p.id, clues: next[p.id] ? [next[p.id]] : [], sus: 0 }))
        const target = rulePick(wordOf(b.id), cands, Math.random)
        nextSus[target] = [...(nextSus[target] ?? []), b.id]
        setTimeout(() => say(b.id, ruleOpener(b.personality, name(target), Math.random)), 600 + Math.random() * 1800)
      }
      setSus(nextSus)
      setPhase('discuss')
      setDeadline(Date.now() + DISCUSS_MS)
    } else {
      setTurn(t)
      setDeadline(Date.now() + (players.find((p) => p.id === order[t])!.bot ? BOT_THINK_MS : CLUE_MS))
    }
  }

  function startVote() {
    const v: Record<string, string> = {}
    for (const b of players.filter((p) => p.bot)) v[b.id] = rulePick(wordOf(b.id), candidates(b.id), Math.random)
    setVotes(v)
    setPhase('vote')
    setDeadline(Date.now() + VOTE_MS)
  }

  function tally(v: Record<string, string>) {
    const counts: Record<string, number> = {}
    for (const t of Object.values(v)) counts[t] = (counts[t] ?? 0) + 1
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const need = Math.floor(players.length / 2) + 1
    const top = ranked[0]
    const accused = top && top[1] >= need && ranked[1]?.[1] !== top[1] ? top[0] : null
    return { counts, ranked, need, accused }
  }

  function resolve(v: Record<string, string>) {
    const { accused } = tally(v)
    if (accused === glitch) {
      if (glitch === ME) {
        setPhase('lastguess')
        setDeadline(Date.now() + VOTE_MS)
        return
      }
      const heroClues = Object.entries(clues).filter(([id]) => id !== glitch).map(([, c]) => c)
      return finish(ruleGuess(heroClues, Math.random))
    }
    finish(null)
  }

  function finish(g: string | null) {
    setGuess(g)
    setPhase('results')
    setDeadline(Date.now() + 60 * 60 * 1000)
  }

  function sendChat() {
    const t = input.trim().slice(0, 200)
    if (!t) return
    setChat((c) => [...c, { from: ME, text: t }])
    setInput('')
    for (const b of players.filter((p) => p.bot && t.toLowerCase().includes(p.alias.toLowerCase()))) {
      const target = rulePick(wordOf(b.id), candidates(b.id), Math.random)
      setTimeout(() => say(b.id, ruleReply(b.personality, target === ME ? 'You' : name(target), Math.random)), 900)
    }
  }

  function toggleSus(id: string) {
    setSus((s) => {
      const list = s[id] ?? []
      return { ...s, [id]: list.includes(ME) ? list.filter((x) => x !== ME) : [...list, ME] }
    })
  }

  function playAgain() {
    setRound(newRound())
    setPhase('reveal')
    setDeadline(Date.now() + 4000)
    setTurn(0)
    setClues({})
    setChat([])
    setSus({})
    setVotes({})
    setGuess(null)
    botLines.current = {}
  }

  const outcome = useMemo(() => {
    if (phase !== 'results') return null
    const t = tally(votes)
    const caught = t.accused === glitch
    const stole = caught && guess !== null && normalizeWord(guess) === normalizeWord(word)
    const glitchWins = !caught || stole
    const iWon = amGlitch ? glitchWins : !glitchWins
    const reason = caught
      ? stole
        ? `Caught, but guessed the word "${guess}".`
        : amGlitch
          ? 'You got caught.'
          : 'The Glitch got caught.'
      : t.accused
        ? `Wrong player voted out: ${name(t.accused)}.`
        : t.ranked[0] && t.ranked[1]?.[1] === t.ranked[0][1]
          ? `Votes tied at ${t.ranked[0][1]} each. Nobody got caught.`
          : t.ranked[0]
            ? `${name(t.ranked[0][0])} got ${t.ranked[0][1]} of ${players.length} votes, but catching needs ${t.need}.`
            : 'No votes. Nobody got caught.'
    return { iWon, reason }
  }, [phase])

  const need = Math.floor(players.length / 2) + 1

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <SceneBackdrop scene="echo-dusk" dim="medium" />
      <header className="relative z-20 border-b border-white/10 bg-[#070915]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Echo City home">
            <Logo height={20} />
          </Link>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted-foreground">Guest round · nothing is saved</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6">
        {/* Word strip */}
        <section className={`px-panel ${amGlitch ? 'px-panel-villain' : 'px-panel-hero'} flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3`}>
          <span className="eyebrow">Your word</span>
          <span className={`font-display text-xl font-extrabold ${myWord ? 'text-foreground' : 'text-villain'}`}>{myWord ? myWord.toUpperCase() : 'NO WORD'}</span>
          <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">
            {amGlitch ? 'You are the Glitch. Bluff from the clues.' : 'One player is the Glitch with no word.'}
          </span>
        </section>

        {phase === 'reveal' && (
          <section className="px-panel p-6 text-center">
            <div className="eyebrow">Round starting</div>
            <p className="mt-2 text-lg text-foreground">
              {amGlitch ? 'You are the Glitch: you have no word. Read the clues and blend in.' : `Your word is ${word.toUpperCase()}. Give one-word hints without saying it.`}
            </p>
          </section>
        )}

        {phase === 'clues' && (
          <section className={`px-panel ${current === ME ? 'px-panel-hero' : ''} p-4`}>
            {current === ME ? (
              <>
                <h2 className="text-base text-hero">YOUR TURN</h2>
                <p className="mt-1 text-muted-foreground">{myWord ? `Give a one-word hint for ${myWord.toUpperCase()}.` : 'You have no word. Give a clue that fits the others.'}</p>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const w = input.trim().split(/\s+/)[0]
                    if (!w) return
                    setInput('')
                    giveClue(ME, w)
                  }}
                >
                  <Input value={input} onChange={(e) => setInput(e.target.value.replace(/\s/g, ''))} placeholder="Type one word" aria-label="Your one-word clue" maxLength={24} autoFocus />
                  <Button type="submit" disabled={!input.trim()}>
                    Send
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <PixelAvatar seed={`bot:${current}`} size={44} />
                <div>
                  <h2 className="text-sm text-foreground">{name(current).toUpperCase()}</h2>
                  <p className="inline-flex items-center gap-2 text-muted-foreground">
                    is giving a clue <WorkingDots />
                  </p>
                </div>
              </div>
            )}
            <div className="mt-3">
              <TimerBar remaining={remaining} total={CLUE_MS} label="Time left" />
            </div>
          </section>
        )}

        {phase === 'discuss' && (
          <section className="px-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <TimerBar remaining={remaining} total={DISCUSS_MS} label="Discussion" />
            </div>
            <div className="mt-3 max-h-52 space-y-1 overflow-y-auto">
              {chat.length === 0 && <p className="text-muted-foreground">Whose clue didn&apos;t fit? Mention a bot by name to question it.</p>}
              {chat.map((l, i) => (
                <p key={i}>
                  <span className={l.from === ME ? 'text-detective' : 'text-[#ff9ad6]'}>{name(l.from)}:</span> {l.text}
                </p>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                sendChat()
              }}
            >
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Say something..." aria-label="Chat message" maxLength={200} />
              <Button type="submit" size="sm" disabled={!input.trim()}>
                Send
              </Button>
            </form>
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={startVote}>
              Skip to vote
            </Button>
          </section>
        )}

        {phase === 'vote' && (
          <section className="px-panel p-4">
            <TimerBar remaining={remaining} total={VOTE_MS} label="Vote" />
            <p className="mt-3 text-center text-muted-foreground">
              {votes[ME] ? `Vote locked in: ${name(votes[ME])}.` : `Tap who you think is the Glitch. Catching them needs ${need} of ${players.length} votes.`}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {players
                .filter((p) => p.id !== ME)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!!votes[ME]}
                    onClick={() => {
                      const v = { ...votes, [ME]: p.id }
                      setVotes(v)
                      setTimeout(() => resolve(v), 900)
                    }}
                    className={`tap flex flex-col items-center gap-2 rounded-xl border p-3 ${votes[ME] === p.id ? 'border-villain bg-villain/10' : 'border-white/10 bg-white/[0.03]'}`}
                    aria-label={`Vote for ${p.alias}`}
                  >
                    <PixelAvatar seed={`bot:${p.id}`} size={48} />
                    <span className="font-display text-[10px]">{p.alias}</span>
                  </button>
                ))}
            </div>
          </section>
        )}

        {phase === 'lastguess' && (
          <section className="px-panel px-panel-villain p-4 text-center">
            <h2 className="text-sm text-villain">YOU WERE CAUGHT</h2>
            <p className="mt-2 text-muted-foreground">One chance to steal the win: what is the heroes&apos; word?</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                finish(input.trim())
                setInput('')
              }}
            >
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Your guess" aria-label="Your guess" autoFocus />
              <Button type="submit" variant="destructive" disabled={!input.trim()}>
                Guess
              </Button>
            </form>
          </section>
        )}

        {phase === 'results' && outcome && (
          <>
            {outcome.iWon && <Confetti />}
            <section className={`px-panel ${outcome.iWon ? 'px-panel-lime' : 'px-panel-villain'} p-5 text-center`}>
              <h2 className={`text-3xl ${outcome.iWon ? 'text-lime' : 'text-villain'}`}>{outcome.iWon ? 'YOU WON' : 'YOU LOST'}</h2>
              <p className="mt-2 text-lg text-foreground">{outcome.reason}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                The Glitch was <b className="text-villain">{name(glitch)}</b>. The word was <b className="text-foreground">{word}</b>.
              </p>
            </section>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={playAgain}>
                Play again
              </Button>
              <Link to="/home?signin=1" className="btn-arcade btn-ghost-px inline-flex flex-1 items-center justify-center">
                Sign in for multiplayer
              </Link>
            </div>
          </>
        )}

        {/* Clue list */}
        {phase !== 'reveal' && (
          <section className="px-panel p-2">
            <ul className="flex flex-col">
              {order.map((id) => {
                const c = clues[id]
                const n = (sus[id] ?? []).length
                const open = (phase === 'clues' || phase === 'discuss') && id !== ME && !!c
                return (
                  <li key={id} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${phase === 'clues' && id === current ? 'bg-hero/10 ring-1 ring-hero/60' : ''}`}>
                    <PixelAvatar seed={id === ME ? 'guest-player' : `bot:${id}`} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-muted-foreground">{name(id)}</div>
                      <div className="text-lg font-bold leading-tight text-foreground">
                        {c ? (c === '…' ? <span className="font-normal text-muted-foreground">(passed)</span> : c) : <span className="font-normal text-muted-foreground/60">waiting</span>}
                      </div>
                    </div>
                    {n > 0 && <span className="text-[11px] font-bold text-[#ff8fb0]">{n} sus</span>}
                    {open && (
                      <button
                        type="button"
                        onClick={() => toggleSus(id)}
                        aria-pressed={(sus[id] ?? []).includes(ME)}
                        className={`sus-pop rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] ${
                          (sus[id] ?? []).includes(ME) ? 'border-villain bg-villain text-white' : 'border-white/20 text-muted-foreground hover:border-villain hover:text-villain'
                        }`}
                      >
                        Sus
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
