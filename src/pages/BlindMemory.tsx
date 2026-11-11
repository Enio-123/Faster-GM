// Memória da posição: uma posição real aparece por alguns segundos e some. Depois, opcionalmente,
// alguns lances da partida são anunciados por cima da posição escondida. Aí vêm as perguntas.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board } from '../board/Board'
import { usePickBoard } from '../board/pickBoard'
import { pieceUrl } from '../board/pieces'
import { Coach } from '../coach/Coach'
import { countPieces, memoryAnswer, piecesAfter, memoryPrompt, memoryQuestions, PIECE_ORDER, pieceName, sanSpeech, sanWords, type MemQ, type PieceCode } from '../lib/blind'
import { line } from '../lib/coach'
import { fenAfter, loadBucket, numberedLine, uciToMove, type Row } from '../lib/puzzles'
import { recordStat } from '../lib/progress'
import { recordBlind, useAppState } from '../lib/state'
import { playSound, soundForSan } from '../lib/sound'
import { go, useNow, usePrefs, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconArrowRight, IconCheck, IconRetry, IconX } from '../ui/icons'
import { useVoice } from '../train/useVoice'

export const MEMORY_BANDS = [
  { id: '8', label: 'Até 8 peças', min: 3, max: 8 },
  { id: '12', label: '9 a 12', min: 9, max: 12 },
  { id: '16', label: '13 a 16', min: 13, max: 16 },
  { id: '32', label: '17 ou mais', min: 17, max: 32 },
] as const
type BandId = (typeof MEMORY_BANDS)[number]['id']
const SECONDS = [5, 10, 20] as const
const PLIES = [0, 2, 4] as const
const POSITIONS = 5
const QUESTIONS = 4
const MOVE_GAP = 2600

interface Prefs {
  band: BandId
  secs: number
  plies: number
}
const fixPrefs = (p: Prefs): Prefs => ({
  band: MEMORY_BANDS.some((b) => b.id === p.band) ? p.band : '8',
  secs: (SECONDS as readonly number[]).includes(p.secs) ? p.secs : 10,
  plies: (PLIES as readonly number[]).includes(p.plies) ? p.plies : 0,
})

export const memoryKey = (p: Prefs) => `memoria-${p.band}-${p.plies}-${p.secs}`

interface Position {
  id: string
  start: string
  orientation: 'w' | 'b'
  /** Lances anunciados (UCI) a partir de `start`. */
  moves: string[]
  sans: string[]
  final: string
  questions: MemQ[]
}

interface Answer {
  q: MemQ
  given: string | null
  ok: boolean
}

function buildPosition(row: Row, plies: number): Position | null {
  const [id, fen, mv] = row
  const all = mv.split(' ')
  try {
    const start = fenAfter(fen, all, 1)
    const moves = all.slice(1, 1 + plies)
    if (moves.length < plies) return null
    const c = new Chess(start)
    const sans: string[] = []
    const focus: string[] = []
    for (const u of moves) {
      const m = c.move(uciToMove(u))
      sans.push(m.san)
      focus.push(m.from, m.to)
    }
    const final = c.fen()
    return { id, start, orientation: start.split(' ')[1] as 'w' | 'b', moves, sans, final, questions: memoryQuestions(final, QUESTIONS, Math.random, focus) }
  } catch {
    return null
  }
}

const PICKER: (PieceCode | null)[][] = [PIECE_ORDER.map((t) => `w${t}` as PieceCode), PIECE_ORDER.map((t) => `b${t}` as PieceCode)]

