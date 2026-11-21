# Ambiente do Claude: o mapa para refazer numa máquina nova

O `/intoca:ambiente` guarda no Git da sede (repositório privado da pessoa) **só o mínimo para refazer o ambiente do Claude**: quais plugins
estão instalados e de onde vêm, quais catálogos, quais servidores MCP e hooks, quais ferramentas e o que o plugin nunca faz sozinho. É um
arquivo, `diretoria/ambiente.yaml`, legível por pessoa e por máquina. **Só tem nomes**: o que o código garante, por estrutura (e não por adivinhar o formato do valor): (1) valor de `env` e de cabeçalho do servidor nunca entra, só os nomes; (2) `-e`/`--env` e `-H`/`--header` guardam só o nome (`NOME=v` vira `NOME=<definir>`, `Nome: v` vira `Nome: <definir>`), separados, colados (`-eNOME=v`, `-HNome:v`) ou com `=`; o nome solto, sem valor (`-e NOME`), também vira `<definir>`: por estrutura é um nome, mas um valor posto ali por engano sairia em claro, e na dúvida se esconde; (3) argumento que começa com `nome=` guarda só o nome (um nome de **até 32 caracteres**, só letra, dígito, `_`, `.` e `-`, com **algo depois do primeiro `=`**; o valor que termina em `=` ou `==` depois de letras e dígitos é base64 com preenchimento: o argumento some **por inteiro**, nome e valor, solto, depois de uma opção, em `--foo=QWxh…==`, `-kQWxh…==` ou `-e QWxh…==`, **inclusive com espaço, tabulação ou quebra de linha depois do `==`** (o valor é aparado antes de olhar); **falso positivo aceito**: nome com mais de 32 caracteres e `NOME=` com o valor vazio também somem inteiros, e `NOME=` seguido **só de caracteres invisíveis** (largura zero, controle, marca de combinação, espaço: o valor aparado fica vazio) some inteiro, como `NOME=` vazio, e não deixa nem o nome; **limite conhecido**: um segredo no lugar do **nome** (`S=1`, `-kS=1`, `--foo=S=1`) sai como nome (`S=<definir>`), porque por estrutura tem cara de nome e o código não usa lista de nomes), JSON dentro de argumento fica só com as chaves e URL com `esquema://` fica só com host e caminho (sem usuário, senha, parâmetros e âncora); o argumento solto que começa com `//` (URL sem esquema) recebe a mesma limpeza e, se tem `@` ou `＠` (largura total), some por inteiro (`//usuario:x@host/db`), e `usuario:x@host` sem esquema (um `@` ou `＠` depois de `:`) também some por inteiro; o argumento solto com um `@` **parecido** (`＠` de largura total, `﹫` pequeno: o código os troca por `@` só para decidir) some por inteiro; com `@` e texto antes dele some também (`token@github.com/org/repo`, `token@host/caminho`, `S@host`, e-mail com ponto no domínio, e o **destino `usuario@host`**: `deploy@srv:/app`, `user@host:22`), salvo `git@host:caminho` (SSH do Git), o pacote com escopo (`@escopo/nome`) e o **pacote com versão**, `nome@rótulo` ou `@escopo/nome@rótulo` (`mcp-remote@latest`, `firecrawl-mcp@1.2.3`, `img@sha256:…`), em que o texto antes do `@` tem forma de nome de pacote (sem `/` nem `:`) e o texto depois é um **rótulo de versão**, definido **por estrutura, sem texto livre**: uma tag conhecida (`latest`, `next`, `beta`, `alpha`, `canary`, `stable`, `rc`, com número de até 4 dígitos colado ou depois de `.` ou `-`: `rc2`, `rc.2`, `beta-3`); um número de 1 a 3 partes, **cada uma com até 6 dígitos**, com `^`, `~` e `v` opcionais (`1`, `1.2.3`, `^1.2.3`, `~1.2`, `v1.2`), com ou sem um sufixo depois de `-` ou de `+` de **até 4 segmentos separados por ponto, cada um só de dígitos (até 8: uma data como `20240101`) ou uma palavra de pré-lançamento conhecida** (`alpha`, `beta`, `rc`, `pre`, `dev`, `canary`, `next`, `nightly`, `snapshot`) com número opcional colado **de até 4 dígitos** (`1.2.3-beta.1`, `1.2.3-rc.2`, `1.2.3-rc1234`, `1.2.3+20240101`); um sufixo de **três segmentos ou mais só de dígitos** (`1.2.3-10.0.0.1`, `1.2.3+10.0.0.1`, `1.2.3-1.2.3.4`, `1.2.3-2024.1.1`) tem cara de endereço e não é rótulo; ou um digest de comprimento **exato** (`sha1:` com 40, `sha256:` com 64, `sha384:` com 96 e `sha512:` com 128 hexadecimais: um hexadecimal mais curto pode ser segredo). Qualquer outra coisa depois do `-` ou do `+` (`1.2.3-ZQXWV9`, `v1-ghp_…`), a versão com quatro números (`1.2.3.4`, `10.0.0.1`, com ou sem sufixo: têm cara de endereço, não de versão), `1.x`, `*`, `>=1.2` e as tags `dev`, `nightly` e `lts` **não são rótulo de versão** e o argumento some por inteiro (**falso positivo aceito**; vale também para `@escopo/pacote@dev`, `@escopo/pacote@nightly`, `@escopo/pacote@lts` e `@escopo/pacote@1.x`, que a 1.2.6 deixava passar); sem rótulo de versão depois do `@` o argumento some (`@escopo/nome@ZQXWV9`, `registro/img@sha256:…` e `img:tag@sha256:…` também: **falso positivo aceito**; somem também, **falso positivo aceito** e sem mudar o código, `@escopo/pacote@experimental` e `@escopo/pacote@1.2.3-canary.5a8d6c5` (um segmento com hexadecimal de commit não é só de dígitos nem palavra conhecida com número) e `pacote@1.2.3+build.5` (`build` não é palavra de pré-lançamento conhecida), mesmo sendo versões de verdade); **limites conhecidos**: `ZQXWV9@1.2` (segredo no lugar do nome do pacote e versão no lugar certo) e `pacote@sha256:` com 64 hexadecimais que é segredo de fato têm a mesma forma de um pacote com versão e saem; um segredo **só de dígitos** que caiba nos tetos acima (até 6 dígitos por parte do núcleo, até 8 num segmento do sufixo, até 4 colados a `rc` ou `beta`) e esteja na posição da versão (`pacote@123456.123456.123456`) também sai copiado, pelo mesmo motivo; **números maiores** que os tetos (`pacote@1234567890.1234567890.1234567890`, `pacote@1.2.3-rc1234567890`, e a data `pacote@20240101` como núcleo) somem (**falso positivo aceito**: a perda do nome é preferível a deixar passar um número livre); `//host.io/caminho` sem `@` e com ponto no host volta **como veio** (a limpeza nunca altera o texto em silêncio: `//Host.IO/x` não vira `//host.io/x`), mas `//SEGREDO` e `//s3cr3t` (sem ponto no host, não dá para saber se é host ou segredo) somem por inteiro, e depois de uma opção que espera valor só passa a URL limpa e idêntica; (4) depois de uma opção que espera valor (de nome sensível como `--api-key`, `--token`, `--chave`, `-p`, `-password`, `/password`, e as palavras inteiras `pat`, `dsn`, `sas`, `jwt`, `connection-string`, `webhook`, `signature`, `sig`, `bearer`, `api-key`, `private`, `credential`, `cert`, `session`, `cookie`, `otp`, `pin`, `salt`, separadas por hífen, ponto, sublinhado, dígito ou maiúscula: `--pat`, `--webhook`, `--connection-string`, `--webhookUrl`; `--patch`, `--passo` e `--design` não casam; também por lista, formas coladas em minúsculas e comuns (`--webhookurl`, `--mywebhook`, `--slackwebhook`, `--mypat`, `--githubpat`, `--dsnurl`), e **nome colado em minúsculas fora dessa lista (`--zzpat`) não é pego**: o valor dele some se não for uma URL limpa, e uma URL limpa é copiada; de ambiente; de cabeçalho; segura ou desconhecida), o argumento seguinte **é o valor, mesmo que pareça opção** (`--token --abc`, `-p -abc`) e vira `<definir>`; o valor colado (`--token=x`, `-pX`) e o `=` vazio (`--token= x`) seguem a mesma regra; só continuam sendo opção, com o nome visível, e ligam o estado de novo, as opções sensíveis, de ambiente (`-e`, `--env`) e de cabeçalho (`-H`, `--header`) e a forma `--x=valor`; o que vier depois de um argumento com cara de opção usado como valor também fica escondido; o `--` e o argumento que não é texto (número, nulo, objeto) logo depois de uma opção que espera valor são o valor dela: viram `<definir>` e o estado continua ligado para o argumento seguinte (`--api-key -- x` e `--token 5 x` não deixam sair o `x`); sem estado ligado, o `--` passa e o não-texto vira `<definir>` sem ligar nada; opção longa cujo nome tem qualquer caractere fora de letra (inclusive não ASCII), dígito, `_`, `.` e `-` (`--token:x`, `--password:x`, `--user:x@host`, `--https://u:p@h/db`) é valor colado ao nome: o argumento **inteiro** vira `<definir>` (nome e valor) e o seguinte também fica escondido; `--nome=ok` e `--url=https://h/p` seguem como antes; a **string vazia ou sem nenhum caractere de letra, número, pontuação ou símbolo** (critério por estrutura, não uma lista: espaço e separadores, controle (U+0000 a U+001F, U+007F), formato e largura zero (U+00AD, U+180E, U+200B a U+200F, U+2060, U+FEFF), marcas de combinação, seletores de variação, uso privado, pontos sem designação e não-caracteres como U+FFFF; mais U+2800, U+3164, U+115F, U+1160 e U+FFA0, que desenham nada mas são letra ou símbolo) logo depois de uma opção que espera valor também é o valor dela (`--api-key "" x` e `--api-key " " x` saem `--api-key <definir> <definir>`): vira `<definir>` e o estado continua ligado; sem estado ligado, a vazia (`""`) fica como está, a só de espaço em branco sai `<definir>` (uma palavra solta com espaço some) e o argumento que contém **qualquer caractere que carrega dados sem aparecer** vira `<definir>` **por inteiro**, com ou sem estado ligado, sozinho ou **colado a uma palavra** (`abc` mais caracteres de tag sai `<definir>`): formato (Cf: largura zero U+200B a U+200F, U+00AD, U+2060, U+FEFF, marcas de direção, caracteres de tag U+E0020 a U+E007F), uso privado (Co), sem designação (Cn, como U+FFFF; **o conjunto depende da versão do Unicode do Node**, que no 24.21 é a 17.0: um caractere criado depois é desconhecido para um Node mais velho, conta como sem designação e some, e num Node mais novo é letra ou símbolo e fica), substituto solto (Cs), seletor de variação (U+180B a U+180D, U+180F, U+FE00 a U+FE0F, U+E0100 a U+E01EF) e controle (Cc: U+0000 a U+001F e U+007F a U+009F, salvo U+0009 a U+000D, que já contam como espaço em branco: a tabulação, a quebra de linha, U+000B, U+000C e o retorno de carro). **Esses caracteres carregam dados** (um texto escondido em caracteres de tag, por exemplo): a versão 1.2.7 dizia que a invisível sozinha ficava como estava, sem esconder nada, e isso é falso; o argumento saía copiado. Hoje nenhum deles sai copiado dentro de um argumento do `args`. **O que ainda sai copiado**, colado a uma palavra, são só as marcas de combinação que não são seletor de variação (Mn, Mc e Me: U+034F, U+17B4, U+17B5, os acentos e as vogais de outras escritas, U+20D0 a U+20FF) e as letras e o símbolo que desenham nada, U+2800, U+3164, U+115F, U+1160 e U+FFA0 (limite dito mais abaixo). **Caminho, URL e JSON** com um desses caracteres também somem **por inteiro** (`/mcp/pasta` ou `https://h.io/mcp` com U+200B, ou o JSON com ele dentro de uma chave ou de um valor, saem `<definir>`: a regra olha o argumento antes de qualquer limpeza e não aproveita o resto). A **opção** com um desses caracteres colado ao nome, no meio ou no fim (`-p`, `-password`, `-e`, `-H`, `--header`, `--api-key` e `--token` mais U+200B) também sai `<definir>` por inteiro, e o argumento **seguinte** some **por inteiro**, qualquer que seja (URL com caminho curto, `@escopo/nome`, `~/x`, `nome=valor`, `S=1`): a opção real é desconhecida, e o código a trata como opção sensível. **Falso positivo aceito**: o emoji com junção (U+200D), o emoji com seletor de variação (U+FE0F), o texto de direita para a esquerda com marca de direção (U+200E, U+200F) e a junção sem largura (U+200C) das escritas persa e indianas também somem por inteiro. **Ficam**: letra, número, pontuação, símbolo e as marcas de combinação comuns (o acento em texto decomposto, U+0300 a U+036F); sozinhos e sem estado ligado, essas marcas e U+2800, U+3164, U+115F, U+1160 e U+FFA0 ficam como estão. **Limite dito**: marcas de combinação que não são seletor de variação (acentos de outras escritas, U+20D0 a U+20FF) não são ocultas; a opção de **um traço só com mais de uma letra** tem três casos: um agrupamento só de bandeiras conhecidas (`-vv`, `-vvv`, `-yv`) é bandeira e não liga nada; o nome inteiro em minúsculas feito só de palavras sensíveis conhecidas, sem letra sobrando (`-accesskey x`, `-apitoken x`, `-passphrase x`, `-accesskey=x`), é o nome de uma opção longa, que fica visível, com o valor colado e o argumento seguinte em `<definir>`; qualquer outro (`-vp x`, `-Xmx2g`, `-pX`, `-accessKey x`, `-pmysecret=x`, `-ksecretabc=1`) é ambíguo (valor colado a uma opção curta ou nome longo) e sai `-v<definir>` (só as duas primeiras letras ficam e o valor colado some, inclusive o base64 com `=` ou `==` no fim: `-kQWx==` sai `-k<definir>`; só o `-xnome=valor` com algo depois do `=` (`-Dfoo=bar`) mostra o nome, e com palavra sensível no nome ele também some) e o argumento seguinte também é escondido; terminar em `=` ou `:` (`-vp=`, `-accessKey:`) deixa o valor para o argumento seguinte, que também é escondido (**falso positivo aceito**: `-Xmx2g` esconde também o que vem depois dele); (5) o valor de uma opção desconhecida vira `<definir>` (na dúvida, esconde), salvo opção segura conhecida (`--transport`, `--nome`, `--port`...) com valor que não pareça opção, ou valor claramente de recurso (caminho portátil, pacote com escopo, URL limpa); **perda aceita**: uma opção comum ou bandeira logo depois de uma opção que espera valor é lida como o valor dela e **perde o nome** (`--foo --bar` sai `--foo <definir>`, `--headless -y pkg` sai `--headless <definir> <definir>`), e você completa na mão se precisar; (6) cada argumento da entrada dá exatamente um da saída, na mesma posição: nada é removido, só trocado por `<definir>`; isso vale também depois de um `--`, para opção que começa com dígito, `_` ou letra não ASCII e para o estilo Windows (`/password x`, `/p:x`); (7) argumento solto com espaço (inclusive o `command` com a linha de comando inteira) vira `<definir>`; (8) caminho de máquina e usuário nunca entram. **O que o código NÃO garante**, e é copiado se não cair nas regras acima: **fora dos `args`**, o **nome do servidor** e as **chaves de `env` e de cabeçalho** são copiados sem filtro (um nome com caractere de tag, por exemplo, sai no arquivo; os valores nunca saem), e a **`url`** do servidor do tipo http só passa pela limpeza de URL (sem usuário, senha, parâmetros e âncora), sem a regra do caractere que carrega dados; o argumento solto que começa com `//` **sem `@`** e com **ponto** no host (`//abc.def`, `//h.io/x`) é lido como host de URL sem esquema e **sai copiado, exatamente como veio** (um segredo com ponto não se distingue de um host; sem ponto, como `//SEGREDO` ou `//s3cr3t`, some); traço parecido (`−token`, `–token`) ou espaço no começo (` --token x`) não é opção: o argumento cai em "palavra solta" (o com espaço some, o outro é copiado) e o argumento seguinte **não** é escondido; palavra solta que não segue uma opção que espera valor (`servidor admin senha123`); **o argumento logo depois de QUALQUER opção que espera valor, quando ele mesmo é uma opção sensível, de ambiente ou de cabeçalho, ou a forma `--x=valor`** (`--api-key --token-ABC123`, `--foo --token-ABC123`, `-p --password-ABC123`: ele é lido como uma nova opção e o **nome** dele fica visível, com o texto; só o valor colado depois do `=` some; um segredo posto no próprio nome sai; é um limite conhecido do desenho, que mantém o nome das opções, e não vale só para a dupla `--api-key --token-...`); **o valor de uma opção de nome que não está na lista de palavras sensíveis, quando é uma URL limpa** (`--endpoint https://h/hooks/abc123`; só pega o que está na lista, por palavra inteira); palavra solta depois de bandeira conhecida (`-y`, `--stdio`, `--no-*`) ou depois do `--` sem opção na frente; **o valor de uma opção segura conhecida** (`--port x`, `--nome x`, `--directory x`), que é copiado por ser da lista; forma `chave:valor` sem espaço e sem chave sensível (`user:pass`, `X-Api:y`); atribuição com prefixo que o código não reconhece como `nome=`; lista com vírgula, sem `=` nem `:` (`a,b,senha`); e trecho de caminho de URL com menos de **24 caracteres** (`https://h/hooks/abc123` passa). Só a varredura heurística pode pegar esses casos, e não se deve confiar nela sozinha: por isso o `registrar` **mostra o texto que vai gravar (`texto_a_gravar`) antes do "sim"** e a pessoa lê o diff de novo antes do commit. Nunca digite senha, token ou chave no chat.

