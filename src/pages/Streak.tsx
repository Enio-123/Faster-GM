// Sequência: mates cada vez mais longos e difíceis, sem errar. Um erro encerra.
import { useCallback, useState } from 'react'
import { loadBucket, MATE_LEVELS, pickRow, toPuzzle, type Puzzle } from '../lib/puzzles'
import { recordAttempt } from '../lib/progress'
import { getState, setState, useAppState } from '../lib/state'
import { go, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconEye, IconRetry } from '../ui/icons'
import { Coach } from '../coach/Coach'
import { line } from '../lib/coach'
import { CoachSays, coachText, Feedback, moodFor, MoveList, PromptLine, PuzzleBoard, RunTimer, Steps } from '../train/PuzzleView'
import { usePuzzleRun } from '../train/usePuzzleRun'

/** A cada 3 acertos o mate fica 1 lance mais longo; o rating-alvo sobe a cada acerto. */
export function streakLevel(solved: number) {
  return MATE_LEVELS[Math.min(MATE_LEVELS.length - 1, Math.floor(solved / 3))]
}

export function Streak() {
  useTrainingTimer('mate')
  const s = useAppState()
  const [phase, setPhase] = useState<'start' | 'run' | 'end'>('start')
  const [count, setCount] = useState(0)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [base, setBase] = useState(0)
  const [seen] = useState(() => new Set<string>())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (solved: number, startRating: number) => {
      const lvl = streakLevel(solved)
      try {
        const rows = await loadBucket(lvl.id)
        const row = pickRow(rows, startRating + solved * 35, seen)
        if (!row) return
        seen.add(row[0])
        setPuzzle(toPuzzle(lvl.id, row))
      } catch {
        setError('Não deu para carregar os problemas. Confira a conexão e tente de novo.')
      }
    },
    [seen],
  )

  const start = () => {
    const b = Math.round(getState().puzzle.r - 250)
    setBase(b)
    setCount(0)
    setPhase('run')
    void load(0, b)
  }

  const onResolved = useCallback(
    (ok: boolean, ms: number) => {
      if (!puzzle) return
      recordAttempt(puzzle, ok, ms, { rated: false, statsKey: 'sequencia' })
      if (ok) {
        const n = count + 1
        setCount(n)
        window.setTimeout(() => void load(n, base), 900)
      } else {
        setState((st) => {
          const lvl = streakLevel(count).n
          const better = count > st.records.seqBest
          return better ? { ...st, records: { ...st.records, seqBest: count, seqBestLevel: lvl } } : st
        })
        window.setTimeout(() => setPhase('end'), 400)
      }
    },
    [puzzle, count, base, load],
  )
  const run = usePuzzleRun(phase === 'start' ? null : puzzle, onResolved)
  const view = run.view

  if (phase === 'start')
    return (
      <div className="page">
        <div className="row">
          <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
            <IconArrowLeft />
          </button>
          <h2>Sequência</h2>
        </div>
        <div className="panel stack-lg" style={{ maxWidth: 640 }}>
          <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
            <Coach mood="focus" />
            <div className="stack">
              <h3>Mates em sequência, sem errar</h3>
              <p className="muted">
                Começa com mate em 3. A cada 3 acertos o mate fica um lance mais longo e o problema fica mais difícil, até mate em 8 ou mais. Um erro encerra a sequência.
              </p>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="v">{s.records.seqBest}</span>
              <span className="k">recorde de acertos</span>
            </div>
            <div className="stat">
              <span className="v">{s.records.seqBest ? `Mate em ${s.records.seqBestLevel}` : '–'}</span>
              <span className="k">degrau mais alto</span>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={start}>
            Começar
          </button>
        </div>
      </div>
    )

  return (
    <div className="page page-train">
      <div className="row-between">
        <div className="row">
          <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
            <IconArrowLeft />
          </button>
          <h2>Sequência</h2>
        </div>
        <span className="pill pill-accent num" style={{ fontSize: 14 }}>
          {count} {count === 1 ? 'acerto' : 'acertos'} · recorde {Math.max(s.records.seqBest, count)}
        </span>
      </div>
      {error && <div className="notice notice-bad">{error}</div>}
      <div className="train">
        <div className="train-board">
          {puzzle && view ? (
            <PuzzleBoard
              puzzle={puzzle}
              view={view}
              onMove={run.onMove}
              overlay={
                phase === 'end' && !view.showing ? (
                  <div className="result-box">
                    <span className="eyebrow">Sequência encerrada</span>
                    <span className="big num">{count}</span>
                    <span className="muted">{count === 1 ? 'acerto seguido' : 'acertos seguidos'}</span>
                    <p style={{ fontSize: 14 }}>{line('streakEnd', count)}</p>
                    <div className="row" style={{ justifyContent: 'center' }}>
                      <button className="btn btn-primary" onClick={start}>
                        <IconRetry /> De novo
                      </button>
                      <button className="btn" onClick={run.showSolution}>
                        <IconEye /> Ver solução
                      </button>
                    </div>
                  </div>
                ) : undefined
              }
            />
          ) : (
            <div className="board-frame" style={{ background: 'var(--surface-2)' }} aria-busy="true" />
          )}
        </div>
        <aside className="train-side">
          {puzzle && view && (
            <>
              <div className="row-between">
                <PromptLine puzzle={puzzle} />
                <RunTimer view={view} />
              </div>
              <Steps total={puzzle.length} done={view.done} failed={view.phase === 'failed'} />
              <Feedback view={view} />
              {phase === 'end' && view.showing && (
                <button className="btn btn-primary" onClick={start}>
                  <IconRetry /> De novo
                </button>
              )}
              <MoveList puzzle={puzzle} view={view} />
              <CoachSays mood={moodFor(view)} text={coachText(view, count + 7)} />
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
