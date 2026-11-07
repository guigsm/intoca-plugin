// Serve a pasta estática de uma Toca (campo `site:` do manifesto) na origem própria dela,
// `http://<rótulo>.toca.localhost[:porta]/`. Só leitura.
//
// Regras (a pasta pode ser de terceiro, então tudo aqui é desconfiado):
//  - só GET e HEAD; sem listar pasta (devolve `index.html` ou 404); pasta pedida sem a barra final
//    responde 301 para a forma com barra (senão os links relativos da página quebram);
//  - o caminho pedido é decodificado uma vez; recusa `..`, `\`, `:`, byte nulo, segmento vazio e
//    arquivo ou pasta oculta (`.env`, `.git`, qualquer nome que comece com ponto);
//  - o caminho REAL (links simbólicos e junções resolvidos) tem de ficar dentro do caminho real da pasta;
//  - tipo de conteúdo pela extensão (desconhecida vira `application/octet-stream`) e `nosniff`;
//  - arquivo acima do limite devolve 413;
//  - sem `Content-Security-Policy: sandbox`. A separação entre a página servida e a API da sala vem da
//    ORIGEM: cada site vive em `<rótulo>.toca.localhost`, distinta de `localhost`, onde está a API. A API só
//    responde em `Host` de localhost e recusa `Origin` e `Sec-Fetch-Site` de fora (ver `app.mjs`); então script do
//    site não lê a resposta da API nem manda ação com `X-Painel`. Na origem do site não existe API nem painel.
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

export const LIMITE_PADRAO = 50 * 1024 * 1024;

export const CABECALHOS_SEGUROS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.csv': 'text/csv; charset=utf-8',
};

export const tipoDe = (arquivo) => TIPOS[extname(arquivo).toLowerCase()] ?? 'application/octet-stream';

const real = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return undefined;
  }
};
const fold = (p) => (process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p);

// `true` se `alvo` é a própria `raiz` ou está dentro dela (ambos já com caminho real).
export function dentroDe(raiz, alvo) {
  const r = fold(raiz).replace(/[\\/]+$/, '');
  const a = fold(alvo);
  return a === r || a.startsWith(r + sep);
}

export const SUFIXO_DO_SITE = '.toca.localhost';

/**
 * Rótulo DNS de uma Toca, derivado do nome no manifesto: minúsculas; toda sequência fora de `a-z`, `0-9`, `.` e `-`
 * vira um `-`; pontos e hífens das pontas saem. Vazio = a Toca não é servida.
 */
