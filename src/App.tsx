import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Coach } from './coach/Coach'
import { Intro } from './coach/Intro'
import { useSettings, useSyncStatus } from './lib/state'
import { BlindCalc } from './pages/BlindCalc'
import { MateLadder } from './pages/MateLadder'
import { Play } from './pages/Play'
import { Progress } from './pages/Progress'
import { Review } from './pages/Review'
import { Settings } from './pages/Settings'
import { Storm } from './pages/Storm'
import { Streak } from './pages/Streak'
import { Today } from './pages/Today'
import { Train } from './pages/Train'
import { useRoute } from './ui/hooks'
import { IconPlay, IconProgress, IconSettings, IconToday, IconTrain } from './ui/icons'

const TRAIN_ROUTES = new Set(['treinos', 'mate', 'sequencia', 'relampago', 'calculo', 'erros'])

const NAV: { id: string; label: string; icon: () => ReactNode; match: (r: string) => boolean }[] = [
  { id: 'hoje', label: 'Hoje', icon: IconToday, match: (r) => r === 'hoje' },
  { id: 'treinos', label: 'Treinos', icon: IconTrain, match: (r) => TRAIN_ROUTES.has(r) },
  { id: 'jogar', label: 'Jogar', icon: IconPlay, match: (r) => r === 'jogar' },
  { id: 'progresso', label: 'Progresso', icon: IconProgress, match: (r) => r === 'progresso' },
]

function page(route: string) {
  switch (route) {
    case 'treinos':
      return <Train />
    case 'mate':
      return <MateLadder />
    case 'sequencia':
      return <Streak />
    case 'relampago':
      return <Storm />
    case 'calculo':
      return <BlindCalc />
    case 'erros':
      return <Review />
    case 'jogar':
      return <Play />
    case 'progresso':
      return <Progress />
    case 'ajustes':
      return <Settings />
    default:
      return <Today />
  }
}

const INTRO_KEY = 'faster-gm:intro-shown'
const originalTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null

function Wordmark() {
  return (
    <a className="wordmark" href="#hoje" style={{ color: 'inherit', textDecoration: 'none' }} aria-label="Faster GM, início">
      <span style={{ width: 26, display: 'inline-block' }}>
        <Coach mood="idle" title="Faster GM" />
      </span>
      <span>
        Faster <b>GM</b>
      </span>
    </a>
  )
}

export function App() {
  const route = useRoute()
  const settings = useSettings()
  const sync = useSyncStatus()
  const mainRef = useRef<HTMLElement>(null)
  const [intro, setIntro] = useState(() => {
    if (!settings.intro) return false
    try {
      return sessionStorage.getItem(INTRO_KEY) !== '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') {
      if (originalTheme) root.setAttribute('data-theme', originalTheme)
      else root.removeAttribute('data-theme')
    } else root.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  useLayoutEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [route])

  const endIntro = () => {
    setIntro(false)
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* sem armazenamento */
    }
  }

  return (
    <>
      {intro && <Intro onDone={endIntro} />}
      <div className="shell">
        <aside className="rail">
          <Wordmark />
          <nav className="nav" aria-label="Principal">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} aria-current={n.match(route) ? 'page' : undefined}>
                <n.icon />
                {n.label}
              </a>
            ))}
            <a href="#ajustes" aria-current={route === 'ajustes' ? 'page' : undefined}>
              <IconSettings />
              Ajustes
            </a>
          </nav>
          <div className="rail-foot">
            <span>{sync === 'synced' || sync === 'saving' ? 'Progresso salvo na sua conta' : 'Progresso salvo neste aparelho'}</span>
          </div>
        </aside>
        <header className="topbar">
          <Wordmark />
          <a className="icon-btn" href="#ajustes" aria-label="Ajustes" aria-current={route === 'ajustes' ? 'page' : undefined}>
            <IconSettings />
          </a>
        </header>
        <main className="main" ref={mainRef}>
          {page(route)}
        </main>
        <nav className="tabbar" aria-label="Principal">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} aria-current={n.match(route) ? 'page' : undefined}>
              <n.icon />
              {n.label}
            </a>
          ))}
        </nav>
      </div>
    </>
  )
}
