import type { ReactNode } from 'react'
import { Board } from '../board/Board'
import { useBoard, type MoveIntent } from '../board/useBoard'
import { Coach, type Mood } from '../coach/Coach'
import { line } from '../lib/coach'
import { numberedLine, type Puzzle } from '../lib/puzzles'
import { useSettings } from '../lib/state'
import { formatSolve } from '../lib/time'
import { useNow } from '../ui/hooks'
import { IconCheck, IconX } from '../ui/icons'
import type { RunView } from './usePuzzleRun'

export function PuzzleBoard({ puzzle, view, onMove, overlay }: { puzzle: Puzzle; view: RunView; onMove: (m: MoveIntent) => boolean; overlay?: ReactNode }) {
  const s = useSettings()
  const ix = useBoard({ fen: view.fen, interactive: view.phase === 'play' && !view.showing, color: puzzle.color, autoQueen: s.autoQueen, onMove })
  return (
    <div className="board-frame">
      <Board fen={view.fen} orientation={puzzle.color} ix={ix} lastMove={view.lastMove} arrows={view.arrows} marks={view.marks} overlay={overlay} />
    </div>
  )
}

export function moodFor(view: RunView | null): Mood {
  if (!view) return 'idle'
  if (view.phase === 'solved') return 'happy'
  if (view.phase === 'failed') return 'sad'
  if (view.phase === 'checking') return 'think'
  return 'focus'
}

export function PromptLine({ puzzle }: { puzzle: Puzzle }) {
  const who = puzzle.color === 'w' ? 'Brancas' : 'Pretas'
  const what = puzzle.mate ? `dão mate em ${puzzle.length}` : `jogam e ganham`
  return (
    <div className="prompt">
      <span className={`side-dot ${puzzle.color}`} aria-hidden="true" />
      <div>
        <div className="t">
          {who} {what}
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          Problema {puzzle.rating} · linha de {puzzle.length} {puzzle.length === 1 ? 'lance' : 'lances'}
        </div>
      </div>
    </div>
  )
}

export function Steps({ total, done, failed }: { total: number; done: number; failed: boolean }) {
  return (
    <div className="steps" aria-label={`${done} de ${total} lances`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < done ? 'ok' : i === done && failed ? 'bad' : i === done ? 'on' : ''} />
      ))}
    </div>
  )
}

export function RunTimer({ view }: { view: RunView }) {
  const running = view.phase !== 'opening' && view.endedAt === null
  const now = useNow(100, running)
  const ms = view.startedAt ? (view.endedAt ?? now) - view.startedAt : 0
  return <span className="timer">{formatSolve(Math.max(0, ms))}</span>
}

export function Feedback({ view, extra }: { view: RunView; extra?: ReactNode }) {
  if (view.phase === 'solved')
    return (
      <div className="feedback good">
        <IconCheck />
        <span>{view.failedOnce ? 'Resolvido na nova tentativa.' : 'Resolvido.'}</span>
        {extra}
      </div>
    )
  if (view.phase === 'failed')
    return (
      <div className="feedback bad">
        <IconX />
        <span>{view.showing ? 'Solução no tabuleiro.' : 'Não é esse. A seta mostra o lance certo.'}</span>
        {extra}
      </div>
    )
  if (view.phase === 'checking') return <div className="feedback info">Conferindo com o motor se esse caminho também dá mate...</div>
  return null
}

export function CoachSays({ mood, text }: { mood: Mood; text: string }) {
  return (
    <div className="coach-line">
      <Coach mood={mood} />
      <div className="bubble">{text}</div>
    </div>
  )
}

export function coachText(view: RunView | null, seed: number): string {
  if (!view || view.phase === 'opening') return line('start', seed)
  if (view.phase === 'solved') {
    const ms = (view.endedAt ?? 0) - view.startedAt
    return ms < 15000 && !view.failedOnce ? line('goodFast', seed) : line('good', seed)
  }
  if (view.phase === 'failed') return line('bad', seed)
  if (view.phase === 'checking') return 'Caminho diferente. Deixa eu conferir.'
  return line('start', seed)
}

export function MoveList({ puzzle, view }: { puzzle: Puzzle; view: RunView }) {
  if (!view.history.length) return null
  const nums = numberedLine(puzzle.fen, view.history.map((h) => h.san))
  return (
    <div className="moves" aria-label="Lances">
      {nums.map((n, i) => (
        <span key={i}>
          {n.n && <span className="mn">{n.n} </span>}
          <span className={`mv${view.history[i].ok === false ? ' bad' : view.history[i].me && view.history[i].ok ? ' ok' : ''}`}>{n.san}</span>
        </span>
      ))}
    </div>
  )
}
