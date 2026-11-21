// Teste por propriedade do `argumentosDoMcp` (PLG-36 R4, ampliado na PLG-37, na PLG-38, na PLG-39, na PLG-40 e na PLG-42).
// Roda TODAS as sequências de argumentos de alfabetos fixos, até um comprimento, contra a máquina de estados. Há três camadas de conferência:
//  1. Regras INDEPENDENTES do código (valem sem repetir a máquina de estados): (i) um argumento que carrega um segredo DENTRO dele (`--token:ZQXWV9`, `--user:ZQXWV9@host`,
//     `https://u:ZQXWV9@h/db`...) nunca sai com o sentinela, em nenhuma posição; (ii) um sentinela que vem LOGO DEPOIS de uma opção de nome sensível ou de um argumento
//     de nome estranho (com `:`, `/`, `@`) nunca sai; (iii) a saída tem o mesmo número de argumentos da entrada; (iv) não-texto sempre sai `<definir>`.
//  2. O oráculo da cadeia (estado ligado por opção comum, `--`, `''` e não-texto), que confere também o que não é segredo. Ele repete a máquina de estados do código.
//  3. (PLG-38, endurecido na PLG-39) Um oráculo INDEPENDENTE do código, escrito à mão em cima de uma regra mínima, sem andar a cadeia e SEM importar nada do `ambiente.mjs`: "nenhum sentinela de segredo
//     sai (a) quando veio dentro de um argumento com `//u:p＠h`, `u:p@h`, `S＠host`, `S＠host/caminho`, `-pS`, `-accesskey=S`, `--x:S`, base64 com `=` ou `==` (solto, `--foo=`, `-k`), de um objeto ou de uma lista;
//     (b) quando veio depois de uma opção que espera valor (inclusive a que termina em `=` ou `:` vazios, `-x=`, `-vp:`), de nome sensível ou de nome desconhecido, de uma ou duas letras ou nome longo de um traço
//     (`-accesskey S`, `-apitoken S`, `-vp S`), mesmo com `''`, texto só de espaço em branco, `--` ou não-texto no meio"; e `//S` solto (sem ponto no host) nunca sai, nem com o texto alterado.
//     PLG-39: os sentinelas NÃO têm palavra sensível (`ZQXWV9`, `Zq7Wv9=`, base64 com `==`), para que o argumento não suma pelo nome; e a expectativa "esta opção espera valor" vem de uma regra escrita à mão, não da fórmula do código.
//     PLG-40: todas as camadas têm as formas COMUNS de servidor MCP (`mcp-remote@latest`, `@escopo/pacote@1.2.3`, `img@sha256:…`; o oráculo exige que fiquem visíveis quando nada as esconde) e os valores invisíveis (largura zero, NUL);
//     o gerador ganhou base64 com `==` seguido de espaço ou quebra de linha, `@` parecidos (`﹫`, `＠a/b＠S`, `git＠h:S`), `@escopo/nome@S` e as formas `S=1` (LIMITE conhecido: o `S` aparece como nome; a propriedade afirma o que o código faz).
//     PLG-42: o argumento que contém um caractere que CARREGA DADOS sem aparecer (formato Cf, uso privado Co, sem designação Cn, seletor de variação, controle Cc, caractere de tag), sozinho ou COLADO a uma palavra (`abc` + tag, `S` + tag), sai `<definir>` por inteiro,
//     com ou sem estado ligado (regra [E], escrita à mão); o segredo só de dígitos grandes na posição da versão e o IPv4 depois do `-` ou do `+` (`pkg@1.2.3-10.0.0.1`) também somem; as formas comuns com sufixo (`pkg@1.2.3-rc.1`) ficam.
// Uso como teste: `import { propriedade } from './propriedade-argumentos.mjs'`. Uso solto, contra outro código (para ver a falha no código antigo):
//   node plugin/intoca/tests/propriedade-argumentos.mjs <caminho do ambiente.mjs>
// Os valores são sentinelas FICTÍCIOS: nada aqui é segredo. O base64 é montado por partes (o exemplo clássico de Basic Auth da documentação) para não casar padrão de segredo.
import { pathToFileURL, fileURLToPath } from 'node:url';

