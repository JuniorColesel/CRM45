import React, { useMemo } from 'react'
import {
  Megaphone,
  Layers,
  Send,
  Percent,
  TrendingUp,
  CheckCircle,
  Clock,
  XCircle,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  CampanhaModel,
  ConteudoGeradoModel,
  PublicacaoModel,
  StatusPublicacao,
} from '@/types/marketing'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts'

interface AbaDashboardMarketingProps {
  campanhas: CampanhaModel[]
  conteudos: ConteudoGeradoModel[]
  publicacoes: PublicacaoModel[]
  loading: boolean
}

export function AbaDashboardMarketing({
  campanhas,
  conteudos,
  publicacoes,
  loading,
}: AbaDashboardMarketingProps) {
  // Métricas Solicitadas no Briefing:
  // 1. Total de campanhas ativas
  const totalCampanhasAtivas = useMemo(
    () => campanhas.filter((c) => c.status === 'ativa').length,
    [campanhas],
  )

  // 2. Total de conteúdos gerados (mostrando aprovados / pendentes(gerado) / rejeitados)
  const metricasConteudos = useMemo(() => {
    const total = conteudos.length
    const aprovados = conteudos.filter((c) => c.status === 'aprovado').length
    const pendentes = conteudos.filter((c) => c.status === 'gerado').length
    const rejeitados = conteudos.filter((c) => c.status === 'rejeitado').length
    return { total, aprovados, pendentes, rejeitados }
  }, [conteudos])

  // 3. Total de publicações agendadas
  const totalPublicacoesAgendadas = useMemo(
    () => publicacoes.filter((p) => p.status === 'agendada').length,
    [publicacoes],
  )

  // 4. Taxa de aprovação: (aprovados / total * 100)
  const taxaAprovacao = useMemo(() => {
    if (metricasConteudos.total === 0) return 0
    return Math.round((metricasConteudos.aprovados / metricasConteudos.total) * 100)
  }, [metricasConteudos])

  // 5. Publicações por status em gráfico
  const dadosStatusPublicacoes = useMemo(() => {
    const contadores: Record<StatusPublicacao, number> = {
      agendada: 0,
      enviada: 0,
      entregue: 0,
      lida: 0,
      falhou: 0,
    }

    publicacoes.forEach((p) => {
      if (contadores[p.status] !== undefined) {
        contadores[p.status]++
      }
    })

    return [
      { status: 'Agendada', count: contadores.agendada, color: '#CA8A04' },
      { status: 'Enviada', count: contadores.enviada, color: '#2563EB' },
      { status: 'Entregue', count: contadores.entregue, color: '#16A34A' },
      { status: 'Lida', count: contadores.lida, color: '#14532D' },
      { status: 'Falhou', count: contadores.falhou, color: '#DC2626' },
    ]
  }, [publicacoes])

  // Dados para distribuição de conteúdos
  const dadosStatusConteudos = useMemo(() => {
    return [
      { name: 'Aprovados', value: metricasConteudos.aprovados, color: '#16A34A' },
      { name: 'Em Análise (Gerados)', value: metricasConteudos.pendentes, color: '#2563EB' },
      { name: 'Rejeitados', value: metricasConteudos.rejeitados, color: '#DC2626' },
    ]
  }, [metricasConteudos])

  const totalPublicacoes = publicacoes.length

  return (
    <div className="space-y-6">
      {/* 4 Cards Principais de Indicadores (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Campanhas Ativas */}
        <Card className="border border-[#E2E8F0] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Campanhas Ativas
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-50 text-[#16A34A]">
              <Megaphone className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A]">{totalCampanhasAtivas}</div>
            <p className="text-[11px] text-[#64748B] mt-1">
              De {campanhas.length} campanha{campanhas.length === 1 ? '' : 's'} no total
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Conteúdos Gerados */}
        <Card className="border border-[#E2E8F0] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Conteúdos Gerados
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-[#2563EB]">
              <Layers className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A]">{metricasConteudos.total}</div>
            <div className="flex items-center gap-2 text-[10px] text-[#64748B] mt-1 flex-wrap">
              <span className="text-[#16A34A] font-semibold">
                {metricasConteudos.aprovados} aprovados
              </span>
              <span>•</span>
              <span className="text-[#2563EB] font-semibold">
                {metricasConteudos.pendentes} pendentes
              </span>
              <span>•</span>
              <span className="text-[#DC2626] font-semibold">
                {metricasConteudos.rejeitados} rejeitados
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Publicações Agendadas */}
        <Card className="border border-[#E2E8F0] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Disparos Agendados
            </CardTitle>
            <div className="p-2 rounded-lg bg-amber-50 text-[#CA8A04]">
              <Send className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A]">{totalPublicacoesAgendadas}</div>
            <p className="text-[11px] text-[#64748B] mt-1">
              {totalPublicacoes} disparo{totalPublicacoes === 1 ? '' : 's'} no histórico geral
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Taxa de Aprovação */}
        <Card className="border border-[#E2E8F0] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Taxa de Aprovação
            </CardTitle>
            <div className="p-2 rounded-lg bg-purple-50 text-[#7C3AED]">
              <Percent className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              {taxaAprovacao}%
              <TrendingUp className="w-4 h-4 text-[#16A34A]" />
            </div>
            <p className="text-[11px] text-[#64748B] mt-1">
              {metricasConteudos.aprovados} de {metricasConteudos.total} conteúdos aprovados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos de Publicações por Status e Funil de Conteúdos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Publicações por Status em Barras */}
        <Card className="border border-[#E2E8F0] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#2563EB]" />
              Publicações por Status
            </CardTitle>
            <p className="text-xs text-[#64748B]">
              Volume de mensagens por estágio de entrega e leitura
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {totalPublicacoes === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-[#94A3B8] text-xs">
                <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                Nenhuma publicação registrada para gerar o gráfico.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dadosStatusPublicacoes}
                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                  >
                    <XAxis
                      dataKey="status"
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
                      formatter={(val: number) => [`${val} mensagens`, 'Total']}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {dadosStatusPublicacoes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 2: Distribuição de Conteúdos por Status em Pizza */}
        <Card className="border border-[#E2E8F0] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-[#7C3AED]" />
              Validação de Conteúdos Gerados
            </CardTitle>
            <p className="text-xs text-[#64748B]">
              Proporção de peças aprovadas, sob análise e rejeitadas
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {metricasConteudos.total === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-[#94A3B8] text-xs">
                <PieChartIcon className="w-8 h-8 mb-2 opacity-50" />
                Nenhum conteúdo gerado para exibir distribuição.
              </div>
            ) : (
              <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-center gap-4">
                <div className="w-full sm:w-1/2 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dadosStatusConteudos.filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {dadosStatusConteudos.map((entry, index) => (
                          <Cell key={`slice-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: number) => [`${val} conteúdos`, 'Total']}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E2E8F0',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legenda Customizada */}
                <div className="w-full sm:w-1/2 space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-[#16A34A]" />
                      <span className="font-medium text-[#0F172A]">Aprovados</span>
                    </div>
                    <span className="font-bold text-[#16A34A]">{metricasConteudos.aprovados}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50/60 border border-blue-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span className="font-medium text-[#0F172A]">Em Análise</span>
                    </div>
                    <span className="font-bold text-[#2563EB]">{metricasConteudos.pendentes}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-rose-50/60 border border-rose-100">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-[#DC2626]" />
                      <span className="font-medium text-[#0F172A]">Rejeitados</span>
                    </div>
                    <span className="font-bold text-[#DC2626]">{metricasConteudos.rejeitados}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
