#!/usr/bin/env node
// Instala a InToca Sala do /intoca:comecar (INT-05). Node, sem dependência.
//
// Uso:  node instalar-sala.mjs <arquivo.json>      pedido num arquivo JSON
//       node instalar-sala.mjs -                   pedido pela entrada padrão (também sem argumento)
// Saída: um JSON no stdout. Código 0 sem erros, 1 com erros.
//
// Este script NUNCA roda sozinho: quem o chama é a skill comecar, depois do "sim" da pessoa. Instalar o plugin
// não dispara nada daqui. A rede só é usada pelos dois comandos que a pessoa autorizou, e só no passo real:
// o `claude plugin install` (a sala dentro do app) e o `git clone` (a sala animada). Nada é baixado em silêncio.
//
// Ações (campo "acao"):
//   verificar  só lê: acha o `claude`, vê se o `intoca` e o `intoca-sala` estão instalados e confere `git`, `uv`
//              e Python 3.12 ou mais novo (o que a sala animada pede).
//   sala       instala o pacote `intoca-sala` do mesmo catálogo do `intoca`, num passo só (se o `intoca` também
//              faltasse, vão os dois). Só simula, a menos que a entrada diga "simular": false e "confirmado": true.
//              "recusou": true registra a recusa da pessoa e não toca em nada.
//   atualizacao  liga a atualização automática do catálogo de onde o `intoca` veio (grava `autoUpdate` na entrada dele em
//              `plugins/known_marketplaces.json`, o mesmo que o botão de `/plugin` faz), depois de guardar uma cópia ao lado.
//              Catálogo de pasta local: "não se aplica", nada é gravado. Só simula, a menos que "simular": false e
//              "confirmado": true. "recusou": true registra a recusa. Sempre devolve o passo a passo manual.
//   animada    (opcional) a sala animada, AI Operations Room · InToca: confere os programas, a porta e o destino,
//              clona o repositório público, sincroniza o ambiente (`uv sync`) e, só com "hooks": true E
//              "confirmado": true, registra os hooks em `<pasta do usuário>/.claude/settings.json`, depois de
//              guardar uma cópia desse arquivo. Só simula, a menos que "simular": false. Falha no meio desfaz o que
//              este passo criou e explica. Não inicia a sala. Não altera o sede.yaml: devolve o item da ferramenta.
//
// Entrada do animada: { "acao":"animada", "simular":true|false, "confirmado":true, "hooks":true|false,
//   "sede": <pasta da sede, opcional: lê dali a ferramenta já registrada>, "pasta": <onde clonar, opcional>,
//   "porta": 8765 }
//
// Regras: nunca sobrescreve nem apaga o que já existia. O único apagar é o do que ESTE passo acabou de criar
// (a pasta do clone e as pastas que ele criou para chegar nela), quando o passo falha. O arquivo de configurações
// do Claude é guardado antes e restaurado byte a byte se o registro dos hooks falhar. Nenhum valor de segredo
// é lido ou escrito.
import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync, readdirSync, copyFileSync, rmSync, unlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastaDoUsuario, acharSede, sedeIndicada } from '../hooks/lib.mjs';

export const URL_DA_ANIMADA = 'https://github.com/guigsm/AiOperationsRoom';
export const CATALOGO_PADRAO = 'intoca-sede';
const NOME_DA_ANIMADA = 'AI Operations Room · InToca';
const PORTA_PADRAO = 8765;
const LIMITE_DA_ENTRADA = 65536;
const EVENTOS_DOS_HOOKS = 7; // os eventos que o `hooks-install` da sala animada registra

class Recusa extends Error {
  constructor(codigo, mensagem, extra = {}) { super(mensagem); this.codigo = codigo; this.extra = extra; }
}

// ------------------------------------------------------------ processos (trocáveis nos testes)

// Roda um programa sem shell e devolve { status, stdout, stderr, erro }. Nunca lança.
function rodarPrograma(comando, args, { cwd, env, tempo = 120000 } = {}) {
  const r = spawnSync(comando, args, { cwd, env: env ?? process.env, encoding: 'utf8', timeout: tempo, windowsHide: true });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', erro: r.error ? (r.error.code ?? String(r.error.message)) : null };
}

// A porta está livre se nada escuta nela no loopback. Confere num processo à parte (tenta escutar e solta), para o script
// seguir síncrono como o criar-sede.
const TESTE_DE_PORTA = "const s=require('net').createServer();s.on('error',()=>process.exit(3));s.listen(Number(process.argv[1]),'127.0.0.1',()=>s.close(()=>process.exit(0)));";
export function portaLivre(porta) {
  const r = spawnSync(process.execPath, ['-e', TESTE_DE_PORTA, String(porta)], { timeout: 20000, windowsHide: true });
  return r.status === 0;
}

