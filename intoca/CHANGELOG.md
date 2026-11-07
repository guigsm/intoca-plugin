# Histórico de mudanças · InToca Sede (pacote `intoca`)

Todas as mudanças notáveis deste pacote ficam aqui. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.0.7] - 2026-11-06

### Alterado
- O `/intoca:comecar` passa a **conferir a máquina** sem perguntar se a pessoa tem os programas: o Node primeiro (os scripts e os hooks do plugin são
  de Node; sem ele, falham sem aviso) e, depois, o Git. O que existe é presumido; o que falta é oferecido ("Posso instalar o X agora?") e, com o "sim" da
  pessoa, o Claude roda o instalador do sistema e confere de novo. O mesmo vale para o `uv` e o Python da sala animada. Conta, senha, código e chave
  continuam só da pessoa. Depois de instalar o Node ou o Git, o texto manda fechar e abrir o Claude Code e rodar o `/intoca:comecar` de novo.
- A ação `verificar` do `instalar-sala.mjs` devolve também `maquina` (sistema, gerenciador de pacotes, versão do Node, de onde veio o `claude`) e
  `instalar` (o comando de cada programa nesse sistema: `winget`, `brew`, `apt`, `dnf` ou `pacman`, ou `null`). O Node mínimo é o 20.
- O fecho traz uma linha por programa: "Git: já estava", "instalado hoje" ou "recusado: o InToca funciona sem ele", e a versão do Node.
- Saiu de todo texto do pacote a frase de que o Claude não instala programas. `git-e-github.md` ganha "Instalar o Git: o Claude faz com a sua autorização".

## [1.0.6] - 2026-11-05

### Adicionado
- O `/intoca:comecar` confere cedo se o Git está na máquina e diz em uma frase o resultado, explica as vantagens do Git e o que muda sem
  ele (lista fechada), mostra como instalá-lo e, só se a pessoa quiser o cofre online, o caminho da conta no GitHub, tudo como texto: o Claude
  não instala nem cria conta. O fecho traz a linha "Git: instalado" ou "Git: não instalado". `git-e-github.md` ganha as seções "Por que
  usar o Git", "Sem Git: o que funciona e o que não" e "Como instalar o Git".

## [1.0.5] - 2026-11-05

### Adicionado
- O modelo de sede (`sede.yaml`) explica a Suíte, comentada, com exemplo fictício: a pessoa descomenta quando tiver uma e a InToca Sala
  passa a agrupar as Tocas por frente. O manifesto de partida continua sem Suíte declarada. As boas-vindas ganham uma frase sobre isso.

## [1.0.4] - 2026-11-05

### Alterado
- Textos e exemplos sem nomes de projetos reais; títulos de grupo pelo manifesto. O README, os modelos e as mensagens não citam mais
  identificadores internos de ordem de serviço, e os dados de teste usam nomes fictícios. Um teste novo varre o pacote e falha se um
  nome ou um identificador voltar.

## [1.0.3] - 2026-11-05

### Corrigido
- O texto de como desinstalar a InToca Sala (passo da sala no `/intoca:comecar`) usa o catálogo de onde o plugin foi instalado, e não
  mais sempre `intoca-sede`. Quem instalou de outro catálogo recebia um comando que não funcionava.

## [1.0.2] - 2026-11-05

### Corrigido
- Os hooks reconhecem o projeto também dentro de uma worktree da sede quando o projeto mora numa subpasta da sede
  (`<raiz>/.claude/worktrees/<nome>/<subpasta>`, `<sede>/_worktrees/<nome>/<subpasta>` e a worktree criada dentro da pasta de outro
  projeto). Antes, o executor de um projeto assim era tomado pela sede ou pelo projeto que hospeda a worktree, e a gravação do
  relatório em `ops/` era negada com o caminho do outro projeto. Agora a governança do projeto na worktree é permitida, a área
  de trabalho do chat é a do projeto, a negação aponta a pasta do projeto dentro da worktree e o aviso de chat trocado cita o projeto
  certo. Subpasta mais específica vence; sem dono único, link, junção, caminho não registrado, worktree sem `sede.yaml` e de
  outra sede seguem como antes. `pastas_antigas` continuam sem dar identidade nem permissão. Dentro da worktree, a área de trabalho
  do chat de um projeto passa a ser só a subpasta dele (as demais pastas de projeto da mesma worktree deixam de valer).

