import { useEffect, useRef, useState } from 'react'
import { addTrainingSeconds } from '../lib/state'

/** Hash da rota (#mate, #jogar...). */
export function useRoute(): string {
  const read = () => decodeURIComponent(location.hash.replace(/^#/, '')) || 'hoje'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(route: string) {
  if (location.hash.replace(/^#/, '') === route) return
  location.hash = route
}

/**
 * Soma tempo de treino ao bloco da rotina enquanto a tela está visível e o usuário
 * mexeu no app no último minuto e meio (ou enquanto `alwaysActive`, como numa partida).
 */
export function useTrainingTimer(block: string, alwaysActive = false) {
  const lastInput = useRef(Date.now())
  const acc = useRef(0)
  const always = useRef(alwaysActive)
  always.current = alwaysActive
  useEffect(() => {
    const mark = () => (lastInput.current = Date.now())
    window.addEventListener('pointerdown', mark)
    window.addEventListener('keydown', mark)
    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (always.current || Date.now() - lastInput.current < 90000) acc.current += 1
      if (acc.current >= 15) {
        addTrainingSeconds(block, acc.current)
        acc.current = 0
      }
    }, 1000)
    return () => {
      window.removeEventListener('pointerdown', mark)
      window.removeEventListener('keydown', mark)
      window.clearInterval(tick)
      if (acc.current > 0) addTrainingSeconds(block, acc.current)
      acc.current = 0
    }
  }, [block])
}

/** Relógio que atualiza a tela a cada `ms`. */
export function useNow(ms = 200, active = true): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms, active])
  return now
}
