import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'

export interface PeriodoFiltro {
  ano: number
  mes: number // 1 a 12
  nomeMesAno: string // ex: "Setembro 2026"
  dataInicioIso: string // ex: "2026-09-01T00:00:00.000Z"
  dataFimIso: string // ex: "2026-09-30T23:59:59.999Z"
  dataInicioYmd: string // ex: "2026-09-01"
  dataFimYmd: string // ex: "2026-09-30"
}

interface PeriodoContextData {
  ano: number
  mes: number // 1 a 12
  nomeMesAno: string
  periodo: PeriodoFiltro
  setAnoMes: (ano: number, mes: number) => void
  avancarMes: () => void
  retrocederMes: () => void
  irParaMesAtual: () => void
  isMesAtual: boolean
}

const PeriodoContext = createContext<PeriodoContextData | null>(null)

export const MESES_PT_BR = [
  { numero: 1, nome: 'Janeiro' },
  { numero: 2, nome: 'Fevereiro' },
  { numero: 3, nome: 'Março' },
  { numero: 4, nome: 'Abril' },
  { numero: 5, nome: 'Maio' },
  { numero: 6, nome: 'Junho' },
  { numero: 7, nome: 'Julho' },
  { numero: 8, nome: 'Agosto' },
  { numero: 9, nome: 'Setembro' },
  { numero: 10, nome: 'Outubro' },
  { numero: 11, nome: 'Novembro' },
  { numero: 12, nome: 'Dezembro' },
]

export function formatarMesExtensoAno(ano: number, mes: number): string {
  const nomeMes = MESES_PT_BR.find((m) => m.numero === mes)?.nome || `Mês ${mes}`
  return `${nomeMes} ${ano}`
}

export function calcularPeriodoFiltro(ano: number, mes: number): PeriodoFiltro {
  // O construtor Date(ano, mes - 1, 1) cria no início do mês local
  // Para filtros sem conflito de timezone, criamos as datas UTC correspondentes
  const mesFormatado = String(mes).padStart(2, '0')
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const ultimoDiaFormatado = String(ultimoDia).padStart(2, '0')

  const dataInicioYmd = `${ano}-${mesFormatado}-01`
  const dataFimYmd = `${ano}-${mesFormatado}-${ultimoDiaFormatado}`

  return {
    ano,
    mes,
    nomeMesAno: formatarMesExtensoAno(ano, mes),
    dataInicioIso: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0)).toISOString(),
    dataFimIso: new Date(Date.UTC(ano, mes - 1, ultimoDia, 23, 59, 59, 999)).toISOString(),
    dataInicioYmd,
    dataFimYmd,
  }
}

export function PeriodoProvider({ children }: { children: React.ReactNode }) {
  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1

  const [ano, setAno] = useState<number>(anoAtual)
  const [mes, setMes] = useState<number>(mesAtual)

  const isMesAtual = ano === anoAtual && mes === mesAtual

  const setAnoMes = useCallback((novoAno: number, novoMes: number) => {
    let ajustadoAno = novoAno
    let ajustadoMes = novoMes

    if (ajustadoMes > 12) {
      ajustadoAno += Math.floor((ajustadoMes - 1) / 12)
      ajustadoMes = ((ajustadoMes - 1) % 12) + 1
    } else if (ajustadoMes < 1) {
      const mesesSubtrair = Math.abs(ajustadoMes) + 1
      ajustadoAno -= Math.ceil(mesesSubtrair / 12)
      ajustadoMes = 12 - (Math.abs(ajustadoMes) % 12)
    }

    setAno(ajustadoAno)
    setMes(ajustadoMes)
  }, [])

  const avancarMes = useCallback(() => {
    if (mes === 12) {
      setAno((a) => a + 1)
      setMes(1)
    } else {
      setMes((m) => m + 1)
    }
  }, [mes])

  const retrocederMes = useCallback(() => {
    if (mes === 1) {
      setAno((a) => a - 1)
      setMes(12)
    } else {
      setMes((m) => m - 1)
    }
  }, [mes])

  const irParaMesAtual = useCallback(() => {
    const now = new Date()
    setAno(now.getFullYear())
    setMes(now.getMonth() + 1)
  }, [])

  const periodo = useMemo(() => {
    return calcularPeriodoFiltro(ano, mes)
  }, [ano, mes])

  const value = useMemo<PeriodoContextData>(
    () => ({
      ano,
      mes,
      nomeMesAno: periodo.nomeMesAno,
      periodo,
      setAnoMes,
      avancarMes,
      retrocederMes,
      irParaMesAtual,
      isMesAtual,
    }),
    [ano, mes, periodo, setAnoMes, avancarMes, retrocederMes, irParaMesAtual, isMesAtual],
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
