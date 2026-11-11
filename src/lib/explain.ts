// Explicação dos erros nos problemas: o que você jogou, qual era o lance certo e por quê.
// Tudo o que o texto afirma sai de duas fontes conferíveis:
//  - as regras (chess.js): xeque, captura, garfo, sacrifício, única resposta, ameaça de mate,
//    material ganho na linha e o desenho do mate final;
//  - o Stockfish: a melhor resposta do adversário ao seu lance e a avaliação dos dois lances.
// Sem o motor, a explicação fica só com os fatos das regras e diz isso.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import { other, type Color, type Score } from '../engine/score'
import { judge, winChance } from './analysis'
import { uciToMove } from './puzzles'

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const PIECE: Record<PieceSymbol, { s: string; pl: string; f: boolean }> = {
  p: { s: 'peão', pl: 'peões', f: false },
  n: { s: 'cavalo', pl: 'cavalos', f: false },
  b: { s: 'bispo', pl: 'bispos', f: false },
  r: { s: 'torre', pl: 'torres', f: true },
  q: { s: 'dama', pl: 'damas', f: true },
  k: { s: 'rei', pl: 'reis', f: false },
}

const FILES = 'abcdefgh'
const NUM_M = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito']
const NUM_F = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito']

/** "a torre", "o cavalo"; com casa: "a torre de e7". */
export function the(t: PieceSymbol, square?: string): string {
  return `${PIECE[t].f ? 'a' : 'o'} ${PIECE[t].s}${square ? ` de ${square}` : ''}`
}
/** "da dama", "do cavalo". */
export function ofThe(t: PieceSymbol): string {
  return `${PIECE[t].f ? 'da' : 'do'} ${PIECE[t].s}`
}
/** "na dama", "no rei". */
export function onThe(t: PieceSymbol): string {
  return `${PIECE[t].f ? 'na' : 'no'} ${PIECE[t].s}`
}
/** "uma torre", "um peão". */
export function aPiece(t: PieceSymbol): string {
  return `${PIECE[t].f ? 'uma' : 'um'} ${PIECE[t].s}`
}

export function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

/** Peças capturadas numa linha: "a dama, uma torre e dois peões". */
export function pieceList(types: PieceSymbol[]): string {
  const parts: string[] = []
  for (const t of ['q', 'r', 'b', 'n', 'p'] as PieceSymbol[]) {
    const n = types.filter((x) => x === t).length
    if (!n) continue
    if (n === 1) parts.push(t === 'q' ? the(t) : aPiece(t))
    else parts.push(`${(PIECE[t].f ? NUM_F : NUM_M)[Math.min(n, 8)]} ${PIECE[t].pl}`)
  }
  return joinPt(parts)
}

