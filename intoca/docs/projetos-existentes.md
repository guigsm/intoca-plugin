# Projetos que você já tem: trazer para a sede ou deixar onde estão

Texto de apoio do `/intoca:comecar`, para ler com calma depois. Vale para cada pasta de projeto que você já tem
no computador. A skill decide pasta por pasta, **uma de cada vez**, e só mexe depois do seu "sim".

## As duas escolhas

**Trazer para dentro da sede** (a pasta passa a morar em `<sede>/<projeto>`).
- Vantagens: tudo num lugar só; um único backup ou cópia para outro computador; o plugin acha o projeto sem
  ponteiro nem configuração (os avisos de "chat trocado" e de "pasta sem Toca" ficam mais confiáveis); a fila, as
  ordens de serviço e o painel enxergam o projeto naturalmente; o caminho nas ordens é curto.
- **Custo: o caminho da pasta muda.** Atalhos, servidores de teste, tarefas agendadas, scripts com caminho fixo e
  abas do editor deixam de achar a pasta. O Git continua íntegro (a pasta anda inteira, com o `.git`), mas o que
  apontar para o caminho antigo precisa ser ajustado. **O histórico de conversas e a memória do Claude Code ficam
  ligados ao caminho da pasta**: depois de mover, o chat abre sem eles. Pasta sincronizada (OneDrive, Dropbox, Google Drive) pode
  criar cópias conflitantes. A sede fica maior.
- Faz sentido para projeto parado ou pequeno, ou quando você quer uma sede "de verdade", num lugar só.

**Deixar onde está** (a sede só aponta: `pasta_atual` no `sede.yaml`).
- Vantagens: **nada muda de lugar e nada quebra**; serve ao que está no ar ou em uso; cada projeto mantém o seu
  Git e a sua rotina; dá para começar hoje e trazer depois, um de cada vez.
- O que compromete: a sede e o projeto moram em lugares diferentes. O plugin só reconhece a pasta **porque o
  manifesto a lista** (e, fora da sede, pelo ponteiro `.intoca/sede` na sua pasta pessoal): se a pasta mudar de
  lugar ou o manifesto sair do lugar, o chat dela vira "pasta sem Toca" e a fila deixa de enxergá-la. O backup e a
  cópia para outro computador têm de cobrir a sede **e** cada pasta registrada, porque a sede não leva o código
  do projeto. O caminho completo de cada projeto fica escrito no manifesto, na sua máquina.
- Faz sentido quase sempre no começo; é a sugestão para o que está em uso hoje. Registrar não impede trazer
  depois: pedir "trazer" para uma pasta já registrada troca a linha do manifesto em vez de criar outra.

**Se você não registrar nem trazer:** a pasta fica "sem Toca". O plugin não a conhece, o chat nela não tem cargo
nem fila, e só aparece o aviso curto de "pasta sem Toca". Nada é perdido; é só estar fora do escritório.

## Como a skill conduz cada pasta

1. **Olha antes de perguntar**, só lendo: tem Git e alteração não guardada? já tem carta própria (`AGENTS.md`,
   `CLAUDE.md`)? tem `.env` (só o nome; o conteúdo nunca é aberto)? está numa pasta sincronizada? E pergunta só o
   que falta: nome, tipo, porte, sigla e "tem alguma coisa rodando agora aí (site no ar, servidor de teste, robô)?".
2. **Mostra o antes e o depois em palavras.** Deixando onde está: o que será criado dentro da pasta (`ops/` e a
   carta) e que o que você já tem não é tocado. Trazendo: de onde sai e para onde vai.
3. **Espera o seu "sim"**, executa e mostra como desfazer. No trazer, a simulação devolve um código curto
   (de pasta, destino e sigla), que a skill mostra junto do plano, e o script só move com esse código. É uma **trava
   contra esquecimento**: impede mover sem simular antes, ou com pasta, destino ou sigla diferentes dos mostrados.
   **Não prova que você leu o plano**; o que vale é o seu "sim". O script nunca apaga nada.

**Desfazer, com os detalhes.** "Para voltar atrás" é mover a pasta de volta para o lugar de antes. Depois de mover, o
script cria dentro da pasta `ops/`, `AGENTS.md` e, em site e app, `.claude/launch.json.exemplo`: esses arquivos voltam
junto e, no Git, aparecem como não rastreados. Se a pasta de cima na sede (`<sede>/<projeto>`) ficar vazia, ela fica; pode apagá-la (a linha de desfazer só fala
dela quando isso é verdade). O
caminho de antes fica anotado em `pastas_antigas` no `sede.yaml` (não tire essa linha). Se o projeto já tiver sido
registrado, volte também o valor de `pasta_atual`.

**Sobre o `.env`.** O plugin só vê o nome, e só no nível de cima da pasta (um `.env` em subpasta não aparece). No
trazer, o `.env` vai junto com a pasta, como o resto.

## O que o plugin se recusa a mover

Alteração não guardada no Git (guarde ou descarte antes); pasta numa pasta sincronizada (pause a sincronização, ou
deixe a pasta onde está); **sede** numa pasta sincronizada (trazer levaria o `.git` e o `.env` para o sincronizador,
em claro: só registrar); pasta em unidade de disco diferente da sede (copiar entre unidades é à mão e fica fora
do plugin); pasta em uso: no Windows o sistema costuma recusar mover uma pasta aberta e o plugin manda fechar o que a
usa, mas em macOS e Linux a mudança pode acontecer com coisa rodando dentro e o plugin não tem como saber (e lá uma
recusa por permissão negada vem com mensagem própria, de permissão, não de pasta em uso); caminho que passa por link ou junção; destino que
já existe; pasta com `.git` de worktree ou submódulo, ou repositório com worktrees ligadas; pasta pessoal do sistema (Documentos, Área de Trabalho) ou
raiz de disco; pasta que contém a sede ou que é de outro projeto. Se houver processo rodando na pasta,
**não mova**: registre. A recusa nunca é contornada; a alternativa é sempre registrar.
