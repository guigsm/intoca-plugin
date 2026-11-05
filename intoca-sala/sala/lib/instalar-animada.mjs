// Instala a sala animada (AI Operations Room · InToca) pelo botão da Clássica. Node puro, sem dependências.
//
// O que faz, nesta ordem: confere `git`, `uv` e Python 3.12+ (sem rede), a porta e o destino; clona o repositório público;
// roda `uv sync`; grava `animada: {pasta, porta}` em `~/.intoca/sala.json`; e devolve o texto do pedido à Diretoria
// (o item de `ferramentas:` para o manifesto). Falha no meio: desfaz a pasta que ele mesmo criou e deixa o `sala.json`
// como estava.
// O que NUNCA faz: registrar hooks em `~/.claude/settings.json` (isso é do `/intoca:comecar`, com o consentimento que a
// INT-05 desenhou), gravar no `sede.yaml` (decisão da Diretoria de 2026-11-04: a sala monta o texto do pedido) nem
// apagar o que já existia (o único apagar é o do que ESTE passo acabou de criar).
//
// Tudo que toca o mundo entra por `deps` (`rodar`, `portaLivre`, `existe`, `programas`), para os testes simularem sem rede e
// sem criar pasta fora de `os.tmpdir()`. A lógica é a de `plugin/intoca/scripts/instalar-sala.mjs` (ação `animada`), refeita
// aqui de propósito: o `intoca-sala` pode existir sem o pacote `intoca`.
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { discoverTools } from './ferramentas.mjs';
import { parseManifesto, readText } from './descoberta.mjs';
import { NOME_DA_ANIMADA, PORTA_PADRAO, URL_DA_ANIMADA, comandoDaAnimada, conferirProgramas, ehAnimada, pythonDoAmbiente, rodarPrograma } from './animada.mjs';
import { configDaAnimada, gravarConfigDaAnimada, portaLivre } from './estado.mjs';

export const TEMPO_DO_CLONE_MS = 3 * 60 * 1000;
export const TEMPO_DO_SYNC_MS = 15 * 60 * 1000; // o pior caso medido (INT-05)

