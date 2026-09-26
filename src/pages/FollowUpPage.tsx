import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RotateCcw,
  Calendar,
  AlertTriangle,
  Cake,
  ShoppingBag,
  Plus,
  RefreshCw,
  Search,
  User,
  Phone,
  Building2,
  MapPin,
  Clock,
  ArrowRight,
  X,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { ClienteModel, TarefaModel, LigacaoModel, OportunidadeModel } from '@/types/clientes'
import { formatarData, formatarMoeda } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import TarefaModal from '@/components/tarefas/TarefaModal'

interface FollowUpCardGroup {
  id: string
  titulo: string
  subtitulo: string
  descricaoVazio: string
  icone: React.ComponentType<{ className?: string }>
  corBorda: string
  corBadge: string
  corIconeBg: string
  corIcone: string
  clientes: Array<{
    cliente: ClienteModel
    motivo: string
    detalheExtra?: string
    tipoAcaoSugerida?: 'ligacao' | 'visita' | 'email' | 'whatsapp' | 'reuniao' | 'outro'
    descricaoSugerida?: string
  }>
}

export default function FollowUpPage() {
  const { user } = useAuth()

  // Dados brutos
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [tarefas, setTarefas] = useState<TarefaModel[]>([])
  const [ligacoes, setLigacoes] = useState<LigacaoModel[]>([])
  const [oportunidades, setOportunidades] = useState<OportunidadeModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros em tempo real
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')

  // Modal de Tarefa compartilhado
  const [modalOpen, setModalOpen] = useState(false)
  const [clienteSelecionadoModal, setClienteSelecionadoModal] = useState<string | undefined>(
    undefined,
  )
  const [tipoInicialModal, setTipoInicialModal] = useState<
    'ligacao' | 'visita' | 'email' | 'whatsapp' | 'reuniao' | 'outro'
  >('ligacao')
  const [descricaoInicialModal, setDescricaoInicialModal] = useState('')

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      const [clientesRes, tarefasRes, ligacoesRes, opsRes, usuariosRes] = await Promise.all([
        pb.collection('clientes').getFullList<ClienteModel>({
          sort: 'nome_contato',
          expand: 'responsavel_id',
        }),
        pb.collection('tarefas').getFullList<TarefaModel>({
          sort: '-created',
        }),
        pb.collection('ligacoes').getFullList<LigacaoModel>({
          sort: '-data_hora',
        }),
        pb.collection('oportunidades').getFullList<OportunidadeModel>({
          sort: '-created',
        }),
        pb
          .collection('usuarios')
          .getFullList<Usuario>({
            sort: 'nome',
          })
          .catch(() => (user ? [user] : [])),
      ])

      setClientes(clientesRes)
      setTarefas(tarefasRes)
      setLigacoes(ligacoesRes)
      setOportunidades(opsRes)
      setUsuarios(usuariosRes.length > 0 ? usuariosRes : user ? [user] : [])
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar rotina de follow-up',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para visualizar alguns dos registros necessários.'
            : 'Não foi possível carregar os dados de clientes para follow-up.',
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Abrir modal de criação de tarefa já com o cliente selecionado
  const handleAbrirCriarTarefa = (
    clienteId: string,
    tipo?: 'ligacao' | 'visita' | 'email' | 'whatsapp' | 'reuniao' | 'outro',
    descricao?: string,
  ) => {
    setClienteSelecionadoModal(clienteId)
    setTipoInicialModal(tipo || 'ligacao')
    setDescricaoInicialModal(descricao || '')
    setModalOpen(true)
  }

  // Filtragem básica dos clientes antes de computar os 4 grupos
  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      // Filtro de responsável
      if (filtroResponsavel !== 'todos' && c.responsavel_id !== filtroResponsavel) {
        return false
      }

      // Busca textual
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const contato = c.nome_contato?.toLowerCase() || ''
        const empresa = c.nome_empresa?.toLowerCase() || ''
        const cidade = c.cidade?.toLowerCase() || ''
        const cnpj = c.cnpj_cpf?.toLowerCase() || ''
        const match =
          contato.includes(termo) ||
          empresa.includes(termo) ||
          cidade.includes(termo) ||
          cnpj.includes(termo)
        if (!match) return false
      }

      return true
    })
  }, [clientes, filtroResponsavel, busca])

  // CÁLCULO NO FRONTEND DOS 4 GRUPOS DE FOLLOW-UP
  const grupos = useMemo<FollowUpCardGroup[]>(() => {
    const agora = new Date()
    const msPorDia = 24 * 60 * 60 * 1000
    const seteDiasAtras = new Date(agora.getTime() - 7 * msPorDia)
    const cincoDiasAtras = new Date(agora.getTime() - 5 * msPorDia)
    const trintaDiasAtras = new Date(agora.getTime() - 30 * msPorDia)

    // Pré-indexar tarefas por cliente_id
    const tarefasPorCliente = new Map<string, TarefaModel[]>()
    tarefas.forEach((t) => {
      const arr = tarefasPorCliente.get(t.cliente_id) || []
      arr.push(t)
      tarefasPorCliente.set(t.cliente_id, arr)
    })

    // Pré-indexar ligações por cliente_id
    const ligacoesPorCliente = new Map<string, LigacaoModel[]>()
    ligacoes.forEach((l) => {
      const arr = ligacoesPorCliente.get(l.cliente_id) || []
      arr.push(l)
      ligacoesPorCliente.set(l.cliente_id, arr)
    })

    // Pré-indexar oportunidades abertas por cliente_id
    const opsAbertasPorCliente = new Map<string, OportunidadeModel[]>()
    oportunidades.forEach((op) => {
      if (op.status === 'aberto') {
        const arr = opsAbertasPorCliente.get(op.cliente_id) || []
        arr.push(op)
        opsAbertasPorCliente.set(op.cliente_id, arr)
      }
    })

    // 1. "Sem contato há 7+ dias":
    // Clientes (que o usuário pode ver) sem nenhuma ligação e sem nenhuma tarefa concluída nos últimos 7 dias.
    const grupo1Itens: FollowUpCardGroup['clientes'] = []
    clientesFiltrados.forEach((c) => {
      const ligs = ligacoesPorCliente.get(c.id) || []
      const tars = tarefasPorCliente.get(c.id) || []

      // Checa se há alguma ligação nos últimos 7 dias
      const temLigacaoRecente = ligs.some((l) => {
        if (!l.data_hora) return false
        return new Date(l.data_hora) >= seteDiasAtras
      })

      // Checa se há alguma tarefa CONCLUÍDA nos últimos 7 dias
      const temTarefaConcluidaRecente = tars.some((t) => {
        if (!t.concluida) return false
        const dataRef = t.data_conclusao ? new Date(t.data_conclusao) : new Date(t.data_hora)
        return dataRef >= seteDiasAtras
      })

      if (!temLigacaoRecente && !temTarefaConcluidaRecente) {
        // Encontra a data do último contato conhecido (se houver)
        let ultimoContato: Date | null = null
        ligs.forEach((l) => {
          if (l.data_hora) {
            const d = new Date(l.data_hora)
            if (!ultimoContato || d > ultimoContato) ultimoContato = d
          }
        })
        tars.forEach((t) => {
          if (t.concluida) {
            const d = t.data_conclusao ? new Date(t.data_conclusao) : new Date(t.data_hora)
            if (!ultimoContato || d > ultimoContato) ultimoContato = d
          }
        })

        const detalheExtra = ultimoContato
          ? `Último contato em ${formatarData(ultimoContato.toISOString())}`
          : 'Nenhum contato registrado anteriormente'

        grupo1Itens.push({
          cliente: c,
          motivo: 'Sem ligação e sem tarefa concluída na última semana.',
          detalheExtra,
          tipoAcaoSugerida: 'ligacao',
          descricaoSugerida: `Follow-up semanal de relacionamento com ${c.nome_contato}`,
        })
      }
    })

    // 2. "Oportunidade parada":
    // Oportunidades com status="aberto" sem tarefa vinculada há 5+ dias
    // (oportunidade aberta cujo cliente não tem tarefa criada nos últimos 5 dias).
    const grupo2Itens: FollowUpCardGroup['clientes'] = []
    clientesFiltrados.forEach((c) => {
      const opsAbertas = opsAbertasPorCliente.get(c.id) || []
      if (opsAbertas.length === 0) return

      const tars = tarefasPorCliente.get(c.id) || []

      // Verifica se houve alguma tarefa criada nos últimos 5 dias (usando created ou data_hora)
      const temTarefaRecente = tars.some((t) => {
        const d = t.created ? new Date(t.created) : new Date(t.data_hora)
        return d >= cincoDiasAtras
      })

      if (!temTarefaRecente) {
        const totalValorOps = opsAbertas.reduce((acc, o) => acc + (o.valor || 0), 0)
        grupo2Itens.push({
          cliente: c,
          motivo: `${opsAbertas.length} proposta(s) em aberto sem ação há mais de 5 dias.`,
          detalheExtra: `Valor em aberto: ${formatarMoeda(totalValorOps)}`,
          tipoAcaoSugerida: 'ligacao',
          descricaoSugerida: `Cobrança de retorno da proposta comercial em aberto com ${c.nome_contato}`,
        })
      }
    })

    // 3. "Aniversariantes da semana":
    // Clientes com data_nascimento caindo nos próximos 7 dias (considere o dia/mês, ignorando o ano).
    const grupo3Itens: FollowUpCardGroup['clientes'] = []
    clientesFiltrados.forEach((c) => {
      if (!c.data_nascimento) return
      // data_nascimento pode vir como "YYYY-MM-DD" ou ISO
      const partes = c.data_nascimento.substring(0, 10).split('-')
      if (partes.length < 3) return
      const mesNasc = parseInt(partes[1], 10) - 1 // 0-indexado
      const diaNasc = parseInt(partes[2], 10)

      // Calcula a data de aniversário no ano corrente
      const anoAtual = agora.getFullYear()
      let anivEsteAno = new Date(anoAtual, mesNasc, diaNasc)

      // Se já passou há mais de 1 dia este ano, consideramos o próximo ano se estiver na virada
      const diffDias = (anivEsteAno.getTime() - agora.getTime()) / msPorDia
      let dentroDos7Dias = false
      let dataFinalAniv = anivEsteAno

      if (diffDias >= -0.5 && diffDias <= 7) {
        dentroDos7Dias = true
      } else {
        // Checar virada de ano caso estejamos no fim de dezembro
        const anivProxAno = new Date(anoAtual + 1, mesNasc, diaNasc)
        const diffProx = (anivProxAno.getTime() - agora.getTime()) / msPorDia
        if (diffProx >= -0.5 && diffProx <= 7) {
          dentroDos7Dias = true
          dataFinalAniv = anivProxAno
        }
      }

      if (dentroDos7Dias) {
        const diaFmt = String(diaNasc).padStart(2, '0')
        const mesFmt = String(mesNasc + 1).padStart(2, '0')
        grupo3Itens.push({
          cliente: c,
          motivo: `Aniversário em ${diaFmt}/${mesFmt}!`,
          detalheExtra: 'Excelente oportunidade para estreitar relacionamento e parabenizar.',
          tipoAcaoSugerida: 'whatsapp',
          descricaoSugerida: `Enviar mensagem de parabéns pelo aniversário de ${c.nome_contato}`,
        })
      }
    })

    // 4. "Sem compra há 30+ dias":
    // Clientes com data_ultima_compra há mais de 30 dias (e que já tenham comprado alguma vez — data_ultima_compra preenchida).
    const grupo4Itens: FollowUpCardGroup['clientes'] = []
    clientesFiltrados.forEach((c) => {
      if (!c.data_ultima_compra) return
      const d = new Date(c.data_ultima_compra)
      if (isNaN(d.getTime())) return

      if (d < trintaDiasAtras) {
        const diffDias = Math.floor((agora.getTime() - d.getTime()) / msPorDia)
        grupo4Itens.push({
          cliente: c,
          motivo: `Última compra realizada há ${diffDias} dias (${formatarData(c.data_ultima_compra)}).`,
          detalheExtra: 'Momento ideal para reativação comercial e reposição de pedidos.',
          tipoAcaoSugerida: 'ligacao',
          descricaoSugerida: `Reativação comercial: verificar reposição de estoque com ${c.nome_contato}`,
        })
      }
    })

    return [
      {
        id: 'sem-contato-7d',
        titulo: 'Sem contato há 7+ dias',
        subtitulo: 'Nenhuma ligação ou tarefa concluída na última semana',
        descricaoVazio: 'Nenhum cliente sem contato recente no filtro selecionado.',
        icone: Phone,
        corBorda: 'border-blue-200',
        corBadge: 'bg-blue-50 text-[#2563EB] border-blue-200',
        corIconeBg: 'bg-blue-50 text-[#2563EB]',
        corIcone: 'text-[#2563EB]',
        clientes: grupo1Itens,
      },
      {
        id: 'oportunidade-parada-5d',
        titulo: 'Oportunidade parada',
        subtitulo: 'Propostas abertas sem nenhuma tarefa agendada há 5+ dias',
        descricaoVazio: 'Todas as propostas em aberto possuem acompanhamento em dia!',
        icone: AlertTriangle,
        corBorda: 'border-amber-200',
        corBadge: 'bg-amber-50 text-amber-700 border-amber-200',
        corIconeBg: 'bg-amber-50 text-amber-700',
        corIcone: 'text-amber-700',
        clientes: grupo2Itens,
      },
      {
        id: 'aniversariantes-semana',
        titulo: 'Aniversariantes da semana',
        subtitulo: 'Contatos celebrando aniversário nos próximos 7 dias',
        descricaoVazio: 'Nenhum aniversariante registrado para os próximos 7 dias.',
        icone: Cake,
        corBorda: 'border-purple-200',
        corBadge: 'bg-purple-50 text-[#7C3AED] border-purple-200',
        corIconeBg: 'bg-purple-50 text-[#7C3AED]',
        corIcone: 'text-[#7C3AED]',
        clientes: grupo3Itens,
      },
      {
        id: 'sem-compra-30d',
        titulo: 'Sem compra há 30+ dias',
        subtitulo: 'Clientes da carteira inativos sem pedidos há mais de um mês',
        descricaoVazio: 'Nenhum cliente inativo há mais de 30 dias na base.',
        icone: ShoppingBag,
        corBorda: 'border-rose-200',
        corBadge: 'bg-rose-50 text-rose-700 border-rose-200',
        corIconeBg: 'bg-rose-50 text-rose-700',
        corIcone: 'text-rose-700',
        clientes: grupo4Itens,
      },
    ]
  }, [clientesFiltrados, tarefas, ligacoes, oportunidades])

  const totalOportunidadesFollowUp = useMemo(() => {
    return grupos.reduce((acc, g) => acc + g.clientes.length, 0)
  }, [grupos])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-[#2563EB]" />
            Follow-up
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Identificação inteligente de contatos que necessitam de retorno comercial prioritário.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar lista de follow-up"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Resumo Rápido */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {grupos.map((g) => {
          const Icone = g.icone
          return (
            <div
              key={g.id}
              className={`p-4 rounded-xl border bg-white shadow-sm flex items-center justify-between ${g.corBorda}`}
            >
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[#64748B] block truncate">
                  {g.titulo}
                </span>
                <span className="text-2xl font-extrabold text-[#0F172A] block">
                  {g.clientes.length}
                </span>
              </div>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${g.corIconeBg}`}
              >
                <Icone className="w-5 h-5" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros em Tempo Real */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Busca por cliente ou empresa */}
          <div className="md:col-span-7 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
            <Input
              placeholder="Buscar por cliente, empresa, cidade ou CPF/CNPJ..."
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

      {/* 4 Seções / Cards com contagem e lista de clientes */}
      {loading ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-[#E2E8F0] space-y-2">
          <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mx-auto" />
          <p className="text-sm font-medium text-[#64748B]">
            Calculando oportunidades de follow-up...
          </p>
        </div>
      ) : totalOportunidadesFollowUp === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-dashed border-[#E2E8F0] space-y-3">
          <Sparkles className="w-10 h-10 text-emerald-500 mx-auto" />
          <h3 className="text-base font-bold text-[#0F172A]">Tudo em dia!</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Não há clientes pendentes de follow-up de acordo com os critérios definidos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {grupos.map((grupo) => {
            const Icone = grupo.icone

            return (
              <div
                key={grupo.id}
                className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col overflow-hidden"
              >
                {/* Cabeçalho do Card */}
                <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${grupo.corIconeBg}`}
                    >
                      <Icone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[#0F172A]">{grupo.titulo}</h3>
                      <p className="text-[11px] text-[#64748B]">{grupo.subtitulo}</p>
                    </div>
                  </div>
                  <Badge className={`${grupo.corBadge} font-bold text-xs`}>
                    {grupo.clientes.length}
                  </Badge>
                </div>

                {/* Lista de Clientes */}
                <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[520px]">
                  {grupo.clientes.length === 0 ? (
                    <div className="py-8 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC]">
                      <p className="text-xs text-[#64748B]">{grupo.descricaoVazio}</p>
                    </div>
                  ) : (
                    grupo.clientes.map(
                      ({ cliente, motivo, detalheExtra, tipoAcaoSugerida, descricaoSugerida }) => {
                        const respNome =
                          cliente.expand?.responsavel_id?.nome || 'Sem responsável atribuído'

                        return (
                          <div
                            key={`${grupo.id}-${cliente.id}`}
                            className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#CBD5E1] transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-[#0F172A] truncate">
                                  {cliente.nome_contato}
                                </span>
                                {cliente.nome_empresa && (
                                  <span className="text-xs text-[#64748B] flex items-center gap-1 truncate">
                                    <Building2 className="w-3 h-3 text-[#94A3B8]" />
                                    {cliente.nome_empresa}
                                  </span>
                                )}
                                {cliente.cidade && (
                                  <span className="text-[11px] text-[#64748B] flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5 text-[#94A3B8]" />
                                    {cliente.cidade}
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-[#334155] font-medium leading-snug">
                                {motivo}
                              </p>

                              <div className="flex items-center gap-3 text-[11px] text-[#64748B] flex-wrap pt-0.5">
                                {detalheExtra && (
                                  <span className="text-[#64748B]">{detalheExtra}</span>
                                )}
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-[#94A3B8]" />
                                  {respNome}
                                </span>
                                {cliente.telefone && (
                                  <span className="flex items-center gap-1 text-[#2563EB]">
                                    <Phone className="w-3 h-3" />
                                    {cliente.telefone}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Botão Criar Tarefa */}
                            <div className="shrink-0 pt-1 sm:pt-0">
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleAbrirCriarTarefa(
                                    cliente.id,
                                    tipoAcaoSugerida,
                                    descricaoSugerida,
                                  )
                                }
                                className="w-full sm:w-auto bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Criar Tarefa
                              </Button>
                            </div>
                          </div>
                        )
                      },
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Reutilizável de Nova Tarefa */}
      <TarefaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialClienteId={clienteSelecionadoModal}
        initialTipo={tipoInicialModal}
        initialDescricao={descricaoInicialModal}
        clientes={clientes}
        usuarios={usuarios}
        onSuccess={(nova) => {
          setTarefas((prev) => [nova, ...prev])
        }}
      />
    </div>
  )
}
