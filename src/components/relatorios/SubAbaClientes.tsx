import { useState, useMemo, useEffect, useCallback } from 'react'
import { Download, Search, Inbox, Star, RefreshCw } from 'lucide-react'
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
import { formatarData } from '@/types/clientes'
import { exportarParaCsv } from './exportarCsv'
import type { ClienteModel } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'
import { PaginacaoControles } from '@/components/common/PaginacaoControles'
import pb from '@/lib/pocketbase/client'

interface SubAbaClientesProps {
  clientes?: ClienteModel[]
  usuarios: Usuario[]
}

export function SubAbaClientes({ clientes: _clientesProp, usuarios }: SubAbaClientesProps) {
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')
  const [filtroCidade, setFiltroCidade] = useState('todas')
  const [filtroGrandeCliente, setFiltroGrandeCliente] = useState('todos')

  // Paginação server-side (limit 50 + offset)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(50)
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [listaCidades, setListaCidades] = useState<string[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [loading, setLoading] = useState(false)

  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios])

  // Carrega lista de cidades disponíveis para o filtro
  useEffect(() => {
    let cancelado = false
    async function carregarCidades() {
      try {
        const registros = await pb.collection('clientes').getFullList<ClienteModel>({
          fields: 'cidade',
          requestKey: null,
        })
        if (!cancelado) {
          const cidades = new Set<string>()
          registros.forEach((c) => {
            if (c.cidade && c.cidade.trim()) {
              cidades.add(c.cidade.trim())
            }
          })
          setListaCidades(Array.from(cidades).sort())
        }
      } catch (err) {
        console.error('Erro ao listar cidades:', err)
      }
    }
    carregarCidades()
    return () => {
      cancelado = true
    }
  }, [])

  // Montar filtro server-side
  const construirFiltro = useCallback(() => {
    const condicoes: string[] = []

    if (filtroResponsavel !== 'todos') {
      condicoes.push(`responsavel_id = '${filtroResponsavel}'`)
    }
    if (filtroCidade !== 'todas') {
      const cidadeEsc = filtroCidade.replace(/'/g, "\\'")
      condicoes.push(`cidade = '${cidadeEsc}'`)
    }
    if (filtroGrandeCliente === 'sim') {
      condicoes.push('grande_cliente = true')
    } else if (filtroGrandeCliente === 'nao') {
      condicoes.push('grande_cliente = false')
    }

    if (busca.trim()) {
      const termo = busca.trim().replace(/'/g, "\\'")
      condicoes.push(
        `(nome_contato ~ '${termo}' || nome_empresa ~ '${termo}' || telefone ~ '${termo}' || cidade ~ '${termo}' || email ~ '${termo}')`,
      )
    }

    return condicoes.length > 0 ? condicoes.join(' && ') : ''
  }, [filtroResponsavel, filtroCidade, filtroGrandeCliente, busca])

  // Buscar clientes paginados do PocketBase
  const carregarClientes = useCallback(async () => {
    try {
      setLoading(true)
      const filtro = construirFiltro()
      const res = await pb
        .collection('clientes')
        .getList<ClienteModel>(paginaAtual, itensPorPagina, {
          sort: 'nome_contato',
          expand: 'responsavel_id',
          filter: filtro || undefined,
          requestKey: null,
        })
      setClientes(res.items)
      setTotalRegistros(res.totalItems)
      setTotalPaginas(Math.max(1, res.totalPages))
    } catch (err: unknown) {
      console.error('Erro ao carregar clientes detalhados:', err)
      setClientes([])
      setTotalRegistros(0)
      setTotalPaginas(1)
    } finally {
      setLoading(false)
    }
  }, [paginaAtual, itensPorPagina, construirFiltro])

  // Voltar à página 1 quando filtros mudarem
  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtroResponsavel, filtroCidade, filtroGrandeCliente, itensPorPagina])

  useEffect(() => {
    carregarClientes()
  }, [carregarClientes])

  const clientesFiltrados = clientes

  // Exportar CSV: exporta todos os registros correspondentes ao filtro atual
  const handleExportarCsv = async () => {
    try {
      const filtro = construirFiltro()
      const todosClientes = await pb.collection('clientes').getFullList<ClienteModel>({
        sort: 'nome_contato',
        expand: 'responsavel_id',
        filter: filtro || undefined,
        requestKey: null,
      })

      const cabecalhos = [
        'Nome do Contato',
        'Empresa',
        'Telefone',
        'Cidade',
        'Responsável',
        'Data da Última Compra',
        'Grande Cliente',
        'E-mail',
        'CNPJ / CPF',
      ]

      const linhas = todosClientes.map((c) => {
        const respObj = usuariosMap.get(c.responsavel_id || '') || c.expand?.responsavel_id

        return [
          c.nome_contato,
          c.nome_empresa || '',
          c.telefone || '',
          c.cidade || '',
          respObj?.nome || '',
          c.data_ultima_compra ? formatarData(c.data_ultima_compra) : '',
          c.grande_cliente ? 'Sim' : 'Não',
          c.email || '',
          c.cnpj_cpf || '',
        ]
      })

      const hoje = new Date().toISOString().substring(0, 10)
      exportarParaCsv(`relatorio_clientes_${hoje}`, cabecalhos, linhas)
    } catch (err: unknown) {
      console.error('Erro ao exportar CSV de clientes:', err)
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
              placeholder="Buscar por contato, empresa, telefone ou cidade..."
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

          {/* Filtro Cidade */}
          <Select value={filtroCidade} onValueChange={setFiltroCidade}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Cidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Cidades</SelectItem>
              {listaCidades.map((cidade) => (
                <SelectItem key={cidade} value={cidade}>
                  {cidade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Grande Cliente */}
          <Select value={filtroGrandeCliente} onValueChange={setFiltroGrandeCliente}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="Grande Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Clientes</SelectItem>
              <SelectItem value="sim">Apenas Grandes Clientes</SelectItem>
              <SelectItem value="nao">Clientes Convencionais</SelectItem>
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
          {totalRegistros === 1 ? 'registro encontrado' : 'registros encontrados'}
        </span>
      </div>

      {/* Tabela de Clientes */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin" />
            <p className="font-medium text-[#64748B]">Carregando clientes...</p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <Inbox className="w-8 h-8 text-[#CBD5E1]" />
            <p className="font-medium text-[#64748B]">
              Nenhum cliente encontrado com os filtros selecionados.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-semibold border-b border-[#E2E8F0]">
                  <tr>
                    <th className="py-3 px-4">Nome do Contato</th>
                    <th className="py-3 px-4">Empresa</th>
                    <th className="py-3 px-4">Telefone</th>
                    <th className="py-3 px-4">Cidade</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Última Compra</th>
                    <th className="py-3 px-4 text-center">Grande Cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                  {clientesFiltrados.map((c) => {
                    const respObj =
                      usuariosMap.get(c.responsavel_id || '') || c.expand?.responsavel_id

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-[#0F172A]">{c.nome_contato}</td>
                        <td className="py-3 px-4 text-[#64748B]">{c.nome_empresa || '-'}</td>
                        <td className="py-3 px-4 font-mono text-[#0F172A]">{c.telefone || '-'}</td>
                        <td className="py-3 px-4 text-[#64748B]">{c.cidade || '-'}</td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {respObj?.nome || 'Não atribuído'}
                        </td>
                        <td className="py-3 px-4 text-[#64748B]">
                          {c.data_ultima_compra ? formatarData(c.data_ultima_compra) : '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {c.grande_cliente ? (
                            <Badge className="bg-amber-50 text-[#CA8A04] border-amber-200 inline-flex items-center gap-1 font-semibold">
                              <Star className="w-3 h-3 fill-amber-400 stroke-amber-500" /> Sim
                            </Badge>
                          ) : (
                            <span className="text-[#94A3B8]">Não</span>
                          )}
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
              nomeItens="clientes"
              loading={loading}
            />
          </>
        )}
      </div>
    </div>
  )
}
