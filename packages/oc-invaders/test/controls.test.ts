import { describe, expect, test } from 'bun:test'
import { GAME_BINDINGS, NAME_BINDINGS, gameInput, isGameBinding } from '../src/controls.js'

describe('game controls', () => {
  test('maps the OpenCode return binding to the game input name', () => {
    expect(gameInput('return')).toEqual({ name: 'return', sequence: undefined })
  })

  test('preserves printable characters for high-score names', () => {
    expect(gameInput('a')).toEqual({ name: 'a', sequence: 'a' })
    expect(NAME_BINDINGS).toContain('9')
    expect(GAME_BINDINGS).toContain('space')
  })

  test('recognizes gameplay and high-score input without capturing unrelated keys', () => {
    expect(isGameBinding('left')).toBe(true)
    expect(isGameBinding('space')).toBe(true)
    expect(isGameBinding('a')).toBe(true)
    expect(isGameBinding('escape')).toBe(false)
    expect(isGameBinding('f12')).toBe(false)
  })
})
