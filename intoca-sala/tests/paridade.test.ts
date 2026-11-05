// Paridade: a porta mínima do mod (`hooks/regras.ts`) tem de dar a MESMA resposta que os hooks reais do plugin
// `intoca` (`chat-trocado.mjs` e `pasta-errada.mjs`) para os mesmos casos. Os casos e as respostas dos hooks vêm
// de `paridade/casos.ts`, gerado por `paridade/gerar.mjs` rodando os hooks de verdade sobre uma sede de mentira.
import { expect, test } from 'claude-code/testing'
import { interpretarManifesto } from '../hooks/manifesto'
import { avisoDaPasta, avisoDeChatTrocado, contextoDeRegra, type EstadoDeAviso } from '../hooks/regras'
import { resolverSede } from '../hooks/sede'
import { portaDe } from './mundo'
import { CASOS_CHAT, CASOS_PASTA, MANIFESTO_PARIDADE } from './paridade/casos'

const LUGARES = {
  '<SEDE>': '/r/sede-teste',
  '<FORA>': '/r/fora',
  '<ANTIGO>': '/r/antigo',
  '<CASA>': '/r/casa',
  '<RAIZ>': '/r',
  '<TMPSIS>': '/r/tmp-sistema',
} as const

const real = (texto: string): string => Object.entries(LUGARES).reduce((t, [k, v]) => t.split(k).join(v), texto)
const sigla = (texto: string): string =>
  Object.entries(LUGARES)
    .sort((a, b) => b[1].length - a[1].length)
    .reduce((t, [k, v]) => t.split(v).join(k), texto)

const MANIFESTO = real(MANIFESTO_PARIDADE)

test('a base de casos veio dos hooks de verdade (não está vazia nem é só silêncio)', () => {
  expect(CASOS_CHAT.length).toBeGreaterThan(40)
  expect(CASOS_PASTA.length).toBeGreaterThan(15)
  const avisos = CASOS_CHAT.flatMap(c => c.esperado).filter(x => x !== null)
  expect(avisos.length).toBeGreaterThan(20)
  expect(avisos.every(x => x?.startsWith('Aviso InToca: '))).toBe(true)
  const pastas = CASOS_PASTA.map(c => c.esperado).filter(x => x !== null)
  expect(pastas.length).toBeGreaterThan(4)
  // As três saídas silenciosas do aviso "sem Toca" (PLG-03b) estão na base: pasta-mãe, ruído e caminho real.
  const nomes = CASOS_PASTA.map(c => c.nome).join(' | ')
  expect(nomes).toMatch(/pasta-mãe/)
  expect(nomes).toMatch(/temporária do sistema/)
  expect(nomes).toMatch(/worktree/)
  expect(CASOS_PASTA.some(c => c.atalho && c.esperado === null)).toBe(true)
  expect(CASOS_PASTA.some(c => c.atalho && c.esperado !== null)).toBe(true)
})

test('chat trocado: a porta do mod responde como o hook, caso a caso (sequências com estado)', () => {
  const manifesto = interpretarManifesto(MANIFESTO)
  const divergencias: string[] = []
  for (const c of CASOS_CHAT) {
    const { ctx, siglas } = contextoDeRegra(manifesto, LUGARES['<SEDE>'], real(c.cwd))
    const estado: EstadoDeAviso = { avisou: false, insistiu: false }
    c.passos.forEach((passo, i) => {
      const obtido = avisoDeChatTrocado(ctx, { prompt: real(passo), titulo: c.titulo }, estado, siglas)
      const texto = obtido === undefined ? null : sigla(obtido)
      if (texto !== c.esperado[i]) divergencias.push(`${c.nome} [passo ${i + 1}]\n  hook: ${c.esperado[i]}\n  mod:  ${texto}`)
    })
  }
  expect(divergencias).toEqual([])
})

test('pasta errada e pasta sem Toca: a porta do mod responde como o hook, caso a caso', async () => {
  const divergencias: string[] = []
  for (const c of CASOS_PASTA) {
    const arquivos = {
      [`${LUGARES['<SEDE>']}/sede.yaml`]: MANIFESTO,
      [`${LUGARES['<CASA>']}/.intoca/sede`]: `${LUGARES['<SEDE>']}\n`,
    }
    const env: Record<string, string> = c.ponteiro
      ? { INTOCA_HOME: LUGARES['<CASA>'] }
      : { INTOCA_SEDE: LUGARES['<SEDE>'], INTOCA_HOME: '/r/sem-casa' }
    const cwd = real(c.cwd)
    const res = await resolverSede(portaDe(arquivos, env), cwd)
    // O disco de mentira só conhece os atalhos do caso: o caminho real de `de` é `para`; o resto não existe.
    const atalho = c.atalho
    const resolver = async (caminho: string): Promise<string | null> => (atalho && caminho === real(atalho.de) ? real(atalho.para) : null)
    const temp = { TEMP: LUGARES['<TMPSIS>'], TMP: LUGARES['<TMPSIS>'], TMPDIR: LUGARES['<TMPSIS>'] }
    const obtido = res ? await avisoDaPasta(res, cwd, { casa: env.INTOCA_HOME, temp, real: resolver }) : undefined
    const texto = obtido === undefined ? null : sigla(obtido)
    if (texto !== c.esperado) divergencias.push(`${c.nome}\n  hook: ${c.esperado}\n  mod:  ${texto}`)
  }
  expect(divergencias).toEqual([])
})
