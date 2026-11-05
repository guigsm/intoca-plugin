# <projeto> · carta do projeto (site)

Leia antes: `<sede>/AGENTS.md` (regimento) e `<sede>/WORKSPACE.md` (mapa). Esta carta só
especializa o regimento para este projeto; onde divergir, vale o regimento.

## O que é

Site em `<repositório>`. Stack: <stack>. Porta de desenvolvimento: `<porta>`. Deploy: `<deploy>`.
Porte: <ocasional | pequeno | médio | grande> (ver `<sede>/diretoria/modelos/projeto/porte.md`).

## Recursos e quem os ocupa

A ocupação vive em `ops/fila.md`. Recursos deste projeto: pasta do repositório, worktrees,
preview, produção e a conta do serviço de hospedagem. Um editor por recurso; leitura é livre.

## Regras do tipo

- **Preview antes de produção.** Toda mudança que vai ao ar passa por preview conferido; o
  executor registra a URL ou o resultado do preview no relatório.
- **Núcleo copiado, não importado.** Código e marca vindos de uma fábrica ou de outro projeto
  entram por cópia com origem anotada, nunca por caminho de pasta ou submódulo.
- **Build e deploy são deste projeto.** Nada de deploy a partir de pasta que não seja o
  repositório do site.
- **Segredos fora do Git:** `.env` e chaves não entram no Git, em relatório nem em chat. O `.env` real
  mora na pasta principal do projeto (`.env.<finalidade>` quando há mais de um), ignorado pelo
  `.gitignore`. A IA entrega o `.env.example` (nomes e comentários, sem valor); a pessoa copia e preenche.

## Cargos do projeto

- **Gerente · <projeto>:** backlog, fila, triagem e recursos; contrata executores por OS.
- **Plantão · Deploy · <projeto>:** publica em produção, só com `<projeto>/ops/autorizacoes/<ID>.md`
  citado na OS.
- **Executor · <PREFIXO>-NN tema:** uma OS, um recurso; entrega, relatório e arquivamento.
- **Assistentes** (revisor, auditor, pesquisador): só leitura, chamados por um chat.

## Níveis e modelos

Os níveis N1 a N5, os modelos e os esforços são os do regimento (`<sede>/AGENTS.md`, "Cerimônia
proporcional"). Este projeto não define tabela própria.

## Documentação canônica

- Backlog: `docs/backlog.md` (portes médio e grande).
- Fila, OS e relatórios: `ops/`.
- Decisões e arquitetura: `docs/` do repositório.
- Autorizações de produção: `<projeto>/ops/autorizacoes/`.
