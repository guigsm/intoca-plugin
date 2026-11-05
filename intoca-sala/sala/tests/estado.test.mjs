import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acharSede, arquivoDeEstado, controleLigado, desregistrarClassica, escolherPorta, lerEstado, portaLivre, registrarClassica,
} from '../lib/estado.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'sala-estado-'));
const limpar = (...d) => d.forEach((x) => rmSync(x, { recursive: true, force: true }));

test('acharSede: INTOCA_SEDE vence o ponteiro; aceita a pasta ou o próprio sede.yaml', () => {
  const casa = tmp();
  const a = tmp();
  const b = tmp();
  writeFileSync(join(a, 'sede.yaml'), 'projetos:\n');
  writeFileSync(join(b, 'sede.yaml'), 'projetos:\n');
  mkdirSync(join(casa, '.intoca'));
  writeFileSync(join(casa, '.intoca', 'sede'), `${b}\n`);
  assert.deepEqual(acharSede({ env: { INTOCA_SEDE: a }, casa }), { raiz: a, origem: 'INTOCA_SEDE' });
  assert.deepEqual(acharSede({ env: { INTOCA_SEDE: join(a, 'sede.yaml') }, casa }), { raiz: a, origem: 'INTOCA_SEDE' });
  assert.deepEqual(acharSede({ env: {}, casa }), { raiz: b, origem: 'ponteiro' });
  limpar(casa, a, b);
});

test('acharSede: ponteiro relativo, pasta sem sede.yaml e variável inválida são ignorados', () => {
  const casa = tmp();
  const sem = tmp();
  mkdirSync(join(casa, '.intoca'));
  writeFileSync(join(casa, '.intoca', 'sede'), 'relativo/sede\n');
  assert.equal(acharSede({ env: { INTOCA_SEDE: sem }, casa }), null);
  writeFileSync(join(casa, '.intoca', 'sede'), `${sem}\n`);
  assert.equal(acharSede({ env: { INTOCA_SEDE: 'relativo' }, casa }), null);
  assert.equal(acharSede({ env: {}, casa: join(casa, 'nada') }), null);
  limpar(casa, sem);
});

test('registrarClassica: formato do sala.json, controle nasce false e o resto é preservado', () => {
  const casa = tmp();
  registrarClassica(casa, { porta: 8090, pid: 123, agora: new Date('2026-11-03T12:00:00Z') });
  assert.deepEqual(lerEstado(casa), { classica: { porta: 8090, pid: 123, iniciou_em: '2026-11-03T12:00:00.000Z' }, controle: false });
  assert.equal(controleLigado(casa), false);

  writeFileSync(arquivoDeEstado(casa), JSON.stringify({ animada: { porta: 8765, pid: 9 }, controle: true, extra: 1 }));
  registrarClassica(casa, { porta: 80, pid: 124 });
  const e = lerEstado(casa);
  assert.equal(e.classica.porta, 80);
  assert.deepEqual(e.animada, { porta: 8765, pid: 9 });
  assert.equal(e.controle, true);
  assert.equal(e.extra, 1);
  assert.equal(controleLigado(casa), true);
  limpar(casa);
});

test('controleLigado: só o booleano true liga; texto, número e arquivo quebrado não', () => {
  const casa = tmp();
  mkdirSync(join(casa, '.intoca'));
  for (const valor of ['"true"', '1', 'null', '"sim"']) {
    writeFileSync(arquivoDeEstado(casa), `{"controle": ${valor}}`);
    assert.equal(controleLigado(casa), false, valor);
  }
  writeFileSync(arquivoDeEstado(casa), '{ quebrado');
  assert.equal(controleLigado(casa), false);
  assert.deepEqual(lerEstado(casa), {});
  limpar(casa);
});

test('desregistrarClassica: tira só o registro do próprio pid e mantém a Animada', () => {
  const casa = tmp();
  registrarClassica(casa, { porta: 80, pid: 5 });
  const e = lerEstado(casa);
  writeFileSync(arquivoDeEstado(casa), JSON.stringify({ ...e, animada: { porta: 8765 } }));
  desregistrarClassica(casa, 6);
  assert.equal(lerEstado(casa).classica.pid, 5);
  desregistrarClassica(casa, 5);
  assert.equal(lerEstado(casa).classica, undefined);
  assert.equal(lerEstado(casa).animada.porta, 8765);
  assert.equal(JSON.parse(readFileSync(arquivoDeEstado(casa), 'utf8')).controle, false);
  limpar(casa);
});

test('portaLivre e escolherPorta: porta ocupada, preferida livre, sorteio e porta explícita', async () => {
  const ocupa = createServer();
  await new Promise((r) => ocupa.listen(0, '127.0.0.1', r));
  const { port } = ocupa.address();
  assert.equal(await portaLivre(port), false);

  assert.equal(await escolherPorta({ preferida: 80, livre: async () => true }), 80);
  assert.equal(await escolherPorta({ preferida: 80, livre: async () => false, sorteio: async () => 54321 }), 54321);
  assert.equal(await escolherPorta({ explicita: '8090', livre: async () => true }), 8090);
  await assert.rejects(escolherPorta({ explicita: String(port) }), /já está em uso/);
  await assert.rejects(escolherPorta({ explicita: 'abc' }), /inválida/);
  await assert.rejects(escolherPorta({ explicita: '70000' }), /inválida/);
  const real = await escolherPorta({ preferida: port });
  assert.notEqual(real, port);
  assert.ok(real > 0);
  await new Promise((r) => ocupa.close(r));
  assert.equal(await portaLivre(port), true);
});
