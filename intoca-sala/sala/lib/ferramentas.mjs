// Ferramentas fora das pastas de projeto (um gerador de vídeo, Studio, a Animada etc.), lidas da seção
// `ferramentas:` do manifesto. Campos aceitos (os de início são a parte que o manifesto ainda pode não ter):
//   nome, pasta (ou dir), porta (ou port), command: [lista], env: {mapa}, url, descricao, suite, membro_de.
// `inicia:` do manifesto é texto livre para gente ler; não é executado: o `command` é que manda.
// Sem `command`, a ferramenta aparece sem Iniciar e entra na lista de faltas de /api/saude.
import { fold, gitBranch, urlProducao } from './descoberta.mjs';

const textos = (v) => (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string') ? v : undefined);

function mapaDeTextos(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === 'string') out[k] = val;
  return Object.keys(out).length ? out : undefined;
}

const portaValida = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined;
};

export function discoverTools({ tools, suite }) {
  const itens = [];
  const faltas = [];
  for (const t of tools) {
    const dir = t.pasta ?? t.dir;
    if (!t.nome || typeof dir !== 'string' || dir === '') continue;
    const names = [t.nome].map(fold);
    const command = textos(t.command);
    const port = portaValida(t.porta ?? t.port);
    const campos = [];
    if (!command) campos.push('command');
    if (!port) campos.push('porta');
    if (campos.length) faltas.push({ ferramenta: t.nome, campos });
    itens.push({
      kind: 'tool',
      name: t.nome,
      description: typeof t.descricao === 'string' ? t.descricao : undefined,
      dir,
      port,
      branch: gitBranch(dir),
      command,
      env: mapaDeTextos(t.env),
      url: typeof t.url === 'string' && /^http:\/\/localhost:\d+\//.test(t.url) ? t.url : undefined,
      urlProducao: urlProducao(t),
      suite: t.suite ?? suite?.frentes.find((f) => f.ferramentas.some((n) => names.includes(fold(n))))?.id ?? undefined,
      membroDe: t.membro_de ?? undefined,
    });
  }
  return { itens, faltas };
}
