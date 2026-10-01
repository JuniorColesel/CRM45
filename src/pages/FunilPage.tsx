import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendingUp, Plus, RefreshCw, Layers, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type {
  ClienteModel,
  EtapaFunilModel,
  MotivoPerdaModel,
  OportunidadeModel,
} from '@/types/clientes'
import { podeEditarOportunidade } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import FunilResumoCards from '@/components/funil/FunilResumoCards'
import FunilFiltros, { type FunilFiltrosState } from '@/components/funil/FunilFiltros'
import KanbanBoard from '@/components/funil/KanbanBoard'
import OportunidadeModal from '@/components/funil/OportunidadeModal'
import OportunidadeDetalhesSheet from '@/components/funil/OportunidadeDetalhesSheet'
import { SeletorDePeriodo } from '@/components/common/SeletorDePeriodo'
import { usePeriodo } from '@/contexts/PeriodoContext'

const TAMANHO_PAGINA_COLUNA = 30

export default function FunilPage() {
  const { user } = useAuth()
  const { periodo, ano, mes, nomeMesAno, modoVisao } = usePeriodo()

  // Estados principais de dados
  const [etapas, setEtapas] = useState<EtapaFunilModel[]>([])
  const [oportunidadesPorEtapa, setOportunidadesPorEtapa] = useState<
    Record<string, OportunidadeModel[]>
  >({})
  const [paginasPorEtapa, setPaginasPorEtapa] = useState<Record<string, number>>({})
  const [temMaisPorEtapa, setTemMaisPorEtapa] = useState<Record<string, boolean>>({})
  const [carregandoPorEtapa, setCarregandoPorEtapa] = useState<Record<string, boolean>>({})

  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [motivosPerda, setMotivosPerda] = useState<MotivoPerdaModel[]>([])
  const [loading, setLoading] = useState(true)

  // Subtotais e métricas do BACKEND (agregados completos sobre todas as oportunidades)
  const [metricasBackend, setMetricasBackend] = useState<{
    success?: boolean
    totais?: { total_registros: number; total_valor: number }
    resumo?: {
      total_abertas: number
      valor_pipeline: number
      total_ganhas: number
      valor_ganhas: number
      total_perdidas: number
      valor_perdidas: number
      taxa_conversao: number
      ticket_medio: number
    }
    etapas?: Array<{
      etapa_id: string
      nome: string
      ordem: number
      cor: string
      quantidade: number
      valor_total: number
    }>
  } | null>(null)

  // Filtros em tempo real (com vendedorId ao invés de responsavelId no contexto comercial)
  const [filtros, setFiltros] = useState<FunilFiltrosState>({
    busca: '',
    vendedorId: 'todos',
    origem: 'todas',
    tipoOrigem: 'todos',
    status: 'todos',
  })

  // Modais e painel lateral
  const [modalOpen, setModalOpen] = useState(false)
  const [oportunidadeEditando, setOportunidadeEditando] = useState<OportunidadeModel | null>(null)
  const [etapaInicialModal, setEtapaInicialModal] = useState<string | undefined>(undefined)

  const [detalhesOpen, setDetalhesOpen] = useState(false)
  const [oportunidadeSelecionada, setOportunidadeSelecionada] = useState<OportunidadeModel | null>(
    null,
  )

  // Query params (suporte para abertura de modal e filtros vindos do /painel)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    // Parâmetro ?novo=1 abre modal de criação de oportunidade
    if (searchParams.get('novo') === '1') {
      setOportunidadeEditando(null)
      setEtapaInicialModal(etapas[0]?.id)
      setModalOpen(true)
      const novosParams = new URLSearchParams(searchParams)
      novosParams.delete('novo')
      setSearchParams(novosParams, { replace: true })
    }

    // Parâmetro ?filtro=paradas filtra oportunidades abertas
    if (searchParams.get('filtro') === 'paradas') {
      setFiltros((prev) => ({
        ...prev,
        status: 'aberto',
      }))
    }
  }, [searchParams, setSearchParams, etapas])

  // Constrói o filtro server-side para oportunidades considerando o período e os filtros aplicados
  const construirFiltroOportunidades = useCallback(() => {
    const condicoes: string[] = []

    // 1. Filtro por status
    if (filtros.status !== 'todos') {
      condicoes.push(`status = '${filtros.status}'`)
    }

    // 2. Filtro por Vendedor (suporte a sem_vendedor)
    if (filtros.vendedorId !== 'todos') {
      if (filtros.vendedorId === 'sem_vendedor' || filtros.vendedorId === 'sem_responsavel') {
        condicoes.push(
          "((vendedor = '' || vendedor = null) && (responsavel_id = '' || responsavel_id = null))",
        )
      } else {
        condicoes.push(
          `(vendedor = '${filtros.vendedorId}' || ((vendedor = '' || vendedor = null) && responsavel_id = '${filtros.vendedorId}'))`,
        )
      }
    }

    // 2.1 Filtro por Origem (crm | bling)
    if (filtros.origem !== 'todas') {
      if (filtros.origem === 'crm') {
        condicoes.push("(origem = '' || origem = 'crm')")
      } else {
        condicoes.push("origem = 'bling'")
      }
    }

    // 2.2 Filtro por Tipo de Origem (crm | bling_proposta | bling_pedido)
    if (filtros.tipoOrigem !== 'todos') {
      if (filtros.tipoOrigem === 'crm') {
        condicoes.push("(tipo_origem = '' || tipo_origem = 'crm')")
      } else {
        condicoes.push(`tipo_origem = '${filtros.tipoOrigem}'`)
      }
    }

    // 3 e 4. Filtro por Período e Data (modo Visão Origem vs Fechamento)
    // Fonte única de verdade: SeletorDePeriodo superior via PeriodoContext
    const efetivoInicioYmd = periodo.dataInicioYmd
    const efetivoFimYmd = periodo.dataFimYmd
    const iniIso = `${efetivoInicioYmd} 00:00:00`
    const fimIso = `${efetivoFimYmd} 23:59:59`

    if (efetivoInicioYmd && efetivoFimYmd) {
      if (modoVisao === 'fechamento') {
        // MODO FECHAMENTO:
        // Registros finalizados (ganhos/perdidos) usam data_fechamento no intervalo.
        // Registros em aberto usam data_prevista_fechamento no intervalo.
        const filtroFechamento = `((status != 'aberto' && ((data_fechamento >= '${efetivoInicioYmd}' && data_fechamento <= '${efetivoFimYmd}') || (data_fechamento >= '${iniIso}' && data_fechamento <= '${fimIso}'))) || (status = 'aberto' && ((data_prevista_fechamento >= '${efetivoInicioYmd}' && data_prevista_fechamento <= '${efetivoFimYmd}') || (data_prevista_fechamento >= '${iniIso}' && data_prevista_fechamento <= '${fimIso}'))))`
        condicoes.push(filtroFechamento)
      } else {
        // MODO ORIGEM:
        // O intervalo filtra estritamente por data_origem (ou created caso data_origem seja vazio)
        const filtroOrigem = `((data_origem != '' && data_origem >= '${efetivoInicioYmd}' && data_origem <= '${efetivoFimYmd}') || ((data_origem = '' || data_origem = null) && created >= '${iniIso}' && created <= '${fimIso}'))`
        condicoes.push(filtroOrigem)
      }
    }

    // 5. Busca textual
    if (filtros.busca.trim()) {
      const termo = filtros.busca.trim().replace(/'/g, "\\'")
      condicoes.push(
        `(cliente_id.nome_contato ~ '${termo}' || cliente_id.nome_empresa ~ '${termo}' || responsavel_id.nome ~ '${termo}')`,
      )
    }

    return condicoes.join(' && ')
  }, [filtros, periodo, modoVisao])

  // Carregar dados auxiliares (etapas, clientes, usuários, motivos)
  useEffect(() => {
    let cancelado = false
    async function carregarAuxiliares() {
      try {
        const [etapasRes, clientesRes, usuariosRes, motivosRes] = await Promise.all([
          pb.collection('etapas_funil').getFullList<EtapaFunilModel>({
            sort: 'ordem',
          }),
          pb.collection('clientes').getFullList<ClienteModel>({
            sort: 'nome_contato',
          }),
          pb
            .collection('usuarios')
            .getFullList<Usuario>({
              sort: 'nome',
            })
            .catch(() => (user ? [user] : [])),
          pb
            .collection('motivos_perda')
            .getFullList<MotivoPerdaModel>({
              sort: 'created',
            })
            .catch(() => []),
        ])
        if (!cancelado) {
          setEtapas(etapasRes)
          setClientes(clientesRes)
          setUsuarios(usuariosRes.length > 0 ? usuariosRes : user ? [user] : [])
          setMotivosPerda(motivosRes)
        }
      } catch (err: unknown) {
        console.error('Erro ao carregar auxiliares do funil:', err)
      }
    }
    carregarAuxiliares()
    return () => {
      cancelado = true
    }
  }, [user])

  // Carregar métricas agregadas do BACKEND (Etapa 3 do plano)
  const carregarMetricasBackend = useCallback(async () => {
    try {
      const efetivoInicioYmd = periodo.dataInicioYmd
      const efetivoFimYmd = periodo.dataFimYmd

      const queryParams = new URLSearchParams({
        modo_visao: modoVisao,
        data_inicio: efetivoInicioYmd || '',
        data_fim: efetivoFimYmd || '',
        vendedor_id: filtros.vendedorId || 'todos',
        origem: filtros.origem || 'todas',
        tipo_origem: filtros.tipoOrigem || 'todos',
        status: filtros.status || 'todos',
      })

      const res = await pb.send<{
        success: boolean
        totais: { total_registros: number; total_valor: number }
        resumo: {
          total_abertas: number
          valor_pipeline: number
          total_ganhas: number
          valor_ganhas: number
          total_perdidas: number
          valor_perdidas: number
          taxa_conversao: number
          ticket_medio: number
        }
        etapas: Array<{
          etapa_id: string
          nome: string
          ordem: number
          cor: string
          quantidade: number
          valor_total: number
        }>
      }>('/backend/v1/funil/metricas?' + queryParams.toString(), {
        method: 'GET',
      })

      if (res && res.success) {
        setMetricasBackend(res)
        return
      }
    } catch (err) {
      console.error(
        'Erro ao carregar métricas agregadas do funil do backend, calculando fallback completo:',
        err,
      )
    }

    // Fallback defensivo: se o endpoint do backend falhar ou retornar erro,
    // calcular métricas diretamente de todas as oportunidades filtradas
    // garantindo que NUNCA dependa da página exibida no Kanban.
    try {
      const filtro = construirFiltroOportunidades()
      const allOps = await pb.collection('oportunidades').getFullList<OportunidadeModel>({
        filter: filtro || undefined,
        fields: 'id,etapa_id,valor,status',
        requestKey: null,
      })

      let totalRegistros = 0
      let totalValor = 0
      let totalAbertas = 0
      let valorPipeline = 0
      let totalGanhas = 0
      let valorGanhas = 0
      let totalPerdidas = 0
      let valorPerdidas = 0

      const etapasMap: Record<string, { quantidade: number; valor_total: number }> = {}
      etapas.forEach((e) => {
        etapasMap[e.id] = { quantidade: 0, valor_total: 0 }
      })

      allOps.forEach((op) => {
        const val = Number(op.valor) || 0
        totalRegistros += 1
        totalValor += val

        const etId = op.etapa_id
        if (!etapasMap[etId]) {
          etapasMap[etId] = { quantidade: 0, valor_total: 0 }
        }
        etapasMap[etId].quantidade += 1
        etapasMap[etId].valor_total = Math.round((etapasMap[etId].valor_total + val) * 100) / 100

        const st = (op.status || '').toLowerCase()
        if (st === 'aberto') {
          totalAbertas += 1
          valorPipeline += val
        } else if (st === 'ganho') {
          totalGanhas += 1
          valorGanhas += val
        } else if (st === 'perdido') {
          totalPerdidas += 1
          valorPerdidas += val
        }
      })

      const finalizadas = totalGanhas + totalPerdidas
      const taxaConversao = finalizadas > 0 ? (totalGanhas / finalizadas) * 100 : 0
      const ticketMedio = totalGanhas > 0 ? valorGanhas / totalGanhas : 0

      const etapasArray = etapas.map((e) => ({
        etapa_id: e.id,
        nome: e.nome,
        ordem: e.ordem,
        cor: e.cor,
        quantidade: etapasMap[e.id]?.quantidade || 0,
        valor_total: etapasMap[e.id]?.valor_total || 0,
      }))

      setMetricasBackend({
        success: true,
        totais: {
          total_registros: totalRegistros,
          total_valor: Math.round(totalValor * 100) / 100,
        },
        resumo: {
          total_abertas: totalAbertas,
          valor_pipeline: Math.round(valorPipeline * 100) / 100,
          total_ganhas: totalGanhas,
          valor_ganhas: Math.round(valorGanhas * 100) / 100,
          total_perdidas: totalPerdidas,
          valor_perdidas: Math.round(valorPerdidas * 100) / 100,
          taxa_conversao: Math.round(taxaConversao * 10) / 10,
          ticket_medio: Math.round(ticketMedio * 100) / 100,
        },
        etapas: etapasArray,
      })
    } catch (eFallback) {
      console.error('Falha também no fallback completo de métricas:', eFallback)
    }
  }, [filtros, periodo, modoVisao, etapas, construirFiltroOportunidades])

  // Carregar cards iniciais INDEPENDENTEMENTE por coluna (lazy loading / sem paginação global)
  const carregarTodasColunasIniciais = useCallback(async () => {
    if (etapas.length === 0) return
    try {
      setLoading(true)
      const baseFiltro = construirFiltroOportunidades()

      // Dispara o carregamento das métricas globais e a 1ª página (30 registros) de CADA coluna em paralelo
      const promessasColunas = etapas.map(async (etapa) => {
        const filtroColuna = baseFiltro
          ? `(${baseFiltro}) && etapa_id = '${etapa.id}'`
          : `etapa_id = '${etapa.id}'`

        const res = await pb
          .collection('oportunidades')
          .getList<OportunidadeModel>(1, TAMANHO_PAGINA_COLUNA, {
            sort: '-created',
            expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
            filter: filtroColuna,
            requestKey: null,
          })

        return {
          etapaId: etapa.id,
          items: res.items,
          temMais: res.page < res.totalPages,
        }
      })

      const [resultadosColunas] = await Promise.all([
        Promise.all(promessasColunas),
        carregarMetricasBackend(),
      ])

      const novoMapa: Record<string, OportunidadeModel[]> = {}
      const novasPaginas: Record<string, number> = {}
      const novosTemMais: Record<string, boolean> = {}

      resultadosColunas.forEach((col) => {
        novoMapa[col.etapaId] = col.items
        novasPaginas[col.etapaId] = 1
        novosTemMais[col.etapaId] = col.temMais
      })

      setOportunidadesPorEtapa(novoMapa)
      setPaginasPorEtapa(novasPaginas)
      setTemMaisPorEtapa(novosTemMais)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar o funil',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para visualizar algumas informações do funil de vendas.'
            : 'Não foi possível carregar os dados do funil comercial.',
      })
      setOportunidadesPorEtapa({})
    } finally {
      setLoading(false)
    }
  }, [etapas, construirFiltroOportunidades, carregarMetricasBackend])

  // Lazy loading incremental por coluna (ao rolar até o fim de uma coluna específica)
  const carregarMaisOportunidadesEtapa = useCallback(
    async (etapaId: string) => {
      if (carregandoPorEtapa[etapaId] || !temMaisPorEtapa[etapaId]) return

      const paginaAtual = paginasPorEtapa[etapaId] || 1
      const proximaPagina = paginaAtual + 1

      setCarregandoPorEtapa((prev) => ({ ...prev, [etapaId]: true }))

      try {
        const baseFiltro = construirFiltroOportunidades()
        const filtroColuna = baseFiltro
          ? `(${baseFiltro}) && etapa_id = '${etapaId}'`
          : `etapa_id = '${etapaId}'`

        const res = await pb
          .collection('oportunidades')
          .getList<OportunidadeModel>(proximaPagina, TAMANHO_PAGINA_COLUNA, {
            sort: '-created',
            expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
            filter: filtroColuna,
            requestKey: null,
          })

        setOportunidadesPorEtapa((prev) => ({
          ...prev,
          [etapaId]: [...(prev[etapaId] || []), ...res.items],
        }))
        setPaginasPorEtapa((prev) => ({ ...prev, [etapaId]: proximaPagina }))
        setTemMaisPorEtapa((prev) => ({ ...prev, [etapaId]: res.page < res.totalPages }))
      } catch (err) {
        console.error(`Erro ao carregar mais oportunidades para etapa ${etapaId}:`, err)
      } finally {
        setCarregandoPorEtapa((prev) => ({ ...prev, [etapaId]: false }))
      }
    },
    [carregandoPorEtapa, temMaisPorEtapa, paginasPorEtapa, construirFiltroOportunidades],
  )

  // Disparar requisição de oportunidades quando mudam parâmetros ou etapas
  useEffect(() => {
    if (etapas.length > 0) {
      carregarTodasColunasIniciais()
    }
  }, [carregarTodasColunasIniciais, etapas.length])

  // Mapa de subtotais por etapa vindos do BACKEND (sobre TODAS as oportunidades, não apenas da página atual)
  const subtotaisEtapasBackend = useMemo(() => {
    if (!metricasBackend?.etapas) return undefined
    const mapa: Record<string, { quantidade: number; valor_total: number }> = {}
    metricasBackend.etapas.forEach((et) => {
      mapa[et.etapa_id] = {
        quantidade: et.quantidade,
        valor_total: et.valor_total,
      }
    })
    return mapa
  }, [metricasBackend])

  // Métricas do resumo no topo: SEMPRE prioritárias a partir do BACKEND completo
  const metricasResumo = useMemo(() => {
    if (metricasBackend?.resumo) {
      return {
        totalAbertas: metricasBackend.resumo.total_abertas,
        valorPipeline: metricasBackend.resumo.valor_pipeline,
        taxaConversao: metricasBackend.resumo.taxa_conversao,
        ticketMedio: metricasBackend.resumo.ticket_medio,
      }
    }

    const todasCarregadas = Object.values(oportunidadesPorEtapa).flat()
    const abertas = todasCarregadas.filter((o) => o.status === 'aberto')
    const ganhas = todasCarregadas.filter((o) => o.status === 'ganho')
    const perdidas = todasCarregadas.filter((o) => o.status === 'perdido')

    const totalAbertas = abertas.length
    const valorPipeline = abertas.reduce((acc, curr) => acc + (curr.valor || 0), 0)

    const finalizadas = ganhas.length + perdidas.length
    const taxaConversao = finalizadas > 0 ? (ganhas.length / finalizadas) * 100 : 0

    const somaGanhas = ganhas.reduce((acc, curr) => acc + (curr.valor || 0), 0)
    const ticketMedio = ganhas.length > 0 ? somaGanhas / ganhas.length : 0

    return {
      totalAbertas,
      valorPipeline,
      taxaConversao,
      ticketMedio,
    }
  }, [metricasBackend, oportunidadesPorEtapa])

  // Ações de abertura de modais
  const handleNovaOportunidade = (etapaId?: string) => {
    setOportunidadeEditando(null)
    setEtapaInicialModal(etapaId || etapas[0]?.id)
    setModalOpen(true)
  }

  const handleEditarOportunidade = (op: OportunidadeModel) => {
    if (
      op.origem === 'bling' ||
      op.tipo_origem === 'bling_proposta' ||
      op.tipo_origem === 'bling_pedido'
    ) {
      toast({
        variant: 'destructive',
        title: 'Edição Bloqueada',
        description:
          'Esta oportunidade é controlada pelo Bling. Altere a informação no Bling e sincronize novamente.',
      })
      return
    }
    setOportunidadeEditando(op)
    setEtapaInicialModal(op.etapa_id)
    setModalOpen(true)
  }

  const handleCardClick = (op: OportunidadeModel) => {
    setOportunidadeSelecionada(op)
    setDetalhesOpen(true)
  }

  // Drag and drop: mudança de etapa ao soltar card
  const handleMudarEtapa = async (opId: string, novaEtapaId: string) => {
    // Localizar oportunidade em qualquer coluna
    let opEncontrada: OportunidadeModel | undefined
    let etapaAnteriorId = ''
    for (const [etId, ops] of Object.entries(oportunidadesPorEtapa)) {
      const encontrada = ops.find((o) => o.id === opId)
      if (encontrada) {
        opEncontrada = encontrada
        etapaAnteriorId = etId
        break
      }
    }

    if (!opEncontrada || etapaAnteriorId === novaEtapaId) return

    // Checagem prévia de permissão RLS do frontend e trava Bling
    if (!podeEditarOportunidade(user, opEncontrada)) {
      const isBling =
        opEncontrada.origem === 'bling' ||
        opEncontrada.tipo_origem === 'bling_proposta' ||
        opEncontrada.tipo_origem === 'bling_pedido'
      toast({
        variant: 'destructive',
        title: isBling ? 'Edição Bloqueada' : 'Permissão negada',
        description: isBling
          ? 'Esta oportunidade é controlada pelo Bling. Altere a informação no Bling e sincronize novamente.'
          : 'Você não tem permissão para alterar esta oportunidade.',
      })
      return
    }

    const etapaDestino = etapas.find((e) => e.id === novaEtapaId)
    const opMovida: OportunidadeModel = {
      ...opEncontrada,
      etapa_id: novaEtapaId,
      expand: {
        ...opEncontrada.expand,
        etapa_id: etapaDestino || opEncontrada.expand?.etapa_id,
      },
    }

    // Atualização otimista nas colunas
    setOportunidadesPorEtapa((prev) => {
      const origemLista = (prev[etapaAnteriorId] || []).filter((o) => o.id !== opId)
      const destinoLista = [opMovida, ...(prev[novaEtapaId] || [])]
      return {
        ...prev,
        [etapaAnteriorId]: origemLista,
        [novaEtapaId]: destinoLista,
      }
    })

    try {
      const atualizada = (await pb
        .collection('oportunidades')
        .update(
          opId,
          { etapa_id: novaEtapaId },
          { expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id' },
        )) as unknown as OportunidadeModel

      setOportunidadesPorEtapa((prev) => ({
        ...prev,
        [novaEtapaId]: (prev[novaEtapaId] || []).map((o) => (o.id === opId ? atualizada : o)),
      }))

      carregarMetricasBackend()

      toast({
        title: 'Etapa atualizada',
        description: `Oportunidade movida para "${etapaDestino?.nome || 'nova etapa'}".`,
      })
    } catch (err: unknown) {
      // Reverte em caso de erro da API ou RLS
      setOportunidadesPorEtapa((prev) => {
        const destinoSemOp = (prev[novaEtapaId] || []).filter((o) => o.id !== opId)
        const origemComOp = [opEncontrada!, ...(prev[etapaAnteriorId] || [])]
        return {
          ...prev,
          [novaEtapaId]: destinoSemOp,
          [etapaAnteriorId]: origemComOp,
        }
      })

      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao mover oportunidade',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Acesso negado: você só pode alterar oportunidades das quais é o responsável.'
            : 'Não foi possível salvar a nova etapa no servidor.',
      })
    }
  }

  // Callback de sucesso ao salvar modal (criar ou editar)
  const handleOportunidadeSalva = (salva: OportunidadeModel) => {
    carregarTodasColunasIniciais()
    if (oportunidadeSelecionada?.id === salva.id) {
      setOportunidadeSelecionada(salva)
    }
  }

  // Callback ao excluir
  const handleOportunidadeExcluida = (_opId: string) => {
    carregarTodasColunasIniciais()
    setOportunidadeSelecionada(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Topo: Seletor de Período Global com Visão Origem / Fechamento (Regras 29 e 30) */}
      <SeletorDePeriodo mostrarModoVisao />

      {/* Top Bar: Título, Descrição e Botões de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#2563EB]" />
            Funil de Vendas
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Pipeline de negociação e propostas para{' '}
            <strong className="text-[#0F172A] font-semibold">{nomeMesAno}</strong>{' '}
            <span className="text-xs text-blue-600 font-medium">
              (Visão {modoVisao === 'fechamento' ? 'por Fechamento' : 'por Origem Comercial'})
            </span>
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarTodasColunasIniciais}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar dados do funil"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          <Button
            onClick={() => handleNovaOportunidade()}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-sm font-semibold flex items-center gap-2"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Nova Oportunidade
          </Button>
        </div>
      </div>

      {/* 5) RESUMO NO TOPO: 4 Cards de Resumo */}
      <FunilResumoCards
        totalAbertas={metricasResumo.totalAbertas}
        valorPipeline={metricasResumo.valorPipeline}
        taxaConversao={metricasResumo.taxaConversao}
        ticketMedio={metricasResumo.ticketMedio}
      />

      {/* Contador total no topo e Filtros */}
      {/* Banner Informativo de Integração Bling */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="space-y-0.5">
          <span className="font-semibold text-[#0F172A] block">
            Sincronização automática com o Funil
          </span>
          <p className="text-[#64748B]">
            Sincronização automática com o Funil. Registros originados do Bling são controlados pelo
            ERP e somente leitura no CRM.
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] bg-white text-emerald-700 self-start sm:self-auto border-emerald-300 font-medium whitespace-nowrap"
        >
          ✓ Funil Integrado
        </Badge>
      </div>

      {/* 2) FILTROS EM TEMPO REAL (apenas Vendedor, Origem, Tipo, Status e Busca; período único no topo) */}
      <FunilFiltros
        filtros={filtros}
        onFiltrosChange={setFiltros}
        usuarios={usuarios}
        totalFiltrado={
          metricasBackend?.totais?.total_registros ??
          Object.values(oportunidadesPorEtapa).reduce((acc, curr) => acc + curr.length, 0)
        }
        totalGeral={
          metricasBackend?.totais?.total_registros ??
          Object.values(oportunidadesPorEtapa).reduce((acc, curr) => acc + curr.length, 0)
        }
      />

      {/* 1) BOARD KANBAN COM SCROLL VERTICAL INDEPENDENTE POR COLUNA E ALTURA AJUSTADA */}
      <div className="relative h-[calc(100vh-340px)] min-h-[520px]">
        {loading && Object.keys(oportunidadesPorEtapa).length === 0 ? (
          <div className="h-full p-16 text-center flex flex-col items-center justify-center space-y-3 bg-white rounded-2xl border border-[#E2E8F0]">
            <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin" />
            <p className="text-sm font-medium text-[#64748B]">
              Carregando pipeline de oportunidades...
            </p>
          </div>
        ) : etapas.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-[#E2E8F0] space-y-3">
            <Layers className="w-10 h-10 text-[#94A3B8] mx-auto" />
            <h3 className="font-bold text-base text-[#0F172A]">Nenhuma etapa configurada</h3>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto">
              As etapas do funil precisam ser cadastradas na base de dados para exibir o pipeline.
            </p>
          </div>
        ) : (
          <KanbanBoard
            etapas={etapas}
            oportunidadesPorEtapa={oportunidadesPorEtapa}
            subtotaisEtapasBackend={subtotaisEtapasBackend}
            modoVisao={modoVisao}
            usuarios={usuarios}
            carregandoPorEtapa={carregandoPorEtapa}
            temMaisPorEtapa={temMaisPorEtapa}
            onCarregarMaisEtapa={carregarMaisOportunidadesEtapa}
            onCardClick={handleCardClick}
            onNovaOportunidadeEtapa={handleNovaOportunidade}
            onMudarEtapa={handleMudarEtapa}
          />
        )}
      </div>

      {/* 3) FORMULÁRIO DE OPORTUNIDADE (Criação / Edição) */}
      <OportunidadeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        oportunidade={oportunidadeEditando}
        initialEtapaId={etapaInicialModal}
        etapas={etapas}
        clientes={clientes}
        usuarios={usuarios}
        motivosPerda={motivosPerda}
        onSuccess={handleOportunidadeSalva}
      />

      {/* 4) DETALHES RÁPIDOS (Painel Lateral Sheet) */}
      <OportunidadeDetalhesSheet
        oportunidade={oportunidadeSelecionada}
        open={detalhesOpen}
        usuarios={usuarios}
        onOpenChange={setDetalhesOpen}
        onEditar={handleEditarOportunidade}
        onExcluida={handleOportunidadeExcluida}
      />
    </div>
  )
}
