---
name: encerrar
description: 'Acione no fim de uma OS ou de uma tarefa, antes de declarar pronto. Roda o checklist de encerramento: commit ou integração, relatório, recurso liberado na fila e pedido de arquivamento do chat.'
---

# Encerrar

Checklist de fim. Nada se declara pronto antes de passar por ele.

## Checklist

1. **Escopo.** Conferir que nada foi alterado fora do recurso ocupado: listar o recurso e o Git.
2. **Critério de pronto.** Cada item da OS conferido com evidência. Item não cumprido volta ao
   trabalho ou vira pendência dita com clareza.
3. **Commit ou integração.** Em repositório: commit com mensagem que diz o porquê, e integração
   conforme a carta do projeto. Nunca `--no-verify`. Fora de repositório: nada a commitar, dizer isso.
4. **Produção.** Nenhuma publicação sem autorização em arquivo citada na OS (na sede,
   `diretoria/autorizacoes`; no projeto, `ops/autorizacoes`). Sem o arquivo, parar na integração e
   registrar que a publicação aguarda.
5. **Relatório.** Gravado pela skill `relatorio`, com a verdade sobre o que foi e o que não foi feito.
6. **Fila.** Recurso liberado e estado da OS atualizado. Pendências com dono.
7. **Aviso.** Se houver mensagem entre chats, uma linha a quem contratou. O arquivo vale mais que a mensagem.
8. **Arquivamento.** Pedir a quem contratou que confira no Git e arquive o chat. O executor não
   arquiva o próprio chat nem inicia nova tarefa por conta própria.

## Se algo falhar

- Verificação reprovada: corrigir dentro do escopo ou registrar e parar.
- Alteração que não é sua no recurso: não reverter. Listar no relatório e perguntar.
- Dúvida que muda o rumo: pendência no relatório e parada.

## Fecho da resposta ao usuário

Estado em uma frase, o que mudou, o que ficou pendente e quem decide. Sem oferta de próximos
passos além das pendências registradas.
