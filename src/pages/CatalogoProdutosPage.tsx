import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Search,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Lock,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import type { ProdutoModel } from '@/types/conversas'
import { formatarMoeda } from '@/types/clientes'

export default function CatalogoProdutosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perfil = user?.perfil
  const podeGerenciar = perfil === 'ceo_financeiro'

  const [produtos, setProdutos] = useState<ProdutoModel[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  // Modal formulário
  const [modalOpen, setModalOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<ProdutoModel | null>(null)

  // Form states
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [unidade, setUnidade] = useState('un')
  const [disponibilidade, setDisponibilidade] = useState(true)
  const [prazoEntrega, setPrazoEntrega] = useState('Pronta entrega')

  // Modal exclusão
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const carregarProdutos = useCallback(async () => {
    try {
      setLoading(true)
      const records = await pb.collection('produtos').getFullList<ProdutoModel>({
        sort: 'nome',
      })
      setProdutos(records)
    } catch (err) {
      console.log('Erro ao carregar produtos:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar catálogo',
        description: getErrorMessage(err),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarProdutos()
  }, [carregarProdutos])

  const abrirNovo = () => {
    setEditando(null)
    setNome('')
    setPreco('')
    setUnidade('un')
    setDisponibilidade(true)
    setPrazoEntrega('Pronta entrega')
    setModalOpen(true)
  }

  const abrirEditar = (prod: ProdutoModel) => {
    setEditando(prod)
    setNome(prod.nome)
    setPreco(String(prod.preco))
    setUnidade(prod.unidade || 'un')
    setDisponibilidade(prod.disponibilidade !== false)
    setPrazoEntrega(prod.prazo_entrega || '')
    setModalOpen(true)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório' })
      return
    }
    const precoNum = parseFloat(preco.replace(',', '.'))
    if (isNaN(precoNum) || precoNum < 0) {
      toast({ variant: 'destructive', title: 'Preço inválido' })
      return
    }

    try {
      setSalvando(true)
      const data = {
        nome: nome.trim(),
        preco: precoNum,
        unidade: unidade.trim() || 'un',
        disponibilidade,
        prazo_entrega: prazoEntrega.trim(),
      }

      if (editando) {
        await pb.collection('produtos').update(editando.id, data)
        toast({ title: 'Produto atualizado', description: `${data.nome} foi atualizado.` })
      } else {
        await pb.collection('produtos').create(data)
        toast({
          title: 'Produto cadastrado',
          description: `${data.nome} foi adicionado ao catálogo.`,
        })
      }

      setModalOpen(false)
      carregarProdutos()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleExcluir = async () => {
    if (!excluindoId) return
    try {
      setExcluindo(true)
      await pb.collection('produtos').delete(excluindoId)
      toast({ title: 'Produto removido com sucesso' })
      setExcluindoId(null)
      carregarProdutos()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: getErrorMessage(err),
      })
    } finally {
      setExcluindo(false)
    }
  }

  const produtosFiltrados = produtos.filter((p) =>
    busca ? p.nome.toLowerCase().includes(busca.toLowerCase()) : true,
  )

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-12">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/configuracoes')}
              className="text-[#64748B] hover:text-[#0F172A] gap-1.5 h-8 px-2.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </Button>
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-semibold gap-1"
            >
              <Package className="w-3.5 h-3.5" />
              Tabela de Preços e Prazos
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1 flex items-center gap-2">
            Catálogo de Produtos (Base de IA)
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Cadastre os itens da Colesel 45. O assistente de IA consulta esse catálogo para sugerir
            preços, prazos e estoque com precisão — sem inventar dados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarProdutos}
            disabled={loading}
            className="text-[#64748B]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {podeGerenciar ? (
            <Button
              onClick={abrirNovo}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm font-semibold gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Novo Produto
            </Button>
          ) : (
            <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 gap-1">
              <Lock className="w-3 h-3" />
              Edição restrita ao CEO
            </Badge>
          )}
        </div>
      </div>

      {/* Busca */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <Input
            type="text"
            placeholder="Buscar por nome do produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 bg-[#F8FAFC] border-[#E2E8F0] text-sm"
          />
        </div>
        <div className="text-xs text-[#64748B] whitespace-nowrap">
          {produtosFiltrados.length} {produtosFiltrados.length === 1 ? 'produto' : 'produtos'}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#64748B] flex flex-col items-center gap-2">
            <RefreshCw className="w-7 h-7 text-[#16A34A] animate-spin" />
            <p className="text-sm">Carregando catálogo...</p>
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#0F172A]">
              {busca ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            </h3>
            <p className="text-xs text-[#64748B]">
              {busca
                ? 'Nenhum item corresponde ao termo pesquisado.'
                : 'O catálogo está vazio. Cadastre os produtos comercializados pela Colesel para abastecer o Assistente de IA.'}
            </p>
            {podeGerenciar && !busca && (
              <Button
                onClick={abrirNovo}
                className="bg-[#16A34A] hover:bg-[#15803D] text-white text-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Cadastrar Primeiro Produto
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#64748B] uppercase">
                <tr>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Preço Unitário</th>
                  <th className="py-3 px-4">Disponibilidade</th>
                  <th className="py-3 px-4">Prazo de Entrega</th>
                  {podeGerenciar && <th className="py-3 px-4 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {produtosFiltrados.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#0F172A]">{prod.nome}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-bold text-[#16A34A]">
                        <Coins className="w-3.5 h-3.5 text-[#16A34A]" />
                        <span>{formatarMoeda(prod.preco)}</span>
                        <span className="text-xs text-[#64748B] font-normal">/ {prod.unidade}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {prod.disponibilidade !== false ? (
                        <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-medium gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Em estoque
                        </Badge>
                      ) : (
                        <Badge className="bg-red-50 text-[#DC2626] border-red-200 text-xs font-medium gap-1">
                          <XCircle className="w-3 h-3" />
                          Indisponível
                        </Badge>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#64748B]">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{prod.prazo_entrega || 'Sob consulta'}</span>
                      </div>
                    </td>
                    {podeGerenciar && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirEditar(prod)}
                            className="h-8 w-8 p-0 text-[#64748B] hover:text-[#0F172A]"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExcluindoId(prod.id)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Formulário */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Produto' : 'Cadastrar Novo Produto'}</DialogTitle>
            <DialogDescription>
              Dados usados pelo Assistente de IA para responder clientes no WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvar} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="prod-nome" className="text-xs font-bold text-[#0F172A]">
                Nome do Produto *
              </Label>
              <Input
                id="prod-nome"
                required
                placeholder="Ex: Cimento CP-II 50kg, Telha Cerâmica..."
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod-preco" className="text-xs font-bold text-[#0F172A]">
                  Preço Unitário (R$) *
                </Label>
                <Input
                  id="prod-preco"
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex: 34.90"
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prod-unidade" className="text-xs font-bold text-[#0F172A]">
                  Unidade de Medida *
                </Label>
                <Input
                  id="prod-unidade"
                  required
                  placeholder="Ex: un, m², kg, saco, metro..."
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-prazo" className="text-xs font-bold text-[#0F172A]">
                Prazo de Entrega
              </Label>
              <Input
                id="prod-prazo"
                placeholder="Ex: Pronta entrega, 24 horas, 3 a 5 dias úteis..."
                value={prazoEntrega}
                onChange={(e) => setPrazoEntrega(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="space-y-0.5">
                <Label
                  htmlFor="prod-disp"
                  className="text-xs font-bold text-[#0F172A] cursor-pointer"
                >
                  Disponível em Estoque
                </Label>
                <p className="text-[11px] text-[#64748B]">
                  Se desligado, a IA informará que o item está sob consulta.
                </p>
              </div>
              <Switch
                id="prod-disp"
                checked={disponibilidade}
                onCheckedChange={setDisponibilidade}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-[#16A34A] hover:bg-[#15803D] text-white"
                disabled={salvando}
              >
                {salvando ? 'Salvando...' : editando ? 'Atualizar' : 'Salvar Produto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Alerta de Exclusão */}
      <AlertDialog
        open={Boolean(excluindoId)}
        onOpenChange={(open) => !open && setExcluindoId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o produto do catálogo de dados da IA. A ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              disabled={excluindo}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
