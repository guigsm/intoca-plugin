// Diferencial entre duas versões do `argumentosDoMcp` (PLG-40, item 7). O erro que deixou passar a regressão do `pacote@versão` na 1.2.6 foi um diferencial cujo conjunto de fichas não tinha as formas
// COMUNS de servidor MCP. Este conjunto as tem: `npx -y pacote`, `-y pacote@latest`, `-y @escopo/pacote@1.2.3`, `uvx servidor@2.0`, `uvx --from git+https://… cmd`, `docker run -i --rm img:tag`,
// `docker run … img@sha256:…`, `node /mcp/server.mjs`, `python -m modulo`, `--stdio`, `--port 3000`, `--transport sse`, URL `https://h.io/mcp`, `-e NOME=valor`, e os destinos `usuario@host`.
// Regra, posição por posição (a entrada e a saída têm o mesmo tamanho):
//  - o que a versão ANTIGA mostrava e que NÃO é segredo não pode sumir nem mudar, salvo as EXCECOES listadas aqui, uma a uma;
//  - o que a antiga escondia não pode passar a aparecer, salvo os `pacote@versão` sem escopo (REVELA: era a regressão que a 1.2.6 trouxe, e que esta versão corrige);
//  - o que é segredo (as fichas de SEGREDOS) pode mudar para melhor: passar a sumir.
// PLG-42: o mesmo diferencial compara a 1.2.7 com a 1.2.8 (`--contra=1.2.7`): nenhuma ficha passa a ser REVELADA; o que a 1.2.7 mostrava, não é segredo e some é a EXCECAO_1_2_8, uma a uma (emoji com junção ou seletor de variação, texto com marca de direção,
// versão com número maior que o teto); o que carrega dados sem aparecer, o IPv4 depois do `-` ou do `+` e os dígitos livres na versão (EXTRAS_1_2_8) podem passar a sumir, nunca a aparecer.
// PLG-42 (correção): `diferencialDeOpcaoOculta` compara a 1.2.7 com a nova nas sequências de opção com caractere oculto (um traço, dois traços, `-e`, `-H`, `--header`, com o oculto colado, no meio ou depois do nome) e valor com cara de recurso: o que a 1.2.7 escondia a nova não pode mostrar, e o valor logo depois da opção oculta sai `<definir>`.
// Uso como teste: `import { diferencial } from './diferencial-argumentos.mjs'`. Uso solto (mostra o resultado):
//   node plugin/intoca/tests/diferencial-argumentos.mjs [<ambiente.mjs antigo> [<ambiente.mjs novo>]]
// Sem argumentos: o antigo é a cópia congelada da 1.2.6 (`tests/referencia/ambiente-1.2.6.mjs`) e o novo é `scripts/ambiente.mjs`. Com `--contra=1.2.7` o antigo é o `ambiente.mjs` da 1.2.7 que se passa como primeiro caminho (um arquivo inteiro, que precisa estar dentro de `scripts/` para achar os seus módulos). Os segredos são sentinelas FICTÍCIOS.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OPCOES_COM_OCULTO, VALORES_DE_RECURSO, S1 as SENTINELA_PROP } from './propriedade-argumentos.mjs';

const DEF = '<definir>';
export const S1 = 'ZQXWV9';
export const S3 = 'QWxhZGRpbjpv' + 'cGVuIHNlc2FtZQ==';
const DIGEST = 'sha256:' + 'a1b2c3d4'.repeat(8);
const HEX32 = 'c0ffee'.repeat(5) + 'c0'; // sentinelas hexadecimais FICTÍCIOS (`c0ffee` repetido)
const HEX64 = 'c0ffee'.repeat(10) + 'c0ff';
const GHP = 'gh' + 'p_' + S1.repeat(6); // formato de token do GitHub montado em duas partes, com o sentinela dentro
const ARROBA_LARGA = String.fromCharCode(0xff20);

