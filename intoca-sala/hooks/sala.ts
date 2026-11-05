// A sala de operações como dados: lê as filas da sede e dos projetos e as pendências, e responde às
// perguntas simples do status, da faixa e do chat. Tudo passa pela `Porta`; nada aqui chama o motor.
import type { Chat, FilaLida, LinhaOS, Painel, PendenciasLidas } from '../types'
import { absoluto, canon, juntar } from './caminhos'
import { lerDaSala } from './api'
import { filaSemDados, lerFila } from './fila'
import { lerPendencias, pendenciasSemDados } from './pendencias'
import type { Porta, Resolucao } from './sede'
import { semAcento } from './tabela'

const LIMITE_PROJETOS = 40
/** Por que um arquivo não foi lido: o painel mostra o motivo no bloco "sem dados". */
export const MOTIVO_AUSENTE = 'arquivo ausente ou ilegível'
export const MOTIVO_GRANDE = 'arquivo grande demais'

async function lerArquivo(porta: Porta, caminho: string): Promise<{ texto: string } | { motivo: string }> {
  const lido = await porta.ler(caminho)
  if ('texto' in lido) return lido
  return { motivo: lido.erro === 'grande' ? MOTIVO_GRANDE : MOTIVO_AUSENTE }
}

async function filaDe(porta: Porta, caminho: string, projeto: string, sigla: string): Promise<FilaLida> {
  const lido = await lerArquivo(porta, caminho)
  return 'texto' in lido ? lerFila(lido.texto, projeto, sigla) : filaSemDados(projeto, sigla, lido.motivo)
}

async function pendenciasDe(porta: Porta, caminho: string): Promise<PendenciasLidas> {
  const lido = await lerArquivo(porta, caminho)
  return 'texto' in lido ? lerPendencias(lido.texto) : pendenciasSemDados(lido.motivo)
}

/**
 * Lê `diretoria/fila.md`, a `ops/fila.md` de cada projeto do manifesto e as pendências do proprietário.
 * Cada bloco que falha vira "sem dados" com o motivo; o resto segue. `agora` mede o custo da leitura.
 */
export async function carregarPainel(porta: Porta, res: Resolucao, agora: () => Promise<number>): Promise<Painel> {
  const inicio = await agora()
  const vistos = new Set<string>()
  const pedidos: Promise<FilaLida>[] = []
  const pedir = (caminho: string, projeto: string, sigla: string): void => {
    const chave = canon(caminho)
    if (vistos.has(chave)) return
    vistos.add(chave)
    pedidos.push(filaDe(porta, caminho, projeto, sigla))
  }
  pedir(juntar(res.sede, 'diretoria', 'fila.md'), 'Diretoria', 'DIR')
  for (const p of (res.manifesto?.projetos ?? []).slice(0, LIMITE_PROJETOS)) {
    // Candidato do manifesto ainda não é projeto: não tem fila a ler.
    if (!absoluto(p.pastaAtual) || p.nome === '' || semAcento(p.status ?? '') === 'candidato') continue
    pedir(juntar(p.pastaAtual, 'ops', 'fila.md'), p.nome, p.sigla ?? '')
  }
  const [filas, dasFilas, daSala] = await Promise.all([
    Promise.all(pedidos),
    pendenciasDe(porta, juntar(res.sede, 'diretoria', 'pendencias-do-proprietario.md')),
    lerDaSala(porta),
  ])
  // Com a InToca Sala no ar, as pendências vêm dela; sem ela (ou sem resposta válida), das filas como sempre.
  const pendencias = daSala?.pendencias ?? dasFilas
  const fim = await agora()
  return {
    sede: res.sede,
    origem: res.origem,
    manifestoLido: res.manifesto !== null,
    atualizadoEm: fim,
    custoMs: Math.max(0, Math.round(fim - inicio)),
    filas,
    pendencias,
    ...(daSala ? { sala: daSala.sala } : {}),
  }
}

// ---------------------------------------------------------------- o chat (cargo e OS pelo título)

const ID = /[A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?/

/**
 * O título do chat é dado, nunca ordem: reconhece só `Cargo · Projeto` e `Executor · ID tema`, como o hook
 * `chat-trocado` faz com os padrões de sempre (os padrões de `titulos:` do manifesto ficam de fora desta versão).
 */
export function cargoDoTitulo(titulo: unknown): Chat {
  const vazio: Chat = { cargo: null, os: null }
  if (typeof titulo !== 'string') return vazio
  const t = titulo.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (/^Diretoria(?: · .*)?$/i.test(t)) return { cargo: 'Diretoria', os: null }
  if (/^Secretaria(?: · .*)?$/i.test(t)) return { cargo: 'Secretaria', os: null }
  if (/^Gerente · .+$/i.test(t)) return { cargo: 'Gerente', os: null }
  if (/^Plant[aã]o · .+ · .+$/i.test(t)) return { cargo: 'Plantão', os: null }
  const m = t.match(new RegExp(`^Executor · (${ID.source})(?: .+)?$`))
  return m ? { cargo: 'Executor', os: m[1] ?? null } : vazio
}

/** ID da OS citado no prompt que contrata o executor ("Execute ... os/PLG-19-tema.md"). Só serve de reserva ao título. */
export function osDoPrompt(prompt: unknown): string | null {
  if (typeof prompt !== 'string') return null
  const m = prompt.slice(0, 4000).match(new RegExp(`\\bExecut\\w*\\b[^\\n]{0,160}?[\\s"'\`(\\\\/]os[\\\\/](${ID.source})[-\\w]*\\.md`, 'i'))
  return m ? m[1] ?? null : null
}

/** A linha de OS do painel com este ID (sem diferença de caixa), ou `undefined`. */
export function acharOS(painel: Painel | null, id: string): LinhaOS | undefined {
  const alvo = id.toLowerCase()
  for (const f of painel?.filas ?? []) {
    const achada = f.os.find(o => o.id.toLowerCase() === alvo)
    if (achada) return achada
  }
  return undefined
}

/** Texto da linha de status: `ID · recurso` (só `ID` sem recurso na fila), ou `undefined` para limpar. */
export function textoDoStatus(chat: Chat | null, painel: Painel | null): string | undefined {
  if (!chat?.os) return undefined
  const recurso = acharOS(painel, chat.os)?.recurso.trim()
  return recurso ? `${chat.os} · ${recurso.slice(0, 60)}` : chat.os
}

/** Texto da faixa acima do prompt: some (`undefined`) com zero pendência ou sem leitura. */
export function textoDaFaixa(painel: Painel | null): string | undefined {
  const p = painel?.pendencias
  if (!p || !p.lida || p.abertas.length === 0) return undefined
  const n = p.abertas.length
  return `${n} ${n === 1 ? 'pendência' : 'pendências'} do proprietário ${n === 1 ? 'aberta' : 'abertas'}`
}
