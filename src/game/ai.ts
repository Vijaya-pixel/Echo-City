/**
 * Server-side AI helpers. Called only from server actions.
 *
 * Every function here has a non-AI fallback: if Claude errors, times out or
 * returns junk, the game still continues using the built-in word lists and
 * simple bot behaviour. AI makes the game more varied; it is never required.
 */

import type { ActionTools } from 'deepspace/worker'
import { PERSONALITY_PROMPTS, normalizeWord, pick, shuffle, type Difficulty, type Location, type Personality, type WordPair } from './data'

/** System prompt for one AI player: name + personality, so bots play differently. */
function botSystem(name: string, personality: Personality, format: string): string {
  return `You are ${name}, a player in a family-friendly social deduction party game. ${PERSONALITY_PROMPTS[personality]} ${format}`
}

/** Current Haiku id from the installed SDK's DEEPSPACE_AI_MODELS catalogue. */
const MODEL = 'claude-haiku-5-5'

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
}

/** One Claude call -> plain text, or null on any failure. */
async function askClaude(tools: ActionTools, system: string, prompt: string, maxTokens = 120): Promise<string | null> {
  try {
    const result = await tools.integration<AnthropicResponse>('anthropic/chat-completion', {
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 1,
      system,
      messages: [{ role: 'user', content: prompt }],
    })
    if (!result.success) {
      console.warn('[ai] claude call failed:', result.error)
      return null
    }
    // Same defensive unwrap StoryNest uses, in case the body is wrapped.
    const wrapper = result.data as unknown as Record<string, unknown>
    const body = (wrapper && 'response' in wrapper ? wrapper.response : wrapper) as AnthropicResponse
    const text = body?.content?.[0]?.text?.trim()
    return text || null
  } catch (err) {
    console.warn('[ai] claude call threw:', err)
    return null
  }
}

