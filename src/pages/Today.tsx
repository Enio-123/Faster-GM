import { useMemo, useState } from 'react'
import { Coach } from '../coach/Coach'
import { line } from '../lib/coach'
import { recommend } from '../lib/bot'
import { dueCards } from '../lib/progress'
import { blockMinutes, BLOCKS, dayComplete, nextBlock, streak, totalSeconds } from '../lib/routine'
import { setState, useAppState } from '../lib/state'
import { addDays, dayKey, formatMinutes, weekdayShort } from '../lib/time'
import { go } from '../ui/hooks'
import { IconArrowRight, IconCheck } from '../ui/icons'

const PRESETS = [60, 90, 120, 180, 240]

export function Today() {
  const s = useAppState()
  const today = dayKey()
  const day = s.days[today]
  const target = s.settings.dailyMinutes
  const mins = blockMinutes(target)
  const doneSec = totalSeconds(day)
  const complete = dayComplete(day, target)
  const nb = nextBlock(day, target)
  const st = streak(s.days, target, today)
  const due = dueCards(s).length
  const rec = recommend(s.puzzle.r, s.puzzle.n, s.bot.ladder)
  const firstRun = !s.profile.onboarded && s.puzzle.n === 0 && s.bot.games === 0
  const [seed] = useState(() => Date.now())
  const speech = useMemo(() => {
    if (complete) return line('helloDone', seed)
    if (doneSec > 0) return line('helloLate', seed)
    return line('hello', seed)
  }, [complete, doneSec, seed])

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  return (
    <div className="page">
      <section className="today-hero">
        <div className="coach-wrap">
          <Coach mood={complete ? 'happy' : 'idle'} />
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <span className="eyebrow">
            {weekdayShort(today)} · {today.split('-').reverse().slice(0, 2).join('/')}
          </span>
          <p className="speech">{speech}</p>
        </div>
      </section>

      {firstRun && <FirstRun />}

      <div className="today-grid">
        <section className="panel stack-lg">
          <div className="row-between" style={{ alignItems: 'flex-end' }}>
            <div className="day-meter">
              <span className="eyebrow">Rotina de hoje</span>
              <span className="big num">
                {Math.floor(doneSec / 60)}
                <small> / {target} min</small>
              </span>
            </div>
            {complete ? (
              <span className="pill pill-good" style={{ fontSize: 14 }}>
                <IconCheck /> Cumprida
              </span>
            ) : (
              nb && (
                <button className="btn btn-primary btn-lg" onClick={() => go(nb.route)}>
                  {doneSec ? 'Continuar' : 'Começar'} <IconArrowRight />
                </button>
              )
            )}
          </div>
          <div className="bar">
            <span style={{ width: `${Math.min(100, (doneSec / (target * 60)) * 100)}%` }} />
          </div>
          <div>
            {BLOCKS.map((b, i) => {
              const sec = day?.[b.id] ?? 0
              const goal = mins[b.id] * 60
              const done = sec >= goal
              const isNext = !complete && nb?.id === b.id
              return (
                <div key={b.id} className={`block-row${done ? ' done' : ''}${isNext ? ' next' : ''}`}>
                  <span className="idx">{done ? <IconCheck /> : i + 1}</span>
                  <div className="meta">
                    <div className="row-between">
                      <span style={{ fontWeight: 600 }}>{b.name}</span>
                      <span className="muted num" style={{ fontSize: 14 }}>
                        {Math.floor(sec / 60)} / {mins[b.id]} min
                      </span>
                    </div>
                    <div className={`bar${done ? ' good' : ''}`}>
                      <span style={{ width: `${Math.min(100, (sec / goal) * 100)}%` }} />
                    </div>
                    <span className="why">{b.why}</span>
                  </div>
                  <button className="btn btn-sm" onClick={() => go(b.route)} aria-label={`Abrir ${b.name}`}>
                    <IconArrowRight />
                  </button>
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            O tempo conta sozinho enquanto você treina em cada tela (pausa depois de 90 segundos sem mexer). A rotina fecha quando o total do dia chega a {formatMinutes(target)}.
          </p>
        </section>

        <aside className="stack-lg">
          <section className="panel stack">
            <div className="row-between">
              <span className="eyebrow">Disciplina</span>
              <span className="pill pill-accent num">
                {st} {st === 1 ? 'dia seguido' : 'dias seguidos'}
              </span>
            </div>
            <div className="week">
              {week.map((k) => {
                const sec = totalSeconds(s.days[k])
                const full = sec >= target * 60
                return (
                  <div key={k} className={`d${k === today ? ' today' : ''}`}>
                    <span className={`cell${full ? ' full' : sec > 0 ? ' part' : ''}`}>{sec > 0 ? Math.round(sec / 60) : ''}</span>
                    <span>{weekdayShort(k)}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="panel stack">
            <span className="eyebrow">Seus números</span>
            <div className="stats">
              <button className="stat" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => go('progresso')}>
                <span className="v">{Math.round(s.puzzle.r)}</span>
                <span className="k">rating de problemas{s.puzzle.n < 10 ? ' (provisório)' : ''}</span>
              </button>
              <button className="stat" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => go('jogar')}>
                <span className="v">{rec.elo}</span>
                <span className="k">nível recomendado do bot</span>
              </button>
              <button className="stat" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => go('erros')}>
                <span className="v">{due}</span>
                <span className="k">erros para revisar</span>
              </button>
            </div>
          </section>

          <section className="panel stack">
            <div className="row-between">
              <span className="eyebrow">Tempo por dia</span>
              <span className="muted num" style={{ fontSize: 14 }}>
                {formatMinutes(target)}
              </span>
            </div>
            <div className="seg" role="group" aria-label="Tempo de treino por dia">
              {PRESETS.map((m) => (
                <button key={m} aria-pressed={target === m} onClick={() => setState((x) => ({ ...x, settings: { ...x.settings, dailyMinutes: m } }))}>
                  {m < 60 ? `${m} min` : `${m / 60}h`.replace('.5h', 'h30')}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

/** Primeiro acesso: os ratings que você já tem ajustam o ponto de partida do bot. */
function FirstRun() {
  const [chesscom, setChesscom] = useState('')
  const [otb, setOtb] = useState('')
  const save = () => {
    const c = Number(chesscom)
    const o = Number(otb)
    setState((s) => ({
      ...s,
      profile: { ...s.profile, chesscom: c > 0 ? c : undefined, otb: o > 0 ? o : undefined, onboarded: true },
      bot: s.bot.games === 0 && c > 0 ? { ...s.bot, ladder: Math.max(800, Math.min(2800, Math.round(c / 50) * 50)) } : s.bot,
    }))
  }
  return (
    <section className="panel stack">
      <h3>Antes de começar</h3>
      <p className="muted" style={{ fontSize: 14 }}>
        Seu rating no chess.com define o primeiro nível do bot. O rating oficial fica registrado no seu perfil. Os dois são opcionais.
      </p>
      <div className="row firstrun-row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="fr-chesscom">Chess.com (blitz ou rápida)</label>
          <input id="fr-chesscom" className="input num" inputMode="numeric" value={chesscom} onChange={(e) => setChesscom(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="ex.: 1200" />
        </div>
        <div className="field">
          <label htmlFor="fr-otb">Rating oficial (FIDE ou federação)</label>
          <input id="fr-otb" className="input num" inputMode="numeric" value={otb} onChange={(e) => setOtb(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="ex.: 1500" />
        </div>
        <button className="btn btn-primary" onClick={save} disabled={!chesscom && !otb}>
          Salvar
        </button>
        <button className="btn btn-ghost" onClick={() => setState((s) => ({ ...s, profile: { ...s.profile, onboarded: true } }))}>
          Pular
        </button>
      </div>
    </section>
  )
}
