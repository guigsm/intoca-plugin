#!/usr/bin/env node
// Hook Stop do plugin intoca.
// Se a sessão tem uma OS detectada (estado gravado por prompt-os.mjs em os.tmpdir()/intoca-hooks/)
// e o relatório dela não existe, bloqueia a parada uma única vez por sessão, pedindo o relatório.
// Sem OS detectada ou sem sede (sede.yaml acima do cwd, ou INTOCA_SEDE): sem saída.
// Só lê o estado da sessão e confere a existência de um arquivo. Sem rede.
// Nunca derruba o chat: qualquer erro interno termina em exit 0 sem saída.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { lerEntrada, raizes, sessaoValida, arquivoDeEstado, montarContexto, lerManifesto, cargoDoTitulo, projetosDaSigla } from './lib.mjs';

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));

function main() {
  const entrada = lerEntrada();
  if (!entrada) return;
  if (entrada.hook_event_name && entrada.hook_event_name !== 'Stop') return;
  if (entrada.stop_hook_active === true) return;

  const sessao = String(entrada.session_id || '');
  if (!sessaoValida(sessao)) return;
  const raiz = raizes(entrada);
  if (!raiz) return; // sem sede: nada a cobrar
  const arquivoEstado = arquivoDeEstado(sessao);
  let estado;
  try { estado = JSON.parse(readFileSync(arquivoEstado, 'utf8')); } catch { return; }
  if (!estado || typeof estado.os !== 'string' || !estado.os) return;
  if (estado.bloqueioEmitido === true) return;
  // Só se cobra relatório de quem foi contratado para executar a OS: o estado só ganha `executor` quando o próprio
  // chat recebeu a ordem de executar (prompt-os), e o título do chat, quando vem, não pode dizer outro cargo
  // nem outra OS. Quem apenas escreveu a OS (o gerente) não deve relatório dela (PLG-25).
  if (estado.executor !== true) return;
  let ctx = null;
  try { ctx = montarContexto(entrada); } catch { /* segue só com as raízes */ }
  const cargo = cargoDoTitulo(entrada.session_title, (ctx?.manifesto ?? raiz.manifesto ?? lerManifesto(raiz.sede))?.titulos);
  if (cargo && (cargo.cargo !== 'Executor' || cargo.os.toUpperCase() !== estado.os.toUpperCase())) return;

  const relDir = typeof estado.relatorioRel === 'string' && estado.relatorioRel
    ? estado.relatorioRel : 'diretoria/relatorios';
  // O relatório pode estar na worktree do executor ou na raiz da sede: basta existir em uma.
  const roots = [...new Set([raiz.projeto, raiz.local, raiz.sede])];
  // Também onde a OS mora de fato (a pasta dos relatórios ao lado dela) e as pastas do projeto da sigla da OS,
  // pelo manifesto: o executor da sala animada roda em `sala\app` e a governança fica em `plugin\ops` (PLG-25).
  const lugares = roots.map((r) => join(r, relDir));
  if (typeof estado.relatorioAbs === 'string' && estado.relatorioAbs) lugares.push(estado.relatorioAbs);
  for (const proj of projetosDaSigla(ctx?.projetos ?? [], estado.os)) {
    for (const f of proj.pastas) lugares.push(join(f.lex, relDir), join(f.lex, 'ops', 'relatorios'));
  }
  const existe = lugares.some((l) => existsSync(join(l, `${estado.os}.md`)));
  if (existe) return;

  // Marca antes de bloquear: se não der para gravar a marca, não bloqueia (evita laço).
  estado.bloqueioEmitido = true;
  try { writeFileSync(arquivoEstado, JSON.stringify(estado)); } catch { return; }

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `OS ${estado.os} sem relatório: grave ${relDir}/${estado.os}.md ou registre por que parou`,
  }));
}

try { main(); } catch { /* hook nunca derruba o chat */ }
