#!/usr/bin/env node
// Gera `casos.ts`: os casos de paridade entre a porta mínima do mod (`hooks/regras.ts`) e os hooks reais do
// plugin `intoca` (`chat-trocado.mjs` e `pasta-errada.mjs`). Roda os hooks de verdade, como processos, sobre uma sede
// de mentira em pasta temporária, e grava o que cada um respondeu. O teste `paridade.test.ts` pede o mesmo à porta
// do mod e exige texto idêntico. Só para quem mantém o mod: o pacote não precisa disto para funcionar.
//
// Uso (da raiz do repositório da sede):  node plugin/intoca-sala/tests/paridade/gerar.mjs
// Sem argumentos, sem rede. Escreve só `casos.ts` ao lado deste arquivo e apaga a sede temporária e a pasta temporária de mentira
// (`TEMP`/`TMP`/`TMPDIR` dos hooks apontam para ela, fora das fixtures, onde também fica o estado de sessão dos hooks).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const hooks = resolve(aqui, '..', '..', '..', 'intoca', 'hooks');

// ---------------------------------------------------------------- a sede de mentira
const MANIFESTO = `sede:
  nome: sede-teste
projetos:
  - nome: alfa.exemplo.br
    sigla: ALF
    pasta_atual: '<SEDE>/alfa'
    pastas_antigas: ['<ANTIGO>/alfa']
  - nome: beta
    sigla: BET
    pasta_atual: '<SEDE>/beta'
  - {nome: gama, sigla: GAM, pasta_atual: '<FORA>/gama'}
  - nome: localhost
    sigla: LOC
    pasta_atual: '<SEDE>/_infra/local'
`;

// ---------------------------------------------------------------- os casos
const ALFA = 'Gerente · alfa.exemplo.br';
const chat = (nome, cwd, titulo, passos) => ({ nome, cwd, titulo, passos });

