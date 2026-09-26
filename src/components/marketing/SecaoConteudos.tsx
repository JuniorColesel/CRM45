import React, { useState } from 'react'
import {
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Sparkles,
  Layers,
  Clock,
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
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type {
  CampanhaModel,
  ConteudoGeradoModel,
  TipoConteudoGerado,
  StatusConteudoGerado,
} from '@/types/marketing'
import { podeCriarConteudo, podeGerenciarConteudo } from '@/types/marketing'
import { formatarDataHora } from '@/types/clientes'
import { GerarConteudoModal } from './GerarConteudoModal'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface SecaoConteudosProps {
  campanha: CampanhaModel
  conteudos: ConteudoGeradoModel[]
  usuarios: Usuario[]
  loading: boolean
  onReload: () => void
  onUpdateLista: React.Dispatch<React.SetStateAction<ConteudoGeradoModel[]>>
}

export function SecaoConteudos({
  campanha,
  conteudos,
  usuarios,
  loading,
  onReload,
  onUpdateLista,
}: SecaoConteudosProps) {
  const { user } = useAuth()

  const [modalGerarOpen, setModalGerarOpen] = useState(false)
  const [conteudoParaExcluir, setConteudoParaExcluir] = useState<ConteudoGeradoModel | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const podeCriar = podeCriarConteudo(user, campanha)
  const isGestor = user?.perfil === 'ceo_financeiro' || user?.perfil === 'coordenador_vendas'

  // Ícone por tipo
  const renderTipoIcon = (tipo: TipoConteudoGerado) => {
    switch (tipo) {
      case 'imagem':
        return <ImageIcon className="w-4 h-4 text-[#16A34A]" />
      case 'video':
        return <Video className="w-4 h-4 text-[#DC2626]" />
      case 'audio':
        return <Mic className="w-4 h-4 text-[#7C3AED]" />
      case 'texto':
      default:
        return <FileText className="w-4 h-4 text-[#2563EB]" />
    }
  }

  // Badge do status: gerado=azul, aprovado=verde, rejeitado=vermelho
  const renderStatusBadge = (status: StatusConteudoGerado) => {
    switch (status) {
      case 'aprovado':
        return (
          <Badge className="bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC] hover:bg-[#DCFCE7] flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Aprovado
          </Badge>
        )
      case 'rejeitado':
        return (
          <Badge className="bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5] hover:bg-[#FEE2E2] flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Rejeitado
          </Badge>
        )
      case 'gerado':
      default:
        return (
          <Badge className="bg-[#DBEAFE] text-[#2563EB] border-[#93C5FD] hover:bg-[#DBEAFE] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Gerado
          </Badge>
        )
    }
  }

  // Ações de aprovar e rejeitar diretamente na linha de conteúdos
  const handleDecidirConteudo = async (
    cg: ConteudoGeradoModel,
    novoStatus: 'aprovado' | 'rejeitado',
  ) => {
    try {
      const atualizado = (await pb.collection('conteudos_gerados').update(cg.id, {
        status: novoStatus,
      })) as unknown as ConteudoGeradoModel

      // Se houver aprovacao_pendente vinculada, atualiza também
      try {
        const aprovacoes = await pb.collection('aprovacoes_pendentes').getFullList({
          filter: `conteudo_id = "${cg.id}"`,
        })
        for (const ap of aprovacoes) {
          await pb.collection('aprovacoes_pendentes').update(ap.id, {
            status: novoStatus,
            decidido_em: new Date().toISOString(),
          })
        }
      } catch (errSync) {
        console.warn('Aviso: Sincronização secundária de aprovações pendentes:', errSync)
      }

      onUpdateLista((prev) => prev.map((item) => (item.id === cg.id ? atualizado : item)))
      toast({
        title: novoStatus === 'aprovado' ? 'Conteúdo aprovado' : 'Conteúdo rejeitado',
        description: `O status do conteúdo foi atualizado para ${novoStatus}.`,
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para aprovar ou rejeitar conteúdos nesta campanha.'
            : msg || 'Ocorreu um erro ao atualizar o conteúdo.',
      })
    }
  }

  const handleConfirmarExclusao = async () => {
    if (!conteudoParaExcluir) return
    setExcluindo(true)
    try {
      await pb.collection('conteudos_gerados').delete(conteudoParaExcluir.id)
      onUpdateLista((prev) => prev.filter((item) => item.id !== conteudoParaExcluir.id))
      toast({
        title: 'Conteúdo removido',
        description: 'O conteúdo gerado foi excluído com sucesso.',
      })
      setConteudoParaExcluir(null)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir conteúdo',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para excluir este conteúdo.'
            : msg || 'Ocorreu um erro ao excluir o conteúdo.',
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
            <Layers className="w-5 h-5 text-[#2563EB]" />
            Conteúdos Gerados ({conteudos.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Peças publicitárias, copys e mensagens desenvolvidas para a campanha "{campanha.nome}".
          </p>
        </div>

        {podeCriar && (
          <Button
            onClick={() => setModalGerarOpen(true)}
            size="sm"
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs h-9 shadow-sm"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Gerar Conteúdo
          </Button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center bg-white rounded-xl border border-[#E2E8F0]">
          <p className="text-sm text-[#64748B]">Carregando conteúdos...</p>
        </div>
      ) : conteudos.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] space-y-3">
          <Layers className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h4 className="text-base font-semibold text-[#0F172A]">Nenhum conteúdo gerado ainda</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Cadastre copys de texto, artes visuais ou mídias para alimentar as publicações desta
            campanha.
          </p>
          {podeCriar && (
            <Button
              onClick={() => setModalGerarOpen(true)}
              size="sm"
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium text-xs mt-2"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Criar Primeiro Conteúdo
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {conteudos.map((cg) => {
            const gerenciavel = podeGerenciarConteudo(user, campanha) || isGestor
            const truncated =
              cg.conteudo.length > 150 ? `${cg.conteudo.substring(0, 150)}...` : cg.conteudo

            return (
              <div
                key={cg.id}
                className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-slate-100 flex items-center justify-center">
                      {renderTipoIcon(cg.tipo)}
                    </span>
                    <span className="text-xs font-semibold uppercase text-[#0F172A]">
                      {cg.tipo}
                    </span>
                    {renderStatusBadge(cg.status)}
                    <span className="text-[11px] text-[#94A3B8] ml-auto md:ml-2">
                      {formatarDataHora(cg.criado_em || cg.created)}
                    </span>
                  </div>

                  <p className="text-xs text-[#334155] leading-relaxed break-words font-normal">
                    {truncated}
                  </p>

                  {cg.prompt_ia && (
                    <p className="text-[11px] text-[#64748B] italic">Prompt IA: "{cg.prompt_ia}"</p>
                  )}
                </div>

                {/* Ações: Aprovar, Rejeitar, Excluir */}
                <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-[#E2E8F0] w-full md:w-auto justify-end">
                  {isGestor && cg.status !== 'aprovado' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDecidirConteudo(cg, 'aprovado')}
                      className="h-8 text-xs font-medium border-[#86EFAC] text-[#16A34A] hover:bg-emerald-50 px-2.5"
                      title="Aprovar conteúdo"
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      Aprovar
                    </Button>
                  )}

                  {isGestor && cg.status !== 'rejeitado' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDecidirConteudo(cg, 'rejeitado')}
                      className="h-8 text-xs font-medium border-[#FCA5A5] text-[#DC2626] hover:bg-rose-50 px-2.5"
                      title="Rejeitar conteúdo"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                      Rejeitar
                    </Button>
                  )}

                  {gerenciavel && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConteudoParaExcluir(cg)}
                      className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626]"
                      title="Excluir conteúdo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de Geração de Conteúdo */}
      <GerarConteudoModal
        open={modalGerarOpen}
        onOpenChange={setModalGerarOpen}
        campanha={campanha}
        usuarios={usuarios}
        onSuccess={(novo) => {
          onUpdateLista((prev) => [novo, ...prev])
          onReload()
        }}
      />

      {/* Diálogo de Exclusão */}
      <AlertDialog
        open={Boolean(conteudoParaExcluir)}
        onOpenChange={(open) => !open && setConteudoParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#0F172A]">Excluir Conteúdo</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#64748B]">
              Tem certeza que deseja excluir esta peça de conteúdo gerada? Publicações vinculadas a
              este conteúdo podem ser afetadas.
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
