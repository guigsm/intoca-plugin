// Tabelas Markdown e títulos: o que as filas e a lista de pendências usam. Texto puro, sem lançar.

export type Tabela = {
  /** Título (de `#` a `######`) mais próximo acima da tabela, sem marcação. */
  secao: string
  cabecalho: string[]
  linhas: string[][]
}

/** Remove marcação de leitura: negrito, itálico, crase, link `[texto](url)`; junta espaços. */
export function limpar(celula: string): string {
  return celula
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/`/g, '')
    .replace(/\\\|/g, '|')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Minúscula, sem acento, sem aspas tipográficas: para comparar texto sem cuidado com a grafia. */
export function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[“”‘’"']/g, '')
    .toLowerCase()
}

/** Corta em `max` caracteres, com reticências. */
export function cortar(texto: string, max: number): string {
  const t = texto.trim()
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

// Divide uma linha de tabela em células: `|` solto separa; `\|` e o que está entre crases não.
function celulas(linha: string): string[] {
  const t = linha.trim().replace(/^\|/, '')
  const fim = t.endsWith('|') && !t.endsWith('\\|') ? t.slice(0, -1) : t
  const saida: string[] = []
  let atual = ''
  let crase = false
  for (let i = 0; i < fim.length; i += 1) {
    const c = fim[i]
    if (c === '`') crase = !crase
    if (c === '|' && !crase && fim[i - 1] !== '\\') {
      saida.push(atual)
      atual = ''
      continue
    }
    atual += c
  }
  saida.push(atual)
  return saida.map(limpar)
}

const SEPARADOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/**
 * Todas as tabelas do texto. Linha com mais células que o cabeçalho junta o excesso na última coluna;
 * com menos, completa com vazio. Para em `maxLinhas` linhas lidas no total.
 */
export function lerTabelas(texto: string, maxLinhas = 4000): Tabela[] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).slice(0, maxLinhas)
  const tabelas: Tabela[] = []
  let secao = ''
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i] ?? ''
    const titulo = linha.match(/^#{1,6}\s+(.*)$/)
    if (titulo) {
      secao = limpar(titulo[1] ?? '')
      continue
    }
    if (!linha.trimStart().startsWith('|') || i + 1 >= linhas.length || !SEPARADOR.test((linhas[i + 1] ?? '').trim())) continue
    const cabecalho = celulas(linha)
    const corpo: string[][] = []
    let j = i + 2
    for (; j < linhas.length && (linhas[j] ?? '').trimStart().startsWith('|'); j += 1) {
      const c = celulas(linhas[j] ?? '')
      if (c.length > cabecalho.length) {
        const sobra = c.splice(cabecalho.length - 1)
        c.push(sobra.join(' | '))
      }
      while (c.length < cabecalho.length) c.push('')
      corpo.push(c)
    }
    tabelas.push({ secao, cabecalho, linhas: corpo })
    i = j - 1
  }
  return tabelas
}

/** Títulos e as linhas de texto de cada seção (fora de tabela), para quem lê listas e avisos em prosa. */
export function lerSecoes(texto: string, maxLinhas = 4000): { titulo: string; linhas: string[] }[] {
  const secoes: { titulo: string; linhas: string[] }[] = [{ titulo: '', linhas: [] }]
  for (const linha of texto.replace(/^﻿/, '').split(/\r?\n/).slice(0, maxLinhas)) {
    const titulo = linha.match(/^#{1,6}\s+(.*)$/)
    if (titulo) {
      secoes.push({ titulo: limpar(titulo[1] ?? ''), linhas: [] })
      continue
    }
    if (linha.trimStart().startsWith('|')) continue
    secoes[secoes.length - 1]?.linhas.push(linha)
  }
  return secoes
}

/** Índice da primeira coluna cujo cabeçalho (sem acento) contém `trecho`, ou -1. */
export function coluna(cabecalho: string[], trecho: string): number {
  return cabecalho.findIndex(c => semAcento(c).includes(trecho))
}
