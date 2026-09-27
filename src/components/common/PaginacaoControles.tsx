import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface PaginacaoControlesProps {
  paginaAtual: number
  totalPaginas: number
  totalRegistros: number
  itensPorPagina: number
  onPaginaChange: (pagina: number) => void
  onItensPorPaginaChange: (itens: number) => void
  opcoesItensPorPagina?: number[]
  nomeItens?: string
  loading?: boolean
}

export function PaginacaoControles({
  paginaAtual,
  totalPaginas,
  totalRegistros,
  itensPorPagina,
  onPaginaChange,
  onItensPorPaginaChange,
  opcoesItensPorPagina = [25, 50, 100],
  nomeItens = 'registros',
  loading = false,
}: PaginacaoControlesProps) {
  const paginasValidas = Math.max(1, totalPaginas)
  const paginaValida = Math.min(Math.max(1, paginaAtual), paginasValidas)

  const inicio = totalRegistros === 0 ? 0 : (paginaValida - 1) * itensPorPagina + 1
  const fim = Math.min(paginaValida * itensPorPagina, totalRegistros)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#E2E8F0] bg-white text-xs text-[#64748B]">
      {/* Seletor de registros por página e resumo de exibição */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        <div className="flex items-center gap-2">
          <span>Exibir</span>
          <Select
            value={String(itensPorPagina)}
            onValueChange={(val) => onItensPorPaginaChange(Number(val))}
            disabled={loading}
          >
            <SelectTrigger className="h-8 w-[72px] text-xs bg-[#F8FAFC] border-[#CBD5E1]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opcoesItensPorPagina.map((opcao) => (
                <SelectItem key={opcao} value={String(opcao)}>
                  {opcao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>por página</span>
        </div>

        <span className="hidden sm:inline text-slate-300">|</span>

        <span className="text-[11px] sm:text-xs text-[#64748B]">
          {totalRegistros === 0 ? (
            'Nenhum registro'
          ) : (
            <>
              Mostrando <strong className="text-[#0F172A]">{inicio}</strong> a{' '}
              <strong className="text-[#0F172A]">{fim}</strong> de{' '}
              <strong className="text-[#0F172A]">{totalRegistros}</strong> {nomeItens}
            </>
          )}
        </span>
      </div>

      {/* Controles de navegação: Anterior, Página X de Y, Próximo */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
        <span className="text-xs font-medium text-[#0F172A]">
          Página <strong className="text-[#0F172A]">{paginaValida}</strong> de{' '}
          <strong className="text-[#0F172A]">{paginasValidas}</strong>
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPaginaChange(paginaValida - 1)}
            disabled={loading || paginaValida <= 1}
            className="h-8 px-2.5 text-xs gap-1 border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPaginaChange(paginaValida + 1)}
            disabled={loading || paginaValida >= paginasValidas}
            className="h-8 px-2.5 text-xs gap-1 border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50 disabled:opacity-40"
          >
            <span className="hidden sm:inline">Próximo</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
