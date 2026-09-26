import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Building,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Sparkles,
  MessageCircle,
  FileText,
  User,
  Pencil,
  Trash2,
  TrendingUp,
  CheckSquare,
  MessageSquare,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import AbaOportunidades from '@/components/clientes/AbaOportunidades'
import AbaTarefas from '@/components/clientes/AbaTarefas'
import AbaLigacoes from '@/components/clientes/AbaLigacoes'
import AbaMensagens from '@/components/clientes/AbaMensagens'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function ClienteDetalhesPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [cliente, setCliente] = useState<ClienteModel | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [modalEditOpen, setModalEditOpen] = useState(false)
  const [excluindoDialogOpen, setExcluindoDialogOpen] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [activeTab, setActiveTab] = useState('oportunidades')

  const carregarCliente = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      const record = await pb.collection('clientes').getOne<ClienteModel>(id, {
        expand: 'responsavel_id',
      })
      setCliente(record)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Cliente não encontrado',
        description: msg.includes('404')
          ? 'O cliente solicitado não existe ou foi removido.'
          : msg.includes('403')
            ? 'Você não tem permissão para visualizar este cliente.'
            : 'Não foi possível carregar os dados do cliente.',
      })
      navigate('/clientes', { replace: true })
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

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
    carregarCliente()
  }, [user, carregarCliente])

  const handleExcluirCliente = async () => {
    if (!cliente) return
    setExcluindo(true)
    try {
      await pb.collection('clientes').delete(cliente.id)
      toast({
        title: 'Cliente excluído',
        description: `O cliente "${cliente.nome_contato}" foi removido com sucesso.`,
      })
      navigate('/clientes', { replace: true })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir cliente',
        description: msg.includes('403')
          ? 'Você não tem permissão para excluir este cliente.'
          : 'Ocorreu um erro ao excluir o cliente.',
      })
    } finally {
      setExcluindo(false)
      setExcluindoDialogOpen(false)
    }
  }

  const podeEditar = cliente ? podeEditarCliente(user, cliente) : false
  const podeExcluir = cliente ? podeExcluirCliente(user, cliente) : false
  const responsavelNome =
    cliente?.expand?.responsavel_id?.nome ||
    usuarios.find((u) => u.id === cliente?.responsavel_id)?.nome ||
    'Não atribuído'

  if (loading) {
    return (
      <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#16A34A] animate-spin" />
        <p className="text-sm font-medium text-[#64748B]">Carregando Visão 360° do cliente...</p>
      </div>
    )
  }

  if (!cliente) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Botão Voltar */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/clientes')}
          className="text-[#64748B] hover:text-[#0F172A] -ml-2 gap-1 text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Lista de Clientes
        </Button>
      </div>

      {/* CABEÇALHO VISÃO 360° DO CLIENTE */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-6 border-b border-[#E2E8F0]">
          {/* Avatar + Nome + Tags */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#2563EB] text-white font-extrabold text-xl flex items-center justify-center shadow-md flex-shrink-0">
              {cliente.nome_contato.charAt(0).toUpperCase()}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
                  {cliente.nome_contato}
                </h1>
                {cliente.grande_cliente && (
                  <Badge className="bg-purple-100 text-[#7C3AED] border-purple-200 text-xs font-semibold gap-1">
                    <Sparkles className="w-3 h-3 text-[#7C3AED]" />
                    Grande Cliente (VIP)
                  </Badge>
                )}
                {cliente.aceita_mensagens ? (
                  <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs gap-1">
                    <MessageCircle className="w-3 h-3" />
                    Aceita Mensagens
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500 border-slate-300 text-xs">
                    Não aceita mensagens
                  </Badge>
                )}
              </div>

              {cliente.nome_empresa && (
                <div className="flex items-center gap-1.5 text-sm font-medium text-[#64748B]">
                  <Building className="w-4 h-4 text-[#94A3B8]" />
                  <span>{cliente.nome_empresa}</span>
                </div>
              )}
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-2 self-start">
            {podeEditar && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalEditOpen(true)}
                className="text-[#16A34A] hover:bg-emerald-50 border-emerald-200 font-semibold text-xs"
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Editar Dados
              </Button>
            )}
            {podeExcluir && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExcluindoDialogOpen(true)}
                className="text-[#DC2626] hover:bg-red-50 border-red-200 font-semibold text-xs"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Excluir
              </Button>
            )}
          </div>
        </div>

        {/* Informações detalhadas de contato e cadastro em grade */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Telefone */}
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[#64748B] flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-[#16A34A]" />
              Telefone / WhatsApp
            </span>
            <p className="font-semibold text-[#0F172A] font-mono text-sm">
              {cliente.telefone || 'Não informado'}
            </p>
          </div>

          {/* E-mail */}
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[#64748B] flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
              E-mail
            </span>
            <p className="font-semibold text-[#0F172A] truncate text-sm">
              {cliente.email || 'Não informado'}
            </p>
          </div>

          {/* Cidade */}
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[#64748B] flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#7C3AED]" />
              Cidade / UF
            </span>
            <p className="font-semibold text-[#0F172A] text-sm">
              {cliente.cidade || 'Não informada'}
            </p>
          </div>

          {/* Responsável Comercial */}
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
            <span className="text-[#64748B] flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-[#0F172A]" />
              Responsável Comercial
            </span>
            <p className="font-semibold text-[#0F172A] text-sm truncate">{responsavelNome}</p>
          </div>
        </div>

        {/* Segunda Linha de Metadados: CNPJ, Nascimento, Última Compra */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#64748B] pt-1 border-t border-[#F1F5F9]">
          {cliente.cnpj_cpf && (
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[#94A3B8]" />
              CNPJ/CPF: <strong className="text-[#0F172A]">{cliente.cnpj_cpf}</strong>
            </span>
          )}
          {cliente.data_nascimento && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
              Nasc./Fundação:{' '}
              <strong className="text-[#0F172A]">{formatarData(cliente.data_nascimento)}</strong>
            </span>
          )}
          {cliente.data_ultima_compra && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
              Última Compra:{' '}
              <strong className="text-[#0F172A]">{formatarData(cliente.data_ultima_compra)}</strong>
            </span>
          )}
          {cliente.created && (
            <span className="text-[11px] text-[#94A3B8] ml-auto">
              Cadastrado em {formatarData(cliente.created)}
            </span>
          )}
        </div>

        {/* Observações do Cliente */}
        {cliente.observacoes && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-[#0F172A] space-y-1">
            <span className="font-semibold text-[#64748B] block uppercase tracking-wider text-[10px]">
              Observações Comerciais
            </span>
            <p className="whitespace-pre-wrap">{cliente.observacoes}</p>
          </div>
        )}
      </div>

      {/* ABAS DA VISÃO 360° */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-4 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 bg-[#F8FAFC] p-1 border border-[#E2E8F0] rounded-xl mb-6">
            <TabsTrigger
              value="oportunidades"
              className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm"
            >
              <TrendingUp className="w-4 h-4 text-[#2563EB]" />
              Oportunidades
            </TabsTrigger>

            <TabsTrigger
              value="tarefas"
              className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#16A34A] data-[state=active]:shadow-sm"
            >
              <CheckSquare className="w-4 h-4 text-[#16A34A]" />
              Tarefas
            </TabsTrigger>

            <TabsTrigger
              value="ligacoes"
              className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm"
            >
              <Phone className="w-4 h-4 text-[#7C3AED]" />
              Ligações
            </TabsTrigger>

            <TabsTrigger
              value="mensagens"
              className="text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm"
            >
              <MessageSquare className="w-4 h-4 text-emerald-700" />
              Mensagens
            </TabsTrigger>
          </TabsList>

          {/* Aba Oportunidades */}
          <TabsContent value="oportunidades" className="outline-none">
            <AbaOportunidades clienteId={cliente.id} />
          </TabsContent>

          {/* Aba Tarefas */}
          <TabsContent value="tarefas" className="outline-none">
            <AbaTarefas clienteId={cliente.id} />
          </TabsContent>

          {/* Aba Ligações */}
          <TabsContent value="ligacoes" className="outline-none">
            <AbaLigacoes clienteId={cliente.id} />
          </TabsContent>

          {/* Aba Mensagens */}
          <TabsContent value="mensagens" className="outline-none">
            <AbaMensagens
              clienteId={cliente.id}
              aceitaMensagens={cliente.aceita_mensagens !== false}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal de Edição */}
      <ClienteModal
        open={modalEditOpen}
        onOpenChange={setModalEditOpen}
        cliente={cliente}
        usuarios={usuarios}
        onSuccess={(updated) => setCliente(updated)}
      />

      {/* Confirmação de Exclusão */}
      <AlertDialog open={excluindoDialogOpen} onOpenChange={setExcluindoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#0F172A] flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#DC2626]" />
              Confirmar Exclusão do Cliente
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#64748B]">
              Tem certeza que deseja excluir o cliente{' '}
              <strong className="text-[#0F172A]">&quot;{cliente.nome_contato}&quot;</strong>? Esta
              ação removerá o cadastro do cliente e não poderá ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluirCliente}
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