// Formas comuns de servidor MCP (nenhuma é segredo): têm de ser tratadas como na versão antiga.
export const FICHAS_COMUNS = ['npx', '-y', 'mcp-remote@latest', 'firecrawl-mcp@1.2.3', '@escopo/pacote@1.2.3', '@escopo/pacote', 'pacote', 'uvx', 'servidor@2.0', '--from', 'git+https://github.com/org/repo', 'cmd',
  'docker', 'run', '-i', '--rm', 'img:tag', `img@${DIGEST}`, 'node', '/mcp/server.mjs', 'python', '-m', 'modulo', '--stdio', '--port', '3000', '--transport', 'sse', 'https://h.io/mcp', '-e', 'NOME=valor',
  'usuario@host', 'deploy@srv:/app', 'user@host:22', 'ana@exemplo.com', '@escopo/pacote@experimental',
  'pkg@1.2.3-beta.1', 'pkg@^1.2.3', 'pkg@rc2', '@escopo/pacote@1.2.3-rc.1', '@escopo/pacote@dev', '@escopo/pacote@nightly', '@escopo/pacote@lts', '@escopo/pacote@1.x'];
// Formas que a versão antiga ESCONDIA por engano (pacote com versão, sem escopo): passam a aparecer. É a correção, a única exceção nesta direção.
export const REVELA = new Set(['mcp-remote@latest', 'firecrawl-mcp@1.2.3', 'servidor@2.0', `img@${DIGEST}`, 'pkg@1.2.3-beta.1', 'pkg@^1.2.3', 'pkg@rc2']);
// Formas que a antiga mostrava, que não são segredo, e que o código novo esconde: a EXCEÇÃO documentada, uma a uma. `@escopo/pacote@<texto que não é rótulo de versão>`: o texto depois do segundo `@` pode ser um segredo.
export const EXCECOES = new Set(['@escopo/pacote@experimental', '@escopo/pacote@dev', '@escopo/pacote@nightly', '@escopo/pacote@lts', '@escopo/pacote@1.x']);
export const VERSAO_COM_SEGREDO = [`pkg@1.2.3-${S1}`, `pkg@1.2.3+${S1}`, `pkg@v1-${GHP}`, `pkg@1.2.3-rc.${S1}`, `pkg@${S1}`, `@a/b@1.2.3-${S1}`, `pkg@sha256:${HEX32}`, `img@sha256:${HEX32}`, `pkg${ARROBA_LARGA}1.2.3-${S1}`];
// LIMITES conhecidos, ditos no texto: segredo no lugar do NOME do pacote com versão no lugar certo, e `sha256:` com 64 hexadecimais que é segredo de fato. A 1.2.6 os escondia (escondia todo `pacote@versão`); a 1.2.7 os mostra: contados à parte, nunca como violação.
export const LIMITES = new Map([[`${S1}@1.2`, 'segredo no lugar do nome do pacote'], [`pkg@sha256:${HEX64}`, 'sha256 com 64 hexadecimais que é segredo']]);
// Fichas de segredo, mais duas opções de contexto (`--api-key`, `--foo`). Só a que CARREGA o sentinela é tratada como segredo (pode passar a sumir; nunca a aparecer). O valor invisível (`\u200B`, `\u0000`) fica de fora: ele muda o estado de propósito (item 4) e tem teste próprio.
export const SEGREDOS = [S1, S3, `${S3}\n`, `${S3} `, `${S1}﹫host`, `${S1}＠host`, `＠a/b＠${S1}`, `git＠h:${S1}`, `@a/b@${S1}`, `-k${S3}\n`, '--api-key', '--foo',
  // o segredo NA POSIÇÃO DA VERSÃO: a 1.2.6 escondia todas; a 1.2.7 não pode mostrar nenhuma (e mostrava as três primeiras antes da correção do sufixo)
  ...VERSAO_COM_SEGREDO, ...LIMITES.keys()];
const ehSegredo = (t) => typeof t === 'string' && (t.includes(S1) || t.includes('QWxh') || t.includes('c0ffee'));

