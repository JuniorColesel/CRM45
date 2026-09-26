import React, { useEffect, useState, useMemo, useCallback } from 'react'
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Target,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SeletorDePeriodo } from '@/components/common/SeletorDePeriodo'
import { usePeriodo } from '@/contexts/PeriodoContext'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { OportunidadeModel, MetaModel, ClienteModel } from '@/types/clientes'
import { formatarMoeda, formatarData } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'

export default function RelatoriosPage() {
  const { user } = useAuth()
  const { ano, mes, nomeMesAno } = usePeriodo()

  const [loading, setLoading] = useState(true)
  const [oportunidades, setOportunidades] = useState<OportunidadeModel[]>([])
  const [metas, setMetas] = useState<MetaModel[]>([])
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)

      const [opsRes, metasRes, clientesRes, usuariosRes] = await Promise.all([
        pb.collection('oportunidades').getFullList<OportunidadeModel>({
          sort: '-created',
          expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
        }),
        pb
          .collection('metas')
          .getFullList<MetaModel>({
            sort: '-ano,-mes',
            expand: 'usuario_id',
          })
          .catch(() => []),
        pb
          .collection('clientes')
          .getFullList<ClienteModel>({
            sort: 'nome_contato',
          })
          .catch(() => []),
        pb
          .collection('usuarios')
          .getFullList<Usuario>({
            sort: 'nome',
          })
          .catch(() => (user ? [user] : [])),
      ])

      setOportunidades(opsRes)
      setMetas(metasRes)
      setClientes(clientesRes)
      setUsuarios(usuariosRes.length > 0 ? usuariosRes : user ? [user] : [])
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar relatórios',
        description: 'Não foi possível carregar os dados de vendas e metas do período.',
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Filtragem de dados pelo período selecionado no contexto
  const opsPeriodo = useMemo(() => {
    return oportunidades.filter((op) => {
      let dataRef = ''
      if (op.status === 'ganho' || op.status === 'perdido') {
        dataRef =
          op.data_fechamento || op.data_prevista_fechamento || op.criado_em || op.created || ''
      } else {
        dataRef = op.data_prevista_fechamento || op.criado_em || op.created || ''
      }
      if (!dataRef) return true
      const d = new Date(dataRef)
      if (isNaN(d.getTime())) return true
      return d.getFullYear() === ano && d.getMonth() + 1 === mes
    })
  }, [oportunidades, ano, mes])

  const metasPeriodo = useMemo(() => {
    return metas.filter((m) => m.ano === ano && m.mes === mes)
  }, [metas, ano, mes])

  // Clientes criados no período
  const novosClientesPeriodo = useMemo(() => {
    return clientes.filter((c) => {
      const dataRef = c.criado_em || c.created || ''
      if (!dataRef) return false
      const d = new Date(dataRef)
      if (isNaN(d.getTime())) return false
      return d.getFullYear() === ano && d.getMonth() + 1 === mes
    })
  }, [clientes, ano, mes])

  // Indicadores consolidados do período
  const metricas = useMemo(() => {
    const ganhas = opsPeriodo.filter((o) => o.status === 'ganho')
    const perdidas = opsPeriodo.filter((o) => o.status === 'perdido')
    const abertas = opsPeriodo.filter((o) => o.status === 'aberto')

    const valorRealizado = ganhas.reduce((acc, curr) => acc + (curr.valor || 0), 0)
    const valorPipeline = abertas.reduce((acc, curr) => acc + (curr.valor || 0), 0)
    const valorPerdido = perdidas.reduce((acc, curr) => acc + (curr.valor || 0), 0)

    const finalizadas = ganhas.length + perdidas.length
    const taxaConversao = finalizadas > 0 ? (ganhas.length / finalizadas) * 100 : 0
    const ticketMedio = ganhas.length > 0 ? valorRealizado / ganhas.length : 0

    // Meta consolidada cadastrada para o mês
    const metaValorTotal = metasPeriodo.reduce((acc, curr) => acc + (curr.valor_meta || 0), 0)
    const metaOportunidadesTotal = metasPeriodo.reduce(
      (acc, curr) => acc + (curr.meta_oportunidades || 0),
      0,
    )

    const percentualMetaValor =
      metaValorTotal > 0 ? Math.min(Math.round((valorRealizado / metaValorTotal) * 100), 200) : 0
    const percentualMetaOps =
      metaOportunidadesTotal > 0
        ? Math.min(Math.round((ganhas.length / metaOportunidadesTotal) * 100), 200)
        : 0

    return {
      totalOps: opsPeriodo.length,
      qtdGanhas: ganhas.length,
      qtdPerdidas: perdidas.length,
      qtdAbertas: abertas.length,
      valorRealizado,
      valorPipeline,
      valorPerdido,
      taxaConversao,
      ticketMedio,
      metaValorTotal,
      metaOportunidadesTotal,
      percentualMetaValor,
      percentualMetaOps,
    }
  }, [opsPeriodo, metasPeriodo])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 4) Seletor de Período Global */}
      <SeletorDePeriodo />

      {/* Cabeçalho do Módulo de Relatórios */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#2563EB]" />
            Relatórios e Indicadores Comerciais
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Desempenho comercial, acompanhamento de metas e conversão para{' '}
            <strong className="text-[#0F172A] font-semibold">{nomeMesAno}</strong>.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={carregarDados}
          disabled={loading}
          className="text-[#64748B] hover:text-[#0F172A] self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Vendas Fechadas (Ganho) */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
              Vendas Realizadas
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#16A34A] flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A]">
              {formatarMoeda(metricas.valorRealizado)}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge
                variant="outline"
                className="text-[11px] bg-emerald-50 text-[#16A34A] border-emerald-200"
              >
                {metricas.qtdGanhas}{' '}
                {metricas.qtdGanhas === 1 ? 'proposta ganha' : 'propostas ganhas'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Aberto */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
              Pipeline em Aberto
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A]">
              {formatarMoeda(metricas.valorPipeline)}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge
                variant="outline"
                className="text-[11px] bg-blue-50 text-[#2563EB] border-blue-200"
              >
                {metricas.qtdAbertas} em negociação
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
              Taxa de Conversão
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-[#7C3AED] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A]">
              {metricas.taxaConversao.toFixed(1)}%
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Ticket Médio:{' '}
              <strong className="text-[#0F172A]">{formatarMoeda(metricas.ticketMedio)}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Novos Clientes Cadastrados */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
              Novos Clientes ({nomeMesAno})
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#D97706] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0F172A]">{novosClientesPeriodo.length}</div>
            <p className="text-xs text-[#64748B] mt-1">{clientes.length} clientes na base total</p>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Metas do Período */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#2563EB]" />
              <div>
                <CardTitle className="text-base font-bold text-[#0F172A]">
                  Acompanhamento de Metas de Vendas
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Metas corporativas e por usuário para {nomeMesAno}.
                </CardDescription>
              </div>
            </div>
            {metasPeriodo.length > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-[#2563EB] border-blue-200">
                {metasPeriodo.length}{' '}
                {metasPeriodo.length === 1 ? 'meta definida' : 'metas definidas'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {metasPeriodo.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-[#E2E8F0] space-y-2">
              <Target className="w-10 h-10 text-[#94A3B8] mx-auto" />
              <p className="text-sm font-semibold text-[#0F172A]">
                Nenhuma meta cadastrada para {nomeMesAno}
              </p>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                As metas cadastradas na tabela <code>metas</code> para o ano {ano} e mês {mes}{' '}
                aparecerão aqui com o progresso automático de fechamentos.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Barra de Progresso Geral */}
              <div className="p-4 rounded-xl bg-slate-50 border border-[#E2E8F0] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#0F172A]">
                  <span>Progresso Geral de Faturamento ({nomeMesAno})</span>
                  <span>
                    {formatarMoeda(metricas.valorRealizado)} de{' '}
                    {formatarMoeda(metricas.metaValorTotal)} ({metricas.percentualMetaValor}%)
                  </span>
                </div>
                <Progress value={metricas.percentualMetaValor} className="h-2.5 bg-slate-200" />
              </div>

              {/* Tabela de Metas por Usuário */}
              <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F8FAFC] text-[#64748B] uppercase font-semibold border-b border-[#E2E8F0]">
                    <tr>
                      <th className="py-2.5 px-3">Vendedor / Usuário</th>
                      <th className="py-2.5 px-3">Meta Faturamento</th>
                      <th className="py-2.5 px-3">Realizado</th>
                      <th className="py-2.5 px-3">Atingimento</th>
                      <th className="py-2.5 px-3">Meta Oportunidades</th>
                      <th className="py-2.5 px-3">Fechadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[#0F172A]">
                    {metasPeriodo.map((meta) => {
                      const usuarioNome =
                        meta.expand?.usuario_id?.nome ||
                        usuarios.find((u) => u.id === meta.usuario_id)?.nome ||
                        'Usuário'

                      const opsDoUsuario = opsPeriodo.filter(
                        (o) => o.responsavel_id === meta.usuario_id && o.status === 'ganho',
                      )
                      const valorRealizadoUsuario = opsDoUsuario.reduce(
                        (acc, curr) => acc + (curr.valor || 0),
                        0,
                      )
                      const pctValor =
                        meta.valor_meta > 0
                          ? Math.round((valorRealizadoUsuario / meta.valor_meta) * 100)
                          : 0

                      return (
                        <tr key={meta.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold">{usuarioNome}</td>
                          <td className="py-2.5 px-3 font-medium">
                            {formatarMoeda(meta.valor_meta)}
                          </td>
                          <td className="py-2.5 px-3 text-[#16A34A] font-semibold">
                            {formatarMoeda(valorRealizadoUsuario)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <Progress value={pctValor} className="h-2 w-16" />
                              <span className="font-bold">{pctValor}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">{meta.meta_oportunidades}</td>
                          <td className="py-2.5 px-3 font-semibold text-[#16A34A]">
                            {opsDoUsuario.length}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo de Propostas Ganhas e Perdidas do Período */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Propostas Ganhas */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
              Propostas Ganhas ({opsPeriodo.filter((o) => o.status === 'ganho').length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsPeriodo.filter((o) => o.status === 'ganho').length === 0 ? (
              <p className="text-xs text-[#64748B] py-4 text-center">
                Nenhuma proposta fechada como ganha em {nomeMesAno}.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {opsPeriodo
                  .filter((o) => o.status === 'ganho')
                  .map((op) => (
                    <div
                      key={op.id}
                      className="p-2.5 rounded-lg border border-[#E2E8F0] flex items-center justify-between text-xs bg-slate-50"
                    >
                      <div>
                        <div className="font-semibold text-[#0F172A]">
                          {op.expand?.cliente_id?.nome_contato || 'Cliente'}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          Fechamento: {formatarData(op.data_fechamento || op.criado_em)}
                        </div>
                      </div>
                      <span className="font-bold text-[#16A34A]">{formatarMoeda(op.valor)}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Propostas Perdidas */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <XCircle className="w-4 h-4 text-[#DC2626]" />
              Propostas Perdidas ({opsPeriodo.filter((o) => o.status === 'perdido').length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsPeriodo.filter((o) => o.status === 'perdido').length === 0 ? (
              <p className="text-xs text-[#64748B] py-4 text-center">
                Nenhuma proposta marcada como perdida em {nomeMesAno}.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {opsPeriodo
                  .filter((o) => o.status === 'perdido')
                  .map((op) => (
                    <div
                      key={op.id}
                      className="p-2.5 rounded-lg border border-[#E2E8F0] flex items-center justify-between text-xs bg-slate-50"
                    >
                      <div>
                        <div className="font-semibold text-[#0F172A]">
                          {op.expand?.cliente_id?.nome_contato || 'Cliente'}
                        </div>
                        <div className="text-[11px] text-[#DC2626]">
                          Motivo: {op.expand?.motivo_perda_id?.descricao || 'Não informado'}
                        </div>
                      </div>
                      <span className="font-semibold text-[#64748B]">
                        {formatarMoeda(op.valor)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
