import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Users,
  UserPlus,
  Lock,
  Search,
  Filter,
  Pencil,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  AlertTriangle,
  Mail,
  Shield,
  Calendar,
  Check,
  Copy,
  KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth, type PerfilUsuario, type Usuario } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { PaginacaoControles } from '@/components/common/PaginacaoControles'

// Lista de perfis com rótulos e cores solicitadas
export const PERFIS_CONFIG: Record<PerfilUsuario, { label: string; badgeClass: string }> = {
  ceo_financeiro: {
    label: 'CEO / Financeiro',
    badgeClass: 'bg-purple-100 text-[#7C3AED] border-purple-200 font-semibold',
  },
  coordenador_vendas: {
    label: 'Coordenador de Vendas',
    badgeClass: 'bg-blue-100 text-[#2563EB] border-blue-200 font-semibold',
  },
  vendedor_1: {
    label: 'Vendedor 1',
    badgeClass: 'bg-emerald-100 text-[#16A34A] border-emerald-200 font-semibold',
  },
  vendedor_2: {
    label: 'Vendedor 2',
    badgeClass: 'bg-green-50 text-emerald-600 border-green-200 font-semibold',
  },
  compras_grandes_clientes: {
    label: 'Compras / Grandes Clientes',
    badgeClass: 'bg-orange-100 text-orange-700 border-orange-200 font-semibold',
  },
  estoque: {
    label: 'Estoque',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 font-semibold',
  },
}

function formatarDataCriacao(isoString?: string): string {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '-'
  }
}

