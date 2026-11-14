// INT-16: visitar a outra sala por link não muda o padrão do navegador; só a caixa "Abrir a Animada ao digitar localhost" muda.
// Roda o script inline do index.html num node:vm com localStorage, location, document e fetch de mentira: sem navegador, sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];

// Elemento falso: guarda o que a alternância usa (hidden, checked, href, ouvintes) e aceita qualquer outra chamada.
function falso(inicial = {}) {
  const ouvintes = {};
  const base = { hidden: false, checked: false, href: '', ...inicial, addEventListener: (t, f) => { (ouvintes[t] ??= []).push(f); }, disparar: (t) => (ouvintes[t] ?? []).forEach((f) => f()) };
  return new Proxy(base, {
    get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return (...a) => falso(); },
    set(o, k, v) { o[k] = v; return true; },
  });
}

async function abrir({ guardado = null, lancar = false, query = '', semEsperar = false, animada = { registrada: true, no_ar: true, porta: 8765 } } = {}) {
  const guardados = new Map(guardado ? [['intoca-sala', guardado]] : []);
  const gravacoes = [];
  const elementos = new Map();
  const saltos = [];
  const intervalos = [];
  const document = {
    // `padrao-animada` nasce escondido, como no HTML (atributo `hidden`); o resto nasce como o elemento falso padrão.
    getElementById: (id) => { if (!elementos.has(id)) elementos.set(id, falso(id === 'padrao-animada' ? { hidden: true } : {})); return elementos.get(id); },
    createElement: () => falso(), createTextNode: () => falso(), querySelector: () => null, querySelectorAll: () => [],
  };
  const localStorage = {
    getItem: (k) => (guardados.has(k) ? guardados.get(k) : null),
    setItem: (k, v) => { if (lancar) throw new Error('indisponível'); gravacoes.push([k, v]); guardados.set(k, v); },
  };
  const resposta = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
  const fetch = async (url) => {
    if (url.startsWith('/api/tocas')) return resposta({ lista: [], grupos: [], sede: null, suite: [] });
    if (url.startsWith('/api/saude')) return resposta({ controle: false, animada, faltaNoManifesto: [] });
    if (url.startsWith('/api/pendencias')) return resposta({ sede: false });
    return resposta({});
  };
  const location = { protocol: 'http:', hostname: 'localhost', search: query, replace: (u) => saltos.push(u) };
  const ctx = vm.createContext({ document, localStorage, location, fetch, URLSearchParams, CSS: { escape: (x) => x }, setInterval: (f) => intervalos.push(f), console });
  vm.runInContext(script, ctx);
  for (let i = 0; i < (semEsperar ? 0 : 20); i++) await new Promise((r) => setImmediate(r));
  return { intervalos, elementos, gravacoes, guardados, saltos, caixa: elementos.get('padrao-animada-caixa'), area: elementos.get('padrao-animada'), botao: elementos.get('ir-animada') };
}

test('abrir com ?sala=classica não grava nada', async () => {
  const sem = await abrir({ query: '?sala=classica' });
  assert.deepEqual(sem.gravacoes, []);
  const com = await abrir({ query: '?sala=classica', guardado: 'animada' });
  assert.deepEqual(com.gravacoes, []);
  assert.equal(com.guardados.get('intoca-sala'), 'animada');
});

test('o clique no botão Animada não grava (é só um link)', async () => {
  const s = await abrir({ guardado: 'classica' });
  assert.equal(s.botao.hidden, false);
  assert.equal(s.botao.href, 'http://localhost:8765/');
  s.botao.disparar('click');
  assert.deepEqual(s.gravacoes, []);
  assert.equal(s.guardados.get('intoca-sala'), 'classica');
});

test('a caixa grava animada ao ticar e classica ao desticar, sem redirecionar', async () => {
  const s = await abrir();
  assert.equal(s.area.hidden, false);
  assert.equal(s.caixa.checked, false);
  s.caixa.checked = true; s.caixa.disparar('change');
  assert.deepEqual(s.gravacoes, [['intoca-sala', 'animada']]);
  s.caixa.checked = false; s.caixa.disparar('change');
  assert.deepEqual(s.gravacoes.at(-1), ['intoca-sala', 'classica']);
  assert.deepEqual(s.saltos, []);
});

test('a caixa nasce ticada quando a preferência guardada é animada, e aparece mesmo com a Animada fora do ar', async () => {
  const s = await abrir({ guardado: 'animada', animada: { registrada: true, no_ar: false, porta: 8765 } });
  assert.equal(s.caixa.checked, true);
  assert.equal(s.area.hidden, false);
  assert.equal(s.botao.hidden, true);
  assert.deepEqual(s.saltos, []);
});

test('com animada guardada e a Animada no ar a raiz salta; com ?sala=classica não salta', async () => {
  const raiz = await abrir({ guardado: 'animada' });
  assert.deepEqual(raiz.saltos, ['http://localhost:8765/']);
  const visita = await abrir({ guardado: 'animada', query: '?sala=classica' });
  assert.deepEqual(visita.saltos, []);
  assert.deepEqual(visita.gravacoes, []);
  const padraoClassica = await abrir({ guardado: 'classica' });
  assert.deepEqual(padraoClassica.saltos, []);
});

test('a caixa não aparece sem Animada registrada', async () => {
  const s = await abrir({ animada: { registrada: false, no_ar: false, porta: null } });
  assert.equal(s.area.hidden, true);
  assert.deepEqual(s.saltos, []);
});

test('o HTML nasce com a área da caixa escondida e o CSS faz o atributo hidden valer sobre .auto', () => {
  assert.match(html, /<div class="auto" id="padrao-animada" hidden>/);
  assert.match(html, /\.auto\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
});

test('antes da primeira resposta de /api/saude a área da caixa continua escondida', async () => {
  const s = await abrir({ animada: { registrada: false, no_ar: false, porta: null }, semEsperar: true });
  assert.equal(s.area.hidden, true);
});

test('ticar a caixa na raiz com a Animada no ar não salta no refresh seguinte (o de 3 s)', async () => {
  const s = await abrir();
  assert.deepEqual(s.saltos, []);
  s.caixa.checked = true; s.caixa.disparar('change');
  assert.equal(s.guardados.get('intoca-sala'), 'animada');
  for (const f of s.intervalos) await f();
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(s.saltos, []);
});

test('se o localStorage lança ao gravar, a caixa volta ao estado anterior', async () => {
  const s = await abrir({ lancar: true });
  assert.equal(s.caixa.checked, false);
  s.caixa.checked = true; s.caixa.disparar('change');
  assert.equal(s.caixa.checked, false);
  assert.deepEqual(s.saltos, []);
});
