import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarApp, logPortOf, nomeDeMim } from '../lib/app.mjs';
import { arquivoDeEstado, lerEstado } from '../lib/estado.mjs';

const raiz = mkdtempSync(join(tmpdir(), 'sala-app-'));
const casa = join(raiz, 'casa');
const sede = join(raiz, 'sede');
const alfa = join(sede, 'alfa');
const plugin = join(sede, 'plugin');
mkdirSync(join(casa, '.intoca'), { recursive: true });
mkdirSync(join(sede, 'diretoria'), { recursive: true });
mkdirSync(join(alfa, '.claude'), { recursive: true });
mkdirSync(join(plugin, 'ops'), { recursive: true });
mkdirSync(join(plugin, 'intoca-sala', 'sala', 'lib'), { recursive: true });
writeFileSync(join(alfa, '.env'), 'PORT=4555\nSEGREDO=nao-aparece');
writeFileSync(join(alfa, '.claude', 'launch.json'), JSON.stringify({ configurations: [{ runtimeExecutable: 'node', runtimeArgs: ['dev.mjs'], port: 3000 }] }));
writeFileSync(join(sede, 'diretoria', 'fila.md'), '## Esperando o proprietário\n| # | Tipo | Pedido | Onde responder | Estado |\n|--|--|--|--|--|\n| 1 | pode | Aprovar X | Diretoria | aberto |\n');
writeFileSync(join(plugin, 'ops', 'fila.md'), '## Esperando o proprietário\n| # | Pedido | Estado |\n|--|--|--|\n| 1 | feito já | feito 2026-11-01 |\n');
writeFileSync(join(sede, 'sede.yaml'), `projetos:
  - nome: alfa
    tipo: site
    status: ativo
    pasta_atual: '${alfa.replace(/\\/g, '\\\\')}'
  - nome: intoca
    tipo: ferramenta
    status: ativo
    pasta_atual: '${plugin.replace(/\\/g, '\\\\')}'
    porta_dev: 80
ferramentas:
  - nome: Animada
    pasta: '${sede.replace(/\\/g, '\\\\')}'
    porta: 8765
    membro_de: intoca
    suite: operacao
  - nome: Com Comando
    pasta: '${sede.replace(/\\/g, '\\\\')}'
    porta: 9100
    command: [node, x.mjs]
    env: {CHAVE: valor}
suite:
  nome: Suíte
  regra: R
  frentes:
    operacao: {nome: Operação, membros: [intoca], ferramentas: [Animada]}
`);
writeFileSync(join(casa, '.intoca', 'sede'), `${sede}\n`);

// processos e sondas de mentira: nada sobe de verdade
const chamadas = { iniciar: [], pararFilho: [], pararExterno: [] };
const abertas = new Set();
let filhoVivo = false;
const processos = {
  entrada: () => undefined,
  vivo: () => filhoVivo,
  log: () => ['[sala] linha'],
  iniciar: (item, ambiente) => chamadas.iniciar.push({ item, ambiente }),
  pararFilho: async (n) => (chamadas.pararFilho.push(n), filhoVivo),
  pararExterno: async (p) => (chamadas.pararExterno.push(p), 1),
};
let animadaNoAr = false;
const app = criarApp({
  env: {},
  casa,
  processos,
  escutando: async (p) => abertas.has(p),
  sondaAnimada: async () => animadaNoAr,
  pastaDoProjeto: plugin,
  agora: () => Date.now(),
});

let servidor;
let porta;
before(async () => {
  servidor = createServer((req, res) => app.handle(req, res));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  porta = servidor.address().port;
});
after(async () => {
  await new Promise((r) => servidor.close(r));
  rmSync(raiz, { recursive: true, force: true });
});

function chamar(metodo, caminho, { cabecalhos = {}, corpo, host } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: porta, path: caminho, method: metodo, headers: { Host: host ?? `localhost:${porta}`, ...cabecalhos } },
      (res) => {
        let t = '';
        res.on('data', (c) => (t += c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(t); } catch { /* html */ }
          resolve({ status: res.statusCode, json, texto: t });
        });
      },
    );
    req.on('error', reject);
    if (corpo !== undefined) req.write(JSON.stringify(corpo));
    req.end();
  });
}
const acao = (metodo, caminho, corpo) => chamar(metodo, caminho, { cabecalhos: { 'X-Painel': '1', 'Content-Type': 'application/json' }, corpo });
const ligarControle = (v) => writeFileSync(arquivoDeEstado(casa), JSON.stringify({ controle: v }));