const DEF = '<definir>';
// PLG-39: sentinelas SEM palavra sensível. S1 é uma palavra solta; S2 é base64 curto com `=`; S3 é base64 com `==`. Os dois últimos não podem sair em NENHUMA forma (nem soltos, nem como "nome").
export const S1 = 'ZQXWV9';
export const S2 = 'Zq7Wv9=';
export const S3 = 'QWxhZGRpbjpv' + 'cGVuIHNlc2FtZQ==';
const SENT = new Set([S1, S2]);
// PLG-40: caracteres invisíveis montados por código (sem escapes no texto): largura zero (U+200B) e NUL (U+0000).
export const ZW = String.fromCharCode(0x200b);
export const NUL = String.fromCharCode(0);
// PLG-40: formas COMUNS e inofensivas de servidor MCP (nenhuma é segredo): sem nada que as esconda, saem como entraram.
export const COMUM_PKG = 'mcp-remote@latest';
export const ESCOPO_PKG = '@escopo/pacote@1.2.3';
export const DIGEST_PKG = 'img@sha256:' + 'a1b2c3d4'.repeat(8);
// PLG-40: LIMITE conhecido (item 3): um segredo no lugar do NOME de `nome=valor` (`S=1`, `-kS=1`, `--foo=S=1`) sai como nome, porque tem cara de nome (`ZQXWV9=<definir>`). A propriedade afirma exatamente isto.
export const S_IGUAL1 = `${S1}=1`;
export const LIMITE_DE_NOME = new Map([[S_IGUAL1, [DEF, `${S1}=${DEF}`]], [`-k${S1}=1`, [DEF, `-k${S1}=${DEF}`]], [`--foo=${S1}=1`, [`--foo=${S1}=${DEF}`]]]);
// PLG-40 (seguimento): o segredo NA POSIÇÃO DA VERSÃO (depois do `@` de `pkg@...`). Nenhum sai. HEX32 e HEX64 são sentinelas hexadecimais fictícios (`c0ffee` repetido); GHP monta o formato de um token do GitHub em duas partes
// (o texto-fonte não casa com um padrão de chave) e carrega o sentinela S1 dentro.
export const HEX32 = 'c0ffee'.repeat(5) + 'c0';
export const HEX64 = 'c0ffee'.repeat(10) + 'c0ff';
export const GHP = 'gh' + 'p_' + S1.repeat(6);
export const ARROBA_LARGA = String.fromCharCode(0xff20);
export const VERSAO_COM_SEGREDO = [`pkg@1.2.3-${S1}`, `pkg@1.2.3+${S1}`, `pkg@v1-${GHP}`, `pkg@1.2.3-rc.${S1}`, `pkg@${S1}`, `@a/b@1.2.3-${S1}`, `pkg@sha256:${HEX32}`, `img@sha256:${HEX32}`, `pkg${ARROBA_LARGA}1.2.3-${S1}`];
// LIMITES conhecidos, ditos no texto (o código mostra; a propriedade afirma exatamente isso, ou que sumiu): um segredo no lugar do NOME do pacote com versão no lugar certo, e `sha256:` com 64 hexadecimais que é segredo de fato.
export const LIMITE_DE_VERSAO = new Map([[`${S1}@1.2`, [DEF, `${S1}@1.2`]], [`pkg@sha256:${HEX64}`, [DEF, `pkg@sha256:${HEX64}`]]]);
// formas comuns que ficam visíveis (o pacote com versão em todas as formas aceitas)
export const PACOTES_COMUNS = ['pkg@1.2.3-beta.1', 'pkg@^1.2.3', 'pkg@rc2', 'pkg@1.2.3+20240101', 'pkg@1.2.3-rc.1'];
const COMUNS_VISIVEIS = [COMUM_PKG, ESCOPO_PKG, DIGEST_PKG, ...PACOTES_COMUNS];
// PLG-40 (seguimento): caracteres invisíveis das categorias Unicode Z, Cc e Cf e os da lista dita no texto, montados por código (sem escapes no texto). Os que não são espaço em branco do JavaScript passam sem estado ligado; NBSP e U+3000 são `s`. O critério do código é estrutural (sem letra, número, pontuação nem símbolo), por isso há uma amostra de cada categoria.
// Mn U+0300, U+034F, U+180B, U+17B4, U+FE0F; Mc U+0903; Me U+20DD; Co U+E000; Cn U+0378; seletor de variação U+E0100; não-caractere U+FFFF.
export const INVISIVEIS_NOVOS = [0xad, 0x180e, 0x34f, 0x2800, 0x3164, 0xe0001, 0x300, 0x903, 0x20dd, 0xfe0f, 0x180b, 0x17b4, 0xe000, 0xe0100, 0xffff, 0x378].map((c) => String.fromCodePoint(c));
export const INVISIVEIS_ESPACO = [0xa0, 0x3000, 0x2028].map((c) => String.fromCodePoint(c));
// PLG-42: dos invisíveis acima, os que o código esconde por INTEIRO em qualquer posição (carregam dados: Cf, Co, Cn, seletor de variação, controle) e os que ficam (marcas comuns e as letras que não desenham nada: só somem como VALOR, com o estado ligado). Lista escrita à mão.
const QUE_FICAM = new Set([0x34f, 0x2800, 0x3164, 0x300, 0x903, 0x20dd, 0x17b4].map((c) => String.fromCodePoint(c)));
export const INVISIVEIS_OCULTOS = new Set([ZW, NUL, ...INVISIVEIS_NOVOS.filter((c) => !QUE_FICAM.has(c))]);
// caracteres de tag (U+E0041, U+E0042): um argumento colado a eles carrega dados
export const TAG2 = String.fromCodePoint(0xe0041, 0xe0042);
export const COLADO_A_TAG = 'abc' + TAG2;
export const SEGREDO_COLADO_A_TAG = S1 + TAG2;
const temOculto = (x) => typeof x === 'string' && [...x].some((c) => INVISIVEIS_OCULTOS.has(c));
// PLG-42: versão com dígitos livres e IPv4 no sufixo: somem sempre; e as formas comuns com sufixo que ficam
export const VERSAO_NUMERICA_QUE_SOME = ['pkg@1234567890.1234567890.1234567890', 'pkg@1.2.3-rc1234567890', 'pkg@1.2.3-10.0.0.1'];
const SOMEM_SEMPRE = new Set([...VERSAO_NUMERICA_QUE_SOME, COLADO_A_TAG, SEGREDO_COLADO_A_TAG]);
// PLG-42 (correção): a OPÇÃO com caractere oculto (colado ao nome, no meio ou depois dele) e o VALOR com cara de recurso que vem depois dela. A opção real é desconhecida: o argumento sai `<definir>` por inteiro
// e o seguinte também, SEM EXCEÇÃO (nem URL com caminho curto, nem `@escopo/nome`, nem `~/x`, nem `nome=valor`, nem `S=1`). Escritos por código e à mão, sem repetir a máquina de estados.
const OCULTOS_DA_OPCAO = [ZW, TAG2, String.fromCodePoint(0xfe0f), String.fromCodePoint(0xad)];
const BASES_DE_OPCAO = ['-p', '-password', '-e', '-H', '--header', '--api-key', '/token'];
export const OPCOES_COM_OCULTO = BASES_DE_OPCAO.flatMap((b) => OCULTOS_DA_OPCAO.flatMap((c) => [b + c, b + c + 'x', b.slice(0, 2) + c + b.slice(2)]));
// (o sentinela NÃO vai dentro de URL nem de caminho: um segredo no caminho de uma URL sozinha é copiado, limite dito; o sentinela entra puro e como `S=1`)
export const VALORES_DE_RECURSO = ['https://h.io/s', 'https://h.io/mcp', '@escopo/nome', `${String.fromCharCode(0xff20)}a/s`, '~/x', 'nome=valor', 's=1', `${S1}=1`, '/mcp/server.mjs', S1, 'pkg'];
const OPCAO_COM_OCULTO = new Set(OPCOES_COM_OCULTO);
// Pedaços que o teste procura na saída (sem diferenciar maiúsculas de minúsculas): o texto inteiro, o meio ou o começo do segredo, mesmo alterado.
const FRAGMENTOS = ['ZQXWV9', 'Zq7Wv9', 'QWxhZGRp', 'IHNlc2FtZQ', 'c0ffee'];
const vazou = (x) => { const t = (typeof x === 'string' ? x : JSON.stringify(x)).toLowerCase(); return FRAGMENTOS.some((f) => t.includes(f.toLowerCase())); };
const URL_LIMPA = 'https://h.io/limpa';
// Limite CONHECIDO do desenho (PLG-37, item 3): uma opção sensível logo depois de outra que espera valor continua sendo opção, com nome e texto visíveis.
const LIMITE = '--token-ABC123';
// Não-texto representável no gerador: número, nulo e objeto.
const NAO_TEXTO = [5, null, {}];
// Argumentos que carregam o segredo dentro (nome estranho: `:`, `/`, `@`) e URL com usuário e senha.
const ESTRANHOS = [`--token:${S1}`, `--user:${S1}@host`, `--https://u:${S1}@h/db`, `--password:${S2}`];
const URL_COM_USUARIO = `https://u:${S1}@h/db`;

