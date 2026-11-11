// Revisão dos erros: cartões de erros das partidas e de problemas que você errou.
// Volta em 1, 3, 7, 14, 30 e 60 dias; errou, volta para amanhã.
import { useCallback, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, type Arrow } from '../board/Board'
import { useBoard, type MoveIntent } from '../board/useBoard'
import { Coach } from '../coach/Coach'
import { getAnalysisEngine } from '../engine/engine'
import { winChance } from '../lib/analysis'
import { line } from '../lib/coach'
import { answerCard, dueCards, removeCard } from '../lib/progress'
import { uciToMove, type BucketId, type Puzzle } from '../lib/puzzles'
import { useAppState, useSettings, type ReviewCard } from '../lib/state'
import { playSound, soundForSan } from '../lib/sound'
import { go, useTrainingTimer } from '../ui/hooks'
import { IconArrowLeft, IconArrowRight, IconCheck, IconEye, IconX } from '../ui/icons'
import { CoachSays, coachText, Feedback, moodFor, MoveList, PromptLine, PuzzleBoard, Steps } from '../train/PuzzleView'
import { usePuzzleRun } from '../train/usePuzzleRun'

const DAY = 86400000

export function Review() {
  useTrainingTimer('revisao')
  const s = useAppState()
  const due = useMemo(() => dueCards(s), [s])
  const [session, setSession] = useState<ReviewCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [score, setScore] = useState({ ok: 0, bad: 0 })

  const card = session?.[index] ?? null
  const begin = () => {
    setSession(due.slice(0, 30))
    setIndex(0)
    setAnswered(null)
    setScore({ ok: 0, bad: 0 })
  }
  const onAnswer = useCallback(
    (ok: boolean) => {
      if (!card || answered !== null) return
      answerCard(card.id, ok)
      setAnswered(ok)
      setScore((x) => ({ ok: x.ok + (ok ? 1 : 0), bad: x.bad + (ok ? 0 : 1) }))
    },
    [card, answered],
  )
  const next = () => {
    setAnswered(null)
    setIndex((i) => i + 1)
  }

  const upcoming = s.review.filter((c) => c.due > Date.now()).sort((a, b) => a.due - b.due)

  if (!session || !card) {
    const finished = session && index >= session.length
    return (
      <div className="page">
        <div className="row">
          <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
            <IconArrowLeft />
          </button>
          <h2>Revisão dos erros</h2>
        </div>
        <div className="grid-2">
          <div className="panel stack-lg">
            <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
              <Coach mood={finished ? 'happy' : 'idle'} />
              <div className="stack" style={{ gap: 6 }}>
                {finished ? (
                  <>
                    <h3>Revisão feita</h3>
                    <p className="muted">
                      {score.ok} {score.ok === 1 ? 'acerto' : 'acertos'} e {score.bad} {score.bad === 1 ? 'erro' : 'erros'}. Os que você errou voltam amanhã.
                    </p>
                  </>
                ) : (
                  <>
                    <h3>{due.length ? `${due.length} para revisar hoje` : 'Nada para revisar agora'}</h3>
                    <p className="muted">{line('review')}</p>
                  </>
                )}
              </div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={begin} disabled={!due.length}>
              {due.length ? `Revisar ${Math.min(30, due.length)}` : 'Sem cartões para hoje'}
            </button>
            {!s.review.length && (
              <div className="empty">Os cartões aparecem quando você erra um problema da escada ou comete um erro numa partida contra o Tempo (a análise roda sozinha no fim da partida).</div>
            )}
          </div>
          <div className="panel stack">
            <span className="eyebrow">Próximos ({upcoming.length})</span>
            {upcoming.length ? (
              <div className="list">
                {upcoming.slice(0, 12).map((c) => (
                  <div key={c.id} className="list-row" style={{ padding: '10px 0' }}>
                    <span className={`pill ${c.kind === 'jogo' ? 'pill-bad' : 'pill-accent'}`}>{c.kind === 'jogo' ? 'Partida' : 'Problema'}</span>
                    <div className="grow">
                      <div className="title" style={{ fontSize: 14 }}>
                        {c.note}
                      </div>
                      <div className="sub">volta em {Math.max(1, Math.ceil((c.due - Date.now()) / DAY))} {Math.ceil((c.due - Date.now()) / DAY) <= 1 ? 'dia' : 'dias'}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeCard(c.id)} aria-label="Remover cartão">
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 14 }}>
                Nenhum cartão agendado.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page page-train">
      <div className="row-between">
        <div className="row">
          <button className="icon-btn" onClick={() => setSession(null)} aria-label="Sair da revisão">
            <IconArrowLeft />
          </button>
          <h2>Revisão</h2>
        </div>
        <span className="pill num" style={{ fontSize: 14 }}>
          {index + 1} de {session.length}
        </span>
      </div>
      {card.kind === 'problema' ? (
        <PuzzleCard key={card.id} card={card} answered={answered} onAnswer={onAnswer} onNext={next} />
      ) : (
        <GameCard key={card.id} card={card} answered={answered} onAnswer={onAnswer} onNext={next} />
      )}
    </div>
  )
}

interface CardProps {
  card: ReviewCard
  answered: boolean | null
  onAnswer: (ok: boolean) => void
  onNext: () => void
}

function PuzzleCard({ card, answered, onAnswer, onNext }: CardProps) {
  const puzzle = useMemo<Puzzle>(() => {
    const opener = card.fen.split(' ')[1] as 'w' | 'b'
    const bucket = (card.bucket ?? 'mate3') as BucketId
    return { id: card.id, bucket, fen: card.fen, moves: card.line, rating: card.rating ?? 0, color: opener === 'w' ? 'b' : 'w', length: card.line.length / 2, mate: bucket.startsWith('mate') }
  }, [card])
  const run = usePuzzleRun(puzzle, (ok) => onAnswer(ok))
  const view = run.view
  if (!view) return null
  const done = view.phase === 'solved' || view.phase === 'failed'
  return (
    <div className="train">
      <div className="train-board">
        <PuzzleBoard puzzle={puzzle} view={view} onMove={run.onMove} />
      </div>
      <aside className="train-side">
        <PromptLine puzzle={puzzle} />
        <span className="muted" style={{ fontSize: 14 }}>
          {card.note}
        </span>
        <Steps total={puzzle.length} done={view.done} failed={view.phase === 'failed'} />
        <Feedback view={view} />
        {done && (
          <div className="row">
            <button className="btn btn-primary" onClick={onNext}>
              Próximo <IconArrowRight />
            </button>
            {view.phase === 'failed' && !view.showing && (
              <button className="btn btn-ghost" onClick={run.showSolution}>
                <IconEye /> Ver solução
              </button>
            )}
          </div>
        )}
        {answered !== null && <span className="muted" style={{ fontSize: 13 }}>{answered ? 'Intervalo aumentado.' : 'Volta amanhã.'}</span>}
        <MoveList puzzle={puzzle} view={view} />
        <CoachSays mood={moodFor(view)} text={coachText(view, card.created)} />
      </aside>
    </div>
  )
}

/** Erro de partida: ache o lance que você deveria ter jogado. */
function GameCard({ card, answered, onAnswer, onNext }: CardProps) {
  const settings = useSettings()
  const color = card.fen.split(' ')[1] as 'w' | 'b'
  const [fen, setFen] = useState(card.fen)
  const [state, setState] = useState<'play' | 'checking' | 'ok' | 'bad'>('play')
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [last, setLast] = useState<{ from: string; to: string } | null>(null)
  const best = card.line[0]

  const onMove = useCallback(
    (m: MoveIntent) => {
      if (state !== 'play') return false
      const c = new Chess(card.fen)
      let mv
      try {
        mv = c.move({ from: m.from, to: m.to, promotion: m.promotion })
      } catch {
        return false
      }
      soundForSan(mv.san)
      setFen(c.fen())
      setLast({ from: mv.from, to: mv.to })
      const uci = mv.from + mv.to + (mv.promotion ?? '')
      const conclude = (ok: boolean) => {
        setState(ok ? 'ok' : 'bad')
        playSound(ok ? 'success' : 'error')
        if (!ok) setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), color: '#3cc47c' }])
        onAnswer(ok)
      }
      if (uci === best || c.isCheckmate()) {
        conclude(true)
        return true
      }
      if (card.played && uci === card.played) {
        conclude(false)
        return true
      }
      // Outro lance: vale se o motor disser que ele é tão bom quanto o melhor.
      setState('checking')
      getAnalysisEngine()
        .analyze(c.fen(), { nodes: 250000 })
        .result.then((r) => {
          const sc = r.lines[0]?.score
          if (!sc || card.bestWc === undefined) return conclude(false)
          conclude(card.bestWc - winChance(sc, color) <= 0.06)
        })
      return true
    },
    [state, card, best, color, onAnswer],
  )

  const ix = useBoard({ fen, interactive: state === 'play', color, autoQueen: settings.autoQueen, onMove })
  const bestSan = (() => {
    try {
      return new Chess(card.fen).move(uciToMove(best)).san
    } catch {
      return best
    }
  })()

  return (
    <div className="train">
      <div className="train-board">
        <div className="board-frame">
          <Board fen={fen} orientation={color} ix={ix} lastMove={last} arrows={arrows} />
        </div>
      </div>
      <aside className="train-side">
        <div className="prompt">
          <span className={`side-dot ${color}`} aria-hidden="true" />
          <div>
            <div className="t">Ache o lance certo</div>
            <div className="muted" style={{ fontSize: 14 }}>
              {card.note}
            </div>
          </div>
        </div>
        {state === 'checking' && <div className="feedback info">Conferindo com o motor...</div>}
        {state === 'ok' && (
          <div className="feedback good">
            <IconCheck /> Isso. O melhor era {bestSan}.
          </div>
        )}
        {state === 'bad' && (
          <div className="feedback bad">
            <IconX /> O lance certo era {bestSan}.
          </div>
        )}
        {(state === 'ok' || state === 'bad') && (
          <div className="row">
            <button className="btn btn-primary" onClick={onNext}>
              Próximo <IconArrowRight />
            </button>
            {state === 'bad' && (
              <button
                className="btn"
                onClick={() => {
                  setFen(card.fen)
                  setLast(null)
                  setArrows([])
                  setState('play')
                }}
              >
                Treinar de novo
              </button>
            )}
          </div>
        )}
        {answered !== null && <span className="muted" style={{ fontSize: 13 }}>{answered ? 'Intervalo aumentado.' : 'Volta amanhã.'}</span>}
        <CoachSays mood={state === 'ok' ? 'happy' : state === 'bad' ? 'sad' : state === 'checking' ? 'think' : 'focus'} text={state === 'bad' ? 'Esse padrão custou caro na partida. Grava ele.' : 'Na partida você errou aqui. Agora sem pressa.'} />
      </aside>
    </div>
  )
}
