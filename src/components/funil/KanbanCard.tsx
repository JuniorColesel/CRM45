import React, { useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { User, Calendar, Building, DollarSign } from 'lucide-react'
import type { OportunidadeModel } from '@/types/clientes'
import { formatarMoeda, formatarData } from '@/types/clientes'

interface KanbanCardProps {
  oportunidade: OportunidadeModel
  onClick: (op: OportunidadeModel) => void
  onDragStart: (e: React.DragEvent<HTMLDivElement>, opId: string) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  isDragging?: boolean
}

export default function KanbanCard({
  oportunidade,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: KanbanCardProps) {
  // Controle para diferenciar clique simples de arrasto (drag)
  const isDraggingRef = useRef(false)

  const clienteNome = oportunidade.expand?.cliente_id?.nome_contato || 'Cliente não identificado'
  const empresaNome = oportunidade.expand?.cliente_id?.nome_empresa
  const respNome =
    oportunidade.expand?.responsavel_id?.nome ||
    oportunidade.expand?.responsavel_id?.email ||
    'Responsável'

  const renderStatusBadge = () => {
    switch (oportunidade.status) {
      case 'ganho':
        return (
          <Badge className="bg-emerald-100 text-[#16A34A] border-emerald-200 text-[10px] font-bold px-2 py-0.5">
            Ganho
          </Badge>
        )
      case 'perdido':
        return (
          <Badge className="bg-red-100 text-[#DC2626] border-red-200 text-[10px] font-bold px-2 py-0.5">
            Perdido
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-[#64748B] border-slate-300 text-[10px] font-bold px-2 py-0.5">
            Aberto
          </Badge>
        )
    }
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    isDraggingRef.current = true
    e.dataTransfer.setData('text/plain', oportunidade.id)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart(e, oportunidade.id)
  }

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    onDragEnd(e)
    setTimeout(() => {
      isDraggingRef.current = false
    }, 100)
  }

  const handleClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) return
    e.stopPropagation()
    onClick(oportunidade)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`group relative bg-white rounded-xl border border-[#E2E8F0] p-3.5 shadow-sm hover:shadow-md hover:border-[#CBD5E1] transition-all duration-150 cursor-grab active:cursor-grabbing select-none ${
        isDragging ? 'opacity-40 scale-[0.98] border-dashed border-[#2563EB]' : 'opacity-100'
      }`}
    >
      {/* Topo do Card: Cliente e Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-sm text-[#0F172A] truncate group-hover:text-[#2563EB] transition-colors">
            {clienteNome}
          </h4>
          {empresaNome && (
            <p className="text-[11px] text-[#64748B] truncate flex items-center gap-1 mt-0.5">
              <Building className="w-3 h-3 text-[#94A3B8] shrink-0" />
              <span className="truncate">{empresaNome}</span>
            </p>
          )}
        </div>
        <div className="shrink-0">{renderStatusBadge()}</div>
      </div>

      {/* Valor da oportunidade em destaque */}
      <div className="mt-2.5 flex items-baseline gap-1">
        <span className="text-base font-extrabold text-[#0F172A] tracking-tight">
          {formatarMoeda(oportunidade.valor)}
        </span>
      </div>

      {/* Rodapé: Responsável e Data Prevista */}
      <div className="mt-3 pt-2.5 border-t border-[#F1F5F9] flex items-center justify-between gap-2 text-[11px] text-[#64748B]">
        {/* Responsável com mini avatar */}
        <div
          className="flex items-center gap-1.5 truncate min-w-0"
          title={`Responsável: ${respNome}`}
        >
          <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[9px] flex items-center justify-center shrink-0">
            {respNome.charAt(0).toUpperCase()}
          </div>
          <span className="truncate font-medium">{respNome}</span>
        </div>

        {/* Previsão */}
        {oportunidade.data_prevista_fechamento ? (
          <div
            className="flex items-center gap-1 shrink-0 text-[#64748B]"
            title={`Previsão de fechamento: ${formatarData(oportunidade.data_prevista_fechamento)}`}
          >
            <Calendar className="w-3 h-3 text-[#94A3B8]" />
            <span>{formatarData(oportunidade.data_prevista_fechamento)}</span>
          </div>
        ) : (
          <span className="text-[#94A3B8] text-[10px] shrink-0">Sem data</span>
        )}
      </div>
    </div>
  )
}
