// Porta mínima das regras 13 e 14 dos hooks `chat-trocado` e `pasta-errada` do plugin `intoca`, para o toast.
// Um mod não importa o Node dos hooks: isto reimplementa nome, domínio, sigla em maiúsculas (palavra inteira) e
// caminho de pasta, e fica mudo nas mesmas exceções (consulta, conversa sobre o próprio trabalho, insistência do
// proprietário, Diretoria e Secretaria). Os casos de `tests/paridade/` provam que as duas dão a mesma resposta.
// Só avisa: nada aqui bloqueia, escreve ou decide permissão. Os hooks clássicos seguem avisando o modelo.
// Diferença deliberada: o caminho é comparado como texto (sem resolver link nem junção), e o estado da sessão
// ("já avisei", "o proprietário insistiu") vive na memória do mod, não em arquivo.
import { absoluto, canon, dentroDe, ehEstiloWindows, ehRaiz, juntar, nomeDe, pai, relativo } from './caminhos'
import type { Manifesto } from './manifesto'

export type ProjetoRegra = { nome: string; atual?: string; futura?: string; antigas: string[] }
export type ContextoRegra = { sede: string; cwd: string; projetos: ProjetoRegra[] }
export type EstadoDeAviso = { avisou: boolean; insistiu: boolean; lembrete?: string }
type Chat = { tipo: 'sede' } | { tipo: 'projeto'; projeto: ProjetoRegra }
type Cargo = { cargo: 'Diretoria' | 'Secretaria' | 'Gerente' | 'Plantão' | 'Executor'; os?: string }

