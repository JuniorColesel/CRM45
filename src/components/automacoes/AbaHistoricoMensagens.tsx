import { useState, useMemo } from 'react'
import {
  MessageSquare,
  Search,
  RefreshCw,
  Mail,
  Send,
  Calendar,
  AlertTriangle,
  RotateCw,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  ExternalLink,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { MensagemEnviadaModel, CanalMensagem, StatusMensagem } from '@/types/clientes'
import { formatarDataHora } from '@/types/clientes'
import { SheetMensagemDetalhes } from '@/components/automacoes/SheetMensagemDetalhes'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface AbaHistoricoMensagensProps {
  mensagens: MensagemEnviadaModel[]
  loading: boolean
  onReload: () => void
  onUpdateLista: (lista: MensagemEnviadaModel[]) => void
}

export function AbaHistoricoMensagens({
  mensagens,
  loading,
  onReload,
  onUpdateLista,
}: AbaHistoricoMensagensProps) {
  // Filtros em tempo real
  const [buscaCliente, setBuscaCliente] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<StatusMensagem | 'todos'>('todos')

  // Sheet de detalhes
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mensagemSelecionada, setMensagemSelecionada] = useState<MensagemEnviadaModel | null>(null)
  const [reenviando, setReenviando] = useState(false)

  // Filtragem em tempo real
  const mensagensFiltradas = useMemo(() => {
    return mensagens.filter((msg) => {
      // Filtro de status
      if (filtroStatus !== 'todos' && msg.status !== filtroStatus) {
        return false
      }

      // Busca por nome de cliente ou empresa
      if (buscaCliente.trim()) {
        const termo = buscaCliente.toLowerCase().trim()
        const cliNome = msg.expand?.cliente_id?.nome_contato?.toLowerCase() || ''
        const cliEmpresa = msg.expand?.cliente_id?.nome_empresa?.toLowerCase() || ''
        const conteudo = msg.conteudo.toLowerCase()
        const match =
          cliNome.includes(termo) || cliEmpresa.includes(termo) || conteudo.includes(termo)
        if (!match) return false
      }

      return true
    })
  }, [mensagens, buscaCliente, filtroStatus])

  // Badge do canal colorido: whatsapp=verde, email=azul, sms=roxo
  const renderBadgeCanal = (c: CanalMensagem) => {
    switch (c) {
      case 'whatsapp':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[11px] gap-1 font-semibold shrink-0">
            <MessageSquare className="w-3 h-3 text-[#16A34A]" />
            WhatsApp
          </Badge>
        )
      case 'email':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-[11px] gap-1 font-semibold shrink-0">
            <Mail className="w-3 h-3 text-[#2563EB]" />
            E-mail
          </Badge>
        )
      case 'sms':
        return (
          <Badge className="bg-purple-50 text-[#7C3AED] border-purple-200 text-[11px] gap-1 font-semibold shrink-0">
            <Send className="w-3 h-3 text-[#7C3AED]" />
            SMS
          </Badge>
        )
    }
  }

  // Badge de status: pendente=amarelo, enviada=azul, entregue=verde, lida=verde escuro, falhou=vermelho
  const renderBadgeStatus = (s: StatusMensagem) => {
    switch (s) {
      case 'pendente':
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold gap-1">
            <Clock className="w-2.5 h-2.5" />
            Pendente
          </Badge>
        )
      case 'enviada':
        return (
          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-[10px] font-semibold gap-1">
            <Send className="w-2.5 h-2.5" />
            Enviada
          </Badge>
        )
      case 'entregue':
        return (
          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[10px] font-semibold gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Entregue
          </Badge>
        )
      case 'lida':
        return (
          <Badge className="bg-emerald-800 text-white border-emerald-900 text-[10px] font-semibold gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Lida
          </Badge>
        )
      case 'falhou':
        return (
          <Badge className="bg-red-50 text-[#DC2626] border-red-200 text-[10px] font-semibold gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            Falhou
          </Badge>
        )
    }
  }

  // Trunca texto em 100 caracteres com "..."
  const truncarTexto = (texto: string, max = 100) => {
    if (!texto) return '—'
    if (texto.length <= max) return texto
    return texto.substring(0, max) + '...'
  }

  // Abrir Sheet com detalhes
  const handleAbrirDetalhes = (msg: MensagemEnviadaModel) => {
    setMensagemSelecionada(msg)
    setSheetOpen(true)
  }

  // Reenviar mensagem: cria NOVO registro com status "pendente", NÃO altera original
  const handleReenviar = async (msg: MensagemEnviadaModel) => {
    setReenviando(true)
    try {
      const payload = {
        cliente_id: msg.cliente_id,
        automacao_id: msg.automacao_id || null,
        canal: msg.canal,
        conteudo: msg.conteudo,
        status: 'pendente' as StatusMensagem,
        data_envio: new Date().toISOString(),
        data_leitura: null,
        erro: null,
      }

      const novaMsg = await pb
        .collection('mensagens_enviadas')
        .create<MensagemEnviadaModel>(payload, {
          expand: 'cliente_id,automacao_id',
        })

      // Atualiza lista em memória com o novo registro no topo
      onUpdateLista([novaMsg, ...mensagens])

      toast({
        title: 'Mensagem agendada para reenvio',
        description: 'Um novo disparo foi criado com status "Pendente" com sucesso.',
      })

      // Atualiza mensagem selecionada no sheet ou fecha
      setMensagemSelecionada(novaMsg)
    } catch (err: unknown) {
      const msgErro = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao reenviar mensagem',
        description:
          msgErro.includes('permissão') || msgErro.includes('403')
            ? 'Você não tem permissão para disparar mensagens para este cliente.'
            : msgErro || 'Ocorreu um erro ao duplicar o envio.',
      })
    } finally {
      setReenviando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo com Título e Atualizar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#2563EB]" />
            Histórico de Mensagens ({mensagensFiltradas.length})
          </h3>
          <p className="text-xs text-[#64748B]">
            Disparos automáticos e interações enviadas via WhatsApp, E-mail e SMS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar histórico"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Barra de Filtros e Busca em Tempo Real */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-8 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
            <Input
              placeholder="Buscar por cliente, empresa ou texto da mensagem..."
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              className="pl-9 bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9"
            />
          </div>

          <div className="sm:col-span-4">
            <Select
              value={filtroStatus}
              onValueChange={(val: StatusMensagem | 'todos') => setFiltroStatus(val)}
            >
              <SelectTrigger className="w-full bg-[#F8FAFC] border-[#E2E8F0] text-xs sm:text-sm h-9">
                <div className="flex items-center gap-2 truncate">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#64748B]" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente (Amarelo)</SelectItem>
                <SelectItem value="enviada">Enviada (Azul)</SelectItem>
                <SelectItem value="entregue">Entregue (Verde)</SelectItem>
                <SelectItem value="lida">Lida (Verde Escuro)</SelectItem>
                <SelectItem value="falhou">Falhou (Vermelho)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Conteúdo: Tabela Desktop / Cartões Mobile */}
      {loading ? (
        <div className="py-16 text-center text-xs text-[#64748B] flex items-center justify-center gap-2 bg-white rounded-2xl border border-[#E2E8F0]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" />
          Carregando mensagens enviadas...
        </div>
      ) : mensagensFiltradas.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[#E2E8F0] bg-white space-y-2">
          <MessageSquare className="w-10 h-10 text-[#94A3B8] mx-auto" />
          <h4 className="text-sm font-semibold text-[#0F172A]">Nenhuma mensagem encontrada</h4>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            {buscaCliente || filtroStatus !== 'todos'
              ? 'Nenhum disparo corresponde aos filtros aplicados.'
              : 'As mensagens disparadas pelas automações aparecerão listadas aqui com seus status.'}
          </p>
        </div>
      ) : (
        <>
          {/* TABELA DESKTOP (≥768px) */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-[#F8FAFC]">
                <TableRow>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Cliente</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Canal</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A] w-2/5">
                    Conteúdo
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Status</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Data Envio</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">
                    Data Leitura
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A] text-right">
                    Ação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E2E8F0]">
                {mensagensFiltradas.map((msg) => {
                  const cliente = msg.expand?.cliente_id

                  return (
                    <TableRow
                      key={msg.id}
                      onClick={() => handleAbrirDetalhes(msg)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      {/* Cliente */}
                      <TableCell className="py-3.5 text-xs text-[#0F172A]">
                        <div className="font-bold text-[#0F172A]">
                          {cliente?.nome_contato || 'Cliente não identificado'}
                        </div>
                        {cliente?.nome_empresa && (
                          <div className="text-[11px] text-[#64748B]">{cliente.nome_empresa}</div>
                        )}
                      </TableCell>

                      {/* Canal */}
                      <TableCell className="py-3.5">{renderBadgeCanal(msg.canal)}</TableCell>

                      {/* Conteúdo truncado em 100 caracteres */}
                      <TableCell className="py-3.5 text-xs text-[#334155] font-sans">
                        <span className="line-clamp-2" title={msg.conteudo}>
                          {truncarTexto(msg.conteudo, 100)}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5">{renderBadgeStatus(msg.status)}</TableCell>

                      {/* Data de Envio */}
                      <TableCell className="py-3.5 text-xs text-[#64748B]">
                        {msg.data_envio ? (
                          <span className="flex items-center gap-1 font-medium">
                            <Calendar className="w-3 h-3 text-[#94A3B8]" />
                            {formatarDataHora(msg.data_envio)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>

                      {/* Data de Leitura */}
                      <TableCell className="py-3.5 text-xs text-[#64748B]">
                        {msg.data_leitura ? (
                          <span className="flex items-center gap-1 font-medium text-emerald-700">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {formatarDataHora(msg.data_leitura)}
                          </span>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </TableCell>

                      {/* Botão Ver / Reenviar rápido */}
                      <TableCell className="py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAbrirDetalhes(msg)}
                          className="h-8 text-xs text-[#2563EB] hover:text-[#1D4ED8] hover:bg-blue-50"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />
                          Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* CARTÕES MOBILE (<768px) */}
          <div className="md:hidden space-y-3">
            {mensagensFiltradas.map((msg) => {
              const cliente = msg.expand?.cliente_id

              return (
                <div
                  key={msg.id}
                  onClick={() => handleAbrirDetalhes(msg)}
                  className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm space-y-3 cursor-pointer hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-[#0F172A]">
                        {cliente?.nome_contato || 'Cliente não identificado'}
                      </h4>
                      {cliente?.nome_empresa && (
                        <p className="text-xs text-[#64748B]">{cliente.nome_empresa}</p>
                      )}
                    </div>
                    {renderBadgeCanal(msg.canal)}
                  </div>

                  {/* Conteúdo */}
                  <div className="text-xs text-[#334155] bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-sans leading-relaxed">
                    {truncarTexto(msg.conteudo, 100)}
                  </div>

                  {/* Rodapé do Card */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-2">{renderBadgeStatus(msg.status)}</div>

                    <div className="flex items-center gap-1 text-[11px] text-[#64748B]">
                      <Calendar className="w-3 h-3 text-[#94A3B8]" />
                      {msg.data_envio ? formatarDataHora(msg.data_envio) : '—'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Sheet Lateral com Detalhes e Ação de Reenviar */}
      <SheetMensagemDetalhes
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mensagem={mensagemSelecionada}
        onReenviar={handleReenviar}
        reenviando={reenviando}
      />
    </div>
  )
}
