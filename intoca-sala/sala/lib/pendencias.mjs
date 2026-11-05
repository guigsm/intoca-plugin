// Pendências do proprietário: a seção `## Esperando o proprietário` da fila da sede (`diretoria/fila.md`) e da
// fila de cada projeto ativo (`<pasta do projeto>/ops/fila.md`). Só leitura. Linha aberta é a que não tem
// estado `feito` (nem resolvido, decidido, cancelado...). Arquivo ausente ou sem tabela: "sem dados", nunca zero escondido.
import { join, resolve } from 'node:path';
import { fold, isDirectory, readText } from './descoberta.mjs';

const ENCERRADA = /^(?:feito|feita|conclu[ií]d|fechad|cumprid|resolvid|decidid|cancelad|descartad|arquivad)/;
const TITULO = /^#{1,6}\s+esperando o proprietario\s*$/;
const LIMITE = 200;

// Divide uma linha de tabela em células, respeitando `\|`.
function celulas(linha) {
  const partes = linha.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return partes.map((c) => c.replace(/\\\|/g, '|').trim());
}

const ehSeparador = (linha) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linha);

// Texto de uma fila -> { lida, semSecao?, abertas, motivo? }. `abertas` traz numero, tipo, pedido, onde, desde, estado.
export function lerEsperando(texto) {
  try {
    const linhas = texto.replace(/^﻿/, '').split(/\r?\n/);
    const inicio = linhas.findIndex((l) => TITULO.test(fold(l)));
    if (inicio < 0) return { lida: true, semSecao: true, abertas: [] };
    let fim = linhas.findIndex((l, i) => i > inicio && /^#{1,2}\s/.test(l));
    if (fim < 0) fim = linhas.length;
    const bloco = linhas.slice(inicio + 1, fim).filter((l) => l.trim().startsWith('|'));
    if (bloco.length === 0) return { lida: true, abertas: [] };
    const cab = celulas(bloco[0]).map(fold);
    const col = (nome) => cab.findIndex((c) => c === nome || c.startsWith(nome));
    const iPedido = col('pedido');
    if (iPedido < 0) return { lida: false, motivo: 'fora do formato', abertas: [] };
    const idx = { numero: col('#'), tipo: col('tipo'), onde: col('onde'), desde: col('desde'), estado: col('estado') };
    const abertas = [];
    for (const l of bloco.slice(1)) {
      if (ehSeparador(l)) continue;
      const c = celulas(l);
      const pedido = c[iPedido] ?? '';
      if (pedido === '') continue;
      const dado = (i) => (i >= 0 ? c[i] ?? '' : '');
      const estado = dado(idx.estado);
      if (ENCERRADA.test(fold(estado))) continue;
      if (abertas.length >= LIMITE) break;
      abertas.push({ numero: dado(idx.numero), tipo: dado(idx.tipo), pedido, onde: dado(idx.onde), desde: dado(idx.desde), estado });
    }
    return { lida: true, abertas };
  } catch {
    return { lida: false, motivo: 'fora do formato', abertas: [] };
  }
}

// As filas que o manifesto aponta: a da sede e a de cada projeto ativo com pasta. Devolve
// { fontes: [{ origem, arquivo, lida, abertas, motivo? }], ausentes: [nome...], total }.
// `arquivo` é relativo à pasta da origem (o servidor não devolve caminho de máquina).
export function pendenciasDaSede({ raiz, projects }) {
  const fontes = [];
  const ausentes = [];
  const vistos = new Set();
  const alvos = [{ origem: 'sede', arquivo: 'diretoria/fila.md', caminho: join(raiz, 'diretoria', 'fila.md') }];
  for (const p of projects) {
    if (p.status !== 'ativo' || !p.pasta_atual || !isDirectory(p.pasta_atual)) continue;
    alvos.push({ origem: p.nome, arquivo: 'ops/fila.md', caminho: join(p.pasta_atual, 'ops', 'fila.md') });
  }
  for (const a of alvos) {
    const chave = fold(resolve(a.caminho));
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const texto = readText(a.caminho);
    if (texto === undefined) {
      if (a.origem === 'sede') fontes.push({ origem: a.origem, arquivo: a.arquivo, lida: false, motivo: 'fila não encontrada', abertas: [] });
      else ausentes.push(a.origem);
      continue;
    }
    fontes.push({ origem: a.origem, arquivo: a.arquivo, ...lerEsperando(texto) });
  }
  const total = fontes.reduce((n, f) => n + f.abertas.length, 0);
  return { fontes, ausentes, total };
}
