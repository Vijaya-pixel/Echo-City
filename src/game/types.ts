/**
 * Row shapes for every game collection. Used by both the server actions
 * (tools.query/get) and the client (useQuery<T>). Records arrive wrapped in
 * an envelope, so these fields live under `record.data`.
 */

import type { Difficulty, GameStatus, Mode, Personality } from './data'

/** Public: one room ("a night in Echo City"). */
export interface Game {
  code: string
  hostId: string
  status: GameStatus
  mode: Mode
  difficulty: Difficulty
  round: number
  /** Who scans for tonight's location this round. */
  drawerId: string
  /** Ids that have already drawn in the current rotation cycle. */
  drawHistory: string[]
  location: string
  recentLocations: string[]
  /** Category text the blind villain sees (= location name). */
  category: string
  turnOrder: string[]
  turnIndex: number
  /** Total clue turns this round (players x laps). */
  totalTurns: number
  /** Server clock (ms) when the current phase/turn expires. */
  phaseEndsAt: number
  /** Server clock (ms) when the chit was drawn (drives the synced unfold animation). */
  drawnAt: number
  usedWords: string[]
  /** Filled only at the reveal. Until then nothing secret is public. */
  result: RoundResult | null
}

export interface RoundResult {
  villainId: string
  wordA: string
  accusedId: string | null
  winner: 'heroes' | 'villain'
  reason: 'caught' | 'escaped' | 'stole'
  guess: string | null
  /** voterId -> targetId, published only now. */
  votes: Record<string, string>
  tally: Record<string, number>
  points: Record<string, number>
}

/** Public: a seat in a room. */
export interface Player {
  gameId: string
  userId: string
  alias: string
  isBot: boolean
  /** AI players only: shapes how the bot plays (passed into its Claude prompts). */
  personality: Personality | ''
  /** Running score in this room. */
  score: number
  /** Round number of this player's latest vote (lets everyone see who has voted, not for whom). */
  votedRound: number
}

/**
 * PRIVATE (read: 'own'): what one player is allowed to know this round.
 * In classic mode nobody's row says "villain" — the villain isn't told.
 */
export interface Assignment {
  gameId: string
  round: number
  ownerId: string
  /** 'hero' (has the word) or 'villain' (the Glitch: knows it, has no word). */
  shownRole: 'hero' | 'villain'
  /** Empty for the blind villain. */
  word: string
  category: string
}

/** SERVER-ONLY (no client can read): the truth for a round. */
export interface Secret {
  gameId: string
  round: number
  villainId: string
  wordA: string
}

/** PRIVATE (read: 'own'): one vote. */
export interface Vote {
  gameId: string
  round: number
  voterId: string
  targetId: string
}

/** Public: one clue. */
export interface Clue {
  gameId: string
  round: number
  turn: number
  playerId: string
  text: string
}

/** Public, written directly by clients (author = server-stamped createdBy). */
export interface Chat {
  gameId: string
  round: number
  text: string
  /** Server-only: set when an AI player said this line (shown under its alias). */
  speakerId?: string
}

/** Public: lifetime stats per user. */
export interface Stats {
  userId: string
  name: string
  gamesPlayed: number
  heroGames: number
  heroWins: number
  villainGames: number
  villainWins: number
  votesCast: number
  votesCorrect: number
  points: number
}

/** Public, client-writable: one live "sus" tap (voter = voterId for AI players, else createdBy). */
export interface Sus {
  gameId: string
  round: number
  targetId: string
  voterId?: string
}
