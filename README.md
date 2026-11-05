# InToca

Plugin do Claude Code que organiza o trabalho com IA como um escritório: cada projeto tem um gerente, cada tarefa vira uma ordem de
serviço para um profissional contratado, e tudo termina em relatório. Serve para quem não programa.

- **InToca Sede** (`intoca`): os cargos e as rotinas, os assistentes e as regras que valem em todas as conversas.
- **InToca Sala** (`intoca-sala`, opcional): o quadro de avisos do escritório, dentro do app e no navegador.

## Instalar

No terminal, com o Claude Code instalado:

```
claude plugin marketplace add guigsm/intoca-plugin
claude plugin install intoca@intoca
```

Depois abra uma conversa nova e digite `/intoca:comecar`. Ele monta o seu escritório, oferece a InToca Sala
(`intoca-sala@intoca`) e pergunta se você quer receber as versões novas sozinho.

## Atualizar

O `/intoca:comecar` liga a atualização automática, se você disser sim. Para ligar depois: `/plugin`, aba Marketplaces, catálogo
`intoca`, **Enable auto-update**. Para atualizar na hora:

```
claude plugin marketplace update intoca
claude plugin update intoca@intoca
claude plugin update intoca-sala@intoca
```

A versão nova vale na próxima conversa, ou na conversa aberta depois de `/reload-plugins`.

## Licença

MIT. Veja [LICENSE](LICENSE).

## Problema ou sugestão

Abra um pedido em <https://github.com/guigsm/intoca-plugin/issues>.
