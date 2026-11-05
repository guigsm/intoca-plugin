# Índice da sede de partida

A pasta `sede/` guarda a árvore que o `/intoca:comecar` copia para a **sede nova**, com a mesma forma da
sede de origem. Este índice diz, por arquivo, o destino na sede nova, a origem, o tratamento e o que
preencher. É o contrato entre esta pasta e o comando: quem copia lê esta tabela, não adivinha.

Versão do conteúdo: 0.6.0 do plugin. O texto é neutro: sem nome de projeto, cliente, caminho
nem pessoa do proprietário da sede de origem.

## Como copiar

1. Copiar cada arquivo da tabela de `templates/sede/<Arquivo>` para `<sede>/<Destino>`, criando as pastas.
   Um único arquivo muda de nome: o `_gitignore` da raiz vira `.gitignore` (dentro do pacote ele não pode se
   chamar `.gitignore`, porque valeria para a pasta de modelos). Os `_gitignore` dos modelos de projeto
   (site, app e serviço) são copiados com o nome do pacote; quem instancia o projeto os renomeia.
2. Nos arquivos com marcadores na última coluna, trocar `<nome-da-sede>` pelo nome da sede e
   `<AAAA-MM-DD>` pela data de hoje. Os demais marcadores (`<sede>`, `<projeto>`, `<usuário>`, `<ID>`...)
   **ficam como estão**: são parte do texto do regimento ou dos modelos, preenchidos quando o modelo é usado.
3. Não sobrescrever arquivo que já exista na sede nova sem perguntar.
4. `sede.yaml` começa com `projetos: []`; `modo`, `perfil`, `rigor` e `titulos` ficam comentados até o
   `/intoca:comecar` e a escolha do rigor os preencherem.

## Arquivos

