import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EtapaFunilModel, OportunidadeModel } from '@/types/clientes'
import { formatarMoeda } from '@/types/clientes'
import KanbanCard from './KanbanCard'

interface KanbanColumnProps {
  etapa: EtapaFunilModel
  oportunidades: OportunidadeModel[]
  modoVisao?: 'origem' | 'fechamento'
  draggedOpId?: string | null
  onCardClick: (op: OportunidadeModel) => void
  onNovaOportunidadeEtapa: (etapaId: string) => void
  onDragStart: (e: React.DragEvent<HTMLDivElement>, opId: string) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  onDropOnEtapa: (opId: string, novaEtapaId: string) => void
}

export default function KanbanColumn({
  etapa,
  oportunidades,
  modoVisao,
  draggedOpId,
  onCardClick,
  onNovaOportunidadeEtapa,
  onDragStart,
  onDragEnd,
  onDropOnEtapa,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const etapaCor = etapa.cor || '#2563EB'
  const totalValor = oportunidades.reduce((acc, curr) => acc + (curr.valor || 0), 0)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Evita resetar se o cursor for para um filho
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const opId = e.dataTransfer.getData('text/plain') || draggedOpId
    if (opId) {
      // Verificar se a oportunidade arrastada é Bling
      const opArrastada = oportunidades.find((o) => o.id === opId)
      if (
        opArrastada &&
        (opArrastada.origem === 'bling' ||
          opArrastada.tipo_origem === 'bling_proposta' ||
          opArrastada.tipo_origem === 'bling_pedido')
      ) {
        return
      }
      onDropOnEtapa(etapa.id, opId)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col flex-shrink-0 w-full md:w-80 bg-slate-50/80 rounded-2xl border transition-all duration-200 max-h-[calc(100vh-280px)] min-h-[480px] ${
        isDragOver
          ? 'border-[#2563EB] bg-blue-50/40 ring-2 ring-blue-200 shadow-md'
          : 'border-[#E2E8F0]'
      }`}
    >
      {/* Cabeçalho da Coluna com indicador colorido da etapa */}
      <div className="p-3.5 border-b border-[#E2E8F0] bg-white rounded-t-2xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: etapaCor }}
            />
            <h3 className="font-bold text-sm text-[#0F172A] truncate" title={etapa.nome}>
              {etapa.nome}
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-[#64748B]">
              {oportunidades.length}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNovaOportunidadeEtapa(etapa.id)}
            className="h-7 w-7 p-0 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50 rounded-lg shrink-0"
            title={`Nova oportunidade em "${etapa.nome}"`}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Total financeiro acumulado na etapa */}
        <div className="flex items-center justify-between text-xs text-[#64748B] pt-1">
          <span>Subtotal:</span>
          <span className="font-bold text-[#0F172A]">{formatarMoeda(totalValor)}</span>
        </div>
      </div>

      {/* Lista de Cards com Scroll Vertical */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {oportunidades.length === 0 ? (
          <div
            className={`py-12 text-center rounded-xl border border-dashed text-xs text-[#94A3B8] flex flex-col items-center justify-center gap-2 ${
              isDragOver ? 'border-[#2563EB] bg-blue-50/50 text-[#2563EB]' : 'border-[#CBD5E1]'
            }`}
          >
            <span>{isDragOver ? 'Solte para mover aqui' : 'Nenhuma oportunidade'}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNovaOportunidadeEtapa(etapa.id)}
              className="text-[11px] h-7 px-2.5 mt-1 border-dashed"
            >
              <Plus className="w-3 h-3 mr-1" />
              Adicionar
            </Button>
          </div>
        ) : (
          oportunidades.map((op) => (
            <KanbanCard
              key={op.id}
              oportunidade={op}
              modoVisao={modoVisao}
              onClick={onCardClick}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggedOpId === op.id}
            />
          ))
        )}
      </div>
    </div>
  )
}
