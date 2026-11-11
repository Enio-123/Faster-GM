// Monta os pacotes de problemas do Faster GM a partir de uma extração da base de puzzles do Lichess (CC0).
// Entrada: pasta com os .bin do projeto lichess-puzzle-extractor (rating, FEN, lances UCI).
// Cada problema é refeito lance a lance com chess.js: lance ilegal descarta o problema.
// Saída: public/puzzles/<pacote>.json, cada linha [id, fen, lances, rating].
//
// Uso: node scripts/build-puzzles.mjs <pasta-dos-bins>
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Chess } from 'chess.js'

const src = process.argv[2]
if (!src) {
  console.error('Informe a pasta dos .bin')
  process.exit(1)
}
const outDir = new URL('../public/puzzles/', import.meta.url).pathname
mkdirSync(outDir, { recursive: true })

function* readBin(path, reserve) {
  const buf = readFileSync(path)
  const count = buf.readUInt32LE(0)
  let o = 4
  for (let i = 0; i < count; i++) {
    if (reserve) o += 1
    const rating = buf.readUInt16LE(o)
    o += 2
    const fl = buf[o++]
    const fen = buf.toString('utf8', o, o + fl)
    o += fl
    const ml = buf[o++]
    const moves = buf.toString('utf8', o, o + ml)
    o += ml
    yield { rating, fen, moves }
  }
}

const files = []
for (const dir of readdirSync(src)) {
  const p = join(src, dir)
  if (!statSync(p).isDirectory()) continue
  for (const f of readdirSync(p)) {
    if (!f.endsWith('.bin')) continue
    files.push({ path: join(p, f), reserve: dir === 'reserve' })
  }
}

const seen = new Set()
const buckets = {}
const add = (name, row) => (buckets[name] ??= []).push(row)
let total = 0
let illegal = 0

function uciToMove(u) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined }
}

for (const f of files) {
  for (const p of readBin(f.path, f.reserve)) {
    const key = p.fen + '|' + p.moves
    if (seen.has(key)) continue
    seen.add(key)
    total++
    const moves = p.moves.trim().split(' ')
    if (moves.length < 2 || moves.length % 2 !== 0) continue
    const solverMoves = moves.length / 2
    let chess
    try {
      chess = new Chess(p.fen)
      for (const u of moves) chess.move(uciToMove(u))
    } catch {
      illegal++
      continue
    }
    const id = createHash('sha1').update(key).digest('base64url').slice(0, 7)
    const row = [id, p.fen, p.moves, p.rating]
    if (chess.isCheckmate()) {
      if (solverMoves >= 8) add('mate8', row)
      else if (solverMoves >= 3) add('mate' + solverMoves, row)
      else {
        add('rapido', row)
        // Mates em 1 e em 2 também em pacotes próprios (problemas às cegas), separados por número de peças.
        const start = new Chess(p.fen)
        start.move(uciToMove(moves[0]))
        const pieces = start.fen().split(' ')[0].replace(/[^a-zA-Z]/g, '').length
        const band = pieces <= 10 ? 0 : pieces <= 16 ? 1 : 2
        add(`mate${solverMoves}:${band}`, row)
      }
    } else {
      if (solverMoves >= 6) add('calc6', row)
      else if (solverMoves >= 3) add('calc' + solverMoves, row)
      else add('rapido', row)
    }
  }
}

// Limites por pacote, espalhando os problemas por toda a faixa de rating.
const LIMITS = { mate3: 2500, mate4: 2500, mate5: 2000, mate6: 2000, mate7: 2000, mate8: 2000, calc3: 2000, calc4: 2000, calc5: 2000, calc6: 2000, rapido: 3000 }

function spread(rows, limit) {
  rows.sort((a, b) => a[3] - b[3])
  if (rows.length <= limit) return rows
  // Amostra por faixas de 100 pontos para não concentrar tudo no meio da curva.
  const bands = new Map()
  for (const r of rows) {
    const b = Math.floor(r[3] / 100)
    if (!bands.has(b)) bands.set(b, [])
    bands.get(b).push(r)
  }
  const keys = [...bands.keys()].sort((a, b) => a - b)
  const out = []
  let remaining = limit
  let bandsLeft = keys.length
  // Distribui a cota igualmente; sobra de faixas pequenas passa para as próximas.
  const order = keys.map((k) => bands.get(k)).sort((a, b) => a.length - b.length)
  for (const band of order) {
    const quota = Math.floor(remaining / bandsLeft)
    const take = Math.min(quota, band.length)
    const step = band.length / take
    for (let i = 0; i < take; i++) out.push(band[Math.floor(i * step)])
    remaining -= take
    bandsLeft--
  }
  return out.sort((a, b) => a[3] - b[3])
}

// Pacotes dos problemas às cegas: cota por faixa de peças (até 10, 11 a 16, 17 ou mais),
// para o filtro "poucas peças" ter problemas suficientes.
const BLIND_QUOTA = [900, 700, 400]
for (const n of [1, 2]) {
  const rows = []
  BLIND_QUOTA.forEach((q, band) => {
    const list = buckets[`mate${n}:${band}`] ?? []
    delete buckets[`mate${n}:${band}`]
    rows.push(...spread(list, q))
  })
  buckets[`mate${n}`] = rows
}
LIMITS.mate1 = LIMITS.mate2 = 2000

const summary = {}
for (const [name, rows] of Object.entries(buckets)) {
  const picked = spread(rows, LIMITS[name] ?? 2000)
  writeFileSync(join(outDir, name + '.json'), JSON.stringify(picked))
  const ratings = picked.map((r) => r[3])
  summary[name] = { available: rows.length, kept: picked.length, min: Math.min(...ratings), max: Math.max(...ratings) }
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ source: 'Lichess puzzle database (CC0)', buckets: summary }, null, 1))
console.log({ total, illegal })
console.table(summary)
