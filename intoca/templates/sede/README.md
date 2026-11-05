# Sede <nome-da-sede>

Meta-repositório da sede: guarda regras, mapa e manifesto. Não guarda código de produto; cada projeto
tem a sua pasta e o seu repositório. Criada em <AAAA-MM-DD> a partir da sede de partida do plugin
`intoca`.

## O que há em cada pasta

| Caminho | O que é |
| --- | --- |
| `AGENTS.md` | Regimento da sede: missão, vocabulário, cargos, regras, cerimônia, ciclo de vida da OS. |
| `CLAUDE.md` | Importa o regimento. Só adaptações do Claude Code. |
| `WORKSPACE.md` | Mapa curto. O mapa oficial é o `sede.yaml`. |
| `sede.yaml` | Manifesto: projetos, repositórios, cargos e rotinas. Reconstrói a máquina. |
| `diretoria/` | Governança: `fila.md`, `os/`, `relatorios/`, `decisoes/`, `autorizacoes/` e `modelos/`. |
| `diretoria/memorando.md` | Memorando de Integração: a leitura de chegada, em linguagem de empresa. |

## Como um chat novo deve usar esta pasta

1. Ler `AGENTS.md` inteiro. Quem não conhece o vocabulário lê antes o `diretoria/memorando.md`
   (ou pede `/intoca:memorando`).
2. Ler `diretoria/fila.md` e conferir se o recurso que vai editar está livre.
3. Se foi contratado para cumprir uma OS, ler o arquivo da OS inteiro e seguir à letra. Conferir o
   modelo da sessão com o previsto e parar se for outro.
4. Ao terminar, gravar o relatório em `diretoria/relatorios/<ID>.md` e liberar o recurso na fila.
5. Mudança de regimento ou de modelo é decisão do proprietário, registrada pela Diretoria em
   `diretoria/decisoes/`.

## Projetos

Os projetos ficam listados no `sede.yaml` e resumidos no `WORKSPACE.md`. Cada um traz a própria carta
(`AGENTS.md`) e o próprio `ops/` no repositório principal. Para criar um projeto novo, siga
`diretoria/modelos/projeto/README.md`.
