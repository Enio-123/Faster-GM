// Pressão de tempo: alguns minutos de problemas, sem ajuda na hora. Errou, vai para o próximo.
// No fim, cada erro vem explicado: o seu lance, o lance certo e o porquê.
import { useCallback, useEffect, useRef, useState } from 'react'
import { CALC_LEVELS, loadBucket, MATE_LEVELS, pickRow, toPuzzle, type BucketId, type Puzzle, type Row } from '../lib/puzzles'
import { markSeen, recordAttempt, seenSet } from '../lib/progress'
import { getState, setState, useAppState } from '../lib/state'
import { line } from '../lib/coach'
import { playSound } from '../lib/sound'
import { formatClock, formatSolve } from '../lib/time'
import { go, useNow, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconCheck, IconRetry } from '../ui/icons'
import { Coach } from '../coach/Coach'
import { MissReview } from '../train/MissReview'
import { CoachSays, moodFor, PromptLine, PuzzleBoard, Steps } from '../train/PuzzleView'
import { usePuzzleRun, type Miss } from '../train/usePuzzleRun'

type Kind = 'mate' | 'tatica'
export const PRESSURE_MINUTES = [5, 10, 15, 20, 30]
const PREFS_KEY = 'faster-gm:pressao'
const LADDER_KEY = 'faster-gm:mate-level'
const MATE_ORDER = MATE_LEVELS.map((l) => l.id)

interface Prefs {
  kind: Kind
  mate: BucketId
  calc: BucketId
  minutes: number
}

function loadPrefs(): Prefs {
  const base: Prefs = { kind: 'mate', mate: 'mate3', calc: 'calc3', minutes: 10 }
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') as Partial<Prefs> | null
    // Sem preferência salva, começa no degrau atual da escada de mate.
    const ladder = localStorage.getItem(LADDER_KEY) as BucketId | null
    const p = { ...base, ...(saved ?? {}), ...(!saved && ladder && MATE_ORDER.includes(ladder) ? { mate: ladder } : {}) }
    if (!MATE_ORDER.includes(p.mate)) p.mate = 'mate3'
    if (!CALC_LEVELS.some((l) => l.id === p.calc)) p.calc = 'calc3'
    if (!PRESSURE_MINUTES.includes(p.minutes)) p.minutes = 10
    if (p.kind !== 'mate' && p.kind !== 'tatica') p.kind = 'mate'
    return p
  } catch {
    return base
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* sem armazenamento */
  }
}

/** Deixa a Pressão de tempo pronta num degrau de mate (link da escada). */
export function presetPressure(mate: BucketId) {
  savePrefs({ ...loadPrefs(), kind: 'mate', mate })
}

export function pressureKey(bucket: BucketId, minutes: number): string {
  return `${bucket}-${minutes}`
}

function levelLabel(bucket: BucketId): string {
  return [...MATE_LEVELS, ...CALC_LEVELS].find((l) => l.id === bucket)?.label ?? bucket
}

