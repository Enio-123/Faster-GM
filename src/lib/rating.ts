// Rating de problemas em Glicko-1 (mesma família do rating de puzzles do Lichess).
// O jogador começa em 1500 com incerteza alta; cada problema conta como uma partida
// contra o rating do próprio problema.
export interface Rating { r: number; rd: number; n: number }

export const INITIAL_RATING: Rating = { r: 1500, rd: 300, n: 0 }
const Q = Math.log(10) / 400
const PUZZLE_RD = 80
const MIN_RD = 60
const MAX_RD = 350
const MAX_STEP = 120

function g(rd: number) {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI))
}

export function expected(player: number, opponent: number, opponentRd = PUZZLE_RD) {
  return 1 / (1 + Math.pow(10, (-g(opponentRd) * (player - opponent)) / 400))
}

export function update(p: Rating, puzzleRating: number, solved: boolean): Rating {
  const gj = g(PUZZLE_RD)
  const e = expected(p.r, puzzleRating)
  const d2 = 1 / (Q * Q * gj * gj * e * (1 - e))
  const pre = 1 / (1 / (p.rd * p.rd) + 1 / d2)
  // No começo a incerteza é alta e um único problema mexeria centenas de pontos;
  // o limite por problema deixa a curva legível sem mudar para onde ela converge.
  const delta = Math.max(-MAX_STEP, Math.min(MAX_STEP, Q * pre * gj * ((solved ? 1 : 0) - e)))
  const r = p.r + delta
  const rd = Math.max(MIN_RD, Math.min(MAX_RD, Math.sqrt(pre)))
  return { r: Math.round(r * 10) / 10, rd: Math.round(rd * 10) / 10, n: p.n + 1 }
}
