// INT-09: grupo fixo + ordem por preferência, linha da Animada (instalada ou não), instalação simulada e subida automática (rotas).
// Tudo em pastas temporárias e com processos de mentira: nada é clonado de verdade, nenhuma porta real é tocada.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarApp } from '../lib/app.mjs';
import { arquivoDeEstado, configDaAnimada, gravarConfigDaAnimada, lerEstado } from '../lib/estado.mjs';

const raizes = [];
after(() => raizes.forEach((r) => rmSync(r, { recursive: true, force: true })));
const barras = (p) => p.replace(/\\/g, '/');

const PROGRAMAS_OK = { git: { ok: true, versao: 'git 2' }, uv: { ok: true, versao: 'uv 0.9' }, python: { ok: true, versao: '3.12' }, faltam: [] };

/**
 * Uma sede de teste: o projeto `intoca` hospeda a sala; frentes `estudio`, `marketing` e `operacao` (a do `intoca`, por último
 * no manifesto); e um projeto solto. `animadaNoManifesto` poe a Animada em `ferramentas:`.
 */
async function montar({ animadaNoManifesto = false, programas = PROGRAMAS_OK, rodar, portaLivre = async () => true, controle = false } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-animada-'));
  raizes.push(raiz);
  const casa = join(raiz, 'casa');
  const sede = join(raiz, 'sede');
  const plugin = join(sede, 'plugin');
  const pastaAnimada = join(sede, 'sala', 'app');
  for (const d of [join(casa, '.intoca'), plugin, join(sede, 'estudio'), join(sede, 'mkt'), join(sede, 'solto')]) mkdirSync(d, { recursive: true });
  if (animadaNoManifesto) mkdirSync(pastaAnimada, { recursive: true });
  const yaml = `projetos:
  - nome: intoca
    tipo: ferramenta
    status: ativo
    pasta_atual: '${barras(plugin)}'
  - nome: estudio
    tipo: motor
    status: ativo
    pasta_atual: '${barras(join(sede, 'estudio'))}'
  - nome: mkt
    tipo: motor
    status: ativo
    pasta_atual: '${barras(join(sede, 'mkt'))}'
  - nome: solto
    tipo: site
    status: ativo
    pasta_atual: '${barras(join(sede, 'solto'))}'
ferramentas:
${animadaNoManifesto ? `  - nome: 'AI Operations Room · InToca'
    pasta: '${barras(pastaAnimada)}'
    porta: 8765
    suite: operacao
    membro_de: intoca
    command: ['${barras(pastaAnimada)}/.venv/Scripts/python.exe', -m, backend.cli, serve]
` : '  []\n'}suite:
  nome: Suíte
  regra: R
  frentes:
    estudio: {nome: Estúdio, membros: [estudio]}
    marketing: {nome: Agência, membros: [mkt]}
    operacao: {nome: 'Sala de Operações', membros: [intoca], ferramentas: ['AI Operations Room · InToca']}
`;
  writeFileSync(join(sede, 'sede.yaml'), yaml);
  writeFileSync(join(casa, '.intoca', 'sede'), `${sede}\n`);
  if (controle) writeFileSync(arquivoDeEstado(casa), JSON.stringify({ controle: true }));
  const chamadas = [];
  const base = rodar ?? (async (cmd, args, o = {}) => {
    chamadas.push([cmd, ...args]);
    if (cmd === 'git' && args[0] === 'clone') {
      mkdirSync(args[args.length - 1], { recursive: true });
      writeFileSync(join(args[args.length - 1], 'pyproject.toml'), '[project]\nname = "x"\n');
    }
    if (cmd === 'uv' && args[0] === 'sync') mkdirSync(join(o.cwd, '.venv'), { recursive: true });
    return { status: 0, stdout: '', stderr: '', erro: null };
  });
  const criar = () => criarApp({
    env: {},
    casa,
    processos: { entrada: () => undefined, vivo: () => false, log: () => [], iniciar() {}, pararFilho: async () => false, pararExterno: async () => 0 },
    escutando: async () => false,
    sondaAnimada: async () => false,
    pastaDoProjeto: plugin,
    animadaDeps: { programas: async () => programas, rodar: base, portaLivre, url: 'https://exemplo.test/animada', tickMs: 60000 },
  });
  const servir = async (app) => {
    const s = createServer((req, res) => app.handle(req, res));
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const porta = s.address().port;
    const chamar = (metodo, caminho, { cabecalhos = {}, corpo } = {}) => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: porta, path: caminho, method: metodo, headers: { Host: `localhost:${porta}`, ...cabecalhos } }, (res) => {
        let t = '';
        res.on('data', (c) => (t += c));
        res.on('end', () => {
          let json;
          try { json = JSON.parse(t); } catch { /* ndjson ou html */ }
          resolve({ status: res.statusCode, json, texto: t });
        });
      });
      req.on('error', reject);
      if (corpo !== undefined) req.write(JSON.stringify(corpo));
      req.end();
    });
    return {
      chamar,
      acao: (caminho, corpo) => chamar('POST', caminho, { cabecalhos: { 'X-Painel': '1', 'Content-Type': 'application/json' }, corpo }),
      fechar: () => new Promise((r) => s.close(r)),
    };
  };
  return { raiz, casa, sede, plugin, pastaAnimada, chamadas, criar, servir };
}

