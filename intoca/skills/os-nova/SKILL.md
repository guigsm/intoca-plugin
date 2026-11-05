---
name: os-nova
description: Acione depois de uma triagem aprovada, quando o pedido vai para um chat executor. Gera os/<ID>-<tema>.md a partir de modelos/os.md, autossuficiente, e registra o recurso como ocupado na fila.
---

# Nova ordem de serviço

Gera o arquivo que contrata um executor. A OS precisa ser lida sozinha, em um chat sem histórico.

## Antes

- Triagem aprovada com "vai" (ou "vai direto").
- Recurso confirmado livre na fila, ou o executor entra atrás de quem o tem.
- Um recurso por OS. Se forem dois, são duas OS.

## Passos

1. **ID.** Sigla do projeto, hífen e número sequencial da fila. Exemplo: `DIR-02`. Conferir `os/`
   para não repetir.
2. **Tema.** Duas a quatro palavras, minúsculas, sem acento, separadas por hífen. O arquivo é
   `os/<ID>-<tema>.md`.
3. **Copiar** `modelos/os.md` e preencher todos os campos. Nenhum `<marcador>` pode sobrar.
4. **Cabeçalho.** Modelo e esforço do nível da triagem, com a instrução de conferir o modelo.
5. **Contexto.** Liste arquivos por caminho, com o motivo. Só leitura. Coisa que o executor não
   consegue deduzir (decisão passada, restrição, o que está congelado) vai em "Decisões já tomadas".
6. **Entregas.** Uma por linha, com caminho relativo e formato. Verbo no imperativo.
7. **Critério de pronto.** Condições que se verificam por leitura ou comando. Incluir sempre
   "nada alterado fora do recurso ocupado".
8. **Relatório.** Manter o bloco do modelo.
9. **Fila.** Registrar a OS, o nível, o modelo, o recurso e o estado "aguardando abertura do chat".

## Regras

- Sem caminho de máquina nos arquivos do núcleo. Caminho absoluto só vale na instrução que o
  proprietário cola no chat novo.
- Não incluir segredo. Indicar onde ele está, não o valor.
- Produção na OS só com autorização já gravada, citada no campo "Autorização" da OS: na sede,
  `diretoria/autorizacoes/<ID>.md`; no projeto, `ops/autorizacoes/<ID>.md`. Sem o arquivo, a OS não
  inclui o passo de produção.

## Depois

Dizer ao proprietário o título do chat (`Executor · <ID> <tema>`), o modelo e o esforço, e a linha
para colar: executar o arquivo da OS.
