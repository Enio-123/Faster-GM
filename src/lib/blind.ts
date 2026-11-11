// Treino às cegas: regras puras (sem tela) para os exercícios de visão do tabuleiro,
// a memória de posição, a leitura de lances digitados e os lances em palavras.
import { Chess, type Move, type PieceSymbol } from 'chess.js'

export type Rand = () => number
export const FILES = 'abcdefgh'
export const ALL_SQUARES: string[] = Array.from({ length: 64 }, (_, i) => FILES[i % 8] + String(Math.floor(i / 8) + 1))

const pick = <T,>(arr: T[], rand: Rand): T => arr[Math.floor(rand() * arr.length) % arr.length]

// ---------- Casas ----------

/** Coluna contada de 1 (a) a 8 (h). */
export const fileNum = (sq: string) => sq.charCodeAt(0) - 96
export const rankNum = (sq: string) => Number(sq[1])

/** Casa clara quando coluna + fileira dá ímpar (a1 = 1 + 1 = 2, escura). */
export function isLight(sq: string): boolean {
  return (fileNum(sq) + rankNum(sq)) % 2 === 1
}

export function sameDiagonal(a: string, b: string): boolean {
  return a !== b && Math.abs(fileNum(a) - fileNum(b)) === Math.abs(rankNum(a) - rankNum(b))
}

const KNIGHT = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
]

/** Caminho mais curto do cavalo entre duas casas, com as duas pontas. */
export function knightPath(a: string, b: string): string[] {
  if (a === b) return [a]
  const prev = new Map<string, string>([[a, '']])
  const queue = [a]
  while (queue.length) {
    const cur = queue.shift()!
    for (const [df, dr] of KNIGHT) {
      const f = fileNum(cur) + df
      const r = rankNum(cur) + dr
      if (f < 1 || f > 8 || r < 1 || r > 8) continue
      const nx = FILES[f - 1] + r
      if (prev.has(nx)) continue
      prev.set(nx, cur)
      if (nx === b) {
        const path = [b]
        let p = cur
        while (p) {
          path.unshift(p)
          p = prev.get(p)!
        }
        return path
      }
      queue.push(nx)
    }
  }
  return []
}

export const knightDistance = (a: string, b: string) => knightPath(a, b).length - 1

// ---------- Exercícios de visão ----------

export type VisionDrill = 'casa' | 'cor' | 'diagonal' | 'cavalo'

export interface VisionQ {
  drill: VisionDrill
  a: string
  b?: string
  /** Casa (ache a casa), 'clara' ou 'escura', 'sim' ou 'nao', ou o número de saltos. */
  answer: string
}

function randomSquare(rand: Rand, avoid?: string): string {
  let sq = pick(ALL_SQUARES, rand)
  for (let i = 0; i < 8 && sq === avoid; i++) sq = pick(ALL_SQUARES, rand)
  return sq
}

function diagonalYes(rand: Rand): [string, string] {
  for (;;) {
    const a = randomSquare(rand)
    const [sf, sr] = pick(
      [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ],
      rand,
    )
    const n = 2 + Math.floor(rand() * 6)
    const f = fileNum(a) + sf * n
    const r = rankNum(a) + sr * n
    if (f >= 1 && f <= 8 && r >= 1 && r <= 8) return [a, FILES[f - 1] + r]
  }
}

function diagonalNo(rand: Rand): [string, string] {
  // Quase sempre "por pouco": colunas e fileiras diferem em 1, o que obriga a contar.
  const close = rand() < 0.7
  for (;;) {
    const a = randomSquare(rand)
    const b = randomSquare(rand, a)
    const df = Math.abs(fileNum(a) - fileNum(b))
    const dr = Math.abs(rankNum(a) - rankNum(b))
    if (!df || !dr || df === dr) continue
    if (close && Math.abs(df - dr) !== 1) continue
    return [a, b]
  }
}

