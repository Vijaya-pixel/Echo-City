/**
 * /stats — your profile: level + XP, a key-stats strip (with leaderboard rank),
 * Hero vs Glitch win-rate rings, vote accuracy, and the league table.
 *
 * `stats` rows are written only by the server at the end of each round
 * (guarded by the round's `final` lock, so nothing is double-counted).
 */

import { useAuth, useQuery } from 'deepspace'
import type { Stats } from '@/game/types'
import { SceneBackdrop } from '@/components/game/PixelScene'

const pctNum = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null)
const pct = (num: number, den: number) => {
  const v = pctNum(num, den)
  return v === null ? '—' : `${v}%`
}

/** Levels from points: every 250 points is a level, with a title every few levels. */
const XP_PER_LEVEL = 250
const TITLES = ['Rookie', 'Patrol', 'Agent', 'Vigilante', 'Guardian', 'Legend']
function levelOf(points: number) {
  const level = Math.floor(points / XP_PER_LEVEL) + 1
  return { level, into: points % XP_PER_LEVEL, title: TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))] }
}

const card = 'rounded-2xl bg-[#120e2c]/95 ring-1 ring-white/[0.07] shadow-[0_18px_40px_-20px_rgb(0_0_0/0.8)]'

export default function StatsPage() {
  const { userId } = useAuth()
  const { records, status } = useQuery<Stats>('stats', { orderBy: 'points', orderDir: 'desc', limit: 100 })
  const rank = records.findIndex((r) => r.data.userId === userId)
  const mine = rank >= 0 ? records[rank].data : undefined

  return (
    <div className="relative min-h-full">
      <SceneBackdrop scene="echo-dusk" dim="strong" />
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        {status === 'loading' ? (
          <p className="py-10 text-center text-muted-foreground">Loading your record…</p>
        ) : !mine ? (
          <section className={`${card} p-8 text-center`}>
            <h1 className="text-lg text-foreground">NO RECORD YET</h1>
            <p className="mt-2 text-muted-foreground">Finish your first round and your stats show up here.</p>
          </section>
        ) : (
          <>
            <Header s={mine} />
            <KeyStats s={mine} rank={rank + 1} of={records.length} />
            <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <Roles s={mine} />
              <Votes s={mine} />
            </div>
          </>
        )}
        <Leaderboard records={records} userId={userId} loading={status === 'loading'} />
      </div>
    </div>
  )
}

function Header({ s }: { s: Stats }) {
  const { level, into, title } = levelOf(s.points)
  return (
    <section className={`${card} flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between`}>
      <div className="min-w-0">
        <div className="eyebrow">Case file</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="truncate text-3xl text-foreground sm:text-4xl">{s.name.toUpperCase()}</h1>
          <span
            className="px-3 py-1 font-display text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#1e2f9e]"
            style={{ background: 'linear-gradient(-45deg, transparent 6px, #dfe6ff 6.5px)' }}
          >
            LV {level} · {title}
          </span>
        </div>
      </div>
      <div className="w-full sm:w-80">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-muted-foreground">Next level</span>
          <span className="tabular-nums text-foreground">
            {into} / {XP_PER_LEVEL} XP
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-hero shadow-[0_0_12px_var(--color-hero)] transition-[width] duration-700" style={{ width: `${(into / XP_PER_LEVEL) * 100}%` }} />
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">{XP_PER_LEVEL - into} XP to level {level + 1}</div>
      </div>
    </section>
  )
}

