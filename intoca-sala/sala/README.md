# InToca Sala (a "Clássica")

A página das Tocas: a lista dos projetos da sede, o que cada um está fazendo (porta, branch, rodando ou parado) e o que
está esperando o proprietário. Node puro, sem dependências: não há `npm install`. Só loopback.

Pense num quadro na parede do escritório: mostra quem está de pé e quem está parado, e o que o dono ainda precisa
decidir. Os botões **Iniciar** e **Parar** ficam **desligados** até o proprietário ligar (veja "Controle").

```bash
node sala/server.mjs          # a partir de plugin/intoca-sala
node --test "sala/tests/*.test.mjs"
```

## Onde ela responde

| O quê | Como |
| --- | --- |
| Porta | `INTOCA_SALA_PORTA` se definida (falha se ocupada); senão a **80** se livre; senão uma porta livre. |
| Estado da máquina | `~/.intoca/sala.json`: `{"classica": {"porta", "pid", "iniciou_em"}, "controle": false, "ordem": [...], "animada": {...}}`. A Animada grava a chave `animada` (`porta`, `pid`, `iniciou_em`, `versao`) no mesmo arquivo, **sobrescrevendo-a inteira ao subir** e apagando-a ao sair; por isso o que é seu (`pasta`, `porta`, `auto`) também fica em `animada_config`, que só a Clássica escreve, e a leitura junta as duas. A Clássica nunca apaga o que não é dela. |
| Sede | `INTOCA_SEDE` (pasta com `sede.yaml`), depois o ponteiro `~/.intoca/sede`. A pasta do usuário vem de `INTOCA_HOME` ou do sistema. Sem sede, a página avisa e as listas vêm vazias. |

## O que ela lê

Nada é duplicado: tudo vem do manifesto e das pastas, a cada requisição (sem reiniciar).

- **Projetos:** itens do `projetos:` do `sede.yaml` com `status: ativo` e `pasta_atual` existente. O projeto que hospeda
  esta sala (o `intoca`) **não ganha cartão**: a página é ele. As ferramentas anexas dele aparecem soltas na frente.
- **Porta:** `PORT` do `.env`/`.env.example` (só essa linha; nenhum outro valor é lido) > `port` do
  `.claude/launch.json` > `porta_dev` do manifesto (só leitura: sem Iniciar/Parar). **Comando:** primeira configuração do
  `launch.json`, com `cwd` opcional.
- **Ferramentas:** seção `ferramentas:` do manifesto. Campos: `nome`, `pasta`, `porta`, `command: [lista]`,
  `env: {mapa}`, `url`, `descricao`, `suite`, `membro_de`. O `inicia:` do manifesto é texto para gente; **não é
  executado**. Ferramenta sem `command` aparece sem Iniciar e entra em `faltaNoManifesto` de `/api/saude`: a Diretoria
  (dona do `sede.yaml`) completa; a sala não inventa.
- **Pendências:** a seção `## Esperando o proprietário` de `diretoria/fila.md` e de `<pasta do projeto>/ops/fila.md` de
  cada projeto ativo. Linha com estado `feito`, resolvido, decidido, cancelado ou arquivado sai da contagem.

## "Abrir" em toda Toca

Cada cartão mostra, na ordem: **Abrir** (dev server, se houver porta; senão a pasta estática), **Site local** (a pasta
estática, quando há dev server também), **Produção** (se houver `url_producao`) e **VS Code** (sempre).

Campos opcionais do projeto no `sede.yaml` (a Diretoria grava; sem eles a sala não inventa):

| Campo | Formato aceito |
| --- | --- |
| `site:` | Pasta estática, absoluta ou relativa a `pasta_atual` (ex.: `site`). Tem de existir; senão é ignorada. |
| `url_producao:` | URL `https://...` sem espaço nem aspas. `http://` e outros esquemas são ignorados. |

O VS Code abre `vscode://file/<pasta_atual>` (barras normais, trechos codificados), sem depender de arquivo `.code-workspace`.

### Pasta estática

Cada Toca com `site:` é servida em **origem própria**: `http://<rótulo>.toca.localhost/` (com `:porta` quando a sala não está na
80), a partir da raiz da pasta. O navegador (Chromium, Firefox) trata `*.localhost` como a própria máquina, sem configuração. O
campo `estatico` de `/api/tocas` já traz essa URL absoluta, e o endereço antigo `/toca/<nome>/...` em `localhost` responde 301
para ela.