export function Pressure() {
  const s = useAppState()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const bucket = prefs.kind === 'mate' ? prefs.mate : prefs.calc
  useTrainingTimer(prefs.kind === 'mate' ? 'mate' : 'calculo')
  const [phase, setPhase] = useState<'start' | 'run' | 'end'>('start')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [solved, setSolved] = useState(0)
  const [solvedMs, setSolvedMs] = useState(0)
  const [misses, setMisses] = useState<Miss[]>([])
  const [deadline, setDeadline] = useState(0)
  const [timeUp, setTimeUp] = useState(false)
  const [best, setBest] = useState(0)
  const seen = useRef(new Set<string>())
  const target = useRef(1500)
  const timers = useRef<number[]>([])
  const total = prefs.minutes * 60000
  const now = useNow(200, phase === 'run')
  // O relógio começa a contar depois do lance de abertura do primeiro problema.
  const left = phase === 'run' ? Math.min(total, Math.max(0, deadline - now)) : total

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }
    setPrefs(next)
    savePrefs(next)
  }

  useEffect(() => {
    let alive = true
    setRows(null)
    setError(null)
    loadBucket(bucket)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError('Não deu para carregar os problemas. Confira a conexão e tente de novo.'))
    return () => {
      alive = false
    }
  }, [bucket])

  const pick = useCallback(
    (n: number) => {
      if (!rows) return
      const avoid = seenSet(getState(), bucket, rows)
      seen.current.forEach((id) => avoid.add(id))
      const row = pickRow(rows, target.current + n * 10, avoid)
      if (!row) return
      seen.current.add(row[0])
      setPuzzle(toPuzzle(bucket, row))
    },
    [rows, bucket],
  )

  const start = () => {
    if (!rows) return
    clearTimers()
    target.current = Math.max(1200, Math.round(getState().puzzle.r - 100))
    seen.current = new Set()
    setSolved(0)
    setSolvedMs(0)
    setMisses([])
    setTimeUp(false)
    setDeadline(Date.now() + total + 550)
    setPhase('run')
    pick(0)
  }

  const finish = useCallback(
    (byTime: boolean) => {
      clearTimers()
      setTimeUp(byTime)
      setPhase('end')
      setPuzzle(null)
      playSound('end')
      const key = pressureKey(bucket, prefs.minutes)
      setBest(Math.max(getState().records.pressure[key] ?? 0, solved))
      setState((st) => (solved > (st.records.pressure[key] ?? 0) ? { ...st, records: { ...st.records, pressure: { ...st.records.pressure, [key]: solved } } } : st))
    },
    [bucket, prefs.minutes, solved],
  )

  useEffect(() => {
    if (phase === 'run' && left <= 0) finish(true)
  }, [phase, left, finish])

  const onResolved = useCallback(
    (ok: boolean, ms: number, miss?: Miss) => {
      if (!puzzle || !rows || phase !== 'run') return
      recordAttempt(puzzle, ok, ms, { rated: false, statsKey: 'pressao-' + puzzle.bucket, review: true })
      markSeen(puzzle.bucket, rows, puzzle.id)
      if (ok) {
        const n = solved + 1
        setSolved(n)
        setSolvedMs((x) => x + ms)
        later(() => pick(n), 350)
      } else {
        if (miss) setMisses((x) => [...x, miss])
        later(() => pick(solved), 800)
      }
    },
    [puzzle, rows, phase, solved, pick],
  )
  const run = usePuzzleRun(phase === 'run' ? puzzle : null, onResolved, { reveal: false })
  const view = run.view
  const low = left < 30000
  const recordKey = pressureKey(bucket, prefs.minutes)

  if (phase === 'run')
    return (
      <div className="page page-train">
        <div className="row-between">
          <div className="row">
            <button className="icon-btn" onClick={() => finish(false)} aria-label="Encerrar e ver os erros">
              <IconArrowLeft />
            </button>
            <h2>Pressão de tempo</h2>
          </div>
          <div className="row">
            <span className="pill pill-good num" style={{ fontSize: 14 }}>
              {solved} {solved === 1 ? 'certo' : 'certos'}
            </span>
            {misses.length > 0 && (
              <span className="pill pill-bad num" style={{ fontSize: 14 }}>
                {misses.length} {misses.length === 1 ? 'erro' : 'erros'}
              </span>
            )}
            <span className={`clock run${low ? ' low' : ''}`} aria-label="Tempo restante">
              {formatClock(left)}
            </span>
          </div>
        </div>
        <div className="train">
          <div className="train-board">
            {puzzle && view ? <PuzzleBoard puzzle={puzzle} view={view} onMove={run.onMove} /> : <div className="board-frame" style={{ background: 'var(--surface-2)' }} aria-busy="true" />}
          </div>
          <aside className="train-side">
            {puzzle && view && (
              <>
                <PromptLine puzzle={puzzle} />
                <Steps total={puzzle.length} done={view.done} failed={view.phase === 'failed'} />
                {view.phase === 'failed' && <div className="feedback bad">Errou. A explicação fica para o fim.</div>}
                {view.phase === 'solved' && (
                  <div className="feedback good">
                    <IconCheck /> Certo
                  </div>
                )}
                {view.phase === 'checking' && <div className="feedback info">Conferindo com o motor se esse caminho também dá mate...</div>}
              </>
            )}
            <CoachSays mood={moodFor(view)} text={line('pressure', misses.length)} />
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => finish(false)}>
              Encerrar e ver os erros
            </button>
          </aside>
        </div>
      </div>
    )

  if (phase === 'end') {
    const avg = solved ? solvedMs / solved : 0
    return (
      <div className="page page-train">
        <div className="row">
          <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
            <IconArrowLeft />
          </button>
          <h2>Pressão de tempo</h2>
        </div>
        <div className="panel stack-lg">
          <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
            <Coach mood={misses.length === 0 && solved > 0 ? 'happy' : 'idle'} />
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">
                {timeUp ? 'Fim do tempo' : 'Rodada encerrada'} · {levelLabel(bucket)} · {prefs.minutes} min
              </span>
              <h3 className="num" style={{ fontSize: 40 }}>
                {solved} {solved === 1 ? 'certo' : 'certos'}
              </h3>
              <p className="muted">{misses.length ? line('pressureEnd', solved) : solved ? 'Nenhum erro. Rodada limpa.' : 'Nenhum problema resolvido nesta rodada.'}</p>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="v">{misses.length}</span>
              <span className="k">{misses.length === 1 ? 'erro' : 'erros'}</span>
            </div>
            <div className="stat">
              <span className="v">{avg ? formatSolve(avg) : '–'}</span>
              <span className="k">tempo médio por acerto</span>
            </div>
            <div className="stat">
              <span className="v">{best}</span>
              <span className="k">recorde neste formato</span>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary btn-lg" onClick={start} disabled={!rows}>
              <IconRetry /> Jogar de novo
            </button>
            <button className="btn" onClick={() => setPhase('start')}>
              Mudar formato
            </button>
          </div>
          {misses.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Os problemas que você errou também foram para a Revisão dos erros, para voltar nos próximos dias.</p>}
        </div>
        {misses.length > 0 && <MissReview misses={misses} />}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="row">
        <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
          <IconArrowLeft />
        </button>
        <h2>Pressão de tempo</h2>
      </div>
      {error && <div className="notice notice-bad">{error}</div>}
      <div className="panel stack-lg" style={{ maxWidth: 680 }}>
        <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <Coach mood="focus" />
          <div className="stack">
            <h3>Contra o relógio, sem ajuda na hora</h3>
            <p className="muted">
              Resolva o máximo de problemas no tempo escolhido. Errou, o app não mostra a solução: vai direto para o próximo. No fim, cada erro vem explicado, com o seu lance, o lance certo e o porquê.
            </p>
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Tipo</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Tipo de problema">
            <button aria-pressed={prefs.kind === 'mate'} onClick={() => update({ kind: 'mate' })}>
              Mates
            </button>
            <button aria-pressed={prefs.kind === 'tatica'} onClick={() => update({ kind: 'tatica' })}>
              Linhas táticas
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">{prefs.kind === 'mate' ? 'Mate em' : 'Tamanho da linha'}</span>
          {prefs.kind === 'mate' ? (
            <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Mate em">
              {MATE_LEVELS.map((l) => (
                <button key={l.id} aria-pressed={prefs.mate === l.id} onClick={() => update({ mate: l.id })} title={l.label}>
                  {l.n === 8 ? '8+' : l.n}
                </button>
              ))}
            </div>
          ) : (
            <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Lances da linha">
              {CALC_LEVELS.map((l) => (
                <button key={l.id} aria-pressed={prefs.calc === l.id} onClick={() => update({ calc: l.id })}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Tempo</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Minutos">
            {PRESSURE_MINUTES.map((m) => (
              <button key={m} aria-pressed={prefs.minutes === m} onClick={() => update({ minutes: m })}>
                {m} min
              </button>
            ))}
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <span className="v">{s.records.pressure[recordKey] ?? 0}</span>
            <span className="k">
              recorde em {levelLabel(bucket).toLowerCase()}, {prefs.minutes} min
            </span>
          </div>
          <div className="stat">
            <span className="v">{Math.max(1200, Math.round(s.puzzle.r - 100))}</span>
            <span className="k">nível dos problemas (perto do seu rating)</span>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" onClick={start} disabled={!rows}>
          {rows ? `Começar ${prefs.minutes} minutos` : 'Carregando...'}
        </button>
      </div>
    </div>
  )
}
