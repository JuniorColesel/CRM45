import React, { useState } from 'react'
import type { EtapaFunilModel, OportunidadeModel } from '@/types/clientes'
import KanbanColumn from './KanbanColumn'

import type { Usuario } from '@/contexts/AuthContext'

interface KanbanBoardProps {
  etapas: EtapaFunilModel[]
  oportunidadesPorEtapa: Record<string, OportunidadeModel[]>
  subtotaisEtapasBackend?: Record<string, { quantidade: number; valor_total: number }>
  modoVisao?: 'origem' | 'fechamento'
  usuarios?: Usuario[]
  carregandoPorEtapa?: Record<string, boolean>
  temMaisPorEtapa?: Record<string, boolean>
  onCarregarMaisEtapa?: (etapaId: string) => void
  onCardClick: (op: OportunidadeModel) => void
  onNovaOportunidadeEtapa: (etapaId: string) => void
  onMudarEtapa: (opId: string, novaEtapaId: string) => void
}

export default function KanbanBoard({
  etapas,
  oportunidadesPorEtapa,
  subtotaisEtapasBackend,
  modoVisao,
  usuarios,
  carregandoPorEtapa,
  temMaisPorEtapa,
  onCarregarMaisEtapa,
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
    onMudarEtapa(opId, novaEtapaId)
  }

  return (
    <div className="w-full h-full min-h-0">
      {/* Desktop: scroll horizontal do Kanban se não couber na largura; colunas com altura total do container */}
      <div className="flex flex-col md:flex-row gap-3 overflow-x-auto pb-2 pt-0.5 items-stretch h-full min-h-0">
        {etapas.map((etapa) => {
          const opsColuna = oportunidadesPorEtapa[etapa.id] || []
          const carregandoMais = Boolean(carregandoPorEtapa && carregandoPorEtapa[etapa.id])
          const temMais = Boolean(temMaisPorEtapa && temMaisPorEtapa[etapa.id])

          return (
            <KanbanColumn
              key={etapa.id}
              etapa={etapa}
              oportunidades={opsColuna}
              subtotalBackend={
                subtotaisEtapasBackend ? subtotaisEtapasBackend[etapa.id] : undefined
              }
              modoVisao={modoVisao}
              usuarios={usuarios}
              draggedOpId={draggedOpId}
              carregandoMais={carregandoMais}
              temMais={temMais}
              onCarregarMais={() => onCarregarMaisEtapa?.(etapa.id)}
              onCardClick={onCardClick}
              onNovaOportunidadeEtapa={onNovaOportunidadeEtapa}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDropOnEtapa={handleDropOnEtapa}
            />
          )
        })}
      </div>
    </div>
  )
}
