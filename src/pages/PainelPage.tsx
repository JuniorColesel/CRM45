import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, LayoutDashboard, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  SeletorDePeriodo,
  type OpcaoPeriodoPredefinido,
} from '@/components/common/SeletorDePeriodo'
import { usePeriodo } from '@/contexts/PeriodoContext'
import { useAuth } from '@/contexts/AuthContext'
import { PainelKpiCards } from '@/components/painel/PainelKpiCards'
import { PainelGraficos } from '@/components/painel/PainelGraficos'
import { PainelAcoesAlertas } from '@/components/painel/PainelAcoesAlertas'
import {
  obterDadosPainel,
  limparCachePainel,
  type DadosPainelGeral,
} from '@/services/painelService'

export function PainelPage() {
  const { user } = useAuth()
  const { ano, mes } = usePeriodo()

  // Estado do seletor de período pré-definido (padrão: 'este_mes')
  const [opcaoPeriodo, setOpcaoPeriodo] = useState<OpcaoPeriodoPredefinido>('este_mes')

  // Estado dos dados
  const [dados, setDados] = useState<DadosPainelGeral | null>(null)
  const [carregando, setCarregando] = useState<boolean>(true)
  const [erro, setErro] = useState<string | null>(null)

  // Perfil do usuário atual
  const perfil = user?.perfil
  // Perfis com restrição comercial: 'compras_grandes_clientes' e 'estoque'
  // Conforme requisito:
  // "compras/estoque: vê apenas KPIs gerais (Total de Clientes e Oportunidades em Aberto);
  // NÃO vê dados de vendas, pipeline, conversão, ticket médio, funil, metas ou top vendedores;
  // alertas limitados a follow-ups e tarefas. Nesses perfis, esconda os cards/gráficos restritos com elegância"
  const isPerfilRestrito = perfil === 'compras_grandes_clientes' || perfil === 'estoque'

  // Label dinâmico para exibição no cabeçalho
  const rotuloPeriodoSelecionado = useMemo(() => {
    switch (opcaoPeriodo) {
      case 'este_mes':
        return 'Este mês'
      case 'mes_passado':
        return 'Mês passado'
      case 'ultimos_3_meses':
        return 'Últimos 3 meses'
      case 'ultimos_6_meses':
        return 'Últimos 6 meses'
      case 'ano_corrente':
        return 'Ano corrente'
      case 'personalizado':
      default:
        return undefined
    }
  }, [opcaoPeriodo])

  // Busca de dados com agregação e cache de 5 minutos
  const carregarDados = useCallback(
    async (forcarRecarregamento = false) => {
      try {
        setCarregando(true)
        setErro(null)

        if (forcarRecarregamento) {
          limparCachePainel()
        }

        const res = await obterDadosPainel({
          tipoPeriodo: opcaoPeriodo,
          ano,
          mes,
          perfil,
          usuarioId: user?.id,
        })

        setDados(res)
      } catch (e: unknown) {
        console.error('Erro ao carregar dados do painel:', e)
        const msg = e instanceof Error ? e.message : 'Falha ao processar dados do painel'
        setErro(msg)
      } finally {
        setCarregando(false)
      }
    },
    [opcaoPeriodo, ano, mes, perfil, user?.id],
  )

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Dados padrão para estado inicial / vazio caso não retorne
  const dadosEfetivos: DadosPainelGeral = dados || {
    kpis: {
      totalClientes: 0,
      variacaoClientes: null,
      oportunidadesAberto: 0,
      variacaoOportunidades: null,
      valorPipeline: 0,
      variacaoPipeline: null,
      vendasPeriodo: 0,
      variacaoVendas: null,
      taxaConversao: 0,
      variacaoConversaoPontos: null,
      ticketMedio: 0,
      variacaoTicketMedio: null,
    },
    graficoFunil: [],
    graficoVendasPorMes: [],
    graficoTopVendedores: [],
    graficoStatusOportunidades: [],
    totalOportunidadesStatus: 0,
    alertas: [],
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ---------------- 1. CABEÇALHO ---------------- */}
      {/* Título "Painel Geral" + Seletor de período reutilizando SeletorDePeriodo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4 bg-white -mx-4 sm:-mx-6 px-4 sm:px-6 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                Painel Geral
              </h1>
              <p className="text-xs text-[#64748B]">
                Visão consolidada de performance comercial, pipeline e metas do CRM Colesel 45
              </p>
            </div>
          </div>
        </div>

        {/* Lado direito: Seletor de Período + Botão Atualizar */}
        <div className="flex flex-wrap items-center gap-2">
          <SeletorDePeriodo
            mostrarOpcoesPredefinidas
            opcaoSelecionada={opcaoPeriodo}
            onSelectOpcaoPredefinida={(op) => setOpcaoPeriodo(op)}
            labelPersonalizado={rotuloPeriodoSelecionado}
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => carregarDados(true)}
            disabled={carregando}
            className="h-8 px-2.5 text-xs text-[#64748B] hover:text-[#0F172A] border-[#E2E8F0] bg-white shadow-xs"
            title="Atualizar dados (recarrega do servidor)"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Alerta de erro caso ocorra */}
      {erro && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Ocorreu um erro ao carregar as métricas do painel: {erro}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => carregarDados(true)}
            className="h-7 text-xs bg-white text-red-700 border-red-300 hover:bg-red-100"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* ---------------- 2. CARDS DE KPIS ---------------- */}
      {/* 6 cards em grid responsivo (2 col mobile, 3 tablet, 6 desktop);
          para compras/estoque: exibe apenas os 2 permitidos elegantemente */}
      <section aria-label="Indicadores Chave de Performance">
        <PainelKpiCards kpis={dadosEfetivos.kpis} esconderFinanceiro={isPerfilRestrito} />
      </section>

      {/* ---------------- 3. GRÁFICOS ---------------- */}
      {/* 4 gráficos em grid 2x2 (1 coluna no mobile):
          - Funil de Vendas (barras horizontais)
          - Vendas por Mês (linha, últimos 6 meses)
          - Top Vendedores (barras verticais)
          - Status das Oportunidades (donut)
          Nota: Perfis compras/estoque não visualizam vendas/pipeline/funil */}
      {!isPerfilRestrito && (
        <section aria-label="Gráficos de Performance e Funil">
          <PainelGraficos
            graficoFunil={dadosEfetivos.graficoFunil}
            graficoVendasPorMes={dadosEfetivos.graficoVendasPorMes}
            graficoTopVendedores={dadosEfetivos.graficoTopVendedores}
            graficoStatusOportunidades={dadosEfetivos.graficoStatusOportunidades}
            totalOportunidadesStatus={dadosEfetivos.totalOportunidadesStatus}
          />
        </section>
      )}

      {/* ---------------- 4. AÇÕES RÁPIDAS + ALERTAS ---------------- */}
      {/* 2 colunas: Ações rápidas à esquerda, Alertas à direita */}
      <section aria-label="Ações Rápidas e Alertas Prioritários">
        <PainelAcoesAlertas alertas={dadosEfetivos.alertas} esconderComercial={isPerfilRestrito} />
      </section>
    </div>
  )
}
export default PainelPage
