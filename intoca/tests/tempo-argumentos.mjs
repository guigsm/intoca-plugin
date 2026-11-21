// Teste de TEMPO do `argumentosDoMcp` (/intoca:ambiente): nenhuma entrada, por mais comprida e repetitiva que seja, pode travar o `registrar`.
// Veio de um quantificador aninhado ambíguo (`(?:[.-]?[0-9]+)*`) que custava ×2 a cada dígito (n=26: segundos; n=40: horas) e que o teste de propriedade não vê (ele afirma o RESULTADO, não o tempo).
// Três partes, e CADA caso mede o próprio tempo DENTRO do processo (`performance.now`), com limite por caso (LIMITE_MS, 1,5 s); ao estourar, o relatório diz O CASO (base, forma, cauda, tamanho, tempo), e não espera o tempo limite do processo:
//  (1) casos nomeados em ESCADA: a mesma entrada (`pkg@rc` e dígitos seguidos de `!`, nas duas formas de `@`) em tamanhos crescentes, de 8 caracteres a 200 mil; para na PRIMEIRA subida que passa do limite. Uma regressão
//      exponencial aparece em poucos segundos, num tamanho pequeno (n=28 já passa de 1,5 s), em vez de travar no tamanho grande;
//  (2) rótulos de versão com comprimento ATÉ o teto (VERSAO_MAX = 135 no código; de 100 a 136 caracteres, e a escada começa pequena): é onde as expressões regulares de versão de fato rodam (acima do teto o código recusa antes de olhar, e o fuzz
//      de 40 mil caracteres da parte (3) nunca chega nelas). `pkg@rc` e dígitos, `pkg@1.2.3-` e segmentos repetidos, `@a/b@` e núcleo, `pkg@1.2.3-rc` e dígitos, e o fuzz de pedaços por todos os começos que terminam em `@`, `-` ou `+`;
//  Um caso que não volta nunca (regressão exponencial) não se mede de dentro do processo: por isso as partes (1) e (2) sobem em ESCADA, de tamanhos pequenos a grandes, e a escada PARA no primeiro passo que estoura o limite, ou na TENDÊNCIA de estourar,
//  dizendo o caso em UMA linha. O tempo limite do processo, no teste que chama este arquivo, é só a rede de segurança. Para não dar falso alarme em máquina ocupada (PLG-42, correção):
//   - cada medida acima de um quarto do limite é REPETIDA (até 3 vezes) e fica a MENOR: um atraso do agendador do sistema pega uma medida, não as três; só o que continua lento em todas reprova;
//   - a TENDÊNCIA só compara passos PRÓXIMOS (o tamanho cresce até 1,3 vez: de 8 a 32 de 2 em 2, 36 e 40), onde o código linear custa quase o mesmo (×1,1) e o exponencial custa ×4; entre 40 e 60, 1000, 40000 e 200000 vale só o limite por caso;
//   - os casos com caractere oculto, comprimentos grandes até 200 mil, estão na escada (e não só no fuzz).
//  (3) um fuzz de tempo com entradas longas (40 mil caracteres) e repetitivas por todos os começos que o código reconhece (opção, atribuição, URL, cabeçalho, `@`, digest, base64...).
// Rodar sozinho: `node tests/tempo-argumentos.mjs [caminho do ambiente.mjs] [tamanho do fuzz]` (sem argumento: o código do pacote; o fuzz padrão é de 40 mil caracteres). Sai com 1 se algum caso passar do limite.
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

export const LIMITE_MS = 1500;
export const VERSAO_MAX = 135; // o teto do código (`VERSAO_MAX` do ambiente.mjs): o maior rótulo é o digest `sha512:` (7 + 128)
const ARROBA_PARECIDA = String.fromCharCode(0xff20); // `＠` (U+FF20)
const ZW = String.fromCharCode(0x200b);
const NUL = String.fromCharCode(0);
const NL = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const BARRA_INVERTIDA = String.fromCharCode(92);

