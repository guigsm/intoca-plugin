// Biblioteca comum dos hooks do plugin intoca. Não é um hook: os scripts a importam.
// Sem rede. Sem dependência fora do Node. Não contém caminho de máquina nem nome de usuário.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { lstatSync, realpathSync } from 'node:fs';
import { sep } from 'node:path';

// Estado por sessão. A pasta do plugin muda a cada versão e não é lugar de estado: usa a pasta
// temporária do sistema. Perder o estado só faz o hook de parada não cobrar o relatório.
export const ESTADO = join(tmpdir(), 'intoca-hooks');

// Worktree de cartão: <raiz>/.claude/worktrees/<nome> ou <raiz>/_worktrees/<nome>.
const PADRAO_WORKTREE = /^(.*?)[\\/](?:\.claude[\\/]worktrees|_worktrees)[\\/][^\\/]+$/;

export function lerEntrada() {
  try {
    const bruto = readFileSync(0, 'utf8').replace(/^﻿/, '').trim();
    if (!bruto) return null;
    const dado = JSON.parse(bruto);
    return dado && typeof dado === 'object' && !Array.isArray(dado) ? dado : null;
  } catch {
    return null;
  }
}

function temManifesto(dir) {
  try { return statSync(join(dir, 'sede.yaml')).isFile(); } catch { return false; }
}

// Sobe diretórios a partir de `inicio` até achar uma pasta com sede.yaml. Devolve null se não achar.
export function acharSede(inicio) {
  let dir = resolve(String(inicio));
  for (let i = 0; i < 64; i += 1) {
    if (temManifesto(dir)) return dir;
    const pai = dirname(dir);
    if (pai === dir) break;
    dir = pai;
  }
  return null;
}

// Pasta do usuário, onde mora o ponteiro da sede (`<pasta do usuário>/.intoca/sede`). A variável
// INTOCA_HOME a sobrescreve (uso dos testes, que não podem tocar a pasta real de quem os roda).
export function pastaDoUsuario() {
  const h = process.env.INTOCA_HOME;
  if (typeof h === 'string' && h.trim() !== '') return resolve(h);
  try { return homedir() || null; } catch { return null; }
}

// Ponteiro da sede: arquivo de texto de uma linha com o caminho absoluto da sede (criado pelo
// /intoca:comecar, com o "sim" da pessoa). Só vale se for caminho absoluto de uma pasta que contém
// sede.yaml; ponteiro ausente, grande demais, relativo, com caractere nulo ou apontando para pasta sem
// sede.yaml é ignorado em silêncio. Devolve a pasta da sede ou null.
export function lerPonteiroDaSede() {
  try {
    const casa = pastaDoUsuario();
    if (!casa) return null;
    const arquivo = join(casa, '.intoca', 'sede');
    const info = statSync(arquivo);
    if (!info.isFile() || info.size > 4096) return null;
    const linha = readFileSync(arquivo, 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0].trim();
    if (!linha || linha.includes('\u0000') || !absoluto(linha)) return null;
    const candidata = resolve(linha);
    return temManifesto(candidata) ? candidata : null;
  } catch {
    return null;
  }
}

// Sede indicada de fora do cwd: { pasta, origem }, com origem 'env' (a variável INTOCA_SEDE) ou 'ponteiro'
// (o arquivo da pasta do usuário); a variável vale mais. null se nenhuma vale.
export function sedeIndicadaComOrigem() {
  if (process.env.INTOCA_SEDE) {
    const candidata = resolve(String(process.env.INTOCA_SEDE));
    if (temManifesto(candidata)) return { pasta: candidata, origem: 'env' };
  }
  const ponteiro = lerPonteiroDaSede();
  return ponteiro ? { pasta: ponteiro, origem: 'ponteiro' } : null;
}
export function sedeIndicada() {
  return sedeIndicadaComOrigem()?.pasta ?? null;
}

// Todas as pastas que o manifesto dá a um projeto: atual, futura, antigas e as do `repositorios:` (PLG-25: a sala
// animada é a segunda pasta do projeto intoca).
export function pastasRegistradas(p) {
  const lista = (v) => (Array.isArray(v) ? v : []);
  return [p.pasta_atual, p.pasta_futura, ...lista(p.pastas_antigas), ...lista(p.repositorios)];
}

// O cwd está numa pasta que o manifesto registra: `pasta_atual`, `pasta_futura` ou `pastas_antigas` de algum
// projeto (o que inclui `<pasta>/.claude/worktrees/...`)? Pasta absoluta que não resolve não conta.
// É o crachá do ponteiro: ele cadastra pastas, não vale como chave global (decisão do gerente, PLG-03).
export function cwdEmPastaRegistrada(cwd, manifesto) {
  const alvo = forma(cwd);
  for (const p of manifesto?.projetos ?? []) {
    for (const pasta of pastasRegistradas(p)) {
      if (absoluto(pasta) && dentroDe(forma(pasta), alvo, true)) return true;
    }
  }
  return false;
}

