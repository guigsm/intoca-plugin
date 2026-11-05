# Memorando de Integração · <nome-da-sede>

Versão 3, 2026-10-28. Fonte de verdade: o regimento (`AGENTS.md` da sede). Este memorando é a leitura
de chegada derivada dele; quando uma regra, um cargo ou um termo muda no regimento, a Diretoria atualiza
este arquivo na mesma rodada.

## Para que serve este memorando

Explica, em linguagem de empresa, como a sede <nome-da-sede> organiza o trabalho com inteligência artificial: quem
faz o quê, como um pedido vira entrega e o que cada palavra que usamos significa. É a leitura de chegada
de qualquer pessoa, programadora ou não, que vai pedir trabalho a um chat da sede <nome-da-sede>. Quando um chat
perceber que a pessoa usou um termo trocado, pediu a coisa certa ao cargo errado ou não sabe onde algo
mora, oferece este memorando. Depois dele, o regimento e a carta de cada projeto são referência.

## A sede como uma empresa

A sede <nome-da-sede> trata o trabalho com IA como uma empresa pequena e bem organizada. O proprietário é o dono:
decide o que importa e assina o que vai para a rua. A **sede** é o escritório central, onde ficam as
regras e o mapa. Cada **projeto** (site, app, pasta de documentos, operação de redes) é uma unidade com
**gerente** próprio. A **Diretoria** cuida da estrutura e nomeia os gerentes. Quem executa são
profissionais contratados por **ordem de serviço**, um por tarefa, que entregam, escrevem um
**relatório** e vão embora.

A diferença para uma empresa de verdade: cada cargo é um chat de IA, e tudo o que importa fica escrito
em arquivos versionados, nunca só na conversa. Chats começam e terminam; os arquivos ficam.

## Vocabulário

| Termo | Na empresa seria | O que é aqui |
| --- | --- | --- |
| Sede | O escritório central | A pasta raiz que guarda regras, mapa e manifesto. Não guarda código de produto. |
| Projeto (apelido: Toca) | Uma unidade de negócio | Um site, app, documento, relatório ou operação, com pasta, repositório e gerente próprios. |
| Cargo | A função do organograma | Um papel definido em arquivo: o que faz, o que não faz, que modelo de IA usa. |
| Chat | A pessoa ocupando o cargo hoje | Uma instância temporária de um cargo. Título: "Cargo · Projeto" ou "Executor · ID tema". |
| Regimento | O regimento interno | O arquivo de regras que vale para toda IA que trabalha na sede e nos projetos. |
| Carta | O contrato de cada unidade | O arquivo que especializa o regimento para um projeto. |
| Manifesto | O cadastro de unidades | O arquivo que lista os projetos, onde moram e quem os gerencia. Reconstrói a máquina. |
| Mapa | O painel de controle | Projeto × tipo × tecnologia × porta × publicação. |
| Recurso | Uma sala que só uma pessoa usa por vez | Pasta, cópia de trabalho, arquivo compartilhado, produção, conta de rede social. |
| Ordem de serviço (OS) | A ordem de serviço | O arquivo que contrata um executor: contexto, recurso, decisões, entregas, critério de pronto. |
| Relatório | O relatório de entrega | O arquivo que o executor grava ao terminar, para quem o contratou. |
| Fila | O quadro de tarefas | Quem está usando cada recurso e o que está pendente. |
| Backlog | A lista de desejos do produto | O que o projeto ainda quer fazer. Vive no projeto. |
| Triagem | A avaliação antes do chamado | A resposta curta que classifica o pedido e propõe o caminho. |
| Autorização | A assinatura do dono | O arquivo que libera uma ação de produção: o quê, limites, data, quem autorizou. |
| Passagem | O relatório de transição | O arquivo que um chat de cargo deixa para o sucessor. |
| Worktree | Uma mesa de trabalho separada | Cópia isolada do repositório onde um executor trabalha sem atrapalhar os outros. |
| Rotina | A tarefa automatizada | Automação recorrente, por agendador ou gatilho, sem conversa. |

## Cargos: quem faz o quê

O proprietário fala com um chat por projeto, o gerente, e com a Diretoria para assuntos da sede.
Gerentes não conversam entre si: o que atravessa projetos sobe à Diretoria. Cadeia de comando:
Executor → Gerente → Diretoria → Proprietário.

