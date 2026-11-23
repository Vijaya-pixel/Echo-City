/**
 * /home — HQ. Sign in, then create a room (mode, difficulty; AI players are added in the lobby) or
 * join one with a 4-letter code. Lives under (app)/ but NOT (protected)/ so
 * signed-out visitors still see the page and the nav's sign-in button.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuth } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import { DIFFICULTIES, type Difficulty } from '@/game/data'
import { callAction } from '@/lib/game-client'
import { SceneBackdrop } from '@/components/game/PixelScene'

export default function HomePage() {
  const { isLoaded, isSignedIn } = useAuth()
  // Arriving from the homepage's Play now (?signin=1) opens the sign-in popup
  // straight away for signed-out visitors.
  const [showAuth, setShowAuth] = useState(() => new URLSearchParams(window.location.search).has('signin'))

  return (
    <div className="relative min-h-full overflow-x-hidden">
      <SceneBackdrop scene="echo-dusk" dim="light" />
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 sm:py-6">
        <header className="flex items-center gap-4">
          <div className="min-w-0">
            <h1 className="mt-0.5 text-xl text-hero sm:text-2xl">HERO HQ</h1>
            <p className="text-muted-foreground">Every night, one hero is secretly the Glitch. Trust no hero.</p>
          </div>
        </header>

        {!isLoaded ? null : !isSignedIn ? (
          <section className="px-panel px-panel-hero max-w-md p-6">
            <h2 className="text-sm text-foreground">SIGN IN TO PLAY</h2>
            <p className="mt-3 text-muted-foreground">
              Sign in with Google or GitHub to create or join a room. It takes a few seconds, and it keeps your stats.
            </p>
            <Button className="mt-6 w-full" onClick={() => setShowAuth(true)}>
              Sign in
            </Button>
            {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
          </section>
        ) : (
          <div className="grid items-start gap-5 md:grid-cols-[3fr_2fr]">
            <CreateRoom />
            <JoinRoom />
          </div>
        )}
      </div>
    </div>
  )
}

function CreateRoom() {
  const navigate = useNavigate()
  const { error } = useToast()
  const [difficulty, setDifficulty] = useState<Difficulty>('rookie')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    const r = await callAction<{ code: string }>('createRoom', { difficulty })
    setBusy(false)
    if (!r.success) return error(r.error)
    navigate(`/room/${r.data.code}`)
  }

  return (
    <section className="px-panel px-panel-hero flex flex-col gap-4 p-5">
      <h2 className="text-xs text-hero">CREATE A ROOM</h2>

      <p className="text-muted-foreground">
        Everyone gets a secret word, except the Glitch, who knows they're the Glitch but has no word. Give one-word clues, then vote them out.
      </p>

      <fieldset>
        <legend className="eyebrow mb-2">Difficulty</legend>
        <DifficultySlider value={difficulty} onChange={setDifficulty} />
        <p className="mt-1.5 text-sm text-muted-foreground">{DIFFICULTIES[difficulty].blurb}</p>
      </fieldset>

      <Button size="lg" onClick={create} loading={busy} disabled={busy}>
        Create room
      </Button>
    </section>
  )
}

function JoinRoom() {
  const navigate = useNavigate()
  const { error } = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const r = await callAction<{ code: string }>('joinRoom', { code })
    setBusy(false)
    if (!r.success) return error(r.error)
    navigate(`/room/${r.data.code}`)
  }

  return (
    <section className="px-panel flex flex-col gap-4 self-start p-5">
      <h2 className="text-xs text-foreground">JOIN A ROOM</h2>
      <form onSubmit={join} className="flex flex-col gap-4">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
          placeholder="ABCD"
          aria-label="Room code"
          className="text-center font-display text-xl tracking-[0.3em]"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" disabled={code.length !== 4 || busy} loading={busy}>
          Join room
        </Button>
      </form>
      <p className="border-t border-white/10 pt-3 text-sm text-muted-foreground">
        Short on players? Add up to 5 AI players in the lobby.
      </p>
    </section>
  )
}

const LEVELS = Object.keys(DIFFICULTIES) as Difficulty[]
const LEVEL_COLORS = ['#3ee6c8', '#5b86ff', '#ff4d7d'] // rookie, hero, legend

/** Drag-to-set difficulty: a range slider with three labelled stops. */
function DifficultySlider({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  const i = LEVELS.indexOf(value)
  const pct = (i / (LEVELS.length - 1)) * 100
  const color = LEVEL_COLORS[i]
  return (
    <div className="px-1 pt-1">
      <input
        type="range"
        min={0}
        max={LEVELS.length - 1}
        step={1}
        value={i}
        onChange={(e) => onChange(LEVELS[Number(e.target.value)])}
        aria-label="Difficulty"
        aria-valuetext={DIFFICULTIES[value].label}
        className="difficulty-slider w-full"
        style={{
          ['--fill' as string]: `${pct}%`,
          ['--accent' as string]: color,
        }}
      />
      <div className="mt-2 flex justify-between">
        {LEVELS.map((d, k) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={`font-display text-[11px] font-extrabold uppercase tracking-[0.1em] transition-colors ${k === i ? '' : 'text-muted-foreground hover:text-foreground'}`}
            style={k === i ? { color } : undefined}
          >
            {DIFFICULTIES[d].label}
          </button>
        ))}
      </div>
    </div>
  )
}
