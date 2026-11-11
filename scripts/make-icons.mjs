// Gera os ícones do app (PNG) a partir do desenho do Tempo. Precisa do Playwright com Chromium.
// Uso: npm run icons (ou PLAYWRIGHT_DIR=/caminho/node_modules/ npm run icons)
import { createRequire } from 'node:module'
let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  ;({ chromium } = createRequire(process.env.PLAYWRIGHT_DIR ?? '/opt/node-tools/node_modules/')('playwright'))
}
const body = 'M35 111 C30 95 29 70 36 50 C39 40 43 32 47 26 L51 8 L61 23 C73 24 85 32 95 44 L104 55 C109 61 109 68 104 72 C99 75 92 75 84 74 C78 74 74 77 72 82 C70 90 74 101 85 111 Z'
const knight = (fg, eye) => `
<path d="M8 45 H44 L41 52 H5 Z" fill="#ff8a1f"/><path d="M2 59 H40 L37 66 H-1 Z" fill="#ff8a1f"/><path d="M10 73 H40 L37 80 H7 Z" fill="#ff8a1f"/>
<path d="${body}" fill="${fg}"/><rect x="27" y="114" width="64" height="7" rx="3.5" fill="${fg}"/><rect x="19" y="124" width="80" height="11" rx="4" fill="${fg}"/>
<circle cx="100.5" cy="64" r="1.7" fill="${eye}"/><ellipse cx="74" cy="44.5" rx="4.6" ry="5.1" fill="${eye}"/>`
function svg(size, pad, radius) {
  // conteúdo 0..120 x 0..140, centralizado
  const s = (size * (1 - pad * 2)) / 140
  const tx = (size - 115 * s) / 2 + 2 * s
  const ty = (size - 140 * s) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${radius}" fill="#0f1217"/>
<g transform="translate(${tx} ${ty}) scale(${s})">${knight('#e9edf2', '#0f1217')}</g></svg>`
}
const b = await chromium.launch()
const p = await b.newPage()
for (const [name, size, pad, radius] of [['icon-192', 192, 0.14, 0], ['icon-512', 512, 0.14, 0], ['icon-maskable-512', 512, 0.22, 0]]) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<html><body style="margin:0">${svg(size, pad, radius)}</body></html>`)
  await p.screenshot({ path: new URL(`../public/icons/${name}.png`, import.meta.url).pathname, omitBackground: false })
}
await b.close()
console.log('ok')