export class Recusa extends Error {
  constructor(codigo, mensagem, extra = {}) {
    super(mensagem);
    this.codigo = codigo;
    this.extra = extra;
  }
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const barras = (p) => String(p).split(sep).join('/').replace(/\\/g, '/');
const primeiraLinha = (t) => String(t ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';
const mesmoCaminho = (a, b) => barras(resolve(a)).replace(/\/+$/, '').toLowerCase() === barras(resolve(b)).replace(/\/+$/, '').toLowerCase();

function depsPadrao(d = {}) {
  return {
    rodar: rodarPrograma,
    portaLivre,
    existe: existsSync,
    url: URL_DA_ANIMADA,
    tickMs: 5000,
    tempoDoClone: TEMPO_DO_CLONE_MS,
    tempoDoSync: TEMPO_DO_SYNC_MS,
    programas: undefined,
    ...d,
  };
}

// ---------- entrada ----------

function portaPedida(valor, padrao) {
  const p = valor === undefined || valor === null || valor === '' ? padrao : Number(valor);
  if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Recusa('porta-invalida', 'A porta precisa ser um número inteiro de 1024 a 65535 (a sugerida é 8765).');
  return p;
}

function temLinkNoCaminho(caminho) {
  let atual = resolve(caminho);
  for (let i = 0; i < 64; i += 1) {
    try {
      if (lstatSync(atual).isSymbolicLink()) return true;
    } catch {
      /* ainda não existe */
    }
    const pai = dirname(atual);
    if (pai === atual) return false;
    atual = pai;
  }
  return false;
}

// A primeira pasta que não existe no caminho (a que este passo criaria primeiro), ou null se a pasta já existe.
function primeiraAusente(caminho, existe) {
  let atual = resolve(caminho);
  let ausente = null;
  for (let i = 0; i < 64 && !existe(atual); i += 1) {
    ausente = atual;
    atual = dirname(atual);
  }
  return ausente;
}

function destinoPedido(pasta, sedeRaiz) {
  let p = typeof pasta === 'string' && pasta.trim() !== '' ? pasta.trim() : null;
  if (!p && sedeRaiz) p = join(sedeRaiz, 'sala', 'app');
  if (!p) throw new Recusa('destino-invalido', 'Não achei a sede para sugerir uma pasta: informe a pasta de destino.');
  if (/[\0\r\n]/.test(p) || !isAbsolute(p)) throw new Recusa('destino-invalido', 'A pasta precisa ser um caminho completo, numa linha só.');
  if (p.split(/[\\/]+/).includes('..')) throw new Recusa('destino-invalido', 'A pasta não pode conter "..".');
  const destino = resolve(p);
  if (temLinkNoCaminho(destino)) throw new Recusa('destino-invalido', 'O caminho passa por um link ou junção; escolha uma pasta comum.');
  return destino;
}

async function estadoDoDestino(destino, d) {
  if (!d.existe(destino)) return 'novo';
  if (!lstatSync(destino).isDirectory()) throw new Recusa('destino-ocupado', 'No destino já existe um arquivo; escolha outra pasta.');
  if (readdirSync(destino).length === 0) return 'vazio';
  const origem = await d.rodar('git', ['-C', destino, 'remote', 'get-url', 'origin'], { tempo: 20000 });
  if (origem.status === 0 && primeiraLinha(origem.stdout).replace(/\.git$/, '').toLowerCase() === d.url.toLowerCase()) return 'ja-clonado';
  throw new Recusa('destino-ocupado', 'A pasta de destino já tem outro conteúdo; nada foi mexido. Escolha uma pasta vazia ou que ainda não exista.');
}

// ---------- o texto do pedido à Diretoria ----------

export function itemDoManifesto({ destino, porta, url = URL_DA_ANIMADA, membroDe, suite }) {
  const linhas = [
    `  - nome: ${quote(NOME_DA_ANIMADA)}`,
    `    pasta: ${quote(barras(destino))}`,
    `    porta: ${porta}`,
  ];
  if (suite) linhas.push(`    suite: ${suite}`);
  if (membroDe) linhas.push(`    membro_de: ${membroDe}`);
  linhas.push(
    `    instala: 'botão Instalar da InToca Sala: clone do repositório público e uv sync'`,
    `    inicia: '.venv dentro da pasta: python -m backend.cli serve --port ${porta}'`,
    `    command: [${quote(barras(pythonDoAmbiente(destino)))}, -m, backend.cli, serve, --port, '${porta}']`,
    `    cwd: ${quote(barras(destino))}`,
    `    origem: ${url}`,
  );
  return linhas.join('\n');
}

/** O manifesto já tem a Animada nesta pasta e nesta porta? */
export function jaRegistradaNoManifesto(sedeRaiz, destino, porta) {
  if (!sedeRaiz) return false;
  const texto = readText(join(sedeRaiz, 'sede.yaml'));
  if (texto === undefined) return false;
  const t = discoverTools(parseManifesto(texto)).itens.find((i) => ehAnimada(i.name));
  return Boolean(t && mesmoCaminho(t.dir, destino) && t.port === porta);
}

export function textoDoPedido({ destino, porta, jaRegistrada, item }) {
  if (jaRegistrada) {
    return `Pedido à Diretoria: nada a fazer. A sala animada foi instalada em ${barras(destino)} (porta ${porta}) e o manifesto já tem esse item.`;
  }
  return [
    'Pedido à Diretoria: registrar a sala animada no manifesto da sede.',
    '',
    'Em `sede.yaml`, na seção `ferramentas:`, acrescente este item (se já existir um da AI Operations Room · InToca, troque-o por este, em vez de criar um segundo):',
    '',
    item,
    '',
    `Instalada em ${barras(destino)}, porta ${porta}, pelo botão Instalar da InToca Sala (clone e uv sync). Os hooks (a ponte entre os chats e a sala animada) NÃO foram registrados: isso é do /intoca:comecar, com o consentimento da pessoa.`,
  ].join('\n');
}

// ---------- o plano (sem efeito) e a instalação ----------

/** Confere tudo e devolve o plano. Lança `Recusa` com o motivo. Não cria nem altera nada. */
export async function planejarInstalacao({ casa, sedeRaiz = null, pasta, porta, membroDe, suite, deps }) {
  const d = depsPadrao(deps);
  const prog = await (d.programas ? d.programas() : conferirProgramas({ rodar: d.rodar }));
  if (!prog.git.ok) throw new Recusa('sem-git', 'O programa "git" não está instalado (ele baixa a sala animada). Instale-o em https://git-scm.com e tente de novo; nada foi feito.');
  if (!prog.uv.ok) throw new Recusa('sem-uv', 'O programa "uv" não está instalado (ele prepara o Python da sala animada). Instale-o em https://docs.astral.sh/uv/getting-started/installation/ e tente de novo; nada foi feito.');
  if (!prog.python.ok) throw new Recusa('sem-python', 'Não achei o Python 3.12 ou mais novo. Rode "uv python install 3.12" (ele baixa o Python) e tente de novo; nada foi feito.');

  const destino = destinoPedido(pasta, sedeRaiz);
  const escolhida = portaPedida(porta, configDaAnimada(casa).porta ?? PORTA_PADRAO);
  if (!(await d.portaLivre(escolhida))) {
    throw new Recusa('porta-ocupada', `A porta ${escolhida} já está em uso por outro programa; escolha outra (sugestão: ${escolhida + 1}). Nada foi feito.`, { portaSugerida: escolhida + 1 });
  }
  const destinoEstado = await estadoDoDestino(destino, d);
  const jaRegistrada = jaRegistradaNoManifesto(sedeRaiz, destino, escolhida);
  const item = itemDoManifesto({ destino, porta: escolhida, url: d.url, membroDe, suite });
  const py = barras(pythonDoAmbiente(destino));
  return {
    destino,
    porta: escolhida,
    url: d.url,
    destinoEstado,
    clonar: destinoEstado !== 'ja-clonado',
    baixar: destinoEstado === 'ja-clonado' ? 'nada (a pasta já tem a sala animada)' : `o repositório público ${d.url} (git clone) e as dependências do Python (uv sync)`,
    hooks: 'Este botão não registra hooks em ~/.claude/settings.json. Os hooks continuam só pelo /intoca:comecar, com o seu consentimento.',
    programas: prog,
    comandos: [
      `git clone ${d.url} "${barras(destino)}"`,
      `cd "${barras(destino)}" && uv sync`,
      `"${py}" -m backend.cli serve --port ${escolhida}`,
    ],
    jaRegistrada,
    item,
  };
}

/**
 * Instala. `aoProgresso(evento)` recebe `{tipo: 'passo'|'tick'|'fim', ...}`. Devolve
 * `{ok: true, destino, porta, pedido, item, jaRegistrada, iniciar}` ou lança `Recusa` (com o que foi desfeito).
 */
export async function instalarAnimada({ casa, sedeRaiz = null, pasta, porta, membroDe, suite, deps, aoProgresso = () => {} }) {
  const d = depsPadrao(deps);
  const plano = await planejarInstalacao({ casa, sedeRaiz, pasta, porta, membroDe, suite, deps: d });
  const { destino } = plano;
  const emitir = (e) => {
    try {
      aoProgresso(e);
    } catch {
      /* quem escuta não derruba a instalação */
    }
  };
  const criadoPorMim = plano.destinoEstado === 'ja-clonado' ? null : primeiraAusente(destino, d.existe);
  const desfazer = () => {
    if (plano.destinoEstado === 'ja-clonado') return false;
    try {
      if (criadoPorMim) rmSync(criadoPorMim, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      else if (d.existe(destino)) for (const nome of readdirSync(destino)) rmSync(join(destino, nome), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return true;
    } catch {
      return false;
    }
  };
  const comTick = async (passo, trabalho) => {
    const t0 = Date.now();
    const timer = setInterval(() => emitir({ tipo: 'tick', passo, segundos: Math.round((Date.now() - t0) / 1000) }), d.tickMs);
    timer.unref?.();
    try {
      return await trabalho();
    } finally {
      clearInterval(timer);
    }
  };

  if (plano.clonar) {
    emitir({ tipo: 'passo', passo: 'clonar', estado: 'comecou', texto: 'Baixando a sala animada (git clone)…' });
    mkdirSync(dirname(destino), { recursive: true });
    const c = await comTick('clonar', () => d.rodar('git', ['clone', '--quiet', d.url, destino], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, tempo: d.tempoDoClone }));
    if (c.status !== 0) {
      const desfeito = desfazer();
      emitir({ tipo: 'passo', passo: 'clonar', estado: 'falhou' });
      throw new Recusa('clone-falhou', `Não consegui baixar a sala animada (${primeiraLinha(c.stderr) || c.erro || 'sem mensagem'}). Confira a internet e tente de novo; ${desfeito ? 'o que foi criado foi desfeito' : 'nada ficou pela metade'}.`, { desfeito });
    }
    emitir({ tipo: 'passo', passo: 'clonar', estado: 'feito', texto: 'Sala animada baixada.' });
  } else {
    emitir({ tipo: 'passo', passo: 'clonar', estado: 'ja-feito', texto: 'A pasta já tem a sala animada; sigo para o uv sync.' });
  }

  emitir({ tipo: 'passo', passo: 'sincronizar', estado: 'comecou', texto: 'Preparando o ambiente (uv sync). Pode levar vários minutos; não feche esta página.' });
  const s = await comTick('sincronizar', () => d.rodar('uv', ['sync'], { cwd: destino, tempo: d.tempoDoSync }));
  if (s.status !== 0) {
    const desfeito = desfazer();
    emitir({ tipo: 'passo', passo: 'sincronizar', estado: 'falhou' });
    throw new Recusa('sincronizar-falhou', `Não consegui preparar o ambiente da sala animada (${primeiraLinha(s.stderr) || s.erro || 'sem mensagem'}); ${desfeito ? 'o que este passo criou foi desfeito' : 'a pasta existente foi mantida como estava'}.`, { desfeito });
  }
  emitir({ tipo: 'passo', passo: 'sincronizar', estado: 'feito', texto: 'Ambiente pronto.' });

  gravarConfigDaAnimada(casa, { pasta: destino, porta: plano.porta });
  emitir({ tipo: 'passo', passo: 'registrar', estado: 'feito', texto: 'Anotado em ~/.intoca/sala.json.' });

  const pedido = textoDoPedido({ destino, porta: plano.porta, jaRegistrada: plano.jaRegistrada, item: plano.item });
  return {
    ok: true,
    destino,
    porta: plano.porta,
    jaRegistrada: plano.jaRegistrada,
    item: plano.jaRegistrada ? null : plano.item,
    pedido,
    iniciar: comandoDaAnimada(destino, plano.porta).join(' '),
  };
}
