import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arquivoLog, arquivoTentativa, arquivoTrava, decidir, desligado, entradaDaClassica, pegarTrava, sondarSala, vigiar,
} from '../lancador/lancador.mjs';
import { arquivoDeEstado, lerEstado } from '../lib/estado.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const INICIO = join(AQUI, '..', 'lancador', 'inicio.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'sala-lancador-'));
const limpar = (...d) => d.forEach((x) => rmSync(x, { recursive: true, force: true }));
const gravarEstado = (casa, obj) => {
  mkdirSync(join(casa, '.intoca'), { recursive: true });
  writeFileSync(arquivoDeEstado(casa), typeof obj === 'string' ? obj : JSON.stringify(obj));
};
const registroDaClassica = (porta, pid, quando) => ({ classica: { porta, pid, iniciou_em: new Date(quando).toISOString() }, controle: false });

/** Mundo de mentira: relógio que só anda quando o vigia espera, processos vivos num conjunto, portas que respondem num conjunto. */
function mundo(extra = {}) {
  const m = {
    t: 1_800_000_000_000,
    vivos: new Set(),
    respondem: new Set(),
    lancamentos: 0,
    esperas: 0,
    aoEsperar: null, // (m) => void, para simular a sala que termina de subir
    ...extra,
  };
  m.deps = {
    agora: () => m.t,
    esperar: async (ms) => {
      m.t += ms;
      m.esperas += 1;
      m.aoEsperar?.(m);
    },
    sondar: async (porta) => m.respondem.has(porta),
    vivo: (pid) => m.vivos.has(pid),
    inicioDoBoot: () => m.t - 3_600_000, // ligado há 1 h
    intervaloMs: 3000,
    ...(extra.deps ?? {}),
  };
  return m;
}

// ---------- decidir (função pura) ----------

test('decidir: no ar, em subida, relança só quando nada vive', () => {
  const boot = 1000;
  const base = { inicioDoBoot: boot, agora: 100_000, tentativa: null, tentativaViva: false };
  assert.equal(decidir({ ...base, entrada: { porta: 80, pid: 5, iniciouEm: 50_000 }, respondeu: true, vivo: true }), 'no-ar');
  assert.equal(decidir({ ...base, entrada: { porta: 80, pid: 5, iniciouEm: 50_000 }, respondeu: false, vivo: true }), 'esperar');
  assert.equal(decidir({ ...base, entrada: { porta: 80, pid: 5, iniciouEm: 50_000 }, respondeu: false, vivo: false }), 'subir');
  assert.equal(decidir({ ...base, entrada: null, respondeu: false, vivo: false }), 'subir');
  // tentativa viva (sem porta ainda): em subida, por mais velha que seja
  const t = { quando: 2000, pid: 9, resultado: 'subindo' };
  assert.equal(decidir({ ...base, entrada: null, respondeu: false, vivo: false, tentativa: t, tentativaViva: true }), 'esperar-subida');
  // tentativa morta cedo: espera o cooldown
  const morta = { quando: 99_000, pid: 9, resultado: 'saiu-cedo' };
  assert.equal(decidir({ ...base, entrada: null, respondeu: false, vivo: false, tentativa: morta }), 'aguardar-cooldown');
  assert.equal(decidir({ ...base, entrada: null, respondeu: false, vivo: false, tentativa: { ...morta, quando: 1500 }, agora: 300_000 }), 'subir', 'cooldown vencido');
});

test('decidir: entrada gravada antes do boot é de outra vida, mesmo que o pid exista (pid reaproveitado)', () => {
  const r = decidir({ entrada: { porta: 80, pid: 5, iniciouEm: 500 }, respondeu: false, vivo: true, inicioDoBoot: 1000, tentativa: null, tentativaViva: false, agora: 5000 });
  assert.equal(r, 'subir');
});

// ---------- cenário 1: no ar ----------

