// INT-09: o lançador sobe a Animada UMA vez quando `animada.auto === true`, no vigia e no serviço; nunca no modo hook direto.
// O mundo é de mentira (relógio, sonda, processos, comando de subida injetados): nenhuma porta real é tocada.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arquivoLog, arquivoTravaAnimada, subirAnimada } from '../lancador/lancador.mjs';
import { rodarHook, rodarServico, rodarVigia } from '../lancador/inicio.mjs';
import { arquivoDeEstado, lerEstado } from '../lib/estado.mjs';

const casas = [];
after(() => casas.forEach((c) => rmSync(c, { recursive: true, force: true })));
const novaCasa = (estado) => {
  const casa = mkdtempSync(join(tmpdir(), 'sala-anim-lanc-'));
  casas.push(casa);
  mkdirSync(join(casa, '.intoca'), { recursive: true });
  if (estado) writeFileSync(arquivoDeEstado(casa), JSON.stringify(estado));
  return casa;
};
const log = (casa) => { try { return readFileSync(arquivoLog(casa), 'utf8'); } catch { return ''; } };
const ACHADA = { origem: 'manifesto', nome: 'AI Operations Room · InToca', pasta: '/x', porta: 8765, command: ['py', '-m', 'backend.cli', 'serve'], cwd: '/x' };

/** Relógio que só anda quando o vigia espera; `sobeApos` = quantas esperas depois do lançamento a Animada passa a responder. */
function mundo({ achada = ACHADA, sobeApos = 2, saiuCom } = {}) {
  const m = { t: 1_800_000_000_000, noAr: new Set(), vivos: new Set(), lancamentos: 0, esperas: 0, desde: null };
  m.deps = {
    agora: () => m.t,
    esperar: async (ms) => {
      m.t += ms;
      m.esperas += 1;
      if (m.desde !== null && m.esperas - m.desde >= sobeApos && saiuCom === undefined) m.noAr.add(achada?.porta ?? 8765);
    },
    sondar: async (porta) => m.noAr.has(porta),
    vivo: (pid) => m.vivos.has(pid),
    inicioDoBoot: () => m.t - 3_600_000,
    intervaloMs: 2000,
    resolver: () => achada,
    lancar: () => {
      m.lancamentos += 1;
      m.desde = m.esperas;
      m.vivos.add(4242);
      return { pid: 4242, saiu: saiuCom === undefined ? new Promise(() => {}) : Promise.resolve(saiuCom), erro: () => null };
    },
  };
  return m;
}

test('auto verdadeiro e Animada fora do ar: sobe uma vez, registra no log e anota pid e iniciou_em', async () => {
  const casa = novaCasa({ animada: { auto: true, pasta: '/x', porta: 8765 }, animada_config: { auto: true }, controle: true });
  const m = mundo();
  const r = await subirAnimada({ casa, env: {}, deps: m.deps });
  assert.equal(r, 'subiu');
  assert.equal(m.lancamentos, 1);
  assert.match(log(casa), /animada: subiu na porta 8765/);
  const est = lerEstado(casa);
  assert.equal(est.animada.pid, 4242);
  assert.ok(Date.parse(est.animada.iniciou_em) > 0);
  assert.equal(est.animada.auto, true, 'a escolha da pessoa continua');
  assert.equal(est.controle, true);
  assert.equal(existsSync(arquivoTravaAnimada(casa)), false, 'a trava é solta');
});

test('auto falso, ausente ou lixo: não sobe e não escreve nada', async () => {
  for (const estado of [{ animada: { auto: false } }, { animada: { porta: 8765 } }, { animada: { auto: 'true' } }, {}, undefined]) {
    const casa = novaCasa(estado);
    const m = mundo();
    assert.equal(await subirAnimada({ casa, env: {}, deps: m.deps }), 'sem-auto');
    assert.equal(m.lancamentos, 0);
    assert.equal(log(casa), '');
  }
});

test('Animada já no ar: não sobe', async () => {
  const casa = novaCasa({ animada: { auto: true } });
  const m = mundo();
  m.noAr.add(8765);
  assert.equal(await subirAnimada({ casa, env: {}, deps: m.deps }), 'ja-no-ar');
  assert.equal(m.lancamentos, 0);
  assert.match(log(casa), /animada: já no ar na porta 8765/);
});

test('processo da subida anterior ainda vivo (lançado há pouco): está subindo, não sobe outro', async () => {
  const m = mundo();
  const casa = novaCasa({ animada: { auto: true, pid: 777, iniciou_em: new Date(m.t - 60_000).toISOString() } });
  m.vivos.add(777);
  assert.equal(await subirAnimada({ casa, env: {}, deps: m.deps }), 'subindo');
  assert.equal(m.lancamentos, 0);
  // o mesmo pid, mas morto: aí sobe
  m.vivos.delete(777);
  assert.equal(await subirAnimada({ casa, env: {}, deps: m.deps }), 'subiu');
  assert.equal(m.lancamentos, 1);
});

