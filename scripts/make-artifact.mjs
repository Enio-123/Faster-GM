// Gera dist/app.html, a página publicada como Artifact dentro do Claude.
// A moldura do Claude já traz doctype, charset, viewport e o recuo das bordas do aparelho,
// então o arquivo leva só o título, os estilos e o script do app.
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('dist/index.html', 'utf8')
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
const keep = head
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/charset|name="viewport"|rel="manifest"|rel="icon"|apple-touch-icon|theme-color/.test(l))
const title = keep.filter((l) => l.startsWith('<title'))
const rest = keep.filter((l) => !l.startsWith('<title'))
const out = [
  ...title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  // Dentro do Claude a moldura já recua o topo e a base; o app não soma de novo.
  '<style>html:root{--edge-top:0px;--edge-bottom:0px}</style>',
  ...rest,
  body.trim(),
  '',
].join('\n')
writeFileSync('dist/app.html', out)
console.log(out)