// Nome da sede (`sede: nome:` do sede.yaml) ou null.
function nomeDaSede(sede) {
  try {
    const linhas = readFileSync(join(String(sede), 'sede.yaml'), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    const inicio = linhas.findIndex((l) => /^sede:\s*(#.*)?$/.test(l));
    if (inicio < 0) return null;
    for (let i = inicio + 1; i < linhas.length; i += 1) {
      if (/^\S/.test(linhas[i])) break;
      const m = linhas[i].match(/^\s+nome:\s*(.*)$/);
      if (m) {
        const v = valorDoManifesto(m[1]);
        return v.ok && typeof v.valor === 'string' && v.valor.trim() ? v.valor.trim() : null;
      }
    }
  } catch { /* sem nome */ }
  return null;
}

// Chat aberto numa pasta que não é de nenhuma Toca (PLG-03, pedido do proprietário): a sede vem só do ponteiro,
// o manifesto é legível e o cwd está fora das pastas registradas. Devolve { sede, nome } para o `pasta-errada`
// dar UMA linha de aviso (sem fila, sem passagem, sem cobrança) ou null quando não se deve avisar: sem cwd na
// entrada, sede achada por outro caminho (cwd acima ou INTOCA_SEDE, que têm o aviso de sempre), pasta registrada,
// raiz do disco, pasta pessoal ou pasta que a contém (conversa comum, sem pasta de trabalho), pasta que contém
// alguma pasta registrada (a "mãe" dos projetos), pasta temporária do sistema, worktree de repositório alheio
// (`.claude/worktrees`, `_worktrees`) e pasta que só difere de uma registrada pelo caminho real (nome curto 8.3,
// junção, link). Essas últimas comparações visitam o disco, por isso só rodam no caminho que avisa (PLG-03b).
export function pastaSemToca(entrada) {
  if (!entrada || typeof entrada.cwd !== 'string' || entrada.cwd.trim() === '') return null;
  const cwd = resolve(entrada.cwd);
  if (acharSede(cwd)) return null;
  const indicada = sedeIndicadaComOrigem();
  if (!indicada || indicada.origem !== 'ponteiro') return null;
  const manifesto = lerManifesto(indicada.pasta);
  if (!manifesto || cwdEmPastaRegistrada(cwd, manifesto)) return null;
  if (dirname(cwd) === cwd) return null;
  const casa = pastaDoUsuario();
  if (casa && (mesmoCaminho(casa, cwd) || contem(cwd, casa))) return null;
  const formas = formasDoCaminho(cwd);
  if (formas.some((f) => dirname(f) === f)) return null;
  if (casa && formasDoCaminho(casa).some((h) => formas.some((f) => contem(f, h, true)))) return null;
  if (emPastaDeRuido(formas) || pastaMaeOuIgualRegistrada(formas, manifesto)) return null;
  return { sede: indicada.pasta, nome: nomeDaSede(indicada.pasta) };
}

// O caminho escrito e, quando é outro, o caminho real (sem junção, link nem nome curto do Windows).
function formasDoCaminho(p) {
  const lex = resolve(String(p));
  const real = caminhoReal(lex);
  return real && chaveDeCaminho(real) !== chaveDeCaminho(lex) ? [lex, real] : [lex];
}

// Pasta temporária do sistema (e o que há dentro dela) ou dentro de uma worktree de cartão de repositório
// alheio: lugar de chat avulso, onde "nenhuma Toca" seria só ruído.
function emPastaDeRuido(formas) {
  const tmp = formasDoCaminho(tmpdir());
  return formas.some((f) => {
    if (tmp.some((t) => contem(t, f, true))) return true;
    const partes = pedacos(f);
    return partes.includes('_worktrees') || partes.some((p, i) => p === '.claude' && partes[i + 1] === 'worktrees');
  });
}

// Alguma pasta registrada no manifesto (atual, futura ou antiga) é a própria pasta do chat, está dentro dela (a
// pasta que guarda vários projetos) ou a contém, em qualquer das duas formas do caminho.
function pastaMaeOuIgualRegistrada(formas, manifesto) {
  for (const p of manifesto?.projetos ?? []) {
    for (const pasta of pastasRegistradas(p)) {
      if (!absoluto(pasta)) continue;
      for (const r of formasDoCaminho(pasta)) {
        if (formas.some((f) => contem(r, f, true) || contem(f, r))) return true;
      }
    }
  }
  return false;
}

// Devolve { projeto, local, sede, origem } ou null quando não há sede.
//   projeto: pasta do projeto da sessão (CLAUDE_PROJECT_DIR, senão o cwd).
//   local:   a pasta com sede.yaml mais próxima do cwd (numa worktree da sede, a própria worktree).
//   sede:    a raiz viva da sede; igual a `local`, exceto numa worktree, onde é a pasta que a contém.
//   origem:  como a sede foi achada: 'cwd' (sede.yaml acima), 'env' (INTOCA_SEDE) ou 'ponteiro'.
//   manifesto: só quando a origem é o ponteiro (já lido, para o chamador não ler de novo).
// Ordem de busca: sede.yaml a partir do cwd; depois a variável INTOCA_SEDE; depois o ponteiro da sede
// (`<pasta do usuário>/.intoca/sede`); depois nada.
// O ponteiro é um cadastro de pastas, não uma chave global (decisão do gerente, PLG-03): quando a sede
// vem SÓ dele, o resultado é null (todos os hooks de contexto ficam mudos) a menos que o cwd esteja numa
// pasta registrada no manifesto (`cwdEmPastaRegistrada`). Origens 'cwd' e 'env' não mudam.
export function raizes(entrada) {
  const cwd = resolve(String(entrada.cwd || process.cwd()));
  const projeto = resolve(String(process.env.CLAUDE_PROJECT_DIR || cwd));
  let local = acharSede(cwd);
  let origem = 'cwd';
  if (!local) {
    const indicada = sedeIndicadaComOrigem();
    if (indicada) { local = indicada.pasta; origem = indicada.origem; }
  }
  if (!local) return null;
  const m = local.match(PADRAO_WORKTREE);
  const pai = m ? resolve(m[1]) : null;
  const sede = pai && temManifesto(pai) ? pai : local;
  if (origem !== 'ponteiro') return { projeto, local, sede, origem };
  const manifesto = lerManifesto(sede);
  if (!manifesto || !cwdEmPastaRegistrada(cwd, manifesto)) return null;
  return { projeto, local, sede, origem, manifesto };
}

export function dentro(pai, filho) {
  const r = relative(pai, filho);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r);
}

export function sessaoValida(id) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(id || ''));
}

export function arquivoDeEstado(sessao) {
  return join(ESTADO, `${sessao}.json`);
}

// ---------------------------------------------------------------- worktrees (DIR-13)
// Usadas por worktree-criar.mjs e worktree-remover.mjs. Ao contrário dos outros hooks, estes dois
// falham de verdade: erro interno sai com código 1 e mensagem no stderr, porque o hook substitui a
// criação padrão do Claude Code e silêncio aqui significaria worktree sem rastro.

// Nome de worktree aceito: o slug que o app gera ("bold-oak-a3f2", "pr-123", "feature-auth").
export function nomeDeWorktreeValido(nome) {
  return typeof nome === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(nome) && !nome.includes('..');
}

// Roda `git -C <dir> <args>`. Nunca lança: devolve { ok, saida, erro, status }.
export function git(dir, args) {
  const r = spawnSync('git', ['-C', String(dir), ...args], {
    encoding: 'utf8', timeout: 100000, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return { ok: false, saida: '', erro: String(r.error.message || r.error), status: -1 };
  return { ok: r.status === 0, saida: (r.stdout || '').trim(), erro: (r.stderr || '').trim(), status: r.status };
}

// Raiz do repositório principal a que `dir` pertence, mesmo que `dir` esteja numa worktree
// vinculada. Devolve null se `dir` não está num repositório Git.
export function raizDoRepositorio(dir) {
  const comum = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (comum.ok && comum.saida) {
    const gitDir = resolve(comum.saida);
    if (basename(gitDir) === '.git') return dirname(gitDir);
  }
  const topo = git(dir, ['rev-parse', '--show-toplevel']);
  return topo.ok && topo.saida ? resolve(topo.saida) : null;
}

// Sede que serve ao repositório: sede.yaml subindo da raiz dele; senão INTOCA_SEDE; senão null.
export function sedeDoRepositorio(raiz) {
  const acima = acharSede(raiz);
  if (acima) return acima;
  if (process.env.INTOCA_SEDE) {
    const candidata = resolve(String(process.env.INTOCA_SEDE));
    if (temManifesto(candidata)) return candidata;
  }
  return null;
}

// Onde a worktree `nome` do repositório `raiz` mora. Com sede: <sede>/_worktrees/<repositório>-<nome>.
// Sem sede (repositório fora de qualquer sede e sem INTOCA_SEDE): o local padrão do Claude Code,
// <repositório>/.claude/worktrees/<nome>, para não quebrar worktrees em repositórios alheios.
export function destinoDaWorktree(raiz, nome, sede) {
  return sede
    ? join(sede, '_worktrees', `${basename(raiz)}-${nome}`)
    : join(raiz, '.claude', 'worktrees', nome);
}

// Prefixo do branch criado pelo hook. Padrão `claude/` (decisão da Diretoria em 2026-10-13: igual ao
// que o app usa nos cartões e ao que a sede já tem). INTOCA_WORKTREE_BRANCH_PREFIX troca, por
// exemplo para `worktree-`, o padrão do Claude Code.
export function prefixoDoBranch() {
  const p = process.env.INTOCA_WORKTREE_BRANCH_PREFIX;
  return typeof p === 'string' && /^[A-Za-z0-9._/-]{1,40}$/.test(p) && !p.includes('..') ? p : 'claude/';
}

// Caminhos iguais no sistema de arquivos: ignora caixa no Windows e o tipo de barra.
export function mesmoCaminho(a, b) {
  const norm = (x) => resolve(String(x)).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}

// ---------------------------------------------------------------- autorização por regra (PLG-10)
// Usadas por pre-ferramenta.mjs. Todas são de "na dúvida, não": devolvem null ou false quando não
// conseguem ter certeza, e quem chama trata isso como "sem decisão".

const NO_WINDOWS = process.platform === 'win32';

// ------------------------------ manifesto (sede.yaml)
// Leitor mínimo, sem dependência: só a lista `projetos:` e só os campos abaixo. Aceita item em bloco
// (`- nome: x` e as chaves alinhadas embaixo) e item em linha (`- {nome: x, pasta_atual: '...'}`).
// Valores: simples (com `# comentário` no fim), entre aspas simples (`''` vira `'`), entre aspas
// duplas (só `\\` e `\"` como escape) e lista em linha (`['a', b]`). Bloco dobrado (`>-`, `|`) e mapa
// aninhado são ignorados. Linha mais recuada que as chaves do item (texto dobrado, sublista) é pulada.
const CAMPOS_DO_MANIFESTO = new Set([
  'nome', 'sigla', 'siglas_antigas', 'pasta_atual', 'pasta_futura', 'pastas_antigas', 'branch_principal', 'deploy', 'exibicao',
]);

// Separa por vírgula no nível de cima, respeitando aspas e colchetes. null se as aspas não fecham.
function partesDeFluxo(texto) {
  const partes = [];
  let atual = '';
  let aspas = null;
  let fundo = 0;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) {
      atual += c;
      if (c === aspas) {
        if (aspas === "'" && texto[i + 1] === "'") { atual += "'"; i += 1; } else aspas = null;
      } else if (aspas === '"' && c === '\\') { atual += texto[i + 1] ?? ''; i += 1; }
      continue;
    }
    if (c === "'" || c === '"') aspas = c;
    else if (c === '[' || c === '{') fundo += 1;
    else if (c === ']' || c === '}') fundo -= 1;
    if (c === ',' && fundo === 0) { partes.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (aspas || fundo !== 0) return null;
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

// Valor escalar ou lista em linha. Devolve { ok, valor }; ok=false quando o texto não fecha.
function valorDoManifesto(bruto) {
  const s = bruto.trim();
  if (s === '' || s.startsWith('#')) return { ok: true, valor: null };
  if (s.startsWith("'")) {
    let valor = '';
    for (let i = 1; i < s.length; i += 1) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") { valor += "'"; i += 1; continue; }
        const resto = s.slice(i + 1).trim();
        return resto === '' || resto.startsWith('#') ? { ok: true, valor } : { ok: false };
      }
      valor += s[i];
    }
    return { ok: false };
  }
  if (s.startsWith('"')) {
    let valor = '';
    for (let i = 1; i < s.length; i += 1) {
      if (s[i] === '\\') {
        const prox = s[i + 1];
        if (prox !== '\\' && prox !== '"') return { ok: false };
        valor += prox;
        i += 1;
        continue;
      }
      if (s[i] === '"') {
        const resto = s.slice(i + 1).trim();
        return resto === '' || resto.startsWith('#') ? { ok: true, valor } : { ok: false };
      }
      valor += s[i];
    }
    return { ok: false };
  }
  if (s.startsWith('[')) {
    const fim = s.lastIndexOf(']');
    if (fim < 0) return { ok: false };
    const resto = s.slice(fim + 1).trim();
    if (resto !== '' && !resto.startsWith('#')) return { ok: false };
    const partes = partesDeFluxo(s.slice(1, fim));
    if (!partes) return { ok: false };
    const lista = [];
    for (const p of partes) {
      const v = valorDoManifesto(p);
      if (!v.ok || Array.isArray(v.valor)) return { ok: false };
      lista.push(v.valor);
    }
    return { ok: true, valor: lista };
  }
  if (s.startsWith('{') || s.startsWith('>') || s.startsWith('|') || s.startsWith('&') || s.startsWith('*')) {
    return { ok: true, valor: undefined }; // mapa aninhado, bloco, âncora: fora do que o leitor entende
  }
  const semComentario = s.replace(/\s+#.*$/, '').trim();
  return { ok: true, valor: semComentario === 'null' || semComentario === '~' || semComentario === '' ? null : semComentario };
}

// `chave: valor` → [chave, { ok, valor }], ou null se a linha não é uma chave.
function chaveDoManifesto(texto) {
  const m = texto.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*)|\s*)$/);
  return m ? [m[1], valorDoManifesto(m[2] ?? '')] : null;
}

