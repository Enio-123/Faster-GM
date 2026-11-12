import { useCallback, useEffect, useState } from 'react'
import { loadBucket, MATE_LEVELS, pickRow, toPuzzle, type BucketId, type Puzzle, type Row } from '../lib/puzzles'
import { levelStats, markSeen, recordAttempt, seenSet } from '../lib/progress'
import { getState, useAppState } from '../lib/state'
import { formatSolve } from '../lib/time'
import { go, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconArrowRight, IconEye, IconRetry } from '../ui/icons'
import { presetPressure } from './Pressure'
import { CoachSays, coachText, Feedback, moodFor, MoveList, PromptLine, PuzzleBoard, RunTimer, Steps } from '../train/PuzzleView'
import { usePuzzleRun } from '../train/usePuzzleRun'

const ORDER = MATE_LEVELS.map((l) => l.id)
const LAST_KEY = 'faster-gm:mate-level'

/** O último degrau escolhido na escada (todos começam abertos). */
export function savedMateLevel(): BucketId {
  try {
    const v = localStorage.getItem(LAST_KEY) as BucketId | null
    if (v && ORDER.includes(v)) return v
  } catch {
    /* sem armazenamento */
  }
  return 'mate3'
}

export function MateLadder() {
  useTrainingTimer('mate')
  const s = useAppState()
  const [level, setLevel] = useState<BucketId>(savedMateLevel)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [result, setResult] = useState<{ ok: boolean; ms: number; delta: number } | null>(null)
  const [seed, setSeed] = useState(1)

  const next = useCallback((r: Row[], lvl: BucketId) => {
    const st = getState()
    const row = pickRow(r, st.puzzle.r, seenSet(st, lvl, r))
    setResult(null)
    setSeed((x) => x + 1)
    setPuzzle(row ? toPuzzle(lvl, row) : null)
  }, [])

  useEffect(() => {
    let alive = true
    setRows(null)
    setPuzzle(null)
    setError(null)
    try {
      localStorage.setItem(LAST_KEY, level)
    } catch {
      /* sem armazenamento */
    }
    loadBucket(level)
      .then((r) => {
        if (!alive) return
        setRows(r)
        next(r, level)
      })
      .catch(() => alive && setError('Não deu para carregar os problemas. Confira a conexão e tente de novo.'))
    return () => {
      alive = false
    }
  }, [level, next])

  const onResolved = useCallback(
    (ok: boolean, ms: number) => {
      if (!puzzle || !rows) return
      const r = recordAttempt(puzzle, ok, ms, { rated: true })
      markSeen(puzzle.bucket, rows, puzzle.id)
      setResult({ ok, ms, delta: Math.round(r.ratingAfter - r.ratingBefore) })
    },
    [puzzle, rows],
  )
  const run = usePuzzleRun(puzzle, onResolved)
  const view = run.view
  const stats = levelStats(s, level)
  const idx = ORDER.indexOf(level)
  const finished = view && (view.phase === 'solved' || view.phase === 'failed')


  return (
    <div className="page page-train">
      <div className="row-between">
        <div className="row">
          <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
            <IconArrowLeft />
          </button>
          <h2>Escada de mate</h2>
        </div>
        <div className="seg" role="group" aria-label="Degrau">
          {MATE_LEVELS.map((l) => (
            <button key={l.id} aria-pressed={l.id === level} onClick={() => setLevel(l.id)} title={l.label}>
              {l.n === 8 ? '8+' : l.n}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="notice notice-bad">{error}</div>}

      <div className="train">
        <div className="train-board">
          {puzzle && view ? (
            <PuzzleBoard puzzle={puzzle} view={view} onMove={run.onMove} />
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
              <Feedback
                view={view}
                extra={
                  result && (
                    <span className="num" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                      {formatSolve(result.ms)} · {result.delta >= 0 ? '+' : '−'}
                      {Math.abs(result.delta)}
                    </span>
                  )
                }
              />
              {finished && (
                <div className="row">
                  <button className="btn btn-primary" onClick={() => rows && next(rows, level)}>
                    Próximo <IconArrowRight />
                  </button>
                  {view.phase === 'failed' && (
                    <>
                      <button className="btn" onClick={run.retry}>
                        <IconRetry /> Tentar de novo
                      </button>
                      {!view.showing && (
                        <button className="btn btn-ghost" onClick={run.showSolution}>
                          <IconEye /> Ver solução
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <MoveList puzzle={puzzle} view={view} />
              <CoachSays mood={moodFor(view)} text={coachText(view, seed)} />
            </>
          )}

          <div className="panel panel-tight stack">
            <div className="row-between">
              <span className="eyebrow">{MATE_LEVELS[idx].label}</span>
              <span className="pill pill-accent num">Rating {Math.round(s.puzzle.r)}</span>
            </div>
            <div className="stats">
              <div className="stat">
                <span className="v">{stats.tries}</span>
                <span className="k">tentativas</span>
              </div>
              <div className="stat">
                <span className="v">{stats.tries ? Math.round((stats.solved / stats.tries) * 100) : 0}%</span>
                <span className="k">acertos</span>
              </div>
              <div className="stat">
                <span className="v">{stats.bestMs ? formatSolve(stats.bestMs) : '–'}</span>
                <span className="k">melhor tempo</span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Problemas reais de partidas (base do Lichess). Lance diferente do gabarito vale se o motor confirmar o mate no mesmo número de lances.
            </p>
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
                presetPressure(level)
                go('pressao')
              }}
            >
              Treinar com pressão de tempo <IconArrowRight />
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
