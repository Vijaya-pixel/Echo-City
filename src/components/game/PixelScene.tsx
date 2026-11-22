/**
 * Layered pixel-art scenes, drawn procedurally on a 320x180 grid.
 *
 * Every layer is a crisp SVG path made only of horizontal/vertical steps, so it
 * scales up like real pixel art. Techniques:
 *  - stepped sky bands with 2px checker dithering between neighbours
 *  - cloud banks / ridges from periodic value noise (seamless when drifting)
 *  - skylines with roof details and lit windows
 *  - sun/moon discs with banded halos, stars, birds, water streaks
 *
 * Deterministic (seeded), so scenes prerender identically and never flicker.
 */

import { createContext, memo, useContext, useId, type ReactNode } from 'react'

// Grid size. Most scenes use 320x180; high-detail scenes render at 2x
// (640x360) for finer, more realistic pixels. PixelScene sets these just
// before a scene draws (rendering is synchronous), so every helper below
// automatically works at the scene's resolution.
let W = 320
let H = 180
const GridContext = createContext({ w: 320, h: 180 })
/** Every scene component calls this first so its helpers see the scene's grid size. */
function useGrid() {
  const g = useContext(GridContext)
  W = g.w
  H = g.h
}

// ── Primitives ───────────────────────────────────────────────────────────────

function prng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** Periodic noise in [-1, 1] (period = W), so layers tile when they drift. */
function noise(seed: number, harmonics: number[], sharp = false) {
  const r = prng(seed)
  const ph = harmonics.map(() => r() * Math.PI * 2)
  const amp = harmonics.map((h) => (0.6 + r() * 0.8) / Math.pow(h, 0.85))
  const norm = amp.reduce((a, b) => a + b, 0)
  // sharp: 1 - |sin| gives pointed peaks (mountains) instead of rolling hills.
  const wave = sharp ? (t: number) => 1 - 2 * Math.abs(Math.sin(t / 2)) : Math.sin
  return (x: number) => harmonics.reduce((s, h, i) => s + amp[i] * wave((2 * Math.PI * h * x) / W + ph[i]), 0) / norm
}

interface RidgeOpts {
  seed: number
  base: number
  amp: number
  step?: number
  harm?: number[]
  bottom?: number
  width?: number
  /** Clamp the top so peaks never rise above this y. */
  minY?: number
  sharp?: boolean
}

/** Pixel disc as horizontal runs. */
function disc(cx: number, cy: number, r: number) {
  let d = ''
  for (let y = -r; y < r; y++) {
    const half = Math.round(Math.sqrt(r * r - (y + 0.5) ** 2))
    if (half > 0) d += `M${cx - half} ${cy + y}h${half * 2}v1h${-half * 2}Z`
  }
  return d
}

/** Many 1px (or w x h) squares as one path. */
function dots(points: Array<[number, number]>, w = 1, h = 1) {
  return points.map(([x, y]) => `M${x} ${y}h${w}v${h}h${-w}Z`).join('')
}