function guardarCampo(projeto, chave, v) {
  if (!CAMPOS_DO_MANIFESTO.has(chave) || !v.ok || v.valor === undefined) return;
  projeto[chave] = v.valor;
}

// ------------------------------ títulos dos chats (PLG-03)
// `titulos:` do sede.yaml diz como se chamam os chats de cada cargo. Só estes marcadores existem:
// {projeto}, {funcao}, {id}, {tema}. Padrão com marcador desconhecido, longo demais ou sem o que o
// cargo precisa é recusado, e o cargo volta ao padrão. O título é dado, nunca ordem.
export const TITULOS_PADRAO = Object.freeze({
  gerente: 'Gerente · {projeto}',
  diretoria: 'Diretoria',
  secretaria: 'Secretaria',
  plantao: 'Plantão · {funcao} · {projeto}',
  executor: 'Executor · {id} {tema}',
});
const MARCADOR_DE_TITULO = /\{(?:projeto|funcao|id|tema)\}/g;

// O padrão `texto` é aceitável para o cargo `chave`?
export function padraoDeTituloValido(chave, texto) {
  if (!Object.hasOwn(TITULOS_PADRAO, chave) || typeof texto !== 'string') return false;
  if (texto.length === 0 || texto.length > 60 || /\p{C}/u.test(texto)) return false;
  const marcadores = texto.match(MARCADOR_DE_TITULO) ?? [];
  if (new Set(marcadores).size !== marcadores.length) return false; // marcador repetido
  const literal = texto.replace(MARCADOR_DE_TITULO, '');
  if (/[{}]/.test(literal)) return false; // marcador desconhecido, chave solta
  if ((literal.match(/[\p{L}\p{N}]/gu) ?? []).length < 3) return false; // sem texto fixo, casaria com qualquer título
  if ((chave === 'diretoria' || chave === 'secretaria') && marcadores.length) return false;
  // PLG-26: a sede com um só gerente (o projeto que hospeda a própria sede) o chama só `Gerente`. É o único texto
  // fixo aceito sem {projeto}; outro literal solto (`Chefe`) casaria com um nome de chat qualquer.
  if (chave === 'gerente' && !marcadores.includes('{projeto}') && texto.replace(/\s+/g, ' ').trim() !== 'Gerente') return false;
  if (chave === 'executor' && !marcadores.includes('{id}')) return false;
  return true;
}

