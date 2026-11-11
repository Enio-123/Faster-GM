import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { App } from './App'
import { initInstall } from './lib/install'
import { connectAccountStorage } from './lib/state'

document.documentElement.lang = 'pt-BR'
initInstall()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void connectAccountStorage()

// Funciona offline quando publicado como site (GitHub Pages).
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // A página sempre vem da rede, então já é a versão nova. O service worker do mesmo build
        // assume na hora, sem esperar o app ser fechado: assim o manifesto, os ícones e o modo
        // offline ficam iguais à página. Um service worker de outro build não aceita o pedido.
        const take = (w: ServiceWorker | null) => w?.postMessage({ type: 'skip-waiting', build: __BUILD__ })
        take(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const w = reg.installing
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed') take(w)
          })
        })
      })
      .catch(() => {})
  })
}
