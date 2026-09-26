import React, { useState, useEffect, useMemo } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Loader2,
  Calendar,
  Search,
  Check,
  ChevronDown,
  Plus,
  Phone,
  MapPin,
  Mail,
  MessageSquare,
  Users as UsersIcon,
  Tag,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { ClienteModel, TarefaModel, TipoTarefa } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface TarefaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialClienteId?: string
  initialTipo?: TipoTarefa
  initialDescricao?: string
  initialDataHora?: string
  clientes?: ClienteModel[]
  usuarios?: Usuario[]
  onSuccess?: (tarefa: TarefaModel) => void
}

export const TIPO_TAREFA_CONFIG: Record<
  TipoTarefa,
  { label: string; icon: React.ComponentType<{ className?: string }>; bg: string; text: string }
> = {
  ligacao: { label: 'Ligação', icon: Phone, bg: 'bg-emerald-50', text: 'text-[#16A34A]' },
  visita: { label: 'Visita', icon: MapPin, bg: 'bg-purple-50', text: 'text-[#7C3AED]' },
  email: { label: 'E-mail', icon: Mail, bg: 'bg-blue-50', text: 'text-[#2563EB]' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, bg: 'bg-green-50', text: 'text-green-700' },
  reuniao: { label: 'Reunião', icon: Calendar, bg: 'bg-amber-50', text: 'text-amber-700' },
  outro: { label: 'Outro', icon: Tag, bg: 'bg-slate-100', text: 'text-slate-700' },
}