Dois modos, o mesmo script (`scripts/ambiente.mjs`):

- **registrar**: lê esta máquina (só leitura) e grava o `ambiente.yaml`. Mostra o que mudou desde o registro anterior e só grava com o "sim".
- **restaurar**: lê o `ambiente.yaml`, compara com a máquina e monta o plano. Com um "sim" (`--confirmado --plano=<plano_hash>`, o hash do plano
  mostrado) executa os passos que dá para refazer sozinho e **para** no primeiro que depende da pessoa. `restaurar --so-plano` só imprime.

## O que entra e o que não entra

| Seção | O que guarda | O que nunca guarda |
| --- | --- | --- |
| `registrado_em` | apelido da máquina (`maquina-` e 4 letras de um hash do nome do computador; `--maquina=<apelido>` troca), data, versão do Claude Code | o nome do computador em claro |
| `catalogos` | nome, tipo (`github`, `git`, `pasta_da_sede`...) e origem; pasta da sede vai **relativa à sede** | caminho absoluto de máquina; usuário, senha e parâmetros de URL |
| `plugins` | `nome@catálogo`, versão e se está habilitado | |
| `servidores_mcp` | nome, comando e argumentos, e os **nomes** das variáveis e dos cabeçalhos de que precisa | valor de variável ou de cabeçalho; usuário, senha, `?...` e âncora de uma URL (e o trecho de caminho com 24 caracteres ou mais, com letra e número). **Limite:** valor de argumento só some nas regras do parágrafo de abertura; palavra solta sem opção (`servidor admin senha123`), `user:pass`, `X-Api:y`, palavra depois de `-y`, `--stdio`, `--no-*` ou do `--`, o valor de uma opção segura (`--port x`, `--nome x`), lista com vírgula e trecho de URL com menos de 24 caracteres **são copiados**: leia o texto antes do "sim" |
| `hooks` | de cada conjunto que mora nas configurações fora de plugin: o nome e **como refazê-lo** | o conteúdo (comandos, caminhos) |
| `permissoes` | o modo e a contagem (`allow`, `ask`, `deny`) | a lista das regras |
| `ferramentas` | nome, versão mínima e uma linha de instalação | |
| `passos_da_pessoa` | o que o plugin nunca faz sozinho | |

