import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  User,
  Building,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  DollarSign,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type {
  ClienteModel,
  VendedorCliente,
  TipoContatoCliente,
  StatusCliente,
  GrandeClienteFlag,
} from '@/types/clientes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface ClienteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cliente?: ClienteModel | null
  usuarios: Usuario[]
  onSuccess: (cliente: ClienteModel) => void
}

export default function ClienteModal({
  open,
  onOpenChange,
  cliente,
  usuarios: _usuarios,
  onSuccess,
}: ClienteModalProps) {
  const { user } = useAuth()
  const isEditing = Boolean(cliente)

  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [nomeContato, setNomeContato] = useState('')
  const [cnpjCpf, setCnpjCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [estado, setEstado] = useState('')
  const [vendedor, setVendedor] = useState<VendedorCliente>('Alice')
  const [tipoContato, setTipoContato] = useState<TipoContatoCliente>('cliente')
  const [statusCliente, setStatusCliente] = useState<StatusCliente>('ativo')
  const [grandeCliente, setGrandeCliente] = useState<GrandeClienteFlag>('nao')
  const [valorTotalVendas, setValorTotalVendas] = useState<string>('0')
  const [valorTotalCompras, setValorTotalCompras] = useState<string>('0')
  const [dataUltimaCompra, setDataUltimaCompra] = useState('')
  const [dataPrimeiraCompra, setDataPrimeiraCompra] = useState('')

  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Determinar vendedor default baseado no usuário logado
  const obterVendedorPadrao = (): VendedorCliente => {
    if (!user) return 'Alice'
    if (user.perfil === 'vendedor_1') return 'Karoline (Vendas 1)'
    if (user.perfil === 'vendedor_2') return 'Vendas 2'
    if (user.nome?.toLowerCase().includes('renan') || user.email?.includes('renan')) return 'Renan'
    if (user.nome?.toLowerCase().includes('alice') || user.email?.includes('alice')) return 'Alice'
    return 'Alice'
  }

  // Validadores e normalizadores para campos com enum restrito
  const normalizarVendedorRegistro = (v?: unknown): VendedorCliente => {
    const vs = typeof v === 'string' ? v.trim() : ''
    const aceitos: VendedorCliente[] = ['Alice', 'Renan', 'Karoline (Vendas 1)', 'Vendas 2']
    if (aceitos.includes(vs as VendedorCliente)) return vs as VendedorCliente
    return obterVendedorPadrao()
  }

  const normalizarTipoContatoRegistro = (t?: unknown): TipoContatoCliente => {
    const ts = typeof t === 'string' ? t.trim().toLowerCase() : ''
    if (ts === 'fornecedor' || ts === 'ambos' || ts === 'cliente') {
      return ts as TipoContatoCliente
    }
    return 'cliente'
  }

  const normalizarStatusClienteRegistro = (s?: unknown): StatusCliente => {
    const ss = typeof s === 'string' ? s.trim().toLowerCase() : ''
    if (ss === 'para_reativacao' || ss === 'ativo') {
      return ss as StatusCliente
    }
    return 'ativo'
  }

  // Sincronizar campos quando o modal abre ou cliente muda
  React.useEffect(() => {
    if (open) {
      if (cliente) {
        setNomeEmpresa(cliente.nome_empresa || cliente.nome_contato || '')
        setNomeContato(cliente.nome_contato || '')
        setCnpjCpf(cliente.cnpj_cpf || '')
        setTelefone(cliente.telefone || '')
        setEmail(cliente.email || '')
        setCidade(cliente.cidade || '')
        setEstado(cliente.estado || '')
        setVendedor(normalizarVendedorRegistro(cliente.vendedor))
        setTipoContato(normalizarTipoContatoRegistro(cliente.tipo_contato))
        setStatusCliente(normalizarStatusClienteRegistro(cliente.status_cliente))
        setGrandeCliente(
          cliente.grande_cliente === 'sim' || cliente.grande_cliente === true ? 'sim' : 'nao',
        )
        setValorTotalVendas(String(cliente.valor_total_vendas || 0))
        setValorTotalCompras(String(cliente.valor_total_compras || 0))
        setDataUltimaCompra(
          cliente.data_ultima_compra ? cliente.data_ultima_compra.substring(0, 10) : '',
        )
        setDataPrimeiraCompra(
          cliente.data_primeira_compra ? cliente.data_primeira_compra.substring(0, 10) : '',
        )
      } else {
        setNomeEmpresa('')
        setNomeContato('')
        setCnpjCpf('')
        setTelefone('')
        setEmail('')
        setCidade('')
        setEstado('')
        setVendedor(obterVendedorPadrao())
        setTipoContato('cliente')
        setStatusCliente('ativo')
        setGrandeCliente('nao')
        setValorTotalVendas('0')
        setValorTotalCompras('0')
        setDataUltimaCompra('')
        setDataPrimeiraCompra('')
      }
      setErros({})
    }
  }, [open, cliente])

  const validar = (): boolean => {
    const novosErros: Record<string, string> = {}
    if (!nomeEmpresa.trim()) {
      novosErros.nome_empresa = 'O nome da empresa é obrigatório.'
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      novosErros.email = 'E-mail inválido.'
    }
    if (estado.trim() && estado.trim().length > 2) {
      novosErros.estado = 'O estado deve conter no máximo 2 letras (UF).'
    }
    const vendedoresValidos: VendedorCliente[] = [
      'Alice',
      'Renan',
      'Karoline (Vendas 1)',
      'Vendas 2',
    ]
    if (!vendedor || !vendedoresValidos.includes(vendedor)) {
      novosErros.vendedor = 'Selecione um vendedor válido.'
    }
    if (!tipoContato || !['cliente', 'fornecedor', 'ambos'].includes(tipoContato)) {
      novosErros.tipo_contato = 'Selecione o tipo de contato.'
    }
    if (!statusCliente || !['ativo', 'para_reativacao'].includes(statusCliente)) {
      novosErros.status_cliente = 'Selecione o status do cliente.'
    }
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      // Garantir valores padrão válidos caso algum campo select tenha chegado vazio
      const vendedorFinal: VendedorCliente =
        vendedor && ['Alice', 'Renan', 'Karoline (Vendas 1)', 'Vendas 2'].includes(vendedor)
          ? vendedor
          : obterVendedorPadrao()
      const tipoContatoFinal: TipoContatoCliente =
        tipoContato && ['cliente', 'fornecedor', 'ambos'].includes(tipoContato)
          ? tipoContato
          : 'cliente'
      const statusClienteFinal: StatusCliente =
        statusCliente && ['ativo', 'para_reativacao'].includes(statusCliente)
          ? statusCliente
          : 'ativo'
      const grandeClienteBool: boolean =
        grandeCliente === 'sim' || (grandeCliente as unknown) === true

      const payload: Record<string, unknown> = {
        nome_empresa: nomeEmpresa.trim(),
        nome_contato: nomeContato.trim() || nomeEmpresa.trim(),
        cnpj_cpf: cnpjCpf.trim() || '',
        telefone: telefone.trim() || '',
        email: email.trim() || '',
        cidade: cidade.trim() || '',
        estado: estado.trim().toUpperCase() || '',
        vendedor: vendedorFinal,
        tipo_contato: tipoContatoFinal,
        status_cliente: statusClienteFinal,
        grande_cliente: grandeClienteBool,
        valor_total_vendas: parseFloat(valorTotalVendas) || 0,
        valor_total_compras: parseFloat(valorTotalCompras) || 0,
        data_ultima_compra: dataUltimaCompra ? `${dataUltimaCompra} 12:00:00.000Z` : null,
        data_primeira_compra: dataPrimeiraCompra ? `${dataPrimeiraCompra} 12:00:00.000Z` : null,
        // sincronia para campos legados
        responsavel_id: user?.id || null,
        status: statusClienteFinal === 'ativo' ? 'ativo' : 'rascunho',
      }

      let savedRecord: ClienteModel
      if (isEditing && cliente) {
        savedRecord = (await pb
          .collection('clientes')
          .update(cliente.id, payload)) as unknown as ClienteModel
        toast({
          title: 'Cliente atualizado',
          description: `Os dados de "${savedRecord.nome_empresa}" foram salvos com sucesso.`,
        })
      } else {
        savedRecord = (await pb.collection('clientes').create(payload)) as unknown as ClienteModel
        toast({
          title: 'Cliente cadastrado',
          description: `Cliente "${savedRecord.nome_empresa}" criado com sucesso.`,
        })
      }

      onSuccess(savedRecord)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar cliente',
        description:
          msg.includes('permissão') || msg.includes('permission')
            ? 'Você não tem permissão para realizar esta operação.'
            : msg ||
              'Ocorreu um erro ao salvar o cliente. Verifique se o nome da empresa ou CNPJ já existem.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Building className="w-5 h-5 text-[#16A34A]" />
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#64748B]">
            {isEditing
              ? 'Atualize as informações do cliente cadastrado na base comercial.'
              : 'Preencha os dados abaixo para cadastrar um novo cliente.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Linha 1: Nome da Empresa (obrigatório, único) e Nome do Contato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome_empresa" className="text-xs font-semibold text-[#0F172A]">
                Nome da Empresa / Razão Social <span className="text-[#DC2626]">*</span>
              </Label>
              <div className="relative">
                <Building className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="nome_empresa"
                  value={nomeEmpresa}
                  onChange={(e) => {
                    setNomeEmpresa(e.target.value)
                    if (erros.nome_empresa) setErros({ ...erros, nome_empresa: '' })
                  }}
                  placeholder="Ex: Construtora Horizonte LTDA"
                  className={`pl-9 ${erros.nome_empresa ? 'border-[#DC2626] focus-visible:ring-[#DC2626]' : ''}`}
                />
              </div>
              {erros.nome_empresa && <p className="text-xs text-[#DC2626]">{erros.nome_empresa}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome_contato" className="text-xs font-semibold text-[#0F172A]">
                Nome do Contato
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="nome_contato"
                  value={nomeContato}
                  onChange={(e) => setNomeContato(e.target.value)}
                  placeholder="Ex: Carlos Eduardo"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Linha 2: CNPJ/CPF e Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cnpj_cpf" className="text-xs font-semibold text-[#0F172A]">
                CNPJ / CPF
              </Label>
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="cnpj_cpf"
                  value={cnpjCpf}
                  onChange={(e) => setCnpjCpf(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telefone" className="text-xs font-semibold text-[#0F172A]">
                Telefone / WhatsApp
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="telefone"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(42) 99999-9999"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Linha 3: E-mail, Cidade e Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="email" className="text-xs font-semibold text-[#0F172A]">
                E-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (erros.email) setErros({ ...erros, email: '' })
                  }}
                  placeholder="comercial@empresa.com.br"
                  className={`pl-9 ${erros.email ? 'border-[#DC2626]' : ''}`}
                />
              </div>
              {erros.email && <p className="text-xs text-[#DC2626]">{erros.email}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="cidade" className="text-xs font-semibold text-[#0F172A]">
                Cidade
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Irati"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="estado" className="text-xs font-semibold text-[#0F172A]">
                Estado (UF - 2 caracteres)
              </Label>
              <Input
                id="estado"
                maxLength={2}
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value.toUpperCase())
                  if (erros.estado) setErros({ ...erros, estado: '' })
                }}
                placeholder="PR"
                className={`uppercase ${erros.estado ? 'border-[#DC2626]' : ''}`}
              />
              {erros.estado && <p className="text-xs text-[#DC2626]">{erros.estado}</p>}
            </div>
          </div>

          {/* Linha 4: Vendedor, Tipo Contato, Status Cliente, Grande Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#0F172A]">
                Vendedor <span className="text-[#DC2626]">*</span>
              </Label>
              <Select
                value={vendedor}
                onValueChange={(val: VendedorCliente) => {
                  setVendedor(val)
                  if (erros.vendedor) setErros({ ...erros, vendedor: '' })
                }}
              >
                <SelectTrigger
                  className={`bg-white ${erros.vendedor ? 'border-[#DC2626] focus:ring-[#DC2626]' : ''}`}
                >
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alice">Alice</SelectItem>
                  <SelectItem value="Renan">Renan</SelectItem>
                  <SelectItem value="Karoline (Vendas 1)">Karoline (Vendas 1)</SelectItem>
                  <SelectItem value="Vendas 2">Vendas 2</SelectItem>
                </SelectContent>
              </Select>
              {erros.vendedor && <p className="text-xs text-[#DC2626]">{erros.vendedor}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#0F172A]">
                Tipo de Contato <span className="text-[#DC2626]">*</span>
              </Label>
              <Select
                value={tipoContato}
                onValueChange={(val: TipoContatoCliente) => {
                  setTipoContato(val)
                  if (erros.tipo_contato) setErros({ ...erros, tipo_contato: '' })
                }}
              >
                <SelectTrigger
                  className={`bg-white ${erros.tipo_contato ? 'border-[#DC2626] focus:ring-[#DC2626]' : ''}`}
                >
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
              {erros.tipo_contato && <p className="text-xs text-[#DC2626]">{erros.tipo_contato}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#0F172A]">Status do Cliente</Label>
              <Select
                value={statusCliente}
                onValueChange={(val: StatusCliente) => {
                  setStatusCliente(val)
                  if (erros.status_cliente) setErros({ ...erros, status_cliente: '' })
                }}
              >
                <SelectTrigger
                  className={`bg-white ${erros.status_cliente ? 'border-[#DC2626] focus:ring-[#DC2626]' : ''}`}
                >
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="para_reativacao">Para Reativação</SelectItem>
                </SelectContent>
              </Select>
              {erros.status_cliente && (
                <p className="text-xs text-[#DC2626]">{erros.status_cliente}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#0F172A]">Grande Cliente?</Label>
              <Select
                value={grandeCliente}
                onValueChange={(val: GrandeClienteFlag) => setGrandeCliente(val)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Grande Cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim (VIP)</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Linha 5: Valores Financeiros e Datas de Compra */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="valor_total_vendas" className="text-xs font-semibold text-[#0F172A]">
                Total de Vendas (R$)
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-[#16A34A]" />
                <Input
                  id="valor_total_vendas"
                  type="number"
                  step="0.01"
                  value={valorTotalVendas}
                  onChange={(e) => setValorTotalVendas(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="valor_total_compras" className="text-xs font-semibold text-[#0F172A]">
                Total de Compras (R$)
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="valor_total_compras"
                  type="number"
                  step="0.01"
                  value={valorTotalCompras}
                  onChange={(e) => setValorTotalCompras(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="data_primeira_compra"
                className="text-xs font-semibold text-[#0F172A]"
              >
                Primeira Compra
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="data_primeira_compra"
                  type="date"
                  value={dataPrimeiraCompra}
                  onChange={(e) => setDataPrimeiraCompra(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="data_ultima_compra" className="text-xs font-semibold text-[#0F172A]">
                Última Compra
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-[#16A34A]" />
                <Input
                  id="data_ultima_compra"
                  type="date"
                  value={dataUltimaCompra}
                  onChange={(e) => setDataUltimaCompra(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2 border-t border-[#E2E8F0]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : isEditing ? (
                'Salvar Alterações'
              ) : (
                'Cadastrar Cliente'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
