// A InToca Sala (o servidor de `intoca-sala/sala/`) como fonte de dados, quando está no ar. Só leitura, só o
// loopback (127.0.0.1) e só a porta que a própria sala grava em `~/.intoca/sala.json`; tempo-limite curto e erro
// silencioso: qualquer falha devolve `null` e o painel cai para a leitura das filas. Texto vindo da API é dado,
// nunca ordem: é validado, cortado e só mostrado.
import type { Pendencia, PendenciasLidas, SalaNoAr } from '../types'
import { juntar } from './caminhos'
import type { Porta } from './sede'
import { cortar } from './tabela'

const LIMITE_ITENS = 200

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown, max: number): string => (typeof v === 'string' ? cortar(v.replace(/\s+/g, ' ').trim(), max) : '')

/** A porta da Clássica em `sala.json` (inteiro de 1 a 65535), ou `null`. */
export async function portaDaSala(porta: Porta): Promise<number | null> {
  try {
    const amb = await porta.ambiente()
    const casa = amb.INTOCA_HOME?.trim() || amb.USERPROFILE?.trim() || amb.HOME?.trim()
    if (!casa) return null
    const lido = await porta.ler(juntar(casa, '.intoca', 'sala.json'))
    if (!('texto' in lido) || lido.texto.length > 65536) return null
    const dado: unknown = JSON.parse(lido.texto.replace(/^﻿/, ''))
    const n = ehObjeto(dado) && ehObjeto(dado['classica']) ? Number(dado['classica']['porta']) : NaN
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null
  } catch {
    return null
  }
}

async function pegar(porta: Porta, n: number, caminho: string): Promise<unknown> {
  if (!porta.http) return null
  const corpo = await porta.http(`http://127.0.0.1:${n}${caminho}`)
  if (corpo === null || corpo.length > 2 * 1024 * 1024) return null
  try {
    return JSON.parse(corpo)
  } catch {
    return null
  }
}

/** `/api/pendencias` no formato do painel: uma pendência por item aberto, com a origem em `onde`. */
export function pendenciasDaApi(dado: unknown): PendenciasLidas | null {
  if (!ehObjeto(dado) || dado['sede'] !== true || !Array.isArray(dado['fontes'])) return null
  const abertas: Pendencia[] = []
  for (const f of dado['fontes']) {
    if (!ehObjeto(f) || f['lida'] !== true || !Array.isArray(f['abertas'])) continue
    for (const a of f['abertas']) {
      if (!ehObjeto(a) || abertas.length >= LIMITE_ITENS) continue
      const pedido = texto(a['pedido'], 300)
      if (pedido === '') continue
      abertas.push({ numero: texto(a['numero'], 20), pedido, onde: texto(a['onde'], 80) || texto(f['origem'], 80), estado: texto(a['estado'], 80) })
    }
  }
  return { lida: true, abertas }
}

/** `/api/tocas`: quantas tocas e quantas no ar. */
export function tocasDaApi(dado: unknown): { total: number; noAr: number } | null {
  if (!ehObjeto(dado) || !Array.isArray(dado['lista'])) return null
  const lista = dado['lista'].filter(ehObjeto)
  return { total: lista.length, noAr: lista.filter(t => t['state'] === 'running').length }
}

/** Lê a sala se ela está no ar; `null` quando não está, não responde ou responde fora do formato. */
export async function lerDaSala(porta: Porta): Promise<{ sala: SalaNoAr; pendencias: PendenciasLidas | null } | null> {
  try {
    const n = await portaDaSala(porta)
    if (n === null || !porta.http) return null
    const [pend, tocas] = await Promise.all([pegar(porta, n, '/api/pendencias'), pegar(porta, n, '/api/tocas')])
    const pendencias = pendenciasDaApi(pend)
    const t = tocasDaApi(tocas)
    if (!pendencias && !t) return null
    return { sala: { porta: n, tocas: t?.total ?? null, noAr: t?.noAr ?? null }, pendencias }
  } catch {
    return null
  }
}
