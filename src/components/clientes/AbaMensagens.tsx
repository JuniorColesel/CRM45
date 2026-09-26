import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  MessageSquare,
  Loader2,
  Trash2,
  Calendar,
  Mail,
  Send,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'
import type { MensagemEnviadaModel, CanalMensagem, StatusMensagem } from '@/types/clientes'
import { formatarDataHora } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaMensagensProps {
  clienteId: string
  aceitaMensagens?: boolean
}

export default function AbaMensagens({ clienteId, aceitaMensagens = true }: AbaMensagensProps) {
  const [mensagens, setMensagens] = useState<MensagemEnviadaModel[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletandoId, setDeletandoId] = useState<string | null>(null)

  // Formulário
  const [canal, setCanal] = useState<CanalMensagem>('whatsapp')
  const [status, setStatus] = useState<StatusMensagem>('enviada')
  const [conteudo, setConteudo] = useState('')
  const [erro, setErro] = useState('')

  const carregarMensagens = useCallback(async () => {
    try {
      setLoading(true)
      const res = await pb.collection('mensagens_enviadas').getFullList<MensagemEnviadaModel>({
        filter: `cliente_id = "${clienteId}"`,
        sort: '-created',
      })
      setMensagens(res)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar mensagens',
        description: msg.includes('403')
          ? 'Você não tem permissão para visualizar as mensagens deste cliente.'
          : 'Não foi possível carregar as mensagens.',
      })
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => {
    carregarMensagens()
  }, [carregarMensagens])

  const abrirModalCriar = () => {
    setCanal('whatsapp')
    setStatus('enviada')
    setConteudo('')
    setErro('')
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!conteudo.trim()) {
      setErro('Informe o conteúdo da mensagem.')
      return
    }

    setSaving(true)
    setErro('')
    try {
      const nowIso = new Date().toISOString()
      const payload = {
        cliente_id: clienteId,
        canal,
        conteudo: conteudo.trim(),
        status,
        data_envio: nowIso,
        data_leitura: status === 'lida' ? nowIso : null,
      }

      const nova = await pb.collection('mensagens_enviadas').create<MensagemEnviadaModel>(payload)
      setMensagens((prev) => [nova, ...prev])
      toast({
        title: 'Mensagem registrada',
        description: 'Disparo de mensagem registrado com sucesso.',
      })
      setModalOpen(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar mensagem',
        description: msg.includes('403')
          ? 'Permissão negada para cadastrar mensagens.'
          : msg || 'Ocorreu um erro ao salvar a mensagem.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (msgId: string) => {
    setDeletandoId(msgId)
    try {
      await pb.collection('mensagens_enviadas').delete(msgId)
      setMensagens((prev) => prev.filter((m) => m.id !== msgId))
      toast({
        title: 'Mensagem excluída',
        description: 'O registro de mensagem foi removido.',
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir mensagem',
        description: msg.includes('403')
          ? 'Você não tem permissão para excluir esta mensagem.'
          : 'Ocorreu um erro ao excluir.',
      })
    } finally {
      setDeletandoId(null)
    }
  }

  const badgeCanal = (c: CanalMensagem) => {
    switch (c) {
      case 'whatsapp':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[11px] gap-1">
            <MessageSquare className="w-3 h-3" />
            WhatsApp
          </Badge>
        )
      case 'email':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-[11px] gap-1">
            <Mail className="w-3 h-3" />
            E-mail
          </Badge>
        )
      case 'sms':
        return (
          <Badge className="bg-purple-50 text-[#7C3AED] border-purple-200 text-[11px] gap-1">
            <Send className="w-3 h-3" />
            SMS
          </Badge>
        )
    }
  }

  const badgeStatus = (s: StatusMensagem) => {
    switch (s) {
      case 'lida':
        return (
          <Badge className="bg-blue-100 text-[#2563EB] border-blue-200 text-[10px] gap-1">
            <CheckCheck className="w-3 h-3 text-[#2563EB]" />
            Lida
          </Badge>
        )
      case 'entregue':
        return (
          <Badge className="bg-emerald-100 text-[#16A34A] border-emerald-200 text-[10px]">
            Entregue
          </Badge>
        )
      case 'enviada':
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">
            Enviada
          </Badge>
        )
      case 'pendente':
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
            Pendente
          </Badge>
        )
      case 'falhou':
        return (
          <Badge className="bg-red-50 text-[#DC2626] border-red-200 text-[10px] gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            Falhou
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-4">
      {/* Aviso se o cliente não aceita mensagens */}
      {!aceitaMensagens && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>
            Atenção: Este cliente marcou opção de <strong>não aceitar mensagens automáticas</strong>
            . Respeite as preferências do contato antes de disparar campanhas.
          </span>
        </div>
      )}

      {/* Topo da Aba */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#16A34A]" />
            Mensagens e Envios ({mensagens.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Histórico de comunicações enviadas via WhatsApp, E-mail ou SMS.
          </p>
        </div>

        <Button
          onClick={abrirModalCriar}
          size="sm"
          className="bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Registrar Envio
        </Button>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#16A34A]" />
          Carregando histórico de mensagens...
        </div>
      ) : mensagens.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-slate-50/50 space-y-2">
          <MessageSquare className="w-8 h-8 text-[#94A3B8] mx-auto" />
          <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma mensagem registrada</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Registre os envios de mensagens ativas ou acompanhe as mensagens disparadas por
            automações.
          </p>
          <Button onClick={abrirModalCriar} size="sm" variant="outline" className="text-xs mt-2">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Registrar Primeira Mensagem
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
          {mensagens.map((msg) => (
            <div
              key={msg.id}
              className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {badgeCanal(msg.canal)}
                  {badgeStatus(msg.status)}
                  {msg.data_envio && (
                    <span className="text-xs text-[#64748B] flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[#94A3B8]" />
                      {formatarDataHora(msg.data_envio)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#0F172A] whitespace-pre-wrap bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-sans leading-relaxed">
                  {msg.conteudo}
                </p>

                {msg.erro && (
                  <p className="text-[11px] text-[#DC2626] flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Erro no envio: {msg.erro}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end sm:pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deletandoId === msg.id}
                  onClick={() => handleExcluir(msg.id)}
                  className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                  title="Excluir Mensagem"
                >
                  {deletandoId === msg.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Registrar Envio */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#16A34A]" />
              Registrar Mensagem
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Registre um envio manual ou cópia de mensagem enviada ao cliente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            {erro && <p className="text-xs text-[#DC2626] bg-red-50 p-2 rounded">{erro}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="canal" className="text-xs font-semibold text-[#0F172A]">
                  Canal de Envio <span className="text-[#DC2626]">*</span>
                </Label>
                <Select value={canal} onValueChange={(val: CanalMensagem) => setCanal(val)}>
                  <SelectTrigger id="canal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="status" className="text-xs font-semibold text-[#0F172A]">
                  Status do Envio <span className="text-[#DC2626]">*</span>
                </Label>
                <Select value={status} onValueChange={(val: StatusMensagem) => setStatus(val)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enviada">Enviada</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                    <SelectItem value="lida">Lida</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="falhou">Falhou</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="conteudo" className="text-xs font-semibold text-[#0F172A]">
                Conteúdo da Mensagem <span className="text-[#DC2626]">*</span>
              </Label>
              <Textarea
                id="conteudo"
                rows={4}
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Digite o texto da mensagem enviada..."
                required
                className="resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="bg-[#16A34A] hover:bg-[#15803D] text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Registro'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
