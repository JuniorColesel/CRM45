import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Phone,
  Loader2,
  Trash2,
  Calendar,
  User,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  PhoneMissed,
} from 'lucide-react'
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
import type { LigacaoModel, TipoLigacao, ResultadoLigacao } from '@/types/clientes'
import { formatarDataHora, formatarDuracao } from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaLigacoesProps {
  clienteId: string
}

export default function AbaLigacoes({ clienteId }: AbaLigacoesProps) {
  const { user } = useAuth()
  const [ligacoes, setLigacoes] = useState<LigacaoModel[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletandoId, setDeletandoId] = useState<string | null>(null)

  // Formulário
  const [tipo, setTipo] = useState<TipoLigacao>('saida')
  const [resultado, setResultado] = useState<ResultadoLigacao>('atendeu')
  const [dataHora, setDataHora] = useState('')
  const [duracaoSegundos, setDuracaoSegundos] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [proximaAcao, setProximaAcao] = useState('')
  const [erro, setErro] = useState('')

  const carregarLigacoes = useCallback(async () => {
    try {
      setLoading(true)
      const res = await pb.collection('ligacoes').getFullList<LigacaoModel>({
        filter: `cliente_id = "${clienteId}"`,
        sort: '-data_hora',
        expand: 'responsavel_id',
      })
      setLigacoes(res)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar ligações',
        description: msg.includes('403')
          ? 'Você não tem permissão para visualizar as ligações deste cliente.'
          : 'Não foi possível carregar as ligações.',
      })
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => {
    carregarLigacoes()
  }, [carregarLigacoes])

  const abrirModalCriar = () => {
    setTipo('saida')
    setResultado('atendeu')
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    setDataHora(now.toISOString().slice(0, 16))
    setDuracaoSegundos('120')
    setObservacoes('')
    setProximaAcao('')
    setErro('')
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dataHora) {
      setErro('Informe a data e o horário da ligação.')
      return
    }

    setSaving(true)
    setErro('')
    try {
      const payload = {
        cliente_id: clienteId,
        responsavel_id: user?.id,
        tipo,
        resultado,
        data_hora: new Date(dataHora).toISOString(),
        duracao_segundos: duracaoSegundos ? parseInt(duracaoSegundos, 10) : 0,
        observacoes: observacoes.trim() || '',
        proxima_acao: proximaAcao.trim() || '',
      }

      const nova = await pb.collection('ligacoes').create<LigacaoModel>(payload, {
        expand: 'responsavel_id',
      })

      setLigacoes((prev) => [nova, ...prev])
      toast({
        title: 'Ligação registrada',
        description: 'Registro de ligação salvo com sucesso.',
      })
      setModalOpen(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar ligação',
        description: msg.includes('403')
          ? 'Permissão negada para cadastrar ligações.'
          : msg || 'Ocorreu um erro ao salvar a ligação.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (ligacaoId: string) => {
    setDeletandoId(ligacaoId)
    try {
      await pb.collection('ligacoes').delete(ligacaoId)
      setLigacoes((prev) => prev.filter((l) => l.id !== ligacaoId))
      toast({
        title: 'Ligação excluída',
        description: 'O registro de ligação foi removido.',
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir ligação',
        description: msg.includes('403')
          ? 'Você não tem permissão para excluir esta ligação.'
          : 'Ocorreu um erro ao excluir.',
      })
    } finally {
      setDeletandoId(null)
    }
  }

  const badgeTipo = (t: TipoLigacao) => {
    switch (t) {
      case 'entrada':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-[11px] gap-1">
            <ArrowDownLeft className="w-3 h-3" />
            Recebida
          </Badge>
        )
      case 'saida':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[11px] gap-1">
            <ArrowUpRight className="w-3 h-3" />
            Efetuada
          </Badge>
        )
      case 'perdida':
        return (
          <Badge className="bg-red-50 text-[#DC2626] border-red-200 text-[11px] gap-1">
            <PhoneMissed className="w-3 h-3" />
            Perdida
          </Badge>
        )
    }
  }

  const badgeResultado = (r?: ResultadoLigacao) => {
    switch (r) {
      case 'atendeu':
        return (
          <Badge variant="outline" className="text-emerald-700 bg-emerald-50 text-[11px]">
            Atendeu
          </Badge>
        )
      case 'nao_atendeu':
        return (
          <Badge variant="outline" className="text-amber-700 bg-amber-50 text-[11px]">
            Não Atendeu
          </Badge>
        )
      case 'caixa_postal':
        return (
          <Badge variant="outline" className="text-slate-700 bg-slate-100 text-[11px]">
            Caixa Postal
          </Badge>
        )
      case 'ocupado':
        return (
          <Badge variant="outline" className="text-orange-700 bg-orange-50 text-[11px]">
            Ocupado
          </Badge>
        )
      case 'desligou':
        return (
          <Badge variant="outline" className="text-red-700 bg-red-50 text-[11px]">
            Desligou
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Topo da Aba */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#7C3AED]" />
            Ligações e Contatos Telefônicos ({ligacoes.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Histórico de chamadas efetuadas e recebidas com este contato.
          </p>
        </div>

        <Button
          onClick={abrirModalCriar}
          size="sm"
          className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Registrar Ligação
        </Button>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#7C3AED]" />
          Carregando histórico de chamadas...
        </div>
      ) : ligacoes.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-slate-50/50 space-y-2">
          <Phone className="w-8 h-8 text-[#94A3B8] mx-auto" />
          <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma ligação registrada</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Mantenha o histórico das conversas telefônicas, durações e próximos passos combinados.
          </p>
          <Button onClick={abrirModalCriar} size="sm" variant="outline" className="text-xs mt-2">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Registrar Primeira Ligação
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
          {ligacoes.map((ligacao) => {
            const respNome = ligacao.expand?.responsavel_id?.nome || 'Responsável'

            return (
              <div
                key={ligacao.id}
                className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {badgeTipo(ligacao.tipo)}
                    {badgeResultado(ligacao.resultado)}
                    {ligacao.duracao_segundos !== undefined && (
                      <span className="text-xs font-medium text-[#64748B] bg-slate-100 px-2 py-0.5 rounded">
                        Duração: {formatarDuracao(ligacao.duracao_segundos)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-[#64748B] flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#94A3B8]" />
                      {formatarDataHora(ligacao.data_hora)}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-[#94A3B8]" />
                      {respNome}
                    </span>
                  </div>

                  {ligacao.observacoes && (
                    <p className="text-xs text-[#0F172A] bg-slate-50 p-2 rounded border border-slate-100 mt-1">
                      {ligacao.observacoes}
                    </p>
                  )}

                  {ligacao.proxima_acao && (
                    <p className="text-xs text-[#7C3AED] font-medium flex items-center gap-1 mt-0.5">
                      Próxima ação: {ligacao.proxima_acao}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletandoId === ligacao.id}
                    onClick={() => handleExcluir(ligacao.id)}
                    className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                    title="Excluir Ligação"
                  >
                    {deletandoId === ligacao.id ? (
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

      {/* Modal Registrar Ligação */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <Phone className="w-5 h-5 text-[#7C3AED]" />
              Registrar Ligação
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Salve os detalhes da chamada telefônica realizada ou recebida.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            {erro && <p className="text-xs text-[#DC2626] bg-red-50 p-2 rounded">{erro}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tipo" className="text-xs font-semibold text-[#0F172A]">
                  Tipo de Ligação <span className="text-[#DC2626]">*</span>
                </Label>
                <Select value={tipo} onValueChange={(val: TipoLigacao) => setTipo(val)}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saida">Efetuada (Saída)</SelectItem>
                    <SelectItem value="entrada">Recebida (Entrada)</SelectItem>
                    <SelectItem value="perdida">Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="resultado" className="text-xs font-semibold text-[#0F172A]">
                  Resultado
                </Label>
                <Select
                  value={resultado}
                  onValueChange={(val: ResultadoLigacao) => setResultado(val)}
                >
                  <SelectTrigger id="resultado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atendeu">Atendeu</SelectItem>
                    <SelectItem value="nao_atendeu">Não Atendeu</SelectItem>
                    <SelectItem value="caixa_postal">Caixa Postal</SelectItem>
                    <SelectItem value="ocupado">Ocupado</SelectItem>
                    <SelectItem value="desligou">Desligou na cara</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div className="space-y-1">
                <Label htmlFor="duracao" className="text-xs font-semibold text-[#0F172A]">
                  Duração (segundos)
                </Label>
                <Input
                  id="duracao"
                  type="number"
                  min="0"
                  value={duracaoSegundos}
                  onChange={(e) => setDuracaoSegundos(e.target.value)}
                  placeholder="Ex: 120"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="obs_lig" className="text-xs font-semibold text-[#0F172A]">
                Resumo da Conversa
              </Label>
              <Textarea
                id="obs_lig"
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Principais pontos abordados, dúvidas e alinhamentos..."
                className="resize-none"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="prox_acao" className="text-xs font-semibold text-[#0F172A]">
                Próxima Ação Combinada
              </Label>
              <Input
                id="prox_acao"
                value={proximaAcao}
                onChange={(e) => setProximaAcao(e.target.value)}
                placeholder="Ex: Enviar catálogo por WhatsApp até amanhã"
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
                className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Registro'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
