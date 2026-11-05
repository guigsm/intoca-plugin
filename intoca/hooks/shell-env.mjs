// Comandos de shell que leem, copiam, gravam ou apagam o arquivo real de env (PLG-21). Usado só pelo
// pre-ferramenta.mjs. Não grava nada, não roda nada: lê o texto do comando.
//
// Não é fronteira de segurança: nega o que sabe reconhecer. Lê o comando como palavras (aspas respeitadas,
// corpo de heredoc e de here-string ignorado, para que um texto que só cita `cp .env.example .env` passe),
// separa por `; & | &&` e quebra de linha, e nega o segmento em que (a) um redirecionamento (`>`, `>>`, `<`,
// `&>`, `>&`) aponta para um env de segredo, (b) um verbo de leitura, cópia ou escrita aparece junto de uma
// palavra que é env de segredo, (c) um comando que lê o env passa o conteúdo adiante por pipe
// (`Get-Item .env | Get-Content`, `echo .env | xargs cat`), ou (d) a expansão `$(...)` ou crase, dentro de
// aspas duplas ou de heredoc sem aspas, contém um desses casos. Modelos (`.env.example`) nunca contam, nem
// o que só exclui o env (`--exclude=.env`, `-Exclude`, `/XF`, `rg -g '!.env'`, `:!.env`), nem `process.env`.
// `ls .env`, `Test-Path .env`, `git check-ignore .env` e `node --env-file=.env app.js` não leem o conteúdo e
// passam; `node --env-file=.env -e ...` ou `-p` (imprime) é negado. PLG-21b: o nome do env também não conta
// quando é padrão de busca (`grep "Rails.env"`, `rg "runtime.env"`, `jq '.env'`), texto gravado em outro
// arquivo (`Add-Content .gitignore ".env"`) ou `git rm --cached`.
// Resposta de `comandoMexeEmEnv`: `false` (nada a dizer), `'leitura'` (negar), `'limite'` (negar: grande demais
// para conferir) ou `'remocao'` (apagar o env perde a única cópia: o hook pergunta à pessoa, não nega).
// Limites: variável de shell, programa que abre o arquivo por dentro (`python script.py`), expansão de
// chaves que monta o nome (`.{env,x}`), nome curto 8.3 do Windows, busca recursiva que não nomeia o env e
// verbo que não está na lista escapam.
import { ehEnvDeSegredo } from './lib.mjs';

// Leitura: mostra ou transforma o conteúdo. Só estes verbos contam com glob genérico no PowerShell (`gc *`).
const VERBOS_DE_LEITURA = new Set([
  'cat', 'type', 'more', 'less', 'head', 'tail', 'nl', 'tac', 'od', 'xxd', 'hexdump', 'strings', 'base64', 'bat', 'grep',
  'egrep', 'fgrep', 'rg', 'ag', 'findstr', 'awk', 'gawk', 'sed', 'sort', 'uniq', 'cut', 'tr', 'wc', 'diff', 'cmp', 'comm',
  'paste', 'jq', 'rev', 'perl', 'fc', 'certutil', 'source', '.', 'read', 'clip', 'get-content', 'gc', 'select-string', 'sls',
  'import-csv', 'import-clixml', 'format-hex', 'openssl', 'xargs', 'gzip', 'zcat', 'bzip2', 'xz', 'split', 'fold', 'column',
]);
const VERBOS_DE_ENV = new Set([
  ...VERBOS_DE_LEITURA,
  // cópia, escrita, criação, envio e arquivamento
  'cp', 'copy', 'xcopy', 'robocopy', 'mv', 'move', 'ren', 'rename', 'ln', 'install', 'dd', 'tee', 'touch', 'truncate',
  'copy-item', 'cpi', 'move-item', 'mi', 'rename-item', 'rni', 'set-content', 'sc', 'add-content', 'ac', 'out-file',
  'new-item', 'ni', 'clear-content', 'tee-object', 'export-csv', 'export-clixml', 'start-transcript', 'scp', 'rsync',
  'curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod', 'zip', 'tar', '7z', 'compress-archive', 'open',
  'mklink', 'fsutil',
  // métodos de linguagem, depois do último ponto (`fs.readFileSync`, `[IO.File]::ReadAllText`, `Path.read_text`)
  'readfilesync', 'readfile', 'readalltext', 'readalllines', 'readallbytes', 'writefilesync', 'writefile', 'appendfilesync',
  'appendfile', 'copyfilesync', 'copyfile', 'writealltext', 'writeallbytes', 'opentext', 'openread', 'readlines', 'read_text',
  'read_bytes', 'file_get_contents', 'fopen', 'fgets', 'fread', 'parse_ini_file', 'dotenv_values',
]);
// Remoção (PLG-21b): o arquivo real é a única cópia, então o hook pergunta à pessoa em vez de negar.
const VERBOS_DE_REMOCAO = new Set(['rm', 'del', 'erase', 'remove-item', 'ri', 'unlink', 'shred']);
// O `.` só lê quando é o comando (`find . -name`, `zip a.zip . -x ...` usam a pasta atual); `source` lê sempre.
const SO_COMO_COMANDO = new Set(['.']);
// Filtros que só mostram o texto que recebem pelo pipe. Qualquer outro comando depois de um segmento que cita o env (por pipe,
// mesmo com filtros no meio) pode abrir o arquivo; `xargs` tem regra própria, mais abaixo.
const FILTROS_DE_PIPE = new Set([
  'head', 'tail', 'sort', 'uniq', 'wc', 'cut', 'tr', 'nl', 'tee', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag',
  'ls', 'dir', 'echo', 'printf', 'true', 'select-object', 'where-object', 'sort-object', 'measure-object', 'group-object', 'format-table',
  'format-list', 'out-string', 'out-host', 'write-output', 'write-host', 'out-file', 'set-content', 'add-content', 'tee-object',
]);
// `xargs` com um destes só mostra nomes, sem abrir nem alterar o arquivo.
const XARGS_SO_MOSTRA = new Set(['ls', 'dir', 'echo', 'printf', 'stat', 'du', 'basename', 'dirname', 'realpath', 'readlink']);
const XARGS_COM_VALOR = new Set(['-I', '-n', '-L', '-P', '-d', '-E', '-s', '-a']);
// Subcomandos do git que leem ou preparam o conteúdo do arquivo (`git check-ignore`, `status` e `log` sem patch não).
const GIT_QUE_LE_ENV = new Set(['add', 'show', 'diff', 'cat-file', 'blame', 'restore', 'checkout', 'grep', 'archive', 'update-index', 'mv']);
// Opções do `git log` que mostram o conteúdo (patch).
const GIT_LOG_COM_PATCH = /^(?:-p|-u|-c|--cc|-L.*|--patch(?:-with-(?:stat|raw))?|--textconv)$/;
// Palavra que abre outro interpretador: o texto entre aspas passado a ele também é lido (`bash -c "cat .env"`).
const INTERPRETADORES = new Set([
  'bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd', 'eval', 'iex', 'invoke-expression', 'node', 'python', 'python3',
  'ruby', 'perl', 'php', 'xargs', 'start-process', 'env', 'sudo', 'nohup', 'time', 'wsl',
]);
const DO_POWERSHELL = new Set(['pwsh', 'powershell', 'iex', 'invoke-expression', 'start-process']);
const OPCOES_DE_IMPRIMIR = new Set(['-e', '-p', '-pe', '--eval', '--print']);
// Opções de código embutido por interpretador. Com uma delas, qualquer argumento que seja nome de env (fora da
// string) conta: `node -e "..." .env`, `php -r '...' .env`. `node --env-file=.env app.js` não tem código embutido.
const CODIGO_EMBUTIDO = {
  node: ['-e', '-p', '-pe', '--eval', '--print'], python: ['-c'], python3: ['-c'], ruby: ['-e'], perl: ['-e', '-ne', '-pe'],
  php: ['-r'], bash: ['-c'], sh: ['-c'], zsh: ['-c'], dash: ['-c'], pwsh: ['-command', '-c', '-encodedcommand'],
  powershell: ['-command', '-c', '-encodedcommand'], cmd: ['/c', '/k'],
};
// Limites de custo do analisador. Acima deles não dá para conferir, e o texto que cita `env` é negado (PLG-21b).
const LIMITE_TEXTO = 20000;
const LIMITE_PROFUNDIDADE = 3;
const LIMITE_PALAVRA = 1024;

