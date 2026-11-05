---
name: relatorio
description: Acione ao concluir ou interromper uma OS, para gravar relatorios/<ID>.md a partir de modelos/relatorio.md com o que mudou, o que foi verificado, as pendências, o recurso liberado e as sugestões fora do escopo.
---

# Relatório

Arquivo que o executor grava para quem o contratou. Quem lê pode não ter visto o chat.

## Passos

1. Copiar `modelos/relatorio.md` para `relatorios/<ID>.md`.
2. Preencher o cabeçalho: chat, modelo e esforço usados, quem contratou, data, estado.
3. **O que mudou.** Listar de verdade, olhando o disco ou o Git, não a memória. Um arquivo por linha.
4. **Verificações feitas.** Só o que foi de fato conferido, com o resultado. O que não foi
   verificado entra aqui como "não verificado", com o motivo.
5. **Pendências e dúvidas.** O que depende de outra pessoa, com quem decide. Dúvida que mudaria o
   rumo fica aqui e o trabalho para.
6. **Recurso liberado.** Nome do recurso e se há alteração não integrada.
7. **Sugestões fora do escopo.** Observações úteis, sem execução e sem tom de pedido.

## Regras

- Resultado ruim se escreve como resultado ruim. Verificação que falhou aparece com a saída.
- Etapa pulada ou parte bloqueada é dita, com o motivo.
- Sem segredo, sem token, sem conteúdo de `.env`.
- Frases curtas, em português, sem travessão. Fatos antes de opinião.
- Caminhos relativos ao recurso. Caminho de máquina só se a OS pediu.

## Depois

Acionar a skill `encerrar` se ainda não foi feito. Se a sessão tiver ferramenta de mensagem entre
chats, enviar uma linha a quem contratou dizendo que o relatório está gravado.
