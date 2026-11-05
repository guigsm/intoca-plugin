# Política de segredos: o arquivo `.env`

Texto de apoio do `/intoca:comecar` e do memorando. Uma tela, em linguagem de quem não programa.

## O que é o `.env`

É a **ficha com as senhas de um projeto**: as chaves de acesso ao serviço de hospedagem, ao atendimento, ao banco.
Cada linha tem um nome e um valor. O nome (`CHAVE_DO_SERVICO`) pode aparecer em qualquer lugar; o **valor** é segredo.

## Onde ele mora e por que não vai para o Git

O `.env` real fica na **pasta principal do projeto**: `<projeto>/.env`, ou `.env.<finalidade>` quando o projeto tem
mais de um (`.env.crm`, `.env.hospedagem`). O Git o ignora (o `.gitignore` do projeto tem `**/.env*` e
`**/*.env`), então ele nunca sobe para o GitHub. O que sobe é o **modelo**.

Regra 6 do regimento: `.env`, chaves e tokens não entram no Git, em relatório, em chat nem em sincronizador em claro.
A IA entrega o modelo `.env.example` no repositório e não lê nem grava o valor; a pessoa copia e preenche. Backup só cifrado.

## Quem faz o quê

| Passo | Quem | Como |
| --- | --- | --- |
| Criar o modelo `.env.example` (nomes e comentários, **sem valor**) | A IA | Grava no repositório; o hook deixa passar o modelo, com qualquer prefixo (`.env.crm.example`). |
| Copiar o modelo para o arquivo real | **A pessoa** | Windows: `Copy-Item .env.example .env`. Mac e Linux: `cp .env.example .env`. |
| Preencher os valores | **A pessoa** | Abre o `.env` no editor dela e cola cada valor. Nunca no chat. |
| Usar os valores | O programa do projeto | Por exemplo `node --env-file=.env app.js`, sem imprimir o conteúdo. |

## O que a IA não faz

Não lê o `.env`, não escreve nele, não o copia, não o envia a lugar nenhum e não pede o valor no chat. Apagar só com a confirmação da pessoa no app. Se a
pessoa colar um segredo na conversa, ele já foi exposto: o chat pede que ela gere um novo no serviço de origem (trocar a
senha ou a chave) e ponha o novo no `.env` ela mesma.

## O que o plugin bloqueia (e o que não promete)

O hook do plugin **nega o que sabe reconhecer**: abrir (`Read`) ou escrever (`Write`, `Edit`) um arquivo `.env`,
`.env.<finalidade>` ou `<nome>.env`; e, no terminal, o comando que lê, copia ou grava um deles (`cat .env`,
`Copy-Item .env.example .env`, `echo X >> .env`, `type .env`). A mensagem do bloqueio diz o caminho certo: criar o
`.env.example`, e a pessoa copia e preenche. Os modelos (`.example`, `.sample`, `.template`) passam, e passa também o que
só cita o nome sem abrir o arquivo (`find . -name ".env*"`, `grep "process.env" src`, anotar `.env` no `.gitignore`,
`git rm --cached .env`).

**Apagar** o `.env` não é ler nem copiar o valor, mas o arquivo real é a única cópia. Por isso o plugin não nega: o app
**pergunta à pessoa** ("apagar o `.env` perde a única cópia do segredo; confirme só se ele está guardado no cofre ou em
outro lugar"). Se ela confirma, o comando roda.

Isto **não é cofre nem promessa de que nada vaza**. O que o plugin não enxerga:

- a ferramenta de busca do Claude (`Grep`) não passa pelo hook, então ela pode ler o conteúdo de um `.env`;
- comando com uma palavra que o plugin não conhece (a lista de comandos que leem arquivos é finita);
- programa que abre o arquivo por dentro: um script `python` ou `node` que lê o `.env` sozinho, sem o nome aparecer
  no comando; e `node --env-file=.env app.js` só carrega as variáveis, mas o próprio programa pode imprimi-las;
- o nome montado por uma variável do terminal ou por uma expansão (`.{env,x}`);
- o nome curto antigo do Windows (8.3) e um atalho ou link com nome inocente que aponta para o `.env`;
- busca em pastas inteiras sem citar o arquivo (`grep -r texto .`): ela lê o `.env` junto com o resto;
- comando muito grande: acima de 20 mil caracteres, de mais de três níveis de comando dentro de comando ou de uma palavra com mais
  de mil caracteres, o plugin não consegue conferir; quando o texto cita `env`, ele **nega** ("comando grande demais para
  conferir se mexe num arquivo .env: separe-o em partes menores"), e quando não cita, deixa passar;
- um nome de arquivo escrito com curinga que não cita `env` (`cat *nv` no Bash lê `hospedagem.env`; no PowerShell `*` e `*nv` são negados);
- apagar sem citar o nome: `git clean -fdx` apaga o `.env` e passa sem a pergunta (`find . -name ".env" -delete`, que cita o nome, pergunta);
- o contrário também acontece: um comando como `sed` ou `awk` que cita `.env` só como texto pode ser negado por engano; nesse caso a pessoa roda o comando.

As regras de permissão do app (`deny` dos modelos de permissão) cobrem parte do resto. O inventário dos segredos
(nomes e lugares, sem valores) e o backup cifrado são da sede e do gerente de cada projeto, não do plugin.

**O plugin nega o que reconhece; guardar o segredo fora de qualquer pasta que um comando alcance continua sendo a
melhor defesa.**
