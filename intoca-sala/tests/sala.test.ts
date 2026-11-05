import { expect, test } from 'claude-code/testing'
import { blocosDoPainel, hora } from '../hooks/desenho'
import { carregarPainel, cargoDoTitulo, osDoPrompt, textoDaFaixa, textoDoStatus } from '../hooks/sala'
import { resolverSede } from '../hooks/sede'
import { SEDE, portaDe, sedeDeMentira } from './mundo'

const relogio = (inicio = 1000, passo = 42) => {
  let t = inicio - passo
  return async () => (t += passo)
}

async function painelDeMentira(arquivos = sedeDeMentira(), limite?: number) {
  const porta = portaDe(arquivos, {}, limite)
  const res = await resolverSede(porta, `${SEDE}/alfa`)
  if (!res) throw new Error('sede de mentira não achada')
  return carregarPainel(porta, res, relogio())
}

test('carregar o painel: Diretoria primeiro, depois os projetos; sem fila é "sem dados"; custo medido', async () => {
  const p = await painelDeMentira()
  expect(p.sede).toBe(SEDE)
  expect(p.origem).toBe('cwd')
  expect(p.manifestoLido).toBe(true)
  expect(p.custoMs).toBe(42)
  expect(p.atualizadoEm).toBe(1042)
  expect(p.filas.map(f => f.projeto)).toEqual(['Diretoria', 'alfa.exemplo.br', 'beta', 'gama', 'localhost', 'sem-fila'])

  const porNome = Object.fromEntries(p.filas.map(f => [f.projeto, f]))
  expect(porNome['Diretoria']).toMatchObject({ lida: true, sigla: 'DIR' })
  expect(porNome['alfa.exemplo.br']?.os).toHaveLength(7)
  // Arquivo ausente: o bloco diz "sem dados" e o resto segue. Arquivo vazio: lido, sem itens.
  expect(porNome['beta']).toMatchObject({ lida: false, motivo: 'arquivo ausente ou ilegível', os: [] })
  expect(porNome['gama']?.lida).toBe(false)
  expect(porNome['localhost']).toMatchObject({ lida: true, os: [] })

  expect(p.pendencias.lida).toBe(true)
  expect(p.pendencias.abertas).toHaveLength(3)
})

test('carregar o painel: arquivo grande demais, pendências ausentes e manifesto ilegível', async () => {
  // A fila de um projeto com mais de 1 MB não é lida (limite de leitura do mod).
  const enorme = sedeDeMentira({ [`${SEDE}/alfa/ops/fila.md`]: ' '.repeat(1024 * 1024 + 1) })
  const grande = await painelDeMentira(enorme)
  const alfa = grande.filas.find(f => f.sigla === 'ALF')
  expect(alfa).toMatchObject({ lida: false, motivo: 'arquivo grande demais' })

  const mundo = sedeDeMentira()
  delete mundo[`${SEDE}/diretoria/pendencias-do-proprietario.md`]
  mundo[`${SEDE}/sede.yaml`] = 'versao: 1\n'
  const sem = await painelDeMentira(mundo)
  expect(sem.manifestoLido).toBe(false)
  expect(sem.filas.map(f => f.projeto)).toEqual(['Diretoria'])
  expect(sem.pendencias).toMatchObject({ lida: false, motivo: 'arquivo ausente ou ilegível', abertas: [] })
})

test('o painel em blocos de texto: pendências, OS, avisos, recursos, este chat e a leitura', async () => {
  const p = await painelDeMentira()
  const blocos = blocosDoPainel(p, { cargo: 'Executor', os: 'ALF-14' })
  const por = (inicio: string) => blocos.find(b => b.titulo.startsWith(inicio))
  expect(por('Pendências')?.titulo).toBe('Pendências do proprietário (3)')
  expect(por('Pendências')?.linhas[0]).toBe('39 · Criar a conta do fornecedor de exemplo [Gerente · Exemplo]')

  // Em andamento: DIR-30, ALF-14 (andamento) e ALF-16, ALF-19 (aguardam integração).
  expect(por('OS em andamento')?.titulo).toBe('OS em andamento (4)')
  expect(por('OS em andamento')?.linhas.some(l => l.startsWith('ALF-14 · alfa.exemplo.br · Opus 5.5 · high'))).toBe(true)

  // Avisos: DIR-27 e ALF-15 aguardam o vai; ALF-16, ALF-19 e a linha em prosa da Diretoria aguardam integração.
  expect(por('Avisos')?.titulo).toBe('Avisos (5)')
  expect(por('Avisos')?.linhas.some(l => l.includes('aguarda o vai') && l.includes('ALF-15'))).toBe(true)

  // Três congelados da Diretoria e dois recursos ocupados do alfa.
  expect(por('Recursos ocupados')?.titulo).toBe('Recursos ocupados (5)')
  expect(por('Este chat')?.linhas).toEqual(['Executor · ALF-14 · hooks/'])

  const leitura = por('Leitura')?.linhas ?? []
  expect(leitura).toContain('sem fila legível em ops/fila.md (3): beta, gama, sem-fila')
  expect(leitura).toContain('alfa.exemplo.br: 1 linha(s) de OS sem ID ignorada(s)')
})

