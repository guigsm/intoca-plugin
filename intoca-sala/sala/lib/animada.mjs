// A sala animada (AI Operations Room · InToca) vista pela Clássica: como reconhecê-la, onde ela está, que comando a sobe e
// se a máquina tem o que ela pede. Node puro. Usado pelo servidor (app.mjs), pelo instalador e pelo lançador.
//
// "Instalada" = o item dela na seção `ferramentas:` do manifesto com `pasta` existente, OU `animada.pasta` em `sala.json`
// apontando para uma pasta que existe. O manifesto manda quando os dois existem (é da Diretoria).
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { get } from 'node:http';
import { dirname, join } from 'node:path';
import { acharSede, configDaAnimada } from './estado.mjs';
import { fold, parseManifesto, readText } from './descoberta.mjs';
import { discoverTools } from './ferramentas.mjs';

export const NOME_DA_ANIMADA = 'AI Operations Room · InToca';
export const URL_DA_ANIMADA = 'https://github.com/guigsm/AiOperationsRoom';
export const PORTA_PADRAO = 8765;

/** É a Animada? Pelo nome do manifesto ("AI Operations Room · InToca") ou o apelido "Animada". */
export const ehAnimada = (nome) => {
  const n = fold(nome ?? '');
  return n.includes('ai operations room') || n === 'animada';
};

const ehPasta = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** O Python do ambiente que o `uv sync` cria dentro da pasta da Animada. */
export const pythonDoAmbiente = (pasta, sistema = process.platform) =>
  sistema === 'win32' ? join(pasta, '.venv', 'Scripts', 'python.exe') : join(pasta, '.venv', 'bin', 'python');

/** O comando que sobe a Animada instalada por este botão (ambiente direto: `uv run` chegou a 6 min sob carga, INT-04). */
export const comandoDaAnimada = (pasta, porta, sistema = process.platform) => [pythonDoAmbiente(pasta, sistema), '-m', 'backend.cli', 'serve', '--port', String(porta)];

/**
 * No Windows o `python.exe` do venv é um lançador que sobe o interpretador como processo filho; sem console herdado (o lançador
 * nasce solto), o Windows abre uma janela preta para o filho, e fechá-la derruba a Animada. O `pythonw.exe` da mesma pasta não
 * tem console. Devolve o `pythonw.exe` vizinho se `comando` é um `python.exe` no Windows e ele existe; senão, o próprio comando.
 */
export function executavelSilencioso(comando, { sistema = process.platform, existe = existsSync } = {}) {
  if (sistema !== 'win32' || typeof comando !== 'string' || !/(^|[\\/])python\.exe$/i.test(comando)) return comando;
  const candidato = join(dirname(comando), 'pythonw.exe');
  return existe(candidato) ? candidato : comando;
}

/** Pergunta `/api/health` à Animada. Nunca lança. */
export function sondarAnimada(porta, timeout = 800) {
  return new Promise((resolveSonda) => {
    const req = get({ host: '127.0.0.1', port: porta, path: '/api/health', timeout }, (res) => {
      res.resume();
      resolveSonda(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('timeout', () => {
      req.destroy();
      resolveSonda(false);
    });
    req.on('error', () => resolveSonda(false));
  });
}

/**
 * Onde está a Animada e como se sobe. Devolve `null` se não está instalada, senão
 * `{ origem: 'manifesto'|'sala.json', nome, pasta, porta, command?, cwd?, env? }`.
 * `itens` (opcional) são as ferramentas já lidas do manifesto, para quem já as tem.
 */
export function resolverAnimada({ env = process.env, casa, itens, sistema = process.platform } = {}) {
  let ferramentas = itens;
  if (!ferramentas) {
    const achada = acharSede({ env, casa });
    ferramentas = achada ? discoverTools(parseManifesto(readText(join(achada.raiz, 'sede.yaml')))).itens : [];
  }
  const doManifesto = ferramentas.find((t) => t.kind === 'tool' && ehAnimada(t.name) && ehPasta(t.dir));
  if (doManifesto) {
    return { origem: 'manifesto', nome: doManifesto.name, pasta: doManifesto.dir, porta: doManifesto.port, command: doManifesto.command, cwd: doManifesto.cwd ?? doManifesto.dir, env: doManifesto.env };
  }
  const c = configDaAnimada(casa);
  if (c.pasta && ehPasta(c.pasta)) {
    const porta = c.porta ?? PORTA_PADRAO;
    return { origem: 'sala.json', nome: NOME_DA_ANIMADA, pasta: c.pasta, porta, command: comandoDaAnimada(c.pasta, porta, sistema), cwd: c.pasta, env: undefined };
  }
  return null;
}

/** Item no formato de `discoverTools`, para a Animada instalada só por `sala.json` ter cartão, Iniciar e Parar. */
export function itemDaAnimada(achada, { eu, frente, branch } = {}) {
  return {
    kind: 'tool',
    name: achada.nome,
    description: 'Escritório em pixel art, uma sala por projeto (a sala animada).',
    dir: achada.pasta,
    port: achada.porta,
    branch,
    command: achada.command,
    env: undefined,
    url: undefined,
    urlProducao: undefined,
    suite: frente,
    membroDe: eu,
  };
}

// ---------- o que a máquina tem (sem rede) ----------

const primeiraLinha = (t) => String(t ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';

/** Roda um programa sem shell e devolve `{status, stdout, stderr, erro}`. Nunca lança. */
export function rodarPrograma(comando, args, { cwd, env, tempo = 120000 } = {}) {
  return new Promise((resolvido) => {
    try {
      execFile(comando, args, { cwd, env: env ?? process.env, encoding: 'utf8', timeout: tempo, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (erro, stdout, stderr) => {
        resolvido({
          status: erro ? (typeof erro.code === 'number' ? erro.code : null) : 0,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          erro: erro && typeof erro.code !== 'number' ? String(erro.code ?? erro.message) : null,
        });
      });
    } catch (e) {
      resolvido({ status: null, stdout: '', stderr: '', erro: String(e?.code ?? e?.message ?? e) });
    }
  });
}

/**
 * Confere `git`, `uv` e Python 3.12 ou mais novo, sem rede. Devolve `{git, uv, python, faltam}`
 * (cada um `{ok, versao}`; `faltam` é a lista de nomes: `git`, `uv`, `python`). O `uv` é quem acha o Python da máquina.
 */
export async function conferirProgramas({ rodar = rodarPrograma } = {}) {
  const ver = async (cmd, args) => {
    const r = await rodar(cmd, args, { tempo: 8000 });
    return r.status === 0 ? { ok: true, versao: primeiraLinha(r.stdout || r.stderr) } : { ok: false, versao: null };
  };
  const [git, uv] = await Promise.all([ver('git', ['--version']), ver('uv', ['--version'])]);
  let python = { ok: false, versao: null };
  if (uv.ok) {
    const achou = await rodar('uv', ['python', 'find', '>=3.12'], { tempo: 10000 });
    if (achou.status === 0 && primeiraLinha(achou.stdout)) python = { ok: true, versao: primeiraLinha(achou.stdout) };
  }
  const faltam = [];
  if (!git.ok) faltam.push('git');
  if (!uv.ok) faltam.push('uv');
  if (!python.ok) faltam.push('python');
  return { git, uv, python, faltam };
}