// ---- a palavra é o nome de um env de segredo?
const AMOSTRAS_DE_ENV = ['.env', '.env.local', '.env.production', '.env.crm', 'hospedagem.env', 'x.env', '.envrc'];
const OBJETO_DE_JS = /^(?:process|import\.meta|deno|bun)\.env$/; // `process.env` não é arquivo

// 0 = não é; 2 = nome ou glob que cita env (ou começa com ponto); 1 = glob genérico (`*`, `*nv`) que só o PowerShell
// casa com o `.env`, porque o glob dele alcança arquivo oculto (o do Bash não: `cat *` lá não pega o `.env`).
function globDeEnv(nome, shell) {
  const ps = shell === 'powershell';
  const cita = nome.startsWith('.') || nome.includes('env');
  if (!ps && !cita) return 0;
  const fonte = nome.replace(/\*+/g, '*').replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\[!/g, '[^');
  try {
    const re = new RegExp(`^${fonte}$`);
    // No Bash, o glob só casa nome oculto quando começa com ponto literal.
    const casa = AMOSTRAS_DE_ENV.some((a) => (ps || nome.startsWith('.') || !a.startsWith('.')) && re.test(a));
    return casa ? (cita ? 2 : 1) : 0;
  } catch {
    return 0;
  }
}

