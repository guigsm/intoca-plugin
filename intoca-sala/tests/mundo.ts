// A sede de mentira dos testes. O ambiente de teste do motor não tem disco, então a sede vive em memória:
// um mapa de caminho → texto. Tudo fictício (projetos, siglas, pessoas); nenhum dado real.
import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Leitura, Porta } from '../hooks/sede'

export type Arquivos = Record<string, string>

export const SEDE = '/sede-teste'

export const MANIFESTO = `# sede de mentira
versao: 1
sede:
  nome: sede-teste
  modo: agregadora
projetos:
  - nome: alfa.exemplo.br
    sigla: ALF
    tipo: site
    pasta_atual: '/sede-teste/alfa'
    pastas_antigas: ['/antigo/alfa']     # migrou
    observacoes: >-
      texto dobrado que o leitor ignora
      e que não deve virar campo
  - nome: beta
    sigla: BET
    pasta_atual: "/sede-teste/beta"
  - {nome: gama, sigla: GAM, pasta_atual: '/fora/gama'}
  - nome: localhost
    sigla: LOC
    pasta_atual: '/sede-teste/_infra/local'
  - nome: sem-fila
    sigla: SEM
    pasta_atual: '/sede-teste/sem-fila'
  - {nome: candidato-x, status: candidato, pasta_atual: '/sede-teste/cand'}

ferramentas:
  - nome: nada-disso-conta
`

export const FILA_DIRETORIA = `# Fila da Diretoria

## Lote 1

| OS | Tema | Nível | Modelo · esforço | Estado |
| --- | --- | --- | --- | --- |
| DIR-02 | Regimento | N3 | Sonnet 5.5 · high | concluída e aceita em 2026-10-12 |
| DIR-27 | Pasta de segredos | N2 | Sonnet 5.5 · medium | escrita; aguarda "vai" |
| DIR-30 | Estado do backup | N2 | Sonnet 5.5 · medium | em execução desde 2026-10-27 |

## Congelado

- Pasta antiga do app (chat de publicação, branch de teste).
- Motor de publicação (correção em andamento),
  com continuação na linha seguinte.
- Painel antigo e scripts: continuam rodando.

Texto solto: a entrega aguarda integração pela Diretoria.
`

export const FILA_ALFA = `# Fila do projeto alfa

## Ocupação de recursos

| Recurso | Chat dono agora | Estado |
| --- | --- | --- |
| Pasta do projeto | livre | sem alteração |
| \`alfa/hooks/\` | **Executor · ALF-14** (reservado em 2026-10-27) | 6 hooks |
| \`alfa/tests/\` | Executor · ALF-14 | rodada longa |

## Ordens de serviço

| OS | Tema | Nível | Modelo · esforço | Recurso | Estado |
| --- | --- | --- | --- | --- | --- |
| ALF-01 | Contratação | N2 | Sonnet 5.5 · high | carta | concluída e aceita em 2026-10-13 |
| ALF-14 | Rigor de permissões | **N4** | Opus 5.5 · high | \`hooks/\` | OS escrita; "vai" dado em 2026-10-25; cartão por spawn_task |
| ALF-15 | Acertos do aviso | N2 | Sonnet 5.5 · medium | hooks | aguarda o "vai" do proprietário |
| ALF-16 | Entrega pronta | N3 | Sonnet 5.5 · high | docs | entregue em 2026-10-26; falta integrar |
| ALF-17 | Lote 0.5.0 | N3 | Sonnet 5.5 · high | skills | entregue em 2026-10-21, integrada na main em 2026-10-25 |
| ALF-18 | A escrever | N2 | Haiku 5.5 · low | docs | a escrever |
| ALF-01 | Repetida | N2 | Sonnet 5.5 · high | carta | a escrever (linha repetida: vale a primeira) |
| sem id aqui | Linha malformada | N1 | x | y | z |
| ALF-19 \\| com barra | Tema com barra | N2 | Sonnet 5.5 · medium | docs | aguarda integração |
`

export const PENDENCIAS = `# Pendências do proprietário

Texto de abertura.

## Abertas

| # | Pedido | Onde | Estado |
| --- | --- | --- | --- |
| 39 | Criar a conta do fornecedor de exemplo | Gerente · Exemplo | aberto |
| 40 | Revisar a pasta compartilhada de exemplo | Gerente · Modelo | aberto |
| 15 | Decidir o experimento externo | Diretoria | vencido; a Diretoria traz a pesquisa |
| 12 | Já feita mas ainda na tabela | App | feito 2026-10-27 |

## Com a Diretoria (não depende do proprietário)

- Isto não é pendência do proprietário.

## Feitas

| # | Pedido | Estado |
| --- | --- | --- |
| 1 | Abrir o primeiro gerente | feito |
`

/** A sede completa de mentira, em `/sede-teste`. */
export function sedeDeMentira(extra: Arquivos = {}): Arquivos {
  return {
    [`${SEDE}/sede.yaml`]: MANIFESTO,
    [`${SEDE}/diretoria/fila.md`]: FILA_DIRETORIA,
    [`${SEDE}/diretoria/pendencias-do-proprietario.md`]: PENDENCIAS,
    [`${SEDE}/alfa/ops/fila.md`]: FILA_ALFA,
    [`${SEDE}/_infra/local/ops/fila.md`]: '',
    // Candidato do manifesto: a fila existe, mas o mod não a lê.
    [`${SEDE}/cand/ops/fila.md`]: FILA_ALFA,
    ...extra,
  }
}

const existeNoMapa = (arquivos: Arquivos, caminho: string): boolean =>
  caminho in arquivos || Object.keys(arquivos).some(k => k.startsWith(`${caminho}/`))

/** A porta do mod sobre um mapa de arquivos, sem motor: para os testes dos módulos puros. */
export function portaDe(arquivos: Arquivos, env: Record<string, string> = {}, limite = 1024 * 1024, http?: (url: string) => Promise<string | null>): Porta {
  return {
    ...(http ? { http } : {}),
    ler: async (caminho): Promise<Leitura> => {
      const texto = arquivos[caminho]
      if (texto === undefined) return { erro: 'ausente' }
      return texto.length > limite ? { erro: 'grande' } : { texto }
    },
    existe: async caminho => existeNoMapa(arquivos, caminho),
    ambiente: async () => ({ INTOCA_SEDE: env.INTOCA_SEDE, INTOCA_HOME: env.INTOCA_HOME, HOME: env.HOME, USERPROFILE: env.USERPROFILE }),
  }
}

// O motor entrega o caminho já resolvido para a máquina que roda o teste (`/x` chega como `D:\x` no Windows):
// a chave do mapa e o caminho pedido se comparam sem a unidade de disco e com barras `/`.
const semUnidade = (caminho: string): string => caminho.replace(/^[A-Za-z]:/, '').split('\\').join('/')

/**
 * Os mesmos arquivos debaixo do motor: `$.fs.read`, `$.fs.exists` e `$.env.get` respondem do mapa.
 * `falhar` faz a leitura de certos caminhos rejeitar, como um arquivo sem permissão.
 */
export function instalarMundo(on: On, arquivos: Arquivos, env: Record<string, string> = {}, falhar?: (caminho: string) => boolean): void {
  on('fs.read', (_, e) => {
    const c = semUnidade(e.path)
    const texto = arquivos[c]
    return texto === undefined || falhar?.(c) ? { deny: 'ENOENT' } : { value: texto }
  })
  on('fs.exists', (_, e) => ({ value: existeNoMapa(arquivos, semUnidade(e.path)) }))
  mock.env(on, env)
}