function rects(list: Array<[number, number, number, number]>) {
  return list.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}Z`).join('')
}

function scatter(seed: number, n: number, x0: number, x1: number, y0: number, y1: number): Array<[number, number]> {
  const r = prng(seed)
  return Array.from({ length: n }, () => [Math.floor(x0 + r() * (x1 - x0)), Math.floor(y0 + r() * (y1 - y0))])
}

// ── Neon city (cyberpunk skyline) ───────────────────────────────────────────

export const NEON = ['#ff2bd6', '#22e4ff', '#b45cff', '#ffe14a', '#3dff9a'] as const
const RIBBON = ['#d2e4ff', '#8fdcff', '#ffd59a', '#ff9ad6'] as const

interface CityPalette {
  body: string
  side: string
  /** Neon rim reflections: cyan on the shadow edge, magenta on the lit edge. */
  rimA: string
  rimB: string
  /** Unlit windows (sky reflection), slightly lighter than the body. */
  win: string
  /** Lit window colours: warm, cyan, magenta. */
  lit: [string, string, string]
  detail: string
}

interface NeonCityOpts {
  seed: number
  base: number
  minH: number
  maxH: number
  minW?: number
  maxW?: number
  gap?: number
  /** Share of windows lit (0..1). */
  occupancy?: number
  /** Chance per building of neon signs / billboards (0..1). */
  signs?: number
  /** Draw rim lights (near layers only; far layers stay hazy). */
  rims?: boolean
  /** Chance a tall building becomes a glowing ribbon tower. */
  ribbons?: number
  pal: CityPalette
}

type Paths = Record<string, string>

/**
 * Cyberpunk skyline. Building types: setback towers with LED crowns, glass
 * towers with mullions, apartments with fire escapes and water tanks, offices
 * with ribbon windows. Neon blade signs and billboards get a 1px bloom; some
 * elements sit in an RGB-cycling group.
 */
function NeonCity({ seed, base, minH, maxH, minW = 12, maxW = 28, gap = 2, occupancy = 0.25, signs = 0, rims = true, ribbons = 0, pal }: NeonCityOpts) {
  useGrid()
  const r = prng(seed)
  const P: Paths = {}
  const add = (k: string, x: number, y: number, w: number, h: number) => {
    if (w > 0 && h > 0) P[k] = (P[k] ?? '') + `M${x} ${y}h${w}v${h}h${-w}Z`
  }
  const litKey = () => {
    const q = r()
    return q < 0.55 ? 'lit0' : q < 0.8 ? 'lit1' : 'lit2'
  }
  const rgbKey = () => `rgb${Math.floor(r() * 3)}`
  /** Neon element with a bloom halo; 30% of them cycle RGB. */
  const neon = (x: number, y: number, w: number, h: number) => {
    const rgb = r() < 0.3
    const c = Math.floor(r() * NEON.length)
    const key = rgb ? rgbKey() : `neon${c}`
    add(`${key}-glow`, x - 1, y - 1, w + 2, h + 2)
    add(key, x, y, w, h)
    return key
  }

  for (let x = -6; x < W + 6; ) {
    const w = minW + Math.floor(r() * (maxW - minW))
    const h = minH + Math.floor(r() * (maxH - minH))
    const top = base - h
    const tall = h > minH + (maxH - minH) * 0.55
    const type = tall ? (r() < 0.55 ? 'tower' : 'glass') : r() < 0.5 ? 'apt' : 'office'
    const sw = Math.max(1, Math.round(w * 0.2)) // shaded side face (left)
    const fx = x + sw + 1
    const fw = w - sw - 2
    const occ = occupancy * (0.4 + r() * 1.2) // some buildings busier than others

    // Body, side face, ledge
    add('body', x, top, w, H - top)
    add('side', x, top, sw, H - top)
    add('detail', x, top, w, 1)

    // Crown / setback for towers
    if (type === 'tower' && w > 12) {
      const ch = 4 + Math.floor(r() * 8)
      add('body', x + 2, top - ch, w - 4, ch)
      add('side', x + 2, top - ch, Math.max(1, sw - 1), ch)
      const k = r() < 0.3 ? rgbKey() : r() < 0.5 ? 'neon1' : 'neon0' // LED crown: steady cyan/magenta, some RGB
      add(k, x + 2, top - ch, w - 4, 1)
      add(`${k}-glow`, x + 1, top - ch - 1, w - 2, 3)
      if (r() < 0.7) {
        const ax = x + Math.floor(w / 2)
        add('detail', ax, top - ch - 9, 1, 9)
        add('beacon', ax, top - ch - 10, 1, 1)
        add('beaconGlow', ax - 1, top - ch - 11, 3, 3)
      }
    }

    // Facade
    if (ribbons && tall && r() < ribbons) {
      // Glowing ribbon-window tower: bright horizontal light bands + bloom
      const c = Math.floor(r() * RIBBON.length)
      add(`ribbon${c}-glow`, x - 2, top - 2, w + 4, base - top + 2)
      const split = fw > 10 ? fx + Math.floor(fw / 2) : -1
      for (let wy = top + 3; wy < base; wy += 2) {
        const q = r()
        const key = q < 0.7 ? `ribbon${c}` : q < 0.88 ? `ribbon${c}-dim` : 'win'
        if (split > 0) {
          add(key, fx, wy, split - fx, 1)
          add(r() < 0.85 ? key : 'win', split + 1, wy, fx + fw - split - 1, 1)
        } else add(key, fx, wy, fw, 1)
      }
      for (const bx of [x + 1, x + w - 2]) {
        add('beacon', bx, top - 1, 1, 1)
        add('beaconGlow', bx - 1, top - 2, 3, 3)
      }
    } else if (type === 'glass') {
      for (let wx = fx; wx < fx + fw; wx += 2) add('win', wx, top + 2, 1, H - top - 2)
      for (let wy = top + 3; wy < base; wy += 4)
        for (let wx = fx; wx < fx + fw; wx += 2) if (r() < occ * 0.8) add(litKey(), wx, wy, 1, 2)
      add(r() < 0.3 ? rgbKey() : 'neon1', x, top, w, 1)
    } else if (type === 'office') {
      for (let wy = top + 3; wy < base; wy += 3) {
        add('win', fx, wy, fw, 1)
        if (r() < occ * 1.4) {
          const len = 2 + Math.floor(r() * fw)
          add(litKey(), fx + Math.floor(r() * Math.max(1, fw - len)), wy, Math.min(len, fw), 1)
        }
      }
    } else {
      // tower + apartment: window grid, lit windows cluster by floor
      const ww = type === 'apt' ? 2 : 1
      const sx = type === 'apt' ? 4 : 3
      for (let wy = top + 3; wy < base - 1; wy += 4) {
        const floorBusy = r() < occ * 1.8 ? occ * 2 : occ * 0.25
        for (let wx = fx; wx + ww <= fx + fw; wx += sx) {
          add('win', wx, wy, ww, 2)
          if (r() < floorBusy) add(litKey(), wx, wy, ww, 2)
        }
      }
      if (type === 'apt') {
        // Fire escape zig-zag on the face
        if (fw > 8 && r() < 0.6) {
          const ex = fx + Math.floor(fw / 2) - 2
          for (let wy = top + 5; wy < base - 2; wy += 4) add('detail', ex, wy, 5, 1)
          for (let wy = top + 5; wy < base - 4; wy += 8) add('detail', ex + 4, wy, 1, 4)
        }
        // Water tank or AC units
        if (r() < 0.5) {
          add('detail', x + 3, top - 3, 1, 3)
          add('detail', x + 7, top - 3, 1, 3)
          add('side', x + 2, top - 8, 7, 5)
          add('detail', x + 3, top - 9, 5, 1)
        } else {
          add('detail', x + 2, top - 2, 3, 2)
          add('detail', x + w - 6, top - 2, 3, 2)
        }
      }
    }

    // Neon rim reflections
    if (rims) {
      if (r() < 0.4) add('rimA', x, top, 1, H - top)
      if (r() < 0.55) add('rimB', x + w - 1, top, 1, H - top)
    }

    // Glass reflects the sky: facades lighten toward the top (stepped).
    if (type === 'glass' || (ribbons && tall)) {
      for (let k = 0; k < 3; k++) add('sheen', x + sw, top + k * 6, w - sw, 6)
    }
    // Rooftop detail: spire on the tallest, helipad or plant on flat roofs.
    if (h > maxH * 0.88 && type !== 'tower') {
      const sx = x + Math.floor(w / 2)
      for (let k = 0; k < 14; k++) add('detail', sx - Math.max(0, 2 - Math.floor(k / 5)), top - k - 1, 1 + 2 * Math.max(0, 2 - Math.floor(k / 5)), 1)
      add('beacon', sx, top - 16, 1, 1)
      add('beaconGlow', sx - 1, top - 17, 3, 3)
    } else if (type === 'office' && w > 18 && r() < 0.4) {
      add('detail', x + 3, top - 2, w - 6, 2)
      add('helipad', x + Math.floor(w / 2) - 3, top - 2, 6, 1)
    } else if (r() < 0.35) {
      add('detail', x + 3, top - 3, 4, 3)
      add('detail', x + w - 8, top - 4, 5, 4)
    }

    // Signs
    if (r() < signs) {
      const kind = r()
      if (kind < 0.5 && h > 24) {
        // Vertical blade sign hanging off the right edge, "characters" as gaps
        const len = 10 + Math.floor(r() * 14)
        const sy = top + 4 + Math.floor(r() * Math.max(1, h - len - 10))
        const key = neon(x + w, sy, 3, len)
        for (let k = sy + 2; k < sy + len - 1; k += 3) add('signInk', x + w + 1, k, 1, 1)
        void key
      } else if (kind < 0.8 && fw > 10) {
        // Horizontal neon tube sign across the face
        const sy = top + 3 + Math.floor(r() * Math.min(10, Math.max(1, h - 8)))
        neon(fx + 1, sy, fw - 2, 2)
      } else if (w > 16) {
        // Rooftop billboard: frame + RGB screen with scanline stripes
        const bw = Math.min(w + 4, 22)
        const bx = x + Math.floor((w - bw) / 2)
        add('detail', bx + 2, top - 3, 1, 3)
        add('detail', bx + bw - 3, top - 3, 1, 3)
        const k = rgbKey()
        add('detail', bx - 1, top - 12, bw + 2, 10)
        add(`${k}-glow`, bx - 1, top - 12, bw + 2, 10)
        add(k, bx, top - 11, bw, 8)
        for (let k = top - 10; k < top - 3; k += 2) add('signInk', bx, k, bw, 1)
      }
    }

    x += w + Math.floor(r() * gap)
  }

  const neonKeys = NEON.map((_, i) => `neon${i}`)
  return (
    <g>
      <path d={P.body} fill={pal.body} />
      <path d={P.side} fill={pal.side} />
      <path d={P.win} fill={pal.win} />
      <path d={P.lit0} fill={pal.lit[0]} />
      <path d={P.lit1} fill={pal.lit[1]} />
      <path d={P.lit2} fill={pal.lit[2]} />
      <path d={P.detail} fill={pal.detail} />
      <path d={P.sheen} fill="#c0a8ff" opacity={0.07} />
      <path d={P.helipad} fill="#ffd98a" opacity={0.8} />
      {rims && <path d={P.rimA} fill={pal.rimA} opacity={0.55} />}
      {rims && <path d={P.rimB} fill={pal.rimB} opacity={0.6} />}
      {neonKeys.map((k, i) => (
        <g key={k}>
          <path d={P[`${k}-glow`]} fill={NEON[i]} opacity={0.3} />
          <path d={P[k]} fill={NEON[i]} />
        </g>
      ))}
      {RIBBON.map((c, i) => (
        <g key={c}>
          <path d={P[`ribbon${i}-glow`]} fill={c} opacity={0.1} />
          <path d={P[`ribbon${i}-dim`]} fill={c} opacity={0.55} />
          <path d={P[`ribbon${i}`]} fill={c} />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} className="rgb-cycle" style={{ ['--d' as string]: `${-i * 2}s` }}>
          <path d={P[`rgb${i}-glow`]} fill={NEON[i]} opacity={0.3} />
          <path d={P[`rgb${i}`]} fill={NEON[i]} />
        </g>
      ))}
      <path d={P.signInk} fill={pal.side} opacity={0.85} />
      <g className="scene-blink">
        <path d={P.beaconGlow} fill="#ff4fa0" opacity={0.35} />
        <path d={P.beacon} fill="#ff6fb8" />
      </g>
    </g>
  )
}

/**
 * Hover cars: body with a lit windscreen, cyan underglow, headlight beam,
 * red tail light and a fading light trail. Half fly each way.
 */
function Traffic({ seed, n, y0, y1, speed }: { seed: number; n: number; y0: number; y1: number; speed: number }) {
  useGrid()
  const r = prng(seed)
  const BODY = ['#2a1a40', '#1d2340', '#3a1838', '#202a3a']
  const cars = Array.from({ length: n }, () => ({
    x: Math.floor(r() * W),
    y: Math.floor(y0 + r() * (y1 - y0)),
    body: BODY[Math.floor(r() * BODY.length)],
    glow: r() < 0.5 ? NEON[1] : NEON[0],
    left: r() < 0.5,
    big: r() < 0.3,
  }))
  const car = (c: (typeof cars)[number], dx: number, k: string) => {
    const L = c.big ? 11 : 8
    // Drawn facing right; mirrored for left-flying cars.
    const t = c.left ? `translate(${2 * (c.x + dx) + L} 0) scale(-1 1)` : undefined
    const x = c.x + dx
    const y = c.y
    return (
      <g key={k} transform={t}>
        <path d={`M${x - 26} ${y + 1}h26v1h-26Z`} fill="#ff4a5a" opacity={0.12} />
        <path d={`M${x - 12} ${y + 1}h12v1h-12Z`} fill="#ff4a5a" opacity={0.28} />
        <path d={`M${x + L} ${y - 1}h2l14 -3v9l-14 -3h-2Z`} fill="#fff3c4" opacity={0.1} />
        <path d={rects([[x + 1, y, L - 1, 2], [x + 2, y - 1, L - 4, 1], [x, y + 1, 1, 1]])} fill={c.body} />
        <path d={rects([[x + L - 4, y - 1, 2, 1]])} fill="#9fdcff" />
        <path d={rects([[x + 2, y + 2, L - 3, 1]])} fill={c.glow} opacity={0.8} />
        <path d={rects([[x + 1, y + 3, L - 1, 1]])} fill={c.glow} opacity={0.25} />
        <rect x={x + L} y={y} width={1} height={1} fill="#fff6d0" />
        <rect x={x} y={y} width={1} height={1} fill="#ff4a5a" />
      </g>
    )
  }
  const right = cars.filter((c) => !c.left)
  const left = cars.filter((c) => c.left)
  return (
    <g>
      <g className="scene-fly" style={{ ['--fly' as string]: `${speed}s`, ['--dist' as string]: `${W}px` }}>
        {right.map((c, i) => car(c, 0, `r${i}`))}
        {right.map((c, i) => car(c, -W, `r${i}b`))}
      </g>
      <g className="scene-fly" style={{ ['--fly' as string]: `${speed * 1.3}s`, ['--dist' as string]: `${-W}px` }}>
        {left.map((c, i) => car(c, 0, `l${i}`))}
        {left.map((c, i) => car(c, W, `l${i}b`))}
      </g>
    </g>
  )
}

/** Neon haze rising from the streets: stacked dithered/translucent bands. */
function StreetGlow({ y, colors }: { y: number; colors: [string, string] }) {
  useGrid()
  return (
    <g>
      <rect x={0} y={y - 18} width={W} height={18} fill={colors[0]} opacity={0.08} />
      <rect x={0} y={y - 10} width={W} height={10} fill={colors[0]} opacity={0.1} />
      <rect x={0} y={y - 5} width={W} height={5} fill={colors[1]} opacity={0.14} />
    </g>
  )
}

/** Atmospheric perspective: tints everything already drawn toward the sky colour. */
function Haze({ color, opacity, top = 0 }: { color: string; opacity: number; top?: number }) {
  useGrid()
  return <rect x={0} y={top} width={W} height={H - top} fill={color} opacity={opacity} />
}

/**
 * Elevated rail: deck with an X-truss, pillars, under-deck lamps, and a
 * multi-car train (lit windows, car gaps, roof highlight, headlight beam).
 */
function RailBridge({ y, color, light, accent }: { y: number; color: string; light: string; accent: string }) {
  useGrid()
  const deck: Array<[number, number, number, number]> = [[0, y, W, 2], [0, y + 6, W, 2], [0, y - 4, W, 1]]
  let truss = ''
  for (let x = 0; x < W; x += 8) {
    for (let k = 0; k < 4; k++) truss += `M${x + k} ${y + 2 + k}h1v1h-1Z M${x + 7 - k} ${y + 2 + k}h1v1h-1Z`
  }
  const posts = Array.from({ length: Math.ceil(W / 4) }, (_, i) => [i * 4, y - 3, 1, 3] as [number, number, number, number])
  const pillars = Array.from({ length: Math.ceil(W / 64) + 1 }, (_, i) => [i * 64 + 20, y + 8, 5, H - y - 8] as [number, number, number, number])
  const lamps = Array.from({ length: Math.ceil(W / 16) }, (_, i) => [i * 16 + 6, y + 8] as [number, number])
  const CAR = 30
  const train = (dx: number) => {
    const x0 = 60 + dx
    const cars = Array.from({ length: 5 }, (_, i) => x0 + i * (CAR + 2))
    const end = x0 + 5 * (CAR + 2) - 2
    return (
      <g key={dx}>
        <path d={`M${end + 2} ${y - 9}h3l40 -6v16l-40 -6h-3Z`} fill="#fff3c4" opacity={0.08} />
        <path d={rects(cars.map((cx) => [cx, y - 11, CAR, 7] as [number, number, number, number]))} fill="#1a1426" />
        <path d={rects(cars.map((cx) => [cx + 1, y - 12, CAR - 2, 1] as [number, number, number, number]))} fill="#4a3a66" />
        <path d={rects(cars.flatMap((cx) => Array.from({ length: 6 }, (_, k) => [cx + 3 + k * 4.5, y - 9, 3, 2] as [number, number, number, number])))} fill={light} />
        <path d={rects(cars.map((cx) => [cx, y - 5, CAR, 1] as [number, number, number, number]))} fill={accent} />
        <path d={rects([[end - 2, y - 11, 4, 5]])} fill="#1a1426" />
        <rect x={end + 1} y={y - 8} width={1} height={1} fill="#fff6d0" />
        <rect x={x0} y={y - 8} width={1} height={1} fill="#ff4a5a" />
      </g>
    )
  }
  return (
    <g>
      <path d={rects([...deck, ...posts, ...pillars])} fill={color} />
      <path d={truss} fill={color} />
      <path d={dots(lamps, 2, 1)} fill={light} />
      <path d={dots(lamps.map(([x, ly]) => [x - 2, ly] as [number, number]), 6, 4)} fill={light} opacity={0.12} />
      <g className="scene-fly" style={{ ['--fly' as string]: '26s', ['--dist' as string]: `${W}px` }}>
        {train(0)}
        {train(-W)}
      </g>
    </g>
  )
}

/** A cloud strip with a noisy top and bottom, lit from below by the city. */
function CloudStrip({ seed, y, thick, amp, color, under, drift }: { seed: number; y: number; thick: number; amp: number; color: string; under: string; drift: number }) {
  useGrid()
  const top = noise(seed, [2, 3, 5, 8, 13])
  const bot = noise(seed + 7, [3, 5, 9, 14])
  const strip = (dy: number) => {
    let d = ''
    const step = 2
    for (let x = 0; x < W * 2; x += step) {
      const t = Math.round(y - top(x) * amp)
      const b = Math.round(y + thick + bot(x) * amp * 0.6)
      if (b - t > 1) d += `M${x} ${t + dy}h${step}v${b - t}h${-step}Z`
    }
    return d
  }
  return (
    <g className="scene-drift" style={{ ['--drift' as string]: `${drift}s`, ['--dist' as string]: `${-W}px` }}>
      <path d={strip(2)} fill={under} />
      <path d={strip(0)} fill={color} />
    </g>
  )
}

/** Smooth night gradient (no banding) with a soft city glow at the horizon. */
function NightSky({ uid, stops, horizon, glow }: { uid: string; stops: string[]; horizon: number; glow: string }) {
  useGrid()
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-night`} x1={0} y1={0} x2={0} y2={1}>
          {stops.map((c, i) => (
            <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`${uid}-glow`} x1={0} y1={0} x2={0} y2={1}>
          <stop offset={0} stopColor={glow} stopOpacity={0} />
          <stop offset={1} stopColor={glow} stopOpacity={0.35} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={horizon} fill={`url(#${uid}-night)`} />
      <rect x={0} y={horizon * 0.55} width={W} height={horizon * 0.45} fill={`url(#${uid}-glow)`} />
    </g>
  )
}

