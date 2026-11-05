#!/usr/bin/env node
// Cria a sede nova do /intoca:comecar (PLG-03). Node, sem dependência, sem rede.
//
// Uso:  node criar-sede.mjs <arquivo.json>      respostas num arquivo JSON
//       node criar-sede.mjs -                   respostas pela entrada padrão (também sem argumento)
// Saída: um JSON no stdout com { ok, acao, simulado, sede, pastaDoProjeto, criados, jaExistiam, erros,
//        ponteiro, gerente, manifesto }. Código 0 sem erros, 1 com erros (e nesse caso nada foi escrito
//        quando o erro é de validação).
//
// Ações (campo "acao", padrão "criar"):
//   criar    copia a sede de partida (templates/sede, conforme templates/INDICE.md) para sede.pasta,
//            escreve o sede.yaml, cria a pasta do primeiro projeto e, só se pedido, o ponteiro da sede.
//            Com "projeto": null a sede é criada sem primeiro projeto (as pastas que a pessoa já tem entram pelo adotar).
//   projeto  sede já existente: cria só a pasta de mais um projeto e devolve o item do manifesto para a
//            pessoa registrar. Não altera o sede.yaml.
//   estado   só lê: devolve nome, modo, perfil e projetos da sede achada (ou da pasta dada), mais `pluginMinimo`
//            (o `plugin_minimo` do manifesto, INT-05), `pluginAtual` e `avisoDeVersao` (só aviso, nunca bloqueia).
//   olhar    só lê (PLG-23): olha uma pasta que a pessoa já tem (Git, carta própria, .env só pelo nome,
//            pasta sincronizada, dono) e devolve o que viu, para a skill perguntar só o que ainda não sabe.
//   adotar   (PLG-23) sede já existente e uma pasta que já existe: "como":"registrar" deixa a pasta onde
//            está (cria só ops/ e a carta que faltam, sem tocar no que existe); "como":"mover" a traz para
//            dentro da sede com um único rename, na mesma unidade de disco, e recusa o que ofereça risco.
//            Só simula, a menos que a entrada diga "simular": false (e, no mover, "confirmado": true e o "codigo"
//            que a simulação devolveu em codigoDoPlano: o "sim" fica amarrado àquele plano).
//            Não altera o sede.yaml: devolve o item do manifesto e a linha do mapa.
//
// Entrada (criar e projeto):
//   { "simular": true|false,           true: nada é escrito; só diz o que seria criado
//     "data": "AAAA-MM-DD",            opcional (padrão: hoje)
//     "sede": { "nome", "pasta", "modo": "agregadora|registro", "perfil": "iniciante|ocasional|desenvolvedor" },
//     "titulos": { "gerente", "diretoria", "secretaria", "plantao", "executor" },      opcional
//     "projeto": { "nome", "tipo", "porte", "sigla", "pasta", "repositorio" },
//     "ponteiro": true|false }          true: grava <pasta do usuário>/.intoca/sede (só com o "sim")
//   Entrada do adotar: { "acao":"adotar", "como":"registrar|mover", "simular":true|false, "confirmado":true,
//     "sede": { "pasta" } (opcional: sem ela acha a sede como o estado),
//     "confirmado": true, "codigo": <codigoDoPlano da simulação>   (os dois só para o mover real)
//     "projeto": { "nome", "tipo", "porte", "sigla", "repositorio", "pasta": <a pasta que já existe>,
//                  "destino": <opcional, só no mover: um caminho dentro da sede> } }
//   Entrada do olhar:  { "acao":"olhar", "pasta": <a pasta que já existe> }
//
// Regras: nunca sobrescreve nem apaga arquivo (o que já existe sai em "jaExistiam" e fica como estava);
// recusa caminho com "..", pasta que é link e qualquer arquivo que passaria por um link; nenhum caminho
// de máquina vai para os arquivos copiados (só o sede.yaml e o ponteiro, que são da camada local).
// O script nunca apaga. O único movimento de pasta é o rename do `adotar` com "como":"mover" (moverPasta).
import { readFileSync, writeFileSync, mkdirSync, lstatSync, statSync, readdirSync, renameSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve, relative, isAbsolute, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TITULOS_PADRAO, padraoDeTituloValido, absoluto, contem, mesmoCaminho, pastaDoUsuario, acharSede,
  sedeIndicada, interpretarManifesto, lerManifesto, caminhoReal, ehEnvDeSegredo,
} from '../hooks/lib.mjs';

const PACOTE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(PACOTE, 'templates');
const MODELOS_DE_PROJETO = ['diretoria', 'modelos', 'projeto'];

const TIPOS = ['site', 'app', 'servico', 'documento', 'relatorio-bi', 'operacao'];
const PORTES = Object.assign(Object.create(null), { ocasional: 'ocasional', pequeno: 'pequeno', medio: 'medio', 'médio': 'medio', grande: 'grande' });
const ROTULO_DO_PORTE = { ocasional: 'ocasional', pequeno: 'pequeno', medio: 'médio', grande: 'grande' };
const MODOS = Object.assign(Object.create(null), { agregadora: 'agregadora', agregador: 'agregadora', registro: 'registro' });
const PERFIS = ['iniciante', 'ocasional', 'desenvolvedor'];
const LIMITE_DA_ENTRADA = 65536;
// Primeiro nível da sede onde um projeto não mora (governança, infraestrutura, isolamento).
const PASTAS_DA_SEDE = new Set(['diretoria', '.claude', '.git', 'labs']);
const RESERVADOS_DO_WINDOWS = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const ID_DA_MENSAGEM = 'DIR-17';

class Recusa extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

// ------------------------------------------------------------ validação das respostas

const SEM_CONTROLE = /\p{C}/u;

