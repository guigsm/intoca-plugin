# Histórico de mudanças · InToca Sede (pacote `intoca`)

Todas as mudanças notáveis deste pacote ficam aqui. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.2.9] - 2026-11-20

Leitura de documentos com o `markitdown`: um texto de apoio, uma linha nas skills dos cargos e um aviso do hook. **Não converte nada sozinho**: o hook só lembra o chat; quem converte é o chat, com o comando do doc. A superfície de execução do `restaurar` e a mascaragem do `/intoca:ambiente` não mudam.

### Adicionado
- **Texto de apoio** `docs/leitura-de-documentos.md`: o que o `markitdown` faz (conversores locais: PDF, DOCX, PPTX, XLSX, XLS, MSG, EPUB e HTML), quando usar e quando não, o comando (`-o` para um `.md` numa pasta temporária **fora do repositório**, depois `Read` com `offset` e `limit` ou `Grep` no `.md`), o que fazer sem a ferramenta
  (ler como antes, sem erro e sem aviso) e o **roteiro de instalar numa máquina nova**: ambiente isolado, versão fixada (`0.1.9`), só os conversores locais, origem conferida (PyPI `markitdown`, `github.com/microsoft/markitdown`) e como apontar a variável `INTOCA_MARKITDOWN`. Regras de uso: só arquivo local (nunca URL), não usar em PDF escaneado
  (sem OCR) nem quando o layout visual importa, e `.env` e `.out` de projeto continuam fora. As skills `gerente`, `executor`, `diretoria` e `secretaria` ganharam uma linha que aponta para ele; `plantao` e `consultor` ficaram como estavam (não leem documento no ofício).
- **Aviso do hook** (`pre-ferramenta`): `Read` de arquivo `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.xls`, `.msg` ou `.epub` (maiúscula e minúscula valem igual; `html` fica de fora do aviso) **com a ferramenta presente** devolve só um `additionalContext` de uma frase ou duas: converta antes, leia só o trecho, e leia como está se for PDF escaneado ou se o layout importa. A ferramenta é achada pela variável
  `INTOCA_MARKITDOWN` (caminho completo de um arquivo que existe e tem cara de executável: `.exe` ou `.cmd` no Windows, bit de execução nos outros) ou por um `markitdown` numa pasta **absoluta** do `PATH`; o hook só **olha o disco**.
- **Roteiro de máquina nova** em `docs/ambiente.md`: o `markitdown` entra como passo opcional e da pessoa.

### O que o código faz e não faz
- **Só avisa.** Não bloqueia, não pergunta (nada de `deny` nem `ask`), não altera o pedido, **não converte e não roda o `markitdown`**; a leitura segue como o chat pediu. Sai em **toda** leitura de documento (o hook não guarda estado entre chamadas), com frase curta.
- **Cala sem a ferramenta**: variável ausente, apontando para arquivo que não existe, para uma pasta ou para texto que não é um caminho (com espaço, `;`), e nenhum `markitdown` no `PATH`: nenhuma saída, a leitura é a de antes. Pasta vazia ou relativa do `PATH` não conta.
- **As regras de negar vêm antes**: `.env` (inclusive `.env.pdf`) segue negado, e sem aviso.
- **Cala na lista de segredo do hook, em `.out` e na heurística de nome**: o aviso manda copiar o convertido para uma pasta temporária, o que não se faz com o que é protegido. Não avisa quando o caminho (como veio e resolvido contra o cwd) cai na lista de segredo do próprio hook (a que tira o "allow" do `Read`: `.ssh`, `credentials`, `id_rsa`, `*.pem`, `.env`...), quando passa por **qualquer pasta `.out`**
  (da sede ou de projeto, qualquer caixa e barra) ou, **por heurística de nome, na dúvida** (não é regra de segredo), quando tem em qualquer pasta ou no nome a palavra inteira `segredo(s)`, `senha(s)`, `chave(s)`, `secret(s)`, `password(s)`, `passwd`, `apikey`, `api-key`, `api_key` ou `keys`, ou uma extensão de chave no meio do nome (`chave.pem.pdf`). A decisão da leitura não muda; só o aviso some.
  **Falso positivo aceito:** `palavra-chave.pdf` cala (palavra inteira entre hífens); `desenhada.pdf` e `chaveamento.pdf` avisam. **Ainda avisam:** nomes de segredo sem essas palavras (`vault.xlsx`, `acessos.pdf`).
- **Decide só pelo texto do caminho**: não resolve link, junção, nome curto 8.3 nem unidade mapeada, e não consulta o disco do arquivo lido (`realpath`, `stat` ou `exists`), porque olhar um caminho de rede ou uma unidade mapeada pode esperar a rede além dos 5 s do hook. **Limite dito:** link ou junção para dentro de `.out` e o nome curto 8.3 de um arquivo de segredo não são vistos, e o aviso sai. Caminho de rede (`\\servidor\...`, `//servidor/...`) recebe aviso ou silêncio pelo mesmo texto, sem tocar a rede. A ferramenta é conferida **antes** do caminho: sem o `markitdown`, o hook não faz nada com o arquivo lido.
- **Caminho de rede não conta como ferramenta**: valor da variável ou pasta do `PATH` que comece com `\\` ou `//` (UNC) é ignorado antes de olhar o disco, para a procura não esperar a rede.
- **O valor da variável não entra** no aviso nem em arquivo do pacote (o aviso diz só o nome `INTOCA_MARKITDOWN` e o comando genérico); o nome do arquivo lido também não entra.
- **Não cobre PDF escaneado** (o `markitdown` não faz OCR), não cobre `html` no aviso e **não instala** nada: o `/intoca:ambiente` (`registrar` e `restaurar`) **não conhece** o `markitdown`, não o instala, não o confere e não grava o caminho dele; é passo da pessoa.

## [1.2.8] - 2026-11-19

Sexto seguimento do `/intoca:ambiente`: fecha as cinco ressalvas que a revisão deixou sobre a 1.2.7. **A mais importante é um texto falso**: a 1.2.7 dizia que o caractere invisível sozinho, sem estado ligado, ficava como estava por não ser segredo,
e isso não é verdade. As outras quatro já existiam. A superfície de execução do `restaurar` (sem shell, tabela fixa, `--`, validação por padrão, hash do plano) não muda.

### Corrigido
- **Texto falso sobre os invisíveis** (`registrar`): os caracteres de tag (U+E0020 a U+E007F), os seletores de variação (U+180B a U+180D, U+180F, U+FE00 a U+FE0F, U+E0100 a U+E01EF), o uso privado (Co), os pontos sem designação (Cn), os substitutos soltos (Cs) e os outros
  caracteres de formato (Cf: largura zero, U+00AD, marcas de direção, junção) **carregam dados**. Um argumento feito só deles, ou **colado a uma palavra** (`abc` mais caracteres de tag), saía copiado, igual à 1.2.6: o erro estava na afirmação. Agora, por estrutura,
  **o argumento (solto ou valor de opção) que contém qualquer ponto de código de formato, de uso privado, sem designação, substituto solto, seletor de variação ou de controle (Cc: U+0000 a U+001F e U+007F a U+009F, salvo U+0009 a U+000D (a tabulação, a quebra de linha, U+000B, U+000C e o retorno de carro), que já contam
  como espaço em branco) vira `<definir>` por inteiro**, com ou sem estado ligado (na dúvida, esconde). **Ficam**: letra, número, pontuação, símbolo e as marcas de combinação comuns (o acento em texto decomposto, U+0300 a U+036F). **Falso positivo aceito e dito**: o emoji com
  junção (U+200D), o emoji com seletor de variação (U+FE0F), o texto de direita para a esquerda com marca de direção (U+200E, U+200F) e a junção sem largura (U+200C) das escritas persa e indianas também somem por inteiro. **Limite dito**: marcas de combinação que não são seletor de
  variação (acentos de outras escritas, U+20D0 a U+20FF) não são ocultas. **Dito também**: o conjunto Cn depende da versão do Unicode do Node (no 24.21, o Unicode 17.0); caminho, URL e JSON com um desses caracteres também somem por inteiro; o que ainda sai copiado, colado a uma palavra, são as marcas Mn, Mc e Me que não são seletor de variação (U+034F, U+17B4, U+17B5 e as de outras escritas) e U+2800, U+3164, U+115F, U+1160 e U+FFA0; e, **fora dos `args`**, o nome do servidor e as chaves de `env` e de cabeçalho são copiados sem filtro e a `url` do tipo http só passa pela limpeza de URL (já era assim: declarado, não mudado). O texto da 1.2.7 (código, doc, skill e esta entrada) foi escrito de novo para dizer o que o código faz.