const ids = (r) => r.json.grupos.map((g) => g.id);

// ---------- grupo fixo e ordem ----------

test('/api/tocas: a frente do projeto que hospeda a sala vem em primeiro, fixa, com o título do manifesto', async () => {
  const m = await montar();
  const srv = await m.servir(m.criar());
  const r = await srv.chamar('GET', '/api/tocas');
  assert.deepEqual(ids(r), ['operacao', 'estudio', 'marketing', 'sem-core']);
  assert.equal(r.json.grupos[0].fixo, true);
  assert.equal(r.json.grupos[0].titulo, 'Sala de Operações');
  assert.equal(r.json.grupos.slice(1).some((g) => g.fixo), false);
  assert.deepEqual(r.json.ordem, ['estudio', 'marketing', 'sem-core']);
  await srv.fechar();
});

test('POST /api/preferencias: sem X-Painel 403; lixo, grupo fixo e grupo desconhecido 400; não exige controle', async () => {
  const m = await montar();
  const srv = await m.servir(m.criar());
  assert.equal((await srv.chamar('POST', '/api/preferencias', { corpo: { ordem: ['marketing'] } })).status, 403);
  assert.equal((await srv.chamar('POST', '/api/preferencias', { cabecalhos: { 'X-Painel': '1', Origin: 'https://evil.example' }, corpo: { ordem: ['marketing'] } })).status, 403);
  assert.equal((await srv.acao('/api/preferencias', { ordem: 'marketing' })).status, 400);
  assert.equal((await srv.acao('/api/preferencias', { ordem: [1, 2] })).status, 400);
  assert.equal((await srv.acao('/api/preferencias', {})).status, 400);
  const fixo = await srv.acao('/api/preferencias', { ordem: ['operacao', 'marketing'] });
  assert.equal(fixo.status, 400);
  assert.match(fixo.json.error, /fixo/);
  const desc = await srv.acao('/api/preferencias', { ordem: ['marketing', 'nao-existe'] });
  assert.equal(desc.status, 400);
  assert.match(desc.json.error, /desconhecido/);
  assert.equal(lerEstado(m.casa).ordem, undefined, 'nada foi gravado');
  assert.equal(lerEstado(m.casa).controle, undefined);
  const ok = await srv.acao('/api/preferencias', { ordem: ['sem-core', 'estudio', 'marketing'] });
  assert.equal(ok.status, 200, 'controle desligado não impede ordenar');
  assert.deepEqual(ok.json.ordem, ['sem-core', 'estudio', 'marketing']);
  await srv.fechar();
});

