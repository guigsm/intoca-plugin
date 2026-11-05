#!/usr/bin/env node
// Hook UserPromptSubmit do plugin intoca: aviso de "chat trocado" (PLG-02, parte A; regras 14 e 15).
// Se o prompt cita OUTRO projeto da sede (nome, domínio, sigla em MAIÚSCULAS ou caminho de pasta,
// inclusive pasta antiga), injeta um aviso de uma linha com o destino. Em chat de executor com OS,
// injeta uma vez por sessão o lembrete de foco da OS. Só additionalContext: nunca bloqueia.
// Mudo quando não tem certeza: sem sede, manifesto ilegível, cwd fora de projeto e da sede, consulta
// sem efeito colateral, conversa sobre o próprio trabalho e insistência do proprietário ("faz aqui
// mesmo"). Lê o sede.yaml e o estado da sessão; só grava a marca "lembrete dado"/"insistiu" no estado
// da sessão (os.tmpdir()/intoca-hooks/<sessão>.json, o mesmo do prompt-os). Sem rede.
// INTOCA_SEM_AVISO_TROCADO=1 desliga. Nunca derruba o chat: erro interno termina em exit 0 sem saída.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  ESTADO, lerEntrada, montarContexto, sessaoValida, arquivoDeEstado, variavelLigada, contem, donoDaWorktree, cargoDoTitulo,
  textoDoProprietario, projetosDaSigla, forma, projetoNaWorktreeDaSede,
} from './lib.mjs';

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));

