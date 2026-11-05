import { expect, test } from 'claude-code/testing'
import { absoluto, canon, dentroDe, ehRaiz, juntar, nomeDe, pai, relativo } from '../hooks/caminhos'
import { cwdEmPastaRegistrada, resolverSede } from '../hooks/sede'
import { interpretarManifesto } from '../hooks/manifesto'
import { MANIFESTO, SEDE, portaDe, sedeDeMentira } from './mundo'

const comPonteiro = (conteudo: string, extra: Record<string, string> = {}) =>
  sedeDeMentira({ '/casa/.intoca/sede': conteudo, ...extra })

test('achar a sede, origem 1: sede.yaml subindo do cwd (e da worktree da sede, que aponta a raiz viva)', async () => {
  const mundo = sedeDeMentira({ [`${SEDE}/.claude/worktrees/cartao/sede.yaml`]: MANIFESTO })
  const dentro = await resolverSede(portaDe(mundo), `${SEDE}/alfa/src/fundo`)
  expect(dentro).toMatchObject({ sede: SEDE, local: SEDE, origem: 'cwd', passivo: true })
  expect(dentro?.manifesto?.projetos).toHaveLength(6)

  const wt = await resolverSede(portaDe(mundo), `${SEDE}/.claude/worktrees/cartao/plugin`)
  expect(wt).toMatchObject({ sede: SEDE, local: `${SEDE}/.claude/worktrees/cartao`, origem: 'cwd', passivo: true })
})

test('achar a sede, origem 2: INTOCA_SEDE vale em qualquer pasta; sem sede.yaml lá, é ignorada', async () => {
  const porta = portaDe(sedeDeMentira(), { INTOCA_SEDE: SEDE })
  expect(await resolverSede(porta, '/qualquer/lugar')).toMatchObject({ sede: SEDE, origem: 'env', passivo: true })
  const vazia = portaDe(sedeDeMentira(), { INTOCA_SEDE: '/sem/manifesto' })
  expect(await resolverSede(vazia, '/qualquer/lugar')).toBeNull()
})

test('achar a sede, origem 3: o ponteiro só vale em pasta registrada no manifesto', async () => {
  const porta = portaDe(comPonteiro(`${SEDE}\n`), { INTOCA_HOME: '/casa' })
  const fora = await resolverSede(porta, '/pasta/solta')
  expect(fora).toMatchObject({ sede: SEDE, origem: 'ponteiro', passivo: false })

  // pasta_atual, pasta_futura e pastas_antigas contam; subpasta também.
  for (const cwd of ['/fora/gama', '/fora/gama/fundo/mais', '/antigo/alfa/x']) {
    expect((await resolverSede(porta, cwd))?.passivo).toBe(true)
  }
  expect((await resolverSede(porta, '/fora/gamaX'))?.passivo).toBe(false)

  // INTOCA_SEDE vale mais que o ponteiro; USERPROFILE e HOME servem de casa quando INTOCA_HOME falta.
  const ambos = portaDe(comPonteiro('/outra\n'), { INTOCA_HOME: '/casa', INTOCA_SEDE: SEDE })
  expect((await resolverSede(ambos, '/pasta/solta'))?.origem).toBe('env')
  expect((await resolverSede(portaDe(comPonteiro(SEDE), { USERPROFILE: '/casa' }), '/pasta/solta'))?.origem).toBe('ponteiro')
  expect((await resolverSede(portaDe(comPonteiro(SEDE), { HOME: '/casa' }), '/pasta/solta'))?.origem).toBe('ponteiro')
})

test('ponteiro inválido é ignorado em silêncio: relativo, de rede, sem sede.yaml, vazio, grande, sem casa', async () => {
  for (const conteudo of ['sede-teste', '//srv/sede', '\\\\srv\\sede', '/nao/existe', '', '\n\n', `${SEDE}\u0000`, `${'x'.repeat(5000)}`]) {
    const porta = portaDe(comPonteiro(conteudo), { INTOCA_HOME: '/casa' })
    expect(await resolverSede(porta, '/pasta/solta')).toBeNull()
  }
  expect(await resolverSede(portaDe(comPonteiro(SEDE), {}), '/pasta/solta')).toBeNull()
  expect(await resolverSede(portaDe(comPonteiro(SEDE), { INTOCA_HOME: 'relativa' }), '/pasta/solta')).toBeNull()
})