test('cenário no ar: não lança nada e responde "no-ar"', async () => {
  const casa = tmp();
  const m = mundo();
  gravarEstado(casa, registroDaClassica(4321, 777, m.t - 600_000));
  m.vivos.add(777);
  m.respondem.add(4321);
  let lancou = 0;
  const r = await vigiar({ casa, env: {}, deps: { ...m.deps, lancar: () => (lancou += 1, { pid: 1, saiu: new Promise(() => {}) }) } });
  assert.equal(r, 'no-ar');
  assert.equal(lancou, 0);
  assert.equal(existsSync(arquivoTrava(casa)), false, 'a trava é solta');
  limpar(casa);
});

// ---------- cenário 2: fora do ar ----------

test('cenário fora do ar: lança uma vez, espera a sala registrar e responde "subiu"', async () => {
  const casa = tmp();
  const m = mundo();
  let lancou = 0;
  // a sala "abre a porta" na 3ª espera e se registra como a verdadeira faria
  m.aoEsperar = (mm) => {
    if (mm.esperas === 3) {
      gravarEstado(casa, registroDaClassica(5050, 4242, mm.t));
      mm.vivos.add(4242);
      mm.respondem.add(5050);
    }
  };
  const lancar = () => {
    lancou += 1;
    m.vivos.add(4242);
    return { pid: 4242, saiu: new Promise(() => {}) };
  };
  const r = await vigiar({ casa, env: {}, deps: { ...m.deps, lancar } });
  assert.equal(r, 'subiu');
  assert.equal(lancou, 1);
  const tentativa = JSON.parse(readFileSync(arquivoTentativa(casa), 'utf8'));
  assert.equal(tentativa.pid, 4242);
  assert.match(readFileSync(arquivoLog(casa), 'utf8'), /subindo a InToca Sala \(pid 4242\)/);
  assert.equal(existsSync(arquivoTrava(casa)), false);
  limpar(casa);
});

// ---------- cenário 3: em subida ----------

test('cenário em subida: processo lançado antes ainda vive e a porta não abriu → não relança, espera, e o prazo esgotado não mata nada', async () => {
  const casa = tmp();
  const m = mundo();
  mkdirSync(join(casa, '.intoca'), { recursive: true });
  writeFileSync(arquivoTentativa(casa), JSON.stringify({ em: new Date(m.t - 30_000).toISOString(), pid: 555, resultado: 'subindo' }));
  m.vivos.add(555);
  let lancou = 0;
  const lancar = () => (lancou += 1, { pid: 1, saiu: new Promise(() => {}) });
  const r = await vigiar({ casa, env: {}, prazoMs: 5 * 60 * 1000, deps: { ...m.deps, lancar } });
  assert.equal(r, 'prazo-esgotado');
  assert.equal(lancou, 0, 'nunca relança processo em subida');
  assert.ok(m.esperas >= 90, 'esperou o prazo todo (5 min / 3 s)');
  assert.ok(m.vivos.has(555), 'não mexeu no processo');
  assert.match(readFileSync(arquivoLog(casa), 'utf8'), /não mexo no processo/);
  limpar(casa);
});

test('cenário em subida (lenta): a sala aparece depois de minutos e o lançador, que não lançou nada, termina "no-ar"', async () => {
  const casa = tmp();
  const m = mundo();
  mkdirSync(join(casa, '.intoca'), { recursive: true });
  writeFileSync(arquivoTentativa(casa), JSON.stringify({ em: new Date(m.t).toISOString(), pid: 555, resultado: 'subindo' }));
  m.vivos.add(555);
  m.aoEsperar = (mm) => {
    if (mm.t - 1_800_000_000_000 >= 4 * 60 * 1000 && !existsSync(arquivoDeEstado(casa))) {
      gravarEstado(casa, registroDaClassica(7070, 555, mm.t));
      mm.respondem.add(7070);
    }
  };
  let lancou = 0;
  const r = await vigiar({ casa, env: {}, deps: { ...m.deps, lancar: () => (lancou += 1, { pid: 1, saiu: new Promise(() => {}) }) } });
  assert.equal(r, 'no-ar');
  assert.equal(lancou, 0);
  limpar(casa);
});

