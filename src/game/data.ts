/**
 * Echo City — static game data shared by the server actions and the browser.
 *
 * Nothing in here is secret: it's the catalogue of locations, the fallback
 * word lists used when the AI is unavailable, and the hero-alias parts.
 * Which word a player actually got is decided per round by the server and
 * stored in permission-protected rows (see src/schemas/game-schemas.ts).
 */

export type Mode = 'classic' | 'blind' | 'detective'
export type Difficulty = 'rookie' | 'hero' | 'legend'
export type GameStatus = 'lobby' | 'draw' | 'clues' | 'discuss' | 'vote' | 'lastguess' | 'reveal'

/** A word pair: heroes get `a`, the villain gets `b` (classic/detective). */
export type WordPair = [string, string]

export interface Location {
  id: string
  name: string
  emoji: string
  /** 5 colors: sky-top, sky-bottom, far silhouette, near silhouette, accent. */
  palette: [string, string, string, string, string]
  /** Generic, safe clue words the bot can fall back on (never one of the pair words). */
  flavor: string[]
  /** Built-in fallback word pairs per difficulty (used when the AI call fails). */
  pairs: Record<Difficulty, WordPair[]>
}

export const LOCATIONS: Location[] = [
  {
    id: 'rooftops',
    name: 'Echo City Rooftops',
    emoji: '🌃',
    palette: ['#0b1030', '#2a1650', '#1a2148', '#0a0d22', '#ff3ea5'],
    flavor: ['skyline', 'night', 'wind', 'height', 'concrete', 'glow'],
    pairs: {
      rookie: [['Pigeon', 'Billboard'], ['Water Tower', 'Neon Sign'], ['Chimney', 'Pizza Box']],
      hero: [['Skylight', 'Window'], ['Antenna', 'Satellite Dish'], ['Fire Escape', 'Ladder']],
      legend: [['Rooftop', 'Terrace'], ['Searchlight', 'Spotlight'], ['Gargoyle', 'Statue']],
    },
  },
  {
    id: 'castle',
    name: 'The Castle',
    emoji: '🏰',
    palette: ['#1a0f2e', '#4a2340', '#3a3550', '#1c1a2a', '#ffcc33'],
    flavor: ['royal', 'stone', 'ancient', 'medieval', 'guard', 'banner'],
    pairs: {
      rookie: [['Dragon', 'Banquet'], ['Moat', 'Crown'], ['Knight', 'Tapestry']],
      hero: [['Throne', 'Crown'], ['Sword', 'Lance'], ['Tower', 'Dungeon']],
      legend: [['Shield', 'Armor'], ['King', 'Emperor'], ['Fortress', 'Citadel']],
    },
  },
  {
    id: 'beach',
    name: 'The Beach',
    emoji: '🏖️',
    palette: ['#ff9a5a', '#ffd38a', '#2f8fb8', '#e8c27a', '#ffffff'],
    flavor: ['sunny', 'salty', 'summer', 'sand', 'waves', 'relax'],
    pairs: {
      rookie: [['Sandcastle', 'Lifeguard'], ['Surfboard', 'Crab'], ['Umbrella', 'Seagull']],
      hero: [['Sandcastle', 'Seashell'], ['Wave', 'Tide'], ['Starfish', 'Jellyfish']],
      legend: [['Sunscreen', 'Sunblock'], ['Shore', 'Coast'], ['Dune', 'Sandbank']],
    },
  },
  {
    id: 'space',
    name: 'Space Station',
    emoji: '🛰️',
    palette: ['#05060f', '#111a3a', '#2a3366', '#8a93c2', '#3ee6ff'],
    flavor: ['orbit', 'zero-g', 'stars', 'metal', 'signal', 'vacuum'],
    pairs: {
      rookie: [['Astronaut', 'Solar Panel'], ['Rocket', 'Space Food'], ['Airlock', 'Telescope']],
      hero: [['Meteor', 'Comet'], ['Laser', 'Lightning'], ['Moon', 'Planet']],
      legend: [['Spaceship', 'Starship'], ['Orbit', 'Trajectory'], ['Galaxy', 'Nebula']],
    },
  },
  {
    id: 'carnival',
    name: 'Haunted Carnival',
    emoji: '🎪',
    palette: ['#14081f', '#3d1035', '#5a1f4a', '#1e0b1c', '#8cff5a'],
    flavor: ['spooky', 'lights', 'tickets', 'creepy', 'music', 'games'],
    pairs: {
      rookie: [['Clown', 'Popcorn'], ['Ferris Wheel', 'Ghost'], ['Cotton Candy', 'Mirror Maze']],
      hero: [['Carousel', 'Ferris Wheel'], ['Ghost', 'Skeleton'], ['Juggler', 'Magician']],
      legend: [['Phantom', 'Specter'], ['Ticket', 'Pass'], ['Fortune Teller', 'Psychic']],
    },
  },
  {
    id: 'temple',
    name: 'Jungle Temple',
    emoji: '🌴',
    palette: ['#0f2a1c', '#2d5a2a', '#3c6b34', '#16301b', '#ffcc33'],
    flavor: ['humid', 'hidden', 'vines', 'ancient', 'explore', 'gold'],
    pairs: {
      rookie: [['Snake', 'Treasure'], ['Vine', 'Idol'], ['Monkey', 'Torch']],
      hero: [['Map', 'Compass'], ['Trap', 'Pit'], ['Ruins', 'Statue']],
      legend: [['Jungle', 'Rainforest'], ['Relic', 'Artifact'], ['Altar', 'Shrine']],
    },
  },
  {
    id: 'underwater',
    name: 'Underwater Lab',
    emoji: '🫧',
    palette: ['#03203a', '#06456b', '#0b6e8a', '#04263d', '#3ee6ff'],
    flavor: ['deep', 'pressure', 'science', 'bubbles', 'glass', 'blue'],
    pairs: {
      rookie: [['Submarine', 'Microscope'], ['Octopus', 'Computer'], ['Shark', 'Test Tube']],
      hero: [['Diver', 'Snorkel'], ['Coral', 'Seaweed'], ['Dolphin', 'Whale']],
      legend: [['Oxygen Tank', 'Air Tank'], ['Porthole', 'Window'], ['Scientist', 'Researcher']],
    },
  },
  {
    id: 'arctic',
    name: 'Arctic Base',
    emoji: '❄️',
    palette: ['#1b2a4a', '#5a7aa8', '#c8daf0', '#8aa6cc', '#ffffff'],
    flavor: ['cold', 'white', 'frozen', 'wind', 'remote', 'north'],
    pairs: {
      rookie: [['Penguin', 'Radio'], ['Igloo', 'Snowmobile'], ['Polar Bear', 'Hot Cocoa']],
      hero: [['Blizzard', 'Avalanche'], ['Sled', 'Ski'], ['Glacier', 'Iceberg']],
      legend: [['Frost', 'Ice'], ['Parka', 'Coat'], ['Snowstorm', 'Whiteout']],
    },
  },
]