test('a ordem escolhida vale em /api/tocas e sobrevive a reiniciar a Clássica; id que sumiu é ignorado e grupo novo vai ao fim', async () => {
  const m = await montar();
  let srv = await m.servir(m.criar());
  await srv.acao('/api/preferencias', { ordem: ['marketing', 'sem-core'] });
  let r = await srv.chamar('GET', '/api/tocas');
  assert.deepEqual(ids(r), ['operacao', 'marketing', 'sem-core', 'estudio'], 'o que não estava na ordem entra no fim');
  await srv.fechar();

  // "reiniciar": outra instância do app, mesma pasta do usuário
  srv = await m.servir(m.criar());
  r = await srv.chamar('GET', '/api/tocas');
  assert.deepEqual(ids(r), ['operacao', 'marketing', 'sem-core', 'estudio']);
  assert.equal(JSON.parse(readFileSync(arquivoDeEstado(m.casa), 'utf8')).ordem.length, 2);

  // um id gravado há tempo e que hoje não existe é ignorado; o fixo continua em primeiro mesmo se alguém o gravar à mão
  writeFileSync(arquivoDeEstado(m.casa), JSON.stringify({ ordem: ['operacao', 'sumiu', 'sem-core', 'estudio'], controle: false }));
  r = await srv.chamar('GET', '/api/tocas');
  assert.deepEqual(ids(r), ['operacao', 'sem-core', 'estudio', 'marketing']);
  await srv.fechar();
});

// ---------- a Animada: instalada ou não ----------

test('/api/saude: sem a Animada em lugar nenhum, instalada é falso; pode_instalar exige controle E programas', async () => {
  let m = await montar();
  let srv = await m.servir(m.criar());
  let a = (await srv.chamar('GET', '/api/saude')).json.animada;
  assert.equal(a.instalada, false);
  assert.equal(a.pasta, null);
  assert.equal(a.pode_instalar, false, 'controle desligado');
  assert.deepEqual(a.faltam, []);
  assert.equal(a.porta_padrao, 8765);
  assert.equal(a.pasta_sugerida, join(m.sede, 'sala', 'app'));
  await srv.fechar();

  m = await montar({ controle: true });
  srv = await m.servir(m.criar());
  assert.equal((await srv.chamar('GET', '/api/saude')).json.animada.pode_instalar, true);
  await srv.fechar();

  m = await montar({ controle: true, programas: { ...PROGRAMAS_OK, uv: { ok: false }, python: { ok: false }, faltam: ['uv', 'python'] } });
  srv = await m.servir(m.criar());
  a = (await srv.chamar('GET', '/api/saude')).json.animada;
  assert.equal(a.pode_instalar, false, 'falta programa');
  assert.deepEqual(a.faltam, ['uv', 'python']);
  await srv.fechar();
});

