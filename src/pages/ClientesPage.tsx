import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
  MapPin,
  Calendar,
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
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
import type { ClienteModel } from '@/types/clientes'
import { podeEditarCliente, podeExcluirCliente, formatarData } from '@/types/clientes'
import ClienteModal from '@/components/clientes/ClienteModal'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { PaginacaoControles } from '@/components/common/PaginacaoControles'

export default function ClientesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroGrandeCliente, setFiltroGrandeCliente] = useState<'todos' | 'sim' | 'nao'>('todos')

  // Paginação server-side (limit 50 + offset)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(50)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)

  // Modais de Criação / Edição / Exclusão
  const [modalOpen, setModalOpen] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<ClienteModel | null>(null)
  const [clienteExcluindo, setClienteExcluindo] = useState<ClienteModel | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  // Monta a expressão de filtro server-side compatível com o PocketBase
  const construirFiltro = useCallback(() => {
    const condicoes: string[] = []

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
  }, [busca, filtroGrandeCliente])

  // Carrega lista de clientes com paginação server-side respeitando a RLS
  const carregarClientes = useCallback(async () => {
    try {
      setLoading(true)
      const filter = construirFiltro()
      const result = await pb
        .collection('clientes')
        .getList<ClienteModel>(paginaAtual, itensPorPagina, {
          sort: '-created',
          expand: 'responsavel_id',
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
            ? 'Você não tem permissão para visualizar a lista de clientes.'
            : 'Não foi possível carregar os clientes. Tente novamente.',
      })
      setClientes([])
      setTotalRegistros(0)
      setTotalPaginas(1)
    } finally {
      setLoading(false)
    }
  }, [paginaAtual, itensPorPagina, construirFiltro])

  // Ao mudar filtros, voltar à página 1
  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtroGrandeCliente, itensPorPagina])

  // Carrega lista de usuários para exibir no seletor de responsáveis (apenas ceo e coordenador)
  useEffect(() => {
    async function carregarUsuarios() {
      try {
        const uRecords = await pb.collection('usuarios').getFullList<Usuario>({
          sort: 'nome',
        })
        setUsuarios(uRecords)
      } catch {
        // Se a RLS restringir a listagem de usuários, mantém apenas o usuário logado
        if (user) {
          setUsuarios([user])
        }
      }
    }
    carregarUsuarios()
  }, [user])

  // Recarregar clientes quando os parâmetros de paginação/filtro mudam
  useEffect(() => {
    carregarClientes()
  }, [carregarClientes])

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
        description: `O cliente "${clienteExcluindo.nome_contato}" foi removido com sucesso.`,
      })
      setClienteExcluindo(null)
      // Se era o último da página e não for página 1, volta uma página
      if (clientes.length === 1 && paginaAtual > 1) {
        setPaginaAtual((p) => p - 1)
      } else {
        carregarClientes()
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir cliente',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para excluir este cliente.'
            : msg || 'Ocorreu um erro ao excluir o cliente.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  // Os clientes já vêm paginados e filtrados do backend (server-side)
  const clientesFiltrados = clientes

  const abrirNovoCliente = () => {
    setClienteEditando(null)
    setModalOpen(true)
  }

  const abrirEditarCliente = (cliente: ClienteModel) => {
    setClienteEditando(cliente)
    setModalOpen(true)
  }

  const handleClienteSalvo = (_clienteSalvo: ClienteModel) => {
    carregarClientes()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Bar: Título, Descrição e Botão Novo Cliente */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-[#16A34A]" />
            Clientes
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Gerencie sua carteira de contatos, empresas parceiras e contas estratégicas.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          <Button
            onClick={abrirNovoCliente}
            className="bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm font-semibold flex items-center gap-2"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Campo de Busca */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <Input
            type="text"
            placeholder="Buscar por contato, empresa, telefone ou cidade..."
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

        {/* Filtro Grande Cliente */}
        <div className="flex items-center gap-2 min-w-[220px]">
          <Filter className="w-4 h-4 text-[#64748B] flex-shrink-0" />
          <Select
            value={filtroGrandeCliente}
            onValueChange={(val: 'todos' | 'sim' | 'nao') => setFiltroGrandeCliente(val)}
          >
            <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-sm">
              <SelectValue placeholder="Filtrar por porte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os portes</SelectItem>
              <SelectItem value="sim">Grandes Clientes (VIP)</SelectItem>
              <SelectItem value="nao">Clientes Padrão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contagem / Resumo no topo */}
      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
        <span>
          <strong className="text-[#0F172A]">{totalRegistros}</strong>{' '}
          {totalRegistros === 1 ? 'registro encontrado' : 'registros encontrados'}
        </span>
        {busca && <span className="italic">Filtro ativo: &quot;{busca}&quot;</span>}
      </div>

      {/* Tabela de Clientes Desktop / Cards Mobile */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#16A34A] animate-spin" />
            <p className="text-sm font-medium text-[#64748B]">Carregando clientes...</p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          /* Estado Vazio */
          <div className="p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#16A34A] flex items-center justify-center border border-emerald-100 shadow-sm">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#0F172A]">
              {busca || filtroGrandeCliente !== 'todos'
                ? 'Nenhum cliente encontrado'
                : 'Nenhum cliente cadastrado'}
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              {busca || filtroGrandeCliente !== 'todos'
                ? 'Nenhum cliente corresponde aos filtros aplicados. Tente ajustar o termo de busca ou limpar os filtros.'
                : 'Sua base de clientes ainda está vazia. Comece cadastrando o primeiro cliente para gerenciar oportunidades e tarefas.'}
            </p>
            {busca || filtroGrandeCliente !== 'todos' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBusca('')
                  setFiltroGrandeCliente('todos')
                }}
              >
                Limpar filtros
              </Button>
            ) : (
              <Button
                onClick={abrirNovoCliente}
                className="bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold mt-2"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Cadastrar Primeiro Cliente
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Tabela para Desktop e Telas Médias */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="py-3 px-4">
                      Contato / Empresa
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Telefone
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Cidade
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Responsável
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Porte
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Última Compra
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {clientesFiltrados.map((cliente) => {
                    const podeEditar = podeEditarCliente(user, cliente)
                    const podeExcluir = podeExcluirCliente(user, cliente)
                    const responsavelNome =
                      cliente.expand?.responsavel_id?.nome ||
                      usuarios.find((u) => u.id === cliente.responsavel_id)?.nome ||
                      '-'

                    return (
                      <tr
                        key={cliente.id}
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        onClick={() => navigate(`/clientes/${cliente.id}`)}
                      >
                        {/* Contato e Empresa */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#0F172A] group-hover:text-[#16A34A] transition-colors">
                            {cliente.nome_contato}
                          </div>
                          {cliente.nome_empresa && (
                            <div className="text-xs text-[#64748B] flex items-center gap-1 mt-0.5">
                              <Building className="w-3 h-3 text-[#94A3B8]" />
                              <span>{cliente.nome_empresa}</span>
                            </div>
                          )}
                        </td>

                        {/* Telefone */}
                        <td className="py-3.5 px-4 text-[#0F172A]">
                          {cliente.telefone ? (
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                              <Phone className="w-3.5 h-3.5 text-[#16A34A]" />
                              {cliente.telefone}
                            </div>
                          ) : (
                            <span className="text-xs text-[#94A3B8]">-</span>
                          )}
                        </td>

                        {/* Cidade */}
                        <td className="py-3.5 px-4 text-[#0F172A]">
                          {cliente.cidade ? (
                            <div className="flex items-center gap-1 text-xs">
                              <MapPin className="w-3.5 h-3.5 text-[#64748B]" />
                              <span>{cliente.cidade}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-[#94A3B8]">-</span>
                          )}
                        </td>

                        {/* Responsável */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                              {responsavelNome.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-[#0F172A] truncate max-w-[140px]">
                              {responsavelNome}
                            </span>
                          </div>
                        </td>

                        {/* Porte / Grande Cliente */}
                        <td className="py-3.5 px-4">
                          {cliente.grande_cliente ? (
                            <Badge className="bg-purple-100 text-[#7C3AED] hover:bg-purple-200 border-purple-200 text-[11px] font-semibold gap-1">
                              <Sparkles className="w-3 h-3 text-[#7C3AED]" />
                              Grande Cliente
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-[#64748B] border-slate-200 text-[11px]"
                            >
                              Padrão
                            </Badge>
                          )}
                        </td>

                        {/* Última Compra */}
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

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {/* Ver Detalhes */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50"
                              title="Ver Visão 360°"
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

            {/* Visualização em Cartões para Mobile */}
            <div className="block md:hidden divide-y divide-[#E2E8F0]">
              {clientesFiltrados.map((cliente) => {
                const podeEditar = podeEditarCliente(user, cliente)
                const podeExcluir = podeExcluirCliente(user, cliente)
                const responsavelNome =
                  cliente.expand?.responsavel_id?.nome ||
                  usuarios.find((u) => u.id === cliente.responsavel_id)?.nome ||
                  '-'

                return (
                  <div
                    key={cliente.id}
                    className="p-4 hover:bg-slate-50 transition-colors space-y-3 cursor-pointer"
                    onClick={() => navigate(`/clientes/${cliente.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-base text-[#0F172A] leading-tight">
                          {cliente.nome_contato}
                        </h4>
                        {cliente.nome_empresa && (
                          <p className="text-xs text-[#64748B] flex items-center gap-1 mt-0.5">
                            <Building className="w-3.5 h-3.5 text-[#94A3B8]" />
                            {cliente.nome_empresa}
                          </p>
                        )}
                      </div>
                      {cliente.grande_cliente ? (
                        <Badge className="bg-purple-100 text-[#7C3AED] border-purple-200 text-[10px] font-semibold gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          Grande Cliente
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-[#64748B] text-[10px]"
                        >
                          Padrão
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-[#64748B]">
                      {cliente.telefone && (
                        <div className="flex items-center gap-1 truncate">
                          <Phone className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" />
                          <span className="font-mono truncate">{cliente.telefone}</span>
                        </div>
                      )}
                      {cliente.cidade && (
                        <div className="flex items-center gap-1 truncate">
                          <MapPin className="w-3.5 h-3.5 text-[#64748B] flex-shrink-0" />
                          <span className="truncate">{cliente.cidade}</span>
                        </div>
                      )}
                      <div className="col-span-2 flex items-center justify-between pt-1 border-t border-[#F1F5F9]">
                        <span className="text-[11px] text-[#64748B]">
                          Resp.: <strong>{responsavelNome}</strong>
                        </span>
                        {cliente.data_ultima_compra && (
                          <span className="text-[11px] text-[#64748B]">
                            Última compra: {formatarData(cliente.data_ultima_compra)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações do Card */}
                    <div
                      className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 text-[#2563EB] hover:bg-blue-50"
                        onClick={() => navigate(`/clientes/${cliente.id}`)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Ver Visão 360°
                      </Button>
                      {podeEditar && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 text-[#16A34A] hover:bg-emerald-50"
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
                          className="text-xs h-8 text-[#DC2626] hover:bg-red-50"
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

            {/* Rodapé da tabela com controles de navegação e seletor 25, 50, 100 */}
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

      {/* Modal de Cadastro / Edição */}
      <ClienteModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        cliente={clienteEditando}
        usuarios={usuarios}
        onSuccess={handleClienteSalvo}
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
                &quot;{clienteExcluindo?.nome_contato}&quot;
              </strong>
              ? Esta ação não pode ser desfeita e removerá os dados do cliente no sistema.
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
