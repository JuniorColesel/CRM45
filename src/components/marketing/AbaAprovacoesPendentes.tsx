import React, { useState } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Megaphone,
  User,
  Calendar,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import type { AprovacaoPendenteModel } from '@/types/marketing'
import { formatarDataHora } from '@/types/clientes'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaAprovacoesPendentesProps {
  aprovacoes: AprovacaoPendenteModel[]
  loading: boolean
  onReload: () => void
  onUpdateLista: React.Dispatch<React.SetStateAction<AprovacaoPendenteModel[]>>
}

export function AbaAprovacoesPendentes({
  aprovacoes,
  loading,
  onReload,
  onUpdateLista,
}: AbaAprovacoesPendentesProps) {
  const { user } = useAuth()

  // Modal de Decisão: Aprovar ou Rejeitar com comentário opcional
  const [modalDecisaoOpen, setModalDecisaoOpen] = useState(false)
  const [aprovacaoSelecionada, setAprovacaoSelecionada] = useState<AprovacaoPendenteModel | null>(
    null,
  )
  const [acaoDecisao, setAcaoDecisao] = useState<'aprovado' | 'rejeitado'>('aprovado')
  const [comentario, setComentario] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Filtro: aprovador_id = usuário logado E status pendente
  const aprovacoesDoUsuario = aprovacoes.filter((a) => {
    // Se for ceo_financeiro pode ver todas ou focar nas dele
    if (user?.perfil === 'ceo_financeiro') {
      return a.status === 'pendente'
    }
    return a.aprovador_id === user?.id && a.status === 'pendente'
  })

  const abrirModalDecisao = (aprovacao: AprovacaoPendenteModel, acao: 'aprovado' | 'rejeitado') => {
    setAprovacaoSelecionada(aprovacao)
    setAcaoDecisao(acao)
    setComentario(aprovacao.comentario || '')
    setModalDecisaoOpen(true)
  }

  // "Ao aprovar: atualiza status da aprovação para 'aprovado' E status do conteúdo para 'aprovado'.
  // Ao rejeitar: status da aprovação 'rejeitado' E conteúdo 'rejeitado'."
  const handleConfirmarDecisao = async () => {
    if (!aprovacaoSelecionada) return

    setSalvando(true)
    try {
      const dataHoraDecisao = new Date().toISOString()

      // 1. Atualiza o status da aprovação pendente
      const aprovacaoAtualizada = (await pb.collection('aprovacoes_pendentes').update(
        aprovacaoSelecionada.id,
        {
          status: acaoDecisao,
          comentario: comentario.trim() || '',
          decidido_em: dataHoraDecisao,
        },
        {
          expand: 'conteudo_id,aprovador_id',
        },
      )) as unknown as AprovacaoPendenteModel

      // 2. Atualiza o status do conteúdo gerado correspondente
      if (aprovacaoSelecionada.conteudo_id) {
        try {
          await pb.collection('conteudos_gerados').update(aprovacaoSelecionada.conteudo_id, {
            status: acaoDecisao,
          })
        } catch (errConteudo) {
          console.warn('Aviso: Erro ao sincronizar conteúdo gerado com a aprovação:', errConteudo)
        }
      }

      // Remove da lista de pendências imediatas
      onUpdateLista((prev) => prev.filter((item) => item.id !== aprovacaoSelecionada.id))

      toast({
        title: acaoDecisao === 'aprovado' ? 'Conteúdo aprovado!' : 'Conteúdo rejeitado',
        description: `A solicitação foi decidida como "${acaoDecisao}" com sucesso.`,
      })

      setModalDecisaoOpen(false)
      onReload()
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar decisão',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para decidir esta solicitação de aprovação.'
            : msg || 'Ocorreu um erro ao processar a aprovação.',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#CA8A04]" />
          Aprovações Pendentes ({aprovacoesDoUsuario.length})
        </h3>
        <p className="text-xs text-[#64748B]">
          Conteúdos criados por vendedores e membros da equipe que aguardam sua validação antes do
          disparo.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center bg-white rounded-xl border border-[#E2E8F0]">
          <p className="text-sm text-[#64748B]">Carregando aprovações pendentes...</p>
        </div>
      ) : aprovacoesDoUsuario.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] space-y-3">
          <CheckCircle className="w-10 h-10 text-[#16A34A] mx-auto opacity-70" />
          <h4 className="text-base font-semibold text-[#0F172A]">
            Tudo em dia! Nenhuma aprovação pendente
          </h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Não há conteúdos aguardando sua revisão no momento. Novos conteúdos submetidos pelos
            vendedores aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {aprovacoesDoUsuario.map((ap) => {
            const cont = ap.expand?.conteudo_id
            const campanha = cont?.expand?.campanha_id
            const solicitanteNome = ap.expand?.aprovador_id?.nome || 'Equipe'
            const textoConteudo = cont?.conteudo || 'Conteúdo em validação...'
            const truncated =
              textoConteudo.length > 150 ? `${textoConteudo.substring(0, 150)}...` : textoConteudo

            return (
              <div
                key={ap.id}
                className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047] hover:bg-[#FEF9C3] flex items-center gap-1 text-[11px]">
                      <Clock className="w-3 h-3" />
                      Pendente de Aprovação
                    </Badge>

                    {campanha?.nome && (
                      <div className="flex items-center gap-1 text-xs font-semibold text-[#0F172A]">
                        <Megaphone className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Campanha: {campanha.nome}</span>
                      </div>
                    )}

                    {cont?.tipo && (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-[#64748B]">
                        Tipo: {cont.tipo}
                      </span>
                    )}

                    <span className="text-[11px] text-[#94A3B8] ml-auto">
                      Criado em {formatarDataHora(ap.criado_em || ap.created)}
                    </span>
                  </div>

                  {/* Conteúdo truncado em 150 caracteres */}
                  <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] text-xs text-[#1E293B] leading-relaxed">
                    <p className="font-medium text-[11px] text-[#64748B] mb-1">
                      Prévia do Conteúdo:
                    </p>
                    <p className="italic break-words font-sans">{truncated}</p>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-[#64748B]">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      Aprovador Destinado: <strong>{solicitanteNome}</strong>
                    </span>
                    {ap.comentario && (
                      <span className="flex items-center gap-1 text-[#475569]">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Obs: {ap.comentario}
                      </span>
                    )}
                  </div>
                </div>

                {/* Botões Aprovar e Rejeitar */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-[#E2E8F0] w-full md:w-auto justify-end">
                  <Button
                    size="sm"
                    onClick={() => abrirModalDecisao(ap, 'aprovado')}
                    className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs h-9 px-3 shadow-sm"
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    Aprovar
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => abrirModalDecisao(ap, 'rejeitado')}
                    className="border-[#FCA5A5] text-[#DC2626] hover:bg-rose-50 font-semibold text-xs h-9 px-3"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Rejeitar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de Decisão com Campo Comentário e Confirmação */}
      <Dialog open={modalDecisaoOpen} onOpenChange={setModalDecisaoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0F172A]">
              {acaoDecisao === 'aprovado' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-[#16A34A]" />
                  Aprovar Conteúdo
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-[#DC2626]" />
                  Rejeitar Conteúdo
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              {acaoDecisao === 'aprovado'
                ? 'Ao aprovar, o status da aprovação e do conteúdo serão atualizados para "aprovado", liberando para disparo.'
                : 'Ao rejeitar, o conteúdo será marcado como rejeitado e não poderá ser agendado para disparos.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="aprov_comentario" className="text-xs font-semibold text-[#0F172A]">
                Comentário / Parecer (Opcional)
              </Label>
              <Textarea
                id="aprov_comentario"
                rows={3}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder={
                  acaoDecisao === 'aprovado'
                    ? 'Ex: Peça aprovada para disparo nos grupos VIP.'
                    : 'Ex: Revisar o preço informado no segundo parágrafo.'
                }
                className="text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalDecisaoOpen(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmarDecisao}
              disabled={salvando}
              className={
                acaoDecisao === 'aprovado'
                  ? 'bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold'
                  : 'bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold'
              }
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : acaoDecisao === 'aprovado' ? (
                'Confirmar Aprovação'
              ) : (
                'Confirmar Rejeição'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
