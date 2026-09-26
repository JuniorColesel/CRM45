import { useState, useMemo } from 'react'
import { Download, Search, Filter, TrendingUp, Inbox } from 'lucide-react'
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

interface SubAbaOportunidadesProps {
  oportunidadesDoPeriodo: OportunidadeModel[]
  etapas: EtapaFunilModel[]
  usuarios: Usuario[]
  clientes: ClienteModel[]
}

export function SubAbaOportunidades({
  oportunidadesDoPeriodo,
  etapas,
  usuarios,
  clientes,
}: SubAbaOportunidadesProps) {
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // Mapeamentos rápidos para cliente, responsável e etapa
  const clientesMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios])
  const etapasMap = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas])

  // Filtragem dos dados
  const oportunidadesFiltradas = useMemo(() => {
    return oportunidadesDoPeriodo.filter((op) => {
      if (filtroResponsavel !== 'todos' && op.responsavel_id !== filtroResponsavel) {
        return false
      }
      if (filtroEtapa !== 'todas' && op.etapa_id !== filtroEtapa) {
        return false
      }
      if (filtroStatus !== 'todos' && op.status !== filtroStatus) {
        return false
      }

      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const clienteObj = clientesMap.get(op.cliente_id) || op.expand?.cliente_id
        const respObj = usuariosMap.get(op.responsavel_id) || op.expand?.responsavel_id
        const nomeCliente = clienteObj?.nome_contato?.toLowerCase() || ''
        const empresaCliente = clienteObj?.nome_empresa?.toLowerCase() || ''
        const nomeResp = respObj?.nome?.toLowerCase() || ''

        const match =
          nomeCliente.includes(termo) || empresaCliente.includes(termo) || nomeResp.includes(termo)
        if (!match) return false
      }

      return true
    })
  }, [
    oportunidadesDoPeriodo,
    filtroResponsavel,
    filtroEtapa,
    filtroStatus,
    busca,
    clientesMap,
    usuariosMap,
  ])

  // Ação Exportar CSV
  const handleExportarCsv = () => {
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

    const linhas = oportunidadesFiltradas.map((op) => {
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

    exportarParaCsv('relatorio_oportunidades', cabecalhos, linhas)
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

      {/* Resumo da listagem */}
      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
        <span>
          Mostrando <strong>{oportunidadesFiltradas.length}</strong> de{' '}
          {oportunidadesDoPeriodo.length} oportunidades no período
        </span>
        {oportunidadesFiltradas.length > 0 && (
          <span className="font-semibold text-[#0F172A]">
            Total filtrado:{' '}
            {formatarMoeda(
              oportunidadesFiltradas.reduce((acc, curr) => acc + (curr.valor || 0), 0),
            )}
          </span>
        )}
      </div>

      {/* Tabela de Oportunidades (Desktop e Mobile Friendly) */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
        {oportunidadesFiltradas.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <Inbox className="w-8 h-8 text-[#CBD5E1]" />
            <p className="font-medium text-[#64748B]">
              Nenhuma oportunidade encontrada com os filtros selecionados.
            </p>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}
