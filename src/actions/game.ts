/**
 * Echo City game engine — every write to game state happens here.
 *
 * Each export is a server action reachable at POST /api/actions/<name> with
 * the player's bearer token. IMPORTANT: action `tools` run with RBAC OFF
 * (they can read/write any row), so every action does its own checks:
 * is the caller seated, is it the right phase, is it their turn, are they
 * the host, etc. If you add an action, add its checks first.
 *
 * Phase flow:  lobby -> draw -> clues -> discuss -> vote -> (lastguess) -> reveal -> draw ...
 *
 * Timers: the server stores `phaseEndsAt`. Clients show the countdown and call
 * `advance` when it reaches zero; `advance` re-checks the clock on the server.
 * Several clients will call it at once, so every transition first takes a
 * lock (see takeLock) and only the winner performs it.
 */

import type { ActionContext, ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  DIFFICULTIES,
  LOCATIONS,
  MAX_BOTS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODES,
  PERSONALITIES,
  TIMERS,
  botId,
  botNumber,
  getLocation,
  isBotId,
  makeAlias,
  normalizeWord,
  pick,
  shuffle,
  type Difficulty,
  type Mode,
} from '../game/data'
import type { Assignment, Clue, Game, Player, RoundResult, Secret, Stats, Vote } from '../game/types'
import { botClue, botLastGuess, botVote, clueLeaksWord, generateWordPair, narrate as narrateSpeech } from '../game/ai'

type Ctx = ActionContext<Env>
type Row<T> = { id: string; data: T }

// ── Small helpers ───────────────────────────────────────────────────────────

const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })
const fail = (error: string): ActionResult<never> => ({ success: false, error })