- **Opção com caractere oculto**: `-p`, `-password`, `-e`, `-H`, `--header`, `--api-key` ou `--token` com um caractere oculto colado ao nome, no meio ou no fim (`-p` mais U+200B, `-p` mais U+200B mais `x`) saem `<definir>`, e o argumento seguinte também, **por inteiro**, qualquer que seja (URL com caminho curto, `@escopo/nome`, `~/x`, `nome=valor`, `S=1`): a opção real é desconhecida e o estado é o de uma opção sensível, e não o do argumento solto, que copiaria o que parece claro (`https://h.io/S`). Com dois traços (`--api-key`, `--token`, `--header`) a 1.2.7 já mostrava esses valores.
- **Dígitos livres na posição da versão**: `pkg@1234567890.1234567890.1234567890`, `pkg@1.2.3-<4 segmentos de 10 dígitos>` e `pkg@1.2.3-rc1234567890` saíam em claro (a 1.2.6 escondia). O rótulo de versão passou a ter **teto**: até **6 dígitos por parte do núcleo**, até **8 dígitos**
  num segmento só de dígitos do sufixo (uma data como `20240101`) e até **4 dígitos** colados a `rc`, `beta` e as outras palavras; qualquer número maior some. **Dito**: um segredo **só de dígitos** que caiba nesses tetos e esteja na posição da versão sai copiado (é o mesmo limite de
  `ZQXWV9@1.2`). **Lista completa do que a 1.2.7 mostrava e agora some** (falso positivo aceito, conferida pelo diferencial contra a 1.2.7 sobre 24 mil rótulos de núcleo e sufixo): (a) parte do núcleo com **7 a 10 dígitos** (`pkg@1234567`, a data `pkg@20240101`, `pkg@1.20240101`; com 11 ou mais a 1.2.7 já escondia); (b) segmento só de dígitos do sufixo com **9 ou 10 dígitos** (`pkg@1.2.3-123456789`, `pkg@1.2.3+1234567890`; com 11 ou mais, como `pkg@1.2.3+20130313144700`, já sumia); (c) tag colada a **5 a 10 dígitos** depois de um núcleo (`pkg@1.2.3-rc12345`, `pkg@1.2.3-beta12345`; sem núcleo, `pkg@rc12345`, já sumia); (d) segmento de **9 ou 10 dígitos** depois de uma tag e de ponto (`pkg@1.2.3-rc.123456789`); (e) sufixo de **três segmentos ou mais só de dígitos** (`pkg@1.2.3-1.2.3`, `pkg@1.2.3-2024.1.1`, `pkg@1.2.3+192.168.0.1`, `pkg@1.2.3-10.0.0.1`, `pkg@1.2.3-1.2.3.4`). Fora essas e as com caractere oculto, nada que a 1.2.7 mostrava passa a sumir, e nada que ela escondia passa a aparecer.
- **IPv4 com sufixo**: o texto dizia "quatro números com ponto, com ou sem sufixo", mas `pkg@1.2.3-10.0.0.1` passava. Um sufixo de **três segmentos ou mais, todos só de dígitos** (`1.2.3-10.0.0.1`, `1.2.3+10.0.0.1`, `1.2.3-1.2.3.4`) tem cara de endereço e não é rótulo de versão: o argumento some.
  `pkg@1.2.3-rc.1`, `pkg@1.2.3-beta.2` e `pkg@1.2.3+20240101` continuam visíveis.
- **Formas que somem e o texto não dizia**, agora ditas como falso positivo aceito, sem mudar o código: `@escopo/pacote@1.2.3-canary.5a8d6c5` (um segmento com hexadecimal de commit não é só de dígitos nem palavra conhecida com número), `@escopo/pacote@experimental` e `pkg@1.2.3+build.5`
  (`build` não é palavra de pré-lançamento conhecida); e `NOME=` seguido **só de caracteres invisíveis** (o valor aparado fica vazio) some por inteiro, como `NOME=` vazio.

### Mudado
- **Teste de tempo que diz o caso** (`tests/tempo-argumentos.mjs`): cada caso mede o próprio tempo dentro do processo (`performance.now`), com limite de 1,5 s por caso; ao estourar, o relatório diz o caso (base, forma de `@`, cauda, tamanho e tempo) em vez de esperar o tempo limite do processo. Os casos
  sobem em escada de tamanhos (de 8 a 200 mil caracteres) e param no primeiro passo que estoura o limite, ou na tendência de estourar. Para não dar falso alarme em máquina ocupada, a medida acima de um quarto do limite é repetida (até 3 vezes) e fica a menor, a tendência só compara passos próximos (o tamanho cresce até 1,3 vez) e a mensagem do caso cabe numa linha; os casos com caractere oculto de 200 mil caracteres estão na escada, e não só no fuzz. Há agora casos com o rótulo de versão **de comprimento até o teto de 135 caracteres** (`pkg@rc` e dígitos, `pkg@1.2.3-` e segmentos repetidos, `@a/b@` e núcleo), que é
  onde as expressões regulares de versão de fato rodam (o fuzz de 40 mil caracteres saía pelo teto sem chegar nelas). Um teste põe a expressão antiga `(?:[.-]?[0-9]+)*` do rótulo de tag numa cópia fora do pacote e confere que o teste reprova, dizendo o caso, em poucos segundos.
- **Testes por propriedade e diferencial** (`tests/propriedade-argumentos.mjs`, `tests/diferencial-argumentos.mjs`): as duas camadas afirmam que o caractere de tag, o seletor de variação, o uso privado, o sem designação e o de formato, sozinhos ou colados a uma palavra, somem; as fichas do diferencial ganharam as formas novas (caracteres de tag
  colados, dígitos grandes na versão, `pkg@1.2.3-10.0.0.1`). O diferencial contra a 1.2.7 (`--contra=1.2.7`) não admite nada que passe a aparecer, e só as exceções ditas acima (emoji com junção, emoji com seletor de variação, marca de direção e os números da lista (a) a (e)) podem passar a sumir sem ser segredo. Um diferencial da opção com caractere oculto (950 mil sequências de opção de um traço, dois traços, `-e`, `-H` e `--header` com o caractere colado, no meio ou no fim, mais valor com cara de recurso) afirma que o que a 1.2.7 escondia a nova também esconde e que o valor logo depois da opção oculta nunca fica em claro; a propriedade ganhou a mesma camada, com oráculo independente.

## [1.2.7] - 2026-11-17

Quinto seguimento do `/intoca:ambiente`: fecha as ressalvas que a revisão deixou sobre a 1.2.6. **Uma é efeito colateral da 1.2.6** (regressão de comportamento, sem vazamento: o pacote com versão passou a sumir); as outras já existiam.
A superfície de execução do `restaurar` (sem shell, tabela fixa, `--`, validação por padrão, hash do plano) não muda.

