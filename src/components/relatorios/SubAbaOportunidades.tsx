import { useState, useMemo, useEffect, useCallback } from 'react'
import { Download, Search, Filter, TrendingUp, Inbox, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatarMoeda, formatarData } from '@/types/clientes'
import { exportarParaCsv } from './exportarCsv'
import type { OportunidadeModel, EtapaFunilModel, ClienteModel } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'
import { PaginacaoControles } from '@/components/common/PaginacaoControles'
import pb from '@/lib/pocketbase/client'
import { usePeriodo } from '@/contexts/PeriodoContext'

interface SubAbaOportunidadesProps {
  oportunidadesDoPeriodo?: OportunidadeModel[]
  etapas: EtapaFunilModel[]
  usuarios: Usuario[]
  clientes: ClienteModel[]
}

export function SubAbaOportunidades({
  oportunidadesDoPeriodo: _oportunidadesProp,
  etapas,
  usuarios,
  clientes,
}: SubAbaOportunidadesProps) {
  const { ano, mes, nomeMesAno } = usePeriodo()
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // Paginação server-side (limit 50 + offset)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(50)
  const [oportunidades, setOportunidades] = useState<OportunidadeModel[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [loading, setLoading] = useState(false)

  // Mapeamentos rápidos para cliente, responsável e etapa
  const clientesMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios])
  const etapasMap = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas])

  // Montar filtro server-side
  const construirFiltro = useCallback(() => {
    const condicoes: string[] = []

    if (filtroResponsavel !== 'todos') {
      condicoes.push(`responsavel_id = '${filtroResponsavel}'`)
    }
    if (filtroEtapa !== 'todas') {
      condicoes.push(`etapa_id = '${filtroEtapa}'`)
    }
    if (filtroStatus !== 'todos') {
      condicoes.push(`status = '${filtroStatus}'`)
    }

    // Período
    const mesNum = typeof mes === 'number' ? mes : new Date().getMonth() + 1
    const inicioMesStr = `${ano}-${String(mesNum).padStart(2, '0')}-01 00:00:00`
    const fimDoMesDia = new Date(ano, mesNum, 0).getDate()
    const fimMesStr = `${ano}-${String(mesNum).padStart(2, '0')}-${String(fimDoMesDia).padStart(2, '0')} 23:59:59`

    // Apenas oportunidades do CRM nos relatórios padrão do funil nativo
    condicoes.push("(origem = '' || origem = 'crm')")

    const filtroPeriodo = `((status = 'ganho' && ((data_fechamento >= '${inicioMesStr}' && data_fechamento <= '${fimMesStr}') || (data_fechamento = '' && created >= '${inicioMesStr}' && created <= '${fimMesStr}'))) || (status = 'perdido' && ((data_fechamento >= '${inicioMesStr}' && data_fechamento <= '${fimMesStr}') || (data_fechamento = '' && created >= '${inicioMesStr}' && created <= '${fimMesStr}'))) || (status = 'aberto' && ((data_prevista_fechamento >= '${inicioMesStr}' && data_prevista_fechamento <= '${fimMesStr}') || (data_prevista_fechamento = '' && created <= '${fimMesStr}'))))`
    condicoes.push(filtroPeriodo)

    if (busca.trim()) {
      const termo = busca.trim().replace(/'/g, "\\'")
      condicoes.push(
        `(cliente_id.nome_contato ~ '${termo}' || cliente_id.nome_empresa ~ '${termo}' || responsavel_id.nome ~ '${termo}')`,
      )
    }

    return condicoes.join(' && ')
  }, [filtroResponsavel, filtroEtapa, filtroStatus, ano, mes, busca])

  // Buscar oportunidades paginadas do PocketBase
  const carregarOportunidades = useCallback(async () => {
    try {
      setLoading(true)
      const filtro = construirFiltro()
      const res = await pb
        .collection('oportunidades')
        .getList<OportunidadeModel>(paginaAtual, itensPorPagina, {
          sort: '-created',
          expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
          filter: filtro || undefined,
          requestKey: null,
        })
      setOportunidades(res.items)
      setTotalRegistros(res.totalItems)
      setTotalPaginas(Math.max(1, res.totalPages))
    } catch (err: unknown) {
      console.error('Erro ao carregar oportunidades detalhadas:', err)
      setOportunidades([])
      setTotalRegistros(0)
      setTotalPaginas(1)
    } finally {
      setLoading(false)
    }
  }, [paginaAtual, itensPorPagina, construirFiltro])

  // Voltar à página 1 quando filtros mudarem
  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtroResponsavel, filtroEtapa, filtroStatus, ano, mes, itensPorPagina])

  useEffect(() => {
    carregarOportunidades()
  }, [carregarOportunidades])

  const oportunidadesFiltradas = oportunidades

  // Ação Exportar CSV: exporta todos os registros correspondentes ao filtro atual
  const handleExportarCsv = async () => {
    try {
      const filtro = construirFiltro()
      const todasOps = await pb.collection('oportunidades').getFullList<OportunidadeModel>({
        sort: '-created',
        expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
        filter: filtro || undefined,
        requestKey: null,
      })

      const cabecalhos = [
        'Cliente',
        'Empresa',
        'Valor (R$)',
        'Etapa',
        'Responsável',
        'Status',
        'Data de Fechamento',
        'Data Prevista',
        'Criado em',
      ]

      const linhas = todasOps.map((op) => {
        const clienteObj = clientesMap.get(op.cliente_id) || op.expand?.cliente_id
        const respObj = usuariosMap.get(op.responsavel_id) || op.expand?.responsavel_id
        const etapaObj = etapasMap.get(op.etapa_id) || op.expand?.etapa_id

        return [
          clienteObj?.nome_contato || 'Não informado',
          clienteObj?.nome_empresa || '',
          op.valor || 0,
          etapaObj?.nome || '',
          respObj?.nome || '',
          op.status === 'ganho' ? 'Ganho' : op.status === 'perdido' ? 'Perdido' : 'Aberto',
          op.data_fechamento ? formatarData(op.data_fechamento) : '',
          op.data_prevista_fechamento ? formatarData(op.data_prevista_fechamento) : '',
          op.criado_em ? formatarData(op.criado_em) : '',
        ]
      })

      const sufixoPeriodo = `${ano}-${String(mes).padStart(2, '0')}`
      exportarParaCsv(`relatorio_oportunidades_${sufixoPeriodo}`, cabecalhos, linhas)
    } catch (err: unknown) {
      console.error('Erro ao exportar CSV de oportunidades:', err)
    }
  }

  // Cor do badge de status
  const badgeStatus = (status: string) => {
    switch (status) {
      case 'ganho':
        return <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200">Ganho</Badge>
      case 'perdido':
        return <Badge className="bg-rose-50 text-[#DC2626] border-rose-200">Perdido</Badge>
      default:
        return <Badge className="bg-blue-50 text-[#2563EB] border-blue-200">Aberto</Badge>
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Exportação */}
      <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Busca textual */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente ou responsável..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Filtro Responsável */}
          <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Responsáveis</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Etapa */}
          <Select value={filtroEtapa} onValueChange={setFiltroEtapa}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Etapas</SelectItem>
              {etapas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Status */}
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="aberto">Abertas</SelectItem>
              <SelectItem value="ganho">Ganhas</SelectItem>
              <SelectItem value="perdido">Perdidas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Botão Exportar CSV */}
        <Button
          onClick={handleExportarCsv}
          variant="outline"
          size="sm"
          className="h-9 border-[#E2E8F0] text-[#0F172A] hover:bg-slate-50 flex items-center gap-2 shrink-0 font-semibold"
        >
          <Download className="w-4 h-4 text-[#2563EB]" />
          Exportar CSV
        </Button>
      </div>

      {/* Resumo da listagem com contador total no topo */}
      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
        <span>
          <strong className="text-[#0F172A]">{totalRegistros}</strong>{' '}
          {totalRegistros === 1 ? 'registro encontrado' : 'registros encontrados'} para {nomeMesAno}
        </span>
        {oportunidadesFiltradas.length > 0 && (
          <span className="font-semibold text-[#0F172A]">
            Total nesta página:{' '}
            {formatarMoeda(
              oportunidadesFiltradas.reduce((acc, curr) => acc + (curr.valor || 0), 0),
            )}
          </span>
        )}
      </div>

      {/* Tabela de Oportunidades (Desktop e Mobile Friendly) */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin" />
            <p className="font-medium text-[#64748B]">Carregando oportunidades...</p>
          </div>
        ) : oportunidadesFiltradas.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <Inbox className="w-8 h-8 text-[#CBD5E1]" />
            <p className="font-medium text-[#64748B]">
              Nenhuma oportunidade encontrada com os filtros selecionados.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-semibold border-b border-[#E2E8F0]">
                  <tr>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Valor (R$)</th>
                    <th className="py-3 px-4">Etapa</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Data Fechamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                  {oportunidadesFiltradas.map((op) => {
                    const clienteObj = clientesMap.get(op.cliente_id) || op.expand?.cliente_id
                    const respObj = usuariosMap.get(op.responsavel_id) || op.expand?.responsavel_id
                    const etapaObj = etapasMap.get(op.etapa_id) || op.expand?.etapa_id

                    return (
                      <tr key={op.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-medium">
                          <div className="text-sm font-semibold text-[#0F172A]">
                            {clienteObj?.nome_contato || 'Cliente não identificado'}
                          </div>
                          {clienteObj?.nome_empresa && (
                            <div className="text-[11px] text-[#64748B]">
                              {clienteObj.nome_empresa}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-sm text-[#0F172A]">
                          {formatarMoeda(op.valor)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {etapaObj?.cor && (
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: etapaObj.cor }}
                              />
                            )}
                            <span className="font-medium">{etapaObj?.nome || '-'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {respObj?.nome || 'Não atribuído'}
                        </td>
                        <td className="py-3 px-4">{badgeStatus(op.status)}</td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {op.data_fechamento
                            ? formatarData(op.data_fechamento)
                            : op.data_prevista_fechamento
                              ? `${formatarData(op.data_prevista_fechamento)} (Prev.)`
                              : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Controles de paginação server-side com seletor 25, 50, 100 */}
            <PaginacaoControles
              paginaAtual={paginaAtual}
              totalPaginas={totalPaginas}
              totalRegistros={totalRegistros}
              itensPorPagina={itensPorPagina}
              onPaginaChange={setPaginaAtual}
              onItensPorPaginaChange={(qtd) => {
                setItensPorPagina(qtd)
                setPaginaAtual(1)
              }}
              opcoesItensPorPagina={[25, 50, 100]}
              nomeItens="oportunidades"
              loading={loading}
            />
          </>
        )}
      </div>
    </div>
  )
}
