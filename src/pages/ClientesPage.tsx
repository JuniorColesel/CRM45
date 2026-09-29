import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Plus,
  Search,
  Filter,
  Eye,
  Pencil,
  Trash2,
  Building,
  Phone,
  Calendar,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Upload,
  UserCheck,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type {
  ClienteModel,
  VendedorCliente,
  StatusCliente,
  TipoContatoCliente,
} from '@/types/clientes'
import {
  podeEditarCliente,
  podeExcluirCliente,
  podeCriarCliente,
  formatarData,
  formatarMoeda,
} from '@/types/clientes'
import ClienteModal from '@/components/clientes/ClienteModal'
import ImportarClientesModal from '@/components/clientes/ImportarClientesModal'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { PaginacaoControles } from '@/components/common/PaginacaoControles'

export default function ClientesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Aba ativa: "todos" ou "reativacao" (conforme pedido: preferir uma aba/segmento dentro do módulo Clientes existente)
  const [abaAtiva, setAbaAtiva] = useState<'todos' | 'reativacao'>('todos')

  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  const [filtroStatusCliente, setFiltroStatusCliente] = useState<string>('todos')
  const [filtroTipoContato, setFiltroTipoContato] = useState<string>('todos')
  const [filtroGrandeCliente, setFiltroGrandeCliente] = useState<string>('todos')

  // Paginação server-side
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(50)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)

  // Modais de Criação / Edição / Exclusão / Importação
  const [modalOpen, setModalOpen] = useState(false)
  const [importarModalOpen, setImportarModalOpen] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<ClienteModel | null>(null)
  const [clienteExcluindo, setClienteExcluindo] = useState<ClienteModel | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [assumindoId, setAssumindoId] = useState<string | null>(null)

  const podeCriar = podeCriarCliente(user)

  // Mapeia vendedor textual para o usuário logado quando ele clica em "Assumir cliente"
  const mapearNomeVendedorUsuario = (): VendedorCliente => {
    if (!user) return 'Alice'
    if (user.perfil === 'vendedor_1') return 'Karoline (Vendas 1)'
    if (user.perfil === 'vendedor_2') return 'Vendas 2'
    if (user.nome?.toLowerCase().includes('renan') || user.email?.includes('renan')) return 'Renan'
    if (user.nome?.toLowerCase().includes('alice') || user.email?.includes('alice')) return 'Alice'
    return 'Karoline (Vendas 1)'
  }

  // Monta a expressão de filtro server-side compatível com PocketBase
  const construirFiltro = useCallback(() => {
    const condicoes: string[] = []

    // Regra da tela "Clientes para Reativação": filtro automático status_cliente = "para_reativacao"
    if (abaAtiva === 'reativacao') {
      condicoes.push("status_cliente = 'para_reativacao'")
    } else {
      if (filtroStatusCliente !== 'todos') {
        condicoes.push(`status_cliente = '${filtroStatusCliente}'`)
      }
    }

    if (filtroVendedor !== 'todos') {
      condicoes.push(`vendedor = '${filtroVendedor}'`)
    }

    if (filtroTipoContato !== 'todos') {
      condicoes.push(`tipo_contato = '${filtroTipoContato}'`)
    }

    if (filtroGrandeCliente === 'sim') {
      condicoes.push("(grande_cliente = 'sim' || grande_cliente = true)")
    } else if (filtroGrandeCliente === 'nao') {
      condicoes.push("(grande_cliente = 'nao' || grande_cliente = false || grande_cliente = null)")
    }

    if (busca.trim()) {
      const termo = busca.trim().replace(/'/g, "\\'")
      condicoes.push(
        `(nome_empresa ~ '${termo}' || nome_contato ~ '${termo}' || cnpj_cpf ~ '${termo}' || cidade ~ '${termo}' || telefone ~ '${termo}' || email ~ '${termo}')`,
      )
    }

    return condicoes.length > 0 ? condicoes.join(' && ') : ''
  }, [abaAtiva, filtroStatusCliente, filtroVendedor, filtroTipoContato, filtroGrandeCliente, busca])

  // Carrega lista de clientes com paginação server-side respeitando ordenação padrão por valor_total_vendas DESC
  // Na aba "reativacao": ordenação por valor_total_vendas decrescente priorizando grandes clientes
  const carregarClientes = useCallback(async () => {
    try {
      setLoading(true)
      const filter = construirFiltro()

      // Ordenação: se aba reativação, prioriza grandes clientes e depois maior valor de vendas
      const sortExpr =
        abaAtiva === 'reativacao'
          ? '-grande_cliente,-valor_total_vendas,-created'
          : '-valor_total_vendas,-created'

      const result = await pb
        .collection('clientes')
        .getList<ClienteModel>(paginaAtual, itensPorPagina, {
          sort: sortExpr,
          filter: filter || undefined,
          requestKey: null,
        })

      setClientes(result.items)
      setTotalRegistros(result.totalItems)
      setTotalPaginas(Math.max(1, result.totalPages))
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar clientes',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para visualizar estes clientes.'
            : 'Não foi possível carregar os clientes. Tente novamente.',
      })
      setClientes([])
      setTotalRegistros(0)
      setTotalPaginas(1)
    } finally {
      setLoading(false)
    }
  }, [paginaAtual, itensPorPagina, construirFiltro])

  // Ao mudar filtros ou abas, voltar à página 1
  useEffect(() => {
    setPaginaAtual(1)
  }, [
    busca,
    filtroVendedor,
    filtroStatusCliente,
    filtroTipoContato,
    filtroGrandeCliente,
    itensPorPagina,
    abaAtiva,
  ])

  // Carregar lista de usuários para seleção de responsáveis
  useEffect(() => {
    async function carregarUsuarios() {
      try {
        const uRecords = await pb.collection('usuarios').getFullList<Usuario>({
          sort: 'nome',
        })
        setUsuarios(uRecords)
      } catch {
        if (user) setUsuarios([user])
      }
    }
    carregarUsuarios()
  }, [user])

  useEffect(() => {
    carregarClientes()
  }, [carregarClientes])

  // Ação "Assumir cliente" para prospectar: atribui o cliente ao vendedor logado e muda status para "ativo"
  const handleAssumirCliente = async (cliente: ClienteModel) => {
    const novoVendedor = mapearNomeVendedorUsuario()
    const hojeStr = new Date().toISOString().substring(0, 10)
    setAssumindoId(cliente.id)
    try {
      await pb.collection('clientes').update(cliente.id, {
        vendedor: novoVendedor,
        status_cliente: 'ativo',
        data_ultima_compra: `${hojeStr} 12:00:00.000Z`,
        responsavel_id: user?.id || null,
        status: 'ativo',
      })

      toast({
        title: 'Cliente assumido com sucesso!',
        description: `O cliente "${cliente.nome_empresa}" foi atribuído a você (${novoVendedor}) e ativado na sua carteira.`,
      })

      carregarClientes()
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erro ao assumir cliente',
        description: getErrorMessage(err) || 'Não foi possível assumir este cliente.',
      })
    } finally {
      setAssumindoId(null)
    }
  }

  // Confirmação de exclusão
  const handleConfirmarExclusao = async () => {
    if (!clienteExcluindo) return
    setExcluindo(true)
    try {
      await pb.collection('clientes').delete(clienteExcluindo.id)
      setClientes((prev) => prev.filter((c) => c.id !== clienteExcluindo.id))
      setTotalRegistros((prev) => Math.max(0, prev - 1))
      toast({
        title: 'Cliente excluído',
        description: `O cliente "${clienteExcluindo.nome_empresa}" foi removido com sucesso.`,
      })
      setClienteExcluindo(null)
      carregarClientes()
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir cliente',
        description: getErrorMessage(err) || 'Ocorreu um erro ao excluir o cliente.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  const abrirNovoCliente = () => {
    setClienteEditando(null)
    setModalOpen(true)
  }

  const abrirEditarCliente = (cliente: ClienteModel) => {
    if (!podeEditarCliente(user, cliente)) {
      toast({
        variant: 'destructive',
        title: 'Acesso negado',
        description: 'Você não pode editar clientes de outros vendedores.',
      })
      return
    }
    setClienteEditando(cliente)
    setModalOpen(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Bar: Título, Descrição e Botões de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-[#16A34A]" />
            Clientes
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Gerencie a carteira comercial de clientes, reativações e contas estratégicas Colesel.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarClientes}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          {/* Botão de Importação CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportarModalOpen(true)}
            className="text-[#0F172A] border-[#CBD5E1] hover:bg-slate-100 flex items-center gap-1.5 font-medium"
          >
            <Upload className="w-4 h-4 text-[#16A34A]" />
            <span>Importar CSV</span>
          </Button>

          {/* Novo Cliente (restrito a ceo_financeiro e coordenador_vendas) */}
          {podeCriar && (
            <Button
              onClick={abrirNovoCliente}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm font-semibold flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Novo Cliente
            </Button>
          )}
        </div>
      </div>

      {/* Segmento de Abas: Todos os Clientes vs Clientes para Reativação */}
      <Tabs
        value={abaAtiva}
        onValueChange={(val) => setAbaAtiva(val as 'todos' | 'reativacao')}
        className="w-full"
      >
        <TabsList className="bg-[#F1F5F9] p-1 border border-[#E2E8F0] rounded-xl grid grid-cols-2 max-w-md">
          <TabsTrigger
            value="todos"
            className="text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-sm"
          >
            Todos os Clientes
          </TabsTrigger>
          <TabsTrigger
            value="reativacao"
            className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Clientes para Reativação
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Banner Informativo na aba Reativação */}
      {abaAtiva === 'reativacao' && (
        <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm text-amber-950">Carteira de Clientes para Reativação</p>
            <p className="mt-0.5 text-amber-800">
              Estes clientes estão liberados para qualquer vendedor prospectar. Estão ordenados pelo{' '}
              <strong>maior valor total de vendas</strong> para priorizar grandes contas. Clique em{' '}
              <strong>&quot;Assumir cliente&quot;</strong> para vinculá-lo à sua carteira e ativá-lo
              imediatamente.
            </p>
          </div>
        </div>
      )}

      {/* Barra de Busca e Filtros */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          {/* Busca por nome */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
            <Input
              type="text"
              placeholder="Buscar por nome da empresa, contato, CNPJ, cidade ou telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 bg-[#F8FAFC] border-[#E2E8F0] focus-visible:bg-white text-sm"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-3 top-2.5 text-xs text-[#64748B] hover:text-[#0F172A]"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Filtro Vendedor */}
          <div className="w-full md:w-48">
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-sm">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                <SelectItem value="Alice">Alice</SelectItem>
                <SelectItem value="Renan">Renan</SelectItem>
                <SelectItem value="Karoline (Vendas 1)">Karoline (Vendas 1)</SelectItem>
                <SelectItem value="Vendas 2">Vendas 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Status (visível apenas na aba 'todos') */}
          {abaAtiva === 'todos' && (
            <div className="w-full md:w-44">
              <Select value={filtroStatusCliente} onValueChange={setFiltroStatusCliente}>
                <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="para_reativacao">Para Reativação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Filtro Tipo de Contato */}
          <div className="w-full md:w-40">
            <Select value={filtroTipoContato} onValueChange={setFiltroTipoContato}>
              <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-sm">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
                <SelectItem value="fornecedor">Fornecedor</SelectItem>
                <SelectItem value="ambos">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Grande Cliente */}
          <div className="w-full md:w-44">
            <Select value={filtroGrandeCliente} onValueChange={setFiltroGrandeCliente}>
              <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-sm">
                <SelectValue placeholder="Porte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os portes</SelectItem>
                <SelectItem value="sim">Grandes Clientes (VIP)</SelectItem>
                <SelectItem value="nao">Clientes Padrão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Contagem / Resumo */}
      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
        <span>
          <strong className="text-[#0F172A]">{totalRegistros}</strong>{' '}
          {totalRegistros === 1 ? 'cliente encontrado' : 'clientes encontrados'}
        </span>
        <span className="italic">
          Ordenação: <strong>Maior Total de Vendas (decrescente)</strong>
        </span>
      </div>

      {/* TABELA DE CLIENTES DESKTOP / MOBILE */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#16A34A] animate-spin" />
            <p className="text-sm font-medium text-[#64748B]">Carregando clientes...</p>
          </div>
        ) : clientes.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#16A34A] flex items-center justify-center border border-emerald-100 shadow-sm">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#0F172A]">
              {busca || filtroVendedor !== 'todos' || filtroGrandeCliente !== 'todos'
                ? 'Nenhum cliente encontrado para os filtros'
                : abaAtiva === 'reativacao'
                  ? 'Nenhum cliente para reativação no momento'
                  : 'Nenhum cliente cadastrado'}
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              {abaAtiva === 'reativacao'
                ? 'Não há clientes marcados com o status "para_reativacao". Quando houver contas inativas prontas para prospecção, elas aparecerão aqui.'
                : 'Importe o arquivo CSV ou cadastre clientes para gerenciar sua carteira comercial.'}
            </p>
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportarModalOpen(true)}
                className="text-xs font-semibold"
              >
                <Upload className="w-3.5 h-3.5 mr-1 text-[#16A34A]" />
                Importar CSV
              </Button>
              {podeCriar && (
                <Button
                  onClick={abrirNovoCliente}
                  className="bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Novo Cliente
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Tabela Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="py-3 px-4">
                      Nome da Empresa / Contato
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Vendedor
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Status
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Total de Vendas
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Última Compra
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Grande Cliente
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {clientes.map((cliente) => {
                    const podeEditar = podeEditarCliente(user, cliente)
                    const podeExcluir = podeExcluirCliente(user, cliente)
                    const isGrande =
                      cliente.grande_cliente === 'sim' || cliente.grande_cliente === true
                    const isParaReativacao = cliente.status_cliente === 'para_reativacao'

                    return (
                      <tr
                        key={cliente.id}
                        className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${
                          isGrande ? 'bg-purple-50/20' : ''
                        }`}
                        onClick={() => navigate(`/clientes/${cliente.id}`)}
                      >
                        {/* Nome da Empresa e Contato */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-[#0F172A] group-hover:text-[#16A34A] transition-colors">
                              {cliente.nome_empresa}
                            </div>
                            {isGrande && (
                              <Badge className="bg-purple-100 text-[#7C3AED] border-purple-200 text-[10px] font-bold px-1.5 py-0">
                                VIP
                              </Badge>
                            )}
                          </div>
                          {cliente.nome_contato &&
                            cliente.nome_contato !== cliente.nome_empresa && (
                              <div className="text-xs text-[#64748B] mt-0.5">
                                Contato: {cliente.nome_contato}
                              </div>
                            )}
                          {cliente.cidade && (
                            <div className="text-[11px] text-[#94A3B8]">
                              {cliente.cidade} {cliente.estado ? `- ${cliente.estado}` : ''}
                            </div>
                          )}
                        </td>

                        {/* Vendedor */}
                        <td className="py-3.5 px-4">
                          <span className="text-xs font-medium text-[#0F172A]">
                            {cliente.vendedor || '-'}
                          </span>
                        </td>

                        {/* Status Cliente */}
                        <td className="py-3.5 px-4">
                          {isParaReativacao ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[11px] font-semibold">
                              Para Reativação
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] font-semibold">
                              Ativo
                            </Badge>
                          )}
                        </td>

                        {/* Valor Total de Vendas */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-semibold text-[#0F172A] text-sm">
                            {formatarMoeda(cliente.valor_total_vendas)}
                          </span>
                        </td>

                        {/* Data da Última Compra */}
                        <td className="py-3.5 px-4 text-xs text-[#64748B]">
                          {cliente.data_ultima_compra ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                              {formatarData(cliente.data_ultima_compra)}
                            </div>
                          ) : (
                            <span className="text-[#94A3B8]">-</span>
                          )}
                        </td>

                        {/* Grande Cliente */}
                        <td className="py-3.5 px-4">
                          {isGrande ? (
                            <Badge className="bg-purple-100 text-[#7C3AED] hover:bg-purple-200 border-purple-200 text-[11px] font-semibold gap-1">
                              <Sparkles className="w-3 h-3 text-[#7C3AED]" />
                              Sim
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-[#64748B] text-[11px]"
                            >
                              Não
                            </Badge>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Botão "Assumir cliente" para prospectar se estiver em reativação */}
                            {isParaReativacao && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-300"
                                disabled={assumindoId === cliente.id}
                                onClick={() => handleAssumirCliente(cliente)}
                                title="Assumir este cliente para sua carteira"
                              >
                                <UserCheck className="w-3.5 h-3.5 mr-1" />
                                {assumindoId === cliente.id ? 'Assumindo...' : 'Assumir'}
                              </Button>
                            )}

                            {/* Ver Detalhes */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50"
                              title="Ver Detalhes"
                              onClick={() => navigate(`/clientes/${cliente.id}`)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            {/* Editar */}
                            {podeEditar && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-[#64748B] hover:text-[#16A34A] hover:bg-emerald-50"
                                title="Editar Cliente"
                                onClick={() => abrirEditarCliente(cliente)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}

                            {/* Excluir */}
                            {podeExcluir && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                                title="Excluir Cliente"
                                onClick={() => setClienteExcluindo(cliente)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Visualização Mobile (Cards) */}
            <div className="block md:hidden divide-y divide-[#E2E8F0]">
              {clientes.map((cliente) => {
                const podeEditar = podeEditarCliente(user, cliente)
                const podeExcluir = podeExcluirCliente(user, cliente)
                const isGrande = cliente.grande_cliente === 'sim' || cliente.grande_cliente === true
                const isParaReativacao = cliente.status_cliente === 'para_reativacao'

                return (
                  <div
                    key={cliente.id}
                    className={`p-4 hover:bg-slate-50 transition-colors space-y-3 cursor-pointer ${
                      isGrande ? 'bg-purple-50/20' : ''
                    }`}
                    onClick={() => navigate(`/clientes/${cliente.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-semibold text-base text-[#0F172A] leading-tight">
                            {cliente.nome_empresa}
                          </h4>
                          {isGrande && (
                            <Badge className="bg-purple-100 text-[#7C3AED] text-[10px] font-bold px-1 py-0">
                              VIP
                            </Badge>
                          )}
                        </div>
                        {cliente.nome_contato && cliente.nome_contato !== cliente.nome_empresa && (
                          <p className="text-xs text-[#64748B] mt-0.5">
                            Contato: {cliente.nome_contato}
                          </p>
                        )}
                      </div>
                      {isParaReativacao ? (
                        <Badge className="bg-amber-100 text-amber-800 text-[10px] font-semibold">
                          Reativação
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                          Ativo
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-[#64748B] pt-1">
                      <div>
                        <span className="text-[11px] block text-[#94A3B8]">Vendedor</span>
                        <strong className="text-[#0F172A]">{cliente.vendedor || '-'}</strong>
                      </div>
                      <div>
                        <span className="text-[11px] block text-[#94A3B8]">Total de Vendas</span>
                        <strong className="text-[#16A34A]">
                          {formatarMoeda(cliente.valor_total_vendas)}
                        </strong>
                      </div>
                    </div>

                    {/* Ações Mobile */}
                    <div
                      className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isParaReativacao && (
                        <Button
                          size="sm"
                          className="h-8 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 border-amber-300"
                          disabled={assumindoId === cliente.id}
                          onClick={() => handleAssumirCliente(cliente)}
                        >
                          <UserCheck className="w-3.5 h-3.5 mr-1" />
                          Assumir
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 text-[#2563EB]"
                        onClick={() => navigate(`/clientes/${cliente.id}`)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Detalhes
                      </Button>
                      {podeEditar && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 text-[#16A34A]"
                          onClick={() => abrirEditarCliente(cliente)}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Editar
                        </Button>
                      )}
                      {podeExcluir && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 text-[#DC2626]"
                          onClick={() => setClienteExcluindo(cliente)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Excluir
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Paginação */}
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

      {/* Modal de Criação / Edição */}
      <ClienteModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        cliente={clienteEditando}
        usuarios={usuarios}
        onSuccess={() => carregarClientes()}
      />

      {/* Modal de Importação de Clientes CSV */}
      <ImportarClientesModal
        open={importarModalOpen}
        onOpenChange={setImportarModalOpen}
        onSuccess={() => carregarClientes()}
      />

      {/* Confirmação de Exclusão */}
      <AlertDialog
        open={Boolean(clienteExcluindo)}
        onOpenChange={(open) => !open && setClienteExcluindo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#0F172A] flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#DC2626]" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#64748B]">
              Tem certeza que deseja excluir o cliente{' '}
              <strong className="text-[#0F172A]">
                &quot;{clienteExcluindo?.nome_empresa}&quot;
              </strong>
              ? Esta ação removerá o registro do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusao}
              disabled={excluindo}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            >
              {excluindo ? 'Excluindo...' : 'Sim, Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
