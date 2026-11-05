// A InToca Sala (a "Clássica"): rotas e regras. `criarApp` recebe tudo que toca o mundo (ambiente, pasta do
// usuário, processos, sondagem de portas), então os testes montam uma sala inteira com pastas temporárias.
//
// Segurança: só atende `Host` de localhost (barra DNS rebinding); ações pedem o cabeçalho `X-Painel: 1` (outro
// site aberto no navegador não o envia sem preflight CORS, que não é respondido); e iniciar/parar só valem com
// `controle: true` em `~/.intoca/sala.json`, que nasce desligado. Parar um processo que a sala não iniciou
// ("externo") exige `confirm: true` no corpo, validado aqui, não no navegador.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSites, fold, gitBranch, linkVsCode, parseManifesto, readText, suiteInfo } from './descoberta.mjs';
import { resolver, responder } from './estatico.mjs';
import { acharSede, casaDe, configDaAnimada, controleLigado, gravarConfigDaAnimada, gravarOrdem, lerEstado, ordemSalva } from './estado.mjs';
import { discoverTools } from './ferramentas.mjs';
import { agrupar, idsMoveis, ordenar } from './agrupar.mjs';
import { PORTA_PADRAO, conferirProgramas, ehAnimada, itemDaAnimada, resolverAnimada, sondarAnimada } from './animada.mjs';
import { Recusa, instalarAnimada, planejarInstalacao } from './instalar-animada.mjs';
import { pendenciasDaSede } from './pendencias.mjs';
import { criarProcessos, isListening } from './processos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
// A versão vem do `.claude-plugin/plugin.json` do pacote, lido uma vez ao subir; o literal é só a reserva para o arquivo
// que não puder ser lido (pasta copiada sem o manifesto, por exemplo). Mantê-lo igual ao `plugin.json` evita surpresa.
const VERSAO_DE_RESERVA = '0.4.4';
export function lerVersao(arquivo = join(AQUI, '..', '..', '.claude-plugin', 'plugin.json')) {
  try {
    const v = JSON.parse(readFileSync(arquivo, 'utf8').replace(/^﻿/, '')).version;
    return typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v) ? v : VERSAO_DE_RESERVA;
  } catch {
    return VERSAO_DE_RESERVA;
  }
}
export const VERSAO = lerVersao();
export { sondarAnimada };

const TEXTO_CONTROLE_DESLIGADO =
  'O controle está desligado nesta máquina: a sala só mostra o estado. Ligar é decisão do proprietário (campo "controle" em ~/.intoca/sala.json).';

// Defesa em profundidade: ação vinda de outra origem (inclusive a origem opaca de uma página servida em /toca/)
// é recusada mesmo com o cabeçalho certo. Sem `Origin` (curl, testes) segue para as outras barreiras.
export function origemPropria(req) {
  const o = req.headers.origin;
  if (o !== undefined && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o)) return false;
  const sf = req.headers['sec-fetch-site'];
  return sf === undefined || sf === 'same-origin' || sf === 'none';
}

export const hostPermitido = (req) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host ?? '');

