import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { fenAfter, numberedLine, pickRow, toPuzzle, toSan, uciToMove, type BucketId, type Row } from '../lib/puzzles'

const DIR = join(__dirname, '../../public/puzzles')
const BUCKETS: BucketId[] = ['mate1', 'mate2', 'mate3', 'mate4', 'mate5', 'mate6', 'mate7', 'mate8', 'calc3', 'calc4', 'calc5', 'calc6', 'rapido']
const load = (b: BucketId): Row[] => JSON.parse(readFileSync(join(DIR, `${b}.json`), 'utf8'))

describe('pacotes de problemas', () => {
  for (const b of BUCKETS) {
    it(`${b}: toda linha é legal e bate com o pacote`, () => {
      const rows = load(b)
      expect(rows.length).toBeGreaterThan(50)
      const ids = new Set<string>()
      for (const row of rows) {
        expect(ids.has(row[0])).toBe(false)
        ids.add(row[0])
        const p = toPuzzle(b, row)
        expect(p.moves.length % 2).toBe(0)
        const c = new Chess(p.fen)
        // Quem resolve é o lado que joga depois do lance de abertura.
        c.move(uciToMove(p.moves[0]))
        expect(c.turn()).toBe(p.color)
        for (const u of p.moves.slice(1)) c.move(uciToMove(u))
        if (b.startsWith('mate')) {
          expect(c.isCheckmate()).toBe(true)
          const n = Number(b.slice(4))
          if (n === 8) expect(p.length).toBeGreaterThanOrEqual(8)
          else expect(p.length).toBe(n)
        } else if (b === 'calc6') {
          expect(p.length).toBeGreaterThanOrEqual(6)
        } else if (b.startsWith('calc')) {
          expect(p.length).toBe(Number(b.slice(4)))
        }
      }
    })
  }
})

describe('escolha de problema', () => {
  const rows: Row[] = Array.from({ length: 200 }, (_, i) => [`p${i}`, 'x', 'a', 1000 + i * 10])
  it('fica perto do rating alvo', () => {
    for (let k = 0; k < 50; k++) {
      const r = pickRow(rows, 1800, new Set(), Math.random)!
      expect(Math.abs(r[3] - 1800)).toBeLessThanOrEqual(75)
    }
  })
  it('não repete problema já visto enquanto houver outro', () => {
    const seen = new Set(rows.filter((r) => Math.abs(r[3] - 1500) <= 300).map((r) => r[0]))
    for (let k = 0; k < 50; k++) expect(seen.has(pickRow(rows, 1500, seen, Math.random)![0])).toBe(false)
  })
  it('recomeça o ciclo quando todos já foram vistos', () => {
    const all = new Set(rows.map((r) => r[0]))
    expect(pickRow(rows, 1500, all, () => 0)).not.toBeNull()
    expect(pickRow([], 1500, new Set())).toBeNull()
  })
  it('alvo fora da faixa ainda acha os mais próximos', () => {
    const r = pickRow(rows, 9000, new Set(), () => 0)!
    expect(r[3]).toBeGreaterThan(2500)
  })
})

describe('notação', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3'
  it('numera a linha a partir de um lance das pretas', () => {
    const sans = toSan(fen, ['d7d6', 'f3f7'])
    expect(sans).toEqual(['d6', 'Qxf7#'])
    expect(numberedLine(fen, sans)).toEqual([
      { n: '3...', san: 'd6' },
      { n: '4.', san: 'Qxf7#' },
    ])
  })
  it('aplica lances e para em lance ilegal', () => {
    expect(fenAfter(fen, ['g8f6'], 1).split(' ')[1]).toBe('w')
    expect(toSan(fen, ['g8f6', 'a1a8'])).toEqual(['Nf6'])
  })
})
