// Lançador da InToca Sala: sobe a Clássica quando ela não está no ar. Node puro, sem dependências.
//
// Regras de desenho (decisão de 2026-11-03, seção 5, e medições da passagem do painel):
//   - A máquina fica lenta depois do boot (subidas de 3 a 7 min): o prazo é generoso e o lançador NUNCA relança um processo
//     que está em subida. Não mata ninguém, nunca; no pior caso desiste em silêncio e deixa o motivo no log.
//   - Nunca derruba o chat: nada aqui lança para fora; o ponto de entrada sai sempre com 0 e sem saída.
//   - Um só lançador por vez: trava atômica em `~/.intoca/lancador.lock` (vários chats abrindo juntos não sobem várias salas).
//   - Uma tentativa por vez: se a última subida morreu cedo, espera `COOLDOWN_MS` antes de tentar de novo (sem laço).
//   - Estado em `~/.intoca/`: `sala.json` (escrito pela própria sala quando abre a porta), `lancador.lock`, `lancador.json`
//     (última tentativa) e logs. Nenhum segredo e nenhum valor de variável de ambiente vai para o log.
//
// Tudo que toca o mundo (relógio, sondagem HTTP, vida de processo, spawn) entra por `deps`, para o teste simular os cenários.
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { uptime } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { anotarSubidaDaAnimada, casaDe, configDaAnimada, lerEstado } from '../lib/estado.mjs';
import { PORTA_PADRAO, executavelSilencioso, resolverAnimada, sondarAnimada } from '../lib/animada.mjs';

export const PRAZO_PADRAO_MS = 10 * 60 * 1000; // a pior subida medida foi 7 min
export const PRAZO_ANIMADA_MS = 3 * 60 * 1000; // a Animada abriu a porta em 7 a 15 s; sob carga, bem mais (INT-04)
export const ANIMADA_SUBINDO_MS = 15 * 60 * 1000; // processo lançado há menos que isto e ainda vivo: está em subida
export const INTERVALO_MS = 3000;
export const SONDA_MS = 5000; // máquina saturada responde em dezenas de segundos: um "não respondeu" não prova que morreu
export const COOLDOWN_MS = 2 * 60 * 1000;
export const TRAVA_VELHA_MS = 15 * 60 * 1000;

const pastaIntoca = (casa) => join(casa, '.intoca');
export const arquivoTrava = (casa) => join(pastaIntoca(casa), 'lancador.lock');
export const arquivoTentativa = (casa) => join(pastaIntoca(casa), 'lancador.json');
export const arquivoLog = (casa) => join(pastaIntoca(casa), 'lancador.log');
export const arquivoLogSala = (casa) => join(pastaIntoca(casa), 'sala.log');
export const arquivoTravaAnimada = (casa) => join(pastaIntoca(casa), 'lancador-animada.lock');
export const arquivoLogAnimada = (casa) => join(pastaIntoca(casa), 'animada.log');

/** Caminho do server.mjs da Clássica, ao lado desta pasta. */
export const SERVIDOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs');

// ---------- leitura tolerante ----------

function lerJson(arquivo) {
  try {
    if (statSync(arquivo).size > 65536) return null;
    const dado = JSON.parse(readFileSync(arquivo, 'utf8'));
    return dado && typeof dado === 'object' && !Array.isArray(dado) ? dado : null;
  } catch {
    return null; // ausente, ilegível ou corrompido: tudo vale "sem registro"
  }
}

const inteiro = (v) => (Number.isInteger(v) && v > 0 ? v : null);

/** A entrada `classica` do sala.json, só se tiver o formato esperado. */
export function entradaDaClassica(casa) {
  const c = lerEstado(casa).classica;
  if (!c || typeof c !== 'object') return null;
  const porta = inteiro(c.porta);
  const pid = inteiro(c.pid);
  if (!porta || porta > 65535 || !pid) return null;
  const quando = Date.parse(c.iniciou_em);
  return { porta, pid, iniciouEm: Number.isNaN(quando) ? null : quando };
}

/** O lançador está desligado por escolha da pessoa? (`INTOCA_SALA_SEM_LANCADOR=1` ou `"lancador": false` no sala.json) */
export function desligado(casa, env = process.env) {
  const v = String(env.INTOCA_SALA_SEM_LANCADOR ?? '').trim();
  if (v !== '' && v !== '0') return true;
  return lerEstado(casa).lancador === false;
}

