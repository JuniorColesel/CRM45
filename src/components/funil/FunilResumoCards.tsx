import React from 'react'
import { DollarSign, TrendingUp, CheckCircle2, Percent } from 'lucide-react'
import { formatarMoeda } from '@/types/clientes'

interface FunilResumoCardsProps {
  totalAbertas: number
  valorPipeline: number
  taxaConversao: number
  ticketMedio: number
}

export default function FunilResumoCards({
  totalAbertas,
  valorPipeline,
  taxaConversao,
  ticketMedio,
}: FunilResumoCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1) Total de oportunidades abertas */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
            Oportunidades Abertas
          </p>
          <p className="text-2xl font-extrabold text-[#0F172A] tracking-tight">{totalAbertas}</p>
          <p className="text-[11px] text-[#64748B]">Em negociação ativa</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
          <TrendingUp className="w-5 h-5" />
        </div>
      </div>

      {/* 2) Valor total em pipeline (soma dos valores das abertas) */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex items-center justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider truncate">
            Valor em Pipeline
          </p>
          <p className="text-2xl font-extrabold text-[#2563EB] tracking-tight truncate">
            {formatarMoeda(valorPipeline)}
          </p>
          <p className="text-[11px] text-[#64748B]">Soma das propostas abertas</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100 shrink-0">
          <DollarSign className="w-5 h-5" />
        </div>
      </div>

      {/* 3) Taxa de conversão: ganhas / (ganhas + perdidas) * 100 */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
            Taxa de Conversão
          </p>
          <p className="text-2xl font-extrabold text-[#16A34A] tracking-tight">
            {taxaConversao.toFixed(1)}%
          </p>
          <p className="text-[11px] text-[#64748B]">Ganhas sobre finalizadas</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#16A34A] flex items-center justify-center border border-emerald-100">
          <Percent className="w-5 h-5" />
        </div>
      </div>

      {/* 4) Ticket médio (valor médio das oportunidades ganhas) */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex items-center justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider truncate">
            Ticket Médio
          </p>
          <p className="text-2xl font-extrabold text-[#7C3AED] tracking-tight truncate">
            {formatarMoeda(ticketMedio)}
          </p>
          <p className="text-[11px] text-[#64748B]">Média de negócios ganhos</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-purple-50 text-[#7C3AED] flex items-center justify-center border border-purple-100 shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}
