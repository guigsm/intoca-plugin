# InToca Sala (pacote `intoca-sala`, versão 0.4.5)

O **InToca Sala** é o quadro de avisos do escritório: a faixa e o painel dentro do app (este mod) e a página das Tocas no navegador (a sala Clássica). Licença MIT; as mudanças de cada versão estão em [`CHANGELOG.md`](CHANGELOG.md). Vem do mesmo catálogo do plugin InToca Sede (`intoca`), que o instala junto no `/intoca:comecar`, com o "sim" da pessoa.

A InToca Sala completa (servidor local, página Tocas, pendências) está em [`sala/README.md`](sala/README.md). Este mod é a faixa e o painel dentro do app.

O site de cada Toca (campo `site:` do manifesto) abre em `http://<rótulo>.toca.localhost/` (com a porta quando a sala não está na 80), numa origem só dele; a regra do rótulo e o porquê estão em [`sala/README.md`](sala/README.md#pasta-estática).

> **Acesso antecipado: pode quebrar numa atualização do Claude Code; os hooks do `intoca` seguem valendo.**
> Este mod usa a API de mods do Claude Code, que a própria Anthropic marca como acesso antecipado e que muda
> entre versões. Se uma atualização mudar a API, o mod pode parar de aparecer. Nada mais para: o plugin `intoca`
> (hooks e skills) não depende dele.

É um plugin-irmão do `intoca`, **opcional**: quem não o instala não perde nada do `intoca`.

## O que ele mostra

Pense num quadro de avisos do escritório que fica ao lado da conversa. Ele **lê** os arquivos da sede (a fila da
Diretoria, a fila de cada projeto e a lista de pendências do proprietário) e mostra:

| Onde | O que aparece |
| --- | --- |
| **Painel** (`/sala`) | Pendências do proprietário abertas; ordens de serviço em andamento (projeto, modelo, estado); avisos ("aguarda o vai", "aguarda integração"); recursos ocupados e congelados; o cargo e a OS deste chat. Atualiza sozinho a cada minuto e tem o botão **Atualizar**. |
| **Linha de status** | A OS do chat, como `AB-05 · meu-projeto/`, quando o título do chat diz `Executor · ID tema`. Some quando não há OS. |
| **Faixa acima do prompt** | "3 pendências do proprietário abertas", com o botão **Ver painel**. Some quando são zero. |
| **`/pendencias`** | Lista as pendências abertas em texto e abre o painel. |
| **Avisos rápidos** | Quando o pedido cita outro projeto ("chat trocado") e quando o chat abre numa pasta que não é de nenhuma Toca (calado na pasta que guarda várias Tocas, em pasta temporária, em worktree de repositório alheio e em atalho para pasta registrada). Mesmas regras 13 e 14 dos hooks do `intoca`; a lista de regras e de exceções é a deles. |

**O painel não lista os outros chats abertos no app**: a API de mods só enxerga o próprio chat. A parte "quem está
fazendo o quê" vem das filas (que os gerentes mantêm), não de uma lista de sessões.

## A sala sobe sozinha (lançador)

Ao abrir um chat, o pacote confere se a InToca Sala está no ar e, se não estiver, **sobe**. Pense num porteiro que acende as
luzes do escritório quando você chega: ele não espera ninguém e não derruba nada.

- **Nunca atrasa nem derruba o chat.** O hook (`sala/lancador/inicio.mjs`) sai na hora, com código 0 e sem escrever nada; quem
  espera é um vigia separado, solto do chat.
- **Paciente com máquina lenta.** Depois de ligar o computador a subida pode levar de 3 a 7 minutos. O vigia espera até **10
  minutos** (`INTOCA_SALA_PRAZO_S` muda o prazo) e **nunca sobe uma segunda sala** enquanto a primeira está subindo ou de pé,
  mesmo lenta para responder. Ao fim do prazo ele desiste em silêncio; **não mata nenhum processo**.
- **Um só por vez.** Vários chats abrindo juntos não sobem várias salas (trava em `~/.intoca/lancador.lock`). Se a última
  subida morreu cedo (porta pedida ocupada, por exemplo), espera 2 minutos antes de tentar de novo, sem laço.
- **Estado que ele lê e escreve** (só em `~/.intoca/`): `sala.json` (a sala o escreve), `lancador.json` (última tentativa),
  `lancador.lock`, `lancador.log` (o que o lançador fez) e `sala.log` (a saída da última sala subida). Arquivo ilegível vale
  "sem registro". Nenhum valor de variável de ambiente vai para o log.
- **Desligar.** `INTOCA_SALA_SEM_LANCADOR=1` no ambiente, ou `"lancador": false` em `~/.intoca/sala.json`: a sala deixa de subir
  sozinha. Instalar o pacote não liga mais nada além disso; o controle (iniciar e parar ferramentas) segue **desligado**.

### A sala animada sobe junto (opcional, só com a sua marcação)

Na tela das Tocas, a linha da sala animada (AI Operations Room · InToca) tem a caixa **"Subir a sala animada junto com o
sistema"**. Ela só aparece com a sala animada instalada e só se liga com o **controle** ligado (subir um programa é ação
sobre processo). A caixa **é o seu consentimento**, dado na tela, por máquina: nada sobe sozinho sem ela.