const DEPS_PADRAO = { rodar: rodarPrograma, portaLivre, url: URL_DA_ANIMADA, claude: null, tempoDoClone: 180000, tempoDoSync: 900000 };

// ------------------------------------------------------------ o que há na máquina

const primeiraLinha = (t) => String(t ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';

// O binário do Claude: o que o app informa em CLAUDE_CODE_EXECPATH, depois o `claude` do PATH. Nada é procurado em disco.
function acharClaude(d) {
  if (d.claude) return d.claude;
  const candidatos = [process.env.CLAUDE_CODE_EXECPATH, 'claude'].filter((c) => typeof c === 'string' && c !== '');
  for (const c of candidatos) {
    const r = d.rodar(c, ['--version'], { tempo: 20000 });
    if (r.status === 0) return c;
  }
  return null;
}

function listaDePlugins(claude, d) {
  const r = d.rodar(claude, ['plugin', 'list', '--json'], { tempo: 60000 });
  if (r.status !== 0) return null;
  try {
    const lista = JSON.parse(r.stdout);
    return Array.isArray(lista) ? lista : null;
  } catch { return null; }
}

const idDoPlugin = (item) => String(item?.id ?? '');
const acharPlugin = (lista, nome) => lista?.find((p) => idDoPlugin(p).split('@')[0] === nome) ?? null;
const catalogoDe = (item) => idDoPlugin(item).split('@')[1] || null;

function conferirPrograma(d, comando, args) {
  const r = d.rodar(comando, args, { tempo: 30000 });
  return r.status === 0 ? { ok: true, versao: primeiraLinha(r.stdout || r.stderr) } : { ok: false, versao: null };
}

// Python 3.12 ou mais novo: o que a sala animada pede (`requires-python`). O `uv` sabe achar o Python
// da máquina e o que ele mesmo guardou; sem `uv` não há como conferir, e o `uv` já é pedido à parte.
function conferirPython(d, temUv) {
  if (!temUv) return { ok: false, versao: null, caminho: null };
  const achou = d.rodar('uv', ['python', 'find', '>=3.12'], { tempo: 30000 });
  const caminho = achou.status === 0 ? primeiraLinha(achou.stdout) : '';
  if (!caminho) return { ok: false, versao: null, caminho: null };
  const v = d.rodar(caminho, ['--version'], { tempo: 20000 });
  return { ok: true, versao: v.status === 0 ? primeiraLinha(v.stdout || v.stderr) : null, caminho };
}

function verificar(d) {
  const claude = acharClaude(d);
  const lista = claude ? listaDePlugins(claude, d) : null;
  const intoca = acharPlugin(lista, 'intoca');
  const sala = acharPlugin(lista, 'intoca-sala');
  const git = conferirPrograma(d, 'git', ['--version']);
  const uv = conferirPrograma(d, 'uv', ['--version']);
  const python = conferirPython(d, uv.ok);
  const faltam = [];
  if (!git.ok) faltam.push('git');
  if (!uv.ok) faltam.push('uv');
  if (!python.ok) faltam.push('python');
  return {
    ok: true, acao: 'verificar', criados: [], jaExistiam: [], erros: [],
    claude: { achado: Boolean(claude), listou: lista !== null },
    plugins: {
      intoca: { instalado: lista === null ? null : Boolean(intoca), versao: intoca?.version ?? null, catalogo: catalogoDe(intoca) },
      sala: { instalado: lista === null ? null : Boolean(sala), versao: sala?.version ?? null },
    },
    animada: { git, uv, python, faltam },
  };
}

// ------------------------------------------------------------ a sala dentro do app (pacote intoca-sala)

function sala(entrada, d) {
  const simular = entrada.simular !== false;
  const base = { ok: true, acao: 'sala', simulado: simular, criados: [], jaExistiam: [], erros: [], estado: null, comandos: [], desligar: textoParaDesligar() };
  if (entrada.recusou === true) return { ...base, simulado: false, estado: 'recusada', aviso: 'A pessoa recusou a InToca Sala. Nada foi instalado; o resto do plugin segue como está.' };
  const claude = acharClaude(d);
  if (!claude) {
    throw new Recusa('claude-nao-achado', 'não achei o programa do Claude para instalar por aqui; a pessoa pode instalar dentro do chat, com o comando abaixo', {
      comandoManual: `/plugin install intoca-sala@${CATALOGO_PADRAO}`,
    });
  }
  const lista = listaDePlugins(claude, d);
  if (lista === null) throw new Recusa('lista-indisponivel', 'não consegui ler a lista de plugins instalados; nada foi alterado');
  const intoca = acharPlugin(lista, 'intoca');
  const jaTem = acharPlugin(lista, 'intoca-sala');
  const catalogo = catalogoDe(intoca) ?? CATALOGO_PADRAO;
  base.desligar = textoParaDesligar(catalogoDe(jaTem) ?? catalogo);
  if (jaTem) return { ...base, simulado: false, estado: 'ja-instalada', versao: jaTem.version ?? null, catalogo: catalogoDe(jaTem) ?? catalogo };
  const nomes = intoca ? ['intoca-sala'] : ['intoca', 'intoca-sala']; // conjunta: se o `intoca` faltasse, vai junto
  const comandos = nomes.map((n) => `claude plugin install ${n}@${catalogo}`);
  if (simular) return { ...base, estado: 'simulada', catalogo, pacotes: nomes, comandos };
  if (entrada.confirmado !== true) throw new Recusa('sem-confirmacao', 'para instalar de verdade, a entrada precisa de "confirmado": true (o "sim" da pessoa)');
  const feitos = [];
  for (const n of nomes) {
    const r = d.rodar(claude, ['plugin', 'install', `${n}@${catalogo}`], { tempo: 240000 });
    if (r.status !== 0) {
      throw new Recusa('instalacao-falhou', `o catálogo "${catalogo}" não instalou o pacote ${n}: ${primeiraLinha(r.stderr || r.stdout) || r.erro || 'sem mensagem'}`, {
        instalados: feitos, comandoManual: `/plugin install ${n}@${catalogo}`,
      });
    }
    feitos.push(n);
  }
  const depois = listaDePlugins(claude, d);
  if (depois !== null && !acharPlugin(depois, 'intoca-sala')) throw new Recusa('instalacao-nao-confirmada', 'o comando terminou bem, mas o pacote não aparece na lista; nada mais foi feito');
  return { ...base, estado: 'instalada', catalogo, pacotes: nomes, comandos, vale: 'nos chats novos (o chat de agora não recarrega sozinho)' };
}

// ------------------------------------------------------------ atualização automática do InToca (PLG-06a)

// O Claude Code só atualiza sozinho um catálogo de terceiros se a pessoa ligar isso, e o botão de `/plugin` grava `autoUpdate` na
// entrada do catálogo em `plugins/known_marketplaces.json`. Não há comando do `claude plugin marketplace` para isso: este passo
// grava o mesmo campo, só na entrada do catálogo de onde o `intoca` veio (achado por `claude plugin list --json`, nunca por nome fixo),
// depois de guardar uma cópia do arquivo ao lado. Catálogo de pasta local (como o da sede) carrega no lugar e não tem o que atualizar.
const FONTES_SEM_ATUALIZACAO = new Set(['directory', 'file', 'claudeai', 'pluginDirectory']);
// Variáveis que, segundo a documentação do Claude Code, desligam as atualizações automáticas inteiras.
const AVISOS_DE_ATUALIZACAO = ['DISABLE_UPDATES', 'DISABLE_AUTOUPDATER', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'];

// A pasta `plugins/` do Claude Code: a que guarda `cache/<catálogo>/<plugin>/<versão>`, derivada do `installPath` do próprio `intoca`
// (vale para qualquer CLAUDE_CONFIG_DIR e para uma pasta de cache escolhida pela pessoa); senão a variável; senão `.claude`.
function pastaDosPlugins(item, catalogo) {
  const caminho = String(item?.installPath ?? '');
  const partes = caminho.split(/[\\/]+/).filter((p) => p !== '');
  const i = partes.length - 4;
  if (i > 0 && partes[i] === 'cache' && partes[i + 1] === catalogo && partes[i + 2] === 'intoca') {
    const raiz = caminho.split(/[\\/]+/);
    return raiz.slice(0, raiz.length - 4).join(sep) || sep;
  }
  const config = process.env.CLAUDE_CONFIG_DIR;
  if (typeof config === 'string' && config !== '') return join(config, 'plugins');
  const casa = pastaDoUsuario();
  return casa ? join(casa, '.claude', 'plugins') : null;
}

function passoAPassoDaAtualizacao(catalogo) {
  return [
    'No Claude Code, digite /plugin e escolha a aba Marketplaces.',
    `Escolha o marketplace "${catalogo}" e ative "Enable auto-update".`,
    `Para atualizar agora, sem esperar: claude plugin update intoca@${catalogo} (vale na próxima abertura ou com /reload-plugins).`,
  ];
}

function atualizacao(entrada, d) {
  const simular = entrada.simular !== false;
  const claude = acharClaude(d);
  const lista = claude ? listaDePlugins(claude, d) : null;
  const intoca = acharPlugin(lista, 'intoca');
  const catalogo = catalogoDe(intoca) ?? CATALOGO_PADRAO;
  const manual = { passoAPasso: passoAPassoDaAtualizacao(catalogo), comandoManual: `claude plugin update intoca@${catalogo}` };
  const base = { ok: true, acao: 'atualizacao', simulado: simular, criados: [], jaExistiam: [], erros: [], estado: null, catalogo, ...manual };
  if (entrada.recusou === true) return { ...base, simulado: false, estado: 'recusada', fecho: 'atualização: pela pessoa', aviso: 'A pessoa não quis a atualização automática. Nada foi gravado; ela pode ligar depois pelo passo a passo.' };
  if (!claude) throw new Recusa('claude-nao-achado', 'não achei o programa do Claude para conferir de onde o plugin veio; nada foi gravado. Use o passo a passo', { ...manual, fecho: 'atualização: pela pessoa' });
  if (lista === null) throw new Recusa('lista-indisponivel', 'não consegui ler a lista de plugins instalados; nada foi gravado. Use o passo a passo', { ...manual, fecho: 'atualização: pela pessoa' });
  if (!intoca || !idDoPlugin(intoca).includes('@')) throw new Recusa('intoca-sem-catalogo', 'não achei o plugin intoca instalado a partir de um catálogo; nada foi gravado. Use o passo a passo', { ...manual, fecho: 'atualização: pela pessoa' });
  const pasta = pastaDosPlugins(intoca, catalogo);
  if (!pasta) throw new Recusa('sem-pasta-do-usuario', 'não achei a pasta de configuração do Claude; nada foi gravado. Use o passo a passo', { ...manual, fecho: 'atualização: pela pessoa' });
  const arquivo = join(pasta, 'known_marketplaces.json');
  let original;
  let dado;
  try {
    original = readFileSync(arquivo);
    dado = JSON.parse(original.toString('utf8').replace(/^﻿/, ''));
  } catch { throw new Recusa('registro-ilegivel', 'não consegui ler a lista de catálogos do Claude; nada foi gravado. Use o passo a passo', { ...manual, fecho: 'atualização: pela pessoa' }); }
  const entradaDoCatalogo = dado && typeof dado === 'object' && !Array.isArray(dado) && Object.hasOwn(dado, catalogo) ? dado[catalogo] : null;
  if (!entradaDoCatalogo || typeof entradaDoCatalogo !== 'object') throw new Recusa('catalogo-nao-registrado', `o catálogo "${catalogo}" não está na lista do Claude; nada foi gravado. Use o passo a passo`, { ...manual, fecho: 'atualização: pela pessoa' });
  const fonte = String(entradaDoCatalogo.source?.source ?? '');
  if (FONTES_SEM_ATUALIZACAO.has(fonte)) {
    return { ...base, simulado: false, estado: 'nao-se-aplica', fonte, fecho: 'atualização automática: não se aplica, catálogo local', aviso: 'Este catálogo é uma pasta do computador: o plugin é lido no lugar e acompanha a pasta, então não há o que atualizar sozinho. Nada foi gravado.' };
  }
  // O Claude Code dá a palavra final ao `autoUpdate` declarado nas configurações da pessoa (`extraKnownMarketplaces`), que vale mais que o
  // do arquivo de catálogos: se ele diz `false`, gravar `true` aqui não adiantaria. Só lê; o `settings.json` da pessoa não é tocado.
  const declaradoPelaPessoa = autoUpdateDeclarado(dirname(pasta), catalogo);
  if (declaradoPelaPessoa === false) {
    throw new Recusa('desligada-nas-configuracoes', 'a atualização automática deste catálogo foi desligada nas configurações do Claude desta pessoa, e isso vale mais que o arquivo de catálogos; nada foi gravado. Use o passo a passo (ativar "Enable auto-update" em /plugin)', { ...manual, fecho: 'atualização: pela pessoa' });
  }
  const avisos = AVISOS_DE_ATUALIZACAO.filter((v) => (process.env[v] ?? '') !== '').map((v) => `a variável ${v} está definida neste computador e desliga as atualizações automáticas do Claude Code, mesmo com a escolha gravada`);
  if (entradaDoCatalogo.autoUpdate === true) return { ...base, simulado: false, estado: 'ja-ligada', fonte, avisos, fecho: 'atualização automática: ligada' };
  const plano = { arquivo, catalogo, campo: 'autoUpdate', de: entradaDoCatalogo.autoUpdate ?? null, para: true, copiaAntes: `${arquivo}.intoca-copia-<data e hora>` };
  if (simular) return { ...base, estado: 'simulada', fonte, plano, avisos };
  if (entrada.confirmado !== true) throw new Recusa('sem-confirmacao', 'para ligar de verdade, a entrada precisa de "confirmado": true (o "sim" da pessoa)');
  const copia = `${arquivo}.intoca-copia-${carimbo()}`;
  try {
    copyFileSync(arquivo, copia, 1); // 1 = COPYFILE_EXCL: nunca sobrescreve uma cópia
  } catch (e) {
    throw new Recusa('copia-falhou', `não consegui guardar a cópia do arquivo de catálogos (${String(e?.code ?? e?.message ?? e)}); nada foi gravado. Tente de novo em um minuto ou use o passo a passo`, { ...manual, fecho: 'atualização: pela pessoa' });
  }
  const restaurar = () => { try { writeFileSync(arquivo, original); return true; } catch { return false; } };
  const novo = { ...dado, [catalogo]: { ...entradaDoCatalogo, autoUpdate: true } };
  try {
    writeFileSync(arquivo, `${JSON.stringify(novo, null, 2)}${original.toString('utf8').endsWith('\n') ? '\n' : ''}`);
    const conferido = JSON.parse(readFileSync(arquivo, 'utf8'))?.[catalogo]?.autoUpdate === true;
    const aindaLe = d.rodar(claude, ['plugin', 'marketplace', 'list', '--json'], { tempo: 60000 }).status === 0;
    if (!conferido || !aindaLe) throw new Error('o Claude não leu a lista depois da gravação');
  } catch (e) {
    const voltou = restaurar();
    throw new Recusa('gravacao-falhou', `não consegui ligar a atualização automática (${String(e?.message ?? e)}); ${voltou ? 'a lista de catálogos do Claude ficou como estava' : 'ATENÇÃO: restaure a lista pela cópia ao lado'}. Use o passo a passo`, { ...manual, copia, restaurado: voltou, fecho: 'atualização: pela pessoa' });
  }
  return { ...base, simulado: false, estado: 'ligada', fonte, plano, avisos, criados: [copia], fecho: 'atualização automática: ligada', vale: 'ligada para este catálogo: o Claude Code confere depois da primeira mensagem de uma sessão (com um atraso de até 10 minutos) e aplica a versão nova na abertura seguinte (ou com /reload-plugins)' };
}

// `autoUpdate` do catálogo nas configurações do usuário (`<pasta do Claude>/settings.json`, `extraKnownMarketplaces`): true, false ou null (não declarado ou ilegível). Só lê.
function autoUpdateDeclarado(pastaDoClaude, catalogo) {
  try {
    const s = JSON.parse(readFileSync(join(pastaDoClaude, 'settings.json'), 'utf8').replace(/^﻿/, ''));
    const e = s?.extraKnownMarketplaces;
    const v = e && typeof e === 'object' && Object.hasOwn(e, catalogo) ? e[catalogo]?.autoUpdate : undefined;
    return typeof v === 'boolean' ? v : null;
  } catch { return null; }
}

// `catalogo`: o de onde o `intoca` (ou a própria sala) veio, achado por `claude plugin list --json`; sem ele, o padrão.
function textoParaDesligar(catalogo = CATALOGO_PADRAO) {
  return {
    semLancador: 'variável INTOCA_SALA_SEM_LANCADOR=1, ou "lancador": false no arquivo .intoca/sala.json da pasta do usuário',
    desinstalar: `claude plugin uninstall intoca-sala@${catalogo}`,
  };
}

// ------------------------------------------------------------ a sala animada

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const barras = (p) => p.split(sep).join('/').replace(/\\/g, '/');

function portaPedida(valor) {
  const p = valor === undefined || valor === null || valor === '' ? PORTA_PADRAO : Number(valor);
  if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Recusa('porta-invalida', 'a porta precisa ser um número inteiro de 1024 a 65535 (a sugerida é 8765)');
  return p;
}

// Procura, no texto do manifesto, a ferramenta da sala animada já registrada: { pasta, porta } ou null.
export function ferramentaNoManifesto(texto) {
  const linhas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const inicio = linhas.findIndex((l) => /^ferramentas:\s*(#.*)?$/.test(l));
  if (inicio < 0) return null;
  let item = null;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const l = linhas[i];
    if (/^\S/.test(l)) break;
    const novo = l.match(/^\s*-\s+nome:\s*(.*?)\s*(?:#.*)?$/);
    if (novo) {
      if (item?.ehAnimada) break;
      item = { ehAnimada: novo[1].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1').includes('AI Operations Room'), pasta: null, porta: null };
      continue;
    }
    if (!item?.ehAnimada) continue;
    const pasta = l.match(/^\s+pasta:\s*(.*?)\s*(?:#.*)?$/);
    if (pasta) item.pasta = pasta[1].replace(/^'(.*)'$/, (_, v) => v.replace(/''/g, "'")).replace(/^"(.*)"$/, '$1');
    const porta = l.match(/^\s+porta:\s*(\d+)\b/);
    if (porta) item.porta = Number(porta[1]);
  }
  return item?.ehAnimada ? { pasta: item.pasta, porta: item.porta } : null;
}

function lerManifestoDa(pasta) {
  try { return readFileSync(join(pasta, 'sede.yaml'), 'utf8'); } catch { return null; }
}

function sedeDaEntrada(entrada) {
  if (typeof entrada.sede === 'string' && entrada.sede !== '') return resolve(entrada.sede);
  return acharSede(process.cwd()) ?? sedeIndicada() ?? null;
}

function temLinkNoCaminho(caminho) {
  let atual = resolve(caminho);
  for (let i = 0; i < 64; i += 1) {
    try { if (lstatSync(atual).isSymbolicLink()) return true; } catch { /* não existe ainda */ }
    const pai = dirname(atual);
    if (pai === atual) return false;
    atual = pai;
  }
  return false;
}

// A primeira pasta que não existe no caminho (a que este passo criaria primeiro), ou null se a pasta já existe.
function primeiraAusente(caminho) {
  let atual = resolve(caminho);
  let ausente = null;
  for (let i = 0; i < 64 && !existsSync(atual); i += 1) {
    ausente = atual;
    atual = dirname(atual);
  }
  return ausente;
}

function destinoPedido(entrada, sede, daFerramenta) {
  let pasta = typeof entrada.pasta === 'string' && entrada.pasta.trim() !== '' ? entrada.pasta.trim() : daFerramenta?.pasta ?? null;
  if (!pasta && sede) pasta = join(sede, '_tools', 'ai-operations-room');
  if (!pasta) throw new Recusa('destino-invalido', 'não sei onde guardar a sala animada: informe a pasta ("pasta") ou a sede ("sede")');
  if (/[\0\r\n]/.test(pasta) || !isAbsolute(pasta)) throw new Recusa('destino-invalido', 'a pasta precisa ser um caminho completo, numa linha só');
  if (pasta.split(/[\\/]+/).includes('..')) throw new Recusa('destino-invalido', 'a pasta não pode conter ".."');
  const destino = resolve(pasta);
  if (temLinkNoCaminho(destino)) throw new Recusa('destino-invalido', 'o caminho passa por um link ou junção; escolha uma pasta comum');
  return destino;
}

function destinoLivreOuSala(destino, d) {
  if (!existsSync(destino)) return 'novo';
  const eh = lstatSync(destino);
  if (!eh.isDirectory()) throw new Recusa('destino-ocupado', 'no destino já existe um arquivo; escolha outra pasta');
  if (readdirSync(destino).length === 0) return 'vazio';
  const origem = d.rodar('git', ['-C', destino, 'remote', 'get-url', 'origin'], { tempo: 20000 });
  if (origem.status === 0 && primeiraLinha(origem.stdout).replace(/\.git$/, '').toLowerCase() === d.url.toLowerCase()) return 'ja-clonado';
  throw new Recusa('destino-ocupado', 'a pasta do destino já tem outro conteúdo; nada foi mexido. Escolha uma pasta vazia ou que ainda não exista');
}

function pythonDoAmbiente(destino) {
  return process.platform === 'win32' ? join(destino, '.venv', 'Scripts', 'python.exe') : join(destino, '.venv', 'bin', 'python');
}

function arquivoDeConfiguracoes() {
  const casa = pastaDoUsuario();
  if (!casa) throw new Recusa('sem-pasta-do-usuario', 'não achei a pasta pessoal para localizar as configurações do Claude');
  return join(casa, '.claude', 'settings.json');
}

const carimbo = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');

function itemDaFerramenta(destino, porta, d) {
  const py = barras(pythonDoAmbiente(destino));
  return [
    `  - nome: ${quote(NOME_DA_ANIMADA)}`,
    `    pasta: ${quote(barras(destino))}`,
    `    porta: ${porta}`,
    `    instala: 'passo opcional do /intoca:comecar: clone do repositório público e uv sync'`,
    `    inicia: '.venv dentro da pasta: python -m backend.cli serve --port ${porta}'`,
    `    command: [${quote(py)}, -m, backend.cli, serve, --port, '${porta}']`,
    `    cwd: ${quote(barras(destino))}`,
    `    origem: ${d.url}`,
  ].join('\n');
}

function animada(entrada, d) {
  const simular = entrada.simular !== false;
  const comHooks = entrada.hooks === true;
  const saida = {
    ok: true, acao: 'animada', simulado: simular, criados: [], jaExistiam: [], erros: [], avisos: [],
    passos: [], plano: null, manifesto: null, iniciar: null,
  };
  const sede = sedeDaEntrada(entrada);
  const texto = sede ? lerManifestoDa(sede) : null;
  const daFerramenta = texto ? ferramentaNoManifesto(texto) : null;
  const porta = portaPedida(entrada.porta ?? daFerramenta?.porta);
  const destino = destinoPedido(entrada, sede, daFerramenta);

  // 1. programas (nada é instalado por aqui: o que falta, a pessoa instala)
  const git = conferirPrograma(d, 'git', ['--version']);
  if (!git.ok) throw new Recusa('sem-git', 'o programa "git" não está instalado (ele baixa a sala animada). Instale-o em https://git-scm.com e peça de novo; nada foi feito');
  const uv = conferirPrograma(d, 'uv', ['--version']);
  if (!uv.ok) throw new Recusa('sem-uv', 'o programa "uv" não está instalado (ele prepara o Python da sala animada). Instale-o em https://docs.astral.sh/uv/getting-started/installation/ e peça de novo; nada foi feito');
  const python = conferirPython(d, true);
  if (!python.ok) throw new Recusa('sem-python', 'não achei o Python 3.12 ou mais novo. Rode "uv python install 3.12" (ele baixa o Python) e peça de novo; nada foi feito');

  // 2. porta e destino
  const livre = d.portaLivre(porta);
  if (!livre) throw new Recusa('porta-ocupada', `a porta ${porta} já está em uso por outro programa; escolha outra porta (sugestão: ${porta + 1}). Nada foi feito`, { portaSugerida: porta + 1 });
  const estadoDoDestino = destinoLivreOuSala(destino, d);

  const arquivo = comHooks ? arquivoDeConfiguracoes() : null;
  saida.plano = {
    clonar: estadoDoDestino === 'ja-clonado' ? null : { url: d.url, destino },
    jaClonado: estadoDoDestino === 'ja-clonado',
    sincronizar: 'uv sync',
    porta,
    hooks: comHooks ? { arquivo, copiaAntes: `${arquivo}.intoca-copia-<data e hora>`, eventos: EVENTOS_DOS_HOOKS, aviso: 'altera as configurações do Claude desta pessoa (cada evento ganha uma chamada ao capturador da sala); a cópia fica guardada ao lado' } : null,
  };
  const mesmaPasta = daFerramenta?.pasta && resolve(daFerramenta.pasta).toLowerCase() === destino.toLowerCase();
  if (daFerramenta && mesmaPasta && daFerramenta.porta === porta) saida.manifesto = { itemDaFerramenta: null, jaRegistrada: true };
  else {
    saida.manifesto = { itemDaFerramenta: itemDaFerramenta(destino, porta, d), jaRegistrada: false, substituiItem: Boolean(daFerramenta) };
    if (daFerramenta) saida.avisos.push('O manifesto já tem a sala animada, mas com outra pasta ou outra porta: troque o item existente pelo novo, em vez de acrescentar um segundo.');
  }
  saida.iniciar = `${barras(pythonDoAmbiente(destino))} -m backend.cli serve --port ${porta}   (dentro da pasta da sala)`;
  if (!comHooks) saida.avisos.push('Os hooks (a ponte entre os chats e a sala) não serão registrados: sem eles a sala abre, mas só mostra o que for capturado depois. Peça de novo com "hooks": true e o "sim" da pessoa para registrar.');
  if (simular) {
    saida.passos = [
      { passo: 'clonar', estado: estadoDoDestino === 'ja-clonado' ? 'ja-feito' : 'simulado' },
      { passo: 'sincronizar', estado: 'simulado' },
      { passo: 'hooks', estado: comHooks ? 'simulado' : 'pulado' },
    ];
    return saida;
  }
  if (comHooks && entrada.confirmado !== true) throw new Recusa('sem-confirmacao', 'registrar os hooks altera as configurações do Claude e exige "confirmado": true (o "sim" da pessoa, depois de ver o arquivo e a cópia)');

  // 3. fazer; falha desfaz o que este passo criou
  // `criadoPorMim`: a primeira pasta que não existia no caminho (e tudo dentro dela). Destino que já existia vazio
  // fica de pé: só o conteúdo que o clone trouxe é desfeito.
  const criadoPorMim = estadoDoDestino === 'ja-clonado' ? null : primeiraAusente(destino);
  const desfazer = () => {
    if (estadoDoDestino === 'ja-clonado') return false;
    try {
      if (criadoPorMim) rmSync(criadoPorMim, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      else for (const nome of readdirSync(destino)) rmSync(join(destino, nome), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return true;
    } catch { return false; }
  };
  try {
    if (estadoDoDestino === 'ja-clonado') {
      saida.jaExistiam.push(destino);
      saida.passos.push({ passo: 'clonar', estado: 'ja-feito' });
    } else {
      mkdirSync(dirname(destino), { recursive: true });
      const c = d.rodar('git', ['clone', '--quiet', d.url, destino], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, tempo: d.tempoDoClone });
      if (c.status !== 0) {
        const desfeito = desfazer();
        throw new Recusa('clone-falhou', `não consegui baixar a sala animada (${primeiraLinha(c.stderr) || c.erro || 'sem mensagem'}). Confira a internet e tente de novo; ${desfeito ? 'o que foi criado foi desfeito' : 'nada ficou pela metade'}`, { desfeito });
      }
      saida.criados.push(destino);
      saida.passos.push({ passo: 'clonar', estado: 'feito' });
    }
    const s = d.rodar('uv', ['sync'], { cwd: destino, tempo: d.tempoDoSync });
    if (s.status !== 0) {
      const desfeito = desfazer();
      throw new Recusa('sincronizar-falhou', `não consegui preparar o ambiente da sala animada (${primeiraLinha(s.stderr) || s.erro || 'sem mensagem'}); ${desfeito ? 'o que este passo criou foi desfeito' : 'a pasta existente foi mantida como estava'}`, { desfeito });
    }
    saida.passos.push({ passo: 'sincronizar', estado: 'feito' });
    if (comHooks) saida.passos.push(registrarHooks(destino, arquivo, d, saida));
    else saida.passos.push({ passo: 'hooks', estado: 'pulado' });
  } catch (e) {
    if (e instanceof Recusa) e.extra.passos = saida.passos;
    throw e;
  }
  return saida;
}

// Guarda uma cópia do arquivo de configurações, registra os hooks pelo comando da própria sala e, se algo falhar,
// devolve o arquivo exatamente como estava. Nunca apaga a cópia.
function registrarHooks(destino, arquivo, d, saida) {
  const existia = existsSync(arquivo);
  const original = existia ? readFileSync(arquivo) : null;
  let copia = null;
  if (existia) {
    copia = `${arquivo}.intoca-copia-${carimbo()}`;
    copyFileSync(arquivo, copia, 1); // 1 = COPYFILE_EXCL: nunca sobrescreve uma cópia
    saida.criados.push(copia);
  }
  const restaurar = () => {
    try {
      if (existia) writeFileSync(arquivo, original);
      else if (existsSync(arquivo)) unlinkSync(arquivo);
      return true;
    } catch { return false; }
  };
  const py = pythonDoAmbiente(destino);
  const r = d.rodar(py, ['-m', 'backend.cli', 'hooks-install', '--settings', arquivo], { cwd: destino, tempo: 60000 });
  const alterado = existia ? !readFileSync(arquivo).equals(original) : existsSync(arquivo);
  if (r.status !== 0) {
    const voltou = alterado ? restaurar() : true;
    throw new Recusa('hooks-falhou', `não consegui registrar os hooks (${primeiraLinha(r.stderr || r.stdout) || r.erro || 'sem mensagem'}); ${voltou ? 'as configurações do Claude ficaram como estavam' : 'ATENÇÃO: restaure as configurações pela cópia ao lado'}. A sala animada continua instalada, só sem a ponte`, { copia, restaurado: voltou });
  }
  return { passo: 'hooks', estado: 'feito', arquivo, copia };
}

// ------------------------------------------------------------ entrada e saída

function lerEntrada() {
  const arg = process.argv[2];
  const bruto = !arg || arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');
  if (bruto.length > LIMITE_DA_ENTRADA) throw new Recusa('entrada-grande', 'o pedido é grande demais');
  let dado;
  try { dado = JSON.parse(bruto.replace(/^﻿/, '')); } catch { throw new Recusa('entrada-invalida', 'o pedido não é um JSON válido'); }
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) throw new Recusa('entrada-invalida', 'o pedido precisa ser um objeto JSON');
  return dado;
}

const comoErro = (e) => {
  const r = e instanceof Recusa ? e : new Recusa('erro-interno', String(e?.message ?? e));
  return { ok: false, criados: [], jaExistiam: [], erros: [{ codigo: r.codigo, mensagem: r.message, ...r.extra }] };
};

// Roda uma ação e devolve a saída (nunca lança). `deps` troca os processos, a conferência de porta e a URL (uso dos testes).
export function executar(entrada, deps = {}) {
  try {
    const d = { ...DEPS_PADRAO, ...deps };
    const acao = entrada.acao;
    if (acao === 'verificar') return verificar(d);
    if (acao === 'sala') return sala(entrada, d);
    if (acao === 'animada') return animada(entrada, d);
    if (acao === 'atualizacao') return atualizacao(entrada, d);
    throw new Recusa('acao-inexistente', `acao: "${String(acao)}" não existe; use verificar, sala, atualizacao ou animada`);
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

function ehOPrograma() {
  try { return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url)); } catch { return false; } // importado (sem argv[1]): não roda
}
if (ehOPrograma()) principal();