// Alfabeto completo (comprimentos 1 a 4), alfabeto de nomes (camelCase, colado, estranho, vazio, com espaço, URL com usuário; 1 a 4) e alfabeto crítico (comprimento 5).
export const ALFABETO = ['-y', '--headless', '--port', '--stdio', '--no-x', '--foo', '-p', '--token', '--api-key', '-password', '--token=', '--db', '-e', '-H', '--x=v1', 'pkg', '/segredo', S1, S2,
  '--', ...NAO_TEXTO, '-eX=v1', '-HX:v1', '--webhook', '--pat', URL_LIMPA, LIMITE, COMUM_PKG, ESCOPO_PKG, DIGEST_PKG, ZW, NUL];
export const ALFABETO_NOMES = ['--apiKey', '--PAT', '--webhookurl', '--mypat', '--patch', ...ESTRANHOS.slice(0, 3), URL_COM_USUARIO, '', 'a b', S1, S2, 'pkg', '--', '-p', '--foo', '--api-key', '--port', '-y', COMUM_PKG, `${S1}﹫host`, `@a/b@${S1}`];
// PLG-38: alfabetos da camada 3 (oráculo independente). Sentinelas fictícios; nada aqui é segredo.
export const OBJETO_COM_SEGREDO = { k: S1 };
export const LISTA_COM_SEGREDO = [S1];
// PLG-39: o gerador ganhou maiúsculas e dígitos (os sentinelas), base64 com `=` e `==` (solto, colado a `--foo=` e a `-k`), `S＠host`, `token＠host/caminho`, `//S` solto, e o espaço e a tabulação.
export const ALFABETO_INDEPENDENTE = ['-accesskey', '-apitoken', '-vp', '-yv', `-accesskey=${S1}`, `//u:${S1}＠h`, `u:${S1}@h`, `-p${S1}`, '-x=', '-x:', '-vp=', `-k${S1}`, `-k${S3}`,
  `--foo=${S3}`, `${S1}＠host`, `//${S1}`, '', ' ', '	', '--', OBJETO_COM_SEGREDO, S1, S2, S3, 'pkg', '--api-key', '--foo', '-y',
  `${S3} `, `${S3}\n`, ZW, NUL, `${S1}﹫host`, `＠a/b＠${S1}`, `git＠h:${S1}`, `@a/b@${S1}`, ...LIMITE_DE_NOME.keys(), COMUM_PKG, ESCOPO_PKG, DIGEST_PKG, '-e'];
