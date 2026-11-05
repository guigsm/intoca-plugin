import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarApp } from '../lib/app.mjs';
import { linkVsCode, pastaDoSite, urlProducao } from '../lib/descoberta.mjs';
import { resolver, segmentosSeguros } from '../lib/estatico.mjs';

const raiz = mkdtempSync(join(tmpdir(), 'sala-est-'));
const casa = join(raiz, 'casa');
const sede = join(raiz, 'sede');
const padaria = join(sede, 'padaria');
const site = join(padaria, 'site');
const fora = join(raiz, 'fora');
mkdirSync(join(casa, '.intoca'), { recursive: true });
mkdirSync(join(site, 'boletins'), { recursive: true });
mkdirSync(join(site, '.git'), { recursive: true });
mkdirSync(join(site, 'vazia'), { recursive: true });
mkdirSync(fora, { recursive: true });
writeFileSync(join(site, 'index.html'), '<h1>PAD</h1>');
writeFileSync(join(site, 'boletins', 'index.html'), '<h1>Boletins</h1>');
writeFileSync(join(site, 'boletins', 'b1.html'), '<p>b1</p>');
writeFileSync(join(site, 'app.js'), 'x');
writeFileSync(join(site, 'dados.bin'), 'x');
writeFileSync(join(site, '.env'), 'SEGREDO=1');
writeFileSync(join(site, '.git', 'config'), 'SEGREDO=2');
writeFileSync(join(site, 'grande.txt'), 'x'.repeat(200));
writeFileSync(join(padaria, 'segredo-do-projeto.txt'), 'fora da pasta servida');
writeFileSync(join(fora, 'alheio.txt'), 'de fora');
let ligacaoOk = true;
try {
  symlinkSync(fora, join(site, 'junção'), 'junction');
  symlinkSync(join(site, '.git'), join(site, 'atalho-oculto'), 'junction');
} catch {
  ligacaoOk = false;
}
const y = (p) => p.replace(/\\/g, '\\\\');
writeFileSync(
  join(sede, 'sede.yaml'),
  `projetos:
  - nome: padaria-do-amigo
    tipo: site
    status: ativo
    pasta_atual: '${y(padaria)}'
    site: site
    url_producao: https://padariadoamigo.exemplo.com.br/
  - nome: sem-site
    tipo: site
    status: ativo
    pasta_atual: '${y(fora)}'
    url_producao: http://inseguro.example/
  - nome: absoluto
    tipo: site
    status: ativo
    pasta_atual: '${y(fora)}'
    site: '${y(site)}'
  - nome: sumido
    tipo: site
    status: ativo
    pasta_atual: '${y(fora)}'
    site: nao-existe
`,
);
writeFileSync(join(casa, '.intoca', 'sede'), `${sede}\n`);
// controle LIGADO de propósito: a barreira contra a página servida não pode depender dele estar desligado.
writeFileSync(join(casa, '.intoca', 'sala.json'), JSON.stringify({ controle: true }));

const processos = {
  entrada: () => undefined, vivo: () => false, log: () => [],
  iniciar: () => { throw new Error('não devia iniciar'); },
  pararFilho: async () => false, pararExterno: async () => 0,
};
const app = criarApp({ env: {}, casa, processos, escutando: async () => false, sondaAnimada: async () => false, pastaDoProjeto: join(raiz, 'x') });
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

function chamar(metodo, caminho, { cabecalhos = {}, corpo } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, headers: { host: `localhost:${porta}`, ...cabecalhos } }, (res) => {
      let texto = '';
      res.on('data', (c) => (texto += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, texto }));
    });
    req.on('error', reject);
    req.end(corpo);
  });
}
const get = (c, o) => chamar('GET', c, o);