test('sala registrada, viva, mas lenta para responder: espera, não relança', async () => {
  const casa = tmp();
  const m = mundo();
  gravarEstado(casa, registroDaClassica(4321, 777, m.t - 60_000));
  m.vivos.add(777);
  let lancou = 0;
  const r = await vigiar({ casa, env: {}, prazoMs: 60_000, deps: { ...m.deps, lancar: () => (lancou += 1, { pid: 1, saiu: new Promise(() => {}) }) } });
  assert.equal(r, 'prazo-esgotado');
  assert.equal(lancou, 0);
  limpar(casa);
});

// ---------- cenário 4: porta ocupada ----------

test('cenário porta ocupada por outro programa: registro velho com pid morto e a porta responde algo que não é a Sala → sobe uma nova', async () => {
  const casa = tmp();
  const m = mundo();
  gravarEstado(casa, registroDaClassica(80, 31337, m.t - 7_200_000)); // pid morto; a 80 está com o painel antigo (não responde como a Sala)
  let lancou = 0;
  m.aoEsperar = (mm) => {
    if (lancou && mm.esperas === 2) {
      gravarEstado(casa, registroDaClassica(51234, 4242, mm.t)); // a sala nova escolheu outra porta, como o server.mjs faz
      mm.vivos.add(4242);
      mm.respondem.add(51234);
    }
  };
  const lancar = () => (lancou += 1, m.vivos.add(4242), { pid: 4242, saiu: new Promise(() => {}) });
  const r = await vigiar({ casa, env: {}, deps: { ...m.deps, lancar } });
  assert.equal(r, 'subiu');
  assert.equal(lancou, 1);
  assert.equal(entradaDaClassica(casa).porta, 51234);
  limpar(casa);
});

test('cenário porta ocupada, de verdade: INTOCA_SALA_PORTA ocupada faz o server.mjs sair; o lançador registra, não insiste em laço e respeita o cooldown', async () => {
  const casa = tmp();
  const ocupante = createServer();
  const porta = await new Promise((resolve) => ocupante.listen(0, '127.0.0.1', () => resolve(ocupante.address().port)));
  const env = { ...process.env, INTOCA_HOME: casa, INTOCA_SALA_PORTA: String(porta) };
  const r1 = await vigiar({ casa, env, prazoMs: 60_000, deps: { intervaloMs: 200 } });
  assert.equal(r1, 'saiu-cedo');
  assert.match(readFileSync(arquivoLog(casa), 'utf8'), /saiu antes de abrir a porta/);
  assert.match(readFileSync(join(casa, '.intoca', 'sala.log'), 'utf8'), /já está em uso/);
  const r2 = await vigiar({ casa, env, prazoMs: 60_000, deps: { intervaloMs: 200 } });
  assert.equal(r2, 'cooldown', 'a segunda chamada logo em seguida não relança');
  await new Promise((r) => ocupante.close(r));
  limpar(casa);
});

// ---------- cenário 5: arquivo de estado corrompido ----------

test('cenário arquivo de estado corrompido: sala.json, lancador.json e lancador.lock ilegíveis valem "sem registro" e a sala sobe', async () => {
  const casa = tmp();
  const m = mundo();
  gravarEstado(casa, '{{{ isto não é json');
  writeFileSync(arquivoTentativa(casa), '\u0000\u0000lixo');
  writeFileSync(arquivoTrava(casa), 'também lixo');
  assert.equal(entradaDaClassica(casa), null);
  let lancou = 0;
  m.aoEsperar = (mm) => {
    if (lancou && mm.esperas === 1) {
      gravarEstado(casa, registroDaClassica(5555, 4242, mm.t));
      mm.vivos.add(4242);
      mm.respondem.add(5555);
    }
  };
  const r = await vigiar({ casa, env: {}, deps: { ...m.deps, lancar: () => (lancou += 1, m.vivos.add(4242), { pid: 4242, saiu: new Promise(() => {}) }) } });
  assert.equal(r, 'subiu');
  assert.equal(lancou, 1);
  limpar(casa);
});

