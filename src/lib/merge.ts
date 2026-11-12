// Junta o progresso de dois aparelhos da mesma conta sem perder nem contar duas vezes.
//
// Junção em três vias: `base` é o que este aparelho sabia que estava na conta da última vez
// que sincronizou. O que mudou aqui desde a base (tentativas, minutos, partidas, cartões)
// entra por cima da versão da conta, que já traz o que os outros aparelhos fizeram.
// Um aparelho que nunca sincronizou com a conta usa a base vazia: tudo dele é novo.
import type { Rating } from './rating'
import { initialState, type AppState, type GameRecord, type LevelStats, type ReviewCard } from './state'

const GAMES_MAX = 60
const REVIEW_MAX = 400
const RECENT_MAX = 20

/** Base de quem nunca sincronizou com a conta. */
export function emptyBase(): AppState {
  return initialState(0)
}

/** Só o que a junção usa da base: as partidas e os problemas já vistos não entram. */
export function slimBase(s: AppState): AppState {
  return { ...s, games: [], seen: {}, seenSig: {} }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const more = (now: number, before: number) => Math.max(0, now - before)
const minPositive = (a: number, b: number) => (a > 0 && b > 0 ? Math.min(a, b) : Math.max(a, b))

/** Campo a campo: o que mudou aqui desde a base vale; o resto vem da conta. */
function pickFields<T extends object>(base: T, local: T, remote: T): T {
  const out = { ...remote } as Record<string, unknown>
  const b = base as Record<string, unknown>
  const l = local as Record<string, unknown>
  for (const k of Object.keys(l)) if (!same(l[k], b[k])) out[k] = l[k]
  return out as T
}

const EMPTY_LEVEL: LevelStats = { tries: 0, solved: 0, totalMs: 0, bestMs: 0, recent: [] }

function mergeLevel(base: LevelStats = EMPTY_LEVEL, local: LevelStats = EMPTY_LEVEL, remote?: LevelStats): LevelStats | undefined {
  const tries = more(local.tries, base.tries)
  if (tries === 0) return remote
  if (!remote) remote = EMPTY_LEVEL
  return {
    tries: remote.tries + tries,
    solved: remote.solved + more(local.solved, base.solved),
    totalMs: remote.totalMs + more(local.totalMs, base.totalMs),
    bestMs: minPositive(remote.bestMs, local.bestMs),
    recent: [...remote.recent, ...local.recent.slice(-Math.min(tries, RECENT_MAX))].slice(-RECENT_MAX),
  }
}

function mergeRating(base: Rating, local: Rating, remote: Rating): { rating: Rating; both: boolean } {
  if (same(local, base)) return { rating: remote, both: false }
  if (same(remote, base)) return { rating: local, both: false }
  return {
    rating: {
      r: Math.round((remote.r + (local.r - base.r)) * 10) / 10,
      rd: Math.min(local.rd, remote.rd),
      n: remote.n + more(local.n, base.n),
    },
    both: true,
  }
}

function mergeHistory(base: [string, number][], local: [string, number][], remote: [string, number][], rating: number, both: boolean): [string, number][] {
  const before = new Map(base)
  const out = new Map(remote)
  for (const [day, r] of local) if (before.get(day) !== r) out.set(day, r)
  const list = [...out].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  // Os dois aparelhos mexeram no rating: o último dia fica com o rating juntado.
  if (both && list.length) list[list.length - 1] = [list[list.length - 1][0], Math.round(rating)]
  return list
}

function mergeDays(base: AppState['days'], local: AppState['days'], remote: AppState['days']): AppState['days'] {
  const out: AppState['days'] = {}
  for (const day of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const r = remote[day] ?? {}
    const l = local[day] ?? {}
    const b = base[day] ?? {}
    const blocks: Record<string, number> = { ...r }
    for (const k of Object.keys(l)) {
      const add = more(l[k] ?? 0, b[k] ?? 0)
      if (add > 0 || k in r) blocks[k] = (r[k] ?? 0) + add
    }
    if (Object.keys(blocks).length) out[day] = blocks
  }
  return out
}

function maxRecords(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v)
  return out
}

