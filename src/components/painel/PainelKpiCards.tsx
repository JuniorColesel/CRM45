import React from 'react'
import {
  Users,
  Filter,
  DollarSign,
  TrendingUp,
  Percent,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  HelpCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatarMoeda } from '@/types/clientes'
import type { PainelKpis } from '@/services/painelService'

interface PainelKpiCardsProps {
  kpis: PainelKpis
  esconderFinanceiro?: boolean // true para perfis de compras/estoque
}

interface CardConfig {
  id: string
  titulo: string
  valor: string
  variacao: string
  variacaoStatus: 'positivo' | 'negativo' | 'neutro'
  tooltip: string
  icone: React.ComponentType<{ className?: string }>
  corIconeBg: string
  corIcone: string
}

export function PainelKpiCards({ kpis, esconderFinanceiro = false }: PainelKpiCardsProps) {
  // Helper para formatar a variação percentual
  const formatarVariacao = (
    val: number | null,
    isPontosPercentuais = false,
  ): { texto: string; status: 'positivo' | 'negativo' | 'neutro' } => {
    if (val === null || val === undefined || isNaN(val)) {
      return { texto: '— vs. anterior', status: 'neutro' }
    }
    if (val === 0) {
      return { texto: '0.0% estável', status: 'neutro' }
    }
    const sinal = val > 0 ? '+' : ''
    const sufixo = isPontosPercentuais ? ' p.p.' : '%'
    return {
      texto: `${sinal}${val.toFixed(1)}${sufixo} vs. anterior`,
      status: val > 0 ? 'positivo' : 'negativo',
    }
  }

  // Lista com os 6 cards especificados
  const cards: CardConfig[] = [
    // Card 1: Total de Clientes
    {
      id: 'kpi-clientes',
      titulo: 'Total de Clientes',
      valor: String(kpis.totalClientes),
      variacao: formatarVariacao(kpis.variacaoClientes).texto,
      variacaoStatus: formatarVariacao(kpis.variacaoClientes).status,
      tooltip: 'Clientes com pelo menos 1 registro de contato',
      icone: Users,
      corIconeBg: 'bg-blue-50',
      corIcone: 'text-[#2563EB]',
    },
    // Card 2: Oportunidades em Aberto
    {
      id: 'kpi-abertas',
      titulo: 'Oportunidades em Aberto',
      valor: String(kpis.oportunidadesAberto),
      variacao: formatarVariacao(kpis.variacaoOportunidades).texto,
      variacaoStatus: formatarVariacao(kpis.variacaoOportunidades).status,
      tooltip: 'Oportunidades ativas no funil',
      icone: Filter,
      corIconeBg: 'bg-indigo-50',
      corIcone: 'text-[#4F46E5]',
    },
  ]

  // Se não for restrito (compras/estoque), inclui os 4 cards comerciais/financeiros
  if (!esconderFinanceiro) {
    cards.push(
      // Card 3: Valor em Pipeline
      {
        id: 'kpi-pipeline',
        titulo: 'Valor em Pipeline',
        valor: formatarMoeda(kpis.valorPipeline),
        variacao: formatarVariacao(kpis.variacaoPipeline).texto,
        variacaoStatus: formatarVariacao(kpis.variacaoPipeline).status,
        tooltip: 'Soma do valor esperado das oportunidades ativas',
        icone: DollarSign,
        corIconeBg: 'bg-sky-50',
        corIcone: 'text-[#0284C7]',
      },
      // Card 4: Vendas do Período
      {
        id: 'kpi-vendas',
        titulo: 'Vendas do Período',
        valor: formatarMoeda(kpis.vendasPeriodo),
        variacao: formatarVariacao(kpis.variacaoVendas).texto,
        variacaoStatus: formatarVariacao(kpis.variacaoVendas).status,
        tooltip: 'Valor total das vendas fechadas no período',
        icone: TrendingUp,
        corIconeBg: 'bg-emerald-50',
        corIcone: 'text-[#16A34A]',
      },
      // Card 5: Taxa de Conversão
      {
        id: 'kpi-conversao',
        titulo: 'Taxa de Conversão',
        valor: `${kpis.taxaConversao.toFixed(1)}%`,
        variacao: formatarVariacao(kpis.variacaoConversaoPontos, true).texto,
        variacaoStatus: formatarVariacao(kpis.variacaoConversaoPontos, true).status,
        tooltip: '% de oportunidades que viraram venda',
        icone: Percent,
        corIconeBg: 'bg-purple-50',
        corIcone: 'text-[#7C3AED]',
      },
      // Card 6: Ticket Médio
      {
        id: 'kpi-ticket',
        titulo: 'Ticket Médio',
        valor: formatarMoeda(kpis.ticketMedio),
        variacao: formatarVariacao(kpis.variacaoTicketMedio).texto,
        variacaoStatus: formatarVariacao(kpis.variacaoTicketMedio).status,
        tooltip: 'Valor médio por venda fechada',
        icone: Receipt,
        corIconeBg: 'bg-amber-50',
        corIcone: 'text-[#CA8A04]',
      },
    )
  }

  // Grid responsivo:
  // Se forem 6 cards: 2 colunas mobile, 3 tablet (md), 6 desktop (xl)
  // Se for estoque/compras (2 cards): 2 colunas responsivas elegantes sem buracos
  const gridClasses = esconderFinanceiro
    ? 'grid grid-cols-1 sm:grid-cols-2 gap-4'
    : 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4'

  return (
    <TooltipProvider delayDuration={150}>
      <div className={gridClasses}>
        {cards.map((c) => {
          const Icone = c.icone
          const isPos = c.variacaoStatus === 'positivo'
          const isNeg = c.variacaoStatus === 'negativo'

          return (
            <Card
              key={c.id}
              className="border border-[#E2E8F0] shadow-sm hover:shadow-md transition-all duration-200 bg-white flex flex-col justify-between"
            >
              <CardHeader className="p-3 sm:p-4 pb-1 sm:pb-2 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-1 min-w-0 pr-1">
                  <span className="text-[11px] sm:text-xs font-semibold text-[#64748B] uppercase tracking-wider truncate">
                    {c.titulo}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-[#94A3B8] hover:text-[#0F172A] inline-flex items-center transition-colors"
                        aria-label={`Informações sobre ${c.titulo}`}
                      >
                        <HelpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="text-xs bg-[#0F172A] text-white p-2 rounded-lg max-w-xs shadow-lg"
                    >
                      <p>{c.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${c.corIconeBg} ${c.corIcone}`}
                >
                  <Icone className="w-4 h-4" />
                </div>
              </CardHeader>

              <CardContent className="p-3 sm:p-4 pt-1 sm:pt-2 space-y-1 sm:space-y-1.5">
                <div className="text-xl sm:text-2xl font-extrabold text-[#0F172A] tracking-tight truncate">
                  {c.valor}
                </div>

                {/* Variação percentual vs período anterior (verde positivo, vermelho negativo, cinza neutro) */}
                <div className="flex items-center gap-1 text-[11px] font-medium leading-tight truncate">
                  {isPos && (
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[2.5]" />
                  )}
                  {isNeg && (
                    <ArrowDownRight className="w-3.5 h-3.5 text-[#DC2626] shrink-0 stroke-[2.5]" />
                  )}
                  {!isPos && !isNeg && <Minus className="w-3.5 h-3.5 text-[#64748B] shrink-0" />}

                  <span
                    className={
                      isPos
                        ? 'text-[#16A34A] font-semibold'
                        : isNeg
                          ? 'text-[#DC2626] font-semibold'
                          : 'text-[#64748B]'
                    }
                  >
                    {c.variacao}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