// O padrão de exclusão (`.env`, `.env.*`, `*.env`) cobre este nome?
function casaNome(padrao, nome) {
  const p = padrao.toLowerCase().replace(/^!/, '');
  if (!/[*?[\]]/.test(p)) return p === nome;
  try {
    return new RegExp(`^${p.replace(/\*+/g, '*').replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(nome);
  } catch {
    return false;
  }
}

function nomeDeEnv(bruto, shell) {
  const nome = bruto.replace(/[. ]+$/, '');
  if (!nome || /\s/.test(nome)) return 0;
  if (/[*?[\]]/.test(nome)) return globDeEnv(nome, shell);
  if (OBJETO_DE_JS.test(nome)) return 0;
  return ehEnvDeSegredo(nome) ? 2 : 0;
}

// Pega o último pedaço depois de `/ \ : = @` (`rev:.env`, `--arquivo=.env`, `-d @.env`) e, para o fluxo
// alternativo do NTFS (`.env::$DATA`, `.env:Zone`), o pedaço antes dos dois pontos. URL não é arquivo local.
function classeDeEnv(palavra, shell) {
  if (typeof palavra !== 'string' || palavra.includes('://')) return 0;
  const base = palavra.trim().toLowerCase();
  const direto = nomeDeEnv(base.split(/[\\/:=@]/).pop(), shell);
  if (direto || base.length > LIMITE_PALAVRA) return direto; // a regex do fluxo é quadrática: não roda em palavra longa
  const fluxo = /([^\\/:=@\s]+):[:\w$]*$/.exec(base);
  return fluxo ? nomeDeEnv(fluxo[1], shell) : 0;
}
export const palavraDeEnv = (palavra, shell = 'bash') => classeDeEnv(palavra, shell) > 0;

// ---- partir o comando em segmentos
// Expansões que o shell executa dentro de aspas duplas e de heredoc sem aspas: `$(...)` e crase.
function expansoes(texto, shell) {
  const achadas = [];
  // `$(...)` com parênteses aninhados: o texto de dentro volta inteiro (a análise dele acha os de dentro).
  for (let i = texto.indexOf('$('); i >= 0; i = texto.indexOf('$(', i)) {
    let fim = fechaParenteses(texto, i + 1, shell === 'powershell');
    if (fim < 0) fim = fechaSoParenteses(texto, i + 1); // aspa sem par (`it's`): conta só os parênteses
    achadas.push(fim < 0 ? texto.slice(i + 2) : texto.slice(i + 2, fim - 1)); // sem fechar: o resto também é lido
    if (fim < 0) break;
    i = fim;
  }
  if (shell !== 'powershell') achadas.push(...[...texto.matchAll(/`([^`]*)`/g)].map((m) => m[1]));
  return achadas;
}

// Como `fechaParenteses`, mas sem olhar aspas: só conta parênteses. É o plano B quando uma aspa sem par impede a leitura fina.
function fechaSoParenteses(texto, ini) {
  let nivel = 0;
  for (let j = ini; j < texto.length; j += 1) {
    if (texto[j] === '(') nivel += 1;
    else if (texto[j] === ')') { nivel -= 1; if (nivel === 0) return j + 1; }
  }
  return -1;
}

// Índice depois do `)` que fecha o `(` em `texto[ini]`, ou -1 se não fecha (aspa sem par, parêntese que falta).
// Dentro de `$(...)` as aspas se aninham (`"$(cat ".env")"`), então uma aspa dupla lá dentro abre outro texto.
// As duas funções se chamam uma à outra: `ANINHAMENTO_MAXIMO` impede que texto patológico estoure a pilha.
const ANINHAMENTO_MAXIMO = 16;
// Texto patológico (`"$(` repetido) faz as duas tentarem e desistirem muitas vezes; o orçamento de passos corta isso,
// e `comandoMexeEmEnv` trata o estouro como "grande demais para conferir".
const ORCAMENTO_DE_PASSOS = 300000;
let passos = 0;
const gasta = () => { passos += 1; if (passos > ORCAMENTO_DE_PASSOS) throw new Error('orçamento de passos'); };
function fechaParenteses(texto, ini, ps, aninhado = 0) {
  let nivel = 0;
  let j = ini;
  while (j < texto.length) {
    gasta();
    const ch = texto[j];
    if (ch === "'") {
      const f = texto.indexOf("'", j + 1);
      if (f < 0) return -1;
      j = f + 1;
      continue;
    }
    if (ch === '"') {
      const r = lerAspasDuplas(texto, j + 1, ps, aninhado + 1);
      if (!r.fechou) return -1;
      j = r.fim;
      continue;
    }
    if (ch === '(') nivel += 1;
    else if (ch === ')') { nivel -= 1; if (nivel === 0) return j + 1; }
    j += 1;
  }
  return -1;
}

// Lê o texto entre aspas duplas a partir de `ini` (logo depois da abertura). Só `\"` é escape no Bash (no
// PowerShell, também crase+aspa); as outras barras ficam (caminho do Windows, como "proj\.env.local").
function lerAspasDuplas(texto, ini, ps, aninhado = 0) {
  let j = ini;
  let buf = '';
  while (j < texto.length) {
    gasta();
    const ch = texto[j];
    const prox = texto[j + 1];
    if (ch === '"') return { buf, fim: j + 1, fechou: true };
    if ((ch === '\\' || (ps && ch === '`')) && prox === '"') { buf += '"'; j += 2; continue; }
    // `\$` (e crase no PowerShell) não abre expansão: vira uma marca, para o `$(` escapado não ser lido como comando
    if (ch === '\\' && !ps && prox === '\\') { buf += '\\'; j += 2; continue; } // `\\` é uma barra; o `$(` depois dela segue vivo
    if (ps && ch === '`' && prox === '`') { buf += '`'; j += 2; continue; }
    if (((ch === '\\' && !ps) || (ps && ch === '`')) && prox === '$') { buf += '\u0001'; j += 2; continue; }
    if (ch === '\\' && !ps && prox === '`') { buf += '\u0002'; j += 2; continue; }
    if (ch === '$' && prox === '(' && aninhado < ANINHAMENTO_MAXIMO) {
      const fim = fechaParenteses(texto, j + 1, ps, aninhado);
      // Se o `$(` não fecha (apóstrofo no corpo de um heredoc, por exemplo), é lido como texto comum.
      if (fim >= 0) { buf += texto.slice(j, fim); j = fim; continue; }
    }
    buf += ch;
    j += 1;
  }
  return { buf, fim: j, fechou: false };
}

function partir(textoBruto, shell) {
  const ps = shell === 'powershell';
  // Continuação de linha (barra invertida no Bash, crase no PowerShell) une as linhas.
  const texto = textoBruto.replace(ps ? /`\r?\n/g : /\\\r?\n/g, ' ');
  const segmentos = [];
  const extras = []; // textos que o shell executaria por dentro (expansões)
  let seg = { palavras: [], redir: [], aqui: [], bloco: false, pipe: false };
  let pendente = null; // operador de redirecionamento esperando o alvo
  let atual = null;
  let aspas = false;
  const heredocs = [];
  let depoisDeVirgula = false; // a palavra seguinte é item de uma lista (`-Value ".env",".x"`)
  let parenteses = 0; // dentro de `( ... )` ou `$( ... )` as palavras são comando, não texto gravado
  let crase = false; // dentro de crase do Bash o comando alimenta o de fora, como num `$( )`
  const fecha = (pipe = false) => {
    if (seg.palavras.length || seg.redir.length || seg.aqui.length) { seg.pipe = pipe; segmentos.push(seg); }
    // `{ a | b; } | c` e `(a; b) | c`: o pipe depois do grupo sai do último segmento dele
    else if (pipe && segmentos.length) { segmentos[segmentos.length - 1].pipe = true; segmentos[segmentos.length - 1].grupo = true; }
    seg = { palavras: [], redir: [], aqui: [], bloco: false, pipe: false };
    pendente = null;
  };
  const solta = () => {
    if (atual === null) return;
    // here-string: o texto é a entrada do comando, não um argumento; `analisar` decide com o segmento inteiro (interpretador,
    // `read`, pipe adiante), porque o comando pode vir depois do texto (`<<< "cat .env" bash`)
    if (pendente === '<<<') { pendente = null; seg.aqui.push(atual); }
    else if (pendente) { seg.redir.push({ op: pendente, alvo: atual }); pendente = null; } else seg.palavras.push({ v: atual, q: aspas, vg: depoisDeVirgula, pr: parenteses > 0 || crase });
    atual = null;
    aspas = false;
    depoisDeVirgula = false;
  };
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "'" || c === '"') {
      let buf = '';
      let fim;
      if (c === '"') {
        ({ buf, fim } = lerAspasDuplas(texto, i + 1, ps));
        extras.push(...expansoes(buf, shell));
      } else {
        const f = texto.indexOf("'", i + 1);
        fim = f < 0 ? texto.length : f + 1;
        buf = texto.slice(i + 1, f < 0 ? texto.length : f);
      }
      atual = (atual ?? '') + buf;
      aspas = true;
      i = fim;
      continue;
    }
    if (c === '@' && (texto[i + 1] === "'" || texto[i + 1] === '"') && /^\r?\n/.test(texto.slice(i + 2, i + 4))) {
      // here-string do PowerShell: o corpo é texto (o de aspas duplas ainda expande `$(...)`)
      const fim = texto.indexOf(`\n${texto[i + 1]}@`, i + 2);
      if (texto[i + 1] === '"') extras.push(...expansoes(texto.slice(i + 2, fim < 0 ? undefined : fim), shell));
      i = fim < 0 ? texto.length : fim + 3;
      continue;
    }
    if (c === '#' && atual === null) { // comentário até o fim da linha
      const fim = texto.indexOf('\n', i);
      i = fim < 0 ? texto.length : fim;
      continue;
    }
    if (c === '\\' && !ps && i + 1 < texto.length && texto[i + 1] !== '\n') { // escape do Bash: `.\env` é `.env`
      atual = (atual ?? '') + texto[i + 1];
      i += 2;
      continue;
    }
    if (c === '`' && ps && i + 1 < texto.length) { // escape do PowerShell: `` `.env `` é `.env`
      atual = (atual ?? '') + texto[i + 1];
      i += 2;
      continue;
    }
    if (c === ',') { solta(); depoisDeVirgula = true; i += 1; continue; }
    if (c === '{' && texto[i + 1] === '}') { atual = (atual ?? '') + '{}'; i += 2; continue; } // `{}` do xargs e do find é palavra
    if (c === '{') seg.bloco = true; // bloco de script (`Where-Object { ... }`) ou chaves: o filtro de pipe deixa de ser só filtro
    if (c === ' ' || c === '\t' || c === '\r' || c === '{' || c === '}') { solta(); i += 1; continue; }
    if (c === '(' || c === ')') { solta(); parenteses = Math.max(0, parenteses + (c === '(' ? 1 : -1)); i += 1; continue; }
    if (c === '\n') {
      solta();
      fecha();
      i += 1;
      // corpo de heredoc: pula até a linha do delimitador
      while (heredocs.length) {
        const { delim, tabs, expande } = heredocs.shift();
        let fim = i;
        const inicioDoCorpo = i;
        let fimDoCorpo = texto.length;
        while (fim < texto.length) {
          const quebra = texto.indexOf('\n', fim);
          const linha = texto.slice(fim, quebra < 0 ? texto.length : quebra).replace(/\r$/, '');
          const proximo = quebra < 0 ? texto.length : quebra + 1;
          if ((tabs ? linha.replace(/^\t+/, '') : linha) === delim) { fimDoCorpo = fim; fim = proximo; break; }
          fim = proximo;
        }
        if (expande) extras.push(...expansoes(texto.slice(inicioDoCorpo, fimDoCorpo), shell));
        i = fim;
      }
      continue;
    }
    if (c === '|') {
      solta();
      if (texto[i + 1] === '|') { fecha(); i += 2; } else { fecha(true); i += 1; }
      continue;
    }
    if (c === '&' && texto[i + 1] === '>') { // `&>` e `&>>`: redireciona a saída e o erro para o arquivo
      solta();
      const op = texto.startsWith('&>>', i) ? '&>>' : '&>';
      i += op.length;
      pendente = op;
      continue;
    }
    if (c === ';' || c === '&' || (c === '`' && !ps)) {
      solta();
      fecha();
      if (c === '`') crase = !crase;
      i += c === '&' && texto[i + 1] === '&' ? 2 : 1;
      continue;
    }
    if (c === '<' || c === '>') {
      solta();
      if (c === '<' && texto[i + 1] === '<' && texto[i + 2] !== '<') {
        const m = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>]+))/.exec(texto.slice(i));
        if (m) {
          heredocs.push({ delim: m[2] ?? m[3] ?? m[4], tabs: m[1] === '-', expande: m[4] !== undefined });
          i += m[0].length;
          continue;
        }
      }
      if (texto.startsWith('<<<', i)) { i += 3; pendente = '<<<'; continue; } // a palavra seguinte é texto de entrada
      const op = texto.startsWith('>>', i) || texto.startsWith('>|', i) ? texto.slice(i, i + 2) : c;
      i += op.length;
      if (c === '>' && texto[i] === '&') { // `>&2` duplica descritor; `>&arquivo` grava no arquivo
        i += 1;
        pendente = /[\d-]/.test(texto[i] ?? '') ? null : op;
      } else {
        if (texto[i] === '(') seg.bloco = true; // `>(cmd)` e `<(cmd)`: substituição de processo, o comando de dentro vira palavra deste segmento
        pendente = texto[i] === '(' ? null : op;
      }
      continue;
    }
    atual = (atual ?? '') + c;
    i += 1;
  }
  solta();
  fecha();
  return { segmentos, extras };
}

