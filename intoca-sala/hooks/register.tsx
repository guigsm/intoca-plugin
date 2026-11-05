// O ADAPTADOR (a entrada do mod): todo o contato com a API de mods do Claude Code mora neste arquivo (`$`,
// `Register`, os nomes dos eventos, os estados e o desenho). A API é acesso antecipado e muda entre versões;
// o resto do pacote (manifesto, sede, fila, pendências, sala, regras e o desenho) é função pura e não a conhece.
// Somente leitura: nada aqui escreve arquivo, decide permissão, troca parâmetro de ferramenta ou usa a rede além do loopback (a InToca Sala, só GET).
// Cada falha vira silêncio: o mod nunca derruba o chat.
// O validador só deixa `$` passar a funções declaradas no topo do arquivo; por isso o estado do módulo e os
// auxiliares ficam aqui fora de `register`. Uma recarga do mod recomeça deles (o `session.start` roda de novo).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Chat, Painel } from '../types'
import { desenharFaixa, desenharPainel } from './desenho'
import { textoDasPendencias } from './pendencias'
import { avisoDaPasta, avisoDeChatTrocado, contextoDeRegra, type EstadoDeAviso } from './regras'
import { carregarPainel, cargoDoTitulo, osDoPrompt, textoDoStatus } from './sala'
import { resolverSede, type Porta, type Resolucao } from './sede'

const PAINEL = 'sala'
const UM_MINUTO = 60000
const LIMITE_DE_LEITURA = 1024 * 1024
const TOAST_MS = 12000
const TEMPO_DA_SALA_MS = 1500
const SEM_SEDE = 'Não achei a sede a partir desta pasta. Abra o chat numa pasta da sede, ou registre a sede com /intoca:comecar.'
const NAO_COUBE = 'O painel não coube agora (janela estreita); alargue a janela e rode o comando de novo.'

const painel = atom({ plugin: 'intoca-sala', key: 'painel' } as const, null)
const chat = atom({ plugin: 'intoca-sala', key: 'chat' } as const, null)
const passivo = atom({ plugin: 'intoca-sala', key: 'passivo' } as const, false)

let cwd = ''
let resolucao: Resolucao | null = null
let ultimo: Painel | null = null
let chatAtual: Chat | null = null
let passivoAgora = false
let statusAtual: string | undefined
let lendo = false
let relogio: { cancel: () => void } | undefined
const aviso: EstadoDeAviso = { avisou: false, insistiu: false }

// Um começo de sessão recomeça do zero: nada do que o módulo guardou numa carga anterior vale.
function recomecar(): void {
  relogio?.cancel()
  relogio = undefined
  cwd = ''
  resolucao = null
  ultimo = null
  chatAtual = null
  passivoAgora = false
  statusAtual = undefined
  lendo = false
  aviso.avisou = false
  aviso.insistiu = false
  delete aviso.lembrete
}

/** O mundo de fora, como o resto do pacote o pede. Leitura que falha vira "ausente"; arquivo acima de 1 MB, "grande". */
function porta($: EngineInterface): Porta {
  return {
    ler: async caminho => {
      try {
        const texto = await $.fs.read(caminho)
        return texto.length > LIMITE_DE_LEITURA ? { erro: 'grande' } : { texto }
      } catch {
        return { erro: 'ausente' }
      }
    },
    existe: async caminho => {
      try {
        return await $.fs.exists(caminho)
      } catch {
        return false
      }
    },
    // Só o loopback, só GET, tempo-limite curto (a corrida com o relógio do motor); qualquer falha vira `null`.
    http: async url => {
      if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/api\/[a-z]+$/.test(url)) return null
      try {
        const r = await Promise.race([
          $.http.fetch(url, { method: 'GET' }),
          $.clock.sleep(TEMPO_DA_SALA_MS).then(() => null),
        ])
        return r && r.ok ? r.text : null
      } catch {
        return null
      }
    },
    real: async caminho => {
      try {
        return (await $.fs.stat(caminho, { resolve: true })).realPath ?? null
      } catch {
        return null
      }
    },
    ambiente: async () => ({
      TEMP: await $.env.get('TEMP'),
      TMP: await $.env.get('TMP'),
      TMPDIR: await $.env.get('TMPDIR'),
      INTOCA_SEDE: await $.env.get('INTOCA_SEDE'),
      INTOCA_HOME: await $.env.get('INTOCA_HOME'),
      HOME: await $.env.get('HOME'),
      USERPROFILE: await $.env.get('USERPROFILE'),
    }),
  }
}

