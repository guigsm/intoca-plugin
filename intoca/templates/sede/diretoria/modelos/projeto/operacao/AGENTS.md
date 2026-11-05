# <projeto> · carta do projeto (operação)

Leia antes: `<sede>/AGENTS.md` (regimento) e `<sede>/WORKSPACE.md` (mapa). Esta carta só
especializa o regimento para este projeto; onde divergir, vale o regimento.

## O que é

Operação recorrente: contas, agendas, filas e publicações. Canais: <canais>. Ferramenta:
<stack ou serviço>. Porte: <ocasional | pequeno | médio | grande>
(ver `<sede>/diretoria/modelos/projeto/porte.md`).

## Recursos e quem os ocupa

A ocupação vive em `ops/fila.md`. Recursos deste projeto: cada conta ou canal, as agendas e filas
de publicação e a produção. Um editor por recurso; leitura é livre.

## Regras do tipo

- **Tudo é produção.** Publicar, agendar, responder, enviar ou alterar conta é efeito externo e
  exige autorização registrada em arquivo, qualquer que seja o nível da tarefa.
- **Uma autorização por publicação (ou por lote delimitado).** O arquivo diz o quê, em que
  canal, em que janela e quem autorizou. O executor lê o arquivo antes de agir; sem arquivo,
  para e registra.
- **Rascunho não é publicação.** Preparar texto, imagem e agenda é trabalho livre; só o ato de
  publicar ou enviar exige autorização.
- **Exclusão e envio são irreversíveis.** Apagar publicação, conta ou contato, ou enviar a
  terceiros, só com autorização em arquivo.
- **Credenciais fora do Git.** Senhas, tokens e chaves nunca entram em arquivo, OS ou
  relatório.

## Cargos do projeto

- **Gerente · <projeto>:** fila, triagem e recursos; prepara as autorizações para o "pode" do
  proprietário; contrata executores por OS.
- **Plantão · Publicação · <projeto>:** executa as publicações autorizadas, uma a uma, e registra
  o resultado.
- **Executor · <PREFIXO>-NN tema:** uma OS, um recurso; entrega, relatório e arquivamento.
- **Assistentes** (revisor, pesquisador): só leitura, chamados por um chat. O revisor confere o
  conteúdo antes de cada publicação.

## Níveis e modelos

Os níveis N1 a N5, os modelos e os esforços são os do regimento (`<sede>/AGENTS.md`, "Cerimônia
proporcional"). A autorização em arquivo vale em qualquer nível.

## Documentação canônica

- Fila, OS e relatórios: `ops/`.
- Calendário e linha editorial: <arquivo>.
- Autorizações: `<projeto>/ops/autorizacoes/`.