/** Wrap a handler so an unexpected throw becomes a clean error result. */
function action(fn: (ctx: Ctx) => Promise<ActionResult<unknown>>): ActionHandler<Env> {
  return async (ctx) => {
    try {
      return await fn(ctx)
    } catch (err) {
      console.error('[game action] failed:', err)
      return fail('Something went wrong. Try again.')
    }
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

async function getGame(tools: ActionTools, gameId: string): Promise<Row<Game> | null> {
  if (!gameId) return null
  const r = await tools.get<Game & Record<string, unknown>>('games', gameId)
  return r.success ? { id: r.data.record.recordId, data: r.data.record.data } : null
}

async function queryRows<T>(tools: ActionTools, collection: string, where: Record<string, unknown>, limit = 100): Promise<Row<T>[]> {
  const r = await tools.query<T & Record<string, unknown>>(collection, { where, limit })
  if (!r.success) throw new Error(`query ${collection} failed: ${r.error}`)
  return r.data.records.map((rec) => ({ id: rec.recordId, data: rec.data as T }))
}

const listPlayers = (tools: ActionTools, gameId: string) => queryRows<Player>(tools, 'players', { gameId })

async function getSecret(tools: ActionTools, gameId: string, round: number): Promise<Secret | null> {
  const rows = await queryRows<Secret>(tools, 'secrets', { gameId, round }, 1)
  return rows[0]?.data ?? null
}

/**
 * Idempotency lock. `locks.key` is unique, so when several requests race to
 * perform the same transition exactly one `create` succeeds. Returns true for
 * the winner only.
 */
async function takeLock(tools: ActionTools, key: string): Promise<boolean> {
  const r = await tools.create('locks', { key })
  return r.success
}

/** Common preamble: load the game + players and require the caller to be seated. */
async function loadSeated(ctx: Ctx) {
  const gameId = str(ctx.params.gameId)
  const game = await getGame(ctx.tools, gameId)
  if (!game) return { ok: false as const, error: fail('Room not found.') }
  const players = await listPlayers(ctx.tools, gameId)
  const me = players.find((p) => p.data.userId === ctx.userId)
  if (!me) return { ok: false as const, error: fail('You are not seated in this room.') }
  return { ok: true as const, gameId, game, players, me }
}

const turnDuration = (playerId: string) => (isBotId(playerId) ? TIMERS.botTurn : TIMERS.clueTurn)
const currentTurnPlayer = (g: Game) => g.turnOrder[g.turnIndex % g.turnOrder.length]

async function displayName(tools: ActionTools, userId: string): Promise<string> {
  // Actions read full user rows (email included) — we only ever take `name`.
  const r = await tools.get<{ name?: string }>('users', userId)
  return (r.success && r.data.record.data.name) || 'Hero'
}

// ── Room setup ──────────────────────────────────────────────────────────────

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O to avoid confusion with 1/0

/** Host creates a room. Params: mode, difficulty. AI players are added later in the lobby. */
const createRoom = action(async ({ userId, params, tools }) => {
  const mode = str(params.mode) as Mode
  const difficulty = str(params.difficulty) as Difficulty
  if (!(mode in MODES)) return fail('Unknown mode.')
  if (!(difficulty in DIFFICULTIES)) return fail('Unknown difficulty.')

  // Try a few random codes; `games.code` is unique so a clash just fails the create.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = Array.from({ length: 4 }, () => pick(CODE_LETTERS.split(''))).join('')
    const game: Game = {
      code,
      hostId: userId,
      status: 'lobby',
      mode,
      difficulty,
      round: 0,
      drawerId: '',
      drawHistory: [],
      location: '',
      recentLocations: [],
      category: '',
      turnOrder: [],
      turnIndex: 0,
      totalTurns: 0,
      phaseEndsAt: 0,
      drawnAt: 0,
      usedWords: [],
      result: null,
    }
    const created = await tools.create('games', game as unknown as Record<string, unknown>)
    if (!created.success) continue
    const gameId = created.data.recordId
    await tools.create('players', { gameId, userId, alias: makeAlias([]), isBot: false, personality: '', score: 0, votedRound: 0 })
    return ok({ gameId, code })
  }
  return fail('Could not allocate a room code. Try again.')
})

/** Join by 4-letter code. Idempotent: re-joining returns your existing seat. */
const joinRoom = action(async ({ userId, params, tools }) => {
  const code = str(params.code).toUpperCase()
  if (!/^[A-Z]{4}$/.test(code)) return fail('Room codes are 4 letters.')
  const games = await queryRows<Game>(tools, 'games', { code }, 1)
  const game = games[0]
  if (!game) return fail('No room with that code.')
  const players = await listPlayers(tools, game.id)
  if (players.some((p) => p.data.userId === userId)) return ok({ gameId: game.id, code })
  if (game.data.status !== 'lobby' && game.data.status !== 'reveal') {
    return fail('An episode is in progress. Join when it ends.')
  }
  if (players.length >= MAX_PLAYERS) return fail('This room is full.')
  const alias = makeAlias(players.map((p) => p.data.alias))
  const r = await tools.create('players', { gameId: game.id, userId, alias, isBot: false, personality: '', score: 0, votedRound: 0 })
  // A unique-constraint failure here means a double-click already seated us.
  if (!r.success && !(await listPlayers(tools, game.id)).some((p) => p.data.userId === userId)) {
    return fail('Could not join the room.')
  }
  return ok({ gameId: game.id, code })
})

/**
 * Host adds an AI player (lobby or between episodes). Each bot gets its own id
 * "bot:<gameId>:<n>", alias, avatar (seeded by that id) and personality.
 */
const addBot = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { gameId, game, players } = s
  if (game.data.hostId !== ctx.userId) return fail('Only the host can add AI players.')
  if (game.data.status !== 'lobby' && game.data.status !== 'reveal') return fail('Add AI players between episodes.')
  const bots = players.filter((p) => p.data.isBot)
  if (bots.length >= MAX_BOTS) return fail(`At most ${MAX_BOTS} AI players.`)
  if (players.length >= MAX_PLAYERS) return fail('This room is full.')

  const n = Math.max(0, ...bots.map((b) => botNumber(b.data.userId))) + 1
  // Rotate personalities so a table of bots is a mix, not three of the same.
  const personality = PERSONALITIES[(n - 1) % PERSONALITIES.length]
  const r = await ctx.tools.create('players', {
    gameId,
    userId: botId(gameId, n),
    alias: makeAlias(players.map((p) => p.data.alias)),
    isBot: true,
    personality,
    score: 0,
    votedRound: 0,
  })
  if (!r.success) return fail('Could not add an AI player. Try again.')
  return ok({})
})