const CHAT = [
  chat('cita outro projeto pelo nome', '<SEDE>/alfa', ALFA, ['ajuste o botão do projeto beta']),
  chat('sigla em maiúsculas, palavra inteira', '<SEDE>/alfa', ALFA, ['corrija o BET que quebrou']),
  chat('sigla em minúsculas não vale', '<SEDE>/alfa', ALFA, ['corrija o bet que quebrou']),
  chat('o nome em maiúsculas vale (o nome não distingue caixa)', '<SEDE>/alfa', ALFA, ['corrija o BETA que quebrou']),
  chat('ID de OS de outro projeto', '<SEDE>/alfa', ALFA, ['siga com a BET-05 agora']),
  chat('nome dentro de outra palavra não vale', '<SEDE>/alfa', ALFA, ['ajuste o betabloqueador do texto']),
  chat('nome depois de hífen não vale', '<SEDE>/alfa', ALFA, ['ajuste o meta-beta do texto']),
  chat('domínio citado por inteiro', '<SEDE>/beta', 'Gerente · beta', ['ajuste o alfa.exemplo.br inteiro']),
  chat('apelido do domínio com inicial maiúscula', '<SEDE>/beta', 'Gerente · beta', ['ajuste o Alfa inteiro']),
  chat('apelido do domínio em minúsculas não vale', '<SEDE>/beta', 'Gerente · beta', ['ajuste o alfa inteiro']),
  chat('caminho de pasta de outro projeto', '<SEDE>/alfa', ALFA, ['altere o arquivo <SEDE>/beta/src/x.ts']),
  chat('caminho de pasta antiga', '<SEDE>/beta', 'Gerente · beta', ['altere o arquivo <ANTIGO>/alfa/x']),
  chat('caminho da governança de outro projeto', '<SEDE>/alfa', ALFA, ['veja o <SEDE>/beta/ops/os/BET-01-x.md']),
  chat('sigla de nome comum (localhost)', '<SEDE>/alfa', ALFA, ['ajuste o LOC de hoje']),
  chat('nome comum em endereço não vale', '<SEDE>/alfa', ALFA, ['abra o localhost:3000 e ajuste']),
  chat('cita o próprio projeto: mudo', '<SEDE>/alfa', ALFA, ['ajuste o botão do alfa.exemplo.br']),
  chat('consulta: mudo', '<SEDE>/alfa', ALFA, ['qual é o status do beta?']),
  chat('mostre: mudo', '<SEDE>/alfa', ALFA, ['mostre o beta para mim']),
  chat('pergunta que é pedido educado avisa', '<SEDE>/alfa', ALFA, ['poderia ajustar o beta?']),
  chat('conversa sobre o próprio trabalho: mudo', '<SEDE>/alfa', ALFA, ['pare de mexer no beta']),
  chat('dois projetos citados', '<SEDE>/alfa', ALFA, ['ajuste o beta e o gama']),
  chat('três projetos citados', '<SEDE>/alfa', ALFA, ['ajuste o beta, o gama e o LOC']),
  chat('prompt vazio', '<SEDE>/alfa', ALFA, ['   ']),
  chat('insistência "aqui mesmo" vale logo', '<SEDE>/alfa', ALFA, ['ajuste o beta aqui mesmo', 'ajuste o beta']),
  chat('insistência com crase no meio ainda vale (a limpeza tira diacríticos)', '<SEDE>/alfa', ALFA, ['ajuste o beta, faz `aqui` mesmo', 'ajuste o beta']),
  chat('insistência depois do aviso', '<SEDE>/alfa', ALFA, ['ajuste o beta', 'mesmo assim', 'ajuste o beta']),
  chat('"pode seguir" depois do aviso insiste', '<SEDE>/alfa', ALFA, ['ajuste o beta', 'pode seguir.', 'ajuste o beta']),
  chat('"pode seguir" sem aviso é pedido comum', '<SEDE>/alfa', ALFA, ['pode seguir.', 'ajuste o beta']),
  chat('sede sem título', '<SEDE>', undefined, ['ajuste o beta']),
  chat('sede: só ID de OS é governança', '<SEDE>', undefined, ['veja a BET-05']),
  chat('sede: caminho de governança é vocabulário', '<SEDE>', undefined, ['leia <SEDE>/beta/ops/fila.md']),
  chat('Diretoria: nome sem verbo de código, mudo', '<SEDE>', 'Diretoria', ['o beta está parado']),
  chat('Diretoria: pedido de código avisa', '<SEDE>', 'Diretoria', ['altere o beta']),
  chat('Diretoria: caminho de pasta avisa', '<SEDE>', 'Diretoria', ['o arquivo <SEDE>/beta/src/x.ts está estranho']),
  chat('Secretaria: pedido de código avisa', '<SEDE>', 'Secretaria', ['corrija o beta']),
  chat('Secretaria: assunto de pendência, mudo', '<SEDE>', 'Secretaria', ['quais pendências do proprietário faltam']),
  chat('Executor em projeto cita outro projeto', '<SEDE>/alfa', 'Executor · ALF-14 rigor', ['ajuste o beta']),
  chat('Executor: lembrete na primeira vez, depois mudo', '<SEDE>/alfa', 'Executor · ALF-14 rigor', ['bom dia', 'e então']),
  chat('Executor: aviso conta como lembrete', '<SEDE>/alfa', 'Executor · ALF-14 rigor', ['ajuste o beta', 'e então']),
  chat('Executor que cita o arquivo da OS: o lembrete fica para depois', '<SEDE>/alfa', 'Executor · ALF-14 rigor', ['Execute a OS <SEDE>/alfa/ops/os/ALF-14-rigor.md']),
  chat('Executor na sede toma o projeto pela sigla', '<SEDE>', 'Executor · ALF-14 rigor', ['ajuste o beta']),
  chat('Executor da sede (sigla DIR) cita projeto', '<SEDE>', 'Executor · DIR-30 backup', ['ajuste o beta']),
  chat('Plantão cita outro projeto', '<SEDE>/alfa', 'Plantão · Deploy · alfa.exemplo.br', ['suba o beta']),
  chat('título de Gerente em pasta da sede: o cargo cai', '<SEDE>', ALFA, ['ajuste o beta']),
  chat('título de Diretoria em pasta de projeto: o cargo cai', '<SEDE>/alfa', 'Diretoria', ['ajuste o beta']),
  chat('título desconhecido', '<SEDE>/alfa', 'Conversa qualquer', ['ajuste o beta']),
  chat('pasta fora de tudo: mudo', '<FORA>/solto', ALFA, ['ajuste o beta']),
  chat('worktree de projeto em _worktrees', '<SEDE>/_worktrees/alfa-cartao', 'Executor · ALF-15 x', ['ajuste o beta']),
  chat('worktree sem dono em _worktrees: mudo', '<SEDE>/_worktrees/zzz', undefined, ['ajuste o beta']),
];