/** Pull the first {...} JSON object out of a model reply. */
function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** A clean single word/short phrase: letters, spaces, hyphens, max 24 chars. */
function cleanWord(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const w = v.trim().replace(/[^A-Za-z -]/g, '').replace(/\s+/g, ' ')
  if (!w || w.length > 24 || w.split(' ').length > 2) return null
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const DIFFICULTY_RULES: Record<Difficulty, string> = {
  rookie: 'The two words must be CLEARLY DIFFERENT things (example: Cape vs Pizza).',
  hero: 'The two words must be RELATED but distinct (example: Laser vs Lightning).',
  legend: 'The two words must be NEAR-SYNONYMS that are very hard to tell apart (example: Shield vs Armor).',
}

/**
 * Word pair set in the drawn location. Tries Claude first; falls back to the
 * built-in list (skipping used words where possible).
 */
export async function generateWordPair(
  tools: ActionTools,
  location: Location,
  difficulty: Difficulty,
  usedWords: string[],
): Promise<{ pair: WordPair; source: 'ai' | 'fallback' }> {
  const used = new Set(usedWords.map(normalizeWord))
  const reply = await askClaude(
    tools,
    'You create word pairs for a family-friendly social deduction party game. Reply with strict JSON only, no prose.',
    [
      `Location: "${location.name}".`,
      'Give two common, concrete nouns (1-2 words each) that you would find at that location.',
      DIFFICULTY_RULES[difficulty],
      used.size ? `Do not use any of these: ${[...usedWords].slice(-40).join(', ')}.` : '',
      'Format: {"a": "<word>", "b": "<word>"}',
    ].join('\n'),
    80,
  )
  const obj = parseJsonObject(reply)
  const a = cleanWord(obj?.a)
  const b = cleanWord(obj?.b)
  if (a && b && normalizeWord(a) !== normalizeWord(b) && !used.has(normalizeWord(a)) && !used.has(normalizeWord(b))) {
    return { pair: [a, b], source: 'ai' }
  }
  const options = location.pairs[difficulty]
  const fresh = options.filter(([x, y]) => !used.has(normalizeWord(x)) && !used.has(normalizeWord(y)))
  return { pair: pick(fresh.length ? fresh : options), source: 'fallback' }
}

/** True if the clue gives away the word (contains it, or vice versa). */
export function clueLeaksWord(clue: string, word: string): boolean {
  if (!word) return false
  const c = normalizeWord(clue).replace(/ /g, '')
  const w = normalizeWord(word).replace(/ /g, '')
  if (!c || !w) return false
  return c.includes(w) || w.includes(c)
}

/** A bot's one-word clue. `word` is empty when the bot is the blind villain. */
export async function botClue(
  tools: ActionTools,
  opts: { name: string; personality: Personality; word: string; location: Location; cluesSoFar: string[] },
): Promise<string> {
  const { word, location, cluesSoFar } = opts
  const prompt = word
    ? `Your secret word is "${word}" (location: ${location.name}). Give ONE single-word clue that hints at it without being too obvious. Never say the word itself or part of it.`
    : `You are secretly the villain and do not know the word. The location is ${location.name}. Blend in: give ONE single-word clue that fits the clues so far.`
  const reply = await askClaude(
    tools,
    botSystem(opts.name, opts.personality, 'Reply with exactly one word and nothing else.'),
    `${prompt}\nClues so far: ${cluesSoFar.length ? cluesSoFar.join(', ') : '(none yet)'}.\nAvoid repeating a clue already given.`,
    10,
  )
  const clue = cleanWord(reply?.split(/\s+/)[0])
  if (clue && !clueLeaksWord(clue, word) && !cluesSoFar.map(normalizeWord).includes(normalizeWord(clue))) {
    return clue
  }
  // Fallback: a generic word for the location that hasn't been used yet.
  const unused = location.flavor.filter((f) => !cluesSoFar.map(normalizeWord).includes(normalizeWord(f)))
  return cleanWord(pick(unused.length ? unused : location.flavor)) ?? 'Hmm'
}

/** A bot's vote: the player whose clues fit the bot's own word the least. */
export async function botVote(
  tools: ActionTools,
  opts: {
    name: string
    personality: Personality
    word: string
    location: Location
    candidates: Array<{ id: string; alias: string; clues: string[] }>
  },
): Promise<string> {
  const { word, location, candidates } = opts
  const list = candidates.map((c) => `${c.alias}: ${c.clues.join(', ') || '(no clues)'}`).join('\n')
  const reply = await askClaude(
    tools,
    botSystem(opts.name, opts.personality, 'Reply with strict JSON only.'),
    [
      `Location: ${location.name}. ${word ? `Your secret word is "${word}".` : 'You do not know the secret word.'}`,
      'One of these players has a different secret word (or none). Whose clues fit the least?',
      list,
      'Format: {"suspect": "<exact alias>"}',
    ].join('\n'),
    40,
  )
  const suspect = parseJsonObject(reply)?.suspect
  const match = candidates.find((c) => typeof suspect === 'string' && c.alias.toLowerCase() === suspect.toLowerCase())
  return match?.id ?? pick(candidates).id
}

/** A caught blind-villain bot's last guess at the heroes' word. */
export async function botLastGuess(
  tools: ActionTools,
  opts: { location: Location; clues: string[] },
): Promise<string> {
  const reply = await askClaude(
    tools,
    'You are playing a word guessing game. Reply with exactly one word or short noun phrase and nothing else.',
    `Location: ${opts.location.name}. Other players gave these clues about one secret word: ${opts.clues.join(', ')}. What is the secret word?`,
    10,
  )
  return cleanWord(reply) ?? cleanWord(pick(shuffle(opts.location.pairs.hero.flat()))) ?? 'Mystery'
}

// ── ElevenLabs narrator ─────────────────────────────────────────────────────

/** A deep "narrator" voice from the ElevenLabs default library. */
const NARRATOR_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'

interface ElevenLabsResponse {
  audioUrl?: string
  audio_base64?: string
  audio?: string
  base64?: string
  data?: string
}

/** Text -> `data:audio/mpeg;base64,...`, or throws. Field-name handling mirrors StoryNest's audio.ts. */
export async function narrate(tools: ActionTools, text: string): Promise<string> {
  const result = await tools.integration<ElevenLabsResponse>('elevenlabs/generate-speech', {
    text,
    voice_id: NARRATOR_VOICE_ID,
    model_id: 'eleven_flash_v2_5',
    output_format: 'mp3_44100_128',
  })
  if (!result.success) throw new Error(`narration failed: ${result.error ?? 'unknown'}`)
  const wrapper = result.data as unknown as Record<string, unknown>
  const r = (wrapper && 'response' in wrapper ? wrapper.response : wrapper) as ElevenLabsResponse
  const raw = r?.audioUrl ?? r?.audio_base64 ?? r?.audio ?? r?.base64 ?? r?.data ?? null
  if (!raw) throw new Error('narration failed: no audio in response')
  const b64 = raw.startsWith('data:') ? (raw.split(',', 2)[1] ?? '') : raw
  if (!b64) throw new Error('narration failed: empty audio')
  return `data:audio/mpeg;base64,${b64}`
}