/** Host removes one AI player. Params: gameId, botUserId. */
const removeBot = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { game, players } = s
  if (game.data.hostId !== ctx.userId) return fail('Only the host can remove AI players.')
  if (game.data.status !== 'lobby' && game.data.status !== 'reveal') return fail('Remove AI players between episodes.')
  const bot = players.find((p) => p.data.userId === str(ctx.params.botUserId) && p.data.isBot)
  if (!bot) return fail('That AI player is not in this room.')
  await ctx.tools.remove('players', bot.id)
  return ok({})
})

/** Lets clients line their countdowns up with the server clock. */
const serverTime = action(async () => ok({ now: Date.now() }))

// ── Round start + the hat draw ──────────────────────────────────────────────

/** Host starts the next episode (from the lobby or the reveal screen). */
const startRound = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { gameId, game, players } = s
  const g = game.data
  if (g.hostId !== ctx.userId) return fail('Only the host can start an episode.')
  if (g.status !== 'lobby' && g.status !== 'reveal') return fail('An episode is already running.')
  if (players.length < MIN_PLAYERS) return fail(`Need at least ${MIN_PLAYERS} players (the bot counts).`)

  const round = g.round + 1
  if (!(await takeLock(ctx.tools, `${gameId}:${round}:start`))) return fail('Already started.')

  // Drawer rotation: random among players who haven't drawn this cycle.
  const ids = players.map((p) => p.data.userId)
  let history = (g.drawHistory ?? []).filter((id) => ids.includes(id))
  let eligible = ids.filter((id) => !history.includes(id))
  if (eligible.length === 0) {
    history = []
    eligible = ids
  }
  const drawerId = pick(eligible)

  await ctx.tools.update('games', gameId, {
    status: 'draw',
    round,
    drawerId,
    drawHistory: [...history, drawerId],
    phaseEndsAt: Date.now() + (isBotId(drawerId) ? TIMERS.botDraw : TIMERS.draw),
    location: '',
    category: '',
    turnOrder: [],
    turnIndex: 0,
    totalTurns: 0,
    drawnAt: 0,
    result: null,
  })
  return ok({ round })
})

/** The Drawer taps "Draw a chit". The tap only *triggers* the draw — the server picks. */
const drawChit = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  if (s.game.data.status !== 'draw') return fail('Not drawing right now.')
  if (s.game.data.drawerId !== ctx.userId) return fail('It is not your turn to draw.')
  return performDraw(ctx.tools, s.game, s.players)
})

/**
 * Picks tonight's location (server-random, avoiding the last 3), generates the
 * word pair, secretly chooses the villain (and detective), deals private cards
 * and opens the clue phase.
 */