// ---------- o mundo, de verdade ----------

/** Vivo? `kill(pid, 0)` não envia nada: só pergunta. EPERM quer dizer que existe e é de outro usuário. */
export function pidVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}

/** É a Clássica que responde nessa porta? Confere o formato de `/api/saude`, não só a porta aberta. */
export function sondarSala(porta, tempoMs = SONDA_MS) {
  return new Promise((resolve) => {
    let fim = false;
    const terminar = (v) => {
      if (!fim) {
        fim = true;
        resolve(v);
      }
    };
    const req = request({ host: '127.0.0.1', port: porta, path: '/api/saude', method: 'GET', timeout: tempoMs, headers: { Host: 'localhost' } }, (res) => {
      let corpo = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        if (corpo.length < 65536) corpo += d;
      });
      res.on('end', () => {
        try {
          const j = JSON.parse(corpo);
          terminar(res.statusCode === 200 && typeof j?.versao === 'string' && 'controle' in j && 'sede' in j);
        } catch {
          terminar(false); // outra coisa escutando a porta (o painel antigo, outro servidor)
        }
      });
      res.on('error', () => terminar(false));
    });
    req.on('timeout', () => {
      req.destroy();
      terminar(false);
    });
    req.on('error', () => terminar(false));
    req.end();
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sobe a Clássica. Por padrão ela fica solta deste processo (`detached`, sobrevive ao hook). Com `preso` (modo serviço) fica
 * filha deste processo, que a acompanha. Devolve o pid e uma promessa que resolve com o código quando ela sai.
 */
export function lancarServidor({ casa, node = process.execPath, servidor = SERVIDOR, env = process.env, preso = false }) {
  mkdirSync(pastaIntoca(casa), { recursive: true });
  const log = openSync(arquivoLogSala(casa), 'w'); // só a última subida fica no log
  let filho;
  try {
    filho = spawn(node, [servidor], { detached: !preso, stdio: ['ignore', log, log], windowsHide: true, env });
  } finally {
    closeSync(log);
  }
  const saiu = new Promise((resolve) => {
    filho.once('exit', (codigo) => resolve(codigo ?? -1));
    filho.once('error', () => resolve(-1));
  });
  if (!preso) filho.unref();
  return { pid: filho.pid ?? null, saiu };
}

// ---------- log, trava e registro de tentativa ----------

export function registrar(casa, texto, agora = Date.now()) {
  try {
    mkdirSync(pastaIntoca(casa), { recursive: true });
    const arq = arquivoLog(casa);
    let antigo = '';
    try {
      antigo = statSync(arq).size > 65536 ? readFileSync(arq, 'utf8').split('\n').slice(-100).join('\n') : readFileSync(arq, 'utf8');
    } catch {
      /* log novo */
    }
    writeFileSync(arq, `${antigo}${new Date(agora).toISOString()} ${String(texto).slice(0, 300)}\n`);
  } catch {
    /* log é melhor esforço */
  }
}

/** Trava atômica. Devolve uma função que a solta, ou `null` se outro lançador vivo a tem. Trava de processo morto ou velha é tomada. */
export function pegarTrava(casa, { agora = Date.now(), vivo = pidVivo, pid = process.pid, arquivo = arquivoTrava(casa) } = {}) {
  const arq = arquivo;
  mkdirSync(pastaIntoca(casa), { recursive: true });
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    try {
      const fd = openSync(arq, 'wx');
      writeFileSync(fd, JSON.stringify({ pid, desde: new Date(agora).toISOString() }));
      closeSync(fd);
      return () => {
        const atual = lerJson(arq);
        if (atual?.pid === pid) rmSync(arq, { force: true });
      };
    } catch (e) {
      if (e?.code !== 'EEXIST') return null;
      const dono = lerJson(arq);
      const desde = Date.parse(dono?.desde);
      const velha = Number.isNaN(desde) || agora - desde > TRAVA_VELHA_MS;
      if (dono && inteiro(dono.pid) && vivo(dono.pid) && !velha) return null; // outro lançador trabalhando
      rmSync(arq, { force: true }); // dono morto, ilegível ou velho demais: toma
    }
  }
  return null;
}

