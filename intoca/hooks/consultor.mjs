// Consultor e Vigia do plugin intoca (PLG-31). Não é um hook: o chat-trocado.mjs o importa, no mesmo processo
// (nenhum processo novo por prompt). Sem rede, sem modelo: só regras simples sobre o prompt e o manifesto.
//
// O Vigia é a voz de segurança: avisa quando o prompt parece trazer uma senha, um token ou uma chave. Fica sempre
// ligado (o modo do consultor não o cala), avisa a cada prompt em que casar e nunca repete o valor.
// O Consultor dá UMA dica curta por sessão, no nível da pessoa (`sede.perfil`), e cada dica uma vez só: guarda o
// identificador da dica e a data em `<pasta do usuário>/.intoca/consultor.json` (INTOCA_HOME desloca, como o ponteiro
// da sede). Nunca guarda o prompt, um pedaço dele ou o valor que casou. Quando não consegue gravar, não dá dica.
// Mudo (os dois) em: sessão sem sede, sub-agente, chat de Executor ou de Plantão e prompt que é só um comando de barra.
// Com `sede.consultor: sob_demanda` (ou campo ausente, ou ilegível) só o Vigia fala.
//
// Dica nova é só uma linha nova em DICAS (id, quem, gatilho, textos por perfil); o teste percorre a tabela.
import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastaDoUsuario, cargoDoTitulo, textoDoProprietario, tirarEnvelopes, citaArquivoDeOs } from './lib.mjs';

export const FRASE_FIXA = 'Nunca digite senha, token ou chave no chat. O valor vai no arquivo `.env`, que só você abre; a IA só fala do nome.';
export const PERFIS = Object.freeze(['iniciante', 'ocasional', 'desenvolvedor']);
export const MODOS = Object.freeze(['ativo', 'sob_demanda']);
const PERFIL_PADRAO = 'ocasional';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = (nome) => join(PLUGIN, 'docs', nome).split('\\').join('/');

