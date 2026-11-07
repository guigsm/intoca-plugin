import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarApp } from '../lib/app.mjs';
import { linkVsCode, pastaDoSite, urlProducao } from '../lib/descoberta.mjs';
import { hostDoSite, mapaDeSites, portaDoHost, resolver, rotuloDe, rotuloServido, segmentosSeguros, urlDoSite } from '../lib/estatico.mjs';

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
  - nome: 'Dup A'
    tipo: site
    status: ativo
    pasta_atual: '${y(fora)}'
    site: '${y(site)}'
  - nome: dup-a
    tipo: site
    status: ativo
    pasta_atual: '${y(fora)}'
    site: '${y(site)}'
  - nome: '@@@'
    tipo: site
    status: ativo
    pasta_atual: '${y(fora)}'
    site: '${y(site)}'
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
// Fala com o site de uma Toca: o servidor é alcançado por 127.0.0.1 e o `Host` é escrito à mão (sem depender de DNS).
const hostDe = (rotulo) => `${rotulo}.toca.localhost:${porta}`;
const noSite = (metodo, caminho, { rotulo = 'padaria-do-amigo', cabecalhos = {}, ...o } = {}) =>
  chamar(metodo, caminho, { ...o, cabecalhos: { host: hostDe(rotulo), ...cabecalhos } });
const getSite = (c, o) => noSite('GET', c, o);

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

test('rótulo: minúsculas, símbolos viram hífen, pontas saem, nome só de símbolos fica vazio', () => {
  assert.equal(rotuloDe('Padaria do Amigo'), 'padaria-do-amigo');
  assert.equal(rotuloDe('padaria-do-amigo.com.br'), 'padaria-do-amigo.com.br');
  assert.equal(rotuloDe('..a..'), 'a');
  assert.equal(rotuloDe('--a b__c--'), 'a-b-c');
  assert.equal(rotuloDe('@@@'), '');
  assert.equal(rotuloDe(undefined), '');
});

test('Host do site: só <rótulo>.toca.localhost com porta opcional', () => {
  assert.deepEqual(hostDoSite('padaria.toca.localhost:8090'), { rotulo: 'padaria' });
  assert.deepEqual(hostDoSite('Padaria-do-Amigo.com.br.TOCA.localhost'), { rotulo: 'padaria-do-amigo.com.br' });
  for (const ruim of ['localhost:80', 'toca.localhost', '.toca.localhost', 'x.toca.localhost.evil.example', 'x.toca.localhost:80@evil.example', 'evil.example.com', undefined]) {
    assert.equal(hostDoSite(ruim), null, String(ruim));
  }
  assert.equal(portaDoHost('localhost:8090'), '8090');
  assert.equal(portaDoHost('localhost'), '');
  assert.equal(portaDoHost('localhost:80'), '');
  assert.equal(urlDoSite('x', '8090'), 'http://x.toca.localhost:8090/');
  assert.equal(urlDoSite('x', ''), 'http://x.toca.localhost/');
});

test('dois nomes com o mesmo rótulo: nenhum é servido; nome sem rótulo também não', async () => {
  const itens = [
    { name: 'Dup A', siteDir: site },
    { name: 'dup-a', siteDir: site },
    { name: 'único', siteDir: site },
    { name: '@@@', siteDir: site },
    { name: 'sem-site' },
  ];
  const mapa = mapaDeSites(itens);
  assert.deepEqual([...mapa.servidos.keys()], ['nico']);
  assert.deepEqual([...mapa.ambiguos], ['dup-a']);
  assert.equal(rotuloServido(mapa, itens[0]), undefined);
  assert.equal(rotuloServido(mapa, itens[2]), 'nico');
  assert.equal(rotuloServido(mapa, itens[3]), undefined);
  assert.equal(rotuloServido(mapa, itens[4]), undefined);
  // pela sala inteira: o endereço das duas diz o motivo e o campo estatico some
  const r = await getSite('/', { rotulo: 'dup-a' });
  assert.equal(r.status, 404);
  assert.match(r.texto, /mesmo rótulo/);
  const lista = JSON.parse((await get('/api/tocas')).texto).lista;
  assert.equal(lista.find((x) => x.name === 'Dup A').estatico, undefined);
  assert.equal(lista.find((x) => x.name === 'dup-a').estatico, undefined);
  assert.equal(lista.find((x) => x.name === '@@@').estatico, undefined);
  assert.equal((await get('/toca/dup-a/')).status, 404);
});

