// Leitor mínimo do `sede.yaml`: só a lista `projetos:` e só os campos que a sala usa.
// Aceita item em bloco (`- nome: x` com as chaves alinhadas embaixo) e item em linha (`- {nome: x}`).
// Valores: simples (com `# comentário`), entre aspas simples (`''` vira `'`), entre aspas duplas (`\\` e `\"`)
// e lista em linha (`['a', b]`). Bloco dobrado (`>-`, `|`), mapa aninhado e âncora são ignorados.
// Texto fora do formato: o leitor devolve `null` (a sala mostra "sem dados"), nunca lança.
import { absoluto } from './caminhos'

export type ProjetoManifesto = {
  nome: string
  sigla?: string
  /** `status:` do manifesto (por exemplo `ativo`, `candidato`). */
  status?: string
  pastaAtual?: string
  pastaFutura?: string
  pastasAntigas: string[]
}

export type Manifesto = { projetos: ProjetoManifesto[]; /** `sede: nome:` do manifesto. */ nomeDaSede: string | null }

const CAMPOS = new Set(['nome', 'sigla', 'status', 'pasta_atual', 'pasta_futura', 'pastas_antigas'])

type Valor = { ok: true; valor: string | null | string[] | undefined } | { ok: false }

// Separa por vírgula no nível de cima, respeitando aspas e colchetes. `null` se as aspas não fecham.
function partesDeFluxo(texto: string): string[] | null {
  const partes: string[] = []
  let atual = ''
  let aspas: string | null = null
  let fundo = 0
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i]
    if (aspas) {
      atual += c
      if (c === aspas) {
        if (aspas === "'" && texto[i + 1] === "'") {
          atual += "'"
          i += 1
        } else aspas = null
      } else if (aspas === '"' && c === '\\') {
        atual += texto[i + 1] ?? ''
        i += 1
      }
      continue
    }
    if (c === "'" || c === '"') aspas = c
    else if (c === '[' || c === '{') fundo += 1
    else if (c === ']' || c === '}') fundo -= 1
    if (c === ',' && fundo === 0) {
      partes.push(atual.trim())
      atual = ''
      continue
    }
    atual += c
  }
  if (aspas || fundo !== 0) return null
  if (atual.trim()) partes.push(atual.trim())
  return partes
}

function citado(s: string, aspas: "'" | '"'): Valor {
  let valor = ''
  for (let i = 1; i < s.length; i += 1) {
    if (aspas === '"' && s[i] === '\\') {
      const prox = s[i + 1]
      if (prox !== '\\' && prox !== '"') return { ok: false }
      valor += prox
      i += 1
      continue
    }
    if (s[i] === aspas) {
      if (aspas === "'" && s[i + 1] === "'") {
        valor += "'"
        i += 1
        continue
      }
      const resto = s.slice(i + 1).trim()
      return resto === '' || resto.startsWith('#') ? { ok: true, valor } : { ok: false }
    }
    valor += s[i]
  }
  return { ok: false }
}

function valorDe(bruto: string): Valor {
  const s = bruto.trim()
  if (s === '' || s.startsWith('#')) return { ok: true, valor: null }
  if (s.startsWith("'")) return citado(s, "'")
  if (s.startsWith('"')) return citado(s, '"')
  if (s.startsWith('[')) {
    const fim = s.lastIndexOf(']')
    if (fim < 0) return { ok: false }
    const resto = s.slice(fim + 1).trim()
    if (resto !== '' && !resto.startsWith('#')) return { ok: false }
    const partes = partesDeFluxo(s.slice(1, fim))
    if (!partes) return { ok: false }
    const lista: string[] = []
    for (const p of partes) {
      const v = valorDe(p)
      if (!v.ok || Array.isArray(v.valor)) return { ok: false }
      if (typeof v.valor === 'string') lista.push(v.valor)
    }
    return { ok: true, valor: lista }
  }
  if (/^[{>|&*]/.test(s)) return { ok: true, valor: undefined }
  const semComentario = s.replace(/\s+#.*$/, '').trim()
  return { ok: true, valor: semComentario === 'null' || semComentario === '~' || semComentario === '' ? null : semComentario }
}

function chaveDe(texto: string): [string, Valor] | null {
  const m = texto.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*)|\s*)$/)
  return m ? [m[1] ?? '', valorDe(m[2] ?? '')] : null
}