// (1) Casos nomeados, em escada de tamanhos. A base tem `@` normal ou parecido; a cauda é o que esmagava o `*` aninhado, com `n` dígitos, repetições ou letras.
export const ESCADA = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 60, 100, 135, 1000, 40000, 200000]; // sobe de 2 em 2 até 32: uma regressão ×2 por dígito custa ×4 a cada passo
const BASES = [['pkg@rc', 'pkg-rc'], ['@a/b@rc', 'escopo-rc'], ['pkg@1.2.3-rc', 'numerica-rc'], ['pkg@beta', 'tag-beta'], ['pkg@1.2.3-beta.1', 'numerica-beta'], ['pkg@v1', 'v1']];
const CAUDAS = [
  ['dígitos e !', (n) => '1'.repeat(n) + '!'],
  ['.1 repetido e !', (n) => '.1'.repeat(Math.ceil(n / 2)) + '!'],
  ['-1 repetido e !', (n) => '-1'.repeat(Math.ceil(n / 2)) + '!'],
  ['letras', (n) => 'a'.repeat(n)],
];
// Cada família é uma base + uma forma de `@` + uma cauda; `tamanhos` é a escada. `args(n)` monta a entrada de tamanho n.
export function familiasNomeadas() {
  const familias = [];
  for (const [base, nomeBase] of BASES) {
    for (const forma of ['@', ARROBA_PARECIDA]) {
      const b = forma === '@' ? base : base.replace(/@/g, ARROBA_PARECIDA);
      for (const [rotulo, cauda] of CAUDAS) familias.push({ nome: `${nomeBase} ${forma === '@' ? '@' : '＠'} + ${rotulo}`, base: b, forma, cauda: rotulo, args: (n) => [b + cauda(n)], tamanhos: ESCADA });
    }
  }
  familias.push(...familiasComOculto());
  return familias;
}

// PLG-42 (correção): argumentos LONGOS com caractere que carrega dados sem aparecer (largura zero, tag, uso privado, seletor de variação, controle), no começo, no meio, no fim e colado ao nome de uma opção, sozinhos e depois de uma opção
// sensível: o argumento inteiro vira `<definir>` e o código tem de ficar linear até 200 mil caracteres.
const TAG = String.fromCodePoint(0xe0041);
const USO_PRIVADO = String.fromCodePoint(0xe000);
const VS = String.fromCodePoint(0xfe0f);
const FORMAS_COM_OCULTO = [
  ['letras + ZW no fim', (n) => 'a'.repeat(n) + ZW],
  ['ZW no começo + letras', (n) => ZW + 'a'.repeat(n)],
  ['letras, ZW no meio', (n) => 'a'.repeat(n >> 1) + ZW + 'a'.repeat(n - (n >> 1))],
  ['dígitos + tag no fim', (n) => '1'.repeat(n) + TAG + TAG],
  ['pkg@rc + dígitos + uso privado', (n) => 'pkg@rc' + '1'.repeat(n) + USO_PRIVADO],
  ['-p + ZW + dígitos', (n) => '-p' + ZW + '1'.repeat(n)],
  ['--api-key + ZW + letras', (n) => '--api-key' + ZW + 'a'.repeat(n)],
  ['--x= + seletor de variação + letras', (n) => '--x=' + VS + 'a'.repeat(n)],
  ['ZW repetido', (n) => ZW.repeat(n)],
  ['NUL e letras', (n) => ('a' + NUL).repeat(Math.ceil(n / 2)).slice(0, n)],
];
export function familiasComOculto() {
  const familias = [];
  for (const [rotulo, monta] of FORMAS_COM_OCULTO) {
    familias.push({ nome: `oculto ${rotulo}`, base: 'oculto', forma: '@', cauda: rotulo, args: (n) => [monta(n)], tamanhos: ESCADA });
    familias.push({ nome: `oculto ${rotulo}, depois de --api-key`, base: 'oculto', forma: '@', cauda: `${rotulo}, depois de --api-key`, args: (n) => ['--api-key', monta(n)], tamanhos: ESCADA });
  }
  return familias;
}

