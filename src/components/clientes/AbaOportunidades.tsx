import React, { useState, useEffect, useCallback } from 'react'
import { Plus, DollarSign, Loader2, Trash2, Calendar, User, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import type { OportunidadeModel, EtapaFunilModel, StatusOportunidade } from '@/types/clientes'
import { formatarMoeda, formatarData } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaOportunidadesProps {
  clienteId: string
}

export default function AbaOportunidades({ clienteId }: AbaOportunidadesProps) {
  const { user } = useAuth()
  const [oportunidades, setOportunidades] = useState<OportunidadeModel[]>([])
  const [etapas, setEtapas] = useState<EtapaFunilModel[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletandoId, setDeletandoId] = useState<string | null>(null)

  // Formulário
  const [valor, setValor] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [status, setStatus] = useState<StatusOportunidade>('aberto')
  const [dataPrevista, setDataPrevista] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState('')

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      const [opsRes, etapasRes] = await Promise.all([
        pb.collection('oportunidades').getFullList<OportunidadeModel>({
          filter: `cliente_id = "${clienteId}"`,
          sort: '-created',
          expand: 'etapa_id,responsavel_id',
        }),
        pb.collection('etapas_funil').getFullList<EtapaFunilModel>({
          sort: 'ordem',
        }),
      ])
      setOportunidades(opsRes)
      setEtapas(etapasRes)
      if (etapasRes.length > 0 && !etapaId) {
        setEtapaId(etapasRes[0].id)
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar oportunidades',
        description:
          msg.includes('403') || msg.includes('permissão')
            ? 'Você não tem permissão para visualizar as oportunidades deste cliente.'
            : 'Não foi possível carregar as oportunidades.',
      })
    } finally {
      setLoading(false)
    }
  }, [clienteId, etapaId])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const abrirModalCriar = () => {
    setValor('')
    setStatus('aberto')
    setDataPrevista('')
    setObservacoes('')
    setErro('')
    if (etapas.length > 0) {
      setEtapaId(etapas[0].id)
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum < 0) {
      setErro('Informe um valor válido em reais.')
      return
    }
    if (!etapaId) {
      setErro('Selecione uma etapa do funil.')
      return
    }

    setSaving(true)
    setErro('')
    try {
      const payload = {
        cliente_id: clienteId,
        valor: valorNum,
        etapa_id: etapaId,
        responsavel_id: user?.id,
        status,
        data_prevista_fechamento: dataPrevista ? new Date(dataPrevista).toISOString() : null,
        observacoes: observacoes.trim() || '',
      }

      const nova = await pb.collection('oportunidades').create<OportunidadeModel>(payload, {
        expand: 'etapa_id,responsavel_id',
      })

      // Regra de negócio: se fizer nova compra ou nova oportunidade fechada/aberta, status volta para 'ativo'
      if (clienteId) {
        try {
          await pb.collection('clientes').update(clienteId, {
            status_cliente: 'ativo',
            status: 'ativo',
          })
        } catch {
          // Mantém integridade mesmo se usuário não tiver permissão de update no cliente
        }
      }

      setOportunidades((prev) => [nova, ...prev])
      toast({
        title: 'Oportunidade criada',
        description: `Oportunidade no valor de ${formatarMoeda(valorNum)} registrada com sucesso.`,
      })
      setModalOpen(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao criar oportunidade',
        description: msg.includes('403')
          ? 'Permissão negada para cadastrar oportunidades.'
          : msg || 'Ocorreu um erro ao salvar a oportunidade.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (opId: string) => {
    setDeletandoId(opId)
    try {
      await pb.collection('oportunidades').delete(opId)
      setOportunidades((prev) => prev.filter((o) => o.id !== opId))
      toast({
        title: 'Oportunidade excluída',
        description: 'A oportunidade foi removida com sucesso.',
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir oportunidade',
        description: msg.includes('403')
          ? 'Você não tem permissão para excluir esta oportunidade.'
          : 'Ocorreu um erro ao excluir.',
      })
    } finally {
      setDeletandoId(null)
    }
  }

  const statusBadge = (s: StatusOportunidade) => {
    switch (s) {
      case 'ganho':
        return (
          <Badge className="bg-emerald-100 text-[#16A34A] border-emerald-200 text-xs">Ganho</Badge>
        )
      case 'perdido':
        return <Badge className="bg-red-100 text-[#DC2626] border-red-200 text-xs">Perdido</Badge>
      default:
        return (
          <Badge className="bg-blue-100 text-[#2563EB] border-blue-200 text-xs">Em Aberto</Badge>
        )
    }
  }

  return (
    <div className="space-y-4">
      {/* Topo da Aba */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#2563EB]" />
            Oportunidades de Negócio ({oportunidades.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Histórico e propostas comerciais em andamento para este cliente.
          </p>
        </div>

        <Button
          onClick={abrirModalCriar}
          size="sm"
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Nova Oportunidade
        </Button>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
          Carregando oportunidades...
        </div>
      ) : oportunidades.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-slate-50/50 space-y-2">
          <DollarSign className="w-8 h-8 text-[#94A3B8] mx-auto" />
          <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma oportunidade registrada</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Cadastre propostas, orçamentos ou negociações comerciais para acompanhar a receita
            potencial.
          </p>
          <Button onClick={abrirModalCriar} size="sm" variant="outline" className="text-xs mt-2">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Adicionar Oportunidade
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
          {oportunidades.map((op) => {
            const etapaNome = op.expand?.etapa_id?.nome || 'Etapa Padrão'
            const etapaCor = op.expand?.etapa_id?.cor || '#2563EB'
            const respNome = op.expand?.responsavel_id?.nome || 'Responsável'

            return (
              <div
                key={op.id}
                className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-[#0F172A]">
                      {formatarMoeda(op.valor)}
                    </span>
                    <Badge
                      style={{
                        backgroundColor: `${etapaCor}15`,
                        color: etapaCor,
                        borderColor: `${etapaCor}40`,
                      }}
                      className="text-xs font-semibold"
                    >
                      {etapaNome}
                    </Badge>
                    {statusBadge(op.status)}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-[#64748B] flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-[#94A3B8]" />
                      {respNome}
                    </span>
                    {op.data_prevista_fechamento && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#94A3B8]" />
                        Previsto: {formatarData(op.data_prevista_fechamento)}
                      </span>
                    )}
                  </div>

                  {op.observacoes && (
                    <p className="text-xs text-[#64748B] bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                      {op.observacoes}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletandoId === op.id}
                    onClick={() => handleExcluir(op.id)}
                    className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                    title="Excluir Oportunidade"
                  >
                    {deletandoId === op.id ? (
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

      {/* Modal Formulário Simplificado */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#2563EB]" />
              Nova Oportunidade
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Registre um novo negócio para este cliente no funil comercial.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            {erro && <p className="text-xs text-[#DC2626] bg-red-50 p-2 rounded">{erro}</p>}

            <div className="space-y-1">
              <Label htmlFor="valor" className="text-xs font-semibold text-[#0F172A]">
                Valor da Oportunidade (R$) <span className="text-[#DC2626]">*</span>
              </Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Ex: 15000.00"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="etapa_id" className="text-xs font-semibold text-[#0F172A]">
                Etapa do Funil <span className="text-[#DC2626]">*</span>
              </Label>
              <Select value={etapaId} onValueChange={setEtapaId}>
                <SelectTrigger id="etapa_id">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      {et.ordem}. {et.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="status" className="text-xs font-semibold text-[#0F172A]">
                  Status
                </Label>
                <Select value={status} onValueChange={(val: StatusOportunidade) => setStatus(val)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Em Aberto</SelectItem>
                    <SelectItem value="ganho">Ganho (Fechado)</SelectItem>
                    <SelectItem value="perdido">Perdido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="dataPrevista" className="text-xs font-semibold text-[#0F172A]">
                  Previsão Fechamento
                </Label>
                <Input
                  id="dataPrevista"
                  type="date"
                  value={dataPrevista}
                  onChange={(e) => setDataPrevista(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="op_obs" className="text-xs font-semibold text-[#0F172A]">
                Observações
              </Label>
              <Textarea
                id="op_obs"
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Detalhes da proposta ou escopo..."
                className="resize-none"
              />
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
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Oportunidade'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
