#!/usr/bin/env node
// O mapa do ambiente do Claude (PLG-34). Node, sem dependência.
//
// Uso:  node ambiente.mjs registrar [--confirmado] [--sede=<pasta>] [--saida=<arquivo>] [--maquina=<apelido>]
//       node ambiente.mjs restaurar [--so-plano] [--confirmado --plano=<plano_hash>] [--sede=<pasta>] [--arquivo=<ambiente.yaml>]
// Saída: um JSON no stdout. Código 0 sem erros, 1 com erros.
// `--saida` e `--arquivo` só aceitam um arquivo chamado `ambiente.yaml`, dentro da sede ou de uma pasta temporária (sem `..`, e depois de resolver os links); são para teste e prova.
//
// registrar  LÊ a pasta do Claude (plugins, catálogos, configurações), as ferramentas do sistema e grava só o
//            `<sede>/diretoria/ambiente.yaml`: o mínimo para refazer o ambiente. Mostra o que mudou em relação ao arquivo
//            anterior e só grava com `--confirmado` (o "sim" da pessoa). O que o código GARANTE por estrutura (ver `argumentosDoMcp`): valores
//            de `env` e de cabeçalho nunca entram (só os nomes), em qualquer forma da opção (`-e NOME=v`, `-eNOME=v`, `-e=NOME=v`, `-HNome:v`...);
//            de todo `nome=valor` fica só o nome; JSON só com as chaves; URL sem usuário, senha e parâmetros; o valor depois de qualquer opção que
//            não seja bandeira conhecida sem valor vira `<definir>` (na dúvida, esconde), salvo opção segura ou recurso claro, também depois de
//            um `--` e para opção que começa com dígito, `_`, letra não ASCII ou `/`; argumento solto com espaço some; caminho de máquina nunca
//            entra. O que NÃO garante: uma palavra solta sem opção na frente, sem espaço, sem `=` e sem chave sensível (`user:pass`, `X-Api:y`) é
//            copiada, e um trecho de caminho de URL só some com 24 caracteres ou mais; só a varredura heurística pode pegar o resto, por isso
//            a pessoa confere o diff antes do commit. Antes de gravar,
//            varre o próprio texto (o analisador do Vigia, padrões de chave e, se existir, o `gitleaks`); achado = recusa e diz só o
//            NOME do campo. O nome da máquina é um apelido neutro (`maquina-` mais 4 letras de um hash), nunca o hostname.
// restaurar  Lê o `ambiente.yaml`, compara com a máquina e monta o plano na ordem: ferramentas, catálogos, plugins, hooks, MCP.
//            O arquivo mora no Git e é tratado como hostil: cada item passa por um padrão estrito e o que não passa vira passo
//            `recusada` (com o motivo), nunca comando. O que roda vem de tabelas fixas deste script (instalação das ferramentas,
//            hooks conhecidos) e de valores validados (plugin `nome@catálogo`, catálogo `dono/nome` ou pasta DENTRO da sede,
//            servidor MCP remoto https limpo); servidor MCP de comando local e qualquer `instalar` do arquivo só são mostrados.
//            Sem `--confirmado` só mostra o plano (`--so-plano` também) e devolve o `plano_hash`. Com `--confirmado --plano=<hash>`
//            executa os passos reprodutíveis (se o arquivo ou a máquina mudaram desde que o plano foi mostrado, recusa), relata a
//            saída de cada um e PARA no primeiro passo que depende da pessoa ou que falha; o que sobrou volta em `restante`.
//            Nunca escreve segredo, nunca digita senha, nunca contorna login ou confiança de pasta e só ACRESCENTA plugin,
//            catálogo e servidor MCP: o que já existe e difere do arquivo só é mostrado (`diferencas`). Os hooks da sala animada
//            são a exceção: o instalador regrava o `settings.json` (com cópia de segurança ao lado) e executa código do repositório
//            da sala animada que ele baixa; o plano diz isso e só roda com o "sim".
//
// A pasta do Claude é a de CLAUDE_CONFIG_DIR (a mesma variável do Claude Code); sem ela, `<pasta do usuário>/.claude`. A pasta do
// usuário é a de INTOCA_HOME (uso dos testes) ou a do sistema. Este script não grava em nenhuma delas.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync, mkdtempSync, realpathSync, statSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastaDoUsuario, acharSede, sedeIndicada } from '../hooks/lib.mjs';
import { pareceSegredo } from '../hooks/consultor.mjs';
import { executar as executarSala } from './instalar-sala.mjs';

export const VERSAO_DO_FORMATO = 1;
const NOME_DO_ARQUIVO = 'ambiente.yaml';
export const ARQUIVO_NA_SEDE = join('diretoria', NOME_DO_ARQUIVO);
const MARCA_DEFINIR = '<definir>'; // no lugar de um valor que a pessoa precisa dar (nunca um segredo copiado)
const MARCA_SEDE = '${SEDE}';
const ESCOPO_DO_USUARIO = 'user';
const LIMITE_DO_ARQUIVO = 262144;

class Recusa extends Error {
  constructor(codigo, mensagem, extra = {}) { super(mensagem); this.codigo = codigo; this.extra = extra; }
}

// ------------------------------------------------------------ processos (trocáveis nos testes)

// Acha um programa pelo NOME só nas pastas absolutas do PATH, nunca na pasta atual (no Windows o sistema procuraria nela antes do PATH: um `.exe` do mesmo nome
// solto na pasta de trabalho rodaria no lugar do programa de verdade). Lá só `.exe` e `.com`, que são o que o processo sem shell executa. Devolve o caminho ou null.
export function acharNoPath(nome, caminhos = process.env.PATH ?? '', plataforma = process.platform, cwd = process.cwd()) {
  const win = plataforma === 'win32';
  const exts = win ? (/\.[A-Za-z0-9]+$/.test(nome) ? [''] : ['.exe', '.com']) : [''];
  const aqui = norm(cwd);
  for (const dir of String(caminhos).split(win ? ';' : ':')) {
    if (!dir || !isAbsolute(dir) || norm(dir) === aqui) continue; // vazio, "." e relativos são a pasta atual
    for (const e of exts) {
      const candidato = join(dir, nome + e);
      try {
        const info = lstatSync(candidato); // lstat: os atalhos de aplicativo e os links do winget não são arquivo comum
        if (info.isFile() || info.isSymbolicLink()) return candidato;
      } catch { /* não está nesta pasta */ }
    }
  }
  return null;
}

