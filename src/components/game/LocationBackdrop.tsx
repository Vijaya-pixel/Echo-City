/**
 * Layered pixel-silhouette backdrop for tonight's location.
 * Drawn on a 160x90 grid with plain rects (crisp, no images, no copyrighted
 * assets): two hard-banded sky colors, a far layer, a near layer and accent
 * details, all from the location's 5-color palette.
 */

import { getLocation } from '@/game/data'

type R = [x: number, y: number, w: number, h: number]

/** Stepped pyramid / mountain: a stack of shrinking rects. */
function steps(x: number, base: number, w: number, h: number, step = 4): R[] {
  const out: R[] = []
  const levels = Math.max(1, Math.floor(h / step))
  for (let i = 0; i < levels; i++) {
    const inset = Math.round((w / 2) * (i / levels))
    out.push([x + inset, base - (i + 1) * step, w - inset * 2, step])
  }
  return out
}

/** Pixel circle as horizontal runs. */
function circle(cx: number, cy: number, r: number): R[] {
  const out: R[] = []
  for (let y = -r; y < r; y++) {
    const half = Math.round(Math.sqrt(r * r - (y + 0.5) ** 2))
    out.push([cx - half, cy + y, half * 2, 1])
  }
  return out
}

/** Pixel ring (outline only), used for the Ferris wheel. */
function ring(cx: number, cy: number, r: number): R[] {
  const out: R[] = []
  for (let a = 0; a < 360; a += 6) {
    const rad = (a * Math.PI) / 180
    out.push([Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r), 1, 1])
  }
  return out
}

/** Deterministic pseudo-random so the backdrop never changes between renders. */
function prng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function buildings(base: number, minH: number, maxH: number, seed: number): R[] {
  const rnd = prng(seed)
  const out: R[] = []
  for (let x = 0; x < 160; ) {
    const w = 8 + Math.floor(rnd() * 12)
    out.push([x, base - (minH + Math.floor(rnd() * (maxH - minH))), w, 90])
    x += w + Math.floor(rnd() * 3)
  }
  return out
}

function scatter(n: number, maxY: number, seed: number, size = 1): R[] {
  const rnd = prng(seed)
  return Array.from({ length: n }, () => [Math.floor(rnd() * 160), Math.floor(rnd() * maxY), size, size] as R)
}

/** Each location: far layer, near layer, accent details. */
const SCENES: Record<string, () => { far: R[]; near: R[]; accent: R[] }> = {
  rooftops: () => ({
    far: buildings(70, 20, 50, 3),
    near: [[0, 74, 160, 16], [18, 58, 14, 16], [22, 50, 6, 8], [110, 64, 40, 10], [118, 54, 2, 10]],
    accent: [...scatter(40, 60, 9), [112, 66, 36, 3], [20, 60, 10, 2]],
  }),
  castle: () => ({
    far: [...steps(-10, 80, 70, 36), ...steps(90, 80, 90, 44)],
    near: [
      [40, 52, 80, 38], [30, 36, 16, 54], [114, 36, 16, 54], [70, 28, 20, 62],
      ...[30, 38, 42, 114, 122, 126].map((x) => [x, 32, 4, 4] as R),
      ...[70, 78, 86].map((x) => [x, 24, 4, 4] as R),
    ],
    accent: [...circle(140, 14, 7), [76, 72, 8, 18], [36, 44, 4, 6], [120, 44, 4, 6]],
  }),
  beach: () => ({
    far: [[0, 50, 160, 22]],
    near: [[0, 70, 160, 20], ...steps(10, 72, 30, 8, 2), [118, 46, 2, 26]],
    accent: [...circle(120, 30, 9), [108, 44, 24, 2], [112, 42, 16, 2], [0, 56, 160, 1], [0, 63, 160, 1]],
  }),
  space: () => ({
    far: circle(120, 34, 22),
    near: [[20, 50, 120, 12], [70, 36, 20, 40], [4, 46, 28, 20], [128, 46, 28, 20], [78, 26, 4, 10]],
    accent: [...scatter(60, 90, 5), [6, 48, 24, 2], [130, 48, 24, 2], [74, 54, 12, 2]],
  }),
  carnival: () => ({
    far: [...steps(4, 80, 40, 28, 4), ...steps(100, 80, 50, 34, 4)],
    near: [[0, 78, 160, 12], ...ring(78, 42, 26), [77, 42, 2, 36], [52, 42, 52, 1], [66, 66, 24, 12]],
    accent: [...scatter(30, 74, 21, 2), [76, 40, 4, 4]],
  }),
  temple: () => ({
    far: Array.from({ length: 12 }, (_, i) => circle(i * 15 + 6, 46, 10)).flat(),
    near: [...steps(30, 90, 100, 56, 6), [72, 20, 16, 14]],
    accent: [[76, 76, 8, 14], [78, 24, 4, 6], ...scatter(16, 40, 13)],
  }),
  underwater: () => ({
    far: Array.from({ length: 10 }, (_, i) => [i * 17 + 4, 40 + ((i * 7) % 20), 3, 60] as R),
    near: [[0, 76, 160, 14], ...circle(110, 76, 20), [60, 66, 20, 10]],
    accent: [...scatter(24, 70, 17, 2), [100, 64, 6, 4], [114, 64, 6, 4]],
  }),
  arctic: () => ({
    far: [...steps(0, 72, 60, 30, 3), ...steps(70, 72, 80, 40, 3)],
    near: [[0, 72, 160, 18], [96, 56, 40, 16], [128, 40, 2, 16]],
    accent: [...scatter(50, 70, 31), [100, 60, 6, 6], [112, 60, 6, 6], [126, 38, 6, 2]],
  }),
}

export function LocationBackdrop({ locationId, className }: { locationId: string; className?: string }) {
  const loc = getLocation(locationId)
  if (!loc) return null
  const [skyTop, skyBottom, far, near, accent] = loc.palette
  const scene = (SCENES[loc.id] ?? SCENES.rooftops)()
  const draw = (rects: R[], fill: string) =>
    rects.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />)

  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className={`pixel pointer-events-none absolute inset-0 h-full w-full ${className ?? ''}`}
      aria-hidden
    >
      {/* Hard-banded sky: no gradients, just stepped bands. */}
      <rect x={0} y={0} width={160} height={90} fill={skyBottom} />
      <rect x={0} y={0} width={160} height={40} fill={skyTop} />
      <rect x={0} y={40} width={160} height={4} fill={skyTop} opacity={0.6} />
      <rect x={0} y={48} width={160} height={2} fill={skyTop} opacity={0.35} />
      {draw(scene.far, far)}
      {draw(scene.near, near)}
      {draw(scene.accent, accent)}
    </svg>
  )
}
