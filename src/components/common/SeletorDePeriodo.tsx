import React from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePeriodo, MESES_PT_BR } from '@/contexts/PeriodoContext'

export type OpcaoPeriodoPredefinido =
  | 'este_mes'
  | 'mes_passado'
  | 'ultimos_3_meses'
  | 'ultimos_6_meses'
  | 'ano_corrente'
  | 'personalizado'

interface SeletorDePeriodoProps {
  className?: string
  anosDisponiveis?: number[]
  onChangePeriodo?: (ano: number, mes: number) => void
  mostrarOpcoesPredefinidas?: boolean
  opcaoSelecionada?: OpcaoPeriodoPredefinido
  onSelectOpcaoPredefinida?: (opcao: OpcaoPeriodoPredefinido) => void
  labelPersonalizado?: string
}

export function SeletorDePeriodo({
  className = '',
  anosDisponiveis,
  onChangePeriodo,
  mostrarOpcoesPredefinidas = false,
  opcaoSelecionada = 'este_mes',
  onSelectOpcaoPredefinida,
  labelPersonalizado,
}: SeletorDePeriodoProps) {
  const { ano, mes, nomeMesAno, setAnoMes, avancarMes, retrocederMes, irParaMesAtual, isMesAtual } =
    usePeriodo()

  // Lista de anos para escolha (5 anos passados e 2 anos futuros por padrão)
  const listaAnos = React.useMemo(() => {
    if (anosDisponiveis && anosDisponiveis.length > 0) return anosDisponiveis
    const anoBase = new Date().getFullYear()
    const anos: number[] = []
    for (let y = anoBase - 5; y <= anoBase + 2; y++) {
      anos.push(y)
    }
    // Garante que o ano atual selecionado esteja presente
    if (!anos.includes(ano)) {
      anos.push(ano)
      anos.sort((a, b) => a - b)
    }
    return anos
  }, [anosDisponiveis, ano])

  const handleMudarMes = (valorMes: string) => {
    const novoMes = parseInt(valorMes, 10)
    setAnoMes(ano, novoMes)
    onChangePeriodo?.(ano, novoMes)
  }

  const handleMudarAno = (valorAno: string) => {
    const novoAno = parseInt(valorAno, 10)
    setAnoMes(novoAno, mes)
    onChangePeriodo?.(novoAno, mes)
  }

  const handleRetroceder = () => {
    retrocederMes()
  }

  const handleAvancar = () => {
    avancarMes()
  }

  const handleMesAtual = () => {
    irParaMesAtual()
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 p-2.5 sm:p-3 bg-white rounded-xl border border-[#E2E8F0] shadow-sm transition-all ${className}`}
    >
      {/* Lado esquerdo: Rótulo / Mês Extenso Atual e Navegação Rápida */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-[#2563EB]">
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Período de Análise
          </span>
          <span className="text-sm font-bold text-[#0F172A] tracking-tight">
            {labelPersonalizado || nomeMesAno}
          </span>
        </div>
      </div>

      {/* Lado direito: Ações e Dropdowns de Ano / Mês */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {mostrarOpcoesPredefinidas && (
          <Select
            value={opcaoSelecionada}
            onValueChange={(val) => onSelectOpcaoPredefinida?.(val as OpcaoPeriodoPredefinido)}
          >
            <SelectTrigger className="h-8 min-w-[140px] text-xs font-semibold bg-slate-50 border-[#E2E8F0] text-[#0F172A]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="este_mes" className="text-xs">
                Este mês
              </SelectItem>
              <SelectItem value="mes_passado" className="text-xs">
                Mês passado
              </SelectItem>
              <SelectItem value="ultimos_3_meses" className="text-xs">
                Últimos 3 meses
              </SelectItem>
              <SelectItem value="ultimos_6_meses" className="text-xs">
                Últimos 6 meses
              </SelectItem>
              <SelectItem value="ano_corrente" className="text-xs">
                Ano corrente
              </SelectItem>
              <SelectItem value="personalizado" className="text-xs">
                Personalizado (Mês/Ano)
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Seletor manual Mês/Ano (ativo se não mostrarOpcoesPredefinidas ou se for 'personalizado' ou 'este_mes'/'mes_passado') */}
        {(!mostrarOpcoesPredefinidas ||
          opcaoSelecionada === 'personalizado' ||
          opcaoSelecionada === 'este_mes' ||
          opcaoSelecionada === 'mes_passado') && (
          <>
            {/* Botão Mês Atual */}
            <Button
              type="button"
              variant={isMesAtual ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleMesAtual}
              className={`h-8 px-2.5 text-xs font-semibold transition-all ${
                isMesAtual
                  ? 'bg-blue-50 text-[#2563EB] border-blue-200 hover:bg-blue-100'
                  : 'text-[#0F172A] hover:bg-slate-50'
              }`}
              title="Selecionar o mês corrente"
            >
              Mês Atual
            </Button>

            {/* Setas de navegação (anterior / próximo) */}
            <div className="flex items-center border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRetroceder}
                className="h-8 w-8 p-0 rounded-none text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50"
                title="Mês anterior"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="w-[1px] h-4 bg-[#E2E8F0]" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAvancar}
                className="h-8 w-8 p-0 rounded-none text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50"
                title="Próximo mês"
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Dropdown para escolher mês */}
            <Select value={String(mes)} onValueChange={handleMudarMes}>
              <SelectTrigger className="h-8 w-[125px] sm:w-[135px] text-xs font-medium border-[#E2E8F0]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent align="end">
                {MESES_PT_BR.map((item) => (
                  <SelectItem key={item.numero} value={String(item.numero)} className="text-xs">
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Dropdown para escolher ano */}
            <Select value={String(ano)} onValueChange={handleMudarAno}>
              <SelectTrigger className="h-8 w-[85px] sm:w-[95px] text-xs font-medium border-[#E2E8F0]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent align="end">
                {listaAnos.map((anoNum) => (
                  <SelectItem key={anoNum} value={String(anoNum)} className="text-xs">
                    {anoNum}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </div>
  )
}

export default SeletorDePeriodo