const LIMITE_DO_PROMPT = 200000;
const LETRAS = '\\p{L}\\p{N}_';

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// Nome vindo do manifesto vai para o texto do aviso: sem crase, quebra de linha nem caractere de controle.
const limpo = (s) => String(s ?? '').replace(/[`\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

// ------------------------------------------------------------ o que o prompt cita

// Termo como palavra inteira. `rotulo`: pedaço solto de um domínio ("banco" de banco.exemplo.br), que não
// pode vir de outro domínio nem ser seguido de ".algo". Sigla: caixa exata; pode ser seguida de
// "-<número>" (ID de OS), nunca de "-letra".
function achaPalavra(prompt, termo, { sensivel = false, rotulo = false, sigla = false } = {}) {
  const corpo = termo.trim().split(/\s+/).map(escapar).join('\\s+');
  const antes = rotulo || sigla ? `(?<![${LETRAS}.\\-])` : `(?<![${LETRAS}\\-])`;
  let depois = `(?![${LETRAS}\\-])`;
  if (rotulo) depois = `(?![${LETRAS}\\-]|\\.[\\p{L}\\p{N}])`;
  if (sigla) depois = `(?![${LETRAS}]|-\\D|\\.[\\p{L}\\p{N}])`;
  const re = new RegExp(`${antes}${corpo}${depois}`, `gu${sensivel ? '' : 'i'}`);
  const achados = [];
  for (const m of prompt.matchAll(re)) achados.push({ indice: m.index, texto: m[0] });
  return achados;
}

// "localhost" e nomes sem ponto parecidos não valem em endereço de rede (localhost:3000, //localhost).
function emEndereco(prompt, achado) {
  const antes = prompt.slice(Math.max(0, achado.indice - 2), achado.indice);
  const depois = prompt.slice(achado.indice + achado.texto.length, achado.indice + achado.texto.length + 2);
  return antes === '//' || /^:\d/.test(depois);
}

// Projetos do manifesto citados, na ordem em que aparecem: [{ nome, vias: Set, indice }]. `vias`:
// nome, sigla, os (ID de OS, "AB-05"), caminho, governanca (caminho em ops/os, ops/relatorios...).
const NOMES_COMUNS = new Set(['localhost']);
const GOVERNANCA = new Set(['os', 'relatorios', 'autorizacoes', 'decisoes', 'modelos', 'fila.md', 'historico.md', 'passagem.md', 'backlog.md']);

function citacoes(prompt, ctx) {
  const achados = new Map(); // nome do projeto → { nome, vias, indice (o primeiro) }
  const registrar = (nome, via, indice) => {
    const atual = achados.get(nome);
    if (!atual) achados.set(nome, { nome, vias: new Set([via]), indice });
    else { atual.vias.add(via); if (indice < atual.indice) atual.indice = indice; }
  };
  for (const p of ctx.manifesto.projetos) {
    const nome = limpo(p.nome);
    if (!nome || nome === '_') continue;
    const dominio = nome.includes('.');
    // Nome que também é palavra de uso geral ("localhost") só vale por sigla ou por caminho de pasta.
    if (!NOMES_COMUNS.has(nome.toLowerCase())) {
      for (const a of achaPalavra(prompt, nome)) {
        if (!dominio && emEndereco(prompt, a)) continue;
        registrar(nome, 'nome', a.indice);
      }
    }
    if (dominio) {
      // Apelido do domínio ("Banco" de banco.exemplo.br): só com inicial maiúscula (ou tudo em maiúsculas),
      // para não casar o verbo "banco" nem "um banco de arquivos".
      const rotulo = nome.split('.')[0];
      if (rotulo.length >= 5) {
        const formas = [rotulo.charAt(0).toUpperCase() + rotulo.slice(1), rotulo.toUpperCase()];
        for (const forma of formas) {
          for (const a of achaPalavra(prompt, forma, { rotulo: true, sensivel: true })) registrar(nome, 'nome', a.indice);
        }
      }
    }
    const siglas = [p.sigla, ...(Array.isArray(p.siglas_antigas) ? p.siglas_antigas : [])]
      .filter((x) => typeof x === 'string' && /^[A-Z][A-Z0-9]{1,7}$/.test(x));
    for (const sigla of siglas) {
      for (const a of achaPalavra(prompt, sigla, { sensivel: true, sigla: true })) {
        const seguinte = prompt.slice(a.indice + a.texto.length, a.indice + a.texto.length + 2);
        registrar(nome, /^-\d/.test(seguinte) ? 'os' : 'sigla', a.indice);
      }
    }
  }
  // Caminhos de pasta (inclusive pastas_antigas): vale a pasta mais específica que contém o caminho.
  const pastas = [];
  for (const p of ctx.projetos) {
    for (const f of [...p.pastas, ...p.antigas]) pastas.push({ nome: limpo(p.nome), lex: f.lex });
  }
  const re = /(?<![\w.:/\\-])(?:[A-Za-z]:[\\/]|\/)[^\s"'`<>|*?]+/g;
  let n = 0;
  for (const m of prompt.matchAll(re)) {
    if (n >= 40) break;
    n += 1;
    const token = m[0].replace(/[.,;:)\]}!?]+$/, '');
    if (!isAbsolute(token)) continue;
    if (process.platform === 'win32' && !/^[A-Za-z]:/.test(token)) continue;
    const caminho = resolve(token);
    let dono = null;
    let pasta = null;
    // Caminho dentro de uma worktree da sede com o projeto em subpasta (PLG-24): vale o projeto da subpasta. Sem dono
    // único é dúvida: não cita ninguém.
    const w = projetoNaWorktreeDaSede(ctx, forma(caminho));
    if (w) {
      if (w.ambiguo) continue;
      dono = limpo(w.projeto.nome);
      pasta = w.pasta;
    }
    for (const f of w ? [] : pastas) {
      if (contem(f.lex, caminho, true) && (!pasta || f.lex.length > pasta.length)) { dono = f.nome; pasta = f.lex; }
    }
    if (!dono && contem(ctx.worktrees.lex, caminho)) {
      const d = donoDaWorktree(ctx, relative(ctx.worktrees.lex, caminho).split(/[\\/]+/)[0]);
      if (d && d.tipo === 'projeto') dono = limpo(d.projeto.nome);
    }
    if (!dono) continue;
    const dentro = pasta ? relative(pasta, caminho).split(/[\\/]+/).map((x) => x.toLowerCase()) : [];
    registrar(dono, dentro[0] === 'ops' && GOVERNANCA.has(dentro[1]) ? 'governanca' : 'caminho', m.index);
  }
  return [...achados.values()].sort((a, b) => a.indice - b.indice);
}