### Corrigido
- **Pacote sem escopo com versão sumia** (`registrar`): `["-y","mcp-remote@latest","https://h.io/mcp"]` saía `["-y","<definir>","https://h.io/mcp"]`; o mesmo com `firecrawl-mcp@1.2.3`, `mcp-server-git@2.0` e `img@sha256:…`, que é a forma mais
  comum de servidor MCP, e a 1.2.5 copiava. A regra do `@` solto da 1.2.6 escondia tudo o que tinha texto antes do `@`. Agora o argumento solto é **pacote com versão** quando o texto antes do `@` tem forma de nome de pacote
  (letra ou dígito e depois letra, dígito, `_`, `.` ou `-`; sem `/` nem `:`) **e** o texto depois é um **rótulo de versão**, definido **por estrutura, sem texto livre**: uma tag conhecida (`latest`, `next`, `beta`, `alpha`, `canary`, `stable`, `rc`,
  com número de até 4 dígitos), um número de 1 a 3 partes com `^`, `~` e `v` opcionais (`1`, `1.2.3`, `^1.2.3`, `v1.2`), com ou sem sufixo depois de `-` ou `+` de até 4 segmentos separados por ponto, cada um só de dígitos ou uma palavra de pré-lançamento
  conhecida (`alpha`, `beta`, `rc`, `pre`, `dev`, `canary`, `next`, `nightly`, `snapshot`) com número opcional (`1.2.3-beta.1`, `1.2.3+20240101`), ou um digest de comprimento exato (`sha1:` 40, `sha256:` 64, `sha384:` 96, `sha512:` 128 hexadecimais).
  Quatro números com ponto (`10.0.0.1`, `1.2.3.4`, com ou sem sufixo) têm cara de endereço e não são versão. Sem rótulo de versão o argumento some, como antes: `token@github.com/org/repo`, `ZQXWV9@h.io`, `usuario@host`, `deploy@srv:/app`,
  `user@host:22` e e-mail (domínio com ponto) continuam sumindo, e também `pkg@1.2.3-ZQXWV9`, `pkg@1.2.3+ZQXWV9` e `pkg@v1-ghp_…` (o sufixo livre depois de `-` ou `+` não é rótulo de versão). **O destino `usuario@host` do `ssh` e do `scp` some**:
  tem cara de usuário e host, não de pacote com versão. `@escopo/nome@versão` segue como estava, mas agora só com rótulo de versão: `@escopo/nome@ZQXWV9` some (antes saía), e também `@escopo/pacote@dev`, `@escopo/pacote@nightly`,
  `@escopo/pacote@lts` e `@escopo/pacote@1.x` (a 1.2.6 deixava passar; falso positivo aceito). `git@host:caminho` segue como estava. **Limites ditos**: `ZQXWV9@1.2` (segredo no lugar do nome do pacote e versão no lugar certo) e `pacote@sha256:`
  com 64 hexadecimais que é segredo de fato têm a forma de um pacote com versão e saem; `registro/img@sha256:…` e `img:tag@sha256:…` (com `/` ou `:` antes do `@`) somem (falso positivo aceito, na dúvida esconde).
- **Base64 com `==` seguido de espaço ou de quebra de linha vazava** (`registrar`): `["QWxh…ZQ==\n"]` e `["--foo","QWxh…ZQ== "]` saíam `QWxh…ZQ=<definir>`, porque a regra olhava o valor sem aparar. O que vem depois do primeiro `=`
  é **aparado** (espaço, tabulação, quebra de linha, espaço de largura total, largura zero, controle) antes de olhar: o argumento some por inteiro, solto, depois de `--foo`, em `-k…` e em `-e …`. O texto da 1.2.6, que dizia
  "em qualquer forma", não valia para isso; foi escrito de novo para o que o código faz.
- **Valor invisível**: `["--api-key","\u200b","ZQXWV9"]` e `["--api-key","\u0000","ZQXWV9"]` deixavam o argumento seguinte em claro (esses caracteres não casam `\s`). Com o estado ligado, a string só de caracteres invisíveis é o
  **valor** (`<definir>`) e o estado continua ligado, como a string vazia. O critério é **estrutural**, não uma lista: a string **sem nenhum caractere de letra, número, pontuação ou símbolo** (espaço e separadores, controle U+0000 a U+001F e U+007F, formato e largura zero U+00AD, U+180E, U+200B a U+200F, U+2060 e U+FEFF, marcas de combinação, seletores de variação, uso privado, pontos sem designação, não-caracteres como U+FFFF), mais cinco que desenham nada mas são letra ou símbolo: U+2800, U+3164, U+115F, U+1160 e U+FFA0. Conferido por um laço pelo Unicode inteiro.
- **`@` parecidos**: `S﹫host` (U+FE6B) e `@escopo/nome@S` saíam copiados. Os `@` parecidos (`＠` U+FF20 e `﹫` U+FE6B, os dois únicos que a normalização NFKC leva a `@`, conferido por um laço pelo Unicode) são trocados por `@` **só para
  decidir** as regras do `@`; o que sai continua sendo o texto original ou `<definir>`. Um argumento solto com `@` parecido some por inteiro.
- **Texto**: a 1.2.6 dizia que a string só de espaço, "sem estado ligado, fica como está". Não é verdade: ela vira `<definir>` (é palavra solta com espaço); só a string vazia (`""`) fica como está. A invisível que não é espaço em branco (largura zero, controle, formato)
  não era escondida sem estado ligado. Corrigido no código, na doc e na skill. **Essa última parte estava errada** (a invisível sozinha também carrega dados): foi escrita de novo na 1.2.8.

### Dito (limite conhecido)
- **`S=1`, `-kS=1` e `--foo=S=1` mostram `S` como nome** (`S=<definir>`). Decisão: fica como **limite conhecido**. Por estrutura (nome curto, só letra, dígito, `_`, `.` e `-`, e algo depois do `=`) um segredo no lugar do nome tem a
  mesma cara de uma variável como `NODE_ENV`, e o mapa precisa dos nomes para refazer o ambiente; o código não usa lista de nomes. O teste por propriedade afirma exatamente isso.

### Mudado
- **Teste diferencial entre versões, com as formas comuns de servidor MCP** (`tests/diferencial-argumentos.mjs`, mais a cópia congelada da 1.2.6 em `tests/referencia/`): compara a 1.2.6 e o código novo, posição por posição, com
  `npx -y pacote`, `-y pacote@latest`, `-y @escopo/pacote@1.2.3`, `uvx servidor@2.0`, `uvx --from git+https://… cmd`, `docker run -i --rm img:tag`, `docker run … img@sha256:…`, `node servidor.mjs` (caminho de máquina), `python -m modulo`, `--stdio`,
  `--port 3000`, `--transport sse`, URL `https://h.io/mcp`, `-e NOME=valor` e os destinos `usuario@host`. Regra: nada que a 1.2.6 deixava visível e que não é segredo pode passar a sumir (as únicas exceções são `@escopo/pacote@<texto sem rótulo
  de versão>`: `@escopo/pacote@dev`, `@escopo/pacote@nightly`, `@escopo/pacote@lts` e `@escopo/pacote@1.x`), nada que ela escondia pode passar a aparecer (a única exceção é o pacote sem escopo com versão, a correção desta versão). O diferencial da 1.2.6 não tinha `pacote@versão` entre as fichas: foi o que deixou passar a regressão. As fichas de segredo ganharam o segredo na posição da versão (`pkg@1.2.3-S`, `pkg@1.2.3+S`, `pkg@v1-ghp_…`, `pkg@sha256:<32 hexadecimais>`): nenhum pode passar a aparecer (só os dois limites ditos acima, contados à parte). A cópia da 1.2.6 em `tests/referencia/` só exporta `argumentosDoMcp` (sem linha de comando, sem escrita de arquivo) e diz no cabeçalho que é referência de teste, com vazamentos conhecidos.
- **Teste por propriedade** (`tests/propriedade-argumentos.mjs`): todas as camadas têm as formas comuns (`mcp-remote@latest`, `@escopo/pacote@1.2.3`, `img@sha256:…`) e o valor invisível; o gerador ganhou base64 com `==` seguido de
  espaço ou de quebra de linha, `@` parecidos, `@escopo/nome@S` e as formas `S=1` (limite conhecido), o segredo na posição da versão e cada invisível das categorias Unicode Z, Cc e Cf. Falha contra o código da 1.2.6 em cada caso acima.
- **Teste de tempo** (`tests/tempo-argumentos.mjs`): `argumentosDoMcp` com `pkg@rc`, `@a/b@rc` e `pkg@1.2.3-rc` seguidos de 40 dígitos, de 200 mil caracteres e de `!`, com `@` normal e parecido, mais um fuzz de entradas longas e repetitivas por todos os começos que o código reconhece:
  cada chamada abaixo de 1,5 s, num processo à parte que o tempo limite mata. Nenhuma expressão regular do `/intoca:ambiente` tem repetição aninhada ambígua.

