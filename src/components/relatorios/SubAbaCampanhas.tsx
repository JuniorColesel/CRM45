import { useState, useMemo, useEffect, useCallback } from 'react'
import { Download, Search, Inbox, RefreshCw } from 'lucide-react'
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
import type {
  CampanhaModel,
  TipoCampanha,
  StatusCampanha,
  PublicacaoModel,
} from '@/types/marketing'
import type { CanalMarketingModel } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'
import { PaginacaoControles } from '@/components/common/PaginacaoControles'
import pb from '@/lib/pocketbase/client'
import { usePeriodo } from '@/contexts/PeriodoContext'

interface SubAbaCampanhasProps {
  campanhasDoPeriodo?: CampanhaModel[]
  publicacoes: PublicacaoModel[]
  canais: CanalMarketingModel[]
  usuarios: Usuario[]
}

const STATUS_LABELS: Record<StatusCampanha, { label: string; classe: string }> = {
  rascunho: { label: 'Rascunho', classe: 'bg-slate-100 text-slate-700 border-slate-200' },
  ativa: { label: 'Ativa', classe: 'bg-emerald-50 text-[#16A34A] border-emerald-200' },
  pausada: { label: 'Pausada', classe: 'bg-amber-50 text-[#CA8A04] border-amber-200' },
  finalizada: { label: 'Finalizada', classe: 'bg-blue-50 text-[#2563EB] border-blue-200' },
}

const TIPO_LABELS: Record<TipoCampanha, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  mista: 'Mista / Multicanal',
}

