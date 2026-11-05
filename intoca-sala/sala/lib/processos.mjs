// Processos que a sala inicia. Guarda o PID de cada filho que ela mesma criou e só mexe nesses; um processo
// que ocupa a porta mas não é filho dela é "externo" e só para com confirmação (feita no servidor, em app.mjs).
// Encerrar a árvore: no POSIX, grupo de processos pelo Node (o filho nasce `detached`); no Windows não há grupo,
// então a reserva do sistema (`taskkill /T`) é chamada, sempre com o PID de um filho nosso.
import { execFile, spawn } from 'node:child_process';
import { connect } from 'node:net';

export const LINHAS_DE_LOG = 200;

/** Porta aberta em algum dos dois loopbacks. */
export async function isListening(port, timeout = 400) {
  const um = (host) =>
    new Promise((resolve) => {
      const socket = connect({ port, host, timeout });
      const fim = (ok) => {
        socket.destroy();
        resolve(ok);
      };
      socket.once('connect', () => fim(true));
      socket.once('error', () => fim(false));
      socket.once('timeout', () => fim(false));
    });
  return (await Promise.all(['127.0.0.1', '::1'].map(um))).some(Boolean);
}

/** PIDs que escutam `port`, de uma saída de `netstat -ano` (sem depender do idioma do Windows). */
export function pidsDoNetstat(saida, port) {
  const pids = new Set();
  for (const linha of saida.split(/\r?\n/)) {
    const c = linha.trim().split(/\s+/);
    if (c.length < 5 || !/^tcp/i.test(c[0])) continue;
    const local = c[1].match(/[:.](\d+)$/);
    const remoto = c[2];
    const pid = c[c.length - 1];
    if (local && Number(local[1]) === port && /[:.]0$/.test(remoto) && /^\d+$/.test(pid) && pid !== '0') pids.add(Number(pid));
  }
  return [...pids];
}

/** PIDs de uma saída de `lsof -t` ou de `ss -ltnp` (campo `pid=123`). */
export function pidsDoLsof(saida) {
  return [...new Set((saida.match(/^\d+$/gm) ?? []).map(Number))];
}
export function pidsDoSs(saida, port) {
  const pids = new Set();
  for (const linha of saida.split(/\r?\n/)) {
    if (!new RegExp(`[:.]${port}\\s`).test(linha)) continue;
    for (const m of linha.matchAll(/pid=(\d+)/g)) pids.add(Number(m[1]));
  }
  return [...pids];
}

const executar = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout: 8000 }, (erro, saida) => resolve(erro ? '' : saida)));

/** Reserva do sistema para achar quem escuta uma porta. Só o caminho do "externo" confirmado usa isto. */
export async function pidsNaPorta(port, sistema = process.platform) {
  if (sistema === 'win32') return pidsDoNetstat(await executar('netstat', ['-ano', '-p', 'tcp']), port);
  const lsof = pidsDoLsof(await executar('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']));
  return lsof.length ? lsof : pidsDoSs(await executar('ss', ['-ltnpH']), port);
}

/** Encerra a árvore de um filho nosso. */
export async function matarArvore(pid, sistema = process.platform) {
  if (sistema === 'win32') {
    await executar('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* já saiu */
    }
  }
}

export function criarProcessos({ sistema = process.platform, spawnFn = spawn, matar = (pid) => matarArvore(pid, sistema), agora = Date.now } = {}) {
  /** nome -> { child, pid, log, startedAt } */
  const filhos = new Map();

  const vivo = (e) => Boolean(e) && e.child.exitCode === null && e.child.signalCode === null;

  function iniciar(item, ambiente) {
    const atual = filhos.get(item.name);
    if (vivo(atual)) return atual;
    const [cmd, ...args] = item.command;
    const child = spawnFn(cmd, args, {
      cwd: item.cwd ?? item.dir,
      shell: true,
      windowsHide: true,
      detached: sistema !== 'win32',
      env: ambiente,
    });
    const entrada = { child, pid: child.pid, log: [], startedAt: agora() };
    const empurrar = (chunk) => {
      const texto = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
      entrada.log.push(...texto.split(/\r?\n/).filter(Boolean));
      if (entrada.log.length > LINHAS_DE_LOG) entrada.log.splice(0, entrada.log.length - LINHAS_DE_LOG);
    };
    child.stdout?.on('data', empurrar);
    child.stderr?.on('data', empurrar);
    child.on('error', (e) => empurrar(`[sala] não consegui iniciar: ${e.message}`));
    child.on('exit', (code) => empurrar(`[sala] processo encerrado (código ${code})`));
    empurrar(`[sala] ${item.command.join(' ')}  (em ${item.cwd ?? item.dir})`);
    filhos.set(item.name, entrada);
    return entrada;
  }

  return {
    iniciar,
    entrada: (nome) => filhos.get(nome),
    vivo: (nome) => vivo(filhos.get(nome)),
    log: (nome) => filhos.get(nome)?.log ?? [],
    /** Para só o filho nosso. Devolve true se havia um vivo. */
    async pararFilho(nome) {
      const e = filhos.get(nome);
      if (!vivo(e)) return false;
      await matar(e.pid);
      return true;
    },
    /** Para quem escuta a porta e não é filho nosso (exige confirmação antes, no servidor). Nunca o próprio servidor. */
    async pararExterno(port, { pids = () => pidsNaPorta(port, sistema), proprio = process.pid } = {}) {
      const alvos = (await pids()).filter((p) => p !== proprio);
      for (const p of alvos) await matar(p);
      return alvos.length;
    },
  };
}