// A linha de status só muda quando o texto muda, e só em pasta onde os elementos passivos podem agir.
function aplicarStatus($: EngineInterface): void {
  const texto = passivoAgora ? textoDoStatus(chatAtual, ultimo) : undefined
  if (texto === statusAtual) return
  statusAtual = texto
  $.ui.status(texto)
}

async function guardarChat($: EngineInterface, novo: Chat): Promise<void> {
  chatAtual = novo
  await update($, chat, () => novo)
  aplicarStatus($)
}

// Lê a sede e as filas de novo e põe nos estados que o desenho lê.
async function atualizar($: EngineInterface, pasta: string): Promise<Resolucao | null> {
  if (lendo) return resolucao
  lendo = true
  try {
    const p = porta($)
    const r = await resolverSede(p, pasta)
    resolucao = r
    if (!r) {
      ultimo = null
      passivoAgora = false
      await update($, painel, () => null)
      await update($, passivo, () => false)
      aplicarStatus($)
      return null
    }
    ultimo = await carregarPainel(p, r, () => $.clock.now())
    passivoAgora = r.passivo
    await update($, painel, () => ultimo)
    await update($, passivo, () => r.passivo)
    aplicarStatus($)
    return r
  } catch {
    return resolucao
  } finally {
    lendo = false
  }
}

// A pasta do chat pode mudar depois do começo (`change_directory`, regra 13): o relógio e os pedidos releem a pasta viva.
async function cwdVivo($: EngineInterface): Promise<void> {
  try {
    const viva = await $.session.cwd()
    if (typeof viva === 'string' && viva !== '') cwd = viva
  } catch {
    // sem a pasta viva, vale a última conhecida
  }
}

function iniciarRelogio($: EngineInterface): void {
  if (relogio) return
  // A função devolve a leitura em curso, para o motor esperar por ela.
  relogio = $.clock.every(UM_MINUTO, async () => {
    await cwdVivo($)
    await atualizar($, cwd)
  })
}

// Pedido de propósito (/sala, /pendencias, botão): acha a sede a partir da pasta do chat, lê, abre o painel.
// Vale em qualquer pasta quando há sede; a regra do ponteiro só segura os elementos passivos.
async function pedir($: EngineInterface): Promise<{ ok: boolean; placed: boolean }> {
  await cwdVivo($)
  const r = await atualizar($, cwd)
  if (!r) return { ok: false, placed: false }
  iniciarRelogio($)
  const aberto = await $.ui.open({ id: PAINEL, title: 'InToca Sala' })
  return { ok: true, placed: aberto.isPlaced }
}

// Botão do painel ou da faixa: um pedido que falha não pode virar exceção solta.
async function pedirSeguro($: EngineInterface): Promise<void> {
  try {
    await pedir($)
  } catch {
    // o botão simplesmente não faz nada
  }
}

// As mesmas variáveis de silêncio dos hooks: ligada é definida, não vazia e diferente de "0".
const ligada = (v: string | undefined): boolean => Boolean(v) && v !== '0'

async function avisosCalados($: EngineInterface): Promise<{ trocado: boolean; pasta: boolean }> {
  const trocado = ligada(await $.env.get('INTOCA_SEM_AVISO_TROCADO'))
  return { trocado, pasta: trocado || ligada(await $.env.get('INTOCA_SEM_AVISO_PASTA')) }
}