// (2) Rótulos de versão com comprimento perto do teto: o rótulo (o texto depois do último `@`) tem de 60 a 136 caracteres; com 136 o código recusa antes de olhar, com 135 ou menos as expressões regulares rodam.
export const COMPRIMENTOS_DE_ROTULO = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 60, 100, 110, 120, 128, 130, 132, 134, 135, 136];
const FORMAS_DE_ROTULO = [
  ['rc + dígitos', 'pkg@', (n) => 'rc' + '1'.repeat(n - 2)],
  ['rc + dígitos + !', 'pkg@', (n) => 'rc' + '1'.repeat(n - 3) + '!'],
  ['núcleo com 1 repetido', '@a/b@', (n) => '1.'.repeat(Math.ceil(n / 2)).slice(0, n - 1) + '!'],
  ['núcleo de dígitos + !', '@a/b@', (n) => '1'.repeat(n - 1) + '!'],
  ['1.2.3- + segmentos repetidos', 'pkg@', (n) => ('1.2.3-' + 'rc.1.'.repeat(n)).slice(0, n)],
  ['1.2.3- + segmentos e !', 'pkg@', (n) => ('1.2.3-' + '1.'.repeat(n)).slice(0, n - 1) + '!'],
  ['1.2.3-rc + dígitos', 'pkg@', (n) => '1.2.3-rc' + '1'.repeat(n - 8)],
  ['1.2.3-rc + dígitos + !', 'pkg@', (n) => '1.2.3-rc' + '1'.repeat(n - 9) + '!'],
  ['1.2.3+ + dígitos + !', 'pkg@', (n) => '1.2.3+' + '1'.repeat(n - 7) + '!'],
  ['beta- + dígitos', 'pkg@', (n) => 'beta-' + '1'.repeat(n - 5)],
  ['rc.1 repetido', 'pkg@', (n) => ('rc' + '.1'.repeat(n)).slice(0, n)],
];
const COMECOS_DE_ROTULO = ['pkg@', '@a/b@', 'pkg@1.2.3-', 'pkg@1.2.3+', 'pkg@rc', 'pkg@v', 'pkg@^', 'pkg@sha256:'];
const PEDACOS_DE_ROTULO = ['1', '.1', '-1', '+1', '1.', 'rc', 'a', '=', ARROBA_PARECIDA, ':', ' ', TAB, ZW, 'sha256:'];
const FINS_DE_ROTULO = ['', '!', '=', ' ', '@'];
export function familiasDeRotulo() {
  const familias = [];
  for (const [rotulo, prefixo, corpo] of FORMAS_DE_ROTULO) {
    familias.push({ nome: `rótulo ${rotulo}`, base: prefixo, forma: '@', cauda: rotulo, args: (n) => [prefixo + corpo(n)], tamanhos: COMPRIMENTOS_DE_ROTULO });
  }
  for (const c of COMECOS_DE_ROTULO) {
    for (const p of PEDACOS_DE_ROTULO) {
      for (const f of FINS_DE_ROTULO) {
        familias.push({ nome: `rótulo ${JSON.stringify(c)} + ${JSON.stringify(p)}×n + ${JSON.stringify(f)}`, base: c, forma: '@', cauda: `${JSON.stringify(p)}×n + ${JSON.stringify(f)}`, args: (n) => [c + p.repeat(Math.ceil(n / p.length)).slice(0, Math.max(0, n - f.length)) + f], tamanhos: COMPRIMENTOS_DE_ROTULO });
      }
    }
  }
  return familias;
}