type Bruto = Record<string, string | null | string[]>

function guardar(projeto: Bruto, chave: string, v: Valor): void {
  if (!CAMPOS.has(chave) || !v.ok || v.valor === undefined) return
  projeto[chave] = v.valor
}

function montar(b: Bruto): ProjetoManifesto | null {
  const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
  const atual = absoluto(b.pasta_atual) ? (b.pasta_atual as string) : undefined
  const futura = absoluto(b.pasta_futura) ? (b.pasta_futura as string) : undefined
  const antigas = Array.isArray(b.pastas_antigas) ? b.pastas_antigas.filter(absoluto) : []
  const nome = texto(b.nome) ?? ''
  if (!atual && !futura && antigas.length === 0 && nome === '') return null
  return { nome, sigla: texto(b.sigla), status: texto(b.status), pastaAtual: atual, pastaFutura: futura, pastasAntigas: antigas }
}

// `sede:` de topo → `nome:` do bloco (primeira ocorrência).
function nomeDaSede(linhas: string[]): string | null {
  const inicio = linhas.findIndex(l => /^sede:\s*(#.*)?$/.test(l))
  if (inicio < 0) return null
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = linhas[i] ?? ''
    if (/^\S/.test(linha)) break
    const m = linha.match(/^\s+nome:\s*(.*)$/)
    if (m) {
      const v = valorDe(m[1] ?? '')
      return v.ok && typeof v.valor === 'string' && v.valor.trim() ? v.valor.trim() : null
    }
  }
  return null
}

/** Texto do `sede.yaml` → projetos, ou `null` se não há a chave `projetos:` no topo ou um item em linha não fecha. */
export function interpretarManifesto(texto: unknown): Manifesto | null {
  if (typeof texto !== 'string') return null
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/)
  const inicio = linhas.findIndex(l => /^projetos:\s*(#.*)?$/.test(l) || /^projetos:\s*\[\s*\]\s*(#.*)?$/.test(l))
  if (inicio < 0) return null
  if (/\[\s*\]/.test(linhas[inicio] ?? '')) return { projetos: [], nomeDaSede: nomeDaSede(linhas) }
  const brutos: Bruto[] = []
  let atual: Bruto | null = null
  let coluna = -1
  let recuo = -1
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = linhas[i] ?? ''
    if (/^\s*(#.*)?$/.test(linha)) continue
    if (/^\S/.test(linha)) break
    const item = linha.match(/^(\s*)-\s+(.*)$/)
    if (item && (recuo < 0 || (item[1] ?? '').length === recuo)) {
      recuo = (item[1] ?? '').length
      const resto = item[2] ?? ''
      if (resto.startsWith('{')) {
        const fim = resto.lastIndexOf('}')
        const depois = fim < 0 ? '' : resto.slice(fim + 1).trim()
        if (fim < 0 || (depois !== '' && !depois.startsWith('#'))) return null
        const partes = partesDeFluxo(resto.slice(1, fim))
        if (!partes) return null
        const bruto: Bruto = {}
        for (const p of partes) {
          const kv = chaveDe(p)
          if (!kv) return null
          guardar(bruto, kv[0], kv[1])
        }
        brutos.push(bruto)
        atual = null
        continue
      }
      atual = {}
      brutos.push(atual)
      coluna = linha.length - resto.length
      const kv = chaveDe(resto)
      if (kv) guardar(atual, kv[0], kv[1])
      continue
    }
    if (!atual) continue
    const indent = linha.length - linha.trimStart().length
    if (indent !== coluna) continue
    const kv = chaveDe(linha.slice(indent))
    if (kv) guardar(atual, kv[0], kv[1])
  }
  const projetos: ProjetoManifesto[] = []
  for (const b of brutos) {
    const p = montar(b)
    if (p) projetos.push(p)
  }
  return { projetos, nomeDaSede: nomeDaSede(linhas) }
}
