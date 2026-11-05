#!/usr/bin/env node
// Hook PreToolUse (matcher: Edit|Write|MultiEdit|NotebookEdit|Read|Bash|PowerShell) do plugin intoca.
// Duas camadas, nesta ordem:
// 1. Negar (desde a DIR-12): escrita em arquivo de segredo e comandos que o regimento proíbe, com
//    motivo. Não depende de achar a sede: vale em qualquer pasta onde o plugin esteja ativo. Não
//    impede escrita em diretoria/autorizacoes/: nenhuma regra de negar olha o diretório, só o nome.
//    Exceção (PLG-21b): comando que só APAGA o `.env` não nega nem permite; responde "ask" (a pessoa
//    confirma no app), porque o arquivo real é a única cópia. Se também casar uma regra de negar, nega.
// 2. Permitir por regra (PLG-10): dentro de uma sede, devolve "allow" quando a chamada cumpre o
//    regimento (escrita na pasta do chat ou na governança, leitura que não é segredo, comandos de
//    rotina do Git e testes). Na dúvida, nenhuma decisão: a chamada segue para as regras do app.
//    O "allow" do hook não vence regra "ask" nem "deny" do settings.json (documentação oficial).
//    Em plan mode nunca há "allow" (PLG-11a); escrita e comandos só o recebem nos modos default,
//    acceptEdits e auto. INTOCA_SEM_AUTORIZACAO_POR_REGRA=1 desliga esta camada.
//    O rigor da sede (PLG-14, `sede: rigor:` do sede.yaml ou INTOCA_RIGOR) escolhe o conjunto: no
//    `equilibrado` (padrão) vale tudo acima; no `cauteloso` só a leitura que não é segredo e a escrita de
//    governança (diretoria/ e ops/, nunca autorizacoes/) recebem "allow"; o resto fica com as regras do app.
// 1b. Negar governança fora do lugar (PLG-02, parte C): `Write`/`Edit` em `diretoria/<...>` que não é a
//    da sede, ou em `ops/<...>` que não é a de um projeto, volta com o caminho certo no motivo. Só
//    nega com certeza; na dúvida (chat sem projeto, link ou junção, caminho de rede) não decide.
//    INTOCA_SEM_REDIRECIONAR=1 desliga esta parte.
// 1c. Avisar autorização de projeto na gaveta da sede (PLG-22, regra 4): `Write`/`Edit` em
//    `diretoria/autorizacoes/<arquivo>.md` cujo nome cita o ID de uma OS de PROJETO do manifesto (sigla de um
//    projeto só) ganha um aviso de uma linha (additionalContext) com a pasta certa, `<projeto>/ops/autorizacoes/`.
//    Nunca nega, nunca tira o "allow"/"ask" que já valeria; na dúvida (ID da sede, nome sem ID, sigla repetida,
//    data no lugar do número, duas siglas no nome) fica mudo. Sai só como additionalContext, que o app entrega junto
//    do resultado da ferramenta (a gravação pode já ter ocorrido): o texto manda regravar ou mover.
//    INTOCA_SEM_REDIRECIONAR=1 também desliga esta parte.
// Fora disso (e fora das partes acima) a chamada passa sem decisão (saída vazia). Não grava nada, não usa rede e não roda outro programa;
// lê o sede.yaml e, só no `git push`, as refs do repositório (para saber o que o nome do branch é).
// Nunca derruba o chat: qualquer erro interno termina em exit 0 sem saída (nunca "allow" por engano).
import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import {
  contem, caminhoDeSegredo, caminhoProtegido, dividirComando, lerArgumentos, ehSoBranchLocal,
  ehNomeDeEnv, ehModeloDeEnv, ehEnvDeSegredo, semSufixoDeModelo,
  forma, dentroDe, donoPorPasta, donoDaWorktree, pastaDeWorktree, montarContexto, variavelLigada, mesmoCaminho,
  acharSede, nomeComparavel, nivelDeRigor, pedacosDe, juntar, marcadorDeWorktree, projetoNaWorktreeDaSede,
} from './lib.mjs';
import { comandoMexeEmEnv } from './shell-env.mjs';

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));

const FERRAMENTAS_ARQUIVO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const FERRAMENTAS_SHELL = new Set(['Bash', 'PowerShell']);

// Mesmos casos da lista `deny` de .claude/settings.json (DIR-11), como segunda rede: pegam o
// comando em qualquer ordem de argumentos. Não são fronteira de segurança: `git -C . push` etc.
// `porLinha`: a regra vale por linha do comando (as quebras de linha não são juntadas antes do teste),
// para que `git` numa linha não "empreste" a opção de outra, como num texto de heredoc.
const COMANDOS = [
  // DIR-13: --no-verify só conta quando é opção de um comando git na mesma linha. Texto que apenas
  // cita a opção (echo, heredoc, grep, relatório) passa.
  {
    re: /\bgit\b[^|;&]*\s--no-verify(?![\w-])/i,
    porLinha: true,
    motivo: 'Nunca --no-verify: hook ou verificação que falha se corrige (regimento, regra 8).',
  },
  { re: /\bpush\b[^|;&]*\s--force/i, motivo: 'push com --force é proibido na sede. Peça ao proprietário, no chat do projeto.' },
  { re: /\bpush\b[^|;&]*\s-f(?:\s|$)/i, motivo: 'push com -f é proibido na sede. Peça ao proprietário, no chat do projeto.' },
  { re: /\breset\b[^|;&]*\s--hard\b/i, motivo: 'reset --hard descarta trabalho e é proibido na sede. Use um commit ou um branch.' },
];

function lerEntrada() {
  try {
    const bruto = readFileSync(0, 'utf8').replace(/^﻿/, '').trim();
    if (!bruto) return null;
    const dado = JSON.parse(bruto);
    return dado && typeof dado === 'object' && !Array.isArray(dado) ? dado : null;
  } catch {
    return null;
  }
}

function nomeDoArquivo(caminho) {
  return String(caminho).split(/[\\/]/).pop();
}

