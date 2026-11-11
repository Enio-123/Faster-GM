import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  ALL_SQUARES,
  boardMap,
  countPieces,
  isLight,
  knightDistance,
  knightPath,
  memoryAnswer,
  memoryPrompt,
  memoryQuestions,
  moveChoiceLabel,
  parseMoveInput,
  pieceList,
  sameDiagonal,
  sanSpeech,
  sanWords,
  visionQuestion,
  visionWhy,
  type VisionDrill,
} from '../lib/blind'

/** Sorteio com semente, para os testes repetirem. */
function seeded(seed: number) {
  let x = seed >>> 0
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0
    return x / 2 ** 32
  }
}

const START = new Chess().fen()

describe('casas', () => {
  it('cor das casas', () => {
    expect(isLight('a1')).toBe(false)
    expect(isLight('h1')).toBe(true)
    expect(isLight('d1')).toBe(true)
    expect(isLight('e1')).toBe(false)
    expect(isLight('d4')).toBe(false)
    expect(isLight('e4')).toBe(true)
    expect(isLight('h8')).toBe(false)
    expect(ALL_SQUARES.filter(isLight)).toHaveLength(32)
  })
  it('diagonais', () => {
    expect(sameDiagonal('c1', 'h6')).toBe(true)
    expect(sameDiagonal('a8', 'h1')).toBe(true)
    expect(sameDiagonal('c1', 'g6')).toBe(false)
    expect(sameDiagonal('e4', 'e4')).toBe(false)
  })
  it('cavalo: distâncias conhecidas e caminho válido', () => {
    expect(knightDistance('g1', 'f3')).toBe(1)
    expect(knightDistance('a1', 'b2')).toBe(4)
    expect(knightDistance('a1', 'h8')).toBe(6)
    expect(knightDistance('e4', 'e5')).toBe(3)
    expect(knightDistance('d4', 'd4')).toBe(0)
    const path = knightPath('b1', 'f7')
    for (let i = 1; i < path.length; i++) {
      const df = Math.abs(path[i].charCodeAt(0) - path[i - 1].charCodeAt(0))
      const dr = Math.abs(Number(path[i][1]) - Number(path[i - 1][1]))
      expect([df, dr].sort().join()).toBe('1,2')
    }
    expect(path[0]).toBe('b1')
    expect(path[path.length - 1]).toBe('f7')
  })
  it('cavalo: maior distância no tabuleiro é 6', () => {
    let max = 0
    for (const a of ALL_SQUARES) for (const b of ALL_SQUARES) max = Math.max(max, knightDistance(a, b))
    expect(max).toBe(6)
  })
})