/**
 * Night stars: many tiny single-pixel stars at varied brightness, plus a few
 * four-point sparkles whose thin arms fade toward the tips.
 */
function NightStars({ seed, n, maxY, sparkles }: { seed: number; n: number; maxY: number; sparkles: Array<[number, number, number]> }) {
  useGrid()
  const r = prng(seed)
  const tiers = ['', '', ''] // dim, mid, bright
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * W)
    const y = Math.floor(Math.pow(r(), 1.3) * maxY)
    const q = r()
    const t = q < 0.55 ? 0 : q < 0.88 ? 1 : 2
    tiers[t] += `M${x} ${y}h1v1h-1Z`
  }
  return (
    <g>
      <path d={tiers[0]} fill="#cfd8ff" opacity={0.35} />
      <path d={tiers[1]} fill="#e6ecff" opacity={0.6} />
      <path d={tiers[2]} fill="#ffffff" opacity={0.95} />
      {sparkles.map(([x, y, len], i) => (
        <g key={i} className={i % 2 ? 'scene-twinkle' : undefined}>
          {/* outer arm tips, faint */}
          <path d={`M${x} ${y - len}h1v${len - 1}h-1Z M${x} ${y + 2}h1v${len - 1}h-1Z M${x - len} ${y}h${len - 1}v1h${-(len - 1)}Z M${x + 2} ${y}h${len - 1}v1h${-(len - 1)}Z`} fill="#dfe6ff" opacity={0.45} />
          {/* inner arms, bright */}
          <path d={`M${x} ${y - Math.ceil(len / 2)}h1v${2 * Math.ceil(len / 2) + 1}h-1Z M${x - Math.ceil(len / 2)} ${y}h${2 * Math.ceil(len / 2) + 1}v1h${-(2 * Math.ceil(len / 2) + 1)}Z`} fill="#f4f7ff" opacity={0.85} />
          <rect x={x} y={y} width={1} height={1} fill="#ffffff" />
          <path d={disc(x, y, 3)} fill="#c8d4ff" opacity={0.12} />
        </g>
      ))}
    </g>
  )
}

