import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agrupar, idsMoveis, ordenar } from '../lib/agrupar.mjs';
import { discoverTools } from '../lib/ferramentas.mjs';
import { parseManifesto, suiteInfo } from '../lib/descoberta.mjs';

const site = (name, extra = {}) => ({ kind: 'site', name, ...extra });
const tool = (name, extra = {}) => ({ kind: 'tool', name, ...extra });
const nomes = (g) => g.itens.map((i) => i.toca?.name ?? `(${i.planejado.nome})`);

const suite = {
  nome: 'Suíte',
  regra: 'R',
  frentes: [
    { id: 'producao', nome: 'Estúdio', descricao: 'imagem', membros: [{ nome: 'estudio', status: 'planejado' }] },
    { id: 'operacao', nome: 'Operação', membros: [{ nome: 'intoca', status: 'ativo' }] },
  ],
};

test('agrupar: frente com membro planejado, anexas sob o membro e ferramenta solta da frente', () => {
  const itens = [
    tool('MPT', { membroDe: 'estudio', suite: 'producao' }),
    tool('Studio', { suite: 'producao' }),
    tool('Animada', { membroDe: 'intoca', suite: 'operacao' }),
    site('intoca', { tipo: 'ferramenta' }),
  ];
  const g = agrupar(itens, suite, { eu: 'intoca' });
  // a frente do projeto que hospeda a sala sobe para o topo (INT-09), mesmo vindo depois no manifesto
  assert.equal(g[1].titulo, 'Estúdio');
  assert.equal(g[1].tipo, 'frente');
  assert.deepEqual(nomes(g[1]), ['(estudio)', 'Studio']);
  assert.deepEqual(g[1].itens[0].anexas.map((a) => a.name), ['MPT']);
  // o projeto que hospeda a sala não ganha cartão e as anexas dele aparecem soltas
  assert.deepEqual(nomes(g[0]), ['Animada']);
  assert.equal(g.some((x) => x.itens.some((i) => i.toca?.name === 'intoca')), false);
});

const ids = (gs) => gs.map((g) => g.id);

test('agrupar: a frente que contém `eu` é fixa e vai em primeiro; as demais seguem o manifesto', () => {
  const itens = [site('intoca', { tipo: 'ferramenta' }), site('avulso', { tipo: 'site' })];
  const g = agrupar(itens, suite, { eu: 'intoca' });
  assert.deepEqual(ids(g), ['operacao', 'producao', 'sem-core']);
  assert.equal(g[0].fixo, true);
  assert.equal(g[0].titulo, 'Operação', 'o título continua vindo do manifesto');
  assert.deepEqual(g.slice(1).map((x) => x.fixo), [undefined, undefined]);
});

test('agrupar: sem frente com `eu` (ou sem eu, ou sem Suíte) nada é fixo e a ordem do manifesto vale', () => {
  const itens = [site('x', { tipo: 'site' })];
  assert.deepEqual(ids(agrupar(itens, suite, { eu: 'outro' })), ['producao', 'operacao', 'sem-core']);
  assert.equal(agrupar(itens, suite, { eu: 'outro' }).some((x) => x.fixo), false);
  assert.equal(agrupar(itens, suite).some((x) => x.fixo), false);
  assert.equal(agrupar(itens, null, { eu: 'intoca' }).some((x) => x.fixo), false);
});

