#!/usr/bin/env node
// Aplica o rigor das permissões (PLG-14): escreve `.claude/settings.json` na sede e nas pastas dos projetos do
// manifesto, a partir de templates/permissoes/<nivel>.json. Node, sem dependência, sem rede.
//
// Uso:  node aplicar-rigor.mjs <arquivo.json>      pedido num arquivo JSON
//       node aplicar-rigor.mjs -                   pedido pela entrada padrão (também sem argumento)
// Saída: um JSON no stdout. Código 0 sem erros, 1 com erros. Erro de pedido (nível, alvo, entrada) não escreve
// nada; só uma falha de disco no meio da escrita deixa trabalho feito, e então a saída traz "parcial": true.
//
// Ações (campo "acao", padrão "aplicar"):
//   estado   só lê: o nível do manifesto, o da variável INTOCA_RIGOR, e cada alvo possível (a sede e as pastas
//            dos projetos) com a situação do `.claude/settings.json` dele.
//   aplicar  { "nivel": "cauteloso|equilibrado|autonomo" (opcional: o do manifesto), "simular": true|false,
//              "alvos": ["<pasta>", ...], "sede": "<pasta>" (opcional) }
//            → { ok, acao, nivel, simulado, sede, modelo, alvos: [{ caminho, acao: "criado"|"jaExistia"|"recusado",
//              motivo?, trecho?, mudaria? }], avisos, erros }
//
// Regras: nunca sobrescreve (arquivo que já existe sai como "jaExistia", com o trecho para colar à mão e o que
// mudaria); só escreve na sede e nas pastas `pasta_atual`/`pasta_futura` do manifesto, nunca em outra pasta, em
// caminho com ".." nem em caminho que passe por link ou junção; um alvo recusado recusa o pedido inteiro, antes
// de escrever qualquer arquivo. O nível autonomo ainda não existe e vira equilibrado, com aviso. O arquivo
// escrito é cópia exata do modelo: nenhum caminho de máquina vai para ele. Não lê INTOCA_RIGOR para decidir o
// que escreve (a variável é para teste e uso temporário do hook).
import { readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { absoluto, contem, mesmoCaminho, raizes, sedeIndicada, lerManifesto, nivelDeRigor, pastaDoUsuario } from '../hooks/lib.mjs';

const PACOTE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELOS = join(PACOTE, 'templates', 'permissoes');
const MODO_DO_NIVEL = { cauteloso: 'default', equilibrado: 'acceptEdits' };
const LIMITE_DA_ENTRADA = 65536;
const SEM_CONTROLE = /\p{C}/u;

class Recusa extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

const lf = (t) => t.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

// ------------------------------------------------------------ a sede e o manifesto

// Pasta pedida por texto: absoluta, sem "..", sem caractere de controle. Devolve o caminho resolvido ou null.
function caminhoAceito(valor) {
  if (typeof valor !== 'string' || valor.trim() === '' || valor.length > 4096) return null;
  const bruto = valor.trim();
  if (SEM_CONTROLE.test(bruto) || !absoluto(bruto)) return null;
  if (bruto.split(/[\\/]+/).includes('..')) return null;
  return resolve(bruto);
}

// A sede: a achada pela pasta atual, pela INTOCA_SEDE ou pelo ponteiro; "sede" no pedido só vale se for essa
// mesma, ou se nenhuma foi achada (sede recém-criada, sem ponteiro). Um manifesto qualquer não abre outra pasta.
function acharASede(entrada) {
  const r = raizes({ cwd: process.cwd() });
  const achada = r?.sede ?? sedeIndicada();
  if (entrada.sede === undefined) return achada;
  const pasta = caminhoAceito(entrada.sede);
  if (!pasta) throw new Recusa('sede-invalida', 'sede: informe o caminho completo da pasta da sede, sem ".."');
  if (achada && !mesmoCaminho(achada, pasta)) {
    throw new Recusa('sede-diferente', 'sede: a pasta pedida não é a sede que o plugin acha a partir daqui; abra o chat na sede ou num projeto dela');
  }
  return pasta;
}

// Pastas que nunca recebem arquivo, mesmo que o manifesto as cite: a raiz do disco, a pasta pessoal (lá o
// `.claude/settings.json` é a configuração da conta inteira) e qualquer pasta que contenha uma delas ou a sede.
function pastaProibida(pasta, sede) {
  if (dirname(pasta) === pasta) return 'a raiz do disco não recebe arquivo de permissões';
  for (const casa of [pastaDoUsuario(), (() => { try { return homedir(); } catch { return null; } })()].filter(Boolean)) {
    if (mesmoCaminho(casa, pasta) || contem(pasta, casa)) return 'a pasta pessoal (e quem a contém) não recebe arquivo de permissões: lá ele valeria para a conta inteira';
  }
  if (!mesmoCaminho(pasta, sede) && contem(pasta, sede)) return 'uma pasta que contém a sede não recebe arquivo de permissões';
  return null;
}

// Alvos possíveis: a sede e as pastas `pasta_atual` e `pasta_futura` (absolutas) de cada projeto.
function alvosPossiveis(sede, manifesto) {
  const lista = [{ caminho: sede, quem: 'sede' }];
  for (const p of manifesto.projetos) {
    for (const pasta of [p.pasta_atual, p.pasta_futura]) {
      if (absoluto(pasta) && !lista.some((a) => mesmoCaminho(a.caminho, pasta))) {
        lista.push({ caminho: resolve(pasta), quem: `projeto ${String(p.nome ?? '')}`.trim() });
      }
    }
  }
  return lista;
}

const informacao = (p) => { try { return lstatSync(p); } catch { return null; } };

// Situação do `.claude/settings.json` de uma pasta, sem escrever nada.
function situacao(pasta) {
  const claude = informacao(join(pasta, '.claude'));
  if (claude && (claude.isSymbolicLink() || !claude.isDirectory())) return 'estranho';
  const arquivo = claude ? informacao(join(pasta, '.claude', 'settings.json')) : null;
  if (!arquivo) return 'nao-existe';
  return arquivo.isFile() && !arquivo.isSymbolicLink() ? 'existe' : 'estranho';
}

function textoDoAviso(n) {
  if (n.aviso === 'autonomo-indisponivel') {
    return 'O nível autônomo ainda não está disponível (chega depois da trava de produção por arquivo): vale o equilibrado.';
  }
  if (n.aviso === 'invalido') return `O rigor "${String(n.pedido).slice(0, 40)}" não é um nível conhecido: na dúvida, vale o cauteloso.`;
  return null;
}

// ------------------------------------------------------------ o modelo

function lerModelo(nivel) {
  let texto;
  let json;
  try {
    texto = lf(readFileSync(join(MODELOS, `${nivel}.json`), 'utf8'));
    json = JSON.parse(texto);
  } catch {
    throw new Recusa('modelo-invalido', `o modelo de permissões do nível ${nivel} está ausente ou não é JSON`);
  }
  const p = json?.permissions;
  const listas = ['deny', 'ask', 'allow'].every((k) => Array.isArray(p?.[k]) && p[k].every((r) => typeof r === 'string'));
  if (!listas || p.defaultMode !== MODO_DO_NIVEL[nivel]) throw new Recusa('modelo-invalido', `o modelo do nível ${nivel} não tem o formato esperado`);
  return { texto, json };
}

// O que mudaria num settings.json que já existe, se a pessoa colasse o modelo.
function mudanca(existente, modelo) {
  let atual;
  try { atual = JSON.parse(lf(existente)); } catch { return { legivel: false }; }
  const p = atual && typeof atual === 'object' && atual.permissions && typeof atual.permissions === 'object' ? atual.permissions : {};
  const lista = (k) => (Array.isArray(p[k]) ? p[k] : []);
  const m = modelo.json.permissions;
  return {
    legivel: true,
    defaultMode: p.defaultMode === m.defaultMode ? null : { de: p.defaultMode ?? null, para: m.defaultMode },
    faltamNoDeny: m.deny.filter((r) => !lista('deny').includes(r)),
    faltamNoAsk: m.ask.filter((r) => !lista('ask').includes(r)),
    faltamNoAllow: m.allow.filter((r) => !lista('allow').includes(r)),
    allowQueOModeloNaoTem: lista('allow').filter((r) => !m.allow.includes(r)),
  };
}

// ------------------------------------------------------------ cada alvo

// Confere um alvo pedido e diz o que aconteceria: { caminho, acao, motivo?, pasta?, arquivo? }. Não escreve.
function planejar(valor, possiveis, modelo, sede) {
  const pasta = caminhoAceito(valor);
  const rotulo = typeof valor === 'string' ? valor.slice(0, 300) : String(valor);
  if (!pasta) return { caminho: rotulo, acao: 'recusado', motivo: 'caminho inválido: use o caminho completo da pasta, sem ".."' };
  if (!possiveis.some((a) => mesmoCaminho(a.caminho, pasta))) {
    return { caminho: pasta, acao: 'recusado', motivo: 'a pasta não é a sede nem a pasta de um projeto do manifesto' };
  }
  const proibida = pastaProibida(pasta, sede);
  if (proibida) return { caminho: pasta, acao: 'recusado', motivo: proibida };
  const info = informacao(pasta);
  if (!info) return { caminho: pasta, acao: 'recusado', motivo: 'a pasta não existe' };
  if (info.isSymbolicLink() || !info.isDirectory()) return { caminho: pasta, acao: 'recusado', motivo: 'o caminho é um link, uma junção ou um arquivo' };
  let real = null;
  try { real = realpathSync.native(pasta); } catch { /* sem caminho real */ }
  if (!real || !mesmoCaminho(real, pasta)) return { caminho: pasta, acao: 'recusado', motivo: 'o caminho passa por um link ou uma junção' };
  const claude = join(pasta, '.claude');
  const arquivo = join(claude, 'settings.json');
  const infoClaude = informacao(claude);
  if (infoClaude && (infoClaude.isSymbolicLink() || !infoClaude.isDirectory())) {
    return { caminho: arquivo, acao: 'recusado', motivo: 'a pasta .claude é um link ou um arquivo' };
  }
  const infoArquivo = infoClaude ? informacao(arquivo) : null;
  if (infoArquivo) {
    if (infoArquivo.isSymbolicLink() || !infoArquivo.isFile()) return { caminho: arquivo, acao: 'recusado', motivo: 'o settings.json é um link ou uma pasta' };
    let existente = '';
    try { existente = readFileSync(arquivo, 'utf8'); } catch { /* ilegível: o trecho vai do mesmo jeito */ }
    return { caminho: arquivo, acao: 'jaExistia', trecho: modelo.texto, mudaria: mudanca(existente, modelo) };
  }
  return { caminho: arquivo, acao: 'criado', pasta, claude };
}

function escrever(item, modelo) {
  try {
    mkdirSync(item.claude);
  } catch (e) {
    if (e.code !== 'EEXIST') throw new Recusa('erro-de-escrita', `${item.claude}: ${e.code ?? e.message}`);
  }
  const c = informacao(item.claude);
  if (!c || c.isSymbolicLink() || !c.isDirectory()) throw new Recusa('destino-e-link', 'a pasta .claude mudou durante a escrita');
  try {
    writeFileSync(item.caminho, modelo.texto, { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') return { caminho: item.caminho, acao: 'jaExistia', trecho: modelo.texto, mudaria: null };
    throw new Recusa('erro-de-escrita', `${item.caminho}: ${e.code ?? e.message}`);
  }
  return { caminho: item.caminho, acao: 'criado' };
}

// ------------------------------------------------------------ ações

function estado(entrada) {
  const sede = acharASede(entrada);
  const manifesto = sede ? lerManifesto(sede) : null;
  if (!manifesto) return { ok: true, acao: 'estado', achada: false };
  // `presente` segue o mesmo leitor do hook (bloco ou linha); `comentado` é a linha `# rigor:` do modelo.
  let campo = manifesto.rigor !== undefined ? 'presente' : 'ausente';
  if (campo === 'ausente') {
    try {
      if (/^ {2}# rigor:/m.test(lf(readFileSync(join(sede, 'sede.yaml'), 'utf8')))) campo = 'comentado';
    } catch { /* sem leitura */ }
  }
  const doManifesto = nivelDeRigor(manifesto, { variavel: false });
  return {
    ok: true, acao: 'estado', achada: true, sede,
    nivel: doManifesto.nivel, pedido: doManifesto.pedido, origem: doManifesto.origem, aviso: textoDoAviso(doManifesto),
    campoNoManifesto: campo,
    variavel: typeof process.env.INTOCA_RIGOR === 'string' && process.env.INTOCA_RIGOR.trim() !== '' ? nivelDeRigor(manifesto).nivel : null,
    alvos: alvosPossiveis(sede, manifesto).map((a) => ({ ...a, settings: situacao(a.caminho) })),
  };
}

function aplicar(entrada) {
  // Só um booleano decide: "true", 1 ou "sim" não podem virar escrita de verdade por engano.
  if (entrada.simular !== undefined && typeof entrada.simular !== 'boolean') {
    throw new Recusa('simular-invalido', 'simular: use true (só mostrar) ou false (escrever)');
  }
  const simular = entrada.simular === true;
  const sede = acharASede(entrada);
  const manifesto = sede ? lerManifesto(sede) : null;
  if (!manifesto) throw new Recusa('sem-sede', 'não achei a sede (sede.yaml legível); informe "sede" com o caminho dela');
  const avisos = [];
  let n;
  if (entrada.nivel === undefined || entrada.nivel === null) {
    n = nivelDeRigor(manifesto, { variavel: false });
  } else {
    if (typeof entrada.nivel !== 'string') throw new Recusa('nivel-desconhecido', 'nivel: use cauteloso ou equilibrado');
    n = nivelDeRigor({ rigor: entrada.nivel }, { variavel: false });
    if (n.aviso === 'invalido') throw new Recusa('nivel-desconhecido', `nivel: "${entrada.nivel.slice(0, 40)}" não existe; use cauteloso ou equilibrado`);
  }
  const aviso = textoDoAviso(n);
  if (aviso) avisos.push(aviso);
  if (!Array.isArray(entrada.alvos) || entrada.alvos.length === 0 || entrada.alvos.length > 64) {
    throw new Recusa('sem-alvos', 'alvos: informe de 1 a 64 pastas (a sede e as pastas dos projetos)');
  }
  const modelo = lerModelo(n.nivel);
  const possiveis = alvosPossiveis(sede, manifesto);
  const vistos = [];
  const plano = [];
  for (const valor of entrada.alvos) {
    const item = planejar(valor, possiveis, modelo, sede);
    if (vistos.some((v) => mesmoCaminho(v, item.caminho))) continue; // o mesmo alvo duas vezes conta uma
    vistos.push(item.caminho);
    plano.push(item);
  }
  const saida = {
    ok: true, acao: 'aplicar', nivel: n.nivel, simulado: simular, sede,
    modelo: {
      arquivo: `templates/permissoes/${n.nivel}.json`, defaultMode: modelo.json.permissions.defaultMode,
      deny: modelo.json.permissions.deny.length, ask: modelo.json.permissions.ask.length, allow: modelo.json.permissions.allow,
    },
    alvos: [], avisos, erros: [],
  };
  const recusados = plano.filter((x) => x.acao === 'recusado');
  if (recusados.length) {
    saida.ok = false;
    saida.alvos = plano.map(({ pasta, claude, ...resto }) => resto);
    saida.erros.push({ codigo: 'alvo-recusado', mensagem: `${recusados.length} alvo(s) recusado(s): nada foi escrito` });
    return saida;
  }
  for (const item of plano) {
    const { pasta, claude, ...publico } = item;
    if (!saida.ok) { // parou no erro anterior: o resto nem é tentado
      saida.alvos.push(item.acao === 'criado' ? { caminho: item.caminho, acao: 'recusado', motivo: 'não tentado: o pedido parou num erro de escrita' } : publico);
      continue;
    }
    if (item.acao !== 'criado' || simular) { saida.alvos.push(publico); continue; }
    try {
      saida.alvos.push(escrever(item, modelo));
    } catch (e) {
      saida.ok = false;
      saida.alvos.push({ caminho: item.caminho, acao: 'recusado', motivo: e.message });
      saida.erros.push({ codigo: e.codigo ?? 'erro-de-escrita', mensagem: e.message });
    }
  }
  if (saida.alvos.some((x) => x.acao === 'criado')) {
    avisos.push(`Nas pastas que recebem o arquivo, o modo "${modelo.json.permissions.defaultMode}" passa a valer no lugar do modo padrão do app.`);
  }
  if (saida.alvos.some((x) => x.acao === 'jaExistia')) {
    avisos.push('Onde já havia um settings.json, nada foi tocado: o trecho e o que mudaria vão junto, para a pessoa decidir.');
  }
  if (!saida.ok) saida.parcial = saida.alvos.some((x) => x.acao === 'criado');
  return saida;
}

function lerEntrada() {
  const alvo = process.argv[2];
  const bruto = alvo && alvo !== '-' ? readFileSync(alvo, 'utf8') : readFileSync(0, 'utf8');
  if (bruto.length > LIMITE_DA_ENTRADA) throw new Recusa('entrada-grande', 'o pedido passa de 64 KB');
  let dado;
  try { dado = JSON.parse(bruto.replace(/^﻿/, '')); } catch { throw new Recusa('entrada-invalida', 'o pedido não é um JSON válido'); }
  if (!dado || typeof dado !== 'object' || Array.isArray(dado)) throw new Recusa('entrada-invalida', 'o pedido deve ser um objeto JSON');
  return dado;
}

function principal() {
  let saida;
  try {
    const entrada = lerEntrada();
    const acao = entrada.acao ?? 'aplicar';
    if (acao === 'estado') saida = estado(entrada);
    else if (acao === 'aplicar') saida = aplicar(entrada);
    else throw new Recusa('acao-inexistente', `acao: "${String(acao).slice(0, 40)}" não existe; use estado ou aplicar`);
  } catch (e) {
    const recusa = e instanceof Recusa ? e : new Recusa('erro-interno', String(e?.message ?? e));
    saida = { ok: false, alvos: [], avisos: [], erros: [{ codigo: recusa.codigo, mensagem: recusa.message }] };
  }
  process.exitCode = saida.ok ? 0 : 1;
  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
}

principal();
