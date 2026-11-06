# InToca Sede (plugin `intoca`, versão 1.0.6)

O **InToca Sede** é a camada Claude da sede InToca, empacotada como plugin do Claude Code (identificador `intoca`, comandos `/intoca:...`). Licença MIT; as mudanças de cada versão estão em [`CHANGELOG.md`](CHANGELOG.md). Traz os cargos e as rotinas do
regimento como skills, os assistentes de leitura como agentes e os hooks que dão contexto, bloqueiam
o proibido e cobram o relatório. Instalado na conta da pessoa, vale em qualquer pasta, inclusive num
repositório aninhado dentro da sede, que a pasta `.claude/` da sede não alcança.

O plugin não guarda regimento, fila, OS nem dado algum da sede. Ele só lê o que a sede tem.
Documentação oficial: <https://code.claude.com/docs/en/plugins>.

Existe um pacote-irmão **opcional**, a **InToca Sala** (`intoca-sala`): o quadro de avisos do escritório, com a página das Tocas (a sala Clássica) e a faixa dentro do app. O `/intoca:comecar` o instala junto, com o "sim" da pessoa, e oferece a sala animada como passo opcional. Quem não o instala não perde nada do InToca Sede.

## O que contém

| Componente | Itens | Como aparece |
| --- | --- | --- |
| `skills/` | `diretoria`, `gerente`, `executor`, `plantao`, `secretaria`, `triagem`, `os-nova`, `relatorio`, `encerrar`, `memorando`, `comecar`, `rigor` | Comandos `/intoca:<nome>`, por exemplo `/intoca:triagem`, `/intoca:memorando`, `/intoca:comecar` e `/intoca:rigor`. Claude também as aciona pela descrição. |
| `scripts/` | `criar-sede.mjs`, `aplicar-rigor.mjs`, `instalar-sala.mjs` | Os scripts que o `/intoca:comecar` chama para criar a sede (ver "Começar: `/intoca:comecar`"), para instalar a InToca Sala (ver "A InToca Sala no começo") e que o `/intoca:comecar` e o `/intoca:rigor` chamam para escrever o arquivo de permissões das pastas (ver "Rigor das permissões"). Não são carregados como componente. |
| `docs/` | `boas-vindas.md`, `git-e-github.md`, `permissoes.md`, `projetos-existentes.md`, `windows-e-appdata.md` | Textos de apoio do `/intoca:comecar` e do `/intoca:rigor` (como tudo funciona; Git e GitHub; permissões e rigor, em linguagem de empresa; e a nota curta sobre o `AppData` virtual do Windows e a pasta temporária dos hooks). Não são carregados como componente. O Memorando de Integração que a skill `memorando` lê é a versão neutra de `templates/sede/diretoria/memorando.md`. |
| `agents/` | `auditor`, `pesquisador`, `revisor` | Assistentes `intoca:<nome>`, ou `@agent-intoca:revisor` quando chamados à mão. |
| `hooks/` | `sessao-inicio`, `prompt-os`, `pre-ferramenta`, `parada`, `chat-trocado`, `pasta-errada`, `worktree-criar`, `worktree-remover` | Rodam sozinhos nos eventos abaixo. |
| `templates/` | `sede/`, `INDICE.md`, `permissoes/` | A sede de partida: a árvore que o `/intoca:comecar` copia para criar uma sede nova (ver "Sede de partida"); e os modelos de `.claude/settings.json` por nível de rigor. Não é carregada como componente. |
| `LICENSE`, `CHANGELOG.md`, `.claude-plugin/icon.png` | Licença MIT; histórico de mudanças; ícone (provisório: trocá-lo é substituir o arquivo, sem mudar código nem versão) | Não são carregados como componente. |
| `tests/` | `hooks.test.mjs` | Roteiro de teste simulado dos hooks e verificações estáticas do pacote. Não é carregado como componente. |

Todo componente de plugin leva o nome do plugin como prefixo (`intoca:`). Os arquivos das skills e dos
agentes não mudaram de conteúdo na migração: continuam citando `diretoria/...` e `os/...`, que são
caminhos relativos à sede, não ao plugin.

## Como o chat acha a sede

O plugin mora numa pasta de cache ou na pasta do marketplace; a sede mora onde a pessoa a clonou. A
ligação é feita pelos hooks, não por caminho fixo:

1. **`sede.yaml` subindo do `cwd`.** Cada hook começa na pasta de trabalho do chat e sobe diretórios
   até achar um `sede.yaml`. É o marcador da sede. Num repositório aninhado em `<sede>/<projeto>`,
   o `sede.yaml` está dois ou três níveis acima.
2. **Variável `INTOCA_SEDE`.** Se não achou, usa a pasta indicada por ela, desde que tenha
   `sede.yaml`. Serve para chats abertos fora da árvore da sede.
3. **Ponteiro da sede** (desde a 0.7.0). Se nenhuma das duas valeu, lê a primeira linha do arquivo
   `<pasta do usuário>/.intoca/sede` (o `/intoca:comecar` o cria, só com o "sim" da pessoa) e usa o
   caminho dela, desde que seja um caminho completo de uma pasta que tenha `sede.yaml`. Ponteiro
   ausente, relativo, vazio, grande demais ou para pasta sem `sede.yaml` é ignorado em silêncio. A
   variável `INTOCA_HOME` troca a pasta do usuário (uso dos testes). Só lê o disco quando as duas
   primeiras não acharam: dentro de uma sede o custo é zero. Vale para os hooks de contexto e aviso; os
   dois de worktree continuam como antes (sede acima do repositório ou `INTOCA_SEDE`). **O ponteiro é
   um cadastro de pastas, não uma chave global:** quando a sede vem só dele (nem `sede.yaml` acima do
   `cwd` nem `INTOCA_SEDE`), os hooks de contexto (`sessao-inicio`, `pasta-errada`, `chat-trocado`,
   `prompt-os` e `parada`) só agem se o `cwd` estiver numa pasta que o manifesto registra: a
   `pasta_atual`, a `pasta_futura` ou uma das `pastas_antigas` de algum projeto (o que inclui as
   worktrees `.claude/worktrees/` dessas pastas). Em qualquer outra pasta (outros projetos da pessoa, o
   desktop) não injetam nada e não cobram nada: `sessao-inicio`, `chat-trocado`, `prompt-os` e
   `parada` ficam mudos, e só o `pasta-errada` dá **uma linha por sessão** (`startup` e `resume`; nunca bloqueia, sem lista de projetos):
   "este chat não faz parte de nenhuma Toca da sede `<nome>`; se for trabalho de um projeto, abra o chat na pasta
   dele". Sem esse aviso quando a entrada não traz `cwd`, na pasta pessoal, em pasta que a contém, na
   raiz do disco, em pasta que contém alguma pasta registrada (a "mãe" dos projetos), na pasta temporária
   do sistema (`os.tmpdir()` e o que há dentro dela) e dentro de `.claude/worktrees` ou `_worktrees` de
   repositório alheio; `INTOCA_SEM_AVISO_PASTA=1` o cala. Antes de avisar, o hook compara também o caminho
   real (`caminhoReal`): nome curto 8.3, junção ou link que leva a uma pasta registrada não vira "nenhuma
   Toca" (só no caminho que avisa, para não custar disco nos demais). Pasta que só entra por link também não
   conta como pasta registrada para os outros quatro hooks. `INTOCA_SEDE` e a sede acima do `cwd` seguem como
   antes. O manifesto é lido uma vez por
   chamada (`raizes` devolve a origem da sede, `cwd`, `env` ou `ponteiro`, e o manifesto já lido).
   Apagar o arquivo `.intoca/sede` desliga o ponteiro. **Aceito e documentado:** com a sede só
   pelo ponteiro, o `pre-ferramenta` também age em pasta registrada fora da sede (é o objetivo do
   ponteiro); o aviso de "nenhuma Toca" repete a cada `resume`; e o ponteiro confia em quem escreve na
   pasta do usuário, como a variável `INTOCA_SEDE` confia em quem escreve no ambiente.
4. **Nenhuma das três.** Os hooks de contexto saem com código 0 e sem saída. Fora da sede o plugin
   não injeta nada e não cobra nada.

Numa worktree de cartão (`.claude/worktrees/<nome>` ou `_worktrees/<nome>`), a pasta com `sede.yaml`
mais próxima é a própria worktree. Os hooks tomam a raiz que a contém como sede viva, porque a fila
da worktree é só o retrato do branch.