// (3) Fuzz de tempo: começo (por onde o código reconhece uma forma) × pedaço repetido × fim. Cada argumento vai sozinho e também depois de uma opção que espera valor.
const COMECOS = ['', 'pkg@', '@a/b@', '@a/b@1.2.3', 'pkg@1.2.3-', 'pkg@1.2.3+', 'pkg@rc', 'pkg@sha256:', 'a1', 'ZQXWV9', '--x=', '--x', '-k', '-e ', 'NOME=', 'N=', 'Nome: ', 'Nome:', 'token:', 'x:', 'git@h:', '//', '//h.io/', 'http://h.io/', 'https://u:p@h.io/', '[', '{"a":', ' ', '=', '/'];
const PEDACOS = ['1', '1.', '.1', '-1', '+1', 'a', 'rc', '=', '==', '@', ARROBA_PARECIDA, '/', ':', '::', ' ', TAB, ZW, NUL, NL, 'ab', '_', '.', '-', '0x', 'sha256:', '%2F', BARRA_INVERTIDA, '"', "'", '[', '{', '=a', ' =', '= '];
const FINS = ['', '!', '=', ' ', '@', 'x/'];
const PRECEDIDOS = [null, '--api-key', '-e', '--foo'];

export function casosDeFuzz(tamanho = 40000) {
  const casos = [];
  for (const c of COMECOS) {
    for (const p of PEDACOS) {
      const corpo = p.repeat(Math.ceil(tamanho / p.length)).slice(0, tamanho);
      for (const f of FINS) {
        const arg = c + corpo + f;
        casos.push({ nome: `fuzz ${JSON.stringify(c)} + ${JSON.stringify(p)}×n + ${JSON.stringify(f)}`, forma: 'fuzz', tamanho: arg.length, args: [arg] });
      }
    }
  }
  return casos;
}

const agora = () => performance.now();

// Uma medida: o tempo de UMA chamada, dentro do processo. Se passar de `acima`, repete (até REPETICOES vezes no total) e fica a MENOR: o atraso do agendador numa máquina ocupada pega uma medida, quase nunca as três seguidas.
export const REPETICOES = 3;
export const PASSO_PROXIMO = 1.3; // a tendência só compara dois passos cujo tamanho cresceu até esta razão
export function medirMenor(chamada, acima) {
  let melhor = Infinity;
  for (let k = 0; k < REPETICOES; k++) {
    const t0 = agora();
    chamada();
    melhor = Math.min(melhor, agora() - t0);
    if (melhor <= acima) break; // rápido na primeira medida: não repete
  }
  return melhor;
}
// Mede as famílias em escada: cada subida mede o próprio tempo (a menor de até 3 medidas acima de um quarto do limite); a primeira que passa do limite, ou que mostra a TENDÊNCIA de passar entre dois passos PRÓXIMOS (o tamanho cresceu até
// 1,3 vez, o passo ficou acima de um quarto do limite e custou 2,5 vezes mais que o anterior: o próximo custaria mais que o limite), vira UMA linha (base, forma, cauda, tamanho, tempo) e a família para ali.
export function medirEscada(argumentosDoMcp, familias, { limite = LIMITE_MS } = {}) {
  const lentos = [];
  let maior = { ms: 0, nome: '' };
  let total = 0;
  for (const f of familias) {
    let anterior = 0;
    let nAnterior = 0;
    for (const n of f.tamanhos) {
      const args = f.args(n);
      const ms = medirMenor(() => argumentosDoMcp(args, '/sede', '/casa', {}), limite / 4);
      total++;
      if (ms > maior.ms) maior = { ms, nome: `${f.nome}, n=${n}` };
      const base = { nome: f.nome, base: f.base, forma: f.forma === '@' ? '@' : '＠', cauda: f.cauda };
      if (ms > limite) { lentos.push({ ...base, tamanho: n, comprimento: args[0].length, ms: Math.round(ms), tendencia: '' }); break; }
      // tendência: só entre passos próximos; este passo (ms) ficou acima de um quarto do limite e foi mais lento que o anterior pela razão r >= 2,5; o próximo passo custaria ms*r > limite
      const r = anterior > 0 && n / nAnterior <= PASSO_PROXIMO ? ms / anterior : 0;
      if (ms > limite / 4 && r >= 2.5 && ms * r > limite) { lentos.push({ ...base, tamanho: n, comprimento: args[0].length, ms: Math.round(ms), tendencia: `tendência ×${r.toFixed(1)} (de n=${nAnterior}, ${Math.round(anterior)} ms)` }); break; }
      anterior = ms; nAnterior = n;
    }
  }
  return { lentos, maior, total };
}

