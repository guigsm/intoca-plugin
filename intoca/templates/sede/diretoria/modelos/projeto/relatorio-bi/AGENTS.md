# <projeto> · carta do projeto (relatório/BI)

Leia antes: `<sede>/AGENTS.md` (regimento) e `<sede>/WORKSPACE.md` (mapa). Esta carta só
especializa o regimento para este projeto; onde divergir, vale o regimento.

## O que é

Relatório, painel ou análise de dados em `<repositório>`. Fonte: <fonte>. Ferramenta: <stack>.
Porte: <ocasional | pequeno | médio | grande> (ver `<sede>/diretoria/modelos/projeto/porte.md`).

## Recursos e quem os ocupa

A ocupação vive em `ops/fila.md`. Recursos deste projeto: a fonte de dados, o painel ou
relatório e a pasta de exportações. Um editor por recurso; leitura é livre.

## Regras do tipo

- **Dados sensíveis ficam fora da árvore.** Bases, planilhas de origem e exportações com dado
  pessoal ou financeiro ficam fora do repositório e fora de relatório; a árvore guarda só o
  código, as consultas e o necessário para reproduzir.
- **Exportação datada.** Toda exportação leva a data no nome (`<nome>-AAAA-MM-DD`) e a fonte
  anotada. Não sobrescrever exportação anterior.
- **Fonte é somente leitura.** O projeto lê a fonte; alterá-la é outra OS, no recurso da fonte.
- **Envio do relatório a terceiros exige autorização em arquivo** (ver `<sede>/AGENTS.md`,
  regra 4).

## Cargos do projeto

- **Gerente · <projeto>:** fila, triagem e recursos; contrata executores por OS.
- **Executor · <PREFIXO>-NN tema:** uma OS, um recurso; entrega, relatório e arquivamento.
- **Assistentes** (revisor, auditor, pesquisador): só leitura, chamados por um chat. O revisor
  confere números antes de qualquer envio.

Este tipo não tem Plantão. Se o relatório passar a ser publicado de forma recorrente, o projeto
muda de tipo (operação).

## Níveis e modelos

Os níveis N1 a N5, os modelos e os esforços são os do regimento (`<sede>/AGENTS.md`, "Cerimônia
proporcional"). Dados e privacidade são N4.

## Documentação canônica

- Fila, OS e relatórios: `ops/`.
- Definição das métricas e das consultas: `docs/` do repositório.
- Descrição da fonte de dados: <onde está documentada, sem expor o dado>.