## [1.0.1] - 2026-11-04

### Corrigido
- Os hooks reconhecem o título exato `Gerente` (sem sufixo) como cargo Gerente, como já faziam com `Diretoria` e `Secretaria`.
  Vale para a sede com um só gerente. `Gerente · Projeto` segue valendo; `Gerente InToca` e `Gerente -` seguem recusados. O campo
  `titulos.gerente` do manifesto aceita o texto fixo `Gerente`.

## [1.0.0] - 2026-11-04

Primeira versão estável.

### Adicionado
- Licença MIT (arquivo `LICENSE`) e autor público no `plugin.json`.
- Ícone do pacote (`.claude-plugin/icon.png`), provisório: trocar é substituir o arquivo.
- Nome de exibição **InToca Sede** (o identificador técnico segue `intoca`, e os comandos seguem `/intoca:...`).
- Este histórico de mudanças.
- No `/intoca:comecar`, logo depois de instalar os pacotes, a pergunta "quer que o Claude Code atualize o InToca sozinho quando sair versão
  nova?". Com o "sim", o script grava a escolha só para o catálogo de onde o `intoca` veio; num catálogo de pasta local não há o que
  atualizar, e o texto diz isso. Sem o "sim", o texto mostra o passo a passo e o comando manual. O fecho diz o que ficou.
- Em `docs/boas-vindas.md`, a seção "Como o InToca se atualiza".

### Alterado
- Textos do README, das boas-vindas e do `/intoca:comecar` usam os nomes InToca Sede e InToca Sala e descrevem a sala como ela é hoje
  (a InToca Sala Clássica; a sala animada é um passo opcional).

## [0.10.0] - 2026-11-04

### Adicionado
- O `/intoca:comecar` instala a InToca Sala (pacote `intoca-sala`) junto, num passo só e com o "sim" da pessoa, e oferece a sala animada
  como passo opcional e explícito (confere `git`, `uv` e Python, pergunta a porta e pede um "sim" à parte para registrar os hooks).
- Campo `plugin_minimo` no `sede.yaml` de sedes novas: a versão do plugin com que a sede funciona. Só avisa, nunca bloqueia.

## [0.9.4] - 2026-11-04

### Corrigido
- Os hooks reconhecem o cargo pelo título do próprio chat, e não pelo texto de uma mensagem.
- A cobrança de relatório vale só para o chat de executor com ordem.
- A ordem de serviço e a fila são achadas pela sigla do projeto e pelo manifesto; as pastas de `repositorios:` (como a da sala animada)
  contam como pasta do projeto, e o aviso "o pedido cita outro projeto" não dispara em mensagem entre chats.

## [0.9.3] - 2026-11-02

### Adicionado
- Aviso quando uma autorização de ordem de projeto é gravada na gaveta da sede.
- Nota sobre o `AppData` virtual do Windows e a pasta temporária dos hooks (`docs/windows-e-appdata.md`).

### Corrigido
- O aviso de "chat trocado" fica mudo na Diretoria e na Secretaria, salvo quando o pedido é código ou conteúdo de projeto.

## [0.9.2] - 2026-10-30

### Adicionado
- Projetos que a pessoa já tem: o `/intoca:comecar` pergunta se há pastas de projeto no computador e se devem ser trazidas para a sede ou
  ficar onde estão, com as vantagens e o custo de cada caminho (`docs/projetos-existentes.md`).
- A ação `adotar` do `criar-sede.mjs`: registra a pasta onde ela está, ou a traz para a sede só depois de simular e receber o "sim", só na
  mesma unidade de disco e com recusas claras (alteração não guardada, pasta sincronizada, pasta em uso).

## [0.9.1] - 2026-10-30

### Corrigido
- O analisador de segredos deixou de dar falso alarme em comandos comuns (procurar arquivos de ambiente, `git rm --cached`, anotar no
  `.gitignore`) e passou a pegar mais contornos (aspas aninhadas, comando em `node -e`, curinga no PowerShell, link duro).
- Apagar um arquivo de ambiente passou a pedir confirmação, e os textos do pacote dizem o que o bloqueio realmente faz.

## [0.9.0] - 2026-10-29