const norm = (v) => (typeof v === 'string' ? v.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase().replace(/[\s-]+/g, '_') : null);
const semAcento = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
// Texto vindo do manifesto vai para a dica sem crase, quebra de linha nem caractere de controle.
const limpo = (s) => String(s ?? '').replace(/[`\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

// Modo do consultor: `ativo` só quando o manifesto diz exatamente isso; ausente, ilegível ou outro valor: sob_demanda.
export function modoDoConsultor(manifesto) {
  return norm(manifesto?.consultor) === 'ativo' ? 'ativo' : 'sob_demanda';
}
// Nível da pessoa: o `perfil` da sede; ausente ou fora da lista vale o do meio.
export function perfilDaPessoa(manifesto) {
  const p = norm(manifesto?.perfil);
  return PERFIS.includes(p) ? p : PERFIL_PADRAO;
}

// ------------------------------------------------------------ o texto que o Vigia lê

// Envelopes que não são o que a pessoa digitou nem colou (mensagem de outro chat, notificação do sistema, saída de
// comando): ficam fora. Texto colado e bloco de código ficam dentro: o que a pessoa colou também foi para a conversa.
const ENVELOPES_DE_FORA = ['cross-session-message', 'system-reminder', 'task-notification', 'side-sessions-event', 'ci-monitor-event',
  'local-command-stdout', 'local-command-caveat', 'user-prompt-submit-hook'];
export function textoParaOVigia(prompt) {
  return tirarEnvelopes(String(prompt ?? ''), ENVELOPES_DE_FORA); // linear: ver tirarEnvelopes no lib
}

// ------------------------------------------------------------ Vigia: segredo no prompt

// Tudo aqui é linear no tamanho do prompt (até 200 mil caracteres): só quantificadores limitados ou corridas que não
// recomeçam, e o que precisa olhar para os lados (nome de variável, URL) é feito à mão, com limite de passos.

// Valor que é marcador, não segredo. Só vale o valor INTEIRO: <seu-token>, ${VAR}, %VAR%, só x, só *, ..., começo seu-/sua-/your,
// ou uma palavra de exemplo. `$Tr0ub4dor` e `%Abc1234` não são marcador: o começo não basta.
function ehMarcador(valor) {
  const v = valor.toLowerCase();
  return /^<[^<>]*>$/.test(v) || /^\$\{[^{}]*\}$/.test(v) || /^%[a-z0-9_]+%$/.test(v) || /^x+$/.test(v) || /^\*+$/.test(v)
    || /^(?:\.{3,}|…+|•+)$/.test(v) || /^(?:seu|sua|your)(?:[-_]|$)/.test(v) || /exemplo|example|placeholder|changeme/.test(v);
}
// Valor com cara de segredo: 6 ou mais caracteres, não é marcador e tem dígito ou símbolo. Símbolo é o que não é letra, dígito,
// `_`, `-`, `/` ou `.`: "Laranja2024" e "Tr0ub4dor&3" sim; "obrigatória", "id_usuario", "meu-token-aqui" e "banana" não.
function valorDeSegredo(valor) {
  return valor.length >= 6 && !ehMarcador(valor) && (/\d/.test(valor) || /[^\p{L}\p{N}_\-/.]/u.test(valor));
}

// Prefixos conhecidos de chave. O corpo depois do prefixo tem de 12 a 400 caracteres de chave e pelo menos um dígito
// (`ghp_EXEMPLO`, `sk-...` e `sk-learn` não casam). Antes do prefixo, nada que o cole a outra palavra (`task-`).
const PREFIXO_DE_CHAVE = /(?<![A-Za-z0-9_-])(?:sk_live_|sk_test_|rk_live_|sk-|ghp_|gho_|ghs_|github_pat_|AKIA|xoxb-|xoxp-|AIza)([A-Za-z0-9_-]{12,400})/g;
const BEARER = /(?<![A-Za-z0-9_])Bearer\s{1,4}([A-Za-z0-9._~+/-]{12,400}=*)/g;
const JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,2000}\.[A-Za-z0-9_-]{5,2000}\.[A-Za-z0-9_-]{5,2000}/;
const CHAVE_PRIVADA = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/;
// Palavra de segredo, solta ("a senha é") ou dentro de um nome de variável (DB_PASSWORD, JWT_SECRET, API_TOKEN, apiKey).
const PALAVRA = /senha|passwd|password|pwd|token|secret|segredo|credential|credencial|api[_-]?key|private[_-]?key|chave(?: de api)?/giu;
// Depois da palavra (e do nome da variável): fecho de aspas ou de negrito, até 3 palavras, o conector (`:`, `=`, "é") e o valor.
const DEPOIS = /["'`*]{0,4}(?:\s{1,4}[\p{L}\p{N}]{1,40}){0,3}?(?:\s{0,4}[:=]|\s{1,4}(?:é|eh)\s)[\s*"'`]{0,8}([^\s"'`*,;]{1,200})/uy;
// Pontuação de fim de frase e fecho de parêntese sem abertura não são do valor: "(a senha: abc123)." vale "abc123".
function limparValor(valor) {
  let v = valor.replace(/[.!?:]+$/, '');
  const par = { ')': '(', ']': '[', '}': '{' };
  while (v && par[v.at(-1)] && !v.includes(par[v.at(-1)])) v = v.slice(0, -1).replace(/[.!?:]+$/, '');
  return v;
}
const NOME = /[A-Za-z0-9_]/;
const NOME_MAX = 64; // nome de variável mais longo que isso não é nome: a palavra fica de fora (e a varredura segue linear)

// A palavra na posição [i, f) vale? Solta (sem letra colada) ou parte de um nome de variável (DB_PASSWORD, apiKey). Devolve o
// fim do nome (onde o conector começa) ou -1.
function fimDoNome(texto, i, f) {
  const antes = texto[i - 1] ?? '';
  const camelo = /[a-z0-9]/.test(antes) && /[A-Z]/.test(texto[i]); // dbPassword, apiKey
  if (antes && /[\p{L}\p{N}]/u.test(antes) && !camelo) return -1;
  if (antes === '_' || camelo) { // dentro de um nome: o começo dele não pode estar longe demais
    let k = i - 1;
    let passos = 0;
    while (k >= 0 && NOME.test(texto[k])) { k -= 1; passos += 1; if (passos > NOME_MAX) return -1; }
  }
  let j = f;
  let passos = 0;
  if (NOME.test(texto[j] ?? '')) { // continua o nome (DB_PASSWORD_HASH); letra colada sem `_` (tokens, senhas) não vale
    if (texto[j] !== '_' && !/[A-Z0-9]/.test(texto[j])) return -1;
    while (j < texto.length && NOME.test(texto[j])) { j += 1; passos += 1; if (passos > NOME_MAX) return -1; }
  }
  return j;
}

// URL com senha: esquema://usuario:senha@host. Feito com indexOf e passos limitados.
function urlComSenha(texto) {
  let de = 0;
  for (let n = 0; n < 2000; n += 1) {
    const k = texto.indexOf('://', de);
    if (k < 0) return false;
    de = k + 3;
    let fim = de;
    while (fim < texto.length && fim - de < 512 && !/[\s/@]/.test(texto[fim])) fim += 1;
    if (texto[fim] !== '@') continue;
    const credencial = texto.slice(de, fim);
    const dois = credencial.indexOf(':');
    if (dois > 0 && valorDeSegredo(credencial.slice(dois + 1))) return true;
  }
  return false;
}

// O prompt parece conter um segredo? Só true/false: o valor nunca sai desta função.
export function pareceSegredo(bruto) {
  if (typeof bruto !== 'string' || bruto === '') return false;
  const texto = bruto.normalize('NFC');
  if (CHAVE_PRIVADA.test(texto) || JWT.test(texto)) return true;
  for (const m of texto.matchAll(PREFIXO_DE_CHAVE)) if (/\d/.test(m[1]) && !ehMarcador(m[1])) return true;
  for (const m of texto.matchAll(BEARER)) if (/\d/.test(m[1]) && !ehMarcador(m[1])) return true;
  if (urlComSenha(texto)) return true;
  for (const m of texto.matchAll(PALAVRA)) {
    const fim = fimDoNome(texto, m.index, m.index + m[0].length);
    if (fim < 0) continue;
    DEPOIS.lastIndex = fim;
    const d = DEPOIS.exec(texto);
    if (d && valorDeSegredo(limparValor(d[1]))) return true;
  }
  return false;
}

const VIGIA = {
  iniciante: 'Vigia: a mensagem parece trazer uma senha, um token ou uma chave. ' + FRASE_FIXA
    + ' Troque essa senha, porque ela já foi para a conversa. Como guardar: ' + doc('politica-de-segredos.md') + '.',
  ocasional: 'Vigia: parece haver um segredo na mensagem. ' + FRASE_FIXA + ' Troque essa senha, porque ela já foi para a conversa ('
    + doc('politica-de-segredos.md') + ').',
  desenvolvedor: 'Vigia: possível credencial no prompt. ' + FRASE_FIXA + ' Troque essa senha, porque ela já foi para a conversa; rotacione e use o `.env` ('
    + doc('politica-de-segredos.md') + ').',
};
const INSTRUCAO_DO_VIGIA = ' (Avise a pessoa disso no começo da resposta. Não repita, não copie e não use o valor.)';

// ------------------------------------------------------------ Consultor: catálogo de dicas

const TOPO = 200; // pedido de mudança vale pelo começo do prompt
const PEDE_MUDANCA = /\b(?:altere|alterar|corrija|corrigir|ajuste|ajustar|troque|trocar|edite|editar|implemente|implementar|refatore|refatorar|conserte|consertar|mude|mudar|crie|criar|apague|apagar|remova|remover|adicione|adicionar|acrescente|acrescentar|inclua|incluir|escreva|escrever)\b/;
const PERGUNTA_DE_TERMO = /\bo\s+que\s+(?:e|sao|significa|significam|quer\s+dizer)\s+(?:(?:um|uma|o|a|os|as)\s+)?(ordem\s+de\s+servico|[\p{L}]+)/giu;
// Termo → { nome para a frase, definição, argumento do /intoca:memorando }. Definições tiradas do memorando neutro.
const TERMOS = {
  os: { nome: 'OS (ordem de serviço)', def: 'o arquivo que contrata um executor para uma tarefa: contexto, recurso, decisões, entregas e critério de pronto', arg: 'OS' },
  toca: { nome: 'Toca', def: 'o apelido de projeto: um site, app, documento ou operação, com pasta e gerente próprios', arg: 'toca' },
  executor: { nome: 'Executor', def: 'o profissional por tarefa: cumpre uma OS num recurso, grava o relatório e é arquivado', arg: 'cargos' },
  plantao: { nome: 'Plantão', def: 'o chat da função recorrente que publica (produção), só com autorização em arquivo', arg: 'cargos' },
  rigor: { nome: 'rigor', def: 'quanto o plugin pergunta antes de deixar o Claude agir: cauteloso ou equilibrado', arg: 'regras' },
  recurso: { nome: 'recurso', def: 'o que só aceita um editor por vez, como uma sala: pasta, cópia de trabalho, produção, conta de rede', arg: 'recurso' },
  fila: { nome: 'fila', def: 'o quadro de tarefas: quem está usando cada recurso e o que está pendente', arg: 'fila' },
  relatorio: { nome: 'relatório', def: 'o arquivo que o executor grava ao terminar, para quem o contratou', arg: 'relatorio' },
  memorando: { nome: 'Memorando de Integração', def: 'a leitura de chegada que explica a sede em linguagem de escritório', arg: '' },
  vigia: { nome: 'Vigia', def: 'o assistente de segurança do plugin: avisa quando uma senha aparece no chat e confere segredos de um projeto, só lendo', arg: 'termos' },
  consultor: { nome: 'Consultor', def: 'quem dá dicas curtas sobre o plugin no seu nível e avalia pedidos de recurso novo (/intoca:consultor)', arg: 'termos' },
};
const PLURAIS = { oss: 'os', tocas: 'toca', executores: 'executor', plantoes: 'plantao', recursos: 'recurso', filas: 'fila', relatorios: 'relatorio', memorandos: 'memorando', vigias: 'vigia', consultores: 'consultor' };

// Termos que também são palavras comuns ("fila indiana", "recurso em React"): só valem com o contexto do plugin na pergunta.
const AMBIGUOS = new Set(['relatorio', 'recurso', 'fila', 'rigor', 'plantao']);
const CONTEXTO_DO_PLUGIN = /\b(?:plugin|intoca|sede|aqui)\b/i;

// Termo do vocabulário perguntado ("o que é uma OS?"). "OS" só em maiúsculas: "o que é os" não é pergunta de termo.
function termoPerguntado(prompt) {
  const t = semAcento(prompt);
  const comContexto = CONTEXTO_DO_PLUGIN.test(t);
  for (const m of t.matchAll(PERGUNTA_DE_TERMO)) {
    const bruto = m[1].replace(/\s+/g, ' ');
    if (/^ordem de servico$/i.test(bruto)) return 'os';
    if (bruto === 'OS' || bruto === 'OSs') return 'os';
    const chave = bruto.toLowerCase();
    if (chave === 'os' || chave === 'oss') continue;
    const k = PLURAIS[chave] ?? chave;
    if (Object.hasOwn(TERMOS, k) && (comContexto || !AMBIGUOS.has(k))) return k;
  }
  return null;
}

const PENDENCIA_MINHA = /\b(?:o que (?:falta|ainda falta) (?:eu )?fazer|o que (?:esta|ta) pendente comigo|o que (?:esta|ta) comigo|esqueci de|preciso lembrar)\b/;
const RECLAMA_DE_PERMISSAO = /\b(?:toda hora (?:ele |o claude |isso )?(?:pede|pergunta)|pede (?:confirmacao|permissao|autorizacao) demais|pergunta demais|nao para de (?:perguntar|pedir)|(?:pede|pergunta) (?:toda|cada) (?:hora|vez))\b/;
const CITA_ENV = /(?:^|[^\w.])\.env\b|\bcredencia(?:l|is)\b|\bchaves? de api\b|\bapi[\s_-]?keys?\b/;

// Cada dica: id, quem fala, gatilho(c) → dados para o texto (ou null), textos por perfil (função dos dados).
export const DICAS = Object.freeze([
  {
    id: 'site-sem-git',
    gatilho: (c) => {
      const item = c.projeto?.item;
      if (!item || !['site', 'app', 'servico'].includes(norm(item.tipo)) || !Object.hasOwn(item, 'repositorio') || item.repositorio !== null) return null;
      const pasta = c.projeto.atual?.lex;
      if (!pasta) return null;
      try { statSync(join(pasta, '.git')); return null; } catch { /* sem .git: dica */ }
      return { nome: limpo(item.nome) };
    },
    textos: {
      iniciante: (d) => `o projeto ${d.nome} ainda não usa o Git, o programa que guarda cada versão dos arquivos para você poder voltar atrás. `
        + `O guia ${doc('git-e-github.md')} explica em linguagem simples, e o /intoca:comecar liga o Git com o seu "sim".`,
      ocasional: (d) => `o projeto ${d.nome} está sem Git (sem histórico de versões). Guia: ${doc('git-e-github.md')}; o /intoca:comecar oferece ligar.`,
      desenvolvedor: (d) => `${d.nome} sem repositório Git (repositorio: null, sem .git). Ver ${doc('git-e-github.md')} ou /intoca:comecar.`,
    },
  },
  {
    id: 'env-sem-valor',
    gatilho: (c) => (!c.vigiaCasou && CITA_ENV.test(c.minusculo) ? {} : null),
    textos: {
      iniciante: () => `${FRASE_FIXA} O arquivo .env é a ficha com as senhas do projeto, guardada só na sua máquina. Como fazer: ${doc('politica-de-segredos.md')}.`,
      ocasional: () => `${FRASE_FIXA} Como o plugin trata o .env: ${doc('politica-de-segredos.md')}.`,
      desenvolvedor: () => `${FRASE_FIXA} O plugin nega leitura e escrita do .env e entrega só o .env.example (${doc('politica-de-segredos.md')}).`,
    },
  },
  {
    id: 'termo-do-plugin',
    gatilho: (c) => {
      const k = termoPerguntado(c.prompt);
      return k ? { ...TERMOS[k], k } : null;
    },
    textos: {
      iniciante: (d) => `${d.nome} é ${d.def}. Para ler com calma, em linguagem de escritório, digite /intoca:memorando${d.arg ? ` ${d.arg}` : ''}.`,
      ocasional: (d) => `${d.nome}: ${d.def}. Mais em /intoca:memorando${d.arg ? ` ${d.arg}` : ''}.`,
      desenvolvedor: (d) => `${d.nome} = ${d.def} (/intoca:memorando${d.arg ? ` ${d.arg}` : ''}).`,
    },
  },
  {
    id: 'secretaria',
    gatilho: (c) => {
      if (!PENDENCIA_MINHA.test(c.minusculo) || c.cargo?.cargo === 'Secretaria' || !c.sede) return null;
      try { return statSync(join(c.sede, 'diretoria', 'pendencias-do-proprietario.md')).isFile() ? {} : null; } catch { return null; }
    },
    textos: {
      iniciante: () => 'a Secretaria é o chat que guarda a lista do que só você faz (aprovar, abrir chats, subir arquivos) e lembra cada item. '
        + 'Abra um chat novo na pasta da sede com o título "Secretaria" e digite /intoca:secretaria.',
      ocasional: () => 'a lista do que só você faz fica com a Secretaria: abra um chat "Secretaria" na pasta da sede e digite /intoca:secretaria.',
      desenvolvedor: () => 'pendências do proprietário: chat "Secretaria" na raiz da sede, /intoca:secretaria (lê diretoria/pendencias-do-proprietario.md).',
    },
  },
  {
    id: 'projeto-sem-gerente',
    gatilho: (c) => {
      const item = c.projeto?.item;
      if (!item || norm(item.status) !== 'ativo' || c.avisouTrocado) return null;
      if (c.cargo && ['Gerente', 'Diretoria', 'Secretaria'].includes(c.cargo.cargo)) return null;
      if (!PEDE_MUDANCA.test(c.minusculo.slice(0, TOPO))) return null;
      const gerente = limpo(item.gerente);
      return { nome: limpo(item.nome), gerente: gerente || `Gerente · ${limpo(item.nome)}` };
    },
    textos: {
      iniciante: (d) => `o projeto ${d.nome} tem um gerente (${d.gerente}). Ele anota os pedidos, cuida da fila e chama quem executa, para nada se perder `
        + 'nem dois chats mexerem no mesmo arquivo. Para pedidos de mudança, use o chat dele.',
      ocasional: (d) => `pedidos de mudança em ${d.nome} passam pelo gerente (${d.gerente}), que organiza a fila e contrata o executor.`,
      desenvolvedor: (d) => `${d.nome} tem gerente (${d.gerente}): mudanças por triagem e OS na fila dele, um editor por recurso.`,
    },
  },
  {
    id: 'rigor',
    gatilho: (c) => (RECLAMA_DE_PERMISSAO.test(c.minusculo) ? {} : null),
    textos: {
      iniciante: () => 'dá para escolher quanto o plugin pergunta antes de deixar o Claude agir. Digite /intoca:rigor: "cauteloso" pergunta mais, '
        + '"equilibrado" deixa passar a rotina do dia a dia sem pergunta.',
      ocasional: () => 'o quanto o plugin pergunta se ajusta no /intoca:rigor (cauteloso ou equilibrado).',
      desenvolvedor: () => '/intoca:rigor ajusta o porteiro (cauteloso | equilibrado); ver docs/permissoes.md do plugin.',
    },
  },
]);
const INSTRUCAO_DO_CONSULTOR = ' (Dica para repassar à pessoa em uma frase, no fim da resposta.)';

// ------------------------------------------------------------ estado local (só ids e datas)

export function arquivoDoConsultor() {
  const casa = pastaDoUsuario();
  return casa ? join(casa, '.intoca', 'consultor.json') : null;
}
// Lê as dicas já dadas: { id: 'AAAA-MM-DD' }. Arquivo ausente ou corrompido: recomeça vazio. Pasta que não abre: null.
export function lerDadas(arquivo = arquivoDoConsultor()) {
  if (!arquivo) return null;
  let bruto;
  try {
    bruto = readFileSync(arquivo, 'utf8');
  } catch (e) {
    return e && e.code === 'ENOENT' ? {} : null;
  }
  try {
    const dado = JSON.parse(bruto);
    const dadas = dado && typeof dado === 'object' && dado.dadas && typeof dado.dadas === 'object' && !Array.isArray(dado.dadas) ? dado.dadas : {};
    const limpas = {};
    for (const [id, data] of Object.entries(dadas)) {
      if (/^[a-z0-9-]{1,40}$/.test(id) && typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) limpas[id] = data;
    }
    return limpas;
  } catch {
    return {}; // corrompido: recomeça vazio (e a próxima gravação o substitui)
  }
}
// Grava de forma atômica (arquivo temporário e renomeação). Devolve true só se gravou.
export function gravarDadas(dadas, arquivo = arquivoDoConsultor()) {
  if (!arquivo) return false;
  const tmp = `${arquivo}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(dirname(arquivo), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify({ versao: 1, dadas }, null, 2)}\n`);
    renameSync(tmp, arquivo);
    return true;
  } catch {
    try { unlinkSync(tmp); } catch { /* não chegou a existir */ }
    return false;
  }
}

