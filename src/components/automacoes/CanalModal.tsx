import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Radio, MessageSquare, Mail, Send, Code } from 'lucide-react'
import type { CanalMarketingModel, CanalMensagem } from '@/types/clientes'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface CanalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canal: CanalMarketingModel | null
  onSuccess: (canal: CanalMarketingModel) => void
}

const JSON_PLACEHOLDERS: Record<CanalMensagem, string> = {
  whatsapp: `{\n  "api_key": "seu_token_api",\n  "numero_remetente": "5511999999999",\n  "servidor": "https://api.evolution.exemplo.com"\n}`,
  email: `{\n  "smtp_host": "smtp.exemplo.com",\n  "smtp_port": 587,\n  "usuario": "notificacoes@colesel.com.br",\n  "senha": "sua_senha_segura",\n  "remetente_nome": "CRM Colesel 45"\n}`,
  sms: `{\n  "provedor": "zenvia",\n  "api_token": "seu_token_sms",\n  "remetente": "COLESEL"\n}`,
}

export function CanalModal({ open, onOpenChange, canal, onSuccess }: CanalModalProps) {
  const isEditing = Boolean(canal)

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<CanalMensagem>('whatsapp')
  const [configuracao, setConfiguracao] = useState('')
  const [ativo, setAtivo] = useState(true)

  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      if (canal) {
        setNome(canal.nome || '')
        setTipo(canal.tipo || 'whatsapp')
        if (typeof canal.configuracao === 'object' && canal.configuracao !== null) {
          setConfiguracao(JSON.stringify(canal.configuracao, null, 2))
        } else if (typeof canal.configuracao === 'string') {
          setConfiguracao(canal.configuracao)
        } else {
          setConfiguracao('')
        }
        setAtivo(canal.ativo !== undefined ? canal.ativo : true)
      } else {
        setNome('')
        setTipo('whatsapp')
        setConfiguracao(JSON_PLACEHOLDERS.whatsapp)
        setAtivo(true)
      }
      setErros({})
    }
  }, [open, canal])

  // Quando trocar o tipo no modal de novo canal, se configuracao estiver vazia ou for o placeholder anterior, atualiza
  const handleTipoChange = (novoTipo: CanalMensagem) => {
    setTipo(novoTipo)
    if (
      !isEditing &&
      (!configuracao.trim() || Object.values(JSON_PLACEHOLDERS).includes(configuracao.trim()))
    ) {
      setConfiguracao(JSON_PLACEHOLDERS[novoTipo])
    }
  }

  const validar = (): boolean => {
    const novos: Record<string, string> = {}

    if (!nome.trim()) {
      novos.nome = 'O nome do canal é obrigatório.'
    }

    if (!tipo) {
      novos.tipo = 'Selecione o tipo do canal.'
    }

    if (configuracao.trim()) {
      try {
        JSON.parse(configuracao)
      } catch {
        novos.configuracao = 'A configuração deve ser um JSON válido (ex: {"chave": "valor"}).'
      }
    }

    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      let parsedConfig: Record<string, unknown> = {}
      if (configuracao.trim()) {
        parsedConfig = JSON.parse(configuracao)
      }

      const payload = {
        nome: nome.trim(),
        tipo,
        configuracao: parsedConfig,
        ativo,
      }

      let res: CanalMarketingModel
      if (isEditing && canal) {
        res = await pb.collection('canais_marketing').update<CanalMarketingModel>(canal.id, payload)
        toast({
          title: 'Canal atualizado',
          description: `O canal "${res.nome}" foi atualizado com sucesso.`,
        })
      } else {
        res = await pb.collection('canais_marketing').create<CanalMarketingModel>(payload)
        toast({
          title: 'Canal cadastrado',
          description: `O canal "${res.nome}" foi criado com sucesso.`,
        })
      }

      onSuccess(res)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar canal',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Apenas usuários com perfil CEO Financeiro podem gerenciar canais de marketing.'
            : msg || 'Ocorreu um erro ao salvar o canal.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#16A34A]" />
            {isEditing ? 'Editar Canal de Marketing' : 'Novo Canal de Marketing'}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-[#64748B]">
            Configure as credenciais e parâmetros de conexão para envio de mensagens automáticas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="canal_nome" className="text-xs font-semibold text-[#0F172A]">
              Nome do Canal <span className="text-[#DC2626]">*</span>
            </Label>
            <Input
              id="canal_nome"
              placeholder="Ex: WhatsApp Oficial Vendas 01"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                if (erros.nome) setErros((prev) => ({ ...prev, nome: '' }))
              }}
              className={erros.nome ? 'border-[#DC2626]' : ''}
            />
            {erros.nome && <p className="text-xs text-[#DC2626]">{erros.nome}</p>}
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label htmlFor="canal_tipo" className="text-xs font-semibold text-[#0F172A]">
              Tipo do Canal <span className="text-[#DC2626]">*</span>
            </Label>
            <Select value={tipo} onValueChange={(val: CanalMensagem) => handleTipoChange(val)}>
              <SelectTrigger id="canal_tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-[#16A34A]" />
                    <span>WhatsApp</span>
                  </div>
                </SelectItem>
                <SelectItem value="email">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>E-mail (SMTP)</span>
                  </div>
                </SelectItem>
                <SelectItem value="sms">
                  <div className="flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-[#7C3AED]" />
                    <span>SMS</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Configuração JSON */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="canal_config" className="text-xs font-semibold text-[#0F172A]">
                Configuração (JSON para credenciais)
              </Label>
              <button
                type="button"
                onClick={() => setConfiguracao(JSON_PLACEHOLDERS[tipo])}
                className="text-[11px] text-[#2563EB] hover:underline flex items-center gap-1"
              >
                <Code className="w-3 h-3" /> Usar exemplo padrão
              </button>
            </div>
            <Textarea
              id="canal_config"
              rows={6}
              value={configuracao}
              onChange={(e) => {
                setConfiguracao(e.target.value)
                if (erros.configuracao) setErros((prev) => ({ ...prev, configuracao: '' }))
              }}
              placeholder={JSON_PLACEHOLDERS[tipo]}
              className={`font-mono text-xs resize-none ${
                erros.configuracao ? 'border-[#DC2626]' : ''
              }`}
            />
            {erros.configuracao ? (
              <p className="text-xs text-[#DC2626]">{erros.configuracao}</p>
            ) : (
              <p className="text-[11px] text-[#64748B]">
                Insira as chaves de API, tokens e portas em formato JSON válido.
              </p>
            )}
          </div>

          {/* Toggle Ativo */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <Label htmlFor="canal_ativo" className="text-xs font-semibold text-[#0F172A] block">
                Canal Ativo
              </Label>
              <span className="text-[11px] text-[#64748B]">
                {ativo
                  ? 'Disponível para seleção em regras de automação'
                  : 'Desativado para novos disparos'}
              </span>
            </div>
            <Switch id="canal_ativo" checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <DialogFooter className="pt-4 border-t border-[#E2E8F0]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Salvando...
                </>
              ) : isEditing ? (
                'Salvar Alterações'
              ) : (
                'Cadastrar Canal'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