// PLG-42 (1.2.8): formas novas, montadas por código (sem escapes no texto). Só entram na comparação com a 1.2.7 (`--contra=1.2.7`).
const T = (...cps) => String.fromCodePoint(...cps);
const TAGS = T(0xe0041, 0xe0042);
export const FICHAS_NOVAS_1_2_8 = [
  // carregam dados sem aparecer, sozinhos ou colados a uma palavra (a 1.2.7 copiava)
  TAGS, `abc${TAGS}`, `${S1}${TAGS}`, T(0x200b), `abc${T(0x200b)}`, T(0xfe0f), T(0xe000), T(0x378), T(0xad),
  // dígitos livres na posição da versão e IPv4 no sufixo (a 1.2.7 copiava)
  'pkg@1234567890.1234567890.1234567890', 'pkg@1.2.3-rc1234567890', 'pkg@1.2.3-10.0.0.1', 'pkg@1.2.3+10.0.0.1', 'pkg@1.2.3-1.2.3.4',
  // a lista completa do que a 1.2.7 mostrava e a 1.2.8 esconde (CHANGELOG, itens (a) a (e)): núcleo de 7 a 10 dígitos, segmento de 9 ou 10 dígitos, tag colada a 5 a 10 dígitos, depois de tag e ponto, sufixo de três segmentos só de dígitos
  'pkg@1234567', 'pkg@1.20240101', 'pkg@1.2.3-123456789', 'pkg@1.2.3+1234567890', 'pkg@1.2.3-rc12345', 'pkg@1.2.3-rc.123456789', 'pkg@1.2.3-2024.1.1',
  // formas comuns que continuam visíveis
  'pkg@1.2.3-rc.1', 'pkg@1.2.3-beta.2', 'pkg@1.2.3+20240101', 'pkg@123456.123456.123456', 'pkg@1.2.3-12345678', 'pasta' + T(0x301), 'ação', 'pkg@1.2.3-rc1234',
  // falsos positivos aceitos, ditos no texto: o que a 1.2.7 mostrava e agora some
  '👨' + T(0x200d) + '👩', 'שלום' + T(0x200f), '❤' + T(0xfe0f), 'pkg@20240101'];
// O que carrega dados sem aparecer ou é número livre na versão: pode passar a sumir (nunca a aparecer). São as fichas novas da primeira e da segunda linha acima.
export const EXTRAS_1_2_8 = new Set(FICHAS_NOVAS_1_2_8.slice(0, 21));
// Exceções da 1.2.8, uma a uma: a 1.2.7 mostrava, não é segredo e some.
export const EXCECOES_1_2_8 = new Set(FICHAS_NOVAS_1_2_8.slice(-4));

// Linhas de comando inteiras, como aparecem num `.mcp.json` de verdade (uma por servidor).
export const COMANDOS = [
  ['-y', 'mcp-remote@latest', 'https://h.io/mcp'],
  ['-y', '@escopo/pacote@1.2.3'],
  ['-y', 'firecrawl-mcp@1.2.3'],
  ['servidor@2.0'],
  ['--from', 'git+https://github.com/org/repo', 'cmd'],
  ['run', '-i', '--rm', 'img:tag'],
  ['run', '-i', '--rm', '-e', 'NOME=valor', `img@${DIGEST}`],
  ['/mcp/server.mjs', '--stdio'],
  ['-m', 'modulo'],
  ['--stdio', '--port', '3000', '--transport', 'sse'],
  ['https://h.io/mcp'],
  ['-y', 'mcp-server-git@2.0', '--repository', '/mcp/repo'],
];

function percorre(alfabeto, ate, aoChegar) {
  const atual = [];
  const anda = (n) => {
    if (n === 0) { aoChegar(atual.slice()); return; }
    for (const t of alfabeto) { atual.push(t); anda(n - 1); atual.pop(); }
  };
  for (let n = 1; n <= ate; n++) anda(n);
}

