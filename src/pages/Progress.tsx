import { CALC_LEVELS, MATE_LEVELS } from '../lib/puzzles'
import { BLIND_PUZZLE_TYPES } from './BlindPuzzles'
import { VISION_DRILLS } from './BlindVision'
import { levelStats } from '../lib/progress'
import { bestStreak, streak, totalSeconds } from '../lib/routine'
import { useAppState, type GameRecord } from '../lib/state'
import { addDays, dayKey, formatMinutes, formatSolve } from '../lib/time'

function outcome(g: GameRecord): 'v' | 'e' | 'd' {
  if (g.result === '1/2-1/2') return 'e'
  return (g.result === '1-0') === (g.color === 'w') ? 'v' : 'd'
}

export function Progress() {
  const s = useAppState()
  const pressure = Object.entries(s.levels)
    .filter(([k]) => k.startsWith('pressao-'))
    .reduce((a, [, l]) => ({ tries: a.tries + l.tries, solved: a.solved + l.solved }), { tries: 0, solved: 0 })
  const target = s.settings.dailyMinutes
  const totalSec = Object.values(s.days).reduce((a, d) => a + totalSeconds(d), 0)
  // Partidas às cegas ficam à parte: não entram na consistência nem no placar das partidas normais.
  const normalGames = s.games.filter((g) => !g.blind)
  const blindGames = s.games.filter((g) => g.blind)
  const blindRes = blindGames.reduce((a, g) => ({ ...a, [outcome(g)]: a[outcome(g)] + 1 }), { v: 0, e: 0, d: 0 })
  const blindPeeks = blindGames.length ? blindGames.reduce((a, g) => a + (g.peeks ?? 0), 0) / blindGames.length : null
  const memory = levelStats(s, 'memoria')
  const memoryBest = Math.max(0, ...Object.entries(s.records.blind).filter(([k]) => k.startsWith('memoria-')).map(([, v]) => v))
  const analysed = normalGames.filter((g) => g.blunders !== undefined)
  const recent = analysed.slice(0, 10)
  const before = analysed.slice(10, 20)
  const avg = (list: GameRecord[]) => (list.length ? list.reduce((a, g) => a + (g.blunders ?? 0) + (g.mistakes ?? 0), 0) / list.length : null)
  const recentAvg = avg(recent)
  const beforeAvg = avg(before)
  const res = normalGames.reduce((a, g) => ({ ...a, [outcome(g)]: a[outcome(g)] + 1 }), { v: 0, e: 0, d: 0 })

  return (
    <div className="page">
      <h1>Progresso</h1>

      <section className="panel">
        <div className="stats">
          <div className="stat">
            <span className="v">{Math.round(s.puzzle.r)}</span>
            <span className="k">rating de problemas ({s.puzzle.n} resolvidos ou errados)</span>
          </div>
          <div className="stat">
            <span className="v">{streak(s.days, target)}</span>
            <span className="k">dias seguidos (recorde {bestStreak(s.days, target)})</span>
          </div>
          <div className="stat">
            <span className="v">{formatMinutes(totalSec / 60)}</span>
            <span className="k">de treino no total</span>
          </div>
          <div className="stat">
            <span className="v">{recentAvg === null ? '–' : recentAvg.toFixed(1).replace('.', ',')}</span>
            <span className="k">erros por partida (últimas {recent.length || 10})</span>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel stack">
          <span className="eyebrow">Rating de problemas</span>
          {s.ratingHistory.length >= 2 ? (
            <RatingChart points={s.ratingHistory} />
          ) : (
            <div className="empty">O gráfico aparece depois de 2 dias com problemas da escada de mate.</div>
          )}
        </section>
        <section className="panel stack">
          <span className="eyebrow">Minutos por dia (16 semanas)</span>
          <Heatmap days={s.days} target={target} />
          <p className="muted" style={{ fontSize: 13 }}>
            Quanto mais escuro, mais perto da meta de {formatMinutes(target)}.
          </p>
        </section>
      </div>

      <section className="panel stack">
        <span className="eyebrow">Escada de mate</span>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Degrau</th>
                <th>Tentativas</th>
                <th>Acertos</th>
                <th>Tempo médio</th>
                <th>Melhor</th>
              </tr>
            </thead>
            <tbody>
              {MATE_LEVELS.map((l) => {
                const st = levelStats(s, l.id)
                return (
                  <tr key={l.id}>
                    <td>{l.label}</td>
                    <td>{st.tries}</td>
                    <td>{st.tries ? `${Math.round((st.solved / st.tries) * 100)}%` : '–'}</td>
                    <td>{st.tries ? formatSolve(st.totalMs / st.tries) : '–'}</td>
                    <td>{st.bestMs ? formatSolve(st.bestMs) : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel stack">
          <span className="eyebrow">Cálculo às cegas</span>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Táticas</th>
                  <th>Mates</th>
                </tr>
              </thead>
              <tbody>
                {CALC_LEVELS.map((l) => {
                  const a = levelStats(s, 'cego-' + l.id)
                  const b = levelStats(s, 'cego-mate' + l.n)
                  const fmt = (x: typeof a) => (x.tries ? `${x.solved}/${x.tries}` : '–')
                  return (
                    <tr key={l.id}>
                      <td>{l.label}</td>
                      <td>{fmt(a)}</td>
                      <td>{fmt(b)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="stats">
            <div className="stat">
              <span className="v">{s.records.seqBest}</span>
              <span className="k">recorde da sequência</span>
            </div>
            <div className="stat">
              <span className="v">{s.records.stormBest}</span>
              <span className="k">recorde do relâmpago</span>
            </div>
            <div className="stat">
              <span className="v">{pressure.tries ? `${pressure.solved}/${pressure.tries}` : '–'}</span>
              <span className="k">acertos na pressão de tempo</span>
            </div>
          </div>
        </section>

        <section className="panel stack">
          <span className="eyebrow">Partidas contra o Tempo</span>
          <div className="stats">
            <div className="stat">
              <span className="v">{normalGames.length}</span>
              <span className="k">partidas</span>
            </div>
            <div className="stat">
              <span className="v">
                {res.v}/{res.e}/{res.d}
              </span>
              <span className="k">vitórias, empates, derrotas</span>
            </div>
            <div className="stat">
              <span className="v">{s.bot.ladder}</span>
              <span className="k">seu desempenho contra o bot</span>
            </div>
          </div>
          {recentAvg !== null && beforeAvg !== null && (
            <p style={{ fontSize: 14 }}>
              Consistência: {recentAvg.toFixed(1).replace('.', ',')} erros por partida nas últimas {recent.length}, contra {beforeAvg.toFixed(1).replace('.', ',')} nas {before.length} anteriores.{' '}
              {recentAvg < beforeAvg ? 'Está errando menos.' : recentAvg > beforeAvg ? 'Está errando mais: mais revisão e partidas mais lentas ajudam.' : 'Igual.'}
            </p>
          )}
          {normalGames.length === 0 && <div className="empty">Nenhuma partida ainda.</div>}
        </section>
      </div>

      <section className="panel stack">
        <span className="eyebrow">Às cegas</span>
        <div className="stats">
          {VISION_DRILLS.map((d) => (
            <div className="stat" key={d.id}>
              <span className="v">{s.records.blind['visao-' + d.id] ?? 0}</span>
              <span className="k">recorde em 1 min · {d.label.toLowerCase()}</span>
            </div>
          ))}
          <div className="stat">
            <span className="v">{memory.tries ? `${Math.round((memory.solved / memory.tries) * 100)}%` : '–'}</span>
            <span className="k">acerto na memória da posição{memoryBest ? ` (melhor rodada ${memoryBest}/20)` : ''}</span>
          </div>
          <div className="stat">
            <span className="v">{blindGames.length ? `${blindRes.v}/${blindRes.e}/${blindRes.d}` : '–'}</span>
            <span className="k">partidas às cegas (vitórias, empates, derrotas){blindPeeks !== null ? ` · ${blindPeeks.toFixed(1).replace('.', ',')} espiadas por partida` : ''}</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Problemas às cegas</th>
                <th>Resolvidos</th>
                <th>Acerto</th>
              </tr>
            </thead>
            <tbody>
              {BLIND_PUZZLE_TYPES.map((t) => {
                const st = levelStats(s, 'cegas-' + t.bucket)
                return (
                  <tr key={t.id}>
                    <td>{t.label}</td>
                    <td>{st.tries ? `${st.solved}/${st.tries}` : '–'}</td>
                    <td>{st.tries ? `${Math.round((st.solved / st.tries) * 100)}%` : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function RatingChart({ points }: { points: [string, number][] }) {
  const w = 560
  const h = 180
  const pad = { l: 40, r: 10, t: 10, b: 22 }
  const vals = points.map((p) => p[1])
  const lo = Math.floor((Math.min(...vals) - 20) / 50) * 50
  const hi = Math.ceil((Math.max(...vals) + 20) / 50) * 50
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (w - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (h - pad.t - pad.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')
  const ticks = [lo, Math.round((lo + hi) / 2), hi]
  const fmt = (k: string) => k.split('-').reverse().slice(0, 2).join('/')
  const lastPt = points[points.length - 1]
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Rating de problemas de ${points[0][1]} a ${lastPt[1]}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      <path d={`${path} L${x(points.length - 1)},${h - pad.b} L${x(0)},${h - pad.b} Z`} fill="var(--accent)" opacity="0.12" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(points.length - 1)} cy={y(lastPt[1])} r="4" fill="var(--accent)" />
      <text x={pad.l} y={h - 6}>
        {fmt(points[0][0])}
      </text>
      <text x={w - pad.r} y={h - 6} textAnchor="end">
        {fmt(lastPt[0])}
      </text>
    </svg>
  )
}

function Heatmap({ days, target }: { days: Record<string, Record<string, number>>; target: number }) {
  const today = dayKey()
  const [y, m, d] = today.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  const start = addDays(today, -(15 * 7 + dow))
  const cells = Array.from({ length: 16 * 7 }, (_, i) => addDays(start, i)).filter((k) => k <= today)
  return (
    <div className="heat" aria-label="Minutos de treino por dia">
      {cells.map((k) => {
        const min = totalSeconds(days[k]) / 60
        const ratio = min / target
        const lv = min <= 0 ? '' : ratio >= 1 ? 'l4' : ratio >= 0.66 ? 'l3' : ratio >= 0.33 ? 'l2' : 'l1'
        return <span key={k} className={lv} title={`${k.split('-').reverse().join('/')}: ${Math.round(min)} min`} />
      })}
    </div>
  )
}
