// Classificação dos lances depois da partida, pela queda na chance de vitória
// (mesmos limites do Lichess: 0,1 imprecisão, 0,2 erro, 0,3 erro grave).
import { whiteWinPercent, type Color, type Score } from '../engine/score'

export type Judgement = 'blunder' | 'mistake' | 'inaccuracy'

/** Chance de vitória de `color`, de -1 a 1. */
export function winChance(s: Score, color: Color): number {
  const w = (whiteWinPercent(s) - 50) / 50
  return color === 'w' ? w : -w
}

export function judge(before: number, after: number): Judgement | null {
  const drop = before - after
  if (drop >= 0.3) return 'blunder'
  if (drop >= 0.2) return 'mistake'
  if (drop >= 0.1) return 'inaccuracy'
  return null
}

export const JUDGEMENT_LABEL: Record<Judgement, string> = {
  blunder: 'Erro grave',
  mistake: 'Erro',
  inaccuracy: 'Imprecisão',
}