// ------------------------------------------------------------ exceções da regra 14

// Insistência do proprietário. As frases com "aqui" valem em qualquer momento ("faz aqui mesmo").
// "mesmo assim" e a resposta curta que é só "pode seguir." / "segue" só valem depois de um aviso desta
// sessão (senão "vai" é o "vai" da triagem). "pode fazer" sozinho é pedido comum, nunca insistência.
const INSISTENCIA = [
  /\bfa(?:z|ca|zer)\s+aqui\b/,
  /\baqui\s+mesmo\b/,
  /\bpode\s+(?:seguir|fazer|ir|executar|continuar|mexer)\s+(?:isso\s+)?aqui\b/,
  /\b(?:segue|siga|seguir|executa|execute|vai|va)\s+aqui\b/,
];
const APOS_AVISO = /\bmesmo\s+assim\b/;
const PEDIDO_DE_CODIGO = /\b(?:altere|alterar|corrija|corrigir|ajuste|ajustar|troque|trocar|edite|editar|implemente|implementar|publique|publicar|refatore|refatorar|conserte|consertar|mude|mudar|suba|subir|deploy)\b/;
const RESPOSTA_CURTA = /^(?:ok[\s,.!]*)?(?:pode\s+)?(?:seguir|segue|siga|fazer|faz|faca|vai|va|executa|execute)(?:\s+(?:assim|mesmo|ai|isso|ja))?[\s.!]*$/;
const TOPO = 160; // consulta e conversa sobre o próprio trabalho valem pelo começo do prompt
const CONSULTA = new RegExp(`\\b(?:status|situacao|o que e|o que sao|o que significa|qual e|quais sao|qual a|quais|`
  + 'compar\\w+|explic\\w+|list[ae]\\w*|resum\\w+|mostr\\w+|me diga|me fale|como esta|como estao|quem e|onde fica|onde esta)\\b');
const PEDIDO_EDUCADO = /^(?:pode|poderia|consegue|conseguiria|voce pode|vc pode|da pra|daria pra|seria possivel|sera que)\b/;
const PROPRIO_TRABALHO = /\b(?:pare|parar|pausa|pausar|continue|continuar|retome|retomar|reordene|reordenar|cancele|cancelar)\b/;

function consulta(norm) {
  if (CONSULTA.test(norm.slice(0, TOPO))) return true;
  const t = norm.trim();
  return t.length <= 400 && t.endsWith('?') && !PEDIDO_EDUCADO.test(t);
}

// O cargo vem do título do próprio chat (`cargoDoTitulo`, em lib.mjs), nunca do texto de uma mensagem (PLG-25).

// ------------------------------------------------------------ estado da sessão

function lerEstado(sessao) {
  if (!sessaoValida(sessao)) return null;
  try {
    const dado = JSON.parse(readFileSync(arquivoDeEstado(sessao), 'utf8'));
    return dado && typeof dado === 'object' && !Array.isArray(dado) ? dado : {};
  } catch {
    return {};
  }
}

// Marca no estado da sessão (lê de novo, mescla e grava); falha de gravação é ignorada.
function marcar(sessao, mudancas) {
  if (!sessaoValida(sessao)) return;
  try {
    mkdirSync(ESTADO, { recursive: true });
    const atual = lerEstado(sessao) ?? {};
    const aviso = { ...(atual.avisoTrocado && typeof atual.avisoTrocado === 'object' ? atual.avisoTrocado : {}), ...mudancas };
    writeFileSync(arquivoDeEstado(sessao), JSON.stringify({ ...atual, avisoTrocado: aviso }));
  } catch { /* sem estado: o aviso ainda sai, só pode repetir */ }
}

// ------------------------------------------------------------ texto