test('sem sede, ou cwd inútil: null, nunca exceção', async () => {
  const vazio = portaDe({})
  expect(await resolverSede(vazio, '/qualquer')).toBeNull()
  expect(await resolverSede(portaDe(sedeDeMentira()), 'relativo/sem/raiz')).toBeNull()
  expect(await resolverSede(portaDe(sedeDeMentira()), '')).toBeNull()
  const quebrada = { ler: async () => { throw new Error('x') }, existe: async () => { throw new Error('y') }, ambiente: async () => ({}) }
  expect(await resolverSede(quebrada, '/qualquer')).toBeNull()
})

test('manifesto ilegível: origem cwd/env ainda é passiva; pelo ponteiro, não', async () => {
  const sem = { [`${SEDE}/sede.yaml`]: 'versao: 1\n' }
  expect(await resolverSede(portaDe(sem), `${SEDE}/x`)).toMatchObject({ origem: 'cwd', manifesto: null, passivo: true })
  const ponteiro = portaDe({ ...sem, '/casa/.intoca/sede': SEDE }, { INTOCA_HOME: '/casa' })
  expect(await resolverSede(ponteiro, '/fora')).toMatchObject({ origem: 'ponteiro', manifesto: null, passivo: false })
})

test('estilo Windows: letra de unidade, barra invertida, caixa indiferente', async () => {
  const win = {
    'D:\\SedeTeste\\sede.yaml': MANIFESTO.replace(/'\/sede-teste\/alfa'/, "'D:\\SedeTeste\\Alfa'"),
    'D:\\Users\\Pessoa\\.intoca\\sede': 'D:\\SedeTeste\r\n',
  }
  const dentro = await resolverSede(portaDe(win), 'D:\\SedeTeste\\alfa\\src')
  expect(dentro).toMatchObject({ sede: 'D:\\SedeTeste', origem: 'cwd', passivo: true })
  const ponteiro = portaDe(win, { USERPROFILE: 'D:\\Users\\Pessoa' })
  const registrada = await resolverSede(ponteiro, 'd:\\outro\\lugar')
  expect(registrada).toMatchObject({ sede: 'D:\\SedeTeste', origem: 'ponteiro', passivo: false })
  expect(cwdEmPastaRegistrada('d:\\sedeteste\\ALFA\\x', registrada?.manifesto ?? null)).toBe(true)
})

test('caminhos: absoluto, canônico, dentro de, juntar, pai, relativo', () => {
  expect(absoluto('/a')).toBe(true)
  expect(absoluto('D:\\a')).toBe(true)
  expect(absoluto('d:/a')).toBe(true)
  for (const ruim of ['a/b', '//srv/x', '\\\\srv\\x', 'D:', 'D:a', '', 42, null, '/a\u0000']) expect(absoluto(ruim)).toBe(false)

  expect(canon('D:\\A\\b\\..\\C\\.\\')).toBe('d:/a/c')
  expect(canon('/A/b/../C/')).toBe('/A/C')
  expect(dentroDe('/a/b', '/a/b/c')).toBe(true)
  expect(dentroDe('/a/b', '/a/b')).toBe(false)
  expect(dentroDe('/a/b', '/a/b', true)).toBe(true)
  expect(dentroDe('/a/b', '/a/bc')).toBe(false)
  expect(dentroDe('D:\\A', 'd:\\a\\x')).toBe(true)
  expect(dentroDe('/', '/x')).toBe(true)

  expect(juntar('D:\\Sede', 'diretoria', 'fila.md')).toBe('D:\\Sede\\diretoria\\fila.md')
  expect(juntar('/sede/', '/diretoria/', 'fila.md')).toBe('/sede/diretoria/fila.md')
  expect(juntar('/', 'x')).toBe('/x')
  expect(pai('/a/b/c')).toBe('/a/b')
  expect(pai('/a')).toBe('/')
  expect(pai('/')).toBe('/')
  expect(pai('D:\\a')).toBe('D:\\')
  expect(pai('D:\\')).toBe('D:\\')
  expect(nomeDe('D:\\sede\\alfa\\')).toBe('alfa')
  expect(ehRaiz('/')).toBe(true)
  expect(ehRaiz('D:\\')).toBe(true)
  expect(ehRaiz('/a')).toBe(false)
  expect(relativo('/a', '/a/b/c')).toEqual(['b', 'c'])
  expect(relativo('/a', '/x/y')).toEqual([])
})

test('pasta registrada: só pasta absoluta do manifesto conta', () => {
  const m = interpretarManifesto(MANIFESTO)
  expect(cwdEmPastaRegistrada('/sede-teste/alfa/src', m)).toBe(true)
  expect(cwdEmPastaRegistrada('/sede-teste', m)).toBe(false)
  expect(cwdEmPastaRegistrada('/sede-teste/alfa', null)).toBe(false)
})
