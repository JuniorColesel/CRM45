import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Target,
  Plus,
  RefreshCw,
  Search,
  User,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Phone,
  MapPin,
  Mail,
  MessageSquare,
  Tag,
  X,
  Building2,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { TarefaModel, ClienteModel, TipoTarefa } from '@/types/clientes'
import { formatarDataHora } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import TarefaModal, { TIPO_TAREFA_CONFIG } from '@/components/tarefas/TarefaModal'

export default function ProspeccaoPage() {
  const { user } = useAuth()

  const [tarefas, setTarefas] = useState<TarefaModel[]>([])
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros em tempo real
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')

  // Modal de Nova Tarefa
  const [modalOpen, setModalOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      const [tarefasRes, clientesRes, usuariosRes] = await Promise.all([
        pb.collection('tarefas').getFullList<TarefaModel>({
          sort: 'data_hora',
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

      setTarefas(tarefasRes)
      setClientes(clientesRes)
      setUsuarios(usuariosRes.length > 0 ? usuariosRes : user ? [user] : [])
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar prospecção',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para visualizar algumas tarefas de prospecção.'
            : 'Não foi possível carregar os dados de tarefas.',
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Toggle de conclusão de tarefa
  const handleToggleConcluir = async (tarefa: TarefaModel) => {
    const novoStatus = !tarefa.concluida
    const agoraIso = new Date().toISOString()
    setTogglingId(tarefa.id)

    // Atualização otimista
    setTarefas((prev) =>
      prev.map((t) =>
        t.id === tarefa.id
          ? {
              ...t,
              concluida: novoStatus,
              data_conclusao: novoStatus ? agoraIso : undefined,
            }
          : t,
      ),
    )

    try {
      const updated = await pb.collection('tarefas').update<TarefaModel>(
        tarefa.id,
        {
          concluida: novoStatus,
          data_conclusao: novoStatus ? agoraIso : null,
        },
        { expand: 'responsavel_id,cliente_id' },
      )

      setTarefas((prev) => prev.map((t) => (t.id === tarefa.id ? updated : t)))

      toast({
        title: novoStatus ? 'Tarefa concluída!' : 'Tarefa reaberta',
        description: novoStatus
          ? `Tarefa de ${updated.expand?.cliente_id?.nome_contato || 'cliente'} concluída com sucesso.`
          : 'Tarefa marcada novamente como pendente.',
      })
    } catch (err: unknown) {
      // Reverter
      setTarefas((prev) =>
        prev.map((t) =>
          t.id === tarefa.id
            ? {
                ...t,
                concluida: tarefa.concluida,
                data_conclusao: tarefa.data_conclusao,
              }
            : t,
        ),
      )

      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar tarefa',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você só pode concluir tarefas das quais é o responsável.'
            : 'Não foi possível salvar o status da tarefa.',
      })
    } finally {
      setTogglingId(null)
    }
  }

  // Filtragem de tarefas de acordo com busca e responsável
  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter((t) => {
      // Filtro por responsável
      if (filtroResponsavel !== 'todos' && t.responsavel_id !== filtroResponsavel) {
        return false
      }

      // Busca por nome do cliente, empresa ou descrição
      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const clienteNome = t.expand?.cliente_id?.nome_contato?.toLowerCase() || ''
        const clienteEmpresa = t.expand?.cliente_id?.nome_empresa?.toLowerCase() || ''
        const desc = t.descricao?.toLowerCase() || ''
        const match =
          clienteNome.includes(termo) || clienteEmpresa.includes(termo) || desc.includes(termo)
        if (!match) return false
      }

      return true
    })
  }, [tarefas, filtroResponsavel, busca])

  // Separação das duas colunas:
  // - "Tarefas de Hoje": data_hora no dia de hoje (00:00:00 até 23:59:59 local), ordenadas por horário crescente
  // - "Tarefas Vencidas": data_hora no passado (antes do início de hoje) e concluida=false, ordenadas da mais antiga para a mais recente
  const { tarefasHoje, tarefasVencidas } = useMemo(() => {
    const agora = new Date()
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0)
    const fimHoje = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate(),
      23,
      59,
      59,
      999,
    )

    const hoje: TarefaModel[] = []
    const vencidas: TarefaModel[] = []

    tarefasFiltradas.forEach((t) => {
      if (!t.data_hora) return
      const d = new Date(t.data_hora)

      // Se a data cai hoje
      if (d >= inicioHoje && d <= fimHoje) {
        hoje.push(t)
      } else if (d < inicioHoje && !t.concluida) {
        // Se a data é estritamente anterior a hoje e NÃO está concluída
        vencidas.push(t)
      }
    })

    // Ordenação de hoje: horário crescente
    hoje.sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())

    // Ordenação de vencidas: da mais antiga para a mais recente (crescente de data_hora)
    vencidas.sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())

    return { tarefasHoje: hoje, tarefasVencidas: vencidas }
  }, [tarefasFiltradas])

  const renderBadgeTipo = (tipo: TipoTarefa) => {
    const conf = TIPO_TAREFA_CONFIG[tipo] || TIPO_TAREFA_CONFIG.outro
    const Icon = conf.icon
    return (
      <Badge
        className={`${conf.bg} ${conf.text} border-slate-200 text-[11px] font-semibold flex items-center gap-1 shrink-0`}
      >
        <Icon className="w-3 h-3" />
        {conf.label}
      </Badge>
    )
  }

  const renderItemTarefa = (tarefa: TarefaModel, isVencida = false) => {
    const cliente = tarefa.expand?.cliente_id
    const respNome = tarefa.expand?.responsavel_id?.nome || 'Responsável'
    const isCompleted = Boolean(tarefa.concluida)
    const isLoadingThis = togglingId === tarefa.id

    return (
      <div
        key={tarefa.id}
        className={`p-4 rounded-xl border transition-all duration-150 flex items-start gap-3 bg-white ${
          isCompleted
            ? 'border-slate-200 bg-slate-50/60 opacity-60'
            : isVencida
              ? 'border-red-200 shadow-sm hover:border-red-300'
              : 'border-[#E2E8F0] shadow-sm hover:border-[#CBD5E1]'
        }`}
      >
        {/* Checkbox de conclusão */}
        <div className="pt-0.5">
          <Checkbox
            checked={isCompleted}
            disabled={isLoadingThis}
            onCheckedChange={() => handleToggleConcluir(tarefa)}
            aria-label={`Concluir tarefa: ${tarefa.descricao}`}
            className="data-[state=checked]:bg-[#16A34A] data-[state=checked]:border-[#16A34A]"
          />
        </div>

        {/* Informações da Tarefa */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-[#0F172A] truncate">
                  {cliente?.nome_contato || 'Cliente não identificado'}
                </span>
                {cliente?.nome_empresa && (
                  <span className="text-xs text-[#64748B] flex items-center gap-1 truncate">
                    <Building2 className="w-3 h-3 text-[#94A3B8]" />
                    {cliente.nome_empresa}
                  </span>
                )}
              </div>
            </div>

            {renderBadgeTipo(tarefa.tipo)}
          </div>

          <p
            className={`text-xs text-[#334155] leading-relaxed break-words ${
              isCompleted ? 'line-through text-[#64748B]' : ''
            }`}
          >
            {tarefa.descricao}
          </p>

          <div className="flex items-center gap-3 pt-1 text-[11px] text-[#64748B] flex-wrap">
            <span
              className={`flex items-center gap-1 font-medium ${
                isVencida && !isCompleted ? 'text-[#DC2626]' : 'text-[#64748B]'
              }`}
            >
              <Clock className="w-3 h-3 shrink-0" />
              {formatarDataHora(tarefa.data_hora)}
            </span>

            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-[#94A3B8] shrink-0" />
              {respNome}
            </span>

            {isCompleted && (
              <span className="flex items-center gap-1 text-[#16A34A] font-medium ml-auto">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                Concluída
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-[#16A34A]" />
            Prospecção
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Gerenciamento diário de atividades, ligações, reuniões e lembretes de retorno.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar tarefas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          <Button
            onClick={() => setModalOpen(true)}
            className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Barra de Filtros em Tempo Real */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Busca por cliente ou descrição */}
          <div className="md:col-span-7 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
            <Input
              placeholder="Buscar por cliente, empresa ou descrição da tarefa..."
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

      {/* Grid de 2 Colunas no Desktop (Empilhadas no Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna Esquerda: Tarefas de Hoje */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-[#16A34A]">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#0F172A]">Tarefas de Hoje</h3>
                <p className="text-[11px] text-[#64748B]">Agendadas para a data de hoje</p>
              </div>
            </div>
            <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 font-bold text-xs">
              {tarefasHoje.length}
            </Badge>
          </div>

          <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[640px]">
            {loading ? (
              <div className="py-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#16A34A]" />
                Carregando tarefas...
              </div>
            ) : tarefasHoje.length === 0 ? (
              <div className="py-12 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#16A34A]/50 mx-auto" />
                <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma tarefa para hoje</h4>
                <p className="text-xs text-[#64748B] max-w-xs mx-auto">
                  Você está em dia com os compromissos agendados para a data de hoje!
                </p>
                <Button
                  onClick={() => setModalOpen(true)}
                  size="sm"
                  variant="outline"
                  className="text-xs mt-2"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Agendar para Hoje
                </Button>
              </div>
            ) : (
              tarefasHoje.map((t) => renderItemTarefa(t, false))
            )}
          </div>
        </div>

        {/* Coluna Direita: Tarefas Vencidas */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-red-100 bg-red-50/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-[#DC2626]">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#0F172A]">Tarefas Vencidas</h3>
                <p className="text-[11px] text-[#DC2626] font-medium">
                  Pendentes anteriores a hoje que precisam de atenção
                </p>
              </div>
            </div>
            <Badge className="bg-red-50 text-[#DC2626] border-red-200 font-bold text-xs">
              {tarefasVencidas.length}
            </Badge>
          </div>

          <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[640px]">
            {loading ? (
              <div className="py-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#DC2626]" />
                Carregando tarefas...
              </div>
            ) : tarefasVencidas.length === 0 ? (
              <div className="py-12 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma tarefa vencida</h4>
                <p className="text-xs text-[#64748B] max-w-xs mx-auto">
                  Excelente! Não há nenhuma pendência comercial atrasada no momento.
                </p>
              </div>
            ) : (
              tarefasVencidas.map((t) => renderItemTarefa(t, true))
            )}
          </div>
        </div>
      </div>

      {/* Modal Reutilizável de Nova Tarefa */}
      <TarefaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        clientes={clientes}
        usuarios={usuarios}
        onSuccess={(nova) => {
          setTarefas((prev) => [nova, ...prev])
        }}
      />
    </div>
  )
}
