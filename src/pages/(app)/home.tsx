/**
 * /home — HQ. Sign in, then create a room (mode, difficulty; AI players are added in the lobby) or
 * join one with a 4-letter code. Lives under (app)/ but NOT (protected)/ so
 * signed-out visitors still see the page and the nav's sign-in button.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuth } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import { DIFFICULTIES, MODES, type Difficulty, type Mode } from '@/game/data'
import { callAction } from '@/lib/game-client'
import { Skyline } from '@/components/game/Skyline'
import { PixelAvatar } from '@/components/game/PixelAvatar'

export default function HomePage() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  return (
    <div className="relative min-h-full overflow-x-hidden">
      <Skyline className="fixed h-48 opacity-60" />
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
        <header className="flex items-center gap-4">
          {userId && <PixelAvatar seed={userId} size={64} title="Your hero" />}
          <div>
            <h1 className="text-base text-hero sm:text-xl">HERO HQ</h1>
            <p className="text-muted-foreground">Every night, one hero is secretly a villain. Trust no hero.</p>
          </div>
        </header>

        {!isLoaded ? null : !isSignedIn ? (
          <section className="px-panel max-w-md p-6">
            <h2 className="text-xs text-foreground">SIGN IN TO SUIT UP</h2>
            <p className="mt-3 text-muted-foreground">You need an account to create or join a room and to keep your stats.</p>
            <Button className="mt-6 w-full" onClick={() => setShowAuth(true)}>
              Sign in
            </Button>
            {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
          </section>
        ) : (
          <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
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
  const [mode, setMode] = useState<Mode>('classic')
  const [difficulty, setDifficulty] = useState<Difficulty>('rookie')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    const r = await callAction<{ code: string }>('createRoom', { mode, difficulty })
    setBusy(false)
    if (!r.success) return error(r.error)
    navigate(`/room/${r.data.code}`)
  }

  return (
    <section className="px-panel px-panel-hero flex flex-col gap-5 p-5">
      <h2 className="text-xs text-hero">CREATE A ROOM</h2>

      <fieldset>
        <legend className="mb-2 font-display text-[10px] text-muted-foreground">MODE</legend>
        <div className="grid gap-2">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <OptionTile key={m} selected={mode === m} onClick={() => setMode(m)} title={MODES[m].label} blurb={MODES[m].blurb} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-[10px] text-muted-foreground">DIFFICULTY</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
            <OptionTile key={d} selected={difficulty === d} onClick={() => setDifficulty(d)} title={DIFFICULTIES[d].label} />
          ))}
        </div>
        <p className="mt-2 text-muted-foreground">{DIFFICULTIES[difficulty].blurb}</p>
      </fieldset>

      <p className="text-muted-foreground">Short on players? Add up to 5 AI players in the lobby.</p>

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
    </section>
  )
}

function OptionTile({ selected, onClick, title, blurb }: { selected: boolean; onClick: () => void; title: string; blurb?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-11 border-4 px-3 py-2 text-left ${selected ? 'border-hero bg-panel2' : 'border-border bg-background hover:border-muted-foreground'}`}
    >
      <div className={`font-display text-[10px] leading-relaxed ${selected ? 'text-hero' : 'text-foreground'}`}>{title}</div>
      {blurb && <div className="leading-tight text-muted-foreground">{blurb}</div>}
    </button>
  )
}
