/**
 * Rule-based AI players (the default — no paid AI calls).
 *
 *  - Clues: hand-written hint lists for every word in the Echo City word list.
 *  - Votes / SUS: score each player by SUS taps + how badly their clues fit
 *    the bot's own word (a clue not in that word's hint list looks suspicious).
 *  - Last guess: the caught Glitch picks the word whose hints overlap most
 *    with the heroes' clues.
 *  - Chat: short personality lines built from the bot's current suspect.
 *
 * Pure functions (randomness passed in) so they are easy to test.
 */

import { LOCATIONS, normalizeWord, type Personality } from './data'

/** One-word hints per secret word. Never contains the word itself. */
export const HINTS: Record<string, string[]> = {
  pigeon: ['feathers', 'coo', 'bird', 'crumbs', 'statue', 'flock'],
  billboard: ['advert', 'huge', 'poster', 'highway', 'glowing', 'slogan'],
  'water tower': ['tank', 'wooden', 'roof', 'tall', 'pipes', 'storage'],
  'neon sign': ['glow', 'pink', 'buzzing', 'tubes', 'open', 'shop'],
  chimney: ['smoke', 'bricks', 'soot', 'roof', 'sweep', 'fireplace'],
  'pizza box': ['cardboard', 'delivery', 'greasy', 'slice', 'square', 'cheese'],
  taxi: ['yellow', 'meter', 'fare', 'driver', 'hail', 'cab'],
  subway: ['tunnel', 'underground', 'tracks', 'platform', 'commute', 'rush'],
  'hot dog': ['mustard', 'bun', 'cart', 'sausage', 'ketchup', 'vendor'],
  pretzel: ['twisted', 'salty', 'knot', 'baked', 'snack', 'mustard'],
  skyscraper: ['tall', 'glass', 'floors', 'office', 'elevator', 'tower'],
  bridge: ['river', 'cables', 'span', 'cross', 'steel', 'toll'],
  streetlight: ['lamp', 'pole', 'glow', 'night', 'corner', 'bulb'],
  mailbox: ['letters', 'stamp', 'post', 'blue', 'slot', 'delivery'],
  ramen: ['noodles', 'broth', 'bowl', 'chopsticks', 'steam', 'slurp'],
  arcade: ['coins', 'joystick', 'games', 'highscore', 'tokens', 'retro'],
  train: ['tracks', 'carriage', 'station', 'whistle', 'commute', 'rails'],
  elevator: ['buttons', 'floors', 'lift', 'doors', 'cables', 'music'],
  graffiti: ['spray', 'wall', 'tag', 'paint', 'mural', 'colorful'],
  fountain: ['water', 'coins', 'splash', 'plaza', 'wish', 'statue'],
  skylight: ['ceiling', 'glass', 'sunlight', 'roof', 'stars', 'open'],
  window: ['glass', 'pane', 'view', 'curtain', 'frame', 'sill'],
  antenna: ['signal', 'metal', 'roof', 'radio', 'mast', 'reception'],
  'satellite dish': ['signal', 'round', 'tv', 'roof', 'channels', 'orbit'],
  'fire escape': ['stairs', 'metal', 'zigzag', 'emergency', 'outside', 'ladder'],
  ladder: ['rungs', 'climb', 'steps', 'tall', 'lean', 'rooftop'],
  bus: ['stop', 'route', 'ticket', 'seats', 'double', 'driver'],
  tram: ['rails', 'cable', 'bell', 'street', 'electric', 'stop'],
  alley: ['narrow', 'dark', 'bins', 'shortcut', 'backstreet', 'cats'],
  street: ['road', 'traffic', 'sidewalk', 'corner', 'name', 'cars'],
  hotel: ['lobby', 'rooms', 'checkin', 'keycard', 'suite', 'guests'],
  apartment: ['flat', 'rent', 'neighbors', 'floor', 'keys', 'home'],
  'rooftop bar': ['cocktails', 'view', 'drinks', 'music', 'evening', 'skyline'],
  nightclub: ['dance', 'music', 'lights', 'bouncer', 'late', 'dj'],
  drone: ['buzzing', 'propellers', 'remote', 'camera', 'fly', 'delivery'],
  helicopter: ['rotor', 'pad', 'loud', 'hover', 'pilot', 'blades'],
  hologram: ['projected', 'futuristic', 'glowing', '3d', 'light', 'virtual'],
  crosswalk: ['stripes', 'pedestrian', 'zebra', 'beep', 'signal', 'curb'],
  'traffic light': ['red', 'green', 'amber', 'stop', 'junction', 'signal'],
  rooftop: ['summit', 'view', 'edge', 'sky', 'flat', 'high'],
  terrace: ['patio', 'plants', 'outdoor', 'balcony', 'chairs', 'view'],
  searchlight: ['beam', 'sky', 'sweep', 'bright', 'signal', 'spot'],
  spotlight: ['stage', 'beam', 'focus', 'bright', 'attention', 'show'],
  gargoyle: ['stone', 'creature', 'gothic', 'ledge', 'wings', 'spout'],
  statue: ['stone', 'bronze', 'park', 'pose', 'monument', 'pigeons'],
  avenue: ['wide', 'trees', 'road', 'main', 'shops', 'straight'],
  boulevard: ['wide', 'trees', 'grand', 'road', 'stroll', 'promenade'],
  skyline: ['silhouette', 'towers', 'view', 'outline', 'horizon', 'city'],
  horizon: ['distance', 'sunset', 'line', 'far', 'edge', 'dawn'],
  penthouse: ['luxury', 'top', 'view', 'rich', 'suite', 'expensive'],
  loft: ['open', 'industrial', 'bricks', 'attic', 'studio', 'spacious'],
  neon: ['glow', 'gas', 'pink', 'tubes', 'bright', 'buzz'],
  led: ['tiny', 'bright', 'screen', 'diode', 'colors', 'strip'],
  metro: ['tunnel', 'line', 'station', 'map', 'underground', 'card'],
  downtown: ['center', 'busy', 'offices', 'core', 'crowds', 'heart'],
  midtown: ['middle', 'offices', 'between', 'busy', 'district', 'center'],
  smog: ['pollution', 'haze', 'grey', 'cough', 'exhaust', 'thick'],
  fog: ['mist', 'grey', 'damp', 'thick', 'morning', 'haze'],
}

