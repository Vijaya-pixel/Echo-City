/**
 * Design Direction
 *
 * Product: A pixel-art party game for 3-8 friends on their phones: one of the
 *   city's heroes is secretly the Glitch, and one-word clues give them away.
 * Emotion: The delicious paranoia of glancing sideways at a friend mid-sentence.
 * Metaphor: A late-night 80s TV mystery episode broadcast over a neon city.
 * References: Arcade attract screens; late-night CRT broadcast bumpers;
 *   16-bit city-at-night backdrops.
 * Signature: A red neon "ECHO CITY" sign that flickers irregularly.
 * Hero: Echo City at night under a big pixel headline.
 *
 * Style Tile
 * - Color: night-city navy dominant; neon red sign; hero gold + magenta accents.
 * - Type: Orbitron (wide techno) for headlines and labels; Oxanium (squared techno) for reading.
 * - Theme: dark, because it's always night in Echo City.
 * - Art direction: layered 16-bit pixel scenes (PixelScene) under a modern glass UI.
 * - Motion: sprite-like, steps() timing, irregular neon flicker.
 * - Voice: terse; conspiratorial; second person.
 *
 * STATIC page: lives at the top level of src/pages/, so no providers, no
 * auth fetch and no WebSocket. It is prerendered to HTML at build.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'
import { PixelScene } from '../components/game/PixelScene'
import { Logo, TechnoText } from '../components/Logo'

const FACTS = [
  { label: 'Players', value: '3 – 8' },
  { label: 'Difficulty', value: '3 levels' },
  { label: 'A round', value: '~5 min' },
  { label: 'AI players', value: 'Up to 5' },
]

const STEPS = [
  { n: '01', title: 'Get a secret word', text: 'Everyone gets the same word, except the Glitch, who gets none.' },
  { n: '02', title: 'Give one-word clues', text: 'Hint at your word without saying it. Too obvious and the Glitch can guess it.' },
  { n: '03', title: 'Argue, then vote', text: 'Sixty seconds to accuse. Then the city decides.' },
  { n: '04', title: 'Unmask', text: 'Catch the Glitch with a majority. If caught, they get one guess to steal the win.' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="relative flex min-h-screen flex-col bg-background">
        {/* Top bar */}
        <header className="relative z-20 border-b border-white/10 bg-[#070915]">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Logo height={20} />
            <nav className="flex items-center" aria-label="Main">
              <Link to="/home" className="flex h-16 items-center px-4 opacity-70 transition-opacity hover:opacity-100">
                <TechnoText text="HQ" height={13} colors={['#e6e9ff']} />
              </Link>
              <Link to="/stats" className="flex h-16 items-center px-4 opacity-70 transition-opacity hover:opacity-100">
                <TechnoText text="STATS" height={13} colors={['#e6e9ff']} />
              </Link>
            </nav>
          </div>
        </header>

        {/* Hero: the city at dusk */}
        <section className="relative isolate z-10">
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <PixelScene scene="echo-dusk" />
          </div>
          {/* Soft fade so the headline always reads */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#12061f]/70 via-[#12061f]/20 to-transparent" aria-hidden />

          <div className="mx-auto flex min-h-[78vh] max-w-7xl flex-col justify-between px-6 pb-8 pt-14 sm:px-10 sm:pt-20">
            <div>
              <p className="font-display text-[10px] tracking-[0.25em] text-[#ffd6e4]">TONIGHT ON CHANNEL 8</p>
              <h1 className="headline-px mt-5 text-3xl sm:text-5xl md:text-6xl">
                ONE OF YOU
                <br />
                IS THE
                <br />
                <span className="text-hero">GLITCH.</span>
              </h1>
              <p className="mt-6 max-w-md text-lg font-medium text-white/85">
                A pixel party game of secret words and sideways glances. Trust no hero.
              </p>
            </div>

          </div>

          {/* Facts bar */}
          <div className="relative z-10 mx-auto -mb-10 max-w-5xl px-4">
            <div className="px-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6">
              <dl className="grid flex-1 grid-cols-2 gap-4 sm:flex sm:gap-10">
                {FACTS.map((f) => (
                  <div key={f.label}>
                    <dt className="eyebrow">{f.label}</dt>
                    <dd className="mt-0.5 text-[17px] font-semibold text-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {/* Signed-out visitors get the sign-in popup on arrival (see home.tsx). */}
              <Link to="/home?signin=1" className="btn-arcade btn-lg inline-flex items-center justify-center !min-h-13 !pl-8 !pr-12 !text-sm">
                Play now
              </Link>
            </div>
          </div>
        </section>

        {/* How a night goes */}
        <section className="relative mx-auto w-full max-w-5xl px-6 pb-20 pt-24">
          <p className="eyebrow">How a night goes</p>
          <h2 className="mt-3 text-lg text-foreground sm:text-xl">FOUR STEPS. ONE TRAITOR.</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.n} className="px-panel flex gap-5 p-5">
                <span className="font-display text-2xl text-magenta">{s.n}</span>
                <div>
                  <h3 className="font-sans text-lg font-bold tracking-normal text-foreground">{s.title}</h3>
                  <p className="mt-1 text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-muted-foreground">
            Every round takes place in Echo City. Short on friends? Add AI players with their own personalities.
          </p>
        </section>

        <footer className="border-t border-white/10 px-6 py-6 text-center text-sm text-muted-foreground">
          Echo City · an original pixel mystery · all heroes are fictional
        </footer>
      </div>
    </>
  )
}