const LIMITE_DO_PROMPT = 200000
const LETRAS = '\\p{L}\\p{N}_'
const TOPO = 160

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const semAcento = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const limpo = (s: unknown, max = 60): string =>
  String(s ?? '').replace(/[`\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Manifesto → o contexto das regras (só projetos com alguma pasta, como o hook) e as siglas por nome. */
export function contextoDeRegra(manifesto: Manifesto | null, sede: string, cwd: string): { ctx: ContextoRegra; siglas: Map<string, string> } {
  const projetos: ProjetoRegra[] = []
  const siglas = new Map<string, string>()
  for (const p of manifesto?.projetos ?? []) {
    const primeira = p.pastaAtual ?? p.pastaFutura
    if (!primeira && p.pastasAntigas.length === 0) continue
    const nome = p.nome || (primeira ? nomeDe(primeira) : '')
    projetos.push({ nome, atual: p.pastaAtual, futura: p.pastaFutura, antigas: p.pastasAntigas })
    if (p.sigla) siglas.set(limpo(nome), p.sigla)
  }
  return { ctx: { sede, cwd, projetos }, siglas }
}

// ------------------------------------------------------------ o que o prompt cita

type Achado = { indice: number; texto: string }

function achaPalavra(prompt: string, termo: string, op: { sensivel?: boolean; rotulo?: boolean; sigla?: boolean } = {}): Achado[] {
  const corpo = termo.trim().split(/\s+/).map(escapar).join('\\s+')
  const antes = op.rotulo || op.sigla ? `(?<![${LETRAS}.\\-])` : `(?<![${LETRAS}\\-])`
  let depois = `(?![${LETRAS}\\-])`
  if (op.rotulo) depois = `(?![${LETRAS}\\-]|\\.[\\p{L}\\p{N}])`
  if (op.sigla) depois = `(?![${LETRAS}]|-\\D|\\.[\\p{L}\\p{N}])`
  const re = new RegExp(`${antes}${corpo}${depois}`, `gu${op.sensivel ? '' : 'i'}`)
  const achados: Achado[] = []
  for (const m of prompt.matchAll(re)) achados.push({ indice: m.index ?? 0, texto: m[0] })
  return achados
}

function emEndereco(prompt: string, a: Achado): boolean {
  const antes = prompt.slice(Math.max(0, a.indice - 2), a.indice)
  const depois = prompt.slice(a.indice + a.texto.length, a.indice + a.texto.length + 2)
  return antes === '//' || /^:\d/.test(depois)
}

const NOMES_COMUNS = new Set(['localhost'])
const GOVERNANCA = new Set(['os', 'relatorios', 'autorizacoes', 'decisoes', 'modelos', 'fila.md', 'historico.md', 'passagem.md', 'backlog.md'])

type Citado = { nome: string; vias: Set<string>; indice: number }

function citacoes(prompt: string, ctx: ContextoRegra, siglas: Map<string, string>): Citado[] {
  const achados = new Map<string, Citado>()
  const registrar = (nome: string, via: string, indice: number): void => {
    const atual = achados.get(nome)
    if (!atual) achados.set(nome, { nome, vias: new Set([via]), indice })
    else {
      atual.vias.add(via)
      if (indice < atual.indice) atual.indice = indice
    }
  }
  for (const p of ctx.projetos) {
    const nome = limpo(p.nome)
    if (!nome || nome === '_') continue
    const dominio = nome.includes('.')
    if (!NOMES_COMUNS.has(nome.toLowerCase())) {
      for (const a of achaPalavra(prompt, nome)) {
        if (!dominio && emEndereco(prompt, a)) continue
        registrar(nome, 'nome', a.indice)
      }
    }
    if (dominio) {
      const rotulo = nome.split('.')[0] ?? ''
      if (rotulo.length >= 5) {
        for (const f of [rotulo.charAt(0).toUpperCase() + rotulo.slice(1), rotulo.toUpperCase()]) {
          for (const a of achaPalavra(prompt, f, { rotulo: true, sensivel: true })) registrar(nome, 'nome', a.indice)
        }
      }
    }
    const sigla = siglas.get(nome)
    if (sigla && /^[A-Z][A-Z0-9]{1,7}$/.test(sigla)) {
      for (const a of achaPalavra(prompt, sigla, { sensivel: true, sigla: true })) {
        const seguinte = prompt.slice(a.indice + a.texto.length, a.indice + a.texto.length + 2)
        registrar(nome, /^-\d/.test(seguinte) ? 'os' : 'sigla', a.indice)
      }
    }
  }
  // Caminhos de pasta (inclusive pastas antigas): vale a pasta mais específica que contém o caminho.
  const pastas: { nome: string; pasta: string }[] = []
  for (const p of ctx.projetos) for (const f of [p.atual, p.futura, ...p.antigas]) if (f) pastas.push({ nome: limpo(p.nome), pasta: f })
  const re = /(?<![\w.:/\\-])(?:[A-Za-z]:[\\/]|\/)[^\s"'`<>|*?]+/g
  let n = 0
  for (const m of prompt.matchAll(re)) {
    if (n >= 40) break
    n += 1
    const token = m[0].replace(/[.,;:)\]}!?]+$/, '')
    if (!absoluto(token)) continue
    let dono: string | null = null
    let melhor: string | null = null
    for (const f of pastas) {
      if (dentroDe(f.pasta, token, true) && (!melhor || canon(f.pasta).length > canon(melhor).length)) {
        dono = f.nome
        melhor = f.pasta
      }
    }
    if (!dono && dentroDe(juntar(ctx.sede, '_worktrees'), token)) {
      const d = donoDaWorktree(ctx, relativo(juntar(ctx.sede, '_worktrees'), token)[0])
      if (d && d.tipo === 'projeto') dono = limpo(d.projeto.nome)
    }
    if (!dono) continue
    const dentro = melhor ? relativo(melhor, token).map(x => x.toLowerCase()) : []
    registrar(dono, dentro[0] === 'ops' && GOVERNANCA.has(dentro[1] ?? '') ? 'governanca' : 'caminho', m.index ?? 0)
  }
  return [...achados.values()].sort((a, b) => a.indice - b.indice)
}

// ------------------------------------------------------------ quem é o chat (pelo cwd)

