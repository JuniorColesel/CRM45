import { useState, useMemo } from 'react'
import {
  LISTA_POPS,
  imprimirPop,
  type ProcedimentoOperacionalPadrao,
} from '@/data/popTreinamentoData'
import {
  Search,
  Printer,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type PerfilFiltro = 'todos' | 'ceo' | 'coordenador' | 'vendedor' | 'compras' | 'estoque'

const OPCOES_FILTRO: { id: PerfilFiltro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'ceo', label: 'CEO' },
  { id: 'coordenador', label: 'Coordenador' },
  { id: 'vendedor', label: 'Vendedor' },
  { id: 'compras', label: 'Compras' },
  { id: 'estoque', label: 'Estoque' },
]

export function AbaProcedimentos() {
  const [perfilFiltro, setPerfilFiltro] = useState<PerfilFiltro>('todos')
  const [busca, setBusca] = useState('')
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() => {
    // Inicialmente abre o primeiro POP para familiaridade
    return { 'pop-001': true }
  })

  const toggleAccordion = (id: string) => {
    setOpenIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const expandirTodos = () => {
    const todos: Record<string, boolean> = {}
    LISTA_POPS.forEach((p) => {
      todos[p.id] = true
    })
    setOpenIds(todos)
  }

  const recolherTodos = () => {
    setOpenIds({})
  }

  const popsFiltrados = useMemo(() => {
    return LISTA_POPS.filter((pop) => {
      // Filtro de perfil
      const atendePerfil =
        perfilFiltro === 'todos' ||
        pop.perfisValidos.includes('todos') ||
        pop.perfisValidos.includes(perfilFiltro)

      if (!atendePerfil) return false

      // Filtro de busca (título ou conteúdo dos itens ou descrição)
      if (busca.trim()) {
        const termo = busca.toLowerCase()
        const noTitulo = pop.titulo.toLowerCase().includes(termo)
        const noCodigo = pop.codigo.toLowerCase().includes(termo)
        const naDesc = pop.descricaoCurta.toLowerCase().includes(termo)
        const nosItens = pop.itens.some((item) => item.toLowerCase().includes(termo))
        return noTitulo || noCodigo || naDesc || nosItens
      }

      return true
    })
  }, [perfilFiltro, busca])

  const getBadgeColor = (perfil: string) => {
    if (perfil.includes('Todos')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    }
    if (perfil.includes('CEO') && !perfil.includes('Vendedor')) {
      return 'bg-purple-50 text-purple-700 border-purple-200'
    }
    if (perfil.includes('Coordenador')) {
      return 'bg-blue-50 text-blue-700 border-blue-200'
    }
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }

  return (
    <div className="space-y-6">
      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-5 shadow-sm space-y-4">
        {/* Linha superior: Seletor de Perfis */}
        <div>
          <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">
            Filtrar por perfil aplicável
          </label>
          <div className="flex flex-wrap gap-2">
            {OPCOES_FILTRO.map((opt) => {
              const selecionado = perfilFiltro === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPerfilFiltro(opt.id)}
                  className={[
                    'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150',
                    selecionado
                      ? 'bg-[#16A34A] text-white shadow-sm font-semibold'
                      : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] hover:text-[#0F172A]',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Linha inferior: Campo de Busca e Ações Rápidas */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-2 border-t border-[#F1F5F9]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, código ou conteúdo..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent transition-all"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#94A3B8] hover:text-[#0F172A]"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-[#64748B]">
            <button
              type="button"
              onClick={expandirTodos}
              className="hover:text-[#16A34A] font-medium transition-colors"
            >
              Expandir todos
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={recolherTodos}
              className="hover:text-[#16A34A] font-medium transition-colors"
            >
              Recolher todos
            </button>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline font-medium text-[#0F172A]">
              {popsFiltrados.length} de {LISTA_POPS.length} POPs
            </span>
          </div>
        </div>
      </div>

      {/* Lista de Cards Expansíveis (Accordion) */}
      {popsFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <FileText className="w-12 h-12 text-[#94A3B8] mx-auto mb-3 stroke-[1.5]" />
          <h3 className="text-base font-semibold text-[#0F172A]">Nenhum procedimento encontrado</h3>
          <p className="text-sm text-[#64748B] mt-1">
            Tente ajustar os filtros de perfil ou o termo de busca digitado.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPerfilFiltro('todos')
              setBusca('')
            }}
            className="mt-4 border-[#CBD5E1]"
          >
            Limpar todos os filtros
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {popsFiltrados.map((pop: ProcedimentoOperacionalPadrao) => {
            const isOpen = !!openIds[pop.id]

            return (
              <div
                key={pop.id}
                className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden transition-all duration-200 hover:border-[#CBD5E1] shadow-sm"
              >
                {/* Cabeçalho do Accordion */}
                <div
                  onClick={() => toggleAccordion(pop.id)}
                  className="w-full text-left p-4 sm:p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-[#F8FAFC] transition-colors select-none"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#16A34A] flex items-center justify-center flex-shrink-0 font-bold text-xs border border-emerald-100 mt-0.5">
                      {pop.codigo.replace('POP-', '')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-[#16A34A] tracking-wide">
                          {pop.codigo}
                        </span>
                        <h2 className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight">
                          {pop.titulo}
                        </h2>
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-semibold px-2 py-0.5 border ${getBadgeColor(
                            pop.perfilAplicavel,
                          )}`}
                        >
                          <Users className="w-3 h-3 mr-1" />
                          {pop.perfilAplicavel}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#64748B] line-clamp-1">{pop.descricaoCurta}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        imprimirPop(pop)
                      }}
                      title="Imprimir este POP"
                      aria-label={`Imprimir ${pop.codigo}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#475569] bg-[#F1F5F9] hover:bg-[#E2E8F0] hover:text-[#0F172A] transition-colors border border-[#E2E8F0]"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#16A34A]" />
                      <span className="hidden sm:inline">Imprimir POP</span>
                    </button>

                    <div className="p-1 text-[#64748B]">
                      {isOpen ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Conteúdo Expansível com Animação */}
                {isOpen && (
                  <div className="border-t border-[#E2E8F0] bg-[#FAFAFA] p-5 sm:p-6 space-y-5 animate-fade-in-fast">
                    {/* Meta Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B] bg-white p-3 rounded-lg border border-[#E2E8F0]">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
                        <span>
                          <strong>Perfil aplicável:</strong> {pop.perfilAplicavel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#64748B]" />
                        <span>
                          <strong>Última atualização:</strong> {pop.ultimaAtualizacao} (v
                          {pop.versao})
                        </span>
                      </div>
                    </div>

                    {/* Descrição em destaque */}
                    <div className="bg-emerald-50/60 border-l-4 border-[#16A34A] p-3.5 rounded-r-lg">
                      <p className="text-xs uppercase font-bold text-[#166534] tracking-wider mb-0.5">
                        Objetivo / Descrição Curta
                      </p>
                      <p className="text-sm text-[#0F172A] font-medium">{pop.descricaoCurta}</p>
                    </div>

                    {/* Lista Formatada de Procedimentos */}
                    <div>
                      <h4 className="text-xs uppercase font-bold text-[#475569] tracking-wider mb-3">
                        Passos do Procedimento:
                      </h4>
                      <ol className="space-y-2.5">
                        {pop.itens.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-3 bg-white p-3 rounded-lg border border-[#E2E8F0] text-sm text-[#0F172A]"
                          >
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-[#166534] font-bold text-xs flex items-center justify-center mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Ação de Rodapé */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                        <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                        <span>Procedimento padronizado Colesel 45</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => imprimirPop(pop)}
                        className="text-xs gap-1.5 border-[#CBD5E1]"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#16A34A]" />
                        Imprimir Versão Completa
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
