import { TrendingUp, ShoppingBag, FileText, PieChart as PieChartIcon } from 'lucide-react'
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
import type { DadosPainelComercialCompleto } from '@/services/painelService'

interface PainelGraficosProps {
  dados: DadosPainelComercialCompleto
}

export function PainelGraficos({ dados }: PainelGraficosProps) {
  const { contexto, serie_mensal_ano, serie_diaria_periodo, pedidos_periodo, propostas_periodo } =
    dados

  // Regra 25: Quando Ano selecionado e Mês=Todos, gráficos mensais Janeiro a Dezembro
  const isAnoCompleto = !contexto.isPersonalizado && contexto.mes === null
  const anoAtual = contexto.ano

  // Granularidade automática:
  // Se tiver serie_diaria_periodo com itens e NÃO for ano completo -> exibição diária
  const temSerieDiaria = !isAnoCompleto && !!serie_diaria_periodo && serie_diaria_periodo.length > 0
  const anoAtualStr = String(anoAtual)

  // Dados para Donut de Situação de Pedidos no Período (Regra 27)
  const dadosDonutPedidos = [
    {
      nome: 'Em aberto (Válido)',
      quantidade: pedidos_periodo.em_aberto.qtd,
      valor: pedidos_periodo.em_aberto.valor,
      cor: '#2563EB',
    },
    {
      nome: 'Atendido (Válido)',
      quantidade: pedidos_periodo.atendidos.qtd,
      valor: pedidos_periodo.atendidos.valor,
      cor: '#16A34A',
    },
    {
      nome: 'Cancelado (Não fatura)',
      quantidade: pedidos_periodo.cancelados.qtd,
      valor: pedidos_periodo.cancelados.valor,
      cor: '#DC2626',
    },
    {
      nome: 'Outros',
      quantidade: pedidos_periodo.outros.qtd,
      valor: pedidos_periodo.outros.valor,
      cor: '#64748B',
    },
  ].filter((item) => item.quantidade > 0)

  // Dados para Donut de Situação de Propostas no Período (Regra 28)
  const dadosDonutPropostas = [
    {
      nome: 'Convertida',
      quantidade: propostas_periodo.convertida,
      cor: '#16A34A',
    },
    {
      nome: 'Aguardando',
      quantidade: propostas_periodo.aguardando,
      cor: '#2563EB',
    },
    {
      nome: 'Rascunho',
      quantidade: propostas_periodo.rascunho,
      cor: '#94A3B8',
    },
    {
      nome: 'Não aprovada',
      quantidade: propostas_periodo.nao_aprovada,
      cor: '#DC2626',
    },
    {
      nome: 'Concluído / Outras',
      quantidade: propostas_periodo.outras,
      cor: '#7C3AED',
    },
  ].filter((item) => item.quantidade > 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
      {/* ----------------- GRÁFICO 1: VENDAS (MENSAL NO ANO OU DIÁRIO NO MÊS/PERÍODO) ----------------- */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#16A34A]" />
              {isAnoCompleto
                ? `Vendas Válidas por Mês (${anoAtualStr})`
                : `Vendas Válidas por Dia (${contexto.labelPeriodo})`}
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              {isAnoCompleto
                ? `Janeiro a Dezembro de ${anoAtualStr} (Soma reconciliada: ${formatarMoeda(pedidos_periodo.valor_vendas_valido)})`
                : `Soma dos dias: ${formatarMoeda(pedidos_periodo.valor_vendas_valido)} (Em aberto + Atendido)`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {isAnoCompleto && serie_mensal_ano.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={serie_mensal_ano}
                  margin={{ top: 15, right: 20, left: 10, bottom: 10 }}
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
                    formatter={(val: number) => [formatarMoeda(val), 'Vendas Válidas (R$)']}
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
                    dataKey="valor_vendas"
                    stroke="#16A34A"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#16A34A', stroke: '#FFFFFF', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#15803D' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : temSerieDiaria ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={serie_diaria_periodo}
                  margin={{ top: 15, right: 20, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    interval={serie_diaria_periodo && serie_diaria_periodo.length > 20 ? 2 : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    tickFormatter={(val) =>
                      val >= 1000 ? `R$${(val / 1000).toFixed(0)}k` : `R$${val}`
                    }
                  />
                  <Tooltip
                    formatter={(val: number) => [formatarMoeda(val), 'Vendas Válidas']}
                    labelFormatter={(lbl) => `Data: ${lbl}`}
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
                    dataKey="valor_vendas"
                    stroke="#16A34A"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#16A34A', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#15803D' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-[#64748B] space-y-2">
              <TrendingUp className="w-8 h-8 text-slate-300" />
              <p className="font-semibold text-slate-700">Sem dados para o período</p>
              <p className="text-slate-500 max-w-xs text-center">
                Não foram encontrados registros para o intervalo selecionado.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------- GRÁFICO 2: PEDIDOS VÁLIDOS (MENSAL NO ANO OU DIÁRIO NO MÊS/PERÍODO) ----------------- */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#2563EB]" />
              {isAnoCompleto
                ? `Volume de Pedidos Válidos (${anoAtualStr})`
                : `Pedidos Válidos por Dia (${contexto.labelPeriodo})`}
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              {isAnoCompleto
                ? `Quantidade de pedidos faturados/abertos por mês em ${anoAtualStr}`
                : `Total do período: ${pedidos_periodo.pedidos_validos} pedidos válidos`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {isAnoCompleto && serie_mensal_ano.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={serie_mensal_ano}
                  margin={{ top: 15, right: 15, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
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
                  />
                  <Tooltip
                    formatter={(val: number) => [`${val} pedidos`, 'Pedidos Válidos']}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="pedidos_validos" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : temSerieDiaria ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={serie_diaria_periodo}
                  margin={{ top: 15, right: 15, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    interval={serie_diaria_periodo && serie_diaria_periodo.length > 20 ? 2 : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(val: number) => [`${val} pedidos`, 'Pedidos Válidos']}
                    labelFormatter={(lbl) => `Data: ${lbl}`}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="pedidos_validos" fill="#2563EB" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-[#64748B] space-y-2">
              <ShoppingBag className="w-8 h-8 text-slate-300" />
              <p className="font-semibold text-slate-700">Volume no Período Selecionado</p>
              <p className="text-slate-500">
                {pedidos_periodo.pedidos_validos} pedidos válidos em {contexto.labelPeriodo}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------- GRÁFICO 3: SITUAÇÃO DOS PEDIDOS NO PERÍODO ----------------- */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-blue-600" />
              Situação dos Pedidos ({contexto.labelPeriodo})
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              Separação de Em aberto, Atendidos, Cancelados e outros
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {dadosDonutPedidos.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#64748B]">
              Nenhum pedido no período selecionado.
            </div>
          ) : (
            <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="relative w-full sm:w-1/2 h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dadosDonutPedidos}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="quantidade"
                    >
                      {dadosDonutPedidos.map((entry) => (
                        <Cell key={`cell-ped-${entry.nome}`} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(
                        val: number,
                        _name: string,
                        item: { payload?: { valor?: number } },
                      ) => [
                        `${val} pedidos (${formatarMoeda(item.payload?.valor || 0)})`,
                        'Quantidade e Valor',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-[#0F172A] leading-none">
                    {pedidos_periodo.total_pedidos}
                  </span>
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mt-0.5">
                    Total
                  </span>
                </div>
              </div>

              <div className="w-full sm:w-1/2 space-y-2 text-xs">
                {dadosDonutPedidos.map((item) => (
                  <div
                    key={item.nome}
                    className="flex items-center justify-between p-1.5 rounded-lg border bg-slate-50/70"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.cor }}
                      />
                      <span className="truncate font-medium text-slate-800">{item.nome}</span>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">{item.quantidade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------- GRÁFICO 4: SITUAÇÃO DAS PROPOSTAS NO PERÍODO ----------------- */}
      <Card className="border border-[#E2E8F0] shadow-sm flex flex-col bg-white">
        <CardHeader className="pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              Situação das Propostas ({contexto.labelPeriodo})
            </CardTitle>
            <p className="text-xs text-[#64748B] mt-0.5">
              Rascunho, Aguardando, Não aprovada, Convertida e Outras
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex-1 flex flex-col justify-center min-h-[280px]">
          {dadosDonutPropostas.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-[#64748B]">
              Nenhuma proposta no período selecionado.
            </div>
          ) : (
            <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="relative w-full sm:w-1/2 h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dadosDonutPropostas}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="quantidade"
                    >
                      {dadosDonutPropostas.map((entry) => (
                        <Cell key={`cell-prop-${entry.nome}`} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => [`${val} propostas`, 'Quantidade']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-[#0F172A] leading-none">
                    {propostas_periodo.total}
                  </span>
                  <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mt-0.5">
                    Propostas
                  </span>
                </div>
              </div>

              <div className="w-full sm:w-1/2 space-y-2 text-xs">
                {dadosDonutPropostas.map((item) => (
                  <div
                    key={item.nome}
                    className="flex items-center justify-between p-1.5 rounded-lg border bg-slate-50/70"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.cor }}
                      />
                      <span className="truncate font-medium text-slate-800">{item.nome}</span>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">{item.quantidade}</span>
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
export default PainelGraficos