export function getLocation(id: string | null | undefined): Location | undefined {
  return LOCATIONS.find((l) => l.id === id)
}

// ── Modes & difficulty labels (UI copy) ─────────────────────────────────────

export const MODES: Record<Mode, { label: string; blurb: string }> = {
  classic: {
    label: 'Secret Word',
    blurb: 'The villain gets a close decoy word and does not know they are the villain.',
  },
  blind: {
    label: 'Blind Villain',
    blurb: 'The villain only knows the location. If caught, one last guess can steal the win.',
  },
  detective: {
    label: 'Detective',
    blurb: 'One hero secretly gets a single scan: villain or hero?',
  },
}

export const DIFFICULTIES: Record<Difficulty, { label: string; blurb: string; laps: number }> = {
  rookie: { label: 'Rookie', blurb: 'Clearly different words. One lap of clues.', laps: 1 },
  hero: { label: 'Hero', blurb: 'Related words. Two laps of clues.', laps: 2 },
  legend: { label: 'Legend', blurb: 'Near-synonyms. Two laps of clues.', laps: 2 },
}

// ── Timers (milliseconds) ───────────────────────────────────────────────────

export const TIMERS = {
  draw: 15_000, // drawer must tap within this, or the server auto-draws
  botDraw: 3_000, // a bot drawer "thinks" briefly, then draws
  cardReveal: 8_000, // grace time after the draw for the chit + secret card animations
  clueTurn: 30_000, // per human clue turn (then it auto-passes)
  botTurn: 3_000, // bots take turns one at a time with a short "thinking" pause
  discuss: 60_000,
  vote: 45_000,
  lastGuess: 30_000,
}

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 8

