import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScalar, parseFlow, parseManifestProjects, parseManifestSuite } from '../lib/yaml.mjs';

test('parseScalar: texto simples, aspas, número, null e comentário', () => {
  assert.equal(parseScalar('ativo'), 'ativo');
  assert.equal(parseScalar("  'C:\\intoca\\x' # comentário"), 'C:\\intoca\\x');
  assert.equal(parseScalar("'it''s'"), "it's");
  assert.equal(parseScalar('"a \\"b\\" c"'), 'a "b" c');
  assert.equal(parseScalar('4321'), '4321');
  assert.equal(parseScalar('null'), null);
  assert.equal(parseScalar('~'), null);
  assert.equal(parseScalar(''), null);
  assert.equal(parseScalar('valor   # nota'), 'valor');
});

test('parseFlow: lista, mapa, aninhamento e vírgula dentro de aspas', () => {
  assert.deepEqual(parseFlow("[a, 'b, c', d]"), ['a', 'b, c', 'd']);
  assert.deepEqual(parseFlow('{nome: X, membros: [a, b]}'), { nome: 'X', membros: ['a', 'b'] });
  assert.deepEqual(parseFlow('texto'), 'texto');
  assert.deepEqual(parseFlow('[]'), []);
});

const SEDE = `versao: 1
sede:
  nome: sede
projetos:
  - nome: alfa
    tipo: site
    porte: grande
    status: ativo
    pasta_atual: 'C:\\x\\alfa'   # comentário
    porta_dev: 4321
    observacoes: >-
      texto dobrado ignorado
    repositorios:
      - {pasta: 'C:\\x', branch: main}
  # comentário solto

  - nome: "beta"
    status: planejado
    pasta_atual: null
ferramentas:
  - nome: Ferramenta Um
    porta: 3003
    membro_de: alfa
suite:
  nome: 'Suíte'
  regra: 'Uma regra.'
  frentes:
    producao: {nome: 'Estúdio', descricao: 'imagem', membros: [estudio], ferramentas: ['Ferramenta Um', Outra]}
    marketing:
      nome: Agência
      membros: [motor]
`;

test('parseManifestProjects: lê itens, ignora bloco dobrado e mapa aninhado, tira comentário', () => {
  const p = parseManifestProjects(SEDE);
  assert.deepEqual(p.map((x) => x.nome), ['alfa', 'beta']);
  assert.equal(p[0].pasta_atual, 'C:\\x\\alfa');
  assert.equal(p[0].porta_dev, '4321');
  assert.equal(p[0].observacoes, '>-');
  assert.equal(p[0].repositorios, null); // chave sem valor na linha; o mapa aninhado embaixo é ignorado
  assert.equal(p[1].pasta_atual, null);
});

test('parseManifestProjects: seção ferramentas e seção ausente', () => {
  const t = parseManifestProjects(SEDE, 'ferramentas');
  assert.equal(t.length, 1);
  assert.equal(t[0].nome, 'Ferramenta Um');
  assert.equal(t[0].membro_de, 'alfa');
  assert.deepEqual(parseManifestProjects(SEDE, 'inexistente'), []);
  assert.deepEqual(parseManifestProjects(''), []);
});

test('parseManifestProjects: BOM e fim de linha CRLF', () => {
  const p = parseManifestProjects('\uFEFFprojetos:\r\n  - nome: a\r\n    status: ativo\r\n');
  assert.deepEqual(p, [{ nome: 'a', status: 'ativo' }]);
});

test('parseManifestSuite: frente em fluxo e frente em bloco', () => {
  const s = parseManifestSuite(SEDE);
  assert.equal(s.nome, 'Suíte');
  assert.equal(s.regra, 'Uma regra.');
  assert.equal(s.frentes.length, 2);
  assert.deepEqual(s.frentes[0], {
    id: 'producao', nome: 'Estúdio', descricao: 'imagem', membros: ['estudio'], ferramentas: ['Ferramenta Um', 'Outra'],
  });
  assert.equal(s.frentes[1].id, 'marketing');
  assert.equal(s.frentes[1].nome, 'Agência');
  assert.deepEqual(s.frentes[1].membros, ['motor']);
});

test('parseManifestSuite: sem frentes devolve undefined', () => {
  assert.equal(parseManifestSuite('suite:\n  nome: x\n'), undefined);
  assert.equal(parseManifestSuite('projetos:\n  - nome: a\n'), undefined);
});