## [1.2.6] - 2026-11-16

Quarto seguimento do `/intoca:ambiente`: fecha as sete ressalvas que a revisão deixou sobre o mascaramento de argumentos de servidor MCP. Todas já existiam na 1.2.5; nenhuma é regressão. A superfície de execução do
`restaurar` (sem shell, tabela fixa, `--`, validação por padrão, hash do plano) não muda.

### Corrigido
- **Valor com `=` no meio ou no fim (base64 com preenchimento)** (`registrar`): `["--foo","QWxhZGRpbjpvcGVuIHNlc2FtZQ=="]` saía `QWxhZGRpbjpvcGVuIHNlc2FtZQ=<definir>`, e `["-kQWxhZGRpbjpvcGVuIHNlc2FtZQ==","pkg"]` saía `-kQWxh…ZQ=<definir>`, porque a regra
  da atribuição (`nome=valor`) tomava o segredo inteiro por "nome" e o mostrava. Agora o nome de uma atribuição só aparece quando tem cara de nome, por estrutura: até **32 caracteres**, só letra, dígito, `_`, `.` e `-`, **e** com algo
  que não é só `=` depois do primeiro `=`. Um valor que termina em `=` ou `==` depois de letras e dígitos é base64 com preenchimento e some **por inteiro**, nome e valor: solto, valor de opção (`--foo=`, `--api-key`), colado a
  uma opção de um traço (`-kQWx==`, `-pQWx==`) e depois de `-e` (`-e QWx==`). **Falso positivo aceito e dito no texto**: um nome com mais de 32 caracteres e `NOME=` com o valor vazio também somem por inteiro; `-vp=` sai `-v<definir>`.
  O texto também estava errado: dizia que, no caso ambíguo de um traço (`-vp x`, `-pX`, `-Xmx2g`), "o nome se perde", o que não valia quando havia `=`. O que o código faz está agora descrito: sai `-x<definir>` (só as duas primeiras letras
  ficam e o valor colado some); só o `-xnome=valor` com algo depois do `=` (`-Dfoo=bar`) mostra o nome, e com palavra sensível no nome ele também some.
- **Valor só com espaço em branco**: `["--api-key"," ","S"]` copiava o `S` (a 1.2.5 cobria só a string vazia). Com o estado ligado, a string só de espaço, tabulação, quebra de linha ou espaço de largura total também é o valor (`<definir>`) e o estado continua ligado;
  sem estado ligado, a string só de espaço também vira `<definir>` (é palavra solta com espaço; só a vazia fica como está: ver 1.2.7).
- **`token＠github.com/org/repo` solto** (sem `:`) era copiado. O argumento solto com `＠` de largura total, ou com `@` e texto antes dele (`token@host/caminho`, `S@host`, e-mail), some por inteiro, salvo `git@host:caminho` (SSH do Git) e o pacote com escopo
  (`@escopo/nome`). `@nome` sem escopo e sem texto antes segue como palavra solta.
- **`//SEGREDO` saía em minúsculas**: a limpeza da URL sem esquema alterava o texto em silêncio (`//SEGREDO` virava `//segredo`). Agora um argumento solto que começa com `//` sem `@` e **sem ponto no host** (`//SEGREDO`, `//s3cr3t`) some por inteiro (não dá para saber se é host ou segredo);
  com ponto no host (`//h.io/caminho`) e quando a limpeza não remove nada, ele volta **como veio** (`//Host.IO/x` não vira `//host.io/x`). Depois de uma opção que espera valor só passa a URL limpa e idêntica, senão vira `<definir>`. O limite segue dito: um segredo com ponto que começa com `//` não é reconhecido.
- **Expressão quadrática** na regra de `usuario:S@host` sem esquema: trocada por um teste linear (uma entrada de 200 mil caracteres leva milissegundos).

### Mudado
- **Teste por propriedade mais duro** (`tests/propriedade-argumentos.mjs`): os sentinelas não têm mais palavra sensível (antes `-kSEGREDO=1` sumia pelo nome, não pela lógica do valor): `ZQXWV9`, `Zq7Wv9=` e um base64 com `==`; a expectativa "esta opção espera valor" vem de
  uma regra escrita à mão, sem a fórmula do código; o gerador ganhou maiúsculas, dígitos, base64 com `=` e `==`, `S＠host`, `token＠host/caminho`, `//S` solto, espaço e tabulação. Falha contra o código da 1.2.5 em cada caso acima.
- **Redação**: a numeração dos seguimentos do `/intoca:ambiente` está acertada (1.2.1: primeiro, com a continuação na 1.2.2; 1.2.4: segundo; 1.2.5: terceiro; esta: quarto).

## [1.2.5] - 2026-11-16

Terceiro seguimento do `/intoca:ambiente`: fecha as seis ressalvas que a revisão deixou sobre o mascaramento de argumentos de servidor MCP. Todas já existiam na 1.2.4; nenhuma é regressão. A superfície de execução do
`restaurar` (sem shell, tabela fixa, `--`, validação por padrão, hash do plano) não muda.

### Corrigido
- **Opção de um traço com nome longo** (`registrar`): `["-accesskey","S"]`, `["-apitoken","S"]` e `["-vp","S"]` saíam `-a<definir>` e deixavam o `S` do argumento seguinte em claro (o código lia só as duas primeiras letras como opção). Agora o argumento de **um traço só
  com mais de uma letra** tem três casos: um agrupamento só de bandeiras conhecidas sem valor (`-vv`, `-vvv`, `-yv`) é bandeira e não liga nada; o nome inteiro em minúsculas feito só de palavras sensíveis conhecidas, sem letra sobrando (`-accesskey S`, `-apitoken S`, `-passphrase S`, `-accesskey=S`), é nome de opção longa: o nome fica
  visível e o valor colado e o argumento seguinte viram `<definir>`; qualquer outro (`-vp S`, `-Xmx2g`, `-pS`, `-accessKey S`, `-pmysecret=x`, `-ksecretabc=1`) é ambíguo (valor colado a uma opção curta ou nome longo): sai `-v<definir>` (só as duas primeiras letras ficam e o valor colado some; com `=` no fim, como em `-kQWx==`, o valor some inteiro; só o `-xnome=valor` mostra o nome, e com palavra sensível no nome ele também some: ver 1.2.6) e o argumento seguinte também é escondido;
  terminar em `=` ou `:` (`-vp=`, `-accessKey:`) deixa o valor para o argumento seguinte, que também é escondido.
  Falso positivo aceito e dito no texto: `-Xmx2g` esconde também o argumento depois dele. Na dúvida, esconde.
- **URL sem esquema**: `//usuario:S＠host/db` (com `＠` de largura total ou `@`) era copiada como palavra solta. O argumento solto que começa com `//` recebe a mesma limpeza das URLs com esquema e some por inteiro se tem `@` ou `＠`; `usuario:S@host` sem esquema (um `@` ou `＠` depois
  de `:`) também some por inteiro. `//host/caminho` limpo continua como está.
- **Valor vazio**: `["--api-key","","S"]` copiava o `S`. Com o estado ligado, a string vazia é o valor (`<definir>`) e o estado continua ligado para o argumento seguinte, como o `--` e o não-texto; sem estado ligado ela fica como está.

### Limite conhecido (texto corrigido, o código não mudou)
- O limite dito na 1.2.4 como `--api-key --token-ABC123` vale para **qualquer opção que espera valor**, não só para essa dupla: o argumento logo depois dela, quando é opção sensível, de ambiente ou de cabeçalho, ou a forma `--x=valor`, é lido como nova opção e o **nome** dele fica
  visível (`--foo --token-ABC123` também). Só o valor colado depois do `=` some; um segredo posto no próprio nome sai. Também não são garantidos, e a doc e a skill dizem: o argumento solto que começa com `//` **sem `@`** (`//SEGREDO`, `//s3cr3t`) depois de uma opção desconhecida é lido como host de URL sem esquema e pode sair copiado; traço parecido (`−token`, `–token`) ou espaço no começo não é opção e cai em "palavra solta", sem esconder o argumento seguinte. A doc, a skill e este histórico dizem isso; a conferência do diff antes do commit é a rede.

