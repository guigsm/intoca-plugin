import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { criarProcessos, matarArvore, pidsDoLsof, pidsDoNetstat, pidsDoSs } from '../lib/processos.mjs';

const NETSTAT_EN = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:80             0.0.0.0:0              LISTENING       4
  TCP    127.0.0.1:8765         0.0.0.0:0              LISTENING       1111
  TCP    [::1]:8765             [::]:0                 LISTENING       1111
  TCP    127.0.0.1:50000        127.0.0.1:8765         ESTABLISHED     2222
  TCP    0.0.0.0:3003           0.0.0.0:0              LISTENING       0
`;
const NETSTAT_PT = `
  TCP    127.0.0.1:5180         0.0.0.0:0              ESCUTANDO       3333
  UDP    0.0.0.0:5180           *:*                                    4444
`;

test('pidsDoNetstat: só quem escuta a porta, sem depender do idioma, ignora PID 0 e conexões', () => {
  assert.deepEqual(pidsDoNetstat(NETSTAT_EN, 8765), [1111]);
  assert.deepEqual(pidsDoNetstat(NETSTAT_EN, 80), [4]);
  assert.deepEqual(pidsDoNetstat(NETSTAT_EN, 3003), []);
  assert.deepEqual(pidsDoNetstat(NETSTAT_PT, 5180), [3333]);
  assert.deepEqual(pidsDoNetstat('', 80), []);
});

test('pidsDoLsof e pidsDoSs', () => {
  assert.deepEqual(pidsDoLsof('123\n456\n123\n'), [123, 456]);
  assert.deepEqual(pidsDoSs('LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=777,fd=20))\nLISTEN 0 4 0.0.0.0:99 0.0.0.0:* users:(("x",pid=1,fd=3))', 3000), [777]);
});

function filhoFalso() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test('iniciar/pararFilho: guarda o PID, não reinicia o que está vivo, e só mata o filho', async () => {
  const chamadas = [];
  const mortos = [];
  const child = filhoFalso();
  const p = criarProcessos({
    sistema: 'linux',
    spawnFn: (cmd, args, opts) => {
      chamadas.push({ cmd, args, opts });
      return child;
    },
    matar: async (pid) => mortos.push(pid),
    agora: () => 1000,
  });
  const item = { name: 'x', command: ['node', 'a.mjs'], dir: '/d', cwd: '/d/sub' };
  const e = p.iniciar(item, { PORT: '1' });
  assert.equal(e.pid, 4242);
  assert.equal(e.startedAt, 1000);
  assert.equal(chamadas[0].opts.cwd, '/d/sub');
  assert.equal(chamadas[0].opts.detached, true);
  assert.equal(chamadas[0].opts.shell, true);
  assert.equal(p.vivo('x'), true);
  p.iniciar(item, {});
  assert.equal(chamadas.length, 1);

  child.stdout.emit('data', Buffer.from('\x1b[32mLocal: http://localhost:5173\x1b[0m\nsegunda\n'));
  assert.deepEqual(p.log('x').slice(1), ['Local: http://localhost:5173', 'segunda']);

  assert.equal(await p.pararFilho('x'), true);
  assert.deepEqual(mortos, [4242]);
  assert.equal(await p.pararFilho('outro'), false);

  child.exitCode = 0;
  assert.equal(p.vivo('x'), false);
  assert.equal(await p.pararFilho('x'), false);
  assert.deepEqual(mortos, [4242]);
});

test('Windows: o filho não nasce detached (a reserva do sistema cuida da árvore)', () => {
  let opts;
  const p = criarProcessos({ sistema: 'win32', spawnFn: (c, a, o) => ((opts = o), filhoFalso()), matar: async () => {} });
  p.iniciar({ name: 'w', command: ['x'], dir: 'd' }, {});
  assert.equal(opts.detached, false);
});

test('pararExterno: mata quem escuta, mas nunca o próprio servidor', async () => {
  const mortos = [];
  const p = criarProcessos({ matar: async (pid) => mortos.push(pid) });
  const n = await p.pararExterno(8765, { pids: async () => [10, 11, 99], proprio: 99 });
  assert.equal(n, 2);
  assert.deepEqual(mortos, [10, 11]);
});

test('log guarda no máximo 200 linhas', () => {
  const child = filhoFalso();
  const p = criarProcessos({ spawnFn: () => child, matar: async () => {} });
  p.iniciar({ name: 'l', command: ['x'], dir: 'd' }, {});
  child.stdout.emit('data', Buffer.from(Array.from({ length: 500 }, (_, i) => `linha ${i}`).join('\n')));
  assert.equal(p.log('l').length, 200);
  assert.equal(p.log('l').at(-1), 'linha 499');
});

test('matarArvore: pid inexistente não lança', async () => {
  await matarArvore(2 ** 22 + 12345, process.platform === 'win32' ? 'linux' : process.platform);
});