// Texto de uma linha só, sem caractere de controle. `estrito`: também sem < > | ` (vão para tabelas e marcadores).
function texto(valor, rotulo, { max = 80, estrito = true } = {}) {
  if (typeof valor !== 'string') throw new Recusa('resposta-ausente', `${rotulo}: faltou a resposta`);
  const t = valor.replace(/\s+/g, ' ').trim();
  if (t === '') throw new Recusa('resposta-ausente', `${rotulo}: a resposta está vazia`);
  if (t.length > max) throw new Recusa('resposta-longa', `${rotulo}: no máximo ${max} caracteres`);
  if (SEM_CONTROLE.test(t)) throw new Recusa('resposta-invalida', `${rotulo}: caractere de controle não vale`);
  if (estrito && /[<>|`]/.test(t)) throw new Recusa('resposta-invalida', `${rotulo}: não use < > | nem crase`);
  return t;
}

const slugDe = (nome) => nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^a-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40).replace(/[-.]+$/g, '');

// Caminho absoluto, sem "..", sem caractere de controle, que não é a raiz do disco nem a pasta do usuário.
function pastaPedida(valor, rotulo) {
  if (typeof valor !== 'string' || valor.trim() === '') throw new Recusa('pasta-ausente', `${rotulo}: faltou a pasta`);
  const bruto = valor.trim();
  if (SEM_CONTROLE.test(bruto)) throw new Recusa('pasta-invalida', `${rotulo}: caractere de controle no caminho`);
  if (!absoluto(bruto)) throw new Recusa('pasta-invalida', `${rotulo}: informe o caminho completo da pasta`);
  const partes = bruto.split(/[\\/]+/);
  if (partes.includes('..')) throw new Recusa('pasta-invalida', `${rotulo}: caminho com ".." não vale`);
  // O Windows ignora ponto e espaço no fim de um nome (`sede.` é `sede`): o caminho não seria o que parece.
  if (partes.some((x) => x !== '.' && /[. ]$/.test(x))) throw new Recusa('pasta-invalida', `${rotulo}: nome de pasta terminado em ponto ou espaço não vale`);
  if (partes.includes('.git')) throw new Recusa('pasta-invalida', `${rotulo}: não use pasta interna do Git`);
  const caminho = resolve(bruto);
  if (dirname(caminho) === caminho) throw new Recusa('pasta-invalida', `${rotulo}: a raiz do disco não serve`);
  const casa = pastaDoUsuario();
  if (casa && mesmoCaminho(casa, caminho)) throw new Recusa('pasta-invalida', `${rotulo}: escolha uma subpasta, não a pasta pessoal inteira`);
  if (casa && contem(caminho, casa)) throw new Recusa('pasta-invalida', `${rotulo}: a pasta pessoal não pode ficar dentro dela`);
  return caminho;
}

function dataValida(valor) {
  const d = valor ?? hoje();
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Recusa('data-invalida', 'data: use AAAA-MM-DD');
  return d;
}

function hoje() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

function titulosPedidos(valor) {
  const titulos = { ...TITULOS_PADRAO };
  if (valor === undefined || valor === null) return titulos;
  if (typeof valor !== 'object' || Array.isArray(valor)) throw new Recusa('titulo-invalido', 'titulos: esperava um conjunto de padrões');
  for (const [chave, padrao] of Object.entries(valor)) {
    if (!Object.hasOwn(TITULOS_PADRAO, chave)) throw new Recusa('titulo-invalido', `titulos: o cargo "${chave}" não existe`);
    if (!padraoDeTituloValido(chave, padrao)) {
      throw new Recusa('titulo-invalido', `titulos.${chave}: padrão recusado (até 60 caracteres, uma linha, só {projeto}, {funcao}, {id} e {tema}, e o que o cargo precisa)`);
    }
    titulos[chave] = padrao.replace(/\s+/g, ' ');
  }
  return titulos;
}

// Nome, tipo, porte, sigla e repositório do projeto (o que vale para criar, registrar ou trazer uma pasta).
function camposDoProjeto(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Recusa('resposta-ausente', 'projeto: faltou o projeto');
  const nome = texto(p.nome, 'projeto.nome');
  const slug = slugDe(nome);
  if (!/^[a-z0-9][a-z0-9.-]{0,39}$/.test(slug)) throw new Recusa('resposta-invalida', 'projeto.nome: use letras ou números no nome');
  if (!TIPOS.includes(p.tipo)) throw new Recusa('tipo-inexistente', `projeto.tipo: "${String(p.tipo)}" não existe; use ${TIPOS.join(', ')}`);
  const porte = PORTES[String(p.porte ?? 'pequeno').toLowerCase()];
  if (!porte) throw new Recusa('porte-inexistente', `projeto.porte: "${String(p.porte)}" não existe; use ocasional, pequeno, medio ou grande`);
  if (RESERVADOS_DO_WINDOWS.test(slug.split('.')[0])) throw new Recusa('resposta-invalida', 'projeto.nome: esse nome é reservado pelo Windows; escolha outro');
  const sugerida = slug.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
  const sigla = p.sigla === undefined || p.sigla === null || p.sigla === ''
    ? (sugerida.length >= 2 && sugerida !== 'DIR' ? sugerida : 'PRJ')
    : String(p.sigla);
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(sigla) || sigla === 'DIR') {
    throw new Recusa('sigla-invalida', 'projeto.sigla: 2 a 8 letras maiúsculas ou números, começando por letra (DIR é da Diretoria)');
  }
  let repo = null;
  if (p.repositorio !== undefined && p.repositorio !== null && p.repositorio !== '') {
    repo = slugDe(texto(p.repositorio, 'projeto.repositorio', { max: 40 }));
    if (!repo) throw new Recusa('resposta-invalida', 'projeto.repositorio: use letras ou números');
  }
  return { nome, slug, tipo: p.tipo, porte, sigla, repo };
}

function projetoPedido(entrada, sede) {
  const p = entrada.projeto;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Recusa('resposta-ausente', 'projeto: faltou o primeiro projeto');
  const { nome, slug, tipo, porte, sigla, repo } = camposDoProjeto(p);
  let pasta;
  if (sede.modo === 'agregadora') {
    const padrao = join(sede.pasta, slug, repo ?? (['site', 'app', 'servico'].includes(p.tipo) ? p.tipo : 'principal'));
    pasta = p.pasta ? pastaPedida(p.pasta, 'projeto.pasta') : padrao;
    if (!contem(sede.pasta, pasta)) throw new Recusa('pasta-invalida', 'projeto.pasta: na sede agregadora o projeto mora dentro da pasta da sede');
    const primeiro = relative(sede.pasta, pasta).split(/[\\/]+/)[0].toLowerCase();
    if (PASTAS_DA_SEDE.has(primeiro) || primeiro.startsWith('_')) throw new Recusa('pasta-invalida', `projeto.pasta: "${primeiro}" é pasta reservada da sede`);
  } else {
    pasta = pastaPedida(p.pasta, 'projeto.pasta');
  }
  if (mesmoCaminho(pasta, sede.pasta) || contem(pasta, sede.pasta)) {
    throw new Recusa('pasta-invalida', 'projeto.pasta: o projeto não pode ser a pasta da sede nem uma pasta que a contém');
  }
  return { nome, slug, tipo, porte, sigla, pasta };
}

// ------------------------------------------------------------ modelos da sede de partida

const lf = (t) => t.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const lerModelo = (rel) => lf(readFileSync(join(TEMPLATES, 'sede', ...rel.split('/')), 'utf8'));

// Linhas da tabela "Arquivos" do INDICE.md: { arquivo, destino, preencher }. É o contrato da cópia.
function linhasDoIndice() {
  const t = lf(readFileSync(join(TEMPLATES, 'INDICE.md'), 'utf8'));
  const ini = t.indexOf('\n## Arquivos');
  const fim = t.indexOf('\n## ', ini + 1);
  const corpo = t.slice(ini, fim < 0 ? undefined : fim);
  const sem = (c) => c.replace(/^`|`$/g, '');
  return corpo.split('\n').filter((l) => l.startsWith('| `')).map((l) => {
    const c = l.slice(1, l.lastIndexOf('|')).split(' | ').map((x) => x.trim());
    return { arquivo: sem(c[0]), destino: sem(c[1]), preencher: c[4] ?? '' };
  });
}

function arquivosDe(dir, rel = '') {
  const lista = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) lista.push(...arquivosDe(join(dir, e.name), r));
    else lista.push(r);
  }
  return lista.sort();
}

const trocar = (t, mapa) => Object.entries(mapa).reduce((acc, [de, para]) => acc.split(de).join(para), t);
const aspas = (s) => `'${s.replace(/'/g, "''")}'`;
const aplicar = (padrao, valores) => padrao.replace(/\{(projeto|funcao|id|tema)\}/g, (_, k) => valores[k] ?? `{${k}}`);

// ------------------------------------------------------------ o que vai ser escrito

function itemDoManifesto(p, titulos) {
  return [
    `  - nome: ${aspas(p.nome)}`,
    `    sigla: ${p.sigla}`,
    `    tipo: ${p.tipo}`,
    `    porte: ${p.porte}`,
    '    status: ativo',
    `    pasta_atual: ${aspas(p.pasta)}`,
    ...(p.antigas?.length ? [`    pastas_antigas: [${p.antigas.map(aspas).join(', ')}]`] : []),
    '    repositorio: null',
    '    branch_principal: main',
    "    stack: 'a definir'",
    '    porta_dev: null',
    '    deploy: null',
    `    gerente: ${aspas(aplicar(titulos.gerente, { projeto: p.nome }))}`,
  ].join('\n');
}