function lista(nomes) {
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes[0]}, ${nomes[1]} e outros`;
}

function aviso({ chat, cargo, citados }) {
  const nomes = citados.map((c) => c.nome).slice(0, 3);
  const X = lista(nomes);
  const um = citados.length === 1;
  const gerente = um ? `Gerente · ${nomes[0]}` : `gerentes de ${X}`;
  const fila = um ? `à fila de ${gerente}` : `às filas dos ${gerente}`;
  const filaNa = um ? `na fila de ${gerente}` : `nas filas dos ${gerente}`;
  const filaPara = um ? `para a fila de ${gerente}` : `para as filas dos ${gerente}`;
  const paraX = um ? `Se for para ${X}` : `Se for para eles`;
  let quem;
  let caminho;
  if (chat.tipo === 'sede') {
    if (cargo?.cargo === 'Diretoria') {
      quem = 'a Diretoria';
      caminho = `${paraX} (código ou conteúdo de projeto), vale registrar ${filaNa} em vez de executar aqui; se for mesmo daqui, siga.`;
    } else if (cargo?.cargo === 'Secretaria') {
      quem = 'a Secretaria';
      caminho = `${paraX} (código ou conteúdo de projeto), ele vai ${fila}; se for pendência do proprietário, siga.`;
    } else if (cargo?.cargo === 'Executor') {
      quem = `Executor · ${cargo.os} (sede)`;
      caminho = `${paraX}, é outra OS: devolva à Diretoria, que registra ${filaNa}; se for mesmo daqui, siga.`;
    } else {
      quem = 'a sede';
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`;
    }
  } else {
    const proj = limpo(chat.projeto.nome);
    if (cargo?.cargo === 'Executor') {
      quem = `Executor · ${cargo.os} (projeto ${proj})`;
      caminho = `${paraX}, é outra OS: devolva ao gerente de ${proj}, que sobe à Diretoria ${filaPara}; se for mesmo daqui, siga.`;
    } else if (cargo?.cargo === 'Gerente') {
      quem = `Gerente · ${proj}`;
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`;
    } else if (cargo?.cargo === 'Plantão') {
      quem = `Plantão (projeto ${proj})`;
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`;
    } else {
      quem = proj;
      caminho = `${paraX}, vale encaminhar ${fila} pela Diretoria antes de agir; se for mesmo daqui, siga.`;
    }
  }
  return `Aviso InToca: o pedido cita ${X}, e este chat é ${quem}. ${caminho}`;
}

function lembrete(os, recurso) {
  const rec = limpo(recurso).slice(0, 100);
  return `Aviso InToca: este chat cumpre a OS ${os}${rec && rec !== 'não informado' ? ` (recurso: ${rec})` : ''}; `
    + 'pedido novo fora dela é outra OS (regra 15): registre na fila do gerente em vez de fazer aqui.';
}

function responder(texto) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: texto },
  }));
}

// ------------------------------------------------------------ principal