Quando o projeto mora numa **subpasta da sede** (`_infra/aplicativo`), a worktree da sede o traz em
`<worktree>/_infra/aplicativo`, e o manifesto só guarda o caminho do checkout principal. Desde a 1.0.2 os hooks
mapeiam o caminho da worktree de volta ao projeto pelo trecho depois da raiz da worktree (ver "Como o hook sabe quem é o
chat", item 3).

O contexto injetado quando o chat assume o cargo traz a linha `Raiz da sede: <caminho>`. É por ela que o chat sabe de
onde partem os caminhos `diretoria/...` das skills, mesmo quando a pasta de trabalho é um projeto.

## Skills, memorando e vocabulário

Desde a 0.5.0. O pacote traz dez skills; duas são novas.

- **`/intoca:memorando [seção ou termo]`.** Mostra o Memorando de Integração, a leitura de chegada em
  linguagem de empresa. Sem argumento, um sumário e a lista de seções (`termos`, `cargos`, `documentos`,
  `regras`, `niveis`, `fluxo`, `modos`, `perguntas`); com argumento, só a seção ou o verbete (`OS`, `fila`...).
  Lê a versão neutra do pacote, `templates/sede/diretoria/memorando.md` (desde a 0.7.0; antes lia uma
  cópia em `docs/` com o apelido do proprietário da sede de origem, que saiu do pacote), e não a da
  sede: a pessoa pode estar numa máquina sem sede. O começo do texto diz a versão e a data. Não
  executa nem grava nada.
- **`/intoca:secretaria`.** O cargo que mantém `diretoria/pendencias-do-proprietario.md`: apresenta o que
  só o proprietário faz (abrir chats, "pode" e "vai", subir arquivos, configurar o app), pergunta o que
  já foi feito, marca `feito` com a data e avisa a Diretoria. Não executa, não aprova, não escreve fora
  desse arquivo.
- **Oferta do memorando.** As skills de cargo (`diretoria`, `gerente`, `executor`, `plantao`, `secretaria`)
  respondem ao pedido primeiro e, se a pessoa usou um termo trocado, pediu a um cargo o que é de outro
  ou perguntou "o que é X", fecham com uma linha oferecendo `/intoca:memorando <seção>`, no máximo uma
  vez por sessão.
- **Regras 14 e 15.** Cada skill de cargo traz "Pedido que não é daqui" (diz em uma linha, aponta o
  destino pela cadeia e oferece encaminhar; nunca recusa seco nem bloqueia) e, no executor, "Pedido novo
  no meio da OS". Os hooks `chat-trocado` e `pasta-errada` só entregam a linha "Aviso InToca" e o lembrete
  da regra 15; **julgar** "fora da OS?" ou "pequeno e colado?" é da skill.
- **Autorização por projeto e por sede.** Regra 4 do regimento: a de OS da sede fica em
  `diretoria/autorizacoes/<ID>.md`; a de OS de projeto, em `<projeto>/ops/autorizacoes/<ID>.md`, gravada
  pelo gerente depois do "pode". As skills `encerrar`, `executor`, `gerente`, `os-nova` e `plantao` citam
  os dois caminhos. Os hooks não mudaram por isso.
- **Vocabulário.** O de empresa, até nos verbos: o chat é **contratado**, **assume o cargo** e, trocado
  por outro, o sucessor é **recontratado** e lê a passagem. O aviso padrão à Diretoria é "assumi o cargo".
  Decisão de 2026-10-14; um teste do grupo `pacote` vigia o pacote inteiro.

## Os hooks

Scripts Node sem dependências, chamados em forma exec (`command: node`, caminho em `args`) com
`${CLAUDE_PLUGIN_ROOT}`. Os de contexto, aviso e permissão têm timeout de 5 segundos; os de worktree, 120 e 60.

| Script | Evento (matcher) | O que faz |
| --- | --- | --- |
| `sessao-inicio.mjs` | `SessionStart` (`startup`, `resume`) | Acha a sede, lê `diretoria/fila.md` e `diretoria/passagem.md` e injeta até 1500 caracteres: raiz da sede, OS em execução com o recurso, recursos congelados, estado da sede e o lembrete de conferir a fila. |
| `prompt-os.mjs` | `UserPromptSubmit` | Se o prompt manda executar uma OS (`Execute <caminho>/os/<ID>-<tema>.md`), lê o cabeçalho dela e injeta ID, modelo previsto, recurso e autorização. Guarda isso no estado da sessão. Prompt sem OS passa sem saída. |
| `pre-ferramenta.mjs` | `PreToolUse` (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Read`, `Bash`, `PowerShell`) | Nega escrita em `.env`, `.env.*`, `*.env`, `*.pem`, `*.key` e `.git-credentials`; nega leitura (`Read`) e comandos de shell que leem, copiam ou gravam um `.env` (`cat .env`, `Copy-Item .env.example .env`, `> .env`: ver "Política de segredos"); e nega comandos com `--no-verify`, envio forçado (`push` com `--force` ou `-f`) e `reset --hard`. Os modelos, com qualquer prefixo ou finalidade e terminando em `.example`, `.sample` ou `.template` (`.env.example`, `.env.crm.example`, `hospedagem.env.example`), passam. Desde a 0.4.0, também nega `Write`/`Edit` de governança (`diretoria/...`, `ops/...`) fora do lugar, com o caminho certo no motivo: ver "Avisos e governança fora do lugar". Dentro de uma sede, permite sem perguntar o que cumpre o regimento: ver "Autorização por regra". |
| `chat-trocado.mjs` | `UserPromptSubmit` | Se o prompt cita **outro projeto** (nome, domínio, sigla em maiúsculas ou pasta), injeta um aviso de uma linha com o destino. Em chat de executor com OS, lembra uma vez por sessão que pedido novo é outra OS. Só `additionalContext`: nunca bloqueia. Ver "Avisos e governança fora do lugar". |
| `pasta-errada.mjs` | `SessionStart` (`startup`, `resume`) | Se o chat abriu numa pasta que não é a de nenhum projeto do manifesto (inclusive uma pasta antiga, que migrou), injeta um aviso de uma linha com o destino. Nunca bloqueia. |
| `parada.mjs` | `Stop` | Se a sessão tem OS detectada e `diretoria/relatorios/<ID>.md` não existe, bloqueia a parada uma única vez por sessão e pede o relatório. |
| `worktree-criar.mjs` | `WorktreeCreate` (sem matcher; timeout 120 s) | Substitui o `git worktree add` padrão: cria a worktree em `<sede>/_worktrees/<repositório>-<nome>` e imprime o caminho. Ver "Worktrees fora do repositório". |
| `worktree-remover.mjs` | `WorktreeRemove` (sem matcher; timeout 60 s) | Remove a worktree que o hook criou, sem `--force`, e apaga o branch se estiver integrado. |

`lib.mjs` é a biblioteca comum: leitura da entrada, descoberta da sede, leitura do manifesto, "quem é o
chat" (`quemEoChat`, `montarContexto`), caminho do estado e as funções de worktree.

**Alcance.** O lado "negar" do `pre-ferramenta` não depende de achar a sede: vale em qualquer pasta
onde o plugin esteja ativo, porque as regras 6 e 8 do regimento (segredos fora do Git, nunca
`--no-verify`) não dependem do projeto. O lado "permitir" e a parte de governança fora do lugar só agem dentro de uma sede. Os cinco de contexto e aviso
(`sessao-inicio`, `prompt-os`, `parada`, `chat-trocado`, `pasta-errada`) só agem dentro de uma sede. Os dois de worktree valem em qualquer repositório Git, porque o hook substitui a
criação padrão e não pode "declinar"; fora de uma sede, recriam o local padrão do Claude Code.

## Política de segredos: o `.env` fica na pasta do projeto (0.9.0; correções na 0.9.1)

Regra 6 do regimento: **segredos fora do Git**. O arquivo real de segredo (`.env`, ou `.env.<finalidade>` quando o
projeto tem mais de um, como `.env.crm`) mora na **pasta principal do projeto**, ignorado pelo Git. A IA
**entrega o modelo** (`.env.example` ou `.env.<finalidade>.example`, com nomes e comentários, sem valor) e **não lê nem
grava o valor**; a pessoa copia o modelo (`Copy-Item .env.example .env` no Windows; `cp .env.example .env` no Mac e no
Linux) e preenche. Nenhum passo pede segredo no chat. O texto para quem não programa está em
`docs/politica-de-segredos.md`; o pacote só explica o fluxo e não cria cofre, inventário nem script de backup (isso é da sede).

O que o hook `pre-ferramenta.mjs` faz com isso, e só isso (ele nega o que sabe reconhecer; não promete impedir tudo):

- **Nome de segredo de env:** `.env`, `.env.<finalidade>`, `.env_x`, `.env-x`, `.envrc` e `<nome>.env` (`hospedagem.env`). `.environment.md` não é.
  O nome antes de `:` conta (`.env::$DATA`, fluxo do NTFS).
  Uma fonte só no `lib.mjs` (`ehNomeDeEnv`, `ehModeloDeEnv`), usada pelo "negar" e pelo "permitir".
- **Modelo:** nome de env que termina em `.example`, `.sample` ou `.template`, com qualquer prefixo ou finalidade,
  passa em leitura e em escrita. `.env.example.local` não é modelo. `chave.pem.example` **não** é modelo de env: continua
  segredo (escolha restritiva).
- **Negado:** `Write`, `Edit`, `MultiEdit`, `NotebookEdit` e `Read` de um env de segredo; e, no `Bash` e no `PowerShell`, o
  comando que lê, copia ou grava um env (`hooks/shell-env.mjs`): redirecionamento (`> .env`, `>> .env`,
  `< .env`, `&> .env`), verbos de leitura, cópia e escrita (`cat`, `type`, `Get-Content`, `cp`, `Copy-Item`, `mv`,
  `tee`, `Set-Content`, `touch`, `Format-Hex`, `openssl`, `gzip`, `mklink`, `fsutil`, `curl -d @.env`, `tar`...) junto de um env, o env passado
  por pipe (`Get-Item .env | Get-Content`, `find . -name ".env*" | xargs cat`, `| while read f`; só passam por filtros que mostram texto, como `head`, `tail`, `sort`, `wc`, `grep` e `xargs ls`; `sed` e `awk` não são filtros, porque executam código; `head`, `tail`, `more` e `less` antes eram negados e agora passam, porque só leem texto do pipe; a cadeia inteira conta, mesmo com filtros no meio), `find ... -exec` sobre o env (`find ... -delete` pergunta), `read f <<< ".env"`, `bash <<< "cat .env"`, `$(cat .env)` e crase dentro de aspas duplas (também com aspas aninhadas,
  `"$(cat ".env")"`), interpretador com código embutido e o env fora da string (`node -e "..." .env`, `php -r '...' .env`; o
  `node --env-file=.env app.js` continua livre), `node --env-file=.env` com `-e` ou `-p`, `git add`, `show`, `diff`, `restore` (menos `restore --staged`, que só mexe no índice) ou `checkout`
  com um env, `git log -p -- .env` (as opções `-p`, `-u`, `-c`, `--cc`, `--patch` e `-L`; `-U0` e `--word-diff` não), `git hash-object -w .env`, `for ... in (.env)`, e o texto entre aspas passado a `bash -c`,
  `powershell -Command`, `node -e` e parentes. No PowerShell o glob alcança arquivo oculto, então `Get-Content *nv`, `gc ?env` e
  `Select-String x *`, `Get-Content logs\*` são negados (no Bash o `*` não casa o `.env`, então `cat *` passa lá; mas `cat *.env` e `cat *env*` casam `hospedagem.env` e são negados, e `cat *nv` ou `cat h*` passam, porque o glob não cita env). A mensagem diz o caminho certo: criar o
  `.env.example`; a pessoa copia e preenche.
- **Pergunta (`ask`), não nega:** o comando que só **apaga** o env (`rm .env`, `del`, `erase`, `Remove-Item`, `unlink`, `git rm` sem `--cached`,
  `git clean` com env). O arquivo real é a única cópia, então o hook devolve `permissionDecision: "ask"` e o app pergunta à pessoa
  ("apagar o `.env` perde a única cópia do segredo; confirme só se ele está guardado no cofre ou em outro lugar"). Se o mesmo comando também
  lê o env ou casa uma regra de negar (envio forçado ao remoto), nega. Ao responder `ask`, o hook não dá `allow`. Observado em `claude -p` (2.1.309): sem ninguém para responder, o app trata o `ask` como bloqueio, também em `bypassPermissions`; a pergunta de verdade, no app aberto, não foi observada.
- **Comando grande demais (0.9.1):** acima de 20000 caracteres, de mais de três níveis de comando dentro de comando, de uma palavra (fora de
  texto entre aspas com espaços, que é lido como texto) com mais de 1024 caracteres, ou de texto patológico que gasta o orçamento de passos do
  analisador, ele não confere; se o texto cita `env` (sem distinguir caixa), **nega** com a mensagem "Comando grande demais para conferir se mexe num
  arquivo .env: separe-o em partes menores"; se não cita, passa. Um heredoc muito grande que menciona `env` (por exemplo `process.env`) também cai aqui.
- **Passa:** o que não lê o conteúdo (`ls .env`, `Test-Path .env`, `git check-ignore .env`, `node --env-file=.env app.js`), os modelos, o que
  só exclui o env (`--exclude=.env`, `-Exclude .env,.env.*`, `/XF .env`, `zip -x ".env"`, `rg -g '!.env'`, `:!.env`), `process.env`, URL,
  `git rm --cached .env`, o nome como **padrão de busca** (o primeiro argumento de `grep/rg/ag/findstr/Select-String/jq` e o valor de
  `-e`/`-Pattern`: `grep "Rails.env"`, `rg "runtime.env" src`, `jq '.env' arquivo.json`; só os arquivos que vêm depois contam), o nome como
  **texto gravado em outro arquivo** (`Add-Content .gitignore ".env"`, `tee -a .gitignore <<< ".env"`), `find . -name ".env*"`, e texto que só
  cita o comando (mensagem de commit, `echo "cp .env.example .env"`, corpo de heredoc).
- **Limites:** variável de shell, programa que abre o arquivo por dentro (`python script.py`, ou `node --env-file=.env`
  que o próprio programa imprime), expansão que monta o nome (`.{env,x}`), nome curto 8.3 do Windows, link simbólico de
  nome inocente, verbo fora da lista, busca recursiva que não nomeia o env (`grep -r texto .` lê o `.env`), `git clean -fdx` (apaga o `.env` ignorado sem citá-lo), e a ferramenta
  `Grep` (que não passa pelo hook) não são vistos; `sed` ou `awk` que cita `.env` só como texto pode ser negado por engano. O que o hook não nega fica
  com as regras do app (o `deny` dos modelos de permissão, que ganhou `*.env` e `_segredos/**`). A página que a pessoa lê, com esses limites em
  linguagem simples, é `docs/politica-de-segredos.md`.
- **Modelos de permissão e o `.env.<finalidade>`:** o `deny` dos modelos de permissão traz `.env`, `.env.local`, `.env.production`, `.env.development`,
  `.env.staging`, `.env.test`, `.env.prod`, `.env.*.local` e `*.env`; **não** traz `.env.crm`, `.env.hospedagem` nem outro `.env.<finalidade>`, nem
  `.envrc` e `.env_prod`: um `deny` em `.env.*` barraria também o `.env.example`, que a IA precisa gravar. Esses nomes ficam em `ask` (`Read` e `Edit` de
  `.env.*`) ou só no hook (`.envrc`, `.env_prod`). Consequência: o `ask` casa também o modelo, então **gravar ou ler o `.env.example` pede
  confirmação no app**, mesmo com o hook liberando (o "allow" do hook não vence um `ask`). O `deny` não foi afrouxado.
- **Alcance:** o negar de `Read` do env vale em qualquer pasta onde o plugin esteja ativo, como o de escrita (antes da
  0.9.0 a leitura ia só às regras do app).
- **Pasta `_segredos`:** entra na lista de pastas de segredo (defesa contra backup antigo ou cofre restaurado na árvore).
- **`.gitignore`:** o `_gitignore` da sede e os `_gitignore` dos modelos de projeto (site, app, serviço) ignoram
  `**/.env*` e `**/*.env` e abrem exceção para os modelos (`!**/.env.example`, `!**/.env.*.example` e os `.sample` e
  `.template`). Um teste confere com `git check-ignore`.

## Autorização por regra

Desde a versão 0.3.0,
o `pre-ferramenta` também **assina embaixo**: quando a chamada cumpre o regimento, ele devolve
`permissionDecision: "allow"` e o app não pergunta. É o crachá do funcionário: dentro da sua sala e
nos quadros de aviso comuns, ele entra sem chamar o dono; no cofre e na porta da rua, continua
chamando. Na dúvida, o hook não decide nada e a chamada segue para as regras do app, como antes.

**O que o `allow` não faz.** Pela documentação oficial, o `allow` de um hook dispensa a pergunta,
mas as regras `ask` e `deny` do `settings.json` continuam valendo: uma regra `ask` ainda pergunta e
uma `deny` ainda bloqueia. Também não dispensa a pergunta das ações que nenhum modo aprova sozinho
(pastas protegidas como `.git` e `.claude`) nem a leitura em caminho de rede. O ganho é dispensar a
pergunta do que hoje pergunta **por falta de regra**: escrita fora da pasta do chat, worktree,
comandos de rotina sem regra. Os `deny` do próprio hook vêm primeiro e vencem: quando um deles casa,
o `allow` nem é calculado.

**Modo de permissão do chat** (desde a 0.3.1). O hook lê o campo `permission_mode` da
entrada. Valores confirmados na documentação e no Claude Code 2.1.295: `default` (o modo Manual),
`plan`, `acceptEdits`, `auto`, `dontAsk` e `bypassPermissions`. O crachá só vale em expediente
normal:

| Modo | Escrita e comandos | Leitura |
| --- | --- | --- |
| `plan` (modo de planejamento) | nenhuma decisão | nenhuma decisão |
| `default`, `acceptEdits`, `auto` | regra de sempre (tabela abaixo) | regra de sempre |
| `dontAsk`, `bypassPermissions`, campo ausente ou valor desconhecido | nenhuma decisão | regra de sempre |

Em `plan`, o modo existe para impedir escrita e comando; um `allow` do hook os liberaria. Os `deny`
valem em qualquer modo.

**Como o hook sabe quem é o chat.** Pela pasta de trabalho (`cwd`) e pelo `sede.yaml`:

1. Sem sede (nenhum `sede.yaml` acima do `cwd` e nenhuma `INTOCA_SEDE` válida), ou manifesto que o
   leitor não entende: nenhuma decisão.
2. `cwd` dentro de `<sede>/_worktrees/<pasta>` (e que não cai no item 3): a worktree é do projeto cujo nome de pasta
   (`pasta_atual`) começa a `<pasta>` seguido de hífen (`app-cartao` é do projeto em `.../app`), ou da
   própria sede (`<nome da sede>-cartao`). Nenhum dono, ou mais de um: nenhuma decisão.
3. `cwd` numa **worktree da sede** (a raiz da worktree tem `sede.yaml` e fica dentro da sede:
   `<raiz>/.claude/worktrees/<nome>/`, `<sede>/_worktrees/<nome>/` ou `<pasta de um projeto>/.claude/worktrees/<nome>/`)
   e depois da raiz da worktree vem a subpasta de um projeto do manifesto (`pasta_atual`, `pasta_futura` ou
   repositório do projeto, relativas à sede; `pastas_antigas` não contam): chat desse projeto, e este item vale antes do 2, e a pasta dele é a cópia dentro da worktree
   (a negação de `ops/` fora do lugar aponta para ela). A subpasta mais específica vence; duas subpastas igualmente
   específicas de projetos diferentes, ou o caminho real (link, junção, nome curto) que não dá o mesmo projeto: nenhuma
   decisão, o lado mais restritivo. Raiz da worktree sem `sede.yaml` (worktree do repositório de um projeto ou de um repositório
   alheio), worktree de outra sede e cwd na própria raiz da worktree seguem como nos itens 2, 4 e 5.
4. `cwd` dentro da `pasta_atual` (ou da `pasta_futura`) de um projeto: chat desse projeto (a pasta
   mais específica vence). Inclui `<projeto>/.claude/worktrees/`.
5. `cwd` na raiz da sede, ou dentro dela sem ser de projeto: chat da sede (Diretoria, Secretaria).
6. Qualquer outro `cwd`: nenhuma decisão. `pastas_antigas` não dão identidade nem permissão.

O leitor do `sede.yaml` é próprio e mínimo: lê só a lista `projetos:` e os campos `nome`, `sigla`,
`pasta_atual`, `pasta_futura`, `pastas_antigas`, `branch_principal`, `deploy` e `exibicao`, em item de
bloco ou em linha (`- {nome: x, pasta_atual: '...'}`), mais o `rigor` de `sede:` (desde a 0.8.0) e os
`titulos`. Pasta que não é caminho absoluto ("a decidir") não conta.

**Rigor** (desde a 0.8.0). A tabela abaixo é o nível `equilibrado`, o padrão. No `cauteloso` só a
linha `Read` e a governança da linha de escrita (`diretoria/` e `ops/`) valem; escrita de código, comandos e
worktree ficam sem decisão. Ver "Rigor das permissões".

**O que permite**

| Ferramenta | Permite quando |
| --- | --- |
| `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | O arquivo está na pasta do projeto do chat ou numa worktree dele (`<sede>/_worktrees/<pasta>-*`, `<projeto>/.claude/worktrees/`, ou a subpasta dele numa worktree da sede, desde a 1.0.2). Chat da sede: qualquer lugar da raiz da sede, menos as pastas de projetos com `.git` próprio e as worktrees de projeto. Qualquer chat: governança em `<sede>/diretoria/` e em `<pasta de qualquer projeto>/ops/`, desde que o caminho real fique também na raiz real da sede (ou do projeto dono da `ops/`). Cada ferramenta pela sua chave: `notebook_path` no `NotebookEdit`, `file_path` nas outras; chave própria ausente, ou a outra chave com valor diferente: nenhuma decisão. |
| `Read` | O arquivo não é segredo (lista abaixo), em qualquer pasta. |
| `Bash`, `PowerShell` | O comando inteiro é um comando simples de uma destas famílias: `git status`, `log`, `diff`, `show`, `add`, `commit`, `fetch`, `pull`, `branch` (listar ou criar), `merge main`, `merge --no-ff <ref>`; `git push origin <branch>` e `git push -u origin <branch>`; `git worktree add` e `remove` com destino em `<sede>/_worktrees/`; testes: `node --test` (com `--test-reporter` só `spec`, `tap`, `dot`, `junit` ou `lcov`, os que vêm com o Node), `node <área do chat>/tests/<arquivo>`, `npm test`, `pnpm test`, `npm run test*`, `php tests/<arquivo>`. Com `dangerouslyDisableSandbox` ligado na entrada: nenhuma decisão. |

**O que nunca permite** (fica com as regras do app, que perguntam ou bloqueiam):

- escrita dentro de `.git/`, em `.claude/settings*.json`, em `.mcp.json`, em qualquer pasta
  `autorizacoes/` (a assinatura do dono continua pedindo) e em arquivo de segredo;
- leitura de segredo: `.env*` e `*.env` (menos os modelos `.example`, `.sample` e `.template`, com qualquer prefixo), `*.pem`, `*.key`, `*.pfx`, `*.p12`, `id_rsa*`
  e outras chaves SSH, `.git-credentials`, `.npmrc`, `.netrc`, `credentials*.json`, nome com
  `token`, `secret`, `credential` ou `password`, `.git/config`, `sftp.json`, `.dev.vars*`,
  `.claude.json`, `hosts.yml` do GitHub CLI (`.config/gh/`, `GitHub CLI/`), e tudo que passe por
  `.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`, `.azure`, `.wrangler`, `_segredos` ou `.out/private`. Essa lista
  ampla só tira o "permitir": não vira bloqueio, para não barrar um `secret-santa.md`;
- comando com qualquer um destes caracteres, mesmo entre aspas: `;` `&` `|` `<` `>` crase `$` `%`
  `^`, quebra de linha, aspas tipográficas; palavra com aspas pela metade (`a'b'`); opção que não
  está na lista fechada de cada subcomando (por exemplo `-c`, `-C`, `-n` e `--amend` do commit,
  `--output`, `--no-index`, `--upload-pack`, `-d`, `-D`, `-m`, `-f` do branch, `-B` e `--force` da
  worktree);
- `git push` para `main`, `master`, `HEAD` ou o `branch_principal` do projeto do chat, para nome que
  não é exatamente um branch local (tag com o mesmo nome, `refs/...`, `heads/...`, inexistente), com
  `+`, `:`, `--delete`, `--all`, `--mirror`, `--tags`, ou para outro remoto que não `origin`;
- teste com argumento que contenha `producao`, `production` ou `--banco`; `npm run` de script cujo
  nome cite `prod`, `deploy`, `publish` ou `release`; `node --test` com reporter que é caminho ou
  pacote (carregá-lo roda código de fora do chat) ou com `--test-reporter-destination`;
- push forçado, `--no-verify`, `reset --hard`, `clean -fd`, apagar em massa, `gh repo delete`, deploy,
  DNS, Workers, publicação em redes, instalação de tarefa agendada: nenhum casa com as famílias acima.

**Caminhos.** Antes de comparar, o hook resolve `.` e `..`, ignora a caixa no Windows e desfaz link
simbólico, junção e nome curto (`SETTIN~1.JSO`) pelo `realpath` do ancestral que existe. O caminho
tem de cumprir a regra nas duas formas, como escrito e real: um link que sai do projeto, ou que entra
nele vindo de fora, perde o "permitir". Na governança, além de estar em `diretoria/` ou `ops/`, o
caminho real tem de ficar na raiz real da sede ou do projeto: uma `ops/` que é junção para fora não
abre a porta. Link quebrado no meio do caminho, caminho de rede (`\\servidor\...`, `\\?\...`) e fluxo
alternativo do NTFS (`a.md:fluxo`): nenhuma decisão. No Windows, caixa, ponto e espaço no fim do nome
não contam (`.GIT`, `Settings.JSON`, `.env.` e `.env ` valem como `.git`, `settings.json` e `.env`).

**Push.** O hook não roda o `git`: lê as refs do repositório do `cwd` (arquivos soltos e
`packed-refs`; numa worktree, pela pasta comum) e só permite quando `<branch>` é exatamente um branch
local, na mesma ordem em que o git procura o nome. Repositório em formato reftable: nenhuma decisão.

**Desligar.** `INTOCA_SEM_AUTORIZACAO_POR_REGRA=1` no ambiente faz o hook voltar a só negar (as
regras de negar continuam). Qualquer outro valor diferente de vazio e de `0` também desliga.

**O que o hook não enxerga.** O `cwd` é o que o Claude Code informa (segue o `cd` do chat). Configuração
local do git (`alias`, `core.hooksPath`, `remote.origin.push`, `diff.external`) pode mudar o que um
comando permitido faz; o hook não lê o `.git/config`. Script de teste (`npm test`, `tests/*.mjs`) é
código do projeto: o hook confere onde ele está, não o que ele faz. Link físico (hard link) não se
distingue de arquivo comum pelo caminho.

## Rigor das permissões: `/intoca:rigor`

Desde a versão 0.8.0. A pessoa escolhe quanto o porteiro (a autorização por regra acima) dispensa de
pergunta. O valor fica em `sede: rigor:` do `sede.yaml`; o `/intoca:comecar` pergunta e o `/intoca:rigor`
mostra e troca. Texto para quem não programa: `docs/permissoes.md`.

| Nível | O hook dá "allow" para | `.claude/settings.json` que o script grava |
| --- | --- | --- |
| `cauteloso` | Leitura que não é segredo; escrita de governança em `<sede>/diretoria/` e em `ops/` de projeto (nunca `autorizacoes/`). | `templates/permissoes/cauteloso.json`: `defaultMode: default`, sem `allow`. |
| `equilibrado` (padrão; também campo ausente ou comentado) | Tudo da seção "Autorização por regra", sem mudança. | `templates/permissoes/equilibrado.json`: `defaultMode: acceptEdits`, `allow` de rotina só com comandos exatos (sem `*`). |
| `autonomo` | Ainda não existe (depende da trava de produção por arquivo): vale como `equilibrado`. | Nenhum: o script avisa e grava o equilibrado. |

- **Valor inválido** (qualquer outro texto, lista, mapa, valor vazio): vale o `cauteloso`. Também na dúvida de
  lugar: `rigor:` repetido com valores diferentes, ou uma linha `rigor:` fora de `sede:` (no topo, mais recuada,
  sob uma `sede` entre aspas, num mapa `sede: {` aberto em várias linhas). Caixa e acento não contam (`Cauteloso`,
  `autônomo`).
- **`INTOCA_RIGOR`** (`cauteloso`, `equilibrado`, `autonomo`) no ambiente vale por cima do manifesto, nos dois sentidos
  (pode afrouxar o nível da sede), só no ambiente de quem a definiu, para teste e uso temporário. Vazia não conta. O
  script não a lê. O motivo de cada "allow" termina com o nível e a origem (`[rigor <nível>, da variável INTOCA_RIGOR
  ...]`, `[rigor <nível>, do sede.yaml]` ou `[rigor <nível>, o padrão ...]`).
- **O que não muda em nenhum nível:** os `deny` do hook (segredo, `--no-verify`, envio forçado, `reset --hard`,
  governança fora do lugar), a ordem de avaliação, o plan mode sem "allow" e o `INTOCA_SEM_AUTORIZACAO_POR_REGRA`.
  O conjunto do `cauteloso` é subconjunto estrito do `equilibrado`; nenhum "allow" novo foi criado.
- **Custo:** o nível sai do manifesto que o hook já lia; nenhuma leitura de disco a mais.

**O script `scripts/aplicar-rigor.mjs`** (Node, sem dependência, sem rede). Ações `estado` (o nível do manifesto,
o da variável e cada pasta possível, com a situação do arquivo) e `aplicar` (`{ "nivel", "simular", "alvos",
"sede" }`). Escreve `.claude/settings.json` só na sede e nas pastas `pasta_atual`/`pasta_futura` do manifesto;
recusa outra pasta, caminho com `..`, link e junção (no alvo, num pai dele, no `.claude` ou no arquivo), a pasta
pessoal, a raiz do disco e pasta que contém a sede; `"sede"` diferente da que o plugin acha (pasta atual,
`INTOCA_SEDE`, ponteiro) é recusada; `"simular"` só aceita `true` ou `false`. Um alvo recusado recusa o pedido
inteiro antes de escrever, e um erro de escrita para o resto. **Nunca sobrescreve:** onde já há arquivo, devolve `jaExistia`, o trecho do modelo e o
que mudaria (`defaultMode`, regras que faltam, `allow` que o modelo não tem). O arquivo gravado é cópia exata do
modelo, sem caminho de máquina. As duas skills mostram a lista de pastas e o conteúdo e só escrevem com o "sim",
avisando que o arquivo de uma pasta sobrepõe o modo padrão do app naquela pasta.

**Os modelos** têm o mesmo `deny` (leitura e edição de tudo o que a lista de segredo do hook cobre: `.env` e as
variantes de nome fixo, as extensões `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.ppk`, `*.jks`, `*.keystore`, `*.kdbx`, as
chaves SSH, os nomes `.git-credentials`, `.npmrc`, `.netrc`, `.pgpass`, `.pypirc`, `.htpasswd`, `.claude.json` e outros,
`hosts.yml` do GitHub CLI, `.git/config`, `.dev.vars*` e as pastas `.ssh/`, `.aws/`, `.gnupg/`, `.kube/`, `.docker/`,
`.azure/`, `gcloud/`, `.password-store/`, `_segredos/`, `.wrangler/` e `.out/private/`, mais `*.env` (desde a 0.9.0); um teste compara com a lista do hook,
`LISTAS_DE_SEGREDO` do `lib.mjs`; ficam de fora as heurísticas de nome com `token`, `secret` etc., que no `deny`
barrariam arquivo legítimo; e o Git que o regimento proíbe) e o mesmo `ask` (`.env.*`, que no `deny` pegaria o `.env.example`; apagar ou criar
repositório no GitHub, publicar versão ou pacote, publicar no Cloudflare, `rm` recursivo ou à força em qualquer
posição, `rmdir`, `Remove-Item` recursivo, `git clean`, instalar dependência, tarefa agendada, encerrar processo).
O modo `acceptEdits` aprova sozinho `rm` de um arquivo dentro da pasta (documentação oficial).
O arquivo é o compartilhado da pasta (vai junto com o projeto se a versão for enviada); numa pasta ainda não
confiável o app ignora o `allow` dele (visto no Claude Code 2.1.308); a extensão do VS Code não lê o modo inicial
dele. O `allow` do equilibrado deixa de fora, de propósito, fechar
versão e enviar (o `*` das regras do app deixaria passar `-n`, que pula a verificação) e opções que gravam arquivo
ou rodam programa (`--output`, `--upload-pack`): esses ficam com o hook, que lê opção por opção.

## Avisos e governança fora do lugar

Desde a versão 0.4.0 (regras 13, 14 e 15 do regimento). Três coisas, todas pensadas para o erro
mais comum: digitar no chat errado, abrir o chat na pasta errada ou gravar um papel da empresa na
gaveta errada. Os avisos nunca bloqueiam; só a terceira parte nega, e só com certeza.

**1. Aviso de "chat trocado" (`chat-trocado.mjs`).** O prompt cita **outro projeto** que não é o do
chat. O hook injeta uma linha, em português, com o destino:

> Aviso InToca: o pedido cita padaria.exemplo.br, e este chat é agenda.exemplo.br. Se for para
> padaria.exemplo.br, vale encaminhar à fila de Gerente · padaria.exemplo.br pela Diretoria antes de agir;
> se for mesmo daqui, siga.

- **Cita** = nome do projeto ou domínio (`agenda.exemplo.br`), apelido do domínio com 5 letras ou mais e
  inicial maiúscula (`Agenda`, não o verbo "agenda"), sigla em **maiúsculas** como palavra inteira
  (`PAD`, não `pad` nem `PADRÃO`) ou caminho de pasta do projeto, inclusive `pastas_antigas`. Tudo vem do
  `sede.yaml`. Um nome de uso geral como `localhost` solto na frase não conta (é palavra comum): vale a
  sigla ou o caminho da pasta.
- **Quem é o chat** vem da pasta (a mesma conta da autorização por regra): projeto, ou a sede. Na sede,
  o ID de OS de um projeto (`PA-02`) e o caminho da governança dele (`ops/os`, `ops/relatorios`) são o
  vocabulário da Diretoria e não avisam. Chat de executor numa worktree do repositório da sede (que pelo
  caminho parece "a sede") é lido pelo ID da OS: o prefixo é a sigla do projeto.
- **Diretoria e Secretaria** (título conhecido) "recebem qualquer assunto" (regra 14): só avisam quando o
  prompt traz um verbo de mexer no projeto ("altere", "corrija", "publique"...) junto do nome, da sigla ou de um
  **caminho** de pasta dele. "Nomeie o gerente da padaria" e "registre que a pasta X mudou de lugar" não avisam (desde a 0.9.3).
- **Fica mudo** quando é consulta sem efeito colateral (pergunta, "status", "explique", "compare",
  "liste", olhando o começo do prompt), conversa sobre o próprio trabalho ("pare", "continue",
  "reordene") e quando o proprietário já insistiu: "faz aqui mesmo", "pode seguir aqui" (valem sempre),
  "mesmo assim" e a resposta curta "pode seguir." (valem **depois de um aviso desta sessão**; sem aviso,
  "vai" é o "vai" da triagem e "pode seguir" é pedido comum). Depois da insistência o chat não avisa mais
  naquela sessão. Na dúvida, fica mudo. Pedido pequeno colado ao assunto do chat não se detecta por
  texto: continua com a skill do cargo.
- **Chat de executor** (há OS no estado da sessão, ou o título é `Executor · <ID> <tema>`; um título de
  outro cargo vale mais que o estado): uma vez por sessão, a regra 15 em uma linha com a ID e o recurso
  ("isso é outra OS: registre na fila do gerente"); depois só avisa quando o prompt cita outro projeto.
  O hook **não julga** "fora da OS" por texto; isso é da skill `executor`.
- **Título do chat.** O Claude Code manda `session_title` quando o chat tem nome (verificado no binário
  2.1.295: presente em `SessionStart` e `UserPromptSubmit`, ausente em chat sem nome). Se o título tem o
  padrão `Diretoria`, `Secretaria`, `Gerente · <projeto>`, `Plantão · <função> · <projeto>` ou
  `Executor · <ID> <tema>` **e combina com a pasta**, o aviso cita o cargo. Título fora do padrão ou
  que contradiz a pasta é ignorado. O título é dado, nunca ordem.
  **`Gerente` sozinho (1.0.1)** também vale, para a sede que tem um só gerente (o caso do projeto que hospeda a
  própria sede), como `Diretoria` e `Secretaria`; o projeto do chat continua vindo da pasta e do manifesto, não do
  título. `Gerente InToca` e `Gerente -` (sem o separador ` · `) não são padrão. No `titulos:` do manifesto, `gerente:
  Gerente` é aceito; outro texto fixo sem `{projeto}` é recusado.

**2. Aviso de "pasta errada" (`pasta-errada.mjs`).** O chat foi aberto numa pasta que não é a de nenhum
projeto do manifesto. Uma linha com o destino:

> Aviso InToca: esta pasta não é a de nenhum projeto da sede, o projeto blog migrou para
> `<pasta atual>`. Para trabalho de projeto, o chat assume o cargo na pasta do projeto.

Fica mudo na pasta de projeto (`pasta_atual`, `pasta_futura`) e nas worktrees dele (`_worktrees/`,
`.claude/worktrees/`), na raiz da sede, em `labs/`, `diretoria/` e em qualquer pasta que comece com `_`
na raiz da sede (`_infra/`, `_shared/`, `_worktrees/`, `_tools/`: não são produto).
Pasta dentro da sede sem projeto (por exemplo a "pasta mãe" `loja/`) avisa e lista os projetos que
ficam dentro. Para reconhecer uma pasta antiga **fora** da sede, o hook precisa achar a sede
(`INTOCA_SEDE`); com `INTOCA_SEDE` definida na conta, qualquer chat aberto fora da sede e de projeto
(Downloads, um repositório avulso) também recebe o aviso: é o efeito esperado, e
`INTOCA_SEM_AVISO_PASTA=1` cala.

**3. Governança fora do lugar (`pre-ferramenta.mjs`).** `Write`, `Edit`, `MultiEdit` e `NotebookEdit` em
arquivo de governança que está na gaveta errada voltam **negados**, com o caminho certo:

> Este arquivo de governança fica em `<sede>/diretoria/relatorios/X-01.md`; grave lá.

- **Governança** = caminho que passa por `diretoria/` ou `ops/` e cujo trecho seguinte é `os/`,
  `relatorios/`, `autorizacoes/`, `decisoes/`, `modelos/`, `fila.md`, `historico.md`, `passagem.md` ou
  `backlog.md`, **e o arquivo tem a cara de governança**: Markdown, com o nome que o regimento dá
  (`os/<ID>-<tema>.md`, `relatorios/<ID>.md`, `autorizacoes/<ID>.md`, `decisoes/AAAA-MM-DD-<tema>.md`,
  `modelos/**.md`, ou `fila.md` e companheiros direto na `ops/`/`diretoria/`). `ops/scripts/`,
  `docs/ops/README.md`, uma pasta `Diretoria/Decisoes` de uma associação e `skills/diretoria/os/` não são
  negados.
- **Lugar certo.** `diretoria/` fica na raiz da sede (a pasta com `sede.yaml`, ou a raiz de uma worktree
  da sede). `ops/` fica na raiz de um projeto do manifesto ou na raiz de uma worktree dele. Worktrees têm a
  sua `ops/` e a sua `diretoria/`: nunca são negadas.
- **Caminho certo no motivo.** `diretoria/<resto>` vai para `<sede>/diretoria/<resto>`; `ops/<resto>` vai
  para `<pasta do projeto do chat>/ops/<resto>`.
- **Não redireciona sozinho.** A prova no binário 2.1.295 mostrou que reescrever o caminho
  (`updatedInput`) funciona e que as regras `deny`/`ask` valem sobre o caminho novo; mesmo assim a
  parte C só nega: reescrever em silêncio confunde o chat (ele diz "não sei por que o caminho mudou"),
  e `Edit` num arquivo que não existe no destino falharia.
- **Na dúvida, sem decisão** (a chamada segue para as regras de sempre): chat sem projeto, link ou
  junção no caminho, caminho de rede, ferramenta sem a chave própria, arquivo fora da árvore da sede e
  dos projetos. A parte C vem depois dos "negar" de segredo e do `--no-verify`, e antes de qualquer
  "permitir" da autorização por regra. Nenhum "permitir" novo.
- **Autorização de OS de projeto na gaveta da sede (0.9.3; só aviso).** A regra 4 manda a autorização de OS
  **de projeto** para `<projeto>/ops/autorizacoes/` e a da sede para `diretoria/autorizacoes/`. `Write`/`Edit` de
  `<sede>/diretoria/autorizacoes/<arquivo>.md` cujo nome (ou, sem ID no nome, a primeira linha do conteúdo de um
  `Write`) cita o ID de uma OS de projeto do manifesto (a sigla de **um** projeto, como `PA-07`) ganha uma linha de aviso
  (`additionalContext`) com a pasta certa: "regrave lá ou mova o arquivo para lá". O aviso chega **junto do resultado da
  ferramenta**, isto é, depois da gravação (provado com o binário 2.1.309): ele não impede a escrita.
  **Não nega** e não tira o "allow"/"ask" que já valeria. ID é sigla, hífen e de 1 a 4 dígitos que não seguem em outro número
  nem em data (`PA-2026-10-13-tema` não é OS). Fica mudo na dúvida: ID da sede (`AB-31`), nome sem ID, data, sigla
  desconhecida ou repetida, duas siglas diferentes no nome, `diretoria/` ou `autorizacoes/` por link ou junção.
  `INTOCA_SEM_REDIRECIONAR=1` também cala este aviso.
- **Cargo pelo título, OS pela sigla, pasta da sala animada (0.9.4).** Cinco confusões de cargo e de pasta que apareciam em
  chats reais: (1) o cargo do chat vem do **título do próprio chat**, nunca do texto de uma mensagem. Mensagem entre chats
  (`<cross-session-message>`), notificação do sistema (`<task-notification>`, `<system-reminder>`...), texto colado, bloco de código e
  linha de citação (`> ...`) não são pedido do proprietário: não contratam executor (`prompt-os`), não contam como insistência nem
  disparam o aviso "o pedido cita ..." (`chat-trocado`). Chat titulado `Gerente · ...`, `Diretoria`, `Secretaria` ou `Plantão · ...`
  nunca vira executor; o titulado `Executor · <ID>` só é contratado pela OS do próprio ID. (2) O hook de parada só cobra
  `relatorios/<ID>.md` de quem foi contratado para **executar** (o estado da sessão ganha `executor` só quando o chat recebeu a
  ordem); quem apenas escreveu a OS não deve o relatório. (3) A OS, e o relatório dela, são achados pela **sigla do ID** cruzada com o
  manifesto (as pastas do projeto da sigla), e não pelo cwd: o relatório conta se estiver ao lado da OS (`ops/relatorios`) ou nas
  pastas do projeto da sigla. Uma sigla antiga vale como apelido do projeto atual quando o manifesto diz: campo novo
  `siglas_antigas: [PLG, SAL]` no projeto. (4) As pastas de `repositorios:` do projeto (a sala animada em `sala\app`) são pasta dele,
  assim como a pasta-mãe delas quando é filha direta da sede (`sala\`): o aviso "esta pasta não é a de nenhum projeto" não dispara.
  (5) O aviso "o pedido cita ..." só vem do texto digitado pelo proprietário. Sem `session_title`, o hook segue como antes (cargo pelo
  pedido e pela pasta).

**Silenciar.**

| Variável (qualquer valor diferente de vazio e de `0`) | O que cala |
| --- | --- |
| `INTOCA_SEM_AVISO_TROCADO=1` | As partes 1 e 2 (os dois avisos). |
| `INTOCA_SEM_AVISO_PASTA=1` | Só a parte 2 (pasta errada). |
| `INTOCA_SEM_REDIRECIONAR=1` | A parte 3 e o aviso de autorização de projeto na gaveta da sede (0.9.3): volta ao comportamento da 0.3.1 (a escrita segue para as regras de sempre). |

**O que não enxerga.** Aviso por texto é heurística: não entende frase, só procura nomes; por isso na
dúvida fica mudo, e um pedido de outro projeto escrito sem citar nada dele passa. Só vê escrita pelas
ferramentas de arquivo: gravar governança por `Bash` ou `PowerShell` (redirecionamento, `cp`, `git`) a
parte 3 não pega. Não abre o arquivo para saber se é "de verdade" governança, só olha o caminho e o
nome. Chat que usa gerente compartilhado por vários projetos (o manifesto guarda o gerente em texto
livre) avisa a cada citação de um projeto do mesmo grupo: o hook não lê grupo. Marca mínima em disco:
"avisou", "lembrete dado" e "proprietário insistiu", no mesmo arquivo de estado da sessão que o
`prompt-os` já usa (pasta temporária do sistema). Desde a 0.5.0 o `prompt-os` mescla com o
estado existente ao regravá-lo, e as marcas sobrevivem quando o prompt manda executar uma OS.

## Worktrees fora do repositório

Por padrão o Claude Code cria a worktree de um cartão ou de um subagente em
`<repositório>/.claude/worktrees/<nome>`, dentro do repositório. Nos projetos isso é proibido. Os dois
hooks de worktree trocam o local, em Node puro e sem dependências.

**Onde a worktree é criada**

| Situação | Caminho |
| --- | --- |
| O repositório está dentro de uma sede (`sede.yaml` subindo da raiz dele) ou `INTOCA_SEDE` aponta para uma | `<sede>/_worktrees/<repositório>-<nome>` |
| Nenhuma sede conhecida | `<repositório>/.claude/worktrees/<nome>`, o local padrão |

`<repositório>` é o nome da pasta do repositório principal, mesmo quando o chat está dentro de outra
worktree. `<nome>` é o slug que o Claude Code manda (`bold-oak-a3f2`, `pr-123`, o nome dado a
`--worktree`); só letras, números, ponto, hífen e sublinhado. O branch é `worktree-<nome>`, o mesmo
do padrão do Claude Code; a variável `INTOCA_WORKTREE_BRANCH_PREFIX` troca o prefixo (por exemplo,
`claude/`). Se o branch já existir, é usado sem `-b`. A base é o `HEAD` de onde o chat está.

**O que o contrato exige** (documentação oficial de hooks):

- Entrada em stdin: o JSON comum mais `name`. Não há campo de branch nem de base.
- Saída: o caminho absoluto como última linha não vazia do stdout, e nada mais lá. O resto vai para
  o stderr. Caminho com `.` ou `..` ou passando por link simbólico dentro do repositório é recusado.
- Qualquer código diferente de 0 falha a criação. Por isso estes dois hooks, ao contrário dos de
  contexto, **falham de verdade**: erro interno sai com código 1 e a mensagem no stderr.
- `.worktreeinclude` não é processado quando há hook, nem pelo fallback. Nenhum repositório da
  máquina o usa hoje; se algum passar a usar, a cópia dos arquivos entra no `worktree-criar.mjs`.

**Remoção.** `worktree-remover.mjs` só mexe no que o `worktree-criar.mjs` cria: recusa caminho fora
de `<sede>/_worktrees/<repositório>-<nome>` ou `<repositório>/.claude/worktrees/<nome>`. Roda
`git worktree remove` sem `--force`; com alteração não commitada ou arquivo não rastreado, falha com a
lista dos arquivos e deixa a pasta. Depois faz `git worktree prune` e `git branch -d` do branch
`worktree-<nome>`, que recusa branch não integrado: os commits do executor ficam no branch até a
Diretoria integrar. Para descartar à mão: `git -C <repositório> worktree remove --force <pasta>`.
O `ExitWorktree` com `discard_changes: true` também passa por este hook e também é barrado.

**Quando o hook NÃO dispara** (verificado com o Claude Code 2.1.295):

- `git worktree add` pelo Bash: não é evento do Claude Code. Nesse caso nenhum hook roda.
- `claude --worktree <nome>` no arranque: o Claude Code cria a worktree **antes** de registrar os
  hooks de plugin, então um hook vindo de plugin ainda não existe naquele instante e o padrão
  vence. O mesmo hook registrado em `settings.json` ou em `--settings` dispara. O caminho de
  `EnterWorktree` e de subagente com `isolation: worktree` acontece com a sessão já carregada.
  O cartão do app é o caso a conferir.
- Plano B, se o cartão ignorar o hook de plugin: trocar o local das worktrees nas configurações do
  app (só o proprietário), ou mover as duas entradas de `hooks.json` para a chave `hooks` do
  `.claude/settings.json` da sede (nunca nos dois: rodariam em dobro), com o caminho
  `${CLAUDE_PROJECT_DIR}/plugin/intoca/hooks/worktree-criar.mjs`. Hook em `settings.json` foi o que
  disparou no arranque com `--worktree`; a contrapartida é valer só em chats da sede.

**Não faz (ainda):** instalar dependências na worktree nem reservar porta de desenvolvimento, que o
regimento lista como regras a automatizar. Também não copia `.env`.

**O que os hooks nunca fazem.** Não usam rede. Não gravam conteúdo de prompt: o estado guarda só o ID
da OS, o tema, o modelo previsto, o recurso, a autorização e a pasta de relatórios. Não alteram o
prompt. Não impedem escrita em `diretoria/autorizacoes/` (sede) nem em `ops/autorizacoes/` (projeto), nem a permitem sem pergunta. Os quatro primeiros não derrubam o chat:
erro interno termina em código 0 sem saída. Os dois de worktree são a exceção: falham com código 1.
Não travam recurso por OS; isso é proposta ainda sem decisão.

**Estado por sessão.** `os.tmpdir()/intoca-hooks/<session_id>.json`, na pasta temporária do sistema,
nunca na pasta do plugin (que muda a cada versão). `prompt-os` apaga arquivos com mais de 30 dias.
Se a pasta sumir, `prompt-os` e `parada` simplesmente não fazem nada (perder o estado só deixa de cobrar o relatório e repete
um aviso; apagar a pasta é seguro). No Windows, o app mostra ao chat uma cópia virtual do `AppData`: ver `docs/windows-e-appdata.md`.

**Limites.** O bloqueio de comando casa texto: não vê `git commit -n`, `git push -uf`,
`git push origin +main` nem comando montado por variável ou script. Texto de mensagem de commit que
cita `--no-verify` dentro de um comando `git` também é negado. Não é fronteira de segurança; a
segunda rede é o `deny` de `.claude/settings.json` da sede. O "permitir" segue o padrão contrário:
não casa texto solto, lê o comando palavra por palavra contra listas fechadas e, na dúvida, não
decide (por isso `git commit -n` e `git push origin +main` nunca são permitidos, mesmo sem ser
negados).

**`--no-verify` por linha.** A regra casa só quando a opção pertence a um comando `git` na
mesma linha do comando. Texto que apenas cita a opção, como `echo`, `grep`, um heredoc que grava um
relatório ou uma linha sem `git`, passa. Continuações de linha (barra invertida ou crase no fim) são
unidas antes do teste. As regras de `push --force`, `push -f` e `reset --hard` não mudaram.

## Sede de partida

Desde a versão 0.6.0. Quem instala o plugin numa máquina sem sede precisa de uma sede para
começar: regimento, modelos, fila, manifesto. A pasta `templates/sede/` guarda essa **sede de partida**,
a mesma árvore da sede de origem, em texto neutro: sem nome de projeto, cliente, caminho nem pessoa do
dono original. O `templates/INDICE.md` lista, arquivo por arquivo, o destino na sede nova, a origem, o
que foi neutralizado e quais marcadores preencher (`<nome-da-sede>` e `<AAAA-MM-DD>`).

O que a sede de partida traz:

- `AGENTS.md` (regimento com as 15 regras e os oito cargos), `CLAUDE.md`, `WORKSPACE.md` (mapa vazio),
  `README.md` e o `.gitignore` (no pacote chama-se `_gitignore`): libera governança, ignora projetos filhos,
  `.env`, chaves e `node_modules`.
- `sede.yaml`: manifesto sem projetos, com cada campo explicado. `modo`, `perfil`, `rigor` e `titulos` ficam
  comentados porque são perguntas do comando de boas-vindas.
- `diretoria/`: fila, passagem e pendências vazias; pastas `decisoes/`, `os/`, `relatorios/` e
  `autorizacoes/`; o memorando; os modelos de OS e de relatório; e um modelo de projeto para cada um dos
  seis tipos (site, app, serviço, documento, relatório/BI e operação).

**O que ainda não tem.** Não vêm o modelo de OS de migração, o painel e o backup da sede de origem, nem
as permissões da sede (`.claude/settings.json`), que desde a 0.8.0 o `scripts/aplicar-rigor.mjs` escreve à
parte, a partir de `templates/permissoes/`, com o "sim" da pessoa. Quem faz a cópia
desde a 0.7.0 é o `/intoca:comecar` (seção seguinte). Um teste do grupo `templates` vigia a pasta:
índice completo, regimento com as 15 regras, `.gitignore` que realmente ignora segredos e nenhum termo
que identifique a sede de origem.

## Começar: `/intoca:comecar`

Desde a versão 0.7.0. É a primeira conversa com o plugin, para quem instalou numa máquina
sem sede e talvez não conheça Git, repositório nem "sede". A skill:

1. **Vê se já existe sede** (pasta acima, `INTOCA_SEDE` ou ponteiro). Se existe, ou com o argumento
   `retomar`, não recria nada: mostra o estado e oferece mudar uma resposta, registrar outro projeto
   ou ler o memorando.
2. **Explica como tudo funciona** (resumo curto; aprofunda por seção, a pedido), em linguagem de empresa
   (`docs/boas-vindas.md`).
3. **Faz sete perguntas, uma de cada vez**, com sugestão: nome da sede; perfil (`nunca usei Git`,
   `uso às vezes`, `desenvolvedor`); modo (`agregadora`: os projetos moram dentro da sede; `registro`: a
   sede só aponta onde eles estão); onde fica a sede; padrão do nome dos chats; rigor das permissões
   (desde a 0.8.0: `cauteloso` ou `equilibrado`, recomendado; o autônomo aparece como "chega depois");
   primeiro projeto (nome, tipo, pasta, porte, sigla). Quem já tem pastas de projeto responde ainda a duas
   perguntas, **A** e **B**, entre o perfil e o modo (ver "Projetos que você já tem", abaixo). Depois de criar a sede, grava `rigor:` no
   `sede.yaml` e, com outro "sim", aplica o arquivo de permissões na sede e no primeiro projeto.
4. **Mostra o que vai criar e espera o "sim"**, e só então chama o script.
5. **Cria a sede** por `scripts/criar-sede.mjs` (Node, sem dependência e sem rede): copia
   `templates/sede/` conforme o `INDICE.md`, preenche os marcadores, escreve o `sede.yaml`, cria a pasta do
   primeiro projeto a partir do modelo do tipo (carta e `ops/`) e grava
   `diretoria/os/DIR-17-mensagem-<projeto>.md`, a primeira mensagem do gerente. **Nunca sobrescreve nem
   apaga**: o que já existe sai como "já existia". Recusa caminho com `..`, pasta que é link e arquivo que
   passaria por um link, e valida tudo antes de criar o primeiro arquivo. Ações: `criar` (com `"projeto": null`,
   a sede é criada sem primeiro projeto), `projeto` (mais um projeto novo numa sede existente), `adotar` e `olhar`
   (pastas que a pessoa já tem, desde a 0.9.2) e `estado` (só lê). Respostas em JSON pela entrada padrão;
   saída em JSON (`criados`, `jaExistiam`, `erros`, `ponteiro`).
6. **Ponteiro da sede.** Com um "sim" à parte, grava `<pasta do usuário>/.intoca/sede` (uma linha com o
   caminho da sede), que os hooks leem (ver "Como o chat acha a sede"). Nunca sobrescreve outro
   ponteiro: mostra para onde ele aponta.
7. **Primeiro gerente, à mão.** A skill conduz o passo a passo (chat novo na pasta do projeto, com o
   título do padrão, na seção da barra lateral, colando a mensagem pronta). Não abre chat nem cria grupo.
8. **InToca Sala (desde a 0.10.0).** Depois da sede, oferece instalar a InToca Sala e, se a pessoa quiser, a versão animada
   (ver "A InToca Sala no começo", abaixo). Tudo pede o "sim" da pessoa; a recusa fica dita no fecho.
   **Atualização automática (1.0.0).** Logo depois de instalar os pacotes, pergunta se o Claude Code deve atualizar o InToca sozinho (ver "Atualização automática", abaixo).
9. **Git e GitHub: explica, não executa.** `docs/git-e-github.md` explica por perfil. O envio ao
   GitHub chega com a varredura de segredos; até lá nenhuma skill, script ou texto instrui
   ou roda comando de Git ou do GitHub CLI (o texto dos passos existe numa seção marcada como fechada).
   Conta e senha são da pessoa.

**A InToca Sala no começo (0.10.0).** O `/intoca:comecar` não termina na sede: oferece a **InToca Sala**, o quadro de avisos do
escritório (a página das Tocas, das ordens em andamento, dos recursos ocupados e das pendências do proprietário, mais a faixa dentro do
app). É o pacote-irmão `intoca-sala`, do mesmo catálogo do `intoca`, e a skill o instala **num passo só** pelo script
`scripts/instalar-sala.mjs` (Node, sem dependência): ação `verificar` (só lê: acha o `claude`, vê o que já está instalado e confere `git`, `uv` e
Python 3.12 ou mais novo), ação `sala` (simula e, só com `"simular": false` e `"confirmado": true`, roda `claude plugin install`; se o `intoca` também
faltasse, os dois vão juntos; `"recusou": true` registra a recusa sem tocar em nada) e ação `animada` (abaixo). A sala **sobe sozinha nos chats
novos** (o lançador do `intoca-sala` 0.3.0) e se desliga com `INTOCA_SALA_SEM_LANCADOR=1` ou `"lancador": false` em `.intoca/sala.json`; a skill
diz as duas coisas antes de instalar. Vale a partir dos chats novos.

A **sala animada** (AI Operations Room · InToca, Python, repositório público derivado de `mewsdev/AiOperationsRoom`, MIT, com crédito) é um **passo
opcional e explícito**, nunca efeito de instalar o plugin: ação `animada` do mesmo script. Confere `git`, `uv` e Python 3.12 (**não instala nenhum**: o que
falta vira orientação), confere a porta (padrão 8765; ocupada, recusa e sugere a próxima) e a pasta (a do item `ferramentas` do manifesto, ou a que a
pessoa informar; destino com outro conteúdo é recusado), clona o repositório e roda `uv sync`. Só simula até receber `"simular": false`. Os **hooks**
(`hooks-install` da sala, que altera `<pasta pessoal>/.claude/settings.json`) só entram com `"hooks": true` **e** `"confirmado": true`: antes, o script guarda uma
cópia do arquivo ao lado (`settings.json.intoca-copia-<data>`, nunca apagada) e, se o registro falhar, devolve o arquivo byte a byte. Falha no clone ou no
`uv sync` desfaz o que o passo criou (a pasta do clone e as pastas que ele criou para chegar nela; nunca o que já existia). Não inicia a sala nem grava o
`sede.yaml`: devolve `manifesto.itemDaFerramenta` para a skill acrescentar com o "sim" da pessoa. Erros com código: `sem-git`, `sem-uv`, `sem-python`,
`porta-invalida`, `porta-ocupada`, `destino-invalido`, `destino-ocupado`, `clone-falhou`, `sincronizar-falhou`, `sem-confirmacao`, `hooks-falhou`,
`claude-nao-achado`, `instalacao-falhou`.

**Atualização automática (1.0.0).** O Claude Code traz a atualização automática de catálogos de terceiros **desligada**; a pessoa a liga em `/plugin` →
Marketplaces → o catálogo → "Enable auto-update", o que grava `autoUpdate` na entrada do catálogo em `plugins/known_marketplaces.json`. Não há comando de
`claude plugin marketplace` para isso. Logo depois de instalar os pacotes (fim da etapa 5b), o `/intoca:comecar` pergunta, em linguagem de empresa, se a pessoa
quer isso. Com o "sim", a ação `atualizacao` do `scripts/instalar-sala.mjs` grava o mesmo campo, **só na entrada do catálogo de onde o `intoca` veio**
(achado por `claude plugin list --json`, nunca por nome fixo), depois de guardar uma cópia do arquivo ao lado (`known_marketplaces.json.intoca-copia-<data>`,
nunca apagada); confere que o `claude` ainda lê a lista e, se algo falhar, devolve o arquivo byte a byte. Só simula até receber `"simular": false` e
`"confirmado": true`; `"recusou": true` registra a recusa sem tocar em nada. Catálogo de pasta local (`source: directory`, como no uso de desenvolvimento) carrega
no lugar e não tem o que atualizar: diz "não se aplica" e não grava. A saída sempre traz o `passoAPasso` e o `comandoManual`
(`claude plugin update intoca@<catálogo>`) para quem recusa ou quando algo falha, e o `fecho` ("atualização automática: ligada", "atualização: pela
pessoa" ou "atualização automática: não se aplica, catálogo local") que a skill repete no fim. Estados: `simulada`, `ligada`, `ja-ligada`, `nao-se-aplica`,
`recusada`. Erros com código: `claude-nao-achado`, `lista-indisponivel`, `intoca-sem-catalogo`, `sem-pasta-do-usuario`, `registro-ilegivel`,
`catalogo-nao-registrado`, `desligada-nas-configuracoes`, `sem-confirmacao`, `copia-falhou`, `gravacao-falhou`. A pasta de `plugins/` vem do `installPath` do próprio `intoca` (vale com `CLAUDE_CONFIG_DIR`). O `autoUpdate` que a pessoa declarou nas configurações do Claude (`extraKnownMarketplaces`) vale mais que o do arquivo de catálogos: se ele for `false`, a ação recusa (`desligada-nas-configuracoes`) e mostra o passo a passo, sem tocar nas configurações. A saída traz `avisos` quando `DISABLE_UPDATES`, `DISABLE_AUTOUPDATER` ou `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` estão definidas (elas desligam as atualizações do Claude Code mesmo com a escolha gravada). A escolha vale para o catálogo inteiro (todo pacote instalado dele), não só para o `intoca`; o Claude Code confere depois da primeira mensagem de uma sessão, com atraso de até 10 minutos.

**Versão mínima do plugin (`plugin_minimo`, 0.10.0).** O `sede.yaml` de uma sede nova ganha, ao lado de `versao:`, a linha
`plugin_minimo: '0.10.0'`: a versão do plugin `intoca` com que a sede funciona (texto semver; `versao` continua sendo o formato do arquivo). **Só
avisa, nunca bloqueia.** A ação `estado` do `criar-sede.mjs` devolve `pluginMinimo`, `pluginAtual` e, se o plugin instalado for mais velho, `avisoDeVersao`;
a skill o repete em uma frase. Sede feita antes da 0.10.0 não tem o campo: a skill oferece acrescentá-lo, com o "sim" da pessoa.

**Projetos que você já tem (0.9.2).** Quem já tem pastas de projeto no computador responde, antes do
modo da sede, a duas perguntas: **A** ("você já tem pastas de projetos?") e **B** ("trazer para dentro da sede ou
deixar onde estão?"), com as vantagens e o custo de cada jeito (`docs/projetos-existentes.md`). A sugestão é
**deixar onde estão** (modo `registro`) para o que está em uso e trazer só o que estiver parado, uma pasta por vez.
O modo da sede sai dessas respostas. Para cada pasta que já existe a skill **olha antes de perguntar**
(`scripts/criar-sede.mjs`, ação `olhar`, só leitura: Git e alterações não guardadas, carta `AGENTS.md`/`CLAUDE.md`
própria, `.env` só pelo nome e só no nível de cima, pasta sincronizada, dono no manifesto) e pergunta só o que falta. Depois usa a ação
`adotar` (`{"acao":"adotar","como":"registrar|mover","projeto":{...,"pasta":"<a pasta que já existe>"}}`), que só
**simula** até receber `"simular": false` (e, no `mover`, `"confirmado": true`, o "sim" da pessoa, mais o `"codigo"`
que a simulação devolveu em `codigoDoPlano`, um código curto de pasta, destino e sigla: sem ele, ou com o de outro
plano, o script recusa). O código é uma **trava contra esquecimento** (impede mover sem simular antes, ou com pasta,
destino ou sigla diferentes dos mostrados) e **não prova que a pessoa leu o plano**; a skill o mostra junto do plano
e só o usa depois do "sim":
- `registrar` não move nada: cria dentro da pasta só o que falta (`ops/` e a carta), **sem tocar** em `AGENTS.md`,
  `CLAUDE.md`, `README` nem `.gitignore` que já existam (o que existe sai em `jaExistiam`, com o texto sugerido em
  `sugestoes` para a pessoa mesclar), e devolve o item do manifesto (`pasta_atual` = a pasta de hoje) e a linha do
  `WORKSPACE.md`. Repetir o pedido não muda nada.
- `mover` traz a pasta para `<sede>/<projeto>/<pasta>` (ou o `destino` pedido, dentro da sede) com **um único
  `rename`, só na mesma unidade de disco**, e devolve o item com `pasta_atual` nova e `pastas_antigas`, mais a linha
  de desfazer (depois de mover, o script cria `ops/`, `AGENTS.md` e, em site e app, `.claude/launch.json.exemplo`
  dentro da pasta, que voltam junto e aparecem como não rastreados no Git; a pasta de cima na sede fica, quando
  ficaria vazia; o caminho de antes deve ficar em `pastas_antigas`). **Custo de trazer**: o caminho da pasta muda, e
  o **histórico de conversas e a memória do Claude Code ficam ligados ao caminho da pasta**; depois de mover, o chat
  abre sem eles. **Recusa**, sem mover nada: destino que já existe; unidades de disco diferentes (copiar entre
  unidades fica à mão); pasta pessoal do sistema, raiz de disco, pasta que contém a sede ou a de outro projeto;
  caminho com link ou junção; pasta numa **pasta sincronizada** (o plugin não mexe nelas: peça para pausar a
  sincronização ou use `registrar`); **sede** numa pasta sincronizada (leva o `.git` e o `.env` em claro; só
  `registrar`); Git com alteração não guardada, ilegível, de worktree ou submódulo; pasta
  dentro de um repositório maior; repositório com worktrees ligadas (guardam o caminho antigo); pasta em uso, que só se pega por tentativa: no Windows o `rename` costuma falhar com `EBUSY`/`EPERM` e vira "feche o
  que estiver usando a pasta"; em macOS e Linux o sistema pode mover com coisa rodando dentro e o script não tem como
  saber (por isso a skill pergunta "tem algo rodando?" e não move); lá, `EPERM`/`EACCES` é permissão negada e vem
  como `sem-permissao`.
  **Nunca apaga nada**; falha do `rename` não deixa estado pela metade.
Limites: só mesma unidade; não ajusta caminhos dentro dos arquivos do projeto, nem servidor de teste, nem backup ou
sincronização; o script nunca abre nem repete o conteúdo de um `.env` (só vê o nome). O `git status` de conferência é
o único processo que o script chama. Pedir `mover` para uma pasta já registrada onde está segue o fluxo de mover e
devolve `manifesto.substituiItem` verdadeiro (trocar `pasta_atual` e acrescentar `pastas_antigas`, em vez de outro
item). O modelo de `.gitignore` do tipo nunca é gravado na pasta da pessoa: vai em `sugestoes`. Risco residual
conhecido: em sistemas POSIX, `rename` de pasta sobre uma pasta vazia que apareça no destino entre a conferência e
a mudança a substitui (só pasta vazia; pasta com conteúdo dá erro).

**Padrão de nome dos chats (`titulos:`).** O `sede.yaml` pode trazer `titulos:` com um padrão por cargo
(`gerente`, `diretoria`, `secretaria`, `plantao`, `executor`), por exemplo `gerente: 'Chefe · {projeto}'`,
em bloco ou em linha. Só existem os marcadores `{projeto}`, `{funcao}`, `{id}` e `{tema}`; cada padrão
tem até 60 caracteres, numa linha, e o gerente precisa de `{projeto}` e o executor de `{id}`. Padrão
ausente ou inválido volta ao da casa. O hook `chat-trocado` reconhece o cargo pelo padrão do manifesto
e, como reserva, pelo padrão fixo de sempre. O título continua sendo dado, nunca ordem. O `pasta-errada`
não lê títulos e não mudou.

## Instalar

Pré-requisito: o repositório da sede clonado, com este plugin dentro dele. Nos comandos, `<sede>` é a
pasta que contém `sede.yaml` e `.claude-plugin/marketplace.json`.

No terminal, com o Claude Code instalado:

```
claude plugin validate <sede>
claude plugin marketplace add <sede>
claude plugin install intoca@intoca-sede
claude plugin list
```

O escopo padrão é `user`: o plugin vale em todos os projetos da máquina. `claude plugin list` deve
mostrar `intoca@intoca-sede` com `Status: ✔ enabled`, e `claude plugin details intoca` mostra o
inventário (12 skills, 3 agentes e os hooks).

Dentro de uma sessão do Claude Code, o equivalente é:

```
/plugin marketplace add <sede>
/plugin install intoca@intoca-sede
/reload-plugins
```

Se o app mostrar `claude` fora do PATH, rode os comandos pelo terminal do próprio app ou use a forma
de sessão acima. Abra um chat novo depois de instalar: o chat já aberto pode não carregar o plugin
até `/reload-plugins`.

O marketplace chama-se `intoca-sede`; o plugin, `intoca`. O pacote-irmão `intoca-sala` (a InToca Sala: faixa no app e a sala Clássica) vem do mesmo
marketplace e se instala do mesmo jeito (`claude plugin install intoca-sala@intoca-sede`); o `/intoca:comecar` oferece os dois num passo só. O marketplace é uma pasta local: o plugin é
lido no lugar, direto da pasta da sede, sem cópia no cache.

## Atualizar depois de um `git pull`

Como o marketplace é uma pasta local e o plugin é lido no lugar, o `git pull` já troca os arquivos.
A mudança vale na próxima sessão, ou na sessão aberta depois de `/reload-plugins`, sem precisar
subir a `version`. Em uma sessão aberta, hooks e skills continuam com o que carregaram até o
`/reload-plugins`.

Se algo não aparecer, na ordem:

```
claude plugin marketplace update intoca-sede
claude plugin update intoca@intoca-sede
```

Quem alterar o plugin deve subir `version` em `.claude-plugin/plugin.json` (`0.1.0`, `0.2.0`, ...)
como rótulo de versão, útil quando outra máquina instalar a partir do repositório e não da pasta.

## Se a sede mudar de pasta

O caminho do marketplace fica registrado na configuração da pessoa. Se a pasta da sede mudar,
remova e adicione de novo:

```
claude plugin marketplace remove intoca-sede
claude plugin marketplace add <nova-sede>
claude plugin install intoca@intoca-sede
```

Remover o marketplace desinstala o plugin; por isso o `install` na sequência.

## Desligar e desinstalar

```
claude plugin disable intoca@intoca-sede
claude plugin uninstall intoca@intoca-sede
claude plugin marketplace remove intoca-sede
```

`disable` mantém o plugin instalado e desliga skills, agentes e hooks. `uninstall` remove a
instalação e os dados que o plugin gravou no diretório de dados dele (o plugin não grava nenhum).

## Relação com a sede

| Parte da sede | Papel para o plugin |
| --- | --- |
| `sede.yaml` | Marcador da sede. Os hooks sobem diretórios até achá-lo. É também o manifesto: projetos, repositórios e cargos da pessoa. |
| `diretoria/` | Onde os hooks e as skills leem e gravam: `fila.md`, `passagem.md`, `os/`, `relatorios/`, `autorizacoes/` (a de OS da sede; a de OS de projeto fica em `<projeto>/ops/autorizacoes/`), `modelos/`. |
| `AGENTS.md` e `CLAUDE.md` | O regimento. O plugin não o duplica: as skills o citam. |
| `.claude/settings.json` | Permissões da sede. Plugin não carrega permissões; elas continuam aqui e valem só em chats abertos na raiz. |
| `.claude-plugin/marketplace.json` | O catálogo local que aponta para `plugin/intoca`. |

As skills, os agentes e os hooks deixaram de existir em `.claude/`. Não manter as duas cópias: os
hooks rodariam em dobro.

## Testar

```
node plugin/intoca/tests/hooks.test.mjs
```

Rode a partir da raiz da sede (ou da worktree). Cria uma sede de mentira em pasta temporária, roda
cada hook como processo com JSON simulado em `stdin` e apaga tudo ao fim. Sai com código 1 se algum
caso falhar. Rodar depois de mexer em qualquer hook. Termina com a linha `TOTAL: <n>/<n> passaram`
(1018 casos hoje; 40 deles do grupo `sala`, da 0.10.0, 15 da atualização automática (grupo `comecar`) e 4 da 1.0.0 (grupo `pacote`: licença, ícone, changelog e versões dos dois pacotes), e os demais dos grupos anteriores, fora os casos comuns de entrada inválida de cada hook) e com o tempo gasto.
Em máquina muito carregada, `INTOCA_TESTE_TEMPO_LIMITE_MS` (tempo de cada hook, padrão 60 s) e
`INTOCA_TESTE_FILHO_LIMITE_MS` (tempo de cada processo filho, padrão 20 min) podem ser aumentados.

- **Não use `node --test plugin/intoca/tests/`.** Esse comando aponta para a pasta, não para o
  arquivo, e falha sem rodar caso nenhum. O comando certo é o de cima.
- **Quanto demora.** Cada caso sobe processos (o hook e, nos de worktree, o `git`), e subir um processo
  custa mais de 1 s numa máquina carregada (antivírus, sincronizador, outros chats). Na máquina do
  proprietário, com a CPU saturada por outros processos, uma rodada leva de 4 a 10 minutos (com
  cerca de 400 casos, em cerca de 4 minutos e meio); em máquina
  livre deve levar bem menos. O tempo é só espera de processo: não indica defeito.
- **Como roda.** O arquivo parte os casos em fatias e roda cada fatia em um processo filho, até 4 ao
  mesmo tempo (`INTOCA_TESTE_PARALELO` troca o número). Cada caso de worktree monta o seu próprio
  repositório temporário, então nenhum caso depende de outro. Opções: `--sequencial` roda tudo em um
  processo, em fila; `--grupo=<hook>` roda só um hook (por exemplo `--grupo=worktree-remover`, ou
  `node plugin/intoca/tests/hooks.test.mjs --grupo=autorizacao` para a autorização por regra). Não use
  `--test-name-pattern`: o roteiro não é do `node --test` e ignora essa opção.
- **Tempo limite.** Cada hook tem 60 s para responder (`INTOCA_TESTE_TEMPO_LIMITE_MS` troca). Passou
  disso, o caso falha e diz qual hook travou; o roteiro nunca repete um caso em silêncio.

Teste ao vivo de descoberta, em um repositório aninhado, abrindo um chat novo nele e perguntando:

1. Você conhece o Regimento da sede e os cargos Diretoria, Gerente, Executor e Plantão?
2. Quais destas skills aparecem: `triagem`, `os-nova`, `relatorio`, `encerrar`, `diretoria`,
   `gerente`, `executor`, `plantao`, `secretaria`, `memorando`?
3. Quais destes agentes aparecem: `revisor`, `pesquisador`, `auditor`?

Esperado com o plugin instalado: as 12 skills e os 3 agentes aparecem, com o prefixo `intoca:`. A
pergunta 1 depende do `CLAUDE.md` da sede ou do projeto; o contexto do hook de início de sessão traz a
fila e a raiz da sede, mas não o texto do regimento.
