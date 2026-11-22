/**
 * /stats — your lifetime record plus the league leaderboard.
 * `stats` rows are written only by the server at the end of each round
 * (guarded by the round's `final` lock, so nothing is double-counted).
 */

import { useAuth, useQuery } from 'deepspace'
import type { Stats } from '@/game/types'
import { PixelAvatar } from '@/components/game/PixelAvatar'

const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—')

export default function StatsPage() {
  const { userId } = useAuth()
  const { records, status } = useQuery<Stats>('stats', { orderBy: 'points', orderDir: 'desc', limit: 100 })
  const mine = records.find((r) => r.data.userId === userId)?.data

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
      <h1 className="text-base text-hero sm:text-xl">CASE FILES</h1>

      <section className="px-panel px-panel-hero p-5">
        <div className="flex items-center gap-4">
          {userId && <PixelAvatar seed={userId} size={64} title="Your hero" />}
          <h2 className="text-xs text-foreground">YOUR RECORD</h2>
        </div>
        {status === 'loading' ? (
          <p className="mt-4 text-muted-foreground">Loading...</p>
        ) : !mine ? (
          <p className="mt-4 text-muted-foreground">No episodes played yet. Your stats appear after your first reveal.</p>
        ) : (
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="EPISODES" value={String(mine.gamesPlayed)} />
            <Stat label="HERO WIN" value={pct(mine.heroWins, mine.heroGames)} tone="text-hero" />
            <Stat label="VILLAIN WIN" value={pct(mine.villainWins, mine.villainGames)} tone="text-villain" />
            <Stat label="DETECTIVE WIN" value={pct(mine.detectiveWins, mine.detectiveGames)} tone="text-detective" />
            <Stat label="VOTE ACCURACY" value={pct(mine.votesCorrect, mine.votesCast)} tone="text-lime" />
            <Stat label="POINTS" value={String(mine.points)} tone="text-hero" />
          </dl>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs text-foreground">LEADERBOARD</h2>
        {records.length === 0 && status !== 'loading' ? (
          <p className="text-muted-foreground">Nobody has finished an episode yet.</p>
        ) : (
          <div className="px-panel overflow-x-auto p-2">
            <table className="w-full min-w-[560px] text-left">
              <thead className="font-display text-[10px] text-muted-foreground">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">HERO</th>
                  <th className="p-2">EPS</th>
                  <th className="p-2">HERO%</th>
                  <th className="p-2">VILL%</th>
                  <th className="p-2">DET%</th>
                  <th className="p-2">VOTE%</th>
                  <th className="p-2 text-right">PTS</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const s = r.data
                  return (
                    <tr key={r.recordId} className={`border-t-2 border-border ${s.userId === userId ? 'text-detective' : ''}`}>
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2">
                        <span className="flex items-center gap-2">
                          <PixelAvatar seed={s.userId} size={28} title={s.name} />
                          {s.name}
                        </span>
                      </td>
                      <td className="p-2">{s.gamesPlayed}</td>
                      <td className="p-2">{pct(s.heroWins, s.heroGames)}</td>
                      <td className="p-2">{pct(s.villainWins, s.villainGames)}</td>
                      <td className="p-2">{pct(s.detectiveWins, s.detectiveGames)}</td>
                      <td className="p-2">{pct(s.votesCorrect, s.votesCast)}</td>
                      <td className="p-2 text-right text-hero">{s.points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone = 'text-foreground' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border-4 border-border bg-background p-3">
      <dt className="font-display text-[8px] leading-relaxed text-muted-foreground">{label}</dt>
      <dd className={`mt-2 font-display text-sm ${tone}`}>{value}</dd>
    </div>
  )
}
