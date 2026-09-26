import { CardsResumo } from './CardsResumo'
import { SecaoMetas } from './SecaoMetas'
import { GraficosRelatorio } from './GraficosRelatorio'
import { SecaoAtividade } from './SecaoAtividade'
import { SecaoAlertas } from './SecaoAlertas'
import type { PeriodoFiltro } from '@/contexts/PeriodoContext'
import type { Usuario } from '@/contexts/AuthContext'
import type {
  ClienteModel,
  EtapaFunilModel,
  LigacaoModel,
  MetaModel,
  OportunidadeModel,
  TarefaModel,
} from '@/types/clientes'

interface AbaPainelRelatoriosProps {
  periodo: PeriodoFiltro
  usuarioLogado: Usuario | null
  usuarios: Usuario[]
  etapas: EtapaFunilModel[]
  clientes: ClienteModel[]
  metas: MetaModel[]
  oportunidades: OportunidadeModel[]
  oportunidadesDoPeriodo: OportunidadeModel[]
  oportunidadesAbertasNoPeriodo: OportunidadeModel[]
  oportunidadesGanhasNoPeriodo: OportunidadeModel[]
  oportunidadesPerdidasNoPeriodo: OportunidadeModel[]
  ligacoesNoPeriodo: LigacaoModel[]
  todasLigacoes: LigacaoModel[]
  tarefasConcluidasNoPeriodo: TarefaModel[]
  todasTarefas: TarefaModel[]
  loading: boolean
}

export function AbaPainelRelatorios({
  periodo,
  usuarioLogado,
  usuarios,
  etapas,
  clientes,
  metas,
  oportunidades,
  oportunidadesAbertasNoPeriodo,
  oportunidadesGanhasNoPeriodo,
  oportunidadesPerdidasNoPeriodo,
  ligacoesNoPeriodo,
  todasLigacoes,
  tarefasConcluidasNoPeriodo,
  todasTarefas,
  loading,
}: AbaPainelRelatoriosProps) {
  // Cálculos do Resumo
  const totalAbertas = oportunidadesAbertasNoPeriodo.length
  const valorPipeline = oportunidadesAbertasNoPeriodo.reduce((acc, op) => acc + (op.valor || 0), 0)

  const totalGanhas = oportunidadesGanhasNoPeriodo.length
  const valorGanho = oportunidadesGanhasNoPeriodo.reduce((acc, op) => acc + (op.valor || 0), 0)

  const totalPerdidas = oportunidadesPerdidasNoPeriodo.length
  const totalFinalizadas = totalGanhas + totalPerdidas
  const taxaConversao = totalFinalizadas > 0 ? (totalGanhas / totalFinalizadas) * 100 : 0

  if (loading) {
    return (
      <div className="py-16 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#64748B]">Carregando dados do painel gerencial...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* a) Cards de resumo no topo (6 cards) */}
      <CardsResumo
        totalAbertas={totalAbertas}
        valorPipeline={valorPipeline}
        totalGanhas={totalGanhas}
        valorGanho={valorGanho}
        totalPerdidas={totalPerdidas}
        taxaConversao={taxaConversao}
      />

      {/* b) Seção Minhas metas vs realizado / Metas do time */}
      <SecaoMetas
        usuarioLogado={usuarioLogado}
        usuarios={usuarios}
        metas={metas}
        oportunidadesGanhasNoPeriodo={oportunidadesGanhasNoPeriodo}
      />

      {/* c) Gráficos (Recharts) */}
      <GraficosRelatorio
        periodo={periodo}
        etapas={etapas}
        usuarios={usuarios}
        oportunidadesAbertasNoPeriodo={oportunidadesAbertasNoPeriodo}
        oportunidadesGanhasNoPeriodo={oportunidadesGanhasNoPeriodo}
      />

      {/* d) Seção Atividade do time */}
      <SecaoAtividade
        ligacoesNoPeriodo={ligacoesNoPeriodo}
        tarefasConcluidasNoPeriodo={tarefasConcluidasNoPeriodo}
      />

      {/* e) Seção Alertas */}
      <SecaoAlertas
        clientes={clientes}
        tarefas={todasTarefas}
        ligacoes={todasLigacoes}
        oportunidades={oportunidades}
      />
    </div>
  )
}
