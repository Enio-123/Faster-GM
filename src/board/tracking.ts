// Acompanha a identidade das peças entre posições para animar deslocamentos
// (2D e 3D) sem nunca decidir nada sobre regras: a posição vem sempre da FEN.

export interface TrackedPiece { id: number; code: string; square: string }

let nextId = 1

export function piecesFromFen(fen: string): { code: string; square: string }[] {
  const rows = fen.split(' ')[0].split('/')
  const out: { code: string; square: string }[] = []
  rows.forEach((row, ri) => {
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch)
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b'
        out.push({ code: color + ch.toLowerCase(), square: String.fromCharCode(97 + f) + String(8 - ri) })
        f++
      }
    }
  })
  return out
}

function dist(a: string, b: string) {
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]))
}

export function trackPieces(prev: TrackedPiece[], fen: string): TrackedPiece[] {
  const next = piecesFromFen(fen)
  const result: (TrackedPiece | null)[] = next.map(() => null)
  const used = new Set<number>()

  next.forEach((p, i) => {
    const same = prev.find((q) => !used.has(q.id) && q.code === p.code && q.square === p.square)
    if (same) {
      used.add(same.id)
      result[i] = { ...same }
    }
  })
  const match = (pred: (q: TrackedPiece, p: { code: string; square: string }) => boolean) => {
    next.forEach((p, i) => {
      if (result[i]) return
      let best: TrackedPiece | null = null
      for (const q of prev) {
        if (used.has(q.id) || !pred(q, p)) continue
        if (!best || dist(q.square, p.square) < dist(best.square, p.square)) best = q
      }
      if (best) {
        used.add(best.id)
        result[i] = { id: best.id, code: p.code, square: p.square }
      }
    })
  }
  match((q, p) => q.code === p.code)
  // Promoção: o peão que sumiu vira a nova peça.
  match((q, p) => q.code === p.code[0] + 'p' && (p.square[1] === '8' || p.square[1] === '1'))
  return next.map((p, i) => result[i] ?? { id: nextId++, code: p.code, square: p.square })
}
