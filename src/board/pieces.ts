// Peças "cburnett" (Colin M.L. Burnett, GPLv2+), as mesmas do Lichess. Ver LICENSES.md.
const raw = import.meta.glob('../assets/pieces/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const cache = new Map<string, string>()

/** URL (data:) da peça. `code` no formato "wn", "bq". */
export function pieceUrl(code: string): string {
  const hit = cache.get(code)
  if (hit) return hit
  const entry = Object.entries(raw).find(([p]) => p.endsWith(`/${code}.svg`))
  let svg = entry ? entry[1] : ''
  if (!svg.includes('viewBox')) svg = svg.replace('<svg ', '<svg viewBox="0 0 45 45" ')
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  cache.set(code, url)
  return url
}