Fica de fora: a memória do Claude, o histórico de conversas, o conteúdo dos `.env`, as tarefas agendadas e tudo o que vive na conta
(conectores do claude.ai). Argumento com caminho que só existia na máquina antiga vira `<definir>` e o servidor passa a pedir ajuste
(`precisa_ajuste: true`); se um passo de `restaurar` falha (inclusive o `plugin disable` que vem depois do `install`), a execução **para** nele, o estado é `falhou`, `ok` é falso e o que sobrou volta em `restante`; um valor de opção com nome de segredo (`--api-key` e parecidos) também vira `<definir>`.

## O arquivo é tratado como não confiável

O `ambiente.yaml` mora no Git: quem o altera pode não ser você. Por isso o `restaurar` valida cada item antes de virar comando, e o que não passa
vira passo **recusado** no plano, com o motivo, e nunca é executado:

- plugin: `nome@catálogo` (só letras e números ASCII, `.`, `_`, `-`, e um `@` ASCII; o `＠` de largura total e letras parecidas são recusados; nunca começando por `-`). O teste de "cara de chave" vale **por parte**, no nome e no catálogo, cada um: id que parece chave é recusado (`recusada`, sem repetir o valor);
- catálogo: `github` só `dono/nome`; `git` só `https://` sem usuário, senha ou parâmetros, ou `git@host:caminho`; pasta da sede só **relativa e dentro
  da sede** (sem `..`, sem unidade, sem `-` no começo); pasta de outra máquina nunca é executada (vira passo seu);