- **O que acontece quando está marcada:** o lançador, depois de garantir a InToca Sala, vê se a sala animada responde em
  `/api/health`; se não responde, **sobe uma vez** pelo mesmo comando do botão Iniciar (o do manifesto, ou o do `sala.json`)
  e anota `pid` e `iniciou_em` em `animada`. Isso vale no serviço de logon (`--servico`) e no vigia que o hook de início de
  chat solta (`--vigia`); o hook em si nunca sobe nada. O resultado vai para `~/.intoca/lancador.log` (`animada: subiu na
  porta N`, `animada: já no ar`, `animada: falhou: ...`) e a saída da sala animada para `~/.intoca/animada.log`.
- **Sem pressa e sem insistência.** Espera até 3 minutos a porta abrir (`INTOCA_ANIMADA_PRAZO_S` muda o prazo), não sobe uma
  segunda enquanto a primeira está subindo e **não mata nenhum processo**. No Windows ela sobe **sem janela de console** (pelo `pythonw.exe` do ambiente dela; fechar uma janela não a derruba). A sala animada **não fica presa ao serviço**: se
  ela cair, o serviço não reinicia por ela; o vigia do próximo chat a sobe de novo.
- **Desligar.** Desmarque a caixa na tela, ou ponha `"auto": false` dentro de `animada` em `~/.intoca/sala.json`. Desmarcar
  **não derruba** a sala animada que já está de pé. `INTOCA_SALA_SEM_LANCADOR=1` ou `"lancador": false` desligam o lançador
  inteiro (a Clássica e a animada).
- O `localhost` sem porta continua sendo a Clássica. Para abrir direto na animada, favorite `http://localhost:8765`.

### Serviço de logon (opcional)

Se você quer a sala de pé assim que entra no computador, sem esperar um chat, o comando `/intoca-sala:servico` instala um
serviço de logon: tarefa agendada no Windows, agente `launchd` no macOS, `systemd --user` no Linux. **Só com o seu sim**:
ele mostra antes o que vai mudar (arquivo, comandos, "sem administrador", "nada é baixado") e só aplica depois da confirmação.
`desinstalar` desfaz. Na linha de comando, sem a skill:

```bash
node sala/lancador/servico.mjs mostrar        # o que seria feito, sem mudar nada
node sala/lancador/servico.mjs instalar       # também só mostra; para aplicar, acrescente --sim
node sala/lancador/servico.mjs desinstalar --sim
```

O serviço aponta para a pasta onde o pacote está agora; se uma atualização trocar essa pasta, rode `instalar` outra vez.

## Na tela das Tocas (0.4.0)

Detalhes em [`sala/README.md`](sala/README.md). Em resumo:

