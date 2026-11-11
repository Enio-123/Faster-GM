// Pacotes de problemas reais (base de puzzles do Lichess, licença CC0), validados no build:
// todo lance é legal e, nos pacotes de mate, a linha termina em xeque-mate.
// Formato da linha: [id, fen antes do lance do adversário, lances UCI, rating].
import { Chess } from 'chess.js'

export type BucketId = 'mate3' | 'mate4' | 'mate5' | 'mate6' | 'mate7' | 'mate8' | 'calc3' | 'calc4' | 'calc5' | 'calc6' | 'rapido'
export type Row = [string, string, string, number]

export interface Puzzle {
  id: string
  bucket: BucketId
  /** Posição antes do lance do adversário que abre o problema. */
  fen: string
  /** Lances UCI: o primeiro é do adversário, depois alterna solução e resposta. */
  moves: string[]
  rating: number
  /** Quem resolve. */
  color: 'w' | 'b'
  /** Lances de quem resolve. */
  length: number
  mate: boolean
}

export const MATE_LEVELS: { id: BucketId; n: number; label: string }[] = [
  { id: 'mate3', n: 3, label: 'Mate em 3' },
  { id: 'mate4', n: 4, label: 'Mate em 4' },
  { id: 'mate5', n: 5, label: 'Mate em 5' },
  { id: 'mate6', n: 6, label: 'Mate em 6' },
  { id: 'mate7', n: 7, label: 'Mate em 7' },
  { id: 'mate8', n: 8, label: 'Mate em 8+' },
]

export const CALC_LEVELS: { id: BucketId; n: number; label: string }[] = [
  { id: 'calc3', n: 3, label: '3 lances' },
  { id: 'calc4', n: 4, label: '4 lances' },
  { id: 'calc5', n: 5, label: '5 lances' },
  { id: 'calc6', n: 6, label: '6+ lances' },
]

const cache = new Map<BucketId, Promise<Row[]>>()

export function loadBucket(id: BucketId): Promise<Row[]> {
  let p = cache.get(id)
  if (!p) {
    p = fetch(new URL(`puzzles/${id}.json`, document.baseURI).href)
      .then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar ${id}`)
        return r.json() as Promise<Row[]>
      })
      .catch((e) => {
        cache.delete(id)
        throw e
      })
    cache.set(id, p)
  }
  return p
}

export function toPuzzle(bucket: BucketId, row: Row): Puzzle {
  const [id, fen, mv, rating] = row
  const moves = mv.split(' ')
  const opener = fen.split(' ')[1] as 'w' | 'b'
  return {
    id,
    bucket,
    fen,
    moves,
    rating,
    color: opener === 'w' ? 'b' : 'w',
    length: moves.length / 2,
    mate: bucket.startsWith('mate'),
  }
}

/** Assinatura do pacote: se o conteúdo mudar, o histórico de "já visto" recomeça. */
export function signature(rows: Row[]): string {
  return rows.length ? `${rows.length}:${rows[0][0]}:${rows[rows.length - 1][0]}` : '0'
}

/**
 * Escolhe um problema ainda não visto com rating perto do alvo.
 * Procura numa janela que cresce até achar; entre os mais próximos, sorteia para não repetir padrão.
 */
export function pickRow(rows: Row[], target: number, seen: Set<string>, rand: () => number = Math.random): Row | null {
  if (!rows.length) return null
  const unseen = rows.filter((r) => !seen.has(r[0]))
  const pool = unseen.length ? unseen : rows
  let window = 75
  let candidates: Row[] = []
  while (window <= 3200) {
    candidates = pool.filter((r) => Math.abs(r[3] - target) <= window)
    if (candidates.length >= 6 || (candidates.length && window >= 300)) break
    window *= 2
  }
  if (!candidates.length) {
    candidates = [...pool].sort((a, b) => Math.abs(a[3] - target) - Math.abs(b[3] - target)).slice(0, 12)
  }
  return candidates[Math.floor(rand() * candidates.length)] ?? null
}

export function uciToMove(u: string) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined }
}

/** Posição depois de aplicar os `count` primeiros lances. */
export function fenAfter(fen: string, moves: string[], count: number): string {
  const c = new Chess(fen)
  for (let i = 0; i < count; i++) c.move(uciToMove(moves[i]))
  return c.fen()
}

/** Lances em notação SAN a partir de uma posição. */
export function toSan(fen: string, moves: string[]): string[] {
  const c = new Chess(fen)
  const out: string[] = []
  for (const u of moves) {
    try {
      out.push(c.move(uciToMove(u)).san)
    } catch {
      break
    }
  }
  return out
}

/** Número do lance e reticências para exibir uma linha a partir de uma FEN ("23... Dxf2"). */
export function numberedLine(fen: string, sans: string[]): { n: string; san: string }[] {
  const parts = fen.split(' ')
  let move = Number(parts[5]) || 1
  let turn = parts[1] as 'w' | 'b'
  return sans.map((san, i) => {
    const n = turn === 'w' ? `${move}.` : i === 0 ? `${move}...` : ''
    if (turn === 'b') move++
    turn = turn === 'w' ? 'b' : 'w'
    return { n, san }
  })
}
