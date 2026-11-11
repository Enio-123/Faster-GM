import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

// Identificador deste build: vai para a página (__BUILD__) e para o service worker.
// A página só ativa o service worker que veio do mesmo build que ela.
const BUILD = Date.now().toString(36)

// Service worker gerado no build: guarda os arquivos do app para funcionar offline (GitHub Pages).
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'faster-gm-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const files: string[] = []
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f)
          if (statSync(p).isDirectory()) walk(p)
          else files.push(relative(outDir, p).split('\\').join('/'))
        }
      }
      walk(outDir)
      const assets = files.filter((f) => f !== 'sw.js' && f !== 'app.html' && !f.endsWith('.map') && !f.endsWith('.txt'))
      const version = createHash('sha1').update(assets.join('|') + BUILD).digest('hex').slice(0, 10)
      const sw = `// Gerado no build. Arquivos do app em cache; o resto vai pela rede.
const CACHE = 'faster-gm-${version}'
const BUILD = '${BUILD}'
const ASSETS = ${JSON.stringify(['./', ...assets])}
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))) })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('faster-gm-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
// A página do mesmo build pede para este service worker assumir na hora.
self.addEventListener('message', (e) => {
  const d = e.data
  if (d === 'skip-waiting' || (d && d.type === 'skip-waiting' && d.build === BUILD)) self.skipWaiting()
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('./'))); return }
  // Manifesto e ícones: rede primeiro, para o navegador sempre ver o nome e o ícone atuais.
  if (url.pathname.endsWith('/manifest.webmanifest') || url.pathname.includes('/icons/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req)),
    )
    return
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
})
`
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), serviceWorker()],
  // Fontes vão embutidas no CSS: funcionam igual no GitHub Pages e dentro do Claude.
  build: { chunkSizeWarningLimit: 1500, assetsInlineLimit: (file: string) => file.endsWith('.woff2') },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never)
