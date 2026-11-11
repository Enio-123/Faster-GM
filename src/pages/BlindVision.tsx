// Visão do tabuleiro: rodadas de 1 minuto sem peças. Ache a casa (tabuleiro sem coordenadas),
// cor da casa, mesma diagonal e saltos do cavalo (sem tabuleiro nenhum).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Board } from '../board/Board'
import { EMPTY_FEN, usePickBoard } from '../board/pickBoard'
import { Coach } from '../coach/Coach'
import { visionQuestion, visionWhy, type VisionDrill, type VisionQ } from '../lib/blind'
import { line } from '../lib/coach'
import { recordStat } from '../lib/progress'
import { recordBlind, useAppState } from '../lib/state'
import { playSound } from '../lib/sound'
import { formatClock } from '../lib/time'
import { go, useNow, usePrefs, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconRetry, IconX } from '../ui/icons'

export const VISION_DRILLS: { id: VisionDrill; label: string; short: string; how: string; ask: string }[] = [
  { id: 'casa', label: 'Ache a casa', short: 'casa', how: 'O app diz uma casa e você clica nela, num tabuleiro sem coordenadas.', ask: 'Clique na casa' },
  { id: 'cor', label: 'Cor da casa', short: 'cor', how: 'Sem tabuleiro na tela: a casa é clara ou escura?', ask: 'Clara ou escura?' },
  { id: 'diagonal', label: 'Mesma diagonal', short: 'diagonal', how: 'Sem tabuleiro na tela: as duas casas estão na mesma diagonal?', ask: 'Estão na mesma diagonal?' },
  { id: 'cavalo', label: 'Saltos do cavalo', short: 'cavalo', how: 'Sem tabuleiro na tela: quantos saltos o cavalo precisa, no mínimo, para ir de uma casa à outra?', ask: 'Quantos saltos, no mínimo?' },
]

const ROUND_MS = 60000
const WAIT_AFTER_MISS = 1400

interface Prefs {
  drill: VisionDrill
  side: 'w' | 'b'
}
const fixPrefs = (p: Prefs): Prefs => ({ drill: VISION_DRILLS.some((d) => d.id === p.drill) ? p.drill : 'casa', side: p.side === 'b' ? 'b' : 'w' })

interface MissItem {
  q: VisionQ
  given: string
}

const GIVEN_LABEL: Record<string, string> = { clara: 'clara', escura: 'escura', sim: 'sim', nao: 'não' }

function Prompt({ q }: { q: VisionQ }) {
  if (q.drill === 'diagonal')
    return (
      <span>
        {q.a} <span className="muted">e</span> {q.b}
      </span>
    )
  if (q.drill === 'cavalo')
    return (
      <span>
        {q.a} <span className="muted">→</span> {q.b}
      </span>
    )
  return <span>{q.a}</span>
}