// Roda o diferencial. `antigo` e `novo` são os `argumentosDoMcp` das duas versões. Devolve { sequencias, posicoes, iguais, reveladas, escondidas, melhoraSegredo, violacoes, resumo }.
export function diferencial(antigo, novo, { fichas = FICHAS_COMUNS, ate = 4, segredos = SEGREDOS, ateMisto = 4, revela = REVELA, excecoes = EXCECOES, extras = new Set(), contra = '1.2.6' } = {}) {
  const r = { sequencias: 0, posicoes: 0, iguais: 0, reveladas: new Map(), escondidas: new Map(), melhoraSegredo: new Map(), limites: new Map(), violacoes: [] };
  const soma = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const confere = (s) => {
    const a = antigo(s, '/sede-falsa', '/casa-falsa', { ajuste: false });
    const b = novo(s, '/sede-falsa', '/casa-falsa', { ajuste: false });
    r.sequencias += 1;
    if (a.length !== s.length || b.length !== s.length) { if (r.violacoes.length < 8) r.violacoes.push(`${JSON.stringify(s)}: tamanho`); return; }
    for (let i = 0; i < s.length; i++) {
      r.posicoes += 1;
      if (a[i] === b[i]) { r.iguais += 1; continue; }
      const t = s[i];
      const ruim = (m) => { if (r.violacoes.length < 8) r.violacoes.push(`${JSON.stringify(s)} -> antigo ${JSON.stringify(a)} / novo ${JSON.stringify(b)}: ${m}`); };
      if (ehSegredo(t) || extras.has(t)) { // segredo (ou, na 1.2.8, o que carrega dados sem aparecer e o número livre na versão): só pode melhorar (passar a sumir ou mostrar menos)
        if (b[i] === DEF || (typeof b[i] === 'string' && typeof a[i] === 'string' && b[i].length < a[i].length)) { soma(r.melhoraSegredo, JSON.stringify(t)); continue; }
        if (LIMITES.has(t) && b[i] === t) { soma(r.limites, t); continue; } // limite conhecido e dito: conta à parte
        ruim(`segredo ${JSON.stringify(t)} passou a aparecer`);
        continue;
      }
      if (a[i] === DEF) { if (revela.has(t) && b[i] === t) soma(r.reveladas, t); else ruim(`${JSON.stringify(t)} estava escondido e passou a aparecer`); continue; }
      if (b[i] === DEF && excecoes.has(t)) { soma(r.escondidas, t); continue; }
      ruim(`${JSON.stringify(t)} mudou de ${JSON.stringify(a[i])} para ${JSON.stringify(b[i])}`);
    }
  };
  percorre(fichas, ate, confere);
  r.contra = contra;
  // misto: as fichas comuns que mais importam (opções e pacotes) com as de segredo, em todas as ordens
  const principais = ['-y', 'mcp-remote@latest', '@escopo/pacote@1.2.3', 'servidor@2.0', `img@${DIGEST}`, '--stdio', '--port', 'https://h.io/mcp', '-e', 'NOME=valor', 'usuario@host', '--from'];
  percorre([...principais, ...segredos], ateMisto, confere);
  r.resumo = [
    `${r.sequencias.toLocaleString('pt-BR')} sequências (todas as de 1 a ${ate} de ${fichas.length} fichas comuns; todas as de 1 a ${ateMisto} de ${principais.length + segredos.length} fichas, comuns e de segredo), ${r.posicoes.toLocaleString('pt-BR')} posições comparadas, ${r.iguais.toLocaleString('pt-BR')} iguais`,
    `passaram a aparecer (a correção): ${[...r.reveladas].map(([k, v]) => `${k.slice(0, 40)} (${v})`).join(', ') || 'nenhuma'}`,
    `passaram a sumir sem ser segredo (exceções documentadas): ${[...r.escondidas].map(([k, v]) => `${k} (${v})`).join(', ') || 'nenhuma'}`,
    `segredos que passaram a sumir ou a mostrar menos: ${r.melhoraSegredo.size} fichas`,
    `limites conhecidos que a ${contra} escondia e o código novo mostra (ditos no texto): ${[...r.limites].map(([k, v]) => `${k.slice(0, 24)} (${v})`).join(', ') || 'nenhum'}`,
    `violações: ${r.violacoes.length}`,
  ];
  return r;
}

