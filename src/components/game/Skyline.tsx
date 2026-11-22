/**
 * Parallax pixel skyline of Echo City (landing + lobby). Two building layers
 * scroll at different speeds; colors come from CSS classes in echo.css so
 * there are no hardcoded colors here. Deterministic, so it prerenders cleanly.
 */

function layer(seed: number, minH: number, maxH: number, windows: boolean) {
  let s = seed
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const blocks: Array<{ x: number; w: number; h: number; lit: Array<[number, number, boolean]> }> = []
  for (let x = 0; x < 320; ) {
    const w = 12 + Math.floor(rnd() * 20)
    const h = minH + Math.floor(rnd() * (maxH - minH))
    const lit: Array<[number, number, boolean]> = []
    if (windows) {
      for (let wy = 100 - h + 4; wy < 96; wy += 6)
        for (let wx = x + 3; wx < x + w - 3; wx += 5) if (rnd() < 0.22) lit.push([wx, wy, rnd() < 0.15])
    }
    blocks.push({ x, w, h, lit })
    x += w + 1 + Math.floor(rnd() * 3)
  }
  return blocks
}

const FAR = layer(7, 30, 70, false)
const NEAR = layer(42, 18, 55, true)
const STARS = Array.from({ length: 40 }, (_, i) => [(i * 73) % 320, (i * 37) % 40] as const)

function Layer({ blocks, className }: { blocks: ReturnType<typeof layer>; className: string }) {
  const svg = (
    <svg viewBox="0 0 320 100" preserveAspectRatio="none" shapeRendering="crispEdges" className="pixel" aria-hidden>
      {blocks.map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={100 - b.h} width={b.w} height={b.h} className={className} />
          {b.lit.map(([x, y, alt]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={2} height={2} className={alt ? 'sky-window-alt' : 'sky-window'} />
          ))}
        </g>
      ))}
    </svg>
  )
  // Two copies side by side so the scroll loops seamlessly.
  return (
    <>
      {svg}
      {svg}
    </>
  )
}

export function Skyline({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden ${className ?? 'h-64'}`} aria-hidden>
      <svg viewBox="0 0 320 100" preserveAspectRatio="none" shapeRendering="crispEdges" className="pixel absolute inset-0 h-full w-full">
        {STARS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} className="sky-star" />
        ))}
      </svg>
      <div className="skyline-layer" style={{ ['--speed' as string]: '160s' }}>
        <Layer blocks={FAR} className="sky-far" />
      </div>
      <div className="skyline-layer" style={{ ['--speed' as string]: '80s' }}>
        <Layer blocks={NEAR} className="sky-near" />
      </div>
    </div>
  )
}
