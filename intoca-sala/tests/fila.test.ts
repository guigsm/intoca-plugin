import { expect, test } from 'claude-code/testing'
import { lerFila, situacaoDoEstado } from '../hooks/fila'
import { lerPendencias, textoDasPendencias } from '../hooks/pendencias'
import { interpretarManifesto } from '../hooks/manifesto'
import { lerTabelas } from '../hooks/tabela'
import { FILA_ALFA, FILA_DIRETORIA, MANIFESTO, PENDENCIAS } from './mundo'

test('tabelas: caracteres de controle do arquivo não chegam ao desenho', () => {
  const t = lerTabelas('| A |\n| --- |\n| x\u0007y\u001bz |\n')
  expect(t[0]?.linhas[0]).toEqual(['x y z'])
})

test('tabelas: separa células, respeita crase e barra escapada, junta o excesso na última coluna', () => {
  const t = lerTabelas('## Seção\n\n| A | B |\n| --- | --- |\n| `x | y` | 2 |\n| a \\| b | c | d |\n| só |\n')
  expect(t).toHaveLength(1)
  expect(t[0]?.secao).toBe('Seção')
  expect(t[0]?.linhas[0]).toEqual(['x | y', '2'])
  expect(t[0]?.linhas[1]).toEqual(['a | b', 'c | d'])
  expect(t[0]?.linhas[2]).toEqual(['só', ''])
})

test('situação do estado: os marcadores mais específicos ganham', () => {
  expect(situacaoDoEstado('concluída e aceita em 2026-10-13')).toBe('concluida')
  expect(situacaoDoEstado('escrita; aguarda "vai"')).toBe('aguarda-vai')
  expect(situacaoDoEstado('aguarda o “vai” do proprietário')).toBe('aguarda-vai')
  expect(situacaoDoEstado('espera o vai')).toBe('aguarda-vai')
  expect(situacaoDoEstado('aguarda integração')).toBe('aguarda-integracao')
  expect(situacaoDoEstado('entregue em 2026-10-26; falta integrar')).toBe('aguarda-integracao')
  // "entregue" e "integrada" juntos: já foi integrada.
  expect(situacaoDoEstado('entregue em 2026-10-21, integrada na main')).toBe('concluida')
  expect(situacaoDoEstado('OS escrita; "vai" dado em 2026-10-25; cartão por spawn_task')).toBe('andamento')
  expect(situacaoDoEstado('em execução')).toBe('andamento')
  expect(situacaoDoEstado('a escrever')).toBe('a-escrever')
  // Formas que as filas reais usam.
  expect(situacaoDoEstado('executada em 2026-10-17; relatório relatorios/X.md; aguarda aceite da Diretoria')).toBe('aguarda-integracao')
  expect(situacaoDoEstado('Aberta em 2026-10-19. Executada em 2026-10-19: relatório gravado')).toBe('concluida')
  expect(situacaoDoEstado('"Vai" do proprietário em 2026-10-19: ops/os/X.md. Executor por cartão.')).toBe('andamento')
  expect(situacaoDoEstado('executor aberto em 2026-10-27; R2 espera o e-mail')).toBe('andamento')
  expect(situacaoDoEstado('decidida em 2026-10-25; nada a executar agora')).toBe('outro')
  // "em curso" no começo vence um "espera o vai" de subitem (forma real da fila da Diretoria).
  expect(situacaoDoEstado('em curso (noite): ALF contratado; ALF-02 escrita, espera "vai"; faltam outros')).toBe('andamento')
  expect(situacaoDoEstado('')).toBe('outro')
})

test('fila de projeto: OS, repetição, linha malformada, ocupação e avisos', () => {
  const f = lerFila(FILA_ALFA, 'alfa.exemplo.br', 'ALF')
  expect(f.lida).toBe(true)
  const ids = f.os.map(o => o.id)
  expect(ids).toEqual(['ALF-01', 'ALF-14', 'ALF-15', 'ALF-16', 'ALF-17', 'ALF-18', 'ALF-19'])
  // A primeira linha de um ID vale: ALF-01 continua concluída.
  expect(f.os[0]?.situacao).toBe('concluida')
  expect(f.ignoradas).toBe(1)

  const os14 = f.os.find(o => o.id === 'ALF-14')
  expect(os14).toMatchObject({ nivel: 'N4', modelo: 'Opus 5.5 · high', recurso: 'hooks/', situacao: 'andamento', projeto: 'alfa.exemplo.br' })
  expect(f.os.find(o => o.id === 'ALF-19')?.tema).toBe('Tema com barra')

  // Livre não conta; os dois donos aparecem.
  expect(f.ocupados.map(o => o.recurso)).toEqual(['alfa/hooks/', 'alfa/tests/'])
  expect(f.ocupados[0]?.dono).toBe('Executor · ALF-14 (reservado em 2026-10-27)')

  const tipos = f.avisos.map(a => `${a.id}:${a.tipo}`)
  expect(tipos).toEqual(['ALF-15:aguarda-vai', 'ALF-16:aguarda-integracao', 'ALF-19:aguarda-integracao'])
})