### Adicionado
- Política de segredos: o `.env` fica na pasta do projeto, o Git o ignora e a IA entrega só o modelo `.env.example` (`docs/politica-de-segredos.md`).
- O hook bloqueia ler, copiar e gravar arquivos de ambiente e de chaves, inclusive por comandos de shell; os modelos terminados em
  `.example`, `.sample` e `.template` passam.
- Os modelos de projeto trazem o `.gitignore` com essas regras.

## [0.8.1] - 2026-10-28

### Corrigido
- O aviso "esta pasta não é de nenhuma Toca" cala na pasta-mãe dos projetos, na pasta temporária e em worktree de outro repositório, e
  compara o caminho real da pasta.

## [0.8.0] - 2026-10-28

### Adicionado
- Rigor das permissões: na configuração inicial a pessoa escolhe `cauteloso` ou `equilibrado` (`autônomo` fica anunciado para uma versão
  seguinte). O porteiro do plugin passa a ler o nível.
- Comando `/intoca:rigor` e script `aplicar-rigor.mjs`: gravam o `.claude/settings.json` de cada pasta só depois de simular e receber o "sim".
- `docs/permissoes.md`, em linguagem de empresa.

## [0.7.0] - 2026-10-27

### Adicionado
- Comando `/intoca:comecar`: explica como tudo funciona, faz as perguntas, cria a sede a partir dos modelos do pacote e registra o primeiro projeto.
- Script `criar-sede.mjs`, que escreve a sede sem apagar nem sobrescrever nada, o ponteiro da sede na pasta pessoal e o campo `titulos:` do
  manifesto (padrão de nome dos chats).

## [0.6.0] - 2026-10-26

### Adicionado
- A sede de partida dentro do pacote (`templates/sede/`): regimento, mapa, manifesto, `diretoria/` com fila e modelos, e modelos de projeto
  por tipo (site, app, serviço, documento, relatório e operação).
- Higiene para exportar: nenhum caminho de máquina nem nome de pessoa no pacote, conferido por testes.

## [0.5.1] - 2026-10-25

### Corrigido
- O cabeçalho das skills `memorando` e `secretaria` não era lido por validadores estritos; passou a ser, e uma conferência automática
  roda o `claude plugin validate` junto dos testes.

## [0.5.0] - 2026-10-21

### Adicionado
- Skills `memorando` (a leitura de chegada do escritório) e `secretaria` (a lista do que só o proprietário faz).
- As regras 14 (chat errado) e 15 (foco da ordem de serviço) nas skills de cargo, com as exceções.
- Autorização de produção por sede e por projeto, dita nas cinco skills de cargo.

### Alterado
- Vocabulário de empresa nas skills de contratação.

### Corrigido
- O hook que cobra o relatório preserva as marcas do aviso de "chat trocado" ao regravar o estado da sessão.

## [0.4.0] - 2026-10-20

### Adicionado
- Hooks de monitoramento, que só avisam e nunca bloqueiam: pedido que cita outro projeto ("chat trocado"), chat aberto em pasta que não é
  de nenhuma Toca e gravação de governança fora do lugar, com o caminho certo no aviso.

## [0.3.1] - 2026-10-15

### Corrigido
- A autorização por regra respeita o modo de planejamento e fecha buracos achados na revisão da versão anterior.

## [0.3.0] - 2026-10-15

### Adicionado
- Autorização por regra no hook "antes de usar ferramenta": o que cumpre o regimento (escrever na pasta do projeto ou da worktree,
  governança em `diretoria/` e `ops/`, Git de rotina, testes) passa sem pergunta; o que viola é negado; só produção e o destrutivo perguntam.

## [0.2.0] - 2026-10-12

### Adicionado
- Hooks de criação e remoção de worktree: as worktrees ficam em `<sede>/_worktrees`, instalam dependências e reservam porta.

## [0.1.0] - 2026-10-12

### Adicionado
- Primeira versão do plugin: as skills de cargo e de rotina (Diretoria, Gerente, Executor, Plantão, triagem, ordem de serviço, relatório e
  encerramento), três assistentes de leitura (revisor, auditor e pesquisador) e os hooks do regimento (contexto da fila ao abrir o chat,
  ordem detectada, bloqueios e cobrança de relatório).
- Catálogo local de plugins da sede.
