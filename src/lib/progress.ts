// Registro de tentativas, rating de problemas, desbloqueio da escada e fila de revisão.
import type { BucketId, Puzzle, Row } from './puzzles'
import { signature } from './puzzles'
import { update } from './rating'
import { firstSchedule, review as reviewSchedule, isMastered } from './srs'
import { getState, setState, type AppState, type LevelStats, type ReviewCard } from './state'
import { dayKey } from './time'

export const EMPTY_LEVEL: LevelStats = { tries: 0, solved: 0, totalMs: 0, bestMs: 0, recent: [] }

export const UNLOCK = { need: 8, of: 10 }

export function levelStats(s: AppState, bucket: string): LevelStats {
  return s.levels[bucket] ?? EMPTY_LEVEL
}

export function recentHits(l: LevelStats): number {
  return l.recent.slice(-UNLOCK.of).reduce((a, b) => a + b, 0)
}

/** O degrau seguinte abre com 8 acertos nas últimas 10 tentativas do degrau anterior. */
export function isUnlocked(s: AppState, order: BucketId[], bucket: BucketId): boolean {
  const i = order.indexOf(bucket)
  if (i <= 0) return true
  if ((s.levels[bucket]?.tries ?? 0) > 0) return true
  return recentHits(levelStats(s, order[i - 1])) >= UNLOCK.need
}

export function seenSet(s: AppState, bucket: BucketId, rows: Row[]): Set<string> {
  if (s.seenSig[bucket] !== signature(rows)) return new Set()
  return new Set(s.seen[bucket] ?? [])
}

export function markSeen(bucket: BucketId, rows: Row[], id: string) {
  const sig = signature(rows)
  setState((s) => {
    const same = s.seenSig[bucket] === sig
    let list = same ? [...(s.seen[bucket] ?? [])] : []
    if (!list.includes(id)) list.push(id)
    // Viu tudo: recomeça o ciclo do pacote.
    if (list.length >= rows.length) list = [id]
    return { ...s, seen: { ...s.seen, [bucket]: list }, seenSig: { ...s.seenSig, [bucket]: sig } }
  })
}

export interface AttemptResult {
  ok: boolean
  ms: number
  ratingBefore: number
  ratingAfter: number
}

/**
 * Registra a primeira tentativa de um problema. `rated: false` (nova tentativa, revisão)
 * conta tempo e estatística, mas não mexe no rating. Erro em problema valendo rating, ou com
 * `review: true`, vira cartão da revisão dos erros.
 */
export function recordAttempt(p: Puzzle, ok: boolean, ms: number, opts: { rated: boolean; statsKey?: string; review?: boolean }): AttemptResult {
  const before = getState().puzzle.r
  let after = before
  setState((s) => {
    const key = opts.statsKey ?? p.bucket
    const l = levelStats(s, key)
    const level: LevelStats = {
      tries: l.tries + 1,
      solved: l.solved + (ok ? 1 : 0),
      totalMs: l.totalMs + ms,
      bestMs: ok ? (l.bestMs ? Math.min(l.bestMs, ms) : ms) : l.bestMs,
      recent: [...l.recent, ok ? 1 : 0].slice(-20),
    }
    let puzzle = s.puzzle
    let ratingHistory = s.ratingHistory
    if (opts.rated) {
      puzzle = update(s.puzzle, p.rating, ok)
      after = puzzle.r
      const today = dayKey()
      const last = ratingHistory[ratingHistory.length - 1]
      ratingHistory = last && last[0] === today ? [...ratingHistory.slice(0, -1), [today, Math.round(puzzle.r)]] : [...ratingHistory, [today, Math.round(puzzle.r)]]
    }
    let reviewList = s.review
    if (!ok && (opts.rated || opts.review) && !reviewList.some((c) => c.id === 'p:' + p.id)) {
      const card: ReviewCard = {
        ...firstSchedule(),
        id: 'p:' + p.id,
        kind: 'problema',
        fen: p.fen,
        line: p.moves,
        note: p.mate ? `Mate em ${p.length}` : `Linha de ${p.length} lances`,
        created: Date.now(),
        bucket: p.bucket,
        rating: p.rating,
      }
      reviewList = [card, ...reviewList].slice(0, 400)
    }
    return { ...s, levels: { ...s.levels, [key]: level }, puzzle, ratingHistory, review: reviewList }
  })
  return { ok, ms, ratingBefore: before, ratingAfter: after }
}

/** Estatística de um exercício que não é problema (visão do tabuleiro, memória). */
export function recordStat(key: string, ok: boolean, ms = 0) {
  setState((s) => {
    const l = levelStats(s, key)
    const level: LevelStats = {
      tries: l.tries + 1,
      solved: l.solved + (ok ? 1 : 0),
      totalMs: l.totalMs + ms,
      bestMs: ok && ms ? (l.bestMs ? Math.min(l.bestMs, ms) : ms) : l.bestMs,
      recent: [...l.recent, ok ? 1 : 0].slice(-20),
    }
    return { ...s, levels: { ...s.levels, [key]: level } }
  })
}

export function dueCards(s: AppState, now = Date.now()): ReviewCard[] {
  return s.review.filter((c) => c.due <= now).sort((a, b) => a.due - b.due)
}

export function answerCard(id: string, ok: boolean) {
  setState((s) => {
    const list = s.review
      .map((c) => (c.id === id ? { ...c, ...reviewSchedule(c, ok) } : c))
      .filter((c) => !(c.id === id && isMastered(c)))
    return { ...s, review: list }
  })
}

export function addCards(cards: ReviewCard[]) {
  if (!cards.length) return
  setState((s) => {
    const ids = new Set(s.review.map((c) => c.id))
    const fresh = cards.filter((c) => {
      if (ids.has(c.id)) return false
      ids.add(c.id)
      return true
    })
    return { ...s, review: [...fresh, ...s.review].slice(0, 400) }
  })
}

export function removeCard(id: string) {
  setState((s) => ({ ...s, review: s.review.filter((c) => c.id !== id) }))
}
