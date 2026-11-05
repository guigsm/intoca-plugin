// Ponteiro da sede, estado da máquina (`~/.intoca/sala.json`) e escolha da porta. Nada daqui lê segredo.
//   - sede: `INTOCA_SEDE` (pasta com `sede.yaml`, ou o próprio arquivo), depois a primeira linha de `~/.intoca/sede`.
//   - estado: `{classica: {porta, pid, iniciou_em}, animada?: {porta, pid, iniciou_em}, controle: false}`.
//     A Animada grava a chave dela; a Clássica nunca apaga o que não é dela. `controle` só o proprietário liga.
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

/** Pasta do usuário: `INTOCA_HOME` (a mesma variável dos hooks do plugin) ou a do sistema. */
export const casaDe = (env = process.env) => (env.INTOCA_HOME?.trim() && isAbsolute(env.INTOCA_HOME.trim()) ? env.INTOCA_HOME.trim() : homedir());

export const arquivoDeEstado = (casa) => join(casa, '.intoca', 'sala.json');

function raizDeSede(caminho) {
  const c = String(caminho ?? '').trim().replace(/^﻿/, '');
  if (!c || !isAbsolute(c)) return null;
  try {
    if (statSync(c).isFile()) return /sede\.ya?ml$/i.test(c) ? dirname(c) : null;
  } catch {
    return null;
  }
  return existsSync(join(c, 'sede.yaml')) ? c.replace(/[\\/]+$/, '') : null;
}

/** { raiz, origem: 'INTOCA_SEDE' | 'ponteiro' } ou null. */
export function acharSede({ env = process.env, casa = casaDe(env) } = {}) {
  const doEnv = raizDeSede(env.INTOCA_SEDE);
  if (doEnv) return { raiz: doEnv, origem: 'INTOCA_SEDE' };
  try {
    const texto = readFileSync(join(casa, '.intoca', 'sede'), 'utf8');
    if (texto.length <= 4096) {
      const raiz = raizDeSede(texto.split(/\r?\n/)[0]);
      if (raiz) return { raiz, origem: 'ponteiro' };
    }
  } catch {
    /* sem ponteiro */
  }
  return null;
}

export function lerEstado(casa) {
  try {
    const dado = JSON.parse(readFileSync(arquivoDeEstado(casa), 'utf8'));
    return dado && typeof dado === 'object' && !Array.isArray(dado) ? dado : {};
  } catch {
    return {};
  }
}

function gravar(casa, estado) {
  const alvo = arquivoDeEstado(casa);
  mkdirSync(dirname(alvo), { recursive: true });
  const tmp = `${alvo}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(estado, null, 2)}\n`);
  renameSync(tmp, alvo);
}

/** Registra a Clássica e preserva o resto (a chave da Animada, `controle`). `controle` nasce `false`. */
export function registrarClassica(casa, { porta, pid = process.pid, agora = new Date() }) {
  const atual = lerEstado(casa);
  gravar(casa, {
    ...atual,
    classica: { porta, pid, iniciou_em: agora.toISOString() },
    controle: typeof atual.controle === 'boolean' ? atual.controle : false,
  });
}

/** Ao encerrar, tira só o registro da própria Clássica (mesmo pid). */
export function desregistrarClassica(casa, pid = process.pid) {
  const atual = lerEstado(casa);
  if (atual.classica?.pid !== pid) return;
  const { classica: _, ...resto } = atual;
  gravar(casa, resto);
}

/** O controle (iniciar e parar) só vale com `controle: true` escrito pelo proprietário. Qualquer outra coisa é desligado. */
export const controleLigado = (casa) => lerEstado(casa).controle === true;

// ---------- preferências da pessoa (ordem dos grupos) ----------

/** A ordem de grupos guardada em `sala.json` (`ordem`): só a lista de textos; qualquer outra coisa vale lista vazia. */
export function ordemSalva(casa) {
  const o = lerEstado(casa).ordem;
  return Array.isArray(o) ? o.filter((x) => typeof x === 'string') : [];
}

