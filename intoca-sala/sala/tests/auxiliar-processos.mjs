// Auxiliar dos testes (INT-23, endurecido na INT-24): encerra, por PID, todo processo que um teste fez subir (sala, vigia solto),
// mesmo quando o teste falha, estoura o tempo ou é interrompido. Só para testes; o código em execução não importa este arquivo.
//
// Como achar o que é do teste. O vigia solto sobe a sala sem passar a pasta de casa na linha de comando (ela vai por variável
// de ambiente), então a linha de comando sozinha não basta. Um processo é "do teste" se, e só se:
//   1. a linha de comando contém a pasta de casa do teste (`casa`, única por teste), ou
//   2. é descendente de uma das raízes dadas (o próprio processo de teste, ou o PID de um hook que o teste disparou), criado
//      depois de `desde` (o Windows mantém o PPID de pai que já saiu, e o vigia solto é órfão do hook), ou
//   3. é o PID que a própria casa registrou (`sala.json`, `lancador.json`) e esse PID, hoje, ou descende do teste ou foi criado
//      na janela da hora que o registro diz (`iniciou_em`, `em`): arquivo com PID que o sistema deu a outro processo não vale.
// Nos casos 2 e 3 o processo tem de ser o executável `node` rodando como script exatamente um arquivo da sala
// (`sala/server.mjs` ou `sala/lancador/{inicio,lancador,servico}.mjs`); no caso 1, qualquer processo com a casa temporária na
// linha. Nunca encerra "node" genérico, nunca o próprio teste e nunca a Clássica real do usuário (porta 80, pasta do checkout),
// que não é descendente do teste, é mais velha que o teste e não tem a casa temporária na linha; por garantia, o auxiliar
// recusa matar o PID da Clássica real (`~/.intoca/sala.json`) e lança erro se ela deixar de existir durante a limpeza.
//
// PID reaproveitado (INT-24). O PPID de um filho órfão continua apontando para o pai que saiu, e o sistema pode dar aquele PID a
// um processo novo, até de outra suíte rodando ao mesmo tempo. Defesas, e na dúvida não seleciona:
//   a. um filho não nasce antes do pai: se o pai existe na lista e é mais novo que o filho, o PPID é de outro processo;
//   b. uma raiz que já saiu (o hook, `spawnSync`) só vale se ninguém mais tem o PID hoje (os filhos dela são órfãos) ou se quem o
//      tem é descendente do próprio teste; uma raiz viva vale se a hora de criação registrada é a de quem tem o PID hoje;
//   c. os filhos diretos de uma raiz que já saiu têm de ter nascido entre o início do hook (`de`) e o registro (`ate`): o hook
//      só gera filho enquanto vive. A folga é 250 ms no Windows (hora de criação exata) e 1 s onde só há segundos (`ps`);
//   d. hora de criação desconhecida (0) nunca abre uma guarda: o processo não é selecionado;
//   e. `desde` ausente vale "início deste processo de teste": nunca 0, que desligaria a guarda de idade.
// Regra para quem chamar: quem sobe sala fora do teste (por exemplo um executor que faz mutação para provar o teste) a
// encerra por PID também, com esta mesma função.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const ARQUIVO_ALVO = /^(?:.*[\\/])?sala[\\/](?:server|lancador[\\/](?:inicio|lancador|servico))\.mjs$/i;
const FOLGA_WINDOWS_MS = 250; // hora de criação do Windows é exata; sobra só o ruído entre relógios
const FOLGA_PS_MS = 1000; // `ps` só sabe a hora de criação em segundos (precisão de 1 s)
const MESMA_HORA_MS = 1000; // duas listagens do mesmo processo diferem no máximo por isto
export const TETO_JANELA_HOOK_MS = 30000; // um hook que já saiu viveu no máximo isto: `ate` nunca passa de `de` + o teto
const JANELA_REGISTRO_MS = 5000; // o processo nasce até isto antes de gravar o próprio registro; é só o plano B, o principal é a descendência do hook
const ESPERA = new Int32Array(new SharedArrayBuffer(4));
const dormir = (ms) => Atomics.wait(ESPERA, 0, 0, ms);
/** A folga das horas de criação: 250 ms onde a hora é exata (Windows), 1 s onde só há segundos (`ps`). */
export const folgaPadrao = (sistema = process.platform) => (sistema === 'win32' ? FOLGA_WINDOWS_MS : FOLGA_PS_MS);
/** `desde` ausente (ou 0) vale o início deste processo de teste, com 2 s de margem: nunca desliga a guarda de idade. */
const desdePadrao = () => Date.now() - Math.round(process.uptime() * 1000) - 2000;