test('ordenar: o fixo fica em primeiro; a ordem salva vale; id que sumiu é ignorado; grupo novo entra no fim', () => {
  const gs = [{ id: 'fixa', fixo: true }, { id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(ids(ordenar(gs, ['c', 'a'])), ['fixa', 'c', 'a', 'b'], 'b é "novo": fica no fim');
  assert.deepEqual(ids(ordenar(gs, ['sumiu', 'b', 'b', 'c'])), ['fixa', 'b', 'c', 'a'], 'id que não existe e repetido são ignorados');
  assert.deepEqual(ids(ordenar(gs, ['a', 'fixa', 'c'])), ['fixa', 'a', 'c', 'b'], 'o fixo nunca se mexe');
  assert.deepEqual(ids(ordenar(gs, undefined)), ['fixa', 'a', 'b', 'c']);
  assert.deepEqual(ids(ordenar(gs, 'lixo')), ['fixa', 'a', 'b', 'c']);
  assert.deepEqual(idsMoveis(gs), ['a', 'b', 'c']);
  assert.deepEqual(ordenar([], ['a']), []);
});

test('agrupar: fora da Suíte separa por tipo e por fábrica; ferramentas sem frente em "Ferramentas"', () => {
  const itens = [
    site('Motor Azul', { tipo: 'site' }),
    site('filho', { tipo: 'site', fabrica: 'Motor Azul' }),
    site('solto', { tipo: 'site' }),
    site('cliente', { tipo: 'cliente' }),
    tool('Sozinha'),
  ];
  const g = agrupar(itens, null);
  assert.deepEqual(g.map((x) => x.titulo), ['Sites com Motor Azul', 'Sites sem Motor Azul', 'Clientes e outros projetos', 'Ferramentas']);
  assert.deepEqual(nomes(g[0]), ['Motor Azul', 'filho']);
  assert.deepEqual(g.map((x) => x.id), ['com-core', 'sem-core', 'outros', 'ferramentas'], 'os ids não mudam');
  assert.deepEqual(nomes(g[1]), ['solto']);
  assert.deepEqual(nomes(g[2]), ['cliente']);
  assert.deepEqual(nomes(g[3]), ['Sozinha']);
});

test('agrupar: sem fábrica nomeada (ou com várias) o título é genérico, com os mesmos ids', () => {
  const itens = [site('a', { tipo: 'site' }), site('b', { tipo: 'site' })];
  assert.deepEqual(agrupar(itens, null).map((x) => x.titulo), ['Sites sem fábrica']);
  const duas = [site('f1', { tipo: 'site' }), site('f2', { tipo: 'site' }), site('x', { tipo: 'site', fabrica: 'f1' }), site('y', { tipo: 'site', fabrica: 'f2' })];
  const g = agrupar(duas, null);
  assert.deepEqual(g.map((x) => x.titulo), ['Sites com fábrica']);
  assert.equal(g[0].id, 'com-core');
});

test('agrupar: sem tipo em nenhum item vira uma lista só, sem título (ou "Clientes e sites" com Suíte)', () => {
  const itens = [site('a'), site('b')];
  assert.equal(agrupar(itens, null)[0].titulo, null);
  assert.equal(agrupar(itens, suite)[2].titulo, 'Clientes e sites');
  assert.deepEqual(agrupar([], null), []);
});

test('discoverTools: lê pasta, porta, command e env do manifesto; aponta o que falta', () => {
  const m = parseManifesto(`ferramentas:
  - nome: Central
    pasta: 'C:\\x\\central'
    porta: 3003
    command: [node, operacao/servidor.mjs, '--cliente', c1]
    env: {A: um, B: 'dois 2'}
    membro_de: motor
    inicia: 'texto livre que nunca é executado'
  - nome: Sem Comando
    pasta: 'C:\\x\\sc'
    porta: 8765
    suite: operacao
  - nome: Sem Pasta
    porta: 1234
suite:
  nome: S
  frentes:
    producao: {nome: P, membros: [], ferramentas: ['Central']}
`);
  const { itens, faltas } = discoverTools(m);
  assert.deepEqual(itens.map((t) => t.name), ['Central', 'Sem Comando']);
  const c = itens[0];
  assert.equal(c.dir, 'C:\\x\\central');
  assert.equal(c.port, 3003);
  assert.deepEqual(c.command, ['node', 'operacao/servidor.mjs', '--cliente', 'c1']);
  assert.deepEqual(c.env, { A: 'um', B: 'dois 2' });
  assert.equal(c.membroDe, 'motor');
  assert.equal(c.suite, 'producao');
  assert.equal(itens[1].command, undefined);
  assert.equal(itens[1].suite, 'operacao');
  assert.deepEqual(faltas, [{ ferramenta: 'Sem Comando', campos: ['command'] }]);
  assert.equal(suiteInfo(m).frentes[0].id, 'producao');
});