function lerTentativa(casa) {
  const t = lerJson(arquivoTentativa(casa));
  const quando = Date.parse(t?.em);
  return t && !Number.isNaN(quando) ? { ...t, quando } : null;
}

function gravarTentativa(casa, dado) {
  try {
    const alvo = arquivoTentativa(casa);
    const tmp = `${alvo}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(dado)}\n`);
    renameSync(tmp, alvo);
  } catch {
    /* melhor esforço */
  }
}

// ---------- a decisão ----------

/**
 * Decide o que fazer olhando só o que foi lido (função pura, o coração do teste).
 *   entrada: { porta, pid, iniciouEm } da Clássica no sala.json, ou null
 *   respondeu: a Clássica respondeu em `entrada.porta`?
 *   vivo: o pid da entrada existe?
 *   inicioDoBoot: instante em que o sistema ligou (entrada anterior a ele é de uma vida passada)
 *   tentativa: última tentativa do lançador { quando, pid, resultado } ou null
 *   tentativaViva: o pid da última tentativa existe?
 * Devolve 'no-ar' | 'esperar' | 'subir' | 'esperar-subida' | 'aguardar-cooldown'.
 */
export function decidir({ entrada, respondeu, vivo, inicioDoBoot, tentativa, tentativaViva, agora, cooldownMs = COOLDOWN_MS }) {
  if (entrada && respondeu) return 'no-ar';
  // Entrada gravada antes deste boot é de outra vida: o pid pode até ter sido reaproveitado por outro programa.
  const entradaDesteBoot = entrada && (entrada.iniciouEm === null || entrada.iniciouEm >= inicioDoBoot);
  if (entradaDesteBoot && vivo) return 'esperar'; // a sala está de pé, só não respondeu ainda (máquina lenta): não mexe
  // O processo da última tentativa ainda existe: está em subida (a porta só é gravada depois de abrir). Por mais lenta que
  // esteja, não se relança; quem desiste é o vigia, ao fim do prazo dele, sem matar nada.
  if (tentativa && tentativa.pid && tentativaViva && tentativa.quando >= inicioDoBoot) return 'esperar-subida';
  // A última tentativa morreu cedo demais: espera um pouco em vez de tentar em laço.
  if (tentativa && tentativa.quando >= inicioDoBoot && tentativa.resultado === 'saiu-cedo' && agora - tentativa.quando < cooldownMs) return 'aguardar-cooldown';
  return 'subir';
}

// ---------- o vigia ----------

/**
 * Faz o trabalho todo. Devolve uma palavra para o log e para o teste:
 *   'desligado' | 'no-ar' | 'ocupado' | 'cooldown' | 'subiu' | 'prazo-esgotado' | 'saiu-cedo' | 'erro'
 * Nunca lança.
 */
