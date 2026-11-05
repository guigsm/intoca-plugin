#!/usr/bin/env node
// Hook SessionStart (matcher: startup|resume) do plugin intoca.
// Acha a sede (sede.yaml subindo a partir do cwd; senão INTOCA_SEDE; senão sai sem saída), lê
// diretoria/fila.md e diretoria/passagem.md e injeta no início do chat a raiz da sede, as OS em
// execução, os recursos congelados e o lembrete de conferir a fila. Só leitura. Sem rede.
// Nunca derruba o chat: qualquer erro interno termina em exit 0 sem saída.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerEntrada, raizes } from './lib.mjs';

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));

const LIMITE = 1500;
const FRASE = 'Leia diretoria/fila.md antes de alterar qualquer recurso.';
const ATIVA = /em execu|em andamento|cart[aã]o criado|ocupad/i;
const ENCERRADA = /conclu|aceit|cancel|arquivad/i;

function ler(caminho) {
  try {
    return readFileSync(caminho, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n').slice(0, 300000);
  } catch {
    return null;
  }
}

const limpar = (t) => String(t ?? '').replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const cortar = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

function tabelas(texto) {
  const resultado = [];
  let atual = null;
  for (const linha of texto.split('\n')) {
    if (!/^\s*\|/.test(linha)) { atual = null; continue; }
    const celulas = linha.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (!atual) {
      atual = { cab: celulas.map((c) => limpar(c).toLowerCase()), linhas: [] };
      resultado.push(atual);
    } else if (!celulas.every((c) => /^:?-{3,}:?$/.test(c))) {
      atual.linhas.push(celulas);
    }
  }
  return resultado;
}

function osAtivas(fila) {
  const achadas = [];
  for (const t of tabelas(fila)) {
    const iOs = t.cab.indexOf('os');
    const iEstado = t.cab.indexOf('estado');
    if (iOs < 0 || iEstado < 0) continue;
    const iTema = t.cab.indexOf('tema');
    const iRecurso = t.cab.indexOf('recurso');
    for (const l of t.linhas) {
      const estado = limpar(l[iEstado]);
      if (!ATIVA.test(estado) || ENCERRADA.test(estado)) continue;
      const id = limpar(l[iOs]);
      if (!id) continue;
      achadas.push({
        id,
        tema: iTema >= 0 ? cortar(limpar(l[iTema]), 70) : '',
        recurso: iRecurso >= 0 ? cortar(limpar(l[iRecurso]), 90) : '',
      });
    }
  }
  return achadas;
}

function congelados(fila) {
  const linhas = fila.split('\n');
  const inicio = linhas.findIndex((l) => /^##\s+Congelado/i.test(l));
  if (inicio < 0) return [];
  const corpo = [];
  for (const l of linhas.slice(inicio + 1)) {
    if (/^##\s/.test(l)) break;
    corpo.push(l);
  }
  return corpo.join('\n').split(/^\s*-\s+/m).slice(1).map((b) => cortar(limpar(b), 150)).filter(Boolean);
}

function estadoEmUmaFrase(passagem) {
  const linhas = passagem.split('\n');
  const inicio = linhas.findIndex((l) => /^##\s+Estado em uma frase/i.test(l));
  if (inicio < 0) return '';
  const paragrafo = [];
  for (const l of linhas.slice(inicio + 1)) {
    if (/^##\s/.test(l)) break;
    if (!l.trim()) { if (paragrafo.length) break; continue; }
    paragrafo.push(l);
  }
  return cortar(limpar(paragrafo.join(' ')), 320);
}

function main() {
  const entrada = lerEntrada();
  if (!entrada) return;
  if (entrada.hook_event_name && entrada.hook_event_name !== 'SessionStart') return;
  const raiz = raizes(entrada);
  if (!raiz) return; // sem sede.yaml acima do cwd e sem INTOCA_SEDE: fora da jurisdição, sem saída
  const { local, sede } = raiz;
  // A raiz viva da sede vale mais que a cópia da worktree, que é só o retrato do branch.
  const fila = ler(join(sede, 'diretoria', 'fila.md')) ?? ler(join(local, 'diretoria', 'fila.md'));
  const passagem = ler(join(sede, 'diretoria', 'passagem.md')) ?? ler(join(local, 'diretoria', 'passagem.md'));
  if (fila === null && passagem === null) return;

  const linhas = [
    'Contexto da sede (fila e passagem, lidas ao iniciar a sessão).',
    `Raiz da sede: ${sede} (os caminhos diretoria/... partem dela).`,
  ];
  if (fila !== null) {
    const ativas = osAtivas(fila);
    linhas.push('OS em execução:');
    if (ativas.length) {
      for (const o of ativas) {
        linhas.push(`- ${o.id}${o.tema ? ` · ${o.tema}` : ''}${o.recurso ? ` · recurso: ${o.recurso}` : ''}`);
      }
    } else {
      linhas.push('- nenhuma registrada na fila.');
    }
    const frios = congelados(fila);
    if (frios.length) {
      linhas.push('Recursos congelados:');
      for (const f of frios) linhas.push(`- ${f}`);
    }
  }
  if (passagem !== null) {
    const estado = estadoEmUmaFrase(passagem);
    if (estado) linhas.push(`Estado da sede: ${estado}`);
  }

  // A frase final sempre cabe: o corpo é cortado por linhas inteiras até sobrar espaço para ela.
  const reserva = FRASE.length + 2;
  const saida = [];
  let total = 0;
  let cortou = false;
  for (const l of linhas) {
    if (total + l.length + 1 > LIMITE - reserva - 4) { cortou = true; break; }
    saida.push(l);
    total += l.length + 1;
  }
  if (cortou) saida.push('…');
  saida.push(FRASE);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: saida.join('\n').slice(0, LIMITE) },
  }));
}

try { main(); } catch { /* hook nunca derruba o chat */ }