export function SubAbaCampanhas({
  campanhasDoPeriodo: _campanhasProp,
  publicacoes,
  canais,
  usuarios,
}: SubAbaCampanhasProps) {
  const { ano, mes, nomeMesAno } = usePeriodo()
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  // Paginação server-side (limit 50 + offset)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(50)
  const [campanhas, setCampanhas] = useState<CampanhaModel[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [loading, setLoading] = useState(false)

  const canaisMap = useMemo(() => new Map(canais.map((c) => [c.id, c])), [canais])
  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios])

  // Contagem de publicações por campanha
  const contagemPublicacoesPorCampanha = useMemo(() => {
    const mapa = new Map<string, number>()
    publicacoes.forEach((p) => {
      const atual = mapa.get(p.campanha_id) || 0
      mapa.set(p.campanha_id, atual + 1)
    })
    return mapa
  }, [publicacoes])

  // Montar filtro server-side
  const construirFiltro = useCallback(() => {
    const condicoes: string[] = []

    if (filtroResponsavel !== 'todos') {
      condicoes.push(`responsavel_id = '${filtroResponsavel}'`)
    }
    if (filtroStatus !== 'todos') {
      condicoes.push(`status = '${filtroStatus}'`)
    }
    if (filtroTipo !== 'todos') {
      condicoes.push(`tipo = '${filtroTipo}'`)
    }

    // Período
    const mesNum = typeof mes === 'number' ? mes : new Date().getMonth() + 1
    const inicioMesStr = `${ano}-${String(mesNum).padStart(2, '0')}-01 00:00:00`
    const fimDoMesDia = new Date(ano, mesNum, 0).getDate()
    const fimMesStr = `${ano}-${String(mesNum).padStart(2, '0')}-${String(fimDoMesDia).padStart(2, '0')} 23:59:59`

    condicoes.push(
      `((data_inicio >= '${inicioMesStr}' && data_inicio <= '${fimMesStr}') || (created >= '${inicioMesStr}' && created <= '${fimMesStr}'))`,
    )

    if (busca.trim()) {
      const termo = busca.trim().replace(/'/g, "\\'")
      condicoes.push(
        `(nome ~ '${termo}' || descricao ~ '${termo}' || responsavel_id.nome ~ '${termo}')`,
      )
    }

    return condicoes.join(' && ')
  }, [filtroResponsavel, filtroStatus, filtroTipo, ano, mes, busca])

  // Buscar campanhas paginadas do PocketBase
  const carregarCampanhas = useCallback(async () => {
    try {
      setLoading(true)
      const filtro = construirFiltro()
      const res = await pb
        .collection('campanhas')
        .getList<CampanhaModel>(paginaAtual, itensPorPagina, {
          sort: '-created',
          expand: 'canal_id,responsavel_id',
          filter: filtro || undefined,
          requestKey: null,
        })
      setCampanhas(res.items)
      setTotalRegistros(res.totalItems)
      setTotalPaginas(Math.max(1, res.totalPages))
    } catch (err: unknown) {
      console.error('Erro ao carregar campanhas detalhadas:', err)
      setCampanhas([])
      setTotalRegistros(0)
      setTotalPaginas(1)
    } finally {
      setLoading(false)
    }
  }, [paginaAtual, itensPorPagina, construirFiltro])

  // Voltar à página 1 quando filtros mudarem
  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtroResponsavel, filtroStatus, filtroTipo, ano, mes, itensPorPagina])

  useEffect(() => {
    carregarCampanhas()
  }, [carregarCampanhas])

  const campanhasFiltradas = campanhas

  // Exportar CSV: exporta todos os registros correspondentes ao filtro atual
  const handleExportarCsv = async () => {
    try {
      const filtro = construirFiltro()
      const todasCamp = await pb.collection('campanhas').getFullList<CampanhaModel>({
        sort: '-created',
        expand: 'canal_id,responsavel_id',
        filter: filtro || undefined,
        requestKey: null,
      })

      const cabecalhos = [
        'Nome da Campanha',
        'Tipo',
        'Canal',
        'Responsável',
        'Status',
        'Orçamento (R$)',
        'Publicações (Contagem)',
        'Data de Início',
        'Data de Fim',
      ]

      const linhas = todasCamp.map((camp) => {
        const canalObj = canaisMap.get(camp.canal_id) || camp.expand?.canal_id
        const respObj = usuariosMap.get(camp.responsavel_id) || camp.expand?.responsavel_id
        const qtdPubs = contagemPublicacoesPorCampanha.get(camp.id) || 0

        return [
          camp.nome,
          TIPO_LABELS[camp.tipo] || camp.tipo,
          canalObj?.nome || '',
          respObj?.nome || '',
          STATUS_LABELS[camp.status]?.label || camp.status,
          camp.orcamento || 0,
          qtdPubs,
          camp.data_inicio ? formatarData(camp.data_inicio) : '',
          camp.data_fim ? formatarData(camp.data_fim) : '',
        ]
      })

      const sufixoPeriodo = `${ano}-${String(mes).padStart(2, '0')}`
      exportarParaCsv(`relatorio_campanhas_${sufixoPeriodo}`, cabecalhos, linhas)
    } catch (err: unknown) {
      console.error('Erro ao exportar CSV de campanhas:', err)
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
              placeholder="Buscar por nome de campanha ou responsável..."
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

          {/* Filtro Status */}
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="finalizada">Finalizada</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro Tipo */}
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="mista">Mista</SelectItem>
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
      </div>

      {/* Tabela de Campanhas */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin" />
            <p className="font-medium text-[#64748B]">Carregando campanhas...</p>
          </div>
        ) : campanhasFiltradas.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <Inbox className="w-8 h-8 text-[#CBD5E1]" />
            <p className="font-medium text-[#64748B]">
              Nenhuma campanha encontrada com os filtros selecionados.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-semibold border-b border-[#E2E8F0]">
                  <tr>
                    <th className="py-3 px-4">Nome</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Canal</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Orçamento (R$)</th>
                    <th className="py-3 px-4">Publicações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                  {campanhasFiltradas.map((camp) => {
                    const canalObj = canaisMap.get(camp.canal_id) || camp.expand?.canal_id
                    const respObj =
                      usuariosMap.get(camp.responsavel_id) || camp.expand?.responsavel_id
                    const qtdPubs = contagemPublicacoesPorCampanha.get(camp.id) || 0
                    const statusConfig = STATUS_LABELS[camp.status] || {
                      label: camp.status,
                      classe: 'bg-slate-50 text-slate-700',
                    }

                    return (
                      <tr key={camp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-medium">
                          <div className="text-sm font-semibold text-[#0F172A]">{camp.nome}</div>
                          {camp.descricao && (
                            <div className="text-[11px] text-[#64748B] line-clamp-1">
                              {camp.descricao}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium">
                          {TIPO_LABELS[camp.tipo] || camp.tipo}
                        </td>
                        <td className="py-3 px-4 text-[#64748B]">{canalObj?.nome || '-'}</td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {respObj?.nome || 'Não atribuído'}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className={statusConfig.classe}>
                            {statusConfig.label}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#0F172A]">
                          {formatarMoeda(camp.orcamento)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary" className="bg-slate-100 text-[#0F172A]">
                            {qtdPubs} {qtdPubs === 1 ? 'disparo' : 'disparos'}
                          </Badge>
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
              nomeItens="campanhas"
              loading={loading}
            />
          </>
        )}
      </div>
    </div>
  )
}
