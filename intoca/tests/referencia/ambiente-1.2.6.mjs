// REFERÊNCIA DE TESTE: NÃO É PARA USO. Nada aqui roda no plugin e nenhum script do pacote importa este arquivo; só os testes (o diferencial e a propriedade).
// É a cópia congelada do `argumentosDoMcp` da 1.2.6 (e só do que ele precisa: o resto do script do ambiente foi tirado), para medir o que a versão nova mudou.
// Ela TEM vazamentos conhecidos, corrigidos depois, e por isso não pode ser usada para mascarar nada de verdade: base64 com `==` seguido de espaço ou de quebra de linha; valor só de largura zero ou de controle
// depois de uma opção sensível; `S﹫host` (U+FE6B) e `@escopo/nome@S`; sufixo livre de versão fica fora (a 1.2.6 escondia todo `pacote@versão`, o que a 1.2.7 corrigiu); a forma `S=1` mostra `S` (limite conhecido).
// Só exporta `argumentosDoMcp`. Não tem linha de comando (`node ambiente-1.2.6.mjs registrar` não faz nada), não lê o ambiente do Claude, não grava arquivo, não executa programa e não importa módulo do pacote.
import { resolve, relative, sep } from 'node:path';

const MARCA_DEFINIR = '<definir>'; // no lugar de um valor que a pessoa precisa dar (nunca um segredo copiado)

const MARCA_SEDE = '${SEDE}';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Caminho de máquina em QUALQUER posição do texto, não só no começo: unidade de disco (letra, dois-pontos e barra; não casa "https://"), UNC, file://, raízes de
// Unix e de macOS, variáveis da pasta do usuário (%NOME%, $HOME...) e `~\`. A busca é sempre dentro do texto: `--mount=type=bind,source=...`,
// `FOO=/x/y`, JSON e listas com vírgula também são pegos.
const RAIZES = 'home|Users|Applications|Volumes|private|mnt|Library|nix|opt|usr|var|tmp|etc|root|srv|bin|sbin|lib|lib64|dev|proc|snap|run|media|System';

const CAMINHO_NO_TEXTO = new RegExp([
  '(?<![A-Za-z0-9])[A-Za-z]:[\\\\/]',
  '(?<![\\w\\\\])\\\\\\\\[\\w$]',
  'file:\\/\\/',
  `(?<![\\w.}~-])\\/(?:${RAIZES})\\/`,
  '%[A-Za-z_][A-Za-z0-9_]*%',
  '\\$\\{?(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|HOMEDRIVE)\\b',
  '(?<!\\w)~\\\\',
].join('|'), 'i');

const INICIO_ABSOLUTO = new RegExp(`^(?:[A-Za-z]:[\\\\/]|\\\\\\\\|file:\\/\\/|\\/[^/\\s]+\\/[^/\\s]|\\/(?:${RAIZES})(?:\\/|$))`, 'i');

const caminhoDeMaquina = (v) => typeof v === 'string' && (CAMINHO_NO_TEXTO.test(v) || INICIO_ABSOLUTO.test(v));

const norm = (p) => { const r = resolve(String(p)); return process.platform === 'win32' ? r.toLowerCase() : r; };

const dentro = (pai, alvo) => { const a = norm(alvo); const p = norm(pai); return a === p || a.startsWith(p.endsWith(sep) ? p : p + sep); };


// Caminho absoluto → `.` ou relativo à sede, `~/...` (pasta do usuário) ou null (caminho só desta máquina).
function emFormaPortatil(absoluto, sede, casa) {
  if (sede && dentro(sede, absoluto)) return relative(resolve(sede), resolve(absoluto)).split(sep).join('/') || '.';
  if (casa && dentro(casa, absoluto)) return `~/${relative(resolve(casa), resolve(absoluto)).split(sep).join('/')}`.replace(/\/$/, '');
  return null;
}


