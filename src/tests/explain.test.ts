import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { annotateLine, evalText, explain, material, matePattern, mateThreat, pieceList, the, type MissFacts } from '../lib/explain'
import { fenAfter, toPuzzle, type BucketId, type Row } from '../lib/puzzles'

const DIR = join(__dirname, '../../public/puzzles')
const load = (b: BucketId): Row[] => JSON.parse(readFileSync(join(DIR, `${b}.json`), 'utf8'))

describe('nomes e textos', () => {
  it('artigos e listas em português', () => {
    expect(the('r', 'e7')).toBe('a torre de e7')
    expect(the('n')).toBe('o cavalo')
    expect(pieceList(['p', 'q', 'p', 'r'])).toBe('a dama, uma torre e dois peões')
    expect(pieceList(['r', 'r'])).toBe('duas torres')
    expect(pieceList(['b'])).toBe('um bispo')
  })

  it('avaliação do ponto de vista de quem resolve', () => {
    expect(evalText({ kind: 'cp', cp: 234 }, 'w')).toBe('+2,3 para você')
    expect(evalText({ kind: 'cp', cp: 234 }, 'b')).toBe('+2,3 para as brancas')
    expect(evalText({ kind: 'cp', cp: -15 }, 'b')).toBe('posição igual')
    expect(evalText({ kind: 'mate', winner: 'b', moves: 2 }, 'w')).toBe('mate em 2 para as pretas')
    expect(evalText({ kind: 'mate', winner: 'w', moves: 3 }, 'w')).toBe('mate em 3 para você')
  })
})

describe('fatos das regras', () => {
  it('garfo de cavalo no rei e na torre', () => {
    const [t] = annotateLine('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5c7'])
    expect(t.check).toBe('xeque')
    expect(t.fork).toEqual(['k', 'r'])
    expect(t.tags).toContain('garfo no rei e na torre')
  })

  it('xeque descoberto e xeque duplo', () => {
    const fen = '4k3/8/8/8/4B3/8/8/4R1K1 w - - 0 1'
    expect(annotateLine(fen, ['e4d5'])[0].check).toBe('xeque descoberto')
    expect(annotateLine(fen, ['e4c6'])[0].check).toBe('xeque duplo')
  })

  it('sacrifício quando a resposta toma a peça que valia mais', () => {
    const line = annotateLine('6k1/5ppp/8/8/8/3Q4/8/6K1 w - - 0 1', ['d3h7', 'g8h7'])
    expect(line[0].sacrifice).toBe(true)
    expect(line[0].tags[0]).toBe('sacrifício da dama')
    expect(line[1].tags).toContain('toma a dama')
    // Torre por torre é troca, não sacrifício.
    const trade = annotateLine('r2r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', ['d1d8', 'a8d8'])
    expect(trade[0].sacrifice).toBe(false)
    expect(trade[0].tags).toEqual(['toma a torre', 'xeque'])
    expect(trade[1].tags).toContain('toma a torre')
  })

  it('única resposta', () => {
    const line = annotateLine('7k/6p1/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8', 'h8h7'])
    expect(line[1].only).toBe(true)
    expect(line[1].tags).toEqual(['única resposta'])
  })

  it('mate do corredor', () => {
    const line = annotateLine('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', ['d1d8'])
    expect(line[0].mate).toBe(true)
    expect(line[0].tags).toEqual(['mate'])
    expect(matePattern(line[0].fen)).toBe('corredor')
  })

  it('mate sufocado', () => {
    const line = annotateLine('6rk/6pp/8/4N3/8/8/8/6K1 w - - 0 1', ['e5f7'])
    expect(line[0].mate).toBe(true)
    expect(matePattern(line[0].fen)).toBe('sufocado')
  })

  it('lance quieto que ameaça mate', () => {
    const line = annotateLine('7k/8/6K1/8/8/8/8/1Q6 w - - 0 1', ['b1c1'])
    expect(line[0].check).toBeNull()
    expect(line[0].threat).toBe('Qc8#')
    expect(line[0].tags).toContain('ameaça Qc8#')
    expect(mateThreat('7k/8/6K1/8/8/8/8/2Q5 b - - 1 1', 'w')).toBe('Qc8#')
  })

  it('promoção', () => {
    const [t] = annotateLine('8/P7/8/8/8/8/8/k5K1 w - - 0 1', ['a7a8q'])
    expect(t.tags).toEqual(['promove a dama', 'xeque'])
  })

  it('troca seguida de retomada não é sacrifício; perder a peça de graça é', () => {
    // Qxf8+ Qxf8 Rxf8+: dama por dama e ainda uma torre.
    const trade = annotateLine('5rk1/5q2/8/8/8/8/5Q2/5RK1 w - - 0 1', ['f2f7', 'f8f7', 'f1f7'], 'w')
    expect(trade[0].sacrifice).toBe(false)
    // Nxg6 hxg6: o cavalo vai por um peão.
    const sac = annotateLine('6k1/5p2/6pp/4N3/8/8/8/6K1 w - - 0 1', ['e5g6', 'f7g6'], 'w')
    expect(sac[0].sacrifice).toBe(true)
    // Sacrifício só conta para o lado que ataca.
    expect(annotateLine('6k1/5p2/6pp/4N3/8/8/8/6K1 w - - 0 1', ['e5g6', 'f7g6'], 'b')[0].sacrifice).toBe(false)
  })

  it('material da linha', () => {
    const line = annotateLine('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5c7', 'e8d7', 'c7a8'])
    expect(material(line, 'w')).toEqual({ won: ['r'], lost: [], promoted: [], net: 5 })
  })
})

