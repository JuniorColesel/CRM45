import pb from '@/lib/pocketbase/client'
import type { PerfilUsuario } from '@/contexts/AuthContext'
import type { EtapaFunilModel, OportunidadeModel } from '@/types/clientes'

export interface PainelKpis {
  totalClientes: number
  variacaoClientes: number | null // percentual
  oportunidadesAberto: number
  variacaoOportunidades: number | null // percentual
  valorPipeline: number
  variacaoPipeline: number | null // percentual
  vendasPeriodo: number
  variacaoVendas: number | null // percentual
  taxaConversao: number // percentual (ex: 25.5)
  variacaoConversaoPontos: number | null // pontos percentuais vs anterior
  ticketMedio: number
  variacaoTicketMedio: number | null // percentual
}

export interface FunilGraficoItem {
  etapaId: string
  etapaNome: string
  quantidade: number
  cor: string
  ordem: number
}

export interface VendasMesGraficoItem {
  mesAno: string
  nomeMes: string
  ano: number
  mes: number
  valor: number
}

export interface TopVendedorGraficoItem {
  usuarioId: string
  nome: string
  valor: number
  quantidade: number
}

export interface StatusOportunidadesGraficoItem {
  etapaId: string
  nome: string
  quantidade: number
  percentual: number
  cor: string
}

export type TipoAlertaPainel =
  | 'followup_hoje'
  | 'cliente_sem_contato'
  | 'oportunidade_parada'
  | 'meta_mes'

export interface AlertaPainel {
  id: string
  tipo: TipoAlertaPainel
  prioridade: number // 1 (urgente/vermelho), 2 (pendente/amarelo), 3 (meta/verde ou neutro)
  iconeCor: 'vermelho' | 'amarelo' | 'verde' | 'azul'
  titulo: string
  descricao: string
  linkDestino: string
  linkRotulo?: string
}

export interface DadosPainelGeral {
  kpis: PainelKpis
  graficoFunil: FunilGraficoItem[]
  graficoVendasPorMes: VendasMesGraficoItem[]
  graficoTopVendedores: TopVendedorGraficoItem[]
  graficoStatusOportunidades: StatusOportunidadesGraficoItem[]
  totalOportunidadesStatus: number
  alertas: AlertaPainel[]
}

// Cache em memória de 5 minutos (staleTime 5 min)
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  timestamp: number
  data: DadosPainelGeral
}

const memoryCache = new Map<string, CacheEntry>()

export function limparCachePainel(): void {
  memoryCache.clear()
}

/**
 * Constrói o filtro de escopo do usuário para PocketBase
 */
export function construirFiltroEscopo(
  perfil?: PerfilUsuario,
  usuarioId?: string,
  campoResponsavel = 'responsavel_id',
): string {
  if (!perfil) return ''

  if (perfil === 'ceo_financeiro') {
    return '' // global
  }

  if (perfil === 'coordenador_vendas') {
    // Vê dados dos vendedores (vendedor_1, vendedor_2) + os dele próprio
    // No PocketBase relation: responsavel_id.perfil in ('vendedor_1', 'vendedor_2') || responsavel_id = '...'
    if (usuarioId) {
      return `(${campoResponsavel}.perfil = 'vendedor_1' || ${campoResponsavel}.perfil = 'vendedor_2' || ${campoResponsavel} = '${usuarioId}')`
    }
    return `(${campoResponsavel}.perfil = 'vendedor_1' || ${campoResponsavel}.perfil = 'vendedor_2')`
  }

  if (perfil === 'vendedor_1' || perfil === 'vendedor_2') {
    return usuarioId ? `${campoResponsavel} = '${usuarioId}'` : ''
  }

  // compras_grandes_clientes ou estoque
  return ''
}

/**
 * Retorna os limites UTC no formato "YYYY-MM-DD HH:mm:ss"
 */