/** Small crescent moon: a lit sliver with a faint earthshine disc and a soft glow. */
function CrescentMoon({ uid, cx, cy, r }: { uid: string; cx: number; cy: number; r: number }) {
  useGrid()
  // Lit part = moon disc minus a disc shifted up-left.
  const ox = -Math.round(r * 0.45)
  const oy = -Math.round(r * 0.25)
  let lit = ''
  let rim = ''
  for (let y = -r; y < r; y++) {
    for (let x = -r; x < r; x++) {
      const inMoon = (x + 0.5) ** 2 + (y + 0.5) ** 2 < r * r
      const inShadow = (x - ox + 0.5) ** 2 + (y - oy + 0.5) ** 2 < r * r
      if (inMoon && !inShadow) {
        const edge = (x - ox + 0.5) ** 2 + (y - oy + 0.5) ** 2 < (r + 1.6) ** 2
        if (edge) rim += `M${cx + x} ${cy + y}h1v1h-1Z`
        else lit += `M${cx + x} ${cy + y}h1v1h-1Z`
      }
    }
  }
  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-moonglow`}>
          <stop offset={0} stopColor="#fff6d8" stopOpacity={0.35} />
          <stop offset={0.5} stopColor="#dfe6ff" stopOpacity={0.1} />
          <stop offset={1} stopColor="#dfe6ff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={cx + 2} cy={cy + 1} r={r * 3.2} fill={`url(#${uid}-moonglow)`} />
      <path d={disc(cx, cy, r)} fill="#9fb0e6" opacity={0.12} />
      <path d={lit} fill="#fff7dc" />
      <path d={rim} fill="#f0e2b8" />
    </g>
  )
}