export async function vigiar({ casa = casaDe(), env = process.env, prazoMs, deps = {} } = {}) {
  const d = {
    agora: () => Date.now(),
    esperar: dormir,
    sondar: sondarSala,
    vivo: pidVivo,
    lancar: () => lancarServidor({ casa, env }),
    inicioDoBoot: () => Date.now() - uptime() * 1000,
    intervaloMs: INTERVALO_MS,
    ...deps,
  };
  const prazo = prazoMs ?? (Number(env.INTOCA_SALA_PRAZO_S) > 0 ? Number(env.INTOCA_SALA_PRAZO_S) * 1000 : PRAZO_PADRAO_MS);
  let soltar = null;
  try {
    if (desligado(casa, env)) return 'desligado';
    soltar = pegarTrava(casa, { agora: d.agora(), vivo: d.vivo });
    if (!soltar) return 'ocupado'; // outro chat já está cuidando disso
    const boot = d.inicioDoBoot() - 60000; // folga de 1 min para relógios que se corrigem
    const fim = d.agora() + prazo;
    let lancou = null; // { pid, saiu, codigo }
    let jaLancou = false;

    for (;;) {
      const entrada = entradaDaClassica(casa);
      const respondeu = entrada ? await d.sondar(entrada.porta) : false;
      const tentativa = lerTentativa(casa);
      const acao = decidir({
        entrada,
        respondeu,
        vivo: entrada ? d.vivo(entrada.pid) : false,
        inicioDoBoot: boot,
        tentativa,
        tentativaViva: tentativa?.pid ? d.vivo(tentativa.pid) : false,
        agora: d.agora(),
      });

      if (acao === 'no-ar') {
        if (jaLancou) registrar(casa, `no ar na porta ${entrada.porta}`, d.agora());
        return jaLancou ? 'subiu' : 'no-ar';
      }
      if (acao === 'subir' && !jaLancou) {
        const filho = d.lancar();
        jaLancou = true;
        lancou = { ...filho, codigo: undefined };
        filho.saiu?.then((c) => {
          lancou.codigo = c;
        });
        gravarTentativa(casa, { em: new Date(d.agora()).toISOString(), pid: filho.pid, resultado: 'subindo' });
        registrar(casa, `subindo a InToca Sala (pid ${filho.pid})`, d.agora());
      } else if (acao === 'aguardar-cooldown' && !jaLancou) {
        registrar(casa, 'a última subida falhou há pouco; não tento de novo agora', d.agora());
        return 'cooldown';
      } else if (acao === 'subir' && jaLancou) {
        // Já lançamos neste vigia e a "decisão" voltou a ser subir: o processo que lançamos não vive mais.
        if (lancou && lancou.codigo !== undefined) {
          gravarTentativa(casa, { em: new Date(d.agora()).toISOString(), pid: lancou.pid, resultado: 'saiu-cedo' });
          registrar(casa, `a InToca Sala saiu antes de abrir a porta (código ${lancou.codigo}); veja sala.log`, d.agora());
          return 'saiu-cedo';
        }
      }
      if (d.agora() >= fim) {
        registrar(casa, `prazo de ${Math.round(prazo / 1000)} s esgotado sem a sala responder; não mexo no processo (${acao})`, d.agora());
        return 'prazo-esgotado';
      }
      await d.esperar(d.intervaloMs);
    }
  } catch (e) {
    registrar(casa, `erro no lançador: ${e?.message ?? e}`, d.agora());
    return 'erro';
  } finally {
    try {
      soltar?.();
    } catch {
      /* nada a fazer */
    }
  }
}

// ---------- a sala animada, quando a pessoa pediu ----------

/**
 * Sobe a Animada solta deste processo (ela não fica presa ao serviço nem ao chat). Devolve o pid, uma promessa com o código
 * de saída e o erro de partida, se houve. Mesmo comando que o botão Iniciar usa (manifesto ou `sala.json`), sem shell.
 */
export function lancarAnimada({ casa, achada, env = process.env, spawnar = spawn, sistema = process.platform, existe }) {
  mkdirSync(pastaIntoca(casa), { recursive: true });
  const log = openSync(arquivoLogAnimada(casa), 'w'); // só a última subida fica no log
  const [original, ...args] = achada.command;
  const comando = executavelSilencioso(original, { sistema, ...(existe ? { existe } : {}) }); // sem janela preta no Windows
  const resultado = { pid: null, erro: null };
  let filho;
  try {
    filho = spawnar(comando, args, {
      cwd: achada.cwd,
      detached: true,
      stdio: ['ignore', log, log],
      windowsHide: true,
      env: { ...env, ...achada.env, FORCE_COLOR: '0', NO_COLOR: '1', BROWSER: 'none' },
    });
  } finally {
    closeSync(log);
  }
  const saiu = new Promise((resolve) => {
    filho.once('exit', (codigo) => resolve(codigo ?? -1));
    filho.once('error', (e) => {
      resultado.erro = e?.code ?? e?.message ?? 'erro ao iniciar';
      resolve(-1);
    });
  });
  filho.unref();
  resultado.pid = filho.pid ?? null;
  return { pid: resultado.pid, saiu, erro: () => resultado.erro, executavel: basename(comando), silencioso: comando !== original };
}

/**
 * Sobe a sala animada UMA vez quando a pessoa marcou "Subir a sala animada junto com o sistema" (`animada.auto: true` em
 * `sala.json`) e ela não responde em `/api/health`. Quem chama é o vigia (`--vigia`) e o serviço de logon (`--servico`),
 * depois de garantir a Clássica; o modo hook direto nunca chama. Não derruba nem relança nada: processo da Animada em subida
 * (pid vivo, lançado há pouco) vale "subindo". Devolve uma palavra para o log e para o teste:
 *   'desligado' | 'sem-auto' | 'nao-instalada' | 'ja-no-ar' | 'subindo' | 'ocupado' | 'subiu' | 'falhou' | 'erro'
 * Nunca lança.
 */