describe('explicação de um erro', () => {
  // Brancas: a torre dá mate do corredor em d8. Erro: Rd7, e as pretas ficam bem.
  const facts: MissFacts = { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', me: 'w', mate: true, remaining: 1, played: 'd1d7', best: ['d1d8'] }

  it('sem motor: o lance certo já vem explicado pelas regras', () => {
    const e = explain(facts, null)
    expect(e.playedSan).toBe('Rd7')
    expect(e.bestSan).toBe('Rd8#')
    expect(e.verdict).toBeNull()
    expect(e.why[0]).toBe('Rd8# é mate na hora.')
    expect(e.why.join(' ')).toContain('mate do corredor')
    expect(e.whyNot).toEqual([])
  })

  it('com motor: diz o que acontece depois do seu lance', () => {
    const e = explain(facts, { played: { score: { kind: 'cp', cp: 120 }, pv: ['g8f8'] }, best: null })
    expect(e.verdict).toBe('grave')
    expect(e.whyNot[0]).toBe('A melhor resposta é Kf8.')
    expect(e.whyNot[1]).toBe('Com Rd8# era mate em 1 lance; com o seu lance, o motor dá +1,2 para você.')
  })

  it('seu lance deixa a dama exposta', () => {
    const f: MissFacts = { fen: '6k1/5ppp/8/8/8/2n5/8/3Q2K1 w - - 0 1', me: 'w', mate: false, remaining: 1, played: 'd1d5', best: ['d1d8'] }
    const e = explain(f, { played: { score: { kind: 'cp', cp: -900 }, pv: ['c3d5'] }, best: { score: { kind: 'mate', winner: 'w', moves: 0 } } })
    expect(e.whyNot).toEqual(['A dama fica exposta em d5: as pretas respondem Nxd5 e tomam.', 'Com Qd8# é mate; com o seu lance, o motor dá +9,0 para as pretas.'])
    expect(e.verdict).toBe('grave')
  })

  it('o adversário dá mate depois do seu lance', () => {
    const f: MissFacts = { ...facts, played: 'h2h3' }
    const e = explain(f, { played: { score: { kind: 'mate', winner: 'b', moves: 2 }, pv: [] }, best: null })
    expect(e.whyNot).toEqual(['Depois de h3, as pretas dão mate em 2 lances.'])
    expect(e.verdict).toBe('grave')
  })

  it('mate mais lento que o pedido', () => {
    const f: MissFacts = { ...facts, played: 'd1d7' }
    const e = explain(f, { played: { score: { kind: 'mate', winner: 'w', moves: 3 }, pv: [] }, best: null })
    expect(e.verdict).toBe('lento')
    expect(e.whyNot[0]).toBe('Rd7 também leva ao mate, mas em 4 lances. O problema pedia mate em 1 lance.')
  })

  it('afogamento é empate', () => {
    const f: MissFacts = { fen: '7k/2Q5/6K1/8/8/8/8/8 w - - 0 1', me: 'w', mate: true, remaining: 1, played: 'c7f7', best: ['c7h7'] }
    const e = explain(f, null)
    expect(e.whyNot[0]).toContain('afoga o rei')
    expect(e.verdict).toBe('grave')
  })
})

describe('problemas reais do pacote', () => {
  for (const b of ['mate3', 'mate5', 'calc3', 'calc6', 'rapido'] as BucketId[]) {
    it(`${b}: a linha certa é anotada inteira e os mates terminam em mate`, () => {
      const rows = load(b).slice(0, 80)
      for (const row of rows) {
        const p = toPuzzle(b, row)
        const start = fenAfter(p.fen, p.moves, 1)
        const line = annotateLine(start, p.moves.slice(1))
        expect(line.length).toBe(p.moves.length - 1)
        if (p.mate) expect(line[line.length - 1].mate).toBe(true)
        const e = explain({ fen: start, me: p.color, mate: p.mate, remaining: p.length, played: p.moves[1], best: p.moves.slice(1) }, null)
        if (p.mate) expect(e.why[0]).toMatch(/força mate em|é mate na hora/)
      }
    }, 30000)
  }
})