test('animada.instalada pelo manifesto (com pasta existente) e por sala.json (com pasta existente); pasta que não existe não vale', async () => {
  // 1. manifesto
  let m = await montar({ animadaNoManifesto: true });
  let srv = await m.servir(m.criar());
  let s = (await srv.chamar('GET', '/api/saude')).json.animada;
  assert.equal(s.instalada, true);
  assert.equal(s.pasta, barras(m.pastaAnimada));
  assert.deepEqual(s.faltam, [], 'instalada: nem confere programas');
  const op = (await srv.chamar('GET', '/api/tocas')).json.grupos[0];
  assert.equal(op.itens[0].toca.ehAnimada, true, 'o cartão da Animada é marcado para a página');
  await srv.fechar();

  // 2. só sala.json
  m = await montar();
  mkdirSync(join(m.raiz, 'minha-animada'));
  gravarConfigDaAnimada(m.casa, { pasta: join(m.raiz, 'minha-animada'), porta: 8790 });
  srv = await m.servir(m.criar());
  s = (await srv.chamar('GET', '/api/saude')).json.animada;
  assert.equal(s.instalada, true);
  assert.equal(s.pasta, join(m.raiz, 'minha-animada'));
  const tocas = (await srv.chamar('GET', '/api/tocas')).json;
  const card = tocas.lista.find((i) => i.ehAnimada);
  assert.equal(card.port, 8790);
  assert.equal(card.canStart, true, 'ganha Iniciar mesmo sem estar no manifesto');
  assert.equal(tocas.grupos[0].itens.some((i) => i.toca?.ehAnimada), true, 'e aparece no grupo fixo, anexa de quem hospeda a sala');
  await srv.fechar();

  // 3. pasta inexistente
  m = await montar();
  gravarConfigDaAnimada(m.casa, { pasta: join(m.raiz, 'nao-existe'), porta: 8790 });
  srv = await m.servir(m.criar());
  assert.equal((await srv.chamar('GET', '/api/saude')).json.animada.instalada, false);
  await srv.fechar();
});

// ---------- subida automática (caixa) ----------

test('POST /api/animada/auto: exige X-Painel e controle; só com a Animada instalada; só booleano; grava na chave animada e no espelho', async () => {
  let m = await montar({ animadaNoManifesto: true });
  let srv = await m.servir(m.criar());
  assert.equal((await srv.chamar('POST', '/api/animada/auto', { corpo: { auto: true } })).status, 403);
  const sem = await srv.acao('/api/animada/auto', { auto: true });
  assert.equal(sem.status, 403);
  assert.equal(sem.json.controle, false);
  await srv.fechar();

  m = await montar({ animadaNoManifesto: true, controle: true });
  srv = await m.servir(m.criar());
  assert.equal((await srv.acao('/api/animada/auto', { auto: 'sim' })).status, 400);
  assert.equal((await srv.acao('/api/animada/auto', { auto: true })).status, 200);
  let est = lerEstado(m.casa);
  assert.equal(est.animada.auto, true);
  assert.equal(est.animada_config.auto, true);
  assert.equal(est.controle, true, 'o resto do arquivo é preservado');
  assert.equal((await srv.chamar('GET', '/api/saude')).json.animada.auto, true);
  // a Animada, ao subir, sobrescreve a chave dela inteira: a escolha da pessoa sobrevive pelo espelho
  writeFileSync(arquivoDeEstado(m.casa), JSON.stringify({ ...est, animada: { porta: 8765, pid: 9, iniciou_em: 'x', versao: '0.2.0' } }));
  assert.equal(configDaAnimada(m.casa).auto, true);
  assert.equal((await srv.chamar('GET', '/api/saude')).json.animada.auto, true);
  assert.equal((await srv.acao('/api/animada/auto', { auto: false })).status, 200);
  assert.equal((await srv.chamar('GET', '/api/saude')).json.animada.auto, false);
  await srv.fechar();

  m = await montar({ controle: true });
  srv = await m.servir(m.criar());
  assert.equal((await srv.acao('/api/animada/auto', { auto: true })).status, 409, 'sem Animada instalada não há o que subir');
  await srv.fechar();
});

// ---------- instalação (simulada) ----------

const linhasDe = (r) => r.texto.split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('instalação: sem controle 403; sem confirmar só devolve o plano e não cria nada', async () => {
  let m = await montar();
  let srv = await m.servir(m.criar());
  assert.equal((await srv.chamar('POST', '/api/animada/instalar', { corpo: {} })).status, 403);
  assert.equal((await srv.acao('/api/animada/instalar', {})).status, 403);
  await srv.fechar();

  m = await montar({ controle: true });
  srv = await m.servir(m.criar());
  const r = await srv.acao('/api/animada/instalar', {});
  assert.equal(r.status, 200);
  assert.equal(r.json.plano.destino, join(m.sede, 'sala', 'app'));
  assert.equal(r.json.plano.porta, 8765);
  assert.equal(r.json.plano.clonar, true);
  assert.match(r.json.plano.hooks, /não registra hooks/);
  assert.match(r.json.plano.item, /nome: 'AI Operations Room · InToca'/);
  assert.match(r.json.plano.item, /membro_de: intoca/);
  assert.match(r.json.plano.item, /suite: operacao/);
  assert.equal(r.json.plano.comandos.length, 3);
  assert.equal(existsSync(join(m.sede, 'sala')), false, 'o plano não cria pasta');
  assert.equal(m.chamadas.length, 0, 'nem roda clone nem sync');
  await srv.fechar();
});