function rodarPrograma(comando, args, { cwd, tempo = 120000 } = {}) {
  let programa = comando;
  if (process.platform === 'win32' && !/[\\/]/.test(comando)) {
    programa = acharNoPath(comando);
    if (!programa) return { status: null, stdout: '', stderr: '', erro: 'ENOENT' };
  }
  const r = spawnSync(programa, args, { cwd, encoding: 'utf8', timeout: tempo, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', erro: r.error ? (r.error.code ?? String(r.error.message)) : null };
}

const DEPS_PADRAO = { rodar: rodarPrograma, claude: null, sede: null, pastaDoClaude: null, casa: null, plataforma: null, agora: null, maquina: null, instalarSala: executarSala, limiteDeFonte: null };

const primeiraLinha = (t) => String(t ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const lista = (v) => (Array.isArray(v) ? v : []);

// ------------------------------------------------------------ YAML mínimo (só o que este arquivo usa)
// Mapas por indentação de 2 espaços, listas com `- `, escalares (texto, número, true, false, null) e listas curtas de escalares na
// mesma linha (`["a", "b"]`, que é JSON). Comentário só em linha própria. Texto que não é simples sai entre aspas (JSON).

const SIMPLES = /^[A-Za-z_][A-Za-z0-9_./@~-]*$/;
const RESERVADAS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n']);

function escalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const t = String(v);
  return SIMPLES.test(t) && !RESERVADAS.has(t.toLowerCase()) ? t : JSON.stringify(t);
}
const ehEscalar = (v) => v === null || v === undefined || typeof v !== 'object';

export function emitirYaml(valor, recuo = 0) {
  const sp = ' '.repeat(recuo);
  const saida = [];
  if (Array.isArray(valor)) {
    for (const item of valor) {
      if (ehEscalar(item)) { saida.push(`${sp}- ${escalar(item)}`); continue; }
      if (Array.isArray(item)) { saida.push(`${sp}- ${JSON.stringify(item)}`); continue; }
      const entradas = Object.entries(item);
      entradas.forEach(([k, v], i) => {
        const prefixo = i === 0 ? `${sp}- ` : `${sp}  `;
        saida.push(...linhaDeMapa(prefixo, k, v, recuo + 2));
      });
    }
    return saida;
  }
  for (const [k, v] of Object.entries(valor)) saida.push(...linhaDeMapa(sp, k, v, recuo));
  return saida;
}

function linhaDeMapa(prefixo, k, v, recuo) {
  if (ehEscalar(v)) return [`${prefixo}${k}: ${escalar(v)}`];
  if (Array.isArray(v)) {
    if (v.length === 0) return [`${prefixo}${k}: []`];
    if (v.every(ehEscalar)) {
      const curta = `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (curta.length <= 90) return [`${prefixo}${k}: ${curta}`];
    }
    return [`${prefixo}${k}:`, ...emitirYaml(v, recuo + 2)];
  }
  if (Object.keys(v).length === 0) return [`${prefixo}${k}: {}`];
  return [`${prefixo}${k}:`, ...emitirYaml(v, recuo + 2)];
}

const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);
const temChaveProibida = (v) => (Array.isArray(v) ? v.some(temChaveProibida) : (v !== null && typeof v === 'object' ? Object.keys(v).some((k) => CHAVES_PROIBIDAS.has(k) || temChaveProibida(v[k])) : false));

function valorEscalar(texto) {
  const t = texto.trim();
  if (t === '' || t === 'null' || t === '~') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t.startsWith('"') || t.startsWith('[') || t.startsWith('{')) {
    let v;
    try { v = JSON.parse(t); } catch { throw new Recusa('yaml-invalido', 'o ambiente.yaml tem um valor ilegível'); }
    if (temChaveProibida(v)) throw new Recusa('yaml-invalido', 'o ambiente.yaml usa um nome de chave que não é permitido');
    return v;
  }
  return t;
}

export function lerYaml(texto) {
  const linhas = String(texto).replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((l) => ({ recuo: l.length - l.trimStart().length, texto: l.trim() }))
    .filter((l) => l.texto !== '' && !l.texto.startsWith('#'));
  let i = 0;
  const chaveEValor = (t) => {
    const m = t.match(/^("(?:[^"\\]|\\.)*"|[^\s:][^:]*?):(?:\s+(.*))?$/);
    if (!m) throw new Recusa('yaml-invalido', 'o ambiente.yaml tem uma linha ilegível');
    return [m[1].startsWith('"') ? JSON.parse(m[1]) : m[1], m[2] ?? ''];
  };
  function bloco(recuo) {
    if (i >= linhas.length) return null;
    return linhas[i].texto.startsWith('- ') || linhas[i].texto === '-' ? listaEm(recuo) : mapaEm(recuo);
  }
  function mapaEm(recuo) {
    const m = {};
    while (i < linhas.length && linhas[i].recuo === recuo && !linhas[i].texto.startsWith('- ')) {
      const [k, resto] = chaveEValor(linhas[i].texto);
      if (CHAVES_PROIBIDAS.has(k)) throw new Recusa('yaml-invalido', 'o ambiente.yaml usa um nome de chave que não é permitido');
      i += 1;
      if (resto !== '') m[k] = valorEscalar(resto);
      else if (i < linhas.length && linhas[i].recuo > recuo) m[k] = bloco(linhas[i].recuo);
      else m[k] = null;
    }
    return m;
  }
  function listaEm(recuo) {
    const l = [];
    while (i < linhas.length && linhas[i].recuo === recuo && linhas[i].texto.startsWith('- ')) {
      const conteudo = linhas[i].texto.slice(2).trim();
      if (/^("(?:[^"\\]|\\.)*"|[^\s:"[{][^:]*?):(\s|$)/.test(conteudo)) {
        linhas[i] = { recuo: recuo + 2, texto: conteudo }; // o item é um mapa: o resto da linha vira a primeira chave
        l.push(mapaEm(recuo + 2));
      } else {
        l.push(valorEscalar(conteudo));
        i += 1;
      }
    }
    return l;
  }
  const raiz = bloco(linhas[0]?.recuo ?? 0);
  if (i < linhas.length) throw new Recusa('yaml-invalido', 'o ambiente.yaml tem uma linha fora do lugar');
  return raiz ?? {};
}

// ------------------------------------------------------------ caminhos: nunca de máquina

// Caminho de máquina em QUALQUER posição do texto, não só no começo: unidade de disco (letra, dois-pontos e barra; não casa "https://"), UNC, file://, raízes de
// Unix e de macOS, variáveis da pasta do usuário (%NOME%, $HOME...) e `~\`. A busca é sempre dentro do texto: `--mount=type=bind,source=...`,
// `FOO=/x/y`, JSON e listas com vírgula também são pegos.
const RAIZES = 'home|Users|Applications|Volumes|private|mnt|Library|nix|opt|usr|var|tmp|etc|root|srv|bin|sbin|lib|lib64|dev|proc|snap|run|media|System';
const CAMINHO_NO_TEXTO = new RegExp([
  '(?<![A-Za-z0-9])[A-Za-z]:[\\\\/]',
  '(?<![\\w\\\\])\\\\\\\\[\\w$]',
  'file:\\/\\/',
  `(?<![\\w.}~-])\\/(?:${RAIZES})\\/`,
  '%[A-Za-z_][A-Za-z0-9_]*%',
  '\\$\\{?(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|HOMEDRIVE)\\b',
  '(?<!\\w)~\\\\',
].join('|'), 'i');
const INICIO_ABSOLUTO = new RegExp(`^(?:[A-Za-z]:[\\\\/]|\\\\\\\\|file:\\/\\/|\\/[^/\\s]+\\/[^/\\s]|\\/(?:${RAIZES})(?:\\/|$))`, 'i');
export const caminhoDeMaquina = (v) => typeof v === 'string' && (CAMINHO_NO_TEXTO.test(v) || INICIO_ABSOLUTO.test(v));
const norm = (p) => { const r = resolve(String(p)); return process.platform === 'win32' ? r.toLowerCase() : r; };
const dentro = (pai, alvo) => { const a = norm(alvo); const p = norm(pai); return a === p || a.startsWith(p.endsWith(sep) ? p : p + sep); };

// Caminho absoluto → `.` ou relativo à sede, `~/...` (pasta do usuário) ou null (caminho só desta máquina).
function emFormaPortatil(absoluto, sede, casa) {
  if (sede && dentro(sede, absoluto)) return relative(resolve(sede), resolve(absoluto)).split(sep).join('/') || '.';
  if (casa && dentro(casa, absoluto)) return `~/${relative(resolve(casa), resolve(absoluto)).split(sep).join('/')}`.replace(/\/$/, '');
  return null;
}

// Um valor que é SÓ um caminho: começa como caminho absoluto, não tem outro caminho dentro e não é lista, JSON nem `chave=valor`.
// (Raízes como /home ou /lib podem aparecer DENTRO de um caminho legítimo; só outra unidade, UNC, file:// ou variável torna o valor impuro.)
const OUTRO_CAMINHO = /(?<![A-Za-z0-9])[A-Za-z]:[\\/]|(?<![\w\\])\\\\[\w$]|file:\/\/|%[A-Za-z_][A-Za-z0-9_]*%|\$\{?(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|HOMEDRIVE)\b/i;
const ehCaminhoPuro = (v) => INICIO_ABSOLUTO.test(v) && !/[{}",;=\u0000-\u001f]/.test(v) && !OUTRO_CAMINHO.test(v.slice(2));

// Um valor que pode ser caminho (argumento solto ou o que vem depois do `=` de uma opção): devolve { valor, ajuste }. Caminho de máquina
// NUNCA sai. Valor que é só um caminho dentro da sede ou da pasta do usuário vira `${SEDE}/...` ou `~/...`; qualquer outro valor que contenha
// um caminho de máquina em qualquer posição (JSON, lista, `a=b,c=<caminho>`) vira `<definir>` inteiro: não se tenta reescrever o texto.
const VARIAVEL_DA_CASA = /^(?:\$HOME|\$\{HOME\}|%USERPROFILE%|%HOMEPATH%)(?=[\\/]|$)/i;
function portatilizar(valor, sede, casa) {
  const v = valor;
  const barras = (t) => t.replace(/\\/g, '/');
  const definir = { valor: MARCA_DEFINIR, ajuste: true };
  if (v === '~' || /^~[\\/]/.test(v)) {
    const resto = v.slice(2);
    return caminhoDeMaquina(resto) || /[{}",;=]/.test(resto) ? definir : { valor: barras(v).replace(/\/$/, '') || '~', ajuste: false };
  }
  if (VARIAVEL_DA_CASA.test(v)) {
    const resto = v.replace(VARIAVEL_DA_CASA, '');
    return caminhoDeMaquina(resto) || /[{}",;=]/.test(resto) ? definir : { valor: barras(`~${resto}`).replace(/\/$/, ''), ajuste: false };
  }
  if (!caminhoDeMaquina(v)) return { valor, ajuste: false };
  if (!ehCaminhoPuro(v)) return definir;
  let caminho = v;
  if (/^file:\/\//i.test(caminho)) {
    caminho = caminho.replace(/^file:\/\//i, '');
    if (/^\/[A-Za-z]:[\\/]/.test(caminho)) caminho = caminho.slice(1);
    if (!INICIO_ABSOLUTO.test(caminho) || /^file:/i.test(caminho)) return definir;
  }
  const p = emFormaPortatil(caminho, sede, casa);
  if (p === null) return definir;
  return { valor: p.startsWith('~') ? p : `${MARCA_SEDE}/${p === '.' ? '' : p}`.replace(/\/$/, ''), ajuste: false };
}

// URL sem usuário, senha, parâmetros, âncora e sem trecho de caminho com cara de chave. Devolve { url, ajuste } (ajuste: algo foi tirado) ou null.
// Limite conhecido: um segredo escondido num pedaço curto do caminho passa; a varredura é a última rede.
function urlSegura(bruto) {
  if (typeof bruto !== 'string' || bruto === '' || bruto.length > 300 || /[\u0000- \u007f]/.test(bruto)) return null; // o parser de URL apaga quebra de linha e tabulação em silêncio: o que roda tem de ser o que está no arquivo
  let u;
  try { u = new URL(bruto); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  let ajuste = Boolean(u.username || u.password || u.search || u.hash);
  const comChave = u.pathname.split('/').some((p) => p.length >= 24 && /[A-Za-z]/.test(p) && /\d/.test(p));
  if (comChave) ajuste = true;
  const caminho = comChave ? '' : u.pathname.replace(/\/+$/, '');
  return { url: `${u.protocol}//${u.host}${caminho}`, ajuste };
}

// Volta de `${SEDE}/x`, `~/x` ou relativo-à-sede para um caminho desta máquina.
function expandir(valor, sede, casa) {
  if (typeof valor !== 'string') return null;
  if (valor.startsWith(`${MARCA_SEDE}/`) || valor === MARCA_SEDE) return sede ? join(sede, valor.slice(MARCA_SEDE.length + 1)) : null;
  if (valor === '~' || valor.startsWith('~/')) return casa ? join(casa, valor.slice(2)) : null;
  return valor;
}

// ------------------------------------------------------------ o que há no Claude (só leitura)

// O `.claude.json` de quem usa o Claude há tempo passa de vários MB: o limite é folgado (64 MB) e, se uma fonte ainda assim passar dele, ela NÃO some em silêncio:
// o aviso vai para a saída e o resto do registro segue.
const LIMITE_DE_FONTE = 64 * 1024 * 1024;
function lerJson(arquivo, limite = LIMITE_DE_FONTE, avisos = null) {
  try {
    if (statSync(arquivo).size > limite) { avisos?.push(`a fonte ${basename(arquivo)} passou do limite de leitura e não foi lida: o que dependia dela ficou de fora`); return null; }
    return JSON.parse(readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
  } catch { return null; }
}

function contexto(d) {
  const casa = d.casa ?? pastaDoUsuario();
  const env = process.env.CLAUDE_CONFIG_DIR;
  const pastaClaude = d.pastaDoClaude ?? (typeof env === 'string' && env.trim() !== '' ? resolve(env) : (casa ? join(casa, '.claude') : null));
  if (!pastaClaude) throw new Recusa('sem-pasta-do-claude', 'não achei a pasta de configuração do Claude');
  // O arquivo `.claude.json` mora dentro da pasta quando ela vem de CLAUDE_CONFIG_DIR e, senão, ao lado dela.
  const jsonDoUsuario = d.pastaDoClaude || (typeof env === 'string' && env.trim() !== '') ? join(pastaClaude, '.claude.json') : join(casa ?? pastaClaude, '.claude.json');
  return { casa, pastaClaude, jsonDoUsuario, plataforma: d.plataforma ?? process.platform };
}

function localizarClaude(d) {
  if (d.claude) return d.claude;
  const candidatos = [process.env.CLAUDE_CODE_EXECPATH, 'claude'].filter((c) => typeof c === 'string' && c !== '');
  for (const c of candidatos) if (d.rodar(c, ['--version'], { tempo: 20000 }).status === 0) return c;
  return null;
}

function achar(entrada, d) {
  const pasta = entrada.sede ?? d.sede ?? acharSede(process.cwd()) ?? sedeIndicada();
  return pasta ? resolve(pasta) : null;
}

// Lê o estado do Claude desta máquina em formato cru (nomes e estruturas; nada sai daqui sem passar pelos filtros abaixo).
function lerClaude(c, d = {}) {
  const avisos = [];
  const limite = d.limiteDeFonte ?? LIMITE_DE_FONTE;
  const settings = lerJson(join(c.pastaClaude, 'settings.json'), limite, avisos) ?? {};
  const instalados = lerJson(join(c.pastaClaude, 'plugins', 'installed_plugins.json'), limite, avisos) ?? {};
  const catalogos = lerJson(join(c.pastaClaude, 'plugins', 'known_marketplaces.json'), limite, avisos) ?? {};
  const doUsuario = lerJson(c.jsonDoUsuario, limite, avisos) ?? {};
  return { settings, instalados, catalogos, mcpDoUsuario: ehObjeto(doUsuario.mcpServers) ? doUsuario.mcpServers : {}, avisos };
}

// O caminho com os links resolvidos: sobe até o que já existe, resolve os links dessa parte e recoloca o resto. Link quebrado dá erro (quem chama recusa).
function caminhoReal(p) {
  let atual = resolve(p);
  const resto = [];
  for (;;) {
    try { lstatSync(atual); break; } catch { /* ainda não existe: sobe */ }
    const pai = dirname(atual);
    if (pai === atual) return resolve(p);
    resto.unshift(basename(atual));
    atual = pai;
  }
  const real = realpathSync.native(atual);
  return resto.length ? join(real, ...resto) : real;
}

// Algum componente existente do caminho (ele mesmo ou um pai) é link simbólico ou junção? (lstat: no Windows uma junção aparece como link simbólico.)
function temLinkNoCaminho(p) {
  let atual = resolve(p);
  for (;;) {
    let info = null;
    try { info = lstatSync(atual); } catch { /* ainda não existe: sobe */ }
    if (info?.isSymbolicLink()) return true;
    const pai = dirname(atual);
    if (pai === atual) return false;
    atual = pai;
  }
}

// `--saida` e `--arquivo` (teste e prova) e o destino de sempre: o arquivo se chama `ambiente.yaml`, sem `..` no caminho, e, DEPOIS de resolver os links, fica dentro da
// sede ou de uma pasta temporária. Se o destino já existe, o que ele é de verdade (o link resolvido) também tem de ser um arquivo `ambiente.yaml`: nunca outro arquivo da sede.
function caminhoPermitido(bruto, sede) {
  if (typeof bruto !== 'string' || bruto === '' || bruto.includes('\u0000') || bruto.split(/[\\/]+/).includes('..')) throw new Recusa('caminho-nao-permitido', 'o caminho de --saida ou --arquivo é inválido ou tem ".."');
  const r = resolve(bruto);
  if (basename(r) !== NOME_DO_ARQUIVO) throw new Recusa('caminho-nao-permitido', `o arquivo de --saida ou --arquivo precisa se chamar ${NOME_DO_ARQUIVO}`);
  let real;
  try { real = caminhoReal(r); } catch { throw new Recusa('caminho-nao-permitido', 'o caminho de --saida ou --arquivo tem um link que não se resolve'); }
  // A raiz que vale é a de ONDE O CAMINHO FOI ESCRITO: um caminho escrito dentro da sede tem de continuar na sede depois de resolver os links (uma junção na sede que
  // aponta para a pasta temporária, ou para qualquer outro lugar, é recusada); um escrito na pasta temporária fica na temporária. O resultado não depende de onde o pacote mora.
  const lexicas = [];
  if (sede && dentro(resolve(sede), r)) lexicas.push(sede);
  else if (dentro(resolve(tmpdir()), r)) lexicas.push(tmpdir());
  else {
    // nenhuma das duas lexicamente (forma curta 8.3 do Windows, `subst`, sede por link): vale o caminho real em qualquer uma, MAS sem nenhum link ou junção no caminho escrito
    // (PLG-37): sem a raiz de onde foi escrito, uma junção não prova nada; só a forma curta e o `subst` (que não são links) passam.
    if (temLinkNoCaminho(r)) throw new Recusa('caminho-nao-permitido', 'o caminho de --saida ou --arquivo está fora da sede e da pasta temporária e passa por um link ou junção');
    lexicas.push(sede, tmpdir());
  }
  const raizes = [];
  for (const x of lexicas) {
    if (!x) continue;
    try { raizes.push(caminhoReal(x)); } catch { /* raiz sem forma real: fica sem ela */ }
  }
  if (!raizes.some((x) => dentro(x, real))) throw new Recusa('caminho-nao-permitido', 'o caminho de --saida ou --arquivo precisa ficar dentro da sede ou de uma pasta temporária (depois de resolver os links)');
  if (existsSync(r)) {
    let arquivoComum = false;
    try { arquivoComum = statSync(r).isFile(); } catch { /* não é arquivo */ }
    if (!arquivoComum || basename(real) !== NOME_DO_ARQUIVO) throw new Recusa('caminho-nao-permitido', `o destino já existe e não é um ${NOME_DO_ARQUIVO}: nada foi lido nem gravado`);
  }
  return r;
}

// ------------------------------------------------------------ montar o ambiente (só nomes, nunca valor)

function catalogoDe(nome, fonte, sede, casa) {
  const f = ehObjeto(fonte) ? fonte : {};
  const tipoBruto = typeof f.source === 'string' ? f.source : '';
  const base = { nome };
  if (tipoBruto === 'github' && typeof f.repo === 'string') return { ...base, tipo: 'github', origem: f.repo };
  if (tipoBruto === 'git' && typeof f.url === 'string') {
    if (gitSshOk(f.url)) return { ...base, tipo: 'git', origem: f.url };
    const u = urlSegura(f.url); // usuário, senha, parâmetros e âncora saem do arquivo
    return u ? { ...base, tipo: 'git', origem: u.url, ...(u.ajuste ? { precisa_ajuste: true } : {}) } : { ...base, tipo: 'git', origem: null, precisa_ajuste: true };
  }
  if ((tipoBruto === 'directory' || tipoBruto === 'file') && typeof f.path === 'string') {
    const rel = emFormaPortatil(f.path, sede, casa);
    const tipo = tipoBruto === 'directory' ? 'pasta' : 'arquivo';
    if (rel !== null && !rel.startsWith('~')) return { ...base, tipo: `${tipo}_da_sede`, origem: rel };
    return { ...base, tipo: `${tipo}_da_maquina`, origem: rel }; // `~/...` ou null (caminho que só existe nesta máquina)
  }
  return { ...base, tipo: 'desconhecido', origem: null };
}

const NOME_SENSIVEL = /(?:key|token|secret|passw|passwd|senha|chave|segredo|auth|bearer|credencia|credential|cookie|webhook|signature|connection-?string|sessionid|(?:^|[^A-Za-z])(?:pass|pwd)(?:$|[^A-Za-z]))/i;
// PLG-37: formas coladas em minúsculas e comuns de `pat`, `dsn`, `sas` e `jwt` (`--mypat`, `--githubpat`, `--dsnurl`). É uma LISTA: nome colado fora dela (`--zzpat`) NÃO é pego. Não casa `patch`, `passo`, `design`, `compat`.
const PALAVRAS_COLADAS = /(?:^|[^A-Za-z])(?:(?:my|your|our|the|db|gh|git|github|gitlab|az|azure|sentry|app|user|admin|storage|slack|discord|teams|stripe|aws)(?:pat|dsn|sas|jwt)|(?:pat|dsn|sas|jwt)(?:value|val|str|string|url|uri|var|env))(?:$|[^A-Za-z])/i;
// PLG-37: nomes sensíveis por PALAVRA INTEIRA (separada por hífen, ponto, sublinhado, dígito ou fronteira de maiúscula: `--pat`, `--db-dsn`, `--webhookUrl`), para não pegar `--patch`, `--passo`, `--design`.
const PALAVRAS_SENSIVEIS = /(?:^|[^A-Za-z])(?:pat|dsn|sas|jwt|connection-?string|webhook|signature|sig|bearer|api-?key|private|credential|cert|session|cookie|otp|pin|salt)(?:$|[^A-Za-z])/i;
const nomeSensivel = (nome) => NOME_SENSIVEL.test(nome) || PALAVRAS_COLADAS.test(nome) || PALAVRAS_SENSIVEIS.test(nome.replace(/([a-z])([A-Z])/g, '$1-$2'));
const OPCOES_DE_ENV = new Set(['-e', '--env']);
const OPCOES_DE_CABECALHO = new Set(['-H', '--header']);
// Bandeiras conhecidas que NÃO levam valor (lista pequena e fixa; `--no-*` também é bandeira). Qualquer outra opção pode levar um valor.
const BANDEIRAS_SEM_VALOR = new Set(['-y', '-v', '-V', '-q', '-h', '--yes', '--verbose', '--quiet', '--silent', '--debug', '--help', '--version', '--stdio', '--no-install']);
// PLG-38: as letras das bandeiras curtas (`-y`, `-v`...): um argumento só com elas (`-vv`, `-yv`) é um agrupamento de bandeiras sem valor.
const LETRAS_DE_BANDEIRA = new Set([...BANDEIRAS_SEM_VALOR].filter((b) => /^-[^-]$/.test(b)).map((b) => b[1]));
// Opções conhecidas cujo valor não é segredo (lista pequena e fixa). O valor delas ainda passa pelos filtros de estrutura (caminho, atribuição, JSON, URL).
const OPCOES_SEGURAS = new Set(['--transport', '--nome', '--name', '--port', '--porta', '--mode', '--modo', '--type', '--tipo', '--log-level', '--directory', '--dir', '--cwd']);

// `-p` é a opção curta de senha mais comum (`mysql -p`, `-p senha`): estrita por nome, sem adivinhar nada.
const OPCOES_ESTRITAS_CURTAS = new Set(['-p']);
// Nomes COMPLETOS de uma opção com um traço só (`-password abc`): lista fixa. Qualquer outro `-xyz...` é lido como a opção curta `-x` com o valor colado (`-pSEGREDO`).
const NOMES_LONGOS_DE_UM_TRACO = new Set(['-password', '-passwd', '-pass', '-pwd', '-token', '-secret', '-key', '-apikey', '-api-key', '-senha', '-chave']);

// PLG-39: o NOME de uma atribuição `nome=valor` só é mostrado quando tem cara de nome, por estrutura: no máximo NOME_MAX caracteres, só os do formato `formato`, e DEPOIS do primeiro `=` há algo que não é
// só `=` (um valor que termina em `=` ou `==` depois de letras e dígitos é base64 com preenchimento: o argumento INTEIRO é segredo, não um nome). Devolve o nome, ou null (o chamador esconde tudo).
// PLG-40: o que vem depois do primeiro `=` é APARADO antes de olhar (só os caracteres invisíveis das pontas, os que não são letra, número, pontuação nem símbolo; ver `INVISIVEL`): `QWx==` seguido de espaço ou de
// quebra de linha também é base64 com preenchimento. Falso positivo aceito e dito no texto: nome com mais de NOME_MAX caracteres, `NOME=` com o valor vazio e `NOME=` seguido SÓ de caracteres invisíveis (o valor aparado fica vazio) também somem por inteiro. Teste linear (indexOf e laços, sem regex com varredura).
const NOME_MAX = 32;
// PLG-40 (seguimento): o que conta como "invisível" é decidido por ESTRUTURA, e não por uma lista que cresce: um caractere (um ponto de código, com a flag `u`) que NÃO é letra, número, pontuação nem símbolo (`\p{L}`, `\p{N}`, `\p{P}`, `\p{S}`).
// Cai aí o resto do Unicode: separadores e espaço em branco (Z), controle (Cc), formato (Cf: largura zero, U+00AD, marcas de direção, tags), marcas de combinação e seletores de variação (Mn, Mc, Me), uso privado (Co), sem designação (Cn) e não-caracteres
// (U+FFFF). A exceção posta à mão são os cinco que desenham nada mas são letra ou símbolo: U+2800 (braille vazio), U+3164, U+115F, U+1160 e U+FFA0 (preenchimentos do hangul). `=` é símbolo (Sm): nunca é aparado.
const INVISIVEL = /[^\p{L}\p{N}\p{P}\p{S}]|[\u2800\u3164\u115F\u1160\uFFA0]/u;
// Tira das duas pontas os caracteres invisíveis, de PONTO DE CÓDIGO em ponto de código (o caractere de tag e outros ficam fora do plano básico: dois códigos UTF-16). Laço linear: uma regex `^x+|x+$` seria quadrática numa sequência longa.
function aparar(t) {
  let a = 0;
  let b = t.length;
  while (a < b) {
    const c = String.fromCodePoint(t.codePointAt(a));
    if (!INVISIVEL.test(c)) break;
    a += c.length;
  }
  while (b > a) {
    let i = b - 1;
    const baixo = t.charCodeAt(i);
    if (baixo >= 0xDC00 && baixo <= 0xDFFF && i > a) { const alto = t.charCodeAt(i - 1); if (alto >= 0xD800 && alto <= 0xDBFF) i -= 1; }
    if (!INVISIVEL.test(t.slice(i, b))) break;
    b = i;
  }
  return t.slice(a, b);
}
const soInvisivel = (t) => aparar(t) === ''; // vazia, só espaço em branco, só invisível (largura zero, controle, formato, separador...)
// PLG-42: caractere que CARREGA DADOS sem aparecer na tela. Um argumento (solto, valor de opção ou a própria opção) que contenha QUALQUER ponto de código destas categorias vira `<definir>` por INTEIRO, com ou sem estado ligado
// (na dúvida, esconde): formato (Cf: largura zero, U+00AD, marcas de direção, junção, caracteres de tag U+E0020 a U+E007F), uso privado (Co), sem designação (Cn, inclusive os não-caracteres), substitutos soltos (Cs), os seletores de
// variação (`\p{Variation_Selector}`: U+180B a U+180D, U+180F, U+FE00 a U+FE0F e U+E0100 a U+E01EF, que são marcas Mn mas carregam dados) e controle (Cc: U+0000 a U+001F e U+007F a U+009F), exceto os que já contam como espaço em branco (tabulação, quebra de linha, U+000B, U+000C, retorno de carro).
// Vale para o argumento feito só disso e para o que tem isso COLADO a uma palavra (`abc` + caracteres de tag): nada do que sobra é copiado. FALSO POSITIVO ACEITO e dito no texto: o emoji com junção (U+200D), o texto de direita para a
// esquerda com marca de direção (U+200E, U+200F), a junção sem largura de escritas indianas e persas (U+200C, U+200D) e qualquer outro caractere de formato somem com o argumento. FICAM: letra, número, pontuação, símbolo e as marcas de
// combinação comuns (Mn como o acento decomposto, U+0300 a U+036F). LIMITE dito: marcas Mn, Mc e Me que não são seletores de variação (acentos de outras escritas, U+20D0 a U+20FF...) não são ocultas (saem copiadas, coladas a uma palavra: U+034F, U+17B4, U+17B5, os acentos de outras escritas, e as letras e o símbolo que desenham nada: U+2800, U+3164, U+115F, U+1160, U+FFA0). Uma expressão `u` de uma classe só: sem repetição.
// DITO: (1) o Cn (sem designação) depende da versão do Unicode do Node (no 24.21, o Unicode 17.0): um caractere criado depois some num Node mais velho e fica num mais novo; (2) caminho, URL e JSON com um destes caracteres também somem por inteiro (a regra vem antes de qualquer limpeza);
// (3) FORA dos argumentos, `servidorMcp` copia sem filtro o nome do servidor e as chaves de `env` e de cabeçalho, e a `url` do tipo http só passa por `urlSegura`: já era assim e só está dito no texto (doc e skill).
const OCULTO_NO_ARGUMENTO = /[\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Variation_Selector}\u{0}-\u{8}\u{E}-\u{1F}\u{7F}-\u{9F}]/u;
const carregaDados = (t) => OCULTO_NO_ARGUMENTO.test(t);
function nomeDaAtribuicao(v, formato) {
  const i = v.indexOf('=');
  if (i < 1 || i > NOME_MAX) return null;
  const nome = v.slice(0, i);
  if (!formato.test(nome)) return null;
  if (/^=*$/.test(aparar(v.slice(i + 1)))) return null;
  return nome;
}
// Valor de uma variável de ambiente (`NOME=valor`): só o NOME fica. O nome solto (`-e NOME`) também vira `<definir>`: por estrutura é um nome, mas um valor posto ali por engano sairia em claro
// (decisão do proprietário: na dúvida, esconde). Valor de cabeçalho (`Nome: valor`): só o nome do cabeçalho fica.
function soONomeDaVariavel(v, marca) {
  const nome = nomeDaAtribuicao(v, /^[A-Za-z_][A-Za-z0-9_]*$/);
  marca.ajuste = true;
  return nome !== null ? `${nome}=${MARCA_DEFINIR}` : MARCA_DEFINIR;
}
function soONomeDoCabecalho(v, marca) {
  marca.ajuste = true;
  const m = v.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:/);
  return m ? `${m[1]}: ${MARCA_DEFINIR}` : MARCA_DEFINIR;
}

// JSON dentro de um argumento: ficam só as chaves e a forma; todo valor (texto, número, booleano, nulo) vira `<definir>`.
const soAsChaves = (x) => {
  if (Array.isArray(x)) return x.map(soAsChaves);
  if (ehObjeto(x)) return Object.fromEntries(Object.keys(x).map((k) => [k, soAsChaves(x[k])]));
  return MARCA_DEFINIR;
};
const RECURSO_PORTATIL = /^(?:\$\{SEDE\}|~)(?:\/|$)/;
// PLG-40: o `@` solto. Os `@` PARECIDOS (U+FF20 `＠` e U+FE6B `﹫`: os dois únicos que a normalização NFKC leva a `@`, conferido por um laço pelo Unicode inteiro) são trocados por `@` SÓ para decidir; o texto que
// sai continua sendo o original (ou `<definir>`). Um argumento solto com `@` parecido some por inteiro: nunca é nome de pacote nem SSH do Git.
const ARROBAS_PARECIDAS = /[＠﹫]/g;
const comArrobaNormal = (v) => v.replace(ARROBAS_PARECIDAS, '@');
const NOME_DE_PACOTE = /^[A-Za-z0-9][\w.-]*$/;
const ESCOPO_E_NOME = /^@[A-Za-z0-9][\w.-]*\/[\w.-]+$/;
// PLG-40 (seguimento): rótulo de versão SEM texto livre e SEM quantificador aninhado ambíguo. Cada peça é uma regex curta e sem ambiguidade (um separador fixo entre as repetições, ou nenhuma repetição aninhada); o sufixo é
// cortado por `split('.')` e olhado segmento a segmento; o comprimento total é limitado antes de qualquer teste (VERSAO_MAX).
const ROTULO_DE_TAG = /^(?:latest|next|beta|alpha|canary|stable|rc)(?:[.-]?[0-9]{1,4})?$/;
const NUCLEO_NUMERICO = /^[\^~]?v?[0-9]{1,6}(?:\.[0-9]{1,6}){0,2}$/; // de 1 a 3 números de ATÉ 6 dígitos (PLG-42: eram 10); QUATRO números com ponto (`10.0.0.1`, `1.2.3.4`) têm cara de endereço IP e não são versão
const SEGMENTO_DE_PRE = /^(?:[0-9]{1,8}|(?:alpha|beta|rc|pre|dev|canary|next|nightly|snapshot)[0-9]{0,4})$/; // um segmento do sufixo: só dígitos (ATÉ 8: uma data `20240101`), ou palavra de pré-lançamento conhecida com número opcional colado de ATÉ 4 dígitos (PLG-42: eram 10)
const SO_DIGITOS = /^[0-9]+$/;
const DIGEST = /^(?:sha1:[0-9A-Fa-f]{40}|sha256:[0-9A-Fa-f]{64}|sha384:[0-9A-Fa-f]{96}|sha512:[0-9A-Fa-f]{128})$/; // comprimentos EXATOS: um hexadecimal curto pode ser segredo
const VERSAO_MAX = 135; // o maior rótulo possível é o digest `sha512:` (7 + 128)
// O que vem depois do `@` é um RÓTULO DE VERSÃO (e não um host nem um segredo), por ESTRUTURA: (a) tag conhecida (`latest`, `next`, `beta`, `alpha`, `canary`, `stable`, `rc`) com número opcional de até 4 dígitos (`rc1`, `rc.2`, `beta-3`);
// (b) número de 1 a 3 partes com `^`, `~` e `v` opcionais (`1`, `1.2`, `1.2.3`, `^1.2.3`, `v1.2`), seguido de nada ou de `-`/`+` e até 4 segmentos separados por `.`, cada um SÓ de dígitos ou de uma palavra de pré-lançamento
// conhecida (`alpha`, `beta`, `rc`, `pre`, `dev`, `canary`, `next`, `nightly`, `snapshot`) com número opcional colado (`1.2.3-beta.1`, `1.2.3-rc.2`, `1.2.3+20240101`); PLG-42: os números têm TETO (até 6 dígitos em cada parte do núcleo, até 8 num segmento só de dígitos do sufixo, até 4 colados a uma palavra: `rc1234`), e um sufixo de três segmentos ou mais só de dígitos (`10.0.0.1`) não é rótulo.
// LIMITE dito: um segredo SÓ DE DÍGITOS que caiba nesses tetos e esteja na posição da versão sai (é o mesmo limite de `ZQXWV9@1.2`); (c) `sha1:`, `sha256:`, `sha384:` ou `sha512:` com os 40, 64, 96 ou 128 hexadecimais
// exatos. Qualquer outra coisa depois do `-` ou do `+` (`1.2.3-ZQXWV9`, `v1-ghp_...`) NÃO é rótulo e o argumento some. Um host (`h.io`, `srv:22`, `srv:/app`, `github.com/org/repo`) nunca é.
function ehRotuloDeVersao(r) {
  if (r.length === 0 || r.length > VERSAO_MAX) return false;
  if (DIGEST.test(r) || ROTULO_DE_TAG.test(r)) return true;
  const k = r.search(/[-+]/);
  const nucleo = k === -1 ? r : r.slice(0, k);
  if (!NUCLEO_NUMERICO.test(nucleo)) return false;
  if (k === -1) return true;
  const segmentos = r.slice(k + 1).split('.');
  if (segmentos.length > 4 || !segmentos.every((s) => SEGMENTO_DE_PRE.test(s))) return false;
  // PLG-42: um sufixo de TRÊS segmentos ou mais, todos só de dígitos (`10.0.0.1`, `1.2.3.4`: o IPv4 depois do `-` ou do `+`), não é rótulo de versão: tem cara de endereço, e é um jeito de passar números livres pelo sufixo.
  return !(segmentos.length >= 3 && segmentos.every((s) => SO_DIGITOS.test(s)));
}
// Pacote COM versão: `nome@rótulo` (`mcp-remote@latest`, `firecrawl-mcp@1.2.3`) ou `@escopo/nome@rótulo`. O texto antes do `@` tem forma de nome de pacote (sem `/` antes do `@`, sem `:`).
// LIMITES conhecidos: `ZQXWV9@1.2` (segredo no lugar do nome e versão no lugar certo) e `pkg@sha256:` com 64 hexadecimais que é segredo de fato têm a mesma forma de um pacote com versão e SAEM. Sem rótulo de versão depois do `@`, tudo some (na dúvida, esconde):
// `usuario@host`, `deploy@srv:/app`, `user@host:22` e e-mail (`a@b.com`) somem, assim como `ZQXWV9@h.io`, `token@github.com/org/repo` e `@escopo/nome@ZQXWV9`; também somem `pkg@1.2.3-ZQXWV9`, `pkg@1.2.3+ZQXWV9`, `pkg@v1-ghp_...`, `@escopo/pacote@dev`, `@escopo/pacote@nightly`, `@escopo/pacote@lts` e `@escopo/pacote@1.x` (falso positivo aceito). PLG-42: também somem, falso positivo aceito e dito no texto, `@escopo/pacote@experimental`, `@escopo/pacote@1.2.3-canary.5a8d6c5` (segmento com hexadecimal de commit) e `pkg@1.2.3+build.5` (`build` não é palavra de pré-lançamento conhecida), e o número maior que os tetos (`pkg@20240101`, `pkg@1234567890.1234567890.1234567890`). `registro/img@sha256:...` e `img:tag@sha256:...` (com `/` ou `:` antes do `@`) também somem (falso positivo aceito).
function pacoteComVersao(v) {
  const j = v.indexOf('@', 1);
  if (j === -1) return false;
  const nome = v.slice(0, j);
  const versao = v.slice(j + 1);
  if (versao.includes('@')) return false;
  return (NOME_DE_PACOTE.test(nome) || ESCOPO_E_NOME.test(nome)) && ehRotuloDeVersao(versao);
}
// `@escopo/nome` ou `@escopo/nome@versão` (a versão precisa ser rótulo de versão): "claramente o nome de um recurso".
const pacoteComEscopo = (v) => v.startsWith('@') && (ESCOPO_E_NOME.test(v) || (pacoteComVersao(v) && ESCOPO_E_NOME.test(v.slice(0, v.indexOf('@', 1)))));

// Um valor solto (argumento sem opção na frente, ou o valor de uma opção). Devolve { texto, claro }: `claro` é "é claramente o nome de um recurso" (caminho
// portátil, pacote com escopo, URL limpa). Por estrutura, nesta ordem: caminho de máquina; JSON (só as chaves); URL (sem usuário, senha, parâmetros e âncora; esquema
// que não é http(s) some); `nome=valor` (só o nome); `Nome: valor` (só o nome); qualquer outro `=` (tudo some).
function tratarValor(v, sede, casa, marca) {
  const definir = { texto: MARCA_DEFINIR, claro: false };
  if (v === MARCA_DEFINIR) return definir;
  const vn = comArrobaNormal(v); // PLG-40: só para DECIDIR as regras do `@`; o que sai é `v` ou `<definir>`
  const p = portatilizar(v, sede, casa);
  if (p.valor !== v) { if (p.ajuste) marca.ajuste = true; return { texto: p.valor, claro: p.valor !== MARCA_DEFINIR }; }
  if (/^\s*[[{]/.test(v)) {
    marca.ajuste = true;
    try { return { texto: JSON.stringify(soAsChaves(JSON.parse(v))), claro: false }; } catch { return definir; }
  }
  if (v.startsWith('//')) { // PLG-38: URL sem esquema (`//usuario:S@host/db`, também com `＠` de largura total): a mesma limpeza das URLs com esquema; o que não é URL válida some por inteiro
    const u = vn.includes('@') ? null : urlSegura(`https:${v}`);
    if (!u) { marca.ajuste = true; return definir; }
    const limpa = u.url.replace(/^https:/, '');
    // PLG-39: sem ponto no host (`//SEGREDO`, `//s3cr3t`) não dá para saber se é host ou segredo: some por inteiro (na dúvida, esconde). Só segue o que tem cara de host: com ponto (`//h.io/x`) ou `localhost`.
    const host = limpa.slice(2).split(/[/?#:]/, 1)[0];
    if (!host.includes('.') && host !== 'localhost') { marca.ajuste = true; return definir; }
    if (u.ajuste) { marca.ajuste = true; return { texto: limpa, claro: false }; }
    // PLG-39: nada foi removido: o argumento volta COMO VEIO (a normalização da URL, que põe o host em minúsculas, não pode alterar o texto em silêncio: `//Host.IO/x` não vira `//host.io/x`).
    // Só é "claramente um recurso" quando a forma limpa é idêntica ao original.
    return { texto: v, claro: limpa === v };
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(v)) {
    const u = urlSegura(v);
    if (!u) { marca.ajuste = true; return definir; }
    if (u.ajuste) marca.ajuste = true;
    return { texto: u.url, claro: !u.ajuste };
  }
  const nomeAtrib = nomeDaAtribuicao(v, /^[A-Za-z_][A-Za-z0-9_.-]*$/);
  if (nomeAtrib !== null) { marca.ajuste = true; return { texto: `${nomeAtrib}=${MARCA_DEFINIR}`, claro: false }; }
  if (/^[A-Za-z_][A-Za-z0-9_.-]*=/.test(v)) { marca.ajuste = true; return definir; } // PLG-39: tem forma de atribuição, mas o "nome" é comprido ou o valor é vazio/só `=` (base64 com preenchimento): tudo some
  const cabecalho = v.match(/^([A-Za-z][A-Za-z0-9-]*):\s+\S/);
  if (cabecalho) { marca.ajuste = true; return { texto: `${cabecalho[1]}: ${MARCA_DEFINIR}`, claro: false }; }
  const comDoisPontos = v.match(/^([A-Za-z][\w.-]*):./);
  if (comDoisPontos && nomeSensivel(comDoisPontos[1])) { marca.ajuste = true; return { texto: `${comDoisPontos[1]}:${MARCA_DEFINIR}`, claro: false }; } // `token:valor` solto, com chave sensível
  const doisPontos = v.indexOf(':'); // PLG-39: teste linear (antes era `/:.*[@＠]/s`, quadrático)
  if (doisPontos !== -1 && vn.slice(doisPontos + 1).includes('@')) { marca.ajuste = true; return definir; } // PLG-38: `usuario:S@host` sem esquema (também com `＠`): um `@` depois de `:` é usuário e senha, tudo some
  // PLG-39 e PLG-40: o `@` solto (sem `:` depois dele). O texto antes do `@` pode ser o segredo (`token@github.com/org/repo`, `S@host`). Com um `@` PARECIDO (`＠`, `﹫`) some por inteiro. Com `@` e texto antes, some, salvo
  // `git@host:caminho` (SSH do Git) e o PACOTE COM VERSÃO (`mcp-remote@latest`, `firecrawl-mcp@1.2.3`, `img@sha256:...`, `@escopo/nome@1.2.3`: nome de pacote antes do `@` e rótulo de versão depois; ver `pacoteComVersao`).
  // `usuario@host` e e-mail (domínio com ponto) somem (na dúvida, esconde). `@nome` e `@escopo/nome` (um `@` só, no começo) seguem como palavra solta; um segundo `@` (`@a/b@S`) só passa se for pacote com escopo e versão.
  if (v !== vn) { marca.ajuste = true; return definir; }
  if (v.includes('@') && !(v.startsWith('@') && v.indexOf('@', 1) === -1) && !pacoteComVersao(v) && !gitSshOk(v)) { marca.ajuste = true; return definir; }
  if (/\s/.test(v) || v.includes('=')) { marca.ajuste = true; return definir; } // palavra solta com espaço (inclusive uma linha de comando inteira) ou com `=` que sobrou: tudo some
  return { texto: v, claro: RECURSO_PORTATIL.test(v) || pacoteComEscopo(v) };
}

// Argumentos de servidor MCP (o `command` entra como uma lista de um item). O que o código GARANTE, por estrutura (não por heurística), em qualquer forma da opção
// (`-e NOME=v`, `-eNOME=v`, `-e=NOME=v`, `--env NOME=v`, `--env=NOME=v`; o mesmo para `-H`/`--header`, inclusive colado como `-HNome:v`), e também DEPOIS de um `--`
// (o `--` de um servidor MCP não encerra as opções dele):
//  - é opção todo argumento que começa com `-` (qualquer caractere depois: letra, dígito, `_`, letra não ASCII) ou com `/` (estilo Windows: `/password abc`, `/p:abc`),
//    desde que não seja um caminho de máquina (esse é portatilizado);
//  - depois de `-e`/`--env` só o nome da variável fica (e o nome solto, `-e NOME`, vira `<definir>`); depois de `-H`/`--header` só o nome do cabeçalho;
//  - de qualquer `nome=valor` (maiúsculo, minúsculo ou misto) só o nome fica; JSON só com as chaves; URL sem usuário, senha, parâmetros e âncora; `Nome: valor` só o nome;
//    `chave:valor` solto com chave sensível (`token:x`, `password:x`) só a chave;
//  - o valor de uma opção com nome sensível (`--api-key`, `--token=`, `/password`, `-p`, `-password`) vira `<definir>`;
//
// O desenho é uma MÁQUINA DE ESTADOS, não uma lista de formatos. Cada argumento é uma opção (começa com `-` ou `/`), um `--` ou uma palavra. O estado é "a opção anterior espera um valor"
// (opção sensível, de ambiente, de cabeçalho, segura ou desconhecida; só a bandeira conhecida sem valor, `--no-*` e a opção com valor colado não ligam o estado; `--x=` com `=` vazio liga):
//  - com o estado ligado, o argumento seguinte É o valor, mesmo que pareça opção (`--token --abc`, `-p -abc`, `--foo --bar`), e vira `<definir>`, salvo opção segura conhecida (`--transport`,
//    `--nome`, `--port`...) com valor que não pareça opção, ou valor claramente de recurso (caminho portátil, pacote com escopo, URL limpa): na dúvida, esconde;
//  - EXCEÇÃO, só estes casos: opção sensível (`--token`, `--api-key`, `-p`, `-password`, `/password`), de ambiente (`-e`, `--env`), de cabeçalho (`-H`, `--header`) e a forma `--x=valor`.
//    Continuam sendo opção, com o nome visível, e ligam o estado de novo (`--headless --api-key x`, `--port --token x`);
//  - depois de consumir um argumento com cara de opção como valor, o seguinte também é lido pelo estado (fica escondido), nunca copiado solto;
//  - (PLG-37) com o estado ligado, o `--` e o argumento que não é texto (número, nulo, objeto) também são o VALOR: viram `<definir>` e o estado CONTINUA ligado para o seguinte
//    (`--api-key -- X`, `--token 5 X`). Sem estado ligado, o `--` passa e o não-texto vira `<definir>` sem ligar nada;
//  - (PLG-37) o nome é sensível pelas palavras `key`, `token`, `secret`, `pass`, `senha`, `chave`, `auth`, `cookie`... (dentro do nome) e, por PALAVRA INTEIRA (hífen, ponto, sublinhado, dígito ou fronteira de
//    maiúscula), `pat`, `dsn`, `sas`, `jwt`, `connection-string`, `webhook`, `signature`, `sig`, `bearer`, `api-key`, `private`, `credential`, `cert`, `session`, `cookie`, `otp`, `pin`, `salt`; `--patch`,
//    `--passo` e `--design` não casam. Também por lista: formas coladas em minúsculas e comuns (`--mywebhook`, `--webhookurl`, `--slackwebhook`, `--mypat`, `--githubpat`, `--dsnurl`...). LIMITE: nome colado
//    em minúsculas FORA dessa lista (`--zzpat`, `--xdsn`) NÃO é reconhecido como sensível;
//  - (PLG-37) o NOME de uma opção longa só tem letra (inclusive não ASCII), dígito, `_`, `.` e `-`. Qualquer outro caractere no nome (`--token:ABC`, `--password:x`, `--user:S@host`, `--https://u:p@h/db`) é valor colado: o argumento
//    INTEIRO vira `<definir>` (nome e valor), e o estado fica ligado para o seguinte. `--nome=ok` e `--url=https://h/p` seguem como antes;
//  - (PLG-38) um argumento de UM traço só com mais de uma letra: (a) agrupamento só de bandeiras conhecidas sem valor (`-vv`, `-vvv`, `-yv`) é bandeira e não liga nada; (b) nome inteiro em minúsculas feito SÓ de palavras
//    sensíveis conhecidas, sem letra sobrando (`-accesskey S`, `-apitoken S`, `-passphrase S`, `-accesskey=S`) é nome de opção longa: o nome fica visível, o valor colado e o argumento seguinte viram `<definir>`; (c) qualquer outro (`-vp S`, `-Xmx2g`, `-pSEGREDO`,
//    `-accessKey S`, `-pmysecret=x`, `-ksecretabc=1`) é ambíguo (valor colado à opção curta OU nome longo): sai `-x<definir>` (só as duas primeiras letras ficam; o valor colado some, inclusive o base64 com `=` ou `==` no fim: `-kQWx==` sai `-k<definir>`; só `-Dnome=valor`, com nome de até 32 caracteres e valor depois do `=`, mostra o nome) e o argumento seguinte também é escondido,
//    salvo quando o valor já veio colado (`=` ou `:` no meio com algo depois); terminar em `=` ou `:` (`-vp=`, `-accessKey:`) deixa o valor para o argumento seguinte, que é escondido.
//    Falso positivo aceito: `-Xmx2g` esconde também o argumento depois dele;
//  - (PLG-38) com o estado ligado, a string VAZIA também é o VALOR (`<definir>`) e o estado continua ligado (`--api-key "" S`); sem estado ela fica como está;
//  - (PLG-39) o NOME de um `nome=valor` só aparece quando tem cara de nome: até 32 caracteres, só `[A-Za-z_][A-Za-z0-9_.-]*` e DEPOIS do primeiro `=` há algo que não é só `=`. Valor que termina em `=` ou `==` depois de letras e dígitos
//    (base64 com preenchimento, `QWxh...ZQ==`) some por INTEIRO, nome e valor: solto, valor de opção, `-kQWx==`, `-e QWx==`; PLG-40: o valor depois do primeiro `=` é APARADO antes de olhar, então `QWx==` seguido de espaço, tabulação ou quebra de linha também some (a PLG-39 dizia "em qualquer forma" e não valia para isso). Falso positivo aceito: nome com mais de 32 caracteres e `NOME=` com valor vazio também somem inteiros. LIMITE conhecido (PLG-40): um segredo no lugar do NOME (`S=1`, `-kS=1`, `--foo=S=1`) sai como nome (`S=<definir>`): por estrutura tem cara de nome, e o código não usa lista de nomes;
//  - (PLG-39) com o estado ligado, a string só de espaço em branco (espaço, tabulação, quebra de linha, espaço de largura total) também é o VALOR, como a vazia; PLG-40: o mesmo vale para a string SEM NENHUM caractere de letra, número, pontuação ou símbolo (`INVISIVEL`: espaço e separadores, controle, formato, marcas de combinação, seletores de variação, uso privado, sem designação, não-caracteres; mais U+2800, U+3164, U+115F, U+1160 e U+FFA0). Sem estado ligado: a vazia (`""`) fica como está; a só de espaço em branco vira `<definir>` (é palavra solta com espaço, e some); o argumento que contém QUALQUER caractere que carrega dados sem aparecer (formato Cf, uso privado Co, sem designação Cn, substituto solto Cs, controle Cc que não é espaço em branco, seletor de variação, caractere de tag; ver `OCULTO_NO_ARGUMENTO`) vira `<definir>` por INTEIRO, só, ou colado a uma palavra (`abc` + caracteres de tag), com ou sem estado ligado (PLG-42: a 1.2.7 dizia que a invisível sozinha ficava como está; era falso: esses caracteres carregam dados, e o argumento saía copiado). Falso positivo aceito: o emoji com junção (U+200D) e o texto de direita para a esquerda com marca de direção (U+200E, U+200F) somem também;
//  - (PLG-39 e PLG-40) argumento solto com um `@` PARECIDO (`＠` U+FF20, `﹫` U+FE6B) some; com `@` e texto antes (`token@host/caminho`, `S@host`, `usuario@host`, `deploy@srv:/app`, e-mail) some, salvo `git@host:caminho`, o pacote com escopo (`@escopo/nome`) e o PACOTE COM VERSÃO (`mcp-remote@latest`, `firecrawl-mcp@1.2.3`, `img@sha256:...`, `@escopo/nome@1.2.3`: nome de pacote antes do `@` e rótulo de versão, sem texto livre, depois; ver `ehRotuloDeVersao`; LIMITES: `ZQXWV9@1.2` e `sha256:` com 64 hexadecimais que é segredo saem). `//host.io/x` sem `@` e com ponto no host volta COMO VEIO (a limpeza não pode mudar
//    o texto em silêncio); sem ponto no host (`//SEGREDO`, `//s3cr3t`) some inteiro; depois de uma opção que espera valor só passa a URL limpa e idêntica (limite: um segredo com ponto que começa com `//` não é reconhecido);
//  - (PLG-38) argumento solto que começa com `//` (URL sem esquema) recebe a limpeza das URLs com esquema e, se tem `@` ou `＠` (largura total), some por inteiro; `usuario:S@host` sem esquema (um `@`/`＠` depois de `:`) também some inteiro;
//  - PERDA ACEITA (na dúvida, esconde): uma opção comum ou bandeira logo depois de uma opção que espera valor é lida como o valor dela e perde o nome (`--foo --bar` sai `--foo <definir>`);
//  - cada argumento de entrada dá exatamente um argumento de saída, na mesma posição: nada é removido, só trocado por `<definir>`;
//  - argumento solto com espaço (inclusive o `command` com a linha de comando inteira) vira `<definir>`;
//  - caminho de máquina em qualquer posição é portatilizado quando é só um caminho e vira `<definir>` inteiro nos demais.
// O que NÃO garante, e é copiado: palavra solta que não segue uma opção que espera valor, sem espaço, sem `=` e sem chave sensível (`servidor admin senha123`, `user:pass`, `X-Api:y`); palavra
// solta depois de bandeira conhecida (`-y`, `--stdio`, `--no-*`) ou depois do `--` sem opção; o valor de uma opção segura conhecida (`--port x`, `--nome x`, `--directory x`), por ser da lista de
// opções seguras; o argumento logo depois de QUALQUER opção que espera valor, quando ele mesmo é opção sensível, de ambiente ou de cabeçalho, ou `--x=valor` (`--api-key --token-ABC123`, `--foo --token-ABC123`: ele é lido como nova opção e o NOME dela sai visível; o valor colado de `--x=valor` some, mas um
// segredo posto no próprio nome sai: LIMITE do desenho, conhecido e documentado; é o preço de manter o nome das opções); nome de opção sensível que não está na lista (a lista é de palavras, não de todas as formas possíveis); lista com vírgula sem `=` nem `:`; um trecho de caminho de URL só some quando tem 24 caracteres ou mais, com letra e número (`https://h/hooks/abc123` passa).
// Só a varredura heurística pode pegar esses casos; por isso o `registrar` mostra o que vai ser gravado e a pessoa confere o diff antes do commit.

// PLG-38: nome de opção de um traço feito SÓ de palavras sensíveis conhecidas (`-accesskey`, `-apitoken`, `-secretkey`, `-privatekey`...), sem letra sobrando: o nome pode ser mostrado.
const NOME_CONHECIDO_DE_UM_TRACO = /^-(?:access|api|auth|client|private|secret|session|bearer|refresh|token|key|pass(?:word|wd|phrase)?|pwd|credentials?|cert|pat|dsn|jwt|cookie|signature|webhook|senha|chave|segredo)(?:[-_.]?(?:access|api|auth|client|private|secret|session|bearer|refresh|token|key|pass(?:word|wd|phrase)?|pwd|credentials?|cert|pat|dsn|jwt|cookie|signature|webhook|senha|chave|segredo))*$/;

// Lê um argumento como opção. Devolve null (não é opção), { escondido: true } (parece opção, mas não dá para separar nome e valor) ou { opcao, sep, valor } (`valor` indefinido: sem valor colado).
function lerOpcao(arg) {
  if (arg.startsWith('--')) {
    const m = arg.match(/^(--[^=\s]+)(?:=([\s\S]*))?$/);
    // PLG-37: o NOME de uma opção longa só tem letra (inclusive não ASCII: `--ação`), dígito, `_`, `.` e `-`. Qualquer outro caractere (`:`, `/`, `@`...) é valor colado no nome
    // (`--token:ABC`, `--user:S@h`, `--https://u:p@h/db`): o argumento INTEIRO é escondido (`<definir>`), nome e valor.
    return m && /^--[\p{L}\p{N}_.-]+$/u.test(m[1]) ? { opcao: m[1], sep: '=', valor: m[2] } : { escondido: true };
  }
  if (arg.startsWith('-')) {
    const nomeDoArg = arg.split('=')[0];
    const nomeCompleto = nomeDoArg.toLowerCase();
    const temIgual = arg.includes('=');
    if (NOMES_LONGOS_DE_UM_TRACO.has(nomeCompleto)) { // `-password abc`, `-token=abc`: o nome inteiro, sem valor colado
      return { opcao: arg.slice(0, nomeCompleto.length), sep: temIgual ? '=' : '', valor: temIgual ? arg.slice(nomeCompleto.length + 1) : undefined };
    }
    const c = Array.from(arg);
    if (c.length < 2 || /\s/.test(c[1])) return null;
    const opcao = c[0] + c[1];
    const resto = c.slice(2).join('');
    if (resto === '') return { opcao, sep: '', valor: undefined };
    // PLG-38: agrupamento de bandeiras conhecidas sem valor (`-vv`, `-vvv`, `-yv`): todas as letras são bandeira; não liga o estado.
    if (c.slice(1).every((x) => LETRAS_DE_BANDEIRA.has(x))) return { opcao: arg, sep: '', valor: undefined, repetida: true };
    // PLG-38: um traço só com mais de uma letra cujo nome INTEIRO (antes do `=`) é só letra minúscula e só palavras sensíveis conhecidas, sem sobra (`-accesskey S`, `-apitoken=S`, `-secret-key`): é o NOME
    // de uma opção longa. O nome fica visível; o valor (colado depois do `=` ou o argumento seguinte) some. Com qualquer letra a mais (`-pmysecret`, `-ksecretabc`) o nome pode ser segredo colado: não é mostrado.
    if (/^-[a-z][a-z_.-]+$/.test(nomeDoArg) && NOME_CONHECIDO_DE_UM_TRACO.test(nomeDoArg)) {
      return { opcao: nomeDoArg, sep: temIgual ? '=' : '', valor: temIgual ? arg.slice(nomeDoArg.length + 1) : undefined };
    }
    const sep = resto.startsWith('=') ? '=' : '';
    // PLG-38: qualquer outro `-xyz...` (`-pSEGREDO`, `-Xmx2g`, `-vp`, `-accessKey`) é ambíguo (valor colado à opção curta, ou nome longo de um traço). Ele inteiro vira valor colado (`-x<definir>`) E a opção
    // espera o argumento seguinte, que também fica escondido (na dúvida, esconde; o falso positivo, como `-Xmx2g` e o argumento depois dele, é aceito). Só NÃO espera quando o valor já veio colado: tem `=` ou `:`
    // no meio e algo depois dele. Terminar em `=` ou `:` (`-vp=`, `-accessKey:`, base64 com preenchimento `-kQWx==`) deixa o valor para o argumento seguinte. O que vem depois da segunda letra é valor colado e some
    // (`-x<definir>`); a exceção é `-xnome=valor` (`-Dfoo=bar`: o nome, de até 32 caracteres, fica visível e o valor some); com valor vazio ou só `=` depois do primeiro `=` o argumento some inteiro. Com palavra sensível no nome (`-ksecretabc=1`) o nome também some.
    return { opcao, sep, valor: resto.slice(sep.length), espera: !/[=:]/.test(arg) || /[=:]$/.test(arg), ocultar: temIgual && nomeSensivel(nomeDoArg) };
  }
  if (arg.startsWith('/') && !caminhoDeMaquina(arg)) {
    const m = arg.match(/^(\/[^/\s:=]+)(?:([:=])([\s\S]*))?$/);
    if (m) return { opcao: m[1], sep: m[2] ?? '', valor: m[3] };
  }
  return null;
}

export function argumentosDoMcp(args, sede, casa, marca) {
  const saida = [];
  let pendente = null; // o estado: a opção anterior (ou null), quando o próximo argumento é o valor dela
  const OCULTO = { env: false, cabecalho: false, sensivel: false, seguro: false, estrita: false }; // depois de um argumento com cara de opção usado como valor: o seguinte ainda é lido pelo estado
  // PLG-42: depois de um argumento com cara de opção que carrega caractere oculto (não dá para separar nome e valor, nem saber que opção era): o seguinte some por INTEIRO, como depois de opção sensível (e o estado continua se ele
  // também for opção sensível, de ambiente ou de cabeçalho). Nunca o OCULTO, que copia o que parece claro (`https://h.io/S`, `~/S`, `@escopo/nome`) e filtra o resto.
  const ESTRITO = { env: false, cabecalho: false, sensivel: true, seguro: false, estrita: true };
  const opcaoDe = (nome) => {
    const env = OPCOES_DE_ENV.has(nome);
    const cabecalho = OPCOES_DE_CABECALHO.has(nome);
    const sensivel = nomeSensivel(nome) || OPCOES_ESTRITAS_CURTAS.has(nome);
    return { env, cabecalho, sensivel, seguro: OPCOES_SEGURAS.has(nome), estrita: env || cabecalho || sensivel };
  };
  // Com o estado ligado, só isto ainda é opção (e liga o estado de novo, com o nome visível): sensível, de ambiente ou de cabeçalho, e a forma `--x=valor`. Qualquer outra vira o valor.
  const continuaComoOpcao = (o) => !o.escondido && (opcaoDe(o.opcao).estrita || (o.sep !== '' && o.valor !== undefined && o.valor !== ''));
  const valorDe = (o, valor) => {
    if (o.env) return soONomeDaVariavel(valor, marca);
    if (o.cabecalho) return soONomeDoCabecalho(valor, marca);
    if (o.sensivel) { marca.ajuste = true; return MARCA_DEFINIR; }
    const t = tratarValor(valor, sede, casa, marca);
    if (t.texto !== valor || t.claro || (o.seguro && !/^[-/]/.test(valor))) return t.texto; // valor com cara de opção (`-x`, `/x`) nunca passa só por a opção ser segura
    marca.ajuste = true; // na dúvida, esconde
    return MARCA_DEFINIR;
  };
  for (const arg of args) {
    // Argumento que não é texto (número, nulo, objeto): sempre `<definir>`. Com o estado ligado ele é o VALOR da opção e o estado continua ligado para o seguinte (`--token 5 SEGREDO`).
    // (Opção segura conhecida: o valor dela é um só; o segundo argumento já é lido como OCULTO, que não copia texto solto.)
    if (typeof arg !== 'string') { marca.ajuste = true; saida.push(MARCA_DEFINIR); if (pendente?.seguro) pendente = OCULTO; continue; }
    // O `--` não encerra as opções: o que vem depois é lido do mesmo jeito. Com o estado ligado ele é o VALOR da opção (`--api-key -- SEGREDO`): vira `<definir>` e o estado continua ligado.
    if (arg === '--') {
      if (pendente) { marca.ajuste = true; saida.push(MARCA_DEFINIR); if (pendente.seguro) pendente = OCULTO; continue; }
      saida.push(arg); continue;
    }
    // PLG-42: o argumento (solto, valor de opção ou a própria opção) com qualquer caractere que carrega dados sem aparecer (`carregaDados`) vira `<definir>` por INTEIRO, com ou sem estado ligado. Feito SÓ de invisíveis e com o estado
    // ligado, ele é o valor da opção como a string vazia (o estado continua ligado, salvo a opção segura, que passa a ler o seguinte como OCULTO). Com letra junto (`abc` + caracteres de tag) é um valor comum: o estado acaba, como numa
    // palavra. Se parece opção (`-` ou `/` no começo), em qualquer posição do caractere oculto (colado ao nome, no meio, no fim), o seguinte some por inteiro (ESTRITO): pode ser o valor dela, e a opção real é desconhecida.
    if (carregaDados(arg)) {
      marca.ajuste = true;
      saida.push(MARCA_DEFINIR);
      if (pendente && soInvisivel(arg)) { if (pendente.seguro) pendente = OCULTO; } else pendente = /^[-/]/.test(arg) ? ESTRITO : null;
      continue;
    }
    const o = lerOpcao(arg);
    if (!o) { // palavra: é o valor da opção anterior, se houver; senão passa pelos filtros de estrutura
      // PLG-38: com o estado ligado, a string VAZIA é o valor (vira `<definir>`) e o estado continua ligado para o seguinte (como o `--` e o não-texto); sem estado ela fica como está.
      // PLG-39: o mesmo vale para a string só de espaço em branco (espaço, tabulação, quebra de linha, espaço de largura total): `--api-key " " S`.
      // PLG-40: e para a string sem nenhum caractere de letra, número, pontuação ou símbolo (`INVISIVEL`: largura zero, controle, formato, marca, uso privado, separador...); a invisível que carrega dados já foi escondida antes (`carregaDados`).
      if (pendente && soInvisivel(arg)) { marca.ajuste = true; saida.push(MARCA_DEFINIR); if (pendente.seguro) pendente = OCULTO; continue; }
      saida.push(pendente ? valorDe(pendente, arg) : tratarValor(arg, sede, casa, marca).texto);
      pendente = null;
      continue;
    }
    if (pendente && !continuaComoOpcao(o)) { // estado ligado: o argumento seguinte É o valor, mesmo que pareça opção (na dúvida, esconde)
      saida.push(valorDe(pendente, arg));
      pendente = OCULTO; // o que vem depois também é lido pelo estado: nunca sai solto, em claro
      continue;
    }
    if (o.escondido) { marca.ajuste = true; saida.push(MARCA_DEFINIR); pendente = OCULTO; continue; }
    const info = opcaoDe(o.opcao);
    if (o.valor === undefined || o.valor === '') { // sem valor colado (ou `--x=` com `=` vazio): o valor, se houver, é o argumento seguinte
      saida.push(arg);
      const bandeira = o.valor === undefined && (o.repetida === true || BANDEIRAS_SEM_VALOR.has(o.opcao) || o.opcao.startsWith('--no-'));
      pendente = bandeira ? null : info;
      continue;
    }
    if (o.ocultar) marca.ajuste = true;
    saida.push(`${o.opcao}${o.sep}${o.ocultar ? MARCA_DEFINIR : valorDe(info, o.valor)}`);
    pendente = o.espera ? info : null; // PLG-38: `-xyz` ambíguo (valor colado OU nome longo de um traço): o argumento seguinte também é lido como valor
  }
  return saida;
}

function servidorMcp(nome, def, sede, casa) {
  const marca = { ajuste: false };
  const s = { nome };
  const d = ehObjeto(def) ? def : {};
  if (!ehObjeto(def)) marca.ajuste = true;
  const tipo = typeof d.type === 'string' && /^[a-z]{1,10}$/.test(d.type) ? d.type : (typeof d.url === 'string' ? 'http' : 'stdio');
  s.tipo = tipo;
  if (tipo === 'stdio') {
    s.comando = typeof d.command === 'string' ? argumentosDoMcp([d.command], sede, casa, marca)[0] : null;
    if (typeof d.command !== 'string') marca.ajuste = true;
    if (d.args !== undefined && !Array.isArray(d.args)) marca.ajuste = true;
    const args = lista(d.args);
    s.argumentos = argumentosDoMcp(args, sede, casa, marca);
  } else {
    const u = urlSegura(d.url);
    s.url = u ? u.url : null;
    if (!u || u.ajuste) marca.ajuste = true; // a parte depois do `?`, usuário e senha saem do arquivo
    s.cabecalhos = ehObjeto(d.headers) ? Object.keys(d.headers).sort() : [];
    if (s.cabecalhos.length > 0) marca.ajuste = true;
  }
  s.variaveis = ehObjeto(d.env) ? Object.keys(d.env).sort() : [];
  s.precisa_ajuste = marca.ajuste || s.variaveis.length > 0 || (s.cabecalhos?.length ?? 0) > 0;
  return s;
}

// Conjuntos de hooks do `settings.json` que não vêm de plugin. Só o nome e COMO refazer; o conteúdo nunca é copiado.
export const HOOKS_CONHECIDOS = [
  { nome: 'sala-animada', padrao: /[\\/]hooks[\\/]capture\.py/i, refazer: 'instalar-sala animada com hooks', como: 'o `hooks-install` da sala animada, pelo passo `animada` do instalar-sala.mjs' },
  { nome: 'repowise', padrao: /repowise/i, refazer: null, como: 'o instalador do próprio repowise (os hooks são dele)' },
];
const HOOK_DESCONHECIDO = { nome: 'outros', refazer: null, como: 'o instalador do programa que os criou (o plugin não sabe refazê-los)' };

export function hooksDoSettings(settings) {
  const conjuntos = new Map();
  if (!ehObjeto(settings?.hooks)) return [];
  for (const [evento, grupos] of Object.entries(settings.hooks)) {
    for (const g of lista(grupos)) {
      for (const h of lista(g?.hooks)) {
        const texto = String(h?.command ?? h?.url ?? h?.prompt ?? '');
        const def = HOOKS_CONHECIDOS.find((k) => k.padrao.test(texto)) ?? HOOK_DESCONHECIDO;
        if (!conjuntos.has(def.nome)) conjuntos.set(def.nome, { nome: def.nome, eventos: new Set(), refazer: def.refazer, como: def.como });
        conjuntos.get(def.nome).eventos.add(evento);
      }
    }
  }
  return [...conjuntos.values()].map((c) => ({ nome: c.nome, eventos: [...c.eventos].sort(), refazer: c.refazer, como: c.como })).sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
}

// ------------------------------------------------------------ ferramentas

const FERRAMENTAS = [
  { nome: 'node', comando: 'node', args: ['--version'], teto: 20 },
  { nome: 'python', comando: 'python', args: ['--version'], alternativa: 'python3', teto: 3.12 },
  { nome: 'uv', comando: 'uv', args: ['--version'] },
  { nome: 'git', comando: 'git', args: ['--version'] },
  { nome: 'gh', comando: 'gh', args: ['--version'] },
  { nome: 'gitleaks', comando: 'gitleaks', args: ['version'] },
];

const INSTALACAO = {
  winget: { node: 'winget install OpenJS.NodeJS.LTS', python: 'winget install Python.Python.3.12', uv: 'winget install astral-sh.uv', git: 'winget install Git.Git', gh: 'winget install GitHub.cli', gitleaks: 'winget install Gitleaks.Gitleaks' },
  brew: { node: 'brew install node', python: 'brew install python', uv: 'brew install uv', git: 'brew install git', gh: 'brew install gh', gitleaks: 'brew install gitleaks' },
  apt: { node: 'sudo apt install -y nodejs npm', python: 'sudo apt install -y python3', uv: null, git: 'sudo apt install -y git', gh: 'sudo apt install -y gh', gitleaks: null },
  dnf: { node: 'sudo dnf install -y nodejs', python: 'sudo dnf install -y python3', uv: null, git: 'sudo dnf install -y git', gh: 'sudo dnf install -y gh', gitleaks: null },
  pacman: { node: 'sudo pacman -S --noconfirm nodejs npm', python: 'sudo pacman -S --noconfirm python', uv: null, git: 'sudo pacman -S --noconfirm git', gh: 'sudo pacman -S --noconfirm github-cli', gitleaks: null },
};
const GERENCIADORES = { win32: [['winget', 'winget']], darwin: [['brew', 'brew']], linux: [['apt', 'apt-get'], ['dnf', 'dnf'], ['pacman', 'pacman']] };

function acharGerenciador(d, plataforma) {
  for (const [nome, programa] of GERENCIADORES[plataforma] ?? []) {
    if (d.rodar(programa, ['--version'], { tempo: 20000 }).status === 0) return nome;
  }
  return null;
}

const numeroDaVersao = (t) => String(t ?? '').match(/(\d+(?:\.\d+){1,2})/)?.[1] ?? null;

function lerFerramenta(d, f) {
  let r = d.rodar(f.comando, f.args, { tempo: 30000 });
  if (r.status !== 0 && f.alternativa) r = d.rodar(f.alternativa, f.args, { tempo: 30000 });
  if (r.status !== 0) return null;
  const versao = numeroDaVersao(primeiraLinha(r.stdout || r.stderr));
  return versao ? { versao } : null;
}

// Versão mínima: o maior número que não quebra quem reproduz. Maior que 0 → só o principal; 0.x → principal.secundário; com teto, o menor.
function minimaDe(versao, teto) {
  const [maior, menor = 0] = versao.split('.').map(Number);
  if (teto !== undefined) return Number.isInteger(teto) ? String(Math.min(maior, teto)) : String(Math.min(Number(`${maior}.${menor}`), teto));
  return maior === 0 ? `0.${menor}` : String(maior);
}

function ferramentasDaMaquina(d, plataforma) {
  const gerenciador = acharGerenciador(d, plataforma);
  const tabela = INSTALACAO[gerenciador] ?? {};
  const achadas = [];
  for (const f of FERRAMENTAS) {
    const v = lerFerramenta(d, f);
    if (!v) continue;
    achadas.push({ nome: f.nome, versao_minima: minimaDe(v.versao, f.teto), instalar: tabela[f.nome] ?? null });
  }
  return achadas;
}

// ------------------------------------------------------------ passos que são da pessoa

export const PASSOS_DA_PESSOA = [
  'Entrar na conta do Claude (login). O plugin nunca digita senha nem código.',
  'Reconectar os conectores do claude.ai (e-mail, agenda, arquivos e outros) em Configurações > Conectores.',
  'Preencher o `.env` de cada projeto a partir do `.env.example`: o valor é só da pessoa; o plugin nunca o lê nem o grava.',
  'Recriar as tarefas agendadas que existiam (a lista de tarefas não está neste arquivo).',
  'Aprovar a confiança de cada pasta na primeira abertura (o Claude pergunta uma vez por pasta).',
  'Autorizar de novo, em `/mcp`, os servidores MCP remotos que pedem login (a autorização é da conta e não vai neste arquivo).',
];

// ------------------------------------------------------------ varredura do que será gravado

const PADROES_DE_CHAVE = [
  /\bsk-[A-Za-z0-9_-]{16,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}/, /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/, /:\/\/[^\s/@:]+:[^\s/@]+@/,
];
const COM_CARA_DE_CHAVE = /^[A-Za-z0-9_+=-]{32,}$/; // texto corrido e comprido, sem barra nem ponto: com letra e número é quase sempre chave

function textoComSegredo(t) {
  if (typeof t !== 'string' || t === '') return false;
  if (PADROES_DE_CHAVE.some((p) => p.test(t))) return true;
  if (COM_CARA_DE_CHAVE.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t)) return true;
  return pareceSegredo(t);
}

// Anda por todo o dado e devolve só os CAMINHOS (nomes de campo) dos valores suspeitos; o valor nunca sai daqui.
export function varrer(dado, caminho = '') {
  const achados = [];
  const visita = (v, c, chave) => {
    if (typeof v === 'string') {
      if (chave === 'versao' && /^[0-9a-f]{40,64}$/.test(v)) return; // versão de plugin que é o hash de um commit: não é segredo
      if (textoComSegredo(v) || (chave === 'id' && v.split(SEPARADOR_DE_ID).some(parteDeIdComCaraDeChave))) achados.push(c || '(raiz)'); // o id `nome@catálogo` também por parte
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => visita(x, `${c}[${i}]`, chave)); return; }
    if (ehObjeto(v)) for (const [k, x] of Object.entries(v)) visita(x, c ? `${c}.${k}` : k, k);
  };
  visita(dado, caminho);
  return achados;
}

// Se o `gitleaks` existe, passa o texto por ele. Devolve { rodou, achou, falhou }: status 0 limpo, 1 achado, qualquer outro é falha (nunca "ausente").
function conferirNoGitleaks(texto, d) {
  const tem = d.rodar('gitleaks', ['version'], { tempo: 20000 });
  if (tem.status !== 0) return { rodou: false, achou: false, falhou: tem.erro !== 'ENOENT' }; // só "não existe" é ausência; existir e falhar é `falhou`
  const pasta = mkdtempSync(join(tmpdir(), 'intoca-ambiente-'));
  try {
    const arquivo = join(pasta, 'ambiente.yaml');
    writeFileSync(arquivo, texto);
    let r = d.rodar('gitleaks', ['detect', '--no-git', '--no-banner', '--redact', '--source', arquivo], { tempo: 60000 });
    if (r.status !== 0 && r.status !== 1) r = d.rodar('gitleaks', ['dir', '--no-banner', '--redact', arquivo], { tempo: 60000 }); // versões novas
    if (r.status === 1) return { rodou: true, achou: true, falhou: false };
    return r.status === 0 ? { rodou: true, achou: false, falhou: false } : { rodou: false, achou: false, falhou: true };
  } finally {
    try { rmSync(pasta, { recursive: true, force: true }); } catch { /* o sistema limpa a pasta temporária */ }
  }
}

// Caminho absoluto de máquina que sobrou em qualquer valor do que vai ser gravado: só o nome do campo sai.
export function varrerCaminhos(dado, caminho = '') {
  const achados = [];
  const visita = (v, c) => {
    if (typeof v === 'string') { if (caminhoDeMaquina(v)) achados.push(c || '(raiz)'); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => visita(x, `${c}[${i}]`)); return; }
    if (ehObjeto(v)) for (const [k, x] of Object.entries(v)) visita(x, c ? `${c}.${k}` : k);
  };
  visita(dado, caminho);
  return achados;
}

// ------------------------------------------------------------ registrar

// O nome da máquina no arquivo é um apelido neutro derivado do hostname por hash (nunca o hostname em claro); `--maquina=<apelido>` troca.
function apelidoDaMaquina(entrada, d) {
  if (entrada.maquina !== undefined) {
    if (typeof entrada.maquina !== 'string' || !/^[A-Za-z0-9][\w.-]{0,99}$/.test(entrada.maquina)) throw new Recusa('maquina-invalida', 'o apelido da máquina precisa ter letras, números, ponto, hífen ou sublinhado (até 100 caracteres)');
    return entrada.maquina;
  }
  if (d.maquina) return String(d.maquina);
  return `maquina-${createHash('sha256').update(String(hostname())).digest('hex').slice(0, 4)}`;
}

const dataDeHoje = (agora) => { const t = agora ? agora() : new Date(); const p = (n) => String(n).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; };

function montarAmbiente(entrada, d) {
  const c = contexto(d);
  const sede = achar(entrada, d);
  const bruto = lerClaude(c, d);
  const habilitados = ehObjeto(bruto.settings.enabledPlugins) ? bruto.settings.enabledPlugins : {};
  const declarados = ehObjeto(bruto.settings.extraKnownMarketplaces) ? bruto.settings.extraKnownMarketplaces : {};
  const claude = localizarClaude(d);
  const versaoDoClaude = claude ? numeroDaVersao(primeiraLinha(d.rodar(claude, ['--version'], { tempo: 20000 }).stdout)) : null;

  const nomesDeCatalogo = [...new Set([...Object.keys(ehObjeto(bruto.catalogos) ? bruto.catalogos : {}), ...Object.keys(declarados)])].sort();
  const catalogos = nomesDeCatalogo.map((n) => catalogoDe(n, (ehObjeto(bruto.catalogos?.[n]) ? bruto.catalogos[n].source : undefined) ?? (ehObjeto(declarados[n]) ? declarados[n].source : undefined), sede, c.casa));

  const plugins = [];
  const itens = ehObjeto(bruto.instalados?.plugins) ? bruto.instalados.plugins : {};
  for (const id of Object.keys(itens).sort()) {
    const porEscopo = lista(itens[id]).filter((e) => e?.scope === ESCOPO_DO_USUARIO);
    if (porEscopo.length === 0) continue;
    plugins.push({ id, versao: typeof porEscopo[0].version === 'string' ? porEscopo[0].version : '', habilitado: habilitados[id] !== false });
  }

  const brutosMcp = { ...(ehObjeto(bruto.settings.mcpServers) ? bruto.settings.mcpServers : {}), ...bruto.mcpDoUsuario };
  const servidores = Object.keys(brutosMcp).sort().map((n) => servidorMcp(n, brutosMcp[n], sede, c.casa));

  const perm = ehObjeto(bruto.settings.permissions) ? bruto.settings.permissions : {};
  const permissoes = { modo: typeof perm.defaultMode === 'string' && /^[A-Za-z]{1,30}$/.test(perm.defaultMode) ? perm.defaultMode : 'default', allow: lista(perm.allow).length, ask: lista(perm.ask).length, deny: lista(perm.deny).length };

  const ambiente = {
    versao: VERSAO_DO_FORMATO,
    registrado_em: { maquina: apelidoDaMaquina(entrada, d), data: dataDeHoje(d.agora), claude_code: versaoDoClaude },
    catalogos,
    plugins,
    servidores_mcp: servidores,
    hooks: hooksDoSettings(bruto.settings),
    permissoes,
    ferramentas: ferramentasDaMaquina(d, c.plataforma),
    passos_da_pessoa: PASSOS_DA_PESSOA,
  };
  return { ambiente, sede, avisosDeLeitura: bruto.avisos, contagens: { catalogos: catalogos.length, plugins: plugins.length, servidores_mcp: servidores.length, hooks: ambiente.hooks.length, ferramentas: ambiente.ferramentas.length } };
}

const CABECALHO = [
  '# Mapa do ambiente do Claude desta pessoa (InToca Sede): o mínimo para o plugin refazê-lo numa máquina nova.',
  '# Gerado por `/intoca:ambiente registrar`. Valores de env, de cabeçalho e de opções sensíveis nunca entram (só os nomes); sem caminho de máquina. Confira o diff antes do commit.',
  '# Não edite à mão sem conferir `docs/ambiente.md`.',
  '',
].join('\n');

export function textoDoAmbiente(ambiente) {
  return `${CABECALHO}${emitirYaml(ambiente).join('\n')}\n`;
}

// Compara dois ambientes e devolve frases curtas (nomes e versões; nada que a varredura não tenha liberado).
export function diferencasEntre(antes, depois) {
  const frases = [];
  const porChave = (lst, chave) => new Map(lista(lst).map((x) => [x?.[chave], x]));
  for (const [secao, chave, rotulo] of [['catalogos', 'nome', 'catálogo'], ['plugins', 'id', 'plugin'], ['servidores_mcp', 'nome', 'servidor MCP'], ['hooks', 'nome', 'hooks'], ['ferramentas', 'nome', 'ferramenta']]) {
    const a = porChave(antes?.[secao], chave);
    const b = porChave(depois?.[secao], chave);
    for (const [k, v] of b) {
      if (!a.has(k)) frases.push(`novo ${rotulo}: ${visivel(k, 60)}`);
      else if (JSON.stringify(a.get(k)) !== JSON.stringify(v)) frases.push(`${rotulo} mudou: ${visivel(k, 60)}${secao === 'plugins' && a.get(k).versao !== v.versao ? ` (${versaoVisivel(a.get(k).versao)} → ${versaoVisivel(v.versao)})` : ''}`);
    }
    for (const k of a.keys()) if (!b.has(k)) frases.push(`${rotulo} saiu: ${visivel(k, 60)}`);
  }
  if (JSON.stringify(antes?.permissoes) !== JSON.stringify(depois?.permissoes)) frases.push('permissões mudaram (modo ou contagem)');
  if (JSON.stringify(antes?.passos_da_pessoa) !== JSON.stringify(depois?.passos_da_pessoa)) frases.push('lista de passos da pessoa atualizada');
  if ((antes?.registrado_em?.claude_code ?? null) !== (depois?.registrado_em?.claude_code ?? null)) frases.push(`Claude Code: ${antes?.registrado_em?.claude_code == null ? '?' : versaoVisivel(antes.registrado_em.claude_code)} → ${depois?.registrado_em?.claude_code ?? '?'}`);
  return frases;
}

function lerAmbienteGravado(arquivo) {
  if (!existsSync(arquivo)) return null;
  if (statSync(arquivo).size > LIMITE_DO_ARQUIVO) throw new Recusa('ambiente-grande', 'o ambiente.yaml é grande demais para ser dele (limite de 256 KB): nada foi lido');
  const bruto = readFileSync(arquivo);
  return { ambiente: lerYaml(bruto.toString('utf8')), hash: createHash('sha256').update(bruto).digest('hex') };
}

function registrar(entrada, d) {
  const { ambiente, sede, avisosDeLeitura, contagens } = montarAmbiente(entrada, d);
  const bruto = entrada.saida !== undefined ? entrada.saida : (sede ? join(sede, ARQUIVO_NA_SEDE) : null);
  const destino = bruto === null ? null : caminhoPermitido(bruto, sede); // o destino de sempre passa pelo mesmo portão: links e nome
  if (!destino) throw new Recusa('sem-sede', 'não achei a sede: o ambiente.yaml mora em <sede>/diretoria. Rode /intoca:comecar para criar ou registrar a sede (ou entre na pasta dela) e tente de novo');
  const texto = textoDoAmbiente(ambiente);
  const achados = varrer(ambiente);
  if (achados.length > 0) {
    throw new Recusa('segredo-na-varredura', `a varredura achou algo com cara de segredo em ${achados.length} campo(s); nada foi gravado. Os campos: ${achados.join(', ')}. O valor não é mostrado: tire-o da fonte (use uma variável de ambiente) e registre de novo`, { campos: achados });
  }
  const caminhos = varrerCaminhos(ambiente);
  if (caminhos.length > 0) throw new Recusa('caminho-de-maquina', `sobrou caminho de máquina em ${caminhos.length} campo(s); nada foi gravado. Os campos: ${caminhos.join(', ')}`, { campos: caminhos });
  const leaks = conferirNoGitleaks(texto, d);
  if (leaks.achou) throw new Recusa('segredo-no-gitleaks', 'o gitleaks achou algo com cara de segredo no que seria gravado; nada foi gravado. O valor não é mostrado');
  const anterior = lerAmbienteGravado(destino)?.ambiente ?? null;
  const mudancas = anterior ? diferencasEntre(anterior, ambiente) : ['primeiro registro: o arquivo ainda não existia'];
  const base = { ok: true, acao: 'registrar', criados: [], jaExistiam: [], erros: [], arquivo: destino, contagens, gitleaks: leaks.rodou ? 'limpo' : (leaks.falhou ? 'falhou' : 'ausente'), ...(leaks.falhou ? { avisos: ['o gitleaks existe mas falhou ao rodar: a varredura do próprio script passou, mas a conferência do gitleaks não aconteceu. Diga isso à pessoa.'] } : {}), sedeAchada: Boolean(sede), mudancas };
  const avisosTotais = [...(base.avisos ?? []), ...avisosDeLeitura];
  if (avisosTotais.length > 0) base.avisos = avisosTotais;
  if (anterior && mudancas.length === 0) return { ...base, estado: 'sem-mudancas', aviso: 'O ambiente.yaml já está igual ao da máquina. Nada foi gravado.' };
  if (entrada.confirmado !== true) return { ...base, estado: 'aguardando-confirmacao', texto_a_gravar: texto, aviso: 'Nada foi gravado. Mostre à pessoa o `texto_a_gravar` (o que vai para o arquivo, palavra por palavra; no mínimo as seções servidores_mcp e plugins) e as mudanças e, só com o "sim" dela, rode de novo com --confirmado.' };
  mkdirSync(dirname(destino), { recursive: true });
  const provisorio = `${destino}.intoca-novo`;
  rmSync(provisorio, { force: true }); // um link deixado com este nome seria seguido pela escrita: sai o link (nunca o alvo) e o arquivo novo só é criado se o nome estiver livre
  writeFileSync(provisorio, texto, { flag: 'wx' });
  renameSync(provisorio, destino);
  return { ...base, estado: 'gravado', criados: anterior ? [] : [destino], jaExistiam: anterior ? [destino] : [], proximo: 'Confira o diff e faça o commit na sede, como de costume. O arquivo guarda só nomes de variáveis e de cabeçalhos, mas um valor num argumento comum de servidor MCP seria copiado: leia o diff antes de commitar.' };
}

// ------------------------------------------------------------ restaurar: o que vem do arquivo é hostil até a validação
// O `ambiente.yaml` mora no Git e pode ter sido alterado por quem não é a pessoa. Nada dele vira comando sem passar por um padrão
// estrito; item que não passa vira passo `recusada` no plano, com o motivo, e nunca é executado. O que o script EXECUTA vem de tabelas
// fixas deste arquivo (instalação das ferramentas, hooks conhecidos) e de valores validados (plugin, catálogo, servidor remoto).
// Texto do arquivo que aparece na saída passa por `visivel`: sem caractere de controle, curto e sem cara de segredo.

const NOME_RE = /^[A-Za-z0-9][\w.-]{0,99}$/;
const PLUGIN_ID_RE = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,99}@[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/; // sem `..`; só ASCII e um `@` ASCII: `＠` (largura total) e letras parecidas não passam
// Parte de um id (nome ou catálogo): o teste de chave vale também sem os pontos, porque o de texto corrido não aceita `.` (uma chave com pontos no meio passava).
// Uma parte do id (`nome` ou `catálogo`). Os pontos no meio de uma chave (`Ab1.Cd2.…`) escondiam o teste de texto corrido; sem os pontos, só vale quando sobra algo com cara de chave de
// verdade: maiúscula, minúscula e número juntos. Um nome legítimo com pontos (`com.empresa.produto.plugin.integracao.v2`) é minúsculo e passa.
const parteDeIdComCaraDeChave = (p) => {
  if (textoComSegredo(p)) return true;
  if (!p.includes('.')) return false;
  const junto = p.replace(/\./g, '');
  if (PADROES_DE_CHAVE.some((r) => r.test(junto)) || pareceSegredo(junto)) return true;
  return COM_CARA_DE_CHAVE.test(junto) && /[A-Z]/.test(junto) && /[a-z]/.test(junto) && /\d/.test(junto);
};
const SEPARADOR_DE_ID = /[@＠]/; // o `@` e o parecido de largura total: a varredura de chave olha cada parte, nunca o id inteiro
const GITHUB_RE = /^[A-Za-z0-9_][\w.-]{0,99}\/[A-Za-z0-9_][\w.-]{0,99}$/;
const GIT_SSH_RE = /^git@[A-Za-z0-9][A-Za-z0-9.-]{0,99}:[A-Za-z0-9_~][\w.~/-]{0,199}$/; // host e caminho não começam por "-" nem "."; sem ".." no caminho (ver `gitSshOk`)
const gitSshOk = (v) => typeof v === 'string' && GIT_SSH_RE.test(v) && !v.split(':')[1].split('/').includes('..');
const VARIAVEL_RE = /^[A-Za-z_][\w-]{0,99}$/;
const VERSAO_MINIMA_RE = /^\d+(?:\.\d+){0,2}$/;
const TIPOS_DE_CATALOGO = new Set(['github', 'git', 'pasta_da_sede', 'arquivo_da_sede', 'pasta_da_maquina', 'arquivo_da_maquina']);

function visivel(v, max = 80) {
  const t = typeof v === 'string' ? v : (v === null || v === undefined ? '' : `(${typeof v})`);
  const limpo = t.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim();
  if (limpo === '') return '(vazio)';
  if (textoComSegredo(limpo) || limpo.split(SEPARADOR_DE_ID).some(parteDeIdComCaraDeChave)) return '(omitido: parecia um segredo)';
  return limpo.length > max ? `${limpo.slice(0, max)}…` : limpo;
}

// Origem relativa à sede, sem escapar dela: sem `..`, sem unidade, sem barra invertida, sem começar por `-`, e o resultado fica dentro da sede.
function origemDentroDaSede(origem, sede) {
  if (!sede || typeof origem !== 'string' || origem === '' || origem.length > 300) return null;
  if (origem.startsWith('-') || /[\\:\u0000-\u001f]/.test(origem) || origem.startsWith('/') || origem.includes('//')) return null;
  const partes = origem.split('/');
  if (partes.some((p) => p === '..' || p === '')) return null;
  const destino = resolve(sede, origem);
  if (!dentro(sede, destino)) return null;
  // Link simbólico (ou junção) dentro da sede que aponta para fora dela: o caminho real, se existe, também tem de ficar dentro da sede.
  try {
    if (existsSync(destino) && !dentro(realpathSync.native(sede), realpathSync.native(destino))) return null;
  } catch { return null; }
  return destino;
}

function origemGitSegura(origem) {
  if (typeof origem !== 'string') return null;
  if (gitSshOk(origem)) return origem;
  const u = urlSegura(origem);
  if (!u || u.ajuste || !u.url.startsWith('https://') || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[\w.~/-]+$/.test(u.url)) return null;
  return u.url;
}

// O comando que o plano mostra é o que roda, palavra por palavra: nada é mascarado nem cortado (todos os valores já passaram pelo padrão estrito, e o que parece
// chave ou segredo foi RECUSADO antes, em `montarPlano`). Um campo que a pessoa precisa reconhecer aparece em claro ou não entra no plano.
const textoDoComando = (prog, args) => [prog, ...args].map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ');
const pareceChave = (v) => typeof v === 'string' && textoComSegredo(v);
const RECUSA_DE_CHAVE = 'o campo parece uma chave ou um segredo e não pode aparecer no plano: nada dele foi usado';
const INSTALA_DA_SALA = 'instalar-sala animada (hooks)';

// ------------------------------------------------------------ restaurar: o que a máquina já tem

function estadoDaMaquina(c, bruto, d, claude) {
  const catalogosPresentes = new Set(Object.keys(ehObjeto(bruto.catalogos) ? bruto.catalogos : {}));
  const plugins = new Map();
  for (const [id, itens] of Object.entries(ehObjeto(bruto.instalados?.plugins) ? bruto.instalados.plugins : {})) {
    const u = lista(itens).find((e) => e?.scope === ESCOPO_DO_USUARIO);
    if (u) plugins.set(id, String(u.version ?? ''));
  }
  const servidores = new Set([...Object.keys(ehObjeto(bruto.settings.mcpServers) ? bruto.settings.mcpServers : {}), ...Object.keys(bruto.mcpDoUsuario)]);
  const hooks = new Set(hooksDoSettings(bruto.settings).map((h) => h.nome));
  const ferramentas = new Map();
  for (const f of FERRAMENTAS) ferramentas.set(f.nome, lerFerramenta(d, f));
  return { catalogosPresentes, plugins, servidores, hooks, ferramentas, claude };
}

function comandoDaTabela(gerenciador, nome) {
  if (!gerenciador || !Object.hasOwn(INSTALACAO, gerenciador)) return null;
  const tabela = INSTALACAO[gerenciador];
  return Object.hasOwn(tabela, nome) ? tabela[nome] : null;
}

// Nada do texto do arquivo vai para a saída como frase: os motivos são frases fixas deste script e só nomes validados (padrão estrito) entram nelas.
const VERSAO_RE = /^[\w.+-]{1,40}$/;
const versaoVisivel = (v) => (typeof v === 'string' && VERSAO_RE.test(v) ? v : '(inválida)');

function montarPlano(ambiente, maquina, c, sede, d) {
  const passos = [];
  const diferencas = [];
  const casa = c.casa;
  const gerenciador = acharGerenciador(d, c.plataforma);
  const novo = (p) => passos.push({ n: passos.length + 1, recusada: false, ...p });
  // Item inválido: o alvo é só o número da entrada na seção (nunca o texto do arquivo) e o motivo é uma frase fixa.
  const recusa = (tipo, indice, motivo) => novo({ tipo, alvo: indice < 0 ? '(seção)' : `entrada ${indice + 1}`, pessoa: false, recusada: true, comando: null, motivo });
  const itens = (secao, rotulo) => {
    const v = ambiente[secao];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) { recusa(rotulo, -1, `a seção ${rotulo} do arquivo não é uma lista: nada dela foi usado`); return []; }
    return v;
  };

  // 0. Sem o programa do Claude nada do resto é possível: é o primeiro passo, e é da pessoa.
  if (!maquina.claude) {
    novo({ tipo: 'claude', alvo: 'Claude Code', pessoa: true, comando: null, motivo: 'o programa `claude` não está nesta máquina: instale o Claude Code pelo instalador oficial, abra uma vez e rode /intoca:ambiente de novo' });
    return { passos, diferencas };
  }

  // 1. Ferramentas que faltam: só os comandos da tabela fixa deste script, por nome conhecido e gerenciador detectado.
  for (const [i, f] of itens('ferramentas', 'ferramenta').entries()) {
    if (!ehObjeto(f) || typeof f.nome !== 'string' || !NOME_RE.test(f.nome)) { recusa('ferramenta', i, 'entrada de ferramenta inválida (o nome não segue o padrão)'); continue; }
    if (pareceChave(f.nome)) { recusa('ferramenta', i, RECUSA_DE_CHAVE); continue; }
    if (!FERRAMENTAS.some((x) => x.nome === f.nome)) {
      novo({ tipo: 'ferramenta', alvo: f.nome, pessoa: true, comando: null, motivo: `${f.nome} não está entre as ferramentas que o plugin sabe conferir e instalar: instale à mão (o que o arquivo sugere para ela nunca é executado nem repetido aqui)` });
      continue;
    }
    const minima = typeof f.versao_minima === 'string' || typeof f.versao_minima === 'number' ? String(f.versao_minima) : '';
    const achada = maquina.ferramentas.get(f.nome);
    if (achada) {
      if (VERSAO_MINIMA_RE.test(minima) && Number(achada.versao.split('.').slice(0, minima.includes('.') ? 2 : 1).join('.')) < Number(minima)) {
        diferencas.push({ tipo: 'ferramenta', alvo: f.nome, arquivo: `>= ${minima}`, maquina: achada.versao, acao: 'nada foi alterado: atualize à mão se precisar' });
      }
      continue;
    }
    const comando = comandoDaTabela(gerenciador, f.nome);
    const executavel = Boolean(comando) && !/\bsudo\b/.test(comando);
    novo({ tipo: 'ferramenta', alvo: f.nome, pessoa: !executavel, comando, exec: executavel ? comando.split(/\s+/) : null,
      motivo: executavel ? `falta ${f.nome} (mínimo ${VERSAO_MINIMA_RE.test(minima) ? minima : '?'})` : `falta ${f.nome} e o comando pede senha de administrador ou não existe para este sistema: instale à mão` });
  }

  // 2. Catálogos que faltam. `origem` aparece no passo para a pessoa comparar com o que reconhece: a validação confere a FORMA, não a confiança.
  const catalogosDoPlano = new Set();
  for (const [i, k] of itens('catalogos', 'catalogo').entries()) {
    if (!ehObjeto(k) || typeof k.nome !== 'string' || !NOME_RE.test(k.nome)) { recusa('catalogo', i, 'entrada de catálogo inválida (o nome não segue o padrão)'); continue; }
    if (maquina.catalogosPresentes.has(k.nome)) continue;
    if (pareceChave(k.nome)) { recusa('catalogo', i, RECUSA_DE_CHAVE); continue; }
    if (typeof k.tipo !== 'string' || !TIPOS_DE_CATALOGO.has(k.tipo)) { recusa('catalogo', i, 'tipo de origem de catálogo desconhecido'); continue; }
    let origem = null;
    let invalida = null;
    let pessoa = null;
    if (k.tipo === 'github') {
      if (typeof k.origem === 'string' && GITHUB_RE.test(k.origem)) origem = k.origem; else invalida = 'origem fora do padrão dono/nome do GitHub';
    } else if (k.tipo === 'git') {
      origem = origemGitSegura(k.origem);
      if (!origem) invalida = 'origem git fora do padrão (só https:// ou git@, sem usuário, senha, parâmetros nem caracteres estranhos)';
    } else if (k.tipo.endsWith('_da_sede')) {
      if (!sede) pessoa = 'este catálogo é uma pasta da sede e a sede não foi achada nesta máquina: clone a sede (ou rode /intoca:sincronizar) e tente de novo';
      else { origem = origemDentroDaSede(k.origem, sede); if (!origem) invalida = 'origem de pasta da sede que sai da sede, é absoluta ou começa com "-"'; }
    } else {
      pessoa = 'este catálogo é uma pasta que só existia na máquina antiga: diga onde ele está agora e adicione com `claude plugin marketplace add <pasta>` (o plugin nunca executa um caminho vindo do arquivo)';
    }
    if (invalida) { recusa('catalogo', i, invalida); continue; }
    // Origem que passou na forma mas parece chave ou segredo: RECUSADA, nunca mascarada (a pessoa só aprova o que lê em claro).
    if (origem && pareceChave(k.tipo.endsWith('_da_sede') ? k.origem : origem)) { recusa('catalogo', i, RECUSA_DE_CHAVE); continue; }
    catalogosDoPlano.add(k.nome);
    if (pessoa) { novo({ tipo: 'catalogo', alvo: k.nome, pessoa: true, comando: null, motivo: pessoa }); continue; }
    const exec = ['claude', 'plugin', 'marketplace', 'add', '--', origem];
    const mostrada = k.tipo.endsWith('_da_sede') ? `pasta da sede: ${k.origem}` : origem;
    novo({ tipo: 'catalogo', alvo: k.nome, pessoa: false, comando: textoDoComando(exec[0], exec.slice(1)), exec, origem: mostrada, origem_nova: true, motivo: `falta o catálogo ${k.nome}: confira que a origem é a que você reconhece` });
  }

  // 3. Plugins que faltam (e diferenças dos que já existem: só mostradas).
  for (const [i, p] of itens('plugins', 'plugin').entries()) {
    if (!ehObjeto(p) || typeof p.id !== 'string' || !PLUGIN_ID_RE.test(p.id)) { recusa('plugin', i, 'id de plugin fora do padrão nome@catálogo (só letras, números, ponto, hífen e sublinhado, e um único @ simples)'); continue; }
    const [nomeDoPlugin, catalogo] = p.id.split('@');
    if (parteDeIdComCaraDeChave(nomeDoPlugin) || parteDeIdComCaraDeChave(catalogo) || pareceChave(p.id)) { recusa('plugin', i, RECUSA_DE_CHAVE); continue; } // por parte: o `@` no meio escondia a chave do teste de texto corrido
    const versao = typeof p.versao === 'string' ? p.versao : '';
    const atual = maquina.plugins.get(p.id);
    if (atual !== undefined) {
      if (versao && atual !== versao) diferencas.push({ tipo: 'plugin', alvo: p.id, arquivo: versaoVisivel(versao), maquina: atual, acao: 'nada foi alterado: a versão instalada fica como está' });
      continue;
    }
    const conhecido = maquina.catalogosPresentes.has(catalogo) || catalogosDoPlano.has(catalogo);
    const exec = ['claude', 'plugin', 'install', '--', p.id];
    // O arquivo registra o plugin como desabilitado: o plano DESABILITA depois de instalar, e o segundo comando aparece inteiro (no `comando`, no `motivo` e no hash).
    const depois = p.habilitado === false ? ['claude', 'plugin', 'disable', '--', p.id] : null;
    const comando = depois ? `${textoDoComando(exec[0], exec.slice(1))} && ${textoDoComando(depois[0], depois.slice(1))}` : textoDoComando(exec[0], exec.slice(1));
    novo({ tipo: 'plugin', alvo: p.id, versao, habilitado: p.habilitado !== false, pessoa: false, comando, exec, ...(depois ? { exec_depois: depois } : {}), catalogo, catalogo_no_plano: conhecido, origem_nova: true,
      motivo: `falta o plugin ${p.id} (versão registrada ${versaoVisivel(versao || '?')}; o Claude instala a que o catálogo oferece)${depois ? `. Como o arquivo o registra desabilitado, o plano também o DESABILITA depois de instalar: ${textoDoComando(depois[0], depois.slice(1))}` : ''}${conhecido ? '' : '. ATENÇÃO: o catálogo deste plugin não está na máquina nem neste plano; confira se você o reconhece'}` });
  }

  // 4. Hooks que faltam. Só o que a tabela fixa sabe refazer roda; o `refazer` do arquivo é informativo e nunca decide.
  const configEsperada = casa ? norm(join(casa, '.claude')) : null;
  for (const [i, h] of itens('hooks', 'hooks').entries()) {
    if (!ehObjeto(h) || typeof h.nome !== 'string' || !NOME_RE.test(h.nome)) { recusa('hooks', i, 'entrada de hooks inválida (o nome não segue o padrão)'); continue; }
    if (maquina.hooks.has(h.nome)) continue;
    if (pareceChave(h.nome)) { recusa('hooks', i, RECUSA_DE_CHAVE); continue; }
    const conhecido = HOOKS_CONHECIDOS.find((k) => k.nome === h.nome);
    if (conhecido?.refazer === 'instalar-sala animada com hooks') {
      if (!configEsperada || norm(c.pastaClaude) !== configEsperada) {
        novo({ tipo: 'hooks', alvo: h.nome, pessoa: true, comando: null, motivo: `faltam os hooks ${h.nome}, mas o instalador da sala grava na pasta .claude do usuário e esta sessão usa outra pasta do Claude: refaça os hooks pela sala animada, numa sessão com a pasta padrão` });
      } else {
        novo({ tipo: 'hooks', alvo: h.nome, pessoa: false, comando: INSTALA_DA_SALA, exec: null, interno: 'sala-animada', altera: 'settings.json do Claude (regrava os hooks da sala animada; o instalador guarda uma cópia de segurança ao lado e desfaz se falhar) e executa código do repositório da sala animada que ele baixa', motivo: `faltam os hooks ${h.nome}: este passo ALTERA o settings.json do Claude (regrava os hooks da sala animada, com cópia de segurança ao lado) e EXECUTA código do repositório da sala animada que o instalador dela baixa (clone, uv sync e hooks-install); só roda com o seu sim` });
      }
    } else {
      novo({ tipo: 'hooks', alvo: h.nome, pessoa: true, comando: null, motivo: `faltam os hooks ${h.nome}: refaça pelo ${conhecido?.como ?? 'instalador do programa que os criou'}` });
    }
  }

  // 5. Servidores MCP que faltam. Servidor de comando local (stdio) nunca roda a partir do arquivo: a pessoa lê o `comando` no próprio arquivo.
  for (const [i, s] of itens('servidores_mcp', 'mcp').entries()) {
    if (!ehObjeto(s) || typeof s.nome !== 'string' || !NOME_RE.test(s.nome)) { recusa('mcp', i, 'entrada de servidor MCP inválida (o nome não segue o padrão)'); continue; }
    if (maquina.servidores.has(s.nome)) continue;
    if (pareceChave(s.nome)) { recusa('mcp', i, RECUSA_DE_CHAVE); continue; }
    const tipo = typeof s.tipo === 'string' ? s.tipo : 'stdio';
    const variaveis = lista(s.variaveis).filter((v) => typeof v === 'string' && VARIAVEL_RE.test(v));
    const cabecalhos = lista(s.cabecalhos).filter((v) => typeof v === 'string' && VARIAVEL_RE.test(v));
    const precisa = [];
    if (variaveis.length > 0) precisa.push(`as variáveis ${variaveis.join(', ')}`);
    if (cabecalhos.length > 0) precisa.push(`os cabeçalhos ${cabecalhos.join(', ')}`);
    if (s.precisa_ajuste === true && precisa.length === 0) precisa.push('um valor ou caminho que era só desta máquina');
    if (tipo === 'stdio') {
      novo({ tipo: 'mcp', alvo: s.nome, pessoa: true, comando: null, motivo: `falta o servidor MCP ${s.nome}: ele roda um programa local e o plugin nunca executa comando vindo do arquivo. Se você o reconhece, leia os campos comando e argumentos dele no ambiente.yaml e adicione à mão com \`claude mcp add\`${precisa.length ? `; faltam ainda ${precisa.join(' e ')} (os valores nunca ficam no arquivo)` : ''}` });
      continue;
    }
    if (tipo !== 'http' && tipo !== 'sse') { recusa('mcp', i, 'tipo de servidor MCP desconhecido'); continue; }
    const u = urlSegura(s.url);
    if (!u || u.ajuste || !u.url.startsWith('https://') || u.url !== s.url || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[\w.~/-]*)?$/.test(u.url)) {
      novo({ tipo: 'mcp', alvo: s.nome, pessoa: true, comando: null, motivo: `falta o servidor MCP ${s.nome}: o endereço não ficou registrado de forma segura (ou precisa de parâmetro); informe-o à mão` });
      continue;
    }
    if (pareceChave(u.url)) { recusa('mcp', i, RECUSA_DE_CHAVE); continue; }
    if (precisa.length > 0 || s.precisa_ajuste === true) {
      novo({ tipo: 'mcp', alvo: s.nome, pessoa: true, comando: null, motivo: `falta o servidor MCP ${s.nome}: a pessoa informa ${precisa.join(' e ')}; os valores nunca ficam no arquivo` });
      continue;
    }
    const exec = ['claude', 'mcp', 'add', '-s', 'user', '--transport', tipo, '--', s.nome, u.url];
    novo({ tipo: 'mcp', alvo: s.nome, pessoa: false, comando: textoDoComando(exec[0], exec.slice(1)), exec, origem: u.url, origem_nova: true, motivo: `falta o servidor MCP remoto ${s.nome}: confira que o endereço é o que você reconhece` });
  }
  return { passos, diferencas };
}

const limpar = (t) => { const l = primeiraLinha(t); return pareceSegredo(l) ? '[saída omitida: parecia conter um segredo]' : l.slice(0, 300); };
const codigoDoErro = (e) => String(e?.code ?? e?.name ?? 'desconhecido').replace(/[^\w.-]/g, '').slice(0, 40);

function executarPassos(plano, d, claude, sede) {
  const feitos = [];
  let parou = null;
  for (const [i, p] of plano.passos.entries()) {
    if (p.recusada) { feitos.push({ passo: p.n, tipo: p.tipo, alvo: p.alvo, estado: 'recusado', saida: p.motivo }); continue; }
    if (p.pessoa) { parou = { passo: p.n, motivo: p.motivo }; plano.restante = plano.passos.slice(i); break; }
    let r;
    try {
      if (p.interno === 'sala-animada') {
        const saida = d.instalarSala({ acao: 'animada', simular: false, confirmado: true, hooks: true, ...(sede ? { sede } : {}) });
        r = saida?.ok === true ? { status: 0, stdout: 'hooks da sala animada refeitos', stderr: '' } : { status: 1, stdout: '', stderr: `${visivel(saida?.erros?.[0]?.codigo, 40)}: ${visivel(saida?.erros?.[0]?.mensagem, 160)}` };
      } else {
        const [prog, ...args] = p.exec;
        r = d.rodar(prog === 'claude' ? claude : prog, args, { tempo: 300000 });
      }
    } catch (e) {
      r = { status: 1, stdout: '', stderr: `erro interno (${codigoDoErro(e)})` };
    }
    const ok = r.status === 0;
    feitos.push({ passo: p.n, tipo: p.tipo, alvo: p.alvo, estado: ok ? 'feito' : 'falhou', saida: limpar(ok ? r.stdout || r.stderr : r.stderr || r.stdout || r.erro || 'sem mensagem') });
    if (!ok) { parou = { passo: p.n, motivo: `o passo falhou: ${feitos.at(-1).saida}` }; plano.restante = plano.passos.slice(i + 1); break; }
    if (p.exec_depois) { // o segundo comando do passo, o mesmo que o plano mostrou no `comando`
      const [prog, ...args] = p.exec_depois;
      const texto = textoDoComando(prog, args);
      let dr;
      try { dr = d.rodar(prog === 'claude' ? claude : prog, args, { tempo: 60000 }); } catch (e) { dr = { status: 1, stdout: '', stderr: `erro interno (${codigoDoErro(e)})` }; }
      const desabilitou = dr.status === 0;
      feitos.push({ passo: p.n, tipo: 'plugin', alvo: p.alvo, estado: desabilitou ? 'feito' : 'falhou', comando: texto, saida: desabilitou ? `desabilitado como no arquivo (${texto})` : limpar(dr.stderr || dr.stdout || dr.erro || 'sem mensagem') });
      if (!desabilitou) { parou = { passo: p.n, motivo: `o passo falhou ao desabilitar o plugin: ${feitos.at(-1).saida}` }; plano.restante = plano.passos.slice(i + 1); break; } // como qualquer passo que falha: para e relata o que sobrou
    }
  }
  return { feitos, parou };
}

// Depois de instalar, confere a versão que o catálogo entregou. Só avisa; nunca troca.
function conferirVersoes(plano, feitos, d, claude) {
  if (!feitos.some((f) => f.tipo === 'plugin' && f.estado === 'feito')) return [];
  try {
    const r = d.rodar(claude, ['plugin', 'list', '--json'], { tempo: 60000 });
    if (r.status !== 0) return [];
    const atuais = JSON.parse(r.stdout);
    const avisos = [];
    for (const p of plano.passos.filter((x) => x.tipo === 'plugin' && !x.recusada && feitos.some((f) => f.passo === x.n && f.estado === 'feito'))) {
      const achado = lista(atuais).find((a) => a?.id === p.alvo);
      if (achado && p.versao && achado.version !== p.versao) avisos.push(`${p.alvo}: o catálogo entregou ${visivel(achado.version, 40)}; o arquivo registra ${visivel(p.versao, 40)}`);
    }
    return avisos;
  } catch { return []; }
}

// O que a pessoa viu é o que roda: o hash cobre o arquivo e cada passo (tipo, alvo, comando mostrado, os dois comandos que EXECUTA, quem faz). Mudou, recusa e manda mostrar de novo.
function hashDoPlano(hashDoArquivo, passos) {
  const h = createHash('sha256').update(hashDoArquivo);
  h.update(JSON.stringify(passos.map((p) => [p.tipo, p.alvo, p.comando ?? null, p.pessoa, p.recusada, p.interno ?? null, p.exec ?? null, p.exec_depois ?? null])));
  return h.digest('hex').slice(0, 20);
}

function restaurar(entrada, d) {
  const c = contexto(d);
  const sede = achar(entrada, d);
  const brutoDoArquivo = entrada.arquivo !== undefined ? entrada.arquivo : (sede ? join(sede, ARQUIVO_NA_SEDE) : null);
  const arquivo = brutoDoArquivo === null ? null : caminhoPermitido(brutoDoArquivo, sede);
  if (!arquivo) throw new Recusa('sem-sede', 'não achei a sede: o ambiente.yaml mora em <sede>/diretoria. Entre na pasta da sede (clone-a antes, se a máquina é nova) e tente de novo');
  if (!existsSync(arquivo)) throw new Recusa('sem-ambiente', 'a sede não tem diretoria/ambiente.yaml: nada a restaurar. Numa máquina que ainda tem o ambiente, rode /intoca:ambiente registrar e faça o commit');
  const { ambiente, hash } = lerAmbienteGravado(arquivo);
  if (!ehObjeto(ambiente) || ambiente.versao !== VERSAO_DO_FORMATO) throw new Recusa('formato-desconhecido', `o ambiente.yaml não é da versão ${VERSAO_DO_FORMATO} do formato: atualize o plugin ou registre de novo`);
  const claude = localizarClaude(d);
  const lido = lerClaude(c, d);
  const maquina = estadoDaMaquina(c, lido, d, claude);
  const plano = montarPlano(ambiente, maquina, c, sede, d);
  const resumo = { total: plano.passos.length, reprodutiveis: plano.passos.filter((p) => !p.pessoa && !p.recusada).length, da_pessoa: plano.passos.filter((p) => p.pessoa).length, recusadas: plano.passos.filter((p) => p.recusada).length };
  const publico = (p) => { const { exec, exec_depois, interno, versao, ...resto } = p; return versao === undefined ? resto : { ...resto, versao_registrada: versaoVisivel(versao) }; }; // `exec`, `exec_depois` e `interno` são do script, não do relatório (o que eles executam já está no `comando`)
  const campo = (v, re) => (typeof v === 'string' && re.test(v) ? v : '(inválido)');
  const registrado = ehObjeto(ambiente.registrado_em) ? { maquina: campo(ambiente.registrado_em.maquina, NOME_RE), data: campo(ambiente.registrado_em.data, /^\d{4}-\d{2}-\d{2}$/), claude_code: campo(ambiente.registrado_em.claude_code, VERSAO_RE) } : null;
  const base = { ok: true, acao: 'restaurar', criados: [], jaExistiam: [], erros: [], arquivo, ...(lido.avisos.length ? { avisos_de_leitura: lido.avisos } : {}), registrado_em: registrado, diferencas: plano.diferencas, resumo, passos_da_pessoa: PASSOS_DA_PESSOA }; // a lista do arquivo é informativa: a que o script mostra é a dele
  if (plano.passos.length === 0) return { ...base, estado: 'nada-a-fazer', passos: [], aviso: 'A máquina já tem tudo o que o ambiente.yaml registra. Nada a fazer.' };
  const planoHash = hashDoPlano(hash, plano.passos);
  if (entrada.so_plano === true) return { ...base, estado: 'plano', plano_hash: planoHash, passos: plano.passos.map(publico), aviso: 'Só o plano: nada foi executado. Para executar, mostre-o à pessoa e rode de novo com --confirmado --plano=<plano_hash>.' };
  if (entrada.confirmado !== true) return { ...base, estado: 'aguardando-confirmacao', plano_hash: planoHash, passos: plano.passos.map(publico), aviso: 'Nada foi executado. Mostre o plano à pessoa e, com o "sim" dela, rode de novo com --confirmado --plano=<plano_hash>.' };
  if (typeof entrada.plano !== 'string' || entrada.plano === '') throw new Recusa('plano-nao-mostrado', 'para executar é preciso o hash do plano que foi mostrado à pessoa (--plano=<plano_hash>, da saída de --so-plano). Nada foi executado: mostre o plano primeiro');
  if (entrada.plano !== planoHash) throw new Recusa('plano-mudou', 'o plano mudou desde que foi mostrado (o arquivo ou a máquina são outros). Nada foi executado: rode --so-plano de novo e mostre o plano novo à pessoa');
  const { feitos, parou } = executarPassos(plano, d, claude, sede);
  const avisos = conferirVersoes(plano, feitos, d, claude);
  const falhou = Boolean(parou) && !plano.passos.find((p) => p.n === parou.passo)?.pessoa;
  return {
    ...base, ...(falhou ? { ok: false, erros: [{ codigo: 'passo-falhou', mensagem: parou.motivo }] } : {}), estado: parou ? (plano.passos.find((p) => p.n === parou.passo)?.pessoa ? 'parou-na-pessoa' : 'falhou') : 'restaurado',
    plano_hash: planoHash, passos: plano.passos.map(publico), executados: feitos, parou, restante: (plano.restante ?? []).map(publico), avisos,
    ...(parou ? {} : { proximo: 'Falta só o que é da pessoa (lista em passos_da_pessoa) e o que ficou recusado, se houver. Abra uma sessão nova para os plugins carregarem.' }),
  };
}

// ------------------------------------------------------------ entrada e saída

const comoErro = (e) => {
  const r = e instanceof Recusa ? e : new Recusa('erro-interno', `erro interno (${codigoDoErro(e)}); nada foi alterado além do que a saída já relatou`);
  return { ok: false, criados: [], jaExistiam: [], erros: [{ codigo: r.codigo, mensagem: r.message, ...r.extra }] };
};

export function executar(entrada, deps = {}) {
  try {
    const d = { ...DEPS_PADRAO, ...deps };
    if (entrada.acao === 'registrar') return registrar(entrada, d);
    if (entrada.acao === 'restaurar') return restaurar(entrada, d);
    throw new Recusa('acao-inexistente', 'a ação não existe; use registrar ou restaurar');
  } catch (e) {
    return comoErro(e);
  }
}

function lerArgumentos(argv) {
  const [acao, ...resto] = argv;
  const entrada = { acao };
  for (const a of resto) {
    if (a === '--confirmado') entrada.confirmado = true;
    else if (a === '--so-plano') entrada.so_plano = true;
    else if (a.startsWith('--sede=')) entrada.sede = a.slice(7);
    else if (a.startsWith('--saida=')) entrada.saida = a.slice(8);
    else if (a.startsWith('--arquivo=')) entrada.arquivo = a.slice(10);
    else if (a.startsWith('--plano=')) entrada.plano = a.slice(8);
    else if (a.startsWith('--maquina=')) entrada.maquina = a.slice(10);
    else throw new Recusa('argumento-desconhecido', 'argumento desconhecido (use --confirmado, --so-plano, --plano=, --sede=, --saida= ou --arquivo=)');
  }
  return entrada;
}

function principal() {
  let saida;
  try { saida = executar(lerArgumentos(process.argv.slice(2))); } catch (e) { saida = comoErro(e); }
  process.exitCode = saida.ok ? 0 : 1;
  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
}

function ehOPrograma() {
  try { return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (ehOPrograma()) principal();