/** Moon with craters and a soft halo. */
function Moon({ cx, cy, r, color, shade, halo }: { cx: number; cy: number; r: number; color: string; shade: string; halo: string }) {
  return (
    <g>
      <path d={disc(cx, cy, r + 14)} fill={halo} opacity={0.08} />
      <path d={disc(cx, cy, r + 7)} fill={halo} opacity={0.14} />
      <path d={disc(cx, cy, r)} fill={color} />
      <path d={disc(cx - 3, cy - 2, 3) + disc(cx + 4, cy + 3, 2) + disc(cx + 1, cy - 5, 1) + disc(cx - 4, cy + 4, 2)} fill={shade} />
    </g>
  )
}

// ── Street of houses (native 2x detail) ─────────────────────────────────────

interface Facade {
  wall: string
  dark: string
  trim: string
  roof: string
}

// Night-tinted, muted materials: they sit with the blue sky and let the warm
// windows and neon carry the colour.
const FACADES: Facade[] = [
  { wall: '#2e2654', dark: '#221c42', trim: '#4c4282', roof: '#171230' }, // violet brick
  { wall: '#3a3068', dark: '#2c2452', trim: '#60549a', roof: '#1c1638' }, // lavender stucco
  { wall: '#29243e', dark: '#1e1a2f', trim: '#463e66', roof: '#13101f' }, // charcoal
  { wall: '#4a2c52', dark: '#38213e', trim: '#704a78', roof: '#24142c' }, // plum brick
  { wall: '#2a2a50', dark: '#1f1f3e', trim: '#46467c', roof: '#121228' }, // indigo
  { wall: '#3e2a4a', dark: '#2f2038', trim: '#624670', roof: '#1e1426' }, // mauve
]
const FABRIC = ['#7a2638', '#283a78', '#1f4a3c', '#4a2a6a'] // muted awnings / curtains
const GLASS_LIT = ['#ffb86b', '#ffcf8a', '#ffa25c']
const GLASS_TV = '#8fd8ff'
const GLASS_DARK = '#121735'
const INK = '#0c0716'

type HouseKind = 'brownstone' | 'shop' | 'townhouse' | 'apartment' | 'ramen' | 'garage'
const HOUSE_KINDS: HouseKind[] = ['brownstone', 'shop', 'townhouse', 'apartment', 'ramen', 'garage']

/**
 * Foreground street: six building types (no two alike side by side), each with
 * its own facade colour, framed windows (warm / TV-blue / curtained / dark /
 * silhouettes), and street furniture: lamps, trees, bins, hydrant.
 */
