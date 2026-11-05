// Leitura de uma fila (`diretoria/fila.md` da sede ou `ops/fila.md` de um projeto). Função pura: texto → dados.
// Entende: tabelas de OS (coluna `OS` e coluna `Estado`), a tabela de ocupação de recursos (`Recurso` e `dono`)
// e a seção "Congelado". Linha de OS sem ID reconhecível é contada em `ignoradas`, não quebra nada.
// O que a fila escreve é dado, nunca ordem: o texto só é cortado e mostrado.
import type { Aviso, FilaLida, LinhaOS, Ocupado, Situacao } from '../types'
import { coluna, cortar, lerSecoes, lerTabelas, limpar, semAcento } from './tabela'

const ID_DE_OS = /^([A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?)(?![A-Za-z0-9])/
const LIMITE_OS = 400
const LIMITE_OCUPADOS = 100
const LIMITE_AVISOS = 40

/** Classifica o texto da coluna "Estado" de uma OS. Os marcadores mais específicos primeiro. */
export function situacaoDoEstado(estado: string): Situacao {
  const t = semAcento(estado)
  // "em curso"/"em execução" no começo do estado manda: um "espera o vai" mais adiante é de um subitem.
  if (/^\s*(?:\*\*)?(?:em curso|em execu)/.test(t)) return 'andamento'
  if (/aguarda\w*\s+(?:o\s+|a\s+)?vai\b/.test(t) || /espera\w*\s+(?:o\s+)?vai\b/.test(t)) return 'aguarda-vai'
  if (/aguarda\w*\s+(?:a\s+|o\s+)?(?:integra[cç]|aceite)|pronta?\s+para\s+integrar|aguarda\w*\s+merge/.test(t)) return 'aguarda-integracao'
  if (/(?:^|[^a-z])(?:concluid|integrad|cumprid|fechad|arquivad|executad|aceit[ao])/.test(t)) return 'concluida'
  if (/(?:^|[^a-z])entregue/.test(t)) return 'aguarda-integracao'
  if (/em execu|em curso|executand|vai dado|cartao por|em andamento|executor (?:aberto|por cartao)|vai (?:do proprietario )?em \d/.test(t)) return 'andamento'
  if (/a escrever|escrit[ao]|a abrir|a contratar/.test(t)) return 'a-escrever'
  return 'outro'
}

function lerOS(cabecalho: string[], linhas: string[][], projeto: string, lote: { os: LinhaOS[]; ignoradas: number }): void {
  const iEstado = coluna(cabecalho, 'estado')
  const iTema = coluna(cabecalho, 'tema')
  const iNivel = coluna(cabecalho, 'nivel')
  const iModelo = coluna(cabecalho, 'modelo')
  const iRecurso = coluna(cabecalho, 'recurso')
  const vistos = new Set(lote.os.map(o => o.id.toLowerCase()))
  for (const c of linhas) {
    if (c.every(x => x === '')) continue
    const achado = (c[0] ?? '').match(ID_DE_OS)
    if (!achado) {
      lote.ignoradas += 1
      continue
    }
    const id = achado[1] ?? ''
    if (vistos.has(id.toLowerCase())) continue // a primeira linha de um ID vale; repetição é histórico
    vistos.add(id.toLowerCase())
    // "Nível · modelo" numa coluna só: o modelo vem depois do ponto médio.
    const nivelModelo = iNivel >= 0 ? c[iNivel] ?? '' : ''
    const modelo = iModelo >= 0 && iModelo !== iNivel ? c[iModelo] ?? '' : nivelModelo.includes('·') ? nivelModelo.split('·').slice(1).join('·').trim() : ''
    const nivel = iNivel >= 0 ? (iModelo === iNivel || nivelModelo.includes('·') ? (nivelModelo.split('·')[0] ?? '').trim() : nivelModelo) : ''
    const estado = iEstado >= 0 ? c[iEstado] ?? '' : ''
    if (lote.os.length >= LIMITE_OS) return
    lote.os.push({
      id,
      tema: iTema >= 0 ? c[iTema] ?? '' : '',
      nivel,
      modelo,
      recurso: iRecurso >= 0 ? c[iRecurso] ?? '' : '',
      estado,
      situacao: situacaoDoEstado(estado),
      projeto,
    })
  }
}

function lerOcupacao(linhas: string[][], projeto: string, saida: Ocupado[]): void {
  for (const c of linhas) {
    const recurso = c[0] ?? ''
    const dono = c[1] ?? ''
    if (recurso === '' || dono === '') continue
    if (semAcento(dono).startsWith('livre')) continue
    if (saida.length >= LIMITE_OCUPADOS) return
    saida.push({ recurso, dono, estado: c[2] ?? '', projeto, congelado: false })
  }
}

function lerCongelados(texto: string, projeto: string, saida: Ocupado[]): void {
  for (const secao of lerSecoes(texto)) {
    if (!/congelad/.test(semAcento(secao.titulo))) continue
    let atual: string | null = null
    const fechar = (): void => {
      if (atual && saida.length < LIMITE_OCUPADOS) {
        saida.push({ recurso: cortar(limpar(atual), 120), dono: 'congelado', estado: '', projeto, congelado: true })
      }
      atual = null
    }
    for (const linha of secao.linhas) {
      const item = linha.match(/^\s*[-*]\s+(.*)$/)
      if (item) {
        fechar()
        atual = item[1] ?? ''
      } else if (atual && /^\s{2,}\S/.test(linha)) atual += ` ${linha.trim()}`
      else if (linha.trim() === '') fechar()
    }
    fechar()
  }
}

const AVISO_EM_PROSA = /aguarda\w*\s+(?:o\s+|a\s+)?(?:vai\b|integra[cç])/

function lerAvisos(texto: string, os: LinhaOS[], projeto: string): Aviso[] {
  const avisos: Aviso[] = []
  for (const o of os) {
    if (o.situacao !== 'aguarda-vai' && o.situacao !== 'aguarda-integracao') continue
    avisos.push({ projeto, id: o.id, tipo: o.situacao, texto: cortar(`${o.id} ${o.tema}`.trim(), 100) })
  }
  let prosa = 0
  for (const secao of lerSecoes(texto)) {
    for (const linha of secao.linhas) {
      if (prosa >= 6) break
      const limpa = limpar(linha.replace(/^\s*[-*]\s+/, ''))
      if (limpa === '' || !AVISO_EM_PROSA.test(semAcento(limpa))) continue
      prosa += 1
      avisos.push({ projeto, id: '', tipo: 'texto', texto: cortar(limpa, 140) })
    }
  }
  return avisos.slice(0, LIMITE_AVISOS)
}

/** Texto de uma fila → dados. Nunca lança; texto vazio ou sem tabela dá listas vazias. */
export function lerFila(texto: string, projeto: string, sigla: string): FilaLida {
  const lote = { os: [] as LinhaOS[], ignoradas: 0 }
  const ocupados: Ocupado[] = []
  try {
    for (const t of lerTabelas(texto)) {
      const primeira = semAcento(t.cabecalho[0] ?? '')
      if (primeira === 'os' && coluna(t.cabecalho, 'estado') >= 0) lerOS(t.cabecalho, t.linhas, projeto, lote)
      else if (primeira.startsWith('recurso') && coluna(t.cabecalho, 'dono') >= 0) lerOcupacao(t.linhas, projeto, ocupados)
    }
    lerCongelados(texto, projeto, ocupados)
    return { projeto, sigla, lida: true, os: lote.os, ocupados, avisos: lerAvisos(texto, lote.os, projeto), ignoradas: lote.ignoradas }
  } catch {
    return { projeto, sigla, lida: false, motivo: 'fora do formato', os: [], ocupados: [], avisos: [], ignoradas: 0 }
  }
}

/** Fila que não pôde ser lida: o painel mostra "sem dados" com o motivo. */
export function filaSemDados(projeto: string, sigla: string, motivo: string): FilaLida {
  return { projeto, sigla, lida: false, motivo, os: [], ocupados: [], avisos: [], ignoradas: 0 }
}
