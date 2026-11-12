import { describe, expect, it } from 'vitest'
import { emptyBase, merge3, slimBase } from '../lib/merge'
import { initialState, type AppState, type GameRecord, type ReviewCard } from '../lib/state'

const DAY = '2026-11-12'

function level(tries: number, solved: number, recent: number[] = []) {
  return { tries, solved, totalMs: tries * 1000, bestMs: 5000, recent }
}

function card(id: string, created: number, due = created + 86400000): ReviewCard {
  return { id, kind: 'problema', fen: 'x', line: ['e2e4'], note: '', created, due, step: 0, reps: 0, lapses: 0 }
}

function game(id: string, date: number): GameRecord {
  return { id, date, tc: '3+0', color: 'w', botElo: 1200, result: '1-0', reason: 'mate', moves: ['e4'] }
}

/** Aparelho que treinou: `n` problemas de mate em 3, `sec` segundos, um cartão e uma partida. */
function trained(s: AppState, tag: string, n: number, sec: number, when: number): AppState {
  const l = s.levels.mate3 ?? level(0, 0)
  return {
    ...s,
    updatedAt: when,
    levels: { ...s.levels, mate3: { ...l, tries: l.tries + n, solved: l.solved + n, totalMs: l.totalMs + n * 1000, recent: [...l.recent, ...Array(n).fill(1)].slice(-20) } },
    days: { ...s.days, [DAY]: { ...(s.days[DAY] ?? {}), mate: (s.days[DAY]?.mate ?? 0) + sec } },
    review: [card(`c-${tag}`, when), ...s.review],
    games: [game(`g-${tag}`, when), ...s.games],
    puzzle: { ...s.puzzle, r: s.puzzle.r + n, n: s.puzzle.n + n },
    ratingHistory: [[DAY, Math.round(s.puzzle.r + n)]],
  }
}