export const ALFABETO_INDEPENDENTE_CRITICO = ['-accesskey', '-vp', '-x:', '-yv', `//u:${S1}＠h`, '', ' ', ZW, NUL, '--', OBJETO_COM_SEGREDO, S1, `-k${S3}`, `${S3}\n`, `${S1}﹫host`, `//${S1}`, COMUM_PKG, '--api-key', '--foo'];
export const ALFABETO_CRITICO = ['--api-key', '--', 5, '--foo', '-y', '--port', 'pkg', S1, URL_LIMPA, '-eX=v1', LIMITE, '--pat', null, '--stdio', COMUM_PKG];

// PLG-40 (seguimento): o alfabeto do segredo na posição da versão (camada independente e cadeia) e o dos invisíveis.
export const ALFABETO_VERSAO = [...VERSAO_COM_SEGREDO, ...VERSAO_NUMERICA_QUE_SOME, ...LIMITE_DE_VERSAO.keys(), COMUM_PKG, ESCOPO_PKG, DIGEST_PKG, ...PACOTES_COMUNS, '--api-key', '--foo', '-e', '-y', 'pkg', S1, '', '--'];
export const ALFABETO_VERSAO_CADEIA = [...VERSAO_COM_SEGREDO, ...VERSAO_NUMERICA_QUE_SOME, COMUM_PKG, ESCOPO_PKG, DIGEST_PKG, ...PACOTES_COMUNS, '--api-key', '--foo', '-y', 'pkg', S1];
export const ALFABETO_INVISIVEL = ['--api-key', '--foo', '-e', '-y', S1, 'pkg', '', ZW, NUL, COLADO_A_TAG, SEGREDO_COLADO_A_TAG, ...INVISIVEIS_NOVOS, ...INVISIVEIS_ESPACO];
export const ALFABETO_INVISIVEL_CADEIA = ['--api-key', '--foo', '-y', S1, 'pkg', '', ZW, NUL, COLADO_A_TAG, SEGREDO_COLADO_A_TAG, ...INVISIVEIS_NOVOS];
// sensível, de ambiente ou de cabeçalho: nunca perde o nome (e o valor some)
const VISIVEL = new Set(['-p', '--token', '--api-key', '-password', '--token=', '-e', '-H', '/segredo', '--webhook', '--pat', LIMITE, '--apiKey', '--PAT', '--webhookurl', '--mypat']);
const COLADA = new Map([['--x=v1', '--x=' + DEF], ['-eX=v1', '-eX=' + DEF], ['-HX:v1', '-HX: ' + DEF]]); // valor colado: o nome fica, o valor some
const COMUM = new Set(['-y', '--headless', '--port', '--stdio', '--no-x', '--foo', '--db', '--patch']); // opção comum ou bandeira: com o estado ligado, vira o valor
const ESTRANHO = new Set(ESTRANHOS); // nome com caractere estranho: sai SEMPRE `<definir>` inteiro e deixa o estado ligado
// espera o argumento seguinte
const LIGA = new Set(['--headless', '--foo', '--db', '--port', '--patch', '-p', '--token', '--api-key', '-password', '--token=', '-e', '-H', '/segredo', '--webhook', '--pat', LIMITE, '--apiKey', '--PAT', '--webhookurl', '--mypat', ...ESTRANHOS]);
// Regra independente (ii): depois de qualquer um destes, o sentinela que vem LOGO em seguida nunca sai. Lista escrita à mão, sem repetir a lógica do código.
const NOMES_SENSIVEIS_DO_TESTE = new Set(['-p', '--token', '--api-key', '-password', '--token=', '-e', '-H', '/segredo', '--webhook', '--pat', '--apiKey', '--PAT', '--webhookurl', '--mypat', ...ESTRANHOS]);
// Tokens que carregam segredo dentro: o sentinela nunca pode aparecer na saída deles.
const CARREGA_SEGREDO = new Set([...ESTRANHOS, URL_COM_USUARIO, `${S1}﹫host`, `@a/b@${S1}`, ...VERSAO_COM_SEGREDO]);
// PLG-40: o valor invisível (largura zero, NUL) e a string vazia: com o estado ligado são o VALOR e mantêm o estado; sem estado ligado ficam como estão.
const VAZIOS = new Set(['', ZW, NUL, ...INVISIVEIS_NOVOS]);

