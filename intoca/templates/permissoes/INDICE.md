# Modelos de permissão por rigor

O script `scripts/aplicar-rigor.mjs` copia um destes arquivos para `.claude/settings.json` da sede e de cada
projeto do manifesto, com o "sim" da pessoa, e nunca por cima de um arquivo que já exista. Explicação para quem
não programa: `docs/permissoes.md`.

| Arquivo | Nível | `defaultMode` | `allow` |
| --- | --- | --- | --- |
| `cauteloso.json` | cauteloso: o porteiro pede licença antes de editar código e de rodar comandos que alteram coisas; ler e comandos só de leitura passam | `default` (Manual) | nenhum |
| `equilibrado.json` | equilibrado: o porteiro conhece a rotina | `acceptEdits` | comandos de rotina exatos, sem `*` |

O nível `autonomo` não tem modelo: chega numa versão seguinte, depois da trava de produção por arquivo.

Os dois modelos têm o mesmo `deny` (os arquivos de segredo da lista do hook, `LISTAS_DE_SEGREDO` do `hooks/lib.mjs`,
menos as heurísticas de nome; envio forçado, pular verificação, descartar trabalho) e o
mesmo `ask` (o que é produção ou destrutivo: apagar repositório, publicar pacote, publicar no Cloudflare, apagar
pasta ou à força, instalar dependência, tarefa agendada, encerrar processo; e ler ou editar `.env.*`, que no `deny`
pegaria também o `.env.example`). Nenhum modelo traz caminho de máquina nem nome de projeto: as regras de arquivo
usam `//**/`, que vale em qualquer pasta.

`.claude/settings.json` é o arquivo compartilhado da pasta: vai junto com o projeto se a versão for enviada. Numa
pasta ainda não confiável, o app ignora o `allow` até a pessoa aceitar a pergunta de confiança (visto no Claude Code
2.1.308); `deny` e `ask` valem sempre.

Fora do `allow` de propósito, mesmo no equilibrado: fechar versão (o `*` deixaria passar a opção curta que pula a
verificação), comandos com opção livre que roda programa ou grava arquivo, e qualquer coisa de produção. Esses
casos ficam com o porteiro do plugin, que lê a opção uma a uma, ou com a pergunta do app.