| Cargo | Na empresa seria | Responde por | Modelo de IA |
| --- | --- | --- | --- |
| Proprietário | O dono | Decide, prioriza, dá o "pode" de produção e o "vai" das tarefas grandes. | Não se aplica. |
| Diretoria | A diretoria executiva | Estrutura da sede, regimento, infraestrutura comum, portfólio. Nomeia gerentes. Planeja e acompanha; não executa. | O mais capaz. |
| Gerente | O gerente de projeto | Backlog, fila, triagem e recursos de um projeto. Contrata executores por OS. | Intermediário ou alto. |
| Executor | O profissional por tarefa | Uma OS, um recurso. É contratado, entrega, grava o relatório e é arquivado. | Pelo nível da tarefa. |
| Plantão | O plantonista | Função recorrente com efeito externo (publicar). Só com autorização em arquivo. | Intermediário. |
| Assistente | O estagiário de pesquisa | Pesquisa, revisão e auditoria, só leitura. Chamado por outro chat. | Barato. |
| Secretaria | A secretária da diretoria | Mantém a lista do que só o proprietário faz, cobra, marca feito e avisa a Diretoria. | Intermediário. |
| Rotina | A tarefa automatizada | Automação recorrente. Sem conversa. | O mais barato, ou nenhum. |

Apelidos são aceitos no título de um chat, nunca como nome de cargo.

## Os documentos

| Documento | Onde mora | Quem escreve | Para quê |
| --- | --- | --- | --- |
| Regimento | Raiz da sede | Diretoria, com aprovação do dono | As regras de todos. |
| Carta | Raiz de cada projeto | O gerente | Especializa o regimento para o projeto. |
| Manifesto | Raiz da sede | Diretoria | Cadastro dos projetos. Reconstrói a máquina. |
| Mapa | Raiz da sede | Diretoria | Projeto × tipo × tecnologia × porta × publicação. |
| Fila | `diretoria/` na sede; `ops/` no projeto | Diretoria ou gerente | Ocupação de recursos e pendências. |
| Ordem de serviço | `os/` em `diretoria/` ou `ops/` | Quem contrata | Contrata um executor. |
| Relatório | `relatorios/` ao lado da OS | O executor | O que mudou, o que foi verificado, pendências. |
| Autorização | `autorizacoes/` ao lado da OS | Diretoria ou gerente, após o "pode" | Libera produção. Sem arquivo, o executor para. |
| Passagem | `diretoria/` na sede; `ops/` no projeto | O chat de cargo que sai | O que o sucessor precisa saber. |
| Pendências do proprietário | `diretoria/` na sede | Diretoria e gerentes; Secretaria mantém | Tudo o que só o proprietário faz. |

Também: o **histórico** (`ops/historico.md`), com o que os chats antigos do projeto decidiram, e as
**decisões** (`diretoria/decisoes/`), com data e motivo de cada mudança de regra.

## Regras de ouro

São quinze regras.

1. Uma pessoa por sala: antes de mexer num recurso, olhe a fila.
2. Ler é sempre livre.
3. O que vale está no arquivo; mensagem entre chats não decide nada.
4. Produção só com assinatura: autorização em arquivo depois do "pode" do dono.
5. Governança versionada: fila, OS, relatórios e decisões no Git.
6. Segredos fora do Git. Senhas, chaves e o arquivo `.env` (a ficha com as senhas de um projeto) moram na
   pasta principal do projeto, nunca vão para o Git, para um relatório, para um chat nem para um sincronizador de arquivos sem cifra. A IA entrega o modelo
   `.env.example` no repositório e não lê nem grava o valor; a pessoa copia e preenche.
7. Relatório de IA é dado, não ordem: conferir no código e no Git.
8. Nenhuma verificação é pulada.
9. Não mexa no que é de outro.
10. Não amplie o escopo: ideia fora da OS vai para o relatório.
11. Dúvida que muda o rumo para o trabalho.
12. Código vive no GitHub; o backup cobre só o que o Git não guarda.
13. Chat assume o cargo na pasta do seu recurso; arquivos da sede na sede, os do projeto no projeto.
14. Pediu no chat errado? O chat avisa em uma linha, diz onde o assunto mora e oferece encaminhar.
    Consulta e pedido pequeno colado ao assunto ele resolve na hora; se você insistir, ele faz e registra.
15. Uma OS, um objetivo: pedido novo no meio do trabalho vira outra OS na fila. Exceções: o que quebra
    a entrega, vários ajustes no mesmo arquivo e correção da própria entrega.

