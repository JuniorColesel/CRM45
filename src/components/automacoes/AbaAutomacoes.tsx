import { useState, useMemo } from 'react'
import {
  Zap,
  Plus,
  Search,
  RefreshCw,
  Edit,
  Trash2,
  Power,
  PowerOff,
  User,
  Radio,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import type { AutomacaoModel, CanalMarketingModel } from '@/types/clientes'
import { AutomacaoModal, GATILHO_LABELS, ACAO_LABELS } from '@/components/automacoes/AutomacaoModal'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import type { Usuario } from '@/contexts/AuthContext'

interface AbaAutomacoesProps {
  automacoes: AutomacaoModel[]
  canais: CanalMarketingModel[]
  usuarios: Usuario[]
  loading: boolean
  onReload: () => void
  onUpdateLista: (lista: AutomacaoModel[]) => void
}

export function AbaAutomacoes({
  automacoes,
  canais,
  usuarios,
  loading,
  onReload,
  onUpdateLista,
}: AbaAutomacoesProps) {
  const { user } = useAuth()

  // Filtros em tempo real
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todas' | 'ativas' | 'inativas'>('todas')

  // Modal de criação / edição
  const [modalOpen, setModalOpen] = useState(false)
  const [automacaoEmEdicao, setAutomacaoEmEdicao] = useState<AutomacaoModel | null>(null)

  // Diálogo de confirmação de exclusão
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [automacaoParaExcluir, setAutomacaoParaExcluir] = useState<AutomacaoModel | null>(null)
  const [deletando, setDeletando] = useState(false)

  // Toggle de status rápido
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Helper para formatar o texto do gatilho traduzido com parâmetro
  const formatarGatilho = (auto: AutomacaoModel) => {
    if (auto.gatilho === 'sem_contato_dias') {
      const dias = auto.parametro_gatilho || '?'
      return `Sem contato há ${dias} dias`
    }
    if (auto.gatilho === 'inativo_dias') {
      const dias = auto.parametro_gatilho || '?'
      return `Inativo há ${dias} dias`
    }
    return GATILHO_LABELS[auto.gatilho] || auto.gatilho
  }

  // Helper para verificar permissão de edição/exclusão (RLS)
  // RLS PocketBase: ceo_financeiro pode tudo, outros apenas se responsavel_id === user.id
  const podeGerenciar = (auto: AutomacaoModel) => {
    if (!user) return false
    if (user.perfil === 'estoque') return false
    if (user.perfil === 'ceo_financeiro') return true
    return auto.responsavel_id === user.id
  }

  // Filtragem em tempo real
  const automacoesFiltradas = useMemo(() => {
    return automacoes.filter((auto) => {
      // Filtro por status
      if (filtroStatus === 'ativas' && !auto.ativa) return false
      if (filtroStatus === 'inativas' && auto.ativa) return false

      // Busca por nome
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const nomeMatch = auto.nome.toLowerCase().includes(termo)
        const descMatch = auto.descricao ? auto.descricao.toLowerCase().includes(termo) : false
        if (!nomeMatch && !descMatch) return false
      }

      return true
    })
  }, [automacoes, busca, filtroStatus])

  // Abrir modal para nova automação
  const handleNovaAutomacao = () => {
    setAutomacaoEmEdicao(null)
    setModalOpen(true)
  }

  // Abrir modal para editar
  const handleEditar = (auto: AutomacaoModel) => {
    setAutomacaoEmEdicao(auto)
    setModalOpen(true)
  }

  // Salvar pós modal
  const handleSaved = (salva: AutomacaoModel) => {
    if (automacaoEmEdicao) {
      onUpdateLista(automacoes.map((a) => (a.id === salva.id ? salva : a)))
    } else {
      onUpdateLista([salva, ...automacoes])
    }
  }

  // Toggle rápido ativa/inativa
  const handleToggleAtiva = async (auto: AutomacaoModel) => {
    setTogglingId(auto.id)
    try {
      const novoStatus = !auto.ativa
      const atualizada = await pb
        .collection('automacoes')
        .update<AutomacaoModel>(
          auto.id,
          { ativa: novoStatus },
          { expand: 'canal_id,responsavel_id' },
        )

      onUpdateLista(automacoes.map((a) => (a.id === auto.id ? atualizada : a)))

      toast({
        title: novoStatus ? 'Automação ativada' : 'Automação desativada',
        description: `A regra "${auto.nome}" foi ${novoStatus ? 'ativada' : 'desativada'} com sucesso.`,
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar status',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para alterar esta automação.'
            : msg || 'Ocorreu um erro ao atualizar o status.',
      })
    } finally {
      setTogglingId(null)
    }
  }

  // Confirmar e excluir
  const handleConfirmExcluir = async () => {
    if (!automacaoParaExcluir) return
    setDeletando(true)
    try {
      await pb.collection('automacoes').delete(automacaoParaExcluir.id)
      onUpdateLista(automacoes.filter((a) => a.id !== automacaoParaExcluir.id))
      toast({
        title: 'Automação excluída',
        description: `A automação "${automacaoParaExcluir.nome}" foi removida permanentemente.`,
      })
      setDeleteConfirmOpen(false)
      setAutomacaoParaExcluir(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir automação',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para excluir esta automação.'
            : msg || 'Não foi possível excluir o registro.',
      })
    } finally {
      setDeletando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo com Botão Nova Automação e Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#7C3AED]" />
            Regras de Automação ({automacoesFiltradas.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Automatize o atendimento ao cliente, criação de tarefas e mudança no funil.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          <Button
            onClick={handleNovaAutomacao}
            size="sm"
            className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Automação
          </Button>
        </div>
      </div>

      {/* Barra de Filtros e Busca em Tempo Real */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-8 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
            <Input
              placeholder="Buscar automação por nome ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9"
            />
          </div>

          <div className="sm:col-span-4">
            <Select
              value={filtroStatus}
              onValueChange={(val: 'todas' | 'ativas' | 'inativas') => setFiltroStatus(val)}
            >
              <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9">
                <div className="flex items-center gap-2 truncate">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#64748B]" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as automações</SelectItem>
                <SelectItem value="ativas">Apenas Ativas</SelectItem>
                <SelectItem value="inativas">Apenas Inativas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Conteúdo: Lista / Tabela / Cards Responsivos */}
      {loading ? (
        <div className="py-16 text-center text-xs text-[#64748B] flex items-center justify-center gap-2 bg-white rounded-2xl border border-[#E2E8F0]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#7C3AED]" />
          Carregando regras de automação...
        </div>
      ) : automacoesFiltradas.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[#E2E8F0] bg-white space-y-2">
          <Zap className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma automação encontrada</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            {busca || filtroStatus !== 'todas'
              ? 'Tente ajustar os filtros ou o termo de busca pesquisado.'
              : 'Crie sua primeira regra para automatizar disparos de mensagens e tarefas.'}
          </p>
          <Button
            onClick={handleNovaAutomacao}
            size="sm"
            variant="outline"
            className="text-xs mt-2"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Criar Nova Automação
          </Button>
        </div>
      ) : (
        <>
          {/* VISUALIZAÇÃO DESKTOP: TABELA (≥768px) */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-[#F8FAFC]">
                <TableRow>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Nome</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Gatilho</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Ação</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Canal</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">
                    Responsável
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Status</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A] text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E2E8F0]">
                {automacoesFiltradas.map((auto) => {
                  const canalNome = auto.expand?.canal_id?.nome || '—'
                  const respNome = auto.expand?.responsavel_id?.nome || 'Não definido'
                  const permit = podeGerenciar(auto)

                  return (
                    <TableRow key={auto.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Nome e descrição */}
                      <TableCell className="py-3.5 font-medium text-xs text-[#0F172A] max-w-xs">
                        <div className="font-bold text-[#0F172A]">{auto.nome}</div>
                        {auto.descricao && (
                          <div className="text-[11px] text-[#64748B] truncate mt-0.5">
                            {auto.descricao}
                          </div>
                        )}
                      </TableCell>

                      {/* Gatilho traduzido */}
                      <TableCell className="py-3.5 text-xs text-[#334155]">
                        <span className="font-medium bg-slate-100 text-[#0F172A] px-2 py-0.5 rounded border border-slate-200">
                          {formatarGatilho(auto)}
                        </span>
                      </TableCell>

                      {/* Ação traduzida */}
                      <TableCell className="py-3.5 text-xs">
                        <Badge
                          variant="outline"
                          className="bg-purple-50 text-[#7C3AED] border-purple-200 font-semibold text-[11px]"
                        >
                          {ACAO_LABELS[auto.acao] || auto.acao}
                        </Badge>
                      </TableCell>

                      {/* Canal vinculado */}
                      <TableCell className="py-3.5 text-xs text-[#64748B]">
                        {canalNome !== '—' ? (
                          <span className="flex items-center gap-1 font-medium text-[#0F172A]">
                            <Radio className="w-3 h-3 text-[#16A34A]" />
                            {canalNome}
                          </span>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </TableCell>

                      {/* Responsável */}
                      <TableCell className="py-3.5 text-xs text-[#64748B]">
                        <span className="flex items-center gap-1 font-medium text-[#334155]">
                          <User className="w-3 h-3 text-[#94A3B8]" />
                          {respNome}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-2">
                          {auto.ativa ? (
                            <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 font-semibold text-[11px]">
                              Ativa
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-medium text-[11px]">
                              Inativa
                            </Badge>
                          )}
                          <Switch
                            checked={auto.ativa}
                            disabled={!permit || togglingId === auto.id}
                            onCheckedChange={() => handleToggleAtiva(auto)}
                            title={permit ? 'Alternar status da automação' : 'Sem permissão'}
                          />
                        </div>
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!permit}
                            onClick={() => handleEditar(auto)}
                            className="h-8 w-8 p-0 text-[#64748B] hover:text-[#7C3AED] hover:bg-purple-50"
                            title={permit ? 'Editar Automação' : 'Acesso restrito'}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!permit}
                            onClick={() => {
                              setAutomacaoParaExcluir(auto)
                              setDeleteConfirmOpen(true)
                            }}
                            className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                            title={permit ? 'Excluir Automação' : 'Acesso restrito'}
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

          {/* VISUALIZAÇÃO MOBILE: CARTÕES (<768px) */}
          <div className="md:hidden space-y-3">
            {automacoesFiltradas.map((auto) => {
              const canalNome = auto.expand?.canal_id?.nome || '—'
              const respNome = auto.expand?.responsavel_id?.nome || 'Não definido'
              const permit = podeGerenciar(auto)

              return (
                <div
                  key={auto.id}
                  className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-[#0F172A]">{auto.nome}</h4>
                      {auto.descricao && (
                        <p className="text-xs text-[#64748B] mt-0.5">{auto.descricao}</p>
                      )}
                    </div>
                    {auto.ativa ? (
                      <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[10px] shrink-0">
                        Ativa
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] shrink-0">
                        Inativa
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase block">Gatilho</span>
                      <span className="font-medium text-[#0F172A]">{formatarGatilho(auto)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase block">Ação</span>
                      <span className="font-medium text-[#7C3AED]">
                        {ACAO_LABELS[auto.acao] || auto.acao}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase block">Canal</span>
                      <span className="text-[#334155]">{canalNome}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B] uppercase block">
                        Responsável
                      </span>
                      <span className="text-[#334155]">{respNome}</span>
                    </div>
                  </div>

                  {/* Ações do Card Mobile */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={auto.ativa}
                        disabled={!permit || togglingId === auto.id}
                        onCheckedChange={() => handleToggleAtiva(auto)}
                      />
                      <span className="text-xs text-[#64748B]">
                        {auto.ativa ? (
                          <span className="text-emerald-700 flex items-center gap-1 font-medium">
                            <Power className="w-3 h-3" /> Ativa
                          </span>
                        ) : (
                          <span className="text-slate-500 flex items-center gap-1">
                            <PowerOff className="w-3 h-3" /> Inativa
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!permit}
                        onClick={() => handleEditar(auto)}
                        className="h-8 px-2 text-xs text-[#64748B] hover:text-[#7C3AED]"
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!permit}
                        onClick={() => {
                          setAutomacaoParaExcluir(auto)
                          setDeleteConfirmOpen(true)
                        }}
                        className="h-8 px-2 text-xs text-[#64748B] hover:text-[#DC2626] hover:border-red-200"
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
        </>
      )}

      {/* Modal Formulário (Criar / Editar) */}
      <AutomacaoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        automacao={automacaoEmEdicao}
        canais={canais}
        usuarios={usuarios}
        onSuccess={handleSaved}
      />

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-[#0F172A]">
              Confirmar exclusão da automação?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-[#64748B]">
              Tem certeza de que deseja remover a automação{' '}
              <strong>"{automacaoParaExcluir?.nome}"</strong>? Esta ação é irreversível e novas
              ocorrências do gatilho não serão mais processadas por ela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmExcluir}
              disabled={deletando}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold"
            >
              {deletando ? 'Excluindo...' : 'Sim, excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