export function sideName(c: Color): string {
  return c === 'w' ? 'as brancas' : 'as pretas'
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function decimal(v: number): string {
  return v.toFixed(1).replace('.', ',')
}

/** Avaliação do ponto de vista de quem resolve: "+2,3 para você", "mate em 2 para as pretas". */
export function evalText(s: Score, me: Color): string {
  if (s.kind === 'mate') {
    if (s.moves === 0) return s.winner === me ? 'xeque-mate' : 'xeque-mate contra você'
    return s.winner === me ? `mate em ${s.moves} para você` : `mate em ${s.moves} para ${sideName(other(me))}`
  }
  const v = (me === 'w' ? s.cp : -s.cp) / 100
  if (Math.abs(v) < 0.3) return 'posição igual'
  return v > 0 ? `+${decimal(v)} para você` : `+${decimal(-v)} para ${sideName(other(me))}`
}

function findKing(c: Chess, color: Color): Square | null {
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square
  return null
}

const RANK: Record<PieceSymbol, number> = { ...VALUE, k: 100 }

/** A peça em `sq` pode ser tomada de graça: atacada e sem defesa, ou atacada por peça que vale menos. */
export function inBadSpot(c: Chess, sq: Square): boolean {
  const piece = c.get(sq)
  if (!piece) return false
  const attackers = c.attackers(sq, other(piece.color))
  if (!attackers.length) return false
  if (!c.attackers(sq, piece.color).length) return true
  return attackers.some((a) => RANK[c.get(a)!.type] < RANK[piece.type])
}

/**
 * Garfo (mesma regra do Lichess): a peça que acabou de jogar, sem estar exposta, ataca duas ou mais
 * peças do adversário que valem mais do que ela (o rei conta) ou que estão sem defesa e não podem
 * tomá-la. Devolve essas peças, da mais valiosa para a menos.
 */
export function forkTargets(c: Chess, from: Square, me: Color): PieceSymbol[] {
  const piece = c.get(from)
  if (!piece || piece.type === 'k' || inBadSpot(c, from)) return []
  const opp = other(me)
  const hitsBack = new Set(c.attackers(from, opp))
  const out: PieceSymbol[] = []
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== opp || p.type === 'p') continue
      if (!c.attackers(p.square, me).includes(from)) continue
      const hanging = !c.attackers(p.square, opp).length
      if (RANK[p.type] > RANK[piece.type] || (hanging && !hitsBack.has(p.square))) out.push(p.type)
    }
  }
  return out.sort((a, b) => RANK[b] - RANK[a])
}

/** Lance quieto: se fosse a vez de quem jogou de novo, haveria mate em 1? Devolve esse lance. */
export function mateThreat(fenAfter: string, me: Color): string | null {
  const parts = fenAfter.split(' ')
  parts[1] = me
  parts[3] = '-'
  let c: Chess
  try {
    c = new Chess(parts.join(' '))
  } catch {
    return null
  }
  if (c.isCheck()) return null
  for (const mv of c.moves({ verbose: true })) {
    c.move({ from: mv.from, to: mv.to, promotion: mv.promotion })
    const mate = c.isCheckmate()
    c.undo()
    if (mate) return mv.san
  }
  return null
}

export type CheckKind = 'xeque' | 'xeque duplo' | 'xeque descoberto'

function checkKind(after: Chess, m: Move): CheckKind | null {
  if (!after.isCheck()) return null
  if (m.flags.includes('k') || m.flags.includes('q')) return 'xeque'
  const k = findKing(after, other(m.color))
  const checkers = k ? after.attackers(k, m.color) : []
  if (checkers.length >= 2) return 'xeque duplo'
  if (checkers.length === 1 && checkers[0] !== m.to) return 'xeque descoberto'
  return 'xeque'
}

export interface Tagged {
  san: string
  uci: string
  color: Color
  from: string
  to: string
  piece: PieceSymbol
  captured?: PieceSymbol
  promotion?: PieceSymbol
  check: CheckKind | null
  mate: boolean
  /** Peças atacadas ao mesmo tempo (garfo), da mais valiosa para a menos. */
  fork: PieceSymbol[]
  /** Quem jogou tinha só este lance legal. */
  only: boolean
  /** Sacrifício: o lance seguinte da linha toma esta peça, que vale mais do que ela tomou. */
  sacrifice: boolean
  /** Lance quieto que ameaça mate em 1 (o lance da ameaça). */
  threat: string | null
  /** Rótulos curtos, na ordem em que aparecem ao lado do lance. */
  tags: string[]
  /** Posição depois do lance. */
  fen: string
}

/**
 * Sacrifício: o adversário toma em seguida a peça que acabou de jogar, e mesmo contando a
 * retomada na mesma casa quem jogou fica pelo menos 2 pontos atrás nessa troca.
 */
function isSacrifice(m: Move, next: Move | undefined, after2: Move | undefined): boolean {
  if (!next || m.promotion || m.piece === 'k' || next.to !== m.to || !next.captured) return false
  let balance = (m.captured ? VALUE[m.captured] : 0) - VALUE[m.piece]
  if (after2 && after2.to === m.to && after2.captured) balance += VALUE[after2.captured]
  return balance <= -2
}

