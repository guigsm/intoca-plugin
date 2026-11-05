# Git e GitHub, em linguagem de empresa

Texto de apoio do `/intoca:comecar`. Explica; não instrui comando nenhum fora da seção fechada no fim.
**Nesta versão do plugin o envio ao GitHub ainda não está ligado:** ele chega junto com a conferência
automática de segredos que roda antes do primeiro envio. O Claude nunca cria conta nem digita senha ou código
por você.

## O que são

- **Git** é o livro de registro do escritório: guarda cada versão de cada arquivo e permite voltar atrás.
- **Repositório** é uma pasta que tem esse livro de registro dentro dela. Cada projeto é um repositório; a
  sede também é um (só das regras e da governança).
- **GitHub** é um arquivo central na internet, como um cofre de documentos do escritório. Serve de cópia de
  segurança e para trabalhar em dois computadores. Precisa de uma conta sua.
- **Commit** é "fechar uma página do livro": uma foto das mudanças, com uma frase dizendo o que mudou.

## O que vai e o que não vai

Vai: o regimento, o mapa, a fila, as ordens de serviço, os relatórios, as decisões e os modelos; e, em cada
projeto, o que é do próprio projeto. Não vai: senhas, chaves, arquivos `.env` e certificados; pastas de
dependências baixadas (`node_modules`); registros de erro e arquivos temporários. A sede já traz um
`.gitignore` que barra isso. Se um arquivo sensível entrar num envio, ele fica no histórico para sempre,
mesmo que seja apagado depois; por isso a conferência de segredos vem antes de qualquer envio.

## Privado por padrão

Todo repositório da sede é criado **privado**: só você e quem você convidar o enxerga. Tornar público é uma
decisão sua, por escrito, e é "produção" (algo que sai para o mundo).

## Limites de tamanho

O GitHub recusa arquivo com mais de 100 MB e se queixa de repositório com mais de 1 GB. Vídeos, bancos de
dados grandes e pastas de imagens pesadas não pertencem ao livro de registro: ficam em outro lugar (a nuvem de
arquivos do seu computador, por exemplo) e o projeto só anota onde estão.

## Dois computadores

Com o GitHub como cofre, o segundo computador baixa a sede e os projetos e trabalha na mesma situação do
primeiro. Os arquivos fora do Git (o que o `.gitignore` barra) não acompanham: são levados à mão ou por outro
meio. O ponteiro da sede (`.intoca/sede` na sua pasta pessoal) é de cada computador; no segundo, o
`/intoca:comecar` o cria.

## Se você perder a conta

A conta e a senha do GitHub são suas; o plugin não as guarda. Perdeu o acesso: use a recuperação do próprio
site, com o seu e-mail. Ative a verificação em duas etapas e guarde os códigos de recuperação fora do computador.
Enquanto isso, a sede continua funcionando por inteiro no seu computador: o GitHub é cópia, não o único lugar.

## Se você trocar o login do Claude

A sede é uma pasta de arquivos sua; ela não depende do login do Claude. Ao entrar com outra conta, instale o
plugin de novo e rode `/intoca:comecar`: ele acha a sede pelo ponteiro (ou pede a pasta) e mostra o estado, sem
criar nada em cima do que já existe. O histórico das conversas fica na conta antiga; o que importa, o estado do
trabalho, está nos arquivos.

## Retomar o cargo

O que se recupera de um chat que acabou não é a conversa, é o **cargo**. Um chat novo, com o título do cargo,
lê a carta, a fila e a última passagem e assume o cargo de onde o anterior parou. Para o gerente de um projeto,
isso é abrir um chat novo na pasta do projeto, com o título `Gerente · <projeto>`, e colar a primeira mensagem
que o `/intoca:comecar` deixou em `diretoria/os/`.

## Por perfil

**Nunca usei Git.** Você não precisa aprender nada agora. Pense no Git como o "histórico de versões" de um
documento do Word, mas para uma pasta inteira. O plugin vai conduzir cada passo, mostrando antes o que vai
fazer e pedindo o seu "sim". O que você precisa decidir é só isto: quer uma cópia na internet (GitHub) ou
prefere ficar só no computador? Os dois jeitos funcionam.

**Uso às vezes.** Você já fecha versões e envia para um repositório de vez em quando. O plugin segue as mesmas
regras: sede e projetos são repositórios separados; a sede só guarda governança; produto de cada projeto vive
no repositório do projeto; tudo privado por padrão.

**Desenvolvedor.** A sede é um meta-repositório de governança com `.gitignore` em lista de permissão (ignora
tudo e libera regimento, mapa, manifesto, `diretoria/` e `.claude/`); cada projeto é um repositório próprio,
ignorado pela sede. O manifesto (`sede.yaml`) é a camada local e pode ter caminhos da sua máquina, por isso
fica fora do que se compartilha com terceiros. Segredos fora do Git; nenhum `--no-verify`.

<!-- fechado-ate-varredura-de-segredos -->
## Passos do primeiro envio (ainda não ligados)

Esta seção está **fechada**: o texto existe para a versão que traz a conferência de segredos, mas o plugin não
o oferece nem o executa, e nenhum chat deve conduzir estes passos até lá. Quando abrir, a ordem será: instalar o
Git e o GitHub CLI; `git init` na pasta; rodar a varredura de segredos; `git add` e `git commit` do que passou;
`gh auth login` (feito pela própria pessoa, no navegador); `gh repo create` com a opção de repositório privado; e
`git push`. A conta, a senha e o código de verificação são sempre digitados pela pessoa.
<!-- /fechado-ate-varredura-de-segredos -->
