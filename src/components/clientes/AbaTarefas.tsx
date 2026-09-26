import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  CheckSquare,
  Loader2,
  Trash2,
  Calendar,
  User,
  Clock,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { TarefaModel, TipoTarefa } from '@/types/clientes'
import { formatarDataHora } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaTarefasProps {
  clienteId: string
}

export default function AbaTarefas({ clienteId }: AbaTarefasProps) {
  const { user } = useAuth()
  const [tarefas, setTarefas] = useState<TarefaModel[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletandoId, setDeletandoId] = useState<string | null>(null)

  // Formulário
  const [tipo, setTipo] = useState<TipoTarefa>('ligacao')
  const [descricao, setDescricao] = useState('')
  const [dataHora, setDataHora] = useState('')
  const [concluida, setConcluida] = useState(false)
  const [erro, setErro] = useState('')

  const carregarTarefas = useCallback(async () => {
    try {
      setLoading(true)
      const res = await pb.collection('tarefas').getFullList<TarefaModel>({
        filter: `cliente_id = "${clienteId}"`,
        sort: '-data_hora',
        expand: 'responsavel_id',
      })
      setTarefas(res)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar tarefas',
        description: msg.includes('403')
          ? 'Você não tem permissão para visualizar as tarefas deste cliente.'
          : 'Não foi possível carregar as tarefas.',
      })
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => {
    carregarTarefas()
  }, [carregarTarefas])

  const abrirModalCriar = () => {
    setTipo('ligacao')
    setDescricao('')
    // Data/hora padrão: agora formatada para datetime-local (YYYY-MM-DDTHH:mm)
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    setDataHora(now.toISOString().slice(0, 16))
    setConcluida(false)
    setErro('')
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!descricao.trim()) {
      setErro('Informe a descrição da tarefa.')
      return
    }
    if (!dataHora) {
      setErro('Selecione a data e o horário da tarefa.')
      return
    }

    setSaving(true)
    setErro('')
    try {
      const payload = {
        cliente_id: clienteId,
        responsavel_id: user?.id,
        tipo,
        descricao: descricao.trim(),
        data_hora: new Date(dataHora).toISOString(),
        concluida,
        data_conclusao: concluida ? new Date().toISOString() : null,
      }

      const nova = await pb.collection('tarefas').create<TarefaModel>(payload, {
        expand: 'responsavel_id',
      })

      setTarefas((prev) => [nova, ...prev])
      toast({
        title: 'Tarefa cadastrada',
        description: 'Tarefa agendada com sucesso.',
      })
      setModalOpen(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao criar tarefa',
        description: msg.includes('403')
          ? 'Permissão negada para cadastrar tarefas.'
          : msg || 'Ocorreu um erro ao salvar a tarefa.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleConcluida = async (tarefa: TarefaModel) => {
    const novoStatus = !tarefa.concluida
    try {
      const updated = await pb.collection('tarefas').update<TarefaModel>(tarefa.id, {
        concluida: novoStatus,
        data_conclusao: novoStatus ? new Date().toISOString() : null,
      })
      setTarefas((prev) => prev.map((t) => (t.id === tarefa.id ? { ...t, ...updated } : t)))
      toast({
        title: novoStatus ? 'Tarefa concluída' : 'Tarefa reaberta',
        description: novoStatus
          ? 'Tarefa marcada como realizada.'
          : 'Tarefa marcada como pendente.',
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar tarefa',
        description: msg.includes('403')
          ? 'Você não tem permissão para atualizar esta tarefa.'
          : 'Não foi possível alterar o status.',
      })
    }
  }

  const handleExcluir = async (tarefaId: string) => {
    setDeletandoId(tarefaId)
    try {
      await pb.collection('tarefas').delete(tarefaId)
      setTarefas((prev) => prev.filter((t) => t.id !== tarefaId))
      toast({
        title: 'Tarefa excluída',
        description: 'A tarefa foi removida com sucesso.',
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir tarefa',
        description: msg.includes('403')
          ? 'Você não tem permissão para excluir esta tarefa.'
          : 'Ocorreu um erro ao excluir.',
      })
    } finally {
      setDeletandoId(null)
    }
  }

  const badgeTipo = (t: TipoTarefa) => {
    const tiposMap: Record<TipoTarefa, { label: string; bg: string; color: string }> = {
      ligacao: { label: 'Ligação', bg: 'bg-emerald-50', color: 'text-[#16A34A]' },
      visita: { label: 'Visita', bg: 'bg-purple-50', color: 'text-[#7C3AED]' },
      email: { label: 'E-mail', bg: 'bg-blue-50', color: 'text-[#2563EB]' },
      whatsapp: { label: 'WhatsApp', bg: 'bg-green-50', color: 'text-green-700' },
      reuniao: { label: 'Reunião', bg: 'bg-amber-50', color: 'text-amber-700' },
      outro: { label: 'Outro', bg: 'bg-slate-100', color: 'text-slate-700' },
    }
    const conf = tiposMap[t] || tiposMap.outro
    return (
      <Badge className={`${conf.bg} ${conf.color} border-slate-200 text-[11px] font-semibold`}>
        {conf.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      {/* Topo da Aba */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#16A34A]" />
            Tarefas e Atividades ({tarefas.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Agendamentos, lembretes de retorno, visitas e tarefas comerciais.
          </p>
        </div>

        <Button
          onClick={abrirModalCriar}
          size="sm"
          className="bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Nova Tarefa
        </Button>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#16A34A]" />
          Carregando tarefas...
        </div>
      ) : tarefas.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-slate-50/50 space-y-2">
          <CheckSquare className="w-8 h-8 text-[#94A3B8] mx-auto" />
          <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma tarefa agendada</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Crie lembretes de contato, reuniões ou visitas para não perder o prazo de follow-up.
          </p>
          <Button onClick={abrirModalCriar} size="sm" variant="outline" className="text-xs mt-2">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Adicionar Tarefa
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
          {tarefas.map((tarefa) => {
            const respNome = tarefa.expand?.responsavel_id?.nome || 'Responsável'

            return (
              <div
                key={tarefa.id}
                className={`p-4 hover:bg-slate-50/70 transition-colors flex items-start justify-between gap-3 ${
                  tarefa.concluida ? 'bg-slate-50/40 opacity-75' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={Boolean(tarefa.concluida)}
                      onCheckedChange={() => handleToggleConcluida(tarefa)}
                      aria-label="Marcar tarefa como concluída"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-semibold text-[#0F172A] ${
                          tarefa.concluida ? 'line-through text-[#64748B]' : ''
                        }`}
                      >
                        {tarefa.descricao}
                      </span>
                      {badgeTipo(tarefa.tipo)}
                      {tarefa.concluida && (
                        <Badge className="bg-emerald-100 text-[#16A34A] border-emerald-200 text-[10px] gap-1">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Concluída
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#64748B] flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#94A3B8]" />
                        {formatarDataHora(tarefa.data_hora)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-[#94A3B8]" />
                        {respNome}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletandoId === tarefa.id}
                    onClick={() => handleExcluir(tarefa.id)}
                    className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                    title="Excluir Tarefa"
                  >
                    {deletandoId === tarefa.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Criar Tarefa */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#16A34A]" />
              Nova Tarefa
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Agende uma ação comercial para este cliente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            {erro && <p className="text-xs text-[#DC2626] bg-red-50 p-2 rounded">{erro}</p>}

            <div className="space-y-1">
              <Label htmlFor="tipo" className="text-xs font-semibold text-[#0F172A]">
                Tipo de Tarefa <span className="text-[#DC2626]">*</span>
              </Label>
              <Select value={tipo} onValueChange={(val: TipoTarefa) => setTipo(val)}>
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ligacao">Ligação</SelectItem>
                  <SelectItem value="visita">Visita Comercial</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="descricao" className="text-xs font-semibold text-[#0F172A]">
                Descrição da Tarefa <span className="text-[#DC2626]">*</span>
              </Label>
              <Textarea
                id="descricao"
                rows={2}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Ligar para confirmar recebimento da proposta técnica..."
                required
                className="resize-none"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="dataHora" className="text-xs font-semibold text-[#0F172A]">
                Data e Horário <span className="text-[#DC2626]">*</span>
              </Label>
              <Input
                id="dataHora"
                type="datetime-local"
                value={dataHora}
                onChange={(e) => setDataHora(e.target.value)}
                required
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="concluida_init"
                checked={concluida}
                onCheckedChange={(checked) => setConcluida(Boolean(checked))}
              />
              <Label
                htmlFor="concluida_init"
                className="text-xs font-medium text-[#0F172A] cursor-pointer"
              >
                Já foi concluída
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="bg-[#16A34A] hover:bg-[#15803D] text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Tarefa'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
