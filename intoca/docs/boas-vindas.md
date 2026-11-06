# Boas-vindas à sede

Texto de apoio do `/intoca:comecar`. Cada seção explica uma parte do funcionamento em linguagem de empresa.
A skill mostra primeiro o resumo e só aprofunda a seção que a pessoa pedir. O texto completo de tudo isto,
com a lista de termos, está no Memorando de Integração (`/intoca:memorando`).

## Resumo (a primeira mensagem)

Pense num escritório. Você é o dono: decide o que se faz e dá o "pode" de tudo o que sai para o mundo. A
**sede** é o escritório, uma pasta no seu computador. Nela trabalham cargos, que são papéis (cada um é um
chat do Claude): a **Diretoria** cuida do escritório inteiro, um **gerente** cuida de cada projeto, e o
**executor** é um profissional contratado para uma tarefa só. Todo trabalho passa por papel: o pedido é
classificado (triagem), vira uma **ordem de serviço** (OS), um executor a cumpre e entrega um **relatório**.
Tudo fica escrito em arquivos da própria pasta, não na memória dos chats. Por isso um chat pode ser
fechado e outro assume o cargo depois, sem perder nada. E há um **quadro de avisos** do escritório, a InToca Sala, que mostra tudo isso numa
página só (seção 8).

## 1. A sede e a Diretoria

A sede guarda as regras (o regimento, `AGENTS.md`), o mapa dos projetos (`WORKSPACE.md`), o manifesto
(`sede.yaml`, a lista de projetos e onde cada um mora) e a pasta `diretoria/`, onde ficam a fila de tarefas,
as ordens de serviço, os relatórios, as decisões e as autorizações. A sede não guarda o produto de nenhum
projeto: cada projeto tem a sua pasta. A **Diretoria** é o chat que cuida da sede: mantém o regimento, nomeia
os gerentes e decide conflitos entre projetos. Ela planeja e acompanha, não executa trabalho de projeto.

## 2. Os cargos

- **Você (proprietário):** decide, prioriza e dá o "pode" de qualquer coisa que saia para o mundo.
- **Diretoria:** o escritório como um todo. Um chat.
- **Gerente:** um por projeto. Cuida da lista de tarefas, da fila e dos recursos do projeto, e contrata
  executores. É o chat com quem você fala sobre o projeto.
- **Executor:** contratado para uma ordem de serviço, entrega e é arquivado.
- **Plantão:** quem cuida de uma função recorrente que mexe com o mundo de fora, como publicar um site.
- **Secretaria:** mantém a lista do que só você pode fazer (abrir chats, dar "pode", configurar o app).
- **Assistentes:** consultores só de leitura (pesquisar, revisar, auditar). Não alteram nada.

A cadeia de comando é: executor, gerente, Diretoria, você. Gerentes não conversam entre si; o que atravessa
projetos sobe para a Diretoria.

## 3. O caminho de um pedido

1. Você pede algo ao gerente do projeto.
2. **Triagem:** o gerente responde, antes de agir, o que entendeu, o tamanho (de N1, mecânico, a N5, impasse),
   quem faz e o que precisa do seu "vai". Pedido pequeno tem triagem de uma linha e segue.
3. **Ordem de serviço:** o gerente escreve um arquivo com tudo o que o executor precisa saber e contrata um
   executor (um chat novo).
4. **Execução:** o executor faz só o que a ordem manda, no recurso que ela indica.
5. **Relatório:** o executor grava o que mudou, o que foi conferido e o que ficou pendente, e o gerente confere.
6. **Arquivamento:** o chat do executor é encerrado. O estado fica nos arquivos.

## 4. Onde ficam os arquivos

- Na sede: `AGENTS.md` (regras), `WORKSPACE.md` (mapa), `sede.yaml` (manifesto), `diretoria/` (fila, ordens,
  relatórios, decisões, autorizações, modelos, memorando).
- Em cada projeto: a carta do projeto (`AGENTS.md`) e a pasta `ops/` (fila, ordens e relatórios do projeto).
- Pastas de projeto que você já tem: ou ficam onde estão (a sede só aponta para elas, e nada muda de lugar) ou
  são trazidas para dentro da sede (tudo num lugar só, mas o caminho da pasta muda). O `/intoca:comecar` pergunta,
  explica o custo de cada jeito e decide uma pasta por vez, só com o seu "sim". Veja `projetos-existentes.md`.
- Segredos (senhas, chaves, o arquivo `.env`) ficam fora do Git: moram na pasta principal do projeto e nunca
  entram num arquivo da sede, num relatório nem num chat. A IA entrega o modelo `.env.example` no repositório e não lê nem grava o valor; a pessoa copia e preenche. A página `politica-de-segredos.md` conta o passo a passo.

## 5. O que você decide e o que a IA decide sozinha

Você decide: o que fazer e em que ordem, o "vai" das tarefas médias para cima (N3 em diante) e o "pode" de
qualquer coisa que saia para o mundo (publicar, enviar a terceiros, apagar de forma irreversível). Esse "pode"
vira um arquivo de autorização assinado por você no chat do gerente ou da Diretoria. A IA decide sozinha o que é
rotina e reversível: organizar arquivos, escrever dentro da pasta do projeto, rodar testes, gravar relatórios.
Dúvida que muda o rumo não é decidida por ninguém além de você: vira pergunta.