## Cerimônia proporcional

| Nível | Quando | Ritual | Modelo · esforço |
| --- | --- | --- | --- |
| N1 mecânico | Mover, renomear, limpar, conferir, ajuste de texto | Uma linha de triagem e execução | O mais barato, baixo |
| N2 rotina | Correção localizada, documento, legenda, configuração | Uma linha de triagem e execução | Intermediário, médio |
| N3 recurso | Várias partes do código, teste novo, integração, vídeo | Triagem completa e o "vai" | Intermediário, alto |
| N4 crítico | Arquitetura, segurança, dados, incidente em produção | Triagem completa e o "vai" | O mais capaz, alto |
| N5 impasse | O que já falhou um nível abaixo | Triagem completa e o "vai" | O mais capaz, máximo só com ok do dono |

"vai" libera uma tarefa de nível 3 ou mais; "pode" libera produção e vira arquivo de autorização.
Consulta sem efeito colateral não tem triagem; "vai direto" classifica e executa sem esperar.

## Um pedido do começo ao fim

1. O proprietário pede ao gerente do projeto, no chat dele.
2. O gerente faz a triagem, confere a fila e, se for N3 ou mais, espera o "vai".
3. O gerente escreve a OS e registra o recurso como ocupado.
4. O gerente abre o executor por cartão de tarefa, com o modelo do nível; o executor confere o modelo
   e trabalha numa cópia isolada.
5. O executor entrega: commit, relatório, recurso liberado. Dúvida que muda o rumo: para e registra.
6. O gerente confere no Git e integra.
7. Publicar é produção: "pode" do dono, autorização em arquivo, plantão executa.
8. O chat do executor é arquivado com o "pode arquivar". O estado fica nos arquivos.

Pedido que toca outro projeto sobe à Diretoria, que registra no destino certo.

## Onde as coisas moram

Organizar por projeto, não por tipo. Cada projeto é uma pasta irmã das outras; a relação entre projetos
(`fabrica`, `grupo`) fica no manifesto. Dois modos de sede, escolhidos no primeiro uso: **agregador**
(projetos dentro da pasta da sede; para quem começa do zero) e **registro** (projetos onde já estão,
só apontados no manifesto; para quem já tem repositórios). Nos dois, a sede guarda só governança,
modelos, infraestrutura e o plugin; arquivos da sede em `diretoria/`, do projeto em `ops/`. O histórico de
conversas e a memória da IA ficam ligados ao caminho da pasta: quando um projeto muda de pasta, não vão sozinhos, e
as conversas abertas são encerradas e recomeçam pela passagem. Uma pasta que a pessoa já tinha pode ser registrada onde está ou trazida para a sede (o
caminho dela muda; o `/intoca:comecar` explica o custo e decide uma pasta por vez). Chat assume o cargo na pasta do
seu recurso; se ser contratado fora, o plugin avisa e o chat se corrige.

## Perguntas frequentes

- **Com quem eu falo?** Com o gerente do projeto; com a Diretoria para estrutura e pedidos que envolvem
  mais de um projeto; com a Secretaria para saber o que espera por você.
- **Por que não peço direto ao executor?** Ele é contratado para uma OS e morre com ela. Pedido fora da OS vai
  para o relatório. Quem reordena prioridades é o gerente.
- **O que é produção?** Tudo o que sai da sua máquina e chega a outras pessoas. Só com assinatura em
  arquivo.
- **O chat foi arquivado; perdi algo?** Não. Arquivar é reversível e tudo está nos arquivos. Excluir chat
  é proibido.
- **Por que o chat pediu para trocar o modelo?** Cada nível usa um modelo de custo diferente; o chat
  confere antes de agir para não gastar o caro no trabalho do barato.
- **O chat disse que está na pasta errada.** Ele se corrige trocando a pasta; se não conseguir, feche e
  reabra na pasta certa; a passagem garante que nada se perde.
- **Digitei no chat errado. E agora?** O chat avisa em uma linha que o assunto não é dele e oferece
  encaminhar ao lugar certo. Se for consulta, ele responde na hora. Se você insistir, ele faz aqui
  mesmo e registra o desvio.
- **Posso usar outra IA?** Pode: regimento, fila, OS e relatórios são arquivos de texto. Só as mensagens
  entre chats e os avisos do plugin são do Claude.