// O verbo da palavra: nome do programa sem pasta nem extensão (`/bin/cat`, `cat.exe`), ou o método depois do
// último ponto (`fs.readFileSync`, `[IO.File]::ReadAllText`).
function verbosDe(valor) {
  const v = valor.toLowerCase().replace(/^.*[\\/]/, '').replace(/\.(?:exe|cmd|bat|com)$/, '');
  if (v === '.') return ['.'];
  const depois = v.slice(Math.max(v.lastIndexOf('::'), v.lastIndexOf('.')) + 1).replace(/^:+/, '');
  return depois === v ? [v] : [v, depois];
}

// ---- palavras que citam o nome do env mas não o leem

// Último índice da lista com vírgula que começa em `j` (`-Exclude .env,.env.*`: as palavras depois de vírgula são do mesmo valor).
const fimDaLista = (palavras, j) => { let f = j; while (palavras[f + 1]?.vg) f += 1; return f; };

// A palavra `k` é o comando do segmento? Só conta se tudo antes dela é prefixo (`git grep`, `xargs grep`, `sudo grep`, opção,
// atribuição): `cat jq .env` não tem comando `jq`, e a regra de padrão de busca não pode esconder o `.env`.
const PREFIXOS_DE_COMANDO = new Set(['git', 'xargs', 'sudo', 'env', 'time', 'nohup', 'command', 'builtin', 'exec', 'wsl', 'nice', 'ionice', 'stdbuf', 'then', 'do', 'else', 'if', 'while', '!']);
const ehComando = (k, valores, verbos) => valores.slice(0, k).every((v, j) => v.startsWith('-') || /^\w+=/.test(v)
  || verbos[j].some((x) => PREFIXOS_DE_COMANDO.has(x)));

