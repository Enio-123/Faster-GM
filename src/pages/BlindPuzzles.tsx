// Problemas às cegas: você olha a posição (ou só lê a lista das peças), as peças somem e
// você resolve clicando no tabuleiro vazio ou digitando. As respostas do adversário são
// anunciadas em texto e voz. Errou, vai para o próximo; no fim, cada erro vem explicado.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../board/Board'
import { useBoard } from '../board/useBoard'
import { Coach } from '../coach/Coach'
import { countPieces, pieceList, sanSpeech, sanWords } from '../lib/blind'
import { line } from '../lib/coach'
import { fenAfter, loadBucket, numberedLine, pickRow, toPuzzle, type BucketId, type Puzzle, type Row } from '../lib/puzzles'
import { levelStats, markSeen, recordAttempt, seenSet } from '../lib/progress'
import { getState, useAppState, useSettings } from '../lib/state'
import { playSound } from '../lib/sound'
import { go, useNow, usePrefs, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconCheck, IconEye, IconRetry } from '../ui/icons'
import { MissReview } from '../train/MissReview'
import { MoveInput } from '../train/MoveInput'
import { CoachSays, moodFor, PromptLine, Steps } from '../train/PuzzleView'
import { usePuzzleRun, type Miss } from '../train/usePuzzleRun'
import { useVoice } from '../train/useVoice'

export const BLIND_PUZZLE_TYPES: { id: string; bucket: BucketId; label: string }[] = [
  { id: 'm1', bucket: 'mate1', label: 'Mate em 1' },
  { id: 'm2', bucket: 'mate2', label: 'Mate em 2' },
  { id: 'curto', bucket: 'rapido', label: 'Táticas curtas' },
  { id: 'm3', bucket: 'mate3', label: 'Mate em 3' },
  { id: 'c3', bucket: 'calc3', label: 'Linhas de 3' },
]
const PIECES = [
  { id: '10', label: 'Até 10 peças', max: 10 },
  { id: '16', label: 'Até 16', max: 16 },
  { id: '32', label: 'Qualquer', max: 32 },
]
const VIEW = [
  { id: '10', label: '10 s', secs: 10 },
  { id: '30', label: '30 s', secs: 30 },
  { id: '60', label: '1 min', secs: 60 },
  { id: 'lista', label: 'Só a lista', secs: 0 },
]
const DIFF = [
  { id: 'facil', label: 'Mais fácil', offset: -500 },
  { id: 'normal', label: 'Normal', offset: -250 },
  { id: 'dificil', label: 'Mais difícil', offset: 0 },
]
const ROUNDS = [5, 10]
const PEEK_MS = 3000

interface Prefs {
  type: string
  pieces: string
  view: string
  diff: string
  count: number
}
const fixPrefs = (p: Prefs): Prefs => ({
  type: BLIND_PUZZLE_TYPES.some((t) => t.id === p.type) ? p.type : 'm1',
  pieces: PIECES.some((x) => x.id === p.pieces) ? p.pieces : '10',
  view: VIEW.some((x) => x.id === p.view) ? p.view : '30',
  diff: DIFF.some((x) => x.id === p.diff) ? p.diff : 'normal',
  count: ROUNDS.includes(p.count) ? p.count : 5,
})

const sideName = (c: 'w' | 'b') => (c === 'w' ? 'Brancas' : 'Pretas')