function enviar(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function lerCorpo(req, limite = 4096) {
  return new Promise((resolveCorpo) => {
    let texto = '';
    let estourou = false;
    req.on('data', (c) => {
      if (estourou) return;
      texto += c;
      if (texto.length > limite) estourou = true;
    });
    req.on('end', () => {
      if (estourou || texto.trim() === '') return resolveCorpo({});
      try {
        const dado = JSON.parse(texto);
        resolveCorpo(dado && typeof dado === 'object' && !Array.isArray(dado) ? dado : {});
      } catch {
        resolveCorpo({});
      }
    });
    req.on('error', () => resolveCorpo({}));
  });
}

// Última porta que o dev server diz ter aberto (linha `Local: http://localhost:<porta>` do Vite). Só leitura do log.
export function logPortOf(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const m = log[i].match(/Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})\b/);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function criarApp({
  env = process.env,
  casa = casaDe(env),
  processos = criarProcessos(),
  escutando = isListening,
  sondaAnimada = sondarAnimada,
  paginaInicial = join(AQUI, '..', 'index.html'),
  pastaDoProjeto = resolve(AQUI, '..', '..', '..'),
  agora = Date.now,
  // Tudo que a instalação da Animada toca no mundo (testes trocam): `programas`, `rodar`, `portaLivre`, `url`, `tickMs`...
  animadaDeps = {},
} = {}) {
  let cacheAnimada = { em: 0, porta: 0, noAr: false };
  let cacheProgramas = { em: 0, promessa: null };
  // Estado da instalação em curso ou da última (a página relê por `GET /api/animada/instalacao` depois de recarregar).
  let instalacao = { fase: 'ocioso', linhas: [] };

  // git, uv e Python mudam raramente: confere sem rede e guarda por 1 minuto.
  function programas() {
    if (!cacheProgramas.promessa || agora() - cacheProgramas.em > 60000) {
      cacheProgramas = { em: agora(), promessa: (animadaDeps.programas ?? (() => conferirProgramas({ rodar: animadaDeps.rodar })))() };
    }
    return cacheProgramas.promessa;
  }

  // A sede é relida a cada requisição: mudar o manifesto ou o ponteiro vale sem reiniciar.
  function sede() {
    const achada = acharSede({ env, casa });
    if (!achada) return { achada: null, projects: [], tools: [], suite: undefined, itens: [], faltas: [], eu: undefined, suiteInfo: null, animadaAchada: resolverAnimada({ env, casa, itens: [] }), frenteFixa: undefined };
    const m = parseManifesto(readText(join(achada.raiz, 'sede.yaml')));
    const sites = discoverSites(m.projects);
    const ferr = discoverTools(m);
    const eu = nomeDeMim(m.projects, pastaDoProjeto);
    const info = suiteInfo(m);
    const frenteFixa = eu ? info?.frentes.find((f) => f.membros.some((x) => x.nome === eu)) : undefined;
    // A Animada instalada só por `sala.json` (botão Instalar) ganha cartão, Iniciar e Parar como se fosse do manifesto.
    const animadaAchada = resolverAnimada({ env, casa, itens: ferr.itens });
    const extras = animadaAchada?.origem === 'sala.json'
      ? [itemDaAnimada(animadaAchada, { eu, frente: frenteFixa?.id, branch: gitBranch(animadaAchada.pasta) })]
      : [];
    return {
      achada,
      ...m,
      itens: [...sites.filter((s) => s.name !== eu), ...ferr.itens, ...extras],
      faltas: ferr.faltas,
      eu,
      suiteInfo: info,
      animadaAchada,
      frenteFixa,
    };
  }

  async function status(itens) {
    return Promise.all(
      itens.map(async (site) => {
        const rodando = site.port ? await escutando(site.port) : false;
        const e = processos.entrada(site.name);
        const vivo = processos.vivo(site.name);
        return {
          kind: site.kind,
          name: site.name,
          ehAnimada: site.kind === 'tool' && ehAnimada(site.name) ? true : undefined,
          tipo: site.tipo,
          porte: site.porte,
          suite: site.suite,
          membroDe: site.membroDe,
          fabrica: site.fabrica,
          description: site.description,
          url: site.url,
          estatico: site.siteDir ? `/toca/${encodeURIComponent(site.name)}/` : undefined,
          producao: site.urlProducao,
          vscode: site.dir ? linkVsCode(site.dir) : undefined,
          port: site.port,
          branch: site.branch,
          command: site.command?.join(' '),
          canStart: Boolean(site.command && site.port),
          readOnly: site.portaManifesto || undefined,
          state: rodando ? 'running' : vivo ? 'starting' : 'stopped',
          managed: vivo,
          external: Boolean(rodando && !vivo && !site.portaManifesto),
          startedAt: vivo ? e.startedAt : undefined,
          logPort: vivo ? logPortOf(e.log) : undefined,
          exitCode: e && !vivo ? e.child.exitCode ?? undefined : undefined,
        };
      }),
    );
  }

  // Registro que a própria Animada grava ao subir (`animada.porta`) e se ela responde.
  async function registroDaAnimada() {
    const porta = Number(lerEstado(casa).animada?.porta);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return { registrada: false, porta: null, no_ar: false };
    if (cacheAnimada.porta !== porta || agora() - cacheAnimada.em > 2000) {
      cacheAnimada = { em: agora(), porta, noAr: await sondaAnimada(porta) };
    }
    return { registrada: true, porta, no_ar: cacheAnimada.noAr };
  }

  // O registro mais o que a tela precisa para a linha da Animada: instalada, subida automática, o que falta para instalar.
  async function animada(s) {
    const instalada = Boolean(s.animadaAchada);
    const controle = controleLigado(casa);
    const faltam = instalada ? [] : (await programas()).faltam;
    return {
      ...(await registroDaAnimada()),
      instalada,
      auto: instalada && configDaAnimada(casa).auto === true,
      pasta: s.animadaAchada?.pasta ?? null,
      pode_instalar: !instalada && controle && faltam.length === 0,
      faltam,
      pasta_sugerida: s.achada ? join(s.achada.raiz, 'sala', 'app') : null,
      porta_padrao: PORTA_PADRAO,
    };
  }

  async function saude() {
    const s = sede();
    const estado = lerEstado(casa);
    return {
      versao: VERSAO,
      classica: estado.classica ?? null,
      controle: estado.controle === true,
      animada: await animada(s),
      sede: {
        achada: Boolean(s.achada),
        origem: s.achada?.origem ?? null,
        projetos: s.itens.filter((i) => i.kind === 'site').length,
        ferramentas: s.itens.filter((i) => i.kind === 'tool').length,
        frentes: s.suiteInfo?.frentes.length ?? 0,
      },
      faltaNoManifesto: s.faltas,
    };
  }

  async function handle(req, res) {
    if (!hostPermitido(req)) return enviar(res, 403, { error: 'host não permitido' });
    const url = new URL(req.url, 'http://localhost');

    // Pasta estática de uma Toca (campo site: do manifesto). Só leitura; a segurança está em estatico.mjs.
    const est = url.pathname.match(/^\/toca\/([^/]+)(\/.*)?$/);
    if (est) {
      let nome;
      try {
        nome = decodeURIComponent(est[1]);
      } catch {
        return enviar(res, 400, { error: 'caminho não permitido' });
      }
      const item = sede().itens.find((i) => i.name === nome && i.siteDir);
      if (!item) return enviar(res, 404, { error: 'Toca sem pasta estática (campo site: do manifesto)' });
      if (est[2] === undefined) {
        res.writeHead(301, { Location: `/toca/${est[1]}/`, 'Cache-Control': 'no-store' });
        return res.end();
      }
      return responder(res, resolver({ raiz: item.siteDir, pedido: est[2], metodo: req.method }));
    }

    if (req.method === 'GET') {
      if (url.pathname === '/') return enviar(res, 200, readFileSync(paginaInicial, 'utf8'), 'text/html; charset=utf-8');
      if (url.pathname === '/api/saude') return enviar(res, 200, await saude());
      if (url.pathname === '/api/pendencias') {
        const s = sede();
        if (!s.achada) return enviar(res, 200, { sede: false, fontes: [], ausentes: [], total: 0 });
        return enviar(res, 200, { sede: true, ...pendenciasDaSede({ raiz: s.achada.raiz, projects: s.projects }) });
      }
      if (url.pathname === '/api/sites') return enviar(res, 200, await status(sede().itens));
      if (url.pathname === '/api/suite') return enviar(res, 200, sede().suiteInfo);
      if (url.pathname === '/api/tocas') {
        const s = sede();
        const lista = await status(s.itens);
        // O grupo fixo vem primeiro; os demais seguem a ordem que a pessoa gravou (grupo novo no fim, id que sumiu ignorado).
        const grupos = ordenar(agrupar(lista, s.suiteInfo, { eu: s.eu }), ordemSalva(casa));
        return enviar(res, 200, {
          sede: Boolean(s.achada),
          suite: s.suiteInfo ? { nome: s.suiteInfo.nome, regra: s.suiteInfo.regra } : null,
          grupos,
          ordem: idsMoveis(grupos),
          lista,
        });
      }
      if (url.pathname === '/api/animada/instalacao') return enviar(res, 200, instalacao);
    }

    if (req.method === 'POST' && ['/api/preferencias', '/api/animada/auto', '/api/animada/instalar'].includes(url.pathname)) {
      if (req.headers['x-painel'] !== '1') return enviar(res, 403, { error: 'ação não permitida' });
      if (!origemPropria(req)) return enviar(res, 403, { error: 'origem não permitida' });

      // Ordenar os grupos é preferência da pessoa, não ação sobre processo: não exige `controle`.
      if (url.pathname === '/api/preferencias') {
        const corpo = await lerCorpo(req, 16384);
        const ordem = corpo.ordem;
        if (!Array.isArray(ordem) || ordem.length > 200 || !ordem.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 80)) {
          return enviar(res, 400, { error: 'ordem precisa ser uma lista de ids de grupo (texto)' });
        }
        const s = sede();
        const todos = agrupar(s.itens, s.suiteInfo, { eu: s.eu });
        const fixos = new Set(todos.filter((g) => g.fixo).map((g) => g.id));
        const moveis = new Set(idsMoveis(todos));
        const fixo = ordem.find((id) => fixos.has(id));
        if (fixo !== undefined) return enviar(res, 400, { error: `o grupo "${fixo}" é fixo no topo e não entra na ordem` });
        const desconhecido = ordem.find((id) => !moveis.has(id));
        if (desconhecido !== undefined) return enviar(res, 400, { error: `grupo desconhecido: "${desconhecido}"` });
        const limpa = [...new Set(ordem)];
        gravarOrdem(casa, limpa);
        return enviar(res, 200, { ok: true, ordem: limpa });
      }

      // Daqui em diante é ação sobre processo ou instalação: só com o controle ligado.
      if (!controleLigado(casa)) return enviar(res, 403, { error: TEXTO_CONTROLE_DESLIGADO, controle: false });
      const s = sede();

      if (url.pathname === '/api/animada/auto') {
        const corpo = await lerCorpo(req);
        if (typeof corpo.auto !== 'boolean') return enviar(res, 400, { error: 'auto precisa ser verdadeiro ou falso' });
        if (!s.animadaAchada) return enviar(res, 409, { error: 'A sala animada não está instalada.' });
        gravarConfigDaAnimada(casa, { auto: corpo.auto });
        return enviar(res, 200, { ok: true, auto: corpo.auto });
      }

      // /api/animada/instalar: sem `confirmado: true` só devolve o plano; com ele, instala e responde em linhas JSON.
      const corpo = await lerCorpo(req);
      if (corpo.pasta !== undefined && (typeof corpo.pasta !== 'string' || corpo.pasta.length > 500)) return enviar(res, 400, { error: 'pasta precisa ser um texto' });
      if (corpo.porta !== undefined && typeof corpo.porta !== 'number' && typeof corpo.porta !== 'string') return enviar(res, 400, { error: 'porta precisa ser um número' });
      if (s.animadaAchada) return enviar(res, 409, { error: 'A sala animada já está instalada.', codigo: 'ja-instalada' });
      if (instalacao.fase === 'rodando') return enviar(res, 409, { error: 'Já há uma instalação em andamento.', codigo: 'em-andamento' });
      const pedido = {
        casa,
        sedeRaiz: s.achada?.raiz ?? null,
        pasta: corpo.pasta,
        porta: corpo.porta,
        membroDe: s.eu,
        suite: s.frenteFixa?.id,
        deps: { ...animadaDeps, programas },
      };
      const comoErro = (e) => (e instanceof Recusa ? { error: e.message, codigo: e.codigo, ...e.extra } : { error: 'Erro inesperado na instalação.', codigo: 'erro-interno' });

      if (corpo.confirmado !== true) {
        try {
          return enviar(res, 200, { plano: await planejarInstalacao(pedido) });
        } catch (e) {
          return enviar(res, ['porta-ocupada', 'destino-ocupado'].includes(e?.codigo) ? 409 : 400, comoErro(e));
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      const linha = (obj) => {
        if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(obj)}\n`);
      };
      instalacao = { fase: 'rodando', linhas: [] };
      try {
        const r = await instalarAnimada({
          ...pedido,
          aoProgresso: (e) => {
            if (e.tipo === 'passo' && e.texto) instalacao.linhas.push(e.texto);
            linha(e);
          },
        });
        instalacao = { fase: 'pronta', linhas: instalacao.linhas, resultado: r };
        linha({ tipo: 'fim', ...r });
      } catch (e) {
        instalacao = { fase: 'falhou', linhas: instalacao.linhas, erro: comoErro(e) };
        linha({ tipo: 'fim', ok: false, ...comoErro(e) });
      }
      return res.end();
    }

    const m = url.pathname.match(/^\/api\/sites\/([^/]+)\/(start|stop|log)$/);
    if (!m) return enviar(res, 404, { error: 'não encontrado' });
    const nome = decodeURIComponent(m[1]);
    const item = sede().itens.find((i) => i.name === nome);
    if (!item) return enviar(res, 404, { error: 'projeto desconhecido' });

    if (m[2] === 'log' && req.method === 'GET') return enviar(res, 200, { lines: processos.log(item.name) });
    if (req.method !== 'POST' || req.headers['x-painel'] !== '1') return enviar(res, 403, { error: 'ação não permitida' });
    if (!origemPropria(req)) return enviar(res, 403, { error: 'origem não permitida' });
    if (!controleLigado(casa)) return enviar(res, 403, { error: TEXTO_CONTROLE_DESLIGADO, controle: false });

    if (m[2] === 'start') {
      if (!item.command || !item.port) {
        const falta = item.kind === 'tool'
          ? 'ferramenta sem command/porta no manifesto (seção ferramentas do sede.yaml): peça à Diretoria'
          : 'projeto sem launch.json/porta';
        return enviar(res, 400, { error: falta });
      }
      if (item.cwdErro) return enviar(res, 400, { error: item.cwdErro });
      if (await escutando(item.port)) return enviar(res, 409, { error: `porta ${item.port} já em uso` });
      processos.iniciar(item, {
        ...env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        BROWSER: 'none',
        // Entrega ao dev server a porta que a sala vigia (Vite e Astro leem PORT). Ferramentas ficam de fora.
        ...(item.kind === 'site' && item.port ? { PORT: String(item.port) } : {}),
        ...item.env,
      });
      return enviar(res, 200, { ok: true });
    }

    // stop
    if (item.portaManifesto) {
      return enviar(res, 400, { error: 'porta só do manifesto (sem launch.json nem .env): a sala só mostra o estado' });
    }
    if (await processos.pararFilho(item.name)) return enviar(res, 200, { ok: true });
    if (item.port && (await escutando(item.port))) {
      const corpo = await lerCorpo(req);
      if (corpo.confirm !== true) {
        return enviar(res, 409, {
          error: 'Esta porta é de um processo que a sala não iniciou (pode ser de outro chat). Para encerrar mesmo assim, confirme.',
          precisaConfirmar: true,
        });
      }
      await processos.pararExterno(item.port);
      return enviar(res, 200, { ok: true, externo: true });
    }
    return enviar(res, 200, { ok: true, nada: true });
  }

  return { handle, saude, status, sede };
}

// O projeto que hospeda esta sala não ganha cartão (a página é ele). Acha pela pasta do pacote
// (`<projeto>/intoca-sala/sala/`), senão pelo nome `intoca`.
export function nomeDeMim(projects, pastaDoProjeto) {
  const norm = (p) => fold(resolve(String(p))).replace(/[\\/]+$/, '');
  const pai = norm(pastaDoProjeto);
  const porPasta = projects.find((p) => typeof p.pasta_atual === 'string' && norm(p.pasta_atual) === pai);
  return (porPasta ?? projects.find((p) => p.nome === 'intoca'))?.nome;
}
