// A versão que a Clássica informa vem do `plugin.json` do pacote, não de um número escrito no código.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp, lerVersao, VERSAO } from '../lib/app.mjs';

const raiz = mkdtempSync(join(tmpdir(), 'sala-versao-'));
after(() => rmSync(raiz, { recursive: true, force: true }));
const manifestoDoPacote = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude-plugin', 'plugin.json');

test('/api/saude informa a versão do plugin.json do pacote', async () => {
  const versao = JSON.parse(readFileSync(manifestoDoPacote, 'utf8')).version;
  assert.match(versao, /^\d+\.\d+\.\d+/);
  const casa = join(raiz, 'casa');
  mkdirSync(join(casa, '.intoca'), { recursive: true });
  const app = criarApp({ env: {}, casa, escutando: async () => false, sondaAnimada: async () => false, pastaDoProjeto: raiz });
  assert.equal(VERSAO, versao);
  assert.equal((await app.saude()).versao, versao);
});

test('lerVersao: lê o arquivo dado; sem arquivo, JSON ruim ou versão que não é número, cai na reserva', () => {
  const ok = join(raiz, 'ok.json');
  writeFileSync(ok, JSON.stringify({ version: '9.8.7' }));
  assert.equal(lerVersao(ok), '9.8.7');
  const reserva = lerVersao(join(raiz, 'nao-existe.json'));
  assert.match(reserva, /^\d+\.\d+\.\d+$/);
  const ruim = join(raiz, 'ruim.json');
  writeFileSync(ruim, '{ nao e json');
  assert.equal(lerVersao(ruim), reserva);
  const semVersao = join(raiz, 'sem.json');
  writeFileSync(semVersao, JSON.stringify({ version: 12 }));
  assert.equal(lerVersao(semVersao), reserva);
});
