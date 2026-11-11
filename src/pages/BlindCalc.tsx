// Cálculo às cegas: as peças ficam paradas. Você digita a linha inteira no tabuleiro
// (seus lances e as respostas do adversário) e só no fim o app confere.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { Board } from '../board/Board'
import { useBoard, type MoveIntent } from '../board/useBoard'
import { line } from '../lib/coach'
import { fenAfter, loadBucket, numberedLine, pickRow, toPuzzle, toSan, uciToMove, type BucketId, type Puzzle, type Row } from '../lib/puzzles'
import { levelStats, recordAttempt } from '../lib/progress'
import { getState, setState, useAppState, useSettings } from '../lib/state'
import { playSound, soundForSan } from '../lib/sound'
import { formatSolve } from '../lib/time'
import { go, useNow, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconArrowRight, IconCheck, IconEye, IconUndo, IconX } from '../ui/icons'
import { CoachSays } from '../train/PuzzleView'

type Source = 'calc' | 'mate'
const DIFF = [
  { id: 'facil', label: 'Mais fácil', offset: -350 },
  { id: 'normal', label: 'Normal', offset: -150 },
  { id: 'dificil', label: 'Mais difícil', offset: 100 },
] as const

function bucketFor(source: Source, n: number): BucketId {
  return `${source}${n}` as BucketId
}

interface Check { okPlies: number; ok: boolean; ms: number }

