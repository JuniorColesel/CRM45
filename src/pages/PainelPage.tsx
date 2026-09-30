import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, LayoutDashboard, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SeletorDePeriodo } from '@/components/common/SeletorDePeriodo'
import { usePeriodo } from '@/contexts/PeriodoContext'
import { useAuth } from '@/contexts/AuthContext'
import { PainelKpiCards } from '@/components/painel/PainelKpiCards'
import { PainelGraficos } from '@/components/painel/PainelGraficos'
import { PainelAcoesAlertas } from '@/components/painel/PainelAcoesAlertas'
import {
  obterDadosPainelComercial,
  limparCachePainel,
  type DadosPainelComercialCompleto,
} from '@/services/painelService'

export function PainelPage() {
  const { user } = useAuth()
  const { ano, mes, periodo, modoVisao, dataInicioPersonalizada, dataFimPersonalizada } =
    usePeriodo()

  // Estado dos dados comerciais consolidados no backend
  const [dados, setDados] = useState<DadosPainelComercialCompleto | null>(null)
  const [carregando, setCarregando] = useState<boolean>(true)
  const [erro, setErro] = useState<string | null>(null)

  // Perfil do usuário atual
  const perfil = user?.perfil
  const isPerfilRestrito = perfil === 'compras_grandes_clientes' || perfil === 'estoque'

  // Busca agregada diretamente do backend por período comercial
  const carregarDados = useCallback(
    async (forcarRecarregamento = false) => {
      try {
        setCarregando(true)
        setErro(null)

        if (forcarRecarregamento) {
          limparCachePainel()
        }

        const res = await obterDadosPainelComercial({
          ano,
          mes,
          dataInicioYmd: dataInicioPersonalizada,
          dataFimYmd: dataFimPersonalizada,
          modoVisao,
          perfil,
          usuarioId: user?.id,
        })

        setDados(res)
      } catch (e: unknown) {
        console.error('Erro ao carregar dados do painel comercial:', e)
        const msg =
          e instanceof Error ? e.message : 'Falha ao processar dados comerciais do período'
        setErro(msg)
      } finally {
        setCarregando(false)
      }
    },
    [ano, mes, dataInicioPersonalizada, dataFimPersonalizada, modoVisao, perfil, user?.id],
  )

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  return (
    <div className="space-y-6 pb-12">
      {/* ---------------- 1. CABEÇALHO & SELETOR DE PERÍODO GLOBAL ---------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4 bg-white -mx-4 sm:-mx-6 px-4 sm:px-6 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                Painel Comercial
              </h1>
              <p className="text-xs text-[#64748B]">
                Indicadores consolidados por período comercial com reconciliação anual no backend
              </p>
            </div>
          </div>
        </div>

        {/* Lado direito: Botão Atualizar */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => carregarDados(true)}
            disabled={carregando}
            className="h-8 px-2.5 text-xs text-[#64748B] hover:text-[#0F172A] border-[#E2E8F0] bg-white shadow-xs"
            title="Atualizar dados (recalcula no backend)"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* SELETOR GLOBAL DE PERÍODO (Regras 16, 17, 20, 21) */}
      <section aria-label="Seletor de Período Global">
        <SeletorDePeriodo mostrarModoVisao />
      </section>

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

      {/* ---------------- 2. CARDS DE KPIS DO PERÍODO & BASE / HISTÓRICO ---------------- */}
      {dados && (
        <section aria-label="Indicadores Chave do Período">
          <PainelKpiCards dados={dados} esconderFinanceiro={isPerfilRestrito} />
        </section>
      )}

      {/* ---------------- 3. GRÁFICOS DO PERÍODO ---------------- */}
      {dados && !isPerfilRestrito && (
        <section aria-label="Gráficos do Período">
          <PainelGraficos dados={dados} />
        </section>
      )}

      {/* ---------------- 4. AÇÕES RÁPIDAS & ALERTAS ---------------- */}
      <section aria-label="Ações Rápidas">
        <PainelAcoesAlertas alertas={[]} esconderComercial={isPerfilRestrito} />
      </section>
    </div>
  )
}
export default PainelPage
