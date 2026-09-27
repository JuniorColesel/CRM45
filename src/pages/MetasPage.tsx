import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Target,
  Plus,
  Lock,
  Search,
  Filter,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarMoeda, type MetaModel } from '@/types/clientes'
import { PERFIS_CONFIG } from '@/pages/UsuariosPage'

export const NOMES_MESES: string[] = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export default function MetasPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perfil = user?.perfil

  // Permissões conforme especificado:
  // - ceo_financeiro e coordenador_vendas gerenciam (criar, editar, excluir)
  // - vendedor_1 e vendedor_2: somente leitura da própria meta
  // - compras_grandes_clientes e estoque: "Acesso restrito"
  const podeGerenciar = perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas'
  const isVendedor = perfil === 'vendedor_1' || perfil === 'vendedor_2'
  const acessoNegado = perfil === 'compras_grandes_clientes' || perfil === 'estoque'

  // Anos disponíveis para filtro e criação
  const anoAtual = new Date().getFullYear()
  const anosDisponiveis = [anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2]

  // Estados principais
  const [metas, setMetas] = useState<MetaModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroAno, setFiltroAno] = useState<string>(String(anoAtual))

  // Controle de Modal (Criar / Editar)
  const [modalOpen, setModalOpen] = useState(false)
  const [metaEditando, setMetaEditando] = useState<MetaModel | null>(null)
  const [formUsuarioId, setFormUsuarioId] = useState('')
  const [formAno, setFormAno] = useState<number>(anoAtual)
  const [formMes, setFormMes] = useState<number>(new Date().getMonth() + 1)
  const [formValorMeta, setFormValorMeta] = useState('')
  const [formMetaOportunidades, setFormMetaOportunidades] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [formErros, setFormErros] = useState<{
    usuario_id?: string
    ano?: string
    mes?: string
    valor_meta?: string
    meta_oportunidades?: string
    geral?: string
  }>({})

  // Busca de usuário dentro do modal (para quando houver muitos usuários)
  const [buscaUsuarioModal, setBuscaUsuarioModal] = useState('')

  // Controle de exclusão
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [metaParaExcluir, setMetaParaExcluir] = useState<MetaModel | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  // Voltar (navigate(-1) com fallback)
  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/painel')
    }
  }

  // Carregar dados (metas e usuários)
  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Carregar metas respeitando RLS (expand: usuario_id)
      const metasRecords = await pb.collection('metas').getFullList<MetaModel>({
        sort: '-ano,-mes',
        expand: 'usuario_id',
        requestKey: null,
      })
      setMetas(metasRecords)

      // 2. Carregar usuários para mapeamento e seleção
      try {
        const usuariosRecords = await pb.collection('usuarios').getFullList<Usuario>({
          sort: 'nome',
          requestKey: null,
        })
        setUsuarios(usuariosRecords)
      } catch {
        // Se o usuário não puder listar todos os usuários (ex: vendedor), usa ele próprio
        if (user) {
          setUsuarios([user])
        }
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar metas',
        description: msg || 'Não foi possível carregar os registros de metas.',
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!acessoNegado) {
      carregarDados()
    }
  }, [acessoNegado, carregarDados])

  // Usuários que podem ser selecionados no formulário:
  // - coordenador_vendas só pode selecionar vendedores (vendedor_1, vendedor_2), conforme RLS
  // - ceo_financeiro pode selecionar qualquer usuário
  const usuariosElegiveisParaForm = useMemo(() => {
    if (perfil === 'coordenador_vendas') {
      return usuarios.filter((u) => u.perfil === 'vendedor_1' || u.perfil === 'vendedor_2')
    }
    return usuarios
  }, [usuarios, perfil])

  const usuariosElegiveisFiltrados = useMemo(() => {
    if (!buscaUsuarioModal.trim()) return usuariosElegiveisParaForm
    const termo = buscaUsuarioModal.toLowerCase().trim()
    return usuariosElegiveisParaForm.filter(
      (u) =>
        (u.nome || '').toLowerCase().includes(termo) ||
        (u.email || '').toLowerCase().includes(termo),
    )
  }, [usuariosElegiveisParaForm, buscaUsuarioModal])

  // Helper para buscar nome do usuário de uma meta
  const obterNomeUsuario = useCallback(
    (m: MetaModel): string => {
      if (m.expand?.usuario_id?.nome) return m.expand.usuario_id.nome
      const u = usuarios.find((item) => item.id === m.usuario_id)
      if (u?.nome) return u.nome
      if (m.usuario_id === user?.id && user?.nome) return user.nome
      return 'Usuário não identificado'
    },
    [usuarios, user],
  )

  const obterPerfilUsuario = useCallback(
    (m: MetaModel): string => {
      const u =
        m.expand?.usuario_id ||
        usuarios.find((item) => item.id === m.usuario_id) ||
        (m.usuario_id === user?.id ? user : null)
      return u?.perfil || ''
    },
    [usuarios, user],
  )

  // Filtragem na tabela por ano e por busca textual
  const metasFiltradas = useMemo(() => {
    return metas.filter((m) => {
      // Filtro por ano
      if (filtroAno !== 'todos' && String(m.ano) !== filtroAno) {
        return false
      }
      // Busca por nome do usuário
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const nome = obterNomeUsuario(m).toLowerCase()
        const mesExtenso = (NOMES_MESES[m.mes - 1] || '').toLowerCase()
        if (!nome.includes(termo) && !mesExtenso.includes(termo)) {
          return false
        }
      }
      return true
    })
  }, [metas, filtroAno, busca, obterNomeUsuario])

  // Se forCompras ou Estoque, exibe o aviso "Acesso restrito" com cadeado
  if (acessoNegado) {
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
                A visualização e gestão de metas comerciais é restrita a vendedores e gestores de
                vendas.
              </p>
            </div>
            <div className="pt-2">
              <Badge
                variant="outline"
                className="text-xs text-amber-700 bg-amber-50/50 border-amber-200"
              >
                Permissão requerida: vendas ou financeiro
              </Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Abertura do modal para Nova Meta
  const handleNovaMeta = () => {
    setMetaEditando(null)
    setFormUsuarioId(usuariosElegiveisParaForm[0]?.id || '')
    setFormAno(anoAtual)
    setFormMes(new Date().getMonth() + 1)
    setFormValorMeta('')
    setFormMetaOportunidades('')
    setFormErros({})
    setBuscaUsuarioModal('')
    setModalOpen(true)
  }

  // Abertura do modal para Editar Meta
  const handleEditarMeta = (m: MetaModel) => {
    setMetaEditando(m)
    setFormUsuarioId(m.usuario_id)
    setFormAno(m.ano)
    setFormMes(m.mes)
    setFormValorMeta(String(m.valor_meta))
    setFormMetaOportunidades(String(m.meta_oportunidades))
    setFormErros({})
    setBuscaUsuarioModal('')
    setModalOpen(true)
  }

  // Validação amigável
  const validarFormulario = (): boolean => {
    const erros: typeof formErros = {}

    if (!formUsuarioId) {
      erros.usuario_id = 'Selecione um vendedor ou colaborador.'
    }

    if (!formAno || formAno < 2020 || formAno > 2100) {
      erros.ano = 'Informe um ano válido.'
    }

    if (!formMes || formMes < 1 || formMes > 12) {
      erros.mes = 'Selecione o mês da meta.'
    }

    // valor_meta: decimal obrigatório
    const valorNum = parseFloat(formValorMeta.replace(',', '.'))
    if (isNaN(valorNum) || valorNum < 0) {
      erros.valor_meta = 'Informe um valor de meta válido em Reais (ex: 50000,00).'
    }

    // meta_oportunidades: integer obrigatório
    const opsNum = parseInt(formMetaOportunidades, 10)
    if (isNaN(opsNum) || opsNum < 0 || !Number.isInteger(Number(formMetaOportunidades))) {
      erros.meta_oportunidades = 'Informe a meta de oportunidades como número inteiro (ex: 10).'
    }

    setFormErros(erros)
    return Object.keys(erros).length === 0
  }

  // Salvar (criar ou atualizar)
  const handleSalvarMeta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validarFormulario()) return

    const valorDecimal = parseFloat(formValorMeta.replace(',', '.'))
    const metaOpsInt = parseInt(formMetaOportunidades, 10)

    // Checagem local prévia de duplicidade única (usuario_id, ano, mes)
    const duplicataLocal = metas.find(
      (m) =>
        m.usuario_id === formUsuarioId &&
        m.ano === Number(formAno) &&
        m.mes === Number(formMes) &&
        m.id !== metaEditando?.id,
    )

    if (duplicataLocal) {
      const msgDuplicata = 'Já existe uma meta para este usuário neste mês.'
      setFormErros((prev) => ({ ...prev, geral: msgDuplicata }))
      toast({
        variant: 'destructive',
        title: 'Meta duplicada',
        description: msgDuplicata,
      })
      return
    }

    setSalvando(true)
    try {
      const payload = {
        usuario_id: formUsuarioId,
        ano: Number(formAno),
        mes: Number(formMes),
        valor_meta: valorDecimal,
        meta_oportunidades: metaOpsInt,
      }

      if (metaEditando) {
        const atualizado = await pb
          .collection('metas')
          .update<MetaModel>(metaEditando.id, payload, {
            expand: 'usuario_id',
            requestKey: null,
          })
        setMetas((prev) => prev.map((m) => (m.id === atualizado.id ? atualizado : m)))
        toast({
          title: 'Meta atualizada',
          description: `A meta de ${NOMES_MESES[atualizado.mes - 1]}/${atualizado.ano} foi atualizada.`,
        })
      } else {
        const criado = await pb.collection('metas').create<MetaModel>(payload, {
          expand: 'usuario_id',
          requestKey: null,
        })
        setMetas((prev) => [criado, ...prev])
        toast({
          title: 'Meta cadastrada',
          description: `Meta cadastrada para ${NOMES_MESES[criado.mes - 1]}/${criado.ano}.`,
        })
      }

      setModalOpen(false)
      setMetaEditando(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      const errLower = (msg || '').toLowerCase()

      // Constraint única (usuario_id, ano, mes)
      if (
        errLower.includes('unique') ||
        errLower.includes('idx_metas_usuario_ano_mes') ||
        errLower.includes('already exists') ||
        errLower.includes('duplicat')
      ) {
        const msgClara = 'Já existe uma meta para este usuário neste mês.'
        setFormErros((prev) => ({ ...prev, geral: msgClara }))
        toast({
          variant: 'destructive',
          title: 'Meta duplicada',
          description: msgClara,
        })
      } else {
        setFormErros((prev) => ({
          ...prev,
          geral: msg || 'Ocorreu um erro ao salvar a meta.',
        }))
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar meta',
          description: msg || 'Não foi possível gravar a meta no banco de dados.',
        })
      }
    } finally {
      setSalvando(false)
    }
  }

  // Exclusão
  const handleSolicitarExclusao = (m: MetaModel) => {
    setMetaParaExcluir(m)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmarExclusao = async () => {
    if (!metaParaExcluir) return
    setExcluindo(true)
    try {
      await pb.collection('metas').delete(metaParaExcluir.id, { requestKey: null })
      setMetas((prev) => prev.filter((m) => m.id !== metaParaExcluir.id))
      toast({
        title: 'Meta excluída',
        description: 'O registro de meta foi excluído com sucesso.',
      })
      setDeleteConfirmOpen(false)
      setMetaParaExcluir(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir meta',
        description: msg || 'Não foi possível excluir o registro.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Topo com Botão Voltar e Ações */}
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
              className="bg-blue-50 text-[#2563EB] border-blue-200 text-xs font-semibold gap-1"
            >
              <Target className="w-3 h-3" />
              Metas Comerciais
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1 flex items-center gap-2">
            Gestão de Metas
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            {podeGerenciar
              ? 'Configure e acompanhe as metas mensais de faturamento e oportunidades da equipe.'
              : 'Visualize suas metas de vendas e volume de oportunidades estipuladas para cada mês.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A] h-9"
            title="Recarregar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          {/* Botão Nova Meta apenas para CEO e Coordenador */}
          {podeGerenciar && (
            <Button
              onClick={handleNovaMeta}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs sm:text-sm h-9 shadow-sm gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nova Meta
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros: Filtro por Ano e Busca por Nome de Usuário */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Busca por nome */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <Input
            type="text"
            placeholder="Buscar por colaborador ou mês..."
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

        {/* Filtro por Ano */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <Filter className="w-4 h-4 text-[#64748B] flex-shrink-0" />
          <Select value={filtroAno} onValueChange={(val: string) => setFiltroAno(val)}>
            <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-sm">
              <SelectValue placeholder="Filtrar por ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os anos</SelectItem>
              {anosDisponiveis.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  Ano {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contagem / Resumo */}
      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
        <span>
          Mostrando <strong className="text-[#0F172A]">{metasFiltradas.length}</strong> de{' '}
          <strong className="text-[#0F172A]">{metas.length}</strong> metas
          {isVendedor && ' (visualização restrita à sua conta)'}
        </span>
        {(busca || filtroAno !== 'todos') && <span className="italic">Filtros aplicados</span>}
      </div>

      {/* Tabela de Metas Desktop & Cards Mobile */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#16A34A] animate-spin" />
            <p className="text-sm font-medium text-[#64748B]">Carregando metas...</p>
          </div>
        ) : metasFiltradas.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100 shadow-sm">
              <Target className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[#0F172A]">
              {busca || filtroAno !== 'todos'
                ? 'Nenhuma meta encontrada'
                : 'Nenhuma meta cadastrada'}
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              {busca || filtroAno !== 'todos'
                ? 'Nenhum registro corresponde aos filtros selecionados. Tente ajustar os termos.'
                : podeGerenciar
                  ? 'Comece adicionando a meta financeira e de oportunidades do mês corrente para a equipe comercial.'
                  : 'Nenhuma meta estipulada para a sua conta no momento.'}
            </p>
            {podeGerenciar && !busca && filtroAno === 'todos' && (
              <Button
                onClick={handleNovaMeta}
                className="bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold mt-2"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Cadastrar Primeira Meta
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Tabela Desktop (≥768px) */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#F8FAFC]">
                  <TableRow>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">
                      Colaborador
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">
                      Mês / Ano
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">
                      Valor da Meta (R$)
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">
                      Meta de Oportunidades
                    </TableHead>
                    {podeGerenciar && (
                      <TableHead className="font-semibold text-xs text-[#0F172A] text-right">
                        Ações
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E2E8F0]">
                  {metasFiltradas.map((m) => {
                    const nome = obterNomeUsuario(m)
                    const p = obterPerfilUsuario(m)
                    const perfilInfo = p ? PERFIS_CONFIG[p as keyof typeof PERFIS_CONFIG] : null
                    const mesExtenso = NOMES_MESES[m.mes - 1] || `Mês ${m.mes}`

                    return (
                      <TableRow key={m.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Colaborador */}
                        <TableCell className="py-3.5 font-bold text-xs text-[#0F172A]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#16A34A] to-[#2563EB] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                              {nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span>{nome}</span>
                              {perfilInfo && (
                                <div className="mt-0.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] py-0 px-1.5 ${perfilInfo.badgeClass}`}
                                  >
                                    {perfilInfo.label}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Mês / Ano */}
                        <TableCell className="py-3.5 text-xs text-[#0F172A]">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {mesExtenso} de {m.ano}
                            </span>
                          </div>
                        </TableCell>

                        {/* Valor da Meta (R$) */}
                        <TableCell className="py-3.5 text-xs font-bold text-[#0F172A]">
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-[#16A34A]" />
                            <span>{formatarMoeda(m.valor_meta)}</span>
                          </div>
                        </TableCell>

                        {/* Meta de Oportunidades */}
                        <TableCell className="py-3.5 text-xs text-[#0F172A]">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span className="font-semibold">
                              {m.meta_oportunidades}{' '}
                              {m.meta_oportunidades === 1 ? 'proposta' : 'propostas'}
                            </span>
                          </div>
                        </TableCell>

                        {/* Ações (Apenas para gestores) */}
                        {podeGerenciar && (
                          <TableCell className="py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditarMeta(m)}
                                className="h-8 w-8 p-0 text-[#64748B] hover:text-[#16A34A] hover:bg-emerald-50"
                                title="Editar Meta"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSolicitarExclusao(m)}
                                className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                                title="Excluir Meta"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Cards Mobile (<768px) */}
            <div className="md:hidden divide-y divide-[#E2E8F0]">
              {metasFiltradas.map((m) => {
                const nome = obterNomeUsuario(m)
                const mesExtenso = NOMES_MESES[m.mes - 1] || `Mês ${m.mes}`

                return (
                  <div key={m.id} className="p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#16A34A] to-[#2563EB] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                          {nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-[#0F172A]">{nome}</h4>
                          <p className="text-xs text-[#64748B] flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {mesExtenso} de {m.ano}
                          </p>
                        </div>
                      </div>

                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-bold"
                      >
                        {formatarMoeda(m.valor_meta)}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <span className="text-[#64748B]">Meta de propostas:</span>
                      <span className="font-semibold text-[#0F172A] flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-[#2563EB]" />
                        {m.meta_oportunidades} propostas
                      </span>
                    </div>

                    {podeGerenciar && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditarMeta(m)}
                          className="h-8 px-2.5 text-xs text-[#64748B] hover:text-[#16A34A]"
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSolicitarExclusao(m)}
                          className="h-8 px-2.5 text-xs text-[#64748B] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* MODAL DE FORMULÁRIO (CRIAR / EDITAR META) */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <Target className="w-5 h-5 text-[#16A34A]" />
              {metaEditando ? 'Editar Meta' : 'Nova Meta de Vendas'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Configure o valor financeiro e a quantidade de oportunidades que o vendedor deverá
              atingir no mês.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarMeta} className="space-y-4 pt-2">
            {formErros.geral && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                <span>{formErros.geral}</span>
              </div>
            )}

            {/* Campo: Colaborador */}
            <div className="space-y-1.5">
              <Label htmlFor="usuario_id" className="text-xs font-semibold text-[#0F172A]">
                Colaborador <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formUsuarioId}
                onValueChange={(val: string) => {
                  setFormUsuarioId(val)
                  if (formErros.usuario_id || formErros.geral) {
                    setFormErros((prev) => ({
                      ...prev,
                      usuario_id: undefined,
                      geral: undefined,
                    }))
                  }
                }}
              >
                <SelectTrigger
                  id="usuario_id"
                  className={`text-sm bg-white ${formErros.usuario_id ? 'border-red-500' : ''}`}
                >
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {usuariosElegiveisParaForm.length > 5 && (
                    <div className="p-2 border-b border-slate-100">
                      <Input
                        type="text"
                        placeholder="Buscar colaborador..."
                        value={buscaUsuarioModal}
                        onChange={(e) => setBuscaUsuarioModal(e.target.value)}
                        className="text-xs h-7"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  {usuariosElegiveisFiltrados.map((u) => {
                    const pInfo = PERFIS_CONFIG[u.perfil]
                    return (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{u.nome}</span>
                          {pInfo && (
                            <span className="text-[10px] text-slate-500">({pInfo.label})</span>
                          )}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {formErros.usuario_id && (
                <p className="text-xs text-red-600 font-medium">{formErros.usuario_id}</p>
              )}
            </div>

            {/* Linha dupla: Ano e Mês */}
            <div className="grid grid-cols-2 gap-3">
              {/* Ano */}
              <div className="space-y-1.5">
                <Label htmlFor="ano" className="text-xs font-semibold text-[#0F172A]">
                  Ano <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={String(formAno)}
                  onValueChange={(val: string) => {
                    setFormAno(Number(val))
                    if (formErros.ano || formErros.geral) {
                      setFormErros((prev) => ({ ...prev, ano: undefined, geral: undefined }))
                    }
                  }}
                >
                  <SelectTrigger id="ano" className="text-sm bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErros.ano && (
                  <p className="text-xs text-red-600 font-medium">{formErros.ano}</p>
                )}
              </div>

              {/* Mês */}
              <div className="space-y-1.5">
                <Label htmlFor="mes" className="text-xs font-semibold text-[#0F172A]">
                  Mês <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={String(formMes)}
                  onValueChange={(val: string) => {
                    setFormMes(Number(val))
                    if (formErros.mes || formErros.geral) {
                      setFormErros((prev) => ({ ...prev, mes: undefined, geral: undefined }))
                    }
                  }}
                >
                  <SelectTrigger id="mes" className="text-sm bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOMES_MESES.map((nome, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>
                        {idx + 1} — {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErros.mes && (
                  <p className="text-xs text-red-600 font-medium">{formErros.mes}</p>
                )}
              </div>
            </div>

            {/* Campo: Valor da Meta (R$) */}
            <div className="space-y-1.5">
              <Label htmlFor="valor_meta" className="text-xs font-semibold text-[#0F172A]">
                Valor da Meta (R$) <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-[#64748B] font-semibold">
                  R$
                </span>
                <Input
                  id="valor_meta"
                  type="text"
                  placeholder="50000,00"
                  value={formValorMeta}
                  onChange={(e) => {
                    setFormValorMeta(e.target.value)
                    if (formErros.valor_meta) {
                      setFormErros((prev) => ({ ...prev, valor_meta: undefined }))
                    }
                  }}
                  className={`pl-10 text-sm ${
                    formErros.valor_meta ? 'border-red-500 focus-visible:ring-red-400' : ''
                  }`}
                />
              </div>
              {formErros.valor_meta && (
                <p className="text-xs text-red-600 font-medium">{formErros.valor_meta}</p>
              )}
            </div>

            {/* Campo: Meta de Oportunidades (inteiro) */}
            <div className="space-y-1.5">
              <Label htmlFor="meta_oportunidades" className="text-xs font-semibold text-[#0F172A]">
                Meta de Oportunidades Ganhas <span className="text-red-500">*</span>
              </Label>
              <Input
                id="meta_oportunidades"
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 10"
                value={formMetaOportunidades}
                onChange={(e) => {
                  setFormMetaOportunidades(e.target.value)
                  if (formErros.meta_oportunidades) {
                    setFormErros((prev) => ({ ...prev, meta_oportunidades: undefined }))
                  }
                }}
                className={`text-sm ${
                  formErros.meta_oportunidades ? 'border-red-500 focus-visible:ring-red-400' : ''
                }`}
              />
              {formErros.meta_oportunidades && (
                <p className="text-xs text-red-600 font-medium">{formErros.meta_oportunidades}</p>
              )}
            </div>

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
                  'Salvar Meta'
                )}
              </Button>
            </DialogFooter>
          </form>
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
              Confirmar exclusão de meta?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-[#64748B]">
              Tem certeza que deseja excluir a meta de{' '}
              <strong>
                {metaParaExcluir
                  ? `${NOMES_MESES[metaParaExcluir.mes - 1]}/${metaParaExcluir.ano}`
                  : ''}
              </strong>{' '}
              do colaborador{' '}
              <strong>{metaParaExcluir ? obterNomeUsuario(metaParaExcluir) : ''}</strong>? Esta ação
              não pode ser desfeita.
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
