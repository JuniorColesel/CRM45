import {
  TrendingUp,
  LineChart as LineChartIcon,
  BarChart3,
  PieChart as PieChartIcon,
  Layers,
} from 'lucide-react'
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
import type {
  FunilGraficoItem,
  VendasMesGraficoItem,
  TopVendedorGraficoItem,
  StatusOportunidadesGraficoItem,
} from '@/services/painelService'

interface PainelGraficosProps {
  graficoFunil: FunilGraficoItem[]
  graficoVendasPorMes: VendasMesGraficoItem[]
  graficoTopVendedores: TopVendedorGraficoItem[]
  graficoStatusOportunidades: StatusOportunidadesGraficoItem[]
  totalOportunidadesStatus: number
}

export function PainelGraficos({
  graficoFunil,
  graficoVendasPorMes,
  graficoTopVendedores,
  graficoStatusOportunidades,
  totalOportunidadesStatus,
}: PainelGraficosProps) {
  // Checagens de estado vazio
  const funilSemDados = graficoFunil.every((item) => item.quantidade === 0)
  const vendasMesSemDados = graficoVendasPorMes.every((item) => item.valor === 0)
  const topVendedoresSemDados =
    graficoTopVendedores.length === 0 || graficoTopVendedores.every((item) => item.valor === 0)
  const statusSemDados = totalOportunidadesStatus === 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
      {/* ----------------- GRÁFICO 1: FUNIL DE VENDAS ----------------- */}
      {/* Barras horizontais; Y = etapas (Prospecção, Qualificação, Proposta, Negociação, Ganha, Perdida)
          X = quantidade em cada etapa; cores em gradiente claro ao escuro, vermelho para perdida */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2563EB]" />
              Funil de Vendas
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">Distribuição por etapa de negociação</p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {funilSemDados ? (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-[#94A3B8] space-y-2">
              <Layers className="w-8 h-8 opacity-30 text-[#64748B]" />
              <p className="font-medium text-[#64748B]">Sem dados no período</p>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={graficoFunil}
                  margin={{ top: 10, right: 30, left: 30, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="etapaNome"
                    tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 500 }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    width={85}
                  />
                  <Tooltip
                    formatter={(val: number) => [`${val} oportunidades`, 'Quantidade']}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="quantidade" radius={[0, 4, 4, 0]}>
                    {graficoFunil.map((entry) => (
                      <Cell key={`cell-funil-${entry.etapaId}`} fill={entry.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------- GRÁFICO 2: VENDAS POR MÊS ----------------- */}
      {/* Linha; X = últimos 6 meses (nome do mês); Y = total vendas ganhas (R$);
          linha com pontos marcados; tooltip com valor exato ao passar mouse */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <LineChartIcon className="w-4 h-4 text-[#16A34A]" />
              Vendas por Mês
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              Evolução da receita confirmada nos últimos 6 meses
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {vendasMesSemDados ? (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-[#94A3B8] space-y-2">
              <LineChartIcon className="w-8 h-8 opacity-30 text-[#64748B]" />
              <p className="font-medium text-[#64748B]">Sem dados no período</p>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={graficoVendasPorMes}
                  margin={{ top: 15, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis
                    dataKey="nomeMes"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: number) => [formatarMoeda(val), 'Vendas Fechadas']}
                    labelFormatter={(lbl) => `Mês: ${lbl}`}
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
                    stroke="#16A34A"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#16A34A', stroke: '#FFFFFF', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#15803D' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------- GRÁFICO 3: TOP VENDEDORES ----------------- */}
      {/* Barras verticais; X = nomes vendedores (top 5); Y = valor total vendas ganhas no período;
          ordenado do maior para o menor */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#7C3AED]" />
              Top Vendedores
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              Líderes de fechamento de vendas no período
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {topVendedoresSemDados ? (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-[#94A3B8] space-y-2">
              <BarChart3 className="w-8 h-8 opacity-30 text-[#64748B]" />
              <p className="font-medium text-[#64748B]">Sem dados no período</p>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={graficoTopVendedores}
                  margin={{ top: 15, right: 15, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(
                      val: number,
                      _name: string,
                      item: { payload?: { quantidade?: number } },
                    ) => [
                      `${formatarMoeda(val)} (${item.payload?.quantidade || 0} fechamento${(item.payload?.quantidade || 0) === 1 ? '' : 's'})`,
                      'Total Ganho',
                    ]}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="valor" fill="#7C3AED" radius={[4, 4, 0, 0]}>
                    {graficoTopVendedores.map((_entry, index) => (
                      <Cell
                        key={`cell-top-${index}`}
                        fill={index === 0 ? '#7C3AED' : index === 1 ? '#8B5CF6' : '#A78BFA'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------- GRÁFICO 4: STATUS DAS OPORTUNIDADES ----------------- */}
      {/* Donut; fatias = 6 etapas; legenda ao lado com quantidade e % de cada fatia;
          centro do donut = total de oportunidades */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-[#CA8A04]" />
              Status das Oportunidades
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              Proporção de negócios por etapa no pipeline
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {statusSemDados ? (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-[#94A3B8] space-y-2">
              <PieChartIcon className="w-8 h-8 opacity-30 text-[#64748B]" />
              <p className="font-medium text-[#64748B]">Sem dados no período</p>
            </div>
          ) : (
            <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-center gap-3">
              {/* Donut com número total no centro */}
              <div className="relative w-full sm:w-1/2 h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={graficoStatusOportunidades}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="quantidade"
                    >
                      {graficoStatusOportunidades.map((entry) => (
                        <Cell key={`cell-status-${entry.etapaId}`} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(
                        val: number,
                        _name: string,
                        item: { payload?: { percentual?: number; nome?: string } },
                      ) => [
                        `${val} oportunidades (${item.payload?.percentual?.toFixed(1) || 0}%)`,
                        item.payload?.nome || '',
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

                {/* Centro do donut: total de oportunidades */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-[#0F172A] leading-none">
                    {totalOportunidadesStatus}
                  </span>
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mt-0.5">
                    Total
                  </span>
                </div>
              </div>

              {/* Legenda lateral: quantidade e % de cada fatia */}
              <div className="w-full sm:w-1/2 space-y-1.5 text-xs max-h-56 overflow-y-auto pr-1">
                {graficoStatusOportunidades.map((item) => (
                  <div
                    key={item.etapaId}
                    className="flex items-center justify-between p-1.5 rounded-lg border border-slate-100 bg-slate-50/70"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.cor }}
                      />
                      <span className="truncate text-[#0F172A] font-medium">{item.nome}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 pl-1">
                      <span className="font-bold text-[#0F172A]">{item.quantidade}</span>
                      <span className="text-[10px] text-[#64748B]">
                        ({item.percentual.toFixed(0)}%)
                      </span>
                    </div>
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
