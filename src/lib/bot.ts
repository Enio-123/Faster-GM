// Nível do bot "Tempo" e recomendação de nível.
// A partir de 1320 o Stockfish limita a força pela escala UCI_Elo dele.
// Abaixo disso o app sorteia entre os melhores lances com uma "temperatura" que cresce
// quanto menor o nível, o que produz erros parecidos com os de jogadores mais fracos.
// A escala é aproximada: não é o rating do chess.com nem da FIDE.
import type { EngineLine } from '../engine/engine'
import { valueFor, type Color } from '../engine/score'

export const BOT_MIN = 800
export const BOT_MAX = 2800
export const UCI_ELO_MIN = 1320

export interface BotSearch {
  limitElo?: number
  multipv?: number
  depth?: number
  temperature?: number
}

export function searchFor(elo: number): BotSearch {
  if (elo >= UCI_ELO_MIN) return { limitElo: elo }
  const gap = UCI_ELO_MIN - elo
  return { multipv: 5, depth: elo < 1000 ? 5 : 7, temperature: 25 + gap * 0.45 }
}

/** Sorteia um lance entre as linhas, com peso maior para as melhores. */
export function pickWeighted(lines: EngineLine[], color: Color, temperature: number, rand: () => number = Math.random): string | null {
  const valid = lines.filter((l) => l.pv.length > 0)
  if (!valid.length) return null
  const vals = valid.map((l) => Math.max(-3000, Math.min(3000, valueFor(l.score, color))))
  const best = Math.max(...vals)
  const weights = vals.map((v) => Math.exp(-(best - v) / temperature))
  const total = weights.reduce((a, b) => a + b, 0)
  let x = rand() * total
  for (let i = 0; i < valid.length; i++) {
    x -= weights[i]
    if (x <= 0) return valid[i].pv[0]
  }
  return valid[valid.length - 1].pv[0]
}

/** Quanto o bot pensa, em ms, a partir do relógio dele. Nunca gasta mais do que pode. */
export function thinkTime(remainingMs: number, incMs: number, ply: number, rand: () => number = Math.random): number {
  const opening = ply < 12
  const base = remainingMs / (opening ? 60 : 32) + incMs * 0.75
  const jitter = 0.55 + rand() * 0.8
  const t = base * jitter
  const cap = Math.max(80, remainingMs * 0.12)
  return Math.round(Math.max(120, Math.min(t, cap, 8000)))
}

export function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400))
}

/** Desempenho contra o Tempo: sobe ao vencer, desce ao perder, como um rating. */
export function ladderAfter(ladder: number, score: 0 | 0.5 | 1, botElo: number, games: number): number {
  const k = games < 10 ? 80 : 48
  return Math.round(ladder + k * (score - expectedScore(ladder, botElo)))
}

export interface Recommendation {
  elo: number
  fromPuzzles: number | null
  fromGames: number
}

/**
 * Nível recomendado: metade vem do rating de problemas (que costuma ficar acima do rating de partidas,
 * por isso o desconto de 300), metade do seu desempenho contra o Tempo.
 */
export function recommend(puzzleRating: number, puzzleCount: number, ladder: number): Recommendation {
  const fromPuzzles = puzzleCount >= 10 ? puzzleRating - 300 : null
  const raw = fromPuzzles === null ? ladder : 0.5 * fromPuzzles + 0.5 * ladder
  const elo = Math.max(BOT_MIN, Math.min(BOT_MAX, Math.round(raw / 50) * 50))
  return { elo, fromPuzzles: fromPuzzles === null ? null : Math.round(fromPuzzles), fromGames: Math.round(ladder) }
}

export interface TimeControl { id: string; label: string; kind: 'Bullet' | 'Blitz'; base: number; inc: number }
export const TIME_CONTROLS: TimeControl[] = [
  { id: '1+0', label: '1+0', kind: 'Bullet', base: 60, inc: 0 },
  { id: '2+1', label: '2+1', kind: 'Bullet', base: 120, inc: 1 },
  { id: '3+0', label: '3+0', kind: 'Blitz', base: 180, inc: 0 },
  { id: '3+2', label: '3+2', kind: 'Blitz', base: 180, inc: 2 },
  { id: '5+0', label: '5+0', kind: 'Blitz', base: 300, inc: 0 },
  { id: '5+3', label: '5+3', kind: 'Blitz', base: 300, inc: 3 },
]