test('instalação simulada completa: clona, sincroniza, grava sala.json, devolve o pedido à Diretoria e não toca em sede.yaml nem em settings.json', async () => {
  const m = await montar({ controle: true });
  const manifestoAntes = readFileSync(join(m.sede, 'sede.yaml'), 'utf8');
  const srv = await m.servir(m.criar());
  const r = await srv.acao('/api/animada/instalar', { confirmado: true, porta: 8791 });
  assert.equal(r.status, 200);
  const eventos = linhasDe(r);
  const fim = eventos.at(-1);
  assert.equal(fim.tipo, 'fim');
  assert.equal(fim.ok, true);
  assert.equal(fim.destino, join(m.sede, 'sala', 'app'));
  assert.equal(fim.porta, 8791);
  assert.deepEqual(eventos.filter((e) => e.tipo === 'passo' && e.estado === 'feito').map((e) => e.passo), ['clonar', 'sincronizar', 'registrar']);
  assert.match(fim.pedido, /Pedido à Diretoria/);
  assert.match(fim.pedido, /nome: 'AI Operations Room · InToca'/);
  assert.match(fim.pedido, /porta: 8791/);
  assert.match(fim.pedido, /NÃO foram registrados/);
  assert.deepEqual(m.chamadas.map((c) => c.slice(0, 2).join(' ')), ['git clone', 'uv sync']);
  assert.ok(m.chamadas[0].includes('https://exemplo.test/animada'));

  // sala.json: pasta e porta (e o espelho), sem perder o resto
  const est = lerEstado(m.casa);
  assert.equal(est.animada.pasta, join(m.sede, 'sala', 'app'));
  assert.equal(est.animada.porta, 8791);
  assert.equal(est.animada_config.pasta, est.animada.pasta);
  assert.equal(est.controle, true);
  // nada fora do recurso: manifesto igual, nenhum settings.json na pasta do usuário de teste
  assert.equal(readFileSync(join(m.sede, 'sede.yaml'), 'utf8'), manifestoAntes);
  assert.equal(existsSync(join(m.casa, '.claude', 'settings.json')), false);
  assert.equal(existsSync(join(m.casa, '.claude')), false);

  // a página relê o estado, e agora a Animada está instalada
  const estado = await srv.chamar('GET', '/api/animada/instalacao');
  assert.equal(estado.json.fase, 'pronta');
  assert.equal(estado.json.resultado.porta, 8791);
  const a = (await srv.chamar('GET', '/api/saude')).json.animada;
  assert.equal(a.instalada, true);
  assert.equal((await srv.acao('/api/animada/instalar', { confirmado: true })).status, 409, 'já instalada');
  await srv.fechar();
});