async function performDraw(tools: ActionTools, game: Row<Game>, players: Row<Player>[]): Promise<ActionResult<unknown>> {
  const g = game.data
  if (!(await takeLock(tools, `${game.id}:${g.round}:draw`))) return fail('Already drawn.')

  const recent = (g.recentLocations ?? []).slice(-3)
  const location = pick(LOCATIONS.filter((l) => !recent.includes(l.id)))
  const { pair } = await generateWordPair(tools, location, g.difficulty, g.usedWords ?? [])
  // Randomly decide which word heroes get so the "harder" word isn't always the decoy.
  const [wordA, wordB] = Math.random() < 0.5 ? pair : [pair[1], pair[0]]

  const ids = players.map((p) => p.data.userId)
  const villainId = pick(ids)
  let detectiveId = ''
  if (g.mode === 'detective') {
    // Any non-villain can be the Detective, including an AI player.
    detectiveId = pick(ids.filter((id) => id !== villainId))
  }

  await tools.create('secrets', { gameId: game.id, round: g.round, villainId, detectiveId, wordA, wordB })

  // Each assignment is owned by one player, so only that player's browser receives it.
  await Promise.all(
    ids.map((ownerId) => {
      const isVillain = ownerId === villainId
      let shownRole: Assignment['shownRole'] = 'unknown'
      let word = isVillain ? wordB : wordA
      if (g.mode === 'blind') {
        shownRole = isVillain ? 'villain' : 'hero'
        word = isVillain ? '' : wordA
      } else if (g.mode === 'detective' && ownerId === detectiveId) {
        shownRole = 'detective'
      }
      const row: Assignment = {
        gameId: game.id,
        round: g.round,
        ownerId,
        shownRole,
        word,
        category: location.name,
        scanTargetId: '',
        scanResult: '',
      }
      return tools.create('assignments', row as unknown as Record<string, unknown>)
    }),
  )

  const turnOrder = shuffle(ids)
  const now = Date.now()
  await tools.update('games', game.id, {
    status: 'clues',
    location: location.id,
    category: location.name,
    recentLocations: [...(g.recentLocations ?? []), location.id].slice(-5),
    usedWords: [...(g.usedWords ?? []), wordA, wordB].slice(-60),
    turnOrder,
    turnIndex: 0,
    totalTurns: turnOrder.length * DIFFICULTIES[g.difficulty].laps,
    drawnAt: now,
    phaseEndsAt: now + TIMERS.cardReveal + turnDuration(turnOrder[0]),
  })
  return ok({ location: location.id })
}

// ── Clues ───────────────────────────────────────────────────────────────────

/** The current player submits a one-word clue. Params: gameId, text. */
const submitClue = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { gameId, game } = s
  const g = game.data
  if (g.status !== 'clues') return fail('Not the clue phase.')
  if (currentTurnPlayer(g) !== ctx.userId) return fail('It is not your turn.')

  const text = str(ctx.params.text)
  if (!/^[A-Za-z][A-Za-z'-]{0,23}$/.test(text)) return fail('One word only (letters, up to 24).')

  const mine = await queryRows<Assignment>(ctx.tools, 'assignments', { gameId, round: g.round, ownerId: ctx.userId }, 1)
  if (clueLeaksWord(text, mine[0]?.data.word ?? '')) return fail("Your clue can't contain your own word.")

  if (!(await takeLock(ctx.tools, `${gameId}:${g.round}:clue:${g.turnIndex}`))) return fail('Turn already taken.')
  await ctx.tools.create('clues', { gameId, round: g.round, turn: g.turnIndex, playerId: ctx.userId, text })
  await advanceTurn(ctx.tools, game)
  return ok({})
})

/** Move to the next clue turn, or into discussion after the last lap. */
async function advanceTurn(tools: ActionTools, game: Row<Game>) {
  const g = game.data
  const next = g.turnIndex + 1
  if (next >= g.totalTurns) {
    await tools.update('games', game.id, { status: 'discuss', phaseEndsAt: Date.now() + TIMERS.discuss })
    return
  }
  const nextPlayer = g.turnOrder[next % g.turnOrder.length]
  await tools.update('games', game.id, { turnIndex: next, phaseEndsAt: Date.now() + turnDuration(nextPlayer) })
}

/** Load one AI player's own assignment. Each bot only ever sees its own row. */
async function botAssignment(tools: ActionTools, game: Row<Game>, botUserId: string): Promise<Row<Assignment> | undefined> {
  return (await queryRows<Assignment>(tools, 'assignments', { gameId: game.id, round: game.data.round, ownerId: botUserId }, 1))[0]
}

/**
 * A bot's clue turn, or a human's timed-out turn (recorded as a pass).
 * Bots go one at a time: each bot turn has a short timer (TIMERS.botTurn),
 * and clients call `advance` when it expires, which lands here.
 */
