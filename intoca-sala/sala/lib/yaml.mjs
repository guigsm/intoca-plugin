// Leitor mínimo de YAML do `sede.yaml`, sem dependências.
// LIMITAÇÃO: entende apenas o formato usado ali: seção no início da linha, um item por
// `- nome: valor`, campos `chave: valor` na coluna seguinte ao item, valores simples (texto, entre
// aspas simples ou duplas, número, null) e, nas listas de itens, valores em fluxo numa linha
// (`{chave: valor, lista: [a, b]}` e `[a, b]`), como no bloco `suite`. Mapas aninhados em bloco, blocos
// `>-`/`|`, âncoras e valores em várias linhas são ignorados em silêncio. Para qualquer outra
// necessidade de YAML, use um parser de verdade. (INT-01: os campos dos itens também aceitam fluxo numa linha,
// para `command: [node, x.mjs]` e `env: {A: b}` das ferramentas.)
export function parseScalar(raw) {
  const text = raw.trim();
  if (text.startsWith("'")) {
    const m = text.match(/^'((?:[^']|'')*)'/);
    return m ? m[1].replace(/''/g, "'") : text;
  }
  if (text.startsWith('"')) {
    const m = text.match(/^"((?:[^"\\]|\\.)*)"/);
    return m ? m[1].replace(/\\(["\\])/g, '$1') : text;
  }
  const value = text.replace(/\s+#.*$/, '').trim();
  if (value === '' || value === 'null' || value === '~') return null;
  return value;
}

// Posi\ç\ão do fechamento do `[` ou `{` que abre `text`, respeitando aspas; -1 se n\ão fecha.
export function flowEnd(text) {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i++;
      else if (ch === quote) quote = '';
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Separa por v\írgula s\ó fora de aspas e de colchetes/chaves aninhados.
export function splitFlow(text) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') cur += ch + (text[++i] ?? '');
      else {
        cur += ch;
        if (ch === quote) quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// Valor em fluxo numa linha: `{a: 1, b: [x, 'y z']}` vira objeto, `[x, y]` vira lista; o resto \é escalar.
export function parseFlow(raw) {
  const text = raw.trim();
  if (text.startsWith('[') || text.startsWith('{')) {
    const end = flowEnd(text);
    if (end > 0) {
      const parts = splitFlow(text.slice(1, end));
      if (text[0] === '[') return parts.map(parseFlow);
      const obj = {};
      for (const part of parts) {
        const m = part.match(/^\s*([A-Za-z_][\w-]*):\s*([\s\S]*)$/);
        if (m) obj[m[1]] = parseFlow(m[2]);
      }
      return obj;
    }
  }
  return parseScalar(text);
}

export const asList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : []);

// Bloco de topo `suite:` (nome, regra, frentes). Cada frente \é um mapa em fluxo numa linha
// (`producao: {nome: ..., descricao: ..., membros: [...], ferramentas: [...]}`) ou um bloco com os
// mesmos campos recuados. Sem `frentes`, devolve undefined e o painel segue sem blocos.
export function parseManifestSuite(text) {
  let inSection = false;
  let inFrentes = false;
  let baseIndent = -1;
  let frenteIndent = -1;
  let current;
  const suite = {};
  const frentes = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (/^\S/.test(line)) {
      inSection = /^suite:\s*(#.*)?$/.test(line);
      inFrentes = false;
      baseIndent = -1;
      current = undefined;
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^(\s+)([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    if (baseIndent < 0) baseIndent = indent;
    if (indent === baseIndent) {
      inFrentes = m[2] === 'frentes' && /^(#.*)?$/.test(m[3]);
      frenteIndent = -1;
      current = undefined;
      if (!inFrentes) suite[m[2]] = parseFlow(m[3]);
    } else if (inFrentes) {
      if (frenteIndent < 0) frenteIndent = indent;
      if (indent === frenteIndent) {
        const value = /^(#.*)?$/.test(m[3]) ? {} : parseFlow(m[3]);
        current = { id: m[2], ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) };
        frentes.push(current);
      } else if (current && indent > frenteIndent) {
        current[m[2]] = parseFlow(m[3]);
      }
    }
  }
  if (frentes.length === 0) return undefined;
  return {
    nome: typeof suite.nome === 'string' ? suite.nome : undefined,
    regra: typeof suite.regra === 'string' ? suite.regra : undefined,
    frentes: frentes.map((f) => ({
      id: f.id,
      nome: typeof f.nome === 'string' ? f.nome : f.id,
      descricao: typeof f.descricao === 'string' ? f.descricao : undefined,
      membros: asList(f.membros),
      ferramentas: asList(f.ferramentas),
    })),
  };
}

export function parseManifestProjects(text, section = 'projetos') {
  const projects = [];
  let inSection = false;
  let current;
  let fieldIndent = -1;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (/^\S/.test(line)) {
      inSection = line.startsWith(`${section}:`) && /^[\w-]+:\s*(#.*)?$/.test(line);
      current = undefined;
      continue;
    }
    if (!inSection) continue;
    const start = line.match(/^(\s*)-\s+nome:\s*(.*)$/);
    if (start) {
      current = { nome: parseScalar(start[2]) };
      projects.push(current);
      fieldIndent = start[1].length + 2;
      continue;
    }
    const field = line.match(/^(\s+)([A-Za-z_][\w-]*):\s*(.*)$/);
    if (current && field && field[1].length === fieldIndent) {
      current[field[2]] = parseFlow(field[3]); // lista ou mapa numa linha (command, env); o resto é escalar
    }
  }
  return projects.filter((p) => p.nome);
}
