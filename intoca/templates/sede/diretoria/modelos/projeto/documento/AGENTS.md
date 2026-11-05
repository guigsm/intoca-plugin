# <projeto> · carta do projeto (documento)

Leia antes: `<sede>/AGENTS.md` (regimento) e `<sede>/WORKSPACE.md` (mapa). Esta carta só
especializa o regimento para este projeto; onde divergir, vale o regimento.

## O que é

Documento ou conjunto de textos em `<repositório>`. Sem build e sem deploy. Versão controlada
por: <Git | sincronizador>, conforme o `sede.yaml`. Porte: <ocasional | pequeno | médio | grande>
(ver `<sede>/diretoria/modelos/projeto/porte.md`).

## Recursos e quem os ocupa

A ocupação vive em `ops/fila.md`. Recursos deste projeto: o arquivo ou a pasta do documento e a
pasta de anexos e fontes. Um editor por recurso; leitura é livre.

## Regras do tipo

- **Versão em Git ou em sincronizador, nunca solta.** Se o manifesto diz Git, cada entrega é um
  commit; se diz sincronizador, o executor confere que a pasta está sincronizada antes e depois
  de editar. Não sincronizar `.git`.
- **Uma versão vigente.** Cópias ("final", "final2") não entram na pasta: o histórico é do Git
  ou do sincronizador.
- **Envio a terceiros exige autorização em arquivo.** Mandar o documento a alguém de fora é
  produção (ver `<sede>/AGENTS.md`, regra 4).
- **Dados pessoais e segredos** não vão para o texto nem para relatório.

## Cargos do projeto

- **Gerente · <projeto>:** fila, triagem e recursos; contrata executores por OS (pode ser
  compartilhado com projetos vizinhos nos portes ocasional e pequeno).
- **Executor · <PREFIXO>-NN tema:** uma OS, um recurso; entrega, relatório e arquivamento.
- **Assistentes** (revisor, pesquisador): só leitura, chamados por um chat.

Este tipo não tem Plantão. Se o documento passar a ser publicado de forma recorrente, o projeto
muda de tipo (operação).

## Níveis e modelos

Os níveis N1 a N5, os modelos e os esforços são os do regimento (`<sede>/AGENTS.md`, "Cerimônia
proporcional"). Este projeto não define tabela própria.

## Documentação canônica

- Fila, OS e relatórios: `ops/`.
- O próprio documento e suas fontes: `<repositório>`.
- Decisões de conteúdo: <arquivo de decisões, se houver>.
