import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Phone,
  PhoneCall,
  History,
  Plus,
  RefreshCw,
  Search,
  User,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  PhoneMissed,
  CheckCircle2,
  Calendar,
  X,
  Building2,
  Loader2,
  CalendarPlus,
  FileText,
  ChevronDown,
  Check,
  UserPlus,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type {
  LigacaoModel,
  ClienteModel,
  TipoLigacao,
  ResultadoLigacao,
  TarefaModel,
} from '@/types/clientes'
import { formatarDataHora, formatarDuracao } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { ClienteInlineModal } from '@/components/clientes/ClienteInlineModal'

export default function LigacoesPage() {
  const { user } = useAuth()

  // Aba ativa: 'registrar' | 'historico'
  const [tabAtiva, setTabAtiva] = useState<string>('registrar')

  // Dados
  const [ligacoes, setLigacoes] = useState<LigacaoModel[]>([])
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros em tempo real para o Histórico
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')

  // Formulário da aba "Registrar Ligação"
  const [formClienteId, setFormClienteId] = useState('')
  const [formTipo, setFormTipo] = useState<TipoLigacao>('saida')
  const [formResultado, setFormResultado] = useState<ResultadoLigacao | ''>('atendeu')
  const [formDuracao, setFormDuracao] = useState('')
  const [formObservacoes, setFormObservacoes] = useState('')
  const [formProximaAcao, setFormProximaAcao] = useState('')
  const [formDataProximaAcao, setFormDataProximaAcao] = useState('')

  // Combobox do cliente no formulário
  const [clienteComboboxOpen, setClienteComboboxOpen] = useState(false)
  const [buscaClienteForm, setBuscaClienteForm] = useState('')
  const [modalNovoClienteOpen, setModalNovoClienteOpen] = useState(false)

  const [saving, setSaving] = useState(false)
  const [errosForm, setErrosForm] = useState<Record<string, string>>({})

  // Helper de data local padrão (agora) para datetime-local
  const getNowLocal = () => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // Carregar dados
  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      const [ligacoesRes, clientesRes, usuariosRes] = await Promise.all([
        pb.collection('ligacoes').getFullList<LigacaoModel>({
          sort: '-data_hora',
          expand: 'responsavel_id,cliente_id',
        }),
        pb.collection('clientes').getFullList<ClienteModel>({
          sort: 'nome_contato',
        }),
        pb
          .collection('usuarios')
          .getFullList<Usuario>({
            sort: 'nome',
          })
          .catch(() => (user ? [user] : [])),
      ])

      setLigacoes(ligacoesRes)
      setClientes(clientesRes)
      setUsuarios(usuariosRes.length > 0 ? usuariosRes : user ? [user] : [])
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar ligações',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para visualizar o histórico de chamadas.'
            : 'Não foi possível carregar as ligações.',
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Lista de clientes filtrada para o combobox
  const clientesFiltrados = useMemo(() => {
    if (!buscaClienteForm.trim()) return clientes
    const termo = buscaClienteForm.toLowerCase().trim()
    return clientes.filter((c) => {
      const matchContato = c.nome_contato?.toLowerCase().includes(termo)
      const matchEmpresa = c.nome_empresa?.toLowerCase().includes(termo)
      const matchCnpj = c.cnpj_cpf?.toLowerCase().includes(termo)
      const matchCidade = c.cidade?.toLowerCase().includes(termo)
      return Boolean(matchContato || matchEmpresa || matchCnpj || matchCidade)
    })
  }, [clientes, buscaClienteForm])

  const clienteSelecionado = useMemo(() => {
    return clientes.find((c) => c.id === formClienteId)
  }, [clientes, formClienteId])

  // Validação do formulário
  const validarForm = (): boolean => {
    const novos: Record<string, string> = {}
    if (!formClienteId) {
      novos.cliente_id = 'Selecione um cliente obrigatório.'
    }
    if (!formTipo) {
      novos.tipo = 'Selecione o tipo de ligação.'
    }
    if (formProximaAcao.trim() && !formDataProximaAcao) {
      novos.data_proxima_acao = 'Informe a data e o horário para agendar a próxima ação.'
    }
    setErrosForm(novos)
    return Object.keys(novos).length === 0
  }

  // Submissão do formulário
  const handleRegistrarLigacao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validarForm()) return

    setSaving(true)
    try {
      const agoraIso = new Date().toISOString()
      const duracaoNum = formDuracao ? parseInt(formDuracao, 10) : 0

      const payloadLigacao = {
        cliente_id: formClienteId,
        responsavel_id: user?.id,
        data_hora: agoraIso,
        duracao_segundos: isNaN(duracaoNum) ? 0 : duracaoNum,
        tipo: formTipo,
        resultado: formResultado || null,
        observacoes: formObservacoes.trim() || '',
        proxima_acao: formProximaAcao.trim() || '',
        data_proxima_acao: formDataProximaAcao ? new Date(formDataProximaAcao).toISOString() : null,
      }

      const novaLigacao = await pb.collection('ligacoes').create<LigacaoModel>(payloadLigacao, {
        expand: 'responsavel_id,cliente_id',
      })

      // Se "Próxima ação" estiver preenchida, cria automaticamente UMA tarefa vinculada
      let tarefaCriada: TarefaModel | null = null
      if (formProximaAcao.trim()) {
        const dataTarefaIso = formDataProximaAcao
          ? new Date(formDataProximaAcao).toISOString()
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

        const payloadTarefa = {
          cliente_id: formClienteId,
          responsavel_id: user?.id,
          tipo: 'ligacao',
          descricao: formProximaAcao.trim(),
          data_hora: dataTarefaIso,
          concluida: false,
        }

        tarefaCriada = await pb.collection('tarefas').create<TarefaModel>(payloadTarefa, {
          expand: 'responsavel_id,cliente_id',
        })
      }

      // REGRA PROSPECÇÃO CRM-NATIVA (Etapa 5):
      // Nova ligação com resultado positivo / proposta / reunião / interesse
      // se não houver oportunidade CRM ativa para o cliente, cria oportunidade em Prospecção
      if (formResultado === 'atendeu') {
        try {
          const opsAbertas = await pb.collection('oportunidades').getList(1, 1, {
            filter: `cliente_id = '${formClienteId}' && status = 'aberto'`,
            requestKey: null,
          })
          if (opsAbertas.totalItems === 0) {
            const etapas = await pb.collection('etapas_funil').getList(1, 1, {
              filter: 'nome = "Prospecção"',
              sort: 'ordem',
              requestKey: null,
            })
            const etapaProspId = etapas.items[0]?.id || '66j47f9qg6x925k'
            const hojeStr = new Date().toISOString().slice(0, 10)
            const cliEncontrado = clientes.find((c) => c.id === formClienteId)

            await pb.collection('oportunidades').create({
              cliente_id: formClienteId,
              titulo: `Lead Ligação: ${cliEncontrado?.nome_contato || cliEncontrado?.nome_empresa || 'Cliente'}`,
              etapa_id: etapaProspId,
              status: 'aberto',
              origem: 'crm',
              tipo_origem: 'crm',
              data_origem: hojeStr,
              valor: 0,
              responsavel_id: user?.id || '',
              vendedor: user?.id || '',
              observacoes: `Criada automaticamente a partir de ligação: ${formObservacoes.trim()}`,
            })
            console.log(
              '[LIGACOES] Oportunidade em Prospecção criada com sucesso para cliente:',
              formClienteId,
            )
          }
        } catch (errOpLig) {
          console.error('[LIGACOES] Erro ao deduplicar/criar oportunidade comercial:', errOpLig)
        }
      }

      // Atualiza lista em memória
      setLigacoes((prev) => [novaLigacao, ...prev])

      // Toast explicativo
      if (tarefaCriada) {
        toast({
          title: 'Ligação registrada e tarefa agendada!',
          description: `Chamada salva com sucesso e nova tarefa de retorno agendada para ${new Date(formDataProximaAcao).toLocaleString('pt-BR')}.`,
        })
      } else {
        toast({
          title: 'Ligação registrada com sucesso',
          description: 'A chamada foi adicionada ao histórico do cliente.',
        })
      }

      // Limpar formulário
      setFormClienteId('')
      setFormTipo('saida')
      setFormResultado('atendeu')
      setFormDuracao('')
      setFormObservacoes('')
      setFormProximaAcao('')
      setFormDataProximaAcao('')
      setErrosForm({})

      // Muda para a aba de histórico para o usuário ver o registro recém-criado
      setTabAtiva('historico')
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar ligação',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para salvar esta chamada.'
            : msg || 'Ocorreu um erro ao salvar o registro de ligação.',
      })
    } finally {
      setSaving(false)
    }
  }

  // Filtragem de ligações para a aba Histórico
  const ligacoesFiltradas = useMemo(() => {
    return ligacoes.filter((lig) => {
      // Filtro por responsável
      if (filtroResponsavel !== 'todos' && lig.responsavel_id !== filtroResponsavel) {
        return false
      }

      // Busca textual por nome do cliente ou empresa
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const clienteNome = lig.expand?.cliente_id?.nome_contato?.toLowerCase() || ''
        const clienteEmpresa = lig.expand?.cliente_id?.nome_empresa?.toLowerCase() || ''
        const obs = lig.observacoes?.toLowerCase() || ''
        const prox = lig.proxima_acao?.toLowerCase() || ''
        const match =
          clienteNome.includes(termo) ||
          clienteEmpresa.includes(termo) ||
          obs.includes(termo) ||
          prox.includes(termo)
        if (!match) return false
      }

      return true
    })
  }, [ligacoes, filtroResponsavel, busca])

  // Badge do tipo com ícones coloridos solicitados
  // entrada = verde, saida = azul, perdida = vermelho
  const renderBadgeTipo = (tipo: TipoLigacao) => {
    switch (tipo) {
      case 'entrada':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold flex items-center gap-1 shrink-0">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Entrada (Recebida)
          </Badge>
        )
      case 'saida':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-xs font-semibold flex items-center gap-1 shrink-0">
            <ArrowUpRight className="w-3.5 h-3.5" />
            Saída (Efetuada)
          </Badge>
        )
      case 'perdida':
        return (
          <Badge className="bg-red-50 text-[#DC2626] border-red-200 text-xs font-semibold flex items-center gap-1 shrink-0">
            <PhoneMissed className="w-3.5 h-3.5" />
            Perdida
          </Badge>
        )
    }
  }

  const renderBadgeResultado = (r?: ResultadoLigacao) => {
    switch (r) {
      case 'atendeu':
        return (
          <Badge
            variant="outline"
            className="text-emerald-700 bg-emerald-50 text-[11px] font-medium"
          >
            Atendeu
          </Badge>
        )
      case 'nao_atendeu':
        return (
          <Badge variant="outline" className="text-amber-700 bg-amber-50 text-[11px] font-medium">
            Não Atendeu
          </Badge>
        )
      case 'caixa_postal':
        return (
          <Badge variant="outline" className="text-slate-700 bg-slate-100 text-[11px] font-medium">
            Caixa Postal
          </Badge>
        )
      case 'ocupado':
        return (
          <Badge variant="outline" className="text-orange-700 bg-orange-50 text-[11px] font-medium">
            Ocupado
          </Badge>
        )
      case 'desligou':
        return (
          <Badge variant="outline" className="text-red-700 bg-red-50 text-[11px] font-medium">
            Desligou
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <Phone className="w-6 h-6 text-[#7C3AED]" />
            Ligações
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Registro ágil de contatos telefônicos, agendamento de retorno e histórico completo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar ligações"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Tabs Principais */}
      <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="registrar"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <PhoneCall className="w-4 h-4" />
            Registrar Ligação
          </TabsTrigger>
          <TabsTrigger
            value="historico"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            Histórico ({ligacoesFiltradas.length})
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA 1: REGISTRAR LIGAÇÃO ================= */}
        <TabsContent value="registrar" className="focus-visible:outline-none">
          <div className="max-w-2xl bg-white p-6 sm:p-8 rounded-2xl border border-[#E2E8F0] shadow-sm">
            <div className="mb-6 pb-4 border-b border-[#E2E8F0]">
              <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-[#7C3AED]" />
                Novo Registro Telefônico
              </h3>
              <p className="text-xs text-[#64748B] mt-1">
                Preencha os detalhes da ligação. Se informar uma próxima ação, uma tarefa será
                gerada automaticamente na sua agenda.
              </p>
            </div>

            <form onSubmit={handleRegistrarLigacao} className="space-y-4">
              {/* Cliente com busca (Obrigatório) */}
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
                        errosForm.cliente_id ? 'border-[#DC2626]' : 'border-[#E2E8F0]'
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
                          {clienteSelecionado.telefone && (
                            <span className="text-xs text-[#7C3AED] ml-auto shrink-0 font-medium">
                              {clienteSelecionado.telefone}
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
                        placeholder="Buscar por contato, empresa, telefone..."
                        value={buscaClienteForm}
                        onChange={(e) => setBuscaClienteForm(e.target.value)}
                        className="pl-8 h-8 text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1">
                      {clientesFiltrados.length === 0 ? (
                        <div className="py-3 px-2 text-center space-y-2">
                          <p className="text-xs text-[#64748B]">Nenhum cliente encontrado.</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setClienteComboboxOpen(false)
                              setModalNovoClienteOpen(true)
                            }}
                            className="w-full text-xs font-semibold text-[#7C3AED] border-purple-300 hover:bg-purple-50 h-8 flex items-center justify-center gap-1.5"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Cadastrar novo cliente
                          </Button>
                        </div>
                      ) : (
                        clientesFiltrados.map((cli) => {
                          const isSel = cli.id === formClienteId
                          return (
                            <button
                              key={cli.id}
                              type="button"
                              onClick={() => {
                                setFormClienteId(cli.id)
                                if (errosForm.cliente_id) {
                                  setErrosForm({ ...errosForm, cliente_id: '' })
                                }
                                setClienteComboboxOpen(false)
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                                isSel
                                  ? 'bg-purple-50 text-[#7C3AED] font-medium'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="truncate">
                                <div className="font-semibold text-[#0F172A]">
                                  {cli.nome_contato}
                                </div>
                                <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                                  {cli.nome_empresa && <span>{cli.nome_empresa}</span>}
                                  {cli.telefone && <span>• {cli.telefone}</span>}
                                </div>
                              </div>
                              {isSel && (
                                <Check className="w-3.5 h-3.5 text-[#7C3AED] shrink-0 ml-2" />
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {errosForm.cliente_id && (
                  <p className="text-xs text-[#DC2626]">{errosForm.cliente_id}</p>
                )}
              </div>

              {/* Tipo e Resultado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="form_tipo" className="text-xs font-semibold text-[#0F172A]">
                    Tipo de Ligação <span className="text-[#DC2626]">*</span>
                  </Label>
                  <Select
                    value={formTipo}
                    onValueChange={(val: TipoLigacao) => {
                      setFormTipo(val)
                      if (errosForm.tipo) setErrosForm({ ...errosForm, tipo: '' })
                    }}
                  >
                    <SelectTrigger id="form_tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="saida">
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>Saída (Efetuada)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="entrada">
                        <div className="flex items-center gap-2">
                          <ArrowDownLeft className="w-3.5 h-3.5 text-[#16A34A]" />
                          <span>Entrada (Recebida)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="perdida">
                        <div className="flex items-center gap-2">
                          <PhoneMissed className="w-3.5 h-3.5 text-[#DC2626]" />
                          <span>Perdida</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errosForm.tipo && <p className="text-xs text-[#DC2626]">{errosForm.tipo}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="form_resultado" className="text-xs font-semibold text-[#0F172A]">
                    Resultado da Chamada
                  </Label>
                  <Select
                    value={formResultado}
                    onValueChange={(val: ResultadoLigacao) => setFormResultado(val)}
                  >
                    <SelectTrigger id="form_resultado">
                      <SelectValue placeholder="Selecione o resultado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="atendeu">Atendeu</SelectItem>
                      <SelectItem value="nao_atendeu">Não Atendeu</SelectItem>
                      <SelectItem value="caixa_postal">Caixa Postal</SelectItem>
                      <SelectItem value="ocupado">Ocupado</SelectItem>
                      <SelectItem value="desligou">Desligou</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Duração em segundos */}
              <div className="space-y-1.5">
                <Label htmlFor="form_duracao" className="text-xs font-semibold text-[#0F172A]">
                  Duração da Ligação (em segundos)
                </Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                  <Input
                    id="form_duracao"
                    type="number"
                    min="0"
                    placeholder="Ex: 180 (para 3 minutos)"
                    value={formDuracao}
                    onChange={(e) => setFormDuracao(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {formDuracao && (
                  <p className="text-[11px] text-[#64748B]">
                    Equivalente a: <strong>{formatarDuracao(parseInt(formDuracao, 10))}</strong>
                  </p>
                )}
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <Label htmlFor="form_obs" className="text-xs font-semibold text-[#0F172A]">
                  Observações / Resumo da Conversa
                </Label>
                <Textarea
                  id="form_obs"
                  rows={3}
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                  placeholder="Resuma os assuntos tratados, objeções levantadas, interesses do cliente..."
                  className="resize-none"
                />
              </div>

              {/* Bloco de Próxima Ação com criação automática de Tarefa */}
              <div className="p-4 rounded-xl border border-purple-100 bg-purple-50/40 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarPlus className="w-4 h-4 text-[#7C3AED]" />
                  <h4 className="text-xs font-bold text-[#0F172A]">
                    Próxima Ação & Agendamento Automático
                  </h4>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  Ao preencher a próxima ação, uma tarefa será gerada automaticamente na tela de
                  Prospecção com você como responsável.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="form_prox" className="text-xs font-semibold text-[#0F172A]">
                    Descrição da Próxima Ação
                  </Label>
                  <Input
                    id="form_prox"
                    value={formProximaAcao}
                    onChange={(e) => {
                      setFormProximaAcao(e.target.value)
                      if (!e.target.value.trim() && errosForm.data_proxima_acao) {
                        setErrosForm({ ...errosForm, data_proxima_acao: '' })
                      }
                    }}
                    placeholder="Ex: Retornar com cotação técnica ajustada..."
                    className="bg-white"
                  />
                </div>

                {formProximaAcao.trim() && (
                  <div className="space-y-1.5 pt-1 animate-fade-in">
                    <Label
                      htmlFor="form_data_prox"
                      className="text-xs font-semibold text-[#0F172A]"
                    >
                      Data e Horário da Próxima Ação <span className="text-[#DC2626]">*</span>
                    </Label>
                    <Input
                      id="form_data_prox"
                      type="datetime-local"
                      value={formDataProximaAcao}
                      onChange={(e) => {
                        setFormDataProximaAcao(e.target.value)
                        if (errosForm.data_proxima_acao) {
                          setErrosForm({ ...errosForm, data_proxima_acao: '' })
                        }
                      }}
                      className={`bg-white ${
                        errosForm.data_proxima_acao ? 'border-[#DC2626]' : ''
                      }`}
                    />
                    {errosForm.data_proxima_acao && (
                      <p className="text-xs text-[#DC2626]">{errosForm.data_proxima_acao}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Botão de envio */}
              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold px-6 shadow-sm"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    'Salvar Registro de Ligação'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* ================= ABA 2: HISTÓRICO DE LIGAÇÕES ================= */}
        <TabsContent value="historico" className="focus-visible:outline-none space-y-4">
          {/* Filtros em tempo real */}
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Busca por cliente ou observações */}
              <div className="md:col-span-7 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  placeholder="Buscar por cliente, empresa ou conteúdo das anotações..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9 bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9"
                />
                {busca && (
                  <button
                    onClick={() => setBusca('')}
                    className="absolute right-2.5 top-2.5 text-xs text-[#64748B] hover:text-[#0F172A]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filtro por Responsável */}
              <div className="md:col-span-5">
                <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
                  <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9">
                    <div className="flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                      <SelectValue placeholder="Responsável" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Responsáveis</SelectItem>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome} ({u.perfil})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Lista de Chamadas */}
          {loading ? (
            <div className="py-16 text-center text-xs text-[#64748B] flex items-center justify-center gap-2 bg-white rounded-2xl border border-[#E2E8F0]">
              <RefreshCw className="w-4 h-4 animate-spin text-[#7C3AED]" />
              Carregando histórico de ligações...
            </div>
          ) : ligacoesFiltradas.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-[#E2E8F0] bg-white space-y-2">
              <Phone className="w-10 h-10 text-[#94A3B8] mx-auto" />
              <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma ligação encontrada</h4>
              <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                Registre os contatos telefônicos na aba ao lado para acompanhar o histórico
                comercial.
              </p>
              <Button
                onClick={() => setTabAtiva('registrar')}
                size="sm"
                variant="outline"
                className="text-xs mt-2"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Registrar Ligação
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm divide-y divide-[#E2E8F0] overflow-hidden">
              {ligacoesFiltradas.map((lig) => {
                const cliente = lig.expand?.cliente_id
                const respNome = lig.expand?.responsavel_id?.nome || 'Responsável'

                return (
                  <div
                    key={lig.id}
                    className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#0F172A]">
                          {cliente?.nome_contato || 'Cliente não identificado'}
                        </span>
                        {cliente?.nome_empresa && (
                          <span className="text-xs text-[#64748B] flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-[#94A3B8]" />
                            {cliente.nome_empresa}
                          </span>
                        )}
                        {cliente?.telefone && (
                          <span className="text-xs text-[#7C3AED] font-medium bg-purple-50 px-2 py-0.5 rounded">
                            {cliente.telefone}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {renderBadgeTipo(lig.tipo)}
                        {renderBadgeResultado(lig.resultado)}
                        {lig.duracao_segundos !== undefined && lig.duracao_segundos > 0 && (
                          <span className="text-xs font-semibold text-[#0F172A] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {formatarDuracao(lig.duracao_segundos)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Observações da conversa */}
                    {lig.observacoes && (
                      <p className="text-xs text-[#334155] bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                        {lig.observacoes}
                      </p>
                    )}

                    {/* Próxima Ação */}
                    {lig.proxima_acao && (
                      <div className="flex items-center gap-2 text-xs text-[#7C3AED] font-semibold bg-purple-50/50 p-2 rounded-lg border border-purple-100">
                        <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                        <span>Próxima ação: {lig.proxima_acao}</span>
                        {lig.data_proxima_acao && (
                          <span className="text-[11px] text-[#64748B] font-normal ml-auto">
                            Agendada para: {formatarDataHora(lig.data_proxima_acao)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Rodapé do card com data/hora e responsável */}
                    <div className="flex items-center gap-4 text-[11px] text-[#64748B] pt-1">
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3 text-[#94A3B8]" />
                        {formatarDataHora(lig.data_hora)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-[#94A3B8]" />
                        {respNome}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal Inline para Cadastrar Novo Cliente sem sair da tela */}
      <ClienteInlineModal
        open={modalNovoClienteOpen}
        onOpenChange={setModalNovoClienteOpen}
        nomeInicial={buscaClienteForm}
        onClienteCriado={(novoCliente) => {
          setClientes((prev) => [novoCliente, ...prev.filter((c) => c.id !== novoCliente.id)])
          setFormClienteId(novoCliente.id)
          setBuscaClienteForm('')
          if (errosForm.cliente_id) setErrosForm((prev) => ({ ...prev, cliente_id: '' }))
        }}
      />
    </div>
  )
}
