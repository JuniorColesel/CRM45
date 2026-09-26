import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Mail,
  Send,
  Calendar,
  AlertTriangle,
  RotateCw,
  User,
  Building2,
  Clock,
  CheckCircle2,
  Phone,
  Zap,
} from 'lucide-react'
import type { MensagemEnviadaModel, CanalMensagem, StatusMensagem } from '@/types/clientes'
import { formatarDataHora } from '@/types/clientes'

interface SheetMensagemDetalhesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mensagem: MensagemEnviadaModel | null
  onReenviar: (msg: MensagemEnviadaModel) => void
  reenviando: boolean
}

export function SheetMensagemDetalhes({
  open,
  onOpenChange,
  mensagem,
  onReenviar,
  reenviando,
}: SheetMensagemDetalhesProps) {
  if (!mensagem) return null

  const cliente = mensagem.expand?.cliente_id
  const automacao = mensagem.expand?.automacao_id

  const renderBadgeCanal = (c: CanalMensagem) => {
    switch (c) {
      case 'whatsapp':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs gap-1 font-semibold">
            <MessageSquare className="w-3.5 h-3.5" />
            WhatsApp
          </Badge>
        )
      case 'email':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-xs gap-1 font-semibold">
            <Mail className="w-3.5 h-3.5" />
            E-mail
          </Badge>
        )
      case 'sms':
        return (
          <Badge className="bg-purple-50 text-[#7C3AED] border-purple-200 text-xs gap-1 font-semibold">
            <Send className="w-3.5 h-3.5" />
            SMS
          </Badge>
        )
    }
  }

  const renderBadgeStatus = (s: StatusMensagem) => {
    switch (s) {
      case 'pendente':
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-semibold gap-1">
            <Clock className="w-3 h-3" /> Pendente
          </Badge>
        )
      case 'enviada':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-xs font-semibold gap-1">
            <Send className="w-3 h-3" /> Enviada
          </Badge>
        )
      case 'entregue':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1">
            <CheckCircle2 className="w-3 h-3" /> Entregue
          </Badge>
        )
      case 'lida':
        return (
          <Badge className="bg-emerald-800 text-white border-emerald-900 text-xs font-semibold gap-1">
            <CheckCircle2 className="w-3 h-3" /> Lida
          </Badge>
        )
      case 'falhou':
        return (
          <Badge className="bg-red-50 text-[#DC2626] border-red-200 text-xs font-semibold gap-1">
            <AlertTriangle className="w-3 h-3" /> Falhou
          </Badge>
        )
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            {renderBadgeCanal(mensagem.canal)}
            {renderBadgeStatus(mensagem.status)}
          </div>
          <SheetTitle className="text-xl font-bold text-[#0F172A] pt-2">
            Detalhes do Envio
          </SheetTitle>
          <SheetDescription className="text-xs text-[#64748B]">
            Registro de comunicação registrado no histórico do CRM.
          </SheetDescription>
        </SheetHeader>

        <div className="py-5 space-y-5">
          {/* Dados do Cliente */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Destinatário (Cliente)
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <User className="w-4 h-4 text-[#7C3AED]" />
                {cliente?.nome_contato || 'Cliente não identificado'}
              </div>
              {cliente?.nome_empresa && (
                <div className="text-xs text-[#64748B] flex items-center gap-1.5 pl-6">
                  <Building2 className="w-3.5 h-3.5 text-[#94A3B8]" />
                  {cliente.nome_empresa}
                </div>
              )}
              {cliente?.telefone && (
                <div className="text-xs text-[#334155] flex items-center gap-1.5 pl-6 font-mono">
                  <Phone className="w-3.5 h-3.5 text-[#94A3B8]" />
                  {cliente.telefone}
                </div>
              )}
              {cliente?.email && (
                <div className="text-xs text-[#334155] flex items-center gap-1.5 pl-6">
                  <Mail className="w-3.5 h-3.5 text-[#94A3B8]" />
                  {cliente.email}
                </div>
              )}
            </div>
          </div>

          {/* Automação de Origem se houver */}
          {automacao && (
            <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-[#7C3AED] shrink-0" />
              <div className="text-xs">
                <span className="text-[#64748B]">Disparado via regra: </span>
                <strong className="text-[#7C3AED] font-semibold">{automacao.nome}</strong>
              </div>
            </div>
          )}

          {/* Conteúdo Completo */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-[#0F172A]">Conteúdo Completo</div>
            <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-sm text-xs sm:text-sm text-[#0F172A] whitespace-pre-wrap font-sans leading-relaxed">
              {mensagem.conteudo}
            </div>
          </div>

          {/* Erro de Envio se houver */}
          {mensagem.erro && (
            <div className="p-3.5 bg-red-50 rounded-xl border border-red-200 text-xs text-[#DC2626] space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Erro registrado no disparo:
              </div>
              <p className="font-mono text-[11px] pl-5 break-all">{mensagem.erro}</p>
            </div>
          )}

          {/* Datas de Envio e Leitura */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <span className="text-[#64748B] block text-[11px]">Data de Envio</span>
              <span className="font-semibold text-[#0F172A] flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                {mensagem.data_envio ? formatarDataHora(mensagem.data_envio) : 'Não informado'}
              </span>
            </div>
            <div>
              <span className="text-[#64748B] block text-[11px]">
                Data de Leitura / Confirmação
              </span>
              <span className="font-semibold text-[#0F172A] flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#94A3B8]" />
                {mensagem.data_leitura ? formatarDataHora(mensagem.data_leitura) : '—'}
              </span>
            </div>
          </div>

          {/* Botão Reenviar */}
          <div className="pt-3 border-t border-[#E2E8F0] flex justify-end">
            <Button
              onClick={() => onReenviar(mensagem)}
              disabled={reenviando}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs sm:text-sm shadow-sm"
            >
              <RotateCw className={`w-4 h-4 mr-1.5 ${reenviando ? 'animate-spin' : ''}`} />
              {reenviando ? 'Reenviando...' : 'Reenviar Mensagem'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
