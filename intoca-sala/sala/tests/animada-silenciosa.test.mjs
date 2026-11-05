// INT-09b: a Animada sobe sem janela preta no Windows (pythonw.exe no lugar do python.exe do venv) e a prévia do arrastar
// fica presa onde a mão está. Nenhum processo real é criado: o spawn é injetado.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executavelSilencioso } from '../lib/animada.mjs';
import { lancarAnimada } from '../lancador/lancador.mjs';

const PY = 'C:/x/app/.venv/Scripts/python.exe';
const PYW = join('C:/x/app/.venv/Scripts', 'pythonw.exe');

test('win32 com pythonw.exe vizinho: troca', () => {
  const visto = [];
  assert.equal(executavelSilencioso(PY, { sistema: 'win32', existe: (p) => (visto.push(p), true) }), PYW);
  assert.deepEqual(visto, [PYW]);
});
test('win32 sem pythonw.exe: fica o python.exe', () => {
  assert.equal(executavelSilencioso(PY, { sistema: 'win32', existe: () => false }), PY);
});
test('outro sistema: nada muda', () => {
  assert.equal(executavelSilencioso('/x/.venv/bin/python', { sistema: 'linux', existe: () => true }), '/x/.venv/bin/python');
  assert.equal(executavelSilencioso(PY, { sistema: 'darwin', existe: () => true }), PY);
});
test('comando que não é python.exe: nada muda', () => {
  assert.equal(executavelSilencioso('C:/bin/uv.exe', { sistema: 'win32', existe: () => true }), 'C:/bin/uv.exe');
  assert.equal(executavelSilencioso('C:/bin/mypython.exe', { sistema: 'win32', existe: () => true }), 'C:/bin/mypython.exe');
  assert.equal(executavelSilencioso(undefined, { sistema: 'win32', existe: () => true }), undefined);
});

const casas = [];
after(() => casas.forEach((c) => rmSync(c, { recursive: true, force: true })));

function lancar(sistema, existe) {
  const casa = mkdtempSync(join(tmpdir(), 'sala-silenciosa-'));
  casas.push(casa);
  const chamadas = [];
  const filho = { pid: 99, once() {}, unref() {} };
  const r = lancarAnimada({
    casa,
    achada: { command: [PY, '-m', 'backend.cli', 'serve', '--port', '48765'], cwd: casa },
    env: {},
    spawnar: (cmd, args, opts) => (chamadas.push({ cmd, args, opts }), filho),
    sistema,
    existe,
  });
  return { r, chamadas };
}

test('lancarAnimada chama o spawn com o pythonw.exe e os mesmos argumentos', () => {
  const { r, chamadas } = lancar('win32', () => true);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].cmd, PYW);
  assert.deepEqual(chamadas[0].args, ['-m', 'backend.cli', 'serve', '--port', '48765']);
  assert.equal(chamadas[0].opts.detached, true);
  assert.equal(r.executavel, 'pythonw.exe');
  assert.equal(r.silencioso, true);
});
test('lancarAnimada sem pythonw.exe sobe o python.exe como antes', () => {
  const { r, chamadas } = lancar('win32', () => false);
  assert.equal(chamadas[0].cmd, PY);
  assert.equal(r.silencioso, false);
});

test('a prévia do arrastar usa o deslocamento do ponteiro dentro da seção', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /setDragImage\(sec, e\.clientX - r\.left, e\.clientY - r\.top\)/);
  assert.doesNotMatch(html, /setDragImage\(sec, 20, 20\)/);
});