// Camada 3 (PLG-38, endurecida na PLG-39): o oráculo INDEPENDENTE. Não anda a cadeia, não repete a máquina de estados e não importa nada do código: só olha o argumento e o primeiro vizinho de trás que não seja
// `--`, texto vazio ou só de espaço em branco, ou não-texto.
const texto = (x) => JSON.stringify(x, (_, v) => (v === undefined ? '<undefined>' : v));
const BANDEIRAS_DO_TESTE = new Set(['-y', '-v', '-vv', '-yv', '--stdio', '--no-x']); // bandeiras conhecidas e agrupamentos: não esperam valor
const SEGURAS_DO_TESTE = new Set(['--port']); // o valor de uma opção segura conhecida é copiado (dito na doc)
// REGRA ESCRITA À MÃO (PLG-39): um argumento espera o próximo como valor quando (1) começa com `-`, (2) não é bandeira conhecida nem agrupamento de bandeiras, nem o `--` sozinho, nem opção segura, e
// (3) NÃO traz valor colado: ou não tem `=` nem `:` nenhum, ou o primeiro `=`/`:` é o último caractere (`-x=`, `-vp:`, `--api-key=`). Tem valor colado quando há algum caractere depois do primeiro `=`/`:`.
function esperaValor(x) {
  if (typeof x !== 'string' || !x.startsWith('-') || x === '--') return false;
  if (BANDEIRAS_DO_TESTE.has(x) || SEGURAS_DO_TESTE.has(x)) return false;
  let primeiro = -1;
  for (let k = 0; k < x.length; k++) if (x[k] === '=' || x[k] === ':') { primeiro = k; break; }
  return primeiro === -1 || primeiro === x.length - 1;
}
// PLG-40: sem conteúdo = não-texto, `--`, vazio, só espaço, tabulação, quebra de linha, largura zero ou NUL (escrito à mão, sem a regra do código)
const BRANCOS_DO_TESTE = new Set([' ', String.fromCharCode(9), String.fromCharCode(10), ZW, NUL, ...INVISIVEIS_NOVOS, ...INVISIVEIS_ESPACO]);
const semConteudo = (x) => typeof x !== 'string' || x === '--' || [...x].every((c) => BRANCOS_DO_TESTE.has(c));
function confereIndependente(s, o, erro) {
  for (let i = 0; i < s.length; i++) {
    const x = s[i];
    const saiu = typeof o[i] === 'string' ? o[i] : JSON.stringify(o[i]);
    if (typeof x !== 'string') { if (o[i] !== DEF) erro(`[A] não-texto ${texto(x)} devia sair ${DEF}: ${saiu}`); continue; }
    // (G) PLG-42 (correção): a opção com caractere oculto sai `<definir>` por inteiro e o argumento SEGUINTE também (qualquer valor, inclusive com cara de recurso), nunca em claro e nunca com o sentinela
    if (OPCAO_COM_OCULTO.has(x) && o[i] !== DEF) erro(`[G] a opção ${texto(x)} devia sair ${DEF}: ${saiu}`);
    // (a opção sensível conhecida depois dela continua sendo opção, com o nome visível, como depois de qualquer opção sensível: limite dito)
    if (i > 0 && OPCAO_COM_OCULTO.has(s[i - 1]) && !VISIVEL.has(x) && o[i] !== DEF) erro(`[G] ${texto(x)} depois da opção ${texto(s[i - 1])} devia sair ${DEF}: ${saiu}`);
    // (E) PLG-42: caractere que carrega dados sem aparecer (Cf, Co, Cn, seletor de variação, controle, tag), sozinho ou colado a uma palavra: o argumento INTEIRO sai `<definir>`, com ou sem estado ligado
    if (temOculto(x)) { if (o[i] !== DEF) erro(`[E] ${texto(x)} devia sair ${DEF}: ${saiu}`); continue; }
    // (F) PLG-42: dígitos livres na versão e IPv4 no sufixo somem sempre
    if (SOMEM_SEMPRE.has(x)) { if (o[i] !== DEF) erro(`[F] ${x} devia sair ${DEF}: ${saiu}`); continue; }
    // (D) PLG-40: forma comum de servidor MCP na primeira posição (nada a esconde): sai como entrou
    if (i === 0 && COMUNS_VISIVEIS.includes(x) && o[0] !== x) erro(`[D] a forma comum ${x} sumiu: ${saiu}`);
    // (L) PLG-40: LIMITE conhecido (`S=1`, `-kS=1`, `--foo=S=1`): o `S` sai como NOME; afirmamos exatamente o que o código faz, e mais nada (nem o `=1`)
    if (LIMITE_DE_VERSAO.has(x)) { if (!LIMITE_DE_VERSAO.get(x).includes(o[i])) erro(`[L] limite conhecido: ${x} devia sair um de ${LIMITE_DE_VERSAO.get(x).join(' ou ')}: ${saiu}`); continue; }
    if (LIMITE_DE_NOME.has(x)) { if (!LIMITE_DE_NOME.get(x).includes(o[i])) erro(`[L] limite conhecido: ${x} devia sair um de ${LIMITE_DE_NOME.get(x).join(' ou ')}: ${saiu}`); continue; }
    // (A) segredo DENTRO de um argumento (`//u:S＠h`, `u:S@h`, `S＠host`, `S＠host/caminho`, `//S` solto sem ponto, `-pS`, `-accesskey=S`, base64 com `=`/`==`, objeto, lista): nunca sai, em nenhuma posição, nem alterado (a busca não diferencia maiúsculas: `//ZQXWV9` não vira `//zqxwv9`). O sentinela puro S1 (palavra solta) é só (B).
    if (vazou(x) && x !== S1) { if (vazou(saiu)) erro(`[A] ${x} saiu com o segredo: ${saiu}`); continue; }
    // (B) o sentinela puro, logo depois de uma opção que espera valor (nome sensível ou desconhecido, de uma letra, duas ou longo de um traço), mesmo com `''`, ` `, `	`, `--` ou não-texto no meio: nunca sai
    if (x === S1) {
      let j = i - 1;
      while (j >= 0 && semConteudo(s[j])) j--;
      if (j >= 0 && esperaValor(s[j]) && o[i] === x) erro(`[B] ${x} depois de ${texto(s[j])} saiu em claro`);
    }
  }
  // (C) agrupamento de bandeiras sem valor (`-vv`, `-yv`) no começo: fica como está e não liga o estado (a palavra seguinte não some)
  if (s.length >= 1 && (s[0] === '-vv' || s[0] === '-yv') && o[0] !== s[0]) erro(`[C] ${s[0]} perdeu o nome: ${texto(o[0])}`);
  if (s.length >= 2 && (s[0] === '-vv' || s[0] === '-yv') && s[1] === 'pkg' && o[1] !== 'pkg') erro(`[C] ${s[0]} ligou o estado: pkg saiu ${texto(o[1])}`);
}