// Modelos de configuração (sem valores) não são segredo: .env.example é a fonte da porta e das
// variáveis nos sites. Decisão da Diretoria em 2026-10-12 (hooks-e-plugin, item 4); desde a PLG-21 o
// modelo vale com qualquer prefixo ou finalidade, e `*.env` também é segredo. As regras de nome de env
// moram no lib.mjs (uma fonte só, a mesma do "permitir").
const CHAVE_PRIVADA = /\.(?:pem|key)$/;

function ehNomeDeSegredo(nome) {
  if (ehModeloDeEnv(nome)) return false;
  // `chave.pem.example` não é modelo de env: continua segredo.
  return ehNomeDeEnv(nome) || CHAVE_PRIVADA.test(nome) || CHAVE_PRIVADA.test(semSufixoDeModelo(nome) ?? '')
    || nome === '.git-credentials';
}
// No Windows, ponto e espaço no fim do nome não contam (`.env ` é `.env`). O nome é testado como
// veio e sem o fim: basta uma das formas ser segredo (a forma curta nunca solta o que a longa negava).
function nomeDeSegredo(caminho, soEnv = false) {
  const nome = nomeDoArquivo(caminho).toLowerCase();
  const eh = soEnv ? (n) => ehEnvDeSegredo(n) : ehNomeDeSegredo;
  // Fluxo alternativo do NTFS (`.env::$DATA`, `.env:Zone`): o nome é o que vem antes dos dois pontos.
  const semFluxo = nome.split(':')[0];
  if (eh(nome) || eh(semFluxo)) return true;
  return process.platform === 'win32' && (eh(nome.replace(/[. ]+$/, '')) || eh(semFluxo.replace(/[. ]+$/, '')));
}

// O que a IA faz com segredo (regimento, regra 6): entrega o modelo, a pessoa copia e preenche. A
// mensagem do "negar" diz esse caminho em vez de só recusar.
const CAMINHO_DO_ENV = 'O arquivo real é da pessoa: crie o `.env.example` (nomes e comentários, sem valor) e ela copia e preenche '
  + '(`Copy-Item .env.example .env` no Windows; `cp .env.example .env` no Mac e no Linux).';
// Comando grande demais para o analisador conferir (PLG-21b): em vez de liberar, nega o que cita `env`.
const MOTIVO_DE_LIMITE = 'Comando grande demais para conferir se mexe num arquivo .env: separe-o em partes menores '
  + '(o plugin só nega o que consegue reconhecer, e este passou do limite de tamanho; regimento, regra 6).';
// Remover o `.env` não lê nem copia o valor, mas o arquivo real é a única cópia: o app pergunta à pessoa.
const MOTIVO_DE_REMOCAO = 'Apagar o `.env` perde a única cópia do segredo: confirme só se ele está guardado no cofre ou em outro '
  + 'lugar (regimento, regra 6).';
const motivoDeEnv = (o) => `${o} bloqueada: o arquivo de segredo (.env) não vai ao Git nem passa pela IA (regimento, regra 6). ${CAMINHO_DO_ENV}`;

// Chaves de caminho das ferramentas de escrita. O negar olha todas as que vierem (PLG-11a): uma
// entrada com as duas chaves não escapa do negar por esconder o segredo na chave que não é a dela.
const CHAVES_DE_CAMINHO = ['file_path', 'notebook_path'];

