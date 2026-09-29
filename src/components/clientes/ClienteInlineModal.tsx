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
import { Building, Phone, User, MapPin, FileText, Loader2, Sparkles } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { verificarClienteDuplicado } from '@/lib/clientes/clienteUtils'
import type { ClienteModel, VendedorCliente } from '@/types/clientes'

export interface ClienteInlineModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nomeInicial?: string
  onClienteCriado: (cliente: ClienteModel) => void
}

export function ClienteInlineModal({
  open,
  onOpenChange,
  nomeInicial = '',
  onClienteCriado,
}: ClienteInlineModalProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [cnpjCpf, setCnpjCpf] = useState('')
  const [nomeContato, setNomeContato] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Prefill ao abrir
  React.useEffect(() => {
    if (open) {
      setNomeEmpresa(nomeInicial.trim())
      setNomeContato('')
      setCnpjCpf('')
      setTelefone('')
      setCidade('')
      setErros({})
    }
  }, [open, nomeInicial])

  const validar = (): boolean => {
    const novos: Record<string, string> = {}
    if (!nomeEmpresa.trim()) {
      novos.nome_empresa = 'O nome da empresa / razão social é obrigatório.'
    }
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  // Determinar vendedor padrão do usuário logado
  const obterVendedorPadrao = (): VendedorCliente => {
    if (!user) return 'Alice'
    if (user.perfil === 'vendedor_1') return 'Karoline (Vendas 1)'
    if (user.perfil === 'vendedor_2') return 'Vendas 2'
    if (user.nome?.toLowerCase().includes('karoline')) return 'Karoline (Vendas 1)'
    if (user.nome?.toLowerCase().includes('renan')) return 'Renan'
    return 'Alice'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      // Checagem de duplicidade prévia (Bug 2)
      const checagem = await verificarClienteDuplicado(pb, {
        nomeEmpresa: nomeEmpresa.trim(),
        cnpjCpf: cnpjCpf.trim(),
      })

      if (checagem.duplicado) {
        toast({
          variant: 'destructive',
          title: 'Cliente duplicado',
          description: 'Já existe um cliente cadastrado com esse CNPJ/nome.',
        })
        setSaving(false)
        return
      }

      const vendedorFinal = obterVendedorPadrao()

      const payload: Record<string, unknown> = {
        nome_empresa: nomeEmpresa.trim(),
        nome_contato: nomeContato.trim() || nomeEmpresa.trim(),
        cnpj_cpf: cnpjCpf.trim() || '',
        telefone: telefone.trim() || '',
        cidade: cidade.trim() || '',
        vendedor: vendedorFinal,
        tipo_contato: 'cliente',
        status_cliente: 'ativo',
        grande_cliente: false,
        valor_total_vendas: 0,
        valor_total_compras: 0,
        responsavel_id: user?.id || null,
        status: 'ativo',
      }

      const record = (await pb.collection('clientes').create(payload)) as unknown as ClienteModel

      toast({
        title: 'Cliente cadastrado com sucesso',
        description: `O cliente "${record.nome_empresa}" foi adicionado e selecionado.`,
      })

      onClienteCriado(record)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      const msgLower = (msg || '').toLowerCase()
      const ehErroUnicidade =
        msgLower.includes('unique') ||
        msgLower.includes('já existe') ||
        msgLower.includes('already exists') ||
        msgLower.includes('nome_empresa') ||
        msgLower.includes('cnpj_cpf')

      toast({
        variant: 'destructive',
        title: ehErroUnicidade ? 'Cliente duplicado' : 'Erro ao cadastrar cliente',
        description: ehErroUnicidade
          ? 'Já existe um cliente cadastrado com esse CNPJ/nome.'
          : msg || 'Ocorreu um erro ao salvar o cliente.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#16A34A]" />
            Cadastrar Novo Cliente
          </DialogTitle>
          <DialogDescription className="text-xs text-[#64748B]">
            Cadastro rápido inline com campos mínimos. O cliente será vinculado à sua carteira e
            selecionado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          {/* Nome da Empresa */}
          <div className="space-y-1">
            <Label htmlFor="inline_nome_empresa" className="text-xs font-semibold text-[#0F172A]">
              Nome da Empresa / Razão Social <span className="text-[#DC2626]">*</span>
            </Label>
            <div className="relative">
              <Building className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <Input
                id="inline_nome_empresa"
                value={nomeEmpresa}
                onChange={(e) => {
                  setNomeEmpresa(e.target.value)
                  if (erros.nome_empresa) setErros({ ...erros, nome_empresa: '' })
                }}
                placeholder="Ex: Cerâmica São José"
                className={`pl-9 text-xs sm:text-sm h-9 ${
                  erros.nome_empresa ? 'border-[#DC2626] focus-visible:ring-[#DC2626]' : ''
                }`}
                autoFocus
              />
            </div>
            {erros.nome_empresa && <p className="text-xs text-[#DC2626]">{erros.nome_empresa}</p>}
          </div>

          {/* CNPJ / CPF */}
          <div className="space-y-1">
            <Label htmlFor="inline_cnpj_cpf" className="text-xs font-semibold text-[#0F172A]">
              CNPJ / CPF
            </Label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <Input
                id="inline_cnpj_cpf"
                value={cnpjCpf}
                onChange={(e) => setCnpjCpf(e.target.value)}
                placeholder="00.000.000/0000-00 (opcional)"
                className="pl-9 text-xs sm:text-sm h-9"
              />
            </div>
          </div>

          {/* Nome do Contato */}
          <div className="space-y-1">
            <Label htmlFor="inline_nome_contato" className="text-xs font-semibold text-[#0F172A]">
              Nome do Contato
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <Input
                id="inline_nome_contato"
                value={nomeContato}
                onChange={(e) => setNomeContato(e.target.value)}
                placeholder="Ex: João da Silva"
                className="pl-9 text-xs sm:text-sm h-9"
              />
            </div>
          </div>

          {/* Telefone / WhatsApp */}
          <div className="space-y-1">
            <Label htmlFor="inline_telefone" className="text-xs font-semibold text-[#0F172A]">
              Telefone / WhatsApp
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <Input
                id="inline_telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(42) 99999-9999"
                className="pl-9 text-xs sm:text-sm h-9"
              />
            </div>
          </div>

          {/* Cidade */}
          <div className="space-y-1">
            <Label htmlFor="inline_cidade" className="text-xs font-semibold text-[#0F172A]">
              Cidade
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <Input
                id="inline_cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Ponta Grossa"
                className="pl-9 text-xs sm:text-sm h-9"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2 border-t border-[#E2E8F0]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                'Cadastrar e Selecionar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
