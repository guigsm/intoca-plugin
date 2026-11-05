import { expect, test } from 'claude-code/testing'
import { lerDaSala, pendenciasDaApi, portaDaSala, tocasDaApi } from '../hooks/api'
import { carregarPainel } from '../hooks/sala'
import { resolverSede } from '../hooks/sede'
import { SEDE, portaDe, sedeDeMentira } from './mundo'

const CASA = '/casa-teste'
const SALA_JSON = JSON.stringify({ classica: { porta: 8090, pid: 1, iniciou_em: 'x' }, controle: false })
const API = {
  '/api/pendencias': JSON.stringify({
    sede: true,
    total: 2,
    fontes: [
      { origem: 'sede', arquivo: 'diretoria/fila.md', lida: true, abertas: [{ numero: '7', pedido: 'Subir o arquivo', onde: '', estado: 'aberto' }] },
      { origem: 'alfa', arquivo: 'ops/fila.md', lida: true, abertas: [{ numero: '', pedido: 'Dar o vai', onde: 'Gerente · Alfa', estado: '' }] },
      { origem: 'beta', arquivo: 'ops/fila.md', lida: false, motivo: 'fora do formato', abertas: [] },
    ],
  }),
  '/api/tocas': JSON.stringify({ sede: true, lista: [{ state: 'running' }, { state: 'stopped' }, { state: 'running' }] }),
}

const httpDe = (visto: string[], tabela: Record<string, string> = API) => async (url: string) => {
  visto.push(url)
  const caminho = url.replace(/^http:\/\/127\.0\.0\.1:\d+/, '')
  return tabela[caminho] ?? null
}

test('a porta vem de sala.json; ausente, lixo ou fora da faixa dá null', async () => {
  const com = (t: string) => portaDe({ [`${CASA}/.intoca/sala.json`]: t }, { INTOCA_HOME: CASA })
  expect(await portaDaSala(com(SALA_JSON))).toBe(8090)
  expect(await portaDaSala(com('{ não é json'))).toBeNull()
  expect(await portaDaSala(com(JSON.stringify({ classica: { porta: 70000 } })))).toBeNull()
  expect(await portaDaSala(com(JSON.stringify({ animada: { porta: 8766 } })))).toBeNull()
  expect(await portaDaSala(portaDe({}, { INTOCA_HOME: CASA }))).toBeNull()
})

test('formato da API: pendências e tocas; fora do formato dá null', () => {
  const p = pendenciasDaApi(JSON.parse(API['/api/pendencias']))
  expect(p?.abertas.map(a => [a.numero, a.pedido, a.onde])).toEqual([['7', 'Subir o arquivo', 'sede'], ['', 'Dar o vai', 'Gerente · Alfa']])
  expect(pendenciasDaApi({ sede: false, fontes: [] })).toBeNull()
  expect(pendenciasDaApi('lixo')).toBeNull()
  expect(tocasDaApi(JSON.parse(API['/api/tocas']))).toEqual({ total: 3, noAr: 2 })
  expect(tocasDaApi({})).toBeNull()
})

test('sala no ar: só loopback, só as duas rotas; sala fora do ar ou sem http: null', async () => {
  const visto: string[] = []
  const arq = { [`${CASA}/.intoca/sala.json`]: SALA_JSON }
  const r = await lerDaSala(portaDe(arq, { INTOCA_HOME: CASA }, undefined, httpDe(visto)))
  expect(r?.sala).toEqual({ porta: 8090, tocas: 3, noAr: 2 })
  expect([...visto].sort()).toEqual(['http://127.0.0.1:8090/api/pendencias', 'http://127.0.0.1:8090/api/tocas'])
  expect(await lerDaSala(portaDe(arq, { INTOCA_HOME: CASA }, undefined, httpDe([], {})))).toBeNull()
  expect(await lerDaSala(portaDe(arq, { INTOCA_HOME: CASA }))).toBeNull()
})

test('painel: com a sala no ar as pendências vêm dela; sem ela, das filas como sempre', async () => {
  const arq = sedeDeMentira({ [`${CASA}/.intoca/sala.json`]: SALA_JSON })
  const env = { INTOCA_HOME: CASA }
  const carregar = async (http?: (u: string) => Promise<string | null>) => {
    const porta = portaDe(arq, env, undefined, http)
    const res = await resolverSede(porta, `${SEDE}/alfa`)
    if (!res) throw new Error('sede de mentira não achada')
    return carregarPainel(porta, res, async () => 1)
  }
  const com = await carregar(httpDe([]))
  expect(com.sala).toEqual({ porta: 8090, tocas: 3, noAr: 2 })
  expect(com.pendencias.abertas).toHaveLength(2)

  const fora = await carregar(httpDe([], {}))
  expect(fora.sala).toBeUndefined()
  expect(fora.pendencias.abertas).toHaveLength(3)
  const semHttp = await carregar()
  expect(semHttp.sala).toBeUndefined()
  expect(semHttp.pendencias.abertas).toHaveLength(3)
})

test('0.4.0: grupo fixo, ordem e a chave animada do sala.json não mudam o que o painel lê', async () => {
  const novo = JSON.stringify({
    classica: { porta: 8090, pid: 1, iniciou_em: 'x' },
    controle: true,
    ordem: ['marketing', 'producao'],
    animada: { porta: 8765, pid: 2, iniciou_em: 'x', pasta: 'C:/x', auto: true },
    animada_config: { pasta: 'C:/x', auto: true },
  })
  expect(await portaDaSala(portaDe({ [`${CASA}/.intoca/sala.json`]: novo }, { INTOCA_HOME: CASA }))).toBe(8090)
  const tocas = { sede: true, ordem: ['marketing'], grupos: [{ id: 'operacao', fixo: true, itens: [] }], lista: [{ state: 'running', ehAnimada: true }, { state: 'stopped' }] }
  expect(tocasDaApi(tocas)).toEqual({ total: 2, noAr: 1 })
})