test('entradas com formato errado (porta fora da faixa, pid texto, JSON que é lista) não valem', () => {
  const casa = tmp();
  for (const c of [{ classica: { porta: 99999, pid: 1 } }, { classica: { porta: 80, pid: 'x' } }, { classica: 'oi' }, [1, 2], 'texto']) {
    gravarEstado(casa, JSON.stringify(c));
    assert.equal(entradaDaClassica(casa), null);
  }
  limpar(casa);
});

// ---------- trava, boot, desligar ----------

test('trava: um segundo lançador vivo sai com "ocupado"; trava de processo morto ou velha demais é tomada; solta no fim', async () => {
  const casa = tmp();
  const m = mundo();
  const soltar = pegarTrava(casa, { agora: m.t, vivo: () => true, pid: 111 });
  assert.ok(soltar);
  assert.equal(pegarTrava(casa, { agora: m.t, vivo: () => true, pid: 222 }), null, 'dono vivo e recente');
  assert.equal(await vigiar({ casa, env: {}, deps: { ...m.deps, vivo: () => true, lancar: () => assert.fail('não lança') } }), 'ocupado');
  assert.ok(existsSync(arquivoTrava(casa)), 'quem não é dono não solta a trava dos outros');
  const tomada = pegarTrava(casa, { agora: m.t, vivo: () => false, pid: 222 });
  assert.ok(tomada, 'dono morto: toma');
  tomada();
  assert.equal(existsSync(arquivoTrava(casa)), false);
  const soltarDe1 = pegarTrava(casa, { agora: m.t, vivo: () => true, pid: 1 });
  assert.ok(pegarTrava(casa, { agora: m.t + 16 * 60_000, vivo: () => true, pid: 2 }), 'dono vivo mas trava velha demais');
  soltar();
  soltarDe1();
  limpar(casa);
});

test('desligar: variável ou "lancador": false no sala.json; 0 e vazio não desligam', async () => {
  const casa = tmp();
  assert.equal(desligado(casa, {}), false);
  assert.equal(desligado(casa, { INTOCA_SALA_SEM_LANCADOR: '1' }), true);
  assert.equal(desligado(casa, { INTOCA_SALA_SEM_LANCADOR: '0' }), false);
  assert.equal(desligado(casa, { INTOCA_SALA_SEM_LANCADOR: '' }), false);
  gravarEstado(casa, { lancador: false });
  assert.equal(desligado(casa, {}), true);
  const m = mundo();
  assert.equal(await vigiar({ casa, env: {}, deps: { ...m.deps, lancar: () => assert.fail('não lança') } }), 'desligado');
  limpar(casa);
});

test('erro inesperado vira "erro" no log, nunca exceção', async () => {
  const casa = tmp();
  const m = mundo();
  gravarEstado(casa, registroDaClassica(4321, 777, m.t));
  const r = await vigiar({ casa, env: {}, deps: { ...m.deps, sondar: async () => { throw new Error('boom'); }, lancar: () => assert.fail('não lança') } });
  assert.equal(r, 'erro');
  assert.match(readFileSync(arquivoLog(casa), 'utf8'), /erro no lançador: boom/);
  assert.equal(existsSync(arquivoTrava(casa)), false);
  limpar(casa);
});

