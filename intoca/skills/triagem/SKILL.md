---
name: triagem
description: Acione antes de executar qualquer pedido do proprietário que altere arquivos, envie mensagens, crie chat ou gaste trabalho pesado. Classifica em N1 a N5, confere recurso e ocupação, escolhe executor e propõe o plano. Não use para consulta ou status sem efeito colateral.
---

# Triagem

Resposta curta, dada antes de agir, que o proprietário aprova com "vai". O "vai" vale dado no chat do
gerente ou, pela Diretoria, gravado em `diretoria/palavras/` (regra 4).

## Quando não fazer

- Consulta ou status sem efeito colateral: responder direto.
- Pedido que começa com "vai direto": executar com a classificação que daria na triagem, e registrá-la.

## Os 7 itens

1. **Entendimento** do pedido em uma linha, com as dúvidas que mudariam o rumo.
1b. **Relevância**, só em **recurso novo** (N3 ou mais, ou pedido que cria cargo, comando, hook ou skill novos), numa linha:
   `Relevância: valor <alto|médio|baixo> · custo <complexidade, vocabulário novo, manutenção> · sobreposição <nada|com X> · recomendo <fazer|adiar|descartar>`,
   mais uma frase de porquê. Sobreposição é com o que o plugin e a sede já têm (skill, hook, assistente, rotina). É a mesma
   avaliação do `/intoca:consultor avaliar`.
2. **Nível** (N1 a N5) e **risco** (baixo, médio, alto: produção, dados, irreversível).
3. **Destino:** o próprio gerente, subagente, chat existente ou chat novo.
4. **Recurso e ocupação:** livre agora, ou na fila atrás de quem. Conferir `fila.md`.
5. **Executor:** modelo e esforço.
6. **O que depende do proprietário:** decisões e "pode". Cada palavra dele vale no chat do gerente ou, gravada
   pela Diretoria, em `diretoria/palavras/`.
7. **Plano** em 2 a 4 passos.

## Níveis

| Nível | Quando | Modelo · esforço |
| --- | --- | --- |
| N1 mecânico | Mover, renomear, limpar, conferir status, ajuste pontual de texto, arrumação de Git. | Haiku 5.5 · low |
| N2 rotina | Correção localizada, ajuste de UI com especificação clara, docs, legendas e posts, configuração. | Sonnet 5.5 · medium |
| N3 recurso | Várias partes do código, testes novos, integração com serviço, vídeo e render. | Sonnet 5.5 · high (Opus 5.5 · medium com muita decisão de design) |
| N4 crítico | Arquitetura, segurança, privacidade e dados, incidente em produção, histórico do Git. | Opus 5.5 · high |
| N5 impasse | Algo que já falhou um nível abaixo, depuração difícil. | Opus 5.5 · xhigh; max só com ok do proprietário |

Subir um nível depois de duas tentativas que falharam. Baixar quando a tarefa se mostrar rotineira.

## Formato da resposta

N1 e N2, uma linha:

```
Triagem: <pedido em uma frase> · N<n> · risco <baixo|médio|alto> · recurso <nome> (<livre|ocupado por X>) · <modelo · esforço>. Vai?
```

N3 ou mais, os 7 itens numerados, cada um em uma ou duas frases, e a pergunta final:

```
Triagem de <pedido>
1. Entendimento: ...
1b. Relevância: valor alto · custo baixo · sobreposição nada · recomendo fazer (só em recurso novo)
2. Nível e risco: N3, médio
3. Destino: chat novo
4. Recurso: <nome>, livre
5. Executor: Sonnet 5.5 · high
6. Depende de você: <decisões, "pode">
7. Plano: (a) ... (b) ... (c) ...
Vai?
```

## Depois do "vai"

Se o "vai" veio pela Diretoria, conferir o arquivo de `diretoria/palavras/` antes: o que ele diz é o que vale,
e palavra ambígua ou que não cobre a OS volta como dúvida, sem executar. Se for para executor, acionar a skill `os-nova`. Se o gerente executa direto, registrar o recurso
como ocupado na fila antes de começar.
