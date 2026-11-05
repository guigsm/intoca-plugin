# Permissões e o rigor do porteiro

Texto de apoio do `/intoca:comecar` e do `/intoca:rigor`. Leia só a parte do seu perfil, ou a pergunta que
interessa.

## Resumo

Antes de editar um arquivo ou rodar um comando, o Claude pede licença. Quem dá a licença é você, ou o **porteiro**:
o plugin, que conhece as regras do escritório (o regimento) e dispensa a pergunta quando o pedido segue a rotina.
O **rigor** diz quanto o porteiro dispensa. Há dois níveis prontos e um anunciado:

| Nível | Em palavras de empresa | O porteiro dispensa a pergunta para | Modo do app gravado na pasta |
| --- | --- | --- | --- |
| `cauteloso` | O porteiro pede licença antes de editar código e de rodar comandos que alteram coisas; ler e comandos só de leitura passam. | Ler arquivos comuns; anotar no quadro da governança (`diretoria/` da sede e `ops/` de cada projeto, nunca `autorizacoes/`). | Manual: o app pergunta antes de editar e de rodar o que não é só leitura (o que você já liberou nas suas configurações continua liberado). |
| `equilibrado` (recomendado e padrão) | O porteiro conhece a rotina. | O mesmo do cauteloso e mais: editar na pasta do próprio projeto ou na worktree dele, comandos de rotina do Git, testes do projeto, worktree em `<sede>/_worktrees`. | Aceitar edições (`acceptEdits`). |
| autônomo | O porteiro só chamaria para o que é produção. | Chega numa versão seguinte, depois da trava de produção por arquivo. Até lá, vale como equilibrado. | Nenhum. |

Em qualquer nível, ficam iguais: o bloqueio de arquivo de segredo (`.env`, chaves, credenciais), o bloqueio do que
o regimento proíbe (pular a verificação, envio forçado, descartar trabalho), a pergunta antes de produção e de
apagar em massa, e o modo de planejamento, em que o porteiro não dispensa nada.

## O que é uma permissão

Pense na recepção de um prédio. Cada pedido do Claude (abrir um arquivo, escrever, rodar um programa) passa por
três listas, nesta ordem:

1. **`deny`, a lista de proibidos.** O pedido é recusado, sem conversa. Ninguém libera, nem o porteiro.
2. **`ask`, a lista do "chame o dono".** O app pergunta a você, mesmo que o porteiro tenha dito "pode".
3. **`allow`, a lista da rotina.** O pedido passa sem pergunta.

O que não está em lista nenhuma segue o **modo** do app (Manual, aceitar edições, automático...). O porteiro do
plugin trabalha entre o pedido e as listas: ele pode dispensar uma pergunta, mas **não vence** o `ask` nem o
`deny`. Essas duas listas valem sempre.

As listas de cada pasta moram em `.claude/settings.json`. O plugin escreve esse arquivo com o seu "sim", a partir de
um modelo neutro por nível (`templates/permissoes/` do pacote).

## O que o porteiro faz e o que ele não faz

Faz: lê o pedido e, se ele segue o regimento (a pasta certa, um comando de rotina com opções conhecidas), dispensa a
pergunta. Nega o que reconhece: escrita e leitura de arquivo `.env`, comandos que o leem, copiam ou gravam, e os comandos que o regimento proíbe, em qualquer nível. Comando que só **apaga** o `.env` não é negado: o app pergunta à pessoa, porque o arquivo real é a única cópia. Não promete impedir tudo (ver `politica-de-segredos.md`, que lista o que o porteiro não enxerga).

**O `.env` nos modelos de permissão.** O `deny` dos modelos traz `.env`, `.env.local`, `.env.production`, `.env.development`,
`.env.staging`, `.env.test`, `.env.prod`, `.env.*.local` e `*.env` (como `hospedagem.env`) para `Read` e `Edit`. **Não** traz
`.env.<finalidade>` (`.env.crm`, `.env.hospedagem`), `.envrc` nem `.env_prod`: um `deny` em `.env.*` barraria também o
`.env.example`, que a IA precisa gravar. O `.env.<finalidade>` fica no `ask` (`Read` e `Edit` de `.env.*`), e `.envrc` e `.env_prod` só no
bloqueio do plugin. O `ask` casa também o modelo, então **gravar ou ler o `.env.example` pede confirmação no app**, mesmo com o plugin
liberando (o "sim" do porteiro não vence um `ask`). O `deny` não foi afrouxado para evitar isso.

Não faz:
- não vence o `ask` nem o `deny` do arquivo de permissões;
- não entende formas indiretas de comando, como `git -C <pasta> ...`, `npx` ou programas de terceiros: esses ficam
  com a pergunta do app;
- não decide nada fora de uma sede (pasta sem `sede.yaml` acima e fora das pastas registradas);
- não é trava de produção: publicar, mexer em domínio ou mandar algo a terceiros depende da autorização por escrito
  do regimento, e a trava técnica disso ainda está por vir.

## O arquivo sobrepõe o modo padrão do app

O app tem um modo padrão para os chats novos (Manual, aceitar edições, automático). O `.claude/settings.json` de
uma pasta **sobrepõe** esse modo naquela pasta. Exemplo: quem escolheu o modo automático (`auto`) no app e aplica o
equilibrado num projeto passa a abrir os chats daquele projeto em "aceitar edições". Por isso o plugin mostra a
lista de pastas e o conteúdo de cada arquivo e só escreve depois do seu "sim". Duas exceções da documentação: a
extensão do VS Code não lê o modo inicial desse arquivo (as listas valem do mesmo jeito), e o modo automático
gravado num arquivo de projeto não vale (por isso o plugin nunca o grava ali).

