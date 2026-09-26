import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
} from 'recharts'
import { formatarMoeda } from '@/types/clientes'
import type { EtapaFunilModel, OportunidadeModel } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'
import type { PeriodoFiltro } from '@/contexts/PeriodoContext'

interface GraficosRelatorioProps {
  periodo: PeriodoFiltro
  etapas: EtapaFunilModel[]
  usuarios: Usuario[]
  oportunidadesAbertasNoPeriodo: OportunidadeModel[]
  oportunidadesGanhasNoPeriodo: OportunidadeModel[]
}

export function GraficosRelatorio({
  periodo,
  etapas,
  usuarios,
  oportunidadesAbertasNoPeriodo,
  oportunidadesGanhasNoPeriodo,
}: GraficosRelatorioProps) {
  // 1. Gráfico de barras: Oportunidades ganhas por vendedor no período
  const dadosGanhasPorVendedor = (() => {
    const mapa = new Map<string, { nome: string; quantidade: number; valor: number }>()

    oportunidadesGanhasNoPeriodo.forEach((op) => {
      const u =
        usuarios.find((usr) => usr.id === op.responsavel_id) ||
        (op.expand?.responsavel_id as unknown as Usuario)
      const nome = u?.nome || 'Não atribuído'

      const item = mapa.get(op.responsavel_id) || { nome, quantidade: 0, valor: 0 }
      item.quantidade += 1
      item.valor += op.valor || 0
      mapa.set(op.responsavel_id, item)
    })

    const lista = Array.from(mapa.values())
    lista.sort((a, b) => b.quantidade - a.quantidade)
    return lista
  })()

  // 2. Gráfico de linha: Evolução diária do valor em pipeline no período (um ponto por dia do período)
  const dadosEvolucaoPipeline = (() => {
    // Número de dias no mês
    const totalDias = new Date(periodo.ano, periodo.mes, 0).getDate()
    const pontos: Array<{ dia: string; valor: number; quantidade: number }> = []

    // Mapeamos a data de criação ou data de fechamento para acumular ou registrar o valor do pipeline dia a dia
    // Para um ponto por dia do período, calculamos as oportunidades abertas cujo dia de abertura/referência <= aquele dia
    for (let dia = 1; dia <= totalDias; dia++) {
      const diaFormatado = String(dia).padStart(2, '0')
      const mesFormatado = String(periodo.mes).padStart(2, '0')
      const dataYmd = `${periodo.ano}-${mesFormatado}-${diaFormatado}`

      // Oportunidades abertas ativas até este dia no período
      const opsAteODia = oportunidadesAbertasNoPeriodo.filter((op) => {
        const dataRef = (op.criado_em || op.created || '').substring(0, 10)
        return !dataRef || dataRef <= dataYmd
      })

      const somaValor = opsAteODia.reduce((acc, curr) => acc + (curr.valor || 0), 0)
      pontos.push({
        dia: `${diaFormatado}/${mesFormatado}`,
        valor: somaValor,
        quantidade: opsAteODia.length,
      })
    }

    return pontos
  })()

  // 3. Gráfico de pizza: Distribuição de oportunidades (abertas no período) por etapa atual
  const dadosDistribuicaoEtapa = (() => {
    const contadores: Record<string, { count: number; valor: number }> = {}

    oportunidadesAbertasNoPeriodo.forEach((op) => {
      const etapaId = op.etapa_id || 'sem_etapa'
      if (!contadores[etapaId]) {
        contadores[etapaId] = { count: 0, valor: 0 }
      }
      contadores[etapaId].count += 1
      contadores[etapaId].valor += op.valor || 0
    })

    const coresFallback = [
      '#2563EB',
      '#7C3AED',
      '#16A34A',
      '#DC2626',
      '#CA8A04',
      '#0284C7',
      '#64748B',
    ]

    return etapas
      .map((etapa, idx) => {
        const dados = contadores[etapa.id] || { count: 0, valor: 0 }
        return {
          id: etapa.id,
          name: etapa.nome,
          value: dados.count,
          valorTotal: dados.valor,
          color: etapa.cor || coresFallback[idx % coresFallback.length],
        }
      })
      .filter((item) => item.value > 0)
  })()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* 1. Barras: Ganhas por Vendedor */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#16A34A]" />
            Ganhas por Vendedor
          </CardTitle>
          <p className="text-xs text-[#64748B]">Volume de oportunidades ganhas no período</p>
        </CardHeader>
        <CardContent className="pt-2 flex-1 flex flex-col justify-center">
          {dadosGanhasPorVendedor.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-xs text-[#94A3B8]">
              <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
              Nenhuma oportunidade ganha no período.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dadosGanhasPorVendedor}
                  margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                >
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: number) => [`${val} ganhas`, 'Quantidade']}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="quantidade" fill="#16A34A" radius={[4, 4, 0, 0]}>
                    {dadosGanhasPorVendedor.map((_, index) => (
                      <Cell key={`bar-${index}`} fill={index % 2 === 0 ? '#16A34A' : '#15803D'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Linha: Evolução Diária do Pipeline */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <LineChartIcon className="w-4 h-4 text-[#2563EB]" />
            Evolução Diária do Pipeline
          </CardTitle>
          <p className="text-xs text-[#64748B]">Valor acumulado em aberto dia a dia no mês</p>
        </CardHeader>
        <CardContent className="pt-2 flex-1 flex flex-col justify-center">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dadosEvolucaoPipeline}
                margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  interval={Math.floor(dadosEvolucaoPipeline.length / 5)}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                  tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: number) => [formatarMoeda(val), 'Valor em Pipeline']}
                  labelFormatter={(lbl) => `Dia ${lbl}`}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="#2563EB"
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: '#2563EB' }}
                  activeDot={{ r: 5, fill: '#1D4ED8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 3. Pizza: Distribuição por Etapa */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-[#7C3AED]" />
            Pipeline por Etapa
          </CardTitle>
          <p className="text-xs text-[#64748B]">Oportunidades ativas por estágio do funil</p>
        </CardHeader>
        <CardContent className="pt-2 flex-1 flex flex-col justify-center">
          {dadosDistribuicaoEtapa.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-xs text-[#94A3B8]">
              <PieChartIcon className="w-8 h-8 mb-2 opacity-40" />
              Nenhuma oportunidade em aberto no período.
            </div>
          ) : (
            <div className="h-56 w-full flex flex-col sm:flex-row items-center justify-center gap-2">
              <div className="w-full sm:w-1/2 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dadosDistribuicaoEtapa}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={68}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {dadosDistribuicaoEtapa.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(
                        val: number,
                        _name: string,
                        item: { payload?: { valorTotal?: number; name?: string } },
                      ) => [
                        `${val} oportunidades (${formatarMoeda(item?.payload?.valorTotal || 0)})`,
                        item?.payload?.name || '',
                      ]}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legenda compacta */}
              <div className="w-full sm:w-1/2 space-y-1.5 text-xs max-h-48 overflow-y-auto pr-1">
                {dadosDistribuicaoEtapa.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-1.5 rounded-md border border-[#F1F5F9] bg-[#F8FAFC]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-[#0F172A] font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-[#0F172A] shrink-0">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
