import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Download,
  Search,
  Inbox,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  RefreshCw,
} from 'lucide-react'
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
import { formatarDataHora, formatarDuracao } from '@/types/clientes'
import { exportarParaCsv } from './exportarCsv'
import type { LigacaoModel, ClienteModel, TipoLigacao, ResultadoLigacao } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'
import { PaginacaoControles } from '@/components/common/PaginacaoControles'
import pb from '@/lib/pocketbase/client'
import { usePeriodo } from '@/contexts/PeriodoContext'

interface SubAbaLigacoesProps {
  ligacoesDoPeriodo?: LigacaoModel[]
  usuarios: Usuario[]
  clientes: ClienteModel[]
}

const RESULTADO_LABELS: Record<ResultadoLigacao, string> = {
  atendeu: 'Atendeu',
  nao_atendeu: 'Não Atendeu',
  caixa_postal: 'Caixa Postal',
  ocupado: 'Ocupado',
  desligou: 'Desligou',
}

export function SubAbaLigacoes({
  ligacoesDoPeriodo: _ligacoesProp,
  usuarios,
  clientes,
}: SubAbaLigacoesProps) {
  const { ano, mes, nomeMesAno } = usePeriodo()
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroResultado, setFiltroResultado] = useState('todos')

  // Paginação server-side (limit 50 + offset)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(50)
  const [ligacoes, setLigacoes] = useState<LigacaoModel[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [loading, setLoading] = useState(false)

  const clientesMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios])

  // Montar filtro server-side
  const construirFiltro = useCallback(() => {
    const condicoes: string[] = []

    if (filtroResponsavel !== 'todos') {
      condicoes.push(`responsavel_id = '${filtroResponsavel}'`)
    }
    if (filtroTipo !== 'todos') {
      condicoes.push(`tipo = '${filtroTipo}'`)
    }
    if (filtroResultado !== 'todos') {
      condicoes.push(`resultado = '${filtroResultado}'`)
    }

    // Período
    const mesNum = typeof mes === 'number' ? mes : new Date().getMonth() + 1
    const inicioMesStr = `${ano}-${String(mesNum).padStart(2, '0')}-01 00:00:00`
    const fimDoMesDia = new Date(ano, mesNum, 0).getDate()
    const fimMesStr = `${ano}-${String(mesNum).padStart(2, '0')}-${String(fimDoMesDia).padStart(2, '0')} 23:59:59`

    condicoes.push(`data_hora >= '${inicioMesStr}' && data_hora <= '${fimMesStr}'`)

    if (busca.trim()) {
      const termo = busca.trim().replace(/'/g, "\\'")
      condicoes.push(
        `(cliente_id.nome_contato ~ '${termo}' || cliente_id.nome_empresa ~ '${termo}' || responsavel_id.nome ~ '${termo}' || observacoes ~ '${termo}')`,
      )
    }

    return condicoes.join(' && ')
  }, [filtroResponsavel, filtroTipo, filtroResultado, ano, mes, busca])

  // Buscar ligações paginadas do PocketBase
  const carregarLigacoes = useCallback(async () => {
    try {
      setLoading(true)
      const filtro = construirFiltro()
      const res = await pb
        .collection('ligacoes')
        .getList<LigacaoModel>(paginaAtual, itensPorPagina, {
          sort: '-data_hora',
          expand: 'cliente_id,responsavel_id',
          filter: filtro || undefined,
          requestKey: null,
        })
      setLigacoes(res.items)
      setTotalRegistros(res.totalItems)
      setTotalPaginas(Math.max(1, res.totalPages))
    } catch (err: unknown) {
      console.error('Erro ao carregar ligações detalhadas:', err)
      setLigacoes([])
      setTotalRegistros(0)
      setTotalPaginas(1)
    } finally {
      setLoading(false)
    }
  }, [paginaAtual, itensPorPagina, construirFiltro])

  // Voltar à página 1 quando filtros mudarem
  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtroResponsavel, filtroTipo, filtroResultado, ano, mes, itensPorPagina])

  useEffect(() => {
    carregarLigacoes()
  }, [carregarLigacoes])

  const ligacoesFiltradas = ligacoes

  // Ação Exportar CSV: exporta todos os registros correspondentes ao filtro atual
  const handleExportarCsv = async () => {
    try {
      const filtro = construirFiltro()
      const todasLig = await pb.collection('ligacoes').getFullList<LigacaoModel>({
        sort: '-data_hora',
        expand: 'cliente_id,responsavel_id',
        filter: filtro || undefined,
        requestKey: null,
      })

      const cabecalhos = [
        'Cliente',
        'Empresa',
        'Tipo',
        'Resultado',
        'Duração (mm:ss)',
        'Duração (segundos)',
        'Responsável',
        'Data e Hora',
        'Observações',
      ]

      const linhas = todasLig.map((lig) => {
        const clienteObj = clientesMap.get(lig.cliente_id) || lig.expand?.cliente_id
        const respObj = usuariosMap.get(lig.responsavel_id) || lig.expand?.responsavel_id

        return [
          clienteObj?.nome_contato || 'Não informado',
          clienteObj?.nome_empresa || '',
          lig.tipo === 'entrada' ? 'Entrada' : lig.tipo === 'saida' ? 'Saída' : 'Perdida',
          lig.resultado ? RESULTADO_LABELS[lig.resultado] || lig.resultado : 'Não informado',
          formatarDuracao(lig.duracao_segundos),
          lig.duracao_segundos || 0,
          respObj?.nome || '',
          formatarDataHora(lig.data_hora),
          lig.observacoes || '',
        ]
      })

      const sufixoPeriodo = `${ano}-${String(mes).padStart(2, '0')}`
      exportarParaCsv(`relatorio_ligacoes_${sufixoPeriodo}`, cabecalhos, linhas)
    } catch (err: unknown) {
      console.error('Erro ao exportar CSV de ligações:', err)
    }
  }

  // Renderizar ícone e badge de tipo
  const renderTipoLigacao = (tipo: TipoLigacao) => {
    switch (tipo) {
      case 'entrada':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-[#16A34A] border-emerald-200 flex items-center gap-1"
          >
            <PhoneIncoming className="w-3 h-3" /> Entrada
          </Badge>
        )
      case 'saida':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-[#2563EB] border-blue-200 flex items-center gap-1"
          >
            <PhoneOutgoing className="w-3 h-3" /> Saída
          </Badge>
        )
      case 'perdida':
        return (
          <Badge
            variant="outline"
            className="bg-rose-50 text-[#DC2626] border-rose-200 flex items-center gap-1"
          >
            <PhoneMissed className="w-3 h-3" /> Perdida
          </Badge>
        )
    }
  }

  // Renderizar badge de resultado
  const renderResultadoLigacao = (resultado?: ResultadoLigacao) => {
    if (!resultado) return <span className="text-[#94A3B8]">-</span>
    const label = RESULTADO_LABELS[resultado] || resultado

    if (resultado === 'atendeu') {
      return <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200">{label}</Badge>
    }
    if (resultado === 'nao_atendeu' || resultado === 'desligou') {
      return <Badge className="bg-rose-50 text-[#DC2626] border-rose-200">{label}</Badge>
    }
    return <Badge className="bg-amber-50 text-[#CA8A04] border-amber-200">{label}</Badge>
  }

  return (
    <div className="space-y-4">
      {/* Filtros e Exportação */}
      <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Busca textual */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, responsável ou notas..."
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

          {/* Filtro Tipo */}
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
              <SelectItem value="perdida">Perdida</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro Resultado */}
          <Select value={filtroResultado} onValueChange={setFiltroResultado}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Resultado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Resultados</SelectItem>
              <SelectItem value="atendeu">Atendeu</SelectItem>
              <SelectItem value="nao_atendeu">Não Atendeu</SelectItem>
              <SelectItem value="caixa_postal">Caixa Postal</SelectItem>
              <SelectItem value="ocupado">Ocupado</SelectItem>
              <SelectItem value="desligou">Desligou</SelectItem>
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

      {/* Tabela de Ligações */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin" />
            <p className="font-medium text-[#64748B]">Carregando ligações...</p>
          </div>
        ) : ligacoesFiltradas.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <Inbox className="w-8 h-8 text-[#CBD5E1]" />
            <p className="font-medium text-[#64748B]">
              Nenhuma ligação encontrada com os filtros selecionados.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-semibold border-b border-[#E2E8F0]">
                  <tr>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Resultado</th>
                    <th className="py-3 px-4">Duração</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Data e Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                  {ligacoesFiltradas.map((lig) => {
                    const clienteObj = clientesMap.get(lig.cliente_id) || lig.expand?.cliente_id
                    const respObj =
                      usuariosMap.get(lig.responsavel_id) || lig.expand?.responsavel_id

                    return (
                      <tr key={lig.id} className="hover:bg-slate-50/70 transition-colors">
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
                        <td className="py-3 px-4">{renderTipoLigacao(lig.tipo)}</td>
                        <td className="py-3 px-4">{renderResultadoLigacao(lig.resultado)}</td>
                        <td className="py-3 px-4 font-mono font-medium text-[#0F172A]">
                          {formatarDuracao(lig.duracao_segundos)}
                        </td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {respObj?.nome || 'Não atribuído'}
                        </td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {formatarDataHora(lig.data_hora)}
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
              nomeItens="ligações"
              loading={loading}
            />
          </>
        )}
      </div>
    </div>
  )
}
