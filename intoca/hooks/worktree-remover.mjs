#!/usr/bin/env node
// Hook WorktreeRemove do plugin intoca (DIR-13).
// Entrada em stdin: o JSON comum dos hooks mais `worktree_path`. Sem saída em stdout (o Claude Code
// descarta). Código 0 = a worktree conta como removida; código diferente de 0 com a pasta ainda
// presente = a remoção falha e a pasta fica.
//
// Passos:
//   1. Só mexe em worktree do próprio repositório, nos dois lugares em que worktree-criar.mjs cria:
//      <sede>/_worktrees/<repositório>-<nome> e <repositório>/.claude/worktrees/<nome>.
//   2. `git worktree remove <caminho>` SEM --force. Se houver alteração não commitada ou arquivo não
//      rastreado, falha com mensagem clara e deixa a pasta (o trabalho não se perde em silêncio).
//   3. `git worktree prune`.
//   4. Apaga o branch `<prefixo><nome>` com `git branch -d`, que recusa branch não integrado: os
//      commits do executor continuam no branch até a Diretoria integrar. O Claude Code nunca apaga
//      branch de worktree criada por hook, por isso este passo é nosso.
// Pasta que já não existe: faz `prune` a partir do cwd e sai com 0.
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import {
  lerEntrada, git, raizDoRepositorio, sedeDoRepositorio, prefixoDoBranch, mesmoCaminho,
} from './lib.mjs';

function falhar(mensagem) {
  process.stderr.write(`[intoca worktree-remover] ${mensagem}\n`);
  process.exit(1);
}
process.on('uncaughtException', (e) => falhar(`erro interno: ${e && e.message ? e.message : e}`));
process.on('unhandledRejection', (e) => falhar(`erro interno: ${e && e.message ? e.message : e}`));

function aviso(mensagem) {
  process.stderr.write(`[intoca worktree-remover] ${mensagem}\n`);
}

function main() {
  const entrada = lerEntrada();
  if (!entrada) falhar('entrada ilegível: esperava o JSON do hook em stdin.');
  if (entrada.hook_event_name && entrada.hook_event_name !== 'WorktreeRemove') {
    falhar(`evento inesperado: ${entrada.hook_event_name}.`);
  }
  const caminho = entrada.worktree_path;
  if (typeof caminho !== 'string' || !caminho || !isAbsolute(caminho)) {
    falhar(`worktree_path inválido: ${JSON.stringify(caminho)}. Esperava caminho absoluto.`);
  }
  const alvo = resolve(caminho);
  const cwd = resolve(String(entrada.cwd || process.cwd()));

  if (!existsSync(alvo)) {
    // Já foi apagada por fora: só limpa o registro do Git, a partir do repositório da sessão.
    const raizSessao = raizDoRepositorio(cwd);
    if (raizSessao) git(raizSessao, ['worktree', 'prune']);
    aviso(`${alvo} não existe mais; nada a remover.`);
    return;
  }

  const raiz = raizDoRepositorio(alvo);
  if (!raiz) falhar(`${alvo} não é uma worktree Git. Nada foi removido.`);
  if (mesmoCaminho(raiz, alvo)) falhar(`${alvo} é o checkout principal do repositório, não uma worktree. Nada foi removido.`);

  // O hook só remove o que ele mesmo cria.
  const sede = sedeDoRepositorio(raiz);
  const nomePasta = basename(alvo);
  const repo = basename(raiz);
  let nome = null;
  if (sede && mesmoCaminho(dirname(alvo), resolve(sede, '_worktrees')) && nomePasta.startsWith(`${repo}-`)) {
    nome = nomePasta.slice(repo.length + 1);
  } else if (mesmoCaminho(dirname(alvo), resolve(raiz, '.claude', 'worktrees'))) {
    nome = nomePasta;
  }
  if (!nome) {
    falhar(`${alvo} não está em <sede>/_worktrees/${repo}-<nome> nem em ${repo}/.claude/worktrees/<nome>. Recusado: o hook só remove worktree que ele criou.`);
  }

  const estado = git(alvo, ['status', '--porcelain']);
  if (!estado.ok) falhar(`não consegui conferir o estado de ${alvo}: ${estado.erro || 'git status falhou'}. Pasta mantida.`);
  if (estado.saida) {
    const linhas = estado.saida.split(/\r?\n/);
    const mostra = linhas.slice(0, 10).join('\n  ');
    falhar(`${alvo} tem alteração não commitada ou arquivo não rastreado (${linhas.length}); pasta mantida.\n  ${mostra}${linhas.length > 10 ? '\n  ...' : ''}\n`
      + `Commite, ou descarte à mão com: git -C "${raiz}" worktree remove --force "${alvo}"`);
  }

  const ramo = git(alvo, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const branchAtual = ramo.ok ? ramo.saida : '';

  const r = git(raiz, ['worktree', 'remove', alvo]);
  if (r.saida) aviso(r.saida);
  if (!r.ok) falhar(`git worktree remove falhou (código ${r.status}): ${r.erro || 'sem mensagem'}. Pasta mantida.`);
  git(raiz, ['worktree', 'prune']);
  aviso(`removida: ${alvo}`);

  // Branch: só o que o hook de criação teria feito, e só se estiver integrado.
  const esperado = `${prefixoDoBranch()}${nome}`;
  if (branchAtual && branchAtual === esperado) {
    const b = git(raiz, ['branch', '-d', branchAtual]);
    if (b.ok) aviso(`branch ${branchAtual} apagado (estava integrado).`);
    else aviso(`branch ${branchAtual} mantido: ${b.erro || b.saida || 'não integrado'}`);
  } else if (branchAtual) {
    aviso(`branch ${branchAtual} mantido (não foi criado por este hook).`);
  }
}

main();