function KeyStats({ s, rank, of }: { s: Stats; rank: number; of: number }) {
  const wins = s.heroWins + s.villainWins
  const items = [
    { label: 'Rounds', value: s.gamesPlayed },
    { label: 'Wins', value: wins },
    { label: 'Win rate', value: pct(wins, s.gamesPlayed) },
    { label: 'Points', value: s.points },
    { label: `Rank of ${of}`, value: `#${rank}`, accent: true },
  ]
  return (
    <section className={`${card} grid grid-cols-2 divide-white/10 sm:grid-cols-5 sm:divide-x`}>
      {items.map((it) => (
        <div key={it.label} className="px-5 py-4">
          <div className="text-sm text-muted-foreground">{it.label}</div>
          <div className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${it.accent ? 'text-hero' : 'text-foreground'}`}>{it.value}</div>
        </div>
      ))}
    </section>
  )
}

/** Glowing win-rate ring. */
function Ring({ value, color }: { value: number | null; color: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const v = value ?? 0
  return (
    <svg viewBox="0 0 84 84" width={96} height={96} className="shrink-0" aria-hidden>
      <circle cx={42} cy={42} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={8} />
      <circle
        cx={42}
        cy={42}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform="rotate(-90 42 42)"
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 700ms ease' }}
      />
      <text x={42} y={47} textAnchor="middle" fontSize={16} fontWeight={800} fill="#eef1ff" fontFamily="var(--font-display)">
        {value === null ? '—' : `${v}%`}
      </text>
    </svg>
  )
}

function Roles({ s }: { s: Stats }) {
  const sides = [
    { name: 'Hero', color: 'var(--color-hero)', games: s.heroGames, wins: s.heroWins },
    { name: 'Glitch', color: 'var(--color-villain)', games: s.villainGames, wins: s.villainWins },
  ]
  return (
    <section className={`${card} p-5`}>
      <h2 className="mb-4 text-xs text-foreground">WIN RATE BY ROLE</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {sides.map((side) => (
          <div key={side.name} className="flex items-center gap-4 rounded-xl bg-white/[0.03] p-3">
            <Ring value={pctNum(side.wins, side.games)} color={side.color} />
            <div>
              <div className="font-display text-sm font-extrabold uppercase tracking-[0.1em]" style={{ color: side.color }}>
                As {side.name}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                <span className="text-lg font-semibold tabular-nums text-foreground">{side.wins}</span> wins
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="text-lg font-semibold tabular-nums text-foreground">{side.games}</span> rounds
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Votes({ s }: { s: Stats }) {
  const acc = pctNum(s.votesCorrect, s.votesCast)
  return (
    <section className={`${card} flex flex-col p-5`}>
      <h2 className="mb-4 text-xs text-foreground">VOTE ACCURACY</h2>
      <div className="font-display text-5xl font-extrabold tabular-nums text-lime">{acc === null ? '—' : `${acc}%`}</div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-lime shadow-[0_0_12px_var(--color-lime)] transition-[width] duration-700" style={{ width: `${acc ?? 0}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Caught the Glitch <b className="text-foreground">{s.votesCorrect}</b> times in <b className="text-foreground">{s.votesCast}</b> votes.
      </p>
    </section>
  )
}

const MEDAL = ['#f3c454', '#c9d2e8', '#d08a52'] // gold, silver, bronze

function Leaderboard({ records, userId, loading }: { records: Array<{ recordId: string; data: Stats }>; userId: string | null; loading: boolean }) {
  return (
    <section className={`${card} p-5`}>
      <h2 className="mb-3 text-xs text-foreground">LEADERBOARD</h2>
      {records.length === 0 && !loading ? (
        <p className="text-muted-foreground">Nobody has finished a round yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-separate border-spacing-y-1 text-left">
            <thead className="text-sm text-muted-foreground">
              <tr>
                <th className="px-3 py-1 font-normal">Rank</th>
                <th className="px-3 py-1 font-normal">Player</th>
                <th className="px-3 py-1 text-right font-normal">Rounds</th>
                <th className="px-3 py-1 text-right font-normal">Hero win</th>
                <th className="px-3 py-1 text-right font-normal">Glitch win</th>
                <th className="px-3 py-1 text-right font-normal">Accuracy</th>
                <th className="px-3 py-1 text-right font-normal">Points</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const s = r.data
                const me = s.userId === userId
                const row = me ? 'bg-hero/15' : 'bg-white/[0.03]'
                return (
                  <tr key={r.recordId} className="transition-[filter] hover:brightness-125">
                    <td className={`rounded-l-xl px-3 py-2.5 ${row}`}>
                      <span
                        className="inline-grid h-7 w-7 place-items-center rounded-full font-display text-xs font-extrabold"
                        style={i < 3 ? { background: MEDAL[i], color: '#140f24', boxShadow: `0 0 10px -2px ${MEDAL[i]}` } : { color: '#a9b2de' }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 font-semibold ${row} ${me ? 'text-hero' : 'text-foreground'}`}>
                      {s.name}
                      {me && <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${row}`}>{s.gamesPlayed}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${row}`}>{pct(s.heroWins, s.heroGames)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${row}`}>{pct(s.villainWins, s.villainGames)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${row}`}>{pct(s.votesCorrect, s.votesCast)}</td>
                    <td className={`rounded-r-xl px-3 py-2.5 text-right font-display font-extrabold tabular-nums text-foreground ${row}`}>{s.points}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