const FLAVOR = LOCATIONS[0].flavor

// Look-ups use the game's normalised form (e.g. "Bus" -> "bu"), so index by it.
const BY_NORMAL = new Map(Object.entries(HINTS).map(([w, h]) => [normalizeWord(w), h]))

function hintsFor(word: string): string[] {
  return BY_NORMAL.get(normalizeWord(word)) ?? []
}

const used = (clues: string[]) => new Set(clues.map(normalizeWord))

/** A hero bot's clue: an unused hint for its word. The Glitch bot echoes the theme. */
export function ruleClue(word: string, cluesSoFar: string[], rnd: () => number): string {
  const taken = used(cluesSoFar)
  const pool = word ? hintsFor(word) : []
  const fresh = pool.filter((h) => !taken.has(normalizeWord(h)))
  if (fresh.length) return cap(fresh[Math.floor(rnd() * fresh.length)])
  if (!word) {
    // Glitch: find the words whose hints match the clues so far, and borrow a
    // related hint, so the bluff sounds plausible.
    const guess = ruleGuess(cluesSoFar, () => 0.5)
    const near = hintsFor(guess).filter((h) => !taken.has(normalizeWord(h)))
    if (near.length && cluesSoFar.length) return cap(near[Math.floor(rnd() * near.length)])
  }
  const flavor = FLAVOR.filter((f) => !taken.has(normalizeWord(f)))
  return cap((flavor.length ? flavor : FLAVOR)[Math.floor(rnd() * (flavor.length || FLAVOR.length))])
}