const PASTA = [
  { nome: 'pasta de projeto: mudo', cwd: '<SEDE>/alfa' },
  { nome: 'subpasta de projeto: mudo', cwd: '<SEDE>/alfa/src' },
  { nome: 'projeto fora da sede: mudo', cwd: '<FORA>/gama' },
  { nome: 'pasta antiga de projeto que migrou', cwd: '<ANTIGO>/alfa/x' },
  { nome: 'raiz da sede: mudo', cwd: '<SEDE>' },
  { nome: 'diretoria da sede: mudo', cwd: '<SEDE>/diretoria' },
  { nome: 'labs da sede: mudo', cwd: '<SEDE>/labs/x' },
  { nome: 'pasta compartilhada com "_": mudo', cwd: '<SEDE>/_shared' },
  { nome: '.claude da sede: mudo', cwd: '<SEDE>/.claude' },
  { nome: 'worktree de projeto: mudo', cwd: '<SEDE>/_worktrees/alfa-cartao' },
  { nome: 'worktree sem dono: mudo', cwd: '<SEDE>/_worktrees/zzz' },
  { nome: 'pasta da sede sem projeto', cwd: '<SEDE>/qualquer' },
  { nome: 'fora da sede, com sede por INTOCA_SEDE', cwd: '<FORA>/solto' },
  { nome: 'fora da sede, numa pasta que contém um projeto', cwd: '<FORA>' },
  { nome: 'ponteiro: pasta registrada, mudo', cwd: '<FORA>/gama/src', ponteiro: true },
  { nome: 'ponteiro: pasta antiga registrada', cwd: '<ANTIGO>/alfa/x', ponteiro: true },
  { nome: 'ponteiro: pasta que não é de nenhuma Toca', cwd: '<FORA>/solto', ponteiro: true },
  { nome: 'ponteiro: a pasta pessoal, mudo', cwd: '<CASA>', ponteiro: true },
  { nome: 'ponteiro: pasta que contém a pessoal, mudo', cwd: '<RAIZ>', ponteiro: true },
  { nome: 'ponteiro: pasta-mãe de pasta registrada, mudo', cwd: '<FORA>', ponteiro: true },
  { nome: 'ponteiro: pasta temporária do sistema, mudo', cwd: '<TMPSIS>', ponteiro: true },
  { nome: 'ponteiro: dentro da pasta temporária do sistema, mudo', cwd: '<TMPSIS>/avulso', ponteiro: true },
  { nome: 'ponteiro: worktree de cartão de repositório alheio, mudo', cwd: '<FORA>/alheio/.claude/worktrees/cartao', ponteiro: true },
  { nome: 'ponteiro: worktree em _worktrees de repositório alheio, mudo', cwd: '<FORA>/alheio2/_worktrees/cartao', ponteiro: true },
  { nome: 'ponteiro: atalho para pasta registrada (caminho real igual), mudo', cwd: '<FORA>/atalho', ponteiro: true, atalho: { de: '<FORA>/atalho', para: '<FORA>/gama' } },
  { nome: 'ponteiro: atalho para pasta que não é de nenhuma Toca', cwd: '<FORA>/atalho2', ponteiro: true, atalho: { de: '<FORA>/atalho2', para: '<FORA>/solto' } },
];

// ---------------------------------------------------------------- execução
const raiz = realpathSync.native(mkdtempSync(join(tmpdir(), 'intoca-sala-par-')));
// A pasta temporária que os hooks enxergam: fora das fixtures (a sede de mentira mora em `raiz`, que mora na temporária
// de verdade; sem isto toda fixture cairia em "pasta temporária" e o aviso nunca apareceria).
const tmpSistema = realpathSync.native(mkdtempSync(join(tmpdir(), 'intoca-sala-par-tmp-')));
const lugares = { '<SEDE>': join(raiz, 'sede-teste'), '<FORA>': join(raiz, 'fora'), '<ANTIGO>': join(raiz, 'antigo'), '<CASA>': join(raiz, 'casa'), '<RAIZ>': raiz, '<TMPSIS>': tmpSistema };
const real = (texto) => Object.entries(lugares).reduce((t, [k, v]) => t.split(k).join(v), texto);
const sigla = (texto) => {
  let t = texto.split('\\').join('/');
  for (const [k, v] of Object.entries(lugares).sort((a, b) => b[1].length - a[1].length)) t = t.split(v.split('\\').join('/')).join(k);
  return t;
};

