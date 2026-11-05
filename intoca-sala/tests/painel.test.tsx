import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'
import { SEDE, instalarMundo, sedeDeMentira, type Arquivos } from './mundo'

const SUPERFICIES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const FAIXAS = ['terminal', 'desktop'] as const

const PANE = {
  plugin: 'intoca-sala',
  component: 'Pane',
  requestId: 'sala',
  props: { title: 'InToca Sala', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const BAND = {
  plugin: 'intoca-sala',
  component: 'AbovePrompt',
  requestId: 'faixa',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

type Sessao = {
  status: (string | undefined)[]
  toasts: string[]
  opens: string[]
  writes: string[]
  relogio: ReturnType<typeof mock.clock>
  arquivos: Arquivos
  /** A pasta viva do chat, como `$.session.cwd()` a responde; muda com `change_directory`. */
  cwd: string
}

/** Monta o mundo debaixo do mod: sede de mentira, relógio parado, e o que o motor faria com status, toast e painel. */
function mundo(
  $: Engine,
  on: On,
  opcoes: { arquivos?: Arquivos; env?: Record<string, string>; placed?: boolean; falhar?: (caminho: string) => boolean } = {},
): Sessao {
  void $
  const arquivos = opcoes.arquivos ?? sedeDeMentira()
  const s: Sessao = { status: [], toasts: [], opens: [], writes: [], relogio: mock.clock(on, { now: 1_700_000_000_000 }), arquivos, cwd: '' }
  instalarMundo(on, arquivos, opcoes.env ?? {}, opcoes.falhar)
  on('fs.write', (_, e) => {
    s.writes.push(e.path)
    return { deny: 'somente leitura' }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    s.opens.push(e.id)
    return { value: opcoes.placed === false ? { isPlaced: false as const, reason: 'janela estreita' } : { isPlaced: true as const } }
  })
  on('ui.status', (_, e) => {
    s.status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    s.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: s.cwd }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  return s
}

/** Digita `/<comando>` como a pessoa: o motor põe a origem e a apresentação. */
const rodar = ($: Engine, command: string) =>
  $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } })

async function iniciar($: Engine, cwd: string): Promise<void> {
  await $.session.start({ cwd, surface: 'desktop', isInteractive: true })
}


test('o painel mostra pendências, OS, avisos e recursos, em toda superfície', async ($, on) => {
  mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^InToca Sala · sede-teste$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (3)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^39 · Criar a conta do fornecedor/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'OS em andamento (4)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ALF-14 · alfa\.exemplo\.br · Opus 5\.5 · high/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Avisos (5)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Recursos ocupados (5)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^sem fila legível em ops\/fila\.md \(3\): beta, gama, sem-fila/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /lida às \d\d:\d\d em \d+ ms · só leitura/ })).toBeDefined()
    await ui.unmount()
  }
})

test('o botão Atualizar lê as filas de novo', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (3)' })).toBeDefined()

  s.arquivos[`${SEDE}/diretoria/pendencias-do-proprietario.md`] = '## Abertas\n\n| # | Pedido | Estado |\n| --- | --- | --- |\n| 1 | Única | aberto |\n'
  await ui.press({ key: 'atualizar' })
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (1)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (3)' })).toBeUndefined()
  await ui.unmount()
})

test('a cada minuto o painel lê de novo; antes disso, mostra o que tinha', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  s.arquivos[`${SEDE}/diretoria/pendencias-do-proprietario.md`] = '## Abertas\n\n| # | Pedido | Estado |\n| --- | --- | --- |\n| 1 | A | aberto |\n| 2 | B | aberto |\n'
  await s.relogio.advance(59_000)
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (3)' })).toBeDefined()
  await s.relogio.advance(1_000)
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (2)' })).toBeDefined()
  await ui.unmount()
})

