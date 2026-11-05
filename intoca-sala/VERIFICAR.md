# Roteiro de verificação: o mod `intoca-sala` no app

Para quem vai conferir com os próprios olhos (sem programar). Cinco passos, uns cinco minutos. Em cada um está o
que **deve** aparecer; se não aparecer, anote **qual superfície** (app de desktop ou terminal) e **qual passo** e
avise o Gerente · Plugin. Lembrete: o mod é acesso antecipado e **só lê**; nada do que ele faz altera arquivo.

## Antes de começar (feito pela Diretoria, uma vez)

1. A Diretoria integra o pacote e acrescenta o mod ao catálogo da sede (`.claude-plugin/marketplace.json`).
2. Num terminal comum (não no chat do app), instala na conta: `claude plugin install intoca-sala@intoca-sede`.
3. **Abra um chat novo** no app: o mod só carrega em sessão nova.

(Para testar antes de instalar, a Diretoria pode abrir um terminal na sede e rodar
`claude --plugin-dir plugin/intoca-sala`; o resto do roteiro é igual.)

## Os cinco passos

### 1. Faixa acima do prompt

Abra um chat **na pasta da sede ou de um projeto dela**.

- **Deve aparecer:** logo acima da caixa de mensagem, uma linha como
  `N pendências do proprietário abertas · /pendencias`, com o botão **Ver painel**.
- **Não deve aparecer** se as pendências abertas forem zero, nem num chat aberto numa pasta que não é de nenhuma
  Toca da sede **quando a sede só é conhecida pelo ponteiro** `~/.intoca/sede` (se a pasta está dentro da sede, ou a
  variável `INTOCA_SEDE` aponta para ela, a faixa aparece em qualquer pasta).
- A faixa existe no app de desktop e no terminal (os outros lugares, como o celular, não a desenham).

### 2. Painel da sala

Digite `/sala` (ou clique em **Ver painel**).

- **Deve aparecer:** um painel ao lado da conversa (ou acima da caixa, se a janela for estreita) chamado
  **InToca Sala · nome-da-sede**, com a linha "lida às HH:MM em N ms · só leitura" e os blocos:
  *Pendências do proprietário*, *OS em andamento*, *Avisos*, *Recursos ocupados*, *Este chat* e, se algum arquivo não
  foi lido, *Leitura*.
- Clique em **Atualizar**: a hora "lida às" muda. Sozinho, ele também se atualiza a cada minuto.
- Se a janela for estreita demais, o chat responde "O painel não coube agora"; alargue a janela e repita.
- **Não deve mostrar** a lista dos outros chats abertos: o mod só enxerga o próprio chat. O quadro mostra o que as
  filas registram.

### 3. `/pendencias`

Digite `/pendencias`.

- **Deve aparecer:** no chat, "N pendências abertas do proprietário:" e uma linha por pendência (número, pedido,
  onde, estado), no máximo 20, e o painel abre.
- Confira com o arquivo `diretoria/pendencias-do-proprietario.md`: o número de linhas sob "Abertas" que não dizem
  `feito` deve ser o mesmo.

### 4. Linha de status

Abra (ou use) um chat de executor, com título `Executor · ID tema`, numa pasta da sede, e mande qualquer mensagem.

- **Deve aparecer:** na linha de status do app, a OS do chat: `ID · recurso` (por exemplo `AB-05 · meu-projeto/`),
  ou só o `ID` se a fila não disser o recurso.
- Num chat de gerente, de diretoria ou comum: **nada** (a linha fica como estava).

### 5. Avisos rápidos

Num chat de **gerente de um projeto** (título `Gerente · Projeto`), peça algo que cite **outro** projeto, por exemplo
"ajuste o botão do projeto <outro>".

- **Deve aparecer:** um aviso rápido (some sozinho em alguns segundos): "Aviso InToca: o pedido cita ..., e este
  chat é Gerente · ...". É o mesmo aviso que os hooks do `intoca` dão ao modelo, agora também para você.
- Pergunta ("qual o status do ...?"), conversa sobre o próprio trabalho e "faz aqui mesmo" **não** avisam.
- Abrir um chat numa pasta da sede que não é de projeto (por exemplo `<sede>/qualquer-pasta`) mostra o aviso de
  "pasta errada" ao abrir.

## Se algo não aparecer

- Confirme que o chat é **novo** (aberto depois da instalação) e que a Diretoria instalou o `intoca-sala`.
- Num terminal: `claude plugin list` deve mostrar `intoca-sala` ativo.
- A API de mods muda entre versões do Claude Code; depois de uma atualização do app, o mod pode precisar de ajuste.
  Os hooks do `intoca` continuam funcionando de qualquer forma.
- Para desligar: `claude plugin disable intoca-sala@intoca-sede`.