export default function UsuariosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isCeoFinanceiro = user?.perfil === 'ceo_financeiro'

  // Estados principais
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroPerfil, setFiltroPerfil] = useState<string>('todos')

  // Paginação client-side (padrão 50 por página)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(50)

  // Controle do modal de formulário (criar / editar)
  const [modalOpen, setModalOpen] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPerfil, setFormPerfil] = useState<PerfilUsuario>('vendedor_1')
  const [formAtivo, setFormAtivo] = useState(true)
  const [formPassword, setFormPassword] = useState('')
  const [formPasswordConfirm, setFormPasswordConfirm] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [formErros, setFormErros] = useState<{
    nome?: string
    email?: string
    perfil?: string
    password?: string
    passwordConfirm?: string
  }>({})

  // Controle de alternância de status rápido (toggle)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Controle de exclusão com confirmação
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [usuarioParaExcluir, setUsuarioParaExcluir] = useState<Usuario | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  // Controle de exibição da senha gerada (exibida apenas uma vez)
  const [modalSenhaOpen, setModalSenhaOpen] = useState(false)
  const [dadosNovoUsuario, setDadosNovoUsuario] = useState<{
    nome: string
    email: string
    perfil: string
    senha_gerada: string
  } | null>(null)
  const [senhaCopiada, setSenhaCopiada] = useState(false)

  // Voltar (mesmo padrão da Importação: navigate(-1) com fallback)
  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/painel')
    }
  }

  // Carregar lista de usuários da tabela "usuarios"
  const carregarUsuarios = async () => {
    setLoading(true)
    try {
      const records = await pb.collection('usuarios').getFullList<Usuario>({
        sort: 'nome',
        requestKey: null,
      })
      setUsuarios(records)
      return records
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar usuários',
        description: msg || 'Não foi possível carregar a lista de usuários.',
      })
      return []
    } finally {
      setLoading(false)
    }
  }

  // Carregar lista de usuários da tela
  useEffect(() => {
    if (isCeoFinanceiro) {
      carregarUsuarios()
    }
  }, [isCeoFinanceiro])

  // Filtragem em tempo real por nome/email e perfil (Hook no topo, incondicional)
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      if (filtroPerfil !== 'todos' && u.perfil !== filtroPerfil) {
        return false
      }
      if (!busca.trim()) return true
      const termo = busca.toLowerCase().trim()
      const matchNome = (u.nome || '').toLowerCase().includes(termo)
      const matchEmail = (u.email || '').toLowerCase().includes(termo)
      return matchNome || matchEmail
    })
  }, [usuarios, busca, filtroPerfil])

  // Resetar página atual para 1 sempre que os filtros mudarem
  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtroPerfil, itensPorPagina])

  const totalPaginas = Math.max(1, Math.ceil(usuariosFiltrados.length / itensPorPagina))
  const usuariosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina
    return usuariosFiltrados.slice(inicio, inicio + itensPorPagina)
  }, [usuariosFiltrados, paginaAtual, itensPorPagina])

  // Se NÃO for ceo_financeiro, exibe o aviso "Acesso restrito" com ícone de cadeado
  if (!isCeoFinanceiro) {
    return (
      <div className="space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleVoltar}
            className="text-[#64748B] hover:text-[#0F172A] -ml-2 mb-2 gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </div>

        <div className="py-16 px-4 max-w-lg mx-auto text-center animate-fade-in">
          <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[#0F172A]">Acesso restrito</h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                A gestão e cadastro de usuários é restrita exclusivamente ao perfil{' '}
                <strong>CEO / Diretor Financeiro</strong>.
              </p>
            </div>
            <div className="pt-2">
              <Badge
                variant="outline"
                className="text-xs text-amber-700 bg-amber-50/50 border-amber-200"
              >
                Permissão requerida: ceo_financeiro
              </Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Abertura do modal para Novo Usuário
  const handleNovoUsuario = () => {
    setUsuarioEditando(null)
    setFormNome('')
    setFormEmail('')
    setFormPerfil('vendedor_1')
    setFormAtivo(true)
    setFormPassword('')
    setFormPasswordConfirm('')
    setFormErros({})
    setModalOpen(true)
  }

  // Abertura do modal para Editar Usuário
  const handleEditarUsuario = (u: Usuario) => {
    // Regra: Não permita editar o próprio usuário logado
    if (u.id === user?.id) {
      toast({
        variant: 'destructive',
        title: 'Operação não permitida',
        description: 'Você não pode editar seu próprio usuário.',
      })
      return
    }

    setUsuarioEditando(u)
    setFormNome(u.nome || '')
    setFormEmail(u.email || '')
    setFormPerfil(u.perfil || 'vendedor_1')
    setFormAtivo(u.ativo !== false)
    setFormPassword('')
    setFormPasswordConfirm('')
    setFormErros({})
    setModalOpen(true)
  }

  // Validação amigável do formulário
  const validarFormulario = (): boolean => {
    const erros: {
      nome?: string
      email?: string
      perfil?: string
      password?: string
      passwordConfirm?: string
    } = {}

    if (!formNome.trim()) {
      erros.nome = 'O nome é obrigatório.'
    }

    const emailTrim = formEmail.trim()
    if (!emailTrim) {
      erros.email = 'O e-mail é obrigatório.'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(emailTrim)) {
        erros.email = 'Informe um endereço de e-mail válido (ex: nome@empresa.com).'
      }
    }

    if (!formPerfil) {
      erros.perfil = 'Selecione um perfil de acesso.'
    }

    if (usuarioEditando && (formPassword || formPasswordConfirm)) {
      if (formPassword.length < 8) {
        erros.password = 'A nova senha deve ter no mínimo 8 caracteres.'
      }
      if (formPassword !== formPasswordConfirm) {
        erros.passwordConfirm = 'A confirmação de senha não confere.'
      }
    }

    setFormErros(erros)
    return Object.keys(erros).length === 0
  }

  // Salvar registro (Criar ou Atualizar)
  const handleSalvarUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validarFormulario()) return

    const emailNormalizado = formEmail.trim().toLowerCase()

    // Validação de duplicidade de email local antes de enviar
    const emailJaExiste = usuarios.some(
      (u) => u.email?.toLowerCase().trim() === emailNormalizado && u.id !== usuarioEditando?.id,
    )

    if (emailJaExiste) {
      setFormErros((prev) => ({
        ...prev,
        email: 'Email já cadastrado',
      }))
      toast({
        variant: 'destructive',
        title: 'Email já cadastrado',
        description: 'Já existe um usuário cadastrado com este endereço de e-mail.',
      })
      return
    }

    setSalvando(true)
    try {
      if (usuarioEditando) {
        // Atualização de usuário existente
        const payload: Record<string, unknown> = {
          nome: formNome.trim(),
          email: formEmail.trim(),
          perfil: formPerfil,
          ativo: formAtivo,
          password: formPassword,
          passwordConfirm: formPasswordConfirm,
        }

        // Se password e passwordConfirm estiverem vazios (string vazia ou nula), remove do payload
        const senhaLimpa = typeof payload.password === 'string' ? payload.password.trim() : ''
        const confirmLimpa =
          typeof payload.passwordConfirm === 'string' ? payload.passwordConfirm.trim() : ''

        if (!senhaLimpa && !confirmLimpa) {
          delete payload.password
          delete payload.passwordConfirm
        }

        const atualizado = await pb
          .collection('usuarios')
          .update<Usuario>(usuarioEditando.id, payload, { requestKey: null })

        // Recarrega a lista do servidor para refletir o estado real do banco
        await carregarUsuarios()

        toast({
          title: 'Usuário atualizado',
          description: `Os dados de "${atualizado.nome}" foram atualizados com sucesso.`,
        })
      } else {
        // Criação de novo usuário via rota de backend segura /backend/v1/criar_usuario
        const response = await pb.send<{
          success: boolean
          usuario: Usuario
          senha_gerada: string
        }>('/backend/v1/criar_usuario', {
          method: 'POST',
          body: {
            nome: formNome.trim(),
            email: formEmail.trim(),
            perfil: formPerfil,
            ativo: formAtivo,
          },
        })

        const criado = response.usuario
        setUsuarios((prev) => [criado, ...prev].sort((a, b) => a.nome.localeCompare(b.nome)))

        toast({
          title: 'Usuário cadastrado com sucesso',
          description: `O usuário "${criado.nome}" foi registrado no sistema.`,
        })

        // Guardar os dados temporariamente para exibir a senha gerada uma única vez
        setDadosNovoUsuario({
          nome: criado.nome,
          email: criado.email,
          perfil: PERFIS_CONFIG[criado.perfil]?.label || criado.perfil,
          senha_gerada: response.senha_gerada,
        })
        setSenhaCopiada(false)
        setModalSenhaOpen(true)
      }

      setModalOpen(false)
      setUsuarioEditando(null)
      setFormPassword('')
      setFormPasswordConfirm('')
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      const errLower = (msg || '').toLowerCase()

      if (
        errLower.includes('unique') ||
        errLower.includes('email') ||
        errLower.includes('already exists')
      ) {
        setFormErros((prev) => ({
          ...prev,
          email: 'Email já cadastrado',
        }))
        toast({
          variant: 'destructive',
          title: 'Email já cadastrado',
          description: 'Já existe um usuário cadastrado com este e-mail no sistema.',
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar usuário',
          description: msg || 'Ocorreu um erro ao gravar as informações no banco.',
        })
      }
    } finally {
      setSalvando(false)
    }
  }

  // Toggle rápido de status (Ativar / Desativar)
  const handleToggleAtivo = async (u: Usuario) => {
    // Regra: Não permita desativar o próprio usuário logado
    if (u.id === user?.id) {
      toast({
        variant: 'destructive',
        title: 'Operação não permitida',
        description: 'Você não pode desativar seu próprio usuário.',
      })
      return
    }

    setTogglingId(u.id)
    try {
      const novoStatus = !u.ativo
      const atualizado = await pb
        .collection('usuarios')
        .update<Usuario>(u.id, { ativo: novoStatus }, { requestKey: null })

      setUsuarios((prev) => prev.map((item) => (item.id === u.id ? atualizado : item)))

      toast({
        title: novoStatus ? 'Usuário ativado' : 'Usuário desativado',
        description: `O usuário "${u.nome}" foi ${novoStatus ? 'ativado' : 'desativado'}.`,
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar status',
        description: msg || 'Não foi possível alterar o status do usuário.',
      })
    } finally {
      setTogglingId(null)
    }
  }

  // Abertura da confirmação de exclusão
  const handleSolicitarExclusao = (u: Usuario) => {
    // Regra: Não permita excluir o próprio usuário logado
    if (u.id === user?.id) {
      toast({
        variant: 'destructive',
        title: 'Operação não permitida',
        description: 'Você não pode excluir seu próprio usuário.',
      })
      return
    }

    setUsuarioParaExcluir(u)
    setDeleteConfirmOpen(true)
  }

  // Confirmação de exclusão
  const handleConfirmarExclusao = async () => {
    if (!usuarioParaExcluir) return
    setExcluindo(true)
    try {
      await pb.collection('usuarios').delete(usuarioParaExcluir.id, { requestKey: null })

      setUsuarios((prev) => prev.filter((u) => u.id !== usuarioParaExcluir.id))

      toast({
        title: 'Usuário excluído',
        description: `O usuário "${usuarioParaExcluir.nome}" foi excluído com sucesso.`,
      })

      setDeleteConfirmOpen(false)
      setUsuarioParaExcluir(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir usuário',
        description:
          msg.includes('403') || msg.includes('permissão')
            ? 'Você não tem permissão para excluir este usuário.'
            : msg || 'Não foi possível excluir o usuário.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Topo com Botão Voltar e Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleVoltar}
              className="text-[#64748B] hover:text-[#0F172A] gap-1.5 h-8 px-2.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </Button>
            <Badge
              variant="outline"
              className="bg-purple-50 text-[#7C3AED] border-purple-200 text-xs font-semibold gap-1"
            >
              <Shield className="w-3 h-3" />
              Administração de Acesso
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#16A34A]" />
            Gestão de Usuários
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Cadastre, edite perfis de acesso e gerencie o status dos colaboradores no CRM Colesel
            45.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarUsuarios}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A] h-9"
            title="Recarregar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          <Button
            onClick={handleNovoUsuario}
            className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs sm:text-sm h-9 shadow-sm gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            Novo Usuário
          </Button>
        </div>
      </div>

      {/* Barra de Filtros e Busca em Tempo Real */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Campo de Busca por nome ou email */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <Input
            type="text"
            placeholder="Buscar por nome ou e-mail em tempo real..."
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

        {/* Filtro por Perfil */}
        <div className="flex items-center gap-2 min-w-[220px]">
          <Filter className="w-4 h-4 text-[#64748B] flex-shrink-0" />
          <Select value={filtroPerfil} onValueChange={(val: string) => setFiltroPerfil(val)}>
            <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-sm">
              <SelectValue placeholder="Filtrar por perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os perfis</SelectItem>
              <SelectItem value="ceo_financeiro">CEO / Financeiro</SelectItem>
              <SelectItem value="coordenador_vendas">Coordenador de Vendas</SelectItem>
              <SelectItem value="vendedor_1">Vendedor 1</SelectItem>
              <SelectItem value="vendedor_2">Vendedor 2</SelectItem>
              <SelectItem value="compras_grandes_clientes">Compras / Grandes Clientes</SelectItem>
              <SelectItem value="estoque">Estoque</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contagem / Resumo */}
      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
        <span>
          <strong className="text-[#0F172A]">{usuariosFiltrados.length}</strong>{' '}
          {usuariosFiltrados.length === 1 ? 'registro encontrado' : 'registros encontrados'} (
          Mostrando {usuariosPaginados.length} de {usuariosFiltrados.length} usuários
          {usuariosFiltrados.length !== usuarios.length && ` filtrados de ${usuarios.length}`})
        </span>
        {(busca || filtroPerfil !== 'todos') && (
          <span className="italic">Filtros aplicados em tempo real</span>
        )}
      </div>

      {/* Tabela de Usuários Desktop & Cards Mobile */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#16A34A] animate-spin" />
            <p className="text-sm font-medium text-[#64748B]">Carregando usuários...</p>
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#16A34A] flex items-center justify-center border border-emerald-100 shadow-sm">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#0F172A]">
              {busca || filtroPerfil !== 'todos'
                ? 'Nenhum usuário encontrado'
                : 'Nenhum usuário cadastrado'}
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              {busca || filtroPerfil !== 'todos'
                ? 'Nenhum usuário corresponde aos critérios de busca ou filtro selecionados. Tente ajustar o termo de pesquisa.'
                : 'Não há registros de colaboradores na base. Clique no botão abaixo para adicionar o primeiro usuário.'}
            </p>
            {busca || filtroPerfil !== 'todos' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBusca('')
                  setFiltroPerfil('todos')
                }}
              >
                Limpar filtros
              </Button>
            ) : (
              <Button
                onClick={handleNovoUsuario}
                className="bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold mt-2"
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Cadastrar Primeiro Usuário
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Tabela Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#F8FAFC]">
                  <TableRow>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">Nome</TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">E-mail</TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">Perfil</TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">Status</TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">
                      Data de Criação
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A] text-right">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E2E8F0]">
                  {usuariosPaginados.map((u) => {
                    const isSelf = u.id === user?.id
                    const perfilInfo = PERFIS_CONFIG[u.perfil] || {
                      label: u.perfil,
                      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
                    }
                    const isAtivo = u.ativo !== false

                    return (
                      <TableRow key={u.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Nome */}
                        <TableCell className="py-3.5 font-bold text-xs text-[#0F172A]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#16A34A] to-[#2563EB] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                              {u.nome ? u.nome.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span>{u.nome}</span>
                                {isSelf && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-slate-100 text-slate-600 border-slate-200 py-0 px-1.5"
                                  >
                                    Você
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Email */}
                        <TableCell className="py-3.5 text-xs text-[#64748B]">
                          <div className="flex items-center gap-1.5 font-mono">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span>{u.email}</span>
                          </div>
                        </TableCell>

                        {/* Perfil (Badge colorido com a paleta exigida) */}
                        <TableCell className="py-3.5">
                          <Badge variant="outline" className={`text-xs ${perfilInfo.badgeClass}`}>
                            {perfilInfo.label}
                          </Badge>
                        </TableCell>

                        {/* Status (ativo verde / inativo cinza) com toggle rápido */}
                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-2">
                            {isAtivo ? (
                              <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 font-semibold text-[11px]">
                                Ativo
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600 border-slate-300 font-medium text-[11px]">
                                Inativo
                              </Badge>
                            )}
                            <Switch
                              checked={isAtivo}
                              disabled={isSelf || togglingId === u.id}
                              onCheckedChange={() => handleToggleAtivo(u)}
                              title={
                                isSelf
                                  ? 'Você não pode desativar seu próprio usuário'
                                  : 'Alternar status do usuário'
                              }
                            />
                          </div>
                        </TableCell>

                        {/* Data de Criação */}
                        <TableCell className="py-3.5 text-xs text-[#64748B]">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatarDataCriacao(u.created || u.criado_em)}</span>
                          </div>
                        </TableCell>

                        {/* Ações (editar, ativar/desativar, excluir) */}
                        <TableCell className="py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Editar */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => handleEditarUsuario(u)}
                              className={`h-8 w-8 p-0 text-[#64748B] hover:text-[#16A34A] hover:bg-emerald-50 ${
                                isSelf ? 'opacity-40 cursor-not-allowed' : ''
                              }`}
                              title={
                                isSelf
                                  ? 'Você não pode editar seu próprio usuário'
                                  : 'Editar Usuário'
                              }
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>

                            {/* Excluir com confirmação */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => handleSolicitarExclusao(u)}
                              className={`h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 ${
                                isSelf ? 'opacity-40 cursor-not-allowed' : ''
                              }`}
                              title={
                                isSelf
                                  ? 'Você não pode excluir seu próprio usuário'
                                  : 'Excluir Usuário'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Cards Mobile (<768px) */}
            <div className="md:hidden divide-y divide-[#E2E8F0]">
              {usuariosPaginados.map((u) => {
                const isSelf = u.id === user?.id
                const perfilInfo = PERFIS_CONFIG[u.perfil] || {
                  label: u.perfil,
                  badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
                }
                const isAtivo = u.ativo !== false

                return (
                  <div key={u.id} className="p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#16A34A] to-[#2563EB] text-white font-bold text-xs flex items-center justify-center shadow-sm flex-shrink-0">
                          {u.nome ? u.nome.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-sm text-[#0F172A]">{u.nome}</h4>
                            {isSelf && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-100 text-slate-600 border-slate-200 py-0 px-1"
                              >
                                Você
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-[#64748B] font-mono break-all mt-0.5">
                            {u.email}
                          </p>
                        </div>
                      </div>

                      {isAtivo ? (
                        <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[10px]">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div>
                        <Badge variant="outline" className={`text-[11px] ${perfilInfo.badgeClass}`}>
                          {perfilInfo.label}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-[#64748B]">
                        Criado: {formatarDataCriacao(u.created || u.criado_em)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isAtivo}
                          disabled={isSelf || togglingId === u.id}
                          onCheckedChange={() => handleToggleAtivo(u)}
                        />
                        <span className="text-xs text-[#64748B]">
                          {isAtivo ? (
                            <span className="text-emerald-700 flex items-center gap-1 font-medium">
                              <Power className="w-3 h-3" /> Ativo
                            </span>
                          ) : (
                            <span className="text-slate-500 flex items-center gap-1">
                              <PowerOff className="w-3 h-3" /> Inativo
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSelf}
                          onClick={() => handleEditarUsuario(u)}
                          className="h-8 px-2 text-xs text-[#64748B] hover:text-[#16A34A]"
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSelf}
                          onClick={() => handleSolicitarExclusao(u)}
                          className="h-8 px-2 text-xs text-[#64748B] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Rodapé com controles de paginação */}
            <PaginacaoControles
              paginaAtual={paginaAtual}
              totalPaginas={totalPaginas}
              totalRegistros={usuariosFiltrados.length}
              itensPorPagina={itensPorPagina}
              onPaginaChange={setPaginaAtual}
              onItensPorPaginaChange={(qtd) => {
                setItensPorPagina(qtd)
                setPaginaAtual(1)
              }}
              opcoesItensPorPagina={[25, 50, 100]}
              nomeItens="usuários"
              loading={loading}
            />
          </>
        )}
      </div>

      {/* MODAL DE FORMULÁRIO (CRIAR / EDITAR USUÁRIO) */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#16A34A]" />
              {usuarioEditando ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              {usuarioEditando
                ? 'Atualize as informações do colaborador e seus níveis de acesso no CRM.'
                : 'Preencha os campos abaixo para cadastrar um novo usuário na equipe.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarUsuario} className="space-y-4 pt-2">
            {/* Campo: Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="nome" className="text-xs font-semibold text-[#0F172A]">
                Nome Completo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nome"
                type="text"
                placeholder="Ex: Carlos Oliveira"
                value={formNome}
                onChange={(e) => {
                  setFormNome(e.target.value)
                  if (formErros.nome) {
                    setFormErros((prev) => ({ ...prev, nome: undefined }))
                  }
                }}
                className={`text-sm ${formErros.nome ? 'border-red-500 focus-visible:ring-red-400' : ''}`}
              />
              {formErros.nome && (
                <p className="text-xs text-red-600 font-medium">{formErros.nome}</p>
              )}
            </div>

            {/* Campo: E-mail */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-[#0F172A]">
                E-mail de Acesso <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Ex: carlos@coleselengenharia.com"
                value={formEmail}
                onChange={(e) => {
                  setFormEmail(e.target.value)
                  if (formErros.email) {
                    setFormErros((prev) => ({ ...prev, email: undefined }))
                  }
                }}
                className={`text-sm font-mono ${formErros.email ? 'border-red-500 focus-visible:ring-red-400' : ''}`}
              />
              {formErros.email && (
                <p className="text-xs text-red-600 font-medium">{formErros.email}</p>
              )}
            </div>

            {/* Campo: Perfil (dropdown com perfis existentes) */}
            <div className="space-y-1.5">
              <Label htmlFor="perfil" className="text-xs font-semibold text-[#0F172A]">
                Perfil de Acesso <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formPerfil}
                onValueChange={(val: PerfilUsuario) => {
                  setFormPerfil(val)
                  if (formErros.perfil) {
                    setFormErros((prev) => ({ ...prev, perfil: undefined }))
                  }
                }}
              >
                <SelectTrigger
                  id="perfil"
                  className={`text-sm bg-white ${formErros.perfil ? 'border-red-500' : ''}`}
                >
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ceo_financeiro">CEO / Financeiro (Acesso total)</SelectItem>
                  <SelectItem value="coordenador_vendas">Coordenador de Vendas</SelectItem>
                  <SelectItem value="vendedor_1">Vendedor 1</SelectItem>
                  <SelectItem value="vendedor_2">Vendedor 2</SelectItem>
                  <SelectItem value="compras_grandes_clientes">
                    Compras / Grandes Clientes
                  </SelectItem>
                  <SelectItem value="estoque">Estoque</SelectItem>
                </SelectContent>
              </Select>
              {formErros.perfil && (
                <p className="text-xs text-red-600 font-medium">{formErros.perfil}</p>
              )}
            </div>

            {/* Campo: Status (dropdown ativo/inativo, padrão ativo) */}
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs font-semibold text-[#0F172A]">
                Status da Conta
              </Label>
              <Select
                value={formAtivo ? 'ativo' : 'inativo'}
                onValueChange={(val: string) => setFormAtivo(val === 'ativo')}
              >
                <SelectTrigger id="status" className="text-sm bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo (Permite acesso ao sistema)</SelectItem>
                  <SelectItem value="inativo">Inativo (Acesso bloqueado)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campos opcionais de redefinição de senha ao editar usuário existente */}
            {usuarioEditando && (
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <p className="text-[11px] text-[#64748B]">
                  Preencha apenas se desejar redefinir a senha de acesso deste colaborador. Deixe em
                  branco para manter a senha atual.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-password" className="text-xs font-semibold text-[#0F172A]">
                    Nova Senha (opcional)
                  </Label>
                  <Input
                    id="edit-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Deixe em branco para manter a atual"
                    value={formPassword}
                    onChange={(e) => {
                      setFormPassword(e.target.value)
                      if (formErros.password) {
                        setFormErros((prev) => ({ ...prev, password: undefined }))
                      }
                    }}
                    className={`text-sm ${formErros.password ? 'border-red-500 focus-visible:ring-red-400' : ''}`}
                  />
                  {formErros.password && (
                    <p className="text-xs text-red-600 font-medium">{formErros.password}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-password-confirm"
                    className="text-xs font-semibold text-[#0F172A]"
                  >
                    Confirmar Nova Senha
                  </Label>
                  <Input
                    id="edit-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repita a nova senha se preenchida"
                    value={formPasswordConfirm}
                    onChange={(e) => {
                      setFormPasswordConfirm(e.target.value)
                      if (formErros.passwordConfirm) {
                        setFormErros((prev) => ({ ...prev, passwordConfirm: undefined }))
                      }
                    }}
                    className={`text-sm ${formErros.passwordConfirm ? 'border-red-500 focus-visible:ring-red-400' : ''}`}
                  />
                  {formErros.passwordConfirm && (
                    <p className="text-xs text-red-600 font-medium">{formErros.passwordConfirm}</p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={salvando}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvando}
                className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs gap-1.5"
              >
                {salvando ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Usuário'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL DE EXIBIÇÃO DA SENHA GERADA (APENAS UMA VEZ) */}
      <Dialog
        open={modalSenhaOpen}
        onOpenChange={(open) => {
          if (!open) {
            setModalSenhaOpen(false)
            setDadosNovoUsuario(null)
            setSenhaCopiada(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 mb-1">
              <KeyRound className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#0F172A]">
              Credenciais do Novo Usuário
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              O usuário foi criado com sucesso no banco de dados. A senha foi gerada de forma segura
              e é exibida <strong>apenas uma vez</strong> neste momento. Copie e envie ao
              colaborador.
            </DialogDescription>
          </DialogHeader>

          {dadosNovoUsuario && (
            <div className="space-y-3.5 pt-2">
              <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0] space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Colaborador:</span>
                  <span className="font-semibold text-[#0F172A]">{dadosNovoUsuario.nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">E-mail de acesso:</span>
                  <span className="font-mono text-[#0F172A]">{dadosNovoUsuario.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Perfil atribuído:</span>
                  <span className="font-semibold text-[#7C3AED]">{dadosNovoUsuario.perfil}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#0F172A]">
                  Senha Temporária Forte Gerada:
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={dadosNovoUsuario.senha_gerada}
                    className="font-mono text-sm bg-amber-50/60 border-amber-200 text-[#0F172A] tracking-wider select-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (dadosNovoUsuario?.senha_gerada) {
                        navigator.clipboard.writeText(dadosNovoUsuario.senha_gerada)
                        setSenhaCopiada(true)
                        toast({
                          title: 'Senha copiada!',
                          description:
                            'A senha temporária foi copiada para a área de transferência.',
                        })
                        setTimeout(() => setSenhaCopiada(false), 3000)
                      }
                    }}
                    className="flex-shrink-0 text-xs gap-1.5 h-9"
                  >
                    {senhaCopiada ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-semibold">Copiada</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#64748B]" />
                        <span>Copiar</span>
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  Por questões de segurança, esta senha nunca será gravada em texto puro no
                  navegador e não poderá ser visualizada novamente após fechar esta janela.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end">
            <Button
              type="button"
              onClick={() => {
                setModalSenhaOpen(false)
                setDadosNovoUsuario(null)
                setSenhaCopiada(false)
              }}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs"
            >
              Concluir e Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-2">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-[#0F172A]">
              Confirmar exclusão de usuário?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-[#64748B]">
              Tem certeza que deseja excluir o usuário <strong>{usuarioParaExcluir?.nome}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo} className="text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusao}
              disabled={excluindo}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-xs"
            >
              {excluindo ? 'Excluindo...' : 'Sim, excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
