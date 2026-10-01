import React, { useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { User, Calendar, Building } from 'lucide-react'
import type { OportunidadeModel } from '@/types/clientes'
import { formatarMoeda, formatarData } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'

interface KanbanCardProps {
  oportunidade: OportunidadeModel
  modoVisao?: 'origem' | 'fechamento'
  usuarios?: Usuario[]
  onClick: (op: OportunidadeModel) => void
  onDragStart: (e: React.DragEvent<HTMLDivElement>, opId: string) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  isDragging?: boolean
}

// Resolução de nome do vendedor a partir do ID salvo em vendedor ou responsavel_id
function obterNomeVendedor(oportunidade: OportunidadeModel, usuarios?: Usuario[]): string {
  const isBling =
    oportunidade.origem === 'bling' ||
    oportunidade.tipo_origem === 'bling_proposta' ||
    oportunidade.tipo_origem === 'bling_pedido'

  const vendedorId = oportunidade.vendedor || oportunidade.responsavel_id
  if (vendedorId && usuarios) {
    const userFound = usuarios.find((u) => u.id === vendedorId)
    if (userFound) {
      if (userFound.nome.includes('Alice')) return 'Alice'
      if (userFound.nome.includes('Renan')) return 'Renan'
      if (userFound.nome.includes('Karoline') || userFound.perfil === 'vendedor_1') {
        return 'Karoline (Vendas 1)'
      }
      if (userFound.perfil === 'vendedor_2') return 'Vendas 2'
      return userFound.nome
    }
  }

  if (oportunidade.expand?.responsavel_id?.nome) {
    const n = oportunidade.expand.responsavel_id.nome
    if (n.includes('Alice')) return 'Alice'
    if (n.includes('Renan')) return 'Renan'
    if (n.includes('Karoline')) return 'Karoline (Vendas 1)'
    return n
  }

  // Se Bling e não tiver vendedor confiável: "Sem vendedor". NUNCA Renan por fallback!
  if (isBling) {
    return 'Sem vendedor'
  }

  return 'Sem vendedor'
}

export default function KanbanCard({
  oportunidade,
  modoVisao = 'origem',
  usuarios,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: KanbanCardProps) {
  // Controle para diferenciar clique simples de arrasto (drag)
  const isDraggingRef = useRef(false)
  const isBling =
    oportunidade.origem === 'bling' ||
    oportunidade.tipo_origem === 'bling_proposta' ||
    oportunidade.tipo_origem === 'bling_pedido'

  const clienteNome =
    oportunidade.expand?.cliente_id?.nome_contato ||
    oportunidade.expand?.cliente_id?.nome_empresa ||
    'Cliente não identificado'
  const nomeVendedor = obterNomeVendedor(oportunidade, usuarios)

  // Badge pequeno "Pedido Bling" / "Proposta Bling" / status relevante
  const renderBadgeOrigemOuStatus = () => {
    if (oportunidade.tipo_origem === 'bling_pedido') {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-medium px-1.5 py-0 h-4 bg-emerald-50 text-emerald-800 border-emerald-200 shrink-0"
        >
          Pedido Bling
        </Badge>
      )
    }
    if (oportunidade.tipo_origem === 'bling_proposta') {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-medium px-1.5 py-0 h-4 bg-amber-50 text-amber-800 border-amber-200 shrink-0"
        >
          Proposta Bling
        </Badge>
      )
    }
    if (oportunidade.status === 'ganho') {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-medium px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0"
        >
          Ganho
        </Badge>
      )
    }
    if (oportunidade.status === 'perdido') {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-medium px-1.5 py-0 h-4 bg-red-50 text-red-700 border-red-200 shrink-0"
        >
          Perdido
        </Badge>
      )
    }
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-medium px-1.5 py-0 h-4 bg-slate-50 text-slate-600 border-slate-200 shrink-0"
      >
        CRM
      </Badge>
    )
  }

  // Data formatada conforme modo de visão (Origem vs Fechamento)
  const dataFormatada = (() => {
    if (modoVisao === 'fechamento') {
      if (oportunidade.status !== 'aberto' && oportunidade.data_fechamento) {
        return formatarData(oportunidade.data_fechamento)
      }
      if (oportunidade.data_prevista_fechamento) {
        return formatarData(oportunidade.data_prevista_fechamento)
      }
      return 'Sem fechamento'
    }
    if (oportunidade.data_origem) {
      return formatarData(oportunidade.data_origem)
    }
    if (oportunidade.data_prevista_fechamento) {
      return formatarData(oportunidade.data_prevista_fechamento)
    }
    return 'Sem data'
  })()

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (isBling) {
      e.preventDefault()
      return
    }
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
      role="button"
      tabIndex={0}
      draggable={!isBling}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(oportunidade)
        }
      }}
      className={`group relative bg-white rounded-xl border border-[#E2E8F0] p-2.5 shadow-xs hover:shadow-md hover:border-[#2563EB]/40 transition-all duration-150 select-none ${
        isBling ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-40 scale-[0.98] border-dashed border-[#2563EB]' : 'opacity-100'}`}
    >
      {/* LINHA 1: Nome do cliente | Valor */}
      <div className="flex items-center justify-between gap-2">
        <h4
          className="font-semibold text-xs text-[#0F172A] truncate flex-1 group-hover:text-[#2563EB] transition-colors"
          title={clienteNome}
        >
          {clienteNome}
        </h4>
        <span className="text-xs font-bold text-[#0F172A] whitespace-nowrap shrink-0">
          {formatarMoeda(oportunidade.valor)}
        </span>
      </div>

      {/* LINHA 2: Vendedor | Data | Badge */}
      <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-[#64748B]">
        <div
          className="flex items-center gap-1.5 truncate min-w-0"
          title={`Vendedor: ${nomeVendedor}`}
        >
          <span className="font-medium truncate text-slate-700">{nomeVendedor}</span>
          <span className="text-slate-300">•</span>
          <span className="whitespace-nowrap text-slate-500">{dataFormatada}</span>
        </div>
        {renderBadgeOrigemOuStatus()}
      </div>
    </div>
  )
}