test('na origem do site: raiz, subpasta com barra, arquivo, tipo certo e nada de CSP', async () => {
  const raizRes = await getSite('/');
  assert.equal(raizRes.status, 200);
  assert.equal(raizRes.texto, '<h1>PAD</h1>');
  assert.match(raizRes.headers['content-type'], /^text\/html/);
  assert.equal(raizRes.headers['content-security-policy'], undefined);
  assert.equal(raizRes.headers['x-content-type-options'], 'nosniff');
  assert.equal(raizRes.headers['referrer-policy'], 'no-referrer');
  assert.equal(raizRes.headers['cache-control'], 'no-store');
  assert.equal((await getSite('/boletins/')).texto, '<h1>Boletins</h1>');
  assert.equal((await getSite('/boletins/?x=1')).status, 200);
  assert.equal((await getSite('/boletins/b1.html')).texto, '<p>b1</p>');
  const js = await getSite('/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /^text\/javascript/);
  assert.equal((await getSite('/dados.bin')).headers['content-type'], 'application/octet-stream');
  assert.equal((await getSite('/', { rotulo: 'absoluto' })).status, 200);
  // a porta do Host é aceita e ignorada
  assert.equal((await getSite('/', { cabecalhos: { host: 'padaria-do-amigo.toca.localhost' } })).status, 200);
  assert.equal((await getSite('/', { cabecalhos: { host: 'PADARIA-do-amigo.toca.localhost:9' } })).status, 200);
});

test('pasta sem barra final: 301 para a forma com barra, com a query; arquivo segue 200; pasta sem index dá 404 com barra', async () => {
  const a = await getSite('/boletins');
  assert.equal(a.status, 301);
  assert.equal(a.headers.location, '/boletins/');
  assert.equal(a.headers['content-security-policy'], undefined);
  const b = await getSite('/boletins?x=1');
  assert.equal(b.status, 301);
  assert.equal(b.headers.location, '/boletins/?x=1');
  assert.equal((await getSite('/boletins/?x=1')).status, 200);
  const v = await getSite('/vazia');
  assert.equal(v.status, 301);
  assert.equal(v.headers.location, '/vazia/');
  assert.equal((await getSite('/vazia/')).status, 404);
  assert.equal((await getSite('/boletins/b1.html')).status, 200);
  assert.equal((await chamar('HEAD', '/boletins', { cabecalhos: { host: hostDe('padaria-do-amigo') } })).status, 301);
});

test('HEAD devolve cabeçalhos sem corpo', async () => {
  const r = await noSite('HEAD', '/');
  assert.equal(r.status, 200);
  assert.equal(r.texto, '');
  assert.equal(r.headers['content-length'], '12');
});

test('na origem do site não existe a sala: /api e o painel são do site (404), não da sala', async () => {
  for (const c of ['/api/saude', '/api/tocas', '/api/sites', '/api/pendencias', '/toca/padaria-do-amigo/']) {
    const r = await getSite(c);
    assert.equal(r.status, 404, c);
    assert.ok(!r.texto.includes('"versao"') && !r.texto.includes('"lista"'), c);
  }
  const acao = await noSite('POST', '/api/sites/padaria-do-amigo/start', { cabecalhos: { 'x-painel': '1', 'content-type': 'application/json' }, corpo: '{}' });
  assert.equal(acao.status, 405);
  // rótulo desconhecido: 404 com texto
  const r = await getSite('/', { rotulo: 'ninguem' });
  assert.equal(r.status, 404);
  assert.match(r.texto, /Nenhuma Toca/);
  assert.equal((await getSite('/', { rotulo: 'sem-site' })).status, 404);
});

test('pasta sem index.html não lista: 404', async () => {
  assert.equal((await getSite('/vazia/')).status, 404);
});

test('traversal: .., %2e%2e, barra invertida e caminho absoluto não saem da pasta', async () => {
  for (const caminho of [
    '/../segredo-do-projeto.txt',
    '/%2e%2e/segredo-do-projeto.txt',
    '/%2e%2e%2fsegredo-do-projeto.txt',
    '/..%2fsegredo-do-projeto.txt',
    '/boletins/..%5c..%5csegredo-do-projeto.txt',
    '/%252e%252e/segredo-do-projeto.txt',
    '//etc/passwd',
    `/${encodeURIComponent(join(fora, 'alheio.txt'))}`,
    '/C:/Windows/win.ini',
  ]) {
    const r = await getSite(caminho);
    assert.ok(r.status >= 400, `${caminho} devolveu ${r.status}`);
    assert.ok(!r.texto.includes('fora da pasta') && !r.texto.includes('de fora'), caminho);
  }
});

test('arquivos ocultos: .env e .git são recusados', async () => {
  for (const c of ['/.env', '/%2eenv', '/.git/config', '/.git/', '/.git']) {
    const r = await getSite(c);
    assert.ok(r.status >= 400, c);
    assert.ok(!r.texto.includes('SEGREDO'), c);
  }
});

test('junção e link simbólico que saem da pasta (ou entram em oculto) são recusados, com ou sem barra', { skip: !ligacaoOk && 'sem permissão para criar junção' }, async () => {
  const a = await getSite(`/${encodeURIComponent('junção')}/alheio.txt`);
  assert.equal(a.status, 404);
  assert.ok(!a.texto.includes('de fora'));
  assert.equal((await getSite(`/${encodeURIComponent('junção')}`)).status, 404); // nem o 301 revela a pasta de fora
  const b = await getSite('/atalho-oculto/config');
  assert.equal(b.status, 404);
  assert.ok(!b.texto.includes('SEGREDO'));
  assert.equal((await getSite('/atalho-oculto')).status, 404);
});

test('só GET e HEAD: POST, PUT, DELETE devolvem 405', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal((await noSite(m, '/')).status, 405, m);
});

