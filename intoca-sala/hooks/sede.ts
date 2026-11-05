// Achar a sede, na mesma ordem dos hooks do plugin `intoca`: `sede.yaml` subindo do cwd, depois a variável
// INTOCA_SEDE, depois o ponteiro `<pasta do usuário>/.intoca/sede` (uma linha, caminho absoluto de pasta que
// tem `sede.yaml`; relativo, de rede ou sem `sede.yaml`: ignorado). Só leitura, através da `Porta`.
// A regra do ponteiro: quando a sede vem SÓ dele, os elementos passivos (status, faixa, toasts) agem apenas
// em pasta registrada no manifesto. Os pedidos de propósito (`/sala`, `/pendencias`) valem em qualquer pasta.
import { absoluto, dentroDe, juntar, pai } from './caminhos'
import { interpretarManifesto, type Manifesto } from './manifesto'

export type Leitura = { texto: string } | { erro: 'ausente' | 'grande' }

/** O que o mod precisa do mundo de fora. O adaptador (`api.tsx`) implementa; os testes trocam por uma sede de mentira. */
export type Porta = {
  ler: (caminho: string) => Promise<Leitura>
  existe: (caminho: string) => Promise<boolean>
  /** GET no loopback com tempo-limite curto; o corpo, ou `null` em qualquer falha. Opcional: sem ele a sala não é consultada. */
  http?: (url: string) => Promise<string | null>
  /** O caminho real de um caminho que existe (sem junção, link nem nome curto), ou `null`. Opcional: sem ele só se compara por texto. */
  real?: (caminho: string) => Promise<string | null>
  ambiente: () => Promise<{ INTOCA_SEDE?: string; INTOCA_HOME?: string; HOME?: string; USERPROFILE?: string; TEMP?: string; TMP?: string; TMPDIR?: string }>
}

export type Origem = 'cwd' | 'env' | 'ponteiro'

export type Resolucao = {
  /** Raiz viva da sede (numa worktree da sede, a pasta que a contém). */
  sede: string
  /** A pasta com `sede.yaml` mais próxima do cwd. */
  local: string
  origem: Origem
  manifesto: Manifesto | null
  /** Os elementos passivos podem agir a partir deste cwd? */
  passivo: boolean
}

const LIMITE_PONTEIRO = 4096
const SUBIDA_MAXIMA = 64
const WORKTREE = /^(.*?)[\\/](?:\.claude[\\/]worktrees|_worktrees)[\\/][^\\/]+$/

const temManifesto = (porta: Porta, dir: string): Promise<boolean> => porta.existe(juntar(dir, 'sede.yaml'))

async function acharSedeAcima(porta: Porta, inicio: string): Promise<string | null> {
  let dir = inicio
  for (let i = 0; i < SUBIDA_MAXIMA; i += 1) {
    if (await temManifesto(porta, dir)) return dir
    const acima = pai(dir)
    if (acima === dir) break
    dir = acima
  }
  return null
}

async function lerPonteiro(porta: Porta, ambiente: Awaited<ReturnType<Porta['ambiente']>>): Promise<string | null> {
  const casa = ambiente.INTOCA_HOME?.trim() || ambiente.USERPROFILE?.trim() || ambiente.HOME?.trim()
  if (!casa || !absoluto(casa)) return null
  const lido = await porta.ler(juntar(casa, '.intoca', 'sede'))
  if (!('texto' in lido) || lido.texto.length > LIMITE_PONTEIRO) return null
  const linha = lido.texto.replace(/^﻿/, '').split(/\r?\n/)[0]?.trim() ?? ''
  if (!linha || !absoluto(linha)) return null
  return (await temManifesto(porta, linha)) ? linha.replace(/[\\/]+$/, '') : null
}

/** O cwd está numa pasta que o manifesto registra (`pasta_atual`, `pasta_futura` ou `pastas_antigas`)? */
export function cwdEmPastaRegistrada(cwd: string, manifesto: Manifesto | null): boolean {
  for (const p of manifesto?.projetos ?? []) {
    for (const pasta of [p.pastaAtual, p.pastaFutura, ...p.pastasAntigas]) {
      if (pasta && dentroDe(pasta, cwd, true)) return true
    }
  }
  return false
}

/** Sede de quem abriu o chat em `cwd`, ou `null` quando não há sede (o mod fica mudo). Nunca lança. */
export async function resolverSede(porta: Porta, cwd: string): Promise<Resolucao | null> {
  try {
    if (!absoluto(cwd)) return null
    let local = await acharSedeAcima(porta, cwd)
    let origem: Origem = 'cwd'
    if (!local) {
      const ambiente = await porta.ambiente()
      const env = ambiente.INTOCA_SEDE?.trim()
      if (env && absoluto(env) && (await temManifesto(porta, env))) {
        local = env.replace(/[\\/]+$/, '')
        origem = 'env'
      } else {
        const ponteiro = await lerPonteiro(porta, ambiente)
        if (ponteiro) {
          local = ponteiro
          origem = 'ponteiro'
        }
      }
    }
    if (!local) return null
    const m = local.match(WORKTREE)
    const dona = m?.[1]
    const raiz = dona && (await temManifesto(porta, dona)) ? dona : local
    const lido = await porta.ler(juntar(raiz, 'sede.yaml'))
    const manifesto = 'texto' in lido ? interpretarManifesto(lido.texto) : null
    const passivo = origem !== 'ponteiro' || cwdEmPastaRegistrada(cwd, manifesto)
    return { sede: raiz, local, origem, manifesto, passivo }
  } catch {
    return null
  }
}
