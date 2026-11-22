/**
 * Design Direction
 *
 * Product: A pixel-art party game for 3-8 friends on their phones: one of the
 *   city's heroes is secretly a villain, and one-word clues give them away.
 * Emotion: The delicious paranoia of glancing sideways at a friend mid-sentence.
 * Metaphor: A late-night 80s TV mystery episode broadcast over a neon city.
 * References: Arcade attract screens; late-night CRT broadcast bumpers;
 *   16-bit city-at-night backdrops.
 * Signature: A red neon "ECHO CITY" sign that flickers irregularly.
 * Hero: The skyline scrolls by while a lineup of pixel heroes stands guard,
 *   and one of them keeps flickering into a villain.
 *
 * Style Tile
 * - Color: night-city navy dominant; neon red sign; hero gold + magenta accents.
 * - Type: Press Start 2P for display (it IS the arcade); VT323 for body (readable pixel).
 * - Theme: dark, because it's always night in Echo City.
 * - Art direction: crisp 16-bit pixel art, hard shadows, no blur.
 * - Motion: sprite-like, steps() timing, irregular neon flicker.
 * - Voice: terse; conspiratorial; second person.
 *
 * STATIC page: lives at the top level of src/pages/, so no providers, no
 * auth fetch and no WebSocket. It is prerendered to HTML at build.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'
import { Skyline } from '../components/game/Skyline'
import { PixelAvatar } from '../components/game/PixelAvatar'

const LINEUP = ['nova-1', 'volt-7', 'echo-3', 'raven-9', 'blaze-4']

const STEPS = [
  { n: '01', title: 'DRAW FROM THE HAT', text: 'A random hero pulls tonight’s location.' },
  { n: '02', title: 'ONE-WORD CLUES', text: 'Everyone hints at their secret word. One word is different.' },
  { n: '03', title: 'ARGUE. VOTE.', text: 'Sixty seconds to accuse. Then the city decides.' },
  { n: '04', title: 'UNMASK', text: 'Catch the villain, or watch Echo City fall.' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="crt relative flex min-h-screen flex-col overflow-hidden bg-background">
        {/* Hero */}
        <section className="relative flex min-h-[92vh] flex-col items-center justify-center px-6 pb-56 pt-16 text-center">
          <Skyline className="h-64" />
          <div className="relative z-10 flex flex-col items-center">
            <p className="font-display text-[10px] tracking-[0.3em] text-magenta">TONIGHT ON CHANNEL 8</p>
            <div className="neon-title mt-6 text-4xl leading-tight sm:text-6xl md:text-7xl" aria-hidden>
              ECHO CITY
            </div>
            <h1 className="mt-8 max-w-xl text-sm leading-relaxed text-foreground sm:text-base">One of you is the villain.</h1>
            <p className="mt-4 text-2xl text-muted-foreground">Trust no hero.</p>

            <div className="mt-10 flex items-end gap-3 sm:gap-5" aria-label="A lineup of heroes, one of them a villain in disguise">
              {LINEUP.map((seed, i) =>
                i === 2 ? (
                  <span key={seed} className="turncoat relative block">
                    <PixelAvatar seed={seed} size={64} className="turncoat-hero" title="A hero" />
                    <PixelAvatar seed={seed} size={64} evil className="turncoat-villain absolute inset-0" title="Or is it?" />
                  </span>
                ) : (
                  <PixelAvatar key={seed} seed={seed} size={i % 2 ? 56 : 64} title="A hero" />
                ),
              )}
            </div>

            <Link to="/home" className="btn-arcade press-start mt-12 inline-flex items-center !text-sm">
              Press start
            </Link>
          </div>
        </section>

        {/* How a night goes — a typographic list, not cards */}
        <section className="relative z-10 mx-auto w-full max-w-3xl px-6 py-16">
          <h2 className="text-xs text-hero">HOW A NIGHT GOES</h2>
          <ol className="mt-8 space-y-6">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 border-b-4 border-border pb-5">
                <span className="font-display text-xl text-magenta">{s.n}</span>
                <div>
                  <h3 className="text-[11px] text-foreground">{s.title}</h3>
                  <p className="mt-2 text-xl text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-xl text-muted-foreground">
            3 to 8 players. Three modes. AI players with their own personalities if you are short.
          </p>
          <Link to="/home" className="btn-arcade mt-8 inline-flex items-center">
            Open a room
          </Link>
        </section>

        <footer className="relative z-10 border-t-4 border-border px-6 py-6 text-center text-muted-foreground">
          Echo City · an original pixel mystery · all heroes are fictional
        </footer>
      </div>
    </>
  )
}
