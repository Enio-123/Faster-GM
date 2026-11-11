// Convenção única de avaliação do Faster GM
// ------------------------------------------------
// Toda avaliação guardada no app é SEMPRE do ponto de vista das BRANCAS.
//  - cp positivo  = vantagem das brancas; cp negativo = vantagem das pretas.
//  - mate: `winner` indica quem dá mate e `moves` quantos lances faltam (0 = já é mate no tabuleiro).
// O Stockfish responde do ponto de vista de quem tem a vez; a conversão acontece
// apenas aqui (fromUci/fromUciWdl). A troca para o ponto de vista de um jogador
// acontece somente na camada de apresentação (forColor, barShares, formatScore).

export type Color = 'w' | 'b'

export type Score =
  | { kind: 'cp'; cp: number }
  | { kind: 'mate'; winner: Color; moves: number }

/** Probabilidades do modelo WDL do Stockfish, em por mil, do ponto de vista das brancas. */
export interface Wdl { white: number; draw: number; black: number }

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** Converte o placar UCI (perspectiva de quem joga) para a convenção interna (brancas). */
export function fromUci(sideToMove: Color, type: 'cp' | 'mate', value: number): Score {
  if (type === 'cp') return { kind: 'cp', cp: sideToMove === 'w' ? value : -value }
  // mate > 0: quem tem a vez dá mate; mate < 0 ou "mate 0": quem tem a vez leva mate.
  if (value > 0) return { kind: 'mate', winner: sideToMove, moves: value }
  return { kind: 'mate', winner: other(sideToMove), moves: Math.abs(value) }
}

/** Converte "wdl W D L" (perspectiva de quem joga) para brancas/empate/pretas. */
export function fromUciWdl(sideToMove: Color, w: number, d: number, l: number): Wdl {
  return sideToMove === 'w' ? { white: w, draw: d, black: l } : { white: l, draw: d, black: w }
}

/**
 * Pontuação esperada das brancas (0–100) a partir da avaliação.
 * Fórmula logística usada pelo Lichess (coeficiente 0.00368208), limitada a ±1000 cp.
 */
export function whiteWinPercent(s: Score): number {
  if (s.kind === 'mate') return s.winner === 'w' ? 100 : 0
  const cp = Math.max(-1000, Math.min(1000, s.cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Pontuação esperada (0–100) do ponto de vista de uma cor. */
export function winPercentFor(s: Score, color: Color): number {
  const w = whiteWinPercent(s)
  return color === 'w' ? w : 100 - w
}

/** Valor numérico comparável do ponto de vista de uma cor (mate vira valor grande, mantendo o sinal). */
export function valueFor(s: Score, color: Color): number {
  if (s.kind === 'mate') {
    const v = 100000 - s.moves * 100
    return s.winner === color ? v : -v
  }
  return color === 'w' ? s.cp : -s.cp
}

/**
 * Divisão da barra de avaliação. `bottom` é a cor que está embaixo no tabuleiro.
 * Retorna a fração (0–100) ocupada pela cor de baixo e pela de cima.
 * Girar o tabuleiro troca `bottom`, mas a vantagem continua pertencendo à mesma cor.
 */
export function barShares(s: Score, bottom: Color): { bottom: number; top: number } {
  const b = winPercentFor(s, bottom)
  return { bottom: b, top: 100 - b }
}

export interface ScoreText {
  /** Texto curto, sempre com o sinal na perspectiva das brancas: "+1.24", "−0.50", "M3", "#". */
  short: string
  /** Quem está em vantagem (null quando equilibrado). */
  leader: Color | null
  /** Frase completa e sem ambiguidade. */
  label: string
}

const NAME: Record<Color, string> = { w: 'Brancas', b: 'Pretas' }

export function formatScore(s: Score): ScoreText {
  if (s.kind === 'mate') {
    if (s.moves === 0) return { short: s.winner === 'w' ? '1-0' : '0-1', leader: s.winner, label: `Xeque-mate: vitória das ${NAME[s.winner]}` }
    return { short: `M${s.moves}`, leader: s.winner, label: `${NAME[s.winner]} dão mate em ${s.moves}` }
  }
  const pawns = s.cp / 100
  const abs = Math.abs(pawns).toFixed(2)
  if (Math.abs(s.cp) < 15) return { short: '0.00', leader: null, label: 'Posição equilibrada' }
  const leader: Color = s.cp > 0 ? 'w' : 'b'
  return {
    short: `${s.cp > 0 ? '+' : '−'}${abs}`,
    leader,
    label: `${NAME[leader]} melhores por ${abs} ${Math.abs(pawns) >= 2 ? 'peões' : 'peão'}`,
  }
}

/** Arredonda as três probabilidades WDL para percentuais inteiros que somam exatamente 100. */
export function wdlPercents(w: Wdl): { white: number; draw: number; black: number } {
  const total = w.white + w.draw + w.black
  if (total <= 0) return { white: 0, draw: 100, black: 0 }
  const raw = [w.white, w.draw, w.black].map((x) => (x / total) * 100)
  const floor = raw.map(Math.floor)
  let rest = 100 - floor.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (rest <= 0) break
    floor[i]++
    rest--
  }
  return { white: floor[0], draw: floor[1], black: floor[2] }
}

/** Probabilidades vistas por um jogador: vitória, empate, derrota. */
export function wdlFor(w: Wdl, color: Color) {
  const p = wdlPercents(w)
  return color === 'w' ? { win: p.white, draw: p.draw, loss: p.black } : { win: p.black, draw: p.draw, loss: p.white }
}