/**
 * Anota cada lance de uma linha com os fatos das regras. Para no primeiro lance ilegal.
 * `attacker` é o lado cujos sacrifícios e ameaças de mate interessam nesta linha
 * (na linha certa, quem resolve; na refutação, o adversário).
 */
export function annotateLine(fen: string, ucis: string[], attacker?: Color): Tagged[] {
  const c = new Chess(fen)
  const moves: { m: Move; count: number }[] = []
  for (const u of ucis) {
    const count = c.moves().length
    let m: Move
    try {
      m = c.move(uciToMove(u))
    } catch {
      break
    }
    moves.push({ m, count })
  }
  return moves.map(({ m, count }, i) => {
    const after = new Chess(m.after)
    const mine = !attacker || m.color === attacker
    const mate = after.isCheckmate()
    const check = mate ? null : checkKind(after, m)
    const sacrifice = mine && isSacrifice(m, moves[i + 1]?.m, moves[i + 2]?.m)
    const fork = mate ? [] : forkTargets(after, m.to as Square, m.color)
    const quiet = !m.captured && !m.promotion && !check && !mate
    const threat = mine && quiet ? mateThreat(m.after, m.color) : null
    const only = i > 0 && count === 1
    const tags: string[] = []
    if (sacrifice) tags.push(`sacrifício ${ofThe(m.piece)}`)
    if (m.captured) tags.push(`toma ${the(m.captured)}`)
    if (m.promotion) tags.push(`promove a ${PIECE[m.promotion].s}`)
    if (mate) tags.push('mate')
    else if (check) tags.push(check)
    if (fork.length >= 2) tags.push(`garfo ${joinPt(fork.slice(0, 3).map(onThe))}`)
    if (threat) tags.push(`ameaça ${threat}`)
    if (only) tags.push('única resposta')
    return {
      san: m.san,
      uci: m.from + m.to + (m.promotion ?? ''),
      color: m.color,
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      check,
      mate,
      fork: fork.length >= 2 ? fork : [],
      only,
      sacrifice,
      threat,
      tags,
      fen: m.after,
    }
  })
}

export interface Material {
  won: PieceSymbol[]
  lost: PieceSymbol[]
  /** Peças que você ganhou promovendo peões. */
  promoted: PieceSymbol[]
  /** Saldo em pontos (peão 1, cavalo e bispo 3, torre 5, dama 9), promoções incluídas. */
  net: number
}

export function material(line: Tagged[], me: Color): Material {
  const won: PieceSymbol[] = []
  const lost: PieceSymbol[] = []
  const promoted: PieceSymbol[] = []
  let net = 0
  for (const t of line) {
    const sign = t.color === me ? 1 : -1
    if (t.captured) {
      ;(sign > 0 ? won : lost).push(t.captured)
      net += sign * VALUE[t.captured]
    }
    if (t.promotion) {
      net += sign * (VALUE[t.promotion] - 1)
      if (sign > 0) promoted.push(t.promotion)
    }
  }
  return { won, lost, promoted, net }
}

export type MatePattern = 'corredor' | 'sufocado'