const hoje = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------ entrada principal

// Comando de barra: o prompt é só `/nome ...` (ou o envelope que o app usa para ele).
export function ehComandoDeBarra(prompt) {
  const t = String(prompt ?? '').trim();
  return /^\/[\w:.-]{1,100}(?:\s|$)/.test(t) || t.toLowerCase().includes('<command-name>');
}

// Devolve null ou { quem: 'Consultor' | 'Vigia', texto, id }. `entrada`: a do hook; `ctx`: o montarContexto (null sem sede);
// `manifesto`, `perfil` e `modo` vêm de quem chama (ou do ctx); `estado`: o estado da sessão (para a cadência);
// `marcarSessao(id)`: grava a dica dada nesta sessão; `avisouTrocado`: o chat-trocado avisou nesta sessão ou agora.
// `texto`: o que a pessoa digitou (o textoDoProprietario do lib); ausente, é calculado aqui.
// Vigia e Consultor no mesmo prompt: fala o Vigia (o assunto de segurança vale mais), e a dica fica para outro prompt.
// Silêncios: os dois calam sem sede, em sub-agente e em chat de Executor ou de Plantão. Comando de barra e citação de um
// arquivo de OS calam só o Consultor: o Vigia roda antes deles (um segredo num argumento de comando também foi para a conversa).
export function dicasParaPrompt({
  entrada, ctx, manifesto = ctx?.manifesto, perfil, modo, estado = null, marcarSessao = null, avisouTrocado = false, texto,
} = {}) {
  if (!entrada || typeof entrada.prompt !== 'string' || !ctx || !manifesto) return null; // sem sede: mudo
  if (entrada.agent_id || entrada.agent_type) return null; // sub-agente
  const cargo = cargoDoTitulo(entrada.session_title, manifesto.titulos);
  if (cargo && (cargo.cargo === 'Executor' || cargo.cargo === 'Plantão')) return null;
  if (estado?.executor === true) return null; // contratado por OS nesta sessão (prompt-os)
  const nivel = PERFIS.includes(perfil) ? perfil : perfilDaPessoa(manifesto);

  const vigiaCasou = pareceSegredo(textoParaOVigia(entrada.prompt));
  if (vigiaCasou) return { quem: 'Vigia', id: 'segredo-no-prompt', texto: VIGIA[nivel] + INSTRUCAO_DO_VIGIA };

  if (ehComandoDeBarra(entrada.prompt) || citaArquivoDeOs(entrada.prompt)) return null; // só o Consultor cala aqui
  if ((modo ?? modoDoConsultor(manifesto)) !== 'ativo') return null;
  if (estado?.consultor?.dica) return null; // uma dica por sessão
  if (!marcarSessao) return null; // sem sessão válida não há cadência: não fala
  // O que a pessoa digitou (sem mensagem de outro chat, citação nem bloco de código), como o chat-trocado lê.
  const prompt = typeof texto === 'string' ? texto : textoDoProprietario(entrada.prompt);
  if (!prompt.trim()) return null;
  const projeto = ctx.chat?.tipo === 'projeto' ? ctx.chat.projeto : null;
  const c = {
    prompt, minusculo: semAcento(prompt).toLowerCase(), projeto, cargo, vigiaCasou,
    sede: ctx.sede?.lex ?? null, avisouTrocado: avisouTrocado || estado?.avisoTrocado?.avisou === true,
  };
  let dadas; // lido só quando um gatilho casa (leitura preguiçosa)
  for (const dica of DICAS) {
    let dados = null;
    try { dados = dica.gatilho(c); } catch { dados = null; }
    if (!dados) continue;
    dadas ??= lerDadas();
    if (dadas === null) return null; // pasta do usuário inacessível: sem estado, sem dica
    if (Object.hasOwn(dadas, dica.id)) continue;
    // Primeiro a marca da sessão (uma por sessão), depois o registro da dica (uma vez só). Qualquer das duas que falhe: não fala.
    try { marcarSessao(dica.id); } catch { return null; }
    if (!gravarDadas({ ...dadas, [dica.id]: hoje() })) return null; // não gravou: não repete, não fala
    return { quem: 'Consultor', id: dica.id, texto: `Consultor: ${dica.textos[nivel](dados)}${INSTRUCAO_DO_CONSULTOR}` };
  }
  return null;
}

