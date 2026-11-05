# <projeto> · carta do projeto (app)

Leia antes: `<sede>/AGENTS.md` (regimento) e `<sede>/WORKSPACE.md` (mapa). Esta carta só
especializa o regimento para este projeto; onde divergir, vale o regimento.

## O que é

Aplicação em `<repositório>`. Stack: <stack>. Porta de desenvolvimento: `<porta>`. Deploy:
`<deploy>`. Porte: <ocasional | pequeno | médio | grande>
(ver `<sede>/diretoria/modelos/projeto/porte.md`).

## Recursos e quem os ocupa

A ocupação vive em `ops/fila.md`. Recursos deste projeto: pasta do repositório, worktrees, dados
locais, preview, produção e contas de serviços usados pelo app. Um editor por recurso; leitura é
livre.

## Regras do tipo

- **Dados locais ficam fora do Git e na pasta principal.** Banco local, uploads e arquivos
  gerados não vão para worktree: uma worktree que precise deles lê da pasta principal, sem copiar
  nem mover.
- **Preview antes de produção.** O executor registra no relatório como conferiu a mudança.
- **Dados e esquema são N4.** Alteração de esquema, de dados de usuário ou de privacidade sobe
  para N4 e vai à produção só com autorização em arquivo.
- **Segredos fora do Git:** `.env`, chaves e tokens não entram no Git, em relatório nem em chat. O
  `.env` real mora na pasta principal do projeto, não em worktree (`.env.<finalidade>` quando há mais
  de um), ignorado pelo `.gitignore`. A IA entrega o `.env.example` (nomes e comentários, sem valor);
  a pessoa copia e preenche.

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