// PLG-40: as configurações, separadas para o teste rodar cada grupo no seu caso (a soma passa de 5 milhões de sequências). Por padrão (uso solto) rodam todas.
export const CONFIG_CADEIA = [
  { alfabeto: ALFABETO, ate: 4 },
  { alfabeto: ALFABETO_NOMES, ate: 4 },
  { alfabeto: ALFABETO_CRITICO, ate: 5, soEste: true },
];
export const CONFIG_INDEPENDENTE_PRINCIPAL = [{ alfabeto: ALFABETO_INDEPENDENTE, ate: 4, independente: true }];
export const CONFIG_INDEPENDENTE_CRITICA = [{ alfabeto: ALFABETO_INDEPENDENTE_CRITICO, ate: 5, soEste: true, independente: true }];
// PLG-40 (seguimento): o segredo na posição da versão e os invisíveis novos, nas duas camadas (a independente e a cadeia).
export const CONFIG_VERSAO = [{ alfabeto: ALFABETO_VERSAO, ate: 4, independente: true }, { alfabeto: ALFABETO_VERSAO_CADEIA, ate: 4 }];
// PLG-42 (correção): a opção com caractere oculto e o valor com cara de recurso depois dela, de 1 a 3 (1.2.8 sem a correção reprova).
export const ALFABETO_OPCAO_OCULTA = [...OPCOES_COM_OCULTO, ...VALORES_DE_RECURSO, '--api-key', '-p', '-y'];
export const CONFIG_OPCAO_OCULTA = [{ alfabeto: ALFABETO_OPCAO_OCULTA, ate: 3, independente: true }];
export const CONFIG_INVISIVEL = [{ alfabeto: ALFABETO_INVISIVEL, ate: 4, independente: true }, { alfabeto: ALFABETO_INVISIVEL_CADEIA, ate: 4 }];

