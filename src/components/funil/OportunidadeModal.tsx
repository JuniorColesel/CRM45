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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  DollarSign,
  Calendar,
  FileText,
  AlertTriangle,
  Search,
  Check,
  ChevronDown,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type {
  ClienteModel,
  EtapaFunilModel,
  MotivoPerdaModel,
  OportunidadeModel,
  StatusOportunidade,
} from '@/types/clientes'
import { formatarMoeda } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface OportunidadeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  oportunidade?: OportunidadeModel | null
  initialEtapaId?: string
  etapas: EtapaFunilModel[]
  clientes: ClienteModel[]
  usuarios: Usuario[]
  motivosPerda: MotivoPerdaModel[]
  onSuccess: (oportunidade: OportunidadeModel) => void
}

export default function OportunidadeModal({
  open,
  onOpenChange,
  oportunidade,
  initialEtapaId,
  etapas,
  clientes,
  usuarios,
  motivosPerda,
  onSuccess,
}: OportunidadeModalProps) {
  const { user } = useAuth()
  const isEditing = Boolean(oportunidade)

  // Estado do formulário
  const [clienteId, setClienteId] = useState('')
  const [valor, setValor] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [status, setStatus] = useState<StatusOportunidade>('aberto')
  const [motivoPerdaId, setMotivoPerdaId] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Controle de busca de clientes no seletor
  const [clienteComboboxOpen, setClienteComboboxOpen] = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')

  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Regra de permissão para escolha do responsável:
  // - Vendedores (vendedor_1, vendedor_2): preenchido automaticamente com o usuário logado e travado para eles
  // - ceo_financeiro e coordenador_vendas: podem escolher qualquer usuário livremente
  const podeEscolherResponsavel =
    user?.perfil === 'ceo_financeiro' || user?.perfil === 'coordenador_vendas'

  useEffect(() => {
    if (open) {
      if (oportunidade) {
        setClienteId(oportunidade.cliente_id || '')
        setValor(oportunidade.valor !== undefined ? String(oportunidade.valor) : '')
        setEtapaId(oportunidade.etapa_id || etapas[0]?.id || '')
        setResponsavelId(oportunidade.responsavel_id || user?.id || '')
        setStatus(oportunidade.status || 'aberto')
        setMotivoPerdaId(oportunidade.motivo_perda_id || '')
        setDataPrevista(
          oportunidade.data_prevista_fechamento
            ? oportunidade.data_prevista_fechamento.substring(0, 10)
            : '',
        )
        setObservacoes(oportunidade.observacoes || '')
      } else {
        setClienteId('')
        setValor('')
        setEtapaId(initialEtapaId || etapas[0]?.id || '')
        // Para vendedor, fixa no logado; para admin/coord, inicia com o logado se disponível
        setResponsavelId(user?.id || usuarios[0]?.id || '')
        setStatus('aberto')
        setMotivoPerdaId('')
        setDataPrevista('')
        setObservacoes('')
      }
      setBuscaCliente('')
      setErros({})
    }
  }, [open, oportunidade, initialEtapaId, etapas, user, usuarios])

  // Filtragem de clientes para o seletor com busca
  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes
    const termo = buscaCliente.toLowerCase().trim()
    return clientes.filter((c) => {
      const matchContato = c.nome_contato?.toLowerCase().includes(termo)
      const matchEmpresa = c.nome_empresa?.toLowerCase().includes(termo)
      const matchCnpj = c.cnpj_cpf?.toLowerCase().includes(termo)
      return Boolean(matchContato || matchEmpresa || matchCnpj)
    })
  }, [clientes, buscaCliente])

  const clienteSelecionado = useMemo(() => {
    return clientes.find((c) => c.id === clienteId)
  }, [clientes, clienteId])

  const validar = (): boolean => {
    const novos: Record<string, string> = {}
    if (!clienteId) {
      novos.cliente_id = 'Selecione um cliente obrigatório.'
    }
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (!valor || isNaN(valorNum) || valorNum < 0) {
      novos.valor = 'Informe um valor válido (número positivo).'
    }
    if (!etapaId) {
      novos.etapa_id = 'Selecione uma etapa do funil.'
    }
    if (!podeEscolherResponsavel && !user?.id) {
      novos.responsavel_id = 'Usuário não identificado.'
    } else if (podeEscolherResponsavel && !responsavelId) {
      novos.responsavel_id = 'Selecione um responsável.'
    }
    if (status === 'perdido' && !motivoPerdaId) {
      novos.motivo_perda_id = 'Informe o motivo da perda da oportunidade.'
    }
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Trava Bling
    if (
      isEditing &&
      oportunidade &&
      (oportunidade.origem === 'bling' ||
        oportunidade.tipo_origem === 'bling_proposta' ||
        oportunidade.tipo_origem === 'bling_pedido')
    ) {
      toast({
        variant: 'destructive',
        title: 'Edição Bloqueada',
        description:
          'Esta oportunidade é controlada pelo Bling. Altere a informação no Bling e sincronize novamente.',
      })
      return
    }

    if (!validar()) return

    setSaving(true)
    try {
      const valorNum = parseFloat(valor.replace(',', '.'))
      const respFinal = podeEscolherResponsavel ? responsavelId : user?.id || ''

      // Regra de Fechamento Automático:
      // Ao salvar uma oportunidade com status "ganho" ou "perdido",
      // se o campo data_fechamento estiver vazio, preencher automaticamente com a data/hora atual.
      let dataFechamentoValor: string | null = null
      if (status === 'ganho' || status === 'perdido') {
        dataFechamentoValor = oportunidade?.data_fechamento || new Date().toISOString()
      } else {
        dataFechamentoValor = null
      }

      const payload: Record<string, unknown> = {
        cliente_id: clienteId,
        valor: valorNum,
        etapa_id: etapaId,
        responsavel_id: respFinal,
        status,
        motivo_perda_id: status === 'perdido' ? motivoPerdaId || null : null,
        data_prevista_fechamento: dataPrevista ? new Date(dataPrevista).toISOString() : null,
        data_fechamento: dataFechamentoValor,
        observacoes: observacoes.trim() || '',
        origem: isEditing && oportunidade?.origem ? oportunidade.origem : 'crm',
        tipo_origem: isEditing && oportunidade?.tipo_origem ? oportunidade.tipo_origem : 'crm',
      }

      let saved: OportunidadeModel
      if (isEditing && oportunidade) {
        saved = (await pb.collection('oportunidades').update(oportunidade.id, payload, {
          expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
        })) as unknown as OportunidadeModel
        toast({
          title: 'Oportunidade atualizada',
          description: `Oportunidade no valor de ${formatarMoeda(valorNum)} atualizada com sucesso.`,
        })
      } else {
        saved = (await pb.collection('oportunidades').create(payload, {
          expand: 'cliente_id,responsavel_id,etapa_id,motivo_perda_id',
        })) as unknown as OportunidadeModel
        toast({
          title: 'Oportunidade criada',
          description: `Oportunidade no valor de ${formatarMoeda(valorNum)} registrada com sucesso.`,
        })
      }

      onSuccess(saved)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar oportunidade',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para realizar esta operação na oportunidade.'
            : msg || 'Ocorreu um erro ao salvar os dados.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#2563EB]" />
            {isEditing ? 'Editar Oportunidade' : 'Nova Oportunidade'}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#64748B]">
            {isEditing
              ? 'Atualize os dados comerciais, etapa e valor desta oportunidade de negócio.'
              : 'Cadastre uma nova oportunidade vinculada a um cliente para acompanhar no funil.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Cliente (obrigatório, seletor com busca) */}
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
                    <span className="text-[#94A3B8]">Selecione um cliente...</span>
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

          {/* Valor (obrigatório) e Etapa (obrigatória) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="op_valor" className="text-xs font-semibold text-[#0F172A]">
                Valor da Proposta (R$) <span className="text-[#DC2626]">*</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="op_valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={valor}
                  onChange={(e) => {
                    setValor(e.target.value)
                    if (erros.valor) setErros({ ...erros, valor: '' })
                  }}
                  placeholder="Ex: 25000.00"
                  className={`pl-9 ${erros.valor ? 'border-[#DC2626]' : ''}`}
                />
              </div>
              {erros.valor && <p className="text-xs text-[#DC2626]">{erros.valor}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="op_etapa" className="text-xs font-semibold text-[#0F172A]">
                Etapa do Funil <span className="text-[#DC2626]">*</span>
              </Label>
              <Select
                value={etapaId}
                onValueChange={(val) => {
                  setEtapaId(val)
                  if (erros.etapa_id) setErros({ ...erros, etapa_id: '' })
                }}
              >
                <SelectTrigger id="op_etapa">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: et.cor || '#2563EB' }}
                        />
                        <span>
                          {et.ordem}. {et.nome}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.etapa_id && <p className="text-xs text-[#DC2626]">{erros.etapa_id}</p>}
            </div>
          </div>

          {/* Responsável e Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="op_responsavel" className="text-xs font-semibold text-[#0F172A]">
                Responsável <span className="text-[#DC2626]">*</span>
              </Label>
              {podeEscolherResponsavel ? (
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger id="op_responsavel">
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
                  id="op_responsavel"
                  value={user?.nome ? `${user.nome} (Você)` : 'Você'}
                  disabled
                  className="bg-slate-100 text-[#64748B] cursor-not-allowed"
                />
              )}
              {!podeEscolherResponsavel && (
                <p className="text-[11px] text-[#64748B]">
                  Preenchido automaticamente com seu usuário (vendedor).
                </p>
              )}
              {erros.responsavel_id && (
                <p className="text-xs text-[#DC2626]">{erros.responsavel_id}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="op_status" className="text-xs font-semibold text-[#0F172A]">
                Status da Oportunidade
              </Label>
              <Select
                value={status}
                onValueChange={(val: StatusOportunidade) => {
                  setStatus(val)
                  if (val !== 'perdido') {
                    setMotivoPerdaId('')
                    if (erros.motivo_perda_id) {
                      setErros({ ...erros, motivo_perda_id: '' })
                    }
                  }
                }}
              >
                <SelectTrigger id="op_status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">
                    <span className="text-[#64748B] font-medium">Em Aberto</span>
                  </SelectItem>
                  <SelectItem value="ganho">
                    <span className="text-[#16A34A] font-semibold">Ganho (Fechado)</span>
                  </SelectItem>
                  <SelectItem value="perdido">
                    <span className="text-[#DC2626] font-semibold">Perdido</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Previsão de Fechamento e Motivo de Perda (condicional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="op_prevista" className="text-xs font-semibold text-[#0F172A]">
                Data Prevista de Fechamento
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="op_prevista"
                  type="date"
                  value={dataPrevista}
                  onChange={(e) => setDataPrevista(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {status === 'perdido' ? (
              <div className="space-y-1.5">
                <Label
                  htmlFor="op_motivo"
                  className="text-xs font-semibold text-[#DC2626] flex items-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Motivo da Perda <span className="text-[#DC2626]">*</span>
                </Label>
                <Select
                  value={motivoPerdaId}
                  onValueChange={(val) => {
                    setMotivoPerdaId(val)
                    if (erros.motivo_perda_id) {
                      setErros({ ...erros, motivo_perda_id: '' })
                    }
                  }}
                >
                  <SelectTrigger
                    id="op_motivo"
                    className={erros.motivo_perda_id ? 'border-[#DC2626]' : ''}
                  >
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {motivosPerda.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {erros.motivo_perda_id && (
                  <p className="text-xs text-[#DC2626]">{erros.motivo_perda_id}</p>
                )}
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label
              htmlFor="op_obs"
              className="text-xs font-semibold text-[#0F172A] flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5 text-[#64748B]" />
              Observações
            </Label>
            <Textarea
              id="op_obs"
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Descreva o escopo da oportunidade, necessidades técnicas, negociações ou pontos de atenção..."
              className="resize-none"
            />
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
              disabled={saving}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : isEditing ? (
                'Salvar Alterações'
              ) : (
                'Cadastrar Oportunidade'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
