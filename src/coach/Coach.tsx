// "Tempo", o treinador e bot do Faster GM: o cavalo coroado do ícone, com as faixas de velocidade
// atrás da crina. As reações (pulo, cabeça baixa, inclinação, pontinhos) vêm do movimento.
import knight from '../assets/brand/cavalo-coroa.webp'

export type Mood = 'idle' | 'focus' | 'happy' | 'sad' | 'think'

export const COACH_NAME = 'Tempo'

export function Coach({ mood = 'idle', size, title }: { mood?: Mood; size?: number; title?: string }) {
  return (
    <span className={`coach ${mood}`} role="img" aria-label={title ?? `${COACH_NAME}, o treinador`} style={size ? { width: size } : undefined}>
      <span className="c-stripes" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="c-whole">
        <img className="c-piece" src={knight} alt="" draggable={false} />
      </span>
      {mood === 'think' && (
        <span className="c-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  )
}
