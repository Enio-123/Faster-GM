// Lance digitado, para jogar às cegas sem precisar achar a casa no tabuleiro.
// Aceita a notação em inglês e em português; se o texto servir para dois lances, pergunta qual.
import { useEffect, useRef, useState } from 'react'
import type { Move } from 'chess.js'
import type { MoveIntent } from '../board/useBoard'
import { INPUT_EXAMPLES, moveChoiceLabel, parseMoveInput } from '../lib/blind'
import { playSound } from '../lib/sound'

export function MoveInput({ fen, disabled, onMove, autoFocus, label = 'Seu lance' }: { fen: string; disabled?: boolean; onMove: (m: MoveIntent) => boolean; autoFocus?: boolean; label?: string }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Move[] | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setChoices(null)
    setError(null)
  }, [fen])

  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus({ preventScroll: true })
  }, [autoFocus, disabled, fen])

  const play = (m: Move) => {
    const ok = onMove({ from: m.from, to: m.to, promotion: m.promotion })
    if (ok) {
      setText('')
      setError(null)
      setChoices(null)
    } else setError('Esse lance não foi aceito agora.')
  }

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (disabled) return
    const r = parseMoveInput(fen, text)
    if (r.error) {
      setError(r.error)
      setChoices(null)
      playSound('error')
      return
    }
    if (r.moves.length === 1) play(r.moves[0])
    else {
      setError(null)
      setChoices(r.moves)
    }
  }

  return (
    <div className="move-input stack" style={{ gap: 8 }}>
      <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={submit}>
        <input
          ref={ref}
          className="input grow"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(null)
          }}
          placeholder={`${label}: ${INPUT_EXAMPLES}`}
          aria-label={label}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          disabled={disabled}
        />
        <button type="submit" className="btn btn-primary" disabled={disabled || !text.trim()}>
          Jogar
        </button>
      </form>
      {error && (
        <p className="input-error" role="alert">
          {error}
        </p>
      )}
      {choices && (
        <div className="stack" style={{ gap: 6 }} role="group" aria-label="Qual lance?">
          <span className="muted" style={{ fontSize: 14 }}>
            "{text.trim()}" serve para {choices.length} lances. Qual deles?
          </span>
          <div className="row" style={{ gap: 8 }}>
            {choices.map((m) => (
              <button key={m.from + m.to + (m.promotion ?? '')} type="button" className="btn btn-sm" onClick={() => play(m)}>
                {moveChoiceLabel(m)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