export function BlindVision() {
  useTrainingTimer('calculo')
  const s = useAppState()
  const [prefs, setPrefs] = usePrefs<Prefs>('faster-gm:cegas-visao', { drill: 'casa', side: 'w' }, fixPrefs)
  const drill = VISION_DRILLS.find((d) => d.id === prefs.drill) ?? VISION_DRILLS[0]
  const [phase, setPhase] = useState<'start' | 'run' | 'end'>('start')
  const [q, setQ] = useState<VisionQ | null>(null)
  const [score, setScore] = useState(0)
  const [misses, setMisses] = useState<MissItem[]>([])
  const [deadline, setDeadline] = useState(0)
  const [lock, setLock] = useState<MissItem | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [best, setBest] = useState(0)
  const asked = useRef(0)
  const shownAt = useRef(0)
  const timers = useRef<number[]>([])
  const now = useNow(100, phase === 'run')
  const left = phase === 'run' ? Math.max(0, deadline - now) : ROUND_MS

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const nextQ = useCallback(
    (prev: VisionQ | null) => {
      asked.current++
      shownAt.current = Date.now()
      setQ(visionQuestion(prefs.drill, Math.random, prev))
    },
    [prefs.drill],
  )

  const start = () => {
    clearTimers()
    setScore(0)
    setMisses([])
    setLock(null)
    setFlash(null)
    asked.current = 0
    setDeadline(Date.now() + ROUND_MS)
    setPhase('run')
    nextQ(null)
  }

  const finish = useCallback(() => {
    clearTimers()
    setPhase('end')
    setLock(null)
    playSound('end')
    setBest(recordBlind('visao-' + prefs.drill, score))
  }, [prefs.drill, score])

  useEffect(() => {
    if (phase === 'run' && left <= 0) finish()
  }, [phase, left, finish])

  const answer = useCallback(
    (given: string) => {
      if (phase !== 'run' || lock || !q) return
      const ok = given === q.answer
      recordStat('visao-' + q.drill, ok, Date.now() - shownAt.current)
      if (ok) {
        playSound('move')
        setScore((n) => n + 1)
        if (q.drill === 'casa') {
          setFlash(given)
          later(() => setFlash((f) => (f === given ? null : f)), 260)
        }
        nextQ(q)
        return
      }
      playSound('error')
      const item = { q, given }
      setMisses((m) => [...m, item])
      setLock(item)
      later(() => {
        setLock(null)
        nextQ(q)
      }, WAIT_AFTER_MISS)
    },
    [phase, lock, q, nextQ],
  )

  // Teclado: 1 e 2 (ou c/e, s/n) e os números dos saltos.
  useEffect(() => {
    if (phase !== 'run' || !q || q.drill === 'casa') return
    const on = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (q.drill === 'cor') {
        if (k === '1' || k === 'c') answer('clara')
        if (k === '2' || k === 'e') answer('escura')
      } else if (q.drill === 'diagonal') {
        if (k === '1' || k === 's') answer('sim')
        if (k === '2' || k === 'n') answer('nao')
      } else if (/^[1-6]$/.test(k)) answer(k)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [phase, q, answer])

  const pickBoard = usePickBoard(useCallback((sq: string) => answer(sq), [answer]))
  const marks: Record<string, 'good' | 'bad' | 'hint'> = {}
  if (lock && lock.q.drill === 'casa') {
    marks[lock.given] = 'bad'
    marks[lock.q.answer] = 'good'
  } else if (flash) marks[flash] = 'good'

  const header = (
    <div className="row">
      <button className="icon-btn" onClick={() => (phase === 'run' ? finish() : go('cegas'))} aria-label={phase === 'run' ? 'Encerrar a rodada' : 'Voltar para às cegas'}>
        <IconArrowLeft />
      </button>
      <h2>Visão do tabuleiro</h2>
    </div>
  )

  if (phase === 'run' && q) {
    const counters = (
      <div className="row">
        <span className="pill pill-good num" style={{ fontSize: 14 }}>
          {score} {score === 1 ? 'certa' : 'certas'}
        </span>
        {misses.length > 0 && (
          <span className="pill pill-bad num" style={{ fontSize: 14 }}>
            {misses.length} {misses.length === 1 ? 'erro' : 'erros'}
          </span>
        )}
        <span className={`clock run${left < 10000 ? ' low' : ''}`} aria-label="Tempo restante">
          {formatClock(left)}
        </span>
      </div>
    )
    const feedback = (
      <div className="vision-feedback" aria-live="polite">
        {lock ? (
          <div className="feedback bad">
            <IconX />
            <span>{visionWhy(lock.q)}</span>
          </div>
        ) : null}
      </div>
    )
    if (q.drill === 'casa')
      return (
        <div className="page page-train">
          <div className="row-between">
            {header}
            {counters}
          </div>
          <div className="train">
            <div className="train-board">
              <div className="only-narrow casa-narrow" aria-live="polite">
                <span className="eyebrow">{drill.ask}</span>
                <span className="vision-prompt num">
                  <Prompt q={q} />
                </span>
              </div>
              <div className="board-frame">
                <Board fen={EMPTY_FEN} orientation={prefs.side} ix={pickBoard} marks={marks} coordinates={false} hidePieces />
              </div>
            </div>
            <aside className="train-side">
              <span className="eyebrow only-wide">{drill.ask}</span>
              <div className="vision-prompt num only-wide" aria-live="polite">
                <Prompt q={q} />
              </div>
              <p className="muted" style={{ fontSize: 14 }}>
                {prefs.side === 'w' ? 'Brancas embaixo.' : 'Pretas embaixo.'} Sem coordenadas: a casa tem que estar na sua cabeça.
              </p>
              {feedback}
            </aside>
          </div>
        </div>
      )
    return (
      <div className="page">
        <div className="row-between">
          {header}
          {counters}
        </div>
        <section className="panel vision-run">
          <span className="eyebrow">{drill.ask}</span>
          <div className="vision-prompt num" aria-live="polite">
            <Prompt q={q} />
          </div>
          {q.drill === 'cor' && (
            <div className="vision-answers two">
              <button type="button" className="btn btn-lg" disabled={!!lock} onClick={() => answer('clara')}>
                Clara
              </button>
              <button type="button" className="btn btn-lg" disabled={!!lock} onClick={() => answer('escura')}>
                Escura
              </button>
            </div>
          )}
          {q.drill === 'diagonal' && (
            <div className="vision-answers two">
              <button type="button" className="btn btn-lg" disabled={!!lock} onClick={() => answer('sim')}>
                Sim
              </button>
              <button type="button" className="btn btn-lg" disabled={!!lock} onClick={() => answer('nao')}>
                Não
              </button>
            </div>
          )}
          {q.drill === 'cavalo' && (
            <div className="vision-answers six">
              {['1', '2', '3', '4', '5', '6'].map((n) => (
                <button key={n} type="button" className="btn btn-lg num" disabled={!!lock} onClick={() => answer(n)}>
                  {n}
                </button>
              ))}
            </div>
          )}
          {feedback}
        </section>
      </div>
    )
  }

  if (phase === 'end')
    return (
      <div className="page">
        {header}
        <div className="panel stack-lg" style={{ maxWidth: 760 }}>
          <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
            <Coach mood={misses.length === 0 && score > 0 ? 'happy' : 'idle'} />
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Fim do minuto · {drill.label}</span>
              <h3 className="num" style={{ fontSize: 40 }}>
                {score} {score === 1 ? 'certa' : 'certas'}
              </h3>
              <p className="muted">{misses.length ? `${misses.length} ${misses.length === 1 ? 'erro' : 'erros'}, explicados aqui embaixo.` : score ? 'Nenhum erro.' : 'Nenhuma resposta nesta rodada.'}</p>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="v">{best}</span>
              <span className="k">recorde em {drill.label.toLowerCase()}</span>
            </div>
            <div className="stat">
              <span className="v">{score + misses.length ? Math.round((score / (score + misses.length)) * 100) : 0}%</span>
              <span className="k">de acerto na rodada</span>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary btn-lg" onClick={start}>
              <IconRetry /> De novo
            </button>
            <button className="btn" onClick={() => setPhase('start')}>
              Trocar exercício
            </button>
          </div>
          {misses.length > 0 && (
            <div className="miss-sec">
              <h4>Os erros</h4>
              <ul>
                {misses.map((m, i) => (
                  <li key={i}>
                    <b>
                      <Prompt q={m.q} />
                    </b>
                    : você {m.q.drill === 'casa' ? `clicou em ${m.given}` : `respondeu ${GIVEN_LABEL[m.given] ?? m.given}`}. {visionWhy(m.q)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )

  return (
    <div className="page">
      {header}
      <div className="panel stack-lg" style={{ maxWidth: 760 }}>
        <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <Coach mood="focus" />
          <div className="stack" style={{ gap: 6 }}>
            <h3>O tabuleiro na cabeça</h3>
            <p className="muted">Antes de jogar às cegas, cada casa precisa ter nome, cor e lugar sem você olhar. Cada rodada dura 1 minuto. Errou, o app explica na hora e segue.</p>
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Exercício</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Exercício">
            {VISION_DRILLS.map((d) => (
              <button key={d.id} aria-pressed={prefs.drill === d.id} onClick={() => setPrefs({ drill: d.id })}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 14 }}>
            {drill.how}
          </p>
        </div>
        {prefs.drill === 'casa' && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Lado</span>
            <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Lado embaixo">
              <button aria-pressed={prefs.side === 'w'} onClick={() => setPrefs({ side: 'w' })}>
                Brancas embaixo
              </button>
              <button aria-pressed={prefs.side === 'b'} onClick={() => setPrefs({ side: 'b' })}>
                Pretas embaixo
              </button>
            </div>
          </div>
        )}
        <div className="stats">
          {VISION_DRILLS.map((d) => (
            <div className="stat" key={d.id}>
              <span className="v">{s.records.blind['visao-' + d.id] ?? 0}</span>
              <span className="k">recorde · {d.label.toLowerCase()}</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          {prefs.drill === 'casa' ? 'Clique direto no tabuleiro.' : 'No computador dá para responder pelo teclado: 1 e 2 (ou C/E e S/N) e os números dos saltos.'} {line('vision')}
        </p>
        <button className="btn btn-primary btn-lg" onClick={start}>
          Começar 1 minuto
        </button>
      </div>
    </div>
  )
}