| Arquivo (em `templates/sede/`) | Destino na sede nova | Origem na sede de origem | Tratamento | Preencher na criação |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | `AGENTS.md` | `AGENTS.md` | neutralizado | - |
| `CLAUDE.md` | `CLAUDE.md` | `CLAUDE.md` | neutralizado | - |
| `README.md` | `README.md` | `README.md` (forma) | novo | `<nome-da-sede>`, `<AAAA-MM-DD>` |
| `WORKSPACE.md` | `WORKSPACE.md` | `WORKSPACE.md` (forma) | novo | `<nome-da-sede>`, `<AAAA-MM-DD>` |
| `_gitignore` | `.gitignore` | `.gitignore` | neutralizado | - |
| `diretoria/autorizacoes/README.md` | `diretoria/autorizacoes/README.md` | novo | novo | - |
| `diretoria/decisoes/README.md` | `diretoria/decisoes/README.md` | novo | novo | - |
| `diretoria/fila.md` | `diretoria/fila.md` | `diretoria/fila.md` (forma) | novo | `<nome-da-sede>`, `<AAAA-MM-DD>` |
| `diretoria/memorando.md` | `diretoria/memorando.md` | `diretoria/memorando.md` | neutralizado | `<nome-da-sede>` |
| `diretoria/modelos/README.md` | `diretoria/modelos/README.md` | novo | novo | ao usar o modelo |
| `diretoria/modelos/os.md` | `diretoria/modelos/os.md` | `diretoria/modelos/os.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/README.md` | `diretoria/modelos/projeto/README.md` | `diretoria/modelos/projeto/README.md` | neutralizado | ao usar o modelo |
| `diretoria/modelos/projeto/app/.claude/launch.json.exemplo` | `diretoria/modelos/projeto/app/.claude/launch.json.exemplo` | `diretoria/modelos/projeto/app/.claude/launch.json.exemplo` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/app/AGENTS.md` | `diretoria/modelos/projeto/app/AGENTS.md` | `diretoria/modelos/projeto/app/AGENTS.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/app/_gitignore` | `diretoria/modelos/projeto/app/_gitignore` | novo | novo | ao usar o modelo (vira `.gitignore` na pasta do repositório) |
| `diretoria/modelos/projeto/app/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/app/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/app/ops/autorizacoes/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/app/ops/fila.md` | `diretoria/modelos/projeto/app/ops/fila.md` | `diretoria/modelos/projeto/app/ops/fila.md` | neutralizado | ao usar o modelo |
| `diretoria/modelos/projeto/app/ops/os/README.md` | `diretoria/modelos/projeto/app/ops/os/README.md` | `diretoria/modelos/projeto/app/ops/os/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/app/ops/relatorios/README.md` | `diretoria/modelos/projeto/app/ops/relatorios/README.md` | `diretoria/modelos/projeto/app/ops/relatorios/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/documento/AGENTS.md` | `diretoria/modelos/projeto/documento/AGENTS.md` | `diretoria/modelos/projeto/documento/AGENTS.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/documento/ops/fila.md` | `diretoria/modelos/projeto/documento/ops/fila.md` | `diretoria/modelos/projeto/documento/ops/fila.md` | neutralizado | ao usar o modelo |
| `diretoria/modelos/projeto/documento/ops/os/README.md` | `diretoria/modelos/projeto/documento/ops/os/README.md` | `diretoria/modelos/projeto/documento/ops/os/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/documento/ops/relatorios/README.md` | `diretoria/modelos/projeto/documento/ops/relatorios/README.md` | `diretoria/modelos/projeto/documento/ops/relatorios/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/operacao/AGENTS.md` | `diretoria/modelos/projeto/operacao/AGENTS.md` | `diretoria/modelos/projeto/operacao/AGENTS.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/operacao/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/operacao/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/operacao/ops/autorizacoes/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/operacao/ops/fila.md` | `diretoria/modelos/projeto/operacao/ops/fila.md` | `diretoria/modelos/projeto/operacao/ops/fila.md` | neutralizado | ao usar o modelo |
| `diretoria/modelos/projeto/operacao/ops/os/README.md` | `diretoria/modelos/projeto/operacao/ops/os/README.md` | `diretoria/modelos/projeto/operacao/ops/os/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/operacao/ops/relatorios/README.md` | `diretoria/modelos/projeto/operacao/ops/relatorios/README.md` | `diretoria/modelos/projeto/operacao/ops/relatorios/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/porte.md` | `diretoria/modelos/projeto/porte.md` | `diretoria/modelos/projeto/porte.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/relatorio-bi/AGENTS.md` | `diretoria/modelos/projeto/relatorio-bi/AGENTS.md` | `diretoria/modelos/projeto/relatorio-bi/AGENTS.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/relatorio-bi/ops/fila.md` | `diretoria/modelos/projeto/relatorio-bi/ops/fila.md` | `diretoria/modelos/projeto/relatorio-bi/ops/fila.md` | neutralizado | ao usar o modelo |
| `diretoria/modelos/projeto/relatorio-bi/ops/os/README.md` | `diretoria/modelos/projeto/relatorio-bi/ops/os/README.md` | `diretoria/modelos/projeto/relatorio-bi/ops/os/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/relatorio-bi/ops/relatorios/README.md` | `diretoria/modelos/projeto/relatorio-bi/ops/relatorios/README.md` | `diretoria/modelos/projeto/relatorio-bi/ops/relatorios/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/servico/AGENTS.md` | `diretoria/modelos/projeto/servico/AGENTS.md` | `diretoria/modelos/projeto/servico/AGENTS.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/servico/_gitignore` | `diretoria/modelos/projeto/servico/_gitignore` | novo | novo | ao usar o modelo (vira `.gitignore` na pasta do repositório) |
| `diretoria/modelos/projeto/servico/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/servico/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/servico/ops/autorizacoes/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/servico/ops/fila.md` | `diretoria/modelos/projeto/servico/ops/fila.md` | `diretoria/modelos/projeto/servico/ops/fila.md` | neutralizado | ao usar o modelo |
| `diretoria/modelos/projeto/servico/ops/os/README.md` | `diretoria/modelos/projeto/servico/ops/os/README.md` | `diretoria/modelos/projeto/servico/ops/os/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/servico/ops/relatorios/README.md` | `diretoria/modelos/projeto/servico/ops/relatorios/README.md` | `diretoria/modelos/projeto/servico/ops/relatorios/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/site/.claude/launch.json.exemplo` | `diretoria/modelos/projeto/site/.claude/launch.json.exemplo` | `diretoria/modelos/projeto/site/.claude/launch.json.exemplo` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/site/AGENTS.md` | `diretoria/modelos/projeto/site/AGENTS.md` | `diretoria/modelos/projeto/site/AGENTS.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/site/_gitignore` | `diretoria/modelos/projeto/site/_gitignore` | novo | novo | ao usar o modelo (vira `.gitignore` na pasta do repositório) |
| `diretoria/modelos/projeto/site/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/site/ops/autorizacoes/README.md` | `diretoria/modelos/projeto/site/ops/autorizacoes/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/site/ops/fila.md` | `diretoria/modelos/projeto/site/ops/fila.md` | `diretoria/modelos/projeto/site/ops/fila.md` | neutralizado | ao usar o modelo |
| `diretoria/modelos/projeto/site/ops/os/README.md` | `diretoria/modelos/projeto/site/ops/os/README.md` | `diretoria/modelos/projeto/site/ops/os/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/projeto/site/ops/relatorios/README.md` | `diretoria/modelos/projeto/site/ops/relatorios/README.md` | `diretoria/modelos/projeto/site/ops/relatorios/README.md` | copiado | ao usar o modelo |
| `diretoria/modelos/relatorio.md` | `diretoria/modelos/relatorio.md` | `diretoria/modelos/relatorio.md` | copiado | ao usar o modelo |
| `diretoria/os/README.md` | `diretoria/os/README.md` | novo | novo | - |
| `diretoria/passagem.md` | `diretoria/passagem.md` | `diretoria/passagem.md` (forma) | novo | `<AAAA-MM-DD>` |
| `diretoria/pendencias-do-proprietario.md` | `diretoria/pendencias-do-proprietario.md` | `diretoria/pendencias-do-proprietario.md` (forma) | novo | `<AAAA-MM-DD>` |
| `diretoria/relatorios/README.md` | `diretoria/relatorios/README.md` | novo | novo | - |
| `sede.yaml` | `sede.yaml` | `sede.yaml` (campos, sem valores) | novo | `<nome-da-sede>` |

Tratamento: **copiado** = igual ao original; **neutralizado** = original com o específico trocado pelo
genérico, sem mudar a regra; **novo** = escrito para a sede de partida, só com cabeçalho e tabelas, no formato do original.

## O que não entra nesta versão

- `diretoria/modelos/os-migracao.md` (modelo de OS para mover projeto para dentro da sede): carrega lições
  de uma migração específica. Fica de fora; quem precisar de migração pede à Diretoria.
- Fila, passagem, OS, relatórios, decisões e autorizações **da sede de origem**: são histórico dela.
- `_infra/` (painel, backup), `.claude/settings.json` e `.claude-plugin/marketplace.json`: pertencem à
  máquina e à sede de origem. A permissão da sede nova é assunto do rigor das permissões.
- Skills, agentes e hooks: vêm do próprio plugin, não da sede.
