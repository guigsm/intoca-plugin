# <projeto> · carta do projeto (serviço)

Leia antes: `<sede>/AGENTS.md` (regimento) e `<sede>/WORKSPACE.md` (mapa). Esta carta só
especializa o regimento para este projeto; onde divergir, vale o regimento.

## O que é

Serviço em `<repositório>`: backend ou automação sem interface web própria (API, encurtador,
scripts de integração). Stack: <stack>. Deploy: `<deploy>` (ou "nenhum", se o serviço não
publica). Sigla das OS: `<PREFIXO>`. Porte: <ocasional | pequeno | médio | grande>
(ver `<sede>/diretoria/modelos/projeto/porte.md`).

## Recursos e quem os ocupa

A ocupação vive em `ops/fila.md`. Recursos deste projeto: pasta do repositório, worktrees,
produção (quando houver), cada serviço externo que o projeto usa (hospedagem, DNS ou CDN, banco,
CRM) e as exportações locais com dados pessoais. Um editor por recurso; leitura é livre.

## Regras do tipo

- **Segredos fora do Git e fora de relatório.** `.env`, chaves e tokens não entram no Git, em
  OS, em fila, em relatório nem em chat. O `.env` real mora na pasta principal do projeto
  (`.env.<finalidade>` quando há mais de um, como `.env.hospedagem`), ignorado pelo `.gitignore`. O
  repositório traz só o modelo (`.env.example`, ou `.env.<finalidade>.example`) com os nomes das
  variáveis e comentários, sem valores; a pessoa copia e preenche. Nenhuma IA lê nem grava o `.env`;
  o plugin e as configurações do Claude Code bloqueiam o que reconhecem.
- **Dados pessoais fora do Git.** Exportações com nome, telefone, documento ou outro dado
  pessoal ficam em pasta ignorada pelo Git, com data no nome, e são apagadas quando não forem
  mais necessárias. Relatório e fila citam contagens e nomes de arquivo, nunca o conteúdo.
- **Nenhuma escrita em sistema externo sem autorização em arquivo.** Ler (GET, consulta,
  diagnóstico) é livre. Criar, alterar ou apagar em CRM, banco de produção, DNS ou outro sistema
  de terceiros exige autorização registrada, qualquer que seja o nível da tarefa. Escrita
  desligada por padrão, quando o serviço tiver chave para isso.
- **Testes antes de publicar.** Toda mudança que vai à produção passa pelos testes do projeto; o
  executor registra o resultado no relatório. Sem testes, registra o que foi conferido à mão.
- **Produção só pelo Plantão e com autorização em arquivo.** Deploy, DNS, regras de borda,
  alteração de esquema e de dados de produção só com `<projeto>/ops/autorizacoes/<ID>.md`
  citado na OS. Serviço sem produção não tem Plantão.
- **Contrato entre projetos sobe para a Diretoria.** Mudar a API que outro projeto consome é
  decisão que atravessa projetos: o gerente registra e sobe à Diretoria, não combina com o outro
  gerente.

## Cargos do projeto

- **Gerente · <projeto>:** backlog, fila, triagem e recursos; contrata executores por OS.
- **Plantão · Deploy · <projeto>:** só existe se houver produção. Publica, só com
  `<projeto>/ops/autorizacoes/<ID>.md` citado na OS.
- **Executor · <PREFIXO>-NN tema:** uma OS, um recurso; entrega, relatório e arquivamento.
- **Assistentes** (revisor, auditor, pesquisador): só leitura, chamados por um chat.

## Níveis e modelos

Os níveis N1 a N5, os modelos e os esforços são os do regimento (`<sede>/AGENTS.md`, "Cerimônia
proporcional"). Este projeto não define tabela própria. Segurança, privacidade e dados pessoais
são N4.

## Documentação canônica

- Backlog: `docs/backlog.md` (portes médio e grande).
- Fila, OS e relatórios: `ops/`.
- Decisões, specs e arquitetura: `docs/` do repositório.
- Autorizações de produção e de escrita externa: `<projeto>/ops/autorizacoes/`.
