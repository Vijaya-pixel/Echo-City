/**
 * Original 24x24 pixel-art hero, generated from a seed (the player's user id).
 *
 * Quality passes on top of the template:
 *  - templates are drawn as LEFT halves and mirrored, so sprites are symmetric
 *  - automatic 3-tone shading (light from the upper left): edge pixels facing
 *    the light get a highlight, pixels facing away get a shadow, and the right
 *    half of the body sits slightly darker for volume
 *  - a 1px dark outline around the whole silhouette
 *
 * The seed picks skin, hair style + colour, mask, suit, cape, emblem and belt,
 * so every player gets a stable, unique hero. `evil` swaps to the villain
 * palette for the reveal. AI players get a robot built the same way.
 */

import { isBotId } from '@/game/data'

// Palette slots: H hair · S skin · M mask · E eye white · P pupil · m mouth
// B suit · b suit trim · X emblem · C cape · G gloves/boots · Y belt · V visor
const HERO_LEFT = [
  '........HHHH',
  '......HHHHHH',
  '.....HHHHHHH',
  '....HHHSSSSS',
  '....HSSSSSSS',
  '....MMMMMMMM',
  '....MMEEPMMM',
  '....SMMMMSSS',
  '.....SSSSSSm',
  '......SSSSSS',
  '........SSSS',
  '...CCBBBBBBB',
  '..CCBBBBBBBB',
  '..CBBbBBBBBB',
  '.CCBBbBBBBBB',
  '.CCBBbBBBBBB',
  '.CCGGbBBBBBB',
  '.CCGGYYYYYYY',
  '.CC..bBBBBBB',
  '.CC...BBBB..',
  'CCC...BBBB..',
  'CC....BbBB..',
  'C.....GGGG..',
  '.....GGGGG..',
]

const ROBOT_LEFT = [
  '...........X',
  '...........b',
  '......BBBBBB',
  '.....BBBBBBB',
  '.....BVVVVVV',
  '.....BVVEVVV',
  '.....BVVVVVV',
  '.....BBBBBBB',
  '......BbBbBb',
  '.......BBBBB',
  '........bbbb',
  '...CCBBBBBBB',
  '..CCBBBBBBBB',
  '..CBBbBBBBBB',
  '.CCBBbBBBBBB',
  '.CCBBbBBBBBB',
  '.CCGGbBBBBBB',
  '.CCGGYYYYYYY',
  '.CC..bBBBBBB',
  '.CC...BBBB..',
  'CCC...BBBB..',
  'CC....BbBB..',
  'C.....GGGG..',
  '.....GGGGG..',
]

/** Hair variants override the top rows (left halves). */
const HAIR_STYLES: Array<Record<number, string>> = [
  {}, // classic
  { 0: '.......H.H.H', 1: '......HHHHHH', 2: '....HHHHHHHH', 3: '...HHHHSSSSS' }, // spiky
  { 3: '...HHHHSSSSS', 4: '...HHSSSSSSS', 6: '...HMMEEPMMM', 7: '...HSMMMMSSS', 8: '...HHSSSSSSm', 9: '....H.SSSSSS' }, // long
]

/** Emblem shapes, written into the chest centre (rows 13-15, cols 10-13). */
const EMBLEMS = [
  ['.XX.', 'XXXX', '.XX.'], // diamond
  ['..XX', '.XX.', 'XX..'], // bolt
  ['X..X', 'XXXX', '.XX.'], // shield
  ['.XX.', 'X..X', '.XX.'], // ring
]

const SKIN = ['#f3c6a0', '#dca172', '#b0753f', '#7a4a2a', '#ffdcbf']
const HAIR = ['#2b1d12', '#f0cf6a', '#c0392b', '#e9edff', '#3ee6ff', '#8a4b2a', '#ff5fb0', '#5b86ff']
const MASK = ['#141a3a', '#1f2a5a', '#c6223f', '#2f4dff', '#3b1450']
const SUIT = ['#3d68ff', '#ff4d7d', '#2fd59a', '#b45cff', '#3ee6ff', '#ff8a3d', '#e9edff', '#f0cf6a']
const CAPE = ['#c6223f', '#1f2a5a', '#3b1450', '#2f4dff', '#1f7a4e', '#ff5fb0', '#f0a030']
const BELT = ['#f0cf6a', '#c9d2e8', '#ff8a3d']
const VISOR = ['#3ee6ff', '#2fd59a', '#ff5fb0', '#f0cf6a']

const OUTLINE = '#0a0716'
// Slots that never get shaded (tiny details).
const FLAT = new Set(['E', 'P', 'm', 'X', 'V'])

