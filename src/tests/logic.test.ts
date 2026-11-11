import { describe, expect, it } from 'vitest'
import { judge, winChance } from '../lib/analysis'
import { BOT_MAX, BOT_MIN, ladderAfter, pickWeighted, recommend, searchFor, thinkTime, UCI_ELO_MIN } from '../lib/bot'
import { flagged, newClock, press, remaining, start, stop } from '../lib/clock'
import { INITIAL_RATING, update } from '../lib/rating'
import { bestStreak, blockMinutes, BLOCKS, dayComplete, nextBlock, streak } from '../lib/routine'
import { firstSchedule, INTERVALS, isMastered, review } from '../lib/srs'
import { addDays, daysBetween, formatClock, formatMinutes, formatSolve } from '../lib/time'
import type { EngineLine } from '../engine/engine'

describe('rating de problemas (Glicko-1)', () => {
  it('sobe ao acertar e desce ao errar', () => {
    const up = update(INITIAL_RATING, 1500, true)
    const down = update(INITIAL_RATING, 1500, false)
    expect(up.r).toBeGreaterThan(1500)
    expect(down.r).toBeLessThan(1500)
    expect(up.n).toBe(1)
  })
  it('acertar problema difícil vale mais que acertar problema fácil', () => {
    const hard = update(INITIAL_RATING, 1900, true).r - 1500
    const easy = update(INITIAL_RATING, 1100, true).r - 1500
    expect(hard).toBeGreaterThan(easy)
  })
  it('um problema sozinho mexe no máximo 120 pontos', () => {
    const p = { r: 1560, rd: 300, n: 1 }
    expect(p.r - update(p, 1200, false).r).toBeLessThanOrEqual(120)
    expect(update(p, 2400, true).r - p.r).toBeLessThanOrEqual(120)
  })
  it('a incerteza cai com o uso, mas não abaixo do mínimo', () => {
    let p = INITIAL_RATING
    for (let i = 0; i < 200; i++) p = update(p, 1500, i % 2 === 0)
    expect(p.rd).toBeGreaterThanOrEqual(60)
    expect(p.rd).toBeLessThan(INITIAL_RATING.rd)
  })
})

describe('revisão espaçada', () => {
  it('acerto aumenta o intervalo, erro volta para 1 dia', () => {
    const now = 0
    const s0 = firstSchedule(now)
    expect(s0.due).toBe(86400000)
    const s1 = review(s0, true, now)
    expect(s1.step).toBe(1)
    expect(s1.due).toBe(INTERVALS[1] * 86400000)
    const s2 = review(s1, false, now)
    expect(s2.step).toBe(0)
    expect(s2.lapses).toBe(1)
  })
  it('sai da fila só depois de acertar todos os intervalos sem errar', () => {
    let s = firstSchedule(0)
    for (let i = 0; i < INTERVALS.length - 1; i++) s = review(s, true, 0)
    expect(isMastered(s)).toBe(true)
    let t = review(firstSchedule(0), false, 0)
    for (let i = 0; i < 10; i++) t = review(t, true, 0)
    expect(isMastered(t)).toBe(false)
  })
})

describe('relógio', () => {
  it('desconta o tempo de quem está com a vez e soma o incremento', () => {
    let c = newClock(60000, 2000)
    c = start(c, 'w', 1000)
    expect(remaining(c, 'w', 4000)).toBe(57000)
    expect(remaining(c, 'b', 4000)).toBe(60000)
    c = press(c, 'w', 4000)
    expect(c.w).toBe(59000)
    expect(c.running).toBe('b')
    expect(remaining(c, 'b', 9000)).toBe(55000)
  })
  it('acusa a queda da bandeira e para', () => {
    let c = start(newClock(1000, 0), 'b', 0)
    expect(flagged(c, 999)).toBeNull()
    expect(flagged(c, 1000)).toBe('b')
    c = stop(c, 500)
    expect(c.running).toBeNull()
    expect(c.b).toBe(500)
    expect(flagged(c, 99999)).toBeNull()
  })
})

describe('rotina diária', () => {
  it('a divisão dos blocos fecha exatamente o tempo escolhido', () => {
    for (const m of [60, 90, 120, 180, 240]) {
      const mins = blockMinutes(m)
      const sum = Object.values(mins).reduce((a, b) => a + b, 0)
      expect(sum).toBe(m)
      for (const v of Object.values(mins)) expect(v).toBeGreaterThanOrEqual(5)
    }
  })
  it('o próximo bloco segue a ordem e some quando tudo foi feito', () => {
    const mins = blockMinutes(120)
    expect(nextBlock(undefined, 120)?.id).toBe(BLOCKS[0].id)
    const day: Record<string, number> = { [BLOCKS[0].id]: mins[BLOCKS[0].id] * 60 }
    expect(nextBlock(day, 120)?.id).toBe(BLOCKS[1].id)
    const all = Object.fromEntries(BLOCKS.map((b) => [b.id, mins[b.id] * 60]))
    expect(nextBlock(all, 120)).toBeNull()
    expect(dayComplete(all, 120)).toBe(true)
  })
  it('dias seguidos: hoje só conta depois de cumprido', () => {
    const full = { mate: 120 * 60 }
    const days = { '2026-11-08': full, '2026-11-09': full, '2026-11-10': full }
    expect(streak(days, 120, '2026-11-11')).toBe(3)
    expect(streak({ ...days, '2026-11-11': { mate: 600 } }, 120, '2026-11-11')).toBe(3)
    expect(streak({ ...days, '2026-11-11': full }, 120, '2026-11-11')).toBe(4)
    expect(streak({ '2026-11-08': full }, 120, '2026-11-11')).toBe(0)
  })
  it('recorde de dias seguidos', () => {
    const full = { mate: 7200 }
    const days = { '2026-10-01': full, '2026-10-02': full, '2026-10-04': full, '2026-10-05': full, '2026-10-06': full }
    expect(bestStreak(days, 120)).toBe(3)
  })
})