// Um valor que é SÓ um caminho: começa como caminho absoluto, não tem outro caminho dentro e não é lista, JSON nem `chave=valor`.
// (Raízes como /home ou /lib podem aparecer DENTRO de um caminho legítimo; só outra unidade, UNC, file:// ou variável torna o valor impuro.)
const OUTRO_CAMINHO = /(?<![A-Za-z0-9])[A-Za-z]:[\\/]|(?<![\w\\])\\\\[\w$]|file:\/\/|%[A-Za-z_][A-Za-z0-9_]*%|\$\{?(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEPATH|HOMEDRIVE)\b/i;

const ehCaminhoPuro = (v) => INICIO_ABSOLUTO.test(v) && !/[{}",;=\u0000-\u001f]/.test(v) && !OUTRO_CAMINHO.test(v.slice(2));


// Um valor que pode ser caminho (argumento solto ou o que vem depois do `=` de uma opção): devolve { valor, ajuste }. Caminho de máquina
// NUNCA sai. Valor que é só um caminho dentro da sede ou da pasta do usuário vira `${SEDE}/...` ou `~/...`; qualquer outro valor que contenha
// um caminho de máquina em qualquer posição (JSON, lista, `a=b,c=<caminho>`) vira `<definir>` inteiro: não se tenta reescrever o texto.
const VARIAVEL_DA_CASA = /^(?:\$HOME|\$\{HOME\}|%USERPROFILE%|%HOMEPATH%)(?=[\\/]|$)/i;

function portatilizar(valor, sede, casa) {
  const v = valor;
  const barras = (t) => t.replace(/\\/g, '/');
  const definir = { valor: MARCA_DEFINIR, ajuste: true };
  if (v === '~' || /^~[\\/]/.test(v)) {
    const resto = v.slice(2);
    return caminhoDeMaquina(resto) || /[{}",;=]/.test(resto) ? definir : { valor: barras(v).replace(/\/$/, '') || '~', ajuste: false };
  }
  if (VARIAVEL_DA_CASA.test(v)) {
    const resto = v.replace(VARIAVEL_DA_CASA, '');
    return caminhoDeMaquina(resto) || /[{}",;=]/.test(resto) ? definir : { valor: barras(`~${resto}`).replace(/\/$/, ''), ajuste: false };
  }
  if (!caminhoDeMaquina(v)) return { valor, ajuste: false };
  if (!ehCaminhoPuro(v)) return definir;
  let caminho = v;
  if (/^file:\/\//i.test(caminho)) {
    caminho = caminho.replace(/^file:\/\//i, '');
    if (/^\/[A-Za-z]:[\\/]/.test(caminho)) caminho = caminho.slice(1);
    if (!INICIO_ABSOLUTO.test(caminho) || /^file:/i.test(caminho)) return definir;
  }
  const p = emFormaPortatil(caminho, sede, casa);
  if (p === null) return definir;
  return { valor: p.startsWith('~') ? p : `${MARCA_SEDE}/${p === '.' ? '' : p}`.replace(/\/$/, ''), ajuste: false };
}


// URL sem usuário, senha, parâmetros, âncora e sem trecho de caminho com cara de chave. Devolve { url, ajuste } (ajuste: algo foi tirado) ou null.
// Limite conhecido: um segredo escondido num pedaço curto do caminho passa; a varredura é a última rede.
function urlSegura(bruto) {
  if (typeof bruto !== 'string' || bruto === '' || bruto.length > 300 || /[\u0000- \u007f]/.test(bruto)) return null; // o parser de URL apaga quebra de linha e tabulação em silêncio: o que roda tem de ser o que está no arquivo
  let u;
  try { u = new URL(bruto); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  let ajuste = Boolean(u.username || u.password || u.search || u.hash);
  const comChave = u.pathname.split('/').some((p) => p.length >= 24 && /[A-Za-z]/.test(p) && /\d/.test(p));
  if (comChave) ajuste = true;
  const caminho = comChave ? '' : u.pathname.replace(/\/+$/, '');
  return { url: `${u.protocol}//${u.host}${caminho}`, ajuste };
}


const NOME_SENSIVEL = /(?:key|token|secret|passw|passwd|senha|chave|segredo|auth|bearer|credencia|credential|cookie|webhook|signature|connection-?string|sessionid|(?:^|[^A-Za-z])(?:pass|pwd)(?:$|[^A-Za-z]))/i;

// PLG-37: formas coladas em minúsculas e comuns de `pat`, `dsn`, `sas` e `jwt` (`--mypat`, `--githubpat`, `--dsnurl`). É uma LISTA: nome colado fora dela (`--zzpat`) NÃO é pego. Não casa `patch`, `passo`, `design`, `compat`.
const PALAVRAS_COLADAS = /(?:^|[^A-Za-z])(?:(?:my|your|our|the|db|gh|git|github|gitlab|az|azure|sentry|app|user|admin|storage|slack|discord|teams|stripe|aws)(?:pat|dsn|sas|jwt)|(?:pat|dsn|sas|jwt)(?:value|val|str|string|url|uri|var|env))(?:$|[^A-Za-z])/i;

// PLG-37: nomes sensíveis por PALAVRA INTEIRA (separada por hífen, ponto, sublinhado, dígito ou fronteira de maiúscula: `--pat`, `--db-dsn`, `--webhookUrl`), para não pegar `--patch`, `--passo`, `--design`.
const PALAVRAS_SENSIVEIS = /(?:^|[^A-Za-z])(?:pat|dsn|sas|jwt|connection-?string|webhook|signature|sig|bearer|api-?key|private|credential|cert|session|cookie|otp|pin|salt)(?:$|[^A-Za-z])/i;

const nomeSensivel = (nome) => NOME_SENSIVEL.test(nome) || PALAVRAS_COLADAS.test(nome) || PALAVRAS_SENSIVEIS.test(nome.replace(/([a-z])([A-Z])/g, '$1-$2'));

const OPCOES_DE_ENV = new Set(['-e', '--env']);

const OPCOES_DE_CABECALHO = new Set(['-H', '--header']);

// Bandeiras conhecidas que NÃO levam valor (lista pequena e fixa; `--no-*` também é bandeira). Qualquer outra opção pode levar um valor.
const BANDEIRAS_SEM_VALOR = new Set(['-y', '-v', '-V', '-q', '-h', '--yes', '--verbose', '--quiet', '--silent', '--debug', '--help', '--version', '--stdio', '--no-install']);

// PLG-38: as letras das bandeiras curtas (`-y`, `-v`...): um argumento só com elas (`-vv`, `-yv`) é um agrupamento de bandeiras sem valor.
const LETRAS_DE_BANDEIRA = new Set([...BANDEIRAS_SEM_VALOR].filter((b) => /^-[^-]$/.test(b)).map((b) => b[1]));

// Opções conhecidas cujo valor não é segredo (lista pequena e fixa). O valor delas ainda passa pelos filtros de estrutura (caminho, atribuição, JSON, URL).
const OPCOES_SEGURAS = new Set(['--transport', '--nome', '--name', '--port', '--porta', '--mode', '--modo', '--type', '--tipo', '--log-level', '--directory', '--dir', '--cwd']);


// `-p` é a opção curta de senha mais comum (`mysql -p`, `-p senha`): estrita por nome, sem adivinhar nada.
const OPCOES_ESTRITAS_CURTAS = new Set(['-p']);

// Nomes COMPLETOS de uma opção com um traço só (`-password abc`): lista fixa. Qualquer outro `-xyz...` é lido como a opção curta `-x` com o valor colado (`-pSEGREDO`).
const NOMES_LONGOS_DE_UM_TRACO = new Set(['-password', '-passwd', '-pass', '-pwd', '-token', '-secret', '-key', '-apikey', '-api-key', '-senha', '-chave']);


// PLG-39: o NOME de uma atribuição `nome=valor` só é mostrado quando tem cara de nome, por estrutura: no máximo NOME_MAX caracteres, só os do formato `formato`, e DEPOIS do primeiro `=` há algo que não é
// só `=` (um valor que termina em `=` ou `==` depois de letras e dígitos é base64 com preenchimento: o argumento INTEIRO é segredo, não um nome). Devolve o nome, ou null (o chamador esconde tudo).
// Falso positivo aceito e dito no texto: nome com mais de NOME_MAX caracteres, ou `NOME=` com o valor vazio, também some por inteiro. Teste linear (indexOf, sem regex com varredura).
const NOME_MAX = 32;

function nomeDaAtribuicao(v, formato) {
  const i = v.indexOf('=');
  if (i < 1 || i > NOME_MAX) return null;
  const nome = v.slice(0, i);
  if (!formato.test(nome)) return null;
  if (/^=*$/.test(v.slice(i + 1))) return null;
  return nome;
}

// Valor de uma variável de ambiente (`NOME=valor`): só o NOME fica. O nome solto (`-e NOME`) também vira `<definir>`: por estrutura é um nome, mas um valor posto ali por engano sairia em claro
// (decisão do proprietário: na dúvida, esconde). Valor de cabeçalho (`Nome: valor`): só o nome do cabeçalho fica.
function soONomeDaVariavel(v, marca) {
  const nome = nomeDaAtribuicao(v, /^[A-Za-z_][A-Za-z0-9_]*$/);
  marca.ajuste = true;
  return nome !== null ? `${nome}=${MARCA_DEFINIR}` : MARCA_DEFINIR;
}

function soONomeDoCabecalho(v, marca) {
  marca.ajuste = true;
  const m = v.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:/);
  return m ? `${m[1]}: ${MARCA_DEFINIR}` : MARCA_DEFINIR;
}


// JSON dentro de um argumento: ficam só as chaves e a forma; todo valor (texto, número, booleano, nulo) vira `<definir>`.
const soAsChaves = (x) => {
  if (Array.isArray(x)) return x.map(soAsChaves);
  if (ehObjeto(x)) return Object.fromEntries(Object.keys(x).map((k) => [k, soAsChaves(x[k])]));
  return MARCA_DEFINIR;
};

const RECURSO_PORTATIL = /^(?:\$\{SEDE\}|~)(?:\/|$)/;

const PACOTE_COM_ESCOPO = /^@[A-Za-z0-9][\w.-]*\/[\w.-]+(?:@[\w.-]+)?$/;


// Um valor solto (argumento sem opção na frente, ou o valor de uma opção). Devolve { texto, claro }: `claro` é "é claramente o nome de um recurso" (caminho
// portátil, pacote com escopo, URL limpa). Por estrutura, nesta ordem: caminho de máquina; JSON (só as chaves); URL (sem usuário, senha, parâmetros e âncora; esquema
// que não é http(s) some); `nome=valor` (só o nome); `Nome: valor` (só o nome); qualquer outro `=` (tudo some).
function tratarValor(v, sede, casa, marca) {
  const definir = { texto: MARCA_DEFINIR, claro: false };
  if (v === MARCA_DEFINIR) return definir;
  const p = portatilizar(v, sede, casa);
  if (p.valor !== v) { if (p.ajuste) marca.ajuste = true; return { texto: p.valor, claro: p.valor !== MARCA_DEFINIR }; }
  if (/^\s*[[{]/.test(v)) {
    marca.ajuste = true;
    try { return { texto: JSON.stringify(soAsChaves(JSON.parse(v))), claro: false }; } catch { return definir; }
  }
  if (v.startsWith('//')) { // PLG-38: URL sem esquema (`//usuario:S@host/db`, também com `＠` de largura total): a mesma limpeza das URLs com esquema; o que não é URL válida some por inteiro
    const u = /[@＠]/.test(v) ? null : urlSegura(`https:${v}`);
    if (!u) { marca.ajuste = true; return definir; }
    const limpa = u.url.replace(/^https:/, '');
    // PLG-39: sem ponto no host (`//SEGREDO`, `//s3cr3t`) não dá para saber se é host ou segredo: some por inteiro (na dúvida, esconde). Só segue o que tem cara de host: com ponto (`//h.io/x`) ou `localhost`.
    const host = limpa.slice(2).split(/[/?#:]/, 1)[0];
    if (!host.includes('.') && host !== 'localhost') { marca.ajuste = true; return definir; }
    if (u.ajuste) { marca.ajuste = true; return { texto: limpa, claro: false }; }
    // PLG-39: nada foi removido: o argumento volta COMO VEIO (a normalização da URL, que põe o host em minúsculas, não pode alterar o texto em silêncio: `//Host.IO/x` não vira `//host.io/x`).
    // Só é "claramente um recurso" quando a forma limpa é idêntica ao original.
    return { texto: v, claro: limpa === v };
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(v)) {
    const u = urlSegura(v);
    if (!u) { marca.ajuste = true; return definir; }
    if (u.ajuste) marca.ajuste = true;
    return { texto: u.url, claro: !u.ajuste };
  }
  const nomeAtrib = nomeDaAtribuicao(v, /^[A-Za-z_][A-Za-z0-9_.-]*$/);
  if (nomeAtrib !== null) { marca.ajuste = true; return { texto: `${nomeAtrib}=${MARCA_DEFINIR}`, claro: false }; }
  if (/^[A-Za-z_][A-Za-z0-9_.-]*=/.test(v)) { marca.ajuste = true; return definir; } // PLG-39: tem forma de atribuição, mas o "nome" é comprido ou o valor é vazio/só `=` (base64 com preenchimento): tudo some
  const cabecalho = v.match(/^([A-Za-z][A-Za-z0-9-]*):\s+\S/);
  if (cabecalho) { marca.ajuste = true; return { texto: `${cabecalho[1]}: ${MARCA_DEFINIR}`, claro: false }; }
  const comDoisPontos = v.match(/^([A-Za-z][\w.-]*):./);
  if (comDoisPontos && nomeSensivel(comDoisPontos[1])) { marca.ajuste = true; return { texto: `${comDoisPontos[1]}:${MARCA_DEFINIR}`, claro: false }; } // `token:valor` solto, com chave sensível
  const doisPontos = v.indexOf(':'); // PLG-39: teste linear (antes era `/:.*[@＠]/s`, quadrático)
  if (doisPontos !== -1 && /[@＠]/.test(v.slice(doisPontos + 1))) { marca.ajuste = true; return definir; } // PLG-38: `usuario:S@host` sem esquema (também com `＠`): um `@` depois de `:` é usuário e senha, tudo some
  // PLG-39: `token＠github.com/org/repo`, `token@host/caminho` e `S@host` soltos (sem `:`): o texto antes do `@`/`＠` pode ser o segredo. Some por inteiro, salvo `git@host:caminho` (SSH do Git) e o pacote com escopo (`@escopo/nome`,
  // que não tem texto antes do `@`). Qualquer `＠` de largura total some; e-mail solto também (na dúvida, esconde). `@nome` sem escopo e sem texto antes segue como palavra solta.
  if (/＠/.test(v) || (v.indexOf('@') > 0 && !PACOTE_COM_ESCOPO.test(v) && !gitSshOk(v))) { marca.ajuste = true; return definir; }
  if (/\s/.test(v) || v.includes('=')) { marca.ajuste = true; return definir; } // palavra solta com espaço (inclusive uma linha de comando inteira) ou com `=` que sobrou: tudo some
  return { texto: v, claro: RECURSO_PORTATIL.test(v) || PACOTE_COM_ESCOPO.test(v) };
}

// Argumentos de servidor MCP (o `command` entra como uma lista de um item). O que o código GARANTE, por estrutura (não por heurística), em qualquer forma da opção
// (`-e NOME=v`, `-eNOME=v`, `-e=NOME=v`, `--env NOME=v`, `--env=NOME=v`; o mesmo para `-H`/`--header`, inclusive colado como `-HNome:v`), e também DEPOIS de um `--`
// (o `--` de um servidor MCP não encerra as opções dele):
//  - é opção todo argumento que começa com `-` (qualquer caractere depois: letra, dígito, `_`, letra não ASCII) ou com `/` (estilo Windows: `/password abc`, `/p:abc`),
//    desde que não seja um caminho de máquina (esse é portatilizado);
//  - depois de `-e`/`--env` só o nome da variável fica (e o nome solto, `-e NOME`, vira `<definir>`); depois de `-H`/`--header` só o nome do cabeçalho;
//  - de qualquer `nome=valor` (maiúsculo, minúsculo ou misto) só o nome fica; JSON só com as chaves; URL sem usuário, senha, parâmetros e âncora; `Nome: valor` só o nome;
//    `chave:valor` solto com chave sensível (`token:x`, `password:x`) só a chave;
//  - o valor de uma opção com nome sensível (`--api-key`, `--token=`, `/password`, `-p`, `-password`) vira `<definir>`;
//
// O desenho é uma MÁQUINA DE ESTADOS, não uma lista de formatos. Cada argumento é uma opção (começa com `-` ou `/`), um `--` ou uma palavra. O estado é "a opção anterior espera um valor"
// (opção sensível, de ambiente, de cabeçalho, segura ou desconhecida; só a bandeira conhecida sem valor, `--no-*` e a opção com valor colado não ligam o estado; `--x=` com `=` vazio liga):
//  - com o estado ligado, o argumento seguinte É o valor, mesmo que pareça opção (`--token --abc`, `-p -abc`, `--foo --bar`), e vira `<definir>`, salvo opção segura conhecida (`--transport`,
//    `--nome`, `--port`...) com valor que não pareça opção, ou valor claramente de recurso (caminho portátil, pacote com escopo, URL limpa): na dúvida, esconde;
//  - EXCEÇÃO, só estes casos: opção sensível (`--token`, `--api-key`, `-p`, `-password`, `/password`), de ambiente (`-e`, `--env`), de cabeçalho (`-H`, `--header`) e a forma `--x=valor`.
//    Continuam sendo opção, com o nome visível, e ligam o estado de novo (`--headless --api-key x`, `--port --token x`);
//  - depois de consumir um argumento com cara de opção como valor, o seguinte também é lido pelo estado (fica escondido), nunca copiado solto;
//  - (PLG-37) com o estado ligado, o `--` e o argumento que não é texto (número, nulo, objeto) também são o VALOR: viram `<definir>` e o estado CONTINUA ligado para o seguinte
//    (`--api-key -- X`, `--token 5 X`). Sem estado ligado, o `--` passa e o não-texto vira `<definir>` sem ligar nada;
//  - (PLG-37) o nome é sensível pelas palavras `key`, `token`, `secret`, `pass`, `senha`, `chave`, `auth`, `cookie`... (dentro do nome) e, por PALAVRA INTEIRA (hífen, ponto, sublinhado, dígito ou fronteira de
//    maiúscula), `pat`, `dsn`, `sas`, `jwt`, `connection-string`, `webhook`, `signature`, `sig`, `bearer`, `api-key`, `private`, `credential`, `cert`, `session`, `cookie`, `otp`, `pin`, `salt`; `--patch`,
//    `--passo` e `--design` não casam. Também por lista: formas coladas em minúsculas e comuns (`--mywebhook`, `--webhookurl`, `--slackwebhook`, `--mypat`, `--githubpat`, `--dsnurl`...). LIMITE: nome colado
//    em minúsculas FORA dessa lista (`--zzpat`, `--xdsn`) NÃO é reconhecido como sensível;
//  - (PLG-37) o NOME de uma opção longa só tem letra (inclusive não ASCII), dígito, `_`, `.` e `-`. Qualquer outro caractere no nome (`--token:ABC`, `--password:x`, `--user:S@host`, `--https://u:p@h/db`) é valor colado: o argumento
//    INTEIRO vira `<definir>` (nome e valor), e o estado fica ligado para o seguinte. `--nome=ok` e `--url=https://h/p` seguem como antes;
//  - (PLG-38) um argumento de UM traço só com mais de uma letra: (a) agrupamento só de bandeiras conhecidas sem valor (`-vv`, `-vvv`, `-yv`) é bandeira e não liga nada; (b) nome inteiro em minúsculas feito SÓ de palavras
//    sensíveis conhecidas, sem letra sobrando (`-accesskey S`, `-apitoken S`, `-passphrase S`, `-accesskey=S`) é nome de opção longa: o nome fica visível, o valor colado e o argumento seguinte viram `<definir>`; (c) qualquer outro (`-vp S`, `-Xmx2g`, `-pSEGREDO`,
//    `-accessKey S`, `-pmysecret=x`, `-ksecretabc=1`) é ambíguo (valor colado à opção curta OU nome longo): sai `-x<definir>` (só as duas primeiras letras ficam; o valor colado some, inclusive o base64 com `=` ou `==` no fim: `-kQWx==` sai `-k<definir>`; só `-Dnome=valor`, com nome de até 32 caracteres e valor depois do `=`, mostra o nome) e o argumento seguinte também é escondido,
//    salvo quando o valor já veio colado (`=` ou `:` no meio com algo depois); terminar em `=` ou `:` (`-vp=`, `-accessKey:`) deixa o valor para o argumento seguinte, que é escondido.
//    Falso positivo aceito: `-Xmx2g` esconde também o argumento depois dele;
//  - (PLG-38) com o estado ligado, a string VAZIA também é o VALOR (`<definir>`) e o estado continua ligado (`--api-key "" S`); sem estado ela fica como está;
//  - (PLG-39) o NOME de um `nome=valor` só aparece quando tem cara de nome: até 32 caracteres, só `[A-Za-z_][A-Za-z0-9_.-]*` e DEPOIS do primeiro `=` há algo que não é só `=`. Valor que termina em `=` ou `==` depois de letras e dígitos
//    (base64 com preenchimento, `QWxh...ZQ==`) some por INTEIRO, nome e valor, em qualquer forma (solto, valor de opção, `-kQWx==`, `-e QWx==`). Falso positivo aceito: nome com mais de 32 caracteres e `NOME=` com valor vazio também somem inteiros;
//  - (PLG-39) com o estado ligado, a string só de espaço em branco (espaço, tabulação, quebra de linha, espaço de largura total) também é o VALOR, como a vazia; sem estado ligado fica como está;
//  - (PLG-39) argumento solto com `＠` (largura total) some; com `@` e texto antes (`token@host/caminho`, `S@host`, e-mail) some, salvo `git@host:caminho` e o pacote com escopo (`@escopo/nome`). `//host.io/x` sem `@` e com ponto no host volta COMO VEIO (a limpeza não pode mudar
//    o texto em silêncio); sem ponto no host (`//SEGREDO`, `//s3cr3t`) some inteiro; depois de uma opção que espera valor só passa a URL limpa e idêntica (limite: um segredo com ponto que começa com `//` não é reconhecido);
//  - (PLG-38) argumento solto que começa com `//` (URL sem esquema) recebe a limpeza das URLs com esquema e, se tem `@` ou `＠` (largura total), some por inteiro; `usuario:S@host` sem esquema (um `@`/`＠` depois de `:`) também some inteiro;
//  - PERDA ACEITA (na dúvida, esconde): uma opção comum ou bandeira logo depois de uma opção que espera valor é lida como o valor dela e perde o nome (`--foo --bar` sai `--foo <definir>`);
//  - cada argumento de entrada dá exatamente um argumento de saída, na mesma posição: nada é removido, só trocado por `<definir>`;
//  - argumento solto com espaço (inclusive o `command` com a linha de comando inteira) vira `<definir>`;
//  - caminho de máquina em qualquer posição é portatilizado quando é só um caminho e vira `<definir>` inteiro nos demais.
// O que NÃO garante, e é copiado: palavra solta que não segue uma opção que espera valor, sem espaço, sem `=` e sem chave sensível (`servidor admin senha123`, `user:pass`, `X-Api:y`); palavra
// solta depois de bandeira conhecida (`-y`, `--stdio`, `--no-*`) ou depois do `--` sem opção; o valor de uma opção segura conhecida (`--port x`, `--nome x`, `--directory x`), por ser da lista de
// opções seguras; o argumento logo depois de QUALQUER opção que espera valor, quando ele mesmo é opção sensível, de ambiente ou de cabeçalho, ou `--x=valor` (`--api-key --token-ABC123`, `--foo --token-ABC123`: ele é lido como nova opção e o NOME dela sai visível; o valor colado de `--x=valor` some, mas um
// segredo posto no próprio nome sai: LIMITE do desenho, conhecido e documentado; é o preço de manter o nome das opções); nome de opção sensível que não está na lista (a lista é de palavras, não de todas as formas possíveis); lista com vírgula sem `=` nem `:`; um trecho de caminho de URL só some quando tem 24 caracteres ou mais, com letra e número (`https://h/hooks/abc123` passa).
// Só a varredura heurística pode pegar esses casos; por isso o `registrar` mostra o que vai ser gravado e a pessoa confere o diff antes do commit.


// PLG-38: nome de opção de um traço feito SÓ de palavras sensíveis conhecidas (`-accesskey`, `-apitoken`, `-secretkey`, `-privatekey`...), sem letra sobrando: o nome pode ser mostrado.
const NOME_CONHECIDO_DE_UM_TRACO = /^-(?:access|api|auth|client|private|secret|session|bearer|refresh|token|key|pass(?:word|wd|phrase)?|pwd|credentials?|cert|pat|dsn|jwt|cookie|signature|webhook|senha|chave|segredo)(?:[-_.]?(?:access|api|auth|client|private|secret|session|bearer|refresh|token|key|pass(?:word|wd|phrase)?|pwd|credentials?|cert|pat|dsn|jwt|cookie|signature|webhook|senha|chave|segredo))*$/;


// Lê um argumento como opção. Devolve null (não é opção), { escondido: true } (parece opção, mas não dá para separar nome e valor) ou { opcao, sep, valor } (`valor` indefinido: sem valor colado).
function lerOpcao(arg) {
  if (arg.startsWith('--')) {
    const m = arg.match(/^(--[^=\s]+)(?:=([\s\S]*))?$/);
    // PLG-37: o NOME de uma opção longa só tem letra (inclusive não ASCII: `--ação`), dígito, `_`, `.` e `-`. Qualquer outro caractere (`:`, `/`, `@`...) é valor colado no nome
    // (`--token:ABC`, `--user:S@h`, `--https://u:p@h/db`): o argumento INTEIRO é escondido (`<definir>`), nome e valor.
    return m && /^--[\p{L}\p{N}_.-]+$/u.test(m[1]) ? { opcao: m[1], sep: '=', valor: m[2] } : { escondido: true };
  }
  if (arg.startsWith('-')) {
    const nomeDoArg = arg.split('=')[0];
    const nomeCompleto = nomeDoArg.toLowerCase();
    const temIgual = arg.includes('=');
    if (NOMES_LONGOS_DE_UM_TRACO.has(nomeCompleto)) { // `-password abc`, `-token=abc`: o nome inteiro, sem valor colado
      return { opcao: arg.slice(0, nomeCompleto.length), sep: temIgual ? '=' : '', valor: temIgual ? arg.slice(nomeCompleto.length + 1) : undefined };
    }
    const c = Array.from(arg);
    if (c.length < 2 || /\s/.test(c[1])) return null;
    const opcao = c[0] + c[1];
    const resto = c.slice(2).join('');
    if (resto === '') return { opcao, sep: '', valor: undefined };
    // PLG-38: agrupamento de bandeiras conhecidas sem valor (`-vv`, `-vvv`, `-yv`): todas as letras são bandeira; não liga o estado.
    if (c.slice(1).every((x) => LETRAS_DE_BANDEIRA.has(x))) return { opcao: arg, sep: '', valor: undefined, repetida: true };
    // PLG-38: um traço só com mais de uma letra cujo nome INTEIRO (antes do `=`) é só letra minúscula e só palavras sensíveis conhecidas, sem sobra (`-accesskey S`, `-apitoken=S`, `-secret-key`): é o NOME
    // de uma opção longa. O nome fica visível; o valor (colado depois do `=` ou o argumento seguinte) some. Com qualquer letra a mais (`-pmysecret`, `-ksecretabc`) o nome pode ser segredo colado: não é mostrado.
    if (/^-[a-z][a-z_.-]+$/.test(nomeDoArg) && NOME_CONHECIDO_DE_UM_TRACO.test(nomeDoArg)) {
      return { opcao: nomeDoArg, sep: temIgual ? '=' : '', valor: temIgual ? arg.slice(nomeDoArg.length + 1) : undefined };
    }
    const sep = resto.startsWith('=') ? '=' : '';
    // PLG-38: qualquer outro `-xyz...` (`-pSEGREDO`, `-Xmx2g`, `-vp`, `-accessKey`) é ambíguo (valor colado à opção curta, ou nome longo de um traço). Ele inteiro vira valor colado (`-x<definir>`) E a opção
    // espera o argumento seguinte, que também fica escondido (na dúvida, esconde; o falso positivo, como `-Xmx2g` e o argumento depois dele, é aceito). Só NÃO espera quando o valor já veio colado: tem `=` ou `:`
    // no meio e algo depois dele. Terminar em `=` ou `:` (`-vp=`, `-accessKey:`, base64 com preenchimento `-kQWx==`) deixa o valor para o argumento seguinte. O que vem depois da segunda letra é valor colado e some
    // (`-x<definir>`); a exceção é `-xnome=valor` (`-Dfoo=bar`: o nome, de até 32 caracteres, fica visível e o valor some); com valor vazio ou só `=` depois do primeiro `=` o argumento some inteiro. Com palavra sensível no nome (`-ksecretabc=1`) o nome também some.
    return { opcao, sep, valor: resto.slice(sep.length), espera: !/[=:]/.test(arg) || /[=:]$/.test(arg), ocultar: temIgual && nomeSensivel(nomeDoArg) };
  }
  if (arg.startsWith('/') && !caminhoDeMaquina(arg)) {
    const m = arg.match(/^(\/[^/\s:=]+)(?:([:=])([\s\S]*))?$/);
    if (m) return { opcao: m[1], sep: m[2] ?? '', valor: m[3] };
  }
  return null;
}


export function argumentosDoMcp(args, sede, casa, marca) {
  const saida = [];
  let pendente = null; // o estado: a opção anterior (ou null), quando o próximo argumento é o valor dela
  const OCULTO = { env: false, cabecalho: false, sensivel: false, seguro: false, estrita: false }; // depois de um argumento com cara de opção usado como valor: o seguinte ainda é lido pelo estado
  const opcaoDe = (nome) => {
    const env = OPCOES_DE_ENV.has(nome);
    const cabecalho = OPCOES_DE_CABECALHO.has(nome);
    const sensivel = nomeSensivel(nome) || OPCOES_ESTRITAS_CURTAS.has(nome);
    return { env, cabecalho, sensivel, seguro: OPCOES_SEGURAS.has(nome), estrita: env || cabecalho || sensivel };
  };
  // Com o estado ligado, só isto ainda é opção (e liga o estado de novo, com o nome visível): sensível, de ambiente ou de cabeçalho, e a forma `--x=valor`. Qualquer outra vira o valor.
  const continuaComoOpcao = (o) => !o.escondido && (opcaoDe(o.opcao).estrita || (o.sep !== '' && o.valor !== undefined && o.valor !== ''));
  const valorDe = (o, valor) => {
    if (o.env) return soONomeDaVariavel(valor, marca);
    if (o.cabecalho) return soONomeDoCabecalho(valor, marca);
    if (o.sensivel) { marca.ajuste = true; return MARCA_DEFINIR; }
    const t = tratarValor(valor, sede, casa, marca);
    if (t.texto !== valor || t.claro || (o.seguro && !/^[-/]/.test(valor))) return t.texto; // valor com cara de opção (`-x`, `/x`) nunca passa só por a opção ser segura
    marca.ajuste = true; // na dúvida, esconde
    return MARCA_DEFINIR;
  };
  for (const arg of args) {
    // Argumento que não é texto (número, nulo, objeto): sempre `<definir>`. Com o estado ligado ele é o VALOR da opção e o estado continua ligado para o seguinte (`--token 5 SEGREDO`).
    // (Opção segura conhecida: o valor dela é um só; o segundo argumento já é lido como OCULTO, que não copia texto solto.)
    if (typeof arg !== 'string') { marca.ajuste = true; saida.push(MARCA_DEFINIR); if (pendente?.seguro) pendente = OCULTO; continue; }
    // O `--` não encerra as opções: o que vem depois é lido do mesmo jeito. Com o estado ligado ele é o VALOR da opção (`--api-key -- SEGREDO`): vira `<definir>` e o estado continua ligado.
    if (arg === '--') {
      if (pendente) { marca.ajuste = true; saida.push(MARCA_DEFINIR); if (pendente.seguro) pendente = OCULTO; continue; }
      saida.push(arg); continue;
    }
    const o = lerOpcao(arg);
    if (!o) { // palavra: é o valor da opção anterior, se houver; senão passa pelos filtros de estrutura
      // PLG-38: com o estado ligado, a string VAZIA é o valor (vira `<definir>`) e o estado continua ligado para o seguinte (como o `--` e o não-texto); sem estado ela fica como está.
      // PLG-39: o mesmo vale para a string só de espaço em branco (espaço, tabulação, quebra de linha, espaço de largura total): `--api-key " " S`.
      if (pendente && /^\s*$/.test(arg)) { marca.ajuste = true; saida.push(MARCA_DEFINIR); if (pendente.seguro) pendente = OCULTO; continue; }
      saida.push(pendente ? valorDe(pendente, arg) : tratarValor(arg, sede, casa, marca).texto);
      pendente = null;
      continue;
    }
    if (pendente && !continuaComoOpcao(o)) { // estado ligado: o argumento seguinte É o valor, mesmo que pareça opção (na dúvida, esconde)
      saida.push(valorDe(pendente, arg));
      pendente = OCULTO; // o que vem depois também é lido pelo estado: nunca sai solto, em claro
      continue;
    }
    if (o.escondido) { marca.ajuste = true; saida.push(MARCA_DEFINIR); pendente = OCULTO; continue; }
    const info = opcaoDe(o.opcao);
    if (o.valor === undefined || o.valor === '') { // sem valor colado (ou `--x=` com `=` vazio): o valor, se houver, é o argumento seguinte
      saida.push(arg);
      const bandeira = o.valor === undefined && (o.repetida === true || BANDEIRAS_SEM_VALOR.has(o.opcao) || o.opcao.startsWith('--no-'));
      pendente = bandeira ? null : info;
      continue;
    }
    if (o.ocultar) marca.ajuste = true;
    saida.push(`${o.opcao}${o.sep}${o.ocultar ? MARCA_DEFINIR : valorDe(info, o.valor)}`);
    pendente = o.espera ? info : null; // PLG-38: `-xyz` ambíguo (valor colado OU nome longo de um traço): o argumento seguinte também é lido como valor
  }
  return saida;
}


const GIT_SSH_RE = /^git@[A-Za-z0-9][A-Za-z0-9.-]{0,99}:[A-Za-z0-9_~][\w.~/-]{0,199}$/; // host e caminho não começam por "-" nem "."; sem ".." no caminho (ver `gitSshOk`)

const gitSshOk = (v) => typeof v === 'string' && GIT_SSH_RE.test(v) && !v.split(':')[1].split('/').includes('..');