test('host que não é localhost é barrado (DNS rebinding)', async () => {
  const r = await chamar('GET', '/api/saude', { host: 'evil.example.com' });
  assert.equal(r.status, 403);
});

test('GET / entrega a página com o título "Tocas"', async () => {
  const r = await chamar('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.texto, /<h1>Tocas<\/h1>/);
});

test('/api/tocas: a sala não tem cartão de si mesma; a Animada aparece como anexa solta da frente', async () => {
  const r = await chamar('GET', '/api/tocas');
  assert.equal(r.status, 200);
  assert.equal(r.json.sede, true);
  const nomes = r.json.lista.map((s) => s.name);
  assert.deepEqual(nomes.sort(), ['Animada', 'Com Comando', 'alfa'].sort());
  const op = r.json.grupos.find((g) => g.id === 'operacao');
  assert.deepEqual(op.itens.map((i) => i.toca.name), ['Animada']);
  const alfaCard = r.json.lista.find((s) => s.name === 'alfa');
  assert.equal(alfaCard.port, 4555);
  assert.equal(alfaCard.canStart, true);
  assert.equal(JSON.stringify(r.json).includes('nao-aparece'), false);
});

test('/api/sites e /api/suite continuam (compatibilidade)', async () => {
  const sites = await chamar('GET', '/api/sites');
  assert.equal(Array.isArray(sites.json), true);
  assert.equal(sites.json.length, 3);
  const suite = await chamar('GET', '/api/suite');
  assert.equal(suite.json.frentes[0].id, 'operacao');
});

test('/api/pendencias: sede e projetos com a seção', async () => {
  const r = await chamar('GET', '/api/pendencias');
  assert.equal(r.json.total, 1);
  assert.deepEqual(r.json.fontes.map((f) => f.origem), ['sede', 'intoca']);
  assert.equal(r.json.fontes[0].abertas[0].pedido, 'Aprovar X');
  assert.deepEqual(r.json.ausentes, ['alfa']);
});

test('/api/saude: controle desligado por padrão, Animada não registrada, falta no manifesto', async () => {
  const r = await chamar('GET', '/api/saude');
  assert.equal(r.json.controle, false);
  assert.deepEqual({ registrada: r.json.animada.registrada, porta: r.json.animada.porta, no_ar: r.json.animada.no_ar }, { registrada: false, porta: null, no_ar: false });
  assert.equal(r.json.animada.instalada, true, 'o manifesto desta sede de teste tem a Animada com pasta existente');
  assert.equal(r.json.animada.auto, false);
  assert.equal(r.json.animada.pode_instalar, false);
  assert.equal(r.json.sede.achada, true);
  assert.equal(r.json.sede.origem, 'ponteiro');
  assert.deepEqual(r.json.faltaNoManifesto, [{ ferramenta: 'Animada', campos: ['command'] }]);
});

test('/api/saude: Animada registrada em sala.json e respondendo; depois cai', async () => {
  writeFileSync(arquivoDeEstado(casa), JSON.stringify({ animada: { porta: 8765 }, controle: false }));
  animadaNoAr = true;
  let r = await chamar('GET', '/api/saude');
  assert.deepEqual({ registrada: r.json.animada.registrada, porta: r.json.animada.porta, no_ar: r.json.animada.no_ar }, { registrada: true, porta: 8765, no_ar: true });
  assert.equal(lerEstado(casa).animada.porta, 8765);
});

test('controle desligado: Iniciar e Parar devolvem 403 com texto claro, mesmo com o cabeçalho', async () => {
  ligarControle(false);
  for (const a of ['start', 'stop']) {
    const r = await acao('POST', `/api/sites/alfa/${a}`);
    assert.equal(r.status, 403);
    assert.equal(r.json.controle, false);
    assert.match(r.json.error, /controle está desligado/);
  }
  assert.equal(chamadas.iniciar.length, 0);
  // sem o arquivo, também desligado
  rmSync(arquivoDeEstado(casa));
  assert.equal((await acao('POST', '/api/sites/alfa/start')).status, 403);
});

test('controle ligado: ação sem o cabeçalho X-Painel continua barrada', async () => {
  ligarControle(true);
  const r = await chamar('POST', '/api/sites/alfa/start');
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'ação não permitida');
});

