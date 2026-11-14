# Consultor e Vigia

Texto de apoio do `/intoca:comecar` e do `/intoca:consultor`. Uma tela, em linguagem de escritório.

## O que cada um faz

O **Consultor** é o colega que conhece o escritório inteiro. Quando percebe que você poderia usar algo que o plugin já
tem (o Git, o arquivo `.env`, a Secretaria, o memorando, o rigor das permissões, o gerente do projeto), ele deixa **uma
dica curta, no seu nível**: palavras do dia a dia para quem é iniciante, uma linha técnica para quem desenvolve. No
máximo uma dica por conversa, e cada dica uma vez só. Ele também explica os termos do plugin e, a pedido do
proprietário, avalia se vale a pena criar um recurso novo (`/intoca:consultor avaliar <pedido>`).

O **Vigia** é o segurança. Quando uma mensagem parece trazer uma senha, um token ou uma chave, ele avisa logo, a cada
vez, sem repetir o valor: "Nunca digite senha, token ou chave no chat. O valor vai no arquivo `.env`, que só você abre;
a IA só fala do nome." e "troque essa senha, porque ela já foi para a conversa". Ele **não bloqueia** a mensagem: avisa
depois. Há também o assistente `vigia`, que um chat chama para conferir a segurança de um projeto ou da sede, só lendo.

## O que guardam, e o que não guardam

O Consultor guarda só **quais dicas já deu e em que data**, num arquivo desta máquina: `.intoca/consultor.json`, na sua
pasta pessoal (fora da sede, que pode ir ao Git ou à nuvem). **Não guarda** o que você escreveu, nem um pedaço, nem o
valor que acendeu o aviso. O Vigia não guarda nada. Nenhum dos dois usa a internet nem outro programa: as regras são
simples e rodam no seu computador.

## Como ligar, silenciar e repetir

| Quero | Faço |
| --- | --- |
| Dicas nos chats | `/intoca:consultor ativar` (grava `consultor: ativo` no `sede.yaml`, com o seu "sim") |
| Dicas só quando eu chamar | `/intoca:consultor silenciar` (grava `consultor: sob_demanda`) |
| Ver as dicas de novo | `/intoca:consultor repetir` (apaga o arquivo das dicas dadas, com o seu "sim") |
| Mudar o nível das explicações | `/intoca:consultor nivel iniciante` (ou `ocasional`, `desenvolvedor`) |
| Um chat só para perguntas | Peça à Diretoria um chat **Consultor** |

Sem a linha `consultor:` no `sede.yaml`, vale `sob_demanda`: ninguém recebe dica sem ter escolhido. O Vigia fica ligado
nos dois modos. Os dois ficam calados nos chats de executor e de plantão e fora de uma sede. Num comando (`/intoca:...`) e
numa mensagem que cita uma ordem de serviço só o consultor cala: um segredo no argumento de um comando também foi para a
conversa, e o Vigia avisa.

Se dois chats derem dica no mesmo instante, os dois gravam o mesmo arquivo e a última gravação vale: uma dica pode voltar
uma vez. Se o app interromper o aviso por demora (máquina muito ocupada), a dica pode ficar marcada sem ter aparecido;
`/intoca:consultor repetir` a devolve.

## O que o aviso do Vigia não garante

O Vigia reconhece **padrões**, e só quando o valor tem número ou símbolo (como `!`, `@`, `#`, `$`, `%`, `&`):

- palavra de segredo seguida de `:`, `=` ou "é", com até três palavras no meio ("a senha do roteador é ...");
- linha de `.env` ou nome de variável (`DB_PASSWORD=`, `JWT_SECRET=`, `API_TOKEN=`), chave entre aspas de JSON ou de
  configuração (`"password": "..."`) e o negrito do Markdown (`**Senha:**`);
- endereço com senha (`postgres://usuario:senha@servidor`);
- prefixos conhecidos de chave (`sk-`, `sk_live_`, `ghp_`, `github_pat_`, `AKIA`, `xoxb-`, `AIza`), `Bearer` seguido de
  token, token JWT e o cabeçalho de chave privada.

Continua passando sem aviso: senha em prosa sem palavra de segredo antes ("o código da porta é 4471"), valor curto ou só
de letras ("minha senha é banana"), e duas chaves soltas numa frase sem `:` nem "é". Marcadores não acendem o aviso
(`<sua-senha>`, `${VAR}`, `xxxx`, `****`, `your_password_here`), e um texto que só parece segredo pode acendê-lo por engano. Ele não é cofre nem promessa: a defesa continua sendo **nunca
digitar o segredo no chat**. Pedido de vigilância contínua ("avise sempre que...") vira uma **Rotina** agendada, que se
pede à Diretoria.
