// Serve a pasta estática de uma Toca (campo `site:` do manifesto) em `/toca/<id>/`. Só leitura.
//
// Regras (a pasta pode ser de terceiro, então tudo aqui é desconfiado):
//  - só GET e HEAD; sem listar pasta (devolve `index.html` ou 404);
//  - o caminho pedido é decodificado uma vez; recusa `..`, `\`, `:`, byte nulo, segmento vazio e
//    arquivo ou pasta oculta (`.env`, `.git`, qualquer nome que comece com ponto);
//  - o caminho REAL (links simbólicos e junções resolvidos) tem de ficar dentro do caminho real da pasta;
//  - tipo de conteúdo pela extensão (desconhecida vira `application/octet-stream`) e `nosniff`;
//  - arquivo acima do limite devolve 413;
//  - toda resposta leva `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups`: a página
//    roda numa origem opaca, sem acesso à origem da sala. Script dela não lê a API nem manda `X-Painel`.
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

export const LIMITE_PADRAO = 50 * 1024 * 1024;

export const CABECALHOS_SEGUROS = {
  'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups',
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

/** Quebra o caminho pedido (parte depois de `/toca/<id>/`, ainda codificada) em segmentos seguros, ou `null`. */
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
 * `raiz` é a pasta declarada no manifesto; `pedido` é o resto do caminho (codificado).
 */
export function resolver({ raiz, pedido, metodo = 'GET', limite = LIMITE_PADRAO }) {
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
