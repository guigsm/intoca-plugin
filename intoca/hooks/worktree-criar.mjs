#!/usr/bin/env node
// Hook WorktreeCreate do plugin intoca (DIR-13).
// Substitui o `git worktree add` padrão do Claude Code. Entrada em stdin: o JSON comum dos hooks
// mais `name` (slug da worktree). Saída: o caminho absoluto da worktree como ÚLTIMA linha não vazia
// do stdout, e nada mais lá. Todo o resto vai para o stderr.
//
// Onde a worktree é criada:
//   com sede (sede.yaml subindo da raiz do repositório, ou INTOCA_SEDE):
//       <sede>/_worktrees/<repositório>-<nome>
//   sem sede: o local padrão do Claude Code, <repositório>/.claude/worktrees/<nome>, para não quebrar
//       worktrees de repositórios alheios (o plugin vale na conta inteira, e o hook não pode
//       "declinar": falhar aqui é falhar a criação).
// Branch: <prefixo><nome>, com prefixo `worktree-` (INTOCA_WORKTREE_BRANCH_PREFIX troca). Se o branch
// já existir, é usado sem `-b`. Base: o HEAD de onde a sessão está (cwd).
//
// Diferente dos outros hooks do plugin, este FALHA: qualquer erro sai com código 1 e mensagem no
// stderr, o que faz a criação falhar de forma visível. `.worktreeinclude` não é processado (a
// documentação diz que o hook substitui o padrão por inteiro); nenhuma worktree da sede o usa.
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  lerEntrada, git, nomeDeWorktreeValido, raizDoRepositorio, sedeDoRepositorio,
  destinoDaWorktree, prefixoDoBranch, mesmoCaminho,
} from './lib.mjs';

function falhar(mensagem) {
  process.stderr.write(`[intoca worktree-criar] ${mensagem}\n`);
  process.exit(1);
}
process.on('uncaughtException', (e) => falhar(`erro interno: ${e && e.message ? e.message : e}`));
process.on('unhandledRejection', (e) => falhar(`erro interno: ${e && e.message ? e.message : e}`));

function main() {
  const entrada = lerEntrada();
  if (!entrada) falhar('entrada ilegível: esperava o JSON do hook em stdin.');
  if (entrada.hook_event_name && entrada.hook_event_name !== 'WorktreeCreate') {
    falhar(`evento inesperado: ${entrada.hook_event_name}.`);
  }
  const nome = entrada.name;
  if (!nomeDeWorktreeValido(nome)) {
    falhar(`nome de worktree inválido: ${JSON.stringify(nome)}. Use letras, números, ponto, hífen e sublinhado.`);
  }

  const cwd = resolve(String(entrada.cwd || process.cwd()));
  const raiz = raizDoRepositorio(cwd);
  if (!raiz) falhar(`${cwd} não está num repositório Git; não há de onde criar a worktree.`);

  const sede = sedeDoRepositorio(raiz);
  const destino = resolve(destinoDaWorktree(raiz, nome, sede));
  const branch = `${prefixoDoBranch()}${nome}`;
  const valido = git(cwd, ['check-ref-format', '--branch', branch]);
  if (!valido.ok) falhar(`nome de branch inválido: ${branch}.`);

  // Reentrada: a pasta já existe. Se for uma worktree deste repositório, é ela mesma (nome reaproveitado).
  if (existsSync(destino)) {
    const lista = git(raiz, ['worktree', 'list', '--porcelain']);
    const conhecida = lista.ok && lista.saida.split(/\r?\n/)
      .some((l) => l.startsWith('worktree ') && mesmoCaminho(l.slice('worktree '.length), destino));
    if (!conhecida) falhar(`${destino} já existe e não é uma worktree de ${raiz}. Nada foi alterado.`);
    process.stderr.write(`[intoca worktree-criar] reutilizando a worktree existente em ${destino}\n`);
    process.stdout.write(`${destino}\n`);
    return;
  }

  mkdirSync(dirname(destino), { recursive: true });

  const jaExiste = git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
  const argumentos = jaExiste
    ? ['worktree', 'add', destino, branch]
    : ['worktree', 'add', destino, '-b', branch];
  const r = git(cwd, argumentos);
  if (r.saida) process.stderr.write(`${r.saida}\n`);
  if (r.erro) process.stderr.write(`${r.erro}\n`);
  if (!r.ok) falhar(`git ${argumentos.join(' ')} falhou (código ${r.status}).`);

  process.stderr.write(`[intoca worktree-criar] ${destino} no branch ${branch}${sede ? '' : ' (sem sede: local padrão)'}\n`);
  process.stdout.write(`${destino}\n`);
}

main();
