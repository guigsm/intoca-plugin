# InToca

Plugin do Claude Code que organiza o trabalho com IA como um escritório: cada projeto tem um gerente, cada tarefa vira uma ordem de
serviço para um profissional contratado, e tudo termina em relatório. Serve para quem não programa.

- **InToca Sede** (`intoca`): os cargos e as rotinas, os assistentes e as regras que valem em todas as conversas.
- **InToca Sala** (`intoca-sala`, opcional): o quadro de avisos do escritório, dentro do app e no navegador.

## Antes de instalar

O InToca precisa de dois programas no computador, além do Claude Code e da internet:

- **Git**: o Claude Code o usa para baixar este catálogo do GitHub. Sem ele, o primeiro comando de instalação para com a mensagem
  "Failed to clone marketplace repository".
- **Node**, versão 20 ou mais nova: roda os avisos e as rotinas do plugin. Sem ele o plugin instala, mas nada acontece, e sem mensagem de erro.

Conta no GitHub não é necessária.

| Sistema | Git | Node |
| --- | --- | --- |
| Windows | `winget install Git.Git` | `winget install OpenJS.NodeJS.LTS` |
| macOS (Homebrew) | `brew install git` | `brew install node` |
| Linux (Debian, Ubuntu) | `sudo apt install -y git` | `sudo apt install -y nodejs npm` |

Sem esses gerenciadores, baixe os instaladores em <https://git-scm.com> e <https://nodejs.org>. **Peça ao Claude: ele confere os dois e instala o
que faltar com a sua autorização** (veja o "Roteiro para o Claude", abaixo). Depois de instalar um deles, feche e abra o Claude Code (ou o
terminal): uma conversa aberta antes não enxerga programas instalados depois.

## Instalar

Escolha o caminho do lugar onde você usa o Claude Code.

**No terminal**, com o Claude Code instalado:

```
claude plugin marketplace add guigsm/intoca-plugin
claude plugin install intoca@intoca
```

**No app de desktop** o comando `claude` costuma não estar no PATH do terminal do app. Use a interface: o botão **+** ao lado da caixa de
texto, **Add plugins**; ou digite `/plugin`, aba **Marketplaces**, adicione `guigsm/intoca-plugin` e instale o `intoca`.

**No VS Code**, a extensão não põe o `claude` no PATH. Digite `/plugins`, aba **Marketplaces**, adicione `guigsm/intoca-plugin` e instale o `intoca`.

Depois abra uma conversa nova e digite `/intoca:comecar`. Ele monta o seu escritório, oferece a InToca Sala
(`intoca-sala@intoca`) e pergunta se você quer receber as versões novas sozinho. Sessões em WSL não carregam plugins: use o Claude Code fora do WSL.

## Roteiro para o Claude

Se uma pessoa colou o endereço deste repositório e pediu para instalar o InToca, siga estes passos, falando com ela em linguagem simples:

1. Confira, sem perguntar se ela tem os programas: `git --version` e `node --version` (o Node precisa ser o 20 ou mais novo).
2. Para o que faltar, diga em uma frase para que serve, pergunte "Posso instalar o X agora?" e, **só com o "sim"**, rode o comando do sistema da tabela
   acima. Comando com `sudo` pede a senha de administrador: mostre-o à pessoa, que o roda no próprio terminal. Depois de instalar o Git ou o Node, esta
   conversa não os enxerga: peça para fechar e abrir o Claude Code e colar o endereço de novo.
3. Se `claude --version` não for encontrado (acontece no app de desktop e no VS Code), use o caminho que está na variável de ambiente
   `CLAUDE_CODE_EXECPATH` no lugar de `claude`: no PowerShell, `& $env:CLAUDE_CODE_EXECPATH plugin list`; no Bash, `"$CLAUDE_CODE_EXECPATH" plugin list`.
4. `claude plugin marketplace add guigsm/intoca-plugin`
5. `claude plugin install intoca@intoca`
6. Diga à pessoa para abrir uma conversa nova e digitar `/intoca:comecar`: ele monta o escritório, instala a InToca Sala e pergunta sobre a atualização automática.

Nunca crie conta, nem digite senha, código ou chave pela pessoa: isso é só dela. Sessões em WSL não carregam plugins.

## Atualizar

O `/intoca:comecar` liga a atualização automática, se você disser sim. Para ligar depois: `/plugin`, aba Marketplaces, catálogo
`intoca`, **Enable auto-update**. Para atualizar na hora:

```
claude plugin marketplace update intoca
claude plugin update intoca@intoca
claude plugin update intoca-sala@intoca
```

A versão nova vale na próxima conversa, ou na conversa aberta depois de `/reload-plugins`.

## Licença

MIT. Veja [LICENSE](LICENSE).

## Problema ou sugestão

Abra um pedido em <https://github.com/guigsm/intoca-plugin/issues>.
