import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'

export type MesFiltro = number | 'todos' // 1 a 12 ou 'todos'

export interface PeriodoFiltro {
  ano: number
  mes: MesFiltro
  nomeMesAno: string // ex: "2026 / Todos" ou "Setembro/2026" ou "01/01/2026 a 31/03/2026"
  dataInicioIso: string
  dataFimIso: string
  dataInicioYmd: string // "2026-01-01"
  dataFimYmd: string // "2026-12-31"
  isPersonalizado: boolean
  modoVisao: 'origem' | 'fechamento'
}

interface PeriodoContextData {
  ano: number
  mes: MesFiltro
  nomeMesAno: string
  periodo: PeriodoFiltro
  dataInicioPersonalizada: string
  dataFimPersonalizada: string
  isPersonalizado: boolean
  modoVisao: 'origem' | 'fechamento'
  setAno: (ano: number) => void
  setMes: (mes: MesFiltro) => void
  setAnoMes: (ano: number, mes: MesFiltro) => void
  setPeriodoPersonalizado: (inicioYmd: string, fimYmd: string) => void
  limparPeriodoPersonalizado: () => void
  setModoVisao: (modo: 'origem' | 'fechamento') => void
  avancarPeriodo: () => void
  retrocederPeriodo: () => void
  irParaPeriodoPadrao: () => void
  isPeriodoPadrao: boolean
}

const PeriodoContext = createContext<PeriodoContextData | null>(null)

export const MESES_PT_BR = [
  { numero: 1, nome: 'Janeiro', sigla: 'Jan' },
  { numero: 2, nome: 'Fevereiro', sigla: 'Fev' },
  { numero: 3, nome: 'Março', sigla: 'Mar' },
  { numero: 4, nome: 'Abril', sigla: 'Abr' },
  { numero: 5, nome: 'Maio', sigla: 'Mai' },
  { numero: 6, nome: 'Junho', sigla: 'Jun' },
  { numero: 7, nome: 'Julho', sigla: 'Jul' },
  { numero: 8, nome: 'Agosto', sigla: 'Ago' },
  { numero: 9, nome: 'Setembro', sigla: 'Set' },
  { numero: 10, nome: 'Outubro', sigla: 'Out' },
  { numero: 11, nome: 'Novembro', sigla: 'Nov' },
  { numero: 12, nome: 'Dezembro', sigla: 'Dez' },
]