/** FNV-1a string hash -> unsigned 32-bit int. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mix(hex: string, to: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = p(hex)
  const b = p(to)
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

function buildGrid(left: string[], overrides: Record<number, string>) {
  return left.map((row, y) => {
    const l = (overrides[y] ?? row).split('')
    return [...l, ...[...l].reverse()]
  })
}

export function PixelAvatar({
  seed,
  size = 48,
  evil = false,
  className,
  title,
}: {
  seed: string
  size?: number
  evil?: boolean
  className?: string
  title?: string
}) {
  const h = hash(seed)
  const n = (k: number, len: number) => Math.floor(h / k) % len
  const isBot = isBotId(seed)

  const grid = isBot ? buildGrid(ROBOT_LEFT, {}) : buildGrid(HERO_LEFT, HAIR_STYLES[n(7, HAIR_STYLES.length)])
  const emblem = EMBLEMS[n(13, EMBLEMS.length)]
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (emblem[r][c] === 'X') grid[13 + r][10 + c] = 'X'

  const suit = SUIT[n(23, SUIT.length)]
  let cape = CAPE[n(29, CAPE.length)]
  if (cape === suit) cape = '#1f2a5a'
  const colors: Record<string, string> = {
    H: HAIR[n(1, HAIR.length)],
    S: SKIN[n(11, SKIN.length)],
    M: MASK[n(17, MASK.length)],
    E: '#ffffff',
    P: '#141a3a',
    m: '#8a3a3a',
    B: suit,
    b: mix(suit, '#000000', 0.28),
    X: suit === '#e9edff' ? '#c6223f' : '#ffffff',
    C: cape,
    G: mix(cape, '#000000', 0.35),
    Y: BELT[n(31, BELT.length)],
    V: '#0b1230',
  }
  if (isBot) {
    colors.E = VISOR[n(5, VISOR.length)]
    colors.X = colors.E
  }
  if (evil) {
    Object.assign(colors, {
      H: '#120812',
      M: '#05060f',
      E: '#ff2a3d',
      P: '#ffd0d6',
      B: '#3a0a18',
      b: '#22040c',
      X: '#ff2a3d',
      C: '#8a0f22',
      G: '#14040a',
      Y: '#5a1020',
      m: '#ff2a3d',
    })
  }

  // ── Shading + outline ────────────────────────────────────────────────────
  const Hh = grid.length
  const Ww = grid[0].length
  const at = (x: number, y: number) => (y < 0 || y >= Hh || x < 0 || x >= Ww ? '.' : grid[y][x])
  const byColor = new Map<string, string>()
  const put = (c: string, x: number, y: number) => byColor.set(c, (byColor.get(c) ?? '') + `M${x + 1} ${y + 1}h1v1h-1Z`)

  for (let y = 0; y < Hh; y++)
    for (let x = 0; x < Ww; x++) {
      const k = grid[y][x]
      if (k === '.') {
        // Outline any empty pixel touching the silhouette.
        if ([at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((v) => v !== '.')) put(OUTLINE, x, y)
        continue
      }
      const base = colors[k]
      if (FLAT.has(k)) {
        put(base, x, y)
        continue
      }
      const lit = at(x, y - 1) !== k || at(x - 1, y) === '.'
      const shade = at(x, y + 1) !== k || at(x + 1, y) === '.'
      let c = base
      if (lit && !shade) c = mix(base, '#ffffff', 0.28)
      else if (shade && !lit) c = mix(base, '#000000', 0.3)
      else if (x >= Ww / 2 && (k === 'B' || k === 'C' || k === 'H')) c = mix(base, '#000000', 0.12) // turned from the light
      put(c, x, y)
    }
  // Outline row/col beyond the grid edges (top of hair, feet).
  for (let x = 0; x < Ww; x++) {
    if (at(x, 0) !== '.') put(OUTLINE, x, -1)
    if (at(x, Hh - 1) !== '.') put(OUTLINE, x, Hh)
  }
  // Sparkle on the eyes / visor for life.
  const glints: string[] = []
  for (let y = 0; y < Hh; y++) for (let x = 0; x < Ww; x++) if (grid[y][x] === 'E' && at(x - 1, y) !== 'E') glints.push(`M${x + 1} ${y + 1}h1v1h-1Z`)

  return (
    <svg
      viewBox={`0 0 ${Ww + 2} ${Hh + 2}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`pixel ${className ?? ''}`}
      role="img"
      aria-label={title ?? 'Hero avatar'}
    >
      {[...byColor.entries()].map(([c, d]) => (
        <path key={c} d={d} fill={c} />
      ))}
      {!isBot && <path d={glints.join('')} fill="#ffffff" />}
    </svg>
  )
}
