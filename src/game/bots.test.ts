import { describe, expect, it } from 'vitest'
import { HINTS, ruleClue, ruleGuess, rulePick, suspicion } from './bots'
import { LOCATIONS, normalizeWord } from './data'

const fixed = () => 0

describe('rule-based bots', () => {
  it('has hints for every word in the word list', () => {
    const norm = new Map(Object.entries(HINTS).map(([w, h]) => [normalizeWord(w), h]))
    for (const w of Object.values(LOCATIONS[0].pairs).flat(2)) expect(norm.get(normalizeWord(w))?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('gives an unused hint for its word and never repeats a clue', () => {
    const clue = ruleClue('Streetlight', ['Lamp'], fixed)
    expect(HINTS.streetlight.map(normalizeWord)).toContain(normalizeWord(clue))
    expect(normalizeWord(clue)).not.toBe('lamp')
  })

  it('hero bots suspect the player whose clues do not fit', () => {
    const fits = { id: 'a', clues: ['Lamp'], sus: 0 }
    const odd = { id: 'b', clues: ['Banana'], sus: 0 }
    expect(suspicion('Streetlight', odd)).toBeGreaterThan(suspicion('Streetlight', fits))
    expect(rulePick('Streetlight', [fits, odd], fixed)).toBe('b')
  })

  it('the Glitch bot deflects onto the most-suspected player', () => {
    expect(rulePick('', [{ id: 'a', clues: [], sus: 0 }, { id: 'b', clues: [], sus: 3 }], fixed)).toBe('b')
  })

  it('a caught Glitch guesses the word that matches the clues', () => {
    expect(normalizeWord(ruleGuess(['noodles', 'broth', 'chopsticks'], fixed))).toBe('ramen')
  })
})

import { ruleOpener, ruleReply } from './bots'
describe('bot chat grammar', () => {
  it('reads naturally when talking about the guest', () => {
    for (let i = 0; i < 3; i++) {
      const r = () => i / 3
      for (const p of ['cautious', 'chatty', 'bold'] as const) {
        const line = ruleOpener(p, 'You', r)
        expect(line).not.toMatch(/You's|you's|You is|you is/)
      }
    }
    expect(ruleReply('bold', 'You', () => 0)).toMatch(/you worry me more/)
    expect(ruleReply('bold', 'Neon Relay', () => 0)).toMatch(/Neon Relay worries me more/)
  })
})