test('fila da Diretoria: OS, congelados (com continuação) e aviso em prosa', () => {
  const f = lerFila(FILA_DIRETORIA, 'Diretoria', 'DIR')
  expect(f.os.map(o => [o.id, o.situacao])).toEqual([
    ['DIR-02', 'concluida'],
    ['DIR-27', 'aguarda-vai'],
    ['DIR-30', 'andamento'],
  ])
  const congelados = f.ocupados.filter(o => o.congelado)
  expect(congelados).toHaveLength(3)
  expect(congelados[1]?.recurso).toBe('Motor de publicação (correção em andamento), com continuação na linha seguinte.')
  expect(f.avisos.some(a => a.tipo === 'texto' && /aguarda integração/.test(a.texto))).toBe(true)
  // O modelo vem do "Nível · modelo" ou da coluna própria.
  expect(f.os[0]).toMatchObject({ nivel: 'N3', modelo: 'Sonnet 5.5 · high' })
})

test('fila vazia, sem tabela ou só com lixo: listas vazias, sem lançar', () => {
  for (const texto of ['', '\n\n', '# Só título\n\nTexto.\n', '| solta |\n', '| A | B |\n| x |\n']) {
    const f = lerFila(texto, 'p', 'P')
    expect(f.lida).toBe(true)
    expect(f.os).toEqual([])
    expect(f.ocupados).toEqual([])
    expect(f.avisos).toEqual([])
  }
})

test('pendências: abertas, feito e fora de seção; ausente é "sem dados"', () => {
  const p = lerPendencias(PENDENCIAS)
  expect(p.lida).toBe(true)
  // 39, 40 e 15 abertas; a 12 diz "feito"; a tabela de Feitas não entra.
  expect(p.abertas.map(a => a.numero)).toEqual(['39', '40', '15'])
  expect(p.abertas[2]?.estado).toMatch(/^vencido/)

  // Sem título "Abertas": toda tabela de pedidos vale, com a mesma regra de estado.
  const plana = lerPendencias('| # | Pedido | Estado |\n| --- | --- | --- |\n| 1 | A | aberto |\n| 2 | B | feito |\n| 3 | C | resolvido |\n')
  expect(plana.abertas.map(a => a.numero)).toEqual(['1'])

  // Arquivo vazio: lido, zero abertas. Texto sem tabela: fora do formato (nunca um zero escondido).
  expect(lerPendencias('')).toEqual({ lida: true, abertas: [] })
  const solto = lerPendencias('Só texto, nenhuma tabela.')
  expect(solto.lida).toBe(false)
  expect(solto.abertas).toEqual([])
})

test('texto do /pendencias: uma linha por pendência, teto e vazio', () => {
  const t = textoDasPendencias(lerPendencias(PENDENCIAS))
  expect(t.split('\n')[0]).toBe('3 pendências abertas do proprietário:')
  expect(t).toMatch(/- 39 · Criar a conta do fornecedor de exemplo \[Gerente · Exemplo\] — aberto/)
  const muitas = Array.from({ length: 25 }, (_, i) => `| ${i} | P${i} | x | aberto |`).join('\n')
  const grande = textoDasPendencias(lerPendencias(`## Abertas\n\n| # | Pedido | Onde | Estado |\n| --- | --- | --- | --- |\n${muitas}\n`))
  expect(grande).toMatch(/… e mais 5$/)
  expect(textoDasPendencias({ lida: true, abertas: [] })).toBe('Nenhuma pendência do proprietário aberta.')
  expect(textoDasPendencias({ lida: false, motivo: 'arquivo ausente ou ilegível', abertas: [] })).toMatch(/sem dados/)
})

test('manifesto: itens em bloco e em linha, aspas, comentário, texto dobrado ignorado', () => {
  const m = interpretarManifesto(MANIFESTO)
  expect(m?.nomeDaSede).toBe('sede-teste')
  expect(m?.projetos.map(p => p.nome)).toEqual(['alfa.exemplo.br', 'beta', 'gama', 'localhost', 'sem-fila', 'candidato-x'])
  expect(m?.projetos[5]?.status).toBe('candidato')
  expect(m?.projetos[0]).toMatchObject({ sigla: 'ALF', pastaAtual: '/sede-teste/alfa', pastasAntigas: ['/antigo/alfa'] })
  expect(m?.projetos[1]?.pastaAtual).toBe('/sede-teste/beta')
  expect(m?.projetos[2]).toMatchObject({ nome: 'gama', pastaAtual: '/fora/gama' })

  // "ferramentas:" é outra chave de topo: para a leitura.
  expect(m?.projetos.some(p => p.nome === 'nada-disso-conta')).toBe(false)
})

test('manifesto fora do formato: null, sem lançar', () => {
  expect(interpretarManifesto('versao: 1\n')).toBeNull()
  expect(interpretarManifesto('')).toBeNull()
  expect(interpretarManifesto(undefined)).toBeNull()
  expect(interpretarManifesto('projetos:\n  - {nome: x, pasta_atual: "/a"\n')).toBeNull()
  expect(interpretarManifesto('projetos: []\n')).toEqual({ projetos: [], nomeDaSede: null })
  // Pasta relativa ou de rede não vale como pasta.
  const rel = interpretarManifesto("projetos:\n  - nome: x\n    pasta_atual: 'relativa/x'\n    pasta_futura: '//srv/x'\n")
  expect(rel?.projetos[0]).toMatchObject({ nome: 'x', pastaAtual: undefined, pastaFutura: undefined })
})
