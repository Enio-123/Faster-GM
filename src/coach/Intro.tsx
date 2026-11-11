import { useEffect, useState } from 'react'
import { Coach } from './Coach'

/** Abertura curta: o Tempo entra em disparada e o nome aparece. Toque para pular. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [out, setOut] = useState(false)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t1 = window.setTimeout(() => setOut(true), reduce ? 600 : 2100)
    const t2 = window.setTimeout(onDone, reduce ? 800 : 2450)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [onDone])
  return (
    <div className={`intro${out ? ' out' : ''}`} onClick={onDone} role="presentation">
      <div className="intro-stage">
        <div className="intro-lines" aria-hidden="true">
          <span style={{ top: '18%', width: '90%', animationDelay: '0.05s' }} />
          <span style={{ top: '45%', width: '100%', animationDelay: '0s' }} />
          <span style={{ top: '72%', width: '80%', animationDelay: '0.1s' }} />
        </div>
        <div className="intro-coach">
          <Coach mood="focus" title="Tempo" />
        </div>
        <div className="intro-word">
          Faster <b>GM</b>
        </div>
        <div className="intro-tag">Treino diário. Cálculo rápido.</div>
      </div>
    </div>
  )
}