export function BlindMemory() {
  useTrainingTimer('calculo')
  const s = useAppState()
  const voice = useVoice()
  const [prefs, setPrefs] = usePrefs<Prefs>('faster-gm:cegas-memoria', { band: '8', secs: 10, plies: 0 }, fixPrefs)
  const band = MEMORY_BANDS.find((b) => b.id === prefs.band) ?? MEMORY_BANDS[0]
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'start' | 'look' | 'moves' | 'ask' | 'check' | 'end'>('start')
  const [pos, setPos] = useState<Position | null>(null)
  const [index, setIndex] = useState(0)
  const [qi, setQi] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [all, setAll] = useState<Answer[]>([])
  const [announced, setAnnounced] = useState(0)
  const [lookUntil, setLookUntil] = useState(0)
  const [best, setBest] = useState(0)
  const [lock, setLock] = useState(false)
  const seen = useRef(new Set<string>())
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  useEffect(() => {
    let alive = true
    Promise.all([loadBucket('calc3'), loadBucket('calc4')])
      .then(([a, b]) => alive && setRows([...a, ...b]))
      .catch(() => alive && setError('Não deu para carregar as posições. Confira a conexão e tente de novo.'))
    return () => {
      alive = false
    }
  }, [])

  // Posições da faixa de peças escolhida (contadas depois do lance que abre o problema).
  const pool = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      const n = piecesAfter(r[1], r[2].slice(0, 4))
      return n >= band.min && n <= band.max
    })
  }, [rows, band.min, band.max])

  const now = useNow(100, phase === 'look')
  const lookLeft = Math.max(0, lookUntil - now)

  const showPosition = useCallback(
    (k: number) => {
      clearTimers()
      let p: Position | null = null
      for (let tries = 0; tries < 40 && !p; tries++) {
        const fresh = pool.filter((r) => !seen.current.has(r[0]))
        const list = fresh.length ? fresh : pool
        const row = list[Math.floor(Math.random() * list.length)]
        if (!row) break
        seen.current.add(row[0])
        p = buildPosition(row, prefs.plies)
      }
      if (!p) {
        setError('Não há posições para essa combinação. Escolha outra faixa de peças.')
        setPhase('start')
        return
      }
      setPos(p)
      setIndex(k)
      setQi(0)
      setAnswers([])
      setAnnounced(0)
      setLock(false)
      setLookUntil(Date.now() + prefs.secs * 1000)
      setPhase('look')
    },
    [pool, prefs.plies, prefs.secs],
  )

  const start = () => {
    setError(null)
    setAll([])
    showPosition(0)
  }

  const hide = useCallback(() => {
    if (!pos) return
    clearTimers()
    if (pos.moves.length) {
      setPhase('moves')
      setAnnounced(0)
      pos.sans.forEach((san, i) => {
        later(() => {
          setAnnounced(i + 1)
          soundForSan(san)
          voice.say(sanSpeech(san))
        }, 700 + i * MOVE_GAP)
      })
      later(() => setPhase('ask'), 700 + pos.sans.length * MOVE_GAP)
    } else setPhase('ask')
  }, [pos, voice])

  useEffect(() => {
    if (phase === 'look' && lookUntil && lookLeft <= 0) hide()
  }, [phase, lookLeft, lookUntil, hide])

  const q = pos && phase === 'ask' ? pos.questions[qi] : null

  const answer = useCallback(
    (given: string | null) => {
      if (!pos || !q || lock) return
      const ok = q.kind === 'onde' ? given === q.square : given === q.piece
      recordStat('memoria', ok)
      playSound(ok ? 'move' : 'error')
      const a = { q, given, ok }
      setAnswers((x) => [...x, a])
      setAll((x) => [...x, a])
      setLock(true)
      later(
        () => {
          setLock(false)
          if (qi + 1 < pos.questions.length) setQi(qi + 1)
          else setPhase('check')
        },
        ok ? 650 : 1500,
      )
    },
    [pos, q, qi, lock],
  )

  const nextPosition = () => {
    if (index + 1 < POSITIONS) showPosition(index + 1)
    else {
      const score = all.filter((a) => a.ok).length
      setBest(recordBlind(memoryKey(prefs), score))
      playSound('end')
      setPhase('end')
    }
  }

  const pick = usePickBoard(useCallback((sq: string) => q?.kind === 'onde' && answer(sq), [q, answer]))
  const last = answers[answers.length - 1]
  const marks: Record<string, 'good' | 'bad' | 'hint'> = {}
  if (phase === 'ask' && lock && last) {
    if (last.q.kind === 'onde') {
      if (last.given && !last.ok) marks[last.given] = 'bad'
      marks[last.q.square] = 'good'
    } else marks[last.q.square] = last.ok ? 'good' : 'bad'
  } else if (phase === 'ask' && q?.kind === 'oque') marks[q.square] = 'hint'
  if (phase === 'check') for (const a of answers) marks[a.q.square] = a.ok ? 'good' : 'bad'

  const header = (
    <div className="row">
      <button className="icon-btn" onClick={() => go('cegas')} aria-label="Voltar para às cegas">
        <IconArrowLeft />
      </button>
      <h2>Memória da posição</h2>
    </div>
  )

  if (phase === 'end') {
    const score = all.filter((a) => a.ok).length
    return (
      <div className="page">
        {header}
        <div className="panel stack-lg" style={{ maxWidth: 760 }}>
          <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
            <Coach mood={score >= 18 ? 'happy' : 'idle'} />
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">
                Fim da rodada · {band.label.toLowerCase()} · {prefs.secs} s{prefs.plies ? ` · ${prefs.plies} lances anunciados` : ''}
              </span>
              <h3 className="num" style={{ fontSize: 40 }}>
                {score}/{POSITIONS * QUESTIONS}
              </h3>
              <p className="muted">{score === POSITIONS * QUESTIONS ? 'Rodada perfeita. Hora de subir: menos tempo, mais peças ou lances anunciados.' : 'Os erros foram mostrados em cada posição.'}</p>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="v">{best}</span>
              <span className="k">recorde neste formato</span>
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
        </div>
      </div>
    )
  }

  if (phase !== 'start' && pos) {
    const hidden = phase === 'moves' || phase === 'ask'
    const fen = phase === 'look' ? pos.start : pos.final
    const nums = numberedLine(pos.start, pos.sans)
    return (
      <div className="page page-train">
        <div className="row-between">
          {header}
          <span className="pill num" style={{ fontSize: 14 }}>
            posição {index + 1} de {POSITIONS}
          </span>
        </div>
        <div className="train">
          <div className="train-board">
            <div className="board-frame">
              <Board fen={fen} orientation={pos.orientation} ix={pick} marks={marks} hidePieces={hidden} />
            </div>
          </div>
          <aside className="train-side">
            {phase === 'look' && (
              <>
                <div className="row-between">
                  <span className="eyebrow">Grave a posição</span>
                  <span className="timer num">{Math.ceil(lookLeft / 1000)} s</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${(lookLeft / (prefs.secs * 1000)) * 100}%` }} />
                </div>
                <p className="muted" style={{ fontSize: 14 }}>
                  {countPieces(pos.start)} peças. {pos.orientation === 'w' ? 'Brancas' : 'Pretas'} embaixo.{' '}
                  {pos.moves.length ? `Depois que sumir, vêm ${pos.moves.length} lances da partida e as perguntas são sobre a posição depois deles.` : 'Quando sumir, vêm 4 perguntas.'}
                </p>
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={hide}>
                  Pronto, pode esconder
                </button>
              </>
            )}
            {(phase === 'moves' || (phase === 'ask' && pos.moves.length > 0) || (phase === 'check' && pos.moves.length > 0)) && (
              <div className="panel panel-tight stack" style={{ gap: 8 }}>
                <span className="eyebrow">Lances anunciados</span>
                <ol className="said">
                  {pos.sans.slice(0, phase === 'moves' ? announced : pos.sans.length).map((san, i) => (
                    <li key={i}>
                      <span className="mn num">{nums[i]?.n}</span> <b>{sanWords(san)}</b>
                    </li>
                  ))}
                </ol>
                {phase === 'moves' && announced < pos.sans.length && <span className="muted" style={{ fontSize: 13 }}>Atualize a posição na cabeça a cada lance.</span>}
              </div>
            )}
            {phase === 'ask' && q && (
              <>
                <div className="row-between">
                  <span className="eyebrow">
                    Pergunta {qi + 1} de {pos.questions.length}
                  </span>
                </div>
                <p className="memory-q">{memoryPrompt(q)}</p>
                {q.kind === 'onde' ? (
                  <p className="muted" style={{ fontSize: 14 }}>
                    Clique na casa no tabuleiro.
                  </p>
                ) : (
                  <div className="piece-picker" role="group" aria-label="Escolha a peça">
                    {PICKER.map((row, i) => (
                      <div key={i} className="piece-row">
                        {row.map((code) => (
                          <button key={code} type="button" disabled={lock} onClick={() => answer(code)} aria-label={pieceName(code!)}>
                            <img src={pieceUrl(code!)} alt="" />
                          </button>
                        ))}
                      </div>
                    ))}
                    <button type="button" className="btn btn-sm empty-sq" disabled={lock} onClick={() => answer(null)}>
                      Casa vazia
                    </button>
                  </div>
                )}
                <div aria-live="polite" style={{ minHeight: 48 }}>
                  {lock && last && (
                    <div className={`feedback ${last.ok ? 'good' : 'bad'}`}>
                      {last.ok ? <IconCheck /> : <IconX />}
                      <span>{last.ok ? 'Certo.' : `Não. ${memoryAnswer(last.q)}`}</span>
                    </div>
                  )}
                </div>
              </>
            )}
            {phase === 'check' && (
              <>
                <span className="eyebrow">Confira a posição</span>
                <ul className="memory-list">
                  {answers.map((a, i) => (
                    <li key={i} className={a.ok ? 'ok' : 'bad'}>
                      {a.ok ? <IconCheck /> : <IconX />}
                      <span>
                        {memoryPrompt(a.q)} {memoryAnswer(a.q)}
                      </span>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={nextPosition}>
                  {index + 1 < POSITIONS ? 'Próxima posição' : 'Ver resultado'} <IconArrowRight />
                </button>
              </>
            )}
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {header}
      {error && <div className="notice notice-bad">{error}</div>}
      <div className="panel stack-lg" style={{ maxWidth: 760 }}>
        <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <Coach mood="focus" />
          <div className="stack" style={{ gap: 6 }}>
            <h3>Olhe, grave e responda sem ver</h3>
            <p className="muted">
              Posições reais de partidas. A posição fica alguns segundos na tela e some; aí vêm 4 perguntas: onde está uma peça ou o que tem numa casa. Com lances anunciados, a posição muda na sua cabeça
              antes das perguntas, como numa partida às cegas. Rodada de {POSITIONS} posições.
            </p>
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Peças na posição</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Peças na posição">
            {MEMORY_BANDS.map((b) => (
              <button key={b.id} aria-pressed={prefs.band === b.id} onClick={() => setPrefs({ band: b.id })}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Tempo para olhar</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Segundos para olhar">
            {SECONDS.map((n) => (
              <button key={n} aria-pressed={prefs.secs === n} onClick={() => setPrefs({ secs: n })}>
                {n} s
              </button>
            ))}
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Lances anunciados depois de esconder</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }} role="group" aria-label="Lances anunciados">
            {PLIES.map((n) => (
              <button key={n} aria-pressed={prefs.plies === n} onClick={() => setPrefs({ plies: n })}>
                {n === 0 ? 'Nenhum' : `${n} lances`}
              </button>
            ))}
          </div>
          {voice.available && (
            <label className="row" style={{ gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={voice.on} onChange={(e) => voice.setOn(e.target.checked)} /> Falar os lances em voz alta
            </label>
          )}
        </div>
        <div className="stats">
          <div className="stat">
            <span className="v">{s.records.blind[memoryKey(prefs)] ?? 0}/20</span>
            <span className="k">recorde neste formato</span>
          </div>
          <div className="stat">
            <span className="v">{rows ? pool.length : '–'}</span>
            <span className="k">posições nesta faixa</span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          {line('memory')}
        </p>
        <button className="btn btn-primary btn-lg" onClick={start} disabled={!pool.length}>
          {rows ? 'Começar' : 'Carregando...'}
        </button>
      </div>
    </div>
  )
}