const comparavel = (ctx: ContextoRegra, s: string): string => (ehEstiloWindows(ctx.sede) ? s.toLowerCase() : s)

function donoDaWorktree(ctx: ContextoRegra, nomeDaPasta: string | undefined): { tipo: 'projeto'; projeto: ProjetoRegra } | { tipo: 'sede' } | null {
  if (!nomeDaPasta) return null
  const n = comparavel(ctx, nomeDaPasta)
  const candidatos: ({ tipo: 'projeto'; projeto: ProjetoRegra } | { tipo: 'sede' })[] = []
  for (const projeto of ctx.projetos) {
    if (!projeto.atual) continue
    if (n.startsWith(`${comparavel(ctx, nomeDe(projeto.atual))}-`)) candidatos.push({ tipo: 'projeto', projeto })
  }
  if (n.startsWith(`${comparavel(ctx, nomeDe(ctx.sede))}-`)) candidatos.push({ tipo: 'sede' })
  return candidatos.length === 1 ? candidatos[0] ?? null : null
}

function quemEoChat(ctx: ContextoRegra): Chat | null {
  const worktrees = juntar(ctx.sede, '_worktrees')
  if (dentroDe(worktrees, ctx.cwd)) return donoDaWorktree(ctx, relativo(worktrees, ctx.cwd)[0])
  let melhor: { projeto: ProjetoRegra; tamanho: number } | null = null
  for (const projeto of ctx.projetos) {
    for (const pasta of [projeto.atual, projeto.futura]) {
      if (pasta && dentroDe(pasta, ctx.cwd, true) && (!melhor || canon(pasta).length > melhor.tamanho)) {
        melhor = { projeto, tamanho: canon(pasta).length }
      }
    }
  }
  if (melhor) return { tipo: 'projeto', projeto: melhor.projeto }
  if (dentroDe(ctx.sede, ctx.cwd, true)) return { tipo: 'sede' }
  return null
}

// ------------------------------------------------------------ exceções da regra 14

const INSISTENCIA = [
  /\bfa(?:z|ca|zer)\s+aqui\b/,
  /\baqui\s+mesmo\b/,
  /\bpode\s+(?:seguir|fazer|ir|executar|continuar|mexer)\s+(?:isso\s+)?aqui\b/,
  /\b(?:segue|siga|seguir|executa|execute|vai|va)\s+aqui\b/,
]
const APOS_AVISO = /\bmesmo\s+assim\b/
const PEDIDO_DE_CODIGO = /\b(?:altere|alterar|corrija|corrigir|ajuste|ajustar|troque|trocar|edite|editar|implemente|implementar|publique|publicar|refatore|refatorar|conserte|consertar|mude|mudar|suba|subir|deploy)\b/
const RESPOSTA_CURTA = /^(?:ok[\s,.!]*)?(?:pode\s+)?(?:seguir|segue|siga|fazer|faz|faca|vai|va|executa|execute)(?:\s+(?:assim|mesmo|ai|isso|ja))?[\s.!]*$/
const CONSULTA = new RegExp(
  '\\b(?:status|situacao|o que e|o que sao|o que significa|qual e|quais sao|qual a|quais|'
    + 'compar\\w+|explic\\w+|list[ae]\\w*|resum\\w+|mostr\\w+|me diga|me fale|como esta|como estao|quem e|onde fica|onde esta)\\b',
)
const PEDIDO_EDUCADO = /^(?:pode|poderia|consegue|conseguiria|voce pode|vc pode|da pra|daria pra|seria possivel|sera que)\b/
const PROPRIO_TRABALHO = /\b(?:pare|parar|pausa|pausar|continue|continuar|retome|retomar|reordene|reordenar|cancele|cancelar)\b/

function consulta(norm: string): boolean {
  if (CONSULTA.test(norm.slice(0, TOPO))) return true
  const t = norm.trim()
  return t.length <= 400 && t.endsWith('?') && !PEDIDO_EDUCADO.test(t)
}

// ------------------------------------------------------------ cargo pelo título

