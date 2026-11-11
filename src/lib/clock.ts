// Relógio de xadrez puro (sem React), para ser testável.
export type Side = 'w' | 'b'

export interface Clock {
  w: number
  b: number
  inc: number
  running: Side | null
  since: number
}

export function newClock(baseMs: number, incMs: number): Clock {
  return { w: baseMs, b: baseMs, inc: incMs, running: null, since: 0 }
}

export function remaining(c: Clock, side: Side, now: number): number {
  const t = c[side]
  return c.running === side ? Math.max(0, t - (now - c.since)) : t
}

export function start(c: Clock, side: Side, now: number): Clock {
  return { ...c, running: side, since: now }
}

/** Quem jogou aperta o relógio: desconta o tempo usado, soma o incremento e passa a vez. */
export function press(c: Clock, side: Side, now: number): Clock {
  const left = remaining(c, side, now)
  const other: Side = side === 'w' ? 'b' : 'w'
  return { ...c, [side]: left + c.inc, running: other, since: now }
}

export function stop(c: Clock, now: number): Clock {
  if (!c.running) return c
  return { ...c, [c.running]: remaining(c, c.running, now), running: null }
}

export function flagged(c: Clock, now: number): Side | null {
  if (c.running && remaining(c, c.running, now) <= 0) return c.running
  return null
}