export function visionQuestion(drill: VisionDrill, rand: Rand = Math.random, prev?: VisionQ | null): VisionQ {
  switch (drill) {
    case 'casa': {
      const a = randomSquare(rand, prev?.a)
      return { drill, a, answer: a }
    }
    case 'cor': {
      const a = randomSquare(rand, prev?.a)
      return { drill, a, answer: isLight(a) ? 'clara' : 'escura' }
    }
    case 'diagonal': {
      const [a, b] = rand() < 0.5 ? diagonalYes(rand) : diagonalNo(rand)
      return { drill, a, b, answer: sameDiagonal(a, b) ? 'sim' : 'nao' }
    }
    case 'cavalo': {
      const a = randomSquare(rand)
      const b = randomSquare(rand, a)
      return { drill, a, b, answer: String(knightDistance(a, b)) }
    }
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Por que a resposta certa é essa (mostrado quando você erra). */
export function visionWhy(q: VisionQ): string {
  switch (q.drill) {
    case 'casa':
      return `A casa ${q.a} está marcada no tabuleiro.`
    case 'cor': {
      const f = fileNum(q.a)
      const r = rankNum(q.a)
      return `${q.a} é ${q.answer}. Some a coluna (a = 1 até h = 8) com a fileira: ${f} + ${r} = ${f + r}, ${(f + r) % 2 ? 'ímpar, casa clara' : 'par, casa escura'}.`
    }
    case 'diagonal': {
      const df = Math.abs(fileNum(q.a) - fileNum(q.b!))
      const dr = Math.abs(rankNum(q.a) - rankNum(q.b!))
      const cnt = `de ${q.a} para ${q.b} são ${plural(df, 'coluna', 'colunas')} e ${plural(dr, 'fileira', 'fileiras')}`
      return q.answer === 'sim' ? `Sim: ${cnt}. Números iguais, mesma diagonal.` : `Não: ${cnt}. Na mesma diagonal os dois números são iguais.`
    }
    case 'cavalo': {
      const path = knightPath(q.a, q.b!)
      const n = path.length - 1
      return `${n === 1 ? 'É 1 salto' : `São ${n} saltos`}. Um caminho: ${path.join(', ')}.`
    }
  }
}

// ---------- Peças em palavras ----------

export type PieceCode = `${'w' | 'b'}${PieceSymbol}`

const NAME: Record<PieceSymbol, [string, 'o' | 'a', string]> = {
  k: ['rei', 'o', 'reis'],
  q: ['dama', 'a', 'damas'],
  r: ['torre', 'a', 'torres'],
  b: ['bispo', 'o', 'bispos'],
  n: ['cavalo', 'o', 'cavalos'],
  p: ['peão', 'o', 'peões'],
}
export const PIECE_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p']

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** "rei branco", "dama preta". */
export function pieceName(code: string): string {
  const [name, g] = NAME[code[1] as PieceSymbol]
  const color = code[0] === 'w' ? (g === 'o' ? 'branco' : 'branca') : g === 'o' ? 'preto' : 'preta'
  return `${name} ${color}`
}

/** "o rei branco", "a dama preta". */
export function pieceWithArticle(code: string): string {
  return `${NAME[code[1] as PieceSymbol][1]} ${pieceName(code)}`
}

/** Casa → peça ("wq", "bp"...). */
export function boardMap(fen: string): Map<string, PieceCode> {
  const map = new Map<string, PieceCode>()
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, i) => {
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += Number(ch)
        continue
      }
      const color = ch === ch.toUpperCase() ? 'w' : 'b'
      map.set(FILES[f] + String(8 - i), `${color}${ch.toLowerCase()}` as PieceCode)
      f++
    }
  })
  return map
}

const bySquare = (a: string, b: string) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])

