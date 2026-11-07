# Histórico de mudanças · InToca Sala (pacote `intoca-sala`)

Todas as mudanças notáveis deste pacote ficam aqui. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.4.5] - 2026-11-06

### Alterado
- O site de cada Toca (campo `site:`) passa a ser servido em origem própria, `http://<rótulo>.toca.localhost[:porta]/`, a partir da
  raiz, e o cabeçalho `Content-Security-Policy: sandbox` sai. Com isso os links absolutos do site funcionam e a pré-visualização no
  navegador interno do app carrega CSS e JS (o sandbox punha a página em origem opaca, e esse navegador recusa pedidos dela). A
  separação da API da sala passa a vir da origem: a API só responde em `Host` de localhost e recusa `Origin` e `Sec-Fetch-Site` de
  fora; na origem do site não existe API nem painel. O rótulo vem do nome do projeto (minúsculas, o que não é `a-z`, `0-9`, `.` ou
  `-` vira `-`, pontas aparadas); rótulo vazio ou repetido entre duas Tocas não é servido.
- O campo `estatico` de `/api/tocas` e `/api/sites` é agora a URL absoluta do site, com a porta do pedido.
- Os endereços antigos `/toca/<nome>/...` em `localhost` respondem 301 para a origem nova (porta e `?query` preservadas).

### Corrigido
- Pasta pedida sem a barra final (`/pasta`) responde 301 para `/pasta/`, como Apache e GitHub Pages, em vez de servir o `index.html`
  e quebrar os links relativos da página.

## [0.4.4] - 2026-11-05

### Alterado
- Textos e exemplos sem nomes de projetos reais; títulos de grupo pelo manifesto. Na página das Tocas, os grupos de sites saem como
  "Sites com <fábrica>" e "Sites sem <fábrica>", com o nome da fábrica lido do manifesto (ou "Sites com fábrica" e "Sites sem fábrica"
  quando não há uma só fábrica nomeada). Os identificadores dos grupos e a ordem gravada não mudam.

## [0.4.3] - 2026-11-05

### Corrigido
- O aviso "este chat não faz parte de nenhuma Toca" do app fica calado nos mesmos lugares que o do plugin `intoca`: na pasta que
  guarda várias Tocas, em pasta temporária do sistema, em worktree de repositório alheio e em pasta que é atalho (junção ou
  nome curto do Windows) para uma pasta registrada. O caminho real só é consultado quando o aviso ainda ia aparecer.
- Na Diretoria e na Secretaria, citar só a pasta de um projeto, sem pedir para mexer nele, não gera mais o aviso de chat trocado
  (alinhado ao plugin `intoca`).
- A página das Tocas informa a versão do pacote (lida do `plugin.json`) em `/api/saude`, em vez de um número fixo desatualizado.

## [0.4.2] - 2026-11-04

### Corrigido
- A sala animada sobe sem janela preta no Windows: o lançador usa o `pythonw.exe` da mesma pasta do `python.exe` do ambiente (o
  `python.exe` do venv criava uma janela de console para o interpretador, e fechá-la derrubava a sala). O `lancador.log` diz qual
  executável subiu. Fora do Windows nada muda.
- A prévia do arrastar dos grupos fica presa onde a mão pegou a alça, em vez de a 20 px do canto da seção.

## [0.4.1] - 2026-11-04

### Adicionado
- Licença MIT (arquivo `LICENSE`) e autor público no `plugin.json`.
- Ícone do pacote (`.claude-plugin/icon.png`), provisório: trocar é substituir o arquivo.
- Nome de exibição **InToca Sala** (o identificador técnico segue `intoca-sala`).
- Este histórico de mudanças.

## [0.4.0] - 2026-11-04

### Adicionado
- A "Sala de Operações" fica fixa no topo da tela das Tocas; os demais grupos se reordenam arrastando e soltando (ou pelas setas), e a
  ordem fica guardada.
- A sala animada aparece na tela mesmo sem estar instalada: com `git`, `uv` e Python, um botão a instala; sem eles, a tela mostra as
  instruções. Os hooks dela não são registrados por esse botão.
- Caixa "subir a sala animada junto com o sistema", obedecida pelo lançador.

## [0.3.0] - 2026-11-04

### Adicionado
- Lançador: ao abrir um chat, um hook confere se a InToca Sala está no ar e, se não estiver, a liga em segundo plano, sem atrasar o chat.
  Desliga com `INTOCA_SALA_SEM_LANCADOR=1` ou `"lancador": false` no arquivo `.intoca/sala.json` da pasta pessoal.
- Serviço de logon opcional (tarefa do Windows, launchd ou systemd), pela skill `servico`.

## [0.2.1] - 2026-11-04

### Adicionado
- Toda Toca ganha o botão "Abrir": o servidor de teste, se houver; senão a pasta estática do site; senão o endereço de produção; senão o
  VS Code na pasta do projeto. A pasta estática é servida com proteção contra caminhos fora dela.

## [0.2.0] - 2026-11-04

### Adicionado
- A InToca Sala Clássica passa a viver no pacote: um servidor local em Node, sem dependência, com a página das Tocas, as ordens de serviço,
  os recursos ocupados e as pendências do proprietário (`sala/README.md`). Alterna com a sala animada com um clique.

### Alterado
- A faixa e o painel dentro do app leem a Clássica, quando ela está no ar, e voltam a ler os arquivos da sede quando não está.
- O nome passa a ser InToca Sala.

## [0.1.0] - 2026-10-28

### Adicionado
- Primeira versão: painel dentro do app (`/sala`) com pendências, ordens de serviço, recursos ocupados e avisos; linha de status com a
  ordem do chat; faixa acima do prompt com as pendências abertas; comando `/pendencias`; avisos rápidos de "chat trocado" e de pasta sem
  Toca. Somente leitura; acesso antecipado.