describe('junção do progresso de dois aparelhos', () => {
  it('primeiro login: soma o que já existia no aparelho com o que já estava na conta', () => {
    const pc = trained(initialState(1000), 'pc', 10, 600, 2000)
    const cel = trained(initialState(1500), 'cel', 4, 300, 3000)
    const m = merge3(emptyBase(), cel, pc)
    expect(m.levels.mate3.tries).toBe(14)
    expect(m.levels.mate3.solved).toBe(14)
    expect(m.days[DAY].mate).toBe(900)
    expect(m.review.map((c) => c.id).sort()).toEqual(['c-cel', 'c-pc'])
    expect(m.games.map((g) => g.id)).toEqual(['g-cel', 'g-pc'])
    expect(m.profile.created).toBe(1000)
  })

  it('sem mudança aqui desde a última sincronização, vale a conta como está', () => {
    const synced = trained(initialState(1000), 'a', 5, 100, 2000)
    const remote = trained(synced, 'b', 3, 50, 3000)
    const m = merge3(slimBase(synced), synced, remote)
    expect(m.levels).toEqual(remote.levels)
    expect(m.days).toEqual(remote.days)
    expect(m.puzzle).toEqual(remote.puzzle)
    expect(m.review).toEqual(remote.review)
  })

  it('sem mudança na conta, vale o aparelho', () => {
    const synced = trained(initialState(1000), 'a', 5, 100, 2000)
    const local = trained(synced, 'b', 3, 50, 3000)
    const m = merge3(slimBase(synced), local, synced)
    expect(m.levels).toEqual(local.levels)
    expect(m.days).toEqual(local.days)
    expect(m.puzzle).toEqual(local.puzzle)
    expect(m.review.map((c) => c.id)).toEqual(local.review.map((c) => c.id))
  })

  it('os dois mudaram: soma só o que cada um fez desde a base, sem contar duas vezes', () => {
    const synced = trained(initialState(1000), 'a', 5, 100, 2000)
    const local = trained(synced, 'aqui', 2, 30, 3000)
    const remote = trained(synced, 'la', 7, 70, 4000)
    const m = merge3(slimBase(synced), local, remote)
    expect(m.levels.mate3.tries).toBe(14)
    expect(m.levels.mate3.recent.length).toBe(14)
    expect(m.days[DAY].mate).toBe(200)
    expect(m.puzzle.n).toBe(14)
    expect(m.puzzle.r).toBe(1514)
    expect(m.ratingHistory).toEqual([[DAY, 1514]])
    expect(new Set(m.review.map((c) => c.id))).toEqual(new Set(['c-a', 'c-aqui', 'c-la']))
    expect(m.games.map((g) => g.id)).toEqual(['g-la', 'g-aqui', 'g-a'])
  })

  it('cartões: respondido aqui vale a resposta daqui; dominado aqui sai da conta', () => {
    const synced = { ...initialState(1000), review: [card('x', 1), card('y', 2), card('z', 3)] }
    const local = { ...synced, review: [{ ...card('x', 1), step: 2, due: 999 }, card('z', 3)] }
    const remote = { ...synced, review: [...synced.review, card('w', 4)] }
    const m = merge3(slimBase(synced), local, remote)
    expect(m.review.map((c) => c.id)).toEqual(['w', 'z', 'x'])
    expect(m.review.find((c) => c.id === 'x')?.step).toBe(2)
  })

  it('recordes ficam com o maior; ajustes mudados aqui valem', () => {
    const synced = initialState(1000)
    const local = {
      ...synced,
      settings: { ...synced.settings, sound: false },
      records: { ...synced.records, stormBest: 12, seqBest: 3, seqBestLevel: 1, pressure: { 'mate3-5': 9 }, blind: { 'visao-cor': 20 } },
    }
    const remote = {
      ...synced,
      settings: { ...synced.settings, theme: 'dark' as const },
      records: { ...synced.records, stormBest: 15, seqBest: 5, seqBestLevel: 2, pressure: { 'mate3-5': 4, 'mate4-10': 7 }, blind: { 'visao-cor': 25 } },
    }
    const m = merge3(slimBase(synced), local, remote)
    expect(m.settings.sound).toBe(false)
    expect(m.settings.theme).toBe('dark')
    expect(m.records.stormBest).toBe(15)
    expect(m.records.seqBest).toBe(5)
    expect(m.records.seqBestLevel).toBe(2)
    expect(m.records.pressure).toEqual({ 'mate3-5': 9, 'mate4-10': 7 })
    expect(m.records.blind).toEqual({ 'visao-cor': 25 })
  })

  it('problemas já vistos: junta as duas listas do mesmo pacote', () => {
    const synced = initialState(1000)
    const local = { ...synced, seen: { mate3: ['a', 'b'] }, seenSig: { mate3: 's1' } }
    const remote = { ...synced, seen: { mate3: ['b', 'c'], mate4: ['d'] }, seenSig: { mate3: 's1', mate4: 's2' } }
    const m = merge3(slimBase(synced), local, remote)
    expect(m.seen.mate3).toEqual(['b', 'c', 'a'])
    expect(m.seen.mate4).toEqual(['d'])
  })

  it('partidas: no máximo 60, as mais novas, e a cópia com análise ganha', () => {
    const many = Array.from({ length: 50 }, (_, i) => game(`r${i}`, 1000 + i))
    const mine = Array.from({ length: 20 }, (_, i) => game(`l${i}`, 2000 + i))
    const withEvals = { ...many[49], evals: [1, 2, 3] }
    const synced = initialState(1000)
    const m = merge3(slimBase(synced), { ...synced, games: [...mine, withEvals] }, { ...synced, games: many })
    expect(m.games.length).toBe(60)
    expect(m.games[0].id).toBe('l19')
    expect(m.games.find((g) => g.id === 'r49')?.evals).toEqual([1, 2, 3])
  })

  it('progresso apagado em outro aparelho: a conta vale e nada volta daqui', () => {
    const synced = trained(initialState(1000), 'a', 5, 100, 2000)
    const local = trained(synced, 'aqui', 2, 30, 3000)
    const remote = { ...initialState(4000), updatedAt: 4000, resetAt: 4000, settings: synced.settings }
    const m = merge3(slimBase(synced), local, remote)
    expect(m).toBe(remote)
  })

  it('primeira entrada numa conta que já foi apagada antes: o que existe aqui entra', () => {
    const remote = { ...trained(initialState(1000), 'conta', 3, 30, 5000), resetAt: 4000 }
    const local = trained(initialState(2000), 'aqui', 2, 20, 6000)
    const m = merge3(emptyBase(), local, remote)
    expect(m.levels.mate3.tries).toBe(5)
    expect(m.resetAt).toBe(4000)
  })

  it('nível que só existe aqui sem nada novo não vira entrada vazia', () => {
    const synced = { ...initialState(1000), updatedAt: 1, levels: { mate4: level(3, 1) }, days: { [DAY]: { mate: 10 } } }
    const remote = { ...initialState(1000), updatedAt: 2 }
    const m = merge3(slimBase(synced), synced, remote)
    expect(m.levels).toEqual({})
    expect(m.days).toEqual({})
  })

  it('dois aparelhos indo e voltando várias vezes: o total é a soma de tudo o que foi feito', () => {
    // Servidor com versão; cada aparelho guarda a base (o que sabe que está na conta).
    let server: { v: number; data: AppState | null } = { v: 0, data: null }
    type Dev = { local: AppState; base: AppState; v: number }
    const pull = (d: Dev) => {
      if (server.data && server.v !== d.v) {
        d.local = merge3(d.base, d.local, server.data)
        d.base = slimBase(server.data)
        d.v = server.v
      }
    }
    const push = (d: Dev) => {
      for (;;) {
        if (server.v !== d.v) {
          pull(d)
          continue
        }
        server = { v: server.v + 1, data: d.local }
        d.v = server.v
        d.base = slimBase(d.local)
        return
      }
    }
    const pc: Dev = { local: trained(initialState(1), 'pc0', 10, 100, 10), base: emptyBase(), v: 0 }
    const cel: Dev = { local: trained(initialState(2), 'cel0', 3, 30, 20), base: emptyBase(), v: 0 }
    push(pc) // cria a conta no computador
    pull(cel)
    push(cel) // entra no celular: 13
    pull(pc)
    expect(pc.local.levels.mate3.tries).toBe(13)
    // Os dois treinam sem sincronizar, várias rodadas.
    let t = 100
    for (let round = 0; round < 5; round++) {
      pc.local = trained(pc.local, `pc${round + 1}`, 2, 20, t++)
      cel.local = trained(cel.local, `cel${round + 1}`, 1, 10, t++)
      if (round % 2) {
        push(cel)
        push(pc)
      } else {
        push(pc)
        push(cel)
      }
    }
    pull(pc)
    pull(cel)
    const total = 10 + 3 + 5 * 2 + 5 * 1
    expect(pc.local.levels.mate3.tries).toBe(total)
    expect(cel.local.levels.mate3.tries).toBe(total)
    expect(pc.local.days[DAY].mate).toBe(100 + 30 + 5 * 20 + 5 * 10)
    expect(cel.local.days[DAY]).toEqual(pc.local.days[DAY])
    expect(pc.local.puzzle.n).toBe(total)
    expect(pc.local.review.length).toBe(12)
    expect(new Set(cel.local.games.map((g) => g.id))).toEqual(new Set(pc.local.games.map((g) => g.id)))
  })
})