export function cargoDoTituloRegra(titulo: unknown): Cargo | null {
  if (typeof titulo !== 'string') return null
  const t = titulo.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (/^Diretoria(?: · .*)?$/i.test(t)) return { cargo: 'Diretoria' }
  if (/^Secretaria(?: · .*)?$/i.test(t)) return { cargo: 'Secretaria' }
  if (/^Gerente · .+$/i.test(t)) return { cargo: 'Gerente' }
  if (/^Plant[aã]o · .+ · .+$/i.test(t)) return { cargo: 'Plantão' }
  const m = t.match(/^Executor · ([A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?)(?: .+)?$/)
  return m ? { cargo: 'Executor', os: m[1] } : null
}

// ------------------------------------------------------------ texto

function lista(nomes: string[]): string {
  if (nomes.length === 1) return nomes[0] ?? ''
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`
  return `${nomes[0]}, ${nomes[1]} e outros`
}

function avisoTexto(chat: Chat, cargo: Cargo | null, citados: Citado[]): string {
  const nomes = citados.map(c => c.nome).slice(0, 3)
  const X = lista(nomes)
  const um = citados.length === 1
  const gerente = um ? `Gerente · ${nomes[0]}` : `gerentes de ${X}`
  const fila = um ? `à fila de ${gerente}` : `às filas dos ${gerente}`
  const filaNa = um ? `na fila de ${gerente}` : `nas filas dos ${gerente}`
  const filaPara = um ? `para a fila de ${gerente}` : `para as filas dos ${gerente}`
  const paraX = um ? `Se for para ${X}` : 'Se for para eles'
  let quem: string
  let caminho: string
  if (chat.tipo === 'sede') {
    if (cargo?.cargo === 'Diretoria') {
      quem = 'a Diretoria'
      caminho = `${paraX} (código ou conteúdo de projeto), vale registrar ${filaNa} em vez de executar aqui; se for mesmo daqui, siga.`
    } else if (cargo?.cargo === 'Secretaria') {
      quem = 'a Secretaria'
      caminho = `${paraX} (código ou conteúdo de projeto), ele vai ${fila}; se for pendência do proprietário, siga.`
    } else if (cargo?.cargo === 'Executor') {
      quem = `Executor · ${cargo.os} (sede)`
      caminho = `${paraX}, é outra OS: devolva à Diretoria, que registra ${filaNa}; se for mesmo daqui, siga.`
    } else {
      quem = 'a sede'
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`
    }
  } else {
    const proj = limpo(chat.projeto.nome)
    if (cargo?.cargo === 'Executor') {
      quem = `Executor · ${cargo.os} (projeto ${proj})`
      caminho = `${paraX}, é outra OS: devolva ao gerente de ${proj}, que sobe à Diretoria ${filaPara}; se for mesmo daqui, siga.`
    } else if (cargo?.cargo === 'Gerente') {
      quem = `Gerente · ${proj}`
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`
    } else if (cargo?.cargo === 'Plantão') {
      quem = `Plantão (projeto ${proj})`
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`
    } else {
      quem = proj
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`
    }
  }
  return `Aviso InToca: o pedido cita ${X}, e este chat é ${quem}. ${caminho}`
}

function lembrete(os: string, recurso?: string): string {
  const rec = limpo(recurso, 100)
  return `Aviso InToca: este chat cumpre a OS ${os}${rec && rec !== 'não informado' ? ` (recurso: ${rec})` : ''}; `
    + 'pedido novo fora dela é outra OS (regra 15): registre na fila do gerente em vez de fazer aqui.'
}

// ------------------------------------------------------------ chat trocado

export type EntradaTrocado = {
  prompt: string
  titulo?: string
  /** OS que o mod já conhece por outro caminho (o prompt que contratou o executor); o título vale mais. */
  osConhecida?: string
}

/** O aviso de "chat trocado" que o hook daria para este prompt, ou `undefined` (mudo). Atualiza `estado`. */
export function avisoDeChatTrocado(ctx: ContextoRegra, entrada: EntradaTrocado, estado: EstadoDeAviso, siglas: Map<string, string>): string | undefined {
  const prompt = entrada.prompt
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > LIMITE_DO_PROMPT) return undefined
  const chatDoCwd = quemEoChat(ctx)
  if (!chatDoCwd) return undefined
  if (estado.insistiu) return undefined
  const norm = semAcento(prompt)
  if (INSISTENCIA.some(re => re.test(norm)) || (estado.avisou && (APOS_AVISO.test(norm) || RESPOSTA_CURTA.test(norm.trim())))) {
    estado.insistiu = true
    return undefined
  }
  if (consulta(norm) || PROPRIO_TRABALHO.test(norm.slice(0, TOPO))) return undefined

  let cargo = cargoDoTituloRegra(entrada.titulo)
  if (cargo) {
    const daSede = cargo.cargo === 'Diretoria' || cargo.cargo === 'Secretaria'
    const deProjeto = cargo.cargo === 'Gerente' || cargo.cargo === 'Plantão'
    if ((daSede && chatDoCwd.tipo !== 'sede') || (deProjeto && chatDoCwd.tipo !== 'projeto')) cargo = null
  }
  const outroCargo = cargo !== null && cargo.cargo !== 'Executor'
  let executor: { os: string } | null = null
  if (!outroCargo) executor = entrada.osConhecida ? { os: entrada.osConhecida } : cargo?.cargo === 'Executor' ? { os: cargo.os as string } : null

  let chat: Chat = chatDoCwd
  if (chat.tipo === 'sede' && executor) {
    const prefixo = executor.os.match(/^([A-Za-z][A-Za-z0-9]*)-\d/)?.[1]?.toUpperCase()
    const dono = prefixo ? ctx.projetos.find(p => (siglas.get(p.nome) ?? '').toUpperCase() === prefixo) : undefined
    if (dono) chat = { tipo: 'projeto', projeto: dono }
  }

  const proprio = chat.tipo === 'projeto' ? limpo(chat.projeto.nome) : null
  let citados = citacoes(prompt, ctx, siglas).filter(c => c.nome !== proprio)
  if (chat.tipo === 'sede') citados = citados.filter(c => [...c.vias].some(v => v !== 'os' && v !== 'governanca'))
  if (cargo && (cargo.cargo === 'Diretoria' || cargo.cargo === 'Secretaria')) {
    const pedeCodigo = PEDIDO_DE_CODIGO.test(norm.slice(0, TOPO))
    // Citar só a pasta, sem verbo de mexer no projeto, é conversa de portfólio (PLG-22 do pacote): fica mudo.
    citados = citados.filter(c => pedeCodigo && (c.vias.has('caminho') || c.vias.has('nome') || c.vias.has('sigla')))
  }

  const jaLembrou = (id: string): boolean => estado.lembrete === id
  if (citados.length) {
    estado.avisou = true
    if (executor && !jaLembrou(executor.os)) estado.lembrete = executor.os
    const c: Cargo | null = executor && !cargo ? { cargo: 'Executor', os: executor.os } : cargo
    return avisoTexto(chat, c, citados)
  }
  if (/(?:^|[\s"'`@(\\/])os[\\/][^\s"'`]+\.md/i.test(prompt)) return undefined
  if (executor && !jaLembrou(executor.os)) {
    estado.avisou = true
    estado.lembrete = executor.os
    return lembrete(executor.os)
  }
  return undefined
}

// ------------------------------------------------------------ pasta errada / sem Toca

const PASTAS_DA_SEDE = new Set(['labs', '_infra', '_shared', '_worktrees', 'diretoria', '.claude'])
const FRASE = 'Para trabalho de projeto, o chat assume o cargo na pasta do projeto.'

/** O aviso de "pasta errada" que o hook `pasta-errada` daria para o cwd da sessão, ou `undefined` (tudo certo, ou mudo). */
export function avisoDePastaErrada(ctx: ContextoRegra): string | undefined {
  const chat = quemEoChat(ctx)
  if (chat && chat.tipo === 'projeto') return undefined
  const worktrees = juntar(ctx.sede, '_worktrees')
  if (dentroDe(worktrees, ctx.cwd)) return undefined
  let antiga: { projeto: ProjetoRegra; velha: string } | null = null
  for (const p of ctx.projetos) {
    if (!p.atual) continue
    for (const velha of p.antigas) {
      if (dentroDe(velha, ctx.cwd, true) && (!antiga || canon(velha).length > canon(antiga.velha).length)) antiga = { projeto: p, velha }
    }
  }
  if (antiga && antiga.projeto.atual) {
    return `Aviso InToca: esta pasta não é a de nenhum projeto da sede, o projeto ${limpo(antiga.projeto.nome, 200)} migrou para ${limpo(antiga.projeto.atual, 200)}. ${FRASE}`
  }
  if (chat && chat.tipo === 'sede') {
    const rel = relativo(ctx.sede, ctx.cwd)
    if (rel.length === 0) return undefined
    const primeiro = (rel[0] ?? '').toLowerCase()
    if (PASTAS_DA_SEDE.has(primeiro) || primeiro.startsWith('_')) return undefined
  }
  const dentro = ctx.projetos
    .filter(p => p.atual && dentroDe(ctx.cwd, p.atual))
    .map(p => ({ nome: limpo(p.nome, 200), pasta: limpo(p.atual, 200) }))
    .slice(0, 3)
  const onde = dentro.length ? `; aqui dentro ficam ${dentro.map(d => `${d.nome} (${d.pasta})`).join(', ')}` : ''
  return `Aviso InToca: esta pasta não é a de nenhum projeto da sede${onde}. ${FRASE}`
}

/** Resolve um caminho para o real (sem junção, link nem nome curto do Windows); `null` quando não dá. Só o motor sabe. */
export type ResolverReal = (caminho: string) => Promise<string | null>
/** O que o aviso "sem Toca" pede do ambiente: a pasta pessoal, as variáveis da pasta temporária e, se houver, o caminho real. */
export type OpcoesSemToca = { casa?: string; temp?: { TEMP?: string; TMP?: string; TMPDIR?: string }; real?: ResolverReal }

const NOME_DE_WORKTREE = ['_worktrees']

/** Pasta temporária do sistema, como o `os.tmpdir()` do hook: no Windows `TEMP` ou `TMP`; no resto `TMPDIR`, `TMP` ou `TEMP`. */
function pastaTemporaria(cwd: string, temp: OpcoesSemToca['temp']): string | undefined {
  const t = (v: string | undefined): string | undefined => (v && v.trim() !== '' ? v.trim().replace(/[\\/]+$/, '') : undefined)
  const ordem = ehEstiloWindows(cwd) ? [temp?.TEMP, temp?.TMP] : [temp?.TMPDIR, temp?.TMP, temp?.TEMP, '/tmp']
  for (const v of ordem) {
    const r = t(v)
    if (r && absoluto(r)) return r
  }
  return undefined
}

/** Pasta de worktree de repositório alheio: algum pedaço `_worktrees`, ou `.claude` seguido de `worktrees`. */
function emWorktreeAlheia(caminho: string): boolean {
  const partes = canon(caminho).split('/').filter(Boolean).map(x => x.toLowerCase().replace(/[. ]+$/, ''))
  return partes.some((x, i) => NOME_DE_WORKTREE.includes(x) || (x === '.claude' && partes[i + 1] === 'worktrees'))
}

/** O caminho real do ancestral existente mais fundo, mais o resto; `null` se nada resolve. Como `caminhoReal` do hook. */
async function caminhoRealDe(p: string, real: ResolverReal): Promise<string | null> {
  let atual = p
  const resto: string[] = []
  for (let i = 0; i < 256; i += 1) {
    const r = await real(atual).catch(() => null)
    if (r) return resto.length ? juntar(r, ...resto.reverse()) : r
    const acima = pai(atual)
    if (acima === atual) return null
    resto.push(nomeDe(atual))
    atual = acima
  }
  return null
}

/**
 * Chat aberto numa pasta que não é de nenhuma Toca: a sede veio só do ponteiro e o cwd está fora das pastas
 * registradas. Uma linha, como o hook; mudo na raiz do disco, na pasta pessoal e numa pasta que a contém, na pasta-mãe
 * de pastas registradas, na pasta temporária do sistema, em worktree de repositório alheio e numa pasta que só difere
 * de uma registrada pelo caminho real. O caminho real visita o disco (`opcoes.real`), por isso só é pedido depois de
 * todas as comparações por texto e só quando ainda vai avisar, como o hook (PLG-03b).
 */
export async function avisoSemToca(cwd: string, nomeDaSede: string | null, manifesto: Manifesto | null, opcoes: OpcoesSemToca = {}): Promise<string | undefined> {
  const { casa, temp, real } = opcoes
  if (pai(cwd) === cwd) return undefined
  if (casa && absoluto(casa) && (canon(casa) === canon(cwd) || dentroDe(cwd, casa))) return undefined
  const registradas: string[] = []
  for (const p of manifesto?.projetos ?? []) {
    for (const pasta of [p.pastaAtual, p.pastaFutura, ...p.pastasAntigas]) if (pasta && absoluto(pasta)) registradas.push(pasta)
  }
  const tmp = pastaTemporaria(cwd, temp)
  // Por texto: as formas do caminho são a escrita; depois, quando ainda vai avisar, a real.
  const silencia = (formas: string[], tmps: string[], casas: string[], regs: string[][]): boolean => {
    if (formas.some(f => ehRaiz(f))) return true
    if (casas.some(h => formas.some(f => dentroDe(f, h, true)))) return true
    if (formas.some(f => tmps.some(t => dentroDe(t, f, true)) || emWorktreeAlheia(f))) return true
    return regs.some(rs => rs.some(r => formas.some(f => dentroDe(r, f, true) || dentroDe(f, r))))
  }
  if (silencia([cwd], tmp ? [tmp] : [], casa && absoluto(casa) ? [casa] : [], registradas.map(r => [r]))) return undefined
  if (real) {
    const unico = (a: string, b: string | null): string[] => (b && canon(b) !== canon(a) ? [a, b] : [a])
    const formas = unico(cwd, await caminhoRealDe(cwd, real))
    const tmps = tmp ? unico(tmp, await caminhoRealDe(tmp, real)) : []
    const casas = casa && absoluto(casa) ? unico(casa, await caminhoRealDe(casa, real)) : []
    const regs: string[][] = []
    for (const r of registradas) regs.push(unico(r, await caminhoRealDe(r, real)))
    if (silencia(formas, tmps, casas, regs)) return undefined
  }
  const nome = limpo(nomeDaSede, 200)
  return `Aviso InToca: este chat não faz parte de nenhuma Toca da sede${nome ? ` ${nome}` : ''}. Se for trabalho de um projeto, abra o chat na pasta dele.`
}

/**
 * O aviso de pasta de quem abriu o chat em `cwd`, na sede `r`: sede achada por `sede.yaml` acima ou por INTOCA_SEDE
 * (`passivo`) → "pasta errada"; sede achada só pelo ponteiro e pasta fora do manifesto → "sem Toca". Sem manifesto, mudo.
 */
export async function avisoDaPasta(r: { sede: string; manifesto: Manifesto | null; passivo: boolean }, cwd: string, opcoes: OpcoesSemToca = {}): Promise<string | undefined> {
  if (!r.manifesto) return undefined
  if (r.passivo) return avisoDePastaErrada(contextoDeRegra(r.manifesto, r.sede, cwd).ctx)
  return avisoSemToca(cwd, r.manifesto.nomeDaSede, r.manifesto, opcoes)
}