test('a faixa mostra a contagem de pendências abertas e some com zero', async ($, on) => {
  const s = mundo($, on)
  // Nada de faixa: o motor desenha a sua (aqui, uma palavra).
  on('ui.render', ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine</Text>
  })
  await iniciar($, `${SEDE}/alfa`)
  for (const surface of FAIXAS) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /pendências do proprietário abertas/ }))?.text).toBe('3 pendências do proprietário abertas · /pendencias ')
    expect(await ui.find({ type: 'Button', key: 'ver' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeUndefined()
    await ui.unmount()
  }

  // Singular.
  s.arquivos[`${SEDE}/diretoria/pendencias-do-proprietario.md`] = '## Abertas\n\n| # | Pedido | Estado |\n| --- | --- | --- |\n| 1 | A | aberto |\n'
  await s.relogio.advance(60_000)
  const uma = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await uma.find({ type: 'Text', text: /pendência do proprietário/ }))?.text).toBe('1 pendência do proprietário aberta · /pendencias ')
  await uma.unmount()

  // Zero abertas: a faixa some e fica o que o motor desenha.
  s.arquivos[`${SEDE}/diretoria/pendencias-do-proprietario.md`] = '## Abertas\n\n| # | Pedido | Estado |\n| --- | --- | --- |\n| 1 | A | feito |\n'
  await s.relogio.advance(60_000)
  for (const surface of FAIXAS) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /pendência/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    await ui.unmount()
  }
})

test('a faixa cede a vez a uma pesquisa de satisfação', async ($, on) => {
  mundo($, on)
  on('ui.render', ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine</Text>
  })
  await iniciar($, `${SEDE}/alfa`)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('/pendencias lista as abertas em texto e abre o painel; /sala só abre', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  const antes = s.opens.length
  const r = await rodar($, 'pendencias')
  expect(r.text?.split('\n')[0]).toBe('3 pendências abertas do proprietário:')
  expect(r.text).toMatch(/- 40 · Revisar a pasta compartilhada de exemplo \[Gerente · Modelo\] — aberto/)
  expect(s.opens.length).toBe(antes + 1)
  expect(s.opens.at(-1)).toBe('sala')

  const sala = await rodar($, 'sala')
  expect(sala.text).toBe('InToca Sala aberta.')
  expect(s.opens.length).toBe(antes + 2)
})

test('/pendencias com o painel sem espaço avisa a pessoa', async ($, on) => {
  mundo($, on, { placed: false })
  await iniciar($, `${SEDE}/alfa`)
  const r = await rodar($, 'pendencias')
  expect(r.text).toMatch(/janela estreita/)
})

test('a linha de status mostra a OS do chat pelo título e limpa quando o cargo muda', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  expect(s.status).toEqual([])

  await $.classic.UserPromptSubmit({ prompt: 'bom dia', session_title: 'Executor · ALF-14 rigor', cwd: `${SEDE}/alfa` })
  expect(s.status.at(-1)).toBe('ALF-14 · hooks/')

  // Mesmo título: o status não é repetido.
  const n = s.status.length
  await $.classic.UserPromptSubmit({ prompt: 'segue', session_title: 'Executor · ALF-14 rigor', cwd: `${SEDE}/alfa` })
  expect(s.status.length).toBe(n)

  await $.classic.UserPromptSubmit({ prompt: 'agora outra coisa', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  expect(s.status.at(-1)).toBeUndefined()
  expect(s.status.length).toBe(n + 1)
})

test('sem título, o prompt que contrata o executor dá a OS (reserva)', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  await $.classic.UserPromptSubmit({ prompt: 'Execute a OS `/x/ops/os/ALF-14-rigor.md`; modelo previsto: Opus.', cwd: `${SEDE}/alfa` })
  expect(s.status.at(-1)).toBe('ALF-14 · hooks/')
})

