import React from 'react'
import { Search, Filter, Calendar, User, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Usuario } from '@/contexts/AuthContext'

export interface FunilFiltrosState {
  busca: string
  responsavelId: string // 'todos' ou id do usuario
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
  status: 'todos' | 'aberto' | 'ganho' | 'perdido'
}

interface FunilFiltrosProps {
  filtros: FunilFiltrosState
  onFiltrosChange: (novos: FunilFiltrosState) => void
  usuarios: Usuario[]
  totalFiltrado: number
  totalGeral: number
}

export default function FunilFiltros({
  filtros,
  onFiltrosChange,
  usuarios,
  totalFiltrado,
  totalGeral,
}: FunilFiltrosProps) {
  const temFiltroAtivo =
    Boolean(filtros.busca.trim()) ||
    filtros.responsavelId !== 'todos' ||
    Boolean(filtros.dataInicio) ||
    Boolean(filtros.dataFim) ||
    filtros.status !== 'todos'

  const limparFiltros = () => {
    onFiltrosChange({
      busca: '',
      responsavelId: 'todos',
      dataInicio: '',
      dataFim: '',
      status: 'todos',
    })
  }

  return (
    <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
        {/* Busca por cliente ou responsável */}
        <div className="lg:col-span-4 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <Input
            placeholder="Buscar por cliente ou responsável..."
            value={filtros.busca}
            onChange={(e) => onFiltrosChange({ ...filtros, busca: e.target.value })}
            className="pl-9 bg-[#F8FAFC] border-[#E2E8F0] focus-visible:bg-white text-xs sm:text-sm h-9"
          />
          {filtros.busca && (
            <button
              onClick={() => onFiltrosChange({ ...filtros, busca: '' })}
              className="absolute right-2.5 top-2.5 text-xs text-[#64748B] hover:text-[#0F172A]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtro por Responsável */}
        <div className="lg:col-span-3">
          <Select
            value={filtros.responsavelId}
            onValueChange={(val) => onFiltrosChange({ ...filtros, responsavelId: val })}
          >
            <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9">
              <div className="flex items-center gap-1.5 truncate">
                <User className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <SelectValue placeholder="Responsável" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Responsáveis</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro por Status */}
        <div className="lg:col-span-2">
          <Select
            value={filtros.status}
            onValueChange={(val: 'todos' | 'aberto' | 'ganho' | 'perdido') =>
              onFiltrosChange({ ...filtros, status: val })
            }
          >
            <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9">
              <div className="flex items-center gap-1.5 truncate">
                <Filter className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="aberto">Abertas</SelectItem>
              <SelectItem value="ganho">Ganhas</SelectItem>
              <SelectItem value="perdido">Perdidas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Intervalo de Data Prevista de Fechamento */}
        <div className="lg:col-span-3 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              type="date"
              title="Data inicial prevista"
              value={filtros.dataInicio}
              onChange={(e) => onFiltrosChange({ ...filtros, dataInicio: e.target.value })}
              className="bg-[#F8FAFC] border-[#E2E8F0] text-xs h-9 px-2"
            />
          </div>
          <span className="text-xs text-[#64748B]">até</span>
          <div className="relative flex-1">
            <Input
              type="date"
              title="Data final prevista"
              value={filtros.dataFim}
              onChange={(e) => onFiltrosChange({ ...filtros, dataFim: e.target.value })}
              className="bg-[#F8FAFC] border-[#E2E8F0] text-xs h-9 px-2"
            />
          </div>
        </div>
      </div>

      {/* Linha de status / Limpar filtros */}
      <div className="flex items-center justify-between text-xs text-[#64748B] pt-1 border-t border-[#F1F5F9]">
        <span>
          Mostrando <strong className="text-[#0F172A]">{totalFiltrado}</strong> de{' '}
          <strong className="text-[#0F172A]">{totalGeral}</strong> oportunidades
        </span>

        {temFiltroAtivo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={limparFiltros}
            className="h-7 px-2 text-xs text-[#DC2626] hover:bg-red-50 hover:text-[#B91C1C]"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