## O arquivo vai junto com o projeto

`.claude/settings.json` é o arquivo de permissões **compartilhado** da pasta: se o projeto é versionado e você envia
a versão ao GitHub, quem clonar o projeto recebe o mesmo modo e as mesmas listas. Isso é bom para um time (todos com
as mesmas regras), mas é uma escolha: se não quiser, não inclua o arquivo na versão, ou apague-o depois de testar.

Outro cuidado: numa pasta que o app ainda não marcou como confiável (a primeira vez que você abre um chat nela), o
app **ignora a lista `allow`** do arquivo até você aceitar a pergunta de confiança. O `deny` e o `ask` valem sempre.

## Por que o modo automático e o modo sem perguntas não são escolha aqui

O modo automático (`auto`) troca a sua pergunta por uma avaliação do próprio app. É uma escolha da conta, feita nas
configurações do app; o plugin não a grava em pasta nenhuma.

O modo que pula todas as perguntas não é oferecido, não é escrito e não é recomendado pelo plugin.
No app ele se chama `bypassPermissions` e na linha de comando `--dangerously-skip-permissions`; o plugin não o usa.
Ele retira a última barreira técnica contra produção por engano: as perguntas de produção deixam de existir, e só sobram o bloqueio do porteiro e o texto do
regimento, que não barra ninguém.

## Como mudar de nível

Peça `/intoca:rigor` (ou `/intoca:rigor cauteloso`, `/intoca:rigor equilibrado`). O chat mostra o nível atual,
explica a diferença, muda a linha `rigor:` do `sede.yaml` e reaplica o arquivo das pastas, sempre com o seu "sim".
Vale em chats novos, ou depois de reabrir o chat na pasta.

Para testar um nível sem mudar o manifesto, a variável de ambiente `INTOCA_RIGOR` (`cauteloso` ou `equilibrado`)
vale por cima do `sede.yaml` enquanto estiver definida. **Atenção:** ela vale nos dois sentidos, então também pode
**afrouxar** o nível da sede (um `cauteloso` no `sede.yaml` vira `equilibrado` com a variável). Ela só vale no
ambiente de quem a definiu (aquele terminal, ou um `settings.json` que a defina), não muda o `sede.yaml` e não muda o
arquivo de permissões das pastas. Para saber de onde veio o nível, o motivo de cada dispensa do porteiro termina
com `[rigor <nível>, da variável INTOCA_RIGOR ...]`, `[rigor <nível>, do sede.yaml]` ou `[rigor <nível>, o padrão ...]`.

**Na dúvida, vale o cauteloso.** A linha `rigor:` vazia (`rigor:` sem nada, `null`, `''`), repetida com valores
diferentes, ou escrita fora do lugar (no topo do arquivo, mais recuada, num mapa `sede: {` aberto em várias linhas)
vale o `cauteloso`. Sem nenhuma linha `rigor:` (ou só a comentada do modelo), vale o `equilibrado`.

## Como ver o que o plugin escreveu

O plugin escreve só `.claude/settings.json`, e só na pasta da sede e nas pastas dos projetos do manifesto. Nunca
escreve por cima de um arquivo que já existe: nesse caso mostra o trecho do modelo e o que mudaria, e a decisão de
colar é sua. Para conferir, abra o arquivo da pasta; ele é igual ao modelo do nível no pacote.

Um limite: o script acha a sede a partir da pasta onde roda (ou pela `INTOCA_SEDE`, ou pelo ponteiro da sede). Se
não achar nenhuma, como logo depois de criar uma sede sem ponteiro, ele aceita a pasta com `sede.yaml` que o chat
informar, e é o `sede.yaml` dela que diz quais pastas recebem arquivo. Por isso o chat mostra a lista de pastas e só
escreve com o seu "sim": confira que são as suas. A pasta pessoal, a raiz do disco e pastas que contêm a sede nunca
recebem arquivo.

## Como desfazer

- Voltar o nível: `/intoca:rigor <nível anterior>`, ou trocar a linha `rigor:` do `sede.yaml`.
- Tirar o arquivo de uma pasta: apagar `.claude/settings.json` dela. A pasta volta ao modo padrão do app.
- Desligar só o porteiro (o bloqueio continua): a variável `INTOCA_SEM_AUTORIZACAO_POR_REGRA=1`.

## Por perfil

**Nunca usei Git.** Fique no equilibrado. O Claude vai editar os arquivos do projeto sem perguntar, e também pode
apagar ou mover um arquivo solto da pasta do projeto (o modo "aceitar edições" do app permite), mas ainda pede
licença antes de apagar uma pasta inteira ou à força, instalar dependência ou publicar. Se preferir aprovar cada
edição de código e cada comando que altera alguma coisa, escolha o cauteloso: vai responder mais perguntas (ler e
consultar continuam passando), e nada muda no que é bloqueado.

**Uso às vezes.** O equilibrado cobre a rotina (ver o estado, comparar, preparar a versão, buscar do servidor, rodar
os testes). Fechar a versão e enviar ao servidor seguem com o porteiro, que confere as opções uma a uma.

**Desenvolvedor.** O `allow` do equilibrado só tem comandos exatos, sem `*` (nada de `--output`, `--upload-pack` ou
`-n` de pular a verificação escondidos num argumento). O resto da rotina é do hook, que lê as opções uma a uma. Regras de arquivo usam
`//**/`, que vale em qualquer pasta. O `deny` e o `ask` são os mesmos nos dois níveis.
