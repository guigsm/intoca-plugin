// Descoberta dos projetos e ferramentas a partir do manifesto e das pastas. Funções puras ou de leitura de
// arquivo, sem estado: o servidor chama e os testes chamam com pastas temporárias.
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { asList, parseManifestProjects, parseManifestSuite } from './yaml.mjs';

export function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

export function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Só a linha `PORT` do `.env`/`.env.example`: nenhum outro valor do arquivo é lido nem guardado.
export function portFromEnv(dir) {
  for (const name of ['.env', '.env.example']) {
    const m = readText(join(dir, name))?.match(/^\s*PORT\s*=\s*["']?(\d{2,5})["']?\s*$/m);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function launchConfig(dir) {
  const text = readText(join(dir, '.claude', 'launch.json'));
  if (!text) return undefined;
  try {
    return JSON.parse(text).configurations?.[0];
  } catch {
    return undefined;
  }
}

export function gitBranch(dir) {
  const head = readText(join(dir, '.git', 'HEAD'))?.trim();
  if (!head) return undefined;
  return head.startsWith('ref: refs/heads/') ? head.slice(16) : head.slice(0, 7);
}

// `cwd` opcional do launch.json: absoluto vale como está, relativo parte da pasta do projeto. Sem o campo,
// o processo roda na pasta do projeto. Se não for uma pasta existente, o item guarda o erro e `start` recusa.
export function launchCwd(dir, launch) {
  if (launch?.cwd === undefined || launch.cwd === null || launch.cwd === '') return {};
  if (typeof launch.cwd !== 'string') return { cwdErro: 'cwd do launch.json deve ser texto' };
  const cwd = isAbsolute(launch.cwd) ? launch.cwd : resolve(dir, launch.cwd);
  return isDirectory(cwd) ? { cwd } : { cwd, cwdErro: `cwd do launch.json não é uma pasta existente: ${cwd}` };
}

// `porta_dev` do manifesto: só vale quando o projeto não tem porta própria (.env ou launch.json). Serve para
// o cartão mostrar "rodando" e o link Abrir; sem comando, não há Iniciar.
export function portaDev(manifestItem) {
  const port = Number(manifestItem?.porta_dev);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}

// `site:` do manifesto: pasta estática, absoluta ou relativa a `pasta_atual`. Só vale se for uma pasta existente.
export function pastaDoSite(dir, manifestItem) {
  const s = manifestItem?.site;
  if (typeof s !== 'string' || s.trim() === '') return undefined;
  const pasta = isAbsolute(s) ? s : resolve(dir, s);
  return isDirectory(pasta) ? pasta : undefined;
}

// `url_producao:` do manifesto: só https, sem espaço nem aspas (vira atributo `href`).
export function urlProducao(manifestItem) {
  const u = manifestItem?.url_producao;
  return typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u.trim()) ? u.trim() : undefined;
}

// Link `vscode://file/<pasta>`: barras normais, cada trecho codificado (a letra da unidade fica como está).
export function linkVsCode(dir) {
  const partes = String(dir).replace(/\\/g, '/').split('/');
  const corpo = partes.map((p, i) => (i === 0 && /^[A-Za-z]:$/.test(p) ? p : encodeURIComponent(p))).join('/');
  return 'vscode://file' + (corpo.startsWith('/') ? '' : '/') + corpo;
}

export function siteFrom(name, dir, manifestItem) {
  const launch = launchConfig(dir);
  const ownPort = portFromEnv(dir) ?? launch?.port;
  return {
    siteDir: pastaDoSite(dir, manifestItem),
    urlProducao: urlProducao(manifestItem),
    ...launchCwd(dir, launch),
    kind: 'site',
    name,
    dir,
    tipo: manifestItem?.tipo ?? undefined,
    porte: manifestItem?.porte ?? undefined,
    suite: manifestItem?.suite ?? undefined,
    fabrica: manifestItem?.fabrica ?? undefined,
    port: ownPort ?? portaDev(manifestItem),
    portaManifesto: ownPort == null && portaDev(manifestItem) !== undefined ? true : undefined,
    branch: gitBranch(dir),
    command: launch?.runtimeExecutable ? [launch.runtimeExecutable, ...(launch.runtimeArgs ?? [])] : undefined,
  };
}

// A lista vem só do manifesto: itens `status: ativo` com `pasta_atual` existente. A pasta da raiz não decide
// o que é projeto. O nome é a chave das rotas, então um nome do manifesto nunca é repetido.
export function discoverSites(projects) {
  const seen = new Set();
  return projects
    .filter((p) => p.status === 'ativo' && p.pasta_atual && isDirectory(p.pasta_atual))
    .filter((p) => {
      const key = p.nome.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((p) => siteFrom(p.nome, p.pasta_atual, p));
}

export const fold = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Blocos por frente da Suíte, lidos do manifesto (null sem `suite:`). Os membros de cada frente são os
// da lista `membros` mais os projetos com `suite: <frente>`; os planejados (sem pasta ou sem status
// ativo) vêm com o status, porque não estão na lista de sites.
export function suiteInfo({ projects, suite }) {
  if (!suite) return null;
  return {
    nome: suite.nome,
    regra: suite.regra,
    frentes: suite.frentes.map((f) => {
      const names = [...new Set([...f.membros, ...projects.filter((p) => p.suite === f.id).map((p) => p.nome)])];
      return {
        id: f.id,
        nome: f.nome,
        descricao: f.descricao,
        membros: names.map((nome) => {
          const p = projects.find((x) => x.nome === nome);
          return { nome, status: p?.status ?? undefined, tipo: p?.tipo ?? undefined, porte: p?.porte ?? undefined };
        }),
      };
    }),
  };
}

// { projects, tools, suite } de um texto de `sede.yaml`; texto ilegível devolve tudo vazio.
export function parseManifesto(text) {
  if (text === undefined) return { projects: [], tools: [], suite: undefined };
  try {
    return {
      projects: parseManifestProjects(text),
      tools: parseManifestProjects(text, 'ferramentas'),
      suite: parseManifestSuite(text),
    };
  } catch {
    return { projects: [], tools: [], suite: undefined };
  }
}

export { asList };