export function propriedade(argumentosDoMcp, { configuracoes, maxFalhas = 8 } = {}) {
  const cfgs = configuracoes ?? [...CONFIG_CADEIA, ...CONFIG_INDEPENDENTE_PRINCIPAL, ...CONFIG_INDEPENDENTE_CRITICA, ...CONFIG_VERSAO, ...CONFIG_INVISIVEL, ...CONFIG_OPCAO_OCULTA];
  const falhas = [];
  let sequencias = 0;
  const marca = { ajuste: false };
  const confere = (s, independente = false) => {
    const o = argumentosDoMcp(s, '/sede-falsa', '/casa-falsa', marca);
    const erro = (m) => { if (falhas.length < maxFalhas) falhas.push(`${texto(s)} -> ${texto(o)}: ${m}`); };
    if (o.length !== s.length) { erro('tamanho'); return; }
    if (independente) { confereIndependente(s, o, erro); return; }
    // regras independentes (i), (ii) e (iv): não olham a cadeia, só o argumento e o vizinho de trás
    for (let i = 0; i < s.length; i++) {
      const t = s[i];
      if (typeof t !== 'string') { if (o[i] !== DEF) erro(`não-texto ${texto(t)} devia sair ${DEF}: ${texto(o[i])}`); continue; }
      if (CARREGA_SEGREDO.has(t) && vazou(o[i])) erro(`${t} saiu com o segredo: ${o[i]}`);
      if (SENT.has(t) && i > 0 && typeof s[i - 1] === 'string' && NOMES_SENSIVEIS_DO_TESTE.has(s[i - 1]) && o[i] === t) erro(`${t} depois de ${s[i - 1]} saiu em claro`);
    }
    if (falhas.length >= maxFalhas) return;
    // quem ligou o estado na posição i: anda para trás por opção comum, `--` e não-texto (o estado continua ligado por eles) até achar uma opção que liga; qualquer outra coisa interrompe
    const ativador = (i) => {
      for (let j = i - 1; j >= 0; j--) {
        const u = s[j];
        if (LIGA.has(u)) return u;
        if (!(typeof u !== 'string' || u === '--' || VAZIOS.has(u) || COMUM.has(u))) return null;
      }
      return null;
    };
    // a opção estrita (sensível, de ambiente ou de cabeçalho) que ainda segura o estado: só `--` e não-texto (que são o valor dela) ficam no meio
    const estrita = (i) => { let j = i - 1; while (j >= 0 && (typeof s[j] !== 'string' || s[j] === '--' || VAZIOS.has(s[j]))) j--; return j >= 0 && VISIVEL.has(s[j]); };
    for (let i = 0; i < s.length; i++) {
      const t = s[i];
      if (typeof t !== 'string') continue; // (iv) já conferido
      if (VISIVEL.has(t)) { if (o[i] !== t) erro(`opção ${t} perdeu o nome: ${o[i]}`); continue; }
      if (COLADA.has(t)) { if (o[i] !== COLADA.get(t)) erro(`${t} saiu como ${o[i]}`); continue; }
      if (ESTRANHO.has(t)) { if (o[i] !== DEF) erro(`${t} devia sair ${DEF} inteiro: ${o[i]}`); continue; }
      const antes = i > 0 ? s[i - 1] : '';
      const a = ativador(i);
      const valorSeguro = antes === '--port' && ativador(i - 1) === null; // valor de opção segura (o primeiro depois dela): copiado, dito na doc
      if (t === 'a b') { if (o[i] !== DEF) erro(`argumento com espaço devia sair ${DEF}: ${o[i]}`); continue; }
      if (t === '--' || COMUM.has(t)) { const esperado = a ? DEF : t; if (o[i] !== esperado) erro(`${t} devia sair ${esperado}: ${o[i]}`); continue; }
      if (SENT.has(t)) { if (a && !valorSeguro && o[i] !== DEF) erro(`${t} depois de ${texto(antes)} saiu: ${o[i]}`); continue; }
      if (temOculto(t) || SOMEM_SEMPRE.has(t)) { if (o[i] !== DEF) erro(`${texto(t)} devia sair ${DEF} (carrega dados ou número livre): ${texto(o[i])}`); continue; } // PLG-42
      if (VAZIOS.has(t)) { const esperado = a ? DEF : t; if (o[i] !== esperado) erro(`${texto(t)} devia sair ${texto(esperado)}: ${texto(o[i])}`); continue; } // PLG-38: com o estado ligado a string vazia é o VALOR (inclusive da opção segura)
      if (t === 'pkg' || t === COMUM_PKG || t === DIGEST_PKG || PACOTES_COMUNS.includes(t)) { const esperado = a && !valorSeguro ? DEF : t; if (o[i] !== esperado) erro(`${texto(t)} devia sair ${texto(esperado)}: ${texto(o[i])}`); continue; }
      if (t === URL_LIMPA || t === ESCOPO_PKG) {
        if (!a) { if (o[i] !== t) erro(`URL limpa sem estado devia ficar intacta: ${o[i]}`); } // (d)
        // opção sensível, de ambiente ou de cabeçalho: o valor some, mesmo sendo URL (de cabeçalho fica só o nome)
        else if (estrita(i)) { if (o[i] === t) erro(`URL limpa depois de opção estrita saiu em claro: ${o[i]}`); }
        else if (o[i] !== t && o[i] !== DEF) erro(`URL limpa saiu como ${o[i]}`);
      }
    }
  };
  const roda = (T, n, independente = false) => {
    const atual = [];
    const anda = () => {
      if (atual.length === n) { sequencias += 1; confere(atual.slice(), independente); return; }
      for (const t of T) { atual.push(t); anda(); atual.pop(); if (falhas.length >= maxFalhas) return; }
    };
    anda();
  };
  let esperadas = 0;
  const partes = [];
  for (const c of cfgs) {
    const de = c.soEste ? c.ate : 1;
    for (let n = de; n <= c.ate; n++) { roda(c.alfabeto, n, c.independente === true); esperadas += c.alfabeto.length ** n; }
    partes.push(`${c.independente ? 'oráculo independente: ' : ''}${c.soEste ? `todas as de ${c.ate} do alfabeto de ${c.alfabeto.length}` : `todas as de 1 a ${c.ate} do alfabeto de ${c.alfabeto.length}`}`);
  }
  if (sequencias !== esperadas && falhas.length === 0) falhas.push(`rodou ${sequencias} de ${esperadas}`);
  return { falhas, sequencias, aviso: `rodou ${sequencias.toLocaleString('pt-BR')} sequências (${partes.join('; ')} tokens)` };
}

// Uso solto: node tests/propriedade-argumentos.mjs <ambiente.mjs>
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const alvo = process.argv[2];
  if (!alvo) { console.error('uso: node propriedade-argumentos.mjs <caminho do ambiente.mjs>'); process.exit(2); }
  const { argumentosDoMcp } = await import(pathToFileURL(alvo).href);
  const r = propriedade(argumentosDoMcp);
  console.log(r.aviso);
  console.log(r.falhas.length ? `FALHOU (${r.falhas.length} primeiras):\n- ${r.falhas.join('\n- ')}` : 'sem falha');
  process.exit(r.falhas.length ? 1 : 0);
}