/** Desenho do mate na posição final: mate do corredor ou mate sufocado. */
export function matePattern(fen: string): MatePattern | null {
  const c = new Chess(fen)
  if (!c.isCheckmate()) return null
  const loser = c.turn()
  const winner = other(loser)
  const k = findKing(c, loser)
  if (!k) return null
  const checkers = c.attackers(k, winner)
  if (checkers.length !== 1) return null
  const checker = c.get(checkers[0])
  const kf = k.charCodeAt(0) - 97
  const kr = Number(k[1])
  const around: string[] = []
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const f = kf + df
      const r = kr + dr
      if ((df || dr) && f >= 0 && f <= 7 && r >= 1 && r <= 8) around.push(FILES[f] + r)
    }
  }
  const own = (sq: string) => c.get(sq as Square)?.color === loser
  if (checker?.type === 'n' && around.every(own)) return 'sufocado'
  const back = loser === 'w' ? 1 : 8
  const front = loser === 'w' ? 2 : 7
  if ((checker?.type === 'r' || checker?.type === 'q') && kr === back && Number(checkers[0][1]) === back) {
    const ahead = [kf - 1, kf, kf + 1].filter((f) => f >= 0 && f <= 7).map((f) => FILES[f] + front)
    const blocked = ahead.filter(own).length
    if (blocked >= 2 && ahead.every((sq) => own(sq) || c.isAttacked(sq as Square, winner))) return 'corredor'
  }
  return null
}

export type Verdict = 'grave' | 'erro' | 'imprecisao' | 'semMate' | 'lento' | 'bom'

export const VERDICT_LABEL: Record<Verdict, string> = {
  grave: 'Erro grave',
  erro: 'Erro',
  imprecisao: 'Imprecisão',
  semMate: 'Deixou o mate',
  lento: 'Mate mais lento',
  bom: 'Também era bom',
}

export interface MissFacts {
  /** Posição antes do erro (vez de quem resolve). */
  fen: string
  me: Color
  /** Problema de mate. */
  mate: boolean
  /** Lances de quem resolve que faltavam, contando o do erro. */
  remaining: number
  /** Seu lance (UCI). */
  played: string
  /** Linha certa a partir de `fen` (UCI), começando pelo lance certo. Vazia se ainda não se sabe. */
  best: string[]
}

export interface EngineFacts {
  /** Depois do seu lance: avaliação e melhor linha, que começa com a resposta do adversário. */
  played: { score: Score; pv: string[] } | null
  /** Depois do lance certo: avaliação (nas táticas, para comparar). */
  best: { score: Score } | null
}

export interface Explanation {
  playedSan: string
  bestSan: string | null
  verdict: Verdict | null
  /** Por que o lance certo funciona. */
  why: string[]
  /** Por que o seu lance não serve (precisa do motor, exceto o afogamento). */
  whyNot: string[]
  bestLine: Tagged[]
  /** Seu lance e a melhor resposta do motor. */
  playedLine: Tagged[]
}

const LANCES = (n: number) => `${n} ${n === 1 ? 'lance' : 'lances'}`

/** A frase sobre o primeiro lance da linha certa: o que ele faz de concreto. */
function firstMoveSentence(f: MissFacts, line: Tagged[], endsInMate: boolean): string | null {
  const [first, reply, next] = line
  const opp = sideName(other(f.me))
  if (first.mate) return null
  if (first.sacrifice && reply) return `Começa com um sacrifício ${ofThe(first.piece)}: ${opp} tomam com ${reply.san}${endsInMate ? ' e a linha segue até o mate' : next ? ` e vem ${next.san}` : ''}.`
  if (first.fork.length >= 2) return `${first.san} faz um garfo: ${the(first.promotion ?? first.piece)} ataca ${joinPt(first.fork.slice(0, 3).map((t) => the(t)))} ao mesmo tempo.`
  if (first.threat) return `${first.san} não é xeque nem captura, mas ameaça ${first.threat}.${f.mate ? ' E não há defesa que evite o mate.' : ''}`
  let verb = joinPt([first.captured ? `toma ${the(first.captured)}` : '', first.promotion ? `promove o peão a ${PIECE[first.promotion].s}` : ''].filter(Boolean))
  if (first.check) verb = verb ? `${verb} com ${first.check}` : `dá ${first.check}`
  const forced = reply?.only ? `${opp} só têm uma resposta: ${reply.san}` : ''
  if (verb && forced) return `${first.san} ${verb}, e ${forced}.`
  // Num mate, "dá xeque" sozinho não acrescenta nada: o resumo dos xeques vem depois.
  if (verb && (verb !== 'dá xeque' || !endsInMate)) return `${first.san} ${verb}.`
  if (forced) return `Depois de ${first.san}, ${forced}.`
  return null
}