### Adicionado
- **Teste por propriedade com oráculo independente** (`tests/propriedade-argumentos.mjs`): a "camada 2" repete a máquina de estados do código; a nova camada 3 não anda a cadeia e confere uma regra mínima escrita à mão: nenhum sentinela de segredo sai quando veio dentro de um
  argumento com `//u:p＠h`, `u:p@h`, de um objeto ou de uma lista, nem depois de uma opção que espera valor (de nome sensível ou de nome desconhecido, de uma letra, duas ou nome longo de um traço), com a string vazia, o `--` ou não-texto no meio. O gerador ganhou o traço único longo
  (`-accesskey`, `-apitoken`, `-vp`), o agrupamento curto (`-vv`, `-yv`), `//u:p＠h`, objeto e lista com segredo e o valor vazio. Falha contra o código da 1.2.4 em cada caso acima.

### Mudado (texto)
- `boas-vindas.md` passa a dizer que o "pode" do proprietário vale para o que sai para o mundo **e para ato sem volta**, como diz a regra 4.

## [1.2.4] - 2026-11-16

Segundo seguimento do `/intoca:ambiente`: fecha dois vazamentos reproduzidos pela Diretoria no mascaramento de argumentos de servidor MCP (condição para qualquer 1.2.x ir ao catálogo público), amplia a lista de nomes
sensíveis e o teste por propriedade, e ajusta o texto de skills, memorando e boas-vindas à regra 4.

### Corrigido
- **`--` depois de opção que espera valor** (`registrar`): `["--api-key","--","SEGREDO"]` copiava `SEGREDO` em claro (o `--` zerava o estado, desde a 1.2.1). Agora, com o estado ligado, o `--` é o **valor** e vira `<definir>`, e o estado
  continua ligado para o argumento seguinte. Sem estado ligado o `--` passa como antes.
- **Argumento não-texto depois de opção que espera valor**: `["--token",5,"SEGREDO"]` copiava `SEGREDO` (o não-texto zerava o estado). Agora o número, o nulo ou o objeto é o valor (`<definir>`) e o estado continua ligado; sem estado
  ligado vira `<definir>` e não liga nada. Depois do valor de uma opção segura conhecida (`--port`), o segundo argumento também já não é copiado.
- **Nomes sensíveis que faltavam.** Por **palavra inteira** (separada por hífen, ponto, sublinhado, dígito ou maiúscula): `pat`, `dsn`, `sas`, `jwt`, `connection-string`, `webhook`, `signature`, `sig`, `bearer`, `api-key`, `private`, `credential`, `cert`,
  `session`, `cookie`, `otp`, `pin`, `salt`. Antes, `--webhook https://.../abcdEF0123` (URL limpa) era copiada; agora o valor some. `--patch`, `--passo`, `--design` e `--spin` não casam e a URL limpa deles continua copiada.
- **Destino por junção.** Um caminho escrito dentro da sede tem de continuar dentro da sede depois de resolver os links (junção da sede para a pasta temporária também é recusada); um escrito na pasta temporária fica na temporária.
  Antes, a regra dependia de onde o pacote morava, e dois testes falhavam quando ele estava na pasta temporária. Um caminho escrito FORA da sede e da pasta temporária (forma curta 8.3 do Windows, `subst`, sede por link)
  só passa agora se não tiver nenhum link ou junção; antes, uma junção para a pasta temporária entrava.
- **`--nome:valor`** (dois-pontos, sem `=` e sem espaço): a opção longa cujo nome tem qualquer caractere fora de letra (inclusive não ASCII), dígito, `_`, `.` e `-` é valor colado ao nome (`--token:x`, `--password:x`, `--user:x@host`,
  `--https://u:p@h/db`) e saía em claro. Agora o argumento INTEIRO vira `<definir>` (nome e valor) e o seguinte também fica escondido. `--nome=ok` e `--url=https://h/p` seguem como antes.
- **Nomes colados em minúsculas**: `webhook`, `signature`, `connection-string` e `sessionid` passam a casar dentro do nome (`--webhookurl`, `--mywebhook`, `--slackwebhook`), e há uma lista de formas coladas comuns de `pat`, `dsn`, `sas` e `jwt`
  (`--mypat`, `--githubpat`, `--dsnurl`). `--patch`, `--passo`, `--design` e `--compat` não casam.

### Limite conhecido (documentado, não corrigido)
- **`--api-key --token-ABC123` (a forma `["--api-key","--token-ABC123"]`) fica visível**: a segunda é uma opção sensível, lida como nova opção (o desenho mantém o nome das opções sensíveis). Só a conferência do diff pega isto (vale para qualquer opção que espera valor, não só para esta dupla: ver 1.2.5). A doc, a skill e o teste por propriedade dizem o limite
  com todas as letras. O que a lista de palavras não cobre (um nome sensível fora dela, com URL limpa como valor) também está dito no texto: **nome colado em minúsculas fora da lista (`--zzpat`) não é pego**; o valor dele some se não for uma URL limpa.

### Adicionado
- **Teste por propriedade ampliado** (`tests/propriedade-argumentos.mjs`): todas as sequências de 1 a 4 argumentos de 29 tokens (`--`, não-texto `5`/`null`/`{}`, formas coladas `-eX=v`/`-HX:v`/`--x=v`, `--foo`, `--webhook`, `--pat`, URL limpa e o limite acima),
  todas as de 1 a 4 de um alfabeto de 20 nomes (`--apiKey`, `--PAT`, `--webhookurl`, `--mypat`, `--patch`, `--x:y`, texto vazio, texto com espaço, URL com usuário e senha) e todas as de 5 de 14 tokens críticos: 1,44 milhão de sequências.
  Além do oráculo da cadeia, há regras que não repetem o código: o argumento que carrega o segredo dentro nunca o deixa sair e o segredo logo depois de nome sensível ou estranho nunca sai. Falha contra o código da 1.2.3.

### Mudado (texto)
- **Skills e modelo.** `executor` diz que, em produção, além da palavra, ainda se exige o arquivo de autorização; `gerente` fala em "produção e ato sem volta"; o memorando do modelo de sede traz a confirmação antes de gravar; `boas-vindas.md` revisada
  contra a regra 4. O grupo `palavras` ganhou verificações de comportamento.

## [1.2.3] - 2026-11-16

Alinha o pacote à regra 4 do regimento: a palavra do proprietário vale também pela Diretoria.

### Mudado
- **Skills.** `gerente` deixa de dizer que o "pode" só vale no chat do gerente: o "vai" e o "pode" valem no chat do gerente ou, pela Diretoria, no arquivo de `diretoria/palavras/`; o gerente lê o arquivo (não a mensagem),
  grava a autorização do projeto em `ops/autorizacoes/<ID>.md` citando-o e devolve à Diretoria a palavra ambígua ou que não cobre a OS. `diretoria` ganha a seção "A palavra do proprietário": grava a palavra com as
  palavras exatas, a data, a hora de Brasília, o projeto, a OS e o alcance, repete antes o que entendeu em produção e em ato sem volta, e só transmite (não decide pelo proprietário, não amplia o que ele disse, não executa
  código de projeto). `triagem`, `os-nova`, `executor` e `plantao` citam o arquivo da palavra como origem do "vai" e do "pode".
- **Modelo de sede (`templates/sede/`).** O `AGENTS.md` traz a regra 4 nova, a cadeia de comando (o proprietário fala com o gerente ou com a Diretoria, à escolha dele) e o "vai" de N3 ou mais pelo arquivo; o memorando, o
  README da sede, o README de autorizações e os de `ops/autorizacoes/` dos modelos de projeto (app, operação, serviço e site) dizem o mesmo; `docs/boas-vindas.md` também.

### Adicionado
- **`diretoria/palavras/README.md` e `diretoria/modelos/palavra.md`** no modelo de sede (e no `templates/INDICE.md`): o `/intoca:comecar` os cria numa sede nova.
- Grupo de testes `palavras`, que prova a sede nova com os dois arquivos, a regra 4 no `AGENTS.md` do modelo, a skill `gerente` sem a regra antiga e a ausência da regra antiga em skills, docs e modelos.

