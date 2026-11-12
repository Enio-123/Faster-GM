// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { answerCard, dueCards, recordAttempt, addCards } from '../lib/progress'
import { type Puzzle } from '../lib/puzzles'
import { compactJson, getState, initialState, normalize, setState, exportJson, importJson, resetAll } from '../lib/state'

const puzzle = (id: string, rating = 1500): Puzzle => ({
  id,
  bucket: 'mate3',
  fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  moves: ['a1a2', 'a2a3', 'a3a4', 'a4a5', 'a5a6', 'a6a7'],
  rating,
  color: 'b',
  length: 3,
  mate: true,
})

beforeEach(() => {
  setState(() => initialState())
})

describe('tentativas', () => {
  it('tentativa valendo rating mexe no rating e no histórico; erro vira cartão de revisão', () => {
    const r = recordAttempt(puzzle('x', 1600), false, 30000, { rated: true })
    expect(r.ratingAfter).toBeLessThan(r.ratingBefore)
    const s = getState()
    expect(s.puzzle.n).toBe(1)
    expect(s.ratingHistory.length).toBe(1)
    expect(s.review.map((c) => c.id)).toEqual(['p:x'])
    expect(s.levels.mate3.tries).toBe(1)
    expect(s.levels.mate3.solved).toBe(0)
  })
  it('tentativa sem rating não mexe no rating nem cria cartão', () => {
    recordAttempt(puzzle('y'), false, 1000, { rated: false, statsKey: 'sequencia' })
    const s = getState()
    expect(s.puzzle.n).toBe(0)
    expect(s.review.length).toBe(0)
    expect(s.levels.sequencia.tries).toBe(1)
  })
  it('melhor tempo só conta acertos', () => {
    recordAttempt(puzzle('a'), true, 9000, { rated: true })
    recordAttempt(puzzle('b'), false, 1000, { rated: true })
    recordAttempt(puzzle('c'), true, 7000, { rated: true })
    expect(getState().levels.mate3.bestMs).toBe(7000)
  })
})

describe('fila de revisão', () => {
  it('cartão vence no dia seguinte e sai da fila depois de dominado', () => {
    recordAttempt(puzzle('z'), false, 1000, { rated: true })
    expect(dueCards(getState()).length).toBe(0)
    const later = Date.now() + 2 * 86400000
    expect(dueCards(getState(), later).length).toBe(1)
    for (let i = 0; i < 5; i++) answerCard('p:z', true)
    expect(getState().review.length).toBe(0)
  })
  it('não duplica cartões', () => {
    const card = { ...getState().review[0], id: 'g:1:2', kind: 'jogo' as const, fen: 'x', line: ['e2e4'], note: '', created: 0, due: 0, step: 0, reps: 0, lapses: 0 }
    addCards([card, card])
    addCards([card])
    expect(getState().review.filter((c) => c.id === 'g:1:2').length).toBe(1)
  })
})

describe('backup', () => {
  it('exporta e importa o progresso', () => {
    recordAttempt(puzzle('k'), true, 5000, { rated: true })
    const txt = exportJson()
    resetAll()
    expect(getState().puzzle.n).toBe(0)
    expect(importJson(txt)).toBe(true)
    expect(getState().puzzle.n).toBe(1)
    expect(importJson('não é json')).toBe(false)
  })
  it('passa quem estava no tabuleiro padrão antigo para a madeira, uma vez só', () => {
    expect(normalize({ settings: { boardTheme: 'aco' } }).settings.boardTheme).toBe('madeira')
    expect(normalize({ settings: { boardTheme: 'torneio' } }).settings.boardTheme).toBe('torneio')
    // Depois da migração (rev 2), escolher o aço de novo fica valendo.
    expect(normalize({ rev: 2, settings: { boardTheme: 'aco' } }).settings.boardTheme).toBe('aco')
    expect(initialState().settings.boardTheme).toBe('madeira')
  })
  it('completa campos de versões antigas', () => {
    const s = normalize({ settings: { sound: false }, games: 'x' })
    expect(s.settings.sound).toBe(false)
    expect(s.settings.dailyMinutes).toBe(120)
    expect(s.games).toEqual([])
    expect(s.bot.ladder).toBe(1200)
  })
})

describe('cópia na conta', () => {
  it('fica abaixo do limite de tamanho mesmo com muito histórico', () => {
    const big = initialState()
    big.seen = Object.fromEntries(['mate3', 'mate4', 'mate5', 'calc3', 'calc4', 'calc5', 'calc6', 'rapido'].map((b) => [b, Array.from({ length: 2500 }, (_, i) => `id${b}${i}`)]))
    big.games = Array.from({ length: 60 }, (_, i) => ({ id: 'g' + i, date: 0, tc: '3+2', color: 'w' as const, botElo: 1500, result: '1-0' as const, reason: 'Xeque-mate', moves: Array(120).fill('e2e4'), evals: Array(121).fill(12.34) }))
    const txt = compactJson(big)
    expect(new TextEncoder().encode(JSON.stringify(txt)).length).toBeLessThanOrEqual(256 * 1024)
    expect(normalize(JSON.parse(txt)).games.length).toBeGreaterThan(0)
  })
})