function formatarDataIsoFiltro(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

export interface IntervaloDatas {
  inicio: Date
  fim: Date
  inicioAnterior: Date
  fimAnterior: Date
}

export function calcularIntervaloDatas(
  tipoPredefinido: string,
  anoRef: number,
  mesRef: number,
): IntervaloDatas {
  const agora = new Date()

  if (tipoPredefinido === 'mes_passado') {
    let a = agora.getFullYear()
    let m = agora.getMonth() // 0-based para o mês passado
    if (m === 0) {
      m = 12
      a -= 1
    }
    const dInicio = new Date(Date.UTC(a, m - 1, 1, 0, 0, 0))
    const ultDia = new Date(Date.UTC(a, m, 0, 23, 59, 59, 999))

    // Anterior: 2 meses atrás
    let aAnt = a
    let mAnt = m - 1
    if (mAnt === 0) {
      mAnt = 12
      aAnt -= 1
    }
    const dInicioAnt = new Date(Date.UTC(aAnt, mAnt - 1, 1, 0, 0, 0))
    const ultDiaAnt = new Date(Date.UTC(aAnt, mAnt, 0, 23, 59, 59, 999))

    return {
      inicio: dInicio,
      fim: ultDia,
      inicioAnterior: dInicioAnt,
      fimAnterior: ultDiaAnt,
    }
  }

  if (tipoPredefinido === 'ultimos_3_meses') {
    const dFim = new Date(
      Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59),
    )
    const dInicio = new Date(dFim.getTime() - 90 * 24 * 60 * 60 * 1000)
    const duracao = dFim.getTime() - dInicio.getTime()
    const dFimAnt = new Date(dInicio.getTime() - 1)
    const dInicioAnt = new Date(dFimAnt.getTime() - duracao)

    return {
      inicio: dInicio,
      fim: dFim,
      inicioAnterior: dInicioAnt,
      fimAnterior: dFimAnt,
    }
  }

  if (tipoPredefinido === 'ultimos_6_meses') {
    const dFim = new Date(
      Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59),
    )
    const dInicio = new Date(dFim.getTime() - 180 * 24 * 60 * 60 * 1000)
    const duracao = dFim.getTime() - dInicio.getTime()
    const dFimAnt = new Date(dInicio.getTime() - 1)
    const dInicioAnt = new Date(dFimAnt.getTime() - duracao)

    return {
      inicio: dInicio,
      fim: dFim,
      inicioAnterior: dInicioAnt,
      fimAnterior: dFimAnt,
    }
  }

  if (tipoPredefinido === 'ano_corrente') {
    const a = agora.getFullYear()
    const dInicio = new Date(Date.UTC(a, 0, 1, 0, 0, 0))
    const dFim = new Date(Date.UTC(a, 11, 31, 23, 59, 59))

    const dInicioAnt = new Date(Date.UTC(a - 1, 0, 1, 0, 0, 0))
    const dFimAnt = new Date(Date.UTC(a - 1, 11, 31, 23, 59, 59))

    return {
      inicio: dInicio,
      fim: dFim,
      inicioAnterior: dInicioAnt,
      fimAnterior: dFimAnt,
    }
  }

  // Padrão ou personalizado: anoRef e mesRef selecionados
  const a = anoRef
  const m = mesRef
  const dInicio = new Date(Date.UTC(a, m - 1, 1, 0, 0, 0))
  const ultDia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const dFim = new Date(Date.UTC(a, m - 1, ultDia, 23, 59, 59, 999))

  // Mês imediatamente anterior
  let aAnt = a
  let mAnt = m - 1
  if (mAnt === 0) {
    mAnt = 12
    aAnt -= 1
  }
  const dInicioAnt = new Date(Date.UTC(aAnt, mAnt - 1, 1, 0, 0, 0))
  const ultDiaAnt = new Date(Date.UTC(aAnt, mAnt, 0)).getUTCDate()
  const dFimAnt = new Date(Date.UTC(aAnt, mAnt - 1, ultDiaAnt, 23, 59, 59, 999))

  return {
    inicio: dInicio,
    fim: dFim,
    inicioAnterior: dInicioAnt,
    fimAnterior: dFimAnt,
  }
}

/**
 * Busca e calcula todos os dados do painel geral de forma agregada
 */