function Houses({ seed, base }: { seed: number; base: number }) {
  useGrid()
  const r = prng(seed)
  // Painter's order matters (walls under windows under mullions), so keep an
  // ordered list and only merge consecutive draws of the same colour.
  const ops: Array<{ c: string; op: number; d: string }> = []
  const put = (c: string, x: number, y: number, w: number, h: number, op = 1) => {
    if (w <= 0 || h <= 0) return
    const rect = `M${x} ${y}h${w}v${h}h${-w}Z`
    const last = ops[ops.length - 1]
    if (last && last.c === c && last.op === op) last.d += rect
    else ops.push({ c, op, d: rect })
  }
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]

  /** Framed window with sill; lit variants get glow, curtains, silhouettes. */
  const win = (x: number, y: number, w: number, h: number, f: Facade, opts: { arch?: boolean; shutters?: boolean; box?: boolean } = {}) => {
    const roll = r()
    const lit = roll < 0.62
    put(INK, x - 1, y - 1, w + 2, h + 2)
    if (lit) {
      const glass = roll < 0.12 ? GLASS_TV : pick(GLASS_LIT)
      put(glass, x - 3, y - 3, w + 6, h + 6, 0.12)
      put(glass, x, y, w, h)
      put('#fff4d6', x, y, w, 1, 0.6)
      put(glass, x - 1, y + h + 2, w + 2, 5, 0.07) // light spilling onto the wall
      if (r() < 0.35) {
        // curtains
        const cc = pick(FABRIC)
        put(cc, x, y, Math.max(1, Math.floor(w / 3)), h, 0.85)
        put(cc, x + w - Math.max(1, Math.floor(w / 3)), y, Math.max(1, Math.floor(w / 3)), h, 0.85)
      } else if (r() < 0.18 && w >= 6) {
        // silhouette of someone inside
        put(INK, x + Math.floor(w / 2) - 1, y + h - 6, 3, 6, 0.75)
        put(INK, x + Math.floor(w / 2) - 1, y + h - 8, 2, 2, 0.75)
      }
    } else {
      put(GLASS_DARK, x, y, w, h)
      put('#4a5a9a', x + w - 2, y + 1, 1, 2) // reflection glint
      put('#2a3466', x, y, w, 1) // sky reflection on the glass
    }
    if (w >= 6) put(INK, x + Math.floor(w / 2), y, 1, h) // mullion
    if (h >= 10) put(INK, x, y + Math.floor(h / 2), w, 1)
    if (opts.arch) {
      put(f.wall, x - 1, y - 1, 2, 2)
      put(f.wall, x + w - 1, y - 1, 2, 2)
      put(f.trim, x + 1, y - 2, w - 2, 1)
    }
    put(f.trim, x - 2, y + h + 1, w + 4, 1) // sill
    if (opts.shutters) {
      put(f.dark, x - 4, y - 1, 3, h + 2)
      put(f.dark, x + w + 1, y - 1, 3, h + 2)
    }
    if (opts.box) {
      put('#3a2418', x - 1, y + h + 2, w + 2, 2)
      for (let k = 0; k < w; k += 2) put(r() < 0.5 ? '#2fae4e' : '#ff5fb0', x + k, y + h, 1, 2)
    }
  }

  const lamps: number[] = []
  const trees: number[] = []
  const props: Array<{ kind: 'bin' | 'hydrant'; x: number }> = []
  let prevKind: HouseKind | null = null
  let prevFacade = -1

  for (let x = -6; x < W + 6; ) {
    let kind = pick(HOUSE_KINDS)
    if (kind === prevKind) kind = HOUSE_KINDS[(HOUSE_KINDS.indexOf(kind) + 1 + Math.floor(r() * 4)) % HOUSE_KINDS.length]
    let fi = Math.floor(r() * FACADES.length)
    if (fi === prevFacade) fi = (fi + 1) % FACADES.length
    const f = FACADES[fi]
    prevKind = kind
    prevFacade = fi

    const dims: Record<HouseKind, [number, number, number, number]> = {
      brownstone: [64, 80, 70, 92],
      shop: [72, 96, 56, 70],
      townhouse: [56, 70, 58, 74],
      apartment: [84, 104, 96, 122],
      ramen: [60, 72, 56, 68],
      garage: [64, 80, 44, 54],
    }
    const [w0, w1, h0, h1] = dims[kind]
    const w = w0 + Math.floor(r() * (w1 - w0))
    const h = h0 + Math.floor(r() * (h1 - h0))
    const top = base - h

    // Body, shadow seam on the left, cornice
    put(f.wall, x, top, w, h)
    put(f.dark, x, top, 3, h)
    put(f.dark, x + w - 1, top, 1, h)
    const gy = base - 20 // ground floor line

    if (kind === 'brownstone') {
      // brick courses + staggered joints
      for (let yy = top + 6; yy < base; yy += 3) {
        put(f.dark, x + 3, yy, w - 4, 1, 0.55)
        for (let xx = x + 4 + ((yy / 3) % 2) * 3; xx < x + w - 2; xx += 6) put(f.dark, xx, yy - 2, 1, 2, 0.4)
      }
      put(f.trim, x - 2, top - 4, w + 4, 4)
      for (let xx = x; xx < x + w; xx += 3) put(f.dark, xx, top, 1, 2) // dentils
      const floors = Math.floor((gy - top - 10) / 18)
      const cols = Math.max(2, Math.floor((w - 8) / 16))
      const gap = (w - cols * 8) / (cols + 1)
      for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) win(Math.round(x + gap + c * (8 + gap)), top + 8 + fl * 18, 8, 12, f, { arch: true })
      // stoop + door
      const dx = x + Math.floor(w * 0.25)
      put(INK, dx - 1, gy - 1, 12, 21)
      put('#3a2418', dx, gy, 10, 20)
      put(pick(GLASS_LIT), dx, gy, 10, 3) // transom
      put('#d9b36a', dx + 8, gy + 11, 1, 2) // knob
      for (let k = 0; k < 4; k++) put(f.trim, dx - 2 - k * 2, base - 2 - k * 2 + 6, 14 + k * 4, 2)
      win(x + w - 20, gy + 4, 10, 10, f)
    } else if (kind === 'shop') {
      const floors = Math.max(1, Math.floor((gy - top - 18) / 16))
      const cols = Math.max(2, Math.floor((w - 8) / 15))
      const gap = (w - cols * 8) / (cols + 1)
      put(f.trim, x - 2, top - 3, w + 4, 3)
      for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) win(Math.round(x + gap + c * (8 + gap)), top + 6 + fl * 16, 8, 10, f, { box: r() < 0.5 })
      // storefront
      const gx = x + 5
      const gw = w - 24
      put(INK, gx - 1, gy - 1, gw + 2, 20)
      const glass = pick(GLASS_LIT)
      put(glass, gx - 4, gy - 4, gw + 8, 24, 0.12)
      put(glass, gx, gy, gw, 18)
      for (let k = 0; k < 3; k++) put('#6a3a1c', gx + 2, gy + 4 + k * 5, gw - 4, 1, 0.7) // shelves
      if (r() < 0.6) {
        put(INK, gx + 6, gy + 8, 4, 10, 0.7)
        put(INK, gx + 7, gy + 5, 3, 3, 0.7)
      }
      put(INK, gx + gw + 3, gy - 1, 12, 20)
      put('#22304a', gx + gw + 4, gy, 10, 19)
      // striped awning with scalloped edge
      const ac = pick(FABRIC)
      for (let k = 0; k < w; k += 4) put(k % 8 === 0 ? ac : '#bdb2c4', x + k, gy - 9, 4, 6)
      for (let k = 0; k < w; k += 4) put(k % 8 === 0 ? ac : '#bdb2c4', x + k + 1, gy - 3, 2, 1)
      // neon sign
      const nc = pick(NEON)
      const sx = x + 8
      put(nc, sx - 2, gy - 16, w - 16, 7, 0.2)
      for (let k = 0; k < w - 20; k += 4) if (r() < 0.8) put(nc, sx + k, gy - 14, 3, 3)
    } else if (kind === 'townhouse') {
      for (let yy = top + 2; yy < base; yy += 3) put(f.dark, x + 3, yy, w - 4, 1, 0.5) // siding
      // pitched roof + dormer
      const rh = Math.floor(w / 3)
      for (let k = 0; k < rh; k++) put(f.roof, x - 2 + Math.floor((k * w) / (2 * rh)), top - k - 1, w + 4 - Math.floor((k * w) / rh), 1)
      put(f.trim, x - 3, top - 1, w + 6, 2)
      const dx = x + Math.floor(w / 2) - 5
      put(f.wall, dx, top - Math.floor(rh * 0.6) - 4, 10, Math.floor(rh * 0.6) + 2)
      win(dx + 2, top - Math.floor(rh * 0.6) - 1, 6, 6, f)
      const floors = Math.max(1, Math.floor((gy - top - 8) / 17))
      for (let fl = 0; fl < floors; fl++) {
        win(x + 9, top + 6 + fl * 17, 8, 11, f, { shutters: true })
        win(x + w - 17, top + 6 + fl * 17, 8, 11, f, { shutters: true, box: true })
      }
      const ddx = x + Math.floor(w / 2) - 5
      put(f.roof, ddx - 4, gy - 3, 18, 3) // porch roof
      put(INK, ddx - 1, gy, 12, 20)
      put('#4a2230', ddx, gy + 1, 10, 19)
      put('#ffe6a8', ddx - 4, gy + 1, 2, 2) // porch light
      put('#ffe6a8', ddx - 7, gy - 2, 8, 8, 0.15)
    } else if (kind === 'apartment') {
      put(f.trim, x - 1, top - 2, w + 2, 2)
      // roof: water tank + dish
      put(INK, x + 10, top - 6, 1, 6)
      put(INK, x + 20, top - 6, 1, 6)
      put(f.roof, x + 8, top - 18, 15, 12)
      put(f.dark, x + 8, top - 18, 15, 2)
      put(INK, x + w - 16, top - 8, 1, 8)
      put('#c9d2e8', x + w - 20, top - 12, 8, 4)
      const rows = Math.floor((gy - top - 6) / 14)
      const cols = Math.max(3, Math.floor((w - 8) / 13))
      const gap = (w - cols * 7) / (cols + 1)
      for (let rr = 0; rr < rows; rr++) {
        const wy = top + 6 + rr * 14
        for (let c = 0; c < cols; c++) {
          const wx = Math.round(x + gap + c * (7 + gap))
          win(wx, wy, 7, 9, f)
          if (r() < 0.2) put('#c9d2e8', wx + 1, wy + 10, 5, 3) // AC unit
        }
        if (r() < 0.45) {
          // balcony railing across part of the floor
          const bx = Math.round(x + gap - 2)
          const bw = Math.min(w - 8, Math.round((7 + gap) * 2))
          put(f.trim, bx, wy + 11, bw, 1)
          for (let k = 0; k < bw; k += 3) put(f.trim, bx + k, wy + 11, 1, 3)
          put(f.trim, bx, wy + 14, bw, 1)
        }
      }
      // fire escape on the right
      const ex = x + w - 12
      for (let wy = top + 14; wy < gy; wy += 14) {
        put(INK, ex, wy, 11, 1)
        for (let k = 0; k < 11; k += 2) put(INK, ex + k, wy - 3, 1, 3)
      }
      put(INK, x + 6, gy, 14, 20)
      put('#22304a', x + 7, gy + 1, 12, 19)
      put(pick(GLASS_LIT), x + 7, gy + 1, 12, 4)
    } else if (kind === 'ramen') {
      put('#2a1a14', x + 3, top, w - 4, h) // dark wood
      for (let xx = x + 6; xx < x + w; xx += 5) put('#20130e', xx, top, 1, h, 0.8)
      put(f.trim, x - 2, top - 3, w + 4, 3)
      win(x + 10, top + 8, w - 20, 10, f)
      for (let k = 0; k < 4; k++) put('#20130e', x + 10, top + 9 + k * 2, w - 20, 1, 0.5) // blinds
      // glowing doorway + noren curtains
      put('#ffcf8a', x + 8, gy, w - 16, 20, 0.85)
      put('#ffcf8a', x + 4, gy - 4, w - 8, 26, 0.12)
      const nc = pick(FABRIC)
      for (let k = 0; k < w - 16; k += 6) put(nc, x + 8 + k, gy, 5, 9)
      // lanterns
      for (const lx of [x + 4, x + w - 8]) {
        put('#ff3a3a', lx - 2, gy - 4, 8, 10, 0.18)
        put('#e0262f', lx, gy - 2, 4, 6)
        put('#ff8a6a', lx + 1, gy - 1, 1, 4)
        put(INK, lx + 1, gy - 4, 2, 2)
      }
      // vertical neon blade sign
      const nc2 = pick(NEON)
      put(nc2, x + w - 1, top + 4, 7, 32, 0.2)
      put(nc2, x + w, top + 5, 5, 30)
      for (let k = top + 7; k < top + 33; k += 5) put(INK, x + w + 1, k, 3, 2, 0.7)
    } else {
      // garage / workshop
      put(f.trim, x - 1, top - 2, w + 2, 2)
      const dw = Math.floor(w * 0.58)
      put(INK, x + 5, top + 14, dw + 2, h - 14)
      for (let yy = top + 15; yy < base; yy += 3) put(yy % 6 === 0 ? '#5c6480' : '#4a5270', x + 6, yy, dw, 2)
      win(x + dw + 12, top + 18, 10, 10, f)
      put(pick(NEON), x + 8, top + 6, dw - 6, 4, 0.9)
    }

    // Realism passes: moonlit top edge, drainpipe, darker toward the street.
    put('#b8a0e8', x, top, w, 1, 0.22)
    if (r() < 0.5) {
      put(f.dark, x + w - 5, top, 2, h)
      put(f.trim, x + w - 5, top, 1, h, 0.35)
    }
    for (let k = 0; k < 3; k++) put('#05040c', x, base - 6 * (k + 1), w, 6, 0.08)
    if (kind === 'shop' || kind === 'ramen') put('#ffcf8a', x + 4, base, w - 8, 4, 0.1)
    if (kind === 'brownstone' || kind === 'apartment') {
      put('#ffe6a8', x + 2, gy + 2, 2, 3) // wall lamp
      put('#ffe6a8', x - 1, gy - 1, 8, 9, 0.12)
    }

    if (r() < 0.45) trees.push(x + Math.floor(w * 0.6))
    if (r() < 0.25) props.push({ kind: 'bin', x: x + 6 })
    if (r() < 0.12) props.push({ kind: 'hydrant', x: x + w - 10 })
    x += w
  }

  // Streetlights at a steady rhythm along the whole street (with a little jitter).
  for (let lx = 18; lx < W; lx += 52 + Math.floor(r() * 10)) lamps.push(lx)

  // Sidewalk with curb + slab joints
  put('#1c142a', 0, base, W, H - base)
  put('#3a2e4e', 0, base, W, 1)
  for (let xx = 0; xx < W; xx += 24) put('#140e20', xx, base + 1, 1, H - base)
  put('#0e0a16', 0, H - 4, W, 4)

  return (
    <g>
      {ops.map((o, i) => (
        <path key={i} d={o.d} fill={o.c} opacity={o.op} />
      ))}
      {/* Street lamps with light cones */}
      {lamps.map((lx) => (
        <g key={`l${lx}`}>
          <path d={`M${lx + 4} ${base - 30}h4L${lx + 16} ${base}h-20Z`} fill="#ffd98a" opacity={0.1} />
          <path d={rects([[lx, base - 34, 2, 34], [lx, base - 34, 7, 2]])} fill={INK} />
          <path d={rects([[lx + 5, base - 32, 3, 2]])} fill="#fff1c9" />
          <path d={disc(lx + 6, base - 31, 5)} fill="#ffd98a" opacity={0.16} />
        </g>
      ))}
      {/* Trees: layered canopy with highlights */}
      {trees.map((tx, i) => (
        <g key={`t${i}`}>
          <path d={rects([[tx, base - 14, 2, 14]])} fill="#2a1a12" />
          <path d={disc(tx + 1, base - 18, 8) + disc(tx - 5, base - 14, 6) + disc(tx + 7, base - 14, 6)} fill="#163a34" />
          <path d={disc(tx - 1, base - 21, 4) + disc(tx + 5, base - 17, 3)} fill="#22524a" />
          <path d={dots([[tx - 3, base - 23], [tx + 3, base - 22], [tx + 6, base - 19]], 2, 1)} fill="#2f6a5e" />
        </g>
      ))}
      {props.map((p, i) =>
        p.kind === 'bin' ? (
          <path key={`p${i}`} d={rects([[p.x, base - 9, 7, 9], [p.x - 1, base - 10, 9, 2]])} fill="#2e3a40" />
        ) : (
          <path key={`p${i}`} d={rects([[p.x, base - 8, 4, 8], [p.x - 1, base - 6, 6, 2], [p.x + 1, base - 10, 2, 2]])} fill="#c6223f" />
        ),
      )}
    </g>
  )
}