- ferramentas: só as que o plugin conhece (`node`, `python`, `uv`, `git`, `gh`, `gitleaks`), pelo comando de uma **tabela fixa do script** para o gerenciador
  detectado; o `instalar` do arquivo é só uma sugestão em texto; ferramenta desconhecida ou que pede `sudo` é passo seu;
- servidor MCP: **de comando local (`stdio`) nunca roda a partir do arquivo**, só mostra o comando para você decidir; remoto só se `https` limpo e sem
  variável nem cabeçalho a preencher;
- hooks: só o conjunto que o script conhece (`sala-animada`); o campo `refazer` do arquivo é informativo e nunca decide.

A validação **confere a FORMA, não a confiança**: um arquivo adulterado pode apontar para `evil/repo`, que tem a forma certa. Por isso o plano mostra a
`origem` de cada catálogo, plugin e servidor remoto para você conferir, e a saída do script não repete frase do arquivo (só nomes validados e frases fixas).

Os comandos usam `--` antes dos valores, para que nada vire opção. Plugin registrado como desabilitado leva **dois** comandos no mesmo passo (`claude plugin install -- <id> && claude plugin disable -- <id>`, sem shell: o script roda um depois do outro), ambos à vista no `comando` do plano, no hash do plano e no relato do passo. O plano executado é o que foi mostrado: o `--plano=<plano_hash>` amarra o "sim" ao
arquivo e à máquina daquele momento; se algo mudou, o script recusa e pede para mostrar de novo. Texto do arquivo que aparece na saída é curto, sem
caractere de controle e sem cara de segredo. **Só acrescentar** vale para plugin, catálogo e servidor MCP; os hooks da sala animada são a exceção: o
instalador regrava o `settings.json` (com cópia ao lado) e o plano avisa antes.