// ── Hero aliases & AI players ───────────────────────────────────────────────

/** Up to this many AI players per room. */
export const MAX_BOTS = 5

/** Each AI player has its own id, e.g. "bot:<gameId>:2". Real user ids never start with "bot:". */
export const botId = (gameId: string, n: number) => `bot:${gameId}:${n}`
export const isBotId = (id: string | null | undefined) => !!id && id.startsWith('bot:')
/** The <n> in "bot:<gameId>:<n>" (used to pick the next free number). */
export const botNumber = (id: string) => Number(id.split(':').pop()) || 0

export type Personality = 'cautious' | 'chatty' | 'bold'
export const PERSONALITIES: Personality[] = ['cautious', 'chatty', 'bold']

/** Passed into each bot's Claude prompts so they don't all play the same way. */
export const PERSONALITY_PROMPTS: Record<Personality, string> = {
  cautious: 'You are cautious: give safe, slightly vague clues and only accuse someone when the evidence is clear.',
  chatty: 'You are chatty and playful: give colorful, expressive clues and enjoy stirring up suspicion.',
  bold: 'You are bold: give sharp, specific clues and accuse confidently, even on a hunch.',
}

const ALIAS_PREFIX = [
  'Captain', 'Doctor', 'Agent', 'Lady', 'Night', 'Iron', 'Silver', 'Crimson',
  'Atomic', 'Quantum', 'Shadow', 'Thunder', 'Star', 'Neon', 'Mega', 'Professor',
]
const ALIAS_NOUN = [
  'Nova', 'Comet', 'Falcon', 'Volt', 'Blaze', 'Echo', 'Spark', 'Tempest',
  'Frost', 'Orbit', 'Pulse', 'Vortex', 'Raven', 'Titan', 'Ember', 'Flux',
]

/** Random alias like "Captain Nova", avoiding ones already taken in the room. */
export function makeAlias(taken: string[]): string {
  for (let i = 0; i < 50; i++) {
    const alias = `${pick(ALIAS_PREFIX)} ${pick(ALIAS_NOUN)}`
    if (!taken.includes(alias)) return alias
  }
  return `Hero ${taken.length + 1}`
}

/** Episode titles shown on the title cards between phases. */
export const EPISODE_TITLES: Record<GameStatus, string> = {
  lobby: 'THE LEAGUE ASSEMBLES',
  draw: 'THE DRAW',
  clues: 'THE CLUES',
  discuss: 'THE INTERROGATION',
  vote: 'THE VOTE',
  lastguess: 'THE LAST GAMBLE',
  reveal: 'THE TURNCOAT',
}

// ── Small helpers ───────────────────────────────────────────────────────────

/** Uniform random element. Uses crypto randomness (available in Workers + browsers). */
export function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)]
}

export function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % maxExclusive
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Lowercase, trim, strip punctuation and a trailing plural "s" for loose word matching. */
export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '')
}
