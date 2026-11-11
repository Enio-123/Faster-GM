import { MATE_LEVELS } from '../lib/puzzles'
import { dueCards, isUnlocked } from '../lib/progress'
import { useAppState } from '../lib/state'

const ORDER = MATE_LEVELS.map((l) => l.id)

export function Train() {
  const s = useAppState()
  const top = [...MATE_LEVELS].reverse().find((l) => isUnlocked(s, ORDER, l.id)) ?? MATE_LEVELS[0]
  const due = dueCards(s).length
  // Tudo o que é treino às cegas: visão, memória, cálculo (cego-) e problemas (cegas-).
  const blindTries = Object.entries(s.levels)
    .filter(([k]) => /^(visao-|memoria$|cego-|cegas-)/.test(k))
    .reduce((a, [, l]) => a + l.tries, 0)
  const pressureBest = Math.max(0, ...Object.values(s.records.pressure))
  const blindGames = s.games.filter((g) => g.blind).length

  return (
    <div className="page">
      <div className="stack" style={{ gap: 6 }}>
        <h1>Treinos</h1>
        <p className="muted">Problemas reais de partidas, do mate em 3 até linhas de 14 lances.</p>
      </div>
      <div className="modes">
        <a className="mode" href="#mate">
          <div className="head">
            <h3>Escada de mate</h3>
            <span className="pill pill-accent">{top.label}</span>
          </div>
          <p>Mate em 3, 4, 5, 6, 7 e 8 ou mais. Cada degrau abre com 8 acertos nas últimas 10 tentativas do anterior. Vale para o rating de problemas.</p>
          <div className="foot">
            <span className="pill num">Rating {Math.round(s.puzzle.r)}</span>
          </div>
        </a>
        <a className="mode" href="#pressao">
          <div className="head">
            <h3>Pressão de tempo</h3>
            <span className="pill pill-accent">5 a 30 min</span>
          </div>
          <p>Mates ou linhas táticas contra o relógio, sem ajuda na hora. No fim, cada erro vem explicado: o seu lance, o lance certo e o porquê.</p>
          <div className="foot">
            <span className="pill num">recorde {pressureBest}</span>
          </div>
        </a>
        <a className="mode" href="#cegas">
          <div className="head">
            <h3>Às cegas</h3>
            <span className="pill pill-accent">5 etapas</span>
          </div>
          <p>Do mais simples ao mais difícil: visão do tabuleiro, memória da posição, cálculo às cegas, problemas sem ver as peças e partidas às cegas contra o Tempo, com os lances falados.</p>
          <div className="foot">
            <span className="pill num">{blindTries} {blindTries === 1 ? 'exercício' : 'exercícios'}</span>
            {blindGames > 0 && <span className="pill num">{blindGames} {blindGames === 1 ? 'partida às cegas' : 'partidas às cegas'}</span>}
          </div>
        </a>
        <a className="mode" href="#sequencia">
          <div className="head">
            <h3>Sequência</h3>
            <span className="pill">sem errar</span>
          </div>
          <p>Mates consecutivos que ficam mais longos a cada 3 acertos. Um erro encerra, e o erro vem explicado.</p>
          <div className="foot">
            <span className="pill num">recorde {s.records.seqBest}</span>
          </div>
        </a>
        <a className="mode" href="#relampago">
          <div className="head">
            <h3>Relâmpago</h3>
            <span className="pill">3 minutos</span>
          </div>
          <p>O máximo de problemas curtos em 3 minutos. Errou, perde 10 segundos. No fim, os erros vêm explicados.</p>
          <div className="foot">
            <span className="pill num">recorde {s.records.stormBest}</span>
          </div>
        </a>
        <a className="mode" href="#erros">
          <div className="head">
            <h3>Revisão dos erros</h3>
            <span className={`pill ${due ? 'pill-bad' : ''}`}>{due} hoje</span>
          </div>
          <p>Seus erros das partidas contra o Tempo e os problemas que você errou na escada, na pressão de tempo e às cegas voltam em intervalos crescentes até virar reflexo.</p>
          <div className="foot">
            <span className="pill num">{s.review.length} cartões</span>
          </div>
        </a>
        <a className="mode" href="#jogar">
          <div className="head">
            <h3>Jogar contra o Tempo</h3>
            <span className="pill">bullet e blitz</span>
          </div>
          <p>Partidas de 1 a 5 minutos no nível recomendado pelos seus resultados. A análise no fim manda os erros para a revisão.</p>
          <div className="foot">
            <span className="pill num">{s.bot.games} partidas</span>
          </div>
        </a>
      </div>
    </div>
  )
}