function mergeReview(base: ReviewCard[], local: ReviewCard[], remote: ReviewCard[]): ReviewCard[] {
  const before = new Map(base.map((c) => [c.id, c]))
  const here = new Map(local.map((c) => [c.id, c]))
  const out = new Map(remote.map((c) => [c.id, c]))
  for (const [id, card] of here) {
    const old = before.get(id)
    // Cartão novo aqui, ou respondido aqui desde a última sincronização.
    if (old ? !same(old, card) : !out.has(id)) out.set(id, card)
  }
  // Cartão que saiu daqui (dominado ou apagado) sai da conta também.
  for (const id of before.keys()) if (!here.has(id)) out.delete(id)
  return [...out.values()].sort((a, b) => b.created - a.created).slice(0, REVIEW_MAX)
}

function mergeGames(local: GameRecord[], remote: GameRecord[]): GameRecord[] {
  const out = new Map(remote.map((g) => [g.id, g]))
  for (const g of local) {
    const r = out.get(g.id)
    // A cópia da conta pode vir sem a análise das partidas antigas (limite de tamanho).
    if (!r || (!r.evals && g.evals)) out.set(g.id, g)
  }
  return [...out.values()].sort((a, b) => b.date - a.date).slice(0, GAMES_MAX)
}

function mergeSeen(local: AppState, remote: AppState): Pick<AppState, 'seen' | 'seenSig'> {
  const seen = { ...remote.seen }
  const seenSig = { ...remote.seenSig }
  for (const k of new Set([...Object.keys(local.seen), ...Object.keys(local.seenSig)])) {
    if (local.seenSig[k] === remote.seenSig[k]) {
      const have = new Set(remote.seen[k] ?? [])
      seen[k] = [...(remote.seen[k] ?? []), ...(local.seen[k] ?? []).filter((id) => !have.has(id))]
    } else {
      // Pacote de problemas de outra versão do app: vale a lista deste aparelho.
      seen[k] = local.seen[k] ?? []
      seenSig[k] = local.seenSig[k]
    }
  }
  return { seen, seenSig }
}

/** Junta o progresso deste aparelho (`local`) com o da conta (`remote`), a partir da `base`. */
export function merge3(base: AppState, local: AppState, remote: AppState): AppState {
  // Outro aparelho apagou o progresso ou restaurou um backup depois da última sincronização
  // daqui: a conta vale como está. (Na primeira entrada a base é vazia e tudo daqui entra.)
  const reset = remote.resetAt ?? 0
  if (base.updatedAt > 0 && reset > (base.resetAt ?? 0) && reset > (local.resetAt ?? 0)) return remote
  const { rating, both } = mergeRating(base.puzzle, local.puzzle, remote.puzzle)
  const created = [local.profile.created, remote.profile.created].filter((t) => t > 0)
  const seqLocal = local.records.seqBest > remote.records.seqBest
  const bot = same(local.bot, base.bot)
    ? remote.bot
    : same(remote.bot, base.bot)
      ? local.bot
      : { ladder: Math.round(remote.bot.ladder + (local.bot.ladder - base.bot.ladder)), games: remote.bot.games + more(local.bot.games, base.bot.games) }
  const levels: AppState['levels'] = {}
  for (const k of new Set([...Object.keys(remote.levels), ...Object.keys(local.levels)])) {
    const l = mergeLevel(base.levels[k], local.levels[k], remote.levels[k])
    if (l) levels[k] = l
  }

  return {
    ...remote,
    v: 1,
    rev: Math.max(local.rev ?? 0, remote.rev ?? 0),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    resetAt: Math.max(local.resetAt ?? 0, remote.resetAt ?? 0) || undefined,
    settings: pickFields(base.settings, local.settings, remote.settings),
    profile: {
      ...pickFields(base.profile, local.profile, remote.profile),
      created: created.length ? Math.min(...created) : Date.now(),
      onboarded: !!(local.profile.onboarded || remote.profile.onboarded) || undefined,
    },
    puzzle: rating,
    ratingHistory: mergeHistory(base.ratingHistory, local.ratingHistory, remote.ratingHistory, rating.r, both),
    levels,
    ...mergeSeen(local, remote),
    days: mergeDays(base.days, local.days, remote.days),
    records: {
      seqBest: seqLocal ? local.records.seqBest : remote.records.seqBest,
      seqBestLevel: seqLocal ? local.records.seqBestLevel : remote.records.seqBestLevel,
      stormBest: Math.max(local.records.stormBest, remote.records.stormBest),
      calcBest: Math.max(local.records.calcBest, remote.records.calcBest),
      pressure: maxRecords(remote.records.pressure, local.records.pressure),
      blind: maxRecords(remote.records.blind, local.records.blind),
    },
    bot,
    review: mergeReview(base.review, local.review, remote.review),
    games: mergeGames(local.games, remote.games),
  }
}