export function BlindPuzzles() {
  useTrainingTimer('calculo')
  const s = useAppState()
  const settings = useSettings()
  const voice = useVoice()
  const [prefs, setPrefs] = usePrefs<Prefs>('faster-gm:cegas-problemas', { type: 'm1', pieces: '10', view: '30', diff: 'normal', count: 5 }, fixPrefs)
  const type = BLIND_PUZZLE_TYPES.find((t) => t.id === prefs.type) ?? BLIND_PUZZLE_TYPES[0]
  const view0 = VIEW.find((v) => v.id === prefs.view) ?? VIEW[1]
  const listMode = view0.id === 'lista'
  const maxPieces = (PIECES.find((x) => x.id === prefs.pieces) ?? PIECES[0]).max
  const offset = (DIFF.find((d) => d.id === prefs.diff) ?? DIFF[1]).offset
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'start' | 'run' | 'end'>('start')
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [stage, setStage] = useState<'study' | 'solve'>('study')
  const [studyUntil, setStudyUntil] = useState(0)
  const [peekUntil, setPeekUntil] = useState(0)
  const [peeks, setPeeks] = useState(0)
  const [done, setDone] = useState(0)
  const [solved, setSolved] = useState(0)
  const [misses, setMisses] = useState<Miss[]>([])
  const [said, setSaid] = useState<string | null>(null)
  const seen = useRef(new Set<string>())
  const announced = useRef(0)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  useEffect(() => {
    let alive = true
    setRows(null)
    setError(null)
    loadBucket(type.bucket)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError('Não deu para carregar os problemas. Confira a conexão e tente de novo.'))
    return () => {
      alive = false
    }
  }, [type.bucket])

  // A peça que o lance de abertura captura sai do tabuleiro; contar antes dele é um filtro seguro.
  const pool = useMemo(() => (rows ? rows.filter((r) => countPieces(r[1]) <= maxPieces) : []), [rows, maxPieces])

  const pick = useCallback(() => {
    if (!rows) return
    const avoid = seenSet(getState(), type.bucket, rows)
    seen.current.forEach((id) => avoid.add(id))
    const row = pickRow(pool, getState().puzzle.r + offset, avoid)
    if (!row) return
    seen.current.add(row[0])
    setSaid(null)
    setStage(listMode ? 'solve' : 'study')
    setStudyUntil(0)
    setPeekUntil(0)
    setPuzzle(toPuzzle(type.bucket, row))
  }, [rows, pool, type.bucket, offset, listMode])

  const start = () => {
    clearTimers()
    seen.current = new Set()
    setDone(0)
    setSolved(0)
    setPeeks(0)
    setMisses([])
    setPhase('run')
    pick()
  }

  const finish = useCallback(() => {
    clearTimers()
    setPhase('end')
    setPuzzle(null)
    playSound('end')
  }, [])

  const onResolved = useCallback(
    (ok: boolean, ms: number, miss?: Miss) => {
      if (!puzzle || !rows || phase !== 'run') return
      recordAttempt(puzzle, ok, ms, { rated: false, statsKey: 'cegas-' + puzzle.bucket, review: true })
      markSeen(puzzle.bucket, rows, puzzle.id)
      const n = done + 1
      setDone(n)
      if (ok) setSolved((x) => x + 1)
      else if (miss) setMisses((x) => [...x, miss])
      later(() => (n >= prefs.count ? finish() : pick()), ok ? 1100 : 1600)
    },
    [puzzle, rows, phase, done, prefs.count, pick, finish],
  )
  const run = usePuzzleRun(phase === 'run' ? puzzle : null, onResolved, { reveal: false })
  const view = run.view
  const now = useNow(100, phase === 'run')

  // Depois do lance de abertura começa o tempo para olhar.
  useEffect(() => {
    if (phase === 'run' && stage === 'study' && view?.phase === 'play' && !studyUntil) setStudyUntil(Date.now() + view0.secs * 1000)
  }, [phase, stage, view?.phase, studyUntil, view0.secs])
  useEffect(() => {
    if (stage === 'study' && studyUntil && now >= studyUntil) setStage('solve')
  }, [stage, studyUntil, now])

  // Lances do adversário: anunciados em texto e voz (o de abertura só na lista, que não tem tabuleiro).
  useEffect(() => {
    if (!view || !puzzle) return
    // Problema novo começa sem lances: zera a contagem do que já foi anunciado.
    if (view.phase === 'opening') {
      announced.current = 0
      return
    }
    const h = view.history
    for (let i = announced.current; i < h.length; i++) {
      const e = h[i]
      if (e.me) continue
      const who = sideName(puzzle.color === 'w' ? 'b' : 'w')
      setSaid(`${who}: ${sanWords(e.san)}`)
      if (i > 0 || listMode) voice.say(sanSpeech(e.san))
    }
    announced.current = h.length
  }, [view, puzzle, listMode, voice])

  const solving = phase === 'run' && stage === 'solve' && view?.phase === 'play'
  const peeking = peekUntil > now
  const ix = useBoard({ fen: view?.fen ?? '8/8/8/8/8/8/8/8 w - - 0 1', interactive: !!solving, color: puzzle?.color ?? 'w', autoQueen: settings.autoQueen, onMove: run.onMove, flagEmpty: true })

  const peek = () => {
    setPeeks((p) => p + 1)
    setPeekUntil(Date.now() + PEEK_MS)
  }

  const header = (
    <div className="row">
      <button className="icon-btn" onClick={() => (phase === 'run' ? finish() : go('cegas'))} aria-label={phase === 'run' ? 'Encerrar e ver os erros' : 'Voltar para às cegas'}>
        <IconArrowLeft />
      </button>
      <h2>Problemas às cegas</h2>
    </div>
  )

  if (phase === 'run') {
    const startFen = puzzle ? fenAfter(puzzle.fen, puzzle.moves, 1) : ''
    const opener = view?.history[0]
    const showPieces = !!view && (view.phase === 'opening' || stage === 'study' || peeking) && !listMode
    const studyLeft = Math.max(0, studyUntil - now)
    const line0 = puzzle && view ? numberedLine(puzzle.fen, view.history.map((h) => h.san)) : []
    return (
      <div className="page page-train">
        <div className="row-between">
          {header}
          <div className="row">
            <span className="pill num" style={{ fontSize: 14 }}>
              {Math.min(done + 1, prefs.count)} de {prefs.count}
            </span>
            <span className="pill pill-good num" style={{ fontSize: 14 }}>
              {solved} {solved === 1 ? 'certo' : 'certos'}
            </span>
            {misses.length > 0 && (
              <span className="pill pill-bad num" style={{ fontSize: 14 }}>
                {misses.length} {misses.length === 1 ? 'erro' : 'erros'}
              </span>
            )}
          </div>
        </div>
        <div className="train">
          <div className="train-board">
            {puzzle && view && listMode && (
              <div className="panel panel-tight stack piece-lists" style={{ gap: 6 }}>
                <span className="eyebrow">Posição do problema</span>
                <p>
                  <b>Brancas:</b> {pieceList(startFen, 'w')}
                </p>
                <p>
                  <b>Pretas:</b> {pieceList(startFen, 'b')}
                </p>
                {opener && (
                  <p className="muted">
                    Última jogada das {puzzle.color === 'w' ? 'pretas' : 'brancas'}: {sanWords(opener.san)}. {sideName(puzzle.color)} jogam.
                  </p>
                )}
              </div>
            )}
            <div className="board-frame">
              {puzzle && view ? (
                <Board fen={view.fen} orientation={puzzle.color} ix={ix} lastMove={view.lastMove} marks={view.marks} hidePieces={!showPieces} blind={!showPieces} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-2)' }} aria-busy="true" />
              )}
            </div>
          </div>
          <aside className="train-side">
            {puzzle && view && (
              <>
                <PromptLine puzzle={puzzle} />
                <Steps total={puzzle.length} done={view.done} failed={view.phase === 'failed'} />
                {stage === 'study' && !listMode && (
                  <>
                    <div className="row-between">
                      <span className="eyebrow">Grave a posição</span>
                      {studyUntil > 0 && <span className="timer num">{Math.ceil(studyLeft / 1000)} s</span>}
                    </div>
                    {studyUntil > 0 && (
                      <div className="bar">
                        <span style={{ width: `${(studyLeft / (view0.secs * 1000)) * 100}%` }} />
                      </div>
                    )}
                    <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setStage('solve')} disabled={view.phase !== 'play'}>
                      Pronto, pode esconder
                    </button>
                  </>
                )}
                {stage === 'solve' && (
                  <>
                    {said && (
                      <div className="announce" aria-live="polite">
                        {said}
                      </div>
                    )}
                    {line0.length > 1 && (
                      <div className="moves" aria-label="Lances do problema">
                        {line0.map((x, i) => (
                          <span key={i}>
                            {x.n && <span className="mn">{x.n} </span>}
                            <span className={`mv${view.history[i]?.ok === false ? ' bad' : view.history[i]?.me ? ' ok' : ''}`}>{x.san}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <MoveInput fen={view.fen} disabled={!solving} onMove={run.onMove} autoFocus={false} />
                    {!listMode && (
                      <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={peek} disabled={peeking || !solving}>
                        <IconEye /> Espiar 3 s{peeks ? ` (${peeks})` : ''}
                      </button>
                    )}
                  </>
                )}
                {view.phase === 'failed' && <div className="feedback bad">Errou. A explicação fica para o fim.</div>}
                {view.phase === 'solved' && (
                  <div className="feedback good">
                    <IconCheck /> Certo
                  </div>
                )}
                {view.phase === 'checking' && <div className="feedback info">Conferindo com o motor se esse caminho também dá mate...</div>}
              </>
            )}
            <CoachSays mood={moodFor(view)} text={line('blindPuzzle', done)} />
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={finish}>
              Encerrar e ver os erros
            </button>
          </aside>
        </div>
      </div>
    )
  }

  if (phase === 'end')
    return (
      <div className="page page-train">
        {header}
        <div className="panel stack-lg">
          <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
            <Coach mood={misses.length === 0 && solved > 0 ? 'happy' : 'idle'} />
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">
                Fim da rodada · {type.label} · {listMode ? 'só a lista' : `olhando ${view0.label}`}
              </span>
              <h3 className="num" style={{ fontSize: 40 }}>
                {solved}/{done} {solved === 1 ? 'certo' : 'certos'}
              </h3>
              <p className="muted">{misses.length ? 'Os erros estão explicados aqui embaixo, com o tabuleiro à vista.' : solved ? 'Nenhum erro.' : 'Nenhum problema resolvido nesta rodada.'}</p>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="v">{peeks}</span>
              <span className="k">{peeks === 1 ? 'espiada' : 'espiadas'}</span>
            </div>
            <div className="stat">
              <span className="v">{(() => {
                const st = levelStats(s, 'cegas-' + type.bucket)
                return st.tries ? `${Math.round((st.solved / st.tries) * 100)}%` : '–'
              })()}</span>
              <span className="k">de acerto em {type.label.toLowerCase()} às cegas</span>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary btn-lg" onClick={start} disabled={!pool.length}>
              <IconRetry /> De novo
            </button>
            <button className="btn" onClick={() => setPhase('start')}>
              Mudar formato
            </button>
          </div>
          {misses.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Os problemas que você errou também foram para a Revisão dos erros.</p>}
        </div>
        {misses.length > 0 && <MissReview misses={misses} />}
      </div>
    )

  const st = levelStats(s, 'cegas-' + type.bucket)
  return (
    <div className="page">
      {header}
      {error && <div className="notice notice-bad">{error}</div>}
      <div className="panel stack-lg" style={{ maxWidth: 760 }}>
        <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <Coach mood="focus" />
          <div className="stack" style={{ gap: 6 }}>
            <h3>Resolva sem ver as peças</h3>
            <p className="muted">
              Você olha a posição pelo tempo escolhido e as peças somem. Aí você joga clicando no tabuleiro vazio ou digitando o lance (Cf3 ou Nf3, Dxe5, O-O). As respostas do adversário aparecem
              escritas e faladas. Com "Só a lista", nem o tabuleiro aparece: as peças vêm escritas, como nos livros. Errou, vai para o próximo; no fim, cada erro vem explicado.
            </p>
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Tipo</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Tipo de problema">
            {BLIND_PUZZLE_TYPES.map((t) => (
              <button key={t.id} aria-pressed={prefs.type === t.id} onClick={() => setPrefs({ type: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Peças no tabuleiro</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Peças no tabuleiro">
            {PIECES.map((x) => (
              <button key={x.id} aria-pressed={prefs.pieces === x.id} onClick={() => setPrefs({ pieces: x.id })}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Como ver a posição</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Tempo para olhar">
            {VIEW.map((x) => (
              <button key={x.id} aria-pressed={prefs.view === x.id} onClick={() => setPrefs({ view: x.id })}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Nível</span>
            <div className="seg" role="group" aria-label="Nível">
              {DIFF.map((d) => (
                <button key={d.id} aria-pressed={prefs.diff === d.id} onClick={() => setPrefs({ diff: d.id })}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Problemas</span>
            <div className="seg" role="group" aria-label="Problemas por rodada">
              {ROUNDS.map((n) => (
                <button key={n} aria-pressed={prefs.count === n} onClick={() => setPrefs({ count: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        {voice.available && (
          <label className="row" style={{ gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={voice.on} onChange={(e) => voice.setOn(e.target.checked)} /> Falar os lances do adversário em voz alta
          </label>
        )}
        <div className="stats">
          <div className="stat">
            <span className="v">{st.tries ? `${st.solved}/${st.tries}` : '–'}</span>
            <span className="k">{type.label.toLowerCase()} às cegas</span>
          </div>
          <div className="stat">
            <span className="v">{rows ? pool.length : '–'}</span>
            <span className="k">problemas com essas peças</span>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={start} disabled={!pool.length}>
          {rows ? `Começar ${prefs.count} problemas` : 'Carregando...'}
        </button>
      </div>
    </div>
  )
}