Os hooks não mudaram: nenhum repetia a regra.

## [1.2.2] - 2026-11-15

Continuação do primeiro seguimento do `/intoca:ambiente`, depois da integração e da revisão da Diretoria: o mascaramento dos argumentos de servidor MCP deixa de ser uma lista de formatos e passa a ser uma máquina de estados; o texto promete só o que ela garante por estrutura.

### Corrigido
- **Valor que parece opção** (`registrar`): depois de uma opção que espera valor (sensível, de ambiente, de cabeçalho, segura ou desconhecida), o argumento seguinte **é o valor dela, mesmo que pareça opção** (`--token --abc`, `-p -abc`, `-p /x`) e vira `<definir>`. O argumento que vem depois dele também fica escondido,
  em vez de sair solto em claro. Só continuam sendo opção, com o nome visível, a opção sensível, a de ambiente (`-e`, `--env`), a de cabeçalho (`-H`, `--header`) e a forma `--x=valor`.
- **Opção sensível logo depois de outra opção, e nomes de um traço só**: `--headless --api-key x` e `--port --token x` (uma opção desconhecida ou segura engolia a opção sensível seguinte como se fosse valor e o segredo saía como palavra solta); `-password x` (lido como `-p` com o resto colado);
  `--token= x` (o `=` vazio não esperava o valor do argumento seguinte).
- **Perda aceita (na dúvida, esconde)**: uma opção comum ou bandeira logo depois de uma opção que espera valor perde o nome: `--foo --bar` sai `--foo <definir>`, `--headless -y pkg` sai `--headless <definir> <definir>`. Cada argumento da entrada dá exatamente um da saída, na mesma posição: nada é removido, só trocado por `<definir>`. Complete na mão o que for preciso.
- **O que o texto promete**: a skill, a doc (inclusive a tabela do que nunca guarda) e este histórico dizem o que o código garante e **o que não garante**: palavra solta sem opção na frente, palavra depois de bandeira conhecida (`-y`, `--stdio`, `--no-*`) ou depois do `--` sem opção, o valor de uma opção segura conhecida
  (`--port x`, `--nome x`), `user:pass` e `X-Api:y` sem espaço depois dos `:`, atribuição com prefixo que o código não reconhece, lista com vírgula sem `=` nem `:`
  e trecho de caminho de URL com menos de 24 caracteres (`https://h/hooks/abc123` passa).
- **`registrar` mostra o que vai gravar antes do "sim"**: a resposta sem `--confirmado` traz `texto_a_gravar` (o texto do arquivo, palavra por palavra) e a skill manda mostrá-lo à pessoa e pedir que procure ali qualquer valor com cara de segredo antes de perguntar "Posso gravar?".
- **Nome solto depois de `-e`**: `-e NOME` (sem `=`) também vira `<definir>`. Por estrutura é o nome de uma variável repassada, mas um valor posto ali por engano sairia em claro; na dúvida, esconde. `-e NOME=valor` segue guardando só `NOME=<definir>`.
- **Id de plugin**: uma chave com pontos no meio (`Ab1.Cd2.…`) é recusada; um nome legítimo e longo com pontos, só em minúsculas, passa. O padrão do id recusa `..`.

## [1.2.1] - 2026-11-15

Seguimento da 1.2.0: fecha as quatro ressalvas do revisor em `/intoca:ambiente`, condição para a 1.2.0 ir ao catálogo público.

### Corrigido
- **Valor em argumento de servidor MCP (`registrar`)**: o texto da 1.2.0 prometia "depois de `-e`/`--env` só o nome fica", o que não valia nas formas coladas. Agora, por estrutura, em qualquer forma
  da opção (`-e NOME=v`, `-eNOME=v`, `-e=NOME=v`, `--env NOME=v`, `--env=NOME=v`, e `-H`/`--header` até colado como `-HNome:v`): só o nome da variável ou do cabeçalho fica; de todo `nome=valor` (minúsculo,
  misto ou fora de `NOME_DE_VARIAVEL`) só o nome fica e o resto é `<definir>`; JSON dentro de argumento fica só com as chaves; URL perde usuário, senha, parâmetros (`?token=...`) e âncora, e esquema que não é http(s) some;
  o valor depois de **qualquer opção** (curta, longa, com `=`, colada ou em argumento separado; na 1.2.2 o argumento seguinte passou a valer como valor mesmo quando parece opção) que não seja uma bandeira conhecida sem valor (`-y`, `-v`, `--yes`, `--verbose`...) vira `<definir>` (`-p senha`, `-u user:pass`,
  `--db senha123`), salvo opção conhecida como segura (`--transport`, `--nome`, `--port`...) ou valor claramente de recurso (caminho portátil, pacote com escopo, URL limpa): **na dúvida, esconde**. `--chave`, `--segredo` e
  `--credencial` entram entre os nomes sensíveis. Continua fora da garantia (e a doc e a skill dizem): uma palavra solta sem opção na frente (`servidor admin senha123`) é copiada; só a varredura heurística pode pegá-la, e por
  isso a pessoa lê o diff antes do commit. Mudança de comportamento: `tipo=simples` solto passa a virar `tipo=<definir>` e `-p=8080` a `-p=<definir>` (`--port=8080` continua).
- **Revisão independente (segunda rodada, mesma versão)**: a leitura de opções continua **depois de um `--`** (o `--` de um servidor MCP não encerra as opções dele: `-- --token x`, `-- -p senha` e `-- -pabc` agora escondem o valor); é opção todo
  argumento que começa com `-` (inclusive dígito, `_` e letra não ASCII: `--2fa 123456`) ou com `/` (estilo Windows: `/password x`, `/p:x`); `pass` e `pwd` entram entre os nomes sensíveis; argumento solto com espaço, e o `command` com a
  linha de comando inteira, viram `<definir>`; `token:valor` solto com chave sensível guarda só a chave; e passo que falha no `restaurar`, inclusive o `plugin disable`, **para** a execução (`estado: "falhou"`, `ok: false`, erro `passo-falhou`, o que
  sobrou em `restante`). Limites que continuam: palavra solta sem opção, sem espaço, sem `=` e sem chave sensível (`user:pass`, `X-Api:y` sem espaço depois dos `:`) é copiada, e um trecho de caminho de URL só some com 24 caracteres ou mais
  (`https://h/hooks/abc123` passa); a varredura heurística e o diff que a pessoa lê antes do commit são a rede.
- **Id de plugin com cara de chave (`restaurar`)**: o teste de texto corrido agora vale **por parte** (o nome e o catálogo, cada um) e o id recusado vira passo `recusada` com o motivo, sem repetir o valor, antes de qualquer
  comparação com o que está instalado; o `＠` de largura total e letras parecidas já ficavam fora de `[A-Za-z0-9._-]` e do `@` ASCII e continuam recusados (agora com teste). O `registrar` e as frases de diferença também olham o id por parte.
- **`plugin disable` invisível no plano**: o plugin registrado como desabilitado mostra, no `comando` do plano, os dois comandos (`claude plugin install -- <id> && claude plugin disable -- <id>`, sem shell), o motivo diz que
  o plano também desabilita, o hash do plano cobre os dois comandos que o script executa (`exec` e `exec_depois`) e o relato do passo repete o comando do `disable`.
- **`--saida` e `--arquivo`**: exigem o nome `ambiente.yaml` e resolvem os links (`realpath`) antes de decidir se o destino fica dentro da sede ou da pasta temporária; recusam outro nome, link que aponte para fora, pasta com esse nome
  e destino já existente que não seja um `ambiente.yaml` (`caminho-nao-permitido`). O destino de sempre, `<sede>/diretoria/ambiente.yaml`, passa pelo mesmo portão. Além disso, o arquivo provisório da gravação nunca segue um link deixado
  no nome dele (remove o link, nunca o alvo, e só cria o arquivo se o nome estiver livre).

## [1.2.0] - 2026-11-14