function whyBest(f: MissFacts, line: Tagged[], engine: EngineFacts | null): string[] {
  const out: string[] = []
  const first = line[0]
  if (!first) return out
  const opp = sideName(other(f.me))
  const mine = line.filter((t) => t.color === f.me)
  const theirs = line.filter((t) => t.color !== f.me)
  const last = line[line.length - 1]
  const endsInMate = last.mate

  if (endsInMate) out.push(line.length === 1 ? `${first.san} é mate na hora.` : `${first.san} força mate em ${LANCES(mine.length)}.`)
  const s1 = firstMoveSentence(f, line, endsInMate)
  if (s1) out.push(s1)
  if (!first.sacrifice) {
    const later = mine.find((t, i) => i > 0 && t.sacrifice)
    if (later) out.push(`No meio da linha vem um sacrifício ${ofThe(later.piece)}: ${later.san}.`)
  }

  if (endsInMate && mine.length >= 2) {
    const checks = mine.slice(0, -1).every((t) => !!t.check)
    const forced = theirs.length > 0 && theirs.every((t) => t.only)
    if (checks && forced) out.push(`Todos os seus lances são xeque e ${opp} só têm uma resposta em cada um.`)
    else if (checks) out.push(`Todos os seus lances são xeque, então ${opp} só podem responder ao xeque.`)
    else if (forced) out.push(`${cap(opp)} só têm uma resposta legal em cada lance.`)
  }
  if (endsInMate) {
    const p = matePattern(last.fen)
    if (p === 'corredor') out.push('Termina num mate do corredor: o rei fica preso na última fileira pelas próprias peças.')
    if (p === 'sufocado') out.push('Termina num mate sufocado: o rei fica cercado pelas próprias peças e o cavalo dá o mate.')
  } else {
    const mat = material(line, f.me)
    const gains = [mat.won.length ? `toma ${pieceList(mat.won)}` : '', mat.promoted.length ? `promove ${mat.promoted.length === 1 ? 'um peão' : `${NUM_M[mat.promoted.length]} peões`} a ${PIECE[mat.promoted[0]].s}` : ''].filter(Boolean)
    if (gains.length && mat.net > 0) {
      const lost = mat.lost.length ? `, mas perde ${pieceList(mat.lost)}` : ' sem perder nada'
      out.push(`Na linha certa você ${joinPt(gains)}${lost}: fica com ${mat.net} ${mat.net === 1 ? 'ponto' : 'pontos'} de material a mais.`)
    }
    if (engine?.best) out.push(`Depois de ${first.san}, o motor dá ${evalText(engine.best.score, f.me)}.`)
  }
  return out
}