## A varredura antes de gravar

O script varre o próprio texto que vai gravar: o analisador do Vigia, padrões de chave e de token, URLs com senha, textos longos com cara de
chave e caminho absoluto de máquina que tenha sobrado; se o `gitleaks` existe, passa por ele também (se ele existe e falha, o resultado diz `falhou`). O
caminho de máquina é procurado **em qualquer posição** do texto, não só no começo: um argumento que contém um (depois de um `=`, dentro de um JSON, de uma lista com vírgula ou de `chave=valor`) vira `<definir>` inteiro; um valor que é só um caminho dentro da sede vira `${SEDE}/...` e, dentro da sua pasta de usuário, `~/...`. **Achou algo: não grava nada** e diz só o **nome do campo**, nunca o valor. Corrija na
fonte (use uma variável de ambiente) e registre de novo.

## Formato (exemplo fictício completo)

```yaml
versao: 1
registrado_em:
  maquina: escritorio-01
  data: "2026-11-14"
  claude_code: "2.1.0"
catalogos:
  - nome: catalogo-oficial
    tipo: github
    origem: empresa-exemplo/catalogo-oficial
  - nome: sede-local
    tipo: pasta_da_sede
    origem: "."
plugins:
  - id: ferramenta-a@catalogo-oficial
    versao: "1.4.0"
    habilitado: true
  - id: intoca@sede-local
    versao: "1.2.0"
    habilitado: true
servidores_mcp:
  - nome: base-de-conhecimento
    tipo: stdio
    comando: servidor-exemplo
    argumentos: ["mcp", "<definir>", "--transport", "stdio"]
    variaveis: ["CHAVE_DE_EXEMPLO"]
    precisa_ajuste: true
  - nome: servico-remoto
    tipo: http
    url: "https://mcp.exemplo.invalid/mcp"
    cabecalhos: []
    variaveis: []
    precisa_ajuste: false
hooks:
  - nome: sala-animada
    eventos: ["SessionStart", "Stop"]
    refazer: "instalar-sala animada com hooks"
    como: "o `hooks-install` da sala animada, pelo passo `animada` do instalar-sala.mjs"
  - nome: outros
    eventos: ["PostToolUse"]
    refazer: null
    como: "o instalador do programa que os criou (o plugin não sabe refazê-los)"
permissoes:
  modo: default
  allow: 12
  ask: 4
  deny: 9
ferramentas:
  - nome: node
    versao_minima: "20"
    instalar: "winget install OpenJS.NodeJS.LTS"
  - nome: git
    versao_minima: "2"
    instalar: "winget install Git.Git"
passos_da_pessoa:
  - "Entrar na conta do Claude (login)."
  - "Reconectar os conectores do claude.ai."
```