test('start: porta em uso 409, ferramenta sem command 400, projeto ok entrega PORT', async () => {
  ligarControle(true);
  abertas.add(4555);
  assert.equal((await acao('POST', '/api/sites/alfa/start')).status, 409);
  abertas.delete(4555);

  const sem = await acao('POST', '/api/sites/Animada/start');
  assert.equal(sem.status, 400);
  assert.match(sem.json.error, /manifesto/);

  const ok = await acao('POST', '/api/sites/alfa/start');
  assert.equal(ok.status, 200);
  assert.equal(chamadas.iniciar.at(-1).item.name, 'alfa');
  assert.equal(chamadas.iniciar.at(-1).ambiente.PORT, '4555');

  await acao('POST', '/api/sites/Com%20Comando/start');
  const amb = chamadas.iniciar.at(-1).ambiente;
  assert.equal(amb.CHAVE, 'valor');
  assert.equal(amb.PORT, undefined); // ferramenta não recebe PORT
  assert.equal((await acao('POST', '/api/sites/nao-existe/start')).status, 404);
});

test('stop: filho nosso para sem confirmar; externo exige confirm:true no corpo, validado no servidor', async () => {
  ligarControle(true);
  filhoVivo = true;
  assert.equal((await acao('POST', '/api/sites/alfa/stop')).status, 200);
  assert.deepEqual(chamadas.pararFilho.at(-1), 'alfa');
  assert.equal(chamadas.pararExterno.length, 0);

  filhoVivo = false;
  abertas.add(4555);
  const sem = await acao('POST', '/api/sites/alfa/stop');
  assert.equal(sem.status, 409);
  assert.equal(sem.json.precisaConfirmar, true);
  const falso = await acao('POST', '/api/sites/alfa/stop', { confirm: 'true' });
  assert.equal(falso.status, 409);
  assert.equal(chamadas.pararExterno.length, 0);
  const com = await acao('POST', '/api/sites/alfa/stop', { confirm: true });
  assert.equal(com.status, 200);
  assert.deepEqual(chamadas.pararExterno, [4555]);

  abertas.clear();
  const nada = await acao('POST', '/api/sites/alfa/stop');
  assert.equal(nada.json.nada, true);
});

test('stop de porta só do manifesto (porta_dev) é recusado', async () => {
  // o projeto 'intoca' é a própria sala e fica fora; testa com um projeto só com porta_dev
  const dir = join(sede, 'beta');
  mkdirSync(dir);
  const yaml = join(sede, 'sede.yaml');
  const antes = (await import('node:fs')).readFileSync(yaml, 'utf8');
  writeFileSync(yaml, antes.replace('ferramentas:', `  - nome: beta\n    status: ativo\n    pasta_atual: '${dir.replace(/\\/g, '\\\\')}'\n    porta_dev: 7777\nferramentas:`));
  ligarControle(true);
  const r = await acao('POST', '/api/sites/beta/stop');
  assert.equal(r.status, 400);
  assert.match(r.json.error, /só do manifesto/);
  writeFileSync(yaml, antes);
});

test('log devolve as linhas do processo', async () => {
  const r = await chamar('GET', '/api/sites/alfa/log');
  assert.deepEqual(r.json.lines, ['[sala] linha']);
});

test('rota desconhecida 404; sem sede achada as listas vêm vazias, sem erro', async () => {
  assert.equal((await chamar('GET', '/api/nada')).status, 404);
  const vazia = criarApp({ env: {}, casa: join(raiz, 'outra-casa'), processos, escutando: async () => false, sondaAnimada: async () => false });
  const s = createServer((req, res) => vazia.handle(req, res));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  const lido = await new Promise((resolve) => {
    request({ host: '127.0.0.1', port: p, path: '/api/tocas', headers: { Host: `localhost:${p}` } }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve(JSON.parse(t)));
    }).end();
  });
  assert.equal(lido.sede, false);
  assert.deepEqual(lido.grupos, []);
  await new Promise((r) => s.close(r));
});

test('logPortOf e nomeDeMim', () => {
  assert.equal(logPortOf(['x', '  Local:   http://localhost:5174/', 'y']), 5174);
  assert.equal(logPortOf(['nada']), undefined);
  assert.equal(nomeDeMim([{ nome: 'a', pasta_atual: '/x/a' }, { nome: 'intoca', pasta_atual: '/y' }], '/x/a/'), 'a');
  assert.equal(nomeDeMim([{ nome: 'intoca', pasta_atual: '/y' }], '/outra'), 'intoca');
  assert.equal(nomeDeMim([{ nome: 'z', pasta_atual: '/y' }], '/outra'), undefined);
});
