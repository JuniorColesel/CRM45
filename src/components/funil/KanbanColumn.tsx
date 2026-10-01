import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EtapaFunilModel, OportunidadeModel } from '@/types/clientes'
import { formatarMoeda } from '@/types/clientes'
import KanbanCard from './KanbanCard'

import type { Usuario } from '@/contexts/AuthContext'

interface KanbanColumnProps {
  etapa: EtapaFunilModel
  oportunidades: OportunidadeModel[]
  subtotalBackend?: { quantidade: number; valor_total: number }
  modoVisao?: 'origem' | 'fechamento'
  usuarios?: Usuario[]
  draggedOpId?: string | null
  carregandoMais?: boolean
  temMais?: boolean
  onCarregarMais?: () => void
  onCardClick: (op: OportunidadeModel) => void
  onNovaOportunidadeEtapa: (etapaId: string) => void
  onDragStart: (e: React.DragEvent<HTMLDivElement>, opId: string) => void
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void
  onDropOnEtapa: (opId: string, novaEtapaId: string) => void
}

export default function KanbanColumn({
  etapa,
  oportunidades,
  subtotalBackend,
  modoVisao,
  usuarios,
  draggedOpId,
  carregandoMais = false,
  temMais = false,
  onCarregarMais,
  onCardClick,
  onNovaOportunidadeEtapa,
  onDragStart,
  onDragEnd,
  onDropOnEtapa,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const etapaCor = etapa.cor || '#2563EB'
  // Contadores e subtotais vêm da agregação do BACKEND
  // Se o backend fornecer, usa estritamente o valor do backend sobre todas as oportunidades da etapa
  const totalValor =
    subtotalBackend !== undefined
      ? subtotalBackend.valor_total
      : oportunidades.reduce((acc, curr) => acc + (curr.valor || 0), 0)
  const totalQtd = subtotalBackend !== undefined ? subtotalBackend.quantidade : oportunidades.length

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
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

  // Detectar scroll próximo ao fundo para lazy loading incremental independente
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!temMais || carregandoMais || !onCarregarMais) return
    const target = e.currentTarget
    const diferenca = target.scrollHeight - target.scrollTop - target.clientHeight
    if (diferenca < 120) {
      onCarregarMais()
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col flex-shrink-0 w-full md:w-72 lg:w-80 bg-slate-50/90 rounded-2xl border transition-all duration-150 h-full max-h-full ${
        isDragOver
          ? 'border-[#2563EB] bg-blue-50/40 ring-2 ring-blue-200 shadow-md'
          : 'border-[#E2E8F0]'
      }`}
    >
      {/* Cabeçalho sticky/fixo da Coluna com contador e subtotal fixos */}
      <div className="p-3 border-b border-[#E2E8F0] bg-white rounded-t-2xl space-y-1.5 shrink-0 select-none shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: etapaCor }}
            />
            <h3 className="font-bold text-xs sm:text-sm text-[#0F172A] truncate" title={etapa.nome}>
              {etapa.nome}
            </h3>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-[#64748B]"
              title={`Total no filtro: ${totalQtd} (${oportunidades.length} carregados visualmente)`}
            >
              {totalQtd}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNovaOportunidadeEtapa(etapa.id)}
            className="h-6 w-6 p-0 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50 rounded-md shrink-0"
            title={`Nova oportunidade em "${etapa.nome}"`}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Subtotal fixo no cabeçalho */}
        <div className="flex items-center justify-between text-[11px] text-[#64748B]">
          <span>Subtotal:</span>
          <span className="font-bold text-[#0F172A]">{formatarMoeda(totalValor)}</span>
        </div>
      </div>

      {/* Lista rolável INDEPENDENTE por coluna */}
      <div onScroll={handleScroll} className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
        {oportunidades.length === 0 ? (
          <div
            className={`py-8 text-center rounded-xl border border-dashed text-xs text-[#94A3B8] flex flex-col items-center justify-center gap-2 ${
              isDragOver ? 'border-[#2563EB] bg-blue-50/50 text-[#2563EB]' : 'border-[#CBD5E1]'
            }`}
          >
            <span>{isDragOver ? 'Solte para mover aqui' : 'Nenhuma oportunidade'}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNovaOportunidadeEtapa(etapa.id)}
              className="text-[11px] h-6 px-2 border-dashed"
            >
              <Plus className="w-3 h-3 mr-1" />
              Adicionar
            </Button>
          </div>
        ) : (
          <>
            {oportunidades.map((op) => (
              <KanbanCard
                key={op.id}
                oportunidade={op}
                modoVisao={modoVisao}
                usuarios={usuarios}
                onClick={onCardClick}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={draggedOpId === op.id}
              />
            ))}

            {/* Indicador de carregamento ou botão carregar mais */}
            {temMais && (
              <div className="pt-1 pb-1 text-center">
                {carregandoMais ? (
                  <span className="text-[11px] text-[#64748B] animate-pulse">
                    Carregando mais...
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onCarregarMais}
                    className="text-[11px] text-[#2563EB] hover:underline font-medium"
                  >
                    Carregar mais ({oportunidades.length} de {totalQtd})
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