function decidir(entrada) {
  const ferramenta = entrada.tool_name;
  const dados = entrada.tool_input;
  if (typeof ferramenta !== 'string' || !dados || typeof dados !== 'object') return null;

  if (FERRAMENTAS_ARQUIVO.has(ferramenta)) {
    for (const chave of CHAVES_DE_CAMINHO) {
      const caminho = dados[chave];
      if (typeof caminho !== 'string') continue;
      if (nomeDeSegredo(caminho, true)) return motivoDeEnv(`Escrita em ${nomeDoArquivo(caminho)}`);
      if (nomeDeSegredo(caminho)) {
        return `Escrita em ${nomeDoArquivo(caminho)} bloqueada: arquivo de segredo não vai ao Git (regimento, regra 6).`;
      }
    }
    return null;
  }
  // Leitura do arquivo real de env pela IA (PLG-21). Só a família `.env`: o resto da lista de segredo
  // continua nas regras do app, como antes.
  if (ferramenta === 'Read') {
    const caminho = dados.file_path;
    return typeof caminho === 'string' && nomeDeSegredo(caminho, true) ? motivoDeEnv(`Leitura de ${nomeDoArquivo(caminho)}`) : null;
  }
  if (FERRAMENTAS_SHELL.has(ferramenta) && typeof dados.command === 'string') {
    const achado = comandoMexeEmEnv(dados.command, ferramenta === 'PowerShell' ? 'powershell' : 'bash');
    if (achado === 'limite') return MOTIVO_DE_LIMITE;
    if (achado === 'leitura') return motivoDeEnv('Comando que lê, copia ou grava um arquivo .env');
    // Apagar o env perde a única cópia: o app pergunta à pessoa. As regras de negar abaixo ainda valem antes.
    let pergunta = null;
    if (achado === 'remocao') pergunta = { decisao: 'ask', motivo: MOTIVO_DE_REMOCAO };
    const comando = dados.command.replace(/\s+/g, ' ');
    // Continuação de linha (barra invertida ou crase no fim) une as linhas; o resto fica separado.
    const linhas = dados.command.replace(/[\\`]\r?\n/g, ' ').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' '));
    for (const regra of COMANDOS) {
      const casa = regra.porLinha ? linhas.some((l) => regra.re.test(l)) : regra.re.test(comando);
      if (casa) return regra.motivo;
    }
    return pergunta;
  }
  return null;
}

// ================================================================ autorização por regra (PLG-10)

const ALLOW = 'intoca, autorização por regra: ';

function temGitProprio(pasta) {
  return existsSync(join(pasta.lex, '.git')) || (pasta.real ? existsSync(join(pasta.real, '.git')) : false);
}

// Contexto da autorização: sede, manifesto e quem é o chat. null = sem decisão.
function contexto(entrada) {
  const desligado = process.env.INTOCA_SEM_AUTORIZACAO_POR_REGRA;
  if (desligado && desligado !== '0') return null;
  const ctx = montarContexto(entrada);
  return ctx && ctx.chat ? ctx : null;
}

// Caminho vindo da ferramenta, resolvido contra o cwd. null para o que não se compara com certeza:
// caminho de rede ou de dispositivo (\\servidor, \\?\), fluxo alternativo do NTFS (a.md:x), NUL.
function alvoDe(ctx, caminho) {
  if (typeof caminho !== 'string' || caminho === '' || caminho.length > 4096 || caminho.includes('\0')) return null;
  if (process.platform === 'win32') {
    if (/^[\\/]{2}/.test(caminho)) return null;
    const lex = resolve(ctx.cwd.lex, caminho);
    if (lex.slice(2).includes(':')) return null;
  }
  const alvo = forma(resolve(ctx.cwd.lex, caminho));
  return alvo.real ? alvo : null;
}

// A área de trabalho do chat (sem a governança): a pasta do projeto e as worktrees dele; para o chat
// da sede, a raiz da sede menos as pastas de projeto com `.git` próprio e as worktrees de projeto.
function naAreaDoChat(ctx, alvo) {
  // Worktree da sede com o projeto em subpasta (PLG-24): vale o projeto da subpasta, não o do checkout principal.
  if (ctx.chat.tipo === 'projeto') {
    const w = projetoNaWorktreeDaSede(ctx, alvo);
    if (w) return !w.ambiguo && w.projeto === ctx.chat.projeto;
  }
  const wt = pastaDeWorktree(ctx, alvo);
  if (wt) {
    if (wt.profundidade < 2) return false;
    const dono = donoDaWorktree(ctx, wt.nome);
    if (!dono) return false;
    if (ctx.chat.tipo === 'sede') return dono.tipo === 'sede';
    return dono.tipo === 'projeto' && dono.projeto === ctx.chat.projeto;
  }
  if (ctx.chat.tipo === 'projeto') {
    const dono = donoPorPasta(ctx, alvo, false);
    return Boolean(dono) && dono.projeto === ctx.chat.projeto;
  }
  if (!dentroDe(ctx.sede, alvo)) return false;
  // Só contam as pastas de projeto que ficam dentro da sede (uma pasta que contém a sede inteira não
  // é "pasta de projeto dentro da sede").
  let dono = null;
  for (const projeto of ctx.projetos) {
    for (const pasta of projeto.pastas) {
      if (dentroDe(ctx.sede, pasta) && dentroDe(pasta, alvo, true) && (!dono || pasta.lex.length > dono.lex.length)) dono = pasta;
    }
  }
  return !dono || !temGitProprio(dono);
}

const nomeDoChat = (ctx) => (ctx.chat.tipo === 'sede' ? 'da sede' : `do projeto ${ctx.chat.projeto.nome}`);

// `soGovernanca` (rigor cauteloso): só os dois primeiros casos; a pasta do chat fica sem decisão.
function decidirEscrita(ctx, caminho, soGovernanca = false) {
  const alvo = alvoDe(ctx, caminho);
  if (!alvo) return null;
  if (caminhoProtegido(caminho) || caminhoProtegido(alvo.lex) || caminhoProtegido(alvo.real)) return null;
  // Governança: o destino tem de estar na `diretoria/` (ou `ops/`) e também na raiz real da sede (ou do
  // projeto dono da `ops/`). Uma `ops/` que é junção ou link para fora resolve para fora da raiz e
  // perde o "permitir" (PLG-11a); a mesma regra vale para link de arquivo dentro dela.
  if (dentroDe(ctx.sede, alvo) && dentroDe(forma(join(ctx.sede.lex, 'diretoria')), alvo)) {
    return `${ALLOW}governança em diretoria/ (regimento, regra 3: arquivos são o protocolo).`;
  }
  for (const projeto of ctx.projetos) {
    for (const pasta of projeto.pastas) {
      if (dentroDe(pasta, alvo) && dentroDe(forma(join(pasta.lex, 'ops')), alvo)) {
        return `${ALLOW}governança em ops/ do projeto ${projeto.nome} (regimento, regra 3: arquivos são o protocolo).`;
      }
    }
  }
  // Governança do projeto dentro de uma worktree da sede (PLG-24): o mesmo `ops/` do projeto, na cópia da worktree.
  const w = projetoNaWorktreeDaSede(ctx, alvo);
  if (w && !w.ambiguo && dentroDe(forma(join(w.pasta, 'ops')), alvo)) {
    return `${ALLOW}governança em ops/ do projeto ${w.projeto.nome} (regimento, regra 3: arquivos são o protocolo).`;
  }
  if (!soGovernanca && naAreaDoChat(ctx, alvo)) return `${ALLOW}escrita na pasta do chat ${nomeDoChat(ctx)} (regimento, regra 13).`;
  return null;
}

function decidirLeitura(ctx, caminho) {
  const alvo = alvoDe(ctx, caminho);
  if (!alvo) return null;
  if (caminhoDeSegredo(caminho) || caminhoDeSegredo(alvo.lex) || caminhoDeSegredo(alvo.real)) return null;
  return `${ALLOW}leitura de arquivo que não é segredo (regimento, regra 2).`;
}

// ------------------------------ comandos

// Nome de ref aceito: letras, dígitos, `. _ / -`, sem começar por `-` nem `/`, sem `..`, `//` ou `.lock`.
const nomeDeRef = (s) => typeof s === 'string' && /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(s)
  && !s.includes('..') && !s.includes('//') && !s.endsWith('/') && !s.endsWith('.lock') && !s.endsWith('.');
const nomeDeRemoto = (s) => /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(s);
// Argumento que fala de produção ou de banco real tira o "permitir" de qualquer teste.
const falaDeProducao = (args) => args.some((a) => /producao|produção|production|--banco/i.test(a));
// Posicional de comando de leitura do git (`arquivo`, `rev:arquivo`) que aponta segredo.
const citaSegredo = (args) => args.some((a) => caminhoDeSegredo(a) || (a.includes(':') && caminhoDeSegredo(a.slice(a.lastIndexOf(':') + 1))));

const DIFF_LONGAS = {
  '--stat': 2, '--shortstat': 0, '--numstat': 0, '--name-only': 0, '--name-status': 0, '--summary': 0,
  '--patch': 0, '--no-patch': 0, '--unified': 1, '--word-diff': 2, '--color': 2, '--no-color': 0, '--check': 0,
  '--ignore-all-space': 0, '--ignore-space-change': 0, '--ignore-blank-lines': 0, '--diff-filter': 1,
  '--relative': 2, '--no-renames': 0, '--find-renames': 2, '--minimal': 0, '--histogram': 0, '--patience': 0,
  '--abbrev': 2, '--dirstat': 2, '--compact-summary': 0, '--raw': 0, '--exit-code': 0, '--quiet': 0,
};
const DIFF_CURTAS = { p: 0, w: 0, b: 0, R: 0, z: 0, M: 2, U: 2 };
const LOG_LONGAS = {
  ...DIFF_LONGAS, '--oneline': 0, '--graph': 0, '--decorate': 2, '--no-decorate': 0, '--all': 0, '--branches': 2,
  '--remotes': 2, '--tags': 2, '--format': 1, '--pretty': 2, '--abbrev-commit': 0, '--no-merges': 0, '--merges': 0,
  '--first-parent': 0, '--reverse': 0, '--follow': 0, '--since': 1, '--until': 1, '--after': 1, '--before': 1,
  '--author': 1, '--committer': 1, '--grep': 1, '--regexp-ignore-case': 0, '--max-count': 1, '--skip': 1,
  '--date': 1, '--left-right': 0, '--cherry-pick': 0, '--topo-order': 0, '--date-order': 0, '--source': 0,
  '--full-history': 0, '--simplify-by-decoration': 0, '--show-signature': 0, '--boundary': 0,
};
const LOG_CURTAS = { ...DIFF_CURTAS, s: 0, n: 1, i: 0 };

// Subcomandos do git e as opções aceitas. Tudo fora daqui (inclusive `-c`, `-C`, `--no-verify`, `-n`
// do commit, `--force`, `--delete`, `--output`, `--no-index`, `--upload-pack`) fica sem decisão.
const GIT = {
  status: {
    longas: {
      '--short': 0, '--branch': 0, '--porcelain': 2, '--long': 0, '--verbose': 0, '--untracked-files': 2,
      '--ignored': 2, '--show-stash': 0, '--no-renames': 0, '--ahead-behind': 0, '--no-ahead-behind': 0,
    },
    curtas: { s: 0, b: 0, v: 0, z: 0, u: 2 },
    separador: true,
  },
  log: { longas: LOG_LONGAS, curtas: LOG_CURTAS, numeros: true, separador: true },
  show: { longas: LOG_LONGAS, curtas: LOG_CURTAS, separador: true },
  diff: { longas: { ...DIFF_LONGAS, '--cached': 0, '--staged': 0, '--merge-base': 0 }, curtas: DIFF_CURTAS, separador: true },
  add: {
    longas: { '--all': 0, '--update': 0, '--verbose': 0, '--dry-run': 0, '--intent-to-add': 0, '--ignore-removal': 0 },
    curtas: { A: 0, u: 0, v: 0, n: 0, N: 0 },
    separador: true,
  },
  commit: {
    longas: { '--all': 0, '--message': 1, '--quiet': 0, '--signoff': 0, '--allow-empty': 0, '--verbose': 0, '--author': 1 },
    curtas: { a: 0, m: 1, q: 0, s: 0, v: 0 },
    separador: true,
  },
  fetch: {
    longas: { '--all': 0, '--prune': 0, '--tags': 0, '--no-tags': 0, '--quiet': 0, '--verbose': 0, '--dry-run': 0 },
    curtas: { p: 0, q: 0, v: 0 },
  },
  pull: {
    longas: {
      '--ff-only': 0, '--no-rebase': 0, '--rebase': 0, '--no-edit': 0, '--quiet': 0, '--verbose': 0, '--prune': 0,
      '--ff': 0, '--no-ff': 0,
    },
    curtas: { q: 0, v: 0 },
  },
  branch: {
    longas: {
      '--all': 0, '--remotes': 0, '--verbose': 0, '--list': 0, '--show-current': 0, '--merged': 0, '--no-merged': 0,
      '--contains': 0, '--no-contains': 0, '--no-color': 0, '--color': 2, '--sort': 1,
    },
    curtas: { a: 0, r: 0, v: 0, l: 0 },
  },
  merge: { longas: { '--no-ff': 0, '--ff-only': 0, '--no-edit': 0, '--message': 1, '--quiet': 0 }, curtas: { m: 1, q: 0 } },
  push: { longas: { '--set-upstream': 0 }, curtas: { u: 0 } },
};
const WORKTREE_ADD = {
  longas: {
    '--detach': 0, '--checkout': 0, '--no-checkout': 0, '--lock': 0, '--quiet': 0, '--track': 0, '--no-track': 0,
    '--guess-remote': 0,
  },
  curtas: { b: 1, q: 0 },
};

const ROTINA_GIT = `${ALLOW}comando de rotina do Git (decisão de 2026-10-14, autonomia).`;

// Destino de `git worktree`: tem de ficar dentro de <sede>/_worktrees (resolvido contra o cwd, com
// `..`, caixa e link desfeitos).
function destinoDeWorktreeOk(ctx, caminho) {
  const alvo = alvoDe(ctx, caminho);
  return Boolean(alvo) && dentroDe(ctx.worktrees, alvo);
}

// Branch que não pode receber push por regra: o principal do projeto do chat e, sempre, main,
// master e HEAD (em vários projetos a main publica produção). Nome que o git poderia ler como outra
// ref (`refs/...`, `heads/...`) também fica de fora.
function branchProtegido(ctx, ramo) {
  const r = ramo.toLowerCase();
  const principais = ['main', 'master', 'head'];
  if (ctx.chat.tipo === 'projeto' && typeof ctx.chat.projeto.branch === 'string') principais.push(ctx.chat.projeto.branch.toLowerCase());
  if (principais.includes(r)) return true;
  return /^(refs|heads|tags|remotes)\//.test(r);
}


function decidirGit(ctx, args) {
  const sub = args[0];
  if (sub === 'worktree') {
    const acao = args[1];
    if (acao === 'add') {
      const lido = lerArgumentos(args.slice(2), WORKTREE_ADD);
      if (!lido || lido.posicionais.length < 1 || lido.posicionais.length > 2) return null;
      const [destino, base] = lido.posicionais;
      if (base !== undefined && !nomeDeRef(base)) return null;
      if (lido.opcoes.some((o) => o.nome === '-b' && !nomeDeRef(o.valor))) return null;
      return destinoDeWorktreeOk(ctx, destino) ? `${ALLOW}worktree em <sede>/_worktrees (decisão de 2026-10-14).` : null;
    }
    if (acao === 'remove') {
      const resto = args.slice(2);
      if (resto.length !== 1 || resto[0].startsWith('-')) return null;
      return destinoDeWorktreeOk(ctx, resto[0]) ? `${ALLOW}remoção de worktree em <sede>/_worktrees, sem --force.` : null;
    }
    return null;
  }
  if (!Object.hasOwn(GIT, sub)) return null;
  const lido = lerArgumentos(args.slice(1), GIT[sub]);
  if (!lido) return null;
  const { opcoes, posicionais } = lido;
  const tem = (...nomes) => opcoes.some((o) => nomes.includes(o.nome));
  switch (sub) {
    case 'status': case 'log': case 'show': case 'diff': case 'add': case 'commit':
      return citaSegredo(posicionais) ? null : ROTINA_GIT;
    case 'fetch': case 'pull': {
      if (posicionais.length === 0) return ROTINA_GIT;
      const [remoto, ...refs] = posicionais;
      return nomeDeRemoto(remoto) && refs.every(nomeDeRef) ? ROTINA_GIT : null;
    }
    case 'branch':
      return posicionais.length <= 2 && posicionais.every(nomeDeRef) ? ROTINA_GIT : null;
    case 'merge': {
      if (posicionais.length !== 1 || !nomeDeRef(posicionais[0])) return null;
      if (tem('--no-ff')) return ROTINA_GIT;
      const principal = ctx.chat.tipo === 'projeto' ? ctx.chat.projeto.branch : null;
      return posicionais[0] === 'main' || (typeof principal === 'string' && posicionais[0] === principal) ? ROTINA_GIT : null;
    }
    case 'push': {
      if (posicionais.length !== 2 || posicionais[0] !== 'origin') return null;
      const ramo = posicionais[1];
      if (!nomeDeRef(ramo) || branchProtegido(ctx, ramo) || !ehSoBranchLocal(ctx.cwd.lex, ramo)) return null;
      return `${ALLOW}push do branch ${ramo} para origin, sem força e fora do branch principal.`;
    }
    default:
      return null;
  }
}

const TESTE = `${ALLOW}teste do projeto (decisão de 2026-10-14, autonomia).`;
const OPCOES_NODE_TEST = new Set([
  '--test-name-pattern', '--test-skip-pattern', '--test-reporter', '--test-only', '--test-concurrency',
  '--test-timeout', '--experimental-test-coverage', '--test-force-exit', '--test-update-snapshots', '--test-shard',
]);
// Reporters que vêm com o próprio executor de testes do Node (24: `require('node:test/reporters')`).
// Qualquer outro valor é caminho ou pacote, e carregá-lo roda código de fora do chat (PLG-11a).
// `--test-reporter-destination` continua fora de OPCOES_NODE_TEST: sem decisão em qualquer valor.
const REPORTERS_DO_NODE = new Set(['spec', 'tap', 'dot', 'junit', 'lcov']);

// Arquivo de teste: dentro da área do chat, numa pasta chamada `tests`, sem ser segredo.
function arquivoDeTeste(ctx, caminho) {
  const alvo = alvoDe(ctx, caminho);
  if (!alvo || caminhoDeSegredo(alvo.lex) || caminhoDeSegredo(alvo.real)) return false;
  return basename(dirname(alvo.lex)).toLowerCase() === 'tests' && basename(dirname(alvo.real)).toLowerCase() === 'tests'
    && naAreaDoChat(ctx, alvo);
}

function decidirTeste(ctx, programa, args) {
  if (falaDeProducao(args)) return null;
  if (programa === 'node') {
    if (args[0] === '--test') {
      for (let k = 1; k < args.length; k += 1) {
        const a = args[k];
        if (a.startsWith('-')) {
          const igual = a.indexOf('=');
          const nome = igual < 0 ? a : a.slice(0, igual);
          if (!OPCOES_NODE_TEST.has(nome)) return null;
          if (nome === '--test-reporter') {
            // Valor com `=` ou na palavra seguinte, como o Node aceita.
            const valor = igual < 0 ? args[++k] : a.slice(igual + 1);
            if (!REPORTERS_DO_NODE.has(valor)) return null;
          }
          continue;
        }
        const alvo = alvoDe(ctx, a);
        if (!alvo || caminhoDeSegredo(alvo.lex) || !naAreaDoChat(ctx, alvo)) return null;
      }
      return TESTE;
    }
    if (args.length >= 1 && !args[0].startsWith('-') && arquivoDeTeste(ctx, args[0])) return TESTE;
    return null;
  }
  if (programa === 'php') {
    return args.length >= 1 && !args[0].startsWith('-') && arquivoDeTeste(ctx, args[0]) ? TESTE : null;
  }
  // npm test, pnpm test, npm run test*: argumentos extras só depois de `--`.
  const extrasOk = (resto) => resto.length === 0 || resto[0] === '--';
  if (args[0] === 'test' && (programa === 'npm' || programa === 'pnpm')) return extrasOk(args.slice(1)) ? TESTE : null;
  if (programa === 'npm' && args[0] === 'run' && typeof args[1] === 'string') {
    const script = args[1];
    if (!/^test([:._-][A-Za-z0-9:._-]*)?$/.test(script) || /prod|deploy|publish|release/i.test(script)) return null;
    return extrasOk(args.slice(2)) ? TESTE : null;
  }
  return null;
}

function decidirComando(ctx, comando, shell) {
  const palavras = dividirComando(comando, shell);
  if (!palavras || palavras[0].aspas) return null;
  const [programa, ...args] = palavras.map((p) => p.valor);
  if (programa === 'git') return decidirGit(ctx, args);
  if (['node', 'npm', 'pnpm', 'php'].includes(programa)) return decidirTeste(ctx, programa, args);
  return null;
}

// Modo de permissão do chat (`permission_mode` da entrada, PLG-11a). Valores que o binário manda:
// default (Manual), plan, acceptEdits, auto, dontAsk, bypassPermissions. Escrita e comandos só têm
// "permitir" nos três primeiros, fora o plan; em plan nada tem "permitir", nem leitura (o modo de
// planejamento existe para impedir escrita e comando). Modo ausente, desconhecido, dontAsk ou
// bypassPermissions: sem decisão para escrita e comandos; a leitura segue a regra de sempre.
const MODOS_COM_PERMITIR = new Set(['default', 'acceptEdits', 'auto']);

// Caminho da ferramenta de escrita, cada uma pela sua chave: `notebook_path` no NotebookEdit,
// `file_path` nas outras. Chave própria ausente, ou a outra chave com valor diferente: null.
function caminhoDaEscrita(ferramenta, dados) {
  const propria = dados[ferramenta === 'NotebookEdit' ? 'notebook_path' : 'file_path'];
  if (typeof propria !== 'string') return null;
  return CHAVES_DE_CAMINHO.every((chave) => dados[chave] === undefined || dados[chave] === propria) ? propria : null;
}

// Devolve o motivo do "allow", ou null (sem decisão). Qualquer erro aqui também vira null.
function autorizar(entrada) {
  try {
    const ferramenta = entrada.tool_name;
    const dados = entrada.tool_input;
    if (typeof ferramenta !== 'string' || !dados || typeof dados !== 'object') return null;
    const ehArquivo = FERRAMENTAS_ARQUIVO.has(ferramenta);
    const ehShell = FERRAMENTAS_SHELL.has(ferramenta);
    if (!ehArquivo && !ehShell && ferramenta !== 'Read') return null;
    const modo = entrada.permission_mode;
    if (modo === 'plan') return null;
    if ((ehArquivo || ehShell) && !MODOS_COM_PERMITIR.has(modo)) return null;
    // Comando fora da caixa de areia não é rotina: fica com as regras do app.
    if (ehShell && dados.dangerouslyDisableSandbox !== undefined && dados.dangerouslyDisableSandbox !== false) return null;
    const ctx = contexto(entrada);
    if (!ctx) return null;
    // Rigor (PLG-14): lido do manifesto já carregado no contexto, sem outra leitura de disco.
    const rigor = nivelDeRigor(ctx.manifesto);
    const cauteloso = rigor.nivel === 'cauteloso';
    let motivo = null;
    if (ehArquivo) {
      const caminho = caminhoDaEscrita(ferramenta, dados);
      motivo = caminho === null ? null : decidirEscrita(ctx, caminho, cauteloso);
    } else if (ferramenta === 'Read') {
      motivo = decidirLeitura(ctx, dados.file_path);
    } else if (!cauteloso && typeof dados.command === 'string') { // no cauteloso, comandos ficam com o app
      motivo = decidirComando(ctx, dados.command, ferramenta === 'PowerShell' ? 'powershell' : 'bash');
    }
    return motivo ? `${motivo} ${ORIGEM_DO_RIGOR[rigor.origem](rigor.nivel)}` : null;
  } catch {
    return null;
  }
}

// De onde veio o nível, no fim do motivo: quem lê o "allow" vê se foi a variável que afrouxou o nível da sede.
const ORIGEM_DO_RIGOR = {
  variavel: (n) => `[rigor ${n}, da variável INTOCA_RIGOR deste ambiente, por cima do sede.yaml]`,
  manifesto: (n) => `[rigor ${n}, do sede.yaml]`,
  padrao: (n) => `[rigor ${n}, o padrão: sede.yaml sem rigor]`,
};

// ================================================================ governança fora do lugar (PLG-02)

// Governança: caminho que passa por `diretoria/` ou `ops/` e cujo trecho seguinte é um destes.
const RAIZES_DE_GOVERNANCA = new Set(['diretoria', 'ops']);
const DENTRO_DA_GOVERNANCA = new Set([
  'os', 'relatorios', 'autorizacoes', 'decisoes', 'modelos', 'fila.md', 'historico.md', 'passagem.md', 'backlog.md',
]);

// Raiz de sede (ou de worktree da sede): a pasta que tem `sede.yaml`. Lá mora a `diretoria/`.
const ehRaizDeSede = (pasta) => existsSync(join(pasta, 'sede.yaml'));

const dentroOuIgual = (pai, filho) => contem(pai, filho, true);

// `pai` é a raiz de um projeto do manifesto (a pasta dele ou uma worktree dele)?
function ehRaizDeProjeto(ctx, pai) {
  for (const projeto of ctx.projetos) {
    for (const pasta of projeto.pastas) if (mesmoCaminho(pasta.lex, pai)) return true;
  }
  // Worktree da sede (tem sede.yaml na raiz) com o projeto em subpasta (PLG-24): a pasta do projeto fica no mesmo lugar
  // relativo. Sem dono único a profundidade ainda é certa (os projetos empatados têm a mesma pasta relativa).
  const w = projetoNaWorktreeDaSede(ctx, forma(pai));
  if (w) return w.naRaiz;
  const m = marcadorDeWorktree(pai);
  if (!m) return false;
  const antesOk = ehRaizDeSede(m.antes) || dentroOuIgual(ctx.sede.lex, m.antes)
    || ctx.projetos.some((pr) => pr.pastas.some((pasta) => dentroOuIgual(pasta.lex, m.antes)));
  if (!antesOk) return false;
  // Worktree em _worktrees sem dono único (nenhum prefixo casa, ou mais de um): dúvida, vale como lugar certo.
  if (m.tipo === '_worktrees' && !donoDaWorktree(ctx, m.nome)) return true;
  if (m.resto.length === 0) {
    if (m.tipo === '_worktrees') return donoDaWorktree(ctx, m.nome).tipo === 'projeto';
    // <pasta do projeto>/.claude/worktrees/<nome>: worktree do projeto na própria pasta dele.
    return ctx.projetos.some((pr) => pr.pastas.some((pasta) => mesmoCaminho(pasta.lex, m.antes)));
  }
  // Worktree da sede com o projeto em subpasta é da função única do lib (PLG-24), tratada acima.
  return false;
}

// A pasta do projeto do chat, como o chat a vê: a pasta do projeto, ou a raiz da worktree em que ele está.
function pastaDoProjetoNoChat(ctx) {
  // Chat numa worktree da sede com o projeto em subpasta (PLG-24): a pasta do projeto DENTRO da worktree.
  if (ctx.chat.pasta) return ctx.chat.pasta;
  // A pasta do projeto onde o chat está (pasta_atual ou pasta_futura), senão a pasta atual.
  const onde = donoPorPasta(ctx, ctx.cwd, true);
  const base = (onde && onde.projeto === ctx.chat.projeto ? onde.pasta : null)
    ?? ctx.chat.projeto.atual ?? ctx.chat.projeto.pastas[0];
  if (!base) return null;
  const wt = pastaDeWorktree(ctx, ctx.cwd);
  if (wt) return join(ctx.worktrees.lex, wt.nome);
  const m = marcadorDeWorktree(ctx.cwd.lex);
  if (m && m.tipo === '.claude' && dentroOuIgual(base.lex, m.antes)) {
    if (!ehRaizDeSede(m.x)) return m.x;
    const raiz = acharSede(base.lex);
    return raiz && contem(raiz, base.lex) ? join(m.x, relative(raiz, base.lex)) : null;
  }
  return base.lex;
}

// O arquivo "tem cara" de governança: Markdown com o nome que o regimento dá a cada tipo. É mais estreito
// que o conjunto de pastas de propósito: uma pasta `Diretoria/Decisoes` de uma associação, ou
// `skills/diretoria/os/` de uma skill, não vira negado (na dúvida, sem decisão). `depois`: os pedaços
// depois de `diretoria` ou `ops`, incluindo o trecho (`['relatorios', 'X-01.md']`).
function pareceGovernanca(depois) {
  const trecho = nomeComparavel(depois[0]);
  const nome = depois.at(-1).toLowerCase();
  if (!nome.endsWith('.md')) return false;
  if (['fila.md', 'historico.md', 'passagem.md', 'backlog.md'].includes(trecho)) return depois.length === 1;
  if (trecho === 'modelos') return depois.length >= 2;
  if (depois.length !== 2) return false;
  if (trecho === 'decisoes') return /^\d{4}-\d{2}-\d{2}/.test(nome);
  return /^[a-z][a-z0-9]*-\d+/.test(nome); // os, relatorios, autorizacoes: <ID>-<tema>.md
}

// Motivo do "deny", ou null (sem decisão). Qualquer erro aqui vira null: nunca nega por engano.
function governancaForaDoLugar(entrada) {
  try {
    if (variavelLigada('INTOCA_SEM_REDIRECIONAR')) return null;
    const ferramenta = entrada.tool_name;
    const dados = entrada.tool_input;
    if (!FERRAMENTAS_ARQUIVO.has(ferramenta) || !dados || typeof dados !== 'object') return null;
    const caminho = caminhoDaEscrita(ferramenta, dados);
    if (caminho === null) return null;
    const ctx = montarContexto(entrada);
    if (!ctx || !ctx.chat) return null;
    const alvo = alvoDe(ctx, caminho);
    if (!alvo || !mesmoCaminho(alvo.lex, alvo.real)) return null; // link, junção ou nome curto: dúvida
    // Só a árvore da sede e as pastas de projeto: repositório alheio com `ops/os/` não é da conta do hook.
    if (!dentroDe(ctx.sede, alvo) && !donoPorPasta(ctx, alvo, false)) return null;
    const norm = pedacosDe(alvo.lex);
    const reais = resolve(alvo.lex).split(/[\\/]+/);
    // A ocorrência de fora para dentro: `diretoria/modelos/.../ops/fila.md` é da sede, não do projeto.
    let i = -1;
    for (let k = 1; k < norm.length - 1; k += 1) {
      if (RAIZES_DE_GOVERNANCA.has(norm[k]) && DENTRO_DA_GOVERNANCA.has(norm[k + 1])) { i = k; break; }
    }
    if (i < 0) return null;
    const resto = reais.slice(i + 1);
    if (!pareceGovernanca(resto)) return null;
    const pai = juntar(reais.slice(0, i));
    let certo = null;
    if (norm[i] === 'diretoria') {
      if (ehRaizDeSede(pai)) return null;
      certo = join(ctx.sede.lex, 'diretoria', ...resto);
    } else {
      if (ehRaizDeProjeto(ctx, pai)) return null;
      if (ctx.chat.tipo !== 'projeto') return null; // sem projeto do chat não há "ops/" certa a apontar
      const pasta = pastaDoProjetoNoChat(ctx);
      if (!pasta) return null;
      certo = join(pasta, 'ops', ...resto);
    }
    if (!certo || mesmoCaminho(certo, alvo.lex)) return null;
    return `Este arquivo de governança fica em ${certo}; grave lá.`;
  } catch {
    return null;
  }
}

// ================================================================ autorização de projeto na gaveta da sede (PLG-22)

// Nome do projeto, vindo do manifesto, entra no aviso sem crase, quebra de linha nem caractere de controle.
const limpo = (s) => String(s ?? '').replace(/[`\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
// Caminho do manifesto no aviso: só sai crase, quebra de linha e controle; nunca trunca nem colapsa espaços.
const caminhoLimpo = (s) => String(s ?? '').replace(/[`\u0000-\u001f\u007f]/g, '');

// ID de OS: sigla, hífen e 1 a 4 dígitos que não continuam em outro número nem em "-<dígito>" (isso é data:
// `CGF-2026-10-13-tema`, não OS). Na dúvida, não é ID.
const ID = '([A-Za-z][A-Za-z0-9]*)-(\\d{1,4})(?![\\p{L}\\p{N}_]|-\\d)';

// Aviso (nunca decisão) de `Write`/`Edit` em `<sede>/diretoria/autorizacoes/<arquivo>.md` cujo nome (ou, sem ID
// no nome, a primeira linha do conteúdo de um `Write`) cita o ID de uma OS de PROJETO do manifesto: a regra 4 manda
// essa autorização para `<projeto>/ops/autorizacoes/`. Só avisa com certeza: sigla de um projeto só e nenhum outro
// ID de sigla diferente no nome (ou na linha). ID da sede (DIR-), sigla desconhecida ou repetida, data: nada.
// Qualquer erro vira null. O aviso chega junto do resultado da ferramenta, possivelmente depois da gravação.
function autorizacaoDeProjetoNoLugarErrado(entrada) {
  try {
    if (variavelLigada('INTOCA_SEM_REDIRECIONAR')) return null;
    const ferramenta = entrada.tool_name;
    const dados = entrada.tool_input;
    if (!FERRAMENTAS_ARQUIVO.has(ferramenta) || !dados || typeof dados !== 'object') return null;
    const caminho = caminhoDaEscrita(ferramenta, dados);
    if (caminho === null) return null;
    // Barato primeiro: o fim do caminho tem de ser diretoria/autorizacoes/<algo>.md, antes de ler o manifesto.
    const fimDoCaminho = resolve(String(entrada.cwd || process.cwd()), caminho).split(/[\\/]+/).slice(-3).map((p) => p.toLowerCase());
    if (fimDoCaminho.length < 3 || fimDoCaminho[0] !== 'diretoria' || fimDoCaminho[1] !== 'autorizacoes' || !fimDoCaminho[2].endsWith('.md')) return null;
    const ctx = montarContexto(entrada);
    if (!ctx || !ctx.chat) return null;
    const alvo = alvoDe(ctx, caminho);
    if (!alvo || !mesmoCaminho(alvo.lex, alvo.real)) return null;
    const norm = pedacosDe(alvo.lex);
    const reais = resolve(alvo.lex).split(/[\\/]+/);
    const n = norm.length;
    // O arquivo direto em `diretoria/autorizacoes/`, e essa `diretoria/` é a da sede (ou de uma worktree dela).
    if (n < 4 || norm[n - 2] !== 'autorizacoes' || norm[n - 3] !== 'diretoria') return null;
    if (!ehRaizDeSede(juntar(reais.slice(0, n - 3)))) return null;
    const nome = reais[n - 1];
    let ids = [];
    if (new RegExp(`^${ID}`, 'iu').test(nome)) {
      // O ID abre o nome; qualquer outro ID no nome entra na conta (sigla diferente = dúvida).
      ids = [...nome.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${ID}`, 'giu'))];
    } else if (!/^[A-Za-z][A-Za-z0-9]*-\d/.test(nome) && ferramenta === 'Write' && typeof dados.content === 'string') {
      const linha = dados.content.split(/\r?\n/).find((l) => l.trim() !== '');
      ids = [...(linha ?? '').slice(0, 300).matchAll(new RegExp(`(?<![\\p{L}\\p{N}_-])${ID}`, 'gu'))];
    }
    if (ids.length === 0) return null;
    const donos = new Set();
    for (const id of ids) {
      const sigla = id[1].toUpperCase();
      const achados = ctx.projetos.filter((p) => typeof p.sigla === 'string' && p.sigla.toUpperCase() === sigla);
      if (achados.length !== 1) return null; // sigla da sede (DIR), desconhecida ou repetida: cala
      donos.add(achados[0]);
    }
    if (donos.size !== 1) return null;
    const [projeto] = [...donos];
    const destino = projeto.atual
      ? `${caminhoLimpo(join(projeto.atual.lex, 'ops', 'autorizacoes'))}${sep}`
      : `<pasta do projeto ${limpo(projeto.nome)}>/ops/autorizacoes/`;
    return `Aviso InToca: autorização de OS de projeto (${ids[0][1]}-${ids[0][2]}) fica em ${destino} (regra 4): regrave lá ou mova o arquivo para lá.`;
  } catch {
    return null;
  }
}

// `contexto`: aviso que acompanha a decisão (ou vai sozinho, sem decisão, quando `decisao` é null).
function responder(decisao, motivo, contexto) {
  const saida = { hookEventName: 'PreToolUse' };
  if (decisao) { saida.permissionDecision = decisao; saida.permissionDecisionReason = motivo; }
  if (contexto) saida.additionalContext = contexto;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: saida }));
}

function main() {
  const entrada = lerEntrada();
  if (!entrada) return;
  if (entrada.hook_event_name && entrada.hook_event_name !== 'PreToolUse') return;
  // Negar vem primeiro e vence: quando uma regra de negar casa, o "allow" nem é calculado.
  const motivo = decidir(entrada);
  if (typeof motivo === 'string' && motivo) { responder('deny', motivo); return; }
  // Governança fora do lugar (PLG-02): depois dos negar de hoje e antes de qualquer "allow".
  const fora = governancaForaDoLugar(entrada);
  if (fora) { responder('deny', fora); return; }
  // Pergunta (PLG-21b: remover o env) não leva "allow": a pessoa decide no app.
  // Autorização de OS de projeto na gaveta da sede (PLG-22): só avisa, junto da decisão que já valeria (ask, allow)
  // ou sozinho; nunca nega nem tira nada.
  const aviso = autorizacaoDeProjetoNoLugarErrado(entrada);
  if (motivo) { responder(motivo.decisao, motivo.motivo, aviso); return; }
  const permitido = autorizar(entrada);
  if (permitido) responder('allow', permitido, aviso);
  else if (aviso) responder(null, null, aviso);
}

try { main(); } catch { /* hook nunca derruba o chat */ }
