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
import { Loader2, Zap, MessageSquare, AlertCircle } from 'lucide-react'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type {
  AutomacaoModel,
  CanalMarketingModel,
  GatilhoAutomacao,
  AcaoAutomacao,
} from '@/types/clientes'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AutomacaoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  automacao: AutomacaoModel | null
  canais: CanalMarketingModel[]
  usuarios: Usuario[]
  onSuccess: (automacao: AutomacaoModel) => void
}

export const GATILHO_LABELS: Record<GatilhoAutomacao, string> = {
  novo_cliente: 'Novo cliente cadastrado',
  nova_oportunidade: 'Nova oportunidade',
  mudanca_etapa: 'Mudança de etapa',
  tarefa_vencida: 'Tarefa vencida',
  sem_contato_dias: 'Sem contato há X dias',
  aniversario: 'Aniversário',
  inativo_dias: 'Inativo há X dias',
}

export const ACAO_LABELS: Record<AcaoAutomacao, string> = {
  enviar_whatsapp: 'Enviar WhatsApp',
  enviar_email: 'Enviar e-mail',
  criar_tarefa: 'Criar tarefa',
  mover_etapa: 'Mover etapa',
  enviar_sms: 'Enviar SMS',
}

export function AutomacaoModal({
  open,
  onOpenChange,
  automacao,
  canais,
  usuarios,
  onSuccess,
}: AutomacaoModalProps) {
  const { user } = useAuth()
  const isEditing = Boolean(automacao)

  // Permissão de responsável:
  // - Vendedores (vendedor_1, vendedor_2): preenchido consigo mesmos e travados
  // - ceo_financeiro e coordenador_vendas: podem escolher qualquer usuário livremente
  const podeEscolherResponsavel =
    user?.perfil === 'ceo_financeiro' || user?.perfil === 'coordenador_vendas'

  // Campos do formulário
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [gatilho, setGatilho] = useState<GatilhoAutomacao>('novo_cliente')
  const [parametroGatilho, setParametroGatilho] = useState('')
  const [acao, setAcao] = useState<AcaoAutomacao>('enviar_whatsapp')
  const [canalId, setCanalId] = useState('')
  const [mensagemModelo, setMensagemModelo] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [ativa, setAtiva] = useState(true)

  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Ações que exigem canal e mensagem
  const isAcaoEnvio = acao === 'enviar_whatsapp' || acao === 'enviar_email' || acao === 'enviar_sms'
  const isGatilhoComDias = gatilho === 'sem_contato_dias' || gatilho === 'inativo_dias'

  // Canais ativos filtrados pelo tipo de envio
  const canaisFiltrados = canais.filter((c) => {
    if (!c.ativo) return false
    if (acao === 'enviar_whatsapp') return c.tipo === 'whatsapp'
    if (acao === 'enviar_email') return c.tipo === 'email'
    if (acao === 'enviar_sms') return c.tipo === 'sms'
    return true
  })

  useEffect(() => {
    if (open) {
      if (automacao) {
        setNome(automacao.nome || '')
        setDescricao(automacao.descricao || '')
        setGatilho(automacao.gatilho || 'novo_cliente')
        setParametroGatilho(automacao.parametro_gatilho || '')
        setAcao(automacao.acao || 'enviar_whatsapp')
        setCanalId(automacao.canal_id || '')
        setMensagemModelo(automacao.mensagem_modelo || '')
        setResponsavelId(automacao.responsavel_id || user?.id || '')
        setAtiva(automacao.ativa !== undefined ? automacao.ativa : true)
      } else {
        setNome('')
        setDescricao('')
        setGatilho('novo_cliente')
        setParametroGatilho('')
        setAcao('enviar_whatsapp')
        setCanalId('')
        setMensagemModelo('')
        setResponsavelId(user?.id || (usuarios[0]?.id ?? ''))
        setAtiva(true)
      }
      setErros({})
    }
  }, [open, automacao, user, usuarios])

  // Ajusta canalId quando acao mudar e o canal anterior não for compatível
  const handleAcaoChange = (novaAcao: AcaoAutomacao) => {
    setAcao(novaAcao)
    if (erros.acao) setErros((prev) => ({ ...prev, acao: '' }))

    if (
      novaAcao === 'enviar_whatsapp' ||
      novaAcao === 'enviar_email' ||
      novaAcao === 'enviar_sms'
    ) {
      const tipoDesejado =
        novaAcao === 'enviar_whatsapp' ? 'whatsapp' : novaAcao === 'enviar_email' ? 'email' : 'sms'
      const compativel = canais.find((c) => c.ativo && c.tipo === tipoDesejado)
      // Se canal atual não bate com tipo, atualiza
      const canalAtual = canais.find((c) => c.id === canalId)
      if (!canalAtual || canalAtual.tipo !== tipoDesejado) {
        setCanalId(compativel ? compativel.id : '')
      }
    } else {
      setCanalId('')
      setMensagemModelo('')
    }
  }

  const validar = (): boolean => {
    const novos: Record<string, string> = {}

    if (!nome.trim()) {
      novos.nome = 'O nome da automação é obrigatório.'
    }

    if (!gatilho) {
      novos.gatilho = 'Selecione um gatilho.'
    }

    if (isGatilhoComDias) {
      if (!parametroGatilho.trim()) {
        novos.parametro_gatilho = 'Informe o número de dias para o gatilho.'
      } else if (isNaN(Number(parametroGatilho)) || Number(parametroGatilho) < 1) {
        novos.parametro_gatilho = 'O valor deve ser um número positivo maior que 0.'
      }
    }

    if (!acao) {
      novos.acao = 'Selecione uma ação.'
    }

    if (isAcaoEnvio) {
      if (!canalId) {
        novos.canal_id = 'Selecione um canal ativo para o envio.'
      }
      if (!mensagemModelo.trim()) {
        novos.mensagem_modelo = 'O modelo da mensagem é obrigatório para ações de envio.'
      }
    }

    if (podeEscolherResponsavel) {
      if (!responsavelId) {
        novos.responsavel_id = 'Selecione o responsável pela automação.'
      }
    } else {
      if (!user?.id) {
        novos.responsavel_id = 'Usuário não autenticado.'
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
      const finalRespId = podeEscolherResponsavel ? responsavelId : user?.id || ''

      const payload: Record<string, unknown> = {
        nome: nome.trim(),
        descricao: descricao.trim() || '',
        gatilho,
        parametro_gatilho: isGatilhoComDias ? parametroGatilho.trim() : null,
        acao,
        canal_id: isAcaoEnvio ? canalId || null : null,
        mensagem_modelo: isAcaoEnvio ? mensagemModelo.trim() : null,
        responsavel_id: finalRespId,
        ativa,
      }

      let res: AutomacaoModel
      if (isEditing && automacao) {
        res = await pb.collection('automacoes').update<AutomacaoModel>(automacao.id, payload, {
          expand: 'canal_id,responsavel_id',
        })
        toast({
          title: 'Automação atualizada',
          description: `A automação "${res.nome}" foi atualizada com sucesso.`,
        })
      } else {
        res = await pb.collection('automacoes').create<AutomacaoModel>(payload, {
          expand: 'canal_id,responsavel_id',
        })
        toast({
          title: 'Automação criada',
          description: `A automação "${res.nome}" foi cadastrada com sucesso.`,
        })
      }

      onSuccess(res)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar automação',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para cadastrar ou editar automações.'
            : msg || 'Ocorreu um erro ao salvar a automação.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#7C3AED]" />
            {isEditing ? 'Editar Automação' : 'Nova Automação'}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-[#64748B]">
            Configure fluxos automáticos de disparo de mensagens, tarefas ou avanço no funil.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="auto_nome" className="text-xs font-semibold text-[#0F172A]">
              Nome da Automação <span className="text-[#DC2626]">*</span>
            </Label>
            <Input
              id="auto_nome"
              placeholder="Ex: Boas-vindas para novo cliente"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                if (erros.nome) setErros((prev) => ({ ...prev, nome: '' }))
              }}
              className={erros.nome ? 'border-[#DC2626]' : ''}
            />
            {erros.nome && <p className="text-xs text-[#DC2626]">{erros.nome}</p>}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="auto_desc" className="text-xs font-semibold text-[#0F172A]">
              Descrição
            </Label>
            <Textarea
              id="auto_desc"
              rows={2}
              placeholder="Explique o objetivo ou contexto dessa regra de negócio..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="resize-none text-xs sm:text-sm"
            />
          </div>

          {/* Gatilho e Parâmetro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="auto_gatilho" className="text-xs font-semibold text-[#0F172A]">
                Gatilho (Quando disparar) <span className="text-[#DC2626]">*</span>
              </Label>
              <Select
                value={gatilho}
                onValueChange={(val: GatilhoAutomacao) => {
                  setGatilho(val)
                  if (erros.gatilho) setErros((prev) => ({ ...prev, gatilho: '' }))
                  if (val !== 'sem_contato_dias' && val !== 'inativo_dias') {
                    setParametroGatilho('')
                  }
                }}
              >
                <SelectTrigger id="auto_gatilho">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="novo_cliente">{GATILHO_LABELS.novo_cliente}</SelectItem>
                  <SelectItem value="nova_oportunidade">
                    {GATILHO_LABELS.nova_oportunidade}
                  </SelectItem>
                  <SelectItem value="mudanca_etapa">{GATILHO_LABELS.mudanca_etapa}</SelectItem>
                  <SelectItem value="tarefa_vencida">{GATILHO_LABELS.tarefa_vencida}</SelectItem>
                  <SelectItem value="sem_contato_dias">
                    Sem contato há X dias (personalizado)
                  </SelectItem>
                  <SelectItem value="aniversario">{GATILHO_LABELS.aniversario}</SelectItem>
                  <SelectItem value="inativo_dias">Inativo há X dias (personalizado)</SelectItem>
                </SelectContent>
              </Select>
              {erros.gatilho && <p className="text-xs text-[#DC2626]">{erros.gatilho}</p>}
            </div>

            {/* Parâmetro de dias (aparece apenas para sem_contato_dias ou inativo_dias) */}
            {isGatilhoComDias ? (
              <div className="space-y-1.5">
                <Label htmlFor="auto_param" className="text-xs font-semibold text-[#0F172A]">
                  Número de Dias (X) <span className="text-[#DC2626]">*</span>
                </Label>
                <Input
                  id="auto_param"
                  type="number"
                  min="1"
                  placeholder="Ex: 15"
                  value={parametroGatilho}
                  onChange={(e) => {
                    setParametroGatilho(e.target.value)
                    if (erros.parametro_gatilho) {
                      setErros((prev) => ({ ...prev, parametro_gatilho: '' }))
                    }
                  }}
                  className={erros.parametro_gatilho ? 'border-[#DC2626]' : ''}
                />
                {erros.parametro_gatilho && (
                  <p className="text-xs text-[#DC2626]">{erros.parametro_gatilho}</p>
                )}
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          {/* Ação e Canal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="auto_acao" className="text-xs font-semibold text-[#0F172A]">
                Ação Executada <span className="text-[#DC2626]">*</span>
              </Label>
              <Select value={acao} onValueChange={(val: AcaoAutomacao) => handleAcaoChange(val)}>
                <SelectTrigger id="auto_acao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enviar_whatsapp">{ACAO_LABELS.enviar_whatsapp}</SelectItem>
                  <SelectItem value="enviar_email">{ACAO_LABELS.enviar_email}</SelectItem>
                  <SelectItem value="enviar_sms">{ACAO_LABELS.enviar_sms}</SelectItem>
                  <SelectItem value="criar_tarefa">{ACAO_LABELS.criar_tarefa}</SelectItem>
                  <SelectItem value="mover_etapa">{ACAO_LABELS.mover_etapa}</SelectItem>
                </SelectContent>
              </Select>
              {erros.acao && <p className="text-xs text-[#DC2626]">{erros.acao}</p>}
            </div>

            {/* Canal vinculado (apenas para envio) */}
            {isAcaoEnvio ? (
              <div className="space-y-1.5">
                <Label htmlFor="auto_canal" className="text-xs font-semibold text-[#0F172A]">
                  Canal de Disparo <span className="text-[#DC2626]">*</span>
                </Label>
                <Select
                  value={canalId}
                  onValueChange={(val) => {
                    setCanalId(val)
                    if (erros.canal_id) setErros((prev) => ({ ...prev, canal_id: '' }))
                  }}
                >
                  <SelectTrigger
                    id="auto_canal"
                    className={erros.canal_id ? 'border-[#DC2626]' : ''}
                  >
                    <SelectValue placeholder="Selecione um canal ativo" />
                  </SelectTrigger>
                  <SelectContent>
                    {canaisFiltrados.length === 0 ? (
                      <div className="p-2 text-xs text-[#64748B] text-center">
                        Nenhum canal ativo deste tipo cadastrado.
                      </div>
                    ) : (
                      canaisFiltrados.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} ({c.tipo.toUpperCase()})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {erros.canal_id && <p className="text-xs text-[#DC2626]">{erros.canal_id}</p>}
                {canaisFiltrados.length === 0 && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    Crie ou ative um canal na aba "Canais" para vincular.
                  </p>
                )}
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          {/* Mensagem Modelo (apenas para envio) */}
          {isAcaoEnvio && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto_msg" className="text-xs font-semibold text-[#0F172A]">
                  Mensagem Modelo <span className="text-[#DC2626]">*</span>
                </Label>
                <span className="text-[11px] text-[#64748B] flex items-center gap-1">
                  <MessageSquare className="w-3 h-3 text-[#7C3AED]" />
                  Variáveis dinâmicas suportadas
                </span>
              </div>
              <Textarea
                id="auto_msg"
                rows={4}
                placeholder="Olá {nome_contato}, tudo bem? Aqui é da {nome_empresa}. Vimos a proposta de {valor_oportunidade}..."
                value={mensagemModelo}
                onChange={(e) => {
                  setMensagemModelo(e.target.value)
                  if (erros.mensagem_modelo) {
                    setErros((prev) => ({ ...prev, mensagem_modelo: '' }))
                  }
                }}
                className={`resize-none font-mono text-xs ${
                  erros.mensagem_modelo ? 'border-[#DC2626]' : ''
                }`}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['{nome_contato}', '{nome_empresa}', '{valor_oportunidade}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMensagemModelo((prev) => `${prev} ${v}`)}
                    className="text-[11px] bg-slate-100 hover:bg-purple-100 text-[#0F172A] hover:text-[#7C3AED] px-2 py-0.5 rounded transition-colors"
                  >
                    + {v}
                  </button>
                ))}
              </div>
              {erros.mensagem_modelo && (
                <p className="text-xs text-[#DC2626]">{erros.mensagem_modelo}</p>
              )}
            </div>
          )}

          {/* Responsável e Status Ativo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="auto_resp" className="text-xs font-semibold text-[#0F172A]">
                Responsável <span className="text-[#DC2626]">*</span>
              </Label>
              {podeEscolherResponsavel ? (
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger id="auto_resp">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome} ({u.perfil})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="auto_resp"
                  value={user?.nome ? `${user.nome} (Você)` : 'Você'}
                  disabled
                  className="bg-slate-100 text-[#64748B] cursor-not-allowed"
                />
              )}
              {!podeEscolherResponsavel && (
                <p className="text-[11px] text-[#64748B]">
                  Preenchido e bloqueado com seu próprio usuário.
                </p>
              )}
              {erros.responsavel_id && (
                <p className="text-xs text-[#DC2626]">{erros.responsavel_id}</p>
              )}
            </div>

            {/* Toggle Ativa */}
            <div className="flex items-center justify-between sm:justify-start sm:gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200 mt-2 sm:mt-4">
              <div>
                <Label htmlFor="auto_ativa" className="text-xs font-semibold text-[#0F172A] block">
                  Automação Ativa
                </Label>
                <span className="text-[11px] text-[#64748B]">
                  {ativa ? 'Disparando gatilhos em tempo real' : 'Pausada temporariamente'}
                </span>
              </div>
              <Switch id="auto_ativa" checked={ativa} onCheckedChange={setAtiva} />
            </div>
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
              className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Salvando...
                </>
              ) : isEditing ? (
                'Salvar Alterações'
              ) : (
                'Criar Automação'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