describe('datas e formatos', () => {
  it('soma dias atravessando meses', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-11-01', '2026-11-11')).toBe(10)
  })
  it('relógio com décimos abaixo de 10 segundos', () => {
    expect(formatClock(185000)).toBe('3:05')
    expect(formatClock(9400)).toBe('0:09.4')
    expect(formatClock(-5)).toBe('0:00.0')
    expect(formatSolve(12400)).toBe('12,4 s')
    expect(formatSolve(65000)).toBe('1:05')
    expect(formatMinutes(90)).toBe('1 h 30 min')
    expect(formatMinutes(120)).toBe('2 h')
  })
})

describe('bot', () => {
  const line = (cp: number, move: string): EngineLine => ({ multipv: 1, depth: 10, score: { kind: 'cp', cp }, pv: [move] }) as EngineLine
  it('usa a escala UCI_Elo do motor a partir de 1320 e sorteio abaixo', () => {
    expect(searchFor(1500)).toEqual({ limitElo: 1500 })
    const weak = searchFor(900)
    expect(weak.limitElo).toBeUndefined()
    expect(weak.multipv).toBe(5)
    expect(weak.temperature).toBeGreaterThan(searchFor(1200).temperature!)
    expect(UCI_ELO_MIN).toBe(1320)
  })
  it('o sorteio prefere o melhor lance e respeita a cor', () => {
    const lines = [line(300, 'a2a4'), line(-300, 'b2b4')]
    // Para as brancas, +300 é melhor; com temperatura baixa sai sempre o melhor.
    expect(pickWeighted(lines, 'w', 1, () => 0.99)).toBe('a2a4')
    // Para as pretas, -300 (vantagem delas) é melhor.
    expect(pickWeighted(lines, 'b', 1, () => 0.99)).toBe('b2b4')
    expect(pickWeighted([], 'w', 10)).toBeNull()
  })
  it('tempo de pensar nunca passa do que o relógio permite', () => {
    for (const ms of [500, 3000, 20000, 180000]) {
      for (const r of [0, 0.5, 0.999]) {
        const t = thinkTime(ms, 0, 30, () => r)
        expect(t).toBeLessThanOrEqual(Math.max(120, ms * 0.12, 80))
        expect(t).toBeLessThanOrEqual(8000)
      }
    }
  })
  it('desempenho sobe ao vencer um bot mais forte e desce ao perder para um mais fraco', () => {
    expect(ladderAfter(1200, 1, 1400, 0)).toBeGreaterThan(1200)
    expect(ladderAfter(1200, 0, 1000, 20)).toBeLessThan(1200)
    expect(ladderAfter(1200, 0.5, 1200, 20)).toBe(1200)
  })
  it('recomendação: só o desempenho até 10 problemas, depois mistura os dois', () => {
    expect(recommend(1500, 5, 1200).elo).toBe(1200)
    expect(recommend(1500, 5, 1200).fromPuzzles).toBeNull()
    const r = recommend(1900, 40, 1200)
    expect(r.fromPuzzles).toBe(1600)
    expect(r.elo).toBe(1400)
    expect(recommend(400, 40, 100).elo).toBe(BOT_MIN)
    expect(recommend(4000, 40, 4000).elo).toBe(BOT_MAX)
  })
})

describe('análise das partidas', () => {
  it('classifica pela queda da chance de vitória', () => {
    expect(judge(0.5, 0.1)).toBe('blunder')
    expect(judge(0.5, 0.28)).toBe('mistake')
    expect(judge(0.5, 0.38)).toBe('inaccuracy')
    expect(judge(0.5, 0.45)).toBeNull()
    expect(judge(0.2, 0.6)).toBeNull()
  })
  it('chance de vitória fica no ponto de vista de quem joga', () => {
    const s = { kind: 'cp' as const, cp: 200 }
    expect(winChance(s, 'w')).toBeGreaterThan(0)
    expect(winChance(s, 'b')).toBeCloseTo(-winChance(s, 'w'))
    expect(winChance({ kind: 'mate', winner: 'b', moves: 3 }, 'b')).toBe(1)
  })
})