async function avisarDaPasta($: EngineInterface, r: Resolucao): Promise<void> {
  if ((await avisosCalados($)).pasta) return
  const p = porta($)
  const ambiente = await p.ambiente()
  const casa = ambiente.INTOCA_HOME?.trim() || ambiente.USERPROFILE?.trim() || ambiente.HOME?.trim()
  const texto = await avisoDaPasta(r, cwd, { casa, temp: { TEMP: ambiente.TEMP, TMP: ambiente.TMP, TMPDIR: ambiente.TMPDIR }, real: p.real })
  if (texto) $.ui.toast(texto, { timeoutMs: TOAST_MS })
}

async function avisarDoPedido($: EngineInterface, prompt: string, pasta: string, titulo: string | undefined, os: string | null): Promise<void> {
  if (!passivoAgora || !resolucao?.manifesto || (await avisosCalados($)).trocado) return
  const { ctx, siglas } = contextoDeRegra(resolucao.manifesto, resolucao.sede, pasta)
  const texto = avisoDeChatTrocado(ctx, { prompt, titulo, osConhecida: os ?? undefined }, aviso, siglas)
  if (texto) $.ui.toast(texto, { timeoutMs: TOAST_MS })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      recomecar()
      cwd = e.cwd
      await $.command.register({ name: 'pendencias', description: 'Lista as pendências abertas do proprietário e abre a sala de operações' })
      await $.command.register({ name: 'sala', description: 'Abre a sala de operações: OS, recursos ocupados, pendências e avisos' })
      const r = await atualizar($, cwd)
      // O relógio começa mesmo sem sede à vista: o chat pode mudar de pasta depois (`change_directory`).
      iniciarRelogio($)
      if (r) await avisarDaPasta($, r)
    } catch {
      // o mod nunca derruba o chat
    }
    return next(e)
  })

  // O título do chat (`Cargo · Projeto`, `Executor · ID tema`) chega nos eventos clássicos de início e de prompt.
  on('classic.SessionStart', async ($, e, next) => {
    try {
      if (typeof e.session_title === 'string' && e.session_title !== '') await guardarChat($, cargoDoTitulo(e.session_title))
    } catch {
      // idem
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    try {
      const titulo = typeof e.session_title === 'string' ? e.session_title : undefined
      // Título que diz o cargo vale; sem cargo no título, fica o que já se sabia do chat (inclusive a OS vinda do prompt).
      const doTitulo = titulo ? cargoDoTitulo(titulo) : null
      let atual: Chat = doTitulo?.cargo ? doTitulo : chatAtual ?? { cargo: null, os: null }
      // Reserva: o prompt que contrata o executor cita o arquivo da OS. O título, quando diz o cargo, vale mais.
      if (!atual.cargo) {
        const os = osDoPrompt(e.prompt)
        if (os) atual = { cargo: 'Executor', os }
      }
      if (atual.cargo !== chatAtual?.cargo || atual.os !== chatAtual?.os) await guardarChat($, atual)
      if (e.source === undefined || e.source === 'user') await avisarDoPedido($, e.prompt, e.cwd || cwd, titulo, atual.os)
    } catch {
      // idem
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'pendencias' }, async $ => {
    try {
      const { ok, placed } = await pedir($)
      if (!ok || !ultimo) return { text: SEM_SEDE }
      return { text: placed ? textoDasPendencias(ultimo.pendencias) : `${textoDasPendencias(ultimo.pendencias)}\n${NAO_COUBE}` }
    } catch {
      return { text: SEM_SEDE }
    }
  })

  on('command.run', { command: 'sala' }, async $ => {
    try {
      const { ok, placed } = await pedir($)
      if (!ok || !ultimo) return { text: SEM_SEDE }
      return { text: placed ? 'InToca Sala aberta.' : `InToca Sala lida. ${NAO_COUBE}` }
    } catch {
      return { text: SEM_SEDE }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    const p = await read($, painel)
    const c = await read($, chat)
    return desenharPainel($.ui.resolve(e), p, c, () => {
      void pedirSeguro($)
    })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    if (!(await read($, passivo))) return next(e)
    const arvore = desenharFaixa($.ui.resolve(e), await read($, painel), () => {
      void pedirSeguro($)
    })
    return arvore ?? next(e)
  }).catch(($, e, next) => next(e))
}