export async function obterDadosPainel(params: {
  tipoPeriodo: string
  ano: number
  mes: number
  perfil?: PerfilUsuario
  usuarioId?: string
}): Promise<DadosPainelGeral> {
  const cacheKey = `${params.tipoPeriodo}_${params.ano}_${params.mes}_${params.perfil || ''}_${params.usuarioId || ''}`
  const now = Date.now()

  const cached = memoryCache.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const intervalo = calcularIntervaloDatas(params.tipoPeriodo, params.ano, params.mes)
  const inicioStr = formatarDataIsoFiltro(intervalo.inicio)
  const fimStr = formatarDataIsoFiltro(intervalo.fim)
  const inicioAntStr = formatarDataIsoFiltro(intervalo.inicioAnterior)
  const fimAntStr = formatarDataIsoFiltro(intervalo.fimAnterior)

  const escopoOp = construirFiltroEscopo(params.perfil, params.usuarioId, 'responsavel_id')
  const escopoCli = construirFiltroEscopo(params.perfil, params.usuarioId, 'responsavel_id')

  // 1. Carregar etapas do funil para cores e ordenação
  let etapas: EtapaFunilModel[] = []
  try {
    etapas = await pb.collection('etapas_funil').getFullList<EtapaFunilModel>({
      sort: 'ordem',
      requestKey: null,
    })
  } catch (e) {
    console.error('Erro ao carregar etapas_funil:', e)
  }

  // Mapear etapas por ID e por nome normalizado
  const mapaEtapasId = new Map<string, EtapaFunilModel>()
  etapas.forEach((et) => mapaEtapasId.set(et.id, et))

  // 2. Total de clientes ativos: clientes com pelo menos 1 registro de contato (ligação ou tarefa)
  // Fazemos a agregação de IDs distintos de clientes em ligações e tarefas
  let totalClientesAtivos = 0
  let totalClientesAtivosAnterior = 0

  try {
    const condLigAtual = [`data_hora <= '${fimStr}'`]
    if (escopoCli) condLigAtual.push(escopoCli)
    const ligs = await pb.collection('ligacoes').getFullList({
      filter: condLigAtual.join(' && '),
      fields: 'cliente_id',
      requestKey: null,
    })

    const condTarAtual = [`data_hora <= '${fimStr}'`]
    if (escopoCli) condTarAtual.push(escopoCli)
    const tars = await pb.collection('tarefas').getFullList({
      filter: condTarAtual.join(' && '),
      fields: 'cliente_id',
      requestKey: null,
    })

    const setClientesAtivos = new Set<string>()
    ligs.forEach((l) => {
      const cid = (l as unknown as { cliente_id?: string }).cliente_id
      if (cid) setClientesAtivos.add(cid)
    })
    tars.forEach((t) => {
      const cid = (t as unknown as { cliente_id?: string }).cliente_id
      if (cid) setClientesAtivos.add(cid)
    })
    totalClientesAtivos = setClientesAtivos.size

    // Período anterior para variação
    const condLigAnt = [`data_hora <= '${fimAntStr}'`]
    if (escopoCli) condLigAnt.push(escopoCli)
    const ligsAnt = await pb.collection('ligacoes').getFullList({
      filter: condLigAnt.join(' && '),
      fields: 'cliente_id',
      requestKey: null,
    })

    const condTarAnt = [`data_hora <= '${fimAntStr}'`]
    if (escopoCli) condTarAnt.push(escopoCli)
    const tarsAnt = await pb.collection('tarefas').getFullList({
      filter: condTarAnt.join(' && '),
      fields: 'cliente_id',
      requestKey: null,
    })

    const setClientesAnt = new Set<string>()
    ligsAnt.forEach((l) => {
      const cid = (l as unknown as { cliente_id?: string }).cliente_id
      if (cid) setClientesAnt.add(cid)
    })
    tarsAnt.forEach((t) => {
      const cid = (t as unknown as { cliente_id?: string }).cliente_id
      if (cid) setClientesAnt.add(cid)
    })
    totalClientesAtivosAnterior = setClientesAnt.size
  } catch (e) {
    console.error('Erro ao calcular clientes ativos:', e)
  }

  // 3. Oportunidades em Aberto e Valor em Pipeline
  // Etapas abertas no funil: Prospecção, Qualificação, Proposta, Negociação (ou status = 'aberto')
  let countAbertasAtual = 0
  let valorPipelineAtual = 0
  let countAbertasAnterior = 0
  let valorPipelineAnterior = 0
  let listaOpsAbertas: OportunidadeModel[] = []

  try {
    // Para métricas do painel comercial CRM, considerar apenas oportunidades CRM (evitar que 2.000 propostas importadas inflem o pipeline nativo)
    const condOpsAbertas = ["status = 'aberto'", "(origem = '' || origem = 'crm')"]
    if (escopoOp) condOpsAbertas.push(escopoOp)

    listaOpsAbertas = await pb.collection('oportunidades').getFullList<OportunidadeModel>({
      filter: condOpsAbertas.join(' && '),
      fields: 'id,valor,etapa_id,responsavel_id,cliente_id,created,data_prevista_fechamento',
      requestKey: null,
    })

    countAbertasAtual = listaOpsAbertas.length
    valorPipelineAtual = listaOpsAbertas.reduce((acc, curr) => acc + (curr.valor || 0), 0)

    // Oportunidades abertas no fechamento do período anterior
    const opsAbertasAnt = listaOpsAbertas.filter((op) => {
      const dataCriada = op.created ? new Date(op.created) : null
      return dataCriada && dataCriada <= intervalo.fimAnterior
    })
    countAbertasAnterior = opsAbertasAnt.length
    valorPipelineAnterior = opsAbertasAnt.reduce((acc, curr) => acc + (curr.valor || 0), 0)
  } catch (e) {
    console.error('Erro ao carregar oportunidades em aberto:', e)
  }

  // 4. Vendas do Período (status = 'ganho') e Fechadas (ganho + perdido)
  let somaVendasAtual = 0
  let qtdVendasGanhasAtual = 0
  let qtdFechadasAtual = 0

  let somaVendasAnterior = 0
  let qtdVendasGanhasAnterior = 0
  let qtdFechadasAnterior = 0

  // Guardar todas as ganhas do período atual para gráficos de top vendedores e histórico
  let opsGanhasPeriodo: OportunidadeModel[] = []

  try {
    // Filtro para ganhas e perdidas no período atual
    // Data de fechamento ou created
    const condGanhasAtual = [
      "status = 'ganho'",
      "(origem = '' || origem = 'crm')",
      `((data_fechamento >= '${inicioStr}' && data_fechamento <= '${fimStr}') || (data_fechamento = '' && created >= '${inicioStr}' && created <= '${fimStr}'))`,
    ]
    if (escopoOp) condGanhasAtual.push(escopoOp)

    opsGanhasPeriodo = await pb.collection('oportunidades').getFullList<OportunidadeModel>({
      filter: condGanhasAtual.join(' && '),
      expand: 'responsavel_id',
      requestKey: null,
    })

    somaVendasAtual = opsGanhasPeriodo.reduce((acc, curr) => acc + (curr.valor || 0), 0)
    qtdVendasGanhasAtual = opsGanhasPeriodo.length

    // Perdidas no período atual
    const condPerdidasAtual = [
      "status = 'perdido'",
      "(origem = '' || origem = 'crm')",
      `((data_fechamento >= '${inicioStr}' && data_fechamento <= '${fimStr}') || (data_fechamento = '' && created >= '${inicioStr}' && created <= '${fimStr}'))`,
    ]
    if (escopoOp) condPerdidasAtual.push(escopoOp)

    const opsPerdidasAtual = await pb.collection('oportunidades').getFullList<OportunidadeModel>({
      filter: condPerdidasAtual.join(' && '),
      fields: 'id',
      requestKey: null,
    })
    qtdFechadasAtual = qtdVendasGanhasAtual + opsPerdidasAtual.length

    // Período anterior
    const condGanhasAnt = [
      "status = 'ganho'",
      "(origem = '' || origem = 'crm')",
      `((data_fechamento >= '${inicioAntStr}' && data_fechamento <= '${fimAntStr}') || (data_fechamento = '' && created >= '${inicioAntStr}' && created <= '${fimAntStr}'))`,
    ]
    if (escopoOp) condGanhasAnt.push(escopoOp)

    const opsGanhasAnt = await pb.collection('oportunidades').getFullList<OportunidadeModel>({
      filter: condGanhasAnt.join(' && '),
      fields: 'valor',
      requestKey: null,
    })
    somaVendasAnterior = opsGanhasAnt.reduce((acc, curr) => acc + (curr.valor || 0), 0)
    qtdVendasGanhasAnterior = opsGanhasAnt.length

    const condPerdidasAnt = [
      "status = 'perdido'",
      "(origem = '' || origem = 'crm')",
      `((data_fechamento >= '${inicioAntStr}' && data_fechamento <= '${fimAntStr}') || (data_fechamento = '' && created >= '${inicioAntStr}' && created <= '${fimAntStr}'))`,
    ]
    if (escopoOp) condPerdidasAnt.push(escopoOp)

    const opsPerdidasAnt = await pb.collection('oportunidades').getFullList<OportunidadeModel>({
      filter: condPerdidasAnt.join(' && '),
      fields: 'id',
      requestKey: null,
    })
    qtdFechadasAnterior = qtdVendasGanhasAnterior + opsPerdidasAnt.length
  } catch (e) {
    console.error('Erro ao calcular vendas:', e)
  }

  // 5. Taxa de Conversão e Ticket Médio
  const taxaConversaoAtual =
    qtdFechadasAtual > 0 ? (qtdVendasGanhasAtual / qtdFechadasAtual) * 100 : 0
  const taxaConversaoAnterior =
    qtdFechadasAnterior > 0 ? (qtdVendasGanhasAnterior / qtdFechadasAnterior) * 100 : 0
  const variacaoConversaoPontos =
    qtdFechadasAnterior > 0 || qtdFechadasAtual > 0
      ? Number((taxaConversaoAtual - taxaConversaoAnterior).toFixed(1))
      : null

  const ticketMedioAtual = qtdVendasGanhasAtual > 0 ? somaVendasAtual / qtdVendasGanhasAtual : 0
  const ticketMedioAnterior =
    qtdVendasGanhasAnterior > 0 ? somaVendasAnterior / qtdVendasGanhasAnterior : 0

  // Cálculo das variações percentuais: (atual - anterior) / anterior * 100
  const calcVariacaoPercentual = (atual: number, anterior: number): number | null => {
    if (anterior === 0) {
      return atual > 0 ? 100 : null
    }
    return Number((((atual - anterior) / anterior) * 100).toFixed(1))
  }

  const kpis: PainelKpis = {
    totalClientes: totalClientesAtivos,
    variacaoClientes: calcVariacaoPercentual(totalClientesAtivos, totalClientesAtivosAnterior),
    oportunidadesAberto: countAbertasAtual,
    variacaoOportunidades: calcVariacaoPercentual(countAbertasAtual, countAbertasAnterior),
    valorPipeline: valorPipelineAtual,
    variacaoPipeline: calcVariacaoPercentual(valorPipelineAtual, valorPipelineAnterior),
    vendasPeriodo: somaVendasAtual,
    variacaoVendas: calcVariacaoPercentual(somaVendasAtual, somaVendasAnterior),
    taxaConversao: Number(taxaConversaoAtual.toFixed(1)),
    variacaoConversaoPontos,
    ticketMedio: ticketMedioAtual,
    variacaoTicketMedio: calcVariacaoPercentual(ticketMedioAtual, ticketMedioAnterior),
  }

  // 6. Gráfico 1: Funil de Vendas (barras horizontais, Y = etapas: Prospecção, Qualificação, Proposta, Negociação, Ganha, Perdida)
  // X = quantidade em cada etapa; cores em gradiente do claro ao escuro, vermelho para perdida
  let todasOportunidadesPeriodo: OportunidadeModel[] = []
  try {
    const condTodas = ["(origem = '' || origem = 'crm')"]
    if (escopoOp) condTodas.push(escopoOp)
    todasOportunidadesPeriodo = await pb
      .collection('oportunidades')
      .getFullList<OportunidadeModel>({
        filter: condTodas.join(' && '),
        fields:
          'id,etapa_id,status,valor,responsavel_id,created,data_fechamento,data_prevista_fechamento',
        expand: 'etapa_id,responsavel_id',
        requestKey: null,
      })
  } catch (e) {
    console.error('Erro ao carregar todas as oportunidades:', e)
  }

  // Contagem por etapa
  // Cores especificadas: gradiente do mais claro (Prospecção) ao mais escuro (Ganha), vermelho para Perdida
  const gradienteEtapas: Record<string, string> = {
    prospeccao: '#93C5FD', // Azul claro
    qualificacao: '#60A5FA', // Azul intermediário
    proposta: '#3B82F6', // Azul padrão
    negociacao: '#1D4ED8', // Azul escuro
    fechado: '#16A34A', // Verde ganho
    ganha: '#16A34A',
    ganho: '#16A34A',
    perdida: '#DC2626', // Vermelho
    perdido: '#DC2626',
  }

  // Prepara as 6 etapas padrão
  const etapasPadraoNomes = [
    { chave: 'prospeccao', nome: 'Prospecção', cor: '#93C5FD', ordem: 1 },
    { chave: 'qualificacao', nome: 'Qualificação', cor: '#60A5FA', ordem: 2 },
    { chave: 'proposta', nome: 'Proposta', cor: '#3B82F6', ordem: 3 },
    { chave: 'negociacao', nome: 'Negociação', cor: '#1D4ED8', ordem: 4 },
    { chave: 'ganha', nome: 'Ganha', cor: '#16A34A', ordem: 5 },
    { chave: 'perdida', nome: 'Perdida', cor: '#DC2626', ordem: 6 },
  ]

  const contagemEtapas = new Map<string, number>()
  etapasPadraoNomes.forEach((ep) => contagemEtapas.set(ep.chave, 0))

  todasOportunidadesPeriodo.forEach((op) => {
    if (op.status === 'ganho') {
      contagemEtapas.set('ganha', (contagemEtapas.get('ganha') || 0) + 1)
      return
    }
    if (op.status === 'perdido') {
      contagemEtapas.set('perdida', (contagemEtapas.get('perdida') || 0) + 1)
      return
    }

    // Aberta: verifica o nome da etapa
    const nomeEtapa = (
      op.expand?.etapa_id?.nome ||
      mapaEtapasId.get(op.etapa_id)?.nome ||
      ''
    ).toLowerCase()

    if (nomeEtapa.includes('prospec')) {
      contagemEtapas.set('prospeccao', (contagemEtapas.get('prospeccao') || 0) + 1)
    } else if (nomeEtapa.includes('qualif')) {
      contagemEtapas.set('qualificacao', (contagemEtapas.get('qualificacao') || 0) + 1)
    } else if (nomeEtapa.includes('propost')) {
      contagemEtapas.set('proposta', (contagemEtapas.get('proposta') || 0) + 1)
    } else if (nomeEtapa.includes('negoc')) {
      contagemEtapas.set('negociacao', (contagemEtapas.get('negociacao') || 0) + 1)
    } else {
      // Fallback para prospecção se não identificar
      contagemEtapas.set('prospeccao', (contagemEtapas.get('prospeccao') || 0) + 1)
    }
  })

  const graficoFunil: FunilGraficoItem[] = etapasPadraoNomes.map((ep) => ({
    etapaId: ep.chave,
    etapaNome: ep.nome,
    quantidade: contagemEtapas.get(ep.chave) || 0,
    cor: ep.cor,
    ordem: ep.ordem,
  }))

  // 7. Gráfico 2: Vendas por Mês — linha; X = últimos 6 meses (nome do mês); Y = total de vendas ganhas no mês (R$)
  const nomesMesesPt = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ]
  const ultimos6MesesList: Array<{ ano: number; mes: number; nome: string; mesAno: string }> = []
  const dataHoje = new Date()

  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(dataHoje.getFullYear(), dataHoje.getMonth() - i, 1))
    const anoM = d.getUTCFullYear()
    const mesM = d.getUTCMonth() + 1
    ultimos6MesesList.push({
      ano: anoM,
      mes: mesM,
      nome: nomesMesesPt[mesM - 1],
      mesAno: `${nomesMesesPt[mesM - 1]}/${String(anoM).slice(-2)}`,
    })
  }

  // Filtrar oportunidades ganhas em cada um dos 6 meses
  const graficoVendasPorMes: VendasMesGraficoItem[] = ultimos6MesesList.map((mItem) => {
    const mesFormatado = String(mItem.mes).padStart(2, '0')
    const ultDia = new Date(Date.UTC(mItem.ano, mItem.mes, 0)).getUTCDate()
    const iniYmd = `${mItem.ano}-${mesFormatado}-01`
    const fimYmd = `${mItem.ano}-${mesFormatado}-${String(ultDia).padStart(2, '0')}`

    const opsNoMes = todasOportunidadesPeriodo.filter((op) => {
      if (op.status !== 'ganho') return false
      const dataRef = (op.data_fechamento || op.created || '').substring(0, 10)
      return dataRef >= iniYmd && dataRef <= fimYmd
    })

    const valorTotalMes = opsNoMes.reduce((acc, curr) => acc + (curr.valor || 0), 0)

    return {
      mesAno: mItem.mesAno,
      nomeMes: mItem.nome,
      ano: mItem.ano,
      mes: mItem.mes,
      valor: valorTotalMes,
    }
  })

  // 8. Gráfico 3: Top Vendedores — barras verticais; X = top 5 vendedores; Y = valor total ganho no período
  // Respeitando as regras de perfil:
  // - ceo_financeiro vê todos
  // - coordenador_vendas vê apenas os vendedores (vendedor_1, vendedor_2)
  // - vendedor_1/vendedor_2 vê apenas ele próprio (se estiver no top 5)
  // - compras/estoque: restrito (não vê)
  const mapaVendedores = new Map<
    string,
    { usuarioId: string; nome: string; perfil: string; valor: number; quantidade: number }
  >()

  opsGanhasPeriodo.forEach((op) => {
    const u = op.expand?.responsavel_id as
      | { id?: string; nome?: string; perfil?: string }
      | undefined
    const uid = op.responsavel_id || u?.id || 'desconhecido'
    const nome = u?.nome || 'Vendedor'
    const perfilU = u?.perfil || ''

    // Se usuário logado for vendedor, só conta dele próprio
    if (
      (params.perfil === 'vendedor_1' || params.perfil === 'vendedor_2') &&
      uid !== params.usuarioId
    ) {
      return
    }

    // Se for coordenador de vendas, só conta vendedores ou ele próprio
    if (params.perfil === 'coordenador_vendas') {
      const isVend =
        perfilU === 'vendedor_1' || perfilU === 'vendedor_2' || uid === params.usuarioId
      if (!isVend) return
    }

    const item = mapaVendedores.get(uid) || {
      usuarioId: uid,
      nome,
      perfil: perfilU,
      valor: 0,
      quantidade: 0,
    }
    item.valor += op.valor || 0
    item.quantidade += 1
    mapaVendedores.set(uid, item)
  })

  // Ordena do maior para o menor e pega top 5
  const graficoTopVendedores: TopVendedorGraficoItem[] = Array.from(mapaVendedores.values())
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map((v) => ({
      usuarioId: v.usuarioId,
      nome: v.nome,
      valor: v.valor,
      quantidade: v.quantidade,
    }))

  // 9. Gráfico 4: Status das Oportunidades — donut; fatias = 6 etapas (Prospecção, Qualificação, Proposta, Negociação, Ganha, Perdida)
  // Legenda ao lado com quantidade e % de cada fatia; centro = total de oportunidades
  const totalOportunidadesStatus = graficoFunil.reduce((acc, curr) => acc + curr.quantidade, 0)
  const graficoStatusOportunidades: StatusOportunidadesGraficoItem[] = graficoFunil.map((f) => ({
    etapaId: f.etapaId,
    nome: f.etapaNome,
    quantidade: f.quantidade,
    percentual:
      totalOportunidadesStatus > 0
        ? Number(((f.quantidade / totalOportunidadesStatus) * 100).toFixed(1))
        : 0,
    cor: f.cor,
  }))

  // 10. Alertas (até 10 alertas ordenados por prioridade, mais urgente primeiro)
  // Tipos:
  // Tipo 1: Follow-ups pendentes hoje
  // Tipo 2: Clientes sem contato há 7+ dias
  // Tipo 3: Oportunidades paradas há 5+ dias
  // Tipo 4: Meta do mês
  const alertas: AlertaPainel[] = []
  const hojeYmd = new Date().toISOString().substring(0, 10)
  const agoraMs = Date.now()
  const msDia = 24 * 60 * 60 * 1000
  const seteDiasAtras = new Date(agoraMs - 7 * msDia)
  const cincoDiasAtras = new Date(agoraMs - 5 * msDia)

  try {
    // Alerta Tipo 1: Follow-ups pendentes hoje (ligações agendadas ou tarefas hoje não concluídas)
    const condTarefasHoje = [
      'concluida = false',
      `data_hora >= '${hojeYmd} 00:00:00'`,
      `data_hora <= '${hojeYmd} 23:59:59'`,
    ]
    if (escopoCli) condTarefasHoje.push(escopoCli)
    const tarefasHoje = await pb.collection('tarefas').getFullList({
      filter: condTarefasHoje.join(' && '),
      requestKey: null,
    })

    const condLigacoesHoje = [
      `data_proxima_acao >= '${hojeYmd} 00:00:00'`,
      `data_proxima_acao <= '${hojeYmd} 23:59:59'`,
    ]
    if (escopoCli) condLigacoesHoje.push(escopoCli)
    const ligacoesHoje = await pb.collection('ligacoes').getFullList({
      filter: condLigacoesHoje.join(' && '),
      requestKey: null,
    })

    const totalFollowUpsHoje = tarefasHoje.length + ligacoesHoje.length
    if (totalFollowUpsHoje > 0) {
      alertas.push({
        id: 'alerta-followup-hoje',
        tipo: 'followup_hoje',
        prioridade: 1, // muito urgente
        iconeCor: 'amarelo',
        titulo: `${totalFollowUpsHoje} follow-up${totalFollowUpsHoje > 1 ? 's' : ''} pendente${totalFollowUpsHoje > 1 ? 's' : ''} hoje`,
        descricao: `Você tem ${totalFollowUpsHoje} ligação/tarefa agendada para hoje que requer atenção imediata.`,
        linkDestino: '/follow-up?filtro=hoje',
        linkRotulo: 'Ver follow-ups',
      })
    }

    // Alerta Tipo 2: Clientes sem contato há 7+ dias
    // Busca clientes e checa se têm contato nos últimos 7 dias
    const condClientes = []
    if (escopoCli) condClientes.push(escopoCli)
    const clientesBase = await pb.collection('clientes').getList(1, 100, {
      filter: condClientes.length > 0 ? condClientes.join(' && ') : undefined,
      sort: '-created',
      requestKey: null,
    })

    const todasLigs7d = await pb.collection('ligacoes').getFullList({
      filter: `data_hora >= '${formatarDataIsoFiltro(seteDiasAtras)}'`,
      fields: 'cliente_id',
      requestKey: null,
    })
    const todasTars7d = await pb.collection('tarefas').getFullList({
      filter: `concluida = true && (data_conclusao >= '${formatarDataIsoFiltro(seteDiasAtras)}' || data_hora >= '${formatarDataIsoFiltro(seteDiasAtras)}')`,
      fields: 'cliente_id',
      requestKey: null,
    })

    const clientesComContatoRecente = new Set<string>()
    todasLigs7d.forEach((l) => {
      const cid = (l as unknown as { cliente_id?: string }).cliente_id
      if (cid) clientesComContatoRecente.add(cid)
    })
    todasTars7d.forEach((t) => {
      const cid = (t as unknown as { cliente_id?: string }).cliente_id
      if (cid) clientesComContatoRecente.add(cid)
    })

    const clientesSemContato7d = clientesBase.items.filter(
      (c) => !clientesComContatoRecente.has(c.id),
    )

    if (clientesSemContato7d.length > 0) {
      alertas.push({
        id: 'alerta-sem-contato-7d',
        tipo: 'cliente_sem_contato',
        prioridade: 2,
        iconeCor: 'vermelho',
        titulo: `${clientesSemContato7d.length} cliente${clientesSemContato7d.length > 1 ? 's' : ''} sem contato há 7+ dias`,
        descricao:
          'Clientes da carteira que precisam de atenção e reativação de relacionamento comercial.',
        linkDestino: '/follow-up?filtro=sem_contato',
        linkRotulo: 'Ver clientes',
      })
    }

    // Alerta Tipo 3: Oportunidades paradas há 5+ dias (abertas sem tarefa recente)
    // Compras e estoque não veem alertas de oportunidades
    if (params.perfil !== 'compras_grandes_clientes' && params.perfil !== 'estoque') {
      const tarsUltimos5d = await pb.collection('tarefas').getFullList({
        filter: `created >= '${formatarDataIsoFiltro(cincoDiasAtras)}' || data_hora >= '${formatarDataIsoFiltro(cincoDiasAtras)}'`,
        fields: 'cliente_id',
        requestKey: null,
      })
      const clientesComTarefa5d = new Set<string>()
      tarsUltimos5d.forEach((t) => {
        const cid = (t as unknown as { cliente_id?: string }).cliente_id
        if (cid) clientesComTarefa5d.add(cid)
      })

      const opsAbertasParadas = listaOpsAbertas.filter((op) => {
        const clienteId = op.cliente_id
        return !clienteId || !clientesComTarefa5d.has(clienteId)
      })

      if (opsAbertasParadas.length > 0) {
        alertas.push({
          id: 'alerta-ops-paradas-5d',
          tipo: 'oportunidade_parada',
          prioridade: 2,
          iconeCor: 'vermelho',
          titulo: `${opsAbertasParadas.length} oportunidade${opsAbertasParadas.length > 1 ? 's' : ''} parada${opsAbertasParadas.length > 1 ? 's' : ''} há 5+ dias`,
          descricao: 'Propostas comerciais sem evolução que precisam de movimento e cobrança.',
          linkDestino: '/funil?filtro=paradas',
          linkRotulo: 'Ver no funil',
        })
      }

      // Alerta Tipo 4: Meta do mês
      // Busca a meta do mês atual
      const anoHoje = new Date().getFullYear()
      const mesHoje = new Date().getMonth() + 1
      const condMeta = [`ano = ${anoHoje}`, `mes = ${mesHoje}`]
      if (params.perfil === 'vendedor_1' || params.perfil === 'vendedor_2') {
        if (params.usuarioId) condMeta.push(`usuario_id = '${params.usuarioId}'`)
      }

      // Busca a meta geral do mês atual
      const metasRes = await pb.collection('metas').getFullList({
        filter: `ano = ${anoHoje} && mes = ${mesHoje}`,
        requestKey: null,
      })

      if (metasRes.length > 0) {
        const metaAtual = metasRes[0] as unknown as {
          meta_geral?: number
          valor_atingido?: number
          valor_meta?: number
          meta_oportunidades?: number
        }

        const metaValorTotal = metaAtual.meta_geral || metaAtual.valor_meta || 0
        const valorAtingidoMeta = metaAtual.valor_atingido || somaVendasAtual
        const metaOpsTotal = metaAtual.meta_oportunidades || 0

        const pctValor = metaValorTotal > 0 ? (somaVendasAtual / metaValorTotal) * 100 : 0
        const isBatida = pctValor >= 100

        const fmtValor = (v: number) =>
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

        alertas.push({
          id: 'alerta-meta-mes',
          tipo: 'meta_mes',
          prioridade: isBatida ? 4 : 3,
          iconeCor: isBatida ? 'verde' : 'amarelo',
          titulo: `Meta do mês: ${pctValor.toFixed(0)}% concluída`,
          descricao: `Valor: ${fmtValor(valorAtingidoMeta)} de ${fmtValor(metaValorTotal)}${metaOpsTotal > 0 ? ` | Oportunidades: ${qtdVendasGanhasAtual} de ${metaOpsTotal}` : ''}`,
          linkDestino: '/metas',
          linkRotulo: 'Ver metas',
        })
      }
    }
  } catch (e) {
    console.error('Erro ao calcular alertas:', e)
  }

  // Ordena alertas por prioridade e limita a 10
  alertas.sort((a, b) => a.prioridade - b.prioridade)
  const alertasFinais = alertas.slice(0, 10)

  const resultado: DadosPainelGeral = {
    kpis,
    graficoFunil,
    graficoVendasPorMes,
    graficoTopVendedores,
    graficoStatusOportunidades,
    totalOportunidadesStatus,
    alertas: alertasFinais,
  }

  // Grava em cache
  memoryCache.set(cacheKey, {
    timestamp: now,
    data: resultado,
  })

  return resultado
}
