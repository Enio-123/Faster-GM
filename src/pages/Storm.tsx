// Relâmpago: 3 minutos para resolver o máximo de problemas curtos. Erro tira 10 segundos.
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadBucket, pickRow, toPuzzle, type Puzzle, type Row } from '../lib/puzzles'
import { recordAttempt } from '../lib/progress'
import { getState, setState, useAppState } from '../lib/state'
import { playSound } from '../lib/sound'
import { formatClock } from '../lib/time'
import { go, useNow, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconRetry } from '../ui/icons'
import { Coach } from '../coach/Coach'
import { CoachSays, moodFor, PromptLine, PuzzleBoard } from '../train/PuzzleView'
import { usePuzzleRun } from '../train/usePuzzleRun'

const DURATION = 180000
const PENALTY = 10000

export function Storm() {
  useTrainingTimer('aquecimento')
  const s = useAppState()
  const [phase, setPhase] = useState<'start' | 'run' | 'end'>('start')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [score, setScore] = useState(0)
  const [errors, setErrors] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef(new Set<string>())
  const base = useRef(1200)
  const now = useNow(100, phase === 'run')
  const left = phase === 'run' ? Math.max(0, deadline - now) : DURATION

  useEffect(() => {
    loadBucket('rapido')
      .then(setRows)
      .catch(() => setError('Não deu para carregar os problemas. Confira a conexão e tente de novo.'))
  }, [])

  const pick = useCallback(
    (solved: number) => {
      if (!rows) return
      const row = pickRow(rows, base.current + solved * 25, seen.current)
      if (!row) return
      seen.current.add(row[0])
      setPuzzle(toPuzzle('rapido', row))
    },
    [rows],
  )

  const start = () => {
    base.current = Math.max(1200, Math.round(getState().puzzle.r - 400))
    seen.current = new Set()
    setScore(0)
    setErrors(0)
    setDeadline(Date.now() + DURATION + 550)
    setPhase('run')
    pick(0)
  }

  const finish = useCallback(() => {
    setPhase('end')
    playSound('end')
    setState((st) => (score > st.records.stormBest ? { ...st, records: { ...st.records, stormBest: score } } : st))
  }, [score])

  useEffect(() => {
    if (phase === 'run' && left <= 0) finish()
  }, [phase, left, finish])

  const onResolved = useCallback(
    (ok: boolean, ms: number) => {
      if (!puzzle || phase !== 'run') return
      recordAttempt(puzzle, ok, ms, { rated: false, statsKey: 'relampago' })
      if (ok) {
        const n = score + 1
        setScore(n)
        window.setTimeout(() => pick(n), 250)
      } else {
        setErrors((e) => e + 1)
        setDeadline((d) => d - PENALTY)
        window.setTimeout(() => pick(score), 900)
      }
    },
    [puzzle, phase, score, pick],
  )
  const run = usePuzzleRun(phase === 'run' ? puzzle : null, onResolved)
  const view = run.view
  const low = left < 20000

  if (phase !== 'run')
    return (
      <div className="page">
        <div className="row">
          <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
            <IconArrowLeft />
          </button>
          <h2>Relâmpago</h2>
        </div>
        {error && <div className="notice notice-bad">{error}</div>}
        <div className="panel stack-lg" style={{ maxWidth: 640 }}>
          <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
            <Coach mood={phase === 'end' ? (score >= s.records.stormBest ? 'happy' : 'idle') : 'focus'} />
            <div className="stack">
              {phase === 'end' ? (
                <>
                  <span className="eyebrow">Fim do tempo</span>
                  <h3 className="num" style={{ fontSize: 40 }}>
                    {score} {score === 1 ? 'acerto' : 'acertos'}
                  </h3>
                  <p className="muted">
                    {errors} {errors === 1 ? 'erro' : 'erros'} · recorde {Math.max(s.records.stormBest, score)}
                  </p>
                </>
              ) : (
                <>
                  <h3>3 minutos de padrões táticos</h3>
                  <p className="muted">Problemas curtos (1 a 2 lances) de partidas reais, cada vez mais difíceis. Errou, perde 10 segundos e vai para o próximo. Treina reconhecimento rápido de padrão.</p>
                </>
              )}
            </div>
          </div>
          {phase === 'start' && (
            <div className="stats">
              <div className="stat">
                <span className="v">{s.records.stormBest}</span>
                <span className="k">recorde</span>
              </div>
            </div>
          )}
          <button className="btn btn-primary btn-lg" onClick={start} disabled={!rows}>
            {phase === 'end' ? (
              <>
                <IconRetry /> Jogar de novo
              </>
            ) : rows ? (
              'Começar'
            ) : (
              'Carregando...'
            )}
          </button>
        </div>
      </div>
    )

  return (
    <div className="page page-train">
      <div className="row-between">
        <div className="row">
          <button className="icon-btn" onClick={finish} aria-label="Encerrar">
            <IconArrowLeft />
          </button>
          <h2>Relâmpago</h2>
        </div>
        <div className="row">
          <span className="pill pill-good num" style={{ fontSize: 14 }}>
            {score} {score === 1 ? 'acerto' : 'acertos'}
          </span>
          <span className={`clock run${low ? ' low' : ''}`}>{formatClock(left)}</span>
        </div>
      </div>
      <div className="train">
        <div className="train-board">
          {puzzle && view ? <PuzzleBoard puzzle={puzzle} view={view} onMove={run.onMove} /> : <div className="board-frame" style={{ background: 'var(--surface-2)' }} />}
        </div>
        <aside className="train-side">
          {puzzle && <PromptLine puzzle={puzzle} />}
          {view?.phase === 'failed' && <div className="feedback bad">−10 segundos</div>}
          {view?.phase === 'solved' && <div className="feedback good">+1</div>}
          <CoachSays mood={moodFor(view)} text={errors === 0 ? 'Rápido, mas olhando tudo.' : 'Errou, segue. Sem lamentar.'} />
        </aside>
      </div>
    </div>
  )
}
