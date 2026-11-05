#!/usr/bin/env node
// Hook SessionStart (matcher: startup|resume) do plugin intoca: aviso de "pasta errada" (PLG-02,
// parte B; regra 13). O chat abriu numa pasta que não é a de nenhum projeto do manifesto, inclusive
// uma pasta ANTIGA (listada em `pastas_antigas`): injeta um aviso de uma linha com o destino certo.
// Com a sede achada só pelo ponteiro (PLG-03) e o cwd fora de qualquer pasta registrada, dá uma linha dizendo que o
// chat não faz parte de nenhuma Toca da sede (sem fila e sem cobrança; calado na pasta pessoal e sem cwd).
// Só additionalContext: nunca bloqueia. Mudo quando não tem certeza ou quando está tudo certo: sem
// sede, manifesto ilegível, cwd em projeto (ou em worktree dele), na raiz da sede, em labs/, _infra/,
// _shared/, _worktrees/ ou diretoria/. Só leitura (sede.yaml). Sem rede. Nenhum estado em disco.
// INTOCA_SEM_AVISO_PASTA=1 (ou INTOCA_SEM_AVISO_TROCADO=1) desliga.
// Nunca derruba o chat: qualquer erro interno termina em exit 0 sem saída.
import { relative } from 'node:path';
import { lerEntrada, montarContexto, variavelLigada, dentroDe, contem, pastaDeWorktree, pastaSemToca } from './lib.mjs';

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));

// Primeiro nível dentro da sede onde abrir o chat não é erro (não são pastas de projeto).
const PASTAS_DA_SEDE = new Set(['labs', '_infra', '_shared', '_worktrees', 'diretoria', '.claude']);
const FRASE = 'Para trabalho de projeto, o chat assume o cargo na pasta do projeto.';

// Texto que vem do manifesto entra no aviso sem crase, quebra de linha nem caractere de controle.
const limpo = (s) => String(s ?? '').replace(/[`\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

function responder(texto) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: texto },
  }));
}

// Projetos cuja pasta atual fica dentro do cwd (o cwd é a pasta "mãe" deles): [{ nome, pasta }].
function projetosAquiDentro(ctx) {
  const achados = [];
  for (const p of ctx.projetos) {
    if (p.atual && contem(ctx.cwd.lex, p.atual.lex)) achados.push({ nome: limpo(p.nome), pasta: limpo(p.atual.lex) });
  }
  return achados.slice(0, 3);
}

function main() {
  if (variavelLigada('INTOCA_SEM_AVISO_TROCADO') || variavelLigada('INTOCA_SEM_AVISO_PASTA')) return;
  const entrada = lerEntrada();
  if (!entrada) return;
  if (entrada.hook_event_name && entrada.hook_event_name !== 'SessionStart') return;
  const ctx = montarContexto(entrada);
  if (!ctx) {
    // Sede só pelo ponteiro e pasta que não é de nenhuma Toca: uma linha, e mais nada (os outros hooks calam).
    const fora = pastaSemToca(entrada);
    if (fora) {
      const nome = limpo(fora.nome);
      responder(`Aviso InToca: este chat não faz parte de nenhuma Toca da sede${nome ? ` ${nome}` : ''}. `
        + 'Se for trabalho de um projeto, abra o chat na pasta dele.');
    }
    return; // sem sede, manifesto ilegível ou cwd que não resolve: mudo
  }

  // Pasta de projeto (pasta_atual, pasta_futura) ou worktree com dono: está tudo certo.
  if (ctx.chat && ctx.chat.tipo === 'projeto') return;
  // Worktree em <sede>/_worktrees, com dono único ou não: nunca é erro.
  if (pastaDeWorktree(ctx, ctx.cwd)) return;

  // Pasta antiga de um projeto que migrou: avisa e dá a pasta atual.
  let antiga = null;
  for (const p of ctx.projetos) {
    if (!p.atual) continue;
    for (const velha of p.antigas) {
      if (dentroDe(velha, ctx.cwd, true) && (!antiga || velha.lex.length > antiga.velha.lex.length)) antiga = { projeto: p, velha };
    }
  }
  if (antiga) {
    responder(`Aviso InToca: esta pasta não é a de nenhum projeto da sede, o projeto ${limpo(antiga.projeto.nome)} migrou `
      + `para ${limpo(antiga.projeto.atual.lex)}. ${FRASE}`);
    return;
  }

  if (ctx.chat && ctx.chat.tipo === 'sede') {
    const rel = relative(ctx.sede.lex, ctx.cwd.lex);
    if (rel === '') return; // raiz da sede
    const primeiro = rel.split(/[\\/]+/)[0].toLowerCase();
    // Pasta que começa com "_" na raiz da sede é compartilhada ou de infraestrutura, nunca produto (sede.yaml).
    if (PASTAS_DA_SEDE.has(primeiro) || primeiro.startsWith('_')) return;
  }
  // Aqui: dentro da sede sem projeto (fora das pastas acima), ou fora de tudo (sede achada por INTOCA_SEDE).
  const dentro = projetosAquiDentro(ctx);
  const onde = dentro.length ? `; aqui dentro ficam ${dentro.map((d) => `${d.nome} (${d.pasta})`).join(', ')}` : '';
  responder(`Aviso InToca: esta pasta não é a de nenhum projeto da sede${onde}. ${FRASE}`);
}

try { main(); } catch { /* hook nunca derruba o chat */ }
