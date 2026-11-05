// Contrato do que o mod guarda em `$.state` e dos dados que os módulos puros trocam entre si.
// Só dados simples (JSON). Nenhum caminho de máquina aqui.

export type Situacao =
  | 'andamento'
  | 'aguarda-vai'
  | 'aguarda-integracao'
  | 'a-escrever'
  | 'concluida'
  | 'outro'

export type LinhaOS = {
  id: string
  tema: string
  nivel: string
  modelo: string
  recurso: string
  estado: string
  situacao: Situacao
  projeto: string
}

export type Ocupado = {
  recurso: string
  dono: string
  estado: string
  projeto: string
  congelado: boolean
}

export type Aviso = {
  projeto: string
  id: string
  tipo: 'aguarda-vai' | 'aguarda-integracao' | 'texto'
  texto: string
}

export type FilaLida = {
  projeto: string
  sigla: string
  /** O arquivo foi lido? Falso quando ausente, ilegível ou grande demais. */
  lida: boolean
  motivo?: string
  os: LinhaOS[]
  ocupados: Ocupado[]
  avisos: Aviso[]
  /** Linhas de tabela de OS que não tinham ID reconhecível. */
  ignoradas: number
}

export type Pendencia = {
  numero: string
  pedido: string
  onde: string
  estado: string
}

export type PendenciasLidas = {
  lida: boolean
  motivo?: string
  abertas: Pendencia[]
}

/** A InToca Sala, quando estava no ar na leitura. */
export type SalaNoAr = {
  porta: number
  tocas: number | null
  noAr: number | null
}

export type Painel = {
  /** Presente só quando a InToca Sala respondeu: de onde vieram as pendências e a contagem de tocas. */
  sala?: SalaNoAr
  /** Pasta da sede, como o mod a achou. */
  sede: string
  origem: 'cwd' | 'env' | 'ponteiro'
  manifestoLido: boolean
  atualizadoEm: number
  custoMs: number
  filas: FilaLida[]
  pendencias: PendenciasLidas
}

export type Chat = {
  cargo: 'Diretoria' | 'Secretaria' | 'Gerente' | 'Plantão' | 'Executor' | null
  os: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'intoca-sala': {
      painel: Painel | null
      chat: Chat | null
      /** Os elementos passivos (status, faixa, toasts) podem agir nesta pasta? */
      passivo: boolean
    }
  }
}
