import React, { useState } from 'react'
import {
  Send,
  Plus,
  Trash2,
  Calendar,
  MessageSquare,
  Mail,
  Smartphone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import type { ClienteModel } from '@/types/clientes'
import type {
  CampanhaModel,
  ConteudoGeradoModel,
  PublicacaoModel,
  CanalPublicacao,
  StatusPublicacao,
} from '@/types/marketing'
import { podeCriarPublicacao, podeGerenciarPublicacao } from '@/types/marketing'
import { formatarDataHora } from '@/types/clientes'
import { PublicacaoModal } from './PublicacaoModal'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface SecaoPublicacoesProps {
  campanha: CampanhaModel
  publicacoes: PublicacaoModel[]
  conteudosAprovados: ConteudoGeradoModel[]
  clientes: ClienteModel[]
  loading: boolean
  onReload: () => void
  onUpdateLista: React.Dispatch<React.SetStateAction<PublicacaoModel[]>>
}

export function SecaoPublicacoes({
  campanha,
  publicacoes,
  conteudosAprovados,
  clientes,
  loading,
  onReload,
  onUpdateLista,
}: SecaoPublicacoesProps) {
  const { user } = useAuth()

  const [modalPublicacaoOpen, setModalPublicacaoOpen] = useState(false)
  const [pubParaExcluir, setPubParaExcluir] = useState<PublicacaoModel | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const podeCriar = podeCriarPublicacao(user, campanha)

  // Ícone por canal com cores padrão do app:
  // whatsapp=verde, email=azul, sms=roxo
  const renderCanalIcon = (canal: CanalPublicacao) => {
    switch (canal) {
      case 'whatsapp':
        return (
          <div className="flex items-center gap-1.5 text-[#16A34A] font-medium">
            <MessageSquare className="w-4 h-4" />
            <span>WhatsApp</span>
          </div>
        )
      case 'email':
        return (
          <div className="flex items-center gap-1.5 text-[#2563EB] font-medium">
            <Mail className="w-4 h-4" />
            <span>E-mail</span>
          </div>
        )
      case 'sms':
        return (
          <div className="flex items-center gap-1.5 text-[#7C3AED] font-medium">
            <Smartphone className="w-4 h-4" />
            <span>SMS</span>
          </div>
        )
      default:
        return <span>{canal}</span>
    }
  }

  // Badge do status:
  // agendada=amarelo, enviada=azul, entregue=verde, lida=verde escuro, falhou=vermelho
  const renderStatusBadge = (status: StatusPublicacao) => {
    switch (status) {
      case 'agendada':
        return (
          <Badge className="bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047] hover:bg-[#FEF9C3] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Agendada
          </Badge>
        )
      case 'enviada':
        return (
          <Badge className="bg-[#DBEAFE] text-[#2563EB] border-[#93C5FD] hover:bg-[#DBEAFE] flex items-center gap-1">
            <Send className="w-3 h-3" />
            Enviada
          </Badge>
        )
      case 'entregue':
        return (
          <Badge className="bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC] hover:bg-[#DCFCE7] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Entregue
          </Badge>
        )
      case 'lida':
        return (
          <Badge className="bg-[#14532D] text-white border-[#14532D] hover:bg-[#14532D] flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Lida
          </Badge>
        )
      case 'falhou':
        return (
          <Badge className="bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5] hover:bg-[#FEE2E2] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Falhou
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const handleConfirmarExclusao = async () => {
    if (!pubParaExcluir) return
    setExcluindo(true)
    try {
      await pb.collection('publicacoes').delete(pubParaExcluir.id)
      onUpdateLista((prev) => prev.filter((item) => item.id !== pubParaExcluir.id))
      toast({
        title: 'Publicação cancelada',
        description: 'A publicação foi removida da régua.',
      })
      setPubParaExcluir(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir publicação',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para excluir esta publicação.'
            : msg || 'Ocorreu um erro ao excluir a publicação.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <Send className="w-5 h-5 text-[#16A34A]" />
            Publicações e Disparos ({publicacoes.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Histórico de envios agendados e disparos aos clientes da campanha "{campanha.nome}".
          </p>
        </div>

        {podeCriar && (
          <Button
            onClick={() => setModalPublicacaoOpen(true)}
            size="sm"
            className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs h-9 shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Publicação
          </Button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center bg-white rounded-xl border border-[#E2E8F0]">
          <p className="text-sm text-[#64748B]">Carregando publicações...</p>
        </div>
      ) : publicacoes.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] space-y-3">
          <Send className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h4 className="text-base font-semibold text-[#0F172A]">
            Nenhuma publicação agendada nesta campanha
          </h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            {conteudosAprovados.length === 0
              ? 'É necessário ter pelo menos um conteúdo aprovado para agendar disparos aos clientes.'
              : 'Agende disparos personalizados via WhatsApp, E-mail ou SMS para sua base de clientes.'}
          </p>
          {podeCriar && conteudosAprovados.length > 0 && (
            <Button
              onClick={() => setModalPublicacaoOpen(true)}
              size="sm"
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-medium text-xs mt-2"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Agendar Primeiro Disparo
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Tabela Desktop */}
          <div className="hidden md:block bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-3">Canal</th>
                    <th className="py-3 px-3">Conteúdo Utilizado</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Data Agendada</th>
                    <th className="py-3 px-3">Data Envio</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs text-[#0F172A]">
                  {publicacoes.map((pub) => {
                    const cliNome = pub.expand?.cliente_id?.nome_contato || 'Cliente'
                    const cliEmpresa = pub.expand?.cliente_id?.nome_empresa
                    const contTexto = pub.expand?.conteudo_id?.conteudo || 'Conteúdo aprovado'
                    const truncated =
                      contTexto.length > 60 ? `${contTexto.substring(0, 60)}...` : contTexto
                    const gerenciavel = podeGerenciarPublicacao(user, campanha)

                    return (
                      <tr key={pub.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0F172A]">{cliNome}</div>
                          {cliEmpresa && (
                            <div className="text-[11px] text-[#64748B]">{cliEmpresa}</div>
                          )}
                        </td>
                        <td className="py-3 px-3">{renderCanalIcon(pub.canal)}</td>
                        <td
                          className="py-3 px-3 text-[#64748B] max-w-xs truncate"
                          title={contTexto}
                        >
                          {truncated}
                        </td>
                        <td className="py-3 px-3">{renderStatusBadge(pub.status)}</td>
                        <td className="py-3 px-3 text-[#64748B] whitespace-nowrap">
                          {formatarDataHora(pub.data_agendada)}
                        </td>
                        <td className="py-3 px-3 text-[#64748B] whitespace-nowrap">
                          {formatarDataHora(pub.data_envio)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {gerenciavel && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPubParaExcluir(pub)}
                              className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626]"
                              title="Cancelar/Excluir publicação"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
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
            {publicacoes.map((pub) => {
              const cliNome = pub.expand?.cliente_id?.nome_contato || 'Cliente'
              const cliEmpresa = pub.expand?.cliente_id?.nome_empresa
              const contTexto = pub.expand?.conteudo_id?.conteudo || 'Conteúdo aprovado'
              const gerenciavel = podeGerenciarPublicacao(user, campanha)

              return (
                <div
                  key={pub.id}
                  className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="font-bold text-sm text-[#0F172A]">{cliNome}</h5>
                      {cliEmpresa && <p className="text-xs text-[#64748B]">{cliEmpresa}</p>}
                    </div>
                    {renderStatusBadge(pub.status)}
                  </div>

                  <div className="flex items-center gap-3 text-xs pt-1">
                    {renderCanalIcon(pub.canal)}
                    <span className="text-[#94A3B8]">•</span>
                    <span className="text-[#64748B]">
                      Agendado: {formatarDataHora(pub.data_agendada)}
                    </span>
                  </div>

                  <p className="text-xs text-[#334155] bg-slate-50 p-2 rounded-md line-clamp-2">
                    {contTexto}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-2 border-t border-[#E2E8F0]">
                    <span>Envio: {formatarDataHora(pub.data_envio)}</span>
                    {gerenciavel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPubParaExcluir(pub)}
                        className="text-[#DC2626] hover:text-[#DC2626] h-7 px-2 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Modal Nova Publicação */}
      <PublicacaoModal
        open={modalPublicacaoOpen}
        onOpenChange={setModalPublicacaoOpen}
        campanha={campanha}
        conteudosAprovados={conteudosAprovados}
        clientes={clientes}
        onSuccess={(nova) => {
          onUpdateLista((prev) => [nova, ...prev])
          onReload()
        }}
      />

      {/* Diálogo de Exclusão */}
      <AlertDialog
        open={Boolean(pubParaExcluir)}
        onOpenChange={(open) => !open && setPubParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#0F172A]">Cancelar Publicação</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#64748B]">
              Deseja remover esta publicação agendada? O disparo programado será cancelado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusao}
              disabled={excluindo}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            >
              {excluindo ? 'Cancelando...' : 'Sim, Cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