/** Divide a linha de comando em argumentos, respeitando aspas simples e duplas. */
export function argumentosDe(cmd) {
  return [...String(cmd ?? '').matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}
/** O executável é o primeiro item da linha de comando, entre aspas ou não. */
export function executavelDe(cmd) {
  return argumentosDe(cmd)[0] ?? '';
}
/** `node` ou `node.exe`, com ou sem caminho. Não casa `nodemon`, `Claude.exe ... NodeService` nem pasta `node_modules`. */
export const ehNode = (cmd) => /^node(?:\.exe)?$/i.test(executavelDe(cmd).split(/[\\/]/).pop());
/** O script que o `node` roda: o primeiro argumento que não é opção. `node nodemon.js ...\sala\server.mjs` roda o nodemon. */
export function scriptDe(cmd) {
  return argumentosDe(cmd).slice(1).find((a) => !a.startsWith('-')) ?? '';
}
/** Um `node` rodando como script um arquivo da sala ou do lançador, pelo nome exato. */
export const ehAlvo = (cmd) => ehNode(cmd) && ARQUIVO_ALVO.test(scriptDe(cmd));

const TICKS_ATE_1970 = 621355968000000000n; // ticks (100 ns) do .NET entre 0001-01-01 e 1970-01-01

/** Saída do PowerShell: `pid TAB ppid TAB ticks-UTC TAB linha de comando`, uma linha por processo. */
export function analisarSaidaWindows(texto) {
  return String(texto ?? '').split(/\r?\n/).map((l) => l.split('\t')).filter((c) => /^\d+$/.test(c[0]) && /^\d+$/.test(c[1] ?? ''))
    .map((c) => ({
      pid: Number(c[0]), ppid: Number(c[1]),
      criado: /^\d+$/.test(c[2] ?? '') && BigInt(c[2]) > TICKS_ATE_1970 ? Number((BigInt(c[2]) - TICKS_ATE_1970) / 10000n) : 0,
      cmd: c.slice(3).join('\t'),
    }));
}

/** Saída de `ps -eo pid=,ppid=,etime=,args=`: a hora de criação é `agora` menos o tempo decorrido (precisão de segundos). */
export function analisarSaidaPs(texto, agora = Date.now()) {
  return String(texto ?? '').split(/\n/).map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)\s+(.*)$/)).filter(Boolean)
    .map((m) => {
      const [dias, horas, minutos, segundos] = [m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0));
      return { pid: Number(m[1]), ppid: Number(m[2]), criado: agora - (((dias * 24 + horas) * 60 + minutos) * 60 + segundos) * 1000, cmd: m[7] };
    });
}

const COMANDO_WINDOWS = 'Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate,CommandLine | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().Ticks } else { 0 })`t$($_.CommandLine)" }';

/**
 * Todos os processos da máquina: [{ pid, ppid, criado (ms desde 1970, 0 se não souber), cmd }]. Síncrono, sem shell.
 * Falha alto: comando que falha, estoura o tempo ou devolve uma lista que nem inclui este processo de teste lança erro, porque
 * uma lista vazia em silêncio faria a limpeza virar nada sem aviso. `executar` e `agora` existem para os testes substituírem.
 */
export function listarProcessos(sistema = process.platform, executar = spawnSync, agora = Date.now) {
  const windows = sistema === 'win32';
  const tempo = windows ? 120000 : 60000; // sob carga pesada (vários chats rodando suítes) uma listagem chegou a passar de 60 s
  const r = windows
    ? executar('powershell', ['-NoProfile', '-NonInteractive', '-Command', COMANDO_WINDOWS], { encoding: 'utf8', windowsHide: true, timeout: tempo, maxBuffer: 64 * 1024 * 1024 })
    : executar('ps', ['-eo', 'pid=,ppid=,etime=,args='], { encoding: 'utf8', timeout: tempo, maxBuffer: 64 * 1024 * 1024 });
  const falhar = (motivo) => { throw new Error(`auxiliar de processos: a listagem de processos falhou (${motivo}); sem ela a limpeza não é garantida`); };
  if (r?.error) falhar(r.error.code === 'ETIMEDOUT' ? `estourou o tempo de ${tempo} ms` : String(r.error.message ?? r.error));
  if (r?.status !== 0) falhar(`saiu com status ${r?.status}${r?.signal ? ` e sinal ${r.signal}` : ''}: ${String(r?.stderr ?? '').trim().slice(0, 200)}`);
  const lista = windows ? analisarSaidaWindows(r.stdout) : analisarSaidaPs(r.stdout, agora());
  if (lista.length < 2 || !lista.some((p) => p.pid === process.pid)) falhar(`resposta suspeita: ${lista.length} processos e nenhum é este teste`);
  return lista;
}

