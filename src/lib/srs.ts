// Revisão espaçada dos erros: acertou, o intervalo cresce; errou, volta para 1 dia.
export const INTERVALS = [1, 3, 7, 14, 30, 60]
const DAY = 86400000

export interface Schedule { due: number; step: number; reps: number; lapses: number }

export function firstSchedule(now = Date.now()): Schedule {
  return { due: now + DAY, step: 0, reps: 0, lapses: 0 }
}

export function review(s: Schedule, ok: boolean, now = Date.now()): Schedule {
  if (ok) {
    const step = Math.min(INTERVALS.length - 1, s.step + 1)
    return { due: now + INTERVALS[step] * DAY, step, reps: s.reps + 1, lapses: s.lapses }
  }
  return { due: now + INTERVALS[0] * DAY, step: 0, reps: s.reps + 1, lapses: s.lapses + 1 }
}

/** Um cartão sai da fila depois de acertar no intervalo mais longo. */
export function isMastered(s: Schedule) {
  return s.step >= INTERVALS.length - 1 && s.lapses === 0
}
