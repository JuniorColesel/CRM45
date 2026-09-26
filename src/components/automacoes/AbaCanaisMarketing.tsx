import { useState } from 'react'
import {
  Radio,
  Plus,
  Lock,
  Edit,
  Trash2,
  RefreshCw,
  MessageSquare,
  Mail,
  Send,
  Power,
  PowerOff,
  Code,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { useAuth } from '@/contexts/AuthContext'
import type { CanalMarketingModel, CanalMensagem } from '@/types/clientes'
import { CanalModal } from '@/components/automacoes/CanalModal'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaCanaisMarketingProps {
  canais: CanalMarketingModel[]
  loading: boolean
  onReload: () => void
  onUpdateLista: (lista: CanalMarketingModel[]) => void
}

export function AbaCanaisMarketing({
  canais,
  loading,
  onReload,
  onUpdateLista,
}: AbaCanaisMarketingProps) {
  const { user } = useAuth()
  const isCeoFinanceiro = user?.perfil === 'ceo_financeiro'

  // Modal de criação / edição
  const [modalOpen, setModalOpen] = useState(false)
  const [canalEmEdicao, setCanalEmEdicao] = useState<CanalMarketingModel | null>(null)

  // Diálogo de confirmação de exclusão
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [canalParaExcluir, setCanalParaExcluir] = useState<CanalMarketingModel | null>(null)
  const [deletando, setDeletando] = useState(false)

  // Toggle de status
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // 1. Se NÃO for ceo_financeiro, exibe aviso elegante de "Acesso restrito" sem dados
  if (!isCeoFinanceiro) {
    return (
      <div className="py-16 px-4 max-w-lg mx-auto text-center animate-fade-in">
        <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
            <Lock className="w-7 h-7 text-amber-600" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-[#0F172A]">Acesso restrito</h3>
            <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
              O gerenciamento de credenciais, provedores e canais de marketing é restrito
              exclusivamente ao perfil <strong>CEO / Diretor Financeiro</strong>.
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
    )
  }

  // Renderizador de ícone do tipo
  const renderTipoBadge = (tipo: CanalMensagem) => {
    switch (tipo) {
      case 'whatsapp':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1">
            <MessageSquare className="w-3.5 h-3.5" />
            WhatsApp
          </Badge>
        )
      case 'email':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-xs font-semibold gap-1">
            <Mail className="w-3.5 h-3.5" />
            E-mail
          </Badge>
        )
      case 'sms':
        return (
          <Badge className="bg-purple-50 text-[#7C3AED] border-purple-200 text-xs font-semibold gap-1">
            <Send className="w-3.5 h-3.5" />
            SMS
          </Badge>
        )
    }
  }

  const handleNovoCanal = () => {
    setCanalEmEdicao(null)
    setModalOpen(true)
  }

  const handleEditar = (canal: CanalMarketingModel) => {
    setCanalEmEdicao(canal)
    setModalOpen(true)
  }

  const handleSaved = (salvo: CanalMarketingModel) => {
    if (canalEmEdicao) {
      onUpdateLista(canais.map((c) => (c.id === salvo.id ? salvo : c)))
    } else {
      onUpdateLista([salvo, ...canais])
    }
  }

  const handleToggleAtivo = async (canal: CanalMarketingModel) => {
    setTogglingId(canal.id)
    try {
      const novoStatus = !canal.ativo
      const atualizado = await pb
        .collection('canais_marketing')
        .update<CanalMarketingModel>(canal.id, { ativo: novoStatus })

      onUpdateLista(canais.map((c) => (c.id === canal.id ? atualizado : c)))

      toast({
        title: novoStatus ? 'Canal ativado' : 'Canal desativado',
        description: `O canal "${canal.nome}" foi ${novoStatus ? 'ativado' : 'desativado'}.`,
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar canal',
        description: msg || 'Ocorreu um erro ao atualizar o status do canal.',
      })
    } finally {
      setTogglingId(null)
    }
  }

  const handleConfirmExcluir = async () => {
    if (!canalParaExcluir) return
    setDeletando(true)
    try {
      await pb.collection('canais_marketing').delete(canalParaExcluir.id)
      onUpdateLista(canais.filter((c) => c.id !== canalParaExcluir.id))
      toast({
        title: 'Canal excluído',
        description: `O canal "${canalParaExcluir.nome}" foi removido com sucesso.`,
      })
      setDeleteConfirmOpen(false)
      setCanalParaExcluir(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir canal',
        description:
          msg.includes('403') || msg.includes('permissão')
            ? 'Você não tem permissão para excluir este canal.'
            : msg || 'Não foi possível remover o canal de marketing.',
      })
    } finally {
      setDeletando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo com Título e Botão Novo Canal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#16A34A]" />
            Canais de Comunicação ({canais.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Provedores de disparo de WhatsApp, E-mail e SMS integrados às automações.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar canais"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          <Button
            onClick={handleNovoCanal}
            size="sm"
            className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Canal
          </Button>
        </div>
      </div>

      {/* Conteúdo: Tabela / Cartões Mobile */}
      {loading ? (
        <div className="py-16 text-center text-xs text-[#64748B] flex items-center justify-center gap-2 bg-white rounded-2xl border border-[#E2E8F0]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#16A34A]" />
          Carregando canais de marketing...
        </div>
      ) : canais.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[#E2E8F0] bg-white space-y-2">
          <Radio className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h4 className="text-sm font-semibold text-[#0F172A]">Nenhum canal configurado</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Cadastre as contas de WhatsApp, E-mail ou SMS para permitir disparos pelas automações.
          </p>
          <Button onClick={handleNovoCanal} size="sm" variant="outline" className="text-xs mt-2">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Cadastrar Primeiro Canal
          </Button>
        </div>
      ) : (
        <>
          {/* TABELA DESKTOP (≥768px) */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-[#F8FAFC]">
                <TableRow>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Nome</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Tipo</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">
                    Configuração
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Status</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A] text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E2E8F0]">
                {canais.map((canal) => {
                  const hasConfig =
                    canal.configuracao &&
                    (typeof canal.configuracao === 'object'
                      ? Object.keys(canal.configuracao).length > 0
                      : String(canal.configuracao).trim().length > 0)

                  return (
                    <TableRow key={canal.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Nome */}
                      <TableCell className="py-3.5 font-bold text-xs text-[#0F172A]">
                        {canal.nome}
                      </TableCell>

                      {/* Tipo com ícone */}
                      <TableCell className="py-3.5">{renderTipoBadge(canal.tipo)}</TableCell>

                      {/* Configuração */}
                      <TableCell className="py-3.5 text-xs text-[#64748B]">
                        {hasConfig ? (
                          <span className="flex items-center gap-1 font-mono text-[11px] bg-slate-100 text-[#0F172A] px-2 py-0.5 rounded w-fit">
                            <Code className="w-3 h-3 text-[#7C3AED]" /> Configurado
                          </span>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </TableCell>

                      {/* Status com Switch */}
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-2">
                          {canal.ativo ? (
                            <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 font-semibold text-[11px]">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-medium text-[11px]">
                              Inativo
                            </Badge>
                          )}
                          <Switch
                            checked={canal.ativo}
                            disabled={togglingId === canal.id}
                            onCheckedChange={() => handleToggleAtivo(canal)}
                            title="Alternar ativação do canal"
                          />
                        </div>
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditar(canal)}
                            className="h-8 w-8 p-0 text-[#64748B] hover:text-[#16A34A] hover:bg-emerald-50"
                            title="Editar Canal"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCanalParaExcluir(canal)
                              setDeleteConfirmOpen(true)
                            }}
                            className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                            title="Excluir Canal"
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

          {/* CARTÕES MOBILE (<768px) */}
          <div className="md:hidden space-y-3">
            {canais.map((canal) => (
              <div
                key={canal.id}
                className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-[#0F172A]">{canal.nome}</h4>
                    <div className="mt-1">{renderTipoBadge(canal.tipo)}</div>
                  </div>
                  {canal.ativo ? (
                    <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[10px]">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
                      Inativo
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={canal.ativo}
                      disabled={togglingId === canal.id}
                      onCheckedChange={() => handleToggleAtivo(canal)}
                    />
                    <span className="text-xs text-[#64748B]">
                      {canal.ativo ? (
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
                      onClick={() => handleEditar(canal)}
                      className="h-8 px-2 text-xs text-[#64748B] hover:text-[#16A34A]"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCanalParaExcluir(canal)
                        setDeleteConfirmOpen(true)
                      }}
                      className="h-8 px-2 text-xs text-[#64748B] hover:text-[#DC2626]"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Criar / Editar Canal */}
      <CanalModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        canal={canalEmEdicao}
        onSuccess={handleSaved}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-[#0F172A]">
              Confirmar exclusão do canal?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-[#64748B]">
              Tem certeza de que deseja remover o canal <strong>"{canalParaExcluir?.nome}"</strong>?
              Automações vinculadas a ele precisarão ser reconfiguradas.
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
