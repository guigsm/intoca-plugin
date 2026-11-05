// GERADO por gerar.mjs a partir dos hooks reais do plugin `intoca`. Não editar à mão: rode o gerador.
// `<SEDE>`, `<FORA>`, `<ANTIGO>`, `<CASA>` e `<RAIZ>` são lugares da sede de mentira; o teste os troca por caminhos de mentira.
export type CasoChat = { nome: string; cwd: string; titulo?: string; passos: string[]; esperado: (string | null)[] }
export type CasoPasta = { nome: string; cwd: string; ponteiro?: boolean; atalho?: { de: string; para: string }; esperado: string | null }

export const MANIFESTO_PARIDADE = "sede:\n  nome: sede-teste\nprojetos:\n  - nome: alfa.exemplo.br\n    sigla: ALF\n    pasta_atual: '<SEDE>/alfa'\n    pastas_antigas: ['<ANTIGO>/alfa']\n  - nome: beta\n    sigla: BET\n    pasta_atual: '<SEDE>/beta'\n  - {nome: gama, sigla: GAM, pasta_atual: '<FORA>/gama'}\n  - nome: localhost\n    sigla: LOC\n    pasta_atual: '<SEDE>/_infra/local'\n"

export const CASOS_CHAT: CasoChat[] = [
  {
    "nome": "cita outro projeto pelo nome",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o botão do projeto beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "sigla em maiúsculas, palavra inteira",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "corrija o BET que quebrou"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "sigla em minúsculas não vale",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "corrija o bet que quebrou"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "o nome em maiúsculas vale (o nome não distingue caixa)",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "corrija o BETA que quebrou"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "ID de OS de outro projeto",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "siga com a BET-05 agora"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "nome dentro de outra palavra não vale",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o betabloqueador do texto"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "nome depois de hífen não vale",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o meta-beta do texto"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "domínio citado por inteiro",
    "cwd": "<SEDE>/beta",
    "titulo": "Gerente · beta",
    "passos": [
      "ajuste o alfa.exemplo.br inteiro"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita alfa.exemplo.br, e este chat é Gerente · beta. Se for para alfa.exemplo.br, vale encaminhar à fila de Gerente · alfa.exemplo.br pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "apelido do domínio com inicial maiúscula",
    "cwd": "<SEDE>/beta",
    "titulo": "Gerente · beta",
    "passos": [
      "ajuste o Alfa inteiro"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "apelido do domínio em minúsculas não vale",
    "cwd": "<SEDE>/beta",
    "titulo": "Gerente · beta",
    "passos": [
      "ajuste o alfa inteiro"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "caminho de pasta de outro projeto",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "altere o arquivo <SEDE>/beta/src/x.ts"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "caminho de pasta antiga",
    "cwd": "<SEDE>/beta",
    "titulo": "Gerente · beta",
    "passos": [
      "altere o arquivo <ANTIGO>/alfa/x"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita alfa.exemplo.br, e este chat é Gerente · beta. Se for para alfa.exemplo.br, vale encaminhar à fila de Gerente · alfa.exemplo.br pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "caminho da governança de outro projeto",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "veja o <SEDE>/beta/ops/os/BET-01-x.md"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "sigla de nome comum (localhost)",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o LOC de hoje"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita localhost, e este chat é Gerente · alfa.exemplo.br. Se for para localhost, vale encaminhar à fila de Gerente · localhost pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "nome comum em endereço não vale",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "abra o localhost:3000 e ajuste"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "cita o próprio projeto: mudo",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o botão do alfa.exemplo.br"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "consulta: mudo",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "qual é o status do beta?"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "mostre: mudo",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "mostre o beta para mim"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "pergunta que é pedido educado avisa",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "poderia ajustar o beta?"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "conversa sobre o próprio trabalho: mudo",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "pare de mexer no beta"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "dois projetos citados",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta e o gama"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta e gama, e este chat é Gerente · alfa.exemplo.br. Se for para eles, vale encaminhar às filas dos gerentes de beta e gama pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "três projetos citados",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta, o gama e o LOC"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, gama e outros, e este chat é Gerente · alfa.exemplo.br. Se for para eles, vale encaminhar às filas dos gerentes de beta, gama e outros pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "prompt vazio",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "   "
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "insistência \"aqui mesmo\" vale logo",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta aqui mesmo",
      "ajuste o beta"
    ],
    "esperado": [
      null,
      null
    ]
  },
  {
    "nome": "insistência com crase no meio ainda vale (a limpeza tira diacríticos)",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta, faz `aqui` mesmo",
      "ajuste o beta"
    ],
    "esperado": [
      null,
      null
    ]
  },
  {
    "nome": "insistência depois do aviso",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta",
      "mesmo assim",
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga.",
      null,
      null
    ]
  },
  {
    "nome": "\"pode seguir\" depois do aviso insiste",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta",
      "pode seguir.",
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga.",
      null,
      null
    ]
  },
  {
    "nome": "\"pode seguir\" sem aviso é pedido comum",
    "cwd": "<SEDE>/alfa",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "pode seguir.",
      "ajuste o beta"
    ],
    "esperado": [
      null,
      "Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "sede sem título",
    "cwd": "<SEDE>",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é a sede. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "sede: só ID de OS é governança",
    "cwd": "<SEDE>",
    "passos": [
      "veja a BET-05"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "sede: caminho de governança é vocabulário",
    "cwd": "<SEDE>",
    "passos": [
      "leia <SEDE>/beta/ops/fila.md"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é a sede. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "Diretoria: nome sem verbo de código, mudo",
    "cwd": "<SEDE>",
    "titulo": "Diretoria",
    "passos": [
      "o beta está parado"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "Diretoria: pedido de código avisa",
    "cwd": "<SEDE>",
    "titulo": "Diretoria",
    "passos": [
      "altere o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é a Diretoria. Se for para beta (código ou conteúdo de projeto), vale registrar na fila de Gerente · beta em vez de executar aqui; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "Diretoria: caminho de pasta avisa",
    "cwd": "<SEDE>",
    "titulo": "Diretoria",
    "passos": [
      "o arquivo <SEDE>/beta/src/x.ts está estranho"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "Secretaria: pedido de código avisa",
    "cwd": "<SEDE>",
    "titulo": "Secretaria",
    "passos": [
      "corrija o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é a Secretaria. Se for para beta (código ou conteúdo de projeto), ele vai à fila de Gerente · beta; se for pendência do proprietário, siga."
    ]
  },
  {
    "nome": "Secretaria: assunto de pendência, mudo",
    "cwd": "<SEDE>",
    "titulo": "Secretaria",
    "passos": [
      "quais pendências do proprietário faltam"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "Executor em projeto cita outro projeto",
    "cwd": "<SEDE>/alfa",
    "titulo": "Executor · ALF-14 rigor",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Executor · ALF-14 (projeto alfa.exemplo.br). Se for para beta, é outra OS: devolva ao gerente de alfa.exemplo.br, que sobe à Diretoria para a fila de Gerente · beta; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "Executor: lembrete na primeira vez, depois mudo",
    "cwd": "<SEDE>/alfa",
    "titulo": "Executor · ALF-14 rigor",
    "passos": [
      "bom dia",
      "e então"
    ],
    "esperado": [
      "Aviso InToca: este chat cumpre a OS ALF-14; pedido novo fora dela é outra OS (regra 15): registre na fila do gerente em vez de fazer aqui.",
      null
    ]
  },
  {
    "nome": "Executor: aviso conta como lembrete",
    "cwd": "<SEDE>/alfa",
    "titulo": "Executor · ALF-14 rigor",
    "passos": [
      "ajuste o beta",
      "e então"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Executor · ALF-14 (projeto alfa.exemplo.br). Se for para beta, é outra OS: devolva ao gerente de alfa.exemplo.br, que sobe à Diretoria para a fila de Gerente · beta; se for mesmo daqui, siga.",
      null
    ]
  },
  {
    "nome": "Executor que cita o arquivo da OS: o lembrete fica para depois",
    "cwd": "<SEDE>/alfa",
    "titulo": "Executor · ALF-14 rigor",
    "passos": [
      "Execute a OS <SEDE>/alfa/ops/os/ALF-14-rigor.md"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "Executor na sede toma o projeto pela sigla",
    "cwd": "<SEDE>",
    "titulo": "Executor · ALF-14 rigor",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Executor · ALF-14 (projeto alfa.exemplo.br). Se for para beta, é outra OS: devolva ao gerente de alfa.exemplo.br, que sobe à Diretoria para a fila de Gerente · beta; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "Executor da sede (sigla DIR) cita projeto",
    "cwd": "<SEDE>",
    "titulo": "Executor · DIR-30 backup",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Executor · DIR-30 (sede). Se for para beta, é outra OS: devolva à Diretoria, que registra na fila de Gerente · beta; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "Plantão cita outro projeto",
    "cwd": "<SEDE>/alfa",
    "titulo": "Plantão · Deploy · alfa.exemplo.br",
    "passos": [
      "suba o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Plantão (projeto alfa.exemplo.br). Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "título de Gerente em pasta da sede: o cargo cai",
    "cwd": "<SEDE>",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é a sede. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "título de Diretoria em pasta de projeto: o cargo cai",
    "cwd": "<SEDE>/alfa",
    "titulo": "Diretoria",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "título desconhecido",
    "cwd": "<SEDE>/alfa",
    "titulo": "Conversa qualquer",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é alfa.exemplo.br. Se for para beta, vale encaminhar à fila de Gerente · beta pela Diretoria antes de agir; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "pasta fora de tudo: mudo",
    "cwd": "<FORA>/solto",
    "titulo": "Gerente · alfa.exemplo.br",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      null
    ]
  },
  {
    "nome": "worktree de projeto em _worktrees",
    "cwd": "<SEDE>/_worktrees/alfa-cartao",
    "titulo": "Executor · ALF-15 x",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      "Aviso InToca: o pedido cita beta, e este chat é Executor · ALF-15 (projeto alfa.exemplo.br). Se for para beta, é outra OS: devolva ao gerente de alfa.exemplo.br, que sobe à Diretoria para a fila de Gerente · beta; se for mesmo daqui, siga."
    ]
  },
  {
    "nome": "worktree sem dono em _worktrees: mudo",
    "cwd": "<SEDE>/_worktrees/zzz",
    "passos": [
      "ajuste o beta"
    ],
    "esperado": [
      null
    ]
  }
]

export const CASOS_PASTA: CasoPasta[] = [
  {
    "nome": "pasta de projeto: mudo",
    "cwd": "<SEDE>/alfa",
    "esperado": null
  },
  {
    "nome": "subpasta de projeto: mudo",
    "cwd": "<SEDE>/alfa/src",
    "esperado": null
  },
  {
    "nome": "projeto fora da sede: mudo",
    "cwd": "<FORA>/gama",
    "esperado": null
  },
  {
    "nome": "pasta antiga de projeto que migrou",
    "cwd": "<ANTIGO>/alfa/x",
    "esperado": "Aviso InToca: esta pasta não é a de nenhum projeto da sede, o projeto alfa.exemplo.br migrou para <SEDE>/alfa. Para trabalho de projeto, o chat assume o cargo na pasta do projeto."
  },
  {
    "nome": "raiz da sede: mudo",
    "cwd": "<SEDE>",
    "esperado": null
  },
  {
    "nome": "diretoria da sede: mudo",
    "cwd": "<SEDE>/diretoria",
    "esperado": null
  },
  {
    "nome": "labs da sede: mudo",
    "cwd": "<SEDE>/labs/x",
    "esperado": null
  },
  {
    "nome": "pasta compartilhada com \"_\": mudo",
    "cwd": "<SEDE>/_shared",
    "esperado": null
  },
  {
    "nome": ".claude da sede: mudo",
    "cwd": "<SEDE>/.claude",
    "esperado": null
  },
  {
    "nome": "worktree de projeto: mudo",
    "cwd": "<SEDE>/_worktrees/alfa-cartao",
    "esperado": null
  },
  {
    "nome": "worktree sem dono: mudo",
    "cwd": "<SEDE>/_worktrees/zzz",
    "esperado": null
  },
  {
    "nome": "pasta da sede sem projeto",
    "cwd": "<SEDE>/qualquer",
    "esperado": "Aviso InToca: esta pasta não é a de nenhum projeto da sede. Para trabalho de projeto, o chat assume o cargo na pasta do projeto."
  },
  {
    "nome": "fora da sede, com sede por INTOCA_SEDE",
    "cwd": "<FORA>/solto",
    "esperado": "Aviso InToca: esta pasta não é a de nenhum projeto da sede. Para trabalho de projeto, o chat assume o cargo na pasta do projeto."
  },
  {
    "nome": "fora da sede, numa pasta que contém um projeto",
    "cwd": "<FORA>",
    "esperado": "Aviso InToca: esta pasta não é a de nenhum projeto da sede; aqui dentro ficam gama (<FORA>/gama). Para trabalho de projeto, o chat assume o cargo na pasta do projeto."
  },
  {
    "nome": "ponteiro: pasta registrada, mudo",
    "cwd": "<FORA>/gama/src",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: pasta antiga registrada",
    "cwd": "<ANTIGO>/alfa/x",
    "ponteiro": true,
    "esperado": "Aviso InToca: esta pasta não é a de nenhum projeto da sede, o projeto alfa.exemplo.br migrou para <SEDE>/alfa. Para trabalho de projeto, o chat assume o cargo na pasta do projeto."
  },
  {
    "nome": "ponteiro: pasta que não é de nenhuma Toca",
    "cwd": "<FORA>/solto",
    "ponteiro": true,
    "esperado": "Aviso InToca: este chat não faz parte de nenhuma Toca da sede sede-teste. Se for trabalho de um projeto, abra o chat na pasta dele."
  },
  {
    "nome": "ponteiro: a pasta pessoal, mudo",
    "cwd": "<CASA>",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: pasta que contém a pessoal, mudo",
    "cwd": "<RAIZ>",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: pasta-mãe de pasta registrada, mudo",
    "cwd": "<FORA>",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: pasta temporária do sistema, mudo",
    "cwd": "<TMPSIS>",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: dentro da pasta temporária do sistema, mudo",
    "cwd": "<TMPSIS>/avulso",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: worktree de cartão de repositório alheio, mudo",
    "cwd": "<FORA>/alheio/.claude/worktrees/cartao",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: worktree em _worktrees de repositório alheio, mudo",
    "cwd": "<FORA>/alheio2/_worktrees/cartao",
    "ponteiro": true,
    "esperado": null
  },
  {
    "nome": "ponteiro: atalho para pasta registrada (caminho real igual), mudo",
    "cwd": "<FORA>/atalho",
    "ponteiro": true,
    "atalho": {
      "de": "<FORA>/atalho",
      "para": "<FORA>/gama"
    },
    "esperado": null
  },
  {
    "nome": "ponteiro: atalho para pasta que não é de nenhuma Toca",
    "cwd": "<FORA>/atalho2",
    "ponteiro": true,
    "atalho": {
      "de": "<FORA>/atalho2",
      "para": "<FORA>/solto"
    },
    "esperado": "Aviso InToca: este chat não faz parte de nenhuma Toca da sede sede-teste. Se for trabalho de um projeto, abra o chat na pasta dele."
  }
]
