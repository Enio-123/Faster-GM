// Botão de instalar o app: um aviso na tela Hoje e um bloco em Ajustes.
import { useState } from 'react'
import { isSite, promptInstall, SITE_URL, standalone, useInstall } from '../lib/install'
import { IconCheck, IconInstall } from './icons'

const HIDE_KEY = 'faster-gm:install-hidden'
const HIDE_DAYS = 14

function hiddenNow(): boolean {
  try {
    if (location.search.includes('instalar')) return false
    const t = Number(localStorage.getItem(HIDE_KEY) || 0)
    return Date.now() - t < HIDE_DAYS * 86400000
  } catch {
    return false
  }
}

/** Aviso na tela Hoje, só quando o navegador libera a instalação. */
export function InstallCard() {
  const st = useInstall()
  const [hidden, setHidden] = useState(hiddenNow)
  if (st !== 'available' || hidden) return null
  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now()))
    } catch {
      /* sem armazenamento */
    }
  }
  return (
    <section className="panel install-card" aria-label="Instalar o app">
      <span className="install-icon" aria-hidden="true">
        <IconInstall />
      </span>
      <div className="stack" style={{ gap: 2 }}>
        <span style={{ fontWeight: 600 }}>Instale o Faster GM</span>
        <span className="muted" style={{ fontSize: 14 }}>
          Abre direto da tela inicial, em tela cheia, e funciona sem internet.
        </span>
      </div>
      <div className="row install-actions">
        <button className="btn btn-primary" onClick={() => void promptInstall()}>
          Instalar
        </button>
        <button className="btn btn-ghost" onClick={hide}>
          Agora não
        </button>
      </div>
    </section>
  )
}

/** Bloco em Ajustes: instalar, ou como instalar quando o botão não está disponível. */
export function InstallPanel() {
  const st = useInstall()
  const [result, setResult] = useState<string | null>(null)
  const site = isSite()
  return (
    <div className="panel stack">
      <span className="eyebrow">App no celular</span>
      {st === 'installed' ? (
        <p className="row" style={{ fontSize: 14, gap: 8 }}>
          <span style={{ display: 'inline-flex', width: 18, color: 'var(--good)' }}>
            <IconCheck />
          </span>
          {standalone() ? 'Você está usando o app instalado.' : 'App instalado. Abra pelo ícone na tela inicial.'}
        </p>
      ) : !site ? (
        <p className="muted" style={{ fontSize: 14 }}>
          Para instalar no celular, abra o site no navegador: <a href={SITE_URL}>{SITE_URL.replace('https://', '')}</a>
        </p>
      ) : st === 'available' ? (
        <>
          <p style={{ fontSize: 14 }}>Abre direto da tela inicial, em tela cheia, e funciona sem internet.</p>
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              const r = await promptInstall()
              setResult(r === 'accepted' ? 'Instalando. O ícone aparece na tela inicial em alguns segundos.' : r === 'dismissed' ? 'Instalação cancelada.' : null)
            }}
          >
            <IconInstall /> Instalar Faster GM
          </button>
        </>
      ) : (
        <div className="stack" style={{ gap: 8, fontSize: 14 }}>
          <p>
            <b>Android:</b> abra este site no Chrome. O botão Instalar aparece aqui e na tela Hoje quando o Chrome liberar, às vezes depois de alguns segundos mexendo no app.
          </p>
          <p>
            <b>iPhone:</b> abra no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.
          </p>
        </div>
      )}
      {site && st !== 'installed' && (
        <p className="muted" style={{ fontSize: 13 }}>
          Se o menu do Chrome disser que o app já está instalado sem estar, é um erro do Chrome no Android quando outro app do mesmo endereço já está instalado. O botão daqui não passa por esse erro.
        </p>
      )}
      {result && <div className="notice">{result}</div>}
    </div>
  )
}