test('toast de chat trocado: cita outro projeto avisa; no próprio projeto, em consulta e com insistência, não', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  const toastsAntes = s.toasts.length
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do projeto beta', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  expect(s.toasts.length).toBe(toastsAntes + 1)
  expect(s.toasts.at(-1)).toMatch(/^Aviso InToca: o pedido cita beta, e este chat é Gerente · alfa\.exemplo\.br\./)

  // Consulta e conversa no próprio projeto: mudo.
  await $.classic.UserPromptSubmit({ prompt: 'qual é o status do beta?', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do alfa.exemplo.br', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  expect(s.toasts.length).toBe(toastsAntes + 1)

  // O proprietário insiste: mudo dali em diante.
  await $.classic.UserPromptSubmit({ prompt: 'faz aqui mesmo', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do projeto beta', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  expect(s.toasts.length).toBe(toastsAntes + 1)
})

test('toast de pasta errada ao abrir o chat: pasta da sede sem projeto avisa; pasta de projeto, não', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa/src`)
  expect(s.toasts).toEqual([])

  await $.session.start({ cwd: `${SEDE}/qualquer-pasta`, surface: 'desktop', isInteractive: true })
  expect(s.toasts).toHaveLength(1)
  expect(s.toasts[0]).toMatch(/^Aviso InToca: esta pasta não é a de nenhum projeto da sede\./)
})

test('regra do ponteiro: fora de pasta registrada os passivos ficam mudos; /pendencias e o painel funcionam', async ($, on) => {
  const arquivos = sedeDeMentira({ '/casa/.intoca/sede': SEDE })
  const s = mundo($, on, { arquivos, env: { INTOCA_HOME: '/casa' } })
  on('ui.render', ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine</Text>
  })
  await iniciar($, '/pasta/solta')

  // Passivos: nenhum status, nenhuma faixa; só o aviso de uma linha de "pasta sem Toca".
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do projeto beta', session_title: 'Executor · ALF-14 x', cwd: '/pasta/solta' })
  expect(s.status).toEqual([])
  expect(s.toasts).toHaveLength(1)
  expect(s.toasts[0]).toBe('Aviso InToca: este chat não faz parte de nenhuma Toca da sede sede-teste. Se for trabalho de um projeto, abra o chat na pasta dele.')
  const faixa = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await faixa.find({ type: 'Text', text: /pendência/ })).toBeUndefined()
  expect(await faixa.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await faixa.unmount()

  // De propósito: vale em qualquer pasta com sede.
  const r = await rodar($, 'pendencias')
  expect(r.text?.split('\n')[0]).toBe('3 pendências abertas do proprietário:')
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: 'Pendências do proprietário (3)' })).toBeDefined()
  await pane.unmount()

  // Em pasta registrada, o mesmo ponteiro libera os passivos.
  await $.session.start({ cwd: '/fora/gama', surface: 'desktop', isInteractive: true })
  await $.classic.UserPromptSubmit({ prompt: 'bom dia', session_title: 'Executor · ALF-14 x', cwd: '/fora/gama' })
  expect(s.status.at(-1)).toBe('ALF-14 · hooks/')
  const faixa2 = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await faixa2.find({ type: 'Text', text: /3 pendências/ })).toBeDefined()
  await faixa2.unmount()
})

test('sem sede: nada aparece e nada quebra', async ($, on) => {
  const s = mundo($, on, { arquivos: {} })
  on('ui.render', ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine</Text>
  })
  await iniciar($, '/nada/aqui')
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do projeto beta', session_title: 'Executor · ALF-14 x', cwd: '/nada/aqui' })
  expect(s.status).toEqual([])
  expect(s.toasts).toEqual([])

  const faixa = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await faixa.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await faixa.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /Sem sede à vista/ })).toBeDefined()
  await pane.unmount()

  const r = await rodar($, 'pendencias')
  expect(r.text).toMatch(/^Não achei a sede/)
  expect(s.opens).toEqual([])
})

test('arquivos que falham viram "sem dados" e o mod segue de pé', async ($, on) => {
  // Toda leitura de fila e de pendência falha; só o manifesto responde.
  const s = mundo($, on, { falhar: caminho => !caminho.endsWith('sede.yaml') })
  await iniciar($, `${SEDE}/alfa`)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^sem dados \(arquivo ausente ou ilegível\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Diretoria: sem dados/ })).toBeDefined()
  await ui.unmount()
  expect(s.status).toEqual([])
})

test('só leitura: nenhuma escrita em arquivo em todo o caminho (a ausência de decisão de permissão é provada pela busca no pacote e pelo validador)', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do projeto beta', session_title: 'Executor · ALF-14 x', cwd: `${SEDE}/alfa` })
  await rodar($, 'pendencias')
  await s.relogio.advance(180_000)
  expect(s.writes).toEqual([])
})

test('cada bloco desenha no máximo 12 linhas e diz quantas ficaram de fora', async ($, on) => {
  const muitas = Array.from({ length: 15 }, (_, i) => `| ${i + 1} | Pedido ${i + 1} | Gerente · Exemplo | aberto |`).join('\n')
  const arquivos = sedeDeMentira({
    [`${SEDE}/diretoria/pendencias-do-proprietario.md`]: `## Abertas\n\n| # | Pedido | Onde | Estado |\n| --- | --- | --- | --- |\n${muitas}\n`,
  })
  mundo($, on, { arquivos })
  await iniciar($, `${SEDE}/alfa`)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (15)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^12 · Pedido 12/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^13 · Pedido 13/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '… e mais 3' })).toBeDefined()
  await ui.unmount()
})

