import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSettings } from '../lib/state'
import { getTheme, squareBackground } from './themes'
import { pieceUrl } from './pieces'
import { trackPieces, type TrackedPiece } from './tracking'
import type { BoardInteraction } from './useBoard'

const FILES = 'abcdefgh'

export interface Arrow { from: string; to: string; color: string }

export interface BoardProps {
  /** Peças mostradas. No cálculo às cegas fica parada enquanto as regras seguem `ix`. */
  fen: string
  orientation: 'w' | 'b'
  ix: BoardInteraction
  lastMove?: { from: string; to: string } | null
  arrows?: Arrow[]
  marks?: Record<string, 'good' | 'bad' | 'hint'>
  premove?: { from: string; to: string } | null
  overlay?: ReactNode
  /** Cálculo às cegas: esconde xeque e casas possíveis, que entregariam a posição imaginada. */
  blind?: boolean
}

function squareXY(sq: string, orientation: 'w' | 'b') {
  const f = sq.charCodeAt(0) - 97
  const r = Number(sq[1]) - 1
  return orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r }
}

export function Board({ fen, orientation, ix, lastMove, arrows, marks, premove, overlay, blind }: BoardProps) {
  const settings = useSettings()
  const theme = getTheme(settings.boardTheme)
  const [tracked, setTracked] = useState<TrackedPiece[]>(() => trackPieces([], fen))
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ from: string; code: string; x: number; y: number; started: boolean } | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    setTracked((prev) => trackPieces(prev, fen))
  }, [fen])

  const targetSet = useMemo(() => new Map(ix.targets.map((t) => [t.to, t.capture])), [ix.targets])

  const squareFromPoint = (clientX: number, clientY: number): string | null => {
    const el = boardRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = Math.floor(((clientX - rect.left) / rect.width) * 8)
    const y = Math.floor(((clientY - rect.top) / rect.height) * 8)
    if (x < 0 || x > 7 || y < 0 || y > 7) return null
    const f = orientation === 'w' ? x : 7 - x
    const r = orientation === 'w' ? 7 - y : y
    return FILES[f] + String(r + 1)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const sq = squareFromPoint(e.clientX, e.clientY)
    if (!sq) return
    const piece = ix.chess.get(sq as never) as { color: 'w' | 'b'; type: string } | undefined
    if (piece && ix.canPick(piece.color) && !ix.pendingPromotion) {
      dragStart.current = { x: e.clientX, y: e.clientY }
      setDrag({ from: sq, code: piece.color + piece.type, x: e.clientX, y: e.clientY, started: false })
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const s = dragStart.current
    const started = drag.started || (s ? Math.hypot(e.clientX - s.x, e.clientY - s.y) > 6 : false)
    setDrag({ ...drag, x: e.clientX, y: e.clientY, started })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const sq = squareFromPoint(e.clientX, e.clientY)
    if (drag && drag.started) {
      setDrag(null)
      if (sq) ix.onDrop(drag.from, sq)
      return
    }
    setDrag(null)
    if (sq) ix.onSquare(sq)
  }

  const squares = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const f = orientation === 'w' ? x : 7 - x
      const r = orientation === 'w' ? 7 - y : y
      const sq = FILES[f] + String(r + 1)
      const light = (f + r) % 2 === 1
      const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq)
      const isPre = premove && (premove.from === sq || premove.to === sq)
      const mark = marks?.[sq]
      const cls = ['sq']
      if (isLast) cls.push('sq-last')
      if (ix.selected === sq) cls.push('sq-selected')
      else if (isPre) cls.push('sq-premove')
      if (ix.invalid === sq) cls.push('sq-invalid')
      if (!blind && ix.checkSquare === sq) cls.push('sq-check')
      if (mark) cls.push(`sq-mark-${mark}`)
      squares.push(
        <div key={sq} className={cls.join(' ')} style={{ background: squareBackground(theme, light, f, r), left: `${x * 12.5}%`, top: `${y * 12.5}%` }}>
          {settings.coordinates && x === 0 && <span className="coord coord-rank" style={{ color: light ? theme.dark : theme.light }}>{r + 1}</span>}
          {settings.coordinates && y === 7 && <span className="coord coord-file" style={{ color: light ? theme.dark : theme.light }}>{FILES[f]}</span>}
          {settings.showLegal && !blind && targetSet.has(sq) && <span className={targetSet.get(sq) ? 'hint-capture' : 'hint-dot'} />}
        </div>,
      )
    }
  }

  const size = boardRef.current?.clientWidth ?? 0
  return (
    <div
      className="board2d"
      ref={boardRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onContextMenu={(e) => e.preventDefault()}
      role="grid"
      aria-label="Tabuleiro de xadrez"
    >
      {squares}
      {tracked.map((p) => {
        const { x, y } = squareXY(p.square, orientation)
        const dragging = drag?.started && drag.from === p.square
        return (
          <img
            key={p.id}
            src={pieceUrl(p.code)}
            alt=""
            draggable={false}
            className="piece2d"
            style={{ transform: `translate(${x * 100}%, ${y * 100}%)`, transition: 'transform 140ms cubic-bezier(.25,.8,.35,1)', opacity: dragging ? 0.35 : 1 }}
          />
        )
      })}
      {arrows && arrows.length > 0 && (
        <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            {arrows.map((a, i) => (
              <marker key={i} id={`ah${i}`} markerWidth="3" markerHeight="3" refX="1.6" refY="1.5" orient="auto">
                <path d="M0,0 L3,1.5 L0,3 z" fill={a.color} />
              </marker>
            ))}
          </defs>
          {arrows.map((a, i) => {
            const s = squareXY(a.from, orientation)
            const t = squareXY(a.to, orientation)
            const dx = t.x - s.x
            const dy = t.y - s.y
            const len = Math.hypot(dx, dy) || 1
            return (
              <line
                key={i}
                x1={s.x + 0.5}
                y1={s.y + 0.5}
                x2={t.x + 0.5 - (dx / len) * 0.35}
                y2={t.y + 0.5 - (dy / len) * 0.35}
                stroke={a.color}
                strokeWidth={0.16}
                strokeLinecap="round"
                markerEnd={`url(#ah${i})`}
                opacity={0.88}
              />
            )
          })}
        </svg>
      )}
      {drag?.started && boardRef.current && (
        <img
          src={pieceUrl(drag.code)}
          alt=""
          className="piece-ghost"
          style={{
            width: size / 8,
            height: size / 8,
            left: drag.x - boardRef.current.getBoundingClientRect().left - size / 16,
            top: drag.y - boardRef.current.getBoundingClientRect().top - size / 16,
          }}
        />
      )}
      {ix.pendingPromotion && (
        <div className="promo" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <div className="promo-box" role="dialog" aria-label="Escolha a promoção">
            {['q', 'r', 'b', 'n'].map((p) => (
              <button key={p} type="button" onClick={() => ix.choosePromotion(p)} aria-label={{ q: 'Dama', r: 'Torre', b: 'Bispo', n: 'Cavalo' }[p]}>
                <img src={pieceUrl(ix.pendingPromotion!.color + p)} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}
      {overlay && (
        <div className="board-overlay" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          {overlay}
        </div>
      )}
    </div>
  )
}
