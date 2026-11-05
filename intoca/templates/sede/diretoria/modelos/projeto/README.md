# Modelos de projeto

Um modelo por tipo de projeto: `site/`, `app/`, `servico/`, `documento/`, `relatorio-bi/` e `operacao/`.
Cada pasta traz a carta (`AGENTS.md`) e o esqueleto de `ops/` prontos para copiar. São modelos de
**núcleo**: sem caminho de máquina e sem nome de projeto real. Os marcadores `<...>` são
preenchidos ao instanciar.

## Como instanciar um projeto

1. **Escolher o tipo e o porte.** Tipo: ver a tabela abaixo. Porte: ver `porte.md`.
2. **Copiar** `modelos/projeto/<tipo>/` para a pasta do repositório principal do projeto,
   `<sede>/<projeto>/<repositório>/`. Esse é o repositório que leva a carta e o `ops/` (ver
   "Onde moram a carta e o ops/").
3. **Preencher os marcadores:** `<projeto>`, `<sede>`, `<repositório>`, `<porta>`, `<deploy>`,
   `<PREFIXO>` (prefixo das OS do projeto) e os demais que aparecerem. Renomear
   `.claude/launch.json.exemplo` para `.claude/launch.json` nos tipos que o trazem, e `_gitignore` para
   `.gitignore` nos que o trazem (site, app e serviço: ignora o `.env` real e deixa passar o `.env.example`).
4. **Ajustar ao porte.** Ocasional: manter só a carta curta e apagar `ops/`. Pequeno: manter a fila
   curta. Médio e grande: manter tudo e criar `docs/backlog.md` no repositório.
5. **Registrar no `sede.yaml`:** tipo, porte, repositório, porta, deploy e gerente. Atualizar o
   mapa `WORKSPACE.md`.
6. **Pedir à Diretoria** que nomeie o gerente (chat `Gerente · <projeto>`). Se o tipo publica,
   o Plantão só é contratado quando houver o que publicar.
7. **Commitar** a carta e o `ops/` no repositório do projeto. O comando `/projeto:novo`, que faz
   estes passos, fica para o plugin.

## Onde moram a carta e o `ops/`

A pasta `<sede>/<projeto>/` é só agrupadora: a `.gitignore` da sede ignora tudo o que é de projeto
(a sede guarda governança, não produto). Por isso a carta e o `ops/` ficam **dentro do repositório
principal** do projeto:

```
<sede>/<projeto>/                 agrupadora, não versionada na sede
└─ <repositório>/                 repositório principal do projeto (Git próprio)
   ├─ AGENTS.md                   carta do projeto
   ├─ ops/                        fila, os/, relatorios/ (e autorizacoes/ nos tipos que publicam)
   ├─ docs/backlog.md             backlog (portes médio e grande)
   └─ .claude/launch.json         só em site e app
```

Projeto com vários repositórios (`app/`, `site/`, `media/`): um deles é o principal e leva a
carta e o `ops/`; os demais citam a carta do principal no próprio `AGENTS.md`. Repositórios do mesmo
projeto compartilham por contrato (cópia com origem, links por URL), nunca por caminho de pasta.

## O que cada tipo contém

| Tipo | Publica? | Plantão | Específico da carta | Extras |
| --- | --- | --- | --- | --- |
| `site/` | Sim | Deploy | Preview antes de produção; núcleo copiado, não importado por caminho. | `ops/autorizacoes/`, `.claude/launch.json.exemplo`, `_gitignore` |
| `app/` | Sim | Deploy | Dados locais fora do Git ficam na pasta principal, não em worktree. | `ops/autorizacoes/`, `.claude/launch.json.exemplo`, `_gitignore` |
| `servico/` | Se tiver produção | Deploy, só com produção | Segredos e dados pessoais fora da árvore; escrita em sistema externo só com autorização em arquivo; testes antes de publicar. | `ops/autorizacoes/`, `_gitignore` |
| `documento/` | Não | Não | Versão em Git ou em sincronizador, conforme o manifesto. | |
| `relatorio-bi/` | Não | Não | Dados sensíveis fora da árvore; exportação datada. | |
| `operacao/` | Tudo é produção | Publicação | Autorização em arquivo para cada publicação. | `ops/autorizacoes/` |

Todos trazem: `AGENTS.md`, `ops/fila.md`, `ops/os/README.md` e `ops/relatorios/README.md`.
Os modelos de OS e de relatório vêm da sede (`diretoria/modelos/os.md` e `relatorio.md`); o
projeto não duplica esses modelos.