async function autoClue(tools: ActionTools, game: Row<Game>, players: Row<Player>[]): Promise<ActionResult<unknown>> {
  const g = game.data
  if (!(await takeLock(tools, `${game.id}:${g.round}:clue:${g.turnIndex}`))) return fail('Turn already taken.')
  const playerId = currentTurnPlayer(g)
  const seat = players.find((p) => p.data.userId === playerId)
  let text = '…'
  if (seat?.data.isBot) {
    const location = getLocation(g.location) ?? LOCATIONS[0]
    const [mine, clues] = await Promise.all([
      botAssignment(tools, game, playerId),
      queryRows<Clue>(tools, 'clues', { gameId: game.id, round: g.round }),
    ])
    // A bot Detective uses its scan on its first clue turn.
    if (mine && mine.data.shownRole === 'detective' && !mine.data.scanResult) {
      await botScan(tools, game, players, mine)
    }
    text = await botClue(tools, {
      name: seat.data.alias,
      personality: seat.data.personality || 'cautious',
      word: mine?.data.word ?? '',
      location,
      cluesSoFar: clues.map((c) => c.data.text).filter((t) => t !== '…'),
    })
  }
  await tools.create('clues', { gameId: game.id, round: g.round, turn: g.turnIndex, playerId, text })
  await advanceTurn(tools, game)
  return ok({})
}

/** Bot Detective: scan a random other player; the answer goes into the bot's own row only. */
async function botScan(tools: ActionTools, game: Row<Game>, players: Row<Player>[], mine: Row<Assignment>) {
  if (!(await takeLock(tools, `${game.id}:${game.data.round}:scan`))) return
  const secret = await getSecret(tools, game.id, game.data.round)
  const target = pick(players.filter((p) => p.data.userId !== mine.data.ownerId)).data.userId
  await tools.update('assignments', mine.id, {
    scanTargetId: target,
    scanResult: target === secret?.villainId ? 'villain' : 'hero',
  })
}

// ── Discussion & voting ─────────────────────────────────────────────────────

/** Host skips the rest of the discussion. */
const skipDiscussion = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  if (s.game.data.hostId !== ctx.userId) return fail('Only the host can skip.')
  if (s.game.data.status !== 'discuss') return fail('Not in discussion.')
  return startVote(ctx.tools, s.game, s.players)
})

async function startVote(tools: ActionTools, game: Row<Game>, players: Row<Player>[]): Promise<ActionResult<unknown>> {
  const g = game.data
  if (!(await takeLock(tools, `${game.id}:${g.round}:vote`))) return fail('Vote already started.')
  await tools.update('games', game.id, { status: 'vote', phaseEndsAt: Date.now() + TIMERS.vote })

  // AI players vote one at a time, each using only its own word (and scan, if Detective).
  const location = getLocation(g.location) ?? LOCATIONS[0]
  const clues = await queryRows<Clue>(tools, 'clues', { gameId: game.id, round: g.round })
  for (const bot of players.filter((p) => p.data.isBot)) {
    const mine = await botAssignment(tools, game, bot.data.userId)
    let candidates = players
      .filter((p) => p.data.userId !== bot.data.userId)
      .map((p) => ({
        id: p.data.userId,
        alias: p.data.alias,
        clues: clues.filter((c) => c.data.playerId === p.data.userId).map((c) => c.data.text),
      }))
    let targetId: string | null = null
    if (mine?.data.scanResult === 'villain') targetId = mine.data.scanTargetId
    else if (mine?.data.scanResult === 'hero') candidates = candidates.filter((c) => c.id !== mine.data.scanTargetId)
    if (!targetId && candidates.length) {
      targetId = await botVote(tools, {
        name: bot.data.alias,
        personality: bot.data.personality || 'cautious',
        word: mine?.data.word ?? '',
        location,
        candidates,
      })
    }
    if (targetId) await recordVote(tools, game, players, bot.data.userId, targetId)
  }
  return ok({})
}

