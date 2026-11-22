/**
 * Original 12x12 pixel-art hero, generated from a seed (the player's user id).
 * The seed picks skin, hair style + color, mask, suit, cape and chest emblem,
 * so every player gets a stable, unique hero. `evil` swaps to the villain
 * palette for the reveal. AI players get a robot sprite, colored by their own id.
 */

import { isBotId } from '@/game/data'

// Sprite template. Letters are palette slots, '.' is transparent.
//  H hair · S skin · M mask · E eyes · B suit · X emblem · C cape · D boots
const HERO = [
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HSSSSSSH..',
  '..MMEMMEMM..',
  '...SSSSSS...',
  '....SSSS....',
  '.CBBBBBBBBC.',
  'CCBB....BBCC',
  'CCBB....BBCC',
  'CC.BBBBBB.CC',
  'C..BB..BB..C',
  '...DD..DD...',
]
const SPIKY_HAIR = ['..H.HH.HH.H.', '..HHHHHHHH..']
const ROBOT = [
  '.....XX.....',
  '.....BB.....',
  '..BBBBBBBB..',
  '..BMMMMMMB..',
  '..BMEMMEMB..',
  '..BBBBBBBB..',
  '.CCBBXXBBCC.',
  '.C.BBBBBB.C.',
  '.C.BXBBXB.C.',
  '...BBBBBB...',
  '...BB..BB...',
  '...DD..DD...',
]
// Emblem shapes drawn into rows 7-8, cols 4-7.
const EMBLEMS = [
  ['.XX.', 'XXXX'], // diamond
  ['XX..', '.XXX'], // bolt
  ['X..X', '.XX.'], // chevron
  ['.XX.', '.XX.'], // bar
]

const SKIN = ['#f5c9a0', '#d9a066', '#a86b3c', '#6b4226', '#ffd9b8']
const HAIR = ['#2b1d0e', '#f2d16b', '#c0392b', '#eef1ff', '#3ee6ff', '#8a4b2a', '#ff3ea5']
const MASK = ['#05060f', '#1f2a5a', '#ff4560', '#2f5bd8']
const SUIT = ['#ffcc33', '#3e7bff', '#8cff5a', '#ff3ea5', '#3ee6ff', '#ff8a3d', '#eef1ff']
const CAPE = ['#ff4560', '#1f2a5a', '#ffcc33', '#2f5bd8', '#2fae4e', '#ff3ea5']
const EVIL = { B: '#3a0a14', C: '#ff4560', M: '#05060f', E: '#ff2a3d', X: '#ff2a3d', D: '#05060f', H: '#05060f' }

/** FNV-1a string hash -> unsigned 32-bit int. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
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

  let rows = (isBot ? ROBOT : HERO).map((r) => r.split(''))
  if (!isBot) {
    if (n(7, 2) === 1) rows = [SPIKY_HAIR[0].split(''), SPIKY_HAIR[1].split(''), ...rows.slice(2)]
    const emblem = EMBLEMS[n(13, EMBLEMS.length)]
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) if (emblem[r][c] === 'X') rows[7 + r][4 + c] = 'X'
  }

  const colors: Record<string, string> = isBot
    ? { B: SUIT[n(23, SUIT.length)], M: '#05060f', E: ['#3ee6ff', '#8cff5a', '#ffcc33', '#ff3ea5'][n(5, 4)], X: '#ff4560', C: CAPE[n(29, CAPE.length)], D: '#36428a' }
    : {
        H: HAIR[n(1, HAIR.length)],
        S: SKIN[n(11, SKIN.length)],
        M: MASK[n(17, MASK.length)],
        E: '#ffffff',
        B: SUIT[n(23, SUIT.length)],
        X: '#ffffff',
        C: CAPE[n(29, CAPE.length)],
        D: '#05060f',
      }
  if (!isBot) {
    // Emblem contrasts with the suit; avoid same-color cape and suit.
    colors.X = colors.B === '#eef1ff' ? '#ff4560' : '#05060f'
    if (colors.C === colors.B) colors.C = '#1f2a5a'
  }
  if (evil) Object.assign(colors, EVIL)

  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`pixel ${className ?? ''}`}
      role="img"
      aria-label={title ?? 'Hero avatar'}
    >
      {rows.flatMap((row, y) =>
        row.map((ch, x) =>
          ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[ch]} />,
        ),
      )}
    </svg>
  )
}