// Posições das palavras que só EXCLUEM o env (`--exclude=.env`, `-x .env` no zip, `rg -g '!.env'`, `:!.env`,
// `-Exclude .env,.env.*`, `/XF .env`).
function exclusoes(palavras, verbos) {
  const fora = new Set();
  const valores = palavras.map((p) => p.v);
  const tem = (...nomes) => verbos.some((vs) => vs.some((x) => nomes.includes(x)));
  const faixa = (de, ate) => { for (let j = de; j <= ate && j < valores.length; j += 1) fora.add(j); };
  const listaAte = (k, ehOpcao) => { let j = k + 1; while (j < valores.length && !ehOpcao(valores[j])) j += 1; faixa(k + 1, j - 1); };
  valores.forEach((v, k) => {
    const minusculo = v.toLowerCase();
    // `--exclude=.env`, `--exclude .env`, `--ignore ...`; não `--ignore-case` nem `--exclude-from`
    if (/^--(?:exclude(?:-dir)?|ignore(?:-file)?)(?:=|$)/.test(v) || /^!|^:[!(]/.test(v)) {
      fora.add(k);
      if (!v.includes('=') && v.startsWith('--')) fora.add(k + 1);
    }
    if (minusculo === '-exclude') faixa(k + 1, fimDaLista(palavras, k + 1)); // `-Exclude` leva um valor (ou a lista com vírgula)
    if (v === '-x' && tem('zip', '7z')) listaAte(k, (w) => w.startsWith('-'));
    if ((minusculo === '/xf' || minusculo === '/xd') && tem('robocopy')) listaAte(k, (w) => /^\/[a-z]+$/i.test(w));
    if ((v === '-g' || v === '--glob' || v === '--iglob') && tem('rg', 'ag')) fora.add(k + 1);
    if (v === '-e' && tem('git') && tem('clean')) fora.add(k + 1); // `git clean -e .env` exclui (`git blame -e` não)
    if ((/^-x[^\w]/.test(v) || /^-x[rv]*!/.test(v)) && tem('zip', '7z')) fora.add(k);
  });
  return fora;
}

// Opções que levam um valor, por programa de busca. O que não está aqui é opção sem valor (`grep -E`, `-G`, `-T` são
// sem valor; `rg -E` é com valor): errar para o lado do "sem valor" só deixa o valor virar padrão, nunca esconde um arquivo.
const GREP_COM_VALOR = new Set([
  '-m', '-A', '-B', '-C', '-d', '-D', '--max-count', '--after-context', '--before-context', '--context', '--include', '--exclude',
  '--exclude-dir', '--label', '--binary-files', '--devices', '--directories',
]);
const RG_COM_VALOR = new Set([
  '-g', '-t', '-T', '-j', '-M', '-E', '-m', '-A', '-B', '-C', '--glob', '--iglob', '--type', '--type-not', '--threads', '--max-columns',
  '--max-depth', '--max-filesize', '--encoding', '--sort', '--sortr', '--max-count', '--after-context', '--before-context', '--context',
  '--ignore-file', '--path-separator', '--context-separator',
]);
const AG_COM_VALOR = new Set(['-G', '-g', '-m', '-A', '-B', '-C', '-p', '--depth', '--ignore', '--path-to-ignore', '--max-count']);
// Select-String: parâmetros que levam valor e os que não levam. Parâmetro desconhecido (abreviado, `-Lit`) pode levar
// valor, então nada é isentado como padrão.
const SLS_COM_VALOR_RE = /^-(?:path|literalpath|lit\w*|context|encoding|include|exclude|inputobject|input\w*)$/;
const SLS_SEM_VALOR_RE = /^-(?:casesensitive|simplematch|notmatch|allmatches|quiet|list|raw|nomatchinfo|culture)$/;
const SLS_PATTERN = /^-pat(?:t(?:e(?:r(?:n)?)?)?)?$/;
const JQ_COM_VALOR = new Set(['--indent']);
const JQ_COM_DOIS_VALORES = new Set(['--arg', '--argjson', '--slurpfile', '--rawfile']);

// Posições das palavras que são PADRÃO de busca, não arquivo: o primeiro argumento posicional de
// `grep/rg/ag/findstr/Select-String/jq` (ou o valor de `-e`, `-Pattern`, `/C:`). Só os arquivos que vêm depois contam.
// Se o padrão vem por opção em qualquer lugar (`Select-String .env -Pattern KEY`), nenhum posicional é padrão.
// O programa é a palavra inteira (`filter.jq` não é o `jq`).
function padroes(palavras, verbos) {
  const fora = new Set();
  const valores = palavras.map((p) => p.v);
  verbos.forEach((vs, k) => {
    const nome = vs[0];
    // Dentro de `$(...)` ou `( ... )` o comando alimenta outro (`cat $(ls | grep '^\.env')`): o nome não é isentado.
    if (!ehComando(k, valores, verbos) || palavras[k].pr) return;
    const grep = ['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack'].includes(nome) ? nome : null;
    const tipo = grep ? 'grep' : ['select-string', 'sls'].includes(nome) ? 'sls' : nome === 'findstr' ? 'findstr' : nome === 'jq' ? 'jq' : null;
    if (!tipo) return;
    if (tipo === 'sls' && valores.slice(k + 1).some((v) => v.startsWith('-') && v.length > 1
      && !(SLS_COM_VALOR_RE.test(v.toLowerCase()) || SLS_SEM_VALOR_RE.test(v.toLowerCase()) || SLS_PATTERN.test(v.toLowerCase())))) return;
    const comValor = grep === 'rg' ? RG_COM_VALOR : grep === 'ag' || grep === 'ack' ? AG_COM_VALOR : GREP_COM_VALOR;
    const explicita = (v) => {
      const l = v.toLowerCase();
      if (tipo === 'grep') return v === '--regexp' || /^--regexp=/.test(v) || /^-[a-zA-Z]*[ef]/.test(v) || v === '--file' || /^--file=/.test(v);
      if (tipo === 'sls') return SLS_PATTERN.test(l);
      if (tipo === 'findstr') return l.startsWith('/c:') || l.startsWith('/g:');
      return v === '-f' || v === '--from-file';
    };
    let temPadrao = valores.slice(k + 1).some(explicita); // o padrão veio por opção: nenhum posicional é padrão
    let soPosicional = false; // depois de `--`
    for (let i = k + 1; i < valores.length; i += 1) {
      const v = valores[i];
      if (!soPosicional && v === '--') { soPosicional = true; continue; }
      const opcao = !soPosicional && (tipo === 'findstr' ? /^\/[a-z](?::.*)?$/i.test(v) : v.startsWith('-') && v.length > 1);
      if (!opcao) {
        if (!temPadrao) { fora.add(i); temPadrao = true; }
        continue;
      }
      const l = v.toLowerCase();
      if (tipo === 'grep') {
        if (/^--regexp=/.test(v)) fora.add(i);
        else if (v === '--regexp' || /^-[a-zA-Z]*e$/.test(v)) { fora.add(i + 1); i += 1; } else if (comValor.has(v)) i += 1;
        // `-f arquivo`: o arquivo de padrões é lido, então segue contando como arquivo
      } else if (tipo === 'sls') {
        // o valor da opção pode ser uma lista com vírgula (`-Path README.md,.env`)
        if (SLS_PATTERN.test(l)) { const f = fimDaLista(palavras, i + 1); for (let j = i + 1; j <= f; j += 1) fora.add(j); i = f; } else if (SLS_COM_VALOR_RE.test(l)) i = fimDaLista(palavras, i + 1);
      } else if (tipo === 'findstr') {
        if (l.startsWith('/c:')) fora.add(i);
      } else if (v === '-f' || v === '--from-file') i += 1;
      else if (JQ_COM_DOIS_VALORES.has(v)) i += 2;
      else if (JQ_COM_VALOR.has(v)) i += 1;
    }
  });
  return fora;
}

// Verbos que gravam texto: `Add-Content .gitignore ".env"` põe o texto `.env` em outro arquivo; o alvo é o primeiro
// argumento (ou `-Path`), o resto (`-Value`, o segundo posicional) é texto. `-Value` leva uma palavra, mais as da
// lista com vírgula (`-Value ".env",".x"`); a palavra seguinte sem vírgula é o alvo (`Add-Content -Value x .env`).
// Palavra dentro de parênteses (`Set-Content o.txt (Get-Content .env)`) é comando, não texto: continua contando.
const GRAVAM_TEXTO = new Set(['add-content', 'ac', 'set-content', 'sc']);
// Parâmetros que levam valor e parâmetros sem valor, que o analisador conhece. Parâmetro desconhecido (inclusive abreviado,
// `-Enc`, `-EA`) pode levar valor: então não dá para saber qual palavra é o caminho, e nada é tratado como texto.
const GRAVA_COM_VALOR = /^-(?:encoding|stream|include|exclude|filter|credential|delimiter|width|erroraction|ea|errorvariable|ev|warningaction|wa|outvariable|ov|informationaction|ia)$/;
const GRAVA_SEM_VALOR = /^-(?:force|nonewline|passthru|whatif|confirm|usetransaction|asbytestream|verbose|vb|debug|db)$/;
const OPCAO_DE_CAMINHO = /^-(?:path|pa|pat|literalpath|lit\w*)$/;
const OPCAO_DE_VALOR = /^-v(?:a(?:l(?:u(?:e)?)?)?)?$/;
function textosGravados(palavras, verbos) {
  const fora = new Set();
  const valores = palavras.map((p) => p.v);
  const texto = (j) => { if (!palavras[j].pr) fora.add(j); };
  verbos.forEach((vs, k) => {
    if (!GRAVAM_TEXTO.has(vs[0]) || !ehComando(k, valores, verbos)) return;
    const minusculos = valores.map((v) => v.toLowerCase());
    const opcoes = minusculos.slice(k + 1).filter((l) => l.startsWith('-') && l.length > 1);
    if (opcoes.some((l) => !(OPCAO_DE_CAMINHO.test(l) || OPCAO_DE_VALOR.test(l) || GRAVA_COM_VALOR.test(l) || GRAVA_SEM_VALOR.test(l)))) return;
    const caminhoNomeado = opcoes.some((l) => OPCAO_DE_CAMINHO.test(l));
    let posicao = -1; // `-Path a,b` e `a,b` são o mesmo argumento posicional
    for (let i = k + 1; i < valores.length; i += 1) {
      const l = minusculos[i];
      if (l.startsWith('-') && l.length > 1) {
        if (OPCAO_DE_VALOR.test(l)) {
          const f = i + 1 < valores.length ? fimDaLista(palavras, i + 1) : i;
          for (let j = i + 1; j <= f; j += 1) texto(j);
          i = f;
        } else if (OPCAO_DE_CAMINHO.test(l) || GRAVA_COM_VALOR.test(l)) i = i + 1 < valores.length ? fimDaLista(palavras, i + 1) : i;
        continue;
      }
      if (!palavras[i].vg || posicao < 0) posicao += 1;
      if (caminhoNomeado || posicao > 0) texto(i);
    }
  });
  return fora;
}

// Interpretador com código embutido (`node -e "..." .env`): o nome do env fora da string conta, menos o
// que só carrega o arquivo (`--env-file=.env`). As opções valem até o nome do script (`node server.js -p 3000` é do script).
// Devolve as posições das palavras que são o próprio código (a que vem logo depois da opção), ou null se não há código embutido.
const ARQUIVO_DE_SCRIPT = /\.(?:[cm]?js|py|rb|php|pl|ps1|sh)$/i;
function codigoEmbutido(valores, verbos) {
  const codigo = new Set();
  let achou = false;
  verbos.forEach((vs, kv) => {
    const opcoes = CODIGO_EMBUTIDO[vs[0]];
    if (!opcoes) return;
    for (let k = kv + 1; k < valores.length && !ARQUIVO_DE_SCRIPT.test(valores[k]); k += 1) {
      if (opcoes.includes(valores[k].toLowerCase())) { achou = true; codigo.add(k + 1); }
    }
  });
  return achou ? codigo : null;
}

// `git rm`, `git clean`: remoção. `git log -p`, `git hash-object -w`: mostram ou copiam o conteúdo.
function analisaGit(valores, classes) {
  // Só o nome que cita env conta (classe 2): o `git add *` do PowerShell chega ao git sem expandir, e o git ignora o `.env`.
  if (!classes.some((c) => c === 2)) return false;
  const pos = valores.findIndex((v, k) => k > 0 && !v.startsWith('-') && !['-c', '-C'].includes(valores[k - 1]));
  if (pos < 0) return false;
  const sub = valores[pos];
  const opcoes = valores.slice(pos + 1); // as opções do subcomando (o `-c` antes dele é do git)
  if (sub === 'restore') {
    // `git restore --staged .env` só mexe no índice
    return opcoes.some((v) => v === '--staged' || v === '-S') && !opcoes.some((v) => v === '--worktree' || v === '-W') ? false : 'leitura';
  }
  if (GIT_QUE_LE_ENV.has(sub)) return 'leitura';
  if (sub === 'log' && opcoes.some((v) => GIT_LOG_COM_PATCH.test(v))) return 'leitura';
  if (sub === 'hash-object' && opcoes.includes('-w')) return 'leitura';
  if (sub === 'clean') return 'remocao';
  // `git rm --cached .env` só tira o arquivo do índice (é a correção de um .env versionado por engano); sem
  // `--cached` o arquivo some do disco.
  if (sub === 'rm') return opcoes.some((v) => /^--cache(?:d)?$/.test(v)) ? false : 'remocao';
  return false;
}

// `xargs <cmd>`: age sobre os nomes que recebe, salvo comando que só os mostra (`xargs ls -l`, `xargs -I{} echo {}`).
function xargsAgeSobreArquivo(valores, verbos, x) {
  let k = x + 1;
  while (k < valores.length && valores[k].startsWith('-')) k += XARGS_COM_VALOR.has(valores[k]) ? 2 : 1;
  return k < valores.length && !XARGS_SO_MOSTRA.has(verbos[k][0]);
}

export function comandoMexeEmEnv(texto, shell = 'bash') {
  if (typeof texto !== 'string') return false;
  const achados = new Set();
  passos = 0;
  try {
    analisar(texto, shell, 0, achados);
  } catch {
    // Orçamento de passos estourado ou erro inesperado (pilha, regex): não libera às cegas o que cita env.
    return /env/i.test(texto) ? 'limite' : false;
  }
  if (achados.has('leitura')) return 'leitura';
  if (achados.has('limite')) return 'limite';
  return achados.has('remocao') ? 'remocao' : false;
}

// Devolve true quando achou leitura (não precisa olhar o resto); `achados` junta o que achou.
function analisar(texto, shell, profundidade, achados) {
  if (texto.length > LIMITE_TEXTO || profundidade > LIMITE_PROFUNDIDADE) {
    if (/env/i.test(texto)) achados.add('limite');
    return false;
  }
  const leu = () => { achados.add('leitura'); return true; };
  const { segmentos, extras } = partir(texto, shell);
  if (extras.some((e) => analisar(e, shell, profundidade + 1, achados))) return true;
  let anterior = null;
  let citouAntes = false; // algum segmento anterior deste texto citou o env (para o pipe depois de um grupo)
  for (const seg of segmentos) {
    const prev = anterior;
    anterior = seg;
    if (seg.redir.some((r) => palavraDeEnv(r.alvo, shell))) return leu();
    const valores = seg.palavras.map((p) => p.v);
    if (seg.palavras.some((p) => p.v.length > LIMITE_PALAVRA && !(p.q && /\s/.test(p.v)) && /env/i.test(p.v))) achados.add('limite');
    const verbos = valores.map((v, k) => (seg.palavras[k].q && /\s/.test(v) ? [] : verbosDe(v)));
    const excluidas = exclusoes(seg.palavras, verbos);
    const fora = new Set([...excluidas, ...padroes(seg.palavras, verbos), ...textosGravados(seg.palavras, verbos)]);
    // Se as exclusões cobrem todos os nomes de env, o glob genérico (`*`) não conta contra eles
    // (`Get-Content * -Exclude .env,.env.*,*.env,.envrc`); exclusão parcial não basta.
    const excluiTudo = excluidas.size > 0 && AMOSTRAS_DE_ENV.every((a) => [...excluidas].some((j) => casaNome(valores[j] ?? '', a)));
    const classes = valores.map((v, k) => {
      if (fora.has(k)) return 0;
      const c = classeDeEnv(v, shell);
      return excluiTudo && c === 1 ? 0 : c;
    });
    // O que sai deste segmento cita o env mesmo quando o nome é só padrão de busca (`ls -a | grep '^\.env' | xargs cat`),
    // e o que o segmento anterior do pipe citava continua valendo (`... | sort | xargs cat`, `{ a; b; } | xargs cat`).
    const textoAqui = seg.aqui.some((t) => classeDeEnv(t, shell) > 0);
    const proprio = valores.some((v, k) => !excluidas.has(k) && classeDeEnv(v, shell) > 0) || textoAqui;
    const veioDoPipe = Boolean(prev?.pipe && (prev.temEnv || (prev.grupo && citouAntes)));
    seg.temEnv = proprio || veioDoPipe;
    citouAntes = citouAntes || proprio;
    // Comando do segmento (a primeira palavra que não é opção, atribuição nem prefixo), para as regras de pipe.
    const c0 = valores.findIndex((v, j) => !(v.startsWith('-') || /^\w+=/.test(v) || verbos[j].some((x) => PREFIXOS_DE_COMANDO.has(x) && x !== 'xargs')));
    if (seg.aqui.length) { // `bash <<< "cat .env"`: o interpretador executa a entrada; `read f <<< ".env"` guarda o nome
      const interno = verbos.some((vs) => DO_POWERSHELL.has(vs[0])) ? 'powershell' : shell;
      if (verbos.some((vs) => INTERPRETADORES.has(vs[0])) && seg.aqui.some((t) => analisar(t, interno, profundidade + 1, achados))) return true;
      if (textoAqui && verbos.some((vs) => ['read', 'mapfile', 'readarray'].includes(vs[0]))) return leu();
      if (textoAqui && c0 >= 0 && verbos[c0][0] === 'xargs' && xargsAgeSobreArquivo(valores, verbos, c0)) return leu(); // `xargs cat <<< ".env"`
    }
    const ehGit = verbos[0]?.includes('git');
    if (!ehGit) {
      const nForte = classes.filter((c) => c === 2).length;
      const nFraca = classes.filter((c) => c === 1).length;
      for (let k = 0; k < verbos.length; k += 1) {
        const vs = verbos[k];
        const forte = nForte - (classes[k] === 2 ? 1 : 0) > 0;
        const fraca = nFraca - (classes[k] === 1 ? 1 : 0) > 0;
        if (!forte && !fraca) continue;
        // O `.` só lê o arquivo que vem logo depois (`. .env`, `. ${HOME}/.env`, `$(. .env)`); o de `find . -name ".env*"` é a pasta atual.
        const leArquivoSeguinte = classes[k + 1] > 0 || (valores[k + 1] === '$' && classes.slice(k + 2).some((c) => c > 0))
          || ehComando(k, valores, verbos); // `. -- .env`, `. ./lib.sh .env`
        const verbo = (conjunto) => vs.some((x) => conjunto.has(x) && (!SO_COMO_COMANDO.has(x) || leArquivoSeguinte));
        // Glob genérico em remoção só pergunta quando não tem pasta (`Remove-Item *`); `Remove-Item dist\*` é limpeza comum.
        const fracaSemPasta = classes.some((c, j) => c === 1 && j !== k && !/[\\/]/.test(valores[j]));
        if (forte && verbo(VERBOS_DE_ENV)) return leu();
        if (fraca && verbo(VERBOS_DE_LEITURA)) return leu(); // glob genérico só vale para leitura
        if ((forte || fracaSemPasta) && verbo(VERBOS_DE_REMOCAO)) achados.add('remocao');
      }
    } else {
      const achou = analisaGit(valores, classes);
      if (achou === 'leitura') return leu();
      if (achou) achados.add(achou);
    }
    // `find ... -exec cmd {} \;`, `-fprint` e `-delete`: o `.` de `find .` não lê, mas o que o `-exec` roda sobre o env, sim.
    // O `find` pode vir depois de prefixo (`sudo find`), e vale cada `-exec`, não só o primeiro.
    if (classes.some((c) => c > 0) && verbos.some((vs, j) => vs[0] === 'find' && ehComando(j, valores, verbos))) {
      if (valores.some((v, j) => /^-(?:exec|execdir|ok|okdir)$/.test(v) && !XARGS_SO_MOSTRA.has(verbos[j + 1]?.[0]))) return leu();
      if (valores.some((v) => /^-(?:fprint0?|fls|fprintf)$/.test(v))) return leu();
      if (valores.includes('-delete')) achados.add('remocao');
    }
    // O que vem de um segmento que cita o env por pipe só passa por um filtro que mostra texto (`| head`, `| sort`, `| xargs ls -l`);
    // qualquer outro consumidor (`| xargs cat`, `| while read f`, `| Select-String`, `| Compress-Archive`) pode abrir o arquivo.
    // Filtro com bloco de script ou substituição de processo (`| Where-Object { ... }`, `| tee >(cmd)`) deixa de ser só filtro.
    if (veioDoPipe && c0 >= 0) {
      if (verbos[c0][0] === 'xargs') { if (xargsAgeSobreArquivo(valores, verbos, c0)) return leu(); } else if (seg.bloco || !FILTROS_DE_PIPE.has(verbos[c0][0])) return leu();
    }
    // `for /f ... in (.env) do ...`, `for f in .env; do ...`
    if (['for', 'foreach'].includes(valores[0]?.toLowerCase())) {
      const dentro = valores.findIndex((v) => v.toLowerCase() === 'in');
      if (dentro > 0 && classes.slice(dentro + 1).some((c) => c > 0)) return leu();
    }
    // `node --env-file=.env` só carrega; com `-e` ou `-p` o programa pode imprimir os valores.
    if (valores.some((v) => OPCOES_DE_IMPRIMIR.has(v))
      && valores.some((v, k) => /^--env-file/.test(v) && (palavraDeEnv(v, shell) || palavraDeEnv(valores[k + 1] ?? '', shell)))) return leu();
    const codigo = codigoEmbutido(valores, verbos);
    if (codigo) { // o próprio código (`node -p "cfg.env"`) e o `--env-file` não contam; o env fora deles, sim
      const soEnvFile = valores.map((v, k) => /^--env-file/.test(v) || valores[k - 1] === '--env-file');
      if (classes.some((c, k) => c > 0 && !soEnvFile[k] && !codigo.has(k))) return leu();
    }
    if (verbos.some((vs) => vs.some((x) => INTERPRETADORES.has(x)))) {
      const interno = verbos.some((vs) => vs.some((x) => DO_POWERSHELL.has(x))) ? 'powershell' : shell;
      for (const p of seg.palavras) {
        if (p.q && /[\s;|&()]/.test(p.v) && analisar(p.v, interno, profundidade + 1, achados)) return true;
      }
    }
  }
  return false;
}
