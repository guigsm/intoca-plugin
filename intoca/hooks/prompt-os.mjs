#!/usr/bin/env node
// Hook UserPromptSubmit do plugin intoca.
// Se o prompt manda executar uma OS (arquivo dentro de uma pasta os/), lê o cabeçalho da OS,
// guarda no estado da sessão só o ID, o tema, o modelo previsto, o recurso e a autorização, e
// devolve additionalContext. Não altera o prompt. Não grava conteúdo de prompt. Sem rede.
// O estado vai para a pasta temporária do sistema (os.tmpdir()/intoca-hooks/), nunca para a pasta
// do plugin. Sem sede (sede.yaml acima do cwd ou INTOCA_SEDE): sai sem saída.
// Nunca derruba o chat: qualquer erro interno termina em exit 0 sem saída.
import { readFileSync, statSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve, relative, posix, dirname } from 'node:path';
import {
  ESTADO, lerEntrada, raizes, dentro, sessaoValida, arquivoDeEstado, montarContexto, lerManifesto, cargoDoTitulo,
  textoDoProprietario, projetosDaSigla, mesmoCaminho,
} from './lib.mjs';

process.on('uncaughtException', () => process.exit(0));
process.on('unhandledRejection', () => process.exit(0));

const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

// Caminho terminado em os/<arquivo>.md, absoluto ou relativo, com ou sem unidade de disco.
const CAMINHO_OS = /(?<![\w.-])((?:[A-Za-z]:)?(?:[^\s"'`<>|*?()]*[\\/])?os[\\/][^\s"'`<>|*?()\\/]+\.md)/g;
const NOME_OS = /^([A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?)(?:-(.+))?\.md$/;

// Limpeza barata: apaga estado de sessão com mais de 30 dias. Qualquer falha é ignorada.
function limparAntigos() {
  try {
    const agora = Date.now();
    for (const nome of readdirSync(ESTADO)) {
      if (!nome.endsWith('.json')) continue;
      const caminho = join(ESTADO, nome);
      try { if (agora - statSync(caminho).mtimeMs > TRINTA_DIAS) unlinkSync(caminho); } catch { /* segue */ }
    }
  } catch { /* pasta ainda não existe */ }
}

function lerTexto(caminho) {
  try {
    if (statSync(caminho).size > 300000) return null;
    return readFileSync(caminho, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  } catch {
    return null;
  }
}

const limpar = (t) => String(t ?? '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const cortar = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

// Só vale como ordem de execução: um verbo de execução antes do caminho na mesma linha, ou um
// prompt que é praticamente só o caminho. Quem apenas cita uma OS numa conversa não vira executor.
function ehOrdem(prompt, ocorrencia) {
  const inicioLinha = prompt.lastIndexOf('\n', ocorrencia.index) + 1;
  const antes = prompt.slice(inicioLinha, ocorrencia.index);
  if (/\b(?:execute|executar|cumpra|cumprir)\b/i.test(antes)) return true;
  const resto = prompt.replace(ocorrencia[0], '').replace(/[@"'`\s]/g, '');
  return resto.length <= 24;
}

// Pastas do(s) projeto(s) que respondem à sigla do arquivo citado (PLG-25): a OS PLG-25 mora na pasta do projeto
// da sigla PLG (ou da sigla antiga que o manifesto atribui a ele), qualquer que seja o cwd do executor.
function pastasDaSigla(ctx, nomeDoArquivo) {
  const id = nomeDoArquivo.match(NOME_OS)?.[1];
  if (!ctx || !id) return [];
  const pastas = [];
  for (const proj of projetosDaSigla(ctx.projetos, id)) {
    for (const f of proj.pastas) pastas.push(resolve(f.lex));
  }
  return pastas;
}

// roots: pastas onde uma OS pode estar (projeto da sessão, pasta com sede.yaml mais próxima e a
// raiz viva da sede), sem repetição; mais as pastas do projeto da sigla da OS, pelo manifesto.
function localizarOs(prompt, roots, ctx) {
  for (const m of prompt.matchAll(CAMINHO_OS)) {
    if (!ehOrdem(prompt, m)) continue;
    const citado = m[1];
    const daSigla = pastasDaSigla(ctx, citado.split(/[\\/]/).pop());
    const todas = [...new Set([...daSigla, ...roots])]; // a pasta do projeto da sigla vale como raiz da OS antes das outras
    const candidatos = /^(?:[A-Za-z]:[\\/]|[\\/])/.test(citado)
      ? [resolve(citado)]
      : [...roots, ...daSigla.flatMap((d) => [d, join(d, 'ops')])].map((r) => resolve(r, citado));
    for (const arquivo of candidatos) {
      const raiz = todas.find((r) => dentro(r, arquivo));
      if (!raiz) continue;
      try { if (!statSync(arquivo).isFile()) continue; } catch { continue; }
      const nome = arquivo.split(/[\\/]/).pop();
      const partes = nome.match(NOME_OS);
      if (!partes) continue;
      const rel = relative(raiz, arquivo).split(/[\\/]/).join('/');
      const pastaDosRelatorios = join(dirname(dirname(arquivo)), 'relatorios');
      const relatorioRel = posix.join(posix.dirname(posix.dirname(rel)), 'relatorios');
      return {
        arquivo,
        id: partes[1],
        tema: (partes[2] || '').replace(/-/g, ' '),
        relatorioRel,
        // Onde o relatório vai de fato: ao lado da OS, e não relativo ao cwd do executor. Nas duas primeiras raízes
        // (a pasta da sessão e a pasta com sede.yaml mais próxima) o caminho relativo basta; fora delas (OS de outro
        // projeto, da sede, ou achada pela sigla) o texto leva o caminho completo.
        relatorioAbs: pastaDosRelatorios,
        relatorioNoTexto: roots.slice(0, 2).some((r) => mesmoCaminho(r, raiz)) ? relatorioRel : pastaDosRelatorios.split('\\').join('/'),
      };
    }
  }
  return null;
}

function extrairCabecalho(texto) {
  const topo = texto.slice(0, 8000);
  const m1 = topo.match(/Modelo previsto\s*:\s*([^*\n]+?)\.?\s*\*\*/);
  const m2 = topo.match(/Modelo previsto\s*:\s*\*\*\s*([^\n*]+)/);
  const modelo = limpar((m1 || m2 || [])[1] || '').replace(/\.$/, '');

  let recurso = '';
  const r = topo.match(/\*\*Recurso ocupado\s*:?\*\*\s*:?\s*([\s\S]*?)(?=\n\s*\n|\*\*Autoriza)/);
  if (r) recurso = limpar(r[1]).split(/\.\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)[0].replace(/\.$/, '');

  let autorizacao = '';
  const a = topo.match(/\*\*Autoriza[cç][aã]o\s*:?\*\*\s*:?\s*([^\n]*)/);
  if (a) {
    const texto = limpar(a[1]);
    const arquivo = texto.match(/[\w./\\-]*autorizacoes[\\/][^\s'")]+\.md/);
    autorizacao = arquivo ? `arquivo ${arquivo[0]}` : /^\W*nenhuma/i.test(texto) ? 'nenhuma' : cortar(texto, 120);
  }
  return {
    modelo: cortar(modelo, 60) || 'não informado',
    recurso: cortar(recurso, 300) || 'não informado',
    autorizacao: autorizacao || 'não informada',
  };
}

function main() {
  const entrada = lerEntrada();
  if (!entrada || typeof entrada.prompt !== 'string') return;
  if (entrada.hook_event_name && entrada.hook_event_name !== 'UserPromptSubmit') return;
  if (!entrada.prompt || entrada.prompt.length > 200000) return;
  // Só o que o proprietário digitou vale como ordem: mensagem entre chats, notificação e texto colado não (PLG-25).
  const prompt = textoDoProprietario(entrada.prompt, { citacoes: false }); // ordem digitada em bloco de código ou citação continua valendo
  if (!prompt) return;
  const raiz = raizes(entrada);
  if (!raiz) return; // fora da jurisdição da sede: sem saída
  const roots = [...new Set([raiz.projeto, raiz.local, raiz.sede])];
  let ctx = null;
  try { ctx = montarContexto(entrada); } catch { /* sem contexto, só as raízes */ }
  const manifesto = ctx?.manifesto ?? raiz.manifesto ?? lerManifesto(raiz.sede);

  // O cargo vem do título do próprio chat: quem tem título de outro cargo (Gerente, Diretoria...) não é executor,
  // por mais que a mensagem cite uma OS (PLG-25).
  const cargo = cargoDoTitulo(entrada.session_title, manifesto?.titulos);
  if (cargo && cargo.cargo !== 'Executor') return;

  const os = localizarOs(prompt, roots, ctx);
  if (!os) return;
  // Título "Executor · <ID>": só é executor da OS do título; citar outra OS não o contrata para ela.
  if (cargo && cargo.os.toUpperCase() !== os.id.toUpperCase()) return;
  const texto = lerTexto(os.arquivo);
  if (texto === null) return;
  const cab = extrairCabecalho(texto);

  const sessao = String(entrada.session_id || '');
  if (sessaoValida(sessao)) {
    try {
      mkdirSync(ESTADO, { recursive: true });
      limparAntigos();
      const arquivoEstado = arquivoDeEstado(sessao);
      let anterior = null;
      try { anterior = JSON.parse(readFileSync(arquivoEstado, 'utf8')); } catch { /* sem estado prévio */ }
      const mesma = anterior && anterior.os === os.id;
      // Mescla com o estado existente: as marcas do chat-trocado (avisoTrocado) e outros campos que não
      // são deste hook sobrevivem à regravação (PLG-02b).
      const outros = anterior && typeof anterior === 'object' && !Array.isArray(anterior) ? anterior : {};
      writeFileSync(arquivoEstado, JSON.stringify({
        ...outros,
        os: os.id,
        tema: os.tema,
        modelo: cab.modelo,
        recurso: cab.recurso,
        autorizacao: cab.autorizacao,
        relatorioRel: os.relatorioRel,
        relatorioAbs: os.relatorioAbs,
        executor: true,
        bloqueioEmitido: mesma ? Boolean(anterior.bloqueioEmitido) : false,
      }));
    } catch { /* sem estado, o contexto ainda é entregue */ }
  }

  const contexto = `Você é Executor · ${os.id}${os.tema ? ` ${os.tema}` : ''}. Modelo previsto ${cab.modelo}. `
    + `Recurso: ${cab.recurso}. Autorização: ${cab.autorizacao}. `
    + `Confira o modelo antes de agir; grave ${os.relatorioNoTexto}/${os.id}.md ao terminar.`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: contexto },
  }));
}

try { main(); } catch { /* hook nunca derruba o chat */ }
