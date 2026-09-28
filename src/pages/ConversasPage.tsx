import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageSquare,
  Sparkles,
  Send,
  RefreshCw,
  Search,
  Filter,
  UserPlus,
  TrendingUp,
  PhoneCall,
  SlidersHorizontal,
  Bot,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Lock,
  ArrowLeft,
  User,
  Building,
  RotateCw,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarDataHora } from '@/types/clientes'
import type {
  ConversaWhatsappModel,
  MensagemWhatsappModel,
  IntencaoConversa,
} from '@/types/conversas'
export default function ConversasPage() {
  const { user } = useAuth()
  const perfil = user?.perfil

  // 1a) Acesso: vendedor_1, vendedor_2, coordenador_vendas, ceo_financeiro. Compras/Estoque NÃO acessam.
  const podeAcessar =
    perfil === 'vendedor_1' ||
    perfil === 'vendedor_2' ||
    perfil === 'coordenador_vendas' ||
    perfil === 'ceo_financeiro'

  // Estados principais
  const [conversas, setConversas] = useState<ConversaWhatsappModel[]>([])
  const [conversaAtiva, setConversaAtiva] = useState<ConversaWhatsappModel | null>(null)
  const [mensagens, setMensagens] = useState<MensagemWhatsappModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'alta' | 'pendentes'>('todas')
  const [filtroVendedor, setFiltroVendedor] = useState<string>('todos')
  const [termoBusca, setTermoBusca] = useState('')

  // Digitação e IA
  const [textoMensagem, setTextoMensagem] = useState('')
  const [gerandoIa, setGerandoIa] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [rascunhoIa, setRascunhoIa] = useState<{ id: string; texto: string } | null>(null)
  const [totalSugestoes, setTotalSugestoes] = useState(0)
  const [limiteAtingido, setLimiteAtingido] = useState(false)
  const [editouSugestao, setEditouSugestao] = useState(false)

  // Mobile state (navegação lista x conversa)
  const [telaMobileConversa, setTelaMobileConversa] = useState(false)

  // Modais de Ações do cabeçalho
  const [modalPromoverClienteOpen, setModalPromoverClienteOpen] = useState(false)
  const [modalPromoverOpOpen, setModalPromoverOpOpen] = useState(false)
  const [modalFollowUpOpen, setModalFollowUpOpen] = useState(false)
  const [modalReavaliarOpen, setModalReavaliarOpen] = useState(false)

  // Form states dos modais
  const [formClienteNome, setFormClienteNome] = useState('')
  const [formClienteEmpresa, setFormClienteEmpresa] = useState('')
  const [formClienteTelefone, setFormClienteTelefone] = useState('')
  const [formClienteEmail, setFormClienteEmail] = useState('')
  const [formClienteCidade, setFormClienteCidade] = useState('')
  const [salvandoModal, setSalvandoModal] = useState(false)

  const [formOpValor, setFormOpValor] = useState('')
  const [formOpEtapa, setFormOpEtapa] = useState('')
  const [formOpObs, setFormOpObs] = useState('')
  const [etapas, setEtapas] = useState<{ id: string; nome: string }[]>([])

  const [formFuTipo, setFormFuTipo] = useState<'ligacao' | 'whatsapp' | 'email' | 'visita'>(
    'whatsapp',
  )
  const [formFuDesc, setFormFuDesc] = useState('')

  const [formNovaIntencao, setFormNovaIntencao] = useState<IntencaoConversa>('alta')
  const [formCriarOp, setFormCriarOp] = useState(false)
  const [formCriarFu, setFormCriarFu] = useState(false)
  const [formObsIntencao, setFormObsIntencao] = useState('')

  // Auditoria da conversa ativa
  const [auditoriaMensagens, setAuditoriaMensagens] = useState<string[]>([])

  const scrollRef = useRef<HTMLDivElement>(null)

  // Carregar usuários para filtro de coordenador/CEO
  useEffect(() => {
    async function loadUsers() {
      try {
        const uList = await pb.collection('usuarios').getFullList<Usuario>({ sort: 'nome' })
        setUsuarios(uList)
      } catch {
        /* intentionally ignored */
      }
    }
    if (perfil === 'coordenador_vendas' || perfil === 'ceo_financeiro') {
      loadUsers()
    }
  }, [perfil])

  // Carregar etapas para modal de oportunidade
  useEffect(() => {
    async function loadEtapas() {
      try {
        const records = await pb
          .collection('etapas_funil')
          .getFullList<{ id: string; nome: string }>({
            sort: 'ordem',
          })
        setEtapas(records)
        if (records.length > 0) setFormOpEtapa(records[0].id)
      } catch {
        /* intentionally ignored */
      }
    }
    loadEtapas()
  }, [])

  // Carregar lista de conversas respeitando RLS e filtros
  const carregarConversas = useCallback(async () => {
    try {
      setLoading(true)
      const records = await pb.collection('conversas_whatsapp').getFullList<ConversaWhatsappModel>({
        sort: '-updated',
        expand: 'cliente_id.responsavel_id',
        requestKey: null,
      })
      setConversas(records)

      // Atualizar conversa ativa se existir
      if (conversaAtiva) {
        const atual = records.find((c) => c.id === conversaAtiva.id)
        if (atual) setConversaAtiva(atual)
      } else if (records.length > 0 && window.innerWidth >= 1024) {
        setConversaAtiva(records[0])
      }
    } catch (err) {
      console.log('Erro ao carregar conversas:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar conversas',
        description: getErrorMessage(err),
      })
    } finally {
      setLoading(false)
    }
  }, [conversaAtiva])

  useEffect(() => {
    carregarConversas()
  }, [])

  // Carregar mensagens da conversa ativa
  const carregarMensagens = useCallback(async (convId: string) => {
    try {
      setLoadingMsgs(true)
      const msgs = await pb.collection('mensagens_whatsapp').getFullList<MensagemWhatsappModel>({
        filter: `conversa_id = '${convId}'`,
        sort: 'created',
        requestKey: null,
      })
      setMensagens(msgs)

      // Checar contagem de sugestões IA
      const count = await pb.collection('sugestoes_ia').getList(1, 10, {
        filter: `conversa_id = '${convId}'`,
        requestKey: null,
      })
      setTotalSugestoes(count.totalItems)
      setLimiteAtingido(count.totalItems >= 5)

      // Scroll para o fim
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 50)
    } catch (err) {
      console.log('Erro ao carregar mensagens:', err)
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  useEffect(() => {
    if (conversaAtiva?.id) {
      carregarMensagens(conversaAtiva.id)
      setRascunhoIa(null)
      setTextoMensagem('')
      setEditouSugestao(false)
    }
  }, [conversaAtiva?.id, carregarMensagens])

  // 1c & 4) ✨ Sugerir resposta via Skip AI Gateway (configurado e protegido no backend)
  const handleSugerirResposta = async (msgClienteTexto?: string) => {
    if (!conversaAtiva) return

    if (limiteAtingido) {
      toast({
        variant: 'destructive',
        title: 'Limite atingido',
        description:
          'Limite máximo de 5 sugestões de IA por conversa atingido para controle de custos.',
      })
      return
    }

    try {
      setGerandoIa(true)
      const res = await pb.send<{
        success: boolean
        sugestao: string
        sugestao_id: string
        total_sugestoes: number
        limite_maximo: number
        gerou_tarefa_confirmacao?: boolean
      }>('/backend/v1/ia/sugerir', {
        method: 'POST',
        body: JSON.stringify({
          conversa_id: conversaAtiva.id,
          mensagem_cliente: msgClienteTexto || conversaAtiva.ultima_mensagem || '',
        }),
      })

      if (res && res.sugestao) {
        setRascunhoIa({
          id: res.sugestao_id,
          texto: res.sugestao,
        })
        setTotalSugestoes(res.total_sugestoes || totalSugestoes + 1)
        if ((res.total_sugestoes || totalSugestoes + 1) >= 5) {
          setLimiteAtingido(true)
        }
        setEditouSugestao(false)

        if (res.gerou_tarefa_confirmacao) {
          toast({
            title: '✨ Sugestão gerada e Tarefa criada',
            description:
              'A IA identificou falta de preço/estoque e abriu uma tarefa no CRM para você confirmar.',
          })
        }
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Não foi possível sugerir resposta',
        description: msg || 'Falha ao consultar o Skip AI Gateway.',
      })
    } finally {
      setGerandoIa(false)
    }
  }

  // Ações do box de rascunho de IA
  const handleUsarSugestao = () => {
    if (!rascunhoIa) return
    setTextoMensagem(rascunhoIa.texto)
    setEditouSugestao(false)
    toast({
      title: 'Sugestão copiada',
      description: 'O texto está no campo de envio. Revise antes de disparar.',
    })
  }

  const handleEditarSugestao = () => {
    if (!rascunhoIa) return
    setTextoMensagem(rascunhoIa.texto)
    setEditouSugestao(true)
  }

  const handleRegenerarSugestao = () => {
    handleSugerirResposta()
  }

  // 5) Envio de mensagem (O vendedor SEMPRE revisa e clica em enviar)
  // Credenciais do provedor ficam 100% no backend seguro — nenhum token trafega no cliente
  const handleEnviarMensagem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!conversaAtiva || !textoMensagem.trim()) return

    try {
      setEnviando(true)
      const res = await pb.send<{
        success: boolean
        mensagem_id: string
      }>('/backend/v1/whatsapp/enviar', {
        method: 'POST',
        body: JSON.stringify({
          conversa_id: conversaAtiva.id,
          texto: textoMensagem.trim(),
          sugestao_id: rascunhoIa?.id || null,
          usada_ia: Boolean(rascunhoIa),
          editada: editouSugestao,
        }),
      })

      if (res && res.success) {
        setTextoMensagem('')
        setRascunhoIa(null)
        setEditouSugestao(false)
        await carregarMensagens(conversaAtiva.id)
        await carregarConversas()
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar mensagem',
        description: getErrorMessage(err),
      })
    } finally {
      setEnviando(false)
    }
  }

  // 6) Ações na conversa: Promover a cliente real
  const abrirModalPromoverCliente = () => {
    if (!conversaAtiva) return
    const cli = conversaAtiva.expand?.cliente_id
    setFormClienteNome(cli?.nome_contato || conversaAtiva.numero)
    setFormClienteEmpresa(cli?.nome_empresa || '')
    setFormClienteTelefone(conversaAtiva.numero)
    setFormClienteEmail('')
    setFormClienteCidade('')
    setModalPromoverClienteOpen(true)
  }

  const handleConfirmarPromoverCliente = async () => {
    if (!conversaAtiva || !formClienteNome.trim()) return
    try {
      setSalvandoModal(true)
      const cli = conversaAtiva.expand?.cliente_id
      const data = {
        nome_contato: formClienteNome.trim(),
        nome_empresa: formClienteEmpresa.trim(),
        telefone: formClienteTelefone.trim() || conversaAtiva.numero,
        email: formClienteEmail.trim(),
        cidade: formClienteCidade.trim(),
        status: 'ativo', // Promovido! Passa a aparecer em /clientes
        responsavel_id: user?.id,
      }

      let cId = cli?.id
      if (cId) {
        await pb.collection('clientes').update(cId, data)
      } else {
        const rec = await pb.collection('clientes').create(data)
        cId = rec.id
        await pb.collection('conversas_whatsapp').update(conversaAtiva.id, { cliente_id: cId })
      }

      toast({
        title: 'Cliente promovido com sucesso!',
        description: `${data.nome_contato} agora é um cliente oficial e aparece em /clientes.`,
      })
      setModalPromoverClienteOpen(false)
      carregarConversas()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao promover cliente',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoModal(false)
    }
  }

  // 6) Promover a oportunidade
  const abrirModalPromoverOp = () => {
    if (!conversaAtiva) return
    setFormOpValor('')
    setFormOpObs(
      'Oportunidade gerada a partir da conversa WhatsApp: ' + conversaAtiva.ultima_mensagem,
    )
    setModalPromoverOpOpen(true)
  }

  const handleConfirmarPromoverOp = async () => {
    if (!conversaAtiva) return
    const cliId = conversaAtiva.cliente_id
    if (!cliId) {
      toast({
        variant: 'destructive',
        title: 'Cliente não vinculado',
        description: 'Promova primeiro o contato a cliente antes de abrir uma oportunidade.',
      })
      return
    }

    try {
      setSalvandoModal(true)
      const valorNum = parseFloat(formOpValor.replace(',', '.')) || 0

      // Anti-duplicata: verificar se já tem oportunidade aberta
      const abertas = await pb.collection('oportunidades').getList(1, 1, {
        filter: `cliente_id = '${cliId}' && status = 'aberto'`,
      })
      if (abertas.totalItems > 0) {
        toast({
          title: 'Cliente já possui oportunidade aberta',
          description:
            'Para evitar duplicidades, o follow-up foi registrado na oportunidade existente.',
        })
        setModalPromoverOpOpen(false)
        return
      }

      await pb.collection('oportunidades').create({
        cliente_id: cliId,
        etapa_id: formOpEtapa,
        responsavel_id: user?.id,
        valor: valorNum,
        status: 'aberto',
        observacoes: formOpObs.trim(),
      })

      toast({
        title: 'Oportunidade criada com sucesso!',
        description: 'A oportunidade agora está visível no Funil de Vendas.',
      })
      setModalPromoverOpOpen(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar oportunidade',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoModal(false)
    }
  }

  // 6) Adicionar ao follow-up
  const abrirModalFollowUp = () => {
    setFormFuDesc('Contato e negociação via WhatsApp: ' + (conversaAtiva?.ultima_mensagem || ''))
    setModalFollowUpOpen(true)
  }

  const handleConfirmarFollowUp = async () => {
    if (!conversaAtiva || !conversaAtiva.cliente_id) {
      toast({
        variant: 'destructive',
        title: 'Cliente necessário',
        description: 'Vincule ou promova a cliente para adicionar follow-up no histórico.',
      })
      return
    }

    try {
      setSalvandoModal(true)
      await pb.collection('ligacoes').create({
        cliente_id: conversaAtiva.cliente_id,
        responsavel_id: user?.id,
        data_hora: new Date().toISOString(),
        tipo: 'entrada',
        resultado: 'atendeu',
        observacoes: formFuDesc.trim(),
        proxima_acao: 'Acompanhar proposta via WhatsApp',
      })

      toast({
        title: 'Follow-up registrado!',
        description: 'Registro de interação adicionado ao CRM com sucesso.',
      })
      setModalFollowUpOpen(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar follow-up',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoModal(false)
    }
  }

  // 6) Reavaliar intenção
  const abrirModalReavaliar = () => {
    if (!conversaAtiva) return
    setFormNovaIntencao(conversaAtiva.ultima_intencao || 'alta')
    setFormCriarOp(false)
    setFormCriarFu(false)
    setFormObsIntencao('')
    setModalReavaliarOpen(true)
  }

  const handleConfirmarReavaliar = async () => {
    if (!conversaAtiva) return
    try {
      setSalvandoModal(true)
      const res = await pb.send<{
        success: boolean
        nova_intencao: string
        oportunidade_criada_id?: string
        follow_up_criado?: boolean
      }>('/backend/v1/reavaliar_intencao', {
        method: 'POST',
        body: JSON.stringify({
          conversa_id: conversaAtiva.id,
          nova_intencao: formNovaIntencao,
          criar_oportunidade: formCriarOp,
          criar_follow_up: formCriarFu,
          observacao: formObsIntencao.trim(),
        }),
      })

      if (res && res.success) {
        toast({
          title: 'Intenção atualizada',
          description: `A conversa foi reclassificada como intenção ${formNovaIntencao.toUpperCase()}.`,
        })
        setModalReavaliarOpen(false)
        carregarConversas()
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao reavaliar intenção',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoModal(false)
    }
  }

  // Se o usuário não tiver permissão (Compras e Estoque não acessam)
  if (!podeAcessar) {
    return (
      <div className="py-16 px-4 max-w-lg mx-auto text-center animate-fade-in">
        <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
            <Lock className="w-7 h-7 text-amber-600" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-[#0F172A]">Acesso restrito</h3>
            <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
              O módulo de <strong>Conversas com Assistente de IA</strong> é restrito aos perfis
              comerciais (Vendedores, Coordenador de Vendas e CEO). Usuários dos perfis Compras e
              Estoque não possuem permissão de acesso.
            </p>
          </div>
          <div className="pt-2">
            <Badge
              variant="outline"
              className="text-xs text-amber-700 bg-amber-50/50 border-amber-200"
            >
              Permissão requerida: equipe comercial
            </Badge>
          </div>
        </div>
      </div>
    )
  }

  // Filtros aplicados à lista
  const conversasFiltradas = conversas.filter((c) => {
    // 1d) Filtro de vendedor (coordenador/CEO)
    if (filtroVendedor !== 'todos') {
      const respId = c.expand?.cliente_id?.responsavel_id
      if (respId !== filtroVendedor) return false
    }

    // Filtro por intenção ou pendentes
    if (filtroTipo === 'alta' && c.ultima_intencao !== 'alta') return false
    if (filtroTipo === 'pendentes' && c.status === 'fechada') return false

    // Busca textual por nome ou número ou última mensagem
    if (termoBusca.trim()) {
      const termo = termoBusca.toLowerCase()
      const nomeCli = c.expand?.cliente_id?.nome_contato?.toLowerCase() || ''
      const num = c.numero?.toLowerCase() || ''
      const ultMsg = c.ultima_mensagem?.toLowerCase() || ''
      if (!nomeCli.includes(termo) && !num.includes(termo) && !ultMsg.includes(termo)) {
        return false
      }
    }

    return true
  })

  const getCorIntencao = (intencao?: string) => {
    switch (intencao) {
      case 'alta':
        return 'bg-emerald-50 text-[#16A34A] border-emerald-200'
      case 'media':
        return 'bg-amber-50 text-amber-600 border-amber-200'
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200'
    }
  }

  const getTextoIntencao = (intencao?: string) => {
    switch (intencao) {
      case 'alta':
        return 'Alta Intenção'
      case 'media':
        return 'Média Intenção'
      default:
        return 'Info Geral'
    }
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col animate-fade-in -m-6 sm:-m-8">
      {/* Barra de avisos rápidos de status de integração */}
      <div className="bg-white border-b border-[#E2E8F0] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[#0F172A] flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#16A34A]" />
              Conversas WhatsApp & IA
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Status WhatsApp Backend */}
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[#64748B]">WhatsApp:</span>
            <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[10px] font-semibold py-0 px-1.5">
              Backend Proxy
            </Badge>
          </div>

          {/* Status IA Assistida */}
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[#64748B]">IA Assistida:</span>
            <Badge className="bg-purple-50 text-[#7C3AED] border-purple-200 text-[10px] font-semibold py-0 px-1.5">
              Skip AI Ativo
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={carregarConversas}
            disabled={loading}
            className="h-7 text-xs text-[#64748B] hover:text-[#0F172A] gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 text-xs text-[#64748B] hover:text-[#0F172A] gap-1"
          >
            <Link to="/produtos">
              <span>Catálogo</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Grid 2 colunas: Esquerda ~30% e Direita ~70% (responsivo mobile) */}
      <div className="flex-1 flex overflow-hidden">
        {/* ========================================================= */}
        {/* COLUNA ESQUERDA: LISTA DE CONVERSAS (~30%) */}
        {/* ========================================================= */}
        <div
          className={`w-full lg:w-[32%] xl:w-[28%] border-r border-[#E2E8F0] bg-white flex flex-col flex-shrink-0 ${
            telaMobileConversa ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Topo da lista: Busca e Filtros */}
          <div className="p-3 border-b border-[#E2E8F0] space-y-2 bg-[#F8FAFC]">
            {/* Campo de busca */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-2.5" />
              <Input
                placeholder="Buscar cliente, número..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                className="pl-8 h-8 text-xs bg-white"
              />
            </div>

            {/* Filtros em abinhas/botões */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setFiltroTipo('todas')}
                className={`px-2.5 py-1 rounded-md font-medium text-[11px] whitespace-nowrap transition-colors ${
                  filtroTipo === 'todas'
                    ? 'bg-[#16A34A] text-white font-semibold'
                    : 'bg-white text-[#64748B] border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('alta')}
                className={`px-2.5 py-1 rounded-md font-medium text-[11px] whitespace-nowrap transition-colors ${
                  filtroTipo === 'alta'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-white text-[#64748B] border border-slate-200 hover:bg-slate-100'
                }`}
              >
                🔥 Alta Intenção
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('pendentes')}
                className={`px-2.5 py-1 rounded-md font-medium text-[11px] whitespace-nowrap transition-colors ${
                  filtroTipo === 'pendentes'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-white text-[#64748B] border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Abertas
              </button>
            </div>

            {/* Filtro por vendedor: visível apenas para coordenador e CEO */}
            {(perfil === 'coordenador_vendas' || perfil === 'ceo_financeiro') && (
              <div className="pt-1">
                <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                  <SelectTrigger className="h-7 text-[11px] bg-white border-slate-200">
                    <SelectValue placeholder="Filtrar por vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {usuarios
                      .filter((u) => u.perfil === 'vendedor_1' || u.perfil === 'vendedor_2')
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Lista scrollável */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
            {loading ? (
              <div className="p-8 text-center text-xs text-[#64748B] flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#16A34A]" />
                <span>Carregando conversas...</span>
              </div>
            ) : conversasFiltradas.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B] space-y-2">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-700">Nenhuma conversa ainda.</p>
                <p className="text-[11px] leading-relaxed">
                  As mensagens dos clientes recebidas via WhatsApp aparecerão aqui automaticamente.
                </p>
              </div>
            ) : (
              conversasFiltradas.map((conv) => {
                const isSelected = conversaAtiva?.id === conv.id
                const cli = conv.expand?.cliente_id
                const nomeExibicao = cli?.nome_contato || conv.numero
                const isRascunho = cli?.status === 'rascunho'

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setConversaAtiva(conv)
                      setTelaMobileConversa(true)
                    }}
                    role="button"
                    tabIndex={0}
                    className={`p-3.5 transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'bg-emerald-50/80 border-l-4 border-l-[#16A34A]'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-[#0F172A] truncate">
                            {nomeExibicao}
                          </span>
                          {isRascunho && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 border-amber-300 text-amber-700 bg-amber-50"
                            >
                              Rascunho
                            </Badge>
                          )}
                        </div>
                        {cli?.nome_empresa && (
                          <p className="text-[10px] text-[#64748B] truncate flex items-center gap-1 mt-0.5">
                            <Building className="w-2.5 h-2.5" />
                            {cli.nome_empresa}
                          </p>
                        )}
                      </div>

                      <span className="text-[10px] text-[#94A3B8] whitespace-nowrap">
                        {formatarDataHora(conv.updated || conv.created).split(' às ')[1] || ''}
                      </span>
                    </div>

                    <p className="text-xs text-[#64748B] line-clamp-2 mt-1.5 leading-snug">
                      {conv.ultima_mensagem || 'Sem mensagens'}
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-slate-100">
                      <Badge
                        className={`text-[9px] py-0 px-1.5 font-medium border ${getCorIntencao(
                          conv.ultima_intencao,
                        )}`}
                      >
                        {getTextoIntencao(conv.ultima_intencao)}
                      </Badge>

                      <span className="text-[10px] font-mono text-[#94A3B8]">{conv.numero}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* COLUNA DIREITA: THREAD & IA (~70%) */}
        {/* ========================================================= */}
        <div
          className={`flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden ${
            !telaMobileConversa ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {conversaAtiva ? (
            <>
              {/* Topo do chat com nome, telefone e botões de ação */}
              <div className="p-3 sm:p-4 bg-white border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 shadow-sm z-10">
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTelaMobileConversa(false)}
                    className="lg:hidden h-8 w-8 p-0 text-[#64748B]"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>

                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-[#16A34A] font-bold text-xs flex items-center justify-center flex-shrink-0">
                    {conversaAtiva.expand?.cliente_id?.nome_contato?.charAt(0) || 'W'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-[#0F172A] truncate">
                        {conversaAtiva.expand?.cliente_id?.nome_contato || conversaAtiva.numero}
                      </h3>
                      <Badge
                        className={`text-[10px] py-0 px-1.5 border ${getCorIntencao(
                          conversaAtiva.ultima_intencao,
                        )}`}
                      >
                        {getTextoIntencao(conversaAtiva.ultima_intencao)}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                      <span className="font-mono">{conversaAtiva.numero}</span>
                      {conversaAtiva.expand?.cliente_id?.nome_empresa && (
                        <span>• {conversaAtiva.expand.cliente_id.nome_empresa}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 6) BOTÕES DE AÇÃO NA CONVERSA */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {conversaAtiva.expand?.cliente_id?.status === 'rascunho' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={abrirModalPromoverCliente}
                      className="h-8 text-xs text-emerald-700 bg-emerald-50/70 border-emerald-300 hover:bg-emerald-100 gap-1 font-semibold"
                      title="Promove rascunho para cliente oficial do CRM"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Promover a cliente</span>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={abrirModalPromoverOp}
                    className="h-8 text-xs text-blue-700 bg-blue-50/70 border-blue-300 hover:bg-blue-100 gap-1 font-semibold"
                    title="Abre oportunidade vinculada no funil"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Criar oportunidade</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={abrirModalFollowUp}
                    className="h-8 text-xs text-purple-700 bg-purple-50/70 border-purple-300 hover:bg-purple-100 gap-1 font-semibold"
                    title="Adiciona registro manual de follow-up"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Follow-up</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={abrirModalReavaliar}
                    className="h-8 text-xs text-[#64748B] hover:text-[#0F172A] gap-1"
                    title="Corrigir manualmente a intenção detectada"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reavaliar</span>
                  </Button>
                </div>
              </div>

              {/* Thread de mensagens */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/60"
              >
                {loadingMsgs ? (
                  <div className="p-8 text-center text-xs text-[#64748B] flex flex-col items-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#16A34A]" />
                    <span>Carregando histórico...</span>
                  </div>
                ) : mensagens.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#64748B] space-y-1">
                    <p className="font-semibold text-slate-700">Início da conversa</p>
                    <p>Envie uma mensagem abaixo ou aguarde o contato do cliente.</p>
                  </div>
                ) : (
                  mensagens.map((msg) => {
                    const isSaida = msg.direcao === 'saida'
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isSaida ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-sm space-y-1 ${
                            isSaida
                              ? 'bg-[#16A34A] text-white rounded-br-xs'
                              : 'bg-white text-[#0F172A] border border-[#E2E8F0] rounded-bl-xs'
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.texto}</p>

                          <div
                            className={`flex items-center justify-end gap-1.5 text-[10px] ${
                              isSaida ? 'text-emerald-100' : 'text-[#94A3B8]'
                            }`}
                          >
                            {msg.usada_ia && (
                              <span className="flex items-center gap-0.5 text-[9px] bg-black/10 px-1 rounded">
                                <Sparkles className="w-2.5 h-2.5" />
                                IA
                              </span>
                            )}
                            <span>{formatarDataHora(msg.created).split(' às ')[1] || ''}</span>
                          </div>
                        </div>

                        {/* Botão ✨ Sugerir resposta em cada mensagem de entrada */}
                        {!isSaida && (
                          <div className="mt-1 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSugerirResposta(msg.texto)}
                              disabled={gerandoIa || limiteAtingido}
                              className="h-6 text-[10px] text-purple-700 hover:text-purple-900 hover:bg-purple-50 px-2 rounded-full border border-purple-200 bg-white shadow-xs gap-1"
                              title={
                                limiteAtingido
                                  ? 'Limite de 5 sugestões por conversa atingido'
                                  : 'Gera rascunho com o Assistente de IA'
                              }
                            >
                              <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                              <span>Sugerir resposta</span>
                            </Button>

                            {msg.intencao_detectada && (
                              <span className="text-[10px] text-[#94A3B8]">
                                Intenção: <strong>{msg.intencao_detectada}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* 4) BOX DE RASCUNHO DA IA (acima do campo de digitação) */}
              {rascunhoIa && (
                <div className="mx-4 my-2 p-3 bg-purple-50/90 border border-purple-200 rounded-xl space-y-2 animate-fade-in shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-purple-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Sugestão do Assistente IA (Revise antes de enviar):
                    </span>
                    <span className="text-[10px] text-purple-700 font-medium">
                      Sugestão {totalSugestoes}/5
                    </span>
                  </div>

                  <p className="text-xs text-[#0F172A] bg-white p-2.5 rounded-lg border border-purple-100 whitespace-pre-wrap leading-relaxed font-sans">
                    {rascunhoIa.texto}
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleRegenerarSugestao}
                      disabled={gerandoIa || limiteAtingido}
                      className="h-7 text-xs text-purple-700 border-purple-200 hover:bg-purple-100 gap-1"
                    >
                      <RotateCw className={`w-3 h-3 ${gerandoIa ? 'animate-spin' : ''}`} />
                      Regenerar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleEditarSugestao}
                      className="h-7 text-xs text-[#0F172A] border-slate-300 hover:bg-slate-100 gap-1"
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleUsarSugestao}
                      className="h-7 text-xs bg-purple-700 hover:bg-purple-800 text-white font-semibold gap-1"
                    >
                      Usar no campo
                    </Button>
                  </div>
                </div>
              )}

              {/* Rodapé com campo de digitação e botão Enviar */}
              <div className="p-3 sm:p-4 bg-white border-t border-[#E2E8F0]">
                {limiteAtingido && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 px-3 py-1 rounded-md mb-2 border border-amber-200 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Limite de 5 sugestões de IA nesta conversa foi atingido (controle de custos).
                  </p>
                )}

                <form onSubmit={handleEnviarMensagem} className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <Textarea
                      rows={2}
                      placeholder="Digite sua resposta para o cliente..."
                      value={textoMensagem}
                      onChange={(e) => {
                        setTextoMensagem(e.target.value)
                        if (rascunhoIa && e.target.value !== rascunhoIa.texto) {
                          setEditouSugestao(true)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleEnviarMensagem()
                        }
                      }}
                      className="text-xs resize-none bg-[#F8FAFC] border-slate-300 focus-visible:bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSugerirResposta()}
                      disabled={gerandoIa || limiteAtingido}
                      className="h-9 text-xs text-purple-700 border-purple-200 hover:bg-purple-50 font-semibold gap-1"
                      title="Sugerir resposta com IA"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${gerandoIa ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">IA</span>
                    </Button>

                    <Button
                      type="submit"
                      disabled={enviando || !textoMensagem.trim()}
                      className="h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold gap-1.5 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar</span>
                    </Button>
                  </div>
                </form>

                <p className="text-[10px] text-[#94A3B8] mt-1.5 text-center">
                  O vendedor <strong>sempre revisa antes de enviar</strong> — envio assistido, nunca
                  automático.
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#64748B] space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-[#0F172A] text-base">Nenhuma conversa selecionada</h3>
              <p className="text-xs max-w-sm">
                Selecione uma conversa na coluna ao lado para visualizar a thread de mensagens e
                utilizar o Assistente de IA de Vendas da Colesel.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: PROMOVER A CLIENTE OFICIAL */}
      {/* ========================================================= */}
      <Dialog open={modalPromoverClienteOpen} onOpenChange={setModalPromoverClienteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promover a Cliente Oficial</DialogTitle>
            <DialogDescription>
              Complete os dados do cliente. Ele passará a ser listado oficialmente no módulo
              /clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="cli-nome" className="text-xs font-bold">
                Nome do Contato *
              </Label>
              <Input
                id="cli-nome"
                value={formClienteNome}
                onChange={(e) => setFormClienteNome(e.target.value)}
                placeholder="Nome completo do cliente"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cli-empresa" className="text-xs font-bold">
                Nome da Empresa / Razão Social
              </Label>
              <Input
                id="cli-empresa"
                value={formClienteEmpresa}
                onChange={(e) => setFormClienteEmpresa(e.target.value)}
                placeholder="Ex: Construtora Silva"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="cli-tel" className="text-xs font-bold">
                  Telefone
                </Label>
                <Input
                  id="cli-tel"
                  value={formClienteTelefone}
                  onChange={(e) => setFormClienteTelefone(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cli-cidade" className="text-xs font-bold">
                  Cidade
                </Label>
                <Input
                  id="cli-cidade"
                  value={formClienteCidade}
                  onChange={(e) => setFormClienteCidade(e.target.value)}
                  placeholder="Ex: São Paulo"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cli-email" className="text-xs font-bold">
                E-mail
              </Label>
              <Input
                id="cli-email"
                type="email"
                value={formClienteEmail}
                onChange={(e) => setFormClienteEmail(e.target.value)}
                placeholder="cliente@email.com"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalPromoverClienteOpen(false)}
              disabled={salvandoModal}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmarPromoverCliente}
              disabled={salvandoModal || !formClienteNome.trim()}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white"
            >
              {salvandoModal ? 'Promovendo...' : 'Confirmar Promoção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL 2: PROMOVER A OPORTUNIDADE */}
      {/* ========================================================= */}
      <Dialog open={modalPromoverOpOpen} onOpenChange={setModalPromoverOpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir Oportunidade no Funil</DialogTitle>
            <DialogDescription>
              Cria uma oportunidade vinculada a este cliente. Regra anti-duplicata ativa: não abre
              outra se já houver uma em aberto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="op-etapa" className="text-xs font-bold">
                Etapa do Funil
              </Label>
              <Select value={formOpEtapa} onValueChange={setFormOpEtapa}>
                <SelectTrigger id="op-etapa" className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      {et.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="op-valor" className="text-xs font-bold">
                Valor Estimado (R$)
              </Label>
              <Input
                id="op-valor"
                type="number"
                step="0.01"
                placeholder="Ex: 5000.00"
                value={formOpValor}
                onChange={(e) => setFormOpValor(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="op-obs" className="text-xs font-bold">
                Observações
              </Label>
              <Textarea
                id="op-obs"
                rows={3}
                value={formOpObs}
                onChange={(e) => setFormOpObs(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalPromoverOpOpen(false)}
              disabled={salvandoModal}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmarPromoverOp}
              disabled={salvandoModal}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {salvandoModal ? 'Criando...' : 'Criar Oportunidade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL 3: ADICIONAR AO FOLLOW-UP */}
      {/* ========================================================= */}
      <Dialog open={modalFollowUpOpen} onOpenChange={setModalFollowUpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Registro de Follow-up</DialogTitle>
            <DialogDescription>
              Registra uma interação com o cliente no histórico de follow-up do CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="fu-desc" className="text-xs font-bold">
                Resumo da conversa / Assunto *
              </Label>
              <Textarea
                id="fu-desc"
                rows={3}
                value={formFuDesc}
                onChange={(e) => setFormFuDesc(e.target.value)}
                placeholder="Ex: Cliente demonstrou interesse em cimento e pediu cotação..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalFollowUpOpen(false)}
              disabled={salvandoModal}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmarFollowUp}
              disabled={salvandoModal || !formFuDesc.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {salvandoModal ? 'Salvando...' : 'Salvar Follow-up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL 4: REAVALIAR INTENÇÃO */}
      {/* ========================================================= */}
      <Dialog open={modalReavaliarOpen} onOpenChange={setModalReavaliarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reavaliar Intenção do Cliente</DialogTitle>
            <DialogDescription>
              Corrija a classificação atribuída pela IA e execute ações manuais correspondentes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="reav-intencao" className="text-xs font-bold">
                Nova Intenção
              </Label>
              <Select
                value={formNovaIntencao}
                onValueChange={(val: IntencaoConversa) => setFormNovaIntencao(val)}
              >
                <SelectTrigger id="reav-intencao" className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a intenção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">🔥 Alta (Compra imediata / Cotação)</SelectItem>
                  <SelectItem value="media">⚡ Média (Dúvida técnica / Qualificação)</SelectItem>
                  <SelectItem value="baixa">ℹ️ Baixa (Info geral / Endereço / Horário)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="reav-op" className="text-xs font-semibold cursor-pointer">
                    Abrir oportunidade de prospecção
                  </Label>
                  <p className="text-[11px] text-[#64748B]">
                    Respeita anti-duplicata se já existir oportunidade aberta.
                  </p>
                </div>
                <Switch id="reav-op" checked={formCriarOp} onCheckedChange={setFormCriarOp} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="reav-fu" className="text-xs font-semibold cursor-pointer">
                    Registrar follow-up de mensagem
                  </Label>
                  <p className="text-[11px] text-[#64748B]">
                    Salva histórico na carteira do cliente.
                  </p>
                </div>
                <Switch id="reav-fu" checked={formCriarFu} onCheckedChange={setFormCriarFu} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reav-obs" className="text-xs font-bold">
                Motivo / Observação
              </Label>
              <Input
                id="reav-obs"
                value={formObsIntencao}
                onChange={(e) => setFormObsIntencao(e.target.value)}
                placeholder="Ex: Cliente confirmou que vai fechar pedido nesta semana"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalReavaliarOpen(false)}
              disabled={salvandoModal}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmarReavaliar}
              disabled={salvandoModal}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white"
            >
              {salvandoModal ? 'Atualizando...' : 'Confirmar Reavaliação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
