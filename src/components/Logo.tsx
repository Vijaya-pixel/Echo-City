/**
 * "ECHO CITY" wordmark in a squared techno style: thick strokes with 45°
 * chamfered corners and a thin inline groove running through each stroke.
 *
 * Each glyph is a set of centre-line polylines on a 12x10 grid. They're drawn
 * twice: a thick stroke with bevel joins (which gives the chamfers), then a
 * thin stroke in the background colour (the groove), trimmed at open ends so
 * the groove stays inside the letter.
 */

type Pt = [number, number]
interface Line {
  pts: Pt[]
  closed?: boolean
}

const T = 3 // stroke thickness
const GROOVE = 0.55
const TRIM = 1.3 // keep the groove this far from open stroke ends

const GLYPHS: Record<string, { w: number; lines: Line[] }> = {
  E: {
    w: 12,
    lines: [
      { pts: [[12, 1.5], [1.5, 1.5], [1.5, 8.5], [12, 8.5]] },
      { pts: [[1.5, 5], [9.5, 5]] },
    ],
  },
  C: { w: 12, lines: [{ pts: [[12, 1.5], [1.5, 1.5], [1.5, 8.5], [12, 8.5]] }] },
  H: {
    w: 12,
    lines: [
      { pts: [[1.5, 0], [1.5, 10]] },
      { pts: [[10.5, 0], [10.5, 10]] },
      { pts: [[1.5, 5], [10.5, 5]] },
    ],
  },
  O: { w: 12, lines: [{ pts: [[1.5, 1.5], [10.5, 1.5], [10.5, 8.5], [1.5, 8.5]], closed: true }] },
  I: {
    w: 8,
    lines: [
      { pts: [[0, 1.5], [8, 1.5]] },
      { pts: [[4, 1.5], [4, 8.5]] },
      { pts: [[0, 8.5], [8, 8.5]] },
    ],
  },
  T: {
    w: 12,
    lines: [
      { pts: [[0, 1.5], [12, 1.5]] },
      { pts: [[6, 1.5], [6, 10]] },
    ],
  },
  A: {
    w: 12,
    lines: [
      { pts: [[1.5, 10], [1.5, 1.5], [10.5, 1.5], [10.5, 10]] },
      { pts: [[1.5, 5.5], [10.5, 5.5]] },
    ],
  },
  // Box plus a diagonal tail through the lower-right corner: reads as Q, not O.
  Q: {
    w: 13,
    lines: [
      { pts: [[1.5, 1.5], [10.5, 1.5], [10.5, 6], [6, 8.5], [1.5, 8.5]], closed: true },
      { pts: [[6.5, 5.5], [12.5, 10]] },
    ],
  },
  S: { w: 12, lines: [{ pts: [[12, 1.5], [1.5, 1.5], [1.5, 5], [10.5, 5], [10.5, 8.5], [0, 8.5]] }] },
  Y: {
    w: 12,
    lines: [
      { pts: [[1.5, 0], [1.5, 5], [10.5, 5]] },
      { pts: [[10.5, 0], [10.5, 8.5], [0, 8.5]] },
    ],
  },
}

/** Pull an open polyline's two ends inward by `d` (for the groove). */
function trim(pts: Pt[], d: number): Pt[] {
  const out = pts.map((p) => [...p] as Pt)
  const pull = (a: Pt, b: Pt) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    a[0] += ((b[0] - a[0]) / len) * d
    a[1] += ((b[1] - a[1]) / len) * d
  }
  pull(out[0], out[1])
  pull(out[out.length - 1], out[out.length - 2])
  return out
}

const toD = (pts: Pt[], closed?: boolean) => `M${pts.map((p) => p.join(' ')).join('L')}${closed ? 'Z' : ''}`

const SPACING = 2.5
const WORD_GAP = 6

function layout(text: string) {
  let x = 0
  const placed: Array<{ ch: string; x: number; word: number }> = []
  let word = 0
  for (const ch of text.toUpperCase()) {
    if (ch === ' ') {
      x += WORD_GAP - SPACING
      word++
      continue
    }
    if (!GLYPHS[ch]) continue // only letters we have glyphs for
    placed.push({ ch, x, word })
    x += GLYPHS[ch].w + SPACING
  }
  return { placed, width: Math.max(0, x - SPACING) }
}

/**
 * Any short label in the logo's techno lettering. `colors` is per word (the
 * last colour repeats). `groove` should match the background behind it.
 */
export function TechnoText({
  text,
  height = 14,
  colors = ['#ffffff'],
  groove = '#070915',
  className,
  label,
}: {
  text: string
  height?: number
  colors?: string[]
  groove?: string
  className?: string
  label?: string
}) {
  const { placed, width } = layout(text)
  const pad = 0.5
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${10 + pad * 2}`}
      height={height}
      width={(height * (width + pad * 2)) / (10 + pad * 2)}
      role="img"
      aria-label={label ?? text}
      className={className}
    >
      {placed.map(({ ch, x, word }, i) => {
        const color = colors[Math.min(word, colors.length - 1)]
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            {GLYPHS[ch].lines.map((l, k) => (
              <path key={`s${k}`} d={toD(l.pts, l.closed)} fill="none" stroke={color} strokeWidth={T} strokeLinejoin="bevel" strokeLinecap="butt" />
            ))}
            {GLYPHS[ch].lines.map((l, k) => (
              <path
                key={`g${k}`}
                d={toD(l.closed ? l.pts : trim(l.pts, TRIM), l.closed)}
                fill="none"
                stroke={groove}
                strokeWidth={GROOVE}
                strokeLinejoin="bevel"
                strokeLinecap="butt"
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

/** The "ECHO CITY" wordmark. */
export function Logo({
  height = 20,
  colors = ['#ffffff', '#2f4dff'],
  groove = '#070915',
  className,
}: {
  height?: number
  /** Fill per word. */
  colors?: [string, string]
  /** Groove colour: match whatever the logo sits on. */
  groove?: string
  className?: string
}) {
  return <TechnoText text="ECHO CITY" height={height} colors={colors} groove={groove} className={className} label="Echo City" />
}
