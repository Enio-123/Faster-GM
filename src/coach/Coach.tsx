// "Tempo", o treinador do Faster GM: um cavalo de xadrez geométrico com a crina em faixas
// de velocidade. Personagem original do app, sem relação com pessoas reais.
export type Mood = 'idle' | 'focus' | 'happy' | 'sad' | 'think'

export const COACH_NAME = 'Tempo'

export function Coach({ mood = 'idle', size, title }: { mood?: Mood; size?: number; title?: string }) {
  return (
    <svg
      className={`coach ${mood}`}
      viewBox="0 0 120 140"
      width={size}
      height={size ? (size * 140) / 120 : undefined}
      role="img"
      aria-label={title ?? `${COACH_NAME}, o treinador`}
    >
      <g className="c-whole">
        <g className="c-stripes">
          <path className="c-stripe c-s1" d="M8 45 H44 L41 52 H5 Z" />
          <path className="c-stripe c-s1" d="M2 59 H40 L37 66 H-1 Z" />
          <path className="c-stripe c-s1" d="M10 73 H40 L37 80 H7 Z" />
        </g>
        <path
          className="c-body"
          d="M35 111 C30 95 29 70 36 50 C39 40 43 32 47 26 L51 8 L61 23 C73 24 85 32 95 44 L104 55 C109 61 109 68 104 72 C99 75 92 75 84 74 C78 74 74 77 72 82 C70 90 74 101 85 111 Z"
        />
        <rect className="c-base" x="27" y="114" width="64" height="7" rx="3.5" />
        <rect className="c-base" x="19" y="124" width="80" height="11" rx="4" />
        <circle className="c-eye" cx="100.5" cy="64" r="1.7" />
        <g className="c-lid">
          {mood === 'happy' ? (
            <path d="M68.5 47 Q74 39.5 79.5 47" fill="none" stroke="var(--coach-line)" strokeWidth="3.2" strokeLinecap="round" />
          ) : mood === 'sad' ? (
            <path d="M68.5 44.5 Q74 49 79.5 44.5" fill="none" stroke="var(--coach-line)" strokeWidth="3.2" strokeLinecap="round" />
          ) : mood === 'focus' ? (
            <>
              <ellipse className="c-eye" cx="74" cy="45" rx="5" ry="2.4" />
              <path d="M67 38.5 L81 41" fill="none" stroke="var(--coach-line)" strokeWidth="2.6" strokeLinecap="round" />
            </>
          ) : mood === 'think' ? (
            <ellipse className="c-eye" cx="76" cy="42.5" rx="4.3" ry="4.8" />
          ) : (
            <ellipse className="c-eye" cx="74" cy="44.5" rx="4.6" ry="5.1" />
          )}
        </g>
        {mood === 'think' && (
          <g className="c-dots">
            <circle cx="98" cy="26" r="2.6" />
            <circle cx="106" cy="19" r="3" />
            <circle cx="115" cy="11" r="3.4" />
          </g>
        )}
      </g>
    </svg>
  )
}
