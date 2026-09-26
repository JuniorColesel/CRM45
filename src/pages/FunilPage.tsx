import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { TrendingUp, Plus, RefreshCw, Layers, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

export default function FunilPage() {
  const { user } = useAuth()

  // Estados principais de dados
  const [etapas, setEtapas] = useState<EtapaFunilModel[]>([])
  const [oportunidades, setOportunidades] = useState<OportunidadeModel[]>([])
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [motivosPerda, setMotivosPerda] = useState<MotivoPerdaModel[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros em tempo real
  const [filtros, setFiltros] = useState<FunilFiltrosState>({
    busca: '',
    responsavelId: 'todos',
    dataInicio: '',
    dataFim: '',
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

  // Carregar todos os dados do funil com expand
  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      const [etapasRes, opsRes, clientesRes, usuariosRes, motivosRes] = await Promise.all([
        pb.collection('etapas_funil').getFullList<EtapaFunilModel>({
          sort: 'ordem',
        }),
        pb.collection('oportunidades').getFullList<OportunidadeModel>({
          sort: '-created',
          expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
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

      setEtapas(etapasRes)
      setOportunidades(opsRes)
      setClientes(clientesRes)
      setUsuarios(usuariosRes.length > 0 ? usuariosRes : user ? [user] : [])
      setMotivosPerda(motivosRes)
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
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Métricas do resumo no topo (calculadas sobre a totalidade das oportunidades acessíveis ao usuário)
  const metricasResumo = useMemo(() => {
    const abertas = oportunidades.filter((o) => o.status === 'aberto')
    const ganhas = oportunidades.filter((o) => o.status === 'ganho')
    const perdidas = oportunidades.filter((o) => o.status === 'perdido')

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
  }, [oportunidades])

  // Filtragem em tempo real das oportunidades para o Kanban
  const oportunidadesFiltradas = useMemo(() => {
    return oportunidades.filter((op) => {
      // 1. Filtro por status
      if (filtros.status !== 'todos' && op.status !== filtros.status) {
        return false
      }

      // 2. Filtro por responsável
      if (filtros.responsavelId !== 'todos' && op.responsavel_id !== filtros.responsavelId) {
        return false
      }

      // 3. Filtro por data prevista de fechamento (intervalo)
      if (filtros.dataInicio || filtros.dataFim) {
        if (!op.data_prevista_fechamento) return false
        const opDataStr = op.data_prevista_fechamento.substring(0, 10)
        if (filtros.dataInicio && opDataStr < filtros.dataInicio) return false
        if (filtros.dataFim && opDataStr > filtros.dataFim) return false
      }

      // 4. Busca textual por nome do cliente ou responsável
      if (filtros.busca.trim()) {
        const termo = filtros.busca.toLowerCase().trim()
        const clienteNome = op.expand?.cliente_id?.nome_contato?.toLowerCase() || ''
        const empresaNome = op.expand?.cliente_id?.nome_empresa?.toLowerCase() || ''
        const respNome = op.expand?.responsavel_id?.nome?.toLowerCase() || ''
        const match =
          clienteNome.includes(termo) || empresaNome.includes(termo) || respNome.includes(termo)
        if (!match) return false
      }

      return true
    })
  }, [oportunidades, filtros])

  // Ações de abertura de modais
  const handleNovaOportunidade = (etapaId?: string) => {
    setOportunidadeEditando(null)
    setEtapaInicialModal(etapaId || etapas[0]?.id)
    setModalOpen(true)
  }

  const handleEditarOportunidade = (op: OportunidadeModel) => {
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
    const op = oportunidades.find((o) => o.id === opId)
    if (!op || op.etapa_id === novaEtapaId) return

    // Checagem prévia de permissão RLS do frontend
    if (!podeEditarOportunidade(user, op)) {
      toast({
        variant: 'destructive',
        title: 'Permissão negada',
        description: 'Você não tem permissão para alterar esta oportunidade.',
      })
      return
    }

    const etapaAnterior = op.etapa_id
    const etapaDestino = etapas.find((e) => e.id === novaEtapaId)

    // Atualização otimista
    setOportunidades((prev) =>
      prev.map((item) =>
        item.id === opId
          ? {
              ...item,
              etapa_id: novaEtapaId,
              expand: {
                ...item.expand,
                etapa_id: etapaDestino || item.expand?.etapa_id,
              },
            }
          : item,
      ),
    )

    try {
      const atualizada = (await pb
        .collection('oportunidades')
        .update(
          opId,
          { etapa_id: novaEtapaId },
          { expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id' },
        )) as unknown as OportunidadeModel

      setOportunidades((prev) => prev.map((item) => (item.id === opId ? atualizada : item)))

      toast({
        title: 'Etapa atualizada',
        description: `Oportunidade movida para "${etapaDestino?.nome || 'nova etapa'}".`,
      })
    } catch (err: unknown) {
      // Reverte em caso de erro da API ou RLS
      setOportunidades((prev) =>
        prev.map((item) =>
          item.id === opId
            ? {
                ...item,
                etapa_id: etapaAnterior,
              }
            : item,
        ),
      )

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
    setOportunidades((prev) => {
      const idx = prev.findIndex((o) => o.id === salva.id)
      if (idx >= 0) {
        const novo = [...prev]
        novo[idx] = salva
        return novo
      }
      return [salva, ...prev]
    })

    // Se estiver selecionada no painel de detalhes, atualiza lá também
    if (oportunidadeSelecionada?.id === salva.id) {
      setOportunidadeSelecionada(salva)
    }
  }

  // Callback ao excluir
  const handleOportunidadeExcluida = (opId: string) => {
    setOportunidades((prev) => prev.filter((o) => o.id !== opId))
    if (oportunidadeSelecionada?.id === opId) {
      setOportunidadeSelecionada(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Bar: Título, Descrição e Botões de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#2563EB]" />
            Funil de Vendas
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Acompanhe propostas comerciais, pipeline de negociação e evolução das etapas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
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

      {/* 2) FILTROS EM TEMPO REAL */}
      <FunilFiltros
        filtros={filtros}
        onFiltrosChange={setFiltros}
        usuarios={usuarios}
        totalFiltrado={oportunidadesFiltradas.length}
        totalGeral={oportunidades.length}
      />

      {/* 1) BOARD KANBAN */}
      <div className="relative">
        {loading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center space-y-3 bg-white rounded-2xl border border-[#E2E8F0]">
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
            oportunidades={oportunidadesFiltradas}
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
        onOpenChange={setDetalhesOpen}
        onEditar={handleEditarOportunidade}
        onExcluida={handleOportunidadeExcluida}
      />
    </div>
  )
}