/** O que a casa registrou: `{ pid, quando }` (`quando` em ms, ou null) ou null. `chave` é a entrada dentro do JSON, se houver. */
function registroDaCasa(casa, arquivo, chave) {
  try {
    const j = JSON.parse(readFileSync(join(casa, '.intoca', arquivo), 'utf8'));
    const e = chave ? j?.[chave] : j;
    const quando = Date.parse(e?.iniciou_em ?? e?.em);
    return Number.isInteger(e?.pid) && e.pid > 0 ? { pid: e.pid, quando: Number.isFinite(quando) ? quando : null } : null;
  } catch {
    return null;
  }
}
const registrosDe = (casas) => casas.flatMap((c) => [registroDaCasa(c, 'sala.json', 'classica'), registroDaCasa(c, 'lancador.json')]).filter(Boolean);
const listaDeCasas = (casa) => [casa ?? []].flat().filter(Boolean);

const comoRaiz = (r) => (typeof r === 'number' ? { pid: r } : { ...r });

/**
 * Função pura: quais processos da lista são do teste. `lista` vem de listarProcessos; `casa` é uma pasta ou uma lista delas;
 * `raizes` são PIDs (números) ou `{ pid, criado }` (raiz viva, com a hora de criação de quando foi registrada) ou
 * `{ pid, saiu: true, de, ate }` (raiz que já saiu quando foi registrada: viveu de `de` a `ate`, em ms desde 1970).
 * `folga` é a tolerância das horas de criação; `desde` ausente vale o início deste processo de teste.
 */
export function selecionar(lista, { casa = null, raizes = [], desde = 0, proprio = process.pid, folga = folgaPadrao() } = {}) {
  const inicio = desde > 0 ? desde : desdePadrao();
  const porPid = new Map(lista.map((p) => [p.pid, p]));
  const filhos = new Map();
  for (const p of lista) filhos.set(p.ppid, [...(filhos.get(p.ppid) ?? []), p]);
  const casas = listaDeCasas(casa);
  const mins = casas.map((c) => c.toLowerCase());
  const tem = (p) => mins.some((c) => p.cmd.toLowerCase().includes(c));
  const escolhidos = new Set();
  for (const p of lista) if (tem(p)) escolhidos.add(p.pid);
  const maisVelhoQueOTeste = (p) => !p.criado || p.criado < inicio; // hora desconhecida conta como velho: na dúvida, não

  // (a) um filho não nasce antes do pai: pai mais novo que o filho é PID reaproveitado. Hora desconhecida = dúvida = reaproveitado.
  const paiReaproveitado = (f) => { const pai = porPid.get(f.ppid); return Boolean(pai && (!pai.criado || !f.criado || pai.criado > f.criado)); };
  const descendeDoTeste = (p) => {
    const vistos = new Set();
    for (let a = p; a && !vistos.has(a.pid); a = porPid.get(a.ppid)) {
      if (a.pid === proprio) return true;
      vistos.add(a.pid);
      if (paiReaproveitado(a)) return false;
    }
    return false;
  };
  // (b) quem tem o PID da raiz hoje é a mesma raiz, ou ninguém (os filhos são órfãos dela), ou um descendente do teste.
  const raizAceita = (r) => {
    if (r.pid === proprio) return true;
    const dono = porPid.get(r.pid);
    if (!dono) return true;
    if (r.criado && dono.criado && Math.abs(dono.criado - r.criado) <= MESMA_HORA_MS) return true;
    return descendeDoTeste(dono);
  };

  const pilha = [...raizes].map(comoRaiz).filter((r) => Number.isInteger(r.pid) && raizAceita(r)).map((r) => ({
    pai: r.pid, janela: r.saiu ? [(r.de ?? inicio) - folga, Math.min(r.ate ?? Infinity, (r.de ?? inicio) + TETO_JANELA_HOOK_MS) + folga] : null, // raiz que saiu sem `ate` também tem janela (o teto)
  }));
  const vistos = new Set();
  while (pilha.length) {
    const { pai, janela } = pilha.pop();
    if (vistos.has(pai)) continue;
    vistos.add(pai);
    for (const f of filhos.get(pai) ?? []) {
      if (f.pid === proprio || f.pid === pai) continue;
      if (maisVelhoQueOTeste(f)) continue; // mais velho que o teste, ou sem hora de criação
      if (paiReaproveitado(f)) continue; // (a)
      if (janela && (f.criado < janela[0] || f.criado > janela[1])) continue; // (c) filho direto de hook que já saiu
      if (ehAlvo(f.cmd)) escolhidos.add(f.pid);
      pilha.push({ pai: f.pid, janela: null }); // desce mesmo sem casar, para achar o neto (vigia → sala)
    }
  }
  for (const { pid, quando } of registrosDe(casas)) {
    const p = porPid.get(pid);
    if (!p || !ehAlvo(p.cmd) || maisVelhoQueOTeste(p)) continue;
    const naJanela = quando !== null && p.criado >= quando - JANELA_REGISTRO_MS && p.criado <= quando + folga;
    if (naJanela || descendeDoTeste(p)) escolhidos.add(pid); // PID de arquivo que hoje é de outro processo não vale
  }
  escolhidos.delete(proprio);
  return lista.filter((p) => escolhidos.has(p.pid) && (tem(p) || ehAlvo(p.cmd)));
}