test('duas chamadas ao mesmo tempo (dois chats abrindo juntos): só uma sobe', async () => {
  const casa = novaCasa({ animada: { auto: true } });
  const m = mundo({ sobeApos: 3 });
  const [a, b] = await Promise.all([subirAnimada({ casa, env: {}, deps: m.deps }), subirAnimada({ casa, env: {}, deps: m.deps })]);
  assert.equal(m.lancamentos, 1);
  assert.deepEqual([a, b].sort(), [[a, b].find((x) => x !== 'subiu'), 'subiu'].sort());
  assert.ok(['subindo', 'ocupado', 'ja-no-ar'].includes([a, b].find((x) => x !== 'subiu')));
});

test('não instalada, sem comando, lançador desligado: nada sobe e o motivo vai para o log', async () => {
  let casa = novaCasa({ animada: { auto: true } });
  assert.equal(await subirAnimada({ casa, env: {}, deps: mundo({ achada: null }).deps }), 'nao-instalada');
  assert.match(log(casa), /não está instalada/);

  casa = novaCasa({ animada: { auto: true } });
  const sem = mundo({ achada: { ...ACHADA, command: undefined } });
  assert.equal(await subirAnimada({ casa, env: {}, deps: sem.deps }), 'falhou');
  assert.equal(sem.lancamentos, 0);
  assert.match(log(casa), /animada: falhou: sem comando/);

  casa = novaCasa({ animada: { auto: true }, lancador: false });
  const off = mundo();
  assert.equal(await subirAnimada({ casa, env: {}, deps: off.deps }), 'desligado');
  assert.equal(off.lancamentos, 0);
  casa = novaCasa({ animada: { auto: true } });
  assert.equal(await subirAnimada({ casa, env: { INTOCA_SALA_SEM_LANCADOR: '1' }, deps: mundo().deps }), 'desligado');
});

test('a Animada que sai antes de abrir a porta, ou que não responde no prazo, vira "falhou" no log e não é mortalmente perseguida', async () => {
  let casa = novaCasa({ animada: { auto: true } });
  const morre = mundo({ saiuCom: 3 });
  assert.equal(await subirAnimada({ casa, env: {}, deps: morre.deps }), 'falhou');
  assert.equal(morre.lancamentos, 1);
  assert.match(log(casa), /animada: falhou: saiu antes de abrir a porta \(código 3\)/);

  casa = novaCasa({ animada: { auto: true } });
  const muda = mundo({ sobeApos: 10_000 });
  assert.equal(await subirAnimada({ casa, env: {}, prazoMs: 10_000, deps: muda.deps }), 'falhou');
  assert.equal(muda.lancamentos, 1, 'uma vez só, mesmo sem resposta');
  assert.match(log(casa), /animada: falhou: não respondeu em 10 s; o processo segue e não mexo nele/);
});

test('o erro de partida (programa que não existe) aparece no log', async () => {
  const casa = novaCasa({ animada: { auto: true } });
  const m = mundo({ saiuCom: -1 });
  m.deps.lancar = () => (m.lancamentos += 1, { pid: undefined, saiu: Promise.resolve(-1), erro: () => 'ENOENT' });
  assert.equal(await subirAnimada({ casa, env: {}, deps: m.deps }), 'falhou');
  assert.match(log(casa), /não consegui iniciar \(ENOENT\)/);
});

// ---------- quem chama: vigia, serviço e hook ----------

test('vigia: com a Clássica de pé chama a Animada uma vez; sem ela (ocupado, desligado, cooldown, prazo) não chama', async () => {
  const casa = novaCasa({ animada: { auto: true } });
  for (const [classica, chama] of [['no-ar', 1], ['subiu', 1], ['ocupado', 0], ['desligado', 0], ['cooldown', 0], ['prazo-esgotado', 0], ['saiu-cedo', 0], ['erro', 0]]) {
    let chamadas = 0;
    const r = await rodarVigia(casa, { vigiar: async () => classica, subirAnimada: async () => (chamadas += 1, 'subiu') });
    assert.equal(chamadas, chama, classica);
    assert.equal(r.classica, classica);
  }
});

test('serviço de logon: sobe a Animada logo depois da Clássica, antes de esperar a Clássica sair, e não prende a Animada', async () => {
  const casa = novaCasa({ animada: { auto: true } });
  const ordem = [];
  let sai;
  const filho = { pid: 99, saiu: new Promise((r) => { sai = r; }) };
  const andamento = rodarServico(casa, {
    lancarServidor: () => filho,
    vigiar: async ({ deps }) => { deps.lancar(); ordem.push('classica'); return 'subiu'; },
    subirAnimada: async () => { ordem.push('animada'); return 'subiu'; },
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ordem, ['classica', 'animada'], 'a Animada não espera a Clássica terminar');
  sai(0);
  const r = await andamento;
  assert.equal(r.codigo, 0);
  assert.match(log(casa), /serviço: a sala saiu \(código 0\)/);
});

test('modo hook direto: só dispara o vigia e NUNCA sobe a Animada; desligado não dispara nada', () => {
  const casa = novaCasa({ animada: { auto: true } });
  const disparos = [];
  assert.equal(rodarHook(casa, { disparar: (arg) => disparos.push(arg), subirAnimada: () => assert.fail('o hook nunca sobe a Animada') }), true);
  assert.deepEqual(disparos, ['--vigia']);
  const off = novaCasa({ animada: { auto: true }, lancador: false });
  assert.equal(rodarHook(off, { disparar: (arg) => disparos.push(arg) }), false);
  assert.deepEqual(disparos, ['--vigia']);
});
