import React, { useState, useMemo } from 'react'
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  Layers,
  Send,
  MoreVertical,
  Calendar,
  DollarSign,
  AlertCircle,
  Megaphone,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { CanalMarketingModel } from '@/types/clientes'
import type { CampanhaModel, TipoCampanha, StatusCampanha } from '@/types/marketing'
import { podeCriarCampanha, podeGerenciarCampanha } from '@/types/marketing'
import { formatarMoeda, formatarData } from '@/types/clientes'
import { CampanhaModal } from './CampanhaModal'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaCampanhasProps {
  campanhas: CampanhaModel[]
  canais: CanalMarketingModel[]
  usuarios: Usuario[]
  loading: boolean
  onReload: () => void
  onUpdateLista: React.Dispatch<React.SetStateAction<CampanhaModel[]>>
  onAbrirConteudos: (campanha: CampanhaModel) => void
  onAbrirPublicacoes: (campanha: CampanhaModel) => void
}

export function AbaCampanhas({
  campanhas,
  canais,
  usuarios,
  loading,
  onReload,
  onUpdateLista,
  onAbrirConteudos,
  onAbrirPublicacoes,
}: AbaCampanhasProps) {
  const { user } = useAuth()

  // Filtros em tempo real
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')

  // Modais de Criação/Edição e Exclusão
  const [modalOpen, setModalOpen] = useState(false)
  const [campanhaParaEditar, setCampanhaParaEditar] = useState<CampanhaModel | null>(null)
  const [campanhaParaExcluir, setCampanhaParaExcluir] = useState<CampanhaModel | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  // Permissões
  const podeCriar = podeCriarCampanha(user)

  // Filtragem local com memoização
  const campanhasFiltradas = useMemo(() => {
    return campanhas.filter((c) => {
      // Busca por nome
      if (busca.trim()) {
        const termo = busca.toLowerCase()
        const nomeMatch = c.nome.toLowerCase().includes(termo)
        const descMatch = c.descricao?.toLowerCase().includes(termo)
        if (!nomeMatch && !descMatch) return false
      }

      // Filtro por status
      if (filtroStatus !== 'todos' && c.status !== filtroStatus) {
        return false
      }

      // Filtro por tipo
      if (filtroTipo !== 'todos' && c.tipo !== filtroTipo) {
        return false
      }

      return true
    })
  }, [campanhas, busca, filtroStatus, filtroTipo])

  // Badge do tipo com cores do briefing:
  // email=azul, whatsapp=verde, sms=roxo, mista=cinza
  const renderTipoBadge = (tipo: TipoCampanha) => {
    switch (tipo) {
      case 'whatsapp':
        return (
          <Badge className="bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC] hover:bg-[#DCFCE7]">
            WhatsApp
          </Badge>
        )
      case 'email':
        return (
          <Badge className="bg-[#DBEAFE] text-[#2563EB] border-[#93C5FD] hover:bg-[#DBEAFE]">
            E-mail
          </Badge>
        )
      case 'sms':
        return (
          <Badge className="bg-[#F3E8FF] text-[#7C3AED] border-[#D8B4FE] hover:bg-[#F3E8FF]">
            SMS
          </Badge>
        )
      case 'mista':
      default:
        return (
          <Badge className="bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1] hover:bg-[#F1F5F9]">
            Mista
          </Badge>
        )
    }
  }

  // Badge do status com cores do briefing:
  // rascunho=cinza, ativa=verde, pausada=amarelo, finalizada=azul escuro
  const renderStatusBadge = (status: StatusCampanha) => {
    switch (status) {
      case 'rascunho':
        return (
          <Badge className="bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1] hover:bg-[#F1F5F9]">
            Rascunho
          </Badge>
        )
      case 'ativa':
        return (
          <Badge className="bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC] hover:bg-[#DCFCE7]">
            Ativa
          </Badge>
        )
      case 'pausada':
        return (
          <Badge className="bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047] hover:bg-[#FEF9C3]">
            Pausada
          </Badge>
        )
      case 'finalizada':
        return (
          <Badge className="bg-[#1E293B] text-white border-[#0F172A] hover:bg-[#1E293B]">
            Finalizada
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Ação de pausar/ativar rápida
  const handleTogglePausarAtivar = async (c: CampanhaModel) => {
    const novoStatus: StatusCampanha = c.status === 'ativa' ? 'pausada' : 'ativa'
    try {
      const atualizada = (await pb.collection('campanhas').update(
        c.id,
        {
          status: novoStatus,
        },
        {
          expand: 'canal_id,responsavel_id',
        },
      )) as unknown as CampanhaModel

      onUpdateLista((prev) => prev.map((item) => (item.id === c.id ? atualizada : item)))
      toast({
        title: novoStatus === 'ativa' ? 'Campanha ativada' : 'Campanha pausada',
        description: `A campanha "${c.nome}" agora está ${novoStatus}.`,
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para alterar o status desta campanha.'
            : msg || 'Erro ao alterar status da campanha.',
      })
    }
  }

  // Ação de exclusão
  const handleConfirmarExclusao = async () => {
    if (!campanhaParaExcluir) return
    setExcluindo(true)
    try {
      await pb.collection('campanhas').delete(campanhaParaExcluir.id)
      onUpdateLista((prev) => prev.filter((item) => item.id !== campanhaParaExcluir.id))
      toast({
        title: 'Campanha excluída',
        description: `A campanha "${campanhaParaExcluir.nome}" foi removida com sucesso.`,
      })
      setCampanhaParaExcluir(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir campanha',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para excluir esta campanha.'
            : msg || 'Ocorreu um erro ao excluir a campanha.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Botão Nova Campanha */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Busca por nome */}
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#64748B]" />
            <Input
              placeholder="Buscar campanha por nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 text-xs h-9 bg-white"
            />
          </div>

          {/* Filtro de Status */}
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[140px] text-xs h-9 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="finalizada">Finalizada</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Tipo */}
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[140px] text-xs h-9 bg-white">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="mista">Mista</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Botão Nova Campanha */}
        {podeCriar && (
          <Button
            onClick={() => {
              setCampanhaParaEditar(null)
              setModalOpen(true)
            }}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs h-9 shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Campanha
          </Button>
        )}
      </div>

      {/* Conteúdo: Tabela no Desktop, Cartões no Mobile */}
      {loading ? (
        <div className="p-8 text-center bg-white rounded-xl border border-[#E2E8F0]">
          <p className="text-sm text-[#64748B]">Carregando campanhas...</p>
        </div>
      ) : campanhasFiltradas.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] space-y-3">
          <Megaphone className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h3 className="text-base font-semibold text-[#0F172A]">Nenhuma campanha encontrada</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            {busca || filtroStatus !== 'todos' || filtroTipo !== 'todos'
              ? 'Tente ajustar os filtros de busca para encontrar suas campanhas.'
              : 'Nenhuma campanha cadastrada no momento. Crie sua primeira campanha para iniciar seus disparos.'}
          </p>
          {podeCriar && !busca && filtroStatus === 'todos' && filtroTipo === 'todos' && (
            <Button
              onClick={() => {
                setCampanhaParaEditar(null)
                setModalOpen(true)
              }}
              size="sm"
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium text-xs mt-2"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Criar Primeira Campanha
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Tabela para Telas Médias e Grandes */}
          <div className="hidden md:block bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                    <th className="py-3 px-4">Campanha</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-3">Canal</th>
                    <th className="py-3 px-3">Responsável</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Período</th>
                    <th className="py-3 px-3 text-right">Orçamento</th>
                    <th className="py-3 px-4 text-center">Visões</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs text-[#0F172A]">
                  {campanhasFiltradas.map((c) => {
                    const canalNome = c.expand?.canal_id?.nome || 'Canal Padrão'
                    const respNome = c.expand?.responsavel_id?.nome || 'Não definido'
                    const gerenciavel = podeGerenciarCampanha(user, c)

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0F172A]">{c.nome}</div>
                          {c.descricao && (
                            <div className="text-[11px] text-[#64748B] line-clamp-1 max-w-xs">
                              {c.descricao}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">{renderTipoBadge(c.tipo)}</td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-[#0F172A]">{canalNome}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[#64748B]">{respNome}</span>
                        </td>
                        <td className="py-3 px-3">{renderStatusBadge(c.status)}</td>
                        <td className="py-3 px-3 text-[#64748B] whitespace-nowrap">
                          {formatarData(c.data_inicio)} - {formatarData(c.data_fim)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-[#0F172A]">
                          {formatarMoeda(c.orcamento)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onAbrirConteudos(c)}
                              className="h-7 text-[11px] px-2.5 font-medium border-[#93C5FD] text-[#2563EB] hover:bg-blue-50"
                              title="Ver conteúdos gerados da campanha"
                            >
                              <Layers className="w-3 h-3 mr-1" />
                              Conteúdos
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onAbrirPublicacoes(c)}
                              className="h-7 text-[11px] px-2.5 font-medium border-[#86EFAC] text-[#16A34A] hover:bg-emerald-50"
                              title="Ver publicações e disparos da campanha"
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Publicações
                            </Button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {gerenciavel && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTogglePausarAtivar(c)}
                                  className="h-8 w-8 p-0 text-[#64748B] hover:text-[#0F172A]"
                                  title={
                                    c.status === 'ativa' ? 'Pausar campanha' : 'Ativar campanha'
                                  }
                                >
                                  {c.status === 'ativa' ? (
                                    <Pause className="w-4 h-4 text-[#CA8A04]" />
                                  ) : (
                                    <Play className="w-4 h-4 text-[#16A34A]" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setCampanhaParaEditar(c)
                                    setModalOpen(true)
                                  }}
                                  className="h-8 w-8 p-0 text-[#64748B] hover:text-[#2563EB]"
                                  title="Editar campanha"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCampanhaParaExcluir(c)}
                                  className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626]"
                                  title="Excluir campanha"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cartões Mobile */}
          <div className="md:hidden space-y-3">
            {campanhasFiltradas.map((c) => {
              const canalNome = c.expand?.canal_id?.nome || 'Canal Padrão'
              const respNome = c.expand?.responsavel_id?.nome || 'Não definido'
              const gerenciavel = podeGerenciarCampanha(user, c)

              return (
                <div
                  key={c.id}
                  className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-[#0F172A]">{c.nome}</h4>
                      {c.descricao && (
                        <p className="text-xs text-[#64748B] line-clamp-2 mt-0.5">{c.descricao}</p>
                      )}
                    </div>
                    {gerenciavel && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4 text-[#64748B]" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleTogglePausarAtivar(c)}>
                            {c.status === 'ativa' ? (
                              <>
                                <Pause className="w-3.5 h-3.5 mr-2 text-[#CA8A04]" />
                                Pausar Campanha
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 mr-2 text-[#16A34A]" />
                                Ativar Campanha
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCampanhaParaEditar(c)
                              setModalOpen(true)
                            }}
                          >
                            <Edit className="w-3.5 h-3.5 mr-2 text-[#2563EB]" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setCampanhaParaExcluir(c)}
                            className="text-[#DC2626] focus:text-[#DC2626]"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {renderTipoBadge(c.tipo)}
                    {renderStatusBadge(c.status)}
                    <span className="text-xs text-[#64748B]">Canal: {canalNome}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-[#64748B] pt-2 border-t border-[#E2E8F0]">
                    <div>
                      <span className="block text-[10px] uppercase font-semibold text-[#94A3B8]">
                        Responsável
                      </span>
                      <span className="text-[#0F172A] font-medium">{respNome}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-semibold text-[#94A3B8]">
                        Orçamento
                      </span>
                      <span className="text-[#0F172A] font-medium">
                        {formatarMoeda(c.orcamento)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[10px] uppercase font-semibold text-[#94A3B8]">
                        Período
                      </span>
                      <span>
                        {formatarData(c.data_inicio)} até {formatarData(c.data_fim)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E2E8F0]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAbrirConteudos(c)}
                      className="w-full text-xs h-8 border-[#93C5FD] text-[#2563EB] hover:bg-blue-50"
                    >
                      <Layers className="w-3.5 h-3.5 mr-1.5" />
                      Conteúdos
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAbrirPublicacoes(c)}
                      className="w-full text-xs h-8 border-[#86EFAC] text-[#16A34A] hover:bg-emerald-50"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      Publicações
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Modal de Criação / Edição de Campanha */}
      <CampanhaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        campanha={campanhaParaEditar}
        canais={canais}
        usuarios={usuarios}
        onSuccess={(salva) => {
          onUpdateLista((prev) => {
            const index = prev.findIndex((item) => item.id === salva.id)
            if (index >= 0) {
              const copy = [...prev]
              copy[index] = salva
              return copy
            }
            return [salva, ...prev]
          })
          onReload()
        }}
      />

      {/* Diálogo de Confirmação de Exclusão (AlertDialog) */}
      <AlertDialog
        open={Boolean(campanhaParaExcluir)}
        onOpenChange={(open) => !open && setCampanhaParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[#0F172A]">
              <AlertCircle className="w-5 h-5 text-[#DC2626]" />
              Excluir Campanha
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#64748B]">
              Tem certeza que deseja excluir a campanha{' '}
              <strong className="text-[#0F172A]">"{campanhaParaExcluir?.nome}"</strong>? Esta
              operação não poderá ser desfeita.
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
