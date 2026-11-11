// Trilha às cegas: do mais simples (a cor de uma casa sem olhar) até uma partida inteira
// sem ver as peças. Cada etapa tem a sua tela; aqui ficam a ordem e os recordes.
import { Coach } from '../coach/Coach'
import { line } from '../lib/coach'
import { levelStats } from '../lib/progress'
import { useAppState } from '../lib/state'
import { go } from '../ui/hooks'
import { IconArrowLeft, IconArrowRight } from '../ui/icons'
import { BLIND_PUZZLE_TYPES } from './BlindPuzzles'
import { VISION_DRILLS } from './BlindVision'

const CALC_KEYS = ['calc3', 'calc4', 'calc5', 'calc6', 'mate3', 'mate4', 'mate5', 'mate6']

export function Blind() {
  const s = useAppState()
  const rec = s.records.blind
  const visionBest = VISION_DRILLS.map((d) => ({ ...d, best: rec['visao-' + d.id] ?? 0 })).filter((d) => d.best > 0)
  const memoryBest = Math.max(0, ...Object.entries(rec).filter(([k]) => k.startsWith('memoria-')).map(([, v]) => v))
  const calcTries = CALC_KEYS.reduce((a, b) => a + levelStats(s, 'cego-' + b).tries, 0)
  const puzzles = BLIND_PUZZLE_TYPES.reduce(
    (acc, t) => {
      const st = levelStats(s, 'cegas-' + t.bucket)
      return { tries: acc.tries + st.tries, solved: acc.solved + st.solved }
    },
    { tries: 0, solved: 0 },
  )
  const games = s.games.filter((g) => g.blind)
  const wins = games.filter((g) => g.result !== '1/2-1/2' && (g.result === '1-0') === (g.color === 'w')).length

  const steps = [
    {
      href: '#cegas-visao',
      title: 'Visão do tabuleiro',
      tag: '1 minuto',
      text: 'Sem peças e sem coordenadas: ache a casa, diga a cor, veja se duas casas estão na mesma diagonal e conte os saltos do cavalo.',
      foot: visionBest.length ? visionBest.map((d) => `${d.short} ${d.best}`) : ['comece por aqui'],
    },
    {
      href: '#cegas-memoria',
      title: 'Memória da posição',
      tag: 'olhar e lembrar',
      text: 'Uma posição real aparece por alguns segundos e some. O app pergunta onde estão as peças. Depois, com lances anunciados por cima da posição escondida.',
      foot: memoryBest ? [`melhor rodada ${memoryBest}/20`] : [],
    },
    {
      href: '#calculo',
      title: 'Cálculo às cegas',
      tag: '3 a 6+ lances',
      text: 'As peças ficam paradas. Você monta a linha inteira na cabeça, com as respostas do adversário, e só no fim confere.',
      foot: calcTries ? [`${calcTries} linhas`] : [],
    },
    {
      href: '#cegas-problemas',
      title: 'Problemas às cegas',
      tag: 'mate em 1 até linhas de 3',
      text: 'Você olha o problema, as peças somem e você resolve clicando no tabuleiro vazio ou digitando o lance. As respostas do adversário são faladas. Os erros vêm explicados no fim.',
      foot: puzzles.tries ? [`${puzzles.solved}/${puzzles.tries} resolvidos`] : [],
    },
    {
      href: '#cegas-partida',
      title: 'Partida às cegas',
      tag: 'contra o Tempo',
      text: 'Peças invisíveis do começo ao fim. O Tempo fala os lances dele; você joga no tabuleiro vazio ou digitando. Dá para espiar, e o app conta as espiadas.',
      foot: games.length ? [`${games.length} ${games.length === 1 ? 'partida' : 'partidas'}`, `${wins} ${wins === 1 ? 'vitória' : 'vitórias'}`] : [],
    },
  ]

  return (
    <div className="page">
      <div className="row">
        <button className="icon-btn" onClick={() => go('treinos')} aria-label="Voltar para treinos">
          <IconArrowLeft />
        </button>
        <h1>Às cegas</h1>
      </div>
      <div className="coach-line" style={{ gridTemplateColumns: '84px minmax(0,1fr)', maxWidth: 760 }}>
        <Coach mood="idle" />
        <div className="stack" style={{ gap: 6 }}>
          <p>
            Jogar às cegas é guardar o tabuleiro inteiro na cabeça. A trilha vai do mais simples, saber a cor de uma casa sem olhar, até uma partida inteira contra o Tempo sem ver as peças. É o mesmo
            músculo do cálculo: enxergar lances que ainda não estão no tabuleiro.
          </p>
          <p className="muted" style={{ fontSize: 14 }}>
            {line('blindHub')}
          </p>
        </div>
      </div>
      <ol className="trail">
        {steps.map((st, i) => (
          <li key={st.href}>
            <a className="mode trail-step" href={st.href}>
              <span className="trail-n" aria-hidden="true">
                {i + 1}
              </span>
              <div className="stack" style={{ gap: 8, minWidth: 0 }}>
                <div className="head">
                  <h3>{st.title}</h3>
                  <span className="pill">{st.tag}</span>
                </div>
                <p>{st.text}</p>
                {st.foot.length > 0 && (
                  <div className="foot">
                    {st.foot.map((f) => (
                      <span key={f} className="pill num">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <IconArrowRight />
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