/** Player votes. Params: gameId, targetId. One vote per round, enforced by `votes.uniqueOn`. */
const castVote = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { game, players } = s
  if (game.data.status !== 'vote') return fail('Voting is closed.')
  const targetId = str(ctx.params.targetId)
  if (targetId === ctx.userId) return fail("You can't vote for yourself.")
  if (!players.some((p) => p.data.userId === targetId)) return fail('That player is not in this room.')
  return recordVote(ctx.tools, game, players, ctx.userId, targetId)
})

async function recordVote(
  tools: ActionTools,
  game: Row<Game>,
  players: Row<Player>[],
  voterId: string,
  targetId: string,
): Promise<ActionResult<unknown>> {
  const g = game.data
  const vote: Vote = { gameId: game.id, round: g.round, voterId, targetId }
  const created = await tools.create('votes', vote as unknown as Record<string, unknown>)
  if (!created.success) return fail('You already voted.')
  // Public marker: everyone sees *that* you voted, never *who* you voted for.
  const seat = players.find((p) => p.data.userId === voterId)
  if (seat) await tools.update('players', seat.id, { votedRound: g.round })

  // End early once everyone has voted.
  const votes = await queryRows<Vote>(tools, 'votes', { gameId: game.id, round: g.round })
  if (votes.length >= players.length) await resolveVotes(tools, game, players)
  return ok({})
}

/** Count votes. The villain is caught only by a strict majority of votes cast with no tie. */
function tallyVotes(votes: Row<Vote>[]) {
  const tally: Record<string, number> = {}
  const byVoter: Record<string, string> = {}
  for (const v of votes) {
    tally[v.data.targetId] = (tally[v.data.targetId] ?? 0) + 1
    byVoter[v.data.voterId] = v.data.targetId
  }
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1])
  const [top, second] = sorted
  const accusedId = top && (!second || top[1] > second[1]) && top[1] > votes.length / 2 ? top[0] : null
  return { tally, byVoter, accusedId }
}

async function resolveVotes(tools: ActionTools, game: Row<Game>, players: Row<Player>[]): Promise<ActionResult<unknown>> {
  const g = game.data
  if (!(await takeLock(tools, `${game.id}:${g.round}:resolve`))) return fail('Already resolved.')
  const [votes, secret] = await Promise.all([
    queryRows<Vote>(tools, 'votes', { gameId: game.id, round: g.round }),
    getSecret(tools, game.id, g.round),
  ])
  if (!secret) return fail('Round data missing.')
  const { accusedId } = tallyVotes(votes)

  if (accusedId === secret.villainId && g.mode === 'blind') {
    // Caught — but the blind villain gets one last guess at the heroes' word.
    if (isBotId(secret.villainId)) {
      const location = getLocation(g.location) ?? LOCATIONS[0]
      const clues = await queryRows<Clue>(tools, 'clues', { gameId: game.id, round: g.round })
      const guess = await botLastGuess(tools, {
        location,
        clues: clues.filter((c) => c.data.playerId !== secret.villainId).map((c) => c.data.text),
      })
      return finalize(tools, game, players, guess)
    }
    await tools.update('games', game.id, { status: 'lastguess', phaseEndsAt: Date.now() + TIMERS.lastGuess })
    return ok({})
  }
  return finalize(tools, game, players, null)
}

/** The caught blind villain's last guess. Params: gameId, guess. */
const lastGuess = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const g = s.game.data
  if (g.status !== 'lastguess') return fail('No last guess right now.')
  const secret = await getSecret(ctx.tools, s.gameId, g.round)
  if (secret?.villainId !== ctx.userId) return fail('Only the villain can guess.')
  const guess = str(ctx.params.guess).slice(0, 40)
  if (!guess) return fail('Type a guess.')
  return finalize(ctx.tools, s.game, s.players, guess)
})

// ── Reveal, points and stats ────────────────────────────────────────────────

const POINTS = { heroWin: 100, correctVote: 50, villainWin: 200 }

/**
 * Publishes the result and updates scores + lifetime stats. Guarded by the
 * `final` lock, so stats are counted exactly once per round.
 */