/** Neon skyline (2x resolution) behind a street of houses; shared by Echo City and the rooftops. */
function NeonSkyline({ uid, variant }: { uid: string; variant: 'purple' | 'rain' }) {
  useGrid()
  const purple = variant === 'purple'
  // Clear night, smooth gradient: deep violet overhead to purple at the horizon.
  const stops = purple
    ? ['#110526', '#1b0938', '#270d4a', '#35125a', '#441867', '#561f72']
    : ['#04070f', '#071021', '#0b1832', '#112142', '#172a52', '#1e335e']
  const haze = purple ? '#3a2468' : '#212d4e'
  return (
    <>
      <NightSky uid={uid} stops={stops} horizon={300} glow={purple ? '#c850b0' : '#3a7ab0'} />
      <NightStars
        seed={purple ? 3 : 9}
        n={170}
        maxY={250}
        sparkles={purple ? [[300, 92, 6], [276, 120, 4], [322, 150, 5], [282, 168, 3], [560, 104, 4]] : [[420, 80, 5], [452, 120, 4], [396, 140, 3]]}
      />
      <CrescentMoon uid={uid} cx={purple ? 470 : 110} cy={62} r={10} />
      {/* One thin wisp, lit from below */}
      <g opacity={0.7}>
        <CloudStrip seed={44} y={150} thick={4} amp={5} color={purple ? '#22164a' : '#0b1430'} under={purple ? '#5a3a8e' : '#2a4a7a'} drift={360} />
      </g>
      <Traffic seed={5} n={8} y0={120} y1={190} speed={80} />
      {/* Far towers, hazy */}
      <NeonCity seed={7} base={300} minH={60} maxH={170} minW={12} maxW={30} gap={2} occupancy={0.12} ribbons={0.35} rims={false}
        pal={purple
          ? { body: '#2c2260', side: '#271d56', rimA: '#22e4ff', rimB: '#ff2bd6', win: '#33296c', lit: ['#d2c2f0', '#a8c8f0', '#e6b8e8'], detail: '#241b50' }
          : { body: '#18244a', side: '#141f42', rimA: '#22e4ff', rimB: '#ff2bd6', win: '#1d2b55', lit: ['#c0c8e8', '#9fd8f0', '#d0b0f0'], detail: '#121c3c' }} />
      <Haze color={haze} opacity={0.4} />
      {/* Hero layer: tall glowing ribbon towers */}
      <NeonCity seed={23} base={312} minH={70} maxH={240} minW={18} maxW={44} gap={3} occupancy={0.2} signs={0.25} ribbons={0.75}
        pal={purple
          ? { body: '#1a1240', side: '#140e34', rimA: '#22e4ff', rimB: '#ff2bd6', win: '#231a52', lit: ['#ffcf8a', '#8fe0ff', '#ff8fd0'], detail: '#0f0a28' }
          : { body: '#0b1128', side: '#080d1f', rimA: '#22e4ff', rimB: '#ff2bd6', win: '#121a3a', lit: ['#ffd36b', '#7fe8ff', '#ff6fd0'], detail: '#060a1a' }} />
      {/* Ground fog at the foot of the towers */}
      <rect x={0} y={286} width={W} height={34} fill={purple ? '#5a3a9a' : '#2a3a6a'} opacity={0.14} />
      <rect x={0} y={300} width={W} height={20} fill={purple ? '#7a4ab0' : '#33467a'} opacity={0.1} />
      <StreetGlow y={316} colors={purple ? ['#ff5fb0', '#b45cff'] : ['#22e4ff', '#b45cff']} />
      <RailBridge y={238} color={purple ? '#0c0416' : '#04070f'} light="#ffd98a" accent={purple ? '#ff2bd6' : '#22e4ff'} />
      {/* Street level in front */}
      <Houses seed={purple ? 61 : 83} base={344} />
      {!purple && <Rain seed={77} n={420} />}
    </>
  )
}

