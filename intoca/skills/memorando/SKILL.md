---
name: memorando
description: 'Acione quando a pessoa pedir o Memorando de Integração ("/intoca:memorando", "quero ler o memorando", "me explica como a sede funciona do zero"): a leitura de chegada, inteira ou só uma seção ou um termo.'
argument-hint: "[termos | cargos | documentos | regras | niveis | fluxo | modos | perguntas | um termo]"
---

# Memorando de Integração

Apresenta o memorando que explica, em linguagem de empresa, como a sede organiza o trabalho com IA.
Só lê e mostra: não executa nada e não grava nada.

## Onde está o texto

Leia **a versão neutra do pacote**, `${CLAUDE_PLUGIN_ROOT}/templates/sede/diretoria/memorando.md`, e não a
da sede: a pessoa pode estar numa máquina sem sede. O começo do texto diz de qual versão e data ele vem; no
título, `<nome-da-sede>` é o nome da sede da pessoa (leia como "a sede"). Se o arquivo não abrir, diga isso
em uma linha e responda com o que souber do regimento, sem inventar.

## Sem argumento

Apresente o memorando em um sumário curto (para que serve, a sede como uma empresa, em uma ou duas
frases) e ofereça as seções:

| Argumento | Seção do memorando |
| --- | --- |
| `termos` | Vocabulário |
| `cargos` | Cargos: quem faz o quê |
| `documentos` | Os documentos |
| `regras` | Regras de ouro |
| `niveis` | Cerimônia proporcional |
| `fluxo` | Um pedido do começo ao fim |
| `modos` | Onde as coisas moram (os dois modos de sede) |
| `perguntas` | Perguntas frequentes |

## Com argumento

Argumento recebido: `$ARGUMENTS`

- **Nome de seção** (a coluna da esquerda): mostre só aquela seção, com as palavras do memorando.
- **Termo solto** (`OS`, `fila`, `recurso`, `toca`...): mostre só o verbete da tabela do vocabulário,
  ou a pergunta frequente que o cita. Se o termo não está no memorando, diga isso e mostre o
  verbete mais próximo.
- Argumento que não é seção nem termo: diga em uma linha e mostre o sumário.

## Regras

- Não resuma além do pedido nem acrescente opinião: o memorando é a fonte. Se a pessoa quiser a regra
  na íntegra, o regimento (`AGENTS.md` da sede) é a referência e o memorando indica a versão publicada.
- Termine perguntando, em uma linha, se quer outra seção. Nada além disso.
