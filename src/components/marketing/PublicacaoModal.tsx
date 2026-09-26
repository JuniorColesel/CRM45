import React, { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Send,
  Loader2,
  Search,
  Check,
  ChevronDown,
  Calendar as CalendarIcon,
  MessageSquare,
  Mail,
  Smartphone,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { ClienteModel } from '@/types/clientes'
import type {
  CampanhaModel,
  ConteudoGeradoModel,
  PublicacaoModel,
  CanalPublicacao,
} from '@/types/marketing'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface PublicacaoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campanha: CampanhaModel
  conteudosAprovados: ConteudoGeradoModel[]
  clientes: ClienteModel[]
  onSuccess: (publicacao: PublicacaoModel) => void
}

export function PublicacaoModal({
  open,
  onOpenChange,
  campanha,
  conteudosAprovados,
  clientes,
  onSuccess,
}: PublicacaoModalProps) {
  const { user } = useAuth()

  const [clienteId, setClienteId] = useState('')
  const [conteudoId, setConteudoId] = useState('')
  const [canal, setCanal] = useState<CanalPublicacao>('whatsapp')
  const [dataAgendada, setDataAgendada] = useState('')

  // Combobox inteligente para busca de clientes
  const [clienteComboboxOpen, setClienteComboboxOpen] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')

  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Clientes disponíveis: respeitando regras de vendedores se necessário
  const clientesFiltrados = clientes
    .filter((c) => {
      // Se vendedor_1 / vendedor_2, a RLS só permite criar para clientes cujo responsavel_id seja ele mesmo
      if (user?.perfil === 'vendedor_1' || user?.perfil === 'vendedor_2') {
        if (c.responsavel_id !== user.id) return false
      }
      return true
    })
    .filter((c) => {
      if (!buscaCliente.trim()) return true
      const termo = buscaCliente.toLowerCase()
      const matchNome = c.nome_contato?.toLowerCase().includes(termo)
      const matchEmpresa = c.nome_empresa?.toLowerCase().includes(termo)
      const matchTel = c.telefone?.toLowerCase().includes(termo)
      return Boolean(matchNome || matchEmpresa || matchTel)
    })

  const clienteSelecionado = clientes.find((c) => c.id === clienteId)

  // Sincroniza canal padrão da campanha
  React.useEffect(() => {
    if (open) {
      setClienteId('')
      setBuscaCliente('')
      setConteudoId(conteudosAprovados[0]?.id || '')

      // Canal inicial conforme o tipo da campanha
      if (campanha.tipo === 'whatsapp' || campanha.tipo === 'email' || campanha.tipo === 'sms') {
        setCanal(campanha.tipo as CanalPublicacao)
      } else {
        setCanal('whatsapp')
      }

      // Sugere data agendada para 1 hora a partir de agora
      const d = new Date(Date.now() + 60 * 60 * 1000)
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
      setDataAgendada(d.toISOString().slice(0, 16))

      setErros({})
    }
  }, [open, campanha, conteudosAprovados])

  const validar = (): boolean => {
    const novos: Record<string, string> = {}
    if (!clienteId) {
      novos.cliente_id = 'Selecione um cliente para receber a publicação.'
    }
    if (!conteudoId) {
      novos.conteudo_id = 'Selecione um conteúdo aprovado.'
    }
    if (!dataAgendada) {
      novos.data_agendada = 'Data e hora do agendamento são obrigatórios.'
    }
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      const payload = {
        campanha_id: campanha.id,
        cliente_id: clienteId,
        conteudo_id: conteudoId,
        canal,
        status: 'agendada',
        data_agendada: new Date(dataAgendada).toISOString(),
      }

      const salvo = (await pb.collection('publicacoes').create(payload, {
        expand: 'campanha_id,cliente_id,conteudo_id',
      })) as unknown as PublicacaoModel

      toast({
        title: 'Publicação agendada',
        description: `Disparo agendado com sucesso para ${clienteSelecionado?.nome_contato || 'o cliente'}.`,
      })

      onSuccess(salvo)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao agendar publicação',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para agendar publicações nesta campanha/cliente.'
            : msg || 'Ocorreu um erro ao criar a publicação.',
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
            <Send className="w-5 h-5 text-[#16A34A]" />
            Nova Publicação / Disparo
          </DialogTitle>
          <DialogDescription className="text-xs text-[#64748B]">
            Agende o envio de um conteúdo aprovado da campanha <strong>
              "{campanha.nome}"
            </strong>{' '}
            para um cliente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Seletor Inteligente de Cliente (obrigatório) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#0F172A]">
              Cliente Destinatário <span className="text-[#DC2626]">*</span>
            </Label>
            <Popover open={clienteComboboxOpen} onOpenChange={setClienteComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={clienteComboboxOpen}
                  className={`w-full justify-between text-left font-normal bg-white ${
                    erros.cliente_id ? 'border-[#DC2626]' : 'border-[#E2E8F0]'
                  }`}
                >
                  {clienteSelecionado ? (
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-medium text-[#0F172A]">
                        {clienteSelecionado.nome_contato}
                      </span>
                      {clienteSelecionado.nome_empresa && (
                        <span className="text-xs text-[#64748B] truncate">
                          ({clienteSelecionado.nome_empresa})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[#94A3B8]">Selecione um cliente para disparo...</span>
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#64748B]" />
                  <Input
                    placeholder="Buscar cliente por nome, empresa..."
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    className="pl-8 h-8 text-xs"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {clientesFiltrados.length === 0 ? (
                    <p className="text-xs text-center text-[#64748B] py-3">
                      Nenhum cliente disponível encontrado.
                    </p>
                  ) : (
                    clientesFiltrados.map((cli) => {
                      const isSel = cli.id === clienteId
                      return (
                        <button
                          key={cli.id}
                          type="button"
                          onClick={() => {
                            setClienteId(cli.id)
                            if (erros.cliente_id) setErros({ ...erros, cliente_id: '' })
                            setClienteComboboxOpen(false)
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors ${
                            isSel ? 'bg-blue-50 text-[#2563EB] font-medium' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate">
                            <div className="font-semibold text-[#0F172A]">{cli.nome_contato}</div>
                            {cli.nome_empresa && (
                              <div className="text-[11px] text-[#64748B]">{cli.nome_empresa}</div>
                            )}
                          </div>
                          {isSel && <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {erros.cliente_id && <p className="text-xs text-[#DC2626]">{erros.cliente_id}</p>}
          </div>

          {/* Conteúdo Aprovado (dropdown obrigatório) */}
          <div className="space-y-1.5">
            <Label htmlFor="pub_conteudo" className="text-xs font-semibold text-[#0F172A]">
              Conteúdo Aprovado <span className="text-[#DC2626]">*</span>
            </Label>
            {conteudosAprovados.length === 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-[#B45309]">
                Nenhum conteúdo com status <strong>"aprovado"</strong> disponível nesta campanha.
                Gere e aprove um conteúdo antes de agendar publicações.
              </div>
            ) : (
              <Select
                value={conteudoId}
                onValueChange={(val) => {
                  setConteudoId(val)
                  if (erros.conteudo_id) setErros({ ...erros, conteudo_id: '' })
                }}
              >
                <SelectTrigger
                  id="pub_conteudo"
                  className={erros.conteudo_id ? 'border-[#DC2626]' : ''}
                >
                  <SelectValue placeholder="Selecione o conteúdo aprovado" />
                </SelectTrigger>
                <SelectContent>
                  {conteudosAprovados.map((cg) => (
                    <SelectItem key={cg.id} value={cg.id}>
                      <span className="font-semibold uppercase text-[10px] text-[#64748B] mr-2">
                        [{cg.tipo}]
                      </span>
                      {cg.conteudo.length > 60 ? `${cg.conteudo.substring(0, 60)}...` : cg.conteudo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {erros.conteudo_id && <p className="text-xs text-[#DC2626]">{erros.conteudo_id}</p>}
          </div>

          {/* Canal e Data Agendada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pub_canal" className="text-xs font-semibold text-[#0F172A]">
                Canal de Envio <span className="text-[#DC2626]">*</span>
              </Label>
              <Select value={canal} onValueChange={(val: CanalPublicacao) => setCanal(val)}>
                <SelectTrigger id="pub_canal">
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
                      <span>E-mail</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="sms">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-[#7C3AED]" />
                      <span>SMS</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub_data" className="text-xs font-semibold text-[#0F172A]">
                Data e Horário de Agendamento <span className="text-[#DC2626]">*</span>
              </Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="pub_data"
                  type="datetime-local"
                  value={dataAgendada}
                  onChange={(e) => {
                    setDataAgendada(e.target.value)
                    if (erros.data_agendada) setErros({ ...erros, data_agendada: '' })
                  }}
                  className={`pl-9 text-xs ${erros.data_agendada ? 'border-[#DC2626]' : ''}`}
                />
              </div>
              {erros.data_agendada && (
                <p className="text-xs text-[#DC2626]">{erros.data_agendada}</p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2 border-t border-[#E2E8F0]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || conteudosAprovados.length === 0}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Agendando...
                </>
              ) : (
                'Confirmar Agendamento'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
