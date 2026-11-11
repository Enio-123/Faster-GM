// Datas no fuso do aparelho: o "dia de treino" vira à meia-noite local.
export function dayKey(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${m}-${day}`
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** 3:05 ou 0:09.4 (décimos abaixo de 10 s, como nos relógios de blitz). */
export function formatClock(ms: number): string {
  const t = Math.max(0, ms)
  if (t < 10000) {
    const s = Math.floor(t / 1000)
    const tenth = Math.floor((t % 1000) / 100)
    return `0:0${s}.${tenth}`
  }
  const total = Math.ceil(t / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Tempo gasto em um problema: 12,4 s ou 1:05. */
export function formatSolve(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 1 h 20 min, 45 min, 2 h */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export function weekdayShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}