function joinE(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/** Peças de um lado em palavras, como nos livros de xadrez às cegas: "Rei g1, Dama d1, Torres a1 e f1, Peões a2, b2 e c3". */
export function pieceList(fen: string, color: 'w' | 'b'): string {
  const map = boardMap(fen)
  const parts: string[] = []
  for (const t of PIECE_ORDER) {
    const sqs = [...map].filter(([, c]) => c === `${color}${t}`).map(([s]) => s).sort(bySquare)
    if (!sqs.length) continue
    const [one, , many] = NAME[t]
    parts.push(`${cap(sqs.length === 1 ? one : many)} ${joinE(sqs)}`)
  }
  return parts.join(', ')
}

export const countPieces = (fen: string) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length

/** Peças no tabuleiro depois de um lance (UCI), sem refazer a partida: só a captura muda a conta. */
export function piecesAfter(fen: string, uci: string): number {
  const map = boardMap(fen)
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const enPassant = map.get(from)?.[1] === 'p' && from[0] !== to[0] && !map.has(to)
  return map.size - (map.has(to) || enPassant ? 1 : 0)
}

// ---------- Memória de posição ----------

export interface MemQ {
  kind: 'onde' | 'oque'
  /** Onde: a casa da peça. O que: a casa perguntada. */
  square: string
  /** A peça na casa (null = vazia). */
  piece: PieceCode | null
}

export function memoryPrompt(q: MemQ): string {
  return q.kind === 'onde' ? `Onde está ${pieceWithArticle(q.piece!)}?` : `O que tem em ${q.square}?`
}

export function memoryAnswer(q: MemQ): string {
  if (q.kind === 'onde') return `${cap(pieceWithArticle(q.piece!))} está em ${q.square}.`
  return q.piece ? `Em ${q.square} está ${pieceWithArticle(q.piece)}.` : `${q.square} está vazia.`
}

/**
 * Perguntas sobre uma posição: "onde está" só para peças únicas (rei, a dama, a única torre),
 * "o que tem em" para casas com peça e algumas vazias. `focus`: casas que mudaram com os lances
 * anunciados, que recebem metade das perguntas.
 */
export function memoryQuestions(fen: string, count: number, rand: Rand = Math.random, focus: string[] = []): MemQ[] {
  const map = boardMap(fen)
  const counts = new Map<string, number>()
  for (const c of map.values()) counts.set(c, (counts.get(c) ?? 0) + 1)
  const unique = [...map].filter(([, c]) => counts.get(c) === 1)
  const used = new Set<string>()
  const out: MemQ[] = []
  const addOque = (sq: string) => {
    used.add(sq)
    out.push({ kind: 'oque', square: sq, piece: map.get(sq) ?? null })
  }
  const focusSq = [...new Set(focus)]
  const wantFocus = focusSq.length ? Math.ceil(count / 2) : 0
  let guard = 0
  while (out.length < count && guard++ < 400) {
    if (out.length < wantFocus) {
      const left = focusSq.filter((s) => !used.has(s))
      if (left.length) {
        const sq = pick(left, rand)
        const code = map.get(sq)
        // Peça única que acabou de chegar: pergunta onde ela está.
        if (code && counts.get(code) === 1 && rand() < 0.5) {
          used.add(sq)
          out.push({ kind: 'onde', square: sq, piece: code })
        } else addOque(sq)
        continue
      }
    }
    const r = rand()
    const freeUnique = unique.filter(([s]) => !used.has(s))
    if (r < 0.4 && freeUnique.length) {
      const [sq, code] = pick(freeUnique, rand)
      used.add(sq)
      out.push({ kind: 'onde', square: sq, piece: code })
    } else if (r < 0.85) {
      const occ = [...map.keys()].filter((s) => !used.has(s))
      if (occ.length) addOque(pick(occ, rand))
    } else {
      // Casa vazia perto das peças, para não ser óbvio.
      const near = ALL_SQUARES.filter((s) => !map.has(s) && !used.has(s) && [...map.keys()].some((p) => Math.abs(fileNum(p) - fileNum(s)) <= 1 && Math.abs(rankNum(p) - rankNum(s)) <= 1))
      if (near.length) addOque(pick(near, rand))
    }
  }
  return out
}

// ---------- Lances em palavras ----------

const SAN_PIECE: Record<string, string> = { K: 'Rei', Q: 'Dama', R: 'Torre', B: 'Bispo', N: 'Cavalo' }
const SAN_PROMO: Record<string, string> = { Q: 'dama', R: 'torre', B: 'bispo', N: 'cavalo' }
/** Nome das letras das colunas, para a voz não ler "e" como a conjunção. */
const LETTER: Record<string, string> = { a: 'á', b: 'bê', c: 'cê', d: 'dê', e: 'é', f: 'éfe', g: 'gê', h: 'agá' }

interface SanParts {
  castle?: 'k' | 'q'
  piece?: string
  from: string
  capture: boolean
  to: string
  promo?: string
  check: boolean
  mate: boolean
}

function sanParts(san: string): SanParts | null {
  const check = san.includes('+')
  const mate = san.includes('#')
  const s = san.replace(/[+#!?]/g, '')
  if (s === 'O-O' || s === 'O-O-O') return { castle: s === 'O-O' ? 'k' : 'q', from: '', capture: false, to: '', check, mate }
  const m = s.match(/^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(?:=([QRBN]))?$/)
  if (!m) return null
  return { piece: m[1], from: m[2], capture: !!m[3], to: m[4], promo: m[5], check, mate }
}

function words(san: string, sq: (s: string) => string): string {
  const p = sanParts(san)
  if (!p) return san
  let out: string
  if (p.castle) out = p.castle === 'k' ? 'Roque pequeno' : 'Roque grande'
  else if (!p.piece) {
    // Peão: "Peão e4", "Peão e toma d5".
    out = p.capture ? `Peão ${sq(p.from)} toma ${sq(p.to)}` : `Peão ${sq(p.to)}`
  } else {
    const dis = p.from ? ` de ${sq(p.from)}` : ''
    out = `${SAN_PIECE[p.piece]}${dis}${p.capture ? ' toma ' : p.from ? ' para ' : ' '}${sq(p.to)}`
  }
  if (p.promo) out += `, promove a ${SAN_PROMO[p.promo]}`
  if (p.mate) out += ', xeque-mate'
  else if (p.check) out += ', xeque'
  return out
}

/** Lance em palavras para ler: "Cavalo f3", "Dama toma e5, xeque", "Roque pequeno". */
export function sanWords(san: string): string {
  return words(san, (s) => s)
}

/** Lance em palavras para a voz, com o nome das letras: "Cavalo éfe 3". */
export function sanSpeech(san: string): string {
  return words(san, (s) => s.replace(/[a-h]/g, (l) => `${LETTER[l]} `).trim())
}

const MOVE_PIECE: Record<PieceSymbol, string> = { k: 'Rei', q: 'Dama', r: 'Torre', b: 'Bispo', n: 'Cavalo', p: 'Peão' }

/** Para escolher entre duas leituras do que foi digitado: "Torre de a1 para f1". */
export function moveChoiceLabel(m: Move): string {
  if (m.flags.includes('k')) return 'Roque pequeno'
  if (m.flags.includes('q')) return 'Roque grande'
  const promo = m.promotion ? `, promove a ${NAME[m.promotion][0]}` : ''
  return `${MOVE_PIECE[m.piece]} de ${m.from} ${m.captured ? 'toma' : 'para'} ${m.to}${promo}`
}

// ---------- Lance digitado ----------

/** Letras de peça aceitas: inglês (K Q R B N) e português (R D T B C). R é torre ou rei. */
const LETTER_TYPES: Record<string, PieceSymbol[]> = { K: ['k'], Q: ['q'], R: ['r', 'k'], B: ['b'], N: ['n'], D: ['q'], T: ['r'], C: ['n'] }
const PROMO_TYPES: Record<string, PieceSymbol> = { q: 'q', d: 'q', r: 'r', t: 'r', b: 'b', n: 'n', c: 'n' }

export interface ParsedInput {
  /** Lances legais que o texto pode ser. Mais de um: o app pergunta qual. */
  moves: Move[]
  error?: string
}

export const INPUT_EXAMPLES = 'e4, Cf3 ou Nf3, Dxe5, O-O, e2e4'

/**
 * Lê um lance digitado. Aceita SAN em inglês ou português, sem "x" ou com, minúsculas,
 * casa de saída e chegada (e2e4, e7e8d) e "roque". Promoção sem peça vira dama.
 */
export function parseMoveInput(fen: string, raw: string): ParsedInput {
  let legal: Move[]
  try {
    legal = new Chess(fen).moves({ verbose: true })
  } catch {
    return { moves: [], error: 'Posição inválida.' }
  }
  const s0 = raw.trim().replace(/[+#!?\s]/g, '').replace(/e\.?p\.?$/i, '')
  if (!s0) return { moves: [], error: 'Digite um lance.' }
  const result = (ms: Move[], understood = true): ParsedInput => {
    const uniq = [...new Map(ms.map((m) => [m.from + m.to + (m.promotion ?? ''), m])).values()]
    if (uniq.length) return { moves: uniq }
    return { moves: [], error: understood ? 'Esse lance não é legal nesta posição.' : `Não entendi o lance. Exemplos: ${INPUT_EXAMPLES}.` }
  }
  const low = s0.toLowerCase().replace(/0/g, 'o')
  const castle = (flag: 'k' | 'q') => legal.filter((m) => m.piece === 'k' && m.flags.includes(flag))
  if (/^o-?o-?o$/.test(low) || low === 'roquegrande') return result(castle('q'))
  if (/^o-?o$/.test(low) || low === 'roquepequeno') return result(castle('k'))
  if (low === 'roque') return result([...castle('k'), ...castle('q')])

  const s = s0.replace(/[x:×\-=]/gi, '')
  if (!s) return result([], false)
  const first = s[0]
  const rest = s.slice(1).toLowerCase()
  const promoOk = (m: Move, p?: string) => (p ? m.promotion === PROMO_TYPES[p] : !m.promotion || m.promotion === 'q')
  let understood = false

  const tryBody = (types: PieceSymbol[] | null, body: string): Move[] => {
    const co = body.match(/^([a-h][1-8])([a-h][1-8])([qrbndtc])?$/)
    if (co) {
      understood = true
      return legal.filter((m) => m.from === co[1] && m.to === co[2] && (!types || types.includes(m.piece)) && promoOk(m, co[3]))
    }
    const sm = body.match(/^([a-h])?([1-8])?([a-h][1-8])([qrbndtc])?$/)
    if (!sm) return []
    understood = true
    const [, df, dr, to, promo] = sm
    return legal.filter((m) => {
      if (m.to !== to) return false
      if (df && m.from[0] !== df) return false
      if (dr && m.from[1] !== dr) return false
      if (types) return m.piece !== 'p' && types.includes(m.piece) && !promo
      return m.piece === 'p' && promoOk(m, promo)
    })
  }

  // Maiúscula de peça é sempre peça (Cxd4 nunca vira o peão c, mesmo se o cavalo não puder ir).
  // Minúscula b, c ou d pode ser peça ou coluna: se as duas leituras forem legais, o app pergunta.
  const upper = first.toUpperCase()
  const isUpper = first !== first.toLowerCase()
  const types = LETTER_TYPES[upper]
  const asPiece = types ? tryBody(types, rest) : []
  const asPawn = /[a-h]/i.test(first) && !(isUpper && types) ? tryBody(null, first.toLowerCase() + rest) : []
  return result([...asPiece, ...asPawn], understood)
}