export interface Candidate {
  id: string
  clues: string[]
  /** SUS taps on this player from everyone else. */
  sus: number
}

/** How suspicious each candidate looks to a bot holding `word` ('' = the Glitch). */
export function suspicion(word: string, c: Candidate): number {
  let score = c.sus * 1.2
  if (word) {
    const fits = new Set(hintsFor(word).map(normalizeWord))
    for (const clue of c.clues) {
      if (clue === '…') score += 1 // a pass is a little suspicious
      else if (!fits.has(normalizeWord(clue))) score += 1.5
    }
  }
  return score
}

/**
 * Pick who to vote for / tap SUS on. Heroes go after the worst-fitting clues;
 * the Glitch deflects onto whoever is already most suspected (never itself).
 */
export function rulePick(word: string, candidates: Candidate[], rnd: () => number): string {
  const scored = candidates.map((c) => ({ id: c.id, s: (word ? suspicion(word, c) : c.sus * 1.2) + rnd() * 0.9 }))
  scored.sort((a, b) => b.s - a.s)
  return scored[0].id
}

/** The caught Glitch's last guess: the word whose hints overlap the heroes' clues most. */
export function ruleGuess(clues: string[], rnd: () => number): string {
  const said = used(clues)
  let best: Array<string> = []
  let bestScore = -1
  for (const [word, hints] of Object.entries(HINTS)) {
    const score = hints.filter((h) => said.has(normalizeWord(h))).length
    if (score > bestScore) {
      bestScore = score
      best = [word]
    } else if (score === bestScore) best.push(word)
  }
  return cap(best[Math.floor(rnd() * best.length)] ?? 'Neon')
}

// Grammar helpers so lines also read right when the target is the guest ("You").
const isYou = (t: string) => t === 'You'
const subj = (t: string) => (isYou(t) ? 'you' : t)
const poss = (t: string) => (isYou(t) ? 'your' : `${t}'s`)
const is = (t: string) => (isYou(t) ? 'you are' : `${t} is`)
const upper = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

const OPENERS: Record<Personality, Array<(target: string) => string>> = {
  cautious: [
    (t) => `Hmm, ${poss(t)} clue didn't quite fit for me.`,
    (t) => `Not sure yet... ${isYou(t) ? 'your clue' : t} felt a little off?`,
    (t) => `I might be wrong, but I'm watching ${subj(t)}.`,
  ],
  chatty: [
    (t) => `Okay okay, everyone look at ${poss(t)} clue for a second.`,
    (t) => `I'm getting weird vibes from ${subj(t)}, honestly.`,
    (t) => `Am I the only one who thinks ${is(t)} bluffing?`,
  ],
  bold: [
    (t) => `It's ${subj(t)}. That clue made no sense.`,
    (t) => `${upper(is(t))} the Glitch. Calling it now.`,
    (t) => `Vote ${subj(t)}. Easy.`,
  ],
}

const DEFENSES: Record<Personality, string[]> = {
  cautious: ['Me? My clue fit the word, I promise.', 'I was just being careful with my hint!'],
  chatty: ['Whoa, not me! I literally gave a solid clue.', "Nope, wrong hero. I'm on your side!"],
  bold: ['Not me. Look somewhere else.', "Wasn't me. My clue was spot on."],
}

/** The bot's first line when discussion opens. */
export function ruleOpener(personality: Personality, targetAlias: string, rnd: () => number): string {
  const lines = OPENERS[personality] ?? OPENERS.cautious
  return lines[Math.floor(rnd() * lines.length)](targetAlias)
}

/** A reply when a human mentions the bot: defend, then point at its suspect. */
export function ruleReply(personality: Personality, targetAlias: string | null, rnd: () => number): string {
  const defense = (DEFENSES[personality] ?? DEFENSES.cautious)[Math.floor(rnd() * 2)]
  if (!targetAlias) return defense
  return `${defense} ${isYou(targetAlias) ? 'Honestly, you worry' : `${targetAlias} worries`} me more.`
}

function cap(w: string): string {
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : w
}