try {
  for (const pasta of Object.values(lugares)) mkdirSync(pasta, { recursive: true });
  mkdirSync(join(lugares['<CASA>'], '.intoca'), { recursive: true });
  writeFileSync(join(lugares['<SEDE>'], 'sede.yaml'), real(MANIFESTO));
  writeFileSync(join(lugares['<CASA>'], '.intoca', 'sede'), `${lugares['<SEDE>']}\n`);
  for (const sub of ['alfa', 'beta', '_infra/local', 'diretoria', 'labs/x', '_shared', '.claude', '_worktrees/alfa-cartao', '_worktrees/zzz', 'qualquer']) mkdirSync(join(lugares['<SEDE>'], sub), { recursive: true });
  for (const sub of ['gama/src', 'solto']) mkdirSync(join(lugares['<FORA>'], sub), { recursive: true });
  mkdirSync(join(lugares['<ANTIGO>'], 'alfa', 'x'), { recursive: true });
  for (const sub of ['avulso']) mkdirSync(join(lugares['<TMPSIS>'], sub), { recursive: true });
  for (const sub of ['alheio/.claude/worktrees/cartao', 'alheio2/_worktrees/cartao']) mkdirSync(join(lugares['<FORA>'], sub), { recursive: true });
  for (const c of PASTA) if (c.atalho) symlinkSync(real(c.atalho.para), real(c.atalho.de), 'junction');

  const rodar = (arquivo, entrada, env) => {
    const r = spawnSync(process.execPath, [join(hooks, arquivo)], {
      input: JSON.stringify(entrada), encoding: 'utf8', timeout: 60000, windowsHide: true,
      env: { ...process.env, TEMP: tmpSistema, TMP: tmpSistema, TMPDIR: tmpSistema, INTOCA_SEM_AVISO_TROCADO: '', INTOCA_SEM_AVISO_PASTA: '', INTOCA_SEDE: '', INTOCA_HOME: '', CLAUDE_PROJECT_DIR: '', ...env },
    });
    if (r.status !== 0) throw new Error(`${arquivo} saiu com ${r.status}: ${r.stderr}`);
    if (!r.stdout.trim()) return null;
    return sigla(JSON.parse(r.stdout).hookSpecificOutput.additionalContext);
  };

  const saida = { chat: [], pasta: [] };
  for (const c of CHAT) {
    const sessao = `par-${Math.random().toString(36).slice(2, 10)}`;
    const esperado = c.passos.map((prompt) => rodar('chat-trocado.mjs',
      { hook_event_name: 'UserPromptSubmit', session_id: sessao, cwd: real(c.cwd), prompt: real(prompt), ...(c.titulo ? { session_title: c.titulo } : {}) },
      { INTOCA_SEDE: lugares['<SEDE>'] }));
    saida.chat.push({ ...c, esperado });
  }
  for (const c of PASTA) {
    const esperado = rodar('pasta-errada.mjs',
      { hook_event_name: 'SessionStart', source: 'startup', session_id: 'par-pasta', cwd: real(c.cwd) },
      c.ponteiro ? { INTOCA_HOME: lugares['<CASA>'] } : { INTOCA_SEDE: lugares['<SEDE>'], INTOCA_HOME: join(raiz, 'sem-casa') });
    saida.pasta.push({ ...c, esperado });
  }

  const corpo = `// GERADO por gerar.mjs a partir dos hooks reais do plugin \`intoca\`. Não editar à mão: rode o gerador.
// \`<SEDE>\`, \`<FORA>\`, \`<ANTIGO>\`, \`<CASA>\` e \`<RAIZ>\` são lugares da sede de mentira; o teste os troca por caminhos de mentira.
export type CasoChat = { nome: string; cwd: string; titulo?: string; passos: string[]; esperado: (string | null)[] }
export type CasoPasta = { nome: string; cwd: string; ponteiro?: boolean; atalho?: { de: string; para: string }; esperado: string | null }

export const MANIFESTO_PARIDADE = ${JSON.stringify(MANIFESTO)}

export const CASOS_CHAT: CasoChat[] = ${JSON.stringify(saida.chat, null, 2)}

export const CASOS_PASTA: CasoPasta[] = ${JSON.stringify(saida.pasta, null, 2)}
`;
  writeFileSync(join(aqui, 'casos.ts'), corpo);
  const avisos = saida.chat.flatMap((c) => c.esperado).filter(Boolean).length;
  console.log(`casos.ts gravado: ${saida.chat.length} sequências de chat (${avisos} avisos) e ${saida.pasta.length} de pasta`);
} finally {
  for (const pasta of [raiz, tmpSistema]) {
    try { rmSync(pasta, { recursive: true, force: true }); } catch { /* resto fica na pasta temporária */ }
  }
}