`refazer` é a chave que o `restaurar` entende (hoje, só `instalar-sala animada com hooks`). `refazer: null` quer dizer que o plugin não sabe
refazer aquele conjunto: o passo é da pessoa. A versão de um plugin é informativa: o Claude instala o que o catálogo oferece e o script avisa se
for outra.

## Roteiro: máquina nova (ou máquina que se perdeu)

1. Instale o Claude Code e entre na conta (login). Isso é seu: o plugin nunca digita senha nem código.
2. Clone a sede do seu repositório privado (o `ambiente.yaml` está nela) e abra o Claude Code dentro da pasta da sede.
3. Instale o plugin `intoca` (o catálogo da sede é uma pasta dela; se ainda não estiver registrado, o `/intoca:comecar` explica) e rode
   `/intoca:ambiente restaurar`.
4. Leia o plano que o Claude mostrar, ferramentas, catálogos, plugins, hooks e servidores MCP, nesta ordem, e diga "sim" se estiver certo.
5. O plugin refaz o que dá e **para** onde precisa de você. Faça o que sobrou, com o Claude explicando cada passo:
   - reconectar os conectores do claude.ai;
   - copiar cada `.env.example` para `.env` e preencher os valores (só você abre o `.env`);
   - recriar as tarefas agendadas;
   - aprovar a confiança de cada pasta na primeira abertura;
   - autorizar de novo, em `/mcp`, os servidores remotos que pedem login.