test('o título do chat dá o cargo e a OS; o prompt do executor é a reserva', () => {
  expect(cargoDoTitulo('Executor · PLG-19 mod intoca-sala')).toEqual({ cargo: 'Executor', os: 'PLG-19' })
  expect(cargoDoTitulo('Executor · DIR-10b')).toEqual({ cargo: 'Executor', os: 'DIR-10b' })
  expect(cargoDoTitulo('Gerente · Plugin')).toEqual({ cargo: 'Gerente', os: null })
  expect(cargoDoTitulo('Diretoria')).toEqual({ cargo: 'Diretoria', os: null })
  expect(cargoDoTitulo('Secretaria · pendências')).toEqual({ cargo: 'Secretaria', os: null })
  expect(cargoDoTitulo('Plantão · Deploy · Alfa')).toEqual({ cargo: 'Plantão', os: null })
  for (const t of ['Executor · sem id', 'Executor', 'Conversa qualquer', '', undefined, 42, null]) {
    expect(cargoDoTitulo(t)).toEqual({ cargo: null, os: null })
  }
  expect(osDoPrompt('Execute a OS `/qualquer/ops/os/ALF-14-rigor.md` agora')).toBe('ALF-14')
  expect(osDoPrompt('Executar os\\DIR-27-segredos.md')).toBe('DIR-27')
  expect(osDoPrompt('Leia o arquivo /x/os/ALF-14-rigor.md')).toBeNull()
  expect(osDoPrompt('oi')).toBeNull()
  expect(osDoPrompt(undefined)).toBeNull()
})

test('linha de status: ID · recurso quando a fila diz, só o ID sem recurso, nada sem OS', async () => {
  const p = await painelDeMentira()
  expect(textoDoStatus({ cargo: 'Executor', os: 'ALF-14' }, p)).toBe('ALF-14 · hooks/')
  expect(textoDoStatus({ cargo: 'Executor', os: 'alf-14' }, p)).toBe('alf-14 · hooks/')
  expect(textoDoStatus({ cargo: 'Executor', os: 'ALF-01' }, p)).toBe('ALF-01 · carta')
  expect(textoDoStatus({ cargo: 'Executor', os: 'ZZZ-99' }, p)).toBe('ZZZ-99')
  expect(textoDoStatus({ cargo: 'Executor', os: 'ALF-14' }, null)).toBe('ALF-14')
  expect(textoDoStatus({ cargo: 'Gerente', os: null }, p)).toBeUndefined()
  expect(textoDoStatus(null, p)).toBeUndefined()
})

test('faixa: conta as abertas, singular e plural, e some com zero ou sem leitura', async () => {
  const p = await painelDeMentira()
  expect(textoDaFaixa(p)).toBe('3 pendências do proprietário abertas')
  const uma = { ...p, pendencias: { lida: true, abertas: p.pendencias.abertas.slice(0, 1) } }
  expect(textoDaFaixa(uma)).toBe('1 pendência do proprietário aberta')
  expect(textoDaFaixa({ ...p, pendencias: { lida: true, abertas: [] } })).toBeUndefined()
  expect(textoDaFaixa({ ...p, pendencias: { lida: false, abertas: [] } })).toBeUndefined()
  expect(textoDaFaixa(null)).toBeUndefined()
})

test('hora: HH:MM de um instante válido; vazio quando a data não existe', () => {
  expect(hora(1_700_000_000_000)).toMatch(/^\d\d:\d\d$/)
  expect(hora(Number.NaN)).toBe('')
})