test('arquivo acima do limite devolve 413', () => {
  const r = resolver({ raiz: site, pedido: '/grande.txt', limite: 100 });
  assert.equal(r.status, 413);
  assert.equal(resolver({ raiz: site, pedido: '/grande.txt', limite: 1000 }).status, 200);
});

test('Toca sem site: ou com pasta inexistente não serve nada', async () => {
  assert.equal((await getSite('/', { rotulo: 'sem-site' })).status, 404);
  assert.equal((await getSite('/', { rotulo: 'sumido' })).status, 404);
  assert.equal((await getSite('/', { rotulo: 'nao-existe' })).status, 404);
  assert.equal((await get('/toca/sem-site/')).status, 404);
  assert.equal((await get('/toca/sumido/')).status, 404);
  assert.equal((await get('/toca/nao-existe/')).status, 404);
});

test('em localhost, /toca/<id>[/resto] redireciona 301 para a origem do site, com a porta do Host e a query', async () => {
  const base = `http://padaria-do-amigo.toca.localhost:${porta}`;
  const a = await get('/toca/padaria-do-amigo');
  assert.equal(a.status, 301);
  assert.equal(a.headers.location, `${base}/`);
  const b = await get('/toca/padaria-do-amigo/boletins/b1.html?x=1');
  assert.equal(b.status, 301);
  assert.equal(b.headers.location, `${base}/boletins/b1.html?x=1`);
  const c = await get('/toca/padaria-do-amigo/boletins');
  assert.equal(c.headers.location, `${base}/boletins`);
  // Host sem porta: Location sem porta
  const d = await get('/toca/padaria-do-amigo/', { cabecalhos: { host: 'localhost' } });
  assert.equal(d.headers.location, 'http://padaria-do-amigo.toca.localhost/');
  // o redirecionamento não serve nada nem resolve caminho
  assert.equal(a.texto, '');
  assert.equal((await get('/toca/sem-site/')).status, 404);
  // caminho estranho depois do id só vira caminho na origem do site (o Host do Location é sempre o do site)
  const e = await get('/toca/padaria-do-amigo//evil.example/x');
  assert.ok(e.headers.location.startsWith(`${base}/`), e.headers.location);
  assert.ok(!e.headers.location.startsWith('http://evil'), e.headers.location);
});

test('Host estranho continua 403', async () => {
  for (const host of ['evil.example.com', 'toca.localhost', '.toca.localhost', 'x.toca.localhost.evil.example', 'x.toca.localhost:80@evil.example', 'x.toca.localhost.']) {
    const r = await get('/api/saude', { cabecalhos: { host } });
    assert.equal(r.status, 403, host);
    const s = await get('/', { cabecalhos: { host } });
    assert.equal(s.status, 403, host);
  }
});

test('/api/tocas expõe estatico absoluto (com a porta do Host), producao e vscode; só https; VS Code para toda Toca', async () => {
  const lista = JSON.parse((await get('/api/tocas')).texto).lista;
  const j = lista.find((s) => s.name === 'padaria-do-amigo');
  assert.equal(j.estatico, `http://padaria-do-amigo.toca.localhost:${porta}/`);
  assert.equal(j.producao, 'https://padariadoamigo.exemplo.com.br/');
  assert.match(j.vscode, /^vscode:\/\/file\//);
  assert.ok(!j.vscode.includes('\\'));
  const s = lista.find((x) => x.name === 'sem-site');
  assert.equal(s.estatico, undefined);
  assert.equal(s.producao, undefined); // http:// é recusado
  assert.match(s.vscode, /^vscode:\/\/file\//);
  assert.equal(lista.find((x) => x.name === 'sumido').estatico, undefined);
  // Host puro (porta 80): sem porta na URL
  const puro = JSON.parse((await get('/api/tocas', { cabecalhos: { host: 'localhost' } })).texto).lista;
  assert.equal(puro.find((x) => x.name === 'padaria-do-amigo').estatico, 'http://padaria-do-amigo.toca.localhost/');
  const sites = JSON.parse((await get('/api/sites', { cabecalhos: { host: '127.0.0.1:8123' } })).texto);
  assert.equal(sites.find((x) => x.name === 'absoluto').estatico, 'http://absoluto.toca.localhost:8123/');
});

test('a página servida não controla a Clássica: origem opaca/estrangeira e Sec-Fetch-Site são barrados mesmo com X-Painel e controle ligado', async () => {
  const base = { 'x-painel': '1', 'content-type': 'application/json' };
  const origemDoSite = `http://padaria-do-amigo.toca.localhost:${porta}`;
  for (const extra of [
    { origin: 'null' },
    { origin: 'https://evil.example' },
    { origin: origemDoSite },
    { origin: origemDoSite, 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ]) {
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
