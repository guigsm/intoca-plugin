// Pendências do proprietário: `diretoria/pendencias-do-proprietario.md` (mantido pela Secretaria).
// Aberta é a linha de tabela sob um título "Abertas" cujo estado não diz `feito` (nem resolvido, decidido ou
// cancelado). Sem título "Abertas", vale toda tabela de pendências (coluna `Pedido`) com a mesma regra de estado.
// Arquivo ausente ou fora do formato: "sem dados", nunca zero escondido.
import type { Pendencia, PendenciasLidas } from '../types'
import { coluna, cortar, lerTabelas, semAcento } from './tabela'

const ENCERRADA = /^(?:feito|feita|conclu[ií]d|fechad|cumprid|resolvid|decidid|cancelad|descartad|arquivad)/
const LIMITE = 200

export function lerPendencias(texto: string): PendenciasLidas {
  try {
    const tabelas = lerTabelas(texto).filter(t => coluna(t.cabecalho, 'pedido') >= 0)
    const sob = tabelas.filter(t => /abert/.test(semAcento(t.secao)))
    const usadas = sob.length > 0 ? sob : tabelas.filter(t => !/feit/.test(semAcento(t.secao)))
    const abertas: Pendencia[] = []
    for (const t of usadas) {
      const iPedido = coluna(t.cabecalho, 'pedido')
      const iOnde = coluna(t.cabecalho, 'onde')
      const iEstado = coluna(t.cabecalho, 'estado')
      const iNumero = coluna(t.cabecalho, '#')
      for (const c of t.linhas) {
        const pedido = c[iPedido] ?? ''
        if (pedido === '') continue
        const estado = iEstado >= 0 ? c[iEstado] ?? '' : ''
        if (ENCERRADA.test(semAcento(estado))) continue
        if (abertas.length >= LIMITE) break
        abertas.push({
          numero: iNumero >= 0 ? c[iNumero] ?? '' : '',
          pedido,
          onde: iOnde >= 0 ? c[iOnde] ?? '' : '',
          estado,
        })
      }
    }
    if (tabelas.length === 0 && texto.trim() !== '') return { lida: false, motivo: 'fora do formato', abertas: [] }
    return { lida: true, abertas }
  } catch {
    return { lida: false, motivo: 'fora do formato', abertas: [] }
  }
}

export function pendenciasSemDados(motivo: string): PendenciasLidas {
  return { lida: false, motivo, abertas: [] }
}

/** Texto do comando `/pendencias`: uma linha por pendência aberta, no máximo `max`. */
export function textoDasPendencias(p: PendenciasLidas, max = 20): string {
  if (!p.lida) return `Pendências do proprietário: sem dados (${p.motivo ?? 'arquivo não lido'}).`
  if (p.abertas.length === 0) return 'Nenhuma pendência do proprietário aberta.'
  const n = p.abertas.length
  const linhas = p.abertas.slice(0, max).map(a => {
    const onde = a.onde ? ` [${cortar(a.onde, 40)}]` : ''
    const estado = a.estado ? ` — ${cortar(a.estado, 30)}` : ''
    return `- ${a.numero ? `${a.numero} · ` : ''}${cortar(a.pedido, 140)}${onde}${estado}`
  })
  const resto = n > max ? [`… e mais ${n - max}`] : []
  return [`${n} ${n === 1 ? 'pendência aberta' : 'pendências abertas'} do proprietário:`, ...linhas, ...resto].join('\n')
}
