import { useEffect, useRef, useState } from 'react'
import knight from '../assets/brand/cavalo-coroa.webp'

/**
 * Abertura curta: o cavalo coroado entra em disparada, a coroa brilha e o nome aparece.
 * Só começa quando a imagem do cavalo carregou (ou depois de 1,5 s). Toque para pular.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const [ready, setReady] = useState(false)
  const [out, setOut] = useState(false)
  const img = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (img.current?.complete) setReady(true)
    const fallback = window.setTimeout(() => setReady(true), 1500)
    return () => window.clearTimeout(fallback)
  }, [])

  useEffect(() => {
    if (!ready) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t1 = window.setTimeout(() => setOut(true), reduce ? 600 : 2300)
    const t2 = window.setTimeout(onDone, reduce ? 800 : 2650)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [ready, onDone])

  const mask = { WebkitMaskImage: `url(${knight})`, maskImage: `url(${knight})` }
  return (
    <div className={`intro${ready ? ' ready' : ''}${out ? ' out' : ''}`} onClick={onDone} role="presentation">
      <div className="intro-glow" aria-hidden="true" />
      <div className="intro-stage">
        <div className="intro-lines" aria-hidden="true">
          <span style={{ top: '18%', width: '90%', animationDelay: '0.05s' }} />
          <span style={{ top: '45%', width: '100%', animationDelay: '0s' }} />
          <span style={{ top: '72%', width: '80%', animationDelay: '0.1s' }} />
        </div>
        <div className="intro-piece">
          <img ref={img} src={knight} alt="" draggable={false} onLoad={() => setReady(true)} onError={() => setReady(true)} />
          <span className="intro-shine" style={mask} aria-hidden="true" />
        </div>
        <div className="intro-word">
          Faster <b>GM</b>
        </div>
        <div className="intro-tag">Treino diário. Cálculo rápido.</div>
      </div>
    </div>
  )
}