function main() {
  if (variavelLigada('INTOCA_SEM_AVISO_TROCADO')) return;
  const entrada = lerEntrada();
  if (!entrada || typeof entrada.prompt !== 'string') return;
  if (entrada.hook_event_name && entrada.hook_event_name !== 'UserPromptSubmit') return;
  if (!entrada.prompt.trim() || entrada.prompt.length > LIMITE_DO_PROMPT) return;
  // Mensagem entre chats, notificação do sistema, texto colado, bloco de código e citação não são pedido do
  // proprietário: o que está só ali nunca avisa nem conta como insistência (PLG-25).
  const prompt = textoDoProprietario(entrada.prompt);
  if (!prompt) return;

  const ctx = montarContexto(entrada);
  if (!ctx || !ctx.chat) return; // sem sede, manifesto ilegível ou cwd fora de tudo: mudo

  const sessao = String(entrada.session_id || '');
  const estado = lerEstado(sessao);
  if (estado?.avisoTrocado?.insistiu === true) return; // o proprietário já insistiu nesta sessão

  const norm = semAcento(prompt);
  // "faz aqui mesmo" vale sempre; "mesmo assim" e a resposta curta ("pode seguir.") só depois de um aviso
  // desta sessão: sem aviso, "vai" é o "vai" da triagem e "pode seguir" é pedido comum.
  const jaAvisou = estado?.avisoTrocado?.avisou === true;
  if (INSISTENCIA.some((re) => re.test(norm)) || (jaAvisou && (APOS_AVISO.test(norm) || RESPOSTA_CURTA.test(norm.trim())))) {
    marcar(sessao, { insistiu: true });
    return;
  }
  if (consulta(norm) || PROPRIO_TRABALHO.test(norm.slice(0, TOPO))) return;

  let cargo = cargoDoTitulo(entrada.session_title, ctx.manifesto.titulos);
  if (cargo) {
    const daSede = cargo.cargo === 'Diretoria' || cargo.cargo === 'Secretaria';
    const deProjeto = cargo.cargo === 'Gerente' || cargo.cargo === 'Plantão';
    // Título e pasta se contradizem: não decide por ele (o Executor vale nos dois).
    if ((daSede && ctx.chat.tipo !== 'sede') || (deProjeto && ctx.chat.tipo !== 'projeto')) cargo = null;
  }

  // Executor: a OS do estado da sessão, ou o título. Título que diz outro cargo (Gerente, Diretoria...)
  // vale mais que um estado que um caminho de OS citado de passagem pode ter criado.
  const osEstado = estado && typeof estado.os === 'string' && estado.os ? estado : null;
  const outroCargo = cargo !== null && cargo.cargo !== 'Executor';
  let executor = null;
  if (!outroCargo) executor = osEstado ? { os: osEstado.os, recurso: osEstado.recurso } : cargo?.cargo === 'Executor' ? { os: cargo.os } : null;

  // Executor numa worktree do repositório da sede parece "a sede" pelo caminho; o ID da OS (PLG-02)
  // diz de que projeto ele é: a sigla é o prefixo.
  let chat = ctx.chat;
  if (chat.tipo === 'sede' && executor) {
    const dono = projetosDaSigla(ctx.projetos, executor.os)[0];
    if (dono) chat = { tipo: 'projeto', projeto: { nome: dono.nome } };
  }

  const proprio = chat.tipo === 'projeto' ? limpo(chat.projeto.nome) : null;
  let citados = citacoes(prompt, ctx).filter((c) => c.nome !== proprio);
  // Na sede, o ID de OS de um projeto ("PLG-02") e o caminho da governança dele (ops/os, ops/relatorios...)
  // são vocabulário de governança, não pedido de trabalho: só valem se algo mais cita o projeto.
  if (chat.tipo === 'sede') citados = citados.filter((c) => [...c.vias].some((v) => v !== 'os' && v !== 'governanca'));
  // Diretoria e Secretaria (título conhecido) recebem qualquer assunto, salvo código ou conteúdo de projeto
  // (regra 14): só avisam quando o pedido traz verbo de mexer no projeto e cita o projeto por nome, sigla ou
  // caminho de pasta. Citar a pasta sozinha ("registre que a pasta X mudou de lugar") é conversa de portfólio (PLG-22).
  if (cargo && (cargo.cargo === 'Diretoria' || cargo.cargo === 'Secretaria')) {
    const pedeCodigo = PEDIDO_DE_CODIGO.test(norm.slice(0, TOPO));
    citados = citados.filter((c) => pedeCodigo && (c.vias.has('caminho') || c.vias.has('nome') || c.vias.has('sigla')));
  }

  const jaLembrou = (osId) => estado?.avisoTrocado?.lembrete === osId;
  if (citados.length) {
    // O aviso do executor já cobre a regra 15: conta como o lembrete dado.
    marcar(sessao, { avisou: true, ...(executor && !jaLembrou(executor.os) ? { lembrete: executor.os } : {}) });
    const c = executor && !cargo ? { cargo: 'Executor', os: executor.os } : cargo;
    responder(aviso({ chat, cargo: c, citados }));
    return;
  }
  // Prompt que é a própria ordem de executar uma OS: o prompt-os cuida; o lembrete fica para depois.
  if (/(?:^|[\s"'`@(\\/])os[\\/][^\s"'`]+\.md/i.test(prompt)) return;
  if (executor && !jaLembrou(executor.os)) {
    marcar(sessao, { avisou: true, lembrete: executor.os });
    responder(lembrete(executor.os, executor.recurso));
  }
}

try { main(); } catch { /* hook nunca derruba o chat */ }