6. Abra uma sessão nova (os plugins carregam nela) e rode `/intoca:ambiente restaurar --so-plano` para conferir: a resposta certa é "nada a
   fazer" (ou só as diferenças que você aceita).
7. Opcional, e só seu: o `markitdown` (leitura de documentos com menos token). O `restaurar` **não o instala nem o confere** e o `registrar` não grava o
   caminho dele: instale pelo roteiro de `docs/leitura-de-documentos.md` (ambiente isolado, versão fixada) e aponte a variável `INTOCA_MARKITDOWN`
   para o executável. Sem ele, os chats leem os documentos como antes.

## Mantendo em dia

Rode `/intoca:ambiente registrar` depois de instalar ou remover plugin, catálogo, servidor MCP ou hook. O comando mostra o que mudou; com o
"sim" grava, e o commit na sede (rotina de sempre) leva o arquivo ao Git. Sem mudança, nada é gravado.

## Onde o script lê

A pasta do Claude é a de `CLAUDE_CONFIG_DIR` (a variável do próprio Claude Code); sem ela, a pasta `.claude` do usuário (a pasta do usuário
pode ser trocada por `INTOCA_HOME`). O script **só lê** essa pasta e só grava o `ambiente.yaml` (ou o arquivo de `--saida`, usado em testes). `--saida` e `--arquivo` só aceitam um arquivo chamado `ambiente.yaml`, dentro da sede ou de uma pasta temporária **depois de resolver os links**: o que vale é a raiz de ONDE o caminho foi escrito, e um caminho escrito fora das duas (forma curta 8.3 do Windows, `subst`, sede por link) só passa se não tiver nenhum link ou junção; outro nome, link que aponte para fora e destino já existente que não seja um `ambiente.yaml` são recusados (`caminho-nao-permitido`).
Para achar a sede ele usa o `--sede`, depois a pasta atual, depois a variável `INTOCA_SEDE` e o ponteiro `~/.intoca/sede`.
