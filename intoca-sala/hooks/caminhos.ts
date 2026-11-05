// Caminhos sem Node: o mod roda num ambiente sem `path`. Tudo aqui é texto puro.
// Comparação léxica (sem resolver link nem junção): quem precisar do caminho real pede ao motor.

const UNIDADE = /^[A-Za-z]:(?=[\\/]|$)/

/** Caminho do estilo do Windows (letra de unidade ou rede)? Nele a caixa não distingue pastas. */
export const ehEstiloWindows = (p: string): boolean => UNIDADE.test(p) || p.startsWith('\\\\')

/** Caminho absoluto de pasta local: `D:\x`, `D:/x` ou `/x`. Rede (`\\srv\x`, `//srv/x`) não vale. */
export function absoluto(p: unknown): p is string {
  if (typeof p !== 'string' || p.includes('\u0000')) return false
  if (/^[A-Za-z]:[\\/]/.test(p)) return true
  return p.startsWith('/') && !p.startsWith('//')
}

/** Forma comparável: barras `/`, sem `.`/`..`, sem barra final, minúscula no estilo Windows. */
export function canon(p: string): string {
  const win = ehEstiloWindows(p)
  const unidade = UNIDADE.test(p) ? p.slice(0, 2) : ''
  const resto = unidade ? p.slice(2) : p
  const partes: string[] = []
  for (const parte of resto.split(/[\\/]+/)) {
    if (parte === '' || parte === '.') continue
    if (parte === '..') partes.pop()
    else partes.push(parte)
  }
  const texto = `${unidade}/${partes.join('/')}`.replace(/\/$/, '')
  return win ? texto.toLowerCase() : texto
}

/** `filho` está dentro de `pai` (com `igual`, também quando é o próprio `pai`). */
export function dentroDe(pai: string, filho: string, igual = false): boolean {
  const a = canon(pai)
  const b = canon(filho)
  if (a === b) return igual
  return b.startsWith(`${a}/`)
}

/** Une pedaços ao caminho `base`, com a barra que `base` já usa. */
export function juntar(base: string, ...partes: string[]): string {
  const barra = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  const corpo = [base.replace(/[\\/]+$/, ''), ...partes.map(p => p.replace(/^[\\/]+|[\\/]+$/g, ''))]
  return corpo.filter((p, i) => i === 0 || p !== '').join(barra)
}

/** Pasta que contém `p`, ou `p` mesmo na raiz. */
export function pai(p: string): string {
  const limpo = p.replace(/[\\/]+$/, '')
  const corte = Math.max(limpo.lastIndexOf('/'), limpo.lastIndexOf('\\'))
  if (corte < 0) return p
  if (corte === 0) return limpo.slice(0, 1)
  const topo = limpo.slice(0, corte)
  return /^[A-Za-z]:$/.test(topo) ? `${topo}${limpo[corte]}` : topo
}

/** Último pedaço do caminho. */
export function nomeDe(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
}

/** Raiz do disco (`D:\`, `/`)? */
export function ehRaiz(p: string): boolean {
  return canon(p) === '' || /^[A-Za-z]:$/.test(canon(p))
}

/** Pedaços de `pasta` abaixo de `base` (`[]` se for a própria `base` ou se estiver fora). */
export function relativo(base: string, pasta: string): string[] {
  if (!dentroDe(base, pasta)) return []
  const a = canon(base).split('/').filter(Boolean).length
  return canon(pasta).split('/').filter(Boolean).slice(a)
}
