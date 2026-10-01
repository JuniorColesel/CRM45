import pb from '@/lib/pocketbase/client'
import type { PerfilUsuario } from '@/contexts/AuthContext'
import type { MesFiltro } from '@/contexts/PeriodoContext'

export interface AlertaPainel {
  id: string
  titulo: string
  descricao: string
  iconeCor: 'vermelho' | 'verde' | 'amarelo' | 'azul'
  linkDestino: string
  linkRotulo?: string
}

export interface DetalheSituacaoValor {
  qtd: number
  valor: number
}

export interface IndicadoresBaseSistema {
  totalClientesCadastrados: number
  clientesComBlingId: number
  totalPedidosCadastradosBase: number
  totalPropostasCadastradasBase: number
  descricao: string
}

export interface HistoricoTotalSeparado {
  valor_vendas_total: number
  pedidos_validos_total: number
  criterio: string
}

export interface PedidosPeriodo {
  total_pedidos: number
  pedidos_validos: number
  valor_vendas_valido: number
  em_aberto: DetalheSituacaoValor
  atendidos: DetalheSituacaoValor
  cancelados: DetalheSituacaoValor
  outros: DetalheSituacaoValor
  clientes_distintos_com_compra: number
}

export interface PropostasPeriodo {
  total: number
  rascunho: number
  aguardando: number
  nao_aprovada: number
  convertida: number
  outras: number
  valor_total: number
  pendente_vinculo: number
}

export interface OportunidadesPeriodo {
  total_periodo: number
  abertas: DetalheSituacaoValor
  ganhas: DetalheSituacaoValor
  perdidas: DetalheSituacaoValor
  taxa_conversao: number
  ticket_medio: number
}

export interface SerieMensalItem {
  mes: number
  nomeMes: string
  mesAno: string
  pedidos_validos: number
  valor_vendas: number
  propostas_total: number
  propostas_convertidas: number
  oportunidades_ganhas_qtd: number
  oportunidades_ganhas_valor: number
  oportunidades_perdidas_qtd: number
  oportunidades_perdidas_valor: number
}

export interface DadosPainelComercialCompleto {
  success: boolean
  contexto: {
    ano: number
    mes: number | null
    isPersonalizado: boolean
    dataInicioYmd: string
    dataFimYmd: string
    labelPeriodo: string
    modoVisao: 'origem' | 'fechamento'
  }
  indicadores_base: IndicadoresBaseSistema
  historico_total: HistoricoTotalSeparado
  pedidos_periodo: PedidosPeriodo
  propostas_periodo: PropostasPeriodo
  oportunidades_periodo: OportunidadesPeriodo
  serie_mensal_ano: SerieMensalItem[]
  serie_diaria_periodo?: SerieDiariaItem[]
}

export interface SerieDiariaItem {
  data: string
  dia: number
  label: string
  pedidos_validos: number
  valor_vendas: number
  pedidos_cancelados: number
  propostas_total: number
  propostas_rascunho: number
  propostas_aguardando: number
  propostas_nao_aprovada: number
  propostas_convertida: number
}

export interface ObterDadosPainelParams {
  ano: number
  mes: MesFiltro
  dataInicioYmd?: string
  dataFimYmd?: string
  modoVisao?: 'origem' | 'fechamento'
  perfil?: PerfilUsuario
  usuarioId?: string
}

// Cache em memória de 2 minutos
const cacheComercial = new Map<string, { timestamp: number; data: DadosPainelComercialCompleto }>()
const CACHE_TTL_MS = 2 * 60 * 1000

export function limparCachePainel(): void {
  cacheComercial.clear()
}

/**
 * Consulta os dados comerciais consolidados no backend via /backend/v1/painel/comercial
 */
export async function obterDadosPainelComercial(
  params: ObterDadosPainelParams,
): Promise<DadosPainelComercialCompleto> {
  const cacheKey = `${params.ano}_${params.mes}_${params.dataInicioYmd || ''}_${params.dataFimYmd || ''}_${params.modoVisao || 'origem'}`
  const now = Date.now()
  const cached = cacheComercial.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const queryParams = new URLSearchParams()
  queryParams.set('ano', String(params.ano))
  queryParams.set('mes', String(params.mes))
  if (params.dataInicioYmd) queryParams.set('data_inicio', params.dataInicioYmd)
  if (params.dataFimYmd) queryParams.set('data_fim', params.dataFimYmd)
  if (params.modoVisao) queryParams.set('modo_visao', params.modoVisao)

  const url = `/backend/v1/painel/comercial?${queryParams.toString()}`
  const res = await pb.send<DadosPainelComercialCompleto>(url, {
    method: 'GET',
    requestKey: null,
  })

  if (res && res.success) {
    cacheComercial.set(cacheKey, { timestamp: now, data: res })
  }

  return res
}