function manifesto(sede, p, titulos, data) {
  let y = trocar(lerModelo('sede.yaml'), { '<nome-da-sede>': sede.nome, '<AAAA-MM-DD>': data });
  y = y.replace(/^ {2}nome: .*$/m, () => `  nome: ${aspas(sede.nome)}`);
  y = y.replace(/^ {2}# modo:.*$/m, () => `  modo: ${sede.modo}`);
  y = y.replace(/^ {2}# perfil:.*$/m, () => `  perfil: ${sede.perfil}`);
  if (p) y = y.replace(/^projetos: \[\][ \t]*$/m, () => `projetos:\n${itemDoManifesto(p, titulos)}`);
  const bloco = ['titulos:', ...Object.keys(TITULOS_PADRAO).map((k) => `  ${k}: ${aspas(titulos[k])}`)].join('\n');
  y = y.replace(/^# titulos:\n(?:# {3}.*\n?)+/m, () => `${bloco}\n`);
  return y;
}

function mapa(sede, p, titulos, data) {
  if (!p) return lerModelo('WORKSPACE.md');
  const onde = sede.modo === 'agregadora'
    ? `<sede>/${relative(sede.pasta, p.pasta).split(/[\\/]+/).join('/')}`
    : 'fora da sede (ver `sede.yaml`)';
  const linha = `| ${p.nome} | ${p.tipo} | ${p.porte} | ${onde} | - |`;
  return lerModelo('WORKSPACE.md')
    .replace('| --- | --- | --- | --- | --- |', (cab) => `${cab}\n${linha}`);
}

function mensagemDoGerente(p, titulos, data) {
  const titulo = aplicar(titulos.gerente, { projeto: p.nome });
  return [
    `# Primeira mensagem do ${titulo}`,
    '',
    `Gravada em ${data} pelo \`/intoca:comecar\`. Serve para abrir o chat do gerente do projeto ${p.nome}.`,
    '',
    '## Como abrir o chat (à mão)',
    '',
    '1. No app do Claude Code, abra um **chat novo** na pasta do projeto: a pasta que o `sede.yaml` guarda como',
    `   \`pasta_atual\` do projeto ${p.nome}. É lá que ficam a carta (\`AGENTS.md\`) e o \`ops/\`.`,
    `2. Dê ao chat o título **${titulo}** (o plugin reconhece o cargo por ele).`,
    '3. Se o app tiver seções na barra lateral, coloque o chat na seção do projeto.',
    '4. Cole a mensagem abaixo e envie.',
    '',
    'Por que à mão: um cartão de tarefa abriria o chat aninhado sob outro e dentro de uma worktree, e o gerente',
    'precisa ficar na pasta principal do projeto.',
    '',
    '## A mensagem',
    '',
    '```text',
    `Você assume o cargo de ${titulo}.`,
    '',
    'Antes de qualquer coisa, leia nesta ordem:',
    '1. a carta do projeto, o `AGENTS.md` desta pasta;',
    '2. `ops/fila.md`, se existir (a fila do projeto);',
    '3. o regimento da sede, o `AGENTS.md` na raiz da sede (o plugin informa o caminho da sede no início do chat);',
    '4. se o vocabulário for novo para mim, `/intoca:memorando`.',
    '',
    'Depois confira o modelo desta sessão com o que o regimento prevê para o seu cargo e registre-se na fila.',
    'Apresente-se em poucas linhas: o que é este projeto, o que já existe nesta pasta e qual primeira tarefa',
    'você sugere. Em tarefa de nível N3 ou maior, faça a triagem completa e espere o meu "vai".',
    'Não publique nada e não envie nada a terceiros: isso exige uma autorização por escrito, que ainda não existe.',
    '```',
    '',
  ].join('\n');
}

function backlogInicial(p) {
  return `# Backlog de ${p.nome}\n\nLista de produto do projeto: o que se quer construir, em ordem de prioridade. O gerente a mantém.\n\n- (nada ainda)\n`;
}

function planoDoProjeto(p, data) {
  const base = [...MODELOS_DE_PROJETO, p.tipo];
  const marcadores = {
    '<projeto>': p.nome, '<PREFIXO>': p.sigla, '<AAAA-MM-DD>': data, '<repositório>': basename(p.pasta),
    '<ocasional | pequeno | médio | grande>': ROTULO_DO_PORTE[p.porte],
  };
  const itens = [];
  for (const rel of arquivosDe(join(TEMPLATES, 'sede', ...base))) {
    if (p.porte === 'ocasional' && rel.startsWith('ops/')) continue; // porte ocasional: só a carta curta
    itens.push({ onde: 'projeto', rel, conteudo: trocar(lerModelo([...base, rel].join('/')), marcadores) });
  }
  if (p.porte === 'medio' || p.porte === 'grande') itens.push({ onde: 'projeto', rel: 'docs/backlog.md', conteudo: backlogInicial(p) });
  return itens;
}

function planoDaSede(sede, p, titulos, data) {
  const itens = [];
  for (const { arquivo, destino, preencher } of linhasDoIndice()) {
    let conteudo;
    if (arquivo === 'sede.yaml') conteudo = manifesto(sede, p, titulos, data);
    else if (arquivo === 'WORKSPACE.md') conteudo = trocar(mapa(sede, p, titulos, data), { '<nome-da-sede>': sede.nome, '<AAAA-MM-DD>': data });
    else {
      const m = {};
      if (preencher.includes('<nome-da-sede>')) m['<nome-da-sede>'] = sede.nome;
      if (preencher.includes('<AAAA-MM-DD>')) m['<AAAA-MM-DD>'] = data;
      conteudo = trocar(lerModelo(arquivo), m);
    }
    itens.push({ onde: 'sede', rel: destino, conteudo });
  }
  return itens;
}

// ------------------------------------------------------------ escrita sem sobrescrever

const partesSeguras = (rel) => {
  const partes = String(rel).split('/');
  return partes.length > 0 && partes.every((x) => x !== '' && x !== '.' && x !== '..' && !/[\\:\u0000]/.test(x)) ? partes : null;
};

// A pasta raiz de uma escrita: existe e é pasta de verdade (não link), ou não existe e será criada.
function conferirRaiz(raiz, rotulo) {
  let info = null;
  try { info = lstatSync(raiz); } catch { return; }
  if (info.isSymbolicLink()) throw new Recusa('destino-e-link', `${rotulo}: a pasta é um link; escolha a pasta de verdade`);
  if (!info.isDirectory()) throw new Recusa('destino-e-arquivo', `${rotulo}: existe um arquivo com esse nome`);
}

// Os níveis entre a pasta da sede e a pasta do projeto (que ficam fora do que `gravar` confere) não podem
// ser link: o projeto cairia fora da sede, e o manifesto diria que está dentro.
function conferirCaminhoAteOProjeto(sede, projeto) {
  if (!contem(sede, projeto)) return;
  let atual = sede;
  for (const parte of relative(sede, projeto).split(/[\\/]+/)) {
    atual = join(atual, parte);
    let info = null;
    try { info = lstatSync(atual); } catch { return; } // daqui para baixo nada existe
    if (info.isSymbolicLink()) throw new Recusa('destino-e-link', `projeto.pasta: passa por um link (${parte}); escolha uma pasta de verdade`);
    if (!info.isDirectory()) throw new Recusa('destino-e-arquivo', `projeto.pasta: existe um arquivo (${parte}) no lugar de pasta`);
  }
}

// Escreve `conteudo` em <raiz>/<rel> se o arquivo não existe. Devolve 'criado' | 'ja-existia'; lança Recusa
// se o caminho passaria por um link ou por um arquivo no lugar de pasta. Com `simular`, não escreve.
function gravar(raiz, rel, conteudo, simular) {
  const partes = partesSeguras(rel);
  if (!partes) throw new Recusa('caminho-invalido', `caminho de modelo inválido: ${rel}`);
  const destino = join(raiz, ...partes);
  if (!contem(raiz, destino)) throw new Recusa('fora-da-pasta', `${rel}: sairia da pasta pedida`);
  let atual = raiz;
  for (let i = 0; i < partes.length; i += 1) {
    atual = join(atual, partes[i]);
    let info = null;
    try { info = lstatSync(atual); } catch { info = null; }
    if (!info) break; // daqui para baixo nada existe
    if (info.isSymbolicLink()) throw new Recusa('destino-e-link', `${rel}: passaria por um link (${partes.slice(0, i + 1).join('/')})`);
    if (i < partes.length - 1) {
      if (!info.isDirectory()) throw new Recusa('destino-e-arquivo', `${rel}: existe um arquivo onde deveria haver pasta`);
    } else if (info.isFile()) {
      return 'ja-existia';
    } else {
      throw new Recusa('destino-e-pasta', `${rel}: existe uma pasta onde deveria haver arquivo`);
    }
  }
  if (simular) return 'criado';
  try {
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo, { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') return 'ja-existia';
    throw new Recusa('erro-de-escrita', `${rel}: ${e.code ?? e.message}`);
  }
  return 'criado';
}

function escrever(itens, raizes, simular, saida) {
  for (const { onde, rel, conteudo } of itens) {
    try {
      const estado = gravar(raizes[onde], rel, conteudo, simular);
      (estado === 'criado' ? saida.criados : saida.jaExistiam).push({ onde, caminho: rel });
    } catch (e) {
      if (!(e instanceof Recusa)) throw e;
      saida.erros.push({ codigo: e.codigo, mensagem: `${onde}:${e.message}` });
    }
  }
}

// ------------------------------------------------------------ ponteiro da sede

function ponteiro(sedePasta, pedido, simular) {
  const casa = pastaDoUsuario();
  if (!casa) return { estado: 'sem-pasta-do-usuario' };
  const dir = join(casa, '.intoca');
  const arquivo = join(dir, 'sede');
  let info = null;
  try { info = lstatSync(arquivo); } catch { info = null; }
  if (info) {
    if (info.isSymbolicLink() || !info.isFile()) return { estado: 'ja-existia-outro', arquivo, atual: '(não é um arquivo comum)' };
    let atual = '';
    try { atual = readFileSync(arquivo, 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0].trim().slice(0, 500); } catch { /* ilegível */ }
    return mesmoCaminho(atual || '.', sedePasta) && atual
      ? { estado: 'ja-aponta-para-esta-sede', arquivo }
      : { estado: 'ja-existia-outro', arquivo, atual };
  }
  if (!pedido) return { estado: 'nao-pedido', arquivo };
  if (simular) return { estado: 'seria-criado', arquivo };
  try {
    const d = lstatSync(dir, { throwIfNoEntry: false });
    if (d && (d.isSymbolicLink() || !d.isDirectory())) return { estado: 'erro', arquivo, mensagem: 'a pasta .intoca não é uma pasta comum' };
    mkdirSync(dir, { recursive: true });
    writeFileSync(arquivo, `${sedePasta}\n`, { flag: 'wx' });
  } catch (e) {
    return { estado: 'erro', arquivo, mensagem: String(e.code ?? e.message) };
  }
  return { estado: 'criado', arquivo };
}

// ------------------------------------------------------------ estado de uma sede existente

// Versão do plugin que roda este script (a do plugin.json do pacote) e a mínima que o manifesto pede (INT-05,
// campo `plugin_minimo` no topo do sede.yaml). Só informa: `avisoDeVersao` vem preenchido quando o plugin é mais
// velho que o pedido, e nada é bloqueado. Campo ausente ou ilegível vale "sem mínimo".
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const comparar = (a, b) => { for (let i = 1; i <= 3; i += 1) { const dif = Number(a[i]) - Number(b[i]); if (dif !== 0) return dif; } return 0; };
function versaoDoPlugin(texto) {
  let atual = null;
  try { atual = JSON.parse(readFileSync(join(PACOTE, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null; } catch { /* sem versão */ }
  const bruto = texto.match(/^plugin_minimo:[ \t]*(.*)$/m)?.[1]?.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2') ?? null;
  const minimo = bruto !== null && SEMVER.test(bruto) ? bruto : null;
  const velho = minimo && typeof atual === 'string' && SEMVER.test(atual) && comparar(atual.match(SEMVER), minimo.match(SEMVER)) < 0;
  return {
    pluginMinimo: minimo, pluginAtual: atual,
    avisoDeVersao: velho ? `esta sede pede o plugin intoca ${minimo} ou mais novo e o instalado é o ${atual}; atualize o plugin (só um aviso, nada foi bloqueado)` : null,
  };
}

function estadoDaSede(entrada) {
  let pasta = null;
  let origem = 'pasta-dada';
  if (entrada.sede?.pasta) {
    pasta = pastaPedida(entrada.sede.pasta, 'sede.pasta');
  } else {
    const aqui = acharSede(process.cwd());
    if (aqui) { pasta = aqui; origem = 'pasta-atual'; } else {
      pasta = sedeIndicada();
      origem = process.env.INTOCA_SEDE && pasta && mesmoCaminho(pasta, process.env.INTOCA_SEDE) ? 'INTOCA_SEDE' : 'ponteiro';
    }
  }
  let texto = null;
  try { texto = lf(readFileSync(join(pasta ?? '', 'sede.yaml'), 'utf8')); } catch { /* sem sede */ }
  if (!pasta || texto === null) return { ok: true, acao: 'estado', achada: false };
  const campo = (c) => texto.match(new RegExp(`^ {2}${c}:[ \\t]*(.*)$`, 'm'))?.[1]?.replace(/\s+#.*$/, '').trim().replace(/^'(.*)'$/, (_, v) => v.replace(/''/g, "'")) ?? null;
  const m = interpretarManifesto(texto);
  return {
    ok: true, acao: 'estado', achada: true, sede: pasta, origem,
    nome: campo('nome'), modo: campo('modo'), perfil: campo('perfil'),
    ...versaoDoPlugin(texto),
    projetos: (m?.projetos ?? []).map((p) => ({ nome: p.nome ?? null, sigla: p.sigla ?? null, pasta_atual: p.pasta_atual ?? null })),
    titulos: m?.titulos ?? { ...TITULOS_PADRAO },
  };
}

// ------------------------------------------------------------ pasta que a pessoa já tem (PLG-23)

const NO_WINDOWS = process.platform === 'win32';

const tipoDe = (caminho) => {
  try {
    const i = lstatSync(caminho);
    return i.isSymbolicLink() ? 'link' : i.isDirectory() ? 'pasta' : 'arquivo';
  } catch { return null; }
};

// O primeiro nome do caminho que é link ou junção (os de baixo de um link não contam: não se sabe onde vão dar).
function primeiroLinkNoCaminho(caminho) {
  const { root } = parse(caminho);
  let atual = root;
  for (const parte of caminho.slice(root.length).split(/[\\/]+/).filter(Boolean)) {
    atual = join(atual, parte);
    const t = tipoDe(atual);
    if (t === 'link') return parte;
    if (t === null) return null;
  }
  return null;
}

// Serviço de sincronização de arquivos que a pasta parece usar (pelo nome de uma pasta do caminho, pelo caminho
// real e pelas variáveis do OneDrive). Só olha nomes: nada é aberto.
const SINCRONIZADORES = [
  [/^onedrive(?:$|[ -])/i, 'OneDrive'],
  [/^dropbox(?:$|[ -])/i, 'Dropbox'],
  [/^(?:google ?drive|my drive|meu drive)(?:$|[ -])/i, 'Google Drive'],
  [/^(?:icloud ?drive|iclouddrive|mobile documents)$/i, 'iCloud Drive'],
];
function sincronizadaPor(caminho) {
  const candidatos = [resolve(caminho)];
  const real = caminhoReal(caminho);
  if (real) candidatos.push(real);
  for (const c of candidatos) {
    for (const parte of c.split(/[\\/]+/)) {
      const achou = SINCRONIZADORES.find(([re]) => re.test(parte));
      if (achou) return achou[1];
    }
    for (const v of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
      const raiz = process.env[v];
      if (typeof raiz === 'string' && raiz.trim() !== '' && absoluto(raiz) && (mesmoCaminho(raiz, c) || contem(raiz, c))) return 'OneDrive';
    }
  }
  return null;
}

// A unidade de disco do caminho (existente ou não): no Windows a raiz real; nos outros, o dispositivo da
// pasta existente mais próxima. Dois caminhos em unidades diferentes não podem ser movidos com um rename.
function unidadeDe(caminho) {
  const real = caminhoReal(caminho) ?? resolve(caminho);
  if (NO_WINDOWS) return parse(real).root.toLowerCase();
  let atual = real;
  for (;;) {
    try { return String(statSync(atual).dev); } catch { /* sobe */ }
    const pai = dirname(atual);
    if (pai === atual) return atual;
    atual = pai;
  }
}

// `git status` só de leitura (sem travar o índice, sem rodar monitor de arquivos configurado na pasta).
function estadoDoGit(pasta) {
  const r = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', pasta, 'status', '--porcelain'], {
    encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  });
  if (r.error || r.status !== 0) return { ok: false, motivo: String(r.error?.code ?? `código ${r.status}`) };
  return { ok: true, alteracoes: r.stdout.split(/\r?\n/).filter(Boolean).length };
}

// Repositório que contém a pasta sem ela mesma ter .git: tirar a pasta de lá muda o repositório de fora.
function repositorioDeFora(pasta) {
  let atual = dirname(pasta);
  for (;;) {
    if (tipoDe(join(atual, '.git')) !== null) return atual;
    const pai = dirname(atual);
    if (pai === atual) return null;
    atual = pai;
  }
}

const PASTAS_PESSOAIS = new Set(['documents', 'documentos', 'meus documentos', 'desktop', 'área de trabalho', 'area de trabalho',
  'downloads', 'pictures', 'imagens', 'music', 'músicas', 'musicas', 'videos', 'vídeos', 'appdata', 'library']);

// Código curto do plano de uma mudança: amarra o "sim" da pessoa à pasta, ao destino e à sigla que a simulação mostrou.
function codigoDoPlano(origem, destino, sigla) {
  const chave = (p) => (NO_WINDOWS ? resolve(p).toLowerCase() : resolve(p));
  return createHash('sha256').update([chave(origem), chave(destino), sigla].join('\n')).digest('hex').slice(0, 8).toUpperCase();
}

// Só lê. `deps.git` existe para os testes injetarem.
function inspecionar(origem, { sedePasta = null, projetos = [], status = false, deps }) {
  const tipo = tipoDe(origem);
  const l = {
    pasta: origem, existe: tipo !== null, ehPasta: tipo === 'pasta', ehLink: tipo === 'link',
    passaPorLink: primeiroLinkNoCaminho(origem),
  };
  if (tipo !== 'pasta') return l;
  l.sincronizada = sincronizadaPor(origem);
  const gitTipo = tipoDe(join(origem, '.git'));
  l.git = { tem: gitTipo !== null, tipo: gitTipo };
  if (gitTipo === 'pasta') {
    try { l.git.worktrees = readdirSync(join(origem, '.git', 'worktrees')).length; } catch { l.git.worktrees = 0; }
  }
  if (status && gitTipo === 'pasta') {
    const g = deps.git(origem);
    l.git.legivel = g.ok === true;
    l.git.alteracoes = g.ok ? g.alteracoes : null;
    if (!g.ok) l.git.motivo = g.motivo;
  }
  l.repositorioDeFora = gitTipo === null ? deps.repositorioDeFora(origem) : null;
  l.temAgents = tipoDe(join(origem, 'AGENTS.md')) !== null;
  l.temClaude = tipoDe(join(origem, 'CLAUDE.md')) !== null;
  l.temReadme = tipoDe(join(origem, 'README.md')) !== null;
  l.temGitignore = tipoDe(join(origem, '.gitignore')) !== null;
  let nomes = [];
  try { nomes = readdirSync(origem); } catch { /* ilegível: segue sem a lista */ }
  l.arquivosEnv = nomes.filter((n) => ehEnvDeSegredo(n.toLowerCase())).sort(); // só os nomes; o conteúdo nunca é aberto
  l.dentroDaSede = sedePasta ? contem(sedePasta, origem) : false;
  l.contemASede = sedePasta ? (mesmoCaminho(origem, sedePasta) || contem(origem, sedePasta)) : false;
  const dono = projetos.find((j) => typeof j.pasta_atual === 'string' && absoluto(j.pasta_atual)
    && (mesmoCaminho(j.pasta_atual, origem) || contem(j.pasta_atual, origem) || contem(origem, j.pasta_atual)));
  l.deProjeto = dono ? { nome: dono.nome ?? null, sigla: dono.sigla ?? null } : null;
  l.nomeSugerido = basename(origem);
  return l;
}

function olhar(entrada, deps) {
  const pasta = pastaPedida(entrada.pasta ?? entrada.projeto?.pasta, 'pasta');
  let sedePasta = null;
  let projetos = [];
  const atual = estadoDaSede(entrada.sede?.pasta ? { sede: { pasta: entrada.sede.pasta } } : {});
  if (atual.achada) {
    sedePasta = atual.sede;
    projetos = lerManifesto(sedePasta)?.projetos ?? [];
  }
  return { ok: true, acao: 'olhar', sede: sedePasta, criados: [], jaExistiam: [], erros: [], leitura: inspecionar(pasta, { sedePasta, projetos, status: true, deps }) };
}

const reservadaDaSede = (sedePasta, pasta) => {
  const primeiro = relative(sedePasta, pasta).split(/[\\/]+/)[0].toLowerCase();
  return PASTAS_DA_SEDE.has(primeiro) || primeiro.startsWith('_') ? primeiro : null;
};

// O rename que traz a pasta para a sede: o único movimento do script. Falha vira recusa clara; como o
// rename é uma operação só, quem falha não deixa nada pela metade.
// No Windows, EPERM/EACCES num rename costuma ser pasta aberta por outro programa; em macOS e Linux é permissão negada.
function moverPasta(origem, destino, renomear, windows = NO_WINDOWS) {
  try {
    renomear(origem, destino);
  } catch (e) {
    const c = e?.code;
    if (c === 'EXDEV') throw new Recusa('unidades-diferentes', 'a sede e a pasta estão em unidades de disco diferentes; nada foi movido. Copiar entre unidades é um trabalho à mão, fora deste comando.');
    if (c === 'EBUSY' || (windows && (c === 'EPERM' || c === 'EACCES'))) {
      throw new Recusa('pasta-em-uso', `não foi possível mover (${c}): feche o que estiver usando a pasta (editor, terminal, servidor de teste, programa de sincronização) e tente de novo; nada foi movido.`);
    }
    if (c === 'EPERM' || c === 'EACCES') {
      throw new Recusa('sem-permissao', `não foi possível mover (${c}): o sistema negou a permissão (a pasta, a sede ou a pasta de cima não deixa quem roda isto mudar ou criar arquivos ali). Ajuste a permissão à mão, ou deixe a pasta onde está e use "registrar"; nada foi movido.`);
    }
    if (c === 'EEXIST' || c === 'ENOTEMPTY') throw new Recusa('destino-existe', 'o destino apareceu antes da mudança; nada foi movido.');
    throw new Recusa('erro-ao-mover', `não foi possível mover (${c ?? e?.message}); nada foi movido.`);
  }
}

// Resposta de quem já está registrado: nada muda.
const jaFeito = (saida, estado, pasta, aviso) => ({
  ...saida, ok: true, jaRegistrado: true, estado, pastaDoProjeto: pasta, avisos: [aviso],
});

function adotar(entrada, deps) {
  const como = entrada.como;
  if (como !== 'registrar' && como !== 'mover') throw new Recusa('como-inexistente', `como: "${String(como)}" não existe; use registrar ou mover`);
  const simular = entrada.simular !== false; // só executa com "simular": false explícito
  const atual = estadoDaSede(entrada.sede?.pasta ? { sede: { pasta: entrada.sede.pasta } } : {});
  if (!atual.achada) throw new Recusa('sem-sede', 'não há sede (sede.yaml) para receber o projeto; use a ação "criar"');
  const sede = { pasta: atual.sede, modo: MODOS[atual.modo] ?? 'agregadora' };
  const titulos = atual.titulos;
  const projetos = lerManifesto(sede.pasta)?.projetos ?? [];
  const data = dataValida(entrada.data);
  const campos = camposDoProjeto(entrada.projeto);
  const origem = pastaPedida(entrada.projeto.pasta, 'projeto.pasta');
  const base = { ok: true, acao: 'adotar', como, simulado: simular, sede: sede.pasta, criados: [], jaExistiam: [], erros: [], gerente: null, manifesto: null };

  if (mesmoCaminho(origem, sede.pasta) || contem(origem, sede.pasta)) {
    throw new Recusa('pasta-invalida', 'projeto.pasta: a pasta é a própria sede ou a contém');
  }
  const dentroDaSede = contem(sede.pasta, origem);
  if (dentroDaSede) {
    const reservada = reservadaDaSede(sede.pasta, origem);
    if (reservada) throw new Recusa('pasta-invalida', `projeto.pasta: "${reservada}" é pasta reservada da sede`);
  }

  // Quem já é dono desta pasta (ou de uma que a contém ou está dentro dela).
  const cita = (valor) => typeof valor === 'string' && absoluto(valor);
  let jaNoManifesto = false; // o mesmo projeto, já registrado onde está, agora a ser trazido
  let jaRegistradaAqui = false; // o mesmo projeto, já registrado nesta pasta (registrar de novo só completa o que falta)
  for (const j of projetos) {
    const nomeDele = j.nome ?? j.sigla ?? 'outro projeto';
    const mesmoProjeto = j.sigla === campos.sigla;
    if (cita(j.pasta_atual) && mesmoCaminho(j.pasta_atual, origem)) {
      if (!mesmoProjeto) throw new Recusa('pasta-de-outro-projeto', `projeto.pasta: já é a pasta de ${nomeDele}`);
      if (como === 'registrar') jaRegistradaAqui = true;
      else jaNoManifesto = true; // trazer depois de registrar: segue o fluxo de mover e troca a linha do manifesto
      continue;
    }
    if (Array.isArray(j.pastas_antigas) && j.pastas_antigas.some((x) => cita(x) && mesmoCaminho(x, origem))) {
      if (!mesmoProjeto) throw new Recusa('pasta-de-outro-projeto', `projeto.pasta: era a pasta de ${nomeDele}`);
      return jaFeito(base, 'ja-trazido', j.pasta_atual ?? null, `${nomeDele} já foi trazido para a sede; a pasta antiga está em pastas_antigas. Nada mudou.`);
    }
    if (mesmoProjeto) throw new Recusa('sigla-repetida', `projeto.sigla: ${campos.sigla} já é de ${nomeDele}`);
    const pastasDele = [j.pasta_atual, j.pasta_futura, ...(Array.isArray(j.pastas_antigas) ? j.pastas_antigas : [])];
    if (pastasDele.some((x) => cita(x) && (contem(x, origem) || contem(origem, x)))) {
      throw new Recusa('pasta-de-outro-projeto', `projeto.pasta: a pasta tem dentro de si, ou está dentro da pasta de, ${nomeDele}`);
    }
  }

  const leitura = inspecionar(origem, { sedePasta: sede.pasta, projetos, status: como === 'mover', deps });
  if (!leitura.existe) {
    throw new Recusa('pasta-inexistente', 'projeto.pasta: essa pasta não existe; se ela já foi movida, registre o projeto pelo item do manifesto em vez de repetir a mudança');
  }
  if (leitura.ehLink) throw new Recusa('destino-e-link', 'projeto.pasta: a pasta é um link; escolha a pasta de verdade');
  if (!leitura.ehPasta) throw new Recusa('destino-e-arquivo', 'projeto.pasta: isso é um arquivo, não uma pasta');

  const saida = {
    ...base, pastaDoProjeto: origem, movida: false, avisos: [], sugestoes: [], leitura,
    antes: { pasta: origem }, depois: { pasta: origem }, desfazer: null,
  };
  const aviso = (t) => saida.avisos.push(t);
  if (leitura.arquivosEnv.length) {
    aviso(`A pasta tem arquivo(s) de segredo no nível de cima (${leitura.arquivosEnv.join(', ')}): o plugin não os abre nem repete o conteúdo. Se a pasta for trazida para a sede, eles vão junto com ela. Só o nível de cima foi olhado: um .env dentro de uma subpasta não aparece aqui. Confira que o .gitignore da pasta os ignora e veja docs/politica-de-segredos.md.`);
  }
  if (como === 'registrar') {
    if (leitura.passaPorLink) aviso(`O caminho da pasta passa por um link (${leitura.passaPorLink}); o plugin pode não reconhecer a pasta se o chat abrir pelo caminho real.`);
    if (!dentroDaSede && sede.modo === 'agregadora') aviso('A sede é agregadora e este projeto fica fora dela, onde está; o manifesto aponta para a pasta.');
    if (leitura.sincronizada) aviso(`A pasta está numa pasta sincronizada (${leitura.sincronizada}); o backup e a cópia para outro computador dela são do sincronizador, não da sede.`);
  }

  let destino = null;
  if (como === 'mover') {
    if (dentroDaSede) throw new Recusa('ja-na-sede', 'projeto.pasta: a pasta já está dentro da sede; não precisa mover (use "registrar")');
    if (leitura.passaPorLink) throw new Recusa('caminho-com-link', `projeto.pasta: o caminho passa por um link ou junção (${leitura.passaPorLink}); o endereço real é outro e a mudança não é segura`);
    const casa = pastaDoUsuario();
    if (casa && mesmoCaminho(dirname(origem), casa) && (PASTAS_PESSOAIS.has(basename(origem).toLowerCase()) || basename(origem).startsWith('.'))) {
      throw new Recusa('pasta-pessoal', 'projeto.pasta: é uma pasta pessoal ou de configuração do sistema (Documentos, Área de Trabalho, uma pasta que começa com ponto...); mova as pastas de dentro dela, uma por vez');
    }
    if (leitura.sincronizada) {
      throw new Recusa('pasta-sincronizada', `projeto.pasta: a pasta está numa pasta sincronizada (${leitura.sincronizada}); a mudança de lugar pode criar cópias conflitantes. Pause a sincronização, ou deixe a pasta onde está e use "registrar". Nada foi movido.`);
    }
    if (leitura.git.tem && leitura.git.tipo !== 'pasta') {
      throw new Recusa('git-vinculado', 'projeto.pasta: o .git da pasta não é uma pasta (é uma worktree ou um submódulo); mover quebraria o vínculo com o repositório de origem');
    }
    if (leitura.git.worktrees > 0) {
      throw new Recusa('worktrees-ligadas', `projeto.pasta: o repositório tem ${leitura.git.worktrees} worktree(s) ligada(s) (guardam o caminho antigo); remova-as ou deixe a pasta onde está e use "registrar". Nada foi movido.`);
    }
    if (leitura.git.tem) {
      if (leitura.git.legivel !== true) throw new Recusa('git-ilegivel', `projeto.pasta: não consegui conferir o Git da pasta (${leitura.git.motivo ?? 'sem resposta'}); confira à mão se há algo por guardar e tente de novo`);
      if (leitura.git.alteracoes > 0) {
        throw new Recusa('alteracoes-nao-guardadas', `projeto.pasta: o Git mostra ${leitura.git.alteracoes} alteração(ões) não guardada(s); guarde (feche uma versão) ou descarte antes de mudar a pasta de lugar; se forem os arquivos que o registro criou (ops/, a carta), guarde-os, não os descarte. Nada foi movido.`);
      }
    } else {
      if (leitura.repositorioDeFora) throw new Recusa('dentro-de-outro-repositorio', 'projeto.pasta: a pasta faz parte de um repositório maior (fora dela); tirá-la de lá mudaria esse repositório');
      aviso('A pasta não tem Git: não há histórico para voltar atrás. Faça uma cópia sua antes de mudar de lugar, se o conteúdo for importante.');
    }
    const pedido = entrada.projeto.destino;
    if (pedido !== undefined && pedido !== null && pedido !== '') {
      destino = pastaPedida(pedido, 'projeto.destino');
      if (!contem(sede.pasta, destino)) throw new Recusa('pasta-invalida', 'projeto.destino: o destino tem de ficar dentro da sede');
      const reservada = reservadaDaSede(sede.pasta, destino);
      if (reservada) throw new Recusa('pasta-invalida', `projeto.destino: "${reservada}" é pasta reservada da sede`);
    } else {
      destino = join(sede.pasta, campos.slug, campos.repo ?? (slugDe(basename(origem)) || 'principal'));
      const reservada = reservadaDaSede(sede.pasta, destino);
      if (reservada) throw new Recusa('pasta-invalida', `o nome do projeto leva a "${reservada}", que é pasta reservada da sede; escolha outro nome ou peça um destino`);
    }
    for (const j of projetos.filter((x) => x.sigla !== campos.sigla)) {
      const dele = [j.pasta_atual, j.pasta_futura, ...(Array.isArray(j.pastas_antigas) ? j.pastas_antigas : [])];
      if (dele.some((x) => cita(x) && (mesmoCaminho(x, destino) || contem(x, destino) || contem(destino, x)))) {
        throw new Recusa('pasta-de-outro-projeto', `projeto.destino: o destino cai na pasta de ${j.nome ?? j.sigla ?? 'outro projeto'}; escolha outro lugar. Nada foi movido.`);
      }
    }
    conferirRaiz(sede.pasta, 'sede.pasta');
    conferirCaminhoAteOProjeto(sede.pasta, destino);
    if (tipoDe(destino) !== null) throw new Recusa('destino-existe', 'projeto.destino: já existe algo nesse lugar da sede; escolha outro nome ou lugar. Nada foi movido.');
    if (deps.unidadeDe(origem) !== deps.unidadeDe(destino)) {
      throw new Recusa('unidades-diferentes', 'a pasta e a sede estão em unidades de disco diferentes. Mover entre unidades é cópia, e cópia de projeto é um trabalho à mão (fora deste comando); deixe a pasta onde está e use "registrar".');
    }
    const sedeSincronizada = sincronizadaPor(sede.pasta);
    if (sedeSincronizada) {
      throw new Recusa('sede-sincronizada', `a sede está numa pasta sincronizada (${sedeSincronizada}); trazer o projeto para dentro dela levaria o .git e o .env para o sincronizador, em claro (regimento, regras 6 e 12). Deixe a pasta onde está e use "registrar". Nada foi movido.`);
    }
    saida.depois = { pasta: destino };
    saida.codigoDoPlano = codigoDoPlano(origem, destino, campos.sigla);
    if (!simular) {
      if (entrada.confirmado !== true) {
        throw new Recusa('sem-confirmacao', 'para mover de verdade, a entrada precisa de "confirmado": true (o "sim" da pessoa, depois de ver o antes e o depois)');
      }
      const dado = typeof entrada.codigo === 'string' ? entrada.codigo.trim().toUpperCase() : '';
      if (dado === '') throw new Recusa('sem-codigo', 'para mover de verdade, a entrada precisa do "codigo" que a simulação devolveu (codigoDoPlano): o "sim" vale para aquele plano, e a simulação vem antes');
      if (dado !== saida.codigoDoPlano) throw new Recusa('codigo-invalido', 'o "codigo" não é o deste plano (pasta, destino e sigla); simule de novo, mostre o plano à pessoa e use o código novo');
    }
  }

  const projeto = { ...campos, pasta: como === 'mover' ? destino : origem, antigas: como === 'mover' ? [origem] : [] };
  const arquivoDaMensagem = `diretoria/os/${ID_DA_MENSAGEM}-mensagem-${projeto.slug}.md`;
  // O que vai no projeto, sem tocar no que a pessoa já tem. O modelo de .gitignore nunca é gravado na pasta dela
  // (com o nome do pacote não protegeria nada): vai como sugestão, para comparar com o .gitignore que ela já tem
  // ou para copiar como .gitignore.
  const itens = [];
  for (const m of planoDoProjeto(projeto, data)) {
    if (m.rel === '_gitignore') {
      saida.sugestoes.push({ arquivo: '.gitignore', acao: leitura.temGitignore ? 'comparar' : 'criar', texto: m.conteudo });
    } else {
      itens.push(m);
    }
  }
  itens.push({ onde: 'sede', rel: arquivoDaMensagem, conteudo: mensagemDoGerente(projeto, titulos, data) });

  // Conferência a seco contra a pasta de hoje: link ou arquivo no lugar errado recusa tudo antes do primeiro passo.
  const seco = { criados: [], jaExistiam: [], erros: [] };
  escrever(itens, { sede: sede.pasta, projeto: origem }, true, seco);
  if (seco.erros.length) {
    saida.ok = false;
    saida.erros = seco.erros;
    return saida;
  }
  if (jaRegistradaAqui && seco.criados.length === 0) {
    return jaFeito(base, 'ja-registrado', origem, 'O projeto já está registrado nesta pasta e nada falta criar; nada mudou.');
  }
  saida.criados = seco.criados;
  saida.jaExistiam = seco.jaExistiam;
  if (como === 'mover') {
    const novos = seco.criados.filter((x) => x.onde === 'projeto').map((x) => x.caminho).join(', ') || 'nenhum';
    const pai = relative(sede.pasta, dirname(destino)).split(/[\\/]+/).join('/');
    // A frase da pasta vazia só vale quando o pai do destino, depois de a pasta voltar, realmente ficaria vazio:
    // pai que não existe (o script o cria) ou existe sem nada dentro; nunca a raiz da sede nem pai ocupado.
    const tipoDoPai = tipoDe(dirname(destino));
    const paiVazio = pai !== '' && !pai.startsWith('..') && !isAbsolute(pai)
      && (tipoDoPai === null || (tipoDoPai === 'pasta' && readdirSync(dirname(destino)).length === 0));
    const fraseDoPai = paiVazio ? ` A pasta vazia "${pai}" fica na sede (pode apagá-la à mão).` : '';
    saida.desfazer = `Para voltar atrás: mova a pasta "${destino}" de volta para "${origem}". Depois de mover, o script cria dentro da pasta ${novos}: esses arquivos voltam junto (no Git aparecem como não rastreados; apague-os à mão se não os quiser).${fraseDoPai} O caminho de antes deve ficar anotado em pastas_antigas no sede.yaml; se o projeto já estiver registrado, volte também a linha pasta_atual.`;
  }
  for (const x of seco.jaExistiam.filter((y) => y.onde === 'projeto' && y.caminho === 'AGENTS.md')) {
    saida.sugestoes.push({ arquivo: 'AGENTS.md', acao: 'mesclar', texto: itens.find((m) => m.onde === 'projeto' && m.rel === x.caminho)?.conteudo ?? '' });
  }
  if (leitura.temClaude) saida.sugestoes.push({ arquivo: 'CLAUDE.md', acao: 'acrescentar', texto: '@AGENTS.md' });

  saida.gerente = { titulo: aplicar(titulos.gerente, { projeto: projeto.nome }), mensagem: arquivoDaMensagem };
  const onde = contem(sede.pasta, projeto.pasta) ? `<sede>/${relative(sede.pasta, projeto.pasta).split(/[\\/]+/).join('/')}` : 'fora da sede (ver `sede.yaml`)';
  saida.manifesto = {
    itemDoProjeto: itemDoManifesto(projeto, titulos), sigla: projeto.sigla, tipo: projeto.tipo, porte: projeto.porte,
    linhaDoMapa: `| ${projeto.nome} | ${projeto.tipo} | ${projeto.porte} | ${onde} | - |`,
    substituiItem: jaNoManifesto,
  };
  if (jaRegistradaAqui) {
    saida.estado = 'ja-registrado-completado';
    aviso('O projeto já estava registrado nesta pasta: só foi criado o que faltava. O manifesto já tem o item; não o acrescente de novo.');
  }
  if (jaNoManifesto) {
    aviso('O projeto já está no sede.yaml: troque o valor de pasta_atual pelo novo e acrescente pastas_antigas com a pasta de antes (use manifesto.itemDoProjeto como referência) em vez de acrescentar outro item; troque também a linha do WORKSPACE.md.');
  }
  if (simular) return saida;

  // Execução de verdade.
  if (como === 'mover') {
    const paiExistia = tipoDe(dirname(destino)) !== null;
    try {
      mkdirSync(dirname(destino), { recursive: true });
      if (tipoDe(destino) !== null) throw new Recusa('destino-existe', 'o destino apareceu antes da mudança; nada foi movido.');
      moverPasta(origem, destino, deps.renomear, deps.windows);
    } catch (e) {
      const recusa = e instanceof Recusa ? e : new Recusa('erro-ao-mover', `não foi possível preparar a mudança (${e?.code ?? e?.message}); nada foi movido.`);
      if (!paiExistia && tipoDe(dirname(destino)) === 'pasta') {
        recusa.message += ` Ficou uma pasta vazia na sede (${relative(sede.pasta, dirname(destino)).split(/[\\/]+/).join('/')}); pode apagá-la à mão.`;
      }
      throw recusa;
    }
    saida.movida = true;
    saida.pastaDoProjeto = destino;
  }
  saida.criados = [];
  saida.jaExistiam = [];
  escrever(itens, { sede: sede.pasta, projeto: projeto.pasta }, false, saida);
  if (saida.erros.length) {
    saida.ok = false;
    saida.parcial = saida.movida || saida.criados.length > 0;
  }
  return saida;
}

// ------------------------------------------------------------ principal

function lerEntrada() {
  const alvo = process.argv[2];
  const bruto = alvo && alvo !== '-' ? readFileSync(alvo, 'utf8') : readFileSync(0, 'utf8');
  if (bruto.length > LIMITE_DA_ENTRADA) throw new Recusa('entrada-grande', 'as respostas passam de 64 KB');
  let dado;
  try { dado = JSON.parse(bruto.replace(/^﻿/, '')); } catch { throw new Recusa('entrada-invalida', 'as respostas não são um JSON válido'); }
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) throw new Recusa('entrada-invalida', 'as respostas devem ser um objeto JSON');
  return dado;
}

function criar(entrada, acao) {
  const simular = entrada.simular === true;
  const s = entrada.sede;
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Recusa('resposta-ausente', 'sede: faltaram as respostas da sede');
  const sede = { pasta: pastaPedida(s.pasta, 'sede.pasta') };
  if (acao === 'criar') {
    sede.nome = texto(s.nome, 'sede.nome');
    sede.modo = MODOS[s.modo];
    sede.perfil = s.perfil;
    if (!sede.modo) throw new Recusa('modo-inexistente', `sede.modo: "${String(s.modo)}" não existe; use agregadora ou registro`);
    if (!PERFIS.includes(s.perfil)) throw new Recusa('perfil-inexistente', `sede.perfil: "${String(s.perfil)}" não existe; use ${PERFIS.join(', ')}`);
  } else {
    const atual = estadoDaSede({ sede: { pasta: sede.pasta } });
    if (!atual.achada) throw new Recusa('sem-sede', 'não há sede (sede.yaml) nessa pasta; use a ação "criar"');
    sede.nome = atual.nome ?? basename(sede.pasta);
    sede.modo = MODOS[atual.modo] ?? 'agregadora';
    sede.jaTem = atual.projetos;
  }
  const titulos = acao === 'criar' ? titulosPedidos(entrada.titulos) : estadoDaSede({ sede: { pasta: sede.pasta } }).titulos;
  const data = dataValida(entrada.data);
  // "projeto": null (só na ação criar) cria a sede sem primeiro projeto: as pastas que a pessoa já tem entram depois, pelo adotar.
  const projeto = acao === 'criar' && entrada.projeto === null ? null : projetoPedido(entrada, sede);
  for (const j of projeto ? (sede.jaTem ?? []) : []) {
    if (j.sigla === projeto.sigla) throw new Recusa('sigla-repetida', `projeto.sigla: ${projeto.sigla} já é de ${j.nome}`);
    if (typeof j.pasta_atual === 'string' && mesmoCaminho(j.pasta_atual, projeto.pasta)) throw new Recusa('projeto-repetido', `projeto.pasta: já é a pasta de ${j.nome}`);
  }
  conferirRaiz(sede.pasta, 'sede.pasta');
  if (projeto) {
    conferirCaminhoAteOProjeto(sede.pasta, projeto.pasta);
    conferirRaiz(projeto.pasta, 'projeto.pasta');
  }

  const saida = {
    ok: true, acao, simulado: simular, sede: sede.pasta, pastaDoProjeto: projeto?.pasta ?? null,
    criados: [], jaExistiam: [], erros: [], avisos: [], ponteiro: { estado: 'nao-pedido' }, gerente: null, manifesto: null,
  };
  const arquivoDaMensagem = projeto ? `diretoria/os/${ID_DA_MENSAGEM}-mensagem-${projeto.slug}.md` : null;
  const itens = [
    ...(acao === 'criar' ? planoDaSede(sede, projeto, titulos, data) : []),
    ...(projeto ? planoDoProjeto(projeto, data) : []),
    ...(projeto ? [{ onde: 'sede', rel: arquivoDaMensagem, conteudo: mensagemDoGerente(projeto, titulos, data) }] : []),
  ];
  const raizes = { sede: sede.pasta, projeto: projeto?.pasta };
  // Primeiro uma passagem de conferência (nada é escrito): se algum caminho passar por link ou estiver
  // no lugar errado, a execução inteira é recusada antes de criar o primeiro arquivo.
  escrever(itens, raizes, true, saida);
  if (saida.erros.length) {
    saida.ok = false;
    saida.criados = [];
    saida.jaExistiam = [];
    return saida;
  }
  if (!simular) {
    saida.criados = [];
    saida.jaExistiam = [];
    escrever(itens, raizes, false, saida); // falha aqui (disco cheio, permissão) deixa o que já foi criado listado
  }
  if (projeto) {
    saida.gerente = { titulo: aplicar(titulos.gerente, { projeto: projeto.nome }), mensagem: arquivoDaMensagem };
    saida.manifesto = { itemDoProjeto: itemDoManifesto(projeto, titulos), sigla: projeto.sigla, tipo: projeto.tipo, porte: projeto.porte };
  }
  if (saida.erros.length) {
    saida.ok = false;
    saida.parcial = saida.criados.length > 0;
    return saida;
  }
  if (acao === 'criar') {
    const jaTinha = saida.jaExistiam.filter((x) => x.onde === 'sede');
    if (jaTinha.some((x) => x.caminho === 'sede.yaml')) {
      saida.avisos.push('A pasta já tinha uma sede (sede.yaml): o nome, o modo, o perfil, os títulos e o primeiro projeto respondidos não foram aplicados ao manifesto, que ficou como estava. Para registrar mais um projeto nela, use a ação "projeto".');
    } else if (jaTinha.length) {
      saida.avisos.push(`${jaTinha.length} arquivo(s) da sede já existiam na pasta e ficaram como estavam (veja "jaExistiam"); confira se não são de outra coisa.`);
    }
    saida.ponteiro = ponteiro(sede.pasta, entrada.ponteiro === true, simular);
  }
  return saida;
}

const DEPS_PADRAO = { git: estadoDoGit, unidadeDe, renomear: renameSync, repositorioDeFora };

const comoErro = (e) => {
  const recusa = e instanceof Recusa ? e : new Recusa('erro-interno', String(e?.message ?? e));
  return { ok: false, criados: [], jaExistiam: [], erros: [{ codigo: recusa.codigo, mensagem: recusa.message }] };
};

// Roda uma ação e devolve a saída (nunca lança). `deps` troca git, unidadeDe, renomear e repositorioDeFora (uso dos testes).
export function executar(entrada, deps = {}) {
  try {
    const d = { ...DEPS_PADRAO, ...deps };
    const acao = entrada.acao ?? 'criar';
    if (acao === 'estado') return estadoDaSede(entrada);
    if (acao === 'olhar') return olhar(entrada, d);
    if (acao === 'adotar') return adotar(entrada, d);
    if (acao === 'criar' || acao === 'projeto') return criar(entrada, acao);
    throw new Recusa('acao-inexistente', `acao: "${String(acao)}" não existe; use criar, projeto, adotar, olhar ou estado`);
  } catch (e) {
    return comoErro(e);
  }
}

function principal() {
  let saida;
  try {
    saida = executar(lerEntrada());
  } catch (e) {
    saida = comoErro(e);
  }
  process.exitCode = saida.ok ? 0 : 1;
  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
}

// Só roda quando é o programa chamado (os testes importam `executar` sem disparar a leitura da entrada).
function ehOPrograma() {
  try { return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url)); } catch { return true; }
}
if (ehOPrograma()) principal();