### Adicionado
- **`/intoca:ambiente`**: guarda no Git da sede o mínimo para refazer o ambiente do Claude numa máquina nova, num arquivo só,
  `diretoria/ambiente.yaml`, só com nomes: valor de variável de ambiente e de cabeçalho nunca entra, e a pessoa lê o diff antes do commit (o que o código garante por estrutura nos argumentos de servidor MCP, e o que não garante, está na entrada 1.2.1 e em `docs/ambiente.md`; a 1.2.0 não foi ao catálogo público). O nome da máquina é um apelido neutro (hash), nunca o nome do computador. `registrar` lê os plugins (nome, catálogo, versão, habilitado), os catálogos (origem no GitHub
  ou pasta da sede em caminho relativo), os servidores MCP (comando, argumentos e só os nomes das variáveis e dos cabeçalhos), os hooks de fora de
  plugin (o nome e como refazê-los), as permissões (só o modo e a contagem) e as ferramentas do computador; mostra o que mudou e só grava com o
  "sim". Antes de gravar, varre o próprio texto (o analisador do Vigia, padrões de chave e, se existir, o `gitleaks`): achado = recusa e diz só o
  nome do campo. `restaurar` compara o arquivo com a máquina, mostra o plano na ordem (ferramentas, catálogos, plugins, hooks, MCP) e, com um "sim",
  executa os passos que dá para refazer sozinho; para no primeiro passo que depende da pessoa (login, conectores do claude.ai, `.env`, tarefas
  agendadas, confiança de pasta) e só acrescenta (plugin, catálogo e servidor MCP; os hooks da sala animada regravam o `settings.json`, e o plano avisa). O arquivo é tratado como não confiável: cada item passa por um padrão estrito (o que não passa é recusado no plano), as ferramentas vêm de uma tabela fixa, servidor MCP de comando local só é mostrado, e o plano executado é o que foi mostrado (`--plano=<hash>`). A validação confere a forma, não a confiança: o plano destaca a origem de cada catálogo, plugin e servidor remoto para a pessoa reconhecer. Caminho de máquina é procurado em qualquer posição do texto e nunca vai para o arquivo; a saída não repete frase do arquivo. `restaurar --so-plano` só imprime.
- `scripts/ambiente.mjs` (Node, sem dependência, aceita a pasta do Claude por `CLAUDE_CONFIG_DIR`) e `docs/ambiente.md` (o formato com um exemplo
  fictício e o roteiro da máquina nova).

### Alterado
- O `/intoca:comecar` avisa, em uma linha no fim e no modo `retomar`, que o `/intoca:ambiente` existe. Não executa nada.

## [1.1.0] - 2026-11-07

### Adicionado
- **Consultor**: dá, nos chats, uma dica curta sobre o que o plugin já tem (Git, `.env`, Secretaria, memorando, rigor, gerente
  do projeto), no nível do `perfil` da sede, no máximo uma por conversa e cada uma uma vez só. Dois modos, escolhidos no
  `/intoca:comecar`: `ativo` ou `sob_demanda` (o padrão). Guarda só quais dicas já deu e quando, num arquivo da pasta pessoal;
  nunca o que a pessoa escreveu.
- **Vigia**: aviso, sempre ligado, quando uma mensagem parece trazer uma senha, um token ou uma chave. Avisa depois, não bloqueia
  e não repete o valor. E o assistente `vigia`, que confere a segurança de uma pasta, só lendo.
- `/intoca:consultor`: ligar e silenciar as dicas, vê-las de novo, mudar o nível, aprender um termo e avaliar se vale criar um
  recurso novo. A triagem ganha a mesma linha de relevância para recurso novo, e a Diretoria abre um chat Consultor a pedido.
- `docs/consultor-e-vigia.md`. A frase "Nunca digite senha, token ou chave no chat" entra igual em todo texto sobre segredo.

### Alterado
- O `/intoca:comecar` faz oito perguntas: a nova é o modo do consultor, depois do rigor. O memorando ganha os termos Consultor e
  Vigia, e o regimento modelo cita o Vigia entre os assistentes.

## [1.0.7] - 2026-11-06

### Alterado
- O `/intoca:comecar` passa a **conferir a máquina** sem perguntar se a pessoa tem os programas: o Node primeiro (os scripts e os hooks do plugin são
  de Node; sem ele, falham sem aviso) e, depois, o Git. O que existe é presumido; o que falta é oferecido ("Posso instalar o X agora?") e, com o "sim" da
  pessoa, o Claude roda o instalador do sistema e confere de novo. O mesmo vale para o `uv` e o Python da sala animada. Conta, senha, código e chave
  continuam só da pessoa. Depois de instalar o Node ou o Git, o texto manda fechar e abrir o Claude Code e rodar o `/intoca:comecar` de novo.
- A ação `verificar` do `instalar-sala.mjs` devolve também `maquina` (sistema, gerenciador de pacotes, versão do Node, de onde veio o `claude`) e
  `instalar` (o comando de cada programa nesse sistema: `winget`, `brew`, `apt`, `dnf` ou `pacman`, ou `null`). O Node mínimo é o 20.
- O fecho traz uma linha por programa: "Git: já estava", "instalado hoje" ou "recusado: o InToca funciona sem ele", e a versão do Node.
- Saiu de todo texto do pacote a frase de que o Claude não instala programas. `git-e-github.md` ganha "Instalar o Git: o Claude faz com a sua autorização".

## [1.0.6] - 2026-11-05

### Adicionado
- O `/intoca:comecar` confere cedo se o Git está na máquina e diz em uma frase o resultado, explica as vantagens do Git e o que muda sem
  ele (lista fechada), mostra como instalá-lo e, só se a pessoa quiser o cofre online, o caminho da conta no GitHub, tudo como texto: o Claude
  não instala nem cria conta. O fecho traz a linha "Git: instalado" ou "Git: não instalado". `git-e-github.md` ganha as seções "Por que
  usar o Git", "Sem Git: o que funciona e o que não" e "Como instalar o Git".

## [1.0.5] - 2026-11-05

### Adicionado
- O modelo de sede (`sede.yaml`) explica a Suíte, comentada, com exemplo fictício: a pessoa descomenta quando tiver uma e a InToca Sala
  passa a agrupar as Tocas por frente. O manifesto de partida continua sem Suíte declarada. As boas-vindas ganham uma frase sobre isso.

## [1.0.4] - 2026-11-05

### Alterado
- Textos e exemplos sem nomes de projetos reais; títulos de grupo pelo manifesto. O README, os modelos e as mensagens não citam mais
  identificadores internos de ordem de serviço, e os dados de teste usam nomes fictícios. Um teste novo varre o pacote e falha se um
  nome ou um identificador voltar.

## [1.0.3] - 2026-11-05

### Corrigido
- O texto de como desinstalar a InToca Sala (passo da sala no `/intoca:comecar`) usa o catálogo de onde o plugin foi instalado, e não
  mais sempre `intoca-sede`. Quem instalou de outro catálogo recebia um comando que não funcionava.

## [1.0.2] - 2026-11-05

### Corrigido
- Os hooks reconhecem o projeto também dentro de uma worktree da sede quando o projeto mora numa subpasta da sede
  (`<raiz>/.claude/worktrees/<nome>/<subpasta>`, `<sede>/_worktrees/<nome>/<subpasta>` e a worktree criada dentro da pasta de outro
  projeto). Antes, o executor de um projeto assim era tomado pela sede ou pelo projeto que hospeda a worktree, e a gravação do
  relatório em `ops/` era negada com o caminho do outro projeto. Agora a governança do projeto na worktree é permitida, a área
  de trabalho do chat é a do projeto, a negação aponta a pasta do projeto dentro da worktree e o aviso de chat trocado cita o projeto
  certo. Subpasta mais específica vence; sem dono único, link, junção, caminho não registrado, worktree sem `sede.yaml` e de
  outra sede seguem como antes. `pastas_antigas` continuam sem dar identidade nem permissão. Dentro da worktree, a área de trabalho
  do chat de um projeto passa a ser só a subpasta dele (as demais pastas de projeto da mesma worktree deixam de valer).

## [1.0.1] - 2026-11-04

