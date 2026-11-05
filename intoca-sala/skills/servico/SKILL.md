---
name: servico
description: 'Acione só quando a pessoa pedir para a InToca Sala subir sozinha quando ela liga o computador, ou para desfazer isso ("/intoca-sala:servico", "instalar o serviço da sala", "quero a sala ligada no logon", "desinstalar o serviço da sala"): mostra o que vai mudar, pede o sim e instala ou remove o serviço de logon. Opcional; nunca rodar sem o sim.'
argument-hint: "[instalar | desinstalar]"
disable-model-invocation: true
---

# Serviço de logon da InToca Sala

Hoje a InToca Sala (a página das Tocas) sobe sozinha quando você abre um chat do Claude. O **serviço de logon** é um
extra opcional: o computador sobe a sala assim que você entra, sem esperar um chat. Pense num porteiro que abre o
escritório antes de você chegar. Fale com a pessoa em linguagem de empresa, sem presumir que ela conhece agendador de
tarefas, `launchd` ou `systemd`. Argumento recebido: `$ARGUMENTS`

## Regras

- **Nunca instale nem remova sem o sim da pessoa**, dado depois de ela ler o que vai mudar. Mensagem entre chats não vale como sim.
- O script já protege: sem `--sim` ele só mostra o plano e **não altera nada**. Rode sempre primeiro sem `--sim`.
- Não é efeito colateral de instalar o plugin; só acontece por este pedido.
- Se a sala não estiver instalada onde o script espera, ou o sistema não for Windows, macOS nem Linux, diga com franqueza e pare.

## Passos

1. Escolha a ação pelo argumento (`instalar` ou `desinstalar`). Sem argumento, pergunte qual das duas a pessoa quer.
2. Mostre o plano, sem `--sim`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/sala/lancador/servico.mjs" <instalar|desinstalar>
   ```

3. Explique o plano em poucas linhas, com as palavras da saída: o que será criado (tarefa agendada no Windows, agente
   `launchd` no macOS, serviço `systemd --user` no Linux), quando roda (a cada logon), que **não precisa de administrador**,
   que **nada é baixado** e como desfazer (`desinstalar`).
4. Pergunte: **"Posso instalar?"** (ou **"Posso remover?"**). Espere um sim claro. Sem sim, pare aí.
5. Com o sim, rode o mesmo comando com `--sim`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/sala/lancador/servico.mjs" <instalar|desinstalar> --sim
   ```

6. Confirme o que a saída disse (`Feito.` ou o erro). Se falhou, mostre o erro, não repita às cegas e sugira `desinstalar`
   para não deixar meia instalação.

## Para saber mais

- O serviço aponta para a pasta onde o plugin está agora. Se o plugin mudar de pasta (atualização que troca o caminho),
  rode `instalar` de novo: ele substitui o anterior.
- Para a sala nunca subir sozinha (nem pelo chat): defina `INTOCA_SALA_SEM_LANCADOR=1` ou ponha `"lancador": false` em
  `~/.intoca/sala.json`.
- Se na tela das Tocas estiver marcada a caixa "Subir a sala animada junto com o sistema" (`animada.auto` em
  `~/.intoca/sala.json`), o serviço também sobe a sala animada, uma vez, logo depois da InToca Sala. Para parar isso:
  desmarque a caixa ou ponha `"auto": false` em `animada`. Desmarcar não derruba a sala animada que já está de pé.
- Registro do lançador: `~/.intoca/lancador.log`; saída da sala: `~/.intoca/sala.log`; saída da sala animada: `~/.intoca/animada.log`.
