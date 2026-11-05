# Porte do projeto

O porte decide quantos chats o projeto tem e quanta cerimônia paga. A tabela vem do regimento da
sede (`<sede>/AGENTS.md`, seção "Portes e tipos de projeto"); se divergir, vale o regimento.

| Porte | Chats | Cerimônia |
| --- | --- | --- |
| Ocasional | Nenhum fixo. O proprietário abre um chat avulso quando precisa. | Sem fila própria. Só N1 e N2, com triagem de uma linha. Registro no manifesto. |
| Pequeno | Um gerente (pode ser compartilhado com projetos vizinhos). Executor sob demanda. | Fila curta no próprio repositório. N3 ou mais com triagem completa. |
| Médio | Um gerente e até 3 executores ao mesmo tempo, em recursos distintos. | Fila, backlog e OS por tarefa. Worktree por executor de código. Relatório obrigatório. |
| Grande | Um gerente, plantão de deploy e vários executores. Carta própria (`AGENTS.md` do projeto) e `ops/`. | Triagem completa e "vai" do N3 em diante, relatório por OS, revisão por assistente antes de produção. |

## Quando subir ou descer

Suba de porte quando duas tarefas começarem a disputar o mesmo recurso, ou quando um erro em
produção custar mais do que a cerimônia; desça quando a fila ficar vazia por semanas e a cerimônia
só atrasar o trabalho. A mudança é decisão do gerente, registrada no `sede.yaml` e na carta do
projeto.
