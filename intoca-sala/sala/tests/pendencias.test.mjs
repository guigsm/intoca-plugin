import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerEsperando, pendenciasDaSede } from '../lib/pendencias.mjs';

const FILA = `# Fila

## Esperando o proprietário

Texto solto que não é tabela.

| # | Tipo | Pedido | Onde responder | Desde | Estado |
| --- | --- | --- | --- | --- | --- |
| 1 | vai | "vai X": faz o X | chat da Diretoria | 2026-10-31 | feito 2026-11-01 ("vai X") |
| 2 | conferir | Dar Ctrl+F5 \\| conferir | navegador | 2026-11-01 | aberto |
| 3 | arquivar | Arquivar o executor | chat Gerente | 2026-11-02 | aberto |
| 4 | decisao | Decidida antes | Diretoria | 2026-11-02 | Decidido em 2026-11-03 |
|   |   |   |   |   |   |

## Pendências

| # | Tipo | Pedido | Onde responder | Desde | Estado |
| --- | --- | --- | --- | --- | --- |
| 9 | vai | Outra tabela, fora da seção | x | y | aberto |
`;

test('lerEsperando: só a seção, linhas abertas, \\| dentro da célula, encerradas fora', () => {
  const r = lerEsperando(FILA);
  assert.equal(r.lida, true);
  assert.deepEqual(r.abertas.map((a) => a.numero), ['2', '3']);
  assert.equal(r.abertas[0].pedido, 'Dar Ctrl+F5 | conferir');
  assert.equal(r.abertas[0].tipo, 'conferir');
  assert.equal(r.abertas[0].onde, 'navegador');
  assert.equal(r.abertas[0].desde, '2026-11-01');
});

test('lerEsperando: título com ou sem acento e caixa; seção ausente; seção sem tabela', () => {
  assert.equal(lerEsperando('### ESPERANDO O PROPRIETARIO\n| Pedido | Estado |\n|--|--|\n| a | aberto |\n').abertas.length, 1);
  assert.deepEqual(lerEsperando('# Fila\nnada\n'), { lida: true, semSecao: true, abertas: [] });
  assert.deepEqual(lerEsperando('## Esperando o proprietário\n\nsó texto\n'), { lida: true, abertas: [] });
});

test('lerEsperando: tabela sem coluna Pedido é fora do formato; estado ausente conta como aberto', () => {
  const r = lerEsperando('## Esperando o proprietário\n| A | B |\n|--|--|\n| 1 | 2 |\n');
  assert.equal(r.lida, false);
  assert.equal(r.motivo, 'fora do formato');
  const s = lerEsperando('## Esperando o proprietário\n| # | Pedido |\n|--|--|\n| 1 | sem estado |\n');
  assert.equal(s.abertas.length, 1);
  assert.equal(s.abertas[0].estado, '');
});

test('lerEsperando: BOM e CRLF', () => {
  const r = lerEsperando('﻿## Esperando o proprietário\r\n| # | Pedido | Estado |\r\n|--|--|--|\r\n| 1 | x | aberto |\r\n');
  assert.equal(r.abertas.length, 1);
});

test('pendenciasDaSede: sede + projetos ativos com ops/fila.md; sem fila vai para ausentes; mesma fila não conta duas vezes', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-pend-'));
  mkdirSync(join(raiz, 'diretoria'));
  writeFileSync(join(raiz, 'diretoria', 'fila.md'), FILA);
  const proj = join(raiz, 'proj');
  mkdirSync(join(proj, 'ops'), { recursive: true });
  writeFileSync(join(proj, 'ops', 'fila.md'), '## Esperando o proprietário\n| # | Pedido | Estado |\n|--|--|--|\n| 1 | do projeto | aberto |\n');
  const vazio = join(raiz, 'vazio');
  mkdirSync(vazio);
  const projects = [
    { nome: 'proj', status: 'ativo', pasta_atual: proj },
    { nome: 'proj-gemeo', status: 'ativo', pasta_atual: proj },
    { nome: 'sem-fila', status: 'ativo', pasta_atual: vazio },
    { nome: 'planejado', status: 'planejado', pasta_atual: proj },
    { nome: 'sem-pasta', status: 'ativo', pasta_atual: join(raiz, 'nada') },
  ];
  const r = pendenciasDaSede({ raiz, projects });
  assert.deepEqual(r.fontes.map((f) => f.origem), ['sede', 'proj']);
  assert.equal(r.fontes[0].arquivo, 'diretoria/fila.md');
  assert.equal(r.total, 3);
  assert.deepEqual(r.ausentes, ['sem-fila']);
  rmSync(raiz, { recursive: true, force: true });
});

test('pendenciasDaSede: sem fila da sede, a fonte aparece como não lida (sem dados, não zero)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-pend-'));
  const r = pendenciasDaSede({ raiz, projects: [] });
  assert.equal(r.fontes[0].lida, false);
  assert.equal(r.fontes[0].motivo, 'fila não encontrada');
  rmSync(raiz, { recursive: true, force: true });
});