// Expressão que reconhece um título pelo padrão. Em `executor`, o grupo 1 é o ID da OS. null se inválido.
export function regexDoTitulo(chave, padrao) {
  if (!padraoDeTituloValido(chave, padrao)) return null;
  let re = '';
  for (const parte of padrao.replace(/\s+/g, ' ').split(/(\{(?:projeto|funcao|id|tema)\})/)) {
    if (parte === '{projeto}' || parte === '{funcao}') re += '.+';
    else if (parte === '{tema}') re += '.*';
    else if (parte === '{id}') re += '([A-Za-z][A-Za-z0-9]*-\\d+[A-Za-z]?)';
    else re += parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (chave === 'diretoria' || chave === 'secretaria') re += '(?: · .*)?';
  // "Ordem · {id} {tema}": o tema é opcional, como no padrão fixo de sempre ("Executor · PLG-03" vale).
  if (/ \.\*$/.test(re) && padrao.replace(/\s+/g, ' ').endsWith(' {tema}')) re = `${re.slice(0, -3)}(?: .*)?`;
  return new RegExp(`^${re}$`, 'iu');
}

// Lê o mapa `titulos:` de topo (em bloco ou em linha) e devolve os cinco padrões: o do manifesto onde
// é válido, o padrão da casa nos demais.
function titulosDoManifesto(linhas) {
  const titulos = { ...TITULOS_PADRAO };
  const inicio = linhas.findIndex((l) => /^titulos:/.test(l));
  if (inicio < 0) return titulos;
  const resto = linhas[inicio].slice('titulos:'.length).trim();
  const pares = [];
  if (resto.startsWith('{')) {
    const fim = resto.lastIndexOf('}');
    const depois = fim < 0 ? '' : resto.slice(fim + 1).trim();
    if (fim < 0 || (depois !== '' && !depois.startsWith('#'))) return titulos;
    const partes = partesDeFluxo(resto.slice(1, fim));
    if (!partes) return titulos;
    for (const p of partes) {
      const kv = chaveDoManifesto(p);
      if (kv) pares.push(kv);
    }
  } else if (resto === '' || resto.startsWith('#')) {
    for (let i = inicio + 1; i < linhas.length; i += 1) {
      const linha = linhas[i];
      if (/^\s*(#.*)?$/.test(linha)) continue;
      if (/^\S/.test(linha)) break;
      const kv = chaveDoManifesto(linha.trim());
      if (kv) pares.push(kv);
    }
  } else {
    return titulos;
  }
  const vistos = new Set();
  for (const [chave, v] of pares) {
    if (vistos.has(chave)) continue; // a primeira ocorrência vale
    vistos.add(chave);
    if (v.ok && typeof v.valor === 'string' && padraoDeTituloValido(chave, v.valor)) titulos[chave] = v.valor.replace(/\s+/g, ' ');
  }
  return titulos;
}

// ------------------------------ rigor das permissões (PLG-14)
// `sede: rigor:` do sede.yaml diz quanto o porteiro (o hook pre-ferramenta) dispensa de pergunta. Só o
// cauteloso e o equilibrado existem de fato; o autonomo depende da trava de produção por arquivo (PLG-13) e,
// até lá, vale como equilibrado. Campo ausente: equilibrado (o comportamento de antes). Valor que não é um dos
// três: cauteloso (na dúvida, perguntar). A variável INTOCA_RIGOR sobrepõe o manifesto (teste, uso temporário).
export const NIVEIS_DE_RIGOR = Object.freeze(['cauteloso', 'equilibrado', 'autonomo']);
const ILEGIVEL = '(ilegível)'; // o campo existe, mas o leitor não entende o valor

// Valor cru de `rigor` dentro do mapa `sede:` de topo (em bloco ou em linha): undefined se o campo não existe.
// Na dúvida vale o mais restritivo (ILEGIVEL, que vira cauteloso): valor vazio, o campo repetido com valores
// diferentes, ou uma linha `rigor:` em qualquer outro lugar do arquivo (no topo, mais recuada, debaixo de uma
// `sede` entre aspas), porque quem a escreveu quis um nível e o leitor não saberia qual.
function rigorDoManifesto(linhas) {
  const inicio = linhas.findIndex((l) => /^sede:/.test(l));
  const pares = [];
  const lidas = new Set(); // linhas `rigor:` lidas como campo da sede
  if (inicio >= 0) {
    const resto = linhas[inicio].slice('sede:'.length).trim();
    if (resto.startsWith('{')) {
      const fim = resto.lastIndexOf('}');
      const partes = fim < 0 ? null : partesDeFluxo(resto.slice(1, fim));
      // Mapa que não fecha na mesma linha (aberto em várias linhas, ou quebrado): nada vira campo. Um `rigor`
      // nesta linha é dúvida; um nas linhas seguintes cai na checagem "fora" abaixo. Os dois valem cauteloso.
      if (!partes && /\brigor['"]?\s*:/.test(resto)) return ILEGIVEL;
      for (const p of partes ?? []) {
        const kv = chaveDoManifesto(p);
        if (kv) pares.push(kv);
      }
    } else if (resto === '' || resto.startsWith('#')) {
      let coluna = -1;
      for (let i = inicio + 1; i < linhas.length; i += 1) {
        const linha = linhas[i];
        if (/^\s*(#.*)?$/.test(linha)) continue;
        if (/^\S/.test(linha)) break;
        const recuo = linha.match(/^\s*/)[0].length;
        if (coluna < 0) coluna = recuo;
        if (recuo !== coluna) continue; // mapa mais fundo: não é campo da sede
        const kv = chaveDoManifesto(linha.slice(recuo));
        if (kv) {
          pares.push(kv);
          if (kv[0] === 'rigor') lidas.add(i);
        }
      }
    }
  }
  const fora = linhas.some((l, i) => !lidas.has(i) && /^\s*['"]?rigor['"]?\s*:/.test(l));
  const achados = pares.filter(([chave]) => chave === 'rigor').map(([, v]) => v);
  if (fora) return ILEGIVEL;
  if (achados.length === 0) return undefined;
  const valores = achados.map((v) => (v.ok && v.valor !== undefined && v.valor !== null ? v.valor : ILEGIVEL));
  if (valores.some((v) => JSON.stringify(v) !== JSON.stringify(valores[0]))) return ILEGIVEL;
  return valores[0];
}

// Nível em vigor: { nivel: 'cauteloso' | 'equilibrado', pedido, origem: 'variavel' | 'manifesto' | 'padrao',
// aviso: null | 'autonomo-indisponivel' | 'invalido' }. `variavel: false` ignora INTOCA_RIGOR (o script que
// escreve configuração segue só o manifesto).
export function nivelDeRigor(manifesto, { variavel = true } = {}) {
  const env = variavel && typeof process.env.INTOCA_RIGOR === 'string' ? process.env.INTOCA_RIGOR.trim() : '';
  let pedido;
  let origem;
  if (env !== '') {
    pedido = env;
    origem = 'variavel';
  } else {
    pedido = manifesto?.rigor;
    if (pedido === undefined || pedido === null) return { nivel: 'equilibrado', pedido: null, origem: 'padrao', aviso: null };
    origem = 'manifesto';
  }
  const n = typeof pedido === 'string' ? pedido.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase() : null;
  if (n === 'cauteloso' || n === 'equilibrado') return { nivel: n, pedido, origem, aviso: null };
  if (n === 'autonomo') return { nivel: 'equilibrado', pedido, origem, aviso: 'autonomo-indisponivel' };
  return { nivel: 'cauteloso', pedido, origem, aviso: 'invalido' };
}

// `repositorios:` de um projeto (PLG-25): lista de itens `- {pasta: '...', ...}` ou `- pasta: '...'` (com as outras
// chaves do item na linha de baixo). Devolve a pasta da linha, ou null se a linha não traz `pasta:`.
function pastaDoRepositorio(linha) {
  const texto = linha.trim().replace(/^-\s+/, '');
  if (texto.startsWith('{')) {
    const fim = texto.lastIndexOf('}');
    const partes = fim < 0 ? null : partesDeFluxo(texto.slice(1, fim));
    for (const parte of partes ?? []) {
      const kv = chaveDoManifesto(parte);
      if (kv && kv[0] === 'pasta' && kv[1].ok && typeof kv[1].valor === 'string') return kv[1].valor;
    }
    return null;
  }
  const kv = chaveDoManifesto(texto);
  return kv && kv[0] === 'pasta' && kv[1].ok && typeof kv[1].valor === 'string' ? kv[1].valor : null;
}

// Texto do sede.yaml → { projetos: [{ nome, sigla, pasta_atual, ... }], titulos, rigor }, ou null se ilegível
// (sem a chave `projetos:` no topo, ou item em linha que não fecha). `rigor` é o valor cru (ver nivelDeRigor).
export function interpretarManifesto(texto) {
  if (typeof texto !== 'string') return null;
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const inicio = linhas.findIndex((l) => /^projetos:\s*(#.*)?$/.test(l) || /^projetos:\s*\[\s*\]\s*(#.*)?$/.test(l));
  if (inicio < 0) return null;
  if (/\[\s*\]/.test(linhas[inicio])) return { projetos: [], titulos: titulosDoManifesto(linhas), rigor: rigorDoManifesto(linhas) };
  const projetos = [];
  let atual = null;
  let colunaDasChaves = -1;
  let recuoDaLista = -1;
  let chaveAtual = '';
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (/^\s*(#.*)?$/.test(linha)) continue;
    if (/^\S/.test(linha)) break; // próxima chave de topo
    const item = linha.match(/^(\s*)-\s+(.*)$/);
    if (item && (recuoDaLista < 0 || item[1].length === recuoDaLista)) {
      recuoDaLista = item[1].length;
      const resto = item[2];
      if (resto.startsWith('{')) {
        const fim = resto.lastIndexOf('}');
        const depois = fim < 0 ? '' : resto.slice(fim + 1).trim();
        if (fim < 0 || (depois !== '' && !depois.startsWith('#'))) return null;
        const partes = partesDeFluxo(resto.slice(1, fim));
        if (!partes) return null;
        const projeto = {};
        for (const p of partes) {
          const kv = chaveDoManifesto(p);
          if (!kv) return null;
          guardarCampo(projeto, kv[0], kv[1]);
        }
        projetos.push(projeto);
        atual = null;
        chaveAtual = '';
        continue;
      }
      atual = {};
      projetos.push(atual);
      colunaDasChaves = linha.length - resto.length;
      const kv = chaveDoManifesto(resto);
      chaveAtual = kv ? kv[0] : '';
      if (kv) guardarCampo(atual, kv[0], kv[1]);
      continue;
    }
    if (!atual) continue;
    const recuo = linha.match(/^\s*/)[0].length;
    if (recuo > colunaDasChaves && chaveAtual === 'repositorios') {
      const pasta = pastaDoRepositorio(linha);
      if (pasta) (atual.repositorios ??= []).push(pasta);
      continue;
    }
    if (recuo !== colunaDasChaves) continue;
    const kv = chaveDoManifesto(linha.slice(recuo));
    if (kv) { chaveAtual = kv[0]; guardarCampo(atual, kv[0], kv[1]); }
  }
  return { projetos, titulos: titulosDoManifesto(linhas), rigor: rigorDoManifesto(linhas) };
}

export function lerManifesto(sede) {
  try {
    return interpretarManifesto(readFileSync(join(String(sede), 'sede.yaml'), 'utf8'));
  } catch {
    return null;
  }
}

// ------------------------------ caminhos

// Chave de comparação: no Windows a caixa não distingue arquivos.
const chaveDeCaminho = (p) => (NO_WINDOWS ? p.toLowerCase() : p);

// `filho` está dentro de `pai` (com `igual`, também quando é o próprio `pai`). Compara depois de
// resolver `.` e `..`, sem diferença de caixa no Windows.
export function contem(pai, filho, igual = false) {
  const a = chaveDeCaminho(resolve(String(pai)));
  const b = chaveDeCaminho(resolve(String(filho)));
  if (a === b) return igual;
  const r = relative(a, b);
  return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r);
}

// Caminho real: o `realpath` do ancestral existente mais fundo, mais o resto do caminho. Desfaz link
// simbólico, junção e nome curto do Windows (SETTIN~1.JSO). Devolve null se um pedaço do caminho é um
// link quebrado (escrever nele criaria o arquivo onde o link aponta) ou se nada existe.
export function caminhoReal(p) {
  let atual = resolve(String(p));
  const resto = [];
  for (let i = 0; i < 256; i += 1) {
    try {
      const real = realpathSync.native(atual);
      return resto.length ? join(real, ...resto.reverse()) : real;
    } catch { /* não existe ou não resolve: sobe um nível */ }
    try { lstatSync(atual); return null; } catch { /* não existe mesmo */ }
    const pai = dirname(atual);
    if (pai === atual) return null;
    resto.push(basename(atual));
    atual = pai;
  }
  return null;
}

// Pedaços do caminho, em minúsculas e sem ponto ou espaço no fim (o Windows os ignora: `.env.` é `.env`).
function pedacos(caminho) {
  return String(caminho).split(/[\\/]+/).filter(Boolean).map((p) => p.toLowerCase().replace(/[. ]+$/, ''));
}

// Nome de segredo da família `.env` (PLG-21): uma só fonte de verdade, usada pelo "negar" e pelo "permitir".
// `nome` já vem em minúsculas. É env o `.env`, o `.env.<finalidade>` e o `<nome>.env` (`hospedagem.env`);
// `.environment.md` não é. Modelo (sem valor, entregue pela IA) é nome de env que termina em `.example`,
// `.sample` ou `.template`, com qualquer prefixo ou finalidade: `.env.example`, `.env.crm.example`,
// `hospedagem.env.example`. `.env.example.local` não termina num sufixo de modelo e continua segredo.
const SUFIXOS_DE_MODELO = ['.example', '.sample', '.template'];
export function semSufixoDeModelo(nome) {
  const s = SUFIXOS_DE_MODELO.find((x) => nome.length > x.length && nome.endsWith(x));
  return s ? nome.slice(0, -s.length) : null;
}
// Também `.env_prod`, `.env-prod`, `.env~` e `.envrc` (o `.gitignore` ignora todos); `.environment.md` e `.envelope` não.
export const ehNomeDeEnv = (nome) => /^\.env(?:$|[^a-z0-9]|rc$)/.test(nome) || nome.endsWith('.env');
export function ehModeloDeEnv(nome) {
  const base = semSufixoDeModelo(nome);
  return base !== null && ehNomeDeEnv(base);
}
export const ehEnvDeSegredo = (nome) => ehNomeDeEnv(nome) && !ehModeloDeEnv(nome);

const PASTAS_DE_SEGREDO = new Set([
  '.ssh', '.aws', '.gnupg', '.kube', '.docker', '.azure', 'gcloud', '.password-store', '.wrangler',
  '_segredos', // backup antigo ou cofre que alguém restaure na árvore (PLG-21)
]);
const NOMES_DE_SEGREDO = new Set([
  '.git-credentials', '.npmrc', '.netrc', '_netrc', '.pgpass', '.pypirc', '.htpasswd',
  'sftp.json', 'sftp-config.json', 'login data', 'cookies', 'web data', '.claude.json', '.wrangler',
]);
// Pastas onde `hosts.yml` é o token do GitHub CLI: `.config/gh/` e, no Windows, `GitHub CLI/`.
const PASTAS_DO_GH = new Set(['gh', 'github cli']);
const EXTENSOES_DE_SEGREDO = ['pem', 'key', 'pfx', 'p12', 'ppk', 'jks', 'keystore', 'kdbx', 'env'];
const EXTENSAO_DE_SEGREDO = new RegExp(`\\.(${EXTENSOES_DE_SEGREDO.join('|')})$`);
const CHAVES_SSH = ['rsa', 'dsa', 'ecdsa', 'ed25519'];
// As listas acima, só para leitura: o teste confere que os modelos de permissão (PLG-14) negam o mesmo conjunto.
export const LISTAS_DE_SEGREDO = Object.freeze({
  pastas: Object.freeze([...PASTAS_DE_SEGREDO]), nomes: Object.freeze([...NOMES_DE_SEGREDO]),
  extensoes: Object.freeze([...EXTENSOES_DE_SEGREDO]), chavesSsh: Object.freeze([...CHAVES_SSH]),
  pastasDoGh: Object.freeze([...PASTAS_DO_GH]),
});

// Arquivo de segredo para a autorização por regra (lista ampla). Serve só para tirar o "permitir":
// não vira bloqueio, para não barrar arquivo legítimo como `secret-santa.md`. A PLG-11a acrescentou
// `.dev.vars`, `.claude.json`, `hosts.yml` do GitHub CLI e a pasta `.wrangler`.
export function caminhoDeSegredo(caminho) {
  const partes = pedacos(caminho);
  const nome = partes.at(-1) ?? '';
  for (let k = 0; k < partes.length; k += 1) {
    if (k < partes.length - 1 && PASTAS_DE_SEGREDO.has(partes[k])) return true;
    if (partes[k] === '.out' && partes[k + 1] === 'private') return true;
  }
  if (ehModeloDeEnv(nome)) return false;
  if (nome.startsWith('.env')) return true;
  if (nome === '.dev.vars' || nome.startsWith('.dev.vars.')) return true; // segredos locais do Wrangler
  if (nome === 'hosts.yml' && PASTAS_DO_GH.has(partes.at(-2))) return true;
  if (EXTENSAO_DE_SEGREDO.test(nome)) return true;
  // Modelo de chave não é modelo de env: `chave.pem.example` continua segredo (o mais restritivo).
  if (EXTENSAO_DE_SEGREDO.test(semSufixoDeModelo(nome) ?? '')) return true;
  if (CHAVES_SSH.some((k) => nome.startsWith(`id_${k}`))) return true;
  if (NOMES_DE_SEGREDO.has(nome)) return true;
  if (/credential|token|secret|password|passwd/.test(nome)) return true;
  if (nome === 'config' && partes.at(-2) === '.git') return true; // URL de remoto pode levar token
  return false;
}

// Lugar onde a autorização por regra nunca permite escrever (fica com as regras do app): dentro de
// `.git`, `.claude/settings*.json`, `.mcp.json`, qualquer coisa dentro de uma pasta `autorizacoes` (a
// assinatura do dono) e arquivo de segredo.
export function caminhoProtegido(caminho) {
  const partes = pedacos(caminho);
  const nome = partes.at(-1) ?? '';
  if (partes.includes('.git') || partes.includes('autorizacoes')) return true;
  if (partes.at(-2) === '.claude' && /^settings.*\.json$/.test(nome)) return true;
  if (nome === '.mcp.json') return true;
  return caminhoDeSegredo(caminho);
}

// ------------------------------ contexto de pastas (PLG-10, movido para cá na PLG-02)
// Era de pre-ferramenta.mjs; saiu sem mudar o comportamento para que os hooks de aviso (chat-trocado
// e pasta-errada) reaproveitem o cálculo de "quem é o chat". Todas devolvem null ou false na dúvida.

// Um caminho em duas formas: como foi escrito (resolvido) e real (sem link, junção nem nome curto).
// As regras de lugar exigem as duas dentro do lugar: um link que sai, ou um caminho que só entra por
// link, perde o "permitir". O caminho real só é calculado quando é preciso (comparação textual já
// passou), para o hook não visitar o disco por pasta de projeto que nem chega perto.
export function forma(p) {
  const lex = resolve(String(p));
  let real;
  let calculado = false;
  return {
    lex,
    get real() {
      if (!calculado) { real = caminhoReal(lex); calculado = true; }
      return real;
    },
  };
}
export function dentroDe(pai, filho, igual = false) {
  return contem(pai.lex, filho.lex, igual) && Boolean(pai.real && filho.real) && contem(pai.real, filho.real, igual);
}
// Pasta do manifesto que vale como lugar: caminho absoluto (no Windows, com letra de unidade; nunca
// caminho de rede). "a decidir" e null ficam de fora.
export const absoluto = (p) => typeof p === 'string' && isAbsolute(p)
  && (process.platform !== 'win32' || /^[A-Za-z]:[\\/]/.test(p));
export const nomeComparavel = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);

// Projeto mais específico (pasta mais longa) cuja pasta contém `alvo`: { projeto, pasta } ou null.
export function donoPorPasta(ctx, alvo, igual) {
  let melhor = null;
  for (const projeto of ctx.projetos) {
    for (const pasta of projeto.pastas) {
      if (dentroDe(pasta, alvo, igual) && (!melhor || pasta.lex.length > melhor.pasta.lex.length)) melhor = { projeto, pasta };
    }
  }
  return melhor;
}

// Dono de `<sede>/_worktrees/<pasta>`: o projeto cujo nome de pasta (`pasta_atual`) é o prefixo
// `<nome>-`, ou a própria sede (`<nome da sede>-`). Mais de um candidato, ou nenhum: null.
export function donoDaWorktree(ctx, nomeDaPasta) {
  const n = nomeComparavel(nomeDaPasta);
  const candidatos = [];
  for (const projeto of ctx.projetos) {
    if (!projeto.atual) continue;
    if (n.startsWith(`${nomeComparavel(basename(projeto.atual.lex))}-`)) candidatos.push({ tipo: 'projeto', projeto });
  }
  if (n.startsWith(`${nomeComparavel(basename(ctx.sede.lex))}-`)) candidatos.push({ tipo: 'sede' });
  return candidatos.length === 1 ? candidatos[0] : null;
}

// Pasta de primeiro nível dentro de <sede>/_worktrees que contém `alvo`, ou null.
export function pastaDeWorktree(ctx, alvo) {
  if (!dentroDe(ctx.worktrees, alvo)) return null;
  const r = relative(ctx.worktrees.lex, alvo.lex).split(/[\\/]+/);
  return { nome: r[0], profundidade: r.length };
}

// ------------------------------ projeto dentro de worktree da sede (PLG-24)
// Executor por cartão recebe uma worktree do repositório da sede: `<raiz>/.claude/worktrees/<nome>/`,
// `<sede>/_worktrees/<nome>/` ou, quando o chat abre numa pasta de projeto, `<pasta do projeto>/.claude/worktrees/<nome>/`.
// O projeto que mora em subpasta da sede (`_infra/aplicativo`) passa a morar em `<worktree>/_infra/aplicativo`, e o
// manifesto (que guarda o caminho do checkout principal) não o reconhece por texto. Esta é a única função que
// traduz "caminho dentro da worktree" em "projeto": o redirecionamento de governança, a área de trabalho do chat, o
// `quemEoChat` e o `chat-trocado` a usam.

// Pedaços de um caminho já resolvido, comparáveis (caixa no Windows; ponto e espaço no fim não contam).
export const pedacosDe = (caminho) => resolve(caminho).split(/[\\/]+/)
  .map((p) => nomeComparavel(NO_WINDOWS ? p.replace(/[. ]+$/, '') : p));
export const juntar = (partes) => resolve(`${partes.join(sep)}${sep}`);
const parteComparavel = (p) => nomeComparavel(NO_WINDOWS ? p.replace(/[. ]+$/, '') : p);

// Worktree por marcador no caminho: `<antes>/_worktrees/<nome>` ou `<antes>/.claude/worktrees/<nome>`.
// Devolve { x, nome, tipo, antes, resto } (x = a raiz da worktree; resto = pedaços depois dela) ou null.
export function marcadorDeWorktree(caminho) {
  const partes = resolve(caminho).split(/[\\/]+/);
  const norm = pedacosDe(caminho);
  for (let i = 1; i < norm.length; i += 1) {
    let tipo = null;
    let nome = null;
    let fim = -1;
    if (norm[i] === '_worktrees' && norm[i + 1] !== undefined) {
      tipo = '_worktrees'; nome = partes[i + 1]; fim = i + 1;
    } else if (norm[i] === '.claude' && norm[i + 1] === 'worktrees' && norm[i + 2] !== undefined) {
      tipo = '.claude'; nome = partes[i + 2]; fim = i + 2;
    }
    if (tipo) {
      return {
        x: juntar(partes.slice(0, fim + 1)), nome, tipo,
        antes: juntar(partes.slice(0, i)), resto: norm.slice(fim + 1).filter(Boolean),
      };
    }
  }
  return null;
}

// Um caminho (texto, já resolvido) dentro de uma worktree da sede: { projeto, projetos, nivel, resto, x, orig } ou null.
// Só vale se a raiz da worktree tem `sede.yaml` (é worktree do repositório da sede, não de um repositório alheio), se
// há pelo menos um pedaço depois da raiz e se a worktree fica dentro da sede viva que contém a pasta do projeto. O
// projeto é o de pasta mais específica cujo caminho relativo à sede é prefixo do que vem depois da raiz da worktree. Só
// valem as pastas que dão identidade no checkout (`pasta_atual`, `pasta_futura`, repositórios): `pastas_antigas` não.
// `real`: compara com as pastas reais do manifesto (para o caminho já desfeito de link, junção e nome curto).
function projetoPorSubpasta(ctx, caminho, real) {
  const m = marcadorDeWorktree(caminho);
  if (!m || m.resto.length === 0 || !temManifesto(m.x)) return null;
  let melhor = null;
  const donos = new Set();
  for (const projeto of ctx.projetos) {
    for (const pasta of projeto.pastas) {
      const lugar = real ? pasta.real : pasta.lex;
      if (!lugar) continue;
      const raiz = acharSede(lugar);
      if (!raiz || !contem(raiz, lugar) || !contem(raiz, m.x)) continue;
      const orig = relative(raiz, lugar).split(/[\\/]+/).filter(Boolean);
      const rel = orig.map(parteComparavel);
      if (rel.length === 0 || rel.length > m.resto.length || !rel.every((p, k) => p === m.resto[k])) continue;
      if (!melhor || rel.length > melhor.nivel) {
        melhor = { projeto, nivel: rel.length, orig };
        donos.clear();
      }
      if (rel.length === melhor.nivel) donos.add(projeto);
    }
  }
  return melhor ? { ...melhor, projetos: [...donos], resto: m.resto, x: m.x } : null;
}

// O alvo (uma `forma`) é um caminho dentro de worktree da sede com projeto reconhecido?
//   null                      não é (outro tipo de caminho, repositório alheio, link, junção): vale o que já valia.
//   { ambiguo: true, naRaiz } dois projetos de pastas igualmente específicas: sem dono, o chamador é o mais restritivo.
//   { projeto, raiz, pasta, naRaiz }
//                             projeto dono; raiz = raiz da worktree; pasta = a pasta dele dentro da worktree;
//                             naRaiz = o alvo é a própria pasta do projeto.
// A forma escrita e a real precisam dar o mesmo projeto e o mesmo trecho depois da raiz: link ou junção que mude o
// destino não ganha reconhecimento.
export function projetoNaWorktreeDaSede(ctx, alvo) {
  const lex = projetoPorSubpasta(ctx, alvo.lex, false);
  if (!lex) return null;
  const real = alvo.real ? projetoPorSubpasta(ctx, alvo.real, true) : null;
  if (!real || real.nivel !== lex.nivel || real.resto.join('/') !== lex.resto.join('/')
    || real.projetos.length !== lex.projetos.length || !lex.projetos.every((p) => real.projetos.includes(p))) return null;
  // A raiz real da worktree tem de ser a da forma escrita: uma junção que leva a outra worktree com o mesmo trecho não vale.
  const raizReal = caminhoReal(lex.x);
  if (!raizReal || !mesmoCaminho(raizReal, real.x)) return null;
  const naRaiz = lex.resto.length === lex.nivel;
  if (lex.projetos.length !== 1) return { ambiguo: true, naRaiz };
  return { projeto: lex.projeto, raiz: lex.x, pasta: join(lex.x, ...lex.orig), naRaiz };
}

// Quem é o chat, pelo cwd: { tipo: 'projeto', projeto } | { tipo: 'sede' } | null. Numa worktree da sede com o projeto
// em subpasta, o chat é o projeto (`pasta`: a pasta dele dentro da worktree).
export function quemEoChat(ctx) {
  const w = projetoNaWorktreeDaSede(ctx, ctx.cwd);
  if (w) return w.ambiguo ? null : { tipo: 'projeto', projeto: w.projeto, pasta: w.pasta };
  const wt = pastaDeWorktree(ctx, ctx.cwd);
  if (wt) return donoDaWorktree(ctx, wt.nome);
  const dono = donoPorPasta(ctx, ctx.cwd, true);
  if (dono) return { tipo: 'projeto', projeto: dono.projeto };
  if (dentroDe(ctx.sede, ctx.cwd, true)) return { tipo: 'sede' };
  return null;
}

// ------------------------------ cargo do chat e texto do proprietário (PLG-25)

// O cargo do chat vem do título do PRÓPRIO chat (`session_title`), nunca do conteúdo de uma mensagem. O título é
// dado, nunca ordem: só se reconhece o padrão `Cargo · Projeto` / `Executor · ID tema`. Primeiro vale o padrão
// do manifesto (`titulos:` do sede.yaml, PLG-03); depois, como reserva, o padrão fixo de sempre, que continua
// valendo mesmo quando a sede escolheu outro nome. Devolve { cargo, os? } ou null.
export function cargoDoTitulo(titulo, titulos) {
  if (typeof titulo !== 'string') return null;
  const t = titulo.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (titulos) {
    for (const [chave, cargo] of [['diretoria', 'Diretoria'], ['secretaria', 'Secretaria'], ['gerente', 'Gerente'], ['plantao', 'Plantão'], ['executor', 'Executor']]) {
      const re = regexDoTitulo(chave, titulos[chave]);
      const m = re ? t.match(re) : null;
      if (m) return cargo === 'Executor' ? { cargo, os: m[1] } : { cargo };
    }
  }
  if (/^Diretoria(?: · .*)?$/i.test(t)) return { cargo: 'Diretoria' };
  if (/^Secretaria(?: · .*)?$/i.test(t)) return { cargo: 'Secretaria' };
  // PLG-26: `Gerente` sozinho vale (sede com um só gerente); `Gerente InToca` e `Gerente -` não, pois falta o separador.
  if (/^Gerente(?: · .+)?$/i.test(t)) return { cargo: 'Gerente' };
  if (/^Plant[aã]o · .+ · .+$/i.test(t)) return { cargo: 'Plantão' };
  const m = t.match(/^Executor · ([A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?)(?: .+)?$/i);
  if (m) return { cargo: 'Executor', os: m[1] };
  return null;
}

// Mensagem entre chats, notificação do sistema e texto colado não são "pedido do proprietário". O texto de um
// prompt sem esses blocos é o que as pessoas digitaram ali (ou, num chat de cargo, o que a ferramenta entregou
// como pedido). Bloco sem fechamento vale até o fim do prompt. Também sai o que está em bloco de código cercado
// e em linha de citação (`> ...`): quem cita não está pedindo.
const ENVELOPES = ['cross-session-message', 'system-reminder', 'task-notification', 'side-sessions-event', 'ci-monitor-event',
  'pasted_content', 'local-command-stdout', 'local-command-caveat', 'command-message', 'user-prompt-submit-hook'];
export function textoDoProprietario(prompt, { citacoes = true } = {}) {
  let t = String(prompt ?? '');
  const nomes = ENVELOPES.map((n) => n.replace(/[-_]/g, '[-_]')).join('|');
  const fechado = new RegExp(`<(${nomes})\\b[^>]*>[\\s\\S]*?</\\1\\s*>`, 'gi');
  const aberto = new RegExp(`<(?:${nomes})\\b[^>]*>[\\s\\S]*$`, 'i');
  for (let i = 0; i < 4; i += 1) {
    const novo = t.replace(fechado, ' ');
    if (novo === t) break;
    t = novo;
  }
  t = t.replace(aberto, ' ');
  if (citacoes) t = t.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/^[ \t]*>.*$/gm, ' ');
  return t.trim();
}

// Projetos do manifesto (já montados em ctx.projetos) que respondem à sigla do ID de uma OS (`PLG-25` → PLG),
// incluindo as siglas antigas que o manifesto atribui ao projeto atual (`siglas_antigas`).
export function projetosDaSigla(projetos, id) {
  const prefixo = String(id ?? '').match(/^([A-Za-z][A-Za-z0-9]*)-\d/)?.[1]?.toUpperCase();
  return prefixo ? projetos.filter((p) => (p.siglas ?? []).includes(prefixo)) : [];
}

// Variável de silêncio ligada: definida e diferente de "0" (ou vazia).
export function variavelLigada(nome) {
  const v = process.env[nome];
  return Boolean(v) && v !== '0';
}

// Contexto da sessão: sede, manifesto e quem é o chat. null quando não há sede, o manifesto é
// ilegível ou o cwd não resolve. `ctx.chat` pode ser null (cwd fora de qualquer projeto e da sede).
// Não olha variável de silêncio nenhuma: quem chama decide.
export function montarContexto(entrada) {
  const r = raizes(entrada);
  if (!r) return null;
  const manifesto = r.manifesto ?? lerManifesto(r.sede);
  if (!manifesto) return null;
  const projetos = [];
  for (const p of manifesto.projetos) {
    const atual = absoluto(p.pasta_atual) ? forma(p.pasta_atual) : null;
    const futura = absoluto(p.pasta_futura) ? forma(p.pasta_futura) : null;
    const pastas = [atual, futura].filter(Boolean);
    const antigas = (Array.isArray(p.pastas_antigas) ? p.pastas_antigas : []).filter(absoluto).map(forma);
    // Outros repositórios do projeto (`repositorios:`, PLG-25) também são pasta dele; a pasta-mãe deles, quando é
    // filha direta da sede (a governança da sala animada mora em `<sede>/sala`), vale como pasta do projeto.
    for (const rep of (Array.isArray(p.repositorios) ? p.repositorios : []).filter(absoluto)) {
      pastas.push(forma(rep));
      const mae = dirname(resolve(rep));
      // Nunca adota como mãe uma pasta de infraestrutura da sede (`_worktrees`, `_infra`, `diretoria`, `labs`).
      const nomeDaMae = basename(mae).toLowerCase();
      if (mae !== resolve(rep) && mesmoCaminho(dirname(mae), r.sede) && !nomeDaMae.startsWith('_')
        && !['diretoria', 'labs', '.claude'].includes(nomeDaMae)) pastas.push(forma(mae));
    }
    if (pastas.length || antigas.length) {
      const siglas = [p.sigla, ...(Array.isArray(p.siglas_antigas) ? p.siglas_antigas : [])]
        .filter((x) => typeof x === 'string' && /^[A-Za-z][A-Za-z0-9]{1,7}$/.test(x)).map((x) => x.toUpperCase());
      projetos.push({
        nome: String(p.nome ?? (pastas[0] ? basename(pastas[0].lex) : '')), atual, pastas, antigas,
        branch: p.branch_principal, sigla: p.sigla, siglas, repositorios: Array.isArray(p.repositorios) ? p.repositorios.filter(absoluto) : [],
      });
    }
  }
  const ctx = {
    cwd: forma(resolve(String(entrada.cwd || process.cwd()))),
    sede: forma(r.sede),
    worktrees: forma(join(r.sede, '_worktrees')),
    projetos,
    manifesto,
    chat: null,
  };
  if (!ctx.cwd.real || !ctx.sede.real) return null;
  ctx.chat = quemEoChat(ctx);
  return ctx;
}

// ------------------------------ refs do Git, lidas sem rodar o git

// Pasta comum do Git (onde ficam refs/ e packed-refs) do repositório que contém `dir`, subindo até
// achar `.git` (pasta, ou arquivo `gitdir:` de worktree, que aponta a pasta comum por `commondir`).
// null se não acha, ou se o repositório usa reftable (formato que este leitor não entende).
export function pastaGitComum(dir) {
  let atual = resolve(String(dir));
  for (let i = 0; i < 64; i += 1) {
    const ponto = join(atual, '.git');
    let info = null;
    try { info = statSync(ponto); } catch { /* sobe */ }
    if (info) {
      let gitDir = ponto;
      if (info.isFile()) {
        const m = readFileSync(ponto, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m);
        if (!m) return null;
        gitDir = resolve(atual, m[1]);
      }
      let comum = gitDir;
      try { comum = resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()); } catch { /* sem commondir */ }
      try { statSync(join(comum, 'reftable')); return null; } catch { /* refs em arquivos */ }
      return comum;
    }
    const pai = dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
  return null;
}

// No `git push origin <nome>`, o git procura <nome> nesta ordem: refs/<nome>, refs/tags/<nome>,
// refs/heads/<nome>. Devolve true só quando o primeiro que existe é refs/heads/<nome>, isto é, o
// push leva exatamente aquele branch local (um tag com o mesmo nome, ou nome inexistente: false).
export function ehSoBranchLocal(dir, nome) {
  const comum = pastaGitComum(dir);
  if (!comum) return false;
  const empacotadas = new Set();
  try {
    for (const l of readFileSync(join(comum, 'packed-refs'), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^[0-9a-f]{40,64} (refs\/\S+)$/);
      if (m) empacotadas.add(m[1]);
    }
  } catch { /* sem packed-refs */ }
  const existe = (ref) => {
    if (empacotadas.has(ref)) return true;
    try { return statSync(join(comum, ...ref.split('/'))).isFile(); } catch { return false; }
  };
  return !existe(`refs/${nome}`) && !existe(`refs/tags/${nome}`) && existe(`refs/heads/${nome}`);
}

// ------------------------------ comandos

// Caracteres que tiram qualquer comando da autorização por regra, mesmo entre aspas: separadores e
// encadeamento (; & |), redirecionamento (< >), substituição e variáveis (crase, $ em qualquer forma),
// variáveis do cmd (%), escape do cmd (^), quebra de linha, caracteres de controle e as aspas
// tipográficas que o PowerShell aceita como aspas.
const PROIBIDOS_NO_COMANDO = /[;&|<>`$%^\r\n\u0000-\u0008\u000b-\u001f\u007f‘’‚‛“”„]/;

// Divide um comando simples em palavras, do jeito que o Bash e o PowerShell 5.1 concordam. Devolve
// [{ valor, aspas }] ou null quando o comando sai do que se pode ler com certeza:
// - fora de aspas, só letras ASCII, dígitos e `_ - . / : = + ~` (e `\` no PowerShell; no Bash a barra
//   invertida é escape); palavra não começa com `~` (o Bash troca pela pasta do usuário);
// - aspas simples são literais nos dois; aspas duplas não podem ter `"` dentro (nem `\` no Bash);
// - aspas cobrem a palavra inteira (`a'b'` e `'a'b` dividem diferente nos dois intérpretes).
export function dividirComando(texto, shell) {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > 4000 || PROIBIDOS_NO_COMANDO.test(texto)) return null;
  const simples = shell === 'powershell' ? /^[A-Za-z0-9_\-./:=+~\\]$/ : /^[A-Za-z0-9_\-./:=+~]$/;
  const palavras = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === ' ' || c === '\t') { i += 1; continue; }
    if (c === "'" || c === '"') {
      const fim = texto.indexOf(c, i + 1);
      if (fim < 0) return null;
      const valor = texto.slice(i + 1, fim);
      if (c === '"' && shell !== 'powershell' && valor.includes('\\')) return null;
      const depois = texto[fim + 1];
      if (depois !== undefined && depois !== ' ' && depois !== '\t') return null;
      palavras.push({ valor, aspas: true });
      i = fim + 1;
      continue;
    }
    let fim = i;
    while (fim < texto.length && texto[fim] !== ' ' && texto[fim] !== '\t') {
      if (!simples.test(texto[fim])) return null;
      fim += 1;
    }
    const valor = texto.slice(i, fim);
    if (valor.startsWith('~')) return null;
    palavras.push({ valor, aspas: false });
    i = fim;
  }
  return palavras.length ? palavras : null;
}

// Lê os argumentos de um subcomando contra uma lista fechada de opções. `spec`:
//   longas: { '--nome': 0 | 1 | 2 }   0 sem valor; 1 valor obrigatório (`=` ou palavra seguinte);
//                                      2 valor opcional, só com `=`
//   curtas: { letra: 0 | 1 | 2 }      1: o resto da palavra ou a palavra seguinte; 2: só o resto
//   numeros: aceita `-<n>` (git log -5);  separador: aceita `--` (o resto é posicional)
// Opção fora da lista (inclusive abreviação de opção longa, que o git aceitaria) → null.
export function lerArgumentos(args, spec) {
  const opcoes = [];
  const posicionais = [];
  let soPosicionais = false;
  for (let k = 0; k < args.length; k += 1) {
    const a = args[k];
    if (soPosicionais || !a.startsWith('-') || a === '-') { posicionais.push(a); continue; }
    if (a === '--') {
      if (!spec.separador) return null;
      soPosicionais = true;
      continue;
    }
    if (a.startsWith('--')) {
      const igual = a.indexOf('=');
      const nome = igual < 0 ? a : a.slice(0, igual);
      let valor = igual < 0 ? undefined : a.slice(igual + 1);
      const tipo = spec.longas?.[nome];
      if (tipo === undefined || !Object.hasOwn(spec.longas, nome)) return null;
      if (tipo === 0 && valor !== undefined) return null;
      if (tipo === 1 && valor === undefined) {
        if (k + 1 >= args.length) return null;
        k += 1;
        valor = args[k];
      }
      opcoes.push({ nome, valor });
      continue;
    }
    if (spec.numeros && /^-\d+$/.test(a)) { opcoes.push({ nome: '-<n>', valor: a.slice(1) }); continue; }
    for (let p = 1; p < a.length; p += 1) {
      const letra = a[p];
      const tipo = spec.curtas && Object.hasOwn(spec.curtas, letra) ? spec.curtas[letra] : undefined;
      if (tipo === undefined) return null;
      if (tipo === 0) { opcoes.push({ nome: `-${letra}` }); continue; }
      let valor = a.slice(p + 1);
      if (tipo === 1 && valor === '') {
        if (k + 1 >= args.length) return null;
        k += 1;
        valor = args[k];
      }
      opcoes.push({ nome: `-${letra}`, valor });
      break;
    }
  }
  return { opcoes, posicionais };
}