/** O PID existe? (`kill(pid, 0)` não mata: só pergunta; EPERM quer dizer que existe e é de outro.) */
export function pidVivo(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

/** PIDs que a casa registrou e que ainda existem no sistema mas não aparecem na lista: sinal de listagem parcial. */
export function registradosAusentes(lista, pidsRegistrados, vivo = pidVivo) {
  const presentes = new Set(lista.map((p) => p.pid));
  return [...new Set(pidsRegistrados)].filter((pid) => !presentes.has(pid) && vivo(pid));
}

/**
 * Os processos do teste que ainda vivem agora (uma listagem). Lança erro se um PID registrado pela casa existe e não está na
 * lista (listagem parcial: a limpeza não pode ser garantida). Os registros são lidos ANTES da listagem, para que uma sala que
 * grava o registro durante a listagem não vire falso alarme.
 */
export function restantes(opcoes, { listar = listarProcessos, vivo = pidVivo } = {}) {
  const registrados = registrosDe(listaDeCasas(opcoes?.casa)).map((r) => r.pid);
  const lista = listar();
  const ausentes = registradosAusentes(lista, registrados, vivo);
  if (ausentes.length) throw new Error(`auxiliar de processos: listagem parcial: o(s) PID(s) ${ausentes.join(', ')} registrado(s) pela casa existe(m) e não aparece(m) na lista`);
  return selecionar(lista, opcoes);
}

/** A Clássica real do usuário (`<casa do usuário>/.intoca/sala.json`): `{ pid, porta }` ou null se não há nenhuma registrada. */
export function classicaReal(env = process.env) {
  const casa = env.INTOCA_HOME?.trim() && isAbsolute(env.INTOCA_HOME.trim()) ? env.INTOCA_HOME.trim() : homedir();
  try {
    const c = JSON.parse(readFileSync(join(casa, '.intoca', 'sala.json'), 'utf8'))?.classica;
    return Number.isInteger(c?.pid) && c.pid > 0 ? { pid: c.pid, porta: c.porta ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Encerra por PID e espera sair. Tolerante a "já saiu". Devolve os PIDs que encerrou. Uma listagem no caminho feliz (nada
 * vivo); com algo vivo, mata, espera pelos PIDs (sem listar de novo) e lista outra vez para pegar o que nasceu no meio
 * (o vigia pode relançar a sala). Lança erro se ainda sobrar processo depois do prazo, se a seleção alcançar a Clássica real
 * (nada é morto) ou se a Clássica real, viva ao começar, deixar de existir.
 */
export function encerrarProcessosDe(opcoes, { esperaMs = 15000, listar = listarProcessos, env = process.env } = {}) {
  const real = classicaReal(env);
  const realViva = real && pidVivo(real.pid) ? real.pid : null;
  const encerrados = new Set();
  const fim = Date.now() + esperaMs;
  try {
    for (;;) {
      const vivos = restantes(opcoes, { listar });
      if (!vivos.length) return [...encerrados];
      if (realViva && vivos.some((p) => p.pid === realViva)) throw new Error(`auxiliar de processos: a seleção alcançou a Clássica real (PID ${realViva}); nada foi encerrado`);
      if (Date.now() > fim) throw new Error(`auxiliar de processos: sobraram vivos depois de ${esperaMs} ms: ${vivos.map((p) => p.pid).join(', ')}`);
      for (const p of vivos) {
        encerrados.add(p.pid);
        try { process.kill(p.pid, 'SIGKILL'); } catch { /* já saiu */ }
      }
      while (vivos.some((p) => pidVivo(p.pid)) && Date.now() < fim) dormir(50);
    }
  } finally {
    if (realViva && !pidVivo(realViva)) throw new Error(`auxiliar de processos: a Clássica real (PID ${realViva}) deixou de existir durante a limpeza`);
  }
}

/** A porta recusa conexão? Prova independente de `selecionar`: só o sistema operacional responde. */
export function portaRecusada(porta, { ms = 5000 } = {}) {
  return new Promise((resolve) => {
    const s = connect({ port: porta, host: '127.0.0.1' });
    const fim = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(ms, () => fim(false));
    s.once('connect', () => fim(false));
    s.once('error', (e) => fim(e?.code === 'ECONNREFUSED'));
  });
}

/**
 * Prova independente da limpeza (sem `selecionar` nem `restantes`): espera, com teto, a porta passar a recusar conexão e os PIDs
 * deixarem de existir. Devolve `{ portaRecusada, pidsVivos }`.
 */
export async function provarSaida({ porta = null, pids = [] }, { ms = 10000 } = {}) {
  const fim = Date.now() + ms;
  for (;;) {
    const pidsVivos = pids.filter((p) => pidVivo(p));
    const recusada = porta === null ? true : await portaRecusada(porta);
    if ((recusada && !pidsVivos.length) || Date.now() > fim) return { portaRecusada: recusada, pidsVivos };
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Guarda de um teste: devolve `{ opcoes, raiz, encerrar }`. `raiz(pid, { saiu, de, ate })` registra o PID de um hook disparado pelo
 * teste e EXIGE `de` (o `Date.now()` de antes de disparar o hook); sem ele lança erro, porque a janela do teste inteiro deixaria
 * passar o filho de outra suíte que herdou o PID. Com `saiu: true` (o hook foi `spawnSync` e já saiu) exige também `ate`, que é o
 * `Date.now()` tomado NA SAÍDA do hook, antes de qualquer trabalho que dependa de carga; a janela `de`..`ate` nunca passa de
 * `TETO_JANELA_HOOK_MS`. Sem `saiu`, lê a hora de criação do processo vivo agora (uma listagem). A limpeza também roda sozinha se
 * o processo de teste for interrompido (SIGINT, SIGTERM) ou sair com algo ainda vivo.
 */
export function guardar({ casa, raizes = [], desde = Date.now() - 2000 } = {}) {
  const opcoes = { casa, raizes: [...raizes], desde };
  const encerrar = () => encerrarProcessosDe(opcoes);
  const aoSair = () => { try { encerrar(); } catch (e) { process.stderr.write(`${e?.message ?? e}\n`); /* o processo já está saindo: só avisa */ } };
  const aoInterromper = (sinal) => () => { aoSair(); process.exit(sinal === 'SIGINT' ? 130 : 143); };
  const ouvintes = [['exit', aoSair], ['SIGINT', aoInterromper('SIGINT')], ['SIGTERM', aoInterromper('SIGTERM')], ['SIGHUP', aoInterromper('SIGTERM')], ['SIGBREAK', aoInterromper('SIGTERM')]];
  for (const [ev, fn] of ouvintes) process.on(ev, fn);
  return {
    opcoes,
    raiz: (pid, { saiu = false, de, ate } = {}) => {
      if (!pid) return;
      if (!Number.isFinite(de) || de <= 0) throw new Error('auxiliar de processos: raiz(pid) exige `de` (o Date.now() de antes de disparar o hook); a janela do teste inteiro não é aceita');
      const janela = (fim) => ({ pid, saiu: true, de, ate: Math.min(fim, de + TETO_JANELA_HOOK_MS) });
      if (saiu) {
        if (!Number.isFinite(ate) || ate < de) throw new Error('auxiliar de processos: raiz(pid, { saiu: true }) exige `ate` (o Date.now() tomado na saída do hook, não depois)');
        opcoes.raizes.push(janela(ate));
        return;
      }
      const tomado = Date.now(); // antes da listagem, que pode demorar sob carga
      const vivo = listarProcessos().find((p) => p.pid === pid);
      opcoes.raizes.push(vivo?.criado ? { pid, criado: vivo.criado } : janela(tomado));
    },
    encerrar: () => {
      for (const [ev, fn] of ouvintes) process.off(ev, fn);
      return encerrar();
    },
  };
}