export async function subirAnimada({ casa = casaDe(), env = process.env, prazoMs, deps = {} } = {}) {
  const d = {
    agora: () => Date.now(),
    esperar: dormir,
    sondar: sondarAnimada,
    vivo: pidVivo,
    resolver: () => resolverAnimada({ env, casa }),
    lancar: (achada) => lancarAnimada({ casa, achada, env }),
    inicioDoBoot: () => Date.now() - uptime() * 1000,
    intervaloMs: 2000,
    ...deps,
  };
  const prazo = prazoMs ?? (Number(env.INTOCA_ANIMADA_PRAZO_S) > 0 ? Number(env.INTOCA_ANIMADA_PRAZO_S) * 1000 : PRAZO_ANIMADA_MS);
  let soltar = null;
  try {
    if (desligado(casa, env)) return 'desligado';
    if (configDaAnimada(casa).auto !== true) return 'sem-auto';
    const achada = d.resolver();
    if (!achada) {
      registrar(casa, 'animada: marcada para subir, mas não está instalada (veja a tela das Tocas)', d.agora());
      return 'nao-instalada';
    }
    const porta = achada.porta ?? PORTA_PADRAO;
    if (await d.sondar(porta)) {
      registrar(casa, `animada: já no ar na porta ${porta}`, d.agora());
      return 'ja-no-ar';
    }
    // Um processo que este lançador subiu há pouco e ainda vive está em subida: não se sobe uma segunda.
    const anterior = lerEstado(casa).animada;
    const quando = Date.parse(anterior?.iniciou_em);
    if (inteiro(anterior?.pid) && !Number.isNaN(quando) && quando >= d.inicioDoBoot() - 60000 && d.agora() - quando < ANIMADA_SUBINDO_MS && d.vivo(anterior.pid)) {
      registrar(casa, `animada: já está subindo (pid ${anterior.pid}); não subo outra`, d.agora());
      return 'subindo';
    }
    soltar = pegarTrava(casa, { agora: d.agora(), vivo: d.vivo, arquivo: arquivoTravaAnimada(casa) });
    if (!soltar) return 'ocupado'; // outro lançador está cuidando dela agora
    if (!Array.isArray(achada.command) || achada.command.length === 0) {
      registrar(casa, 'animada: falhou: sem comando de início (o item dela no manifesto não tem command; peça à Diretoria)', d.agora());
      return 'falhou';
    }
    const filho = d.lancar(achada);
    let codigo;
    filho.saiu?.then((c) => {
      codigo = c;
    });
    if (filho.pid) {
      try {
        anotarSubidaDaAnimada(casa, { pid: filho.pid, agora: new Date(d.agora()) });
      } catch {
        /* melhor esforço: o registro da própria Animada vem quando ela abre a porta */
      }
    }
    const fim = d.agora() + prazo;
    for (;;) {
      await d.esperar(d.intervaloMs);
      if (await d.sondar(porta)) {
        const qual = filho.executavel ? (filho.silencioso ? ` (${filho.executavel})` : ` (${filho.executavel}${process.platform === 'win32' && /python\.exe$/i.test(filho.executavel) ? '; pode abrir janela' : ''})`) : '';
        registrar(casa, `animada: subiu na porta ${porta}${qual}`, d.agora());
        return 'subiu';
      }
      if (codigo !== undefined || (!filho.pid && filho.erro?.())) {
        registrar(casa, `animada: falhou: ${filho.erro?.() ? `não consegui iniciar (${filho.erro()})` : `saiu antes de abrir a porta (código ${codigo})`}; veja animada.log`, d.agora());
        return 'falhou';
      }
      if (d.agora() >= fim) {
        registrar(casa, `animada: falhou: não respondeu em ${Math.round(prazo / 1000)} s; o processo segue e não mexo nele`, d.agora());
        return 'falhou';
      }
    }
  } catch (e) {
    registrar(casa, `animada: falhou: ${e?.message ?? e}`, d.agora());
    return 'erro';
  } finally {
    try {
      soltar?.();
    } catch {
      /* nada a fazer */
    }
  }
}