// Apaga o estado (o `/intoca:consultor repetir`, com o "sim" da pessoa). true se não sobrou arquivo.
export function zerarDadas(arquivo = arquivoDoConsultor()) {
  if (!arquivo) return false;
  try { unlinkSync(arquivo); return true; } catch (e) { return Boolean(e && e.code === 'ENOENT'); }
}

// ------------------------------------------------------------ linha de comando (só a skill consultor, nunca por prompt)
// node consultor.mjs estado    → JSON: sede, modo, perfil, arquivo do estado e as dicas já dadas (ids e datas)
// node consultor.mjs repetir   → apaga o arquivo do estado (a skill só roda depois do "sim" da pessoa)
async function linhaDeComando(acao) {
  const { raizes, lerManifesto } = await import('./lib.mjs');
  const r = raizes({ cwd: process.cwd() });
  const manifesto = r ? (r.manifesto ?? lerManifesto(r.sede)) : null;
  const arquivo = arquivoDoConsultor();
  let saida;
  if (acao === 'estado') {
    saida = {
      sede: r?.sede ?? null, modo: manifesto ? modoDoConsultor(manifesto) : null, perfil: manifesto ? perfilDaPessoa(manifesto) : null,
      campoNoManifesto: manifesto ? (manifesto.consultor === undefined ? 'ausente' : MODOS.includes(norm(manifesto.consultor)) ? 'valido' : 'ilegivel') : null,
      arquivo, dadas: lerDadas(arquivo), catalogo: DICAS.map((d) => d.id).concat('segredo-no-prompt'),
    };
  } else if (acao === 'repetir') {
    saida = { arquivo, apagado: zerarDadas(arquivo) };
  } else {
    saida = { erro: 'acao-desconhecida', uso: 'node consultor.mjs estado | repetir' };
    process.exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
}
// Os dois lados pelo caminho real (link, junção e nome curto do Windows desfeitos), para não rodar por engano quando importado.
const comparavel = (p) => {
  let r = resolve(p);
  try { r = realpathSync.native(r); } catch { /* sem caminho real: fica o resolvido */ }
  return process.platform === 'win32' ? r.toLowerCase() : r;
};
if (process.argv[1] && comparavel(fileURLToPath(import.meta.url)) === comparavel(process.argv[1])) {
  linhaDeComando(process.argv[2]).catch(() => { process.exitCode = 1; });
}
