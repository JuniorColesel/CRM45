import React, { useState } from 'react'
import type { EtapaFunilModel, OportunidadeModel } from '@/types/clientes'
import KanbanColumn from './KanbanColumn'

import type { Usuario } from '@/contexts/AuthContext'

interface KanbanBoardProps {
  etapas: EtapaFunilModel[]
  oportunidades: OportunidadeModel[]
  subtotaisEtapasBackend?: Record<string, { quantidade: number; valor_total: number }>
  modoVisao?: 'origem' | 'fechamento'
  usuarios?: Usuario[]
  onCardClick: (op: OportunidadeModel) => void
  onNovaOportunidadeEtapa: (etapaId: string) => void
  onMudarEtapa: (opId: string, novaEtapaId: string) => void
}

export default function KanbanBoard({
  etapas,
  oportunidades,
  subtotaisEtapasBackend,
  modoVisao,
  usuarios,
  onCardClick,
  onNovaOportunidadeEtapa,
  onMudarEtapa,
}: KanbanBoardProps) {
  const [draggedOpId, setDraggedOpId] = useState<string | null>(null)

  const handleDragStart = (_e: React.DragEvent<HTMLDivElement>, opId: string) => {
    setDraggedOpId(opId)
  }

  const handleDragEnd = () => {
    setDraggedOpId(null)
  }

  const handleDropOnEtapa = (novaEtapaId: string, opId: string) => {
    const op = oportunidades.find((o) => o.id === opId)
    if (!op) return
    if (op.etapa_id === novaEtapaId) return
    onMudarEtapa(opId, novaEtapaId)
  }

  // Agrupar oportunidades por etapa
  const oportunidadesPorEtapa = React.useMemo(() => {
    const mapa: Record<string, OportunidadeModel[]> = {}
    etapas.forEach((et) => {
      mapa[et.id] = []
    })
    oportunidades.forEach((op) => {
      if (mapa[op.etapa_id]) {
        mapa[op.etapa_id].push(op)
      } else if (etapas.length > 0) {
        // Fallback caso a etapa não esteja na lista de etapas conhecidas
        if (!mapa[etapas[0].id]) mapa[etapas[0].id] = []
        mapa[etapas[0].id].push(op)
      }
    })
    return mapa
  }, [etapas, oportunidades])

  return (
    <div className="w-full">
      {/* Desktop: scroll horizontal com colunas lado a lado */}
      {/* Mobile: colunas empilhadas verticalmente */}
      <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4 pt-1 items-stretch">
        {etapas.map((etapa) => (
          <KanbanColumn
            key={etapa.id}
            etapa={etapa}
            oportunidades={oportunidadesPorEtapa[etapa.id] || []}
            subtotalBackend={subtotaisEtapasBackend ? subtotaisEtapasBackend[etapa.id] : undefined}
            modoVisao={modoVisao}
            usuarios={usuarios}
            draggedOpId={draggedOpId}
            onCardClick={onCardClick}
            onNovaOportunidadeEtapa={onNovaOportunidadeEtapa}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDropOnEtapa={handleDropOnEtapa}
          />
        ))}
      </div>
    </div>
  )
}
