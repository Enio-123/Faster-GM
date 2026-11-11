// Rotina diária. A ordem segue a lógica de treino que o app adota:
// aquecer com padrões rápidos, calcular fundo enquanto a cabeça está fresca,
// jogar partidas rápidas e, por último, estudar os próprios erros.
import { addDays, dayKey } from './time'

export type BlockId = 'aquecimento' | 'mate' | 'calculo' | 'partidas' | 'revisao'

export interface Block {
  id: BlockId
  name: string
  why: string
  weight: number
  /** Para onde o botão "Começar" leva. */
  route: string
}

export const BLOCKS: Block[] = [
  { id: 'aquecimento', name: 'Aquecimento relâmpago', why: 'Padrões táticos em velocidade, 3 minutos por rodada.', weight: 0.1, route: 'relampago' },
  { id: 'mate', name: 'Escada de mate', why: 'Mates longos, do seu degrau atual. Visualizar até o fim antes de mexer.', weight: 0.25, route: 'mate' },
  { id: 'calculo', name: 'Cálculo às cegas', why: 'A linha inteira na cabeça, com as peças paradas.', weight: 0.2, route: 'calculo' },
  { id: 'partidas', name: 'Partidas contra o Tempo', why: 'Blitz e bullet no nível recomendado.', weight: 0.3, route: 'jogar' },
  { id: 'revisao', name: 'Revisão dos erros', why: 'Seus erros de partidas e problemas voltam até virar reflexo.', weight: 0.15, route: 'erros' },
]

export function blockMinutes(dailyMinutes: number): Record<BlockId, number> {
  const out = {} as Record<BlockId, number>
  let used = 0
  BLOCKS.forEach((b, i) => {
    const m = i === BLOCKS.length - 1 ? dailyMinutes - used : Math.round((dailyMinutes * b.weight) / 5) * 5
    out[b.id] = Math.max(5, m)
    used += out[b.id]
  })
  return out
}

/** Bloco ao qual cada tela soma tempo. */
export const ROUTE_BLOCK: Record<string, BlockId> = {
  relampago: 'aquecimento',
  sequencia: 'mate',
  mate: 'mate',
  pressao: 'mate',
  calculo: 'calculo',
  jogar: 'partidas',
  erros: 'revisao',
}

export function totalSeconds(day: Record<string, number> | undefined): number {
  if (!day) return 0
  return Object.values(day).reduce((a, b) => a + b, 0)
}

export function dayComplete(day: Record<string, number> | undefined, dailyMinutes: number): boolean {
  return totalSeconds(day) >= dailyMinutes * 60
}

/** Dias seguidos com a rotina cumprida. Hoje só entra na conta quando já foi cumprido. */
export function streak(days: Record<string, Record<string, number>>, dailyMinutes: number, today = dayKey()): number {
  let n = 0
  let key = dayComplete(days[today], dailyMinutes) ? today : addDays(today, -1)
  while (dayComplete(days[key], dailyMinutes)) {
    n++
    key = addDays(key, -1)
  }
  return n
}

export function bestStreak(days: Record<string, Record<string, number>>, dailyMinutes: number): number {
  const keys = Object.keys(days).filter((k) => dayComplete(days[k], dailyMinutes)).sort()
  let best = 0
  let run = 0
  let prev = ''
  for (const k of keys) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return best
}

/** Próximo bloco ainda incompleto, na ordem da rotina. */
export function nextBlock(day: Record<string, number> | undefined, dailyMinutes: number): Block | null {
  const mins = blockMinutes(dailyMinutes)
  for (const b of BLOCKS) {
    if ((day?.[b.id] ?? 0) < mins[b.id] * 60) return b
  }
  return null
}