export default function TarefaModal({
  open,
  onOpenChange,
  initialClienteId,
  initialTipo = 'ligacao',
  initialDescricao = '',
  initialDataHora,
  clientes = [],
  usuarios = [],
  onSuccess,
}: TarefaModalProps) {
  const { user } = useAuth()

  // Form states
  const [clienteId, setClienteId] = useState('')
  const [tipo, setTipo] = useState<TipoTarefa>('ligacao')
  const [descricao, setDescricao] = useState('')
  const [dataHora, setDataHora] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [concluida, setConcluida] = useState(false)

  // Combobox cliente
  const [clienteComboboxOpen, setClienteComboboxOpen] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')

  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Regra de permissão: ceo_financeiro e coordenador_vendas podem escolher o responsável;
  // vendedores ficam travados no usuário logado.
  const podeEscolherResponsavel =
    user?.perfil === 'ceo_financeiro' || user?.perfil === 'coordenador_vendas'

  // Helper para datetime-local agora + 1 hora
  const getDefaultDateTime = () => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    // Ajustar offset local para string ISO compativel com input datetime-local
    const pad = (n: number) => String(n).padStart(2, '0')
    const ano = d.getFullYear()
    const mes = pad(d.getMonth() + 1)
    const dia = pad(d.getDate())
    const hora = pad(d.getHours())
    const min = pad(d.getMinutes())
    return `${ano}-${mes}-${dia}T${hora}:${min}`
  }

  useEffect(() => {
    if (open) {
      setClienteId(initialClienteId || '')
      setTipo(initialTipo)
      setDescricao(initialDescricao)
      setDataHora(initialDataHora || getDefaultDateTime())
      setResponsavelId(user?.id || (usuarios[0]?.id ?? ''))
      setConcluida(false)
      setBuscaCliente('')
      setErros({})
    }
  }, [open, initialClienteId, initialTipo, initialDescricao, initialDataHora, user, usuarios])

  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes
    const termo = buscaCliente.toLowerCase().trim()
    return clientes.filter((c) => {
      const matchContato = c.nome_contato?.toLowerCase().includes(termo)
      const matchEmpresa = c.nome_empresa?.toLowerCase().includes(termo)
      const matchCnpj = c.cnpj_cpf?.toLowerCase().includes(termo)
      const matchCidade = c.cidade?.toLowerCase().includes(termo)
      return Boolean(matchContato || matchEmpresa || matchCnpj || matchCidade)
    })
  }, [clientes, buscaCliente])

  const clienteSelecionado = useMemo(() => {
    return clientes.find((c) => c.id === clienteId)
  }, [clientes, clienteId])

  const validar = (): boolean => {
    const novos: Record<string, string> = {}
    if (!clienteId) {
      novos.cliente_id = 'Selecione o cliente obrigatório.'
    }
    if (!tipo) {
      novos.tipo = 'Selecione o tipo de tarefa.'
    }
    if (!descricao.trim()) {
      novos.descricao = 'Informe a descrição da tarefa.'
    }
    if (!dataHora) {
      novos.data_hora = 'Defina a data e o horário da tarefa.'
    }
    if (podeEscolherResponsavel && !responsavelId) {
      novos.responsavel_id = 'Selecione um responsável.'
    } else if (!podeEscolherResponsavel && !user?.id) {
      novos.responsavel_id = 'Usuário não autenticado.'
    }
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      const respFinal = podeEscolherResponsavel ? responsavelId : user?.id || ''
      const payload = {
        cliente_id: clienteId,
        responsavel_id: respFinal,
        tipo,
        descricao: descricao.trim(),
        data_hora: new Date(dataHora).toISOString(),
        concluida,
        data_conclusao: concluida ? new Date().toISOString() : null,
      }

      const nova = await pb.collection('tarefas').create<TarefaModel>(payload, {
        expand: 'responsavel_id,cliente_id',
      })

      toast({
        title: 'Tarefa criada com sucesso',
        description: `Agendada para ${new Date(dataHora).toLocaleString('pt-BR')}.`,
      })

      if (onSuccess) {
        onSuccess(nova)
      }
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao criar tarefa',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para cadastrar esta tarefa para o responsável selecionado.'
            : msg || 'Ocorreu um erro ao salvar a tarefa.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#16A34A]" />
            Nova Tarefa
          </DialogTitle>
          <DialogDescription className="text-xs text-[#64748B]">
            Agende uma atividade comercial (ligação, visita, reunião ou mensagem) vinculada a um
            cliente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Seletor de Cliente com Busca Textual (Obrigatório) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#0F172A]">
              Cliente <span className="text-[#DC2626]">*</span>
            </Label>
            <Popover open={clienteComboboxOpen} onOpenChange={setClienteComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={clienteComboboxOpen}
                  className={`w-full justify-between text-left font-normal bg-white h-10 ${
                    erros.cliente_id ? 'border-[#DC2626]' : 'border-[#E2E8F0]'
                  }`}
                >
                  {clienteSelecionado ? (
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-semibold text-[#0F172A]">
                        {clienteSelecionado.nome_contato}
                      </span>
                      {clienteSelecionado.nome_empresa && (
                        <span className="text-xs text-[#64748B] truncate">
                          ({clienteSelecionado.nome_empresa})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[#94A3B8]">Pesquisar e selecionar cliente...</span>
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#64748B]" />
                  <Input
                    placeholder="Buscar por contato, empresa, cidade ou CPF/CNPJ..."
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    className="pl-8 h-8 text-xs"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {clientesFiltrados.length === 0 ? (
                    <p className="text-xs text-center text-[#64748B] py-3">
                      Nenhum cliente encontrado.
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
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                            isSel ? 'bg-emerald-50 text-[#16A34A] font-medium' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate">
                            <div className="font-semibold text-[#0F172A]">{cli.nome_contato}</div>
                            <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                              {cli.nome_empresa && <span>{cli.nome_empresa}</span>}
                              {cli.cidade && <span>• {cli.cidade}</span>}
                            </div>
                          </div>
                          {isSel && <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 ml-2" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {erros.cliente_id && <p className="text-xs text-[#DC2626]">{erros.cliente_id}</p>}
          </div>

          {/* Tipo e Data/Hora */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tarefa_tipo" className="text-xs font-semibold text-[#0F172A]">
                Tipo de Ação <span className="text-[#DC2626]">*</span>
              </Label>
              <Select
                value={tipo}
                onValueChange={(val: TipoTarefa) => {
                  setTipo(val)
                  if (erros.tipo) setErros({ ...erros, tipo: '' })
                }}
              >
                <SelectTrigger id="tarefa_tipo" className={erros.tipo ? 'border-[#DC2626]' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ligacao">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[#16A34A]" />
                      <span>Ligação Telefônica</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="visita">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#7C3AED]" />
                      <span>Visita Comercial</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>E-mail</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="whatsapp">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-green-600" />
                      <span>WhatsApp</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="reuniao">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      <span>Reunião / Apresentação</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="outro">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-slate-600" />
                      <span>Outro</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {erros.tipo && <p className="text-xs text-[#DC2626]">{erros.tipo}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tarefa_data_hora" className="text-xs font-semibold text-[#0F172A]">
                Data e Horário <span className="text-[#DC2626]">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="tarefa_data_hora"
                  type="datetime-local"
                  value={dataHora}
                  onChange={(e) => {
                    setDataHora(e.target.value)
                    if (erros.data_hora) setErros({ ...erros, data_hora: '' })
                  }}
                  className={erros.data_hora ? 'border-[#DC2626]' : ''}
                />
              </div>
              {erros.data_hora && <p className="text-xs text-[#DC2626]">{erros.data_hora}</p>}
            </div>
          </div>

          {/* Descrição da Tarefa (Obrigatório) */}
          <div className="space-y-1.5">
            <Label htmlFor="tarefa_descricao" className="text-xs font-semibold text-[#0F172A]">
              Descrição da Tarefa <span className="text-[#DC2626]">*</span>
            </Label>
            <Textarea
              id="tarefa_descricao"
              rows={3}
              value={descricao}
              onChange={(e) => {
                setDescricao(e.target.value)
                if (erros.descricao) setErros({ ...erros, descricao: '' })
              }}
              placeholder="Ex: Ligar para apresentar nova tabela de transformadores e agendar visita..."
              className={`resize-none ${erros.descricao ? 'border-[#DC2626]' : ''}`}
            />
            {erros.descricao && <p className="text-xs text-[#DC2626]">{erros.descricao}</p>}
          </div>

          {/* Responsável */}
          <div className="space-y-1.5">
            <Label htmlFor="tarefa_responsavel" className="text-xs font-semibold text-[#0F172A]">
              Responsável <span className="text-[#DC2626]">*</span>
            </Label>
            {podeEscolherResponsavel ? (
              <Select
                value={responsavelId}
                onValueChange={(val) => {
                  setResponsavelId(val)
                  if (erros.responsavel_id) setErros({ ...erros, responsavel_id: '' })
                }}
              >
                <SelectTrigger
                  id="tarefa_responsavel"
                  className={erros.responsavel_id ? 'border-[#DC2626]' : ''}
                >
                  <SelectValue placeholder="Selecione o responsável" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <div className="flex items-center gap-2">
                        <UsersIcon className="w-3.5 h-3.5 text-[#64748B]" />
                        <span>
                          {u.nome} ({u.perfil})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="tarefa_responsavel"
                value={user?.nome ? `${user.nome} (Você)` : 'Você'}
                disabled
                className="bg-slate-100 text-[#64748B] cursor-not-allowed"
              />
            )}
            {!podeEscolherResponsavel && (
              <p className="text-[11px] text-[#64748B]">
                Preenchido com o usuário logado devido ao perfil comercial.
              </p>
            )}
            {erros.responsavel_id && (
              <p className="text-xs text-[#DC2626]">{erros.responsavel_id}</p>
            )}
          </div>

          {/* Concluída inicialmente */}
          <div className="flex items-center space-x-2 pt-1 bg-slate-50 p-2.5 rounded-lg border border-[#E2E8F0]">
            <Checkbox
              id="tarefa_concluida_init"
              checked={concluida}
              onCheckedChange={(checked) => setConcluida(Boolean(checked))}
            />
            <Label
              htmlFor="tarefa_concluida_init"
              className="text-xs font-medium text-[#0F172A] cursor-pointer"
            >
              Marcar como já concluída imediatamente
            </Label>
          </div>

          <DialogFooter className="pt-2 border-t border-[#E2E8F0] gap-2">
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
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Salvando Tarefa...
                </>
              ) : (
                'Salvar Tarefa'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