test('campos do manifesto: site relativo e absoluto, produção só https, pasta inexistente ignorada', () => {
  assert.equal(pastaDoSite(padaria, { site: 'site' }), site);
  assert.equal(pastaDoSite(fora, { site: site }), site);
  assert.equal(pastaDoSite(padaria, { site: 'nao-existe' }), undefined);
  assert.equal(pastaDoSite(padaria, {}), undefined);
  assert.equal(urlProducao({ url_producao: 'https://a.com.br/' }), 'https://a.com.br/');
  assert.equal(urlProducao({ url_producao: 'http://a.com.br/' }), undefined);
  assert.equal(urlProducao({ url_producao: 'javascript:alert(1)' }), undefined);
  assert.equal(urlProducao({ url_producao: 'https://a.com/" onclick="x' }), undefined);
});

test('link do VS Code: barras normais e trechos codificados', () => {
  assert.equal(linkVsCode('C:\\intoca\\a b\\c#d'), 'vscode://file/C:/intoca/a%20b/c%23d');
  assert.equal(linkVsCode('/home/u/p'), 'vscode://file/home/u/p');
});

test('segmentos: recusa ponto-ponto, codificado, barra invertida, oculto, dois-pontos e byte nulo', () => {
  for (const ruim of ['/../x', '/%2e%2e/x', '/%2E%2e/x', '/a/..%2fb', '/a%5Cb', '/.env', '/%2eenv', '/.git/config', '/C:/x', '/a%00b', '//x', '/%zz']) {
    assert.equal(segmentosSeguros(ruim), null, ruim);
  }
  assert.deepEqual(segmentosSeguros('/'), []);
  assert.deepEqual(segmentosSeguros('/boletins/'), ['boletins']);
  assert.deepEqual(segmentosSeguros('/boletins/b1.html'), ['boletins', 'b1.html']);
});

test('serve index, subpasta e arquivo, com tipo certo e cabeçalhos de segurança', async () => {
  const raizRes = await get('/toca/padaria-do-amigo/');
  assert.equal(raizRes.status, 200);
  assert.equal(raizRes.texto, '<h1>PAD</h1>');
  assert.match(raizRes.headers['content-type'], /^text\/html/);
  assert.equal(raizRes.headers['content-security-policy'], 'sandbox allow-scripts allow-forms allow-popups');
  assert.equal(raizRes.headers['x-content-type-options'], 'nosniff');
  assert.equal((await get('/toca/padaria-do-amigo/boletins/')).texto, '<h1>Boletins</h1>');
  assert.equal((await get('/toca/padaria-do-amigo/boletins')).texto, '<h1>Boletins</h1>');
  assert.match((await get('/toca/padaria-do-amigo/app.js')).headers['content-type'], /javascript/);
  assert.equal((await get('/toca/padaria-do-amigo/dados.bin')).headers['content-type'], 'application/octet-stream');
  assert.equal((await get('/toca/absoluto/')).status, 200);
  const sem = await get('/toca/padaria-do-amigo');
  assert.equal(sem.status, 301);
  assert.equal(sem.headers.location, '/toca/padaria-do-amigo/');
});

test('HEAD devolve cabeçalhos sem corpo', async () => {
  const r = await chamar('HEAD', '/toca/padaria-do-amigo/');
  assert.equal(r.status, 200);
  assert.equal(r.texto, '');
  assert.equal(r.headers['content-length'], '12');
});

test('pasta sem index.html não lista: 404', async () => {
  assert.equal((await get('/toca/padaria-do-amigo/vazia/')).status, 404);
});

test('traversal: .., %2e%2e, barra invertida e caminho absoluto não saem da pasta', async () => {
  for (const caminho of [
    '/toca/padaria-do-amigo/../segredo-do-projeto.txt',
    '/toca/padaria-do-amigo/%2e%2e/segredo-do-projeto.txt',
    '/toca/padaria-do-amigo/%2e%2e%2fsegredo-do-projeto.txt',
    '/toca/padaria-do-amigo/..%2fsegredo-do-projeto.txt',
    '/toca/padaria-do-amigo/boletins/..%5c..%5csegredo-do-projeto.txt',
    '/toca/padaria-do-amigo/%252e%252e/segredo-do-projeto.txt',
    '/toca/padaria-do-amigo//etc/passwd',
    `/toca/padaria-do-amigo/${encodeURIComponent(join(fora, 'alheio.txt'))}`,
    '/toca/padaria-do-amigo/C:/Windows/win.ini',
  ]) {
    const r = await get(caminho);
    assert.ok(r.status >= 400, `${caminho} devolveu ${r.status}`);
    assert.ok(!r.texto.includes('fora da pasta') && !r.texto.includes('de fora'), caminho);
  }
});