describe('exercícios de visão', () => {
  const drills: VisionDrill[] = ['casa', 'cor', 'diagonal', 'cavalo']
  it('a resposta guardada confere com as regras', () => {
    const rand = seeded(7)
    for (const d of drills) {
      for (let i = 0; i < 300; i++) {
        const q = visionQuestion(d, rand)
        if (d === 'casa') expect(q.answer).toBe(q.a)
        if (d === 'cor') expect(q.answer).toBe(isLight(q.a) ? 'clara' : 'escura')
        if (d === 'diagonal') {
          expect(q.answer).toBe(sameDiagonal(q.a, q.b!) ? 'sim' : 'nao')
          expect(q.a).not.toBe(q.b)
        }
        if (d === 'cavalo') {
          expect(Number(q.answer)).toBe(knightDistance(q.a, q.b!))
          expect(Number(q.answer)).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })
  it('diagonal: metade sim, metade não, aproximadamente', () => {
    const rand = seeded(3)
    const qs = Array.from({ length: 400 }, () => visionQuestion('diagonal', rand))
    const yes = qs.filter((q) => q.answer === 'sim').length
    expect(yes).toBeGreaterThan(140)
    expect(yes).toBeLessThan(260)
  })
  it('explicações', () => {
    expect(visionWhy({ drill: 'cor', a: 'f5', answer: 'clara' })).toBe('f5 é clara. Some a coluna (a = 1 até h = 8) com a fileira: 6 + 5 = 11, ímpar, casa clara.')
    expect(visionWhy({ drill: 'diagonal', a: 'c1', b: 'g6', answer: 'nao' })).toBe('Não: de c1 para g6 são 4 colunas e 5 fileiras. Na mesma diagonal os dois números são iguais.')
    expect(visionWhy({ drill: 'diagonal', a: 'c1', b: 'h6', answer: 'sim' })).toContain('5 colunas e 5 fileiras')
    expect(visionWhy({ drill: 'cavalo', a: 'g1', b: 'f3', answer: '1' })).toBe('É 1 salto. Um caminho: g1, f3.')
    expect(visionWhy({ drill: 'cavalo', a: 'a1', b: 'h8', answer: '6' })).toMatch(/^São 6 saltos\. Um caminho: a1, .*, h8\.$/)
  })
})

describe('peças em palavras', () => {
  it('lista das peças da posição inicial', () => {
    expect(pieceList(START, 'w')).toBe('Rei e1, Dama d1, Torres a1 e h1, Bispos c1 e f1, Cavalos b1 e g1, Peões a2, b2, c2, d2, e2, f2, g2 e h2')
    expect(pieceList(START, 'b')).toBe('Rei e8, Dama d8, Torres a8 e h8, Bispos c8 e f8, Cavalos b8 e g8, Peões a7, b7, c7, d7, e7, f7, g7 e h7')
    expect(countPieces(START)).toBe(32)
  })
  it('mapa do tabuleiro', () => {
    const m = boardMap(START)
    expect(m.get('e1')).toBe('wk')
    expect(m.get('d8')).toBe('bq')
    expect(m.get('e4')).toBeUndefined()
    expect(m.size).toBe(32)
  })
})

describe('memória de posição', () => {
  const fen = '6k1/5ppp/8/8/3N4/8/5PPP/3R2K1 w - - 0 1'
  it('perguntas com respostas certas', () => {
    const rand = seeded(11)
    const map = boardMap(fen)
    for (let i = 0; i < 50; i++) {
      const qs = memoryQuestions(fen, 4, rand)
      expect(qs).toHaveLength(4)
      expect(new Set(qs.map((q) => q.square)).size).toBe(4)
      for (const q of qs) {
        expect(q.piece ?? null).toBe(map.get(q.square) ?? null)
        if (q.kind === 'onde') {
          // Só pergunta "onde está" de peça única.
          expect([...map.values()].filter((c) => c === q.piece)).toHaveLength(1)
        }
      }
    }
  })
  it('textos', () => {
    expect(memoryPrompt({ kind: 'onde', square: 'd4', piece: 'wn' })).toBe('Onde está o cavalo branco?')
    expect(memoryPrompt({ kind: 'oque', square: 'f7', piece: 'bp' })).toBe('O que tem em f7?')
    expect(memoryAnswer({ kind: 'oque', square: 'f7', piece: 'bp' })).toBe('Em f7 está o peão preto.')
    expect(memoryAnswer({ kind: 'oque', square: 'e5', piece: null })).toBe('e5 está vazia.')
    expect(memoryAnswer({ kind: 'onde', square: 'd1', piece: 'wr' })).toBe('A torre branca está em d1.')
  })
  it('casas que mudaram recebem metade das perguntas', () => {
    const rand = seeded(5)
    const qs = memoryQuestions(fen, 4, rand, ['d4', 'f5'])
    expect(qs.filter((q) => q.square === 'd4' || q.square === 'f5').length).toBeGreaterThanOrEqual(2)
  })
})

describe('lances em palavras', () => {
  it('leitura', () => {
    expect(sanWords('Nf3')).toBe('Cavalo f3')
    expect(sanWords('e4')).toBe('Peão e4')
    expect(sanWords('exd5')).toBe('Peão e toma d5')
    expect(sanWords('Qxe5+')).toBe('Dama toma e5, xeque')
    expect(sanWords('O-O')).toBe('Roque pequeno')
    expect(sanWords('O-O-O+')).toBe('Roque grande, xeque')
    expect(sanWords('Nbd2')).toBe('Cavalo de b para d2')
    expect(sanWords('R1xe2')).toBe('Torre de 1 toma e2')
    expect(sanWords('e8=Q#')).toBe('Peão e8, promove a dama, xeque-mate')
    expect(sanWords('Kxh7')).toBe('Rei toma h7')
  })
  it('voz com o nome das letras', () => {
    expect(sanSpeech('Nf3')).toBe('Cavalo éfe 3')
    expect(sanSpeech('exd5')).toBe('Peão é toma dê 5')
    expect(sanSpeech('Bxh7+')).toBe('Bispo toma agá 7, xeque')
  })
})

describe('lance digitado', () => {
  const uci = (fen: string, t: string) => parseMoveInput(fen, t).moves.map((m) => m.from + m.to + (m.promotion ?? '')).sort()
  it('SAN em inglês e em português', () => {
    expect(uci(START, 'e4')).toEqual(['e2e4'])
    expect(uci(START, 'Nf3')).toEqual(['g1f3'])
    expect(uci(START, 'Cf3')).toEqual(['g1f3'])
    expect(uci(START, 'cf3')).toEqual(['g1f3'])
    expect(uci(START, 'nc3')).toEqual(['b1c3'])
    expect(uci(START, 'E4')).toEqual(['e2e4'])
    expect(uci(START, 'e2e4')).toEqual(['e2e4'])
    expect(uci(START, 'e2-e4')).toEqual(['e2e4'])
    expect(uci(START, 'g1f3')).toEqual(['g1f3'])
    expect(uci(START, 'Ng1f3')).toEqual(['g1f3'])
  })
  it('capturas com e sem x, e a dúvida entre peão e dama', () => {
    // 1.e4 d5 2.Qh5 … : brancas podem tomar em d5 com o peão e com a dama.
    const c = new Chess()
    for (const m of ['e4', 'd5', 'Qh5', 'Nf6']) c.move(m)
    const fen = c.fen()
    expect(uci(fen, 'exd5')).toEqual(['e4d5'])
    expect(uci(fen, 'ed5')).toEqual(['e4d5'])
    expect(uci(fen, 'Dxd5')).toEqual(['h5d5'])
    expect(uci(fen, 'Qxd5')).toEqual(['h5d5'])
    // Sem letra de peça é peão, como na SAN.
    expect(uci(fen, 'xd5')).toEqual(['e4d5'])
    // "dxe5" minúsculo: peão d ou dama (português). As duas legais: o app pergunta.
    const both = '6k1/8/8/4p3/3P4/8/7Q/6K1 w - - 0 1'
    expect(uci(both, 'dxe5')).toEqual(['d4e5', 'h2e5'])
    expect(uci(both, 'Dxe5')).toEqual(['h2e5'])
  })
  it('R: torre em inglês, rei em português', () => {
    // Rei em g1 e torre em e1: Rf1 pode ser os dois.
    const fen = '6k1/8/8/8/8/8/8/4R1K1 w - - 0 1'
    expect(uci(fen, 'Rf1')).toEqual(['e1f1', 'g1f1'])
    expect(uci(fen, 'Kf1')).toEqual(['g1f1'])
    expect(uci(fen, 'Tf1')).toEqual(['e1f1'])
    expect(uci(fen, 'Re8')).toEqual(['e1e8'])
    expect(uci(fen, 'Rh2')).toEqual(['g1h2'])
  })
  it('maiúscula de peça nunca vira peão', () => {
    // Cavalo não chega em d4, mas o peão c3 toma em d4: "Cxd4" é ilegal, não cxd4.
    const fen = '4k3/8/8/8/3p4/2P5/8/4K1N1 w - - 0 1'
    const r = parseMoveInput(fen, 'Cxd4')
    expect(r.moves).toHaveLength(0)
    expect(r.error).toMatch(/não é legal/)
    expect(uci(fen, 'cxd4')).toEqual(['c3d4'])
  })
  it('roque, promoção e erros', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
    expect(uci(fen, 'O-O')).toEqual(['e1g1'])
    expect(uci(fen, '0-0-0')).toEqual(['e1c1'])
    expect(uci(fen, 'roque')).toEqual(['e1c1', 'e1g1'])
    const promo = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1'
    expect(uci(promo, 'e8')).toEqual(['e7e8q'])
    expect(uci(promo, 'e8=D')).toEqual(['e7e8q'])
    expect(uci(promo, 'e8C')).toEqual(['e7e8n'])
    expect(uci(promo, 'e8=N')).toEqual(['e7e8n'])
    expect(uci(promo, 'e7e8t')).toEqual(['e7e8r'])
    expect(parseMoveInput(START, 'xyz').error).toMatch(/Não entendi/)
    expect(parseMoveInput(START, 'e5').error).toMatch(/não é legal/)
    expect(parseMoveInput(START, '  ').error).toMatch(/Digite/)
  })
  it('rótulo para escolher entre duas leituras', () => {
    const fen = '6k1/8/8/8/8/8/8/4R1K1 w - - 0 1'
    const labels = parseMoveInput(fen, 'Rf1').moves.map(moveChoiceLabel).sort()
    expect(labels).toEqual(['Rei de g1 para f1', 'Torre de e1 para f1'])
  })
})

describe('peças depois do lance de abertura', () => {
  it('conta a captura sem refazer a partida', async () => {
    const { piecesAfter } = await import('../lib/blind')
    expect(piecesAfter(START, 'e2e4')).toBe(32)
    const c = new Chess()
    for (const m of ['e4', 'd5']) c.move(m)
    expect(piecesAfter(c.fen(), 'e4d5')).toBe(31)
    // En passant: o peão tomado não está na casa de chegada.
    const ep = new Chess('4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1')
    expect(piecesAfter(ep.fen(), 'd5e6')).toBe(3)
  })
})