// PLG-42 (correção): o diferencial da opção com caractere oculto. Regras, posição por posição: (1) o que a antiga escondia a nova esconde (nunca passa a aparecer); (2) a nova não deixa o sentinela sair onde a antiga não o deixava; (3) o argumento logo depois da opção oculta sai `<definir>`
// por inteiro (a antiga o escondia quase sempre; onde o mostrava a nova NÃO pode mostrar); (4) a opção com oculto sai `<definir>`. Sequências de 1 a `ate` (padrão 3) sobre as opções, os valores com cara de recurso e três fichas comuns.
export function diferencialDeOpcaoOculta(antigo, novo, { ate = 3 } = {}) {
  const alfabeto = [...OPCOES_COM_OCULTO, ...VALORES_DE_RECURSO, '-y', 'pkg', 'https://h.io/mcp'];
  const oculta = new Set(OPCOES_COM_OCULTO);
  const r = { sequencias: 0, posicoes: 0, iguais: 0, passaramASumir: 0, antigaMostrava: new Map(), violacoes: [] };
  const vazou = (x) => typeof x === 'string' && (x.includes(SENTINELA_PROP) || x.includes('QWxh') || x.includes('c0ffee'));
  const confere = (s) => {
    const a = antigo(s, '/sede-falsa', '/casa-falsa', { ajuste: false });
    const b = novo(s, '/sede-falsa', '/casa-falsa', { ajuste: false });
    r.sequencias += 1;
    if (a.length !== s.length || b.length !== s.length) { if (r.violacoes.length < 8) r.violacoes.push(`${JSON.stringify(s)}: tamanho`); return; }
    for (let i = 0; i < s.length; i++) {
      r.posicoes += 1;
      if (a[i] === b[i]) r.iguais += 1;
      const ruim = (m) => { if (r.violacoes.length < 8) r.violacoes.push(`${JSON.stringify(s)} -> antigo ${JSON.stringify(a)} / novo ${JSON.stringify(b)}: ${m}`); };
      if (a[i] === DEF && b[i] !== DEF) { ruim(`posição ${i}: a antiga escondia e a nova mostra ${JSON.stringify(b[i])}`); continue; }
      if (vazou(b[i]) && !vazou(a[i])) { ruim(`posição ${i}: o sentinela passou a sair`); continue; }
      if (oculta.has(s[i]) && b[i] !== DEF) { ruim(`posição ${i}: a opção com oculto devia sair ${DEF}`); continue; }
      if (i > 0 && oculta.has(s[i - 1]) && !['-y', 'pkg'].includes(s[i]) && b[i] !== DEF) { ruim(`posição ${i}: o valor depois da opção oculta devia sair ${DEF}`); continue; }
      if (a[i] !== DEF && b[i] === DEF) { r.passaramASumir += 1; if (i > 0 && oculta.has(s[i - 1])) r.antigaMostrava.set(JSON.stringify(a[i]), (r.antigaMostrava.get(JSON.stringify(a[i])) ?? 0) + 1); }
    }
  };
  percorre(alfabeto, ate, confere);
  r.resumo = [
    `opção com caractere oculto + valor com cara de recurso: ${r.sequencias.toLocaleString('pt-BR')} sequências (todas as de 1 a ${ate} de ${alfabeto.length} fichas), ${r.posicoes.toLocaleString('pt-BR')} posições comparadas, ${r.iguais.toLocaleString('pt-BR')} iguais`,
    `passaram a sumir (a nova esconde mais; nenhuma passou a aparecer): ${r.passaramASumir.toLocaleString('pt-BR')} posições`,
    `violações: ${r.violacoes.length}`,
  ];
  return r;
}

// Uso solto
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const flags = process.argv.slice(2).filter((x) => x.startsWith('--'));
  const caminhos = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const contra127 = flags.includes('--contra=1.2.7');
  const ate = Number((flags.find((x) => x.startsWith('--ate=')) ?? '--ate=4').slice(6));
  const [a, b] = [caminhos[0] ?? join(aqui, 'referencia', 'ambiente-1.2.6.mjs'), caminhos[1] ?? join(aqui, '..', 'scripts', 'ambiente.mjs')];
  const antigo = (await import(pathToFileURL(a).href)).argumentosDoMcp;
  const novo = (await import(pathToFileURL(b).href)).argumentosDoMcp;
  const opcoes = contra127 ? { fichas: [...FICHAS_COMUNS, ...FICHAS_NOVAS_1_2_8], ate, ateMisto: 4, segredos: [...SEGREDOS, ...[...EXTRAS_1_2_8]], revela: new Set(), excecoes: EXCECOES_1_2_8, extras: EXTRAS_1_2_8, contra: '1.2.7' } : { ate };
  const r = diferencial(antigo, novo, opcoes);
  console.log(r.resumo.join('\n'));
  const o = diferencialDeOpcaoOculta(antigo, novo);
  console.log(o.resumo.join('\n'));
  r.violacoes.push(...o.violacoes);
  console.log('\nLinhas de comando inteiras (antigo -> novo):');
  for (const c of COMANDOS) {
    const x = antigo(c, '/sede-falsa', '/casa-falsa', { ajuste: false });
    const y = novo(c, '/sede-falsa', '/casa-falsa', { ajuste: false });
    console.log(`  ${JSON.stringify(c)}\n    antigo: ${JSON.stringify(x)}\n    novo  : ${JSON.stringify(y)}`);
  }
  if (r.violacoes.length) console.log(`\nFALHOU:\n- ${r.violacoes.join('\n- ')}`);
  process.exit(r.violacoes.length ? 1 : 0);
}