test('arquivos ocultos: .env e .git são recusados', async () => {
  for (const c of ['/toca/padaria-do-amigo/.env', '/toca/padaria-do-amigo/%2eenv', '/toca/padaria-do-amigo/.git/config', '/toca/padaria-do-amigo/.git/']) {
    const r = await get(c);
    assert.ok(r.status >= 400, c);
    assert.ok(!r.texto.includes('SEGREDO'), c);
  }
});

test('junção e link simbólico que saem da pasta (ou entram em oculto) são recusados', { skip: !ligacaoOk && 'sem permissão para criar junção' }, async () => {
  const a = await get(`/toca/padaria-do-amigo/${encodeURIComponent('junção')}/alheio.txt`);
  assert.equal(a.status, 404);
  assert.ok(!a.texto.includes('de fora'));
  const b = await get('/toca/padaria-do-amigo/atalho-oculto/config');
  assert.equal(b.status, 404);
  assert.ok(!b.texto.includes('SEGREDO'));
});

test('só GET e HEAD: POST, PUT, DELETE devolvem 405', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal((await chamar(m, '/toca/padaria-do-amigo/')).status, 405, m);
});

test('arquivo acima do limite devolve 413', () => {
  const r = resolver({ raiz: site, pedido: '/grande.txt', limite: 100 });
  assert.equal(r.status, 413);
  assert.equal(resolver({ raiz: site, pedido: '/grande.txt', limite: 1000 }).status, 200);
});

test('Toca sem site: ou com pasta inexistente não serve nada', async () => {
  assert.equal((await get('/toca/sem-site/')).status, 404);
  assert.equal((await get('/toca/sumido/')).status, 404);
  assert.equal((await get('/toca/nao-existe/')).status, 404);
});

test('/api/tocas expõe estatico, producao e vscode; só https; VS Code para toda Toca', async () => {
  const lista = JSON.parse((await get('/api/tocas')).texto).lista;
  const j = lista.find((s) => s.name === 'padaria-do-amigo');
  assert.equal(j.estatico, '/toca/padaria-do-amigo/');
  assert.equal(j.producao, 'https://padariadoamigo.exemplo.com.br/');
  assert.match(j.vscode, /^vscode:\/\/file\//);
  assert.ok(!j.vscode.includes('\\'));
  const s = lista.find((x) => x.name === 'sem-site');
  assert.equal(s.estatico, undefined);
  assert.equal(s.producao, undefined); // http:// é recusado
  assert.match(s.vscode, /^vscode:\/\/file\//);
  assert.equal(lista.find((x) => x.name === 'sumido').estatico, undefined);
});

test('a página servida não controla a Clássica: origem opaca/estrangeira e Sec-Fetch-Site são barrados mesmo com X-Painel e controle ligado', async () => {
  const base = { 'x-painel': '1', 'content-type': 'application/json' };
  for (const extra of [{ origin: 'null' }, { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
    for (const acao of ['start', 'stop']) {
      const r = await chamar('POST', `/api/sites/padaria-do-amigo/${acao}`, { cabecalhos: { ...base, ...extra }, corpo: '{}' });
      assert.equal(r.status, 403, `${acao} ${JSON.stringify(extra)}`);
      assert.match(r.texto, /origem não permitida/);
    }
  }
  // sem origem estrangeira o pedido chega às regras de sempre (aqui: recusa por outro motivo que não a origem)
  const ok = await chamar('POST', '/api/sites/padaria-do-amigo/stop', { cabecalhos: { ...base, origin: `http://localhost:${porta}`, 'sec-fetch-site': 'same-origin' }, corpo: '{}' });
  assert.equal(ok.status, 200);
});