/** Thin diagonal rain streaks. */
function Rain({ seed, n }: { seed: number; n: number }) {
  useGrid()
  const pts = scatter(seed, n, 0, W, 0, H)
  const d = pts.map(([x, y]) => `M${x} ${y}h1v3h-1Z`).join('')
  return <path d={d} fill="#9fd8ff" opacity={0.28} className="scene-rain" />
}

// ── Building blocks ──────────────────────────────────────────────────────────

// ── Scenes ───────────────────────────────────────────────────────────────────

type SceneFn = (uid: string) => ReactNode

const SCENES: Record<string, SceneFn> = {
  /** Echo City: purple neon skyline behind a street of houses (hi-res). */
  'echo-dusk': (uid) => <NeonSkyline uid={uid} variant="purple" />,
}

/** Scenes drawn at 2x resolution (640x360) for finer detail. */
const HI_RES = new Set(['echo-dusk'])

export type SceneId = keyof typeof SCENES

/**
 * Memoised: a scene is thousands of shapes, and the room page re-renders 4x a
 * second for its timers. Props are primitives, so it only rebuilds when the
 * scene (or class) actually changes.
 */
export const PixelScene = memo(function PixelScene({ scene, className }: { scene: string; className?: string }) {
  const uid = useId().replace(/[:]/g, '')
  const id = SCENES[scene] ? scene : 'echo-dusk'
  const scale = HI_RES.has(id) ? 2 : 1
  // Scene functions call helpers directly (needs W/H now); child components
  // read the same size from GridContext when they render.
  const grid = { w: 320 * scale, h: 180 * scale }
  W = grid.w
  H = grid.h
  const content = SCENES[id](uid)
  return (
    <svg
      viewBox={`0 0 ${grid.w} ${grid.h}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className={`pixel pointer-events-none h-full w-full ${className ?? ''}`}
      aria-hidden
    >
      <GridContext.Provider value={grid}>{content}</GridContext.Provider>
    </svg>
  )
})

/**
 * Full-screen scene behind an app page, dimmed just enough for glass panels
 * on top to read. Sits under the page content (z-0); give content z-10.
 */
export const SceneBackdrop = memo(function SceneBackdrop({ scene, dim = 'medium' }: { scene: string; dim?: 'light' | 'medium' | 'strong' }) {
  const overlay = {
    light: 'from-[#070915]/30 via-[#070915]/10 to-[#070915]/50',
    medium: 'from-[#070915]/55 via-[#070915]/30 to-[#070915]/70',
    strong: 'from-[#070915]/75 via-[#070915]/55 to-[#070915]/85',
  }[dim]
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <PixelScene scene={scene} />
      <div className={`absolute inset-0 bg-gradient-to-b ${overlay}`} />
    </div>
  )
})