test('instalação com falha no uv sync: desfaz o que criou e deixa o sala.json como estava; dá para tentar de novo', async () => {
  let falhar = true;
  const rodar = async (cmd, args, o = {}) => {
    if (cmd === 'git' && args[0] === 'clone') {
      mkdirSync(args[args.length - 1], { recursive: true });
      writeFileSync(join(args[args.length - 1], 'x.txt'), 'x');
    }
    if (cmd === 'uv' && args[0] === 'sync') {
      if (falhar) return { status: 2, stdout: '', stderr: 'resolution failed', erro: null };
      mkdirSync(join(o.cwd, '.venv'), { recursive: true });
    }
    return { status: 0, stdout: '', stderr: '', erro: null };
  };
  const m = await montar({ controle: true, rodar });
  const antes = readFileSync(arquivoDeEstado(m.casa), 'utf8');
  const srv = await m.servir(m.criar());
  const r = await srv.acao('/api/animada/instalar', { confirmado: true });
  const fim = linhasDe(r).at(-1);
  assert.equal(fim.ok, false);
  assert.equal(fim.codigo, 'sincronizar-falhou');
  assert.equal(fim.desfeito, true);
  assert.match(fim.error, /resolution failed/);
  assert.equal(existsSync(join(m.sede, 'sala')), false, 'a pasta que a instalação criou foi desfeita (inclusive <sede>/sala)');
  assert.equal(readFileSync(arquivoDeEstado(m.casa), 'utf8'), antes, 'sala.json igual ao que era');
  assert.equal((await srv.chamar('GET', '/api/animada/instalacao')).json.fase, 'falhou');
  assert.equal((await srv.chamar('GET', '/api/saude')).json.animada.instalada, false);

  falhar = false;
  const de_novo = await srv.acao('/api/animada/instalar', { confirmado: true });
  assert.equal(linhasDe(de_novo).at(-1).ok, true);
  await srv.fechar();
});

test('instalação: porta ocupada 409, programa faltando 400, destino com outro conteúdo 409, pasta com ".." 400; nada é criado', async () => {
  let m = await montar({ controle: true, portaLivre: async () => false });
  let srv = await m.servir(m.criar());
  const ocupada = await srv.acao('/api/animada/instalar', {});
  assert.equal(ocupada.status, 409);
  assert.equal(ocupada.json.codigo, 'porta-ocupada');
  assert.equal(ocupada.json.portaSugerida, 8766);
  await srv.fechar();

  m = await montar({ controle: true, programas: { ...PROGRAMAS_OK, uv: { ok: false }, faltam: ['uv'] } });
  srv = await m.servir(m.criar());
  const semUv = await srv.acao('/api/animada/instalar', {});
  assert.equal(semUv.status, 400);
  assert.equal(semUv.json.codigo, 'sem-uv');
  await srv.fechar();

  m = await montar({ controle: true });
  mkdirSync(join(m.sede, 'sala', 'app'), { recursive: true });
  writeFileSync(join(m.sede, 'sala', 'app', 'minha-coisa.txt'), 'não mexa');
  // o 'git remote get-url' do fake devolve status 0 e saída vazia: não é a Animada, então o destino é recusado
  srv = await m.servir(m.criar());
  const ocupado = await srv.acao('/api/animada/instalar', {});
  assert.equal(ocupado.status, 409);
  assert.equal(ocupado.json.codigo, 'destino-ocupado');
  assert.equal(readFileSync(join(m.sede, 'sala', 'app', 'minha-coisa.txt'), 'utf8'), 'não mexa');
  const dots = await srv.acao('/api/animada/instalar', { pasta: `${barras(m.raiz)}/a/../b` });
  assert.equal(dots.status, 400);
  assert.equal(dots.json.codigo, 'destino-invalido');
  const relativa = await srv.acao('/api/animada/instalar', { pasta: 'relativa/pasta' });
  assert.equal(relativa.status, 400);
  const portaRuim = await srv.acao('/api/animada/instalar', { porta: 80 });
  assert.equal(portaRuim.json.codigo, 'porta-invalida');
  await srv.fechar();
});

test('instalação: com a Animada já no manifesto (pasta existente) ela conta como instalada e o botão responde 409', async () => {
  const m = await montar({ controle: true, animadaNoManifesto: true });
  const srv = await m.servir(m.criar());
  assert.equal((await srv.acao('/api/animada/instalar', {})).status, 409);
  await srv.fechar();
});