- **Rótulo.** Vem do nome do projeto no manifesto: minúsculas; toda sequência fora de `a-z`, `0-9`, `.` e `-` vira um `-`; pontos
  e hífens das pontas saem (`Padaria do Amigo` → `padaria-do-amigo.toca.localhost`). Rótulo vazio, ou igual ao de outra Toca com
  site, não é servido (404 com o motivo) e a Toca fica sem `estatico`.
- **Por que origem própria, e não `sandbox`.** O `Content-Security-Policy: sandbox` punha a página em origem opaca: links que
  começam com `/` quebravam e o navegador interno do app barrava o CSS e o JS. Em origem própria o site funciona como em produção.
  A separação da API vem da origem: a API só responde em `Host` de localhost e recusa `Origin` e `Sec-Fetch-Site` de fora, e na
  origem do site `/api/...` e `/` são arquivos do site (ou 404), nunca a sala.
- **Regras da pasta (só leitura).** Só GET e HEAD; sem listar pasta (`index.html` ou 404); pasta sem a barra final responde 301
  para a forma com barra; recusa `..`, `%2e%2e`, `\`, `:`, byte nulo, nome oculto (`.env`, `.git`) e qualquer link simbólico ou
  junção cuja pasta real saia da declarada; tipo pela extensão com `nosniff`; arquivo acima de 50 MB devolve 413.
- **Navegador que não resolve `*.localhost`.** Se um navegador antigo não abrir o endereço, a pessoa acrescenta
  `127.0.0.1 <rótulo>.toca.localhost` ao arquivo `hosts` (o Claude não faz isso por ela).

## API

| Rota | O que devolve |
| --- | --- |
| `GET /api/tocas` | `{sede, suite, grupos, ordem, lista}`: `grupos` já agrupados por frente da Suíte (membros, anexas, planejados) e por fábrica, com o grupo `fixo: true` em primeiro e os demais na ordem salva; `ordem` é a ordem dos grupos móveis; `lista` é a lista plana. |
| `GET /api/pendencias` | `{sede, fontes: [{origem, arquivo, lida, abertas}], ausentes, total}` (arquivo relativo, nunca caminho de máquina). |
| `GET /api/saude` | Versão, porta e pid, `controle`, Animada (`registrada`, `porta`, `no_ar`, `instalada`, `auto`, `pasta`, `pode_instalar`, `faltam`: o que falta entre `git`, `uv` e `python`), sede achada e o que falta no manifesto. |
| `POST /api/preferencias` | `{ordem: [ids]}`: grava a ordem dos grupos móveis. Loopback, `X-Painel: 1`, **sem** exigir `controle` (ordenar não é ação sobre processo). 400 para lista inválida, id desconhecido ou o grupo fixo. |
| `POST /api/animada/auto` | `{auto: true\|false}`: a caixa "Subir a sala animada junto com o sistema". Exige `controle` e a Animada instalada. |
| `POST /api/animada/instalar` · `GET /api/animada/instalacao` | Instala a Animada (veja abaixo). Exige `X-Painel` e `controle`. Sem `confirmado: true` só devolve o plano; com ele responde em linhas JSON (`passo`, `tick`, `fim`). O GET devolve o estado da instalação em curso ou da última (a página relê depois de recarregar). |
| `GET /api/sites`, `/api/suite` | Compatibilidade com o painel antigo (lista plana e blocos da Suíte). |
| `GET /api/sites/<nome>/log` | Últimas 200 linhas do processo que a sala iniciou. |
| `POST /api/sites/<nome>/start` · `/stop` | Veja "Controle". |

## Controle (Iniciar e Parar)

Desligado por padrão: com `controle: false` (ou sem o campo) as duas ações devolvem **403** com texto claro. Ligar é ato do
proprietário (editar `controle` para `true` em `~/.intoca/sala.json`); só o booleano `true` vale. Além disso:

- só atende `Host` de localhost (barra DNS rebinding) e exige o cabeçalho `X-Painel: 1` nas ações;
- a sala guarda o PID de cada filho que **ela** iniciou e para só esses (grupo de processos no POSIX; `taskkill /T` só do
  PID do filho no Windows, como reserva do sistema);
- processo **externo** (porta aberta, mas não é filho da sala) só para com `{"confirm": true}` **no corpo**, validado no
  servidor; para achar o PID ela usa a reserva do sistema (`netstat`, `lsof` ou `ss`) e nunca encerra o próprio servidor;
- nunca registra valor de variável de ambiente.

`command` vem do `launch.json` do projeto ou do manifesto e roda com o usuário (com `shell: true`): quem controla esses
arquivos executa código. Por isso o controle nasce desligado.

## Grupo fixo e ordem dos grupos

A frente do manifesto que contém o projeto que hospeda a sala (`eu`, aqui o `intoca`) é o **grupo fixo**: vem sempre em
primeiro, com `fixo: true`, e não tem alça. O título continua vindo do manifesto (`suite.frentes.<id>.nome`); numa sede sem
frente com `eu` nada é fixo. Os demais grupos têm alça de arrastar (HTML nativo, sem biblioteca) e botões ▲ ▼ (as setas do
teclado também funcionam na alça). A ordem é **preferência da pessoa, por máquina**: `POST /api/preferencias` grava a lista
de ids em `~/.intoca/sala.json`, chave `ordem`. Grupo novo, que não está na lista, entra no fim; id que sumiu é ignorado.
O `localStorage` não guarda a ordem: a página se redesenha na hora com a ordem nova e o servidor confirma em seguida.

## A sala animada na tela

(No Windows o lançador sobe a Animada pelo `pythonw.exe` do ambiente dela, sem janela de console; o `lancador.log` registra o executável.)

A linha da AI Operations Room · InToca aparece no grupo fixo mesmo sem ela estar instalada. **Instalada** = o item dela em
`ferramentas:` com `pasta` existente, ou `animada.pasta` em `sala.json` apontando para uma pasta que existe (o manifesto manda
quando os dois existem).

- **Não instalada, sem poder instalar** (controle desligado ou falta `git`, `uv` ou Python 3.12+): a linha traz as instruções
  (`/intoca:comecar` num chat da sede, ou os três comandos: clone, `uv sync`, iniciar), com a pasta padrão `<sede>/sala/app` e a
  porta 8765, e diz o que falta.
- **Não instalada, podendo** (controle ligado e programas presentes, conferidos sem rede): botão **Instalar**. Ele mostra o
  plano (pasta e porta editáveis, o que será baixado) e só começa com a sua confirmação. Faz, nesta ordem: confere programas, porta
  e destino; `git clone` do repositório público; `uv sync` (minutos; a página mostra o andamento); grava `animada: {pasta, porta}`
  em `sala.json`; e mostra o **texto pronto do pedido à Diretoria** (o item de `ferramentas:` para o manifesto), com botão
  copiar. Falha no meio: desfaz a pasta que criou e deixa o `sala.json` como estava. A sala **nunca grava no `sede.yaml`** e
  **nunca registra hooks** em `~/.claude/settings.json`: os hooks continuam só pelo `/intoca:comecar`, com consentimento.
- **Instalada**: o cartão de sempre (Iniciar, Parar, Abrir) e a caixa **"Subir a sala animada junto com o sistema"**
  (`animada.auto`; exige controle). O lançador a obedece (veja "Quem sobe a sala").

## Alternar entre Clássica e Animada

O botão **Animada** só aparece quando ela está registrada em `sala.json` **e** responde a `/api/health`. A raiz do localhost é
sempre a Clássica e vai para a Animada quando a preferência do navegador (`localStorage`, nunca o manifesto) é
"animada" e ela está no ar; `/?sala=classica` abre sempre a Clássica (e grava a preferência). Se a Animada cair, a Clássica avisa.

## Quem sobe a sala

Ao abrir um chat, o hook de início de sessão do pacote (`lancador/inicio.mjs`) sobe esta sala se ela não estiver no ar, com
paciência para máquina lenta e sem nunca relançar uma subida em andamento; um serviço de logon opcional (`lancador/servico.mjs`,
`/intoca-sala:servico`) faz o mesmo na entrada no computador. Com a caixa "Subir a sala animada junto com o sistema" marcada
(`animada.auto: true`), os dois sobem também a sala animada, uma vez, se ela não responder em `/api/health`; o hook em si nunca
a sobe, e ela não fica presa ao serviço. Para parar: desmarque a caixa ou ponha `"auto": false` em `animada`. Detalhes, estado em
`~/.intoca/` e como desligar: [`../README.md`](../README.md).
