/**
 * Echo City collections and their permissions.
 *
 * The security model in one paragraph:
 *  - Clients can READ the public game state but can never WRITE it
 *    (create/update/delete: false). Every change goes through a server
 *    action in src/actions/game.ts, which validates turn, phase and seat.
 *  - Secrets live in rows with `read: 'own'` + `ownerField: 'ownerId'`
 *    (assignments) or `ownerField: 'voterId'` (votes). The RecordRoom only
 *    sends a row to the browser whose user owns it, so other players' words,
 *    roles and votes never reach your WebSocket.
 *  - `secrets` (who the villain is, both words) and `locks` are readable by
 *    nobody. Only server actions (RBAC off) touch them.
 *  - Client-writable collections: `chats` (three fields, 200 characters) and
 *    `sus` (live suspicion taps: gameId, round, targetId). Their author is the
 *    server-stamped `createdBy`; a player may delete only their own sus tap.
 *    AI players' sus taps are written by server actions with `voterId` set.
 *
 * Note on `userBound`: the schema lint suggests `userBound: true` on owner
 * columns so a *client* can't claim someone else's id. Here no client can
 * create these rows at all, and the server must write rows owned by other
 * players (e.g. the host's action deals everyone's card), so it is omitted.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const text = (name: string, extra: Record<string, unknown> = {}) =>
  ({ name, storage: 'text' as const, interpretation: 'plain', ...extra })
const num = (name: string) => ({ name, storage: 'number' as const, interpretation: 'plain' })
const json = (name: string) => ({ name, storage: 'text' as const, interpretation: { kind: 'json' as const } })
const bool = (name: string) => ({ name, storage: 'number' as const, interpretation: { kind: 'boolean' as const } })

const NONE: RolePermissions = { read: false, create: false, update: false, delete: false }
/** Anyone signed in can read; only server actions write. */
const PUBLIC_READ_ONLY: Record<string, RolePermissions> = {
  viewer: NONE,
  member: { read: true, create: false, update: false, delete: false },
  admin: { read: true, create: false, update: false, delete: false },
}
/** Only the row's owner can read; only server actions write. */
const OWNER_READ_ONLY: Record<string, RolePermissions> = {
  viewer: NONE,
  member: { read: 'own', create: false, update: false, delete: false },
  // Admins (the app owner) get the same rule — no peeking at players' secrets.
  admin: { read: 'own', create: false, update: false, delete: false },
}
/** Nobody reads or writes from a browser. */
const SERVER_ONLY: Record<string, RolePermissions> = { viewer: NONE, member: NONE, admin: NONE }

export const gamesSchema: CollectionSchema = {
  name: 'games',
  columns: [
    text('code', { required: true }),
    text('hostId'),
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['lobby', 'draw', 'clues', 'discuss', 'vote', 'lastguess', 'reveal'] } },
    text('mode'),
    text('difficulty'),
    num('round'),
    text('drawerId'),
    json('drawHistory'),
    text('location'),
    json('recentLocations'),
    text('category'),
    json('turnOrder'),
    num('turnIndex'),
    num('totalTurns'),
    num('phaseEndsAt'),
    num('drawnAt'),
    json('usedWords'),
    json('result'),
  ],
  uniqueOn: ['code'],
  permissions: PUBLIC_READ_ONLY,
}

export const playersSchema: CollectionSchema = {
  name: 'players',
  columns: [text('gameId'), text('userId'), text('alias'), bool('isBot'), text('personality'), num('score'), num('votedRound')],
  uniqueOn: ['gameId', 'userId'],
  permissions: PUBLIC_READ_ONLY,
}

export const assignmentsSchema: CollectionSchema = {
  name: 'assignments',
  columns: [
    text('gameId'),
    num('round'),
    text('ownerId'),
    text('shownRole'),
    text('word'),
    text('category'),
  ],
  ownerField: 'ownerId',
  uniqueOn: ['gameId', 'round', 'ownerId'],
  permissions: OWNER_READ_ONLY,
}

export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [text('gameId'), num('round'), text('voterId'), text('targetId')],
  ownerField: 'voterId',
  // One vote per player per round, enforced by the database even if two
  // requests race.
  uniqueOn: ['gameId', 'round', 'voterId'],
  permissions: OWNER_READ_ONLY,
}

export const secretsSchema: CollectionSchema = {
  name: 'secrets',
  columns: [text('gameId'), num('round'), text('villainId'), text('wordA')],
  uniqueOn: ['gameId', 'round'],
  permissions: SERVER_ONLY,
}

export const cluesSchema: CollectionSchema = {
  name: 'clues',
  columns: [text('gameId'), num('round'), num('turn'), text('playerId'), text('text')],
  uniqueOn: ['gameId', 'round', 'turn'],
  permissions: PUBLIC_READ_ONLY,
}

export const chatsSchema: CollectionSchema = {
  name: 'chats',
  // speakerId is server-only (not in writableFields): set by bot chat actions.
  columns: [text('gameId', { required: true }), num('round'), text('text', { required: true, maxLength: 200 }), text('speakerId')],
  permissions: {
    viewer: NONE,
    member: { read: true, create: true, update: false, delete: false, writableFields: ['gameId', 'round', 'text'] },
    admin: { read: true, create: true, update: false, delete: true, writableFields: ['gameId', 'round', 'text'] },
  },
}

/** Live suspicion taps. Public counts; each player toggles their own. */
export const susSchema: CollectionSchema = {
  name: 'sus',
  columns: [text('gameId', { required: true }), num('round'), text('targetId', { required: true }), text('voterId')],
  permissions: {
    viewer: NONE,
    member: { read: true, create: true, update: false, delete: 'own', writableFields: ['gameId', 'round', 'targetId'] },
    admin: { read: true, create: true, update: false, delete: true, writableFields: ['gameId', 'round', 'targetId'] },
  },
}

export const statsSchema: CollectionSchema = {
  name: 'stats',
  columns: [
    text('userId'),
    text('name'),
    num('gamesPlayed'),
    num('heroGames'),
    num('heroWins'),
    num('villainGames'),
    num('villainWins'),
    num('votesCast'),
    num('votesCorrect'),
    num('points'),
  ],
  uniqueOn: ['userId'],
  permissions: PUBLIC_READ_ONLY,
}

/**
 * Idempotency locks. A phase transition first creates `{ key }`; the unique
 * constraint means exactly one concurrent caller succeeds and performs the
 * transition, everyone else gets "already handled". This is what stops two
 * clients whose timers hit zero together from resolving a vote twice (and
 * double-counting stats).
 */
export const locksSchema: CollectionSchema = {
  name: 'locks',
  columns: [text('key', { required: true })],
  uniqueOn: ['key'],
  permissions: SERVER_ONLY,
}

export const gameSchemas: CollectionSchema[] = [
  gamesSchema,
  playersSchema,
  assignmentsSchema,
  votesSchema,
  secretsSchema,
  cluesSchema,
  chatsSchema,
  susSchema,
  statsSchema,
  locksSchema,
]