## 6. O que vai e o que não vai para o GitHub

Veja `git-e-github.md`. Em resumo: o GitHub é um cofre online opcional para o histórico dos arquivos. Vão as
regras, a fila, as ordens e os relatórios; não vão segredos, nem dependências baixadas, nem arquivos pesados. O
envio ao GitHub ainda não está ligado nesta versão do plugin: ele chega junto com uma conferência automática de
segredos antes do primeiro envio. O Git é opcional: o InToca funciona sem ele, com algumas limitações; a comparação e o passo a passo
para instalá-lo estão em `git-e-github.md`.

## 7. Como pedir ajuda

- `/intoca:memorando` abre o Memorando de Integração; `/intoca:memorando termos` explica as palavras, `cargos`
  explica quem faz o quê, `fluxo` conta um pedido do começo ao fim.
- Qualquer chat de cargo explica um termo que você não conheça: basta perguntar "o que é X?".
- `/intoca:comecar` outra vez mostra o estado da sede e deixa mudar uma resposta ou registrar outro projeto
  (novo, ou uma pasta que você já tem: deixar onde está ou trazer para a sede).

## 8. A sala de operações (InToca Sala)

Pense no quadro de avisos do escritório, na parede do corredor. A **InToca Sala** é esse quadro: numa página do seu computador ela
mostra as Tocas (os projetos), as ordens de serviço em andamento, os recursos ocupados e o que só você pode decidir; e ao lado da
conversa, dentro do app, um aviso curto com a ordem do chat e as pendências. Ela **só lê** os arquivos da sede e não muda nada nela.

- **Instala junto.** O `/intoca:comecar` oferece instalar a InToca Sala (o pacote `intoca-sala`, do mesmo catálogo do plugin) num passo
  só, depois de criar a sede. Você pode recusar: nada é instalado e o resto funciona igual. Pode pedir depois, com `/intoca:comecar`.
- **Sobe sozinha nos chats novos.** Ao abrir um chat, o plugin vê se a sala está no ar e, se não estiver, liga-a em segundo plano, sem
  atrasar o chat. Para desligar isso: `INTOCA_SALA_SEM_LANCADOR=1` no ambiente, ou `"lancador": false` no arquivo `.intoca/sala.json` da
  sua pasta pessoal. Para tirá-la de vez, desinstale o pacote `intoca-sala`.
- **A versão animada é opcional.** A *AI Operations Room · InToca* ("Animada") é outra sala, em pixel art, com um escritório por projeto e
  os chats ao vivo. O `/intoca:comecar` só a oferece depois da InToca Sala, confere antes se você tem `git`, `uv` e Python 3.12 (não
  instala nada disso por você), baixa o programa de um repositório público, pergunta a porta (a sugerida é 8765) e **só registra os hooks, a
  ponte entre os chats e a sala, com o seu "sim" à parte**: isso altera o arquivo de configurações do Claude, e uma cópia dele é guardada
  antes. As duas salas se alternam com um clique.
- **A Suíte é opcional.** Se você produz ferramentas que servem a vários projetos, pode agrupá-las em frentes no bloco `suite:` do `sede.yaml` (o modelo traz um exemplo comentado); a InToca Sala então mostra um grupo por frente.

A sede é um meta-repositório só de governança: o regimento, os modelos, a fila e as ordens ficam versionados;
o código de cada projeto mora no repositório próprio dele (modo agregador: dentro da pasta da sede, ignorado
pelo `.gitignore` da sede; modo registro: em qualquer pasta, apontado pelo `sede.yaml`). Cargo é arquivo, chat é
instância; a trava de recurso é a fila em arquivo; produção só com autorização em arquivo.

## 9. Como o InToca se atualiza

O InToca (o plugin InToca Sede e a InToca Sala) recebe versões novas de tempos em tempos. O Claude Code **não atualiza sozinho** o que vem
de um catálogo de terceiros: quem liga isso é você. Por isso, logo depois de instalar, o `/intoca:comecar` pergunta: "quer que o Claude Code
atualize o InToca sozinho quando sair versão nova?"

- **Com o "sim":** o Claude Code confere se há versão nova depois da primeira mensagem de cada sessão (com um atraso de até 10 minutos, para não pesar), baixa-a e a
  aplica na abertura seguinte. Nada é instalado além do InToca. O `/intoca:comecar` só grava essa escolha para o catálogo de onde o InToca veio,
  depois de guardar uma cópia do arquivo de catálogos do Claude ao lado, e mostra o que fez.
- **Com o "não", ou se algo der errado:** nada é gravado e a atualização fica com você. Pelo app, digite `/plugin`, abra a aba **Marketplaces**,
  escolha o catálogo do InToca e ative **Enable auto-update**. Para atualizar na hora, rode `claude plugin update intoca@<catálogo>` (e
  `claude plugin update intoca-sala@<catálogo>` para a sala); vale na próxima abertura ou com `/reload-plugins`.
- **Catálogo que é uma pasta do seu computador** (como no uso de desenvolvimento): o plugin é lido no lugar e acompanha a pasta; não há o
  que atualizar sozinho, e o `/intoca:comecar` diz isso.

No fim da conversa o `/intoca:comecar` diz o que ficou: "atualização automática: ligada", "atualização: pela pessoa" ou "atualização
automática: não se aplica, catálogo local". As mudanças de cada versão estão no `CHANGELOG.md` de cada pacote.