### Corrigido
- Os hooks reconhecem o título exato `Gerente` (sem sufixo) como cargo Gerente, como já faziam com `Diretoria` e `Secretaria`.
  Vale para a sede com um só gerente. `Gerente · Projeto` segue valendo; `Gerente InToca` e `Gerente -` seguem recusados. O campo
  `titulos.gerente` do manifesto aceita o texto fixo `Gerente`.

## [1.0.0] - 2026-11-04

Primeira versão estável.

### Adicionado
- Licença MIT (arquivo `LICENSE`) e autor público no `plugin.json`.
- Ícone do pacote (`.claude-plugin/icon.png`), provisório: trocar é substituir o arquivo.
- Nome de exibição **InToca Sede** (o identificador técnico segue `intoca`, e os comandos seguem `/intoca:...`).
- Este histórico de mudanças.
- No `/intoca:comecar`, logo depois de instalar os pacotes, a pergunta "quer que o Claude Code atualize o InToca sozinho quando sair versão
  nova?". Com o "sim", o script grava a escolha só para o catálogo de onde o `intoca` veio; num catálogo de pasta local não há o que
  atualizar, e o texto diz isso. Sem o "sim", o texto mostra o passo a passo e o comando manual. O fecho diz o que ficou.
- Em `docs/boas-vindas.md`, a seção "Como o InToca se atualiza".

### Alterado
- Textos do README, das boas-vindas e do `/intoca:comecar` usam os nomes InToca Sede e InToca Sala e descrevem a sala como ela é hoje
  (a InToca Sala Clássica; a sala animada é um passo opcional).

## [0.10.0] - 2026-11-04

### Adicionado
- O `/intoca:comecar` instala a InToca Sala (pacote `intoca-sala`) junto, num passo só e com o "sim" da pessoa, e oferece a sala animada
  como passo opcional e explícito (confere `git`, `uv` e Python, pergunta a porta e pede um "sim" à parte para registrar os hooks).
- Campo `plugin_minimo` no `sede.yaml` de sedes novas: a versão do plugin com que a sede funciona. Só avisa, nunca bloqueia.

## [0.9.4] - 2026-11-04

### Corrigido
- Os hooks reconhecem o cargo pelo título do próprio chat, e não pelo texto de uma mensagem.
- A cobrança de relatório vale só para o chat de executor com ordem.
- A ordem de serviço e a fila são achadas pela sigla do projeto e pelo manifesto; as pastas de `repositorios:` (como a da sala animada)
  contam como pasta do projeto, e o aviso "o pedido cita outro projeto" não dispara em mensagem entre chats.

## [0.9.3] - 2026-11-02

### Adicionado
- Aviso quando uma autorização de ordem de projeto é gravada na gaveta da sede.
- Nota sobre o `AppData` virtual do Windows e a pasta temporária dos hooks (`docs/windows-e-appdata.md`).

### Corrigido
- O aviso de "chat trocado" fica mudo na Diretoria e na Secretaria, salvo quando o pedido é código ou conteúdo de projeto.

## [0.9.2] - 2026-10-30

### Adicionado
- Projetos que a pessoa já tem: o `/intoca:comecar` pergunta se há pastas de projeto no computador e se devem ser trazidas para a sede ou
  ficar onde estão, com as vantagens e o custo de cada caminho (`docs/projetos-existentes.md`).
- A ação `adotar` do `criar-sede.mjs`: registra a pasta onde ela está, ou a traz para a sede só depois de simular e receber o "sim", só na
  mesma unidade de disco e com recusas claras (alteração não guardada, pasta sincronizada, pasta em uso).

## [0.9.1] - 2026-10-30

### Corrigido
- O analisador de segredos deixou de dar falso alarme em comandos comuns (procurar arquivos de ambiente, `git rm --cached`, anotar no
  `.gitignore`) e passou a pegar mais contornos (aspas aninhadas, comando em `node -e`, curinga no PowerShell, link duro).
- Apagar um arquivo de ambiente passou a pedir confirmação, e os textos do pacote dizem o que o bloqueio realmente faz.

## [0.9.0] - 2026-10-29

### Adicionado
- Política de segredos: o `.env` fica na pasta do projeto, o Git o ignora e a IA entrega só o modelo `.env.example` (`docs/politica-de-segredos.md`).
- O hook bloqueia ler, copiar e gravar arquivos de ambiente e de chaves, inclusive por comandos de shell; os modelos terminados em
  `.example`, `.sample` e `.template` passam.
- Os modelos de projeto trazem o `.gitignore` com essas regras.

## [0.8.1] - 2026-10-28

### Corrigido
- O aviso "esta pasta não é de nenhuma Toca" cala na pasta-mãe dos projetos, na pasta temporária e em worktree de outro repositório, e
  compara o caminho real da pasta.

## [0.8.0] - 2026-10-28

### Adicionado
- Rigor das permissões: na configuração inicial a pessoa escolhe `cauteloso` ou `equilibrado` (`autônomo` fica anunciado para uma versão
  seguinte). O porteiro do plugin passa a ler o nível.
- Comando `/intoca:rigor` e script `aplicar-rigor.mjs`: gravam o `.claude/settings.json` de cada pasta só depois de simular e receber o "sim".
- `docs/permissoes.md`, em linguagem de empresa.

## [0.7.0] - 2026-10-27

### Adicionado
- Comando `/intoca:comecar`: explica como tudo funciona, faz as perguntas, cria a sede a partir dos modelos do pacote e registra o primeiro projeto.
- Script `criar-sede.mjs`, que escreve a sede sem apagar nem sobrescrever nada, o ponteiro da sede na pasta pessoal e o campo `titulos:` do
  manifesto (padrão de nome dos chats).

## [0.6.0] - 2026-10-26

### Adicionado
- A sede de partida dentro do pacote (`templates/sede/`): regimento, mapa, manifesto, `diretoria/` com fila e modelos, e modelos de projeto
  por tipo (site, app, serviço, documento, relatório e operação).
- Higiene para exportar: nenhum caminho de máquina nem nome de pessoa no pacote, conferido por testes.

## [0.5.1] - 2026-10-25

### Corrigido
- O cabeçalho das skills `memorando` e `secretaria` não era lido por validadores estritos; passou a ser, e uma conferência automática
  roda o `claude plugin validate` junto dos testes.

## [0.5.0] - 2026-10-21

### Adicionado
- Skills `memorando` (a leitura de chegada do escritório) e `secretaria` (a lista do que só o proprietário faz).
- As regras 14 (chat errado) e 15 (foco da ordem de serviço) nas skills de cargo, com as exceções.
- Autorização de produção por sede e por projeto, dita nas cinco skills de cargo.

### Alterado
- Vocabulário de empresa nas skills de contratação.

### Corrigido
- O hook que cobra o relatório preserva as marcas do aviso de "chat trocado" ao regravar o estado da sessão.

## [0.4.0] - 2026-10-20

### Adicionado
- Hooks de monitoramento, que só avisam e nunca bloqueiam: pedido que cita outro projeto ("chat trocado"), chat aberto em pasta que não é
  de nenhuma Toca e gravação de governança fora do lugar, com o caminho certo no aviso.

## [0.3.1] - 2026-10-15

### Corrigido
- A autorização por regra respeita o modo de planejamento e fecha buracos achados na revisão da versão anterior.

## [0.3.0] - 2026-10-15

### Adicionado
- Autorização por regra no hook "antes de usar ferramenta": o que cumpre o regimento (escrever na pasta do projeto ou da worktree,
  governança em `diretoria/` e `ops/`, Git de rotina, testes) passa sem pergunta; o que viola é negado; só produção e o destrutivo perguntam.

## [0.2.0] - 2026-10-12

### Adicionado
- Hooks de criação e remoção de worktree: as worktrees ficam em `<sede>/_worktrees`, instalam dependências e reservam porta.

## [0.1.0] - 2026-10-12

### Adicionado
- Primeira versão do plugin: as skills de cargo e de rotina (Diretoria, Gerente, Executor, Plantão, triagem, ordem de serviço, relatório e
  encerramento), três assistentes de leitura (revisor, auditor e pesquisador) e os hooks do regimento (contexto da fila ao abrir o chat,
  ordem detectada, bloqueios e cobrança de relatório).
- Catálogo local de plugins da sede.