test('sondarSala: só a Clássica conta (formato de /api/saude); outro servidor na porta, resposta que não é JSON e porta fechada dão false', async () => {
  const { createServer: http } = await import('node:http');
  const servir = (corpo, status = 200) => new Promise((resolve) => {
    const s = http((_, res) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(corpo); });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
  const sala = await servir(JSON.stringify({ versao: '0.3.0', controle: false, sede: { achada: true } }));
  const outro = await servir(JSON.stringify({ ok: true }));
  const html = await servir('<html>painel antigo</html>');
  const erro = await servir(JSON.stringify({ versao: '1', controle: false, sede: {} }), 500);
  assert.equal(await sondarSala(sala.address().port, 2000), true);
  assert.equal(await sondarSala(outro.address().port, 2000), false);
  assert.equal(await sondarSala(html.address().port, 2000), false);
  assert.equal(await sondarSala(erro.address().port, 2000), false);
  const fechada = await new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  assert.equal(await sondarSala(fechada, 1000), false);
  await Promise.all([sala, outro, html, erro].map((s) => new Promise((r) => s.close(r))));
});

// ---------- o hook, de ponta a ponta (processos de verdade, casa temporária, porta livre) ----------

const portaLivre = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const get = (porta, caminho) => new Promise((resolve) => {
  const req = request({ host: '127.0.0.1', port: porta, path: caminho, timeout: 4000, headers: { Host: 'localhost' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', () => resolve(0));
  req.on('timeout', () => { req.destroy(); resolve(0); });
  req.end();
});
const esperarAte = async (cond, ms) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

test('hook de ponta a ponta: sai com 0 e sem saída na hora, e o vigia solto sobe a sala; uma segunda sessão não sobe outra', async () => {
  const casa = tmp();
  const porta = await portaLivre();
  const env = { ...process.env, INTOCA_HOME: casa, INTOCA_SALA_PORTA: String(porta), INTOCA_SEDE: '' };
  const t0 = Date.now();
  const hook = spawnSync(process.execPath, [INICIO], { env, input: '{"hook_event_name":"SessionStart","source":"startup"}', encoding: 'utf8', timeout: 15000 });
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, '');
  assert.equal(hook.stderr, '');
  assert.ok(Date.now() - t0 < 10000, 'o hook não espera a sala subir');
  let pid = null;
  try {
    assert.ok(await esperarAte(() => entradaDaClassica(casa)?.porta === porta, 60000), 'a sala se registrou');
    pid = entradaDaClassica(casa).pid;
    assert.equal(await get(porta, '/api/saude'), 200);
    const hook2 = spawnSync(process.execPath, [INICIO], { env, input: '{}', encoding: 'utf8', timeout: 15000 });
    assert.equal(hook2.status, 0);
    await new Promise((r) => setTimeout(r, 3000));
    assert.equal(entradaDaClassica(casa).pid, pid, 'a mesma sala; nenhuma outra foi lançada');
    assert.equal(existsSync(arquivoTrava(casa)), false, 'trava solta');
  } finally {
    if (pid) try { process.kill(pid); } catch { /* já saiu */ }
    await new Promise((r) => setTimeout(r, 500));
    limpar(casa);
  }
});

test('hook em ambiente quebrado (casa inexistente e relativa, estado ilegível, lançador desligado) sai com 0, sem saída e sem criar nada', () => {
  const casa = tmp();
  gravarEstado(casa, { lancador: false });
  for (const env of [
    { ...process.env, INTOCA_HOME: casa },
    { ...process.env, INTOCA_HOME: 'relativa/que/nao/existe', INTOCA_SALA_SEM_LANCADOR: '1' }, // sem isto usaria a casa real
    { ...process.env, INTOCA_HOME: join(casa, 'nada', 'aqui'), INTOCA_SALA_SEM_LANCADOR: '1' },
  ]) {
    const r = spawnSync(process.execPath, [INICIO], { env, input: '', encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  }
  assert.equal(existsSync(arquivoTrava(casa)), false);
  assert.equal(lerEstado(casa).lancador, false);
  limpar(casa);
});
