// O desenho do painel e da faixa. Recebe as peças da superfície (`Box`, `Text`, `Button`) e os dados já lidos;
// não chama o motor. Tabelas simples: um título por bloco e uma linha de texto por item. Cada bloco tem teto de
// linhas e o resto vira "… e mais N". O que veio dos arquivos é cortado e mostrado, nunca interpretado.
import type { Elements } from 'claude-code'
import type { Chat, Painel } from '../types'
import { nomeDe } from './caminhos'
import { MOTIVO_AUSENTE, acharOS, textoDaFaixa } from './sala'
import { cortar } from './tabela'

export type Pecas = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

const MAX_LINHAS = 12
const ROTULO_AVISO = { 'aguarda-vai': 'aguarda o vai', 'aguarda-integracao': 'aguarda integração/aceite', texto: 'aviso na fila' } as const

const dois = (n: number): string => String(n).padStart(2, '0')

/** Hora local `HH:MM` de um instante em milissegundos; vazio se a data não existe. */
export function hora(ms: number): string {
  try {
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? '' : `${dois(d.getHours())}:${dois(d.getMinutes())}`
  } catch {
    return ''
  }
}

type Bloco = { titulo: string; linhas: string[]; vazio: string }

/** Os blocos do painel, em texto: separado do desenho para o teste ler sem a superfície. */
export function blocosDoPainel(painel: Painel, chat: Chat | null): Bloco[] {
  const blocos: Bloco[] = []

  if (painel.sala) {
    const { porta, tocas, noAr } = painel.sala
    const resumo = tocas === null ? '' : ` · ${tocas} ${tocas === 1 ? 'toca' : 'tocas'}, ${noAr ?? 0} no ar`
    blocos.push({ titulo: 'InToca Sala', vazio: '', linhas: [`no ar na porta ${porta}${resumo}`] })
  }

  const p = painel.pendencias
  blocos.push({
    titulo: p.lida ? `Pendências do proprietário (${p.abertas.length})` : 'Pendências do proprietário',
    vazio: p.lida ? 'nenhuma aberta' : `sem dados (${p.motivo ?? 'arquivo não lido'})`,
    linhas: p.abertas.map(a => `${a.numero ? `${a.numero} · ` : ''}${cortar(a.pedido, 110)}${a.onde ? ` [${cortar(a.onde, 36)}]` : ''}`),
  })

  const todas = painel.filas.flatMap(f => f.os)
  const andamento = todas.filter(o => o.situacao === 'andamento' || o.situacao === 'aguarda-integracao')
  blocos.push({
    titulo: `OS em andamento (${andamento.length})`,
    vazio: 'nenhuma registrada nas filas',
    linhas: andamento.map(o => `${o.id} · ${o.projeto} · ${o.modelo || o.nivel || 'modelo não informado'} · ${cortar(o.estado, 80)}`),
  })

  const avisos = painel.filas.flatMap(f => f.avisos)
  blocos.push({
    titulo: `Avisos (${avisos.length})`,
    vazio: 'nenhum',
    linhas: avisos.map(a => `${a.projeto} · ${ROTULO_AVISO[a.tipo]} · ${cortar(a.texto, 100)}`),
  })

  const ocupados = painel.filas.flatMap(f => f.ocupados)
  blocos.push({
    titulo: `Recursos ocupados (${ocupados.length})`,
    vazio: 'nenhum',
    linhas: ocupados.map(o => `${cortar(o.recurso, 70)} → ${o.congelado ? 'congelado' : cortar(o.dono, 60)} [${o.projeto}]`),
  })

  const recursoDoChat = chat?.os ? acharOS(painel, chat.os)?.recurso : undefined
  blocos.push({
    titulo: 'Este chat',
    vazio: 'cargo não identificado pelo título',
    linhas: chat?.cargo ? [[chat.cargo, chat.os, recursoDoChat && cortar(recursoDoChat, 70)].filter(Boolean).join(' · ')] : [],
  })

  // Fila ausente de um projeto é o normal para quem não tem `ops/` (um candidato do manifesto): vira uma linha só.
  // A fila da Diretoria e qualquer outro motivo (arquivo grande, fora do formato) aparecem um por um.
  const semDados = painel.filas.filter(f => !f.lida)
  const ausentes = semDados.filter(f => f.projeto !== 'Diretoria' && f.motivo === MOTIVO_AUSENTE)
  const linhas = semDados.filter(f => !ausentes.includes(f)).map(f => `${f.projeto}: sem dados (${f.motivo ?? 'não lida'})`)
  if (ausentes.length > 0) {
    const nomes = ausentes.slice(0, 6).map(f => f.projeto).join(', ')
    linhas.push(`sem fila legível em ops/fila.md (${ausentes.length}): ${nomes}${ausentes.length > 6 ? `, e mais ${ausentes.length - 6}` : ''}`)
  }
  for (const f of painel.filas) if (f.lida && f.ignoradas > 0) linhas.push(`${f.projeto}: ${f.ignoradas} linha(s) de OS sem ID ignorada(s)`)
  if (!painel.manifestoLido) linhas.unshift('sede.yaml: não lido; só a fila da Diretoria foi lida')
  if (linhas.length > 0) blocos.push({ titulo: 'Leitura', vazio: '', linhas })
  return blocos
}

/** O painel da sala. `atualizar` é o que o botão faz (ler de novo); some se não for dado. */
export function desenharPainel(el: Pecas, painel: Painel | null, chat: Chat | null, atualizar?: () => void): JSX.Element {
  const { Box, Text, Button } = el
  if (!painel) {
    return (
      <Box flexDirection="column">
        <Text weight="bold">InToca Sala</Text>
        <Text dimColor>Sem sede à vista: abra o chat numa pasta da sede, ou use /intoca:comecar para registrá-la.</Text>
      </Box>
    )
  }
  const quando = hora(painel.atualizadoEm)
  return (
    <Box flexDirection="column">
      <Text weight="bold">InToca Sala · {nomeDe(painel.sede)}</Text>
      <Box>
        <Text dimColor>
          {quando ? `lida às ${quando}` : 'lida agora'} em {painel.custoMs} ms · só leitura{' '}
        </Text>
        {atualizar && <Button key="atualizar" label="Atualizar" onPress={atualizar} />}
      </Box>
      {blocosDoPainel(painel, chat).map(b => (
        <Box key={b.titulo} flexDirection="column" marginTop={1}>
          <Text weight="bold">{b.titulo}</Text>
          {b.linhas.length === 0 && b.vazio !== '' && <Text dimColor>{b.vazio}</Text>}
          {b.linhas.slice(0, MAX_LINHAS).map((linha, i) => (
            <Text key={`${b.titulo}-${i}`}>{linha}</Text>
          ))}
          {b.linhas.length > MAX_LINHAS && <Text dimColor>… e mais {b.linhas.length - MAX_LINHAS}</Text>}
        </Box>
      ))}
    </Box>
  )
}

/** A faixa acima do prompt: a contagem de pendências e um botão para o painel. `undefined` quando não há o que mostrar. */
export function desenharFaixa(el: Pecas, painel: Painel | null, abrir: () => void): JSX.Element | undefined {
  const texto = textoDaFaixa(painel)
  if (texto === undefined) return undefined
  const { Box, Text, Button } = el
  return (
    <Box>
      <Text>{texto} · /pendencias </Text>
      <Button key="ver" label="Ver painel" onPress={abrir} />
    </Box>
  )
}
