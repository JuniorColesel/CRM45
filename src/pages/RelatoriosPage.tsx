import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { LayoutDashboard, FileSpreadsheet, RefreshCw, BarChart3 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import { usePeriodo } from '@/contexts/PeriodoContext'
import { SeletorDePeriodo } from '@/components/common/SeletorDePeriodo'
import { AbaPainelRelatorios } from '@/components/relatorios/AbaPainelRelatorios'
import { AbaRelatoriosDetalhados } from '@/components/relatorios/AbaRelatoriosDetalhados'
import type {
  ClienteModel,
  EtapaFunilModel,
  LigacaoModel,
  MetaModel,
  OportunidadeModel,
  TarefaModel,
  CanalMarketingModel,
} from '@/types/clientes'
import type { CampanhaModel, PublicacaoModel } from '@/types/marketing'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function RelatoriosPage() {
  const { user } = useAuth()
  const { periodo, ano, mes, nomeMesAno } = usePeriodo()

  // Aba selecionada: 'painel' | 'detalhados'
  const [tabAtiva, setTabAtiva] = useState<string>('painel')

  // Estados dos dados carregados do PocketBase
  const [oportunidades, setOportunidades] = useState<OportunidadeModel[]>([])
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [ligacoes, setLigacoes] = useState<LigacaoModel[]>([])
  const [tarefas, setTarefas] = useState<TarefaModel[]>([])
  const [campanhas, setCampanhas] = useState<CampanhaModel[]>([])
  const [publicacoes, setPublicacoes] = useState<PublicacaoModel[]>([])
  const [metas, setMetas] = useState<MetaModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [etapas, setEtapas] = useState<EtapaFunilModel[]>([])
  const [canais, setCanais] = useState<CanalMarketingModel[]>([])

  const [loading, setLoading] = useState(true)

  // Carrega todas as coleções respeitando a RLS nativa de cada tabela
  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)

      const [
        resOps,
        resClientes,
        resLigacoes,
        resTarefas,
        resCampanhas,
        resPublicacoes,
        resMetas,
        resUsuarios,
        resEtapas,
        resCanais,
      ] = await Promise.all([
        pb
          .collection('oportunidades')
          .getFullList<OportunidadeModel>({
            sort: '-created',
            expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
          })
          .catch(() => [] as OportunidadeModel[]),

        pb
          .collection('clientes')
          .getFullList<ClienteModel>({
            sort: 'nome_contato',
            expand: 'responsavel_id',
          })
          .catch(() => [] as ClienteModel[]),

        pb
          .collection('ligacoes')
          .getFullList<LigacaoModel>({
            sort: '-data_hora',
            expand: 'cliente_id,responsavel_id',
          })
          .catch(() => [] as LigacaoModel[]),

        pb
          .collection('tarefas')
          .getFullList<TarefaModel>({
            sort: '-data_hora',
            expand: 'cliente_id,responsavel_id',
          })
          .catch(() => [] as TarefaModel[]),

        pb
          .collection('campanhas')
          .getFullList<CampanhaModel>({
            sort: '-created',
            expand: 'canal_id,responsavel_id',
          })
          .catch(() => [] as CampanhaModel[]),

        pb
          .collection('publicacoes')
          .getFullList<PublicacaoModel>({
            sort: '-created',
            expand: 'campanha_id,cliente_id',
          })
          .catch(() => [] as PublicacaoModel[]),

        pb
          .collection('metas')
          .getFullList<MetaModel>({
            sort: '-ano,-mes',
            expand: 'criado_por',
          })
          .catch(() => [] as MetaModel[]),

        pb
          .collection('usuarios')
          .getFullList<Usuario>({
            sort: 'nome',
          })
          .catch(() => (user ? [user] : [])),

        pb
          .collection('etapas_funil')
          .getFullList<EtapaFunilModel>({
            sort: 'ordem',
          })
          .catch(() => [] as EtapaFunilModel[]),

        pb
          .collection('canais_marketing')
          .getFullList<CanalMarketingModel>({
            sort: 'nome',
          })
          .catch(() => [] as CanalMarketingModel[]),
      ])

      setOportunidades(resOps)
      setClientes(resClientes)
      setLigacoes(resLigacoes)
      setTarefas(resTarefas)
      setCampanhas(resCampanhas)
      setPublicacoes(resPublicacoes)
      setMetas(resMetas)
      setUsuarios(resUsuarios.length > 0 ? resUsuarios : user ? [user] : [])
      setEtapas(resEtapas)
      setCanais(resCanais)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Aviso de carregamento',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Alguns dados foram limitados de acordo com seu perfil de acesso.'
            : 'Não foi possível carregar todos os dados dos relatórios.',
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // ================= FILTROS PELO PERÍODO SELECIONADO =================

  // 1. Oportunidades:
  // - Ganhas: data_fechamento no período
  // - Perdidas: data_fechamento no período
  // - Abertas: criadas ou ativas no período (criado_em no período ou data_prevista_fechamento no período, ou sem data de fechamento)
  const oportunidadesGanhasNoPeriodo = useMemo(() => {
    return oportunidades.filter((op) => {
      if (op.status !== 'ganho') return false
      const dataRef = op.data_fechamento || op.criado_em || op.created || ''
      if (!dataRef) return false
      const d = new Date(dataRef)
      if (isNaN(d.getTime())) return false
      return d.getFullYear() === ano && d.getMonth() + 1 === mes
    })
  }, [oportunidades, ano, mes])

  const oportunidadesPerdidasNoPeriodo = useMemo(() => {
    return oportunidades.filter((op) => {
      if (op.status !== 'perdido') return false
      const dataRef = op.data_fechamento || op.criado_em || op.created || ''
      if (!dataRef) return false
      const d = new Date(dataRef)
      if (isNaN(d.getTime())) return false
      return d.getFullYear() === ano && d.getMonth() + 1 === mes
    })
  }, [oportunidades, ano, mes])

  const oportunidadesAbertasNoPeriodo = useMemo(() => {
    return oportunidades.filter((op) => {
      if (op.status !== 'aberto') return false
      // Se tiver data de fechamento ou criado_em
      const dCriacao = op.criado_em || op.created ? new Date(op.criado_em || op.created) : null
      if (dCriacao && !isNaN(dCriacao.getTime())) {
        // Se criada até o final deste mês e ainda está aberta
        const dFimMes = new Date(ano, mes, 0, 23, 59, 59)
        return dCriacao <= dFimMes
      }
      return true
    })
  }, [oportunidades, ano, mes])

  // Todas as oportunidades consideradas no período (para a tabela da sub-aba Oportunidades)
  // Regra: filtradas por data_fechamento para ganhas/perdidas, ou criado_em para abertas
  const oportunidadesDoPeriodo = useMemo(() => {
    return oportunidades.filter((op) => {
      if (op.status === 'ganho' || op.status === 'perdido') {
        const dataRef = op.data_fechamento || op.criado_em || op.created || ''
        if (!dataRef) return false
        const d = new Date(dataRef)
        if (isNaN(d.getTime())) return false
        return d.getFullYear() === ano && d.getMonth() + 1 === mes
      } else {
        // abertas: criado_em no período (ou criadas até este período e abertas)
        const dataRef = op.criado_em || op.created || ''
        if (!dataRef) return true
        const d = new Date(dataRef)
        if (isNaN(d.getTime())) return true
        return d.getFullYear() === ano && d.getMonth() + 1 === mes
      }
    })
  }, [oportunidades, ano, mes])

  // 2. Ligações do período: filtradas por data_hora no período
  const ligacoesDoPeriodo = useMemo(() => {
    return ligacoes.filter((lig) => {
      if (!lig.data_hora) return false
      const d = new Date(lig.data_hora)
      if (isNaN(d.getTime())) return false
      return d.getFullYear() === ano && d.getMonth() + 1 === mes
    })
  }, [ligacoes, ano, mes])

  // 3. Tarefas concluídas no período: data_conclusao no período
  const tarefasConcluidasNoPeriodo = useMemo(() => {
    return tarefas.filter((t) => {
      if (!t.concluida) return false
      const dataRef = t.data_conclusao || t.data_hora || t.created || ''
      if (!dataRef) return false
      const d = new Date(dataRef)
      if (isNaN(d.getTime())) return false
      return d.getFullYear() === ano && d.getMonth() + 1 === mes
    })
  }, [tarefas, ano, mes])

  // 4. Campanhas do período: filtradas por data_inicio ou data_fim no período
  const campanhasDoPeriodo = useMemo(() => {
    return campanhas.filter((c) => {
      const temDataInicio = c.data_inicio
        ? (() => {
            const d = new Date(c.data_inicio)
            return !isNaN(d.getTime()) && d.getFullYear() === ano && d.getMonth() + 1 === mes
          })()
        : false

      const temDataFim = c.data_fim
        ? (() => {
            const d = new Date(c.data_fim)
            return !isNaN(d.getTime()) && d.getFullYear() === ano && d.getMonth() + 1 === mes
          })()
        : false

      // Se ambas não estiverem no período, mas a campanha estiver ativa no mês, consideramos válida
      if (temDataInicio || temDataFim) return true

      if (c.data_inicio && c.data_fim) {
        const dIni = new Date(c.data_inicio)
        const dFim = new Date(c.data_fim)
        const mesInicio = new Date(ano, mes - 1, 1)
        const mesFim = new Date(ano, mes, 0)
        return dIni <= mesFim && dFim >= mesInicio
      }

      // Se não possui data de início/fim, checa a data de criação
      if (c.criado_em || c.created) {
        const d = new Date(c.criado_em || c.created)
        return !isNaN(d.getTime()) && d.getFullYear() === ano && d.getMonth() + 1 === mes
      }

      return false
    })
  }, [campanhas, ano, mes])

  // 5. Metas do período
  const metasDoPeriodo = useMemo(() => {
    return metas.filter((m) => m.ano === ano && m.mes === mes)
  }, [metas, ano, mes])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Seletor Global de Período (Mês e Ano) */}
      <SeletorDePeriodo />

      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#2563EB]" />
            Relatórios Comerciais & Estratégicos
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Visão consolidada de performance, pipeline, produtividade da equipe e relatórios
            detalhados para <strong className="text-[#0F172A] font-semibold">{nomeMesAno}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar dados de relatórios"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* DUAS ABAS DO MÓDULO: PAINEL e RELATÓRIOS DETALHADOS */}
      <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="painel"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <LayoutDashboard className="w-4 h-4" />
            PAINEL
          </TabsTrigger>

          <TabsTrigger
            value="detalhados"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            RELATÓRIOS DETALHADOS
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA 1: PAINEL ================= */}
        <TabsContent value="painel" className="focus-visible:outline-none">
          <AbaPainelRelatorios
            periodo={periodo}
            usuarioLogado={user}
            usuarios={usuarios}
            etapas={etapas}
            clientes={clientes}
            metas={metasDoPeriodo}
            oportunidades={oportunidades}
            oportunidadesDoPeriodo={oportunidadesDoPeriodo}
            oportunidadesAbertasNoPeriodo={oportunidadesAbertasNoPeriodo}
            oportunidadesGanhasNoPeriodo={oportunidadesGanhasNoPeriodo}
            oportunidadesPerdidasNoPeriodo={oportunidadesPerdidasNoPeriodo}
            ligacoesNoPeriodo={ligacoesDoPeriodo}
            todasLigacoes={ligacoes}
            tarefasConcluidasNoPeriodo={tarefasConcluidasNoPeriodo}
            todasTarefas={tarefas}
            loading={loading}
          />
        </TabsContent>

        {/* ================= ABA 2: RELATÓRIOS DETALHADOS ================= */}
        <TabsContent value="detalhados" className="focus-visible:outline-none">
          <AbaRelatoriosDetalhados
            oportunidadesDoPeriodo={oportunidadesDoPeriodo}
            ligacoesDoPeriodo={ligacoesDoPeriodo}
            campanhasDoPeriodo={campanhasDoPeriodo}
            publicacoes={publicacoes}
            canais={canais}
            clientes={clientes}
            etapas={etapas}
            usuarios={usuarios}
            loading={loading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
