import React from 'react'
import {
  TrendingUp,
  ShoppingBag,
  FileText,
  Target,
  Trophy,
  XCircle,
  Percent,
  Users,
  Database,
  HelpCircle,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatarMoeda } from '@/types/clientes'
import type {
  DadosPainelComercialCompleto,
  HistoricoTotalSeparado,
  IndicadoresBaseSistema,
} from '@/services/painelService'

interface PainelKpiCardsProps {
  dados: DadosPainelComercialCompleto
  esconderFinanceiro?: boolean
}

export function PainelKpiCards({ dados, esconderFinanceiro = false }: PainelKpiCardsProps) {
  const {
    contexto,
    pedidos_periodo,
    propostas_periodo,
    oportunidades_periodo,
    historico_total,
    indicadores_base,
  } = dados

  const rotuloPeriodo = contexto.labelPeriodo
  const modoVisaoLabel = contexto.modoVisao === 'fechamento' ? 'por Fechamento' : 'por Origem'

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* =========================================================================
            LINHA 0: INDICADORES ATEMPORAIS DE BASE VS. HISTÓRICO TOTAL SEPARADO
            (Regras 26, 33, 34: Nunca misturar histórico com período; rotular como Base)
           ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* Card: Histórico Total de Vendas Bling (Totalmente separado do período) */}
          {!esconderFinanceiro && (
            <Card className="border border-slate-200 bg-slate-50/70 shadow-xs">
              <CardContent className="p-3 sm:p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Histórico Total (Bling ERP)
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs bg-[#0F172A] text-white p-2">
                          {historico_total.criterio}
                        </TooltipContent>
                      </Tooltip>
                      <Badge
                        variant="outline"
                        className="text-[9px] bg-white text-slate-600 border-slate-300"
                      >
                        Atemporal
                      </Badge>
                    </div>
                    <div className="text-xl font-black text-[#0F172A] mt-0.5">
                      {formatarMoeda(historico_total.valor_vendas_total)}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-500 font-medium block">
                    Pedidos Válidos
                  </span>
                  <span className="text-base font-bold text-slate-800">
                    {historico_total.pedidos_validos_total.toLocaleString('pt-BR')} ped.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card: Base / Sistema (Indicador de Base Atemporal) */}
          <Card className="border border-slate-200 bg-slate-50/70 shadow-xs">
            <CardContent className="p-3 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Base / Sistema Cadastrada
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs bg-[#0F172A] text-white p-2">
                        {indicadores_base.descricao}
                      </TooltipContent>
                    </Tooltip>
                    <Badge
                      variant="outline"
                      className="text-[9px] bg-white text-purple-700 border-purple-200"
                    >
                      Base Global
                    </Badge>
                  </div>
                  <div className="text-xl font-black text-[#0F172A] mt-0.5">
                    {indicadores_base.totalClientesCadastrados.toLocaleString('pt-BR')} clientes
                  </div>
                </div>
              </div>

              <div className="text-right text-xs space-y-0.5">
                <span className="text-[11px] text-purple-700 font-medium block">
                  {indicadores_base.clientesComBlingId} vinculados Bling
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {indicadores_base.totalPedidosCadastradosBase.toLocaleString('pt-BR')} pedidos
                  salvos
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* =========================================================================
            LINHA 1: CARDS COMERCIAIS DO PERÍODO SELECIONADO (Regras 21, 22, 23, 27)
           ========================================================================= */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
              Indicadores do Período:
            </span>
            <Badge className="bg-blue-600 text-white font-bold text-xs hover:bg-blue-600">
              {rotuloPeriodo}
            </Badge>
            <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-300">
              {modoVisaoLabel}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {/* Card 1: Vendas Válidas do Período */}
          {!esconderFinanceiro && (
            <Card className="border border-[#E2E8F0] shadow-sm bg-white hover:border-emerald-300 transition-all col-span-2 xl:col-span-2">
              <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                  Vendas {contexto.ano} (Válidas)
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-1 space-y-1">
                <div className="text-xl font-extrabold text-emerald-700 tracking-tight">
                  {formatarMoeda(pedidos_periodo.valor_vendas_valido)}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                  <span>{pedidos_periodo.pedidos_validos} pedidos válidos</span>
                  <span className="text-[10px] text-emerald-600 font-semibold">
                    Em aberto + Atendido
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card 2: Pedidos do Período (Total e status) */}
          <Card className="border border-[#E2E8F0] shadow-sm bg-white col-span-2 xl:col-span-2">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Pedidos no Período
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <div className="text-xl font-extrabold text-[#0F172A] tracking-tight">
                {pedidos_periodo.total_pedidos}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
                <span className="text-blue-700 font-semibold">
                  {pedidos_periodo.em_aberto.qtd} abertos
                </span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">
                  {pedidos_periodo.atendidos.qtd} atendidos
                </span>
                <span>•</span>
                <span className="text-rose-600">{pedidos_periodo.cancelados.qtd} canc.</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Propostas no Período */}
          <Card className="border border-[#E2E8F0] shadow-sm bg-white col-span-2 xl:col-span-2">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Propostas no Período
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <div className="text-xl font-extrabold text-[#0F172A] tracking-tight">
                {propostas_periodo.total}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
                <span className="text-emerald-700 font-semibold">
                  {propostas_periodo.convertida} conv.
                </span>
                <span>•</span>
                <span className="text-blue-700">{propostas_periodo.aguardando} aguard.</span>
                <span>•</span>
                <span className="text-rose-600">{propostas_periodo.nao_aprovada} não aprov.</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Clientes com Compra no Período */}
          <Card className="border border-[#E2E8F0] shadow-sm bg-white col-span-2 xl:col-span-2">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Clientes com Compra
              </span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <div className="text-xl font-extrabold text-purple-900 tracking-tight">
                {pedidos_periodo.clientes_distintos_com_compra}
              </div>
              <p className="text-[10px] text-[#64748B] truncate">
                Clientes distintos com pedidos válidos em {rotuloPeriodo}
              </p>
            </CardContent>
          </Card>

          {/* Card 5: Oportunidades CRM no Período */}
          <Card className="border border-[#E2E8F0] shadow-sm bg-white col-span-2 xl:col-span-2">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Oportunidades ({modoVisaoLabel})
              </span>
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <div className="text-xl font-extrabold text-[#0F172A] tracking-tight">
                {oportunidades_periodo.total_periodo}
              </div>
              <div className="text-[10px] text-[#64748B]">
                {oportunidades_periodo.abertas.qtd} em aberto (
                {formatarMoeda(oportunidades_periodo.abertas.valor)})
              </div>
            </CardContent>
          </Card>

          {/* Card 6: Ganhos no Período */}
          <Card className="border border-[#E2E8F0] shadow-sm bg-white col-span-2 xl:col-span-2">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Ganhos no Período
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <div className="text-xl font-extrabold text-emerald-700 tracking-tight">
                {oportunidades_periodo.ganhas.qtd}
              </div>
              <div className="text-[10px] text-[#64748B]">
                Valor: {formatarMoeda(oportunidades_periodo.ganhas.valor)}
              </div>
            </CardContent>
          </Card>

          {/* Card 7: Perdidos no Período */}
          <Card className="border border-[#E2E8F0] shadow-sm bg-white col-span-2 xl:col-span-2">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Perdidos no Período
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <XCircle className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <div className="text-xl font-extrabold text-rose-700 tracking-tight">
                {oportunidades_periodo.perdidas.qtd}
              </div>
              <div className="text-[10px] text-[#64748B]">
                Valor: {formatarMoeda(oportunidades_periodo.perdidas.valor)}
              </div>
            </CardContent>
          </Card>

          {/* Card 8: Taxa de Conversão */}
          <Card className="border border-[#E2E8F0] shadow-sm bg-white col-span-2 xl:col-span-2">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                Taxa de Conversão
              </span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Percent className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <div className="text-xl font-extrabold text-purple-900 tracking-tight">
                {oportunidades_periodo.taxa_conversao.toFixed(1)}%
              </div>
              <p className="text-[10px] text-[#64748B] truncate">
                Ticket Médio: {formatarMoeda(oportunidades_periodo.ticket_medio)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}
export default PainelKpiCards
