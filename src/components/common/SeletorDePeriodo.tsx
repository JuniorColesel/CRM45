import React, { useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Filter, Eye, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import {
  usePeriodo,
  MESES_PT_BR,
  type MesFiltro,
  formatarDataComercialBr,
} from '@/contexts/PeriodoContext'

export interface SeletorDePeriodoProps {
  className?: string
  anosDisponiveis?: number[]
  mostrarModoVisao?: boolean // alternar entre data_origem e data_fechamento
  mostrarHistoricoTotalCard?: boolean
  labelCustomizado?: string
  onChange?: (ano: number, mes: MesFiltro) => void
}

export function SeletorDePeriodo({
  className = '',
  anosDisponiveis,
  mostrarModoVisao = true,
  labelCustomizado,
  onChange,
}: SeletorDePeriodoProps) {
  const {
    ano,
    mes,
    nomeMesAno,
    periodo,
    dataInicioPersonalizada,
    dataFimPersonalizada,
    isPersonalizado,
    modoVisao,
    setAno,
    setMes,
    setAnoMes,
    setPeriodoPersonalizado,
    limparPeriodoPersonalizado,
    setModoVisao,
    avancarPeriodo,
    retrocederPeriodo,
    irParaPeriodoPadrao,
    isPeriodoPadrao,
  } = usePeriodo()

  // Estado interno para o popover de período customizado
  const [dataInicioInput, setDataInicioInput] = useState(dataInicioPersonalizada || '')
  const [dataFimInput, setDataFimInput] = useState(dataFimPersonalizada || '')
  const [popoverAberto, setPopoverAberto] = useState(false)

  // Anos disponíveis para seleção (baseados nos dados do Bling e CRM: 2026, 2025, 2024, etc.)
  const listaAnos = React.useMemo(() => {
    if (anosDisponiveis && anosDisponiveis.length > 0) return anosDisponiveis
    const anos: number[] = [2026, 2025, 2024, 2023, 2022]
    if (!anos.includes(ano)) {
      anos.push(ano)
      anos.sort((a, b) => b - a)
    }
    return anos
  }, [anosDisponiveis, ano])

  const handleMudarAno = (novoAnoStr: string) => {
    const novoAno = parseInt(novoAnoStr, 10)
    setAno(novoAno)
    onChange?.(novoAno, mes)
  }

  const handleMudarMes = (novoMesStr: string) => {
    const novoMes: MesFiltro = novoMesStr === 'todos' ? 'todos' : parseInt(novoMesStr, 10)
    setMes(novoMes)
    onChange?.(ano, novoMes)
  }

  const handleAplicarPersonalizado = (e: React.FormEvent) => {
    e.preventDefault()
    if (dataInicioInput && dataFimInput) {
      if (dataInicioInput > dataFimInput) {
        alert('A data inicial deve ser anterior ou igual à data final.')
        return
      }
      setPeriodoPersonalizado(dataInicioInput, dataFimInput)
      setPopoverAberto(false)
    }
  }

  const handleVoltarPeriodoPadrao = () => {
    irParaPeriodoPadrao()
    setDataInicioInput('')
    setDataFimInput('')
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-[#E2E8F0] shadow-sm transition-all ${className}`}
    >
      {/* Lado Esquerdo: Identificação visual do Período Comercial */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] shrink-0 border border-blue-100">
          <Calendar className="w-4 h-4 stroke-[2.5]" />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              Período Comercial
            </span>
            {isPeriodoPadrao && (
              <Badge
                variant="outline"
                className="text-[9px] h-4 py-0 px-1 bg-slate-50 text-slate-600 border-slate-200"
              >
                Padrão (Ano Atual)
              </Badge>
            )}
            {isPersonalizado && (
              <Badge
                variant="outline"
                className="text-[9px] h-4 py-0 px-1 bg-purple-50 text-purple-700 border-purple-200 font-semibold"
              >
                Personalizado
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-[#0F172A] tracking-tight">
              {labelCustomizado || nomeMesAno}
            </span>
            <span className="text-[11px] text-[#64748B] font-medium hidden sm:inline">
              ({formatarDataComercialBr(periodo.dataInicioYmd)} a{' '}
              {formatarDataComercialBr(periodo.dataFimYmd)})
            </span>
          </div>
        </div>
      </div>

      {/* Lado Direito: Controles (Ano, Mês, Customizado, Visão Origem/Fechamento, Navegação) */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Alternador de Modo de Análise (Regra 20: Visão por Origem vs. Visão por Fechamento) */}
        {mostrarModoVisao && (
          <div className="flex items-center bg-slate-50 border border-[#E2E8F0] rounded-lg p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setModoVisao('origem')}
              className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all ${
                modoVisao === 'origem'
                  ? 'bg-white text-[#2563EB] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
              title="Filtrar por data em que a oportunidade entrou no CRM / data_origem"
            >
              <Eye className="w-3 h-3 mr-1" />
              Origem
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setModoVisao('fechamento')}
              className={`h-7 px-2.5 text-xs font-semibold rounded-md transition-all ${
                modoVisao === 'fechamento'
                  ? 'bg-white text-[#16A34A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
              title="Filtrar por data em que o negócio foi fechado (ganho ou perdido) / data_fechamento"
            >
              <Check className="w-3 h-3 mr-1" />
              Fechamento
            </Button>
          </div>
        )}

        {/* Botão de Período Padrão (2026 / Todos) */}
        {!isPeriodoPadrao && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleVoltarPeriodoPadrao}
            className="h-8 px-2.5 text-xs font-medium text-[#64748B] hover:text-[#0F172A] border-[#E2E8F0]"
            title="Voltar ao período padrão (Ano atual / Todos os meses)"
          >
            Ano Atual
          </Button>
        )}

        {/* Setas de navegação de período (mês ou ano) */}
        {!isPersonalizado && (
          <div className="flex items-center border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={retrocederPeriodo}
              className="h-8 w-7 p-0 rounded-none text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50"
              title="Período anterior"
              aria-label="Período anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="w-[1px] h-4 bg-[#E2E8F0]" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={avancarPeriodo}
              className="h-8 w-7 p-0 rounded-none text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50"
              title="Próximo período"
              aria-label="Próximo período"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Dropdown ANO */}
        <Select value={String(ano)} onValueChange={handleMudarAno}>
          <SelectTrigger className="h-8 w-[92px] text-xs font-bold border-[#E2E8F0] bg-white">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent align="end">
            {listaAnos.map((anoNum) => (
              <SelectItem key={anoNum} value={String(anoNum)} className="text-xs font-medium">
                {anoNum}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Dropdown MÊS (Todos, Janeiro...Dezembro) */}
        <Select value={String(mes)} onValueChange={handleMudarMes}>
          <SelectTrigger className="h-8 w-[130px] text-xs font-medium border-[#E2E8F0] bg-white">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="todos" className="text-xs font-semibold text-[#2563EB]">
              Todos os meses
            </SelectItem>
            {MESES_PT_BR.map((item) => (
              <SelectItem key={item.numero} value={String(item.numero)} className="text-xs">
                {item.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Popover PERÍODO PERSONALIZADO (Data inicial e Data final) */}
        <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={isPersonalizado ? 'default' : 'outline'}
              size="sm"
              className={`h-8 px-2.5 text-xs font-medium gap-1.5 ${
                isPersonalizado
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'text-[#64748B] hover:text-[#0F172A] border-[#E2E8F0]'
              }`}
              title="Definir intervalo customizado de datas"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Personalizado</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4 text-xs space-y-3" align="end">
            <div className="font-bold text-[#0F172A] border-b pb-1.5">Intervalo Personalizado</div>
            <form onSubmit={handleAplicarPersonalizado} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">
                  Data Inicial
                </label>
                <Input
                  type="date"
                  value={dataInicioInput}
                  onChange={(e) => setDataInicioInput(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">
                  Data Final
                </label>
                <Input
                  type="date"
                  value={dataFimInput}
                  onChange={(e) => setDataFimInput(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-1 gap-2">
                {isPersonalizado && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      limparPeriodoPersonalizado()
                      setPopoverAberto(false)
                    }}
                    className="h-7 text-xs text-rose-600 hover:bg-rose-50 px-2"
                  >
                    Limpar
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white ml-auto px-3"
                >
                  Aplicar Período
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

export default SeletorDePeriodo