async function finalize(
  tools: ActionTools,
  game: Row<Game>,
  players: Row<Player>[],
  guess: string | null,
): Promise<ActionResult<unknown>> {
  const g = game.data
  if (!(await takeLock(tools, `${game.id}:${g.round}:final`))) return fail('Already finished.')
  const [votes, secret] = await Promise.all([
    queryRows<Vote>(tools, 'votes', { gameId: game.id, round: g.round }),
    getSecret(tools, game.id, g.round),
  ])
  if (!secret) return fail('Round data missing.')
  const { tally, byVoter, accusedId } = tallyVotes(votes)

  let winner: RoundResult['winner'] = 'villain'
  let reason: RoundResult['reason'] = 'escaped'
  if (accusedId === secret.villainId) {
    const stole = g.mode === 'blind' && guess !== null && normalizeWord(guess) === normalizeWord(secret.wordA)
    winner = stole ? 'villain' : 'heroes'
    reason = stole ? 'stole' : 'caught'
  }

  const points: Record<string, number> = {}
  for (const p of players) {
    const id = p.data.userId
    const isVillain = id === secret.villainId
    let pts = 0
    if (isVillain && winner === 'villain') pts += POINTS.villainWin
    if (!isVillain && winner === 'heroes') pts += POINTS.heroWin
    if (!isVillain && byVoter[id] === secret.villainId) pts += POINTS.correctVote
    points[id] = pts
  }

  const result: RoundResult = {
    villainId: secret.villainId,
    detectiveId: secret.detectiveId || null,
    wordA: secret.wordA,
    wordB: g.mode === 'blind' ? '' : secret.wordB,
    accusedId,
    winner,
    reason,
    guess,
    votes: byVoter,
    tally,
    points,
  }

  await Promise.all(players.map((p) => tools.update('players', p.id, { score: (p.data.score ?? 0) + points[p.data.userId] })))
  await Promise.all(
    players
      .filter((p) => !p.data.isBot)
      .map((p) => updateStats(tools, p.data.userId, secret, winner, byVoter[p.data.userId], points[p.data.userId])),
  )
  await tools.update('games', game.id, { status: 'reveal', phaseEndsAt: 0, result })
  return ok({})
}

async function updateStats(
  tools: ActionTools,
  userId: string,
  secret: Secret,
  winner: RoundResult['winner'],
  votedFor: string | undefined,
  pts: number,
) {
  const isVillain = userId === secret.villainId
  const isDetective = userId === secret.detectiveId
  const heroesWon = winner === 'heroes'
  const existing = (await queryRows<Stats>(tools, 'stats', { userId }, 1))[0]
  const s: Stats = existing?.data ?? {
    userId,
    name: await displayName(tools, userId),
    gamesPlayed: 0,
    heroGames: 0,
    heroWins: 0,
    villainGames: 0,
    villainWins: 0,
    detectiveGames: 0,
    detectiveWins: 0,
    votesCast: 0,
    votesCorrect: 0,
    points: 0,
  }
  const next: Stats = {
    ...s,
    gamesPlayed: s.gamesPlayed + 1,
    heroGames: s.heroGames + (isVillain ? 0 : 1),
    heroWins: s.heroWins + (!isVillain && heroesWon ? 1 : 0),
    villainGames: s.villainGames + (isVillain ? 1 : 0),
    villainWins: s.villainWins + (isVillain && !heroesWon ? 1 : 0),
    detectiveGames: s.detectiveGames + (isDetective ? 1 : 0),
    detectiveWins: s.detectiveWins + (isDetective && heroesWon ? 1 : 0),
    votesCast: s.votesCast + (votedFor ? 1 : 0),
    votesCorrect: s.votesCorrect + (votedFor === secret.villainId ? 1 : 0),
    points: s.points + pts,
  }
  if (existing) await tools.update('stats', existing.id, next as unknown as Record<string, unknown>)
  else await tools.create('stats', next as unknown as Record<string, unknown>)
}

// ── Timer-driven progress ───────────────────────────────────────────────────