function whyNotPlayed(f: MissFacts, played: Tagged, refutation: Tagged[], bestSan: string | null, engine: EngineFacts | null): string[] {
  const out: string[] = []
  const opp = sideName(other(f.me))
  const after = new Chess(played.fen)
  if (after.isStalemate()) {
    out.push(`${played.san} afoga o rei: ${opp} ficam sem lance legal e sem xeque, e a partida termina empatada.`)
    return out
  }
  if (after.isDraw()) {
    out.push(`${played.san} leva a um empate na hora.`)
    return out
  }
  const ev = engine?.played
  if (!ev) return out
  const s = ev.score
  if (s.kind === 'mate' && s.winner !== f.me) {
    out.push(`Depois de ${played.san}, ${opp} dão mate em ${LANCES(s.moves)}.`)
    return out
  }
  if (s.kind === 'mate' && s.winner === f.me && f.mate) {
    const total = 1 + s.moves
    if (total <= f.remaining) out.push(`Pelo motor, ${played.san} também dá mate em ${LANCES(total)}. A conferência na hora não chegou a ver esse caminho.`)
    else out.push(`${played.san} também leva ao mate, mas em ${LANCES(total)}. O problema pedia mate em ${LANCES(f.remaining)}.`)
    return out
  }
  const r = refutation[0]
  if (r) {
    if (r.captured && r.to === played.to) {
      if (played.captured) out.push(`Você toma ${the(played.captured)}, mas ${opp} respondem ${r.san} e tomam ${the(played.promotion ?? played.piece)}.`)
      else {
        const t = played.promotion ?? played.piece
        out.push(`${cap(the(t))} fica ${PIECE[t].f ? 'exposta' : 'exposto'} em ${played.to}: ${opp} respondem ${r.san} e tomam.`)
      }
    } else if (r.captured) out.push(`${cap(opp)} respondem ${r.san} e tomam ${the(r.captured)}.`)
    else if (r.fork.length >= 2) out.push(`${cap(opp)} respondem ${r.san}, um garfo ${joinPt(r.fork.slice(0, 3).map(onThe))}.`)
    else if (r.check) out.push(`${cap(opp)} respondem com ${r.check}: ${r.san}.`)
    else out.push(`A melhor resposta é ${r.san}.`)
  }
  const mine = evalText(s, f.me)
  const b = engine?.best?.score
  if (f.mate && bestSan) out.push(`Com ${bestSan} era mate em ${LANCES(f.remaining)}; com o seu lance, o motor dá ${mine}.`)
  else if (b && bestSan && b.kind === 'mate' && b.winner === f.me) out.push(`Com ${bestSan} ${b.moves === 0 ? 'é mate' : `era mate em ${LANCES(b.moves + 1)}`}; com o seu lance, o motor dá ${mine}.`)
  else if (b && bestSan) out.push(`Com ${bestSan}, o motor dá ${evalText(b, f.me)}; com o seu lance, ${mine}.`)
  else out.push(`Com o seu lance, o motor dá ${mine}.`)
  return out
}

function verdictOf(f: MissFacts, played: Tagged, bestLine: Tagged[], engine: EngineFacts | null): Verdict | null {
  const after = new Chess(played.fen)
  if (after.isDraw()) return 'grave'
  const s = engine?.played?.score
  if (!s) return null
  const label = (j: ReturnType<typeof judge>): Verdict => (j === 'blunder' ? 'grave' : j === 'mistake' ? 'erro' : j === 'inaccuracy' ? 'imprecisao' : 'bom')
  if (f.mate) {
    if (s.kind === 'mate') return s.winner === f.me ? (1 + s.moves <= f.remaining ? 'bom' : 'lento') : 'grave'
    const j = judge(1, winChance(s, f.me))
    return j === 'blunder' ? 'grave' : j === 'mistake' ? 'erro' : 'semMate'
  }
  const bestScore: Score | null = engine?.best?.score ?? (bestLine[bestLine.length - 1]?.mate ? { kind: 'mate', winner: f.me, moves: 0 } : null)
  if (!bestScore) return null
  return label(judge(winChance(bestScore, f.me), winChance(s, f.me)))
}

/** Monta a explicação de um erro. Pode ser chamada de novo quando o motor responder. */
export function explain(f: MissFacts, engine: EngineFacts | null): Explanation {
  const bestLine = f.best.length ? annotateLine(f.fen, f.best, f.me) : []
  const playedLine = annotateLine(f.fen, [f.played, ...(engine?.played?.pv ?? [])], other(f.me))
  const played = playedLine[0]
  const bestSan = bestLine[0]?.san ?? null
  return {
    playedSan: played?.san ?? f.played,
    bestSan,
    verdict: played ? verdictOf(f, played, bestLine, engine) : null,
    why: whyBest(f, bestLine, engine),
    whyNot: played ? whyNotPlayed(f, played, playedLine.slice(1), bestSan, engine) : [],
    bestLine,
    playedLine,
  }
}