// Mede os casos planos (fuzz e rótulos). `argumentosDoMcp` é o do código que se quer medir; devolve a lista dos casos acima do limite (vazia: tudo certo) e o total medido.
export function medir(argumentosDoMcp, casos, { limite = LIMITE_MS, precedidos = false } = {}) {
  const lentos = [];
  let maior = { ms: 0, nome: '' };
  let total = 0;
  for (const caso of casos) {
    const entradas = precedidos ? PRECEDIDOS.map((p) => (p === null ? caso.args : [p, ...caso.args])) : [caso.args];
    for (const args of entradas) {
      const ms = medirMenor(() => argumentosDoMcp(args, '/sede', '/casa', {}), limite / 4);
      total++;
      if (ms > maior.ms) maior = { ms, nome: caso.nome };
      if (ms > limite) { lentos.push({ nome: caso.nome, forma: caso.forma, tamanho: caso.tamanho, antes: args.length > 1 ? args[0] : '', ms: Math.round(ms) }); break; }
    }
  }
  return { lentos, maior, total };
}

// A linha de um caso lento: UMA linha só, com o caso (base, forma, cauda), o tamanho e o tempo. O texto do começo (`LENTO base=... forma=... cauda=... tamanho=... tempo=... ms`) é o que o teste que chama este arquivo procura.
export const linhaLenta = (l) => `  LENTO base=${JSON.stringify(l.base)} forma=${l.forma} cauda=${JSON.stringify(l.cauda)} tamanho=${l.tamanho} tempo=${l.ms} ms (limite ${LIMITE_MS} ms)${l.tendencia ? ` ${l.tendencia}` : ''}`;

// Linha de comando.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const alvo = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : new URL('../scripts/ambiente.mjs', import.meta.url).href;
  const tam = Number(process.argv[3]) || 40000;
  const { argumentosDoMcp } = await import(alvo);
  let falhas = 0;
  const nomeados = medirEscada(argumentosDoMcp, familiasNomeadas());
  console.log(`casos nomeados: ${nomeados.total} medidos, maior ${Math.round(nomeados.maior.ms)} ms (${nomeados.maior.nome}), acima de ${LIMITE_MS} ms: ${nomeados.lentos.length}`);
  for (const l of nomeados.lentos.slice(0, 10)) console.log(linhaLenta(l));
  falhas += nomeados.lentos.length;
  const rotulos = medirEscada(argumentosDoMcp, familiasDeRotulo());
  console.log(`rótulos de versão de 10 a ${VERSAO_MAX + 1} caracteres (até o teto de ${VERSAO_MAX}): ${rotulos.total} medidos, maior ${Math.round(rotulos.maior.ms)} ms (${rotulos.maior.nome}), acima de ${LIMITE_MS} ms: ${rotulos.lentos.length}`);
  for (const l of rotulos.lentos.slice(0, 10)) console.log(linhaLenta(l));
  falhas += rotulos.lentos.length;
  const fuzz = medir(argumentosDoMcp, casosDeFuzz(tam), { precedidos: true });
  console.log(`fuzz (${tam} caracteres): ${fuzz.total} medidos, maior ${Math.round(fuzz.maior.ms)} ms (${fuzz.maior.nome}), acima de ${LIMITE_MS} ms: ${fuzz.lentos.length}`);
  for (const l of fuzz.lentos.slice(0, 10)) console.log(`  LENTO caso=${l.nome} antes=${JSON.stringify(l.antes)} tamanho=${l.tamanho} tempo=${l.ms} ms (limite ${LIMITE_MS} ms)`);
  falhas += fuzz.lentos.length;
  process.exit(falhas === 0 ? 0 : 1);
}