test('arquivo acima de 1 MB, pelo adaptador de leitura, vira "grande demais"', async ($, on) => {
  const arquivos = sedeDeMentira({ [`${SEDE}/alfa/ops/fila.md`]: ' '.repeat(1024 * 1024 + 1) })
  mundo($, on, { arquivos })
  await iniciar($, `${SEDE}/alfa`)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'alfa.exemplo.br: sem dados (arquivo grande demais)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Pendências do proprietário (3)' })).toBeDefined()
  await ui.unmount()
})

test('a pasta do chat muda no meio da sessão: o relógio relê a pasta viva', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, '/pasta/sem/sede')
  const antes = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await antes.find({ type: 'Text', text: /Sem sede à vista/ })).toBeDefined()
  await antes.unmount()

  // `change_directory` para dentro de um projeto: no próximo minuto a sala acha a sede.
  s.cwd = `${SEDE}/alfa`
  await s.relogio.advance(60_000)
  const depois = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await depois.find({ type: 'Text', text: 'Pendências do proprietário (3)' })).toBeDefined()
  await depois.unmount()
})

test('as variáveis de silêncio dos hooks também calam os avisos rápidos', async ($, on) => {
  const s = mundo($, on, { env: { INTOCA_SEM_AVISO_TROCADO: '1' } })
  await iniciar($, `${SEDE}/qualquer-pasta`)
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do projeto beta', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  expect(s.toasts).toEqual([])
})

test('INTOCA_SEM_AVISO_PASTA cala só o aviso de pasta; "0" não cala', async ($, on) => {
  const so = mundo($, on, { env: { INTOCA_SEM_AVISO_PASTA: '1' } })
  await iniciar($, `${SEDE}/qualquer-pasta`)
  expect(so.toasts).toEqual([])
  await $.classic.UserPromptSubmit({ prompt: 'ajuste o botão do projeto beta', session_title: 'Gerente · alfa.exemplo.br', cwd: `${SEDE}/alfa` })
  expect(so.toasts).toHaveLength(1)
})

test('INTOCA_SEM_AVISO_TROCADO igual a "0" não cala', async ($, on) => {
  const s = mundo($, on, { env: { INTOCA_SEM_AVISO_TROCADO: '0' } })
  await iniciar($, `${SEDE}/qualquer-pasta`)
  expect(s.toasts).toHaveLength(1)
})

test('título sem cargo não apaga a OS que o chat já tinha (vinda do prompt que o contratou)', async ($, on) => {
  const s = mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  await $.classic.UserPromptSubmit({ prompt: 'Execute a OS `/x/ops/os/ALF-14-rigor.md`.', cwd: `${SEDE}/alfa` })
  expect(s.status.at(-1)).toBe('ALF-14 · hooks/')
  await $.classic.UserPromptSubmit({ prompt: 'segue', session_title: 'Conversa qualquer', cwd: `${SEDE}/alfa` })
  expect(s.status.at(-1)).toBe('ALF-14 · hooks/')
})

test('candidato do manifesto não tem a fila lida', async ($, on) => {
  mundo($, on)
  await iniciar($, `${SEDE}/alfa`)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // A fila de "cand" existe no mapa, com as mesmas OS do alfa: se fosse lida, as OS em andamento passariam de 4.
  expect(await ui.find({ type: 'Text', text: 'OS em andamento (4)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /candidato-x/ })).toBeUndefined()
  await ui.unmount()
})
