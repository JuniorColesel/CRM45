import React, { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DollarSign,
  User,
  Building,
  Calendar,
  Layers,
  FileText,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { OportunidadeModel } from '@/types/clientes'
import {
  formatarMoeda,
  formatarData,
  podeEditarOportunidade,
  podeExcluirOportunidade,
} from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface OportunidadeDetalhesSheetProps {
  oportunidade: OportunidadeModel | null
  open: boolean
  usuarios?: Usuario[]
  onOpenChange: (open: boolean) => void
  onEditar: (op: OportunidadeModel) => void
  onExcluida: (opId: string) => void
}

export default function OportunidadeDetalhesSheet({
  oportunidade,
  open,
  usuarios,
  onOpenChange,
  onEditar,
  onExcluida,
}: OportunidadeDetalhesSheetProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  if (!oportunidade) return null

  const podeEditar = podeEditarOportunidade(user, oportunidade)
  const podeExcluir = podeExcluirOportunidade(user, oportunidade)

  const etapaNome = oportunidade.expand?.etapa_id?.nome || 'Etapa não definida'
  const etapaCor = oportunidade.expand?.etapa_id?.cor || '#2563EB'
  const clienteNome = oportunidade.expand?.cliente_id?.nome_contato || 'Cliente não identificado'
  const empresaNome = oportunidade.expand?.cliente_id?.nome_empresa
  const isBling =
    oportunidade.origem === 'bling' ||
    oportunidade.tipo_origem === 'bling_proposta' ||
    oportunidade.tipo_origem === 'bling_pedido'

  // Resolver Vendedor comercialmente
  const vendedorId = oportunidade.vendedor || oportunidade.responsavel_id
  let nomeVendedor = 'Sem vendedor'
  if (vendedorId && usuarios) {
    const userFound = usuarios.find((u) => u.id === vendedorId)
    if (userFound) {
      if (userFound.nome.includes('Alice')) nomeVendedor = 'Alice'
      else if (userFound.nome.includes('Renan')) nomeVendedor = 'Renan'
      else if (userFound.nome.includes('Karoline') || userFound.perfil === 'vendedor_1') {
        nomeVendedor = 'Karoline (Vendas 1)'
      } else if (userFound.perfil === 'vendedor_2') nomeVendedor = 'Vendas 2'
      else nomeVendedor = userFound.nome
    }
  } else if (oportunidade.expand?.responsavel_id?.nome) {
    nomeVendedor = oportunidade.expand.responsavel_id.nome
  }

  // Regra de Data de Fechamento:
  // Para pedido em aberto Bling (etapa Em aberto Bling ou situacao Em aberto):
  // data_fechamento fica vazia até ficar Atendido -> mostrar "Em andamento"
  const isEmAbertoBling =
    oportunidade.tipo_origem === 'bling_pedido' &&
    (etapaNome.toLowerCase().includes('em aberto') ||
      oportunidade.observacoes?.includes('Em aberto') ||
      !oportunidade.data_fechamento)

  const motivoDescricao = oportunidade.expand?.motivo_perda_id?.descricao

  const handleExcluir = async () => {
    setExcluindo(true)
    try {
      await pb.collection('oportunidades').delete(oportunidade.id)
      toast({
        title: 'Oportunidade excluída',
        description: 'A oportunidade foi removida com sucesso.',
      })
      setConfirmarExclusao(false)
      onOpenChange(false)
      onExcluida(oportunidade.id)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir oportunidade',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para excluir esta oportunidade.'
            : msg || 'Ocorreu um erro ao excluir a oportunidade.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  const renderStatusBadge = () => {
    switch (oportunidade.status) {
      case 'ganho':
        return (
          <Badge className="bg-emerald-100 text-[#16A34A] border-emerald-200 text-xs font-semibold">
            Ganho (Fechado)
          </Badge>
        )
      case 'perdido':
        return (
          <Badge className="bg-red-100 text-[#DC2626] border-red-200 text-xs font-semibold">
            Perdido
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-[#64748B] border-slate-300 text-xs font-semibold">
            Em Aberto
          </Badge>
        )
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 bg-white">
          {/* Header */}
          <div className="p-6 border-b border-[#E2E8F0] space-y-3 bg-[#F8FAFC]">
            <div className="flex items-center justify-between gap-2">
              <Badge
                style={{
                  backgroundColor: `${etapaCor}18`,
                  color: etapaCor,
                  borderColor: `${etapaCor}40`,
                }}
                className="text-xs font-bold border"
              >
                {etapaNome}
              </Badge>
              {renderStatusBadge()}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Valor da Oportunidade
              </p>
              <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight mt-0.5">
                {formatarMoeda(oportunidade.valor)}
              </h2>
              {isBling && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Esta oportunidade é controlada pelo Bling (
                    {oportunidade.tipo_origem === 'bling_proposta'
                      ? 'Proposta Comercial'
                      : 'Pedido de Venda'}
                    ). Altere a informação no Bling e sincronize novamente.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Conteúdo com scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Cliente */}
            <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#64748B] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#2563EB]" />
                  Cliente Vinculado
                </span>
                {oportunidade.cliente_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-[#2563EB] hover:bg-blue-50"
                    onClick={() => {
                      onOpenChange(false)
                      navigate(`/clientes/${oportunidade.cliente_id}`)
                    }}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Ver Visão 360°
                  </Button>
                )}
              </div>
              <div className="font-bold text-base text-[#0F172A]">{clienteNome}</div>
              {empresaNome && (
                <div className="text-xs text-[#64748B] flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-[#94A3B8]" />
                  {empresaNome}
                </div>
              )}
            </div>

            {/* Informações Comerciais */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                Informações Comerciais
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="text-[11px] font-medium text-[#64748B] flex items-center gap-1">
                    <User className="w-3 h-3 text-[#64748B]" />
                    Vendedor
                  </span>
                  <p className="text-xs font-bold text-[#0F172A] mt-1 truncate">{nomeVendedor}</p>
                </div>

                <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="text-[11px] font-medium text-[#64748B] flex items-center gap-1">
                    <Layers className="w-3 h-3 text-[#64748B]" />
                    Etapa Atual
                  </span>
                  <p className="text-xs font-bold text-[#0F172A] mt-1 truncate">{etapaNome}</p>
                </div>

                <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="text-[11px] font-medium text-[#64748B] flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#64748B]" />
                    Data de Origem
                  </span>
                  <p className="text-xs font-bold text-[#0F172A] mt-1">
                    {oportunidade.data_origem
                      ? formatarData(oportunidade.data_origem)
                      : 'Não informada'}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="text-[11px] font-medium text-[#64748B] flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#64748B]" />
                    Data de Fechamento
                  </span>
                  <p className="text-xs font-bold text-[#0F172A] mt-1">
                    {oportunidade.data_fechamento
                      ? formatarData(oportunidade.data_fechamento)
                      : isEmAbertoBling
                        ? 'Em andamento'
                        : oportunidade.data_prevista_fechamento
                          ? `Prev: ${formatarData(oportunidade.data_prevista_fechamento)}`
                          : 'Não informada'}
                  </p>
                </div>
              </div>

              {/* Motivo de perda se aplicável */}
              {oportunidade.status === 'perdido' && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 space-y-1">
                  <span className="text-xs font-bold text-[#DC2626] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Motivo da Perda
                  </span>
                  <p className="text-xs text-[#7F1D1D] font-medium">
                    {motivoDescricao || 'Motivo não informado'}
                  </p>
                </div>
              )}
            </div>

            {/* Observações completas */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#64748B]" />
                Observações Completas
              </h3>
              {oportunidade.observacoes ? (
                <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#0F172A] leading-relaxed whitespace-pre-wrap">
                  {oportunidade.observacoes}
                </div>
              ) : (
                <p className="text-xs text-[#94A3B8] italic p-3 rounded-lg border border-dashed border-[#E2E8F0]">
                  Nenhuma observação informada para esta oportunidade.
                </p>
              )}
            </div>
          </div>

          {/* Footer com botões Editar e Excluir */}
          <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-2">
            <div>
              {podeExcluir ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmarExclusao(true)}
                  className="text-xs text-[#DC2626] hover:bg-red-50 hover:text-[#B91C1C] border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Excluir
                </Button>
              ) : isBling ? (
                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded font-medium">
                  Controlado pelo Bling (Somente Leitura)
                </span>
              ) : (
                <span className="text-[11px] text-[#94A3B8]">Somente leitura</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs"
              >
                Fechar
              </Button>
              {podeEditar && (
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onEditar(oportunidade)
                  }}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Editar Oportunidade
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#0F172A] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
              Confirmar Exclusão de Oportunidade
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#64748B]">
              Tem certeza de que deseja excluir esta oportunidade no valor de{' '}
              <strong className="text-[#0F172A]">{formatarMoeda(oportunidade.valor)}</strong>{' '}
              (Cliente: {clienteNome})? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              disabled={excluindo}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            >
              {excluindo ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Sim, Excluir Oportunidade'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