/** Grava `ordem` preservando o resto do arquivo. */
export function gravarOrdem(casa, ordem) {
  gravar(casa, { ...lerEstado(casa), ordem });
}

// ---------- a Animada neste arquivo ----------
// A Animada grava a chave `animada` inteira ao subir (`{porta, pid, iniciou_em, versao}`, sobrescrevendo o que havia) e a
// remove ao sair. Por isso o que é DA PESSOA (`pasta`, `porta`, `auto`) mora também numa chave que só a Clássica escreve,
// `animada_config`, e a leitura junta as duas: a escolha sobrevive à Animada subir e descer.
const PORTA_VALIDA = (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 65535 ? Number(v) : undefined);

/** `{pasta?, porta?, auto}` da pessoa: o que está em `animada` vale sobre o espelho `animada_config`. */
export function configDaAnimada(casa) {
  const e = lerEstado(casa);
  const eco = e.animada_config && typeof e.animada_config === 'object' && !Array.isArray(e.animada_config) ? e.animada_config : {};
  const viva = e.animada && typeof e.animada === 'object' && !Array.isArray(e.animada) ? e.animada : {};
  const pasta = typeof viva.pasta === 'string' && viva.pasta ? viva.pasta : typeof eco.pasta === 'string' && eco.pasta ? eco.pasta : undefined;
  const porta = PORTA_VALIDA(viva.porta) ?? PORTA_VALIDA(eco.porta);
  const auto = typeof viva.auto === 'boolean' ? viva.auto : eco.auto === true;
  return { pasta, porta, auto };
}

/** Grava `pasta`, `porta` e/ou `auto` (só as chaves dadas) em `animada` e no espelho, sem apagar o resto de nenhum dos dois. */
export function gravarConfigDaAnimada(casa, { pasta, porta, auto }) {
  const atual = lerEstado(casa);
  const dado = {};
  if (pasta !== undefined) dado.pasta = pasta;
  if (porta !== undefined) dado.porta = porta;
  if (auto !== undefined) dado.auto = auto === true;
  const base = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  gravar(casa, { ...atual, animada: { ...base(atual.animada), ...dado }, animada_config: { ...base(atual.animada_config), ...dado } });
}

/** O lançador anota o processo que subiu (`pid`, `iniciou_em`) em `animada`, sem tocar no resto. */
export function anotarSubidaDaAnimada(casa, { pid, agora = new Date() }) {
  const atual = lerEstado(casa);
  const base = atual.animada && typeof atual.animada === 'object' && !Array.isArray(atual.animada) ? atual.animada : {};
  gravar(casa, { ...atual, animada: { ...base, pid, iniciou_em: agora.toISOString() } });
}

// A porta está livre se nenhum dos dois loopbacks recusa abrir nela. Erro de permissão (porta baixa fora do
// Windows) também conta como não livre.
function livreEm(porta, host) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', (e) => resolve(e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT'));
    s.listen(porta, host, () => s.close(() => resolve(true)));
  });
}

export async function portaLivre(porta) {
  return (await livreEm(porta, '127.0.0.1')) && (await livreEm(porta, '::1'));
}

async function portaDoSistema() {
  for (let i = 0; i < 8; i += 1) {
    const porta = await new Promise((resolve) => {
      const s = createServer();
      s.once('error', () => resolve(0));
      s.listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
    });
    if (porta && (await portaLivre(porta))) return porta;
  }
  throw new Error('não achei uma porta livre');
}

/** `explicita` (INTOCA_SALA_PORTA) manda e falha se ocupada; senão a 80 se livre; senão uma porta livre. */
export async function escolherPorta({ explicita, preferida = 80, livre = portaLivre, sorteio = portaDoSistema } = {}) {
  if (explicita !== undefined && explicita !== '') {
    const n = Number(explicita);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`INTOCA_SALA_PORTA inválida: "${explicita}" (use um inteiro de 1 a 65535)`);
    if (!(await livre(n))) throw new Error(`a porta ${n} já está em uso`);
    return n;
  }
  return (await livre(preferida)) ? preferida : sorteio();
}