- **Grupo fixo no topo.** A frente do manifesto que contém o projeto que hospeda a sala (aqui o `intoca`, a "Sala de
  Operações") vem sempre em primeiro e não se move. O título vem do manifesto.
- **Ordem por arrastar.** Os demais grupos têm uma alça: arraste, ou use ▲ ▼ (ou as setas do teclado na alça). A ordem é
  preferência sua, **por máquina**, gravada em `~/.intoca/sala.json` (chave `ordem`); não mexe no manifesto.
- **A sala animada tem linha mesmo sem estar instalada.** Com o controle ligado e `git`, `uv` e Python 3.12+ na máquina, um
  botão **Instalar** mostra o plano, pede a sua confirmação, baixa, prepara o ambiente e entrega o texto pronto do pedido
  à Diretoria (o item de `ferramentas:` do manifesto). Sem isso, a linha traz as instruções (`/intoca:comecar` ou os comandos à
  mão). O botão **nunca** registra hooks em `~/.claude/settings.json`: os hooks continuam só pelo `/intoca:comecar`.
- **Subida junto com o sistema**: veja a seção acima.

## Como instalar (como plugin-irmão)

O mod mora ao lado do `intoca`, na pasta `plugin/intoca-sala/` da sede. Depois de a Diretoria integrar e publicar no
catálogo da sede (`.claude-plugin/marketplace.json`), a instalação é a mesma do `intoca`:

```bash
claude plugin install intoca-sala@intoca-sede
```

Para testar sem instalar, abra uma sessão apontando para a pasta do mod:

```bash
claude --plugin-dir plugin/intoca-sala
```

Roteiro de conferência no app: [`VERIFICAR.md`](VERIFICAR.md).

## Como desligar

```bash
claude plugin disable intoca-sala@intoca-sede
```

ou `claude plugin uninstall intoca-sala@intoca-sede`. Os hooks do `intoca` continuam como estavam.

## O que ele **não** faz

- **Não decide permissão.** Nenhum hook de ferramenta (`tool.call`), nenhum `allow`, nenhum `deny`, nenhuma troca
  de parâmetro. A autorização por regra e a negação de segredos ficam nos hooks do `intoca`.
- **O mod não escreve.** Nenhum arquivo é criado ou alterado por ele; só lê `sede.yaml`, `diretoria/fila.md`,
  `diretoria/pendencias-do-proprietario.md` e a `ops/fila.md` de cada projeto do manifesto.
- **Rede só no loopback.** Quando a InToca Sala está no ar (porta em `~/.intoca/sala.json`), o mod lê `/api/pendencias` e `/api/tocas` em `127.0.0.1`, só GET, com tempo-limite de 1,5 s; qualquer falha é silenciosa e o painel volta a ler as filas. Nada fora do loopback e nada guardado fora da memória da sessão.
- **Não muda o que o modelo recebe.** Os avisos rápidos são para a pessoa; os hooks do `intoca` seguem avisando o
  modelo. Para saber o título do chat e o texto do pedido (avisos rápidos e status), o mod escuta os eventos
  clássicos `SessionStart` e `UserPromptSubmit`; ele **sempre repassa** o evento adiante, sem recusar nem alterar nada,
  e falha aberto se der erro.

## Com a InToca Sala no ar

Se a sala responde, as **pendências** do painel, da faixa e do `/pendencias` vêm de `/api/pendencias` (a seção "Esperando o proprietário" das filas, lida pela sala) e o painel ganha o bloco **InToca Sala** (porta e tocas no ar, de `/api/tocas`). Sem a sala, ou sem resposta válida, vale a leitura de sempre: `diretoria/pendencias-do-proprietario.md`.

## Como ele acha a sede

Na mesma ordem dos hooks do `intoca`: `sede.yaml` subindo a partir da pasta do chat; depois a variável
`INTOCA_SEDE`; depois o ponteiro `~/.intoca/sede` (arquivo de uma linha com o caminho absoluto da sede; a pasta do
usuário vem de `INTOCA_HOME`, `USERPROFILE` ou `HOME`). O mod só lê essas variáveis e esse arquivo. Quando a sede vem **só do ponteiro**, a linha de status, a faixa e
os avisos rápidos só agem em pasta registrada no manifesto; `/sala` e `/pendencias` (pedidos de propósito) funcionam
em qualquer pasta. Sem sede, nada aparece e nada quebra.

Se a pasta do chat mudar no meio da conversa (`change_directory`), a sala percebe na leitura do minuto seguinte.

## Silenciar

Os avisos rápidos respeitam as mesmas variáveis dos hooks: `INTOCA_SEM_AVISO_TROCADO=1` cala os dois avisos
(chat trocado e pasta); `INTOCA_SEM_AVISO_PASTA=1` cala só o de pasta. `0` ou vazio não cala.

## Quando um arquivo falha

Arquivo ausente, ilegível, acima de 1 MB ou fora do formato: o bloco correspondente mostra "sem dados" com o motivo
e o resto do painel segue.

## Para quem mantém

- `hooks/register.tsx` é o **adaptador**: todo o contato com a API de mods (`$`, `Register`, eventos, estados)
  mora nele. O resto de `hooks/` é função pura (manifesto, sede, fila, pendências, sala, regras) e não conhece o
  motor. **Segundo ponto de contato:** `hooks/desenho.tsx` monta a árvore de elementos (`Box`, `Text`, `Button` e
  suas propriedades); se a API mudar os elementos, é ele que muda. Tudo que é `$` fica no adaptador.
- `types/index.d.ts` é o contrato do que o mod guarda em `$.state` e dos dados trocados.
- Testes: `claude plugin test plugin/intoca-sala` (a sede de mentira vive em memória; o ambiente de teste do
  motor não tem disco). Paridade com os hooks do `intoca`: `tests/paridade/gerar.mjs` roda os hooks reais e
  grava `casos.ts`; `paridade.test.ts` exige a mesma resposta da porta do mod.
- Validação: `claude plugin validate plugin/intoca-sala`. Só LICENSE, ícone e autor sobram (decisões do
  proprietário, antes da publicação do plugin).