export function rotuloDe(nome) {
  return String(nome ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
}

/**
 * Quais Tocas com pasta estática são servidas e sob que rótulo. Rótulo vazio ou repetido entre duas Tocas não é servido.
 * Devolve `{ servidos: Map<rótulo, item>, ambiguos: Set<rótulo> }`.
 */
export function mapaDeSites(itens) {
  const grupos = new Map();
  for (const item of itens) {
    if (!item.siteDir) continue;
    const r = rotuloDe(item.name);
    if (!r) continue;
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(item);
  }
  const servidos = new Map();
  const ambiguos = new Set();
  for (const [r, lista] of grupos) {
    if (lista.length === 1) servidos.set(r, lista[0]);
    else ambiguos.add(r);
  }
  return { servidos, ambiguos };
}

/** Rótulo sob o qual `item` é servido, ou `undefined` (sem site, rótulo vazio ou repetido). */
export function rotuloServido(mapa, item) {
  const r = rotuloDe(item?.name);
  return r && mapa.servidos.get(r) === item ? r : undefined;
}

/** `{ rotulo }` se o cabeçalho `Host` é `<rótulo>.toca.localhost[:porta]`; senão `null`. A porta é ignorada. */
export function hostDoSite(host) {
  const m = /^([a-z0-9][a-z0-9.-]*)\.toca\.localhost(?::\d+)?$/.exec(String(host ?? '').toLowerCase());
  return m ? { rotulo: m[1] } : null;
}

/** Porta do cabeçalho `Host` (`''` se não houver ou se for a 80). */
export function portaDoHost(host) {
  const m = /:(\d+)$/.exec(String(host ?? ''));
  return m && m[1] !== '80' ? m[1] : '';
}

/** URL absoluta do site de um rótulo (`porta` vem de `portaDoHost`). */
export const urlDoSite = (rotulo, porta = '', caminho = '/') => `http://${rotulo}${SUFIXO_DO_SITE}${porta ? `:${porta}` : ''}${caminho}`;

/** Quebra o caminho pedido (a parte depois da origem do site, ainda codificada) em segmentos seguros, ou `null`. */
export function segmentosSeguros(bruto) {
  let texto;
  try {
    texto = decodeURIComponent(bruto);
  } catch {
    return null;
  }
  if (texto.includes('\0') || texto.includes('\\')) return null;
  const partes = texto.split('/');
  if (partes[0] === '') partes.shift(); // a barra inicial depois do id
  if (partes.length && partes[partes.length - 1] === '') partes.pop(); // barra final = pasta
  for (const p of partes) {
    if (p === '' || p === '.' || p === '..' || p.startsWith('.') || p.includes(':') || p.length > 255) return null;
  }
  return partes;
}

/**
 * Resolve o que responder. Devolve `{ status, headers, arquivo?, tamanho? }`; quem chama escreve a resposta.
 * `raiz` é a pasta declarada no manifesto; `pedido` é o caminho pedido na origem do site (codificado);
 * `consulta` é o `?query` (com o `?`), repetido no `Location` do 301.
 */
export function resolver({ raiz, pedido, consulta = '', metodo = 'GET', limite = LIMITE_PADRAO }) {
  const erro = (status, texto) => ({
    status,
    headers: { ...CABECALHOS_SEGUROS, 'Content-Type': 'text/plain; charset=utf-8', ...(status === 405 ? { Allow: 'GET, HEAD' } : {}) },
    corpo: texto,
  });
  if (metodo !== 'GET' && metodo !== 'HEAD') return erro(405, 'método não permitido');
  const raizReal = real(raiz);
  if (!raizReal) return erro(404, 'pasta do site não encontrada');
  const segs = segmentosSeguros(pedido);
  if (!segs) return erro(400, 'caminho não permitido');

  let alvo = real(join(raizReal, ...segs));
  if (!alvo || !dentroDe(raizReal, alvo)) return erro(404, 'não encontrado');
  let st;
  try {
    st = statSync(alvo);
    if (st.isDirectory()) {
      // Pasta sem a barra final: 301 para a forma com barra (como Apache e GitHub Pages), senão os links relativos
      // da página se resolvem um nível acima. Só depois de a pasta provar que está dentro da raiz e não é oculta.
      if (segs.length && !pedido.endsWith('/')) {
        const relPasta = alvo.slice(raizReal.replace(/[\\/]+$/, '').length).split(/[\\/]/).filter(Boolean);
        if (relPasta.some((p) => p.startsWith('.'))) return erro(404, 'não encontrado');
        return { status: 301, headers: { ...CABECALHOS_SEGUROS, Location: `${pedido}/${consulta}` }, corpo: '' };
      }
      alvo = real(join(alvo, 'index.html'));
      if (!alvo || !dentroDe(raizReal, alvo)) return erro(404, 'não encontrado');
      st = statSync(alvo);
    }
  } catch {
    return erro(404, 'não encontrado');
  }
  if (!st.isFile()) return erro(404, 'não encontrado');
  // O caminho real também não pode passar por nome oculto (um link para `.git` dentro da pasta, por exemplo).
  const relReal = alvo.slice(raizReal.replace(/[\\/]+$/, '').length).split(/[\\/]/).filter(Boolean);
  if (relReal.some((p) => p.startsWith('.'))) return erro(404, 'não encontrado');
  if (st.size > limite) return erro(413, 'arquivo grande demais para a sala');

  return {
    status: 200,
    headers: { ...CABECALHOS_SEGUROS, 'Content-Type': tipoDe(alvo), 'Content-Length': String(st.size) },
    arquivo: alvo,
    tamanho: st.size,
    metodo,
  };
}

export function responder(res, r) {
  res.writeHead(r.status, r.headers);
  if (r.arquivo && r.metodo !== 'HEAD') {
    const fluxo = createReadStream(r.arquivo);
    fluxo.on('error', () => res.destroy());
    fluxo.pipe(res);
    return;
  }
  res.end(r.arquivo ? undefined : r.corpo);
}