export function formatarDataComercialBr(ymd: string): string {
  if (!ymd || ymd.length < 10) return ''
  const [ano, mes, dia] = ymd.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export function formatarMesExtensoAno(ano: number, mes: MesFiltro): string {
  if (mes === 'todos') {
    return `${ano} / Todos os meses`
  }
  const nomeMes = MESES_PT_BR.find((m) => m.numero === mes)?.nome || `Mês ${mes}`
  return `${nomeMes}/${ano}`
}

export function calcularDiasNoMes(ano: number, mes: number): number {
  if (mes === 2) {
    const isBissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
    return isBissexto ? 29 : 28
  }
  if ([4, 6, 9, 11].includes(mes)) {
    return 30
  }
  return 31
}

export function calcularPeriodoFiltro(
  ano: number,
  mes: MesFiltro,
  dataInicioPers?: string,
  dataFimPers?: string,
  modoVisao: 'origem' | 'fechamento' = 'origem',
): PeriodoFiltro {
  if (dataInicioPers && dataFimPers) {
    const dIniYmd = dataInicioPers.slice(0, 10)
    const dFimYmd = dataFimPers.slice(0, 10)
    return {
      ano,
      mes,
      nomeMesAno: `${formatarDataComercialBr(dIniYmd)} a ${formatarDataComercialBr(dFimYmd)}`,
      dataInicioIso: `${dIniYmd}T00:00:00.000Z`,
      dataFimIso: `${dFimYmd}T23:59:59.999Z`,
      dataInicioYmd: dIniYmd,
      dataFimYmd: dFimYmd,
      isPersonalizado: true,
      modoVisao,
    }
  }

  if (mes === 'todos') {
    const dataInicioYmd = `${ano}-01-01`
    const dataFimYmd = `${ano}-12-31`
    return {
      ano,
      mes: 'todos',
      nomeMesAno: `${ano} / Todos`,
      dataInicioIso: `${dataInicioYmd}T00:00:00.000Z`,
      dataFimIso: `${dataFimYmd}T23:59:59.999Z`,
      dataInicioYmd,
      dataFimYmd,
      isPersonalizado: false,
      modoVisao,
    }
  }

  const mesNum = typeof mes === 'number' ? mes : 1
  const mesFormatado = String(mesNum).padStart(2, '0')
  const diasNoMes = calcularDiasNoMes(ano, mesNum)
  const ultimoDiaFormatado = String(diasNoMes).padStart(2, '0')

  const dataInicioYmd = `${ano}-${mesFormatado}-01`
  const dataFimYmd = `${ano}-${mesFormatado}-${ultimoDiaFormatado}`

  return {
    ano,
    mes: mesNum,
    nomeMesAno: formatarMesExtensoAno(ano, mesNum),
    dataInicioIso: `${dataInicioYmd}T00:00:00.000Z`,
    dataFimIso: `${dataFimYmd}T23:59:59.999Z`,
    dataInicioYmd,
    dataFimYmd,
    isPersonalizado: false,
    modoVisao,
  }
}

export function PeriodoProvider({ children }: { children: React.ReactNode }) {
  // Regra 17: Período padrão: Ano Atual + Mês = 'todos'
  const anoAtual = new Date().getFullYear()

  const [ano, setAnoState] = useState<number>(anoAtual)
  const [mes, setMesState] = useState<MesFiltro>('todos')
  const [dataInicioPersonalizada, setDataInicioPersonalizada] = useState<string>('')
  const [dataFimPersonalizada, setDataFimPersonalizada] = useState<string>('')
  const [modoVisao, setModoVisao] = useState<'origem' | 'fechamento'>('origem')

  const isPersonalizado = Boolean(dataInicioPersonalizada && dataFimPersonalizada)
  const isPeriodoPadrao = ano === anoAtual && mes === 'todos' && !isPersonalizado

  const setAno = useCallback((novoAno: number) => {
    setAnoState(novoAno)
    setDataInicioPersonalizada('')
    setDataFimPersonalizada('')
  }, [])

  const setMes = useCallback((novoMes: MesFiltro) => {
    setMesState(novoMes)
    setDataInicioPersonalizada('')
    setDataFimPersonalizada('')
  }, [])

  const setAnoMes = useCallback((novoAno: number, novoMes: MesFiltro) => {
    setAnoState(novoAno)
    setMesState(novoMes)
    setDataInicioPersonalizada('')
    setDataFimPersonalizada('')
  }, [])

  const setPeriodoPersonalizado = useCallback((inicioYmd: string, fimYmd: string) => {
    setDataInicioPersonalizada(inicioYmd)
    setDataFimPersonalizada(fimYmd)
  }, [])

  const limparPeriodoPersonalizado = useCallback(() => {
    setDataInicioPersonalizada('')
    setDataFimPersonalizada('')
  }, [])

  const irParaPeriodoPadrao = useCallback(() => {
    const atual = new Date().getFullYear()
    setAnoState(atual)
    setMesState('todos')
    setDataInicioPersonalizada('')
    setDataFimPersonalizada('')
  }, [])

  const avancarPeriodo = useCallback(() => {
    if (isPersonalizado) return
    if (mes === 'todos') {
      setAnoState((a) => a + 1)
    } else {
      const mesNum = Number(mes)
      if (mesNum === 12) {
        setAnoState((a) => a + 1)
        setMesState(1)
      } else {
        setMesState(mesNum + 1)
      }
    }
  }, [mes, isPersonalizado])

  const retrocederPeriodo = useCallback(() => {
    if (isPersonalizado) return
    if (mes === 'todos') {
      setAnoState((a) => a - 1)
    } else {
      const mesNum = Number(mes)
      if (mesNum === 1) {
        setAnoState((a) => a - 1)
        setMesState(12)
      } else {
        setMesState(mesNum - 1)
      }
    }
  }, [mes, isPersonalizado])

  const periodo = useMemo(() => {
    return calcularPeriodoFiltro(ano, mes, dataInicioPersonalizada, dataFimPersonalizada, modoVisao)
  }, [ano, mes, dataInicioPersonalizada, dataFimPersonalizada, modoVisao])

  const value = useMemo<PeriodoContextData>(
    () => ({
      ano,
      mes,
      nomeMesAno: periodo.nomeMesAno,
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
    }),
    [
      ano,
      mes,
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
    ],
  )

  return <PeriodoContext.Provider value={value}>{children}</PeriodoContext.Provider>
}

export function usePeriodo(): PeriodoContextData {
  const context = useContext(PeriodoContext)
  if (!context) {
    throw new Error('usePeriodo deve ser usado dentro de um PeriodoProvider')
  }
  return context
}
