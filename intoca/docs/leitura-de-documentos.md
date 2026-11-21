# Leitura de documentos com o `markitdown`

Texto de apoio para os chats (gerente, executor, diretoria, secretaria e os assistentes) e para quem instala a ferramenta numa máquina nova.
Resumo: **antes de abrir um PDF, um Word, um PowerPoint ou uma planilha cru, converta para `.md` com o `markitdown` e leia só o trecho que
interessa.** Gasta bem menos token do que abrir o arquivo inteiro. **Sem a ferramenta na máquina, leia como sempre, sem erro e sem queixa.**

## O que é

O `markitdown` (<https://github.com/microsoft/markitdown>, licença MIT, pacote `markitdown` no PyPI) converte documentos em Markdown. Aqui só
interessam os conversores **locais**: `pdf`, `docx`, `pptx`, `xlsx`, `xls`, `msg` (e-mail do Outlook), `epub` e `html`. O plugin **não instala**
nada e **não roda** a ferramenta: ele só avisa o chat, e a conversão é feita pelo chat, pelo comando abaixo.

## Quando usar, e quando não

Use em arquivo **local** de um destes formatos: PDF, DOCX, PPTX, XLSX, XLS, MSG, EPUB (HTML também funciona, mas costuma ser código, que se lê direto).

Não use:

- **Em PDF escaneado** (imagem de página): o `markitdown` não faz OCR, e a saída vem vazia ou quase. Leia como está.
- **Quando o layout visual importa** (formulário, planta, tabela complexa, slide cheio de imagem, contrato com carimbo): a conversão perde a
  forma. Leia como está.
- **Em endereço da internet**: só arquivo local. Nunca passe URL ao `markitdown`.
- **Em `.env`, em arquivo de segredo e em pasta `.out`** (a saída local de um projeto): continuam fora, como sempre; não converta nem copie para o
  temporário. Para `.env` e segredos vale a regra 6 do regimento; a pasta `.out` é uma convenção do plugin (o hook também a trata como protegida).

## Como o chat chama

Sempre com `-o`, gravando num `.md` numa **pasta temporária fora do repositório**. A saída no console do Windows estraga os acentos, e um `.md`
solto dentro do projeto acabaria no Git. O executável é o indicado na variável de ambiente `INTOCA_MARKITDOWN` (caminho completo); se ela não
existir, o `markitdown` do `PATH`.

PowerShell:

```powershell
$saida = Join-Path ([IO.Path]::GetTempPath()) 'intoca-leitura'
New-Item -ItemType Directory -Force $saida | Out-Null
& $env:INTOCA_MARKITDOWN "<arquivo>" -o (Join-Path $saida '<nome>.md')   # ou: markitdown "<arquivo>" -o ...
```

Bash (Mac e Linux):

```bash
saida="${TMPDIR:-/tmp}/intoca-leitura"; mkdir -p "$saida"
"$INTOCA_MARKITDOWN" "<arquivo>" -o "$saida/<nome>.md"   # ou: markitdown "<arquivo>" -o ...
```

Depois, **leia só o trecho**: `Read` com `offset` e `limit` no `.md`, ou `Grep` nele. Não leia o `.md` inteiro de uma vez se o documento é grande: o
ganho está justamente em não fazer isso. O `.md` guarda o conteúdo do documento; apague a pasta `intoca-leitura` quando terminar, e nunca
a leve para dentro de um repositório.

## Quando a ferramenta não existe

Variável ausente ou apontando para algo que não é um executável, e nenhum `markitdown` no `PATH`: **leia o documento do jeito de antes**. Nada
de erro, de aviso ou de pedido de instalação ao proprietário por causa disso. Instalar a ferramenta é decisão dele (próxima seção).

## O aviso do hook

Quando um chat vai ler (`Read`) um arquivo `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.xls`, `.msg` ou `.epub` (maiúscula e minúscula valem igual) **e** a
ferramenta existe na máquina, o hook `PreToolUse` acrescenta ao pedido uma ou duas frases lembrando de converter antes. `html` fica de fora do
aviso (quase sempre é código). O que o hook **faz e não faz**:

- **Só avisa.** Não bloqueia, não pergunta, não troca a leitura, não converte e **nunca roda o `markitdown`**. A leitura segue como o chat pediu.
- **Em toda leitura de documento**, não uma vez por sessão: o hook não guarda estado entre chamadas, e a frase é curta.
- **Cala** sem a ferramenta (variável ausente, apontando para arquivo que não existe, para pasta ou para texto que não é um caminho, e nenhum
  executável `markitdown` nas pastas absolutas do `PATH`).
- **Vem depois** das regras de negar: a leitura de `.env` (inclusive `.env.pdf`) segue negada e sem aviso.
- **Cala na lista de segredo do hook, em `.out` e na heurística de nome**, porque o aviso manda copiar o documento convertido para uma pasta
  temporária e isso não se faz com o que é protegido. Não avisa quando o caminho (como veio e resolvido contra a pasta do chat) (1) cai na lista de
  segredo que o próprio hook usa para tirar o "allow" do `Read` (`.env`, `.ssh`, `credentials`, `id_rsa`, `*.pem`...); (2) tem **qualquer pasta
  `.out`** (da sede ou de projeto, qualquer caixa e barra); ou (3) **por heurística de nome, na dúvida** (não é regra de segredo): tem, em qualquer
  pasta ou no nome, a palavra inteira `segredo(s)`, `senha(s)`, `chave(s)`, `secret(s)`, `password(s)`, `passwd`, `apikey`/`api-key`/`api_key` ou
  `keys` (entre separadores: início, fim, ponto, hífen, sublinhado, espaço, barra), ou uma extensão de chave no meio do nome (`chave.pem.pdf`).
  A decisão da leitura continua a de sempre; só o aviso some.
  - **Falso positivo aceito:** `palavra-chave.pdf` e `minhas-senhas.docx` calam (palavra inteira entre hífens). `desenhada.pdf` e `chaveamento.pdf`
    **não** (a palavra não é inteira) e avisam.
  - **O que ainda avisa:** nomes de segredo sem essas palavras, por exemplo `vault.xlsx` ou `acessos.pdf`, ou uma pasta chamada de outro jeito. A
    lista de segredo e a heurística não são um cofre: leia segredo só como a regra 6 manda.
  - **O hook decide só pelo texto do caminho**: não resolve link, junção, nome curto 8.3 nem unidade mapeada, e não consulta o disco do arquivo
    lido (olhar caminho de rede ou unidade mapeada pode esperar a rede além dos 5 s do hook). **Limite dito:** um link ou junção que aponte para
    dentro de `.out`, ou o nome curto 8.3 de um arquivo de segredo, não é visto e o aviso sai. Um caminho de rede (`\\servidor\...`, `//servidor/...`)
    recebe o aviso (ou o silêncio) pelo mesmo texto, sem tocar a rede.
  - A ferramenta é conferida **antes** do caminho: sem o `markitdown` na máquina, o hook não faz mais nada com o arquivo lido.
- **Caminho de rede não conta como ferramenta**: variável ou pasta do `PATH` que comece com `\\` ou `//` (UNC) é ignorada antes de olhar o disco,
  para o hook não esperar a rede.
- Não copia o nome do arquivo nem o valor da variável para o aviso: só o nome da variável e o comando genérico.
- Como a ferramenta é achada: (1) a variável `INTOCA_MARKITDOWN`, com o **caminho completo** de um arquivo que existe e tem cara de executável
  (`.exe` ou `.cmd` no Windows; bit de execução nos outros sistemas); senão (2) um arquivo `markitdown` (`markitdown.exe` ou `markitdown.cmd` no
  Windows) numa pasta **absoluta** do `PATH`. Só olha o disco: não executa nada, não usa a rede e não trata o valor como comando.

## Instalar numa máquina nova (passo da pessoa)

A instalação **não é feita pelo plugin** nem pelo `/intoca:ambiente restaurar` (a tabela de ferramentas do `restaurar` é por gerenciador de
pacotes, e o `markitdown` vem do `pip`; mexer nisso mudaria o desenho do `restaurar`, que fica como está). O `/intoca:ambiente` só mostra o que o
plano já mostra antes do "sim"; o `markitdown` entra como passo seu, pelo roteiro abaixo.

Regras do roteiro: **ambiente isolado** (não instale no Python do sistema), **versão fixada**, **só os conversores locais** (sem áudio, sem
YouTube, sem Azure) e **origem conferida**: pacote `markitdown` do PyPI, mantido em `github.com/microsoft/markitdown`. Pré-requisito: Python 3.10 ou mais novo.

Windows (PowerShell):

```powershell
python -m venv "$HOME\.venvs\markitdown"
& "$HOME\.venvs\markitdown\Scripts\python.exe" -m pip install "markitdown[pdf,docx,pptx,xlsx,xls,outlook]==0.1.9"
& "$HOME\.venvs\markitdown\Scripts\markitdown.exe" --version
[Environment]::SetEnvironmentVariable('INTOCA_MARKITDOWN', "$HOME\.venvs\markitdown\Scripts\markitdown.exe", 'User')
```

Mac e Linux:

```bash
python3 -m venv ~/.venvs/markitdown
~/.venvs/markitdown/bin/python -m pip install "markitdown[pdf,docx,pptx,xlsx,xls,outlook]==0.1.9"
~/.venvs/markitdown/bin/markitdown --version
echo 'export INTOCA_MARKITDOWN="$HOME/.venvs/markitdown/bin/markitdown"' >> ~/.profile   # ou o arquivo do seu shell
```

A variável só vale em programas abertos **depois** de definida: feche e abra de novo o app do Claude Code (ou o terminal). Para conferir, abra um
chat e peça para ele ler um PDF pequeno: ele deve converter antes de ler. Para trocar a versão, mude o número e rode de novo o `pip install` (confira
antes a versão nova no PyPI e as notas dela). Para desligar, apague a variável: o aviso some e os chats leem como antes.