export function BlindCalc() {
  useTrainingTimer('calculo')
  const s = useAppState()
  const settings = useSettings()
  const [source, setSource] = useState<Source>('calc')
  const [n, setN] = useState(3)
  const [diff, setDiff] = useState<(typeof DIFF)[number]['id']>('normal')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [entered, setEntered] = useState<string[]>([])
  const [check, setCheck] = useState<Check | null>(null)
  const [shown, setShown] = useState<{ fen: string; last: { from: string; to: string } | null } | null>(null)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)
  const seen = useRef(new Set<string>())
  const timers = useRef<number[]>([])
  const bucket = bucketFor(source, n)

  const next = useCallback(
    (r: Row[], b: BucketId) => {
      const offset = DIFF.find((d) => d.id === diff)?.offset ?? 0
      const row = pickRow(r, getState().puzzle.r + offset, seen.current)
      timers.current.forEach((t) => window.clearTimeout(t))
      setEntered([])
      setCheck(null)
      setShown(null)
      setStartedAt(Date.now())
      if (!row) return
      seen.current.add(row[0])
      setPuzzle(toPuzzle(b, row))
    },
    [diff],
  )

  useEffect(() => {
    let alive = true
    setRows(null)
    setError(null)
    loadBucket(bucket)
      .then((r) => {
        if (!alive) return
        setRows(r)
        next(r, bucket)
      })
      .catch(() => alive && setError('Não deu para carregar os problemas. Confira a conexão e tente de novo.'))
    return () => {
      alive = false
    }
  }, [bucket, next])

  const startFen = useMemo(() => (puzzle ? fenAfter(puzzle.fen, puzzle.moves, 1) : ''), [puzzle])
  const opener = puzzle ? { from: puzzle.moves[0].slice(0, 2), to: puzzle.moves[0].slice(2, 4) } : null
  const solution = useMemo(() => (puzzle ? puzzle.moves.slice(1) : []), [puzzle])
  const logicFen = useMemo(() => {
    if (!startFen) return ''
    try {
      return fenAfter(startFen, entered, entered.length)
    } catch {
      return startFen
    }
  }, [startFen, entered])
  const enteredSan = useMemo(() => (startFen ? toSan(startFen, entered) : []), [startFen, entered])
  const solutionSan = useMemo(() => (startFen ? toSan(startFen, solution) : []), [startFen, solution])
  const full = entered.length >= solution.length
  const turn = logicFen ? (logicFen.split(' ')[1] as 'w' | 'b') : 'w'

  const onMove = useCallback(
    (m: MoveIntent) => {
      if (check || entered.length >= solution.length) return false
      const c = new Chess(logicFen)
      try {
        const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion })
        playSound('move')
        setEntered((e) => [...e, mv.from + mv.to + (mv.promotion ?? '')])
        return true
      } catch {
        return false
      }
    },
    [check, entered.length, solution.length, logicFen],
  )

  const ix = useBoard({ fen: logicFen || startFen || puzzle?.fen || DEFAULT_POSITION, interactive: !!puzzle && !check && !full, color: turn, autoQueen: settings.autoQueen, onMove })

  const doCheck = () => {
    if (!puzzle) return
    let okPlies = 0
    for (let i = 0; i < entered.length && i < solution.length; i++) {
      if (entered[i] === solution[i]) {
        okPlies++
        continue
      }
      // Último lance: outro xeque-mate também vale.
      if (i === solution.length - 1 && puzzle.mate) {
        const c = new Chess(fenAfter(startFen, entered, i))
        try {
          c.move(uciToMove(entered[i]))
          if (c.isCheckmate()) {
            okPlies++
            continue
          }
        } catch {
          /* ilegal */
        }
      }
      break
    }
    const ok = okPlies === solution.length
    const ms = Date.now() - startedAt
    playSound(ok ? 'success' : 'error')
    recordAttempt(puzzle, ok, ms, { rated: false, statsKey: 'cego-' + puzzle.bucket })
    if (ok) setState((st) => (puzzle.length > st.records.calcBest ? { ...st, records: { ...st.records, calcBest: puzzle.length } } : st))
    setCheck({ okPlies, ok, ms })
  }

  const playLine = () => {
    if (!puzzle) return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    let cur = startFen
    setShown({ fen: startFen, last: opener })
    solution.forEach((u, i) => {
      timers.current.push(
        window.setTimeout(() => {
          const c = new Chess(cur)
          const mv = c.move(uciToMove(u))
          cur = c.fen()
          soundForSan(mv.san)
          setShown({ fen: cur, last: { from: mv.from, to: mv.to } })
        }, 500 + i * 800),
      )
    })
  }

  const now = useNow(200, !check && !!puzzle)
  const elapsed = check ? check.ms : now - startedAt
  const st = levelStats(s, 'cego-' + bucket)
  const myIdx = (i: number) => i % 2 === 0
  const entNums = numberedLine(startFen || 'x x x x x 1', enteredSan)
  const solNums = numberedLine(startFen || 'x x x x x 1', solutionSan)

  return (
    <div className="page page-train">
      <div className="row-between">
        <div className="row">
          <button className="icon-btn" onClick={() => go('cegas')} aria-label="Voltar para às cegas">
            <IconArrowLeft />
          </button>
          <h2>Cálculo às cegas</h2>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="Tipo">
            <button aria-pressed={source === 'calc'} onClick={() => setSource('calc')}>
              Táticas
            </button>
            <button aria-pressed={source === 'mate'} onClick={() => setSource('mate')}>
              Mates
            </button>
          </div>
          <div className="seg" role="group" aria-label="Profundidade">
            {[3, 4, 5, 6].map((k) => (
              <button key={k} aria-pressed={n === k} onClick={() => setN(k)}>
                {k === 6 ? '6+' : k}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="notice notice-bad">{error}</div>}

      <div className="train">
        <div className="train-board">
          <div className="board-frame">
            {puzzle ? (
              <Board fen={shown ? shown.fen : startFen} orientation={puzzle.color} ix={ix} lastMove={shown ? shown.last : opener} blind />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-2)' }} />
            )}
          </div>
        </div>
        <aside className="train-side">
          {puzzle && (
            <>
              <div className="row-between">
                <div className="prompt">
                  <span className={`side-dot ${puzzle.color}`} aria-hidden="true" />
                  <div>
                    <div className="t">
                      {puzzle.color === 'w' ? 'Brancas' : 'Pretas'} jogam: {puzzle.mate ? `mate em ${puzzle.length}` : `${puzzle.length} lances`}
                    </div>
                    <div className="muted" style={{ fontSize: 14 }}>
                      Problema {puzzle.rating} · as peças não se mexem
                    </div>
                  </div>
                </div>
                <span className="timer">{formatSolve(Math.max(0, elapsed))}</span>
              </div>

              {!check && (
                <div className="notice">
                  {full
                    ? 'Linha completa. Confira quando tiver certeza.'
                    : `Agora: ${myIdx(entered.length) ? 'seu lance' : 'a resposta do adversário'} (${turn === 'w' ? 'brancas' : 'pretas'}), lance ${entered.length + 1} de ${solution.length}.`}
                </div>
              )}

              <div className="panel panel-tight stack" style={{ gap: 8 }}>
                <span className="eyebrow">Sua linha</span>
                {enteredSan.length ? (
                  <div className="moves">
                    {entNums.map((x, i) => (
                      <span key={i}>
                        {x.n && <span className="mn">{x.n} </span>}
                        <span className={`mv${check ? (i < check.okPlies ? ' ok' : i === check.okPlies ? ' bad' : '') : ''}`}>{x.san}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="muted" style={{ fontSize: 14 }}>
                    Clique na peça e na casa de destino. Os lances ficam só na cabeça.
                  </span>
                )}
                {!check && (
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => setEntered((e) => e.slice(0, -1))} disabled={!entered.length}>
                      <IconUndo /> Desfazer
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEntered([])} disabled={!entered.length}>
                      Limpar
                    </button>
                  </div>
                )}
              </div>

              {!check ? (
                <button className="btn btn-primary btn-lg" onClick={doCheck} disabled={!entered.length}>
                  Conferir
                </button>
              ) : (
                <>
                  <div className={`feedback ${check.ok ? 'good' : 'bad'}`}>
                    {check.ok ? <IconCheck /> : <IconX />}
                    <span>{check.ok ? 'Linha inteira certa.' : check.okPlies === 0 ? 'O primeiro lance já não é esse.' : `Certo até o lance ${check.okPlies} de ${solution.length}.`}</span>
                  </div>
                  <div className="panel panel-tight stack" style={{ gap: 8 }}>
                    <span className="eyebrow">Linha correta</span>
                    <div className="moves">
                      {solNums.map((x, i) => (
                        <span key={i}>
                          {x.n && <span className="mn">{x.n} </span>}
                          <span className="mv">{x.san}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn btn-primary" onClick={() => rows && next(rows, bucket)}>
                      Próximo <IconArrowRight />
                    </button>
                    <button className="btn" onClick={playLine}>
                      <IconEye /> Ver no tabuleiro
                    </button>
                  </div>
                </>
              )}

              <CoachSays mood={check ? (check.ok ? 'happy' : 'sad') : 'focus'} text={check ? (check.ok ? line('good', elapsed) : 'Refaz a linha mentalmente, lance por lance, olhando a solução.') : line('calcIntro')} />
            </>
          )}
          <div className="panel panel-tight stack">
            <div className="row-between">
              <span className="eyebrow">Dificuldade</span>
              <div className="seg" role="group" aria-label="Dificuldade">
                {DIFF.map((d) => (
                  <button key={d.id} aria-pressed={diff === d.id} onClick={() => setDiff(d.id)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stats">
              <div className="stat">
                <span className="v">{st.tries}</span>
                <span className="k">linhas tentadas</span>
              </div>
              <div className="stat">
                <span className="v">{st.tries ? Math.round((st.solved / st.tries) * 100) : 0}%</span>
                <span className="k">inteiras certas</span>
              </div>
              <div className="stat">
                <span className="v">{s.records.calcBest || '–'}</span>
                <span className="k">maior linha certa</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