/**
 * Called by clients when the on-screen countdown hits zero. The server
 * re-checks its own clock, then performs whatever the expired phase needs.
 * Safe to call many times at once — locks make each transition happen once.
 */
const advance = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { game, players } = s
  const g = game.data
  // 1s tolerance for small client/server clock differences.
  if (!g.phaseEndsAt || Date.now() < g.phaseEndsAt - 1000) return fail('Not yet.')
  switch (g.status) {
    case 'draw':
      return performDraw(ctx.tools, game, players)
    case 'clues':
      return autoClue(ctx.tools, game, players)
    case 'discuss':
      return startVote(ctx.tools, game, players)
    case 'vote':
      return resolveVotes(ctx.tools, game, players)
    case 'lastguess':
      return finalize(ctx.tools, game, players, null)
    default:
      return fail('Nothing to advance.')
  }
})

// ── Detective scan ──────────────────────────────────────────────────────────

/**
 * Once per round the Detective scans one player. The answer is written only to
 * the Detective's own (read: 'own') assignment row, so no other browser gets it.
 */
const scan = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { gameId, game, players } = s
  const g = game.data
  if (g.mode !== 'detective') return fail('No detective in this mode.')
  if (g.status !== 'clues' && g.status !== 'discuss') return fail('You can scan during clues or discussion.')
  const secret = await getSecret(ctx.tools, gameId, g.round)
  if (!secret || secret.detectiveId !== ctx.userId) return fail('Only the Detective can scan.')
  const targetId = str(ctx.params.targetId)
  if (targetId === ctx.userId || !players.some((p) => p.data.userId === targetId)) return fail('Pick another player.')
  if (!(await takeLock(ctx.tools, `${gameId}:${g.round}:scan`))) return fail('You already used your scan.')

  const scanResult = targetId === secret.villainId ? 'villain' : 'hero'
  const mine = await queryRows<Assignment>(ctx.tools, 'assignments', { gameId, round: g.round, ownerId: ctx.userId }, 1)
  if (mine[0]) await ctx.tools.update('assignments', mine[0].id, { scanTargetId: targetId, scanResult })
  return ok({ scanResult })
})

// ── Narrator ────────────────────────────────────────────────────────────────

/**
 * ElevenLabs narration of the result. Only allowed during the reveal, and at
 * most once per player per round (keeps TTS spend bounded).
 */
const narrate = action(async (ctx) => {
  const s = await loadSeated(ctx)
  if (!s.ok) return s.error
  const { gameId, game, players } = s
  const g = game.data
  if (g.status !== 'reveal' || !g.result) return fail('Nothing to narrate yet.')
  if (!(await takeLock(ctx.tools, `${gameId}:${g.round}:narrate:${ctx.userId}`))) return fail('Already narrated.')

  const r = g.result
  const alias = (id: string | null) => players.find((p) => p.data.userId === id)?.data.alias ?? 'no one'
  let text: string
  if (r.reason === 'caught') {
    text = `Episode ${g.round} is over. The villain was ${alias(r.villainId)}! The heroes' word was ${r.wordA}${
      r.wordB ? `, and the villain's word was ${r.wordB}` : ''
    }. Echo City is safe... for tonight.`
  } else if (r.reason === 'stole') {
    text = `The heroes unmasked ${alias(r.villainId)}... but the villain guessed the word, ${r.wordA}! The villain steals the night.`
  } else {
    text = `The heroes accused ${alias(r.accusedId)}. But the real villain was ${alias(r.villainId)}${
      r.wordB ? `, hiding behind the word ${r.wordB}` : ''
    }. Darkness falls on Echo City.`
  }
  const audio = await narrateSpeech(ctx.tools, text)
  return ok({ audio })
})

export const gameActions: Record<string, ActionHandler<Env>> = {
  createRoom,
  joinRoom,
  addBot,
  removeBot,
  serverTime,
  startRound,
  drawChit,
  submitClue,
  skipDiscussion,
  castVote,
  lastGuess,
  advance,
  scan,
  narrate,
}
