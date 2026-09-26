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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, User, Building, Phone, Mail, MapPin, Calendar, FileText } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { ClienteModel } from '@/types/clientes'
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
  usuarios,
  onSuccess,
}: ClienteModalProps) {
  const { user } = useAuth()
  const isEditing = Boolean(cliente)

  // Determinar o responsável inicial:
  // Se for edição, mantém o do cliente; se for criação:
  // vendedores têm fixo eles mesmos. ceo/coordenador pode escolher qualquer um (iniciando por ele mesmo se existir).
  const defaultResponsavel = () => {
    if (cliente?.responsavel_id) return cliente.responsavel_id
    if (user?.id) return user.id
    return usuarios[0]?.id || ''
  }

  const [nomeContato, setNomeContato] = useState('')
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [email, setEmail] = useState('')
  const [cnpjCpf, setCnpjCpf] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [grandeCliente, setGrandeCliente] = useState(false)
  const [aceitaMensagens, setAceitaMensagens] = useState(true)
  const [responsavelId, setResponsavelId] = useState('')
  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Sincronizar campos quando o modal abre ou cliente muda
  React.useEffect(() => {
    if (open) {
      if (cliente) {
        setNomeContato(cliente.nome_contato || '')
        setNomeEmpresa(cliente.nome_empresa || '')
        setTelefone(cliente.telefone || '')
        setCidade(cliente.cidade || '')
        setEmail(cliente.email || '')
        setCnpjCpf(cliente.cnpj_cpf || '')
        setDataNascimento(cliente.data_nascimento ? cliente.data_nascimento.substring(0, 10) : '')
        setObservacoes(cliente.observacoes || '')
        setGrandeCliente(Boolean(cliente.grande_cliente))
        setAceitaMensagens(cliente.aceita_mensagens !== false)
        setResponsavelId(cliente.responsavel_id || user?.id || '')
      } else {
        setNomeContato('')
        setNomeEmpresa('')
        setTelefone('')
        setCidade('')
        setEmail('')
        setCnpjCpf('')
        setDataNascimento('')
        setObservacoes('')
        setGrandeCliente(false)
        setAceitaMensagens(true)
        setResponsavelId(defaultResponsavel())
      }
      setErros({})
    }
  }, [open, cliente])

  // Regra de bloqueio do seletor de responsável:
  // vendedores (vendedor_1, vendedor_2) vêm preenchidos automaticamente com eles mesmos e não podem alterar para outro usuário.
  // ceo_financeiro e coordenador_vendas podem escolher livremente.
  const podeEscolherResponsavel =
    user?.perfil === 'ceo_financeiro' || user?.perfil === 'coordenador_vendas'

  const validar = (): boolean => {
    const novosErros: Record<string, string> = {}
    if (!nomeContato.trim()) {
      novosErros.nome_contato = 'O nome do contato é obrigatório.'
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      novosErros.email = 'E-mail inválido.'
    }
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        nome_contato: nomeContato.trim(),
        nome_empresa: nomeEmpresa.trim() || '',
        telefone: telefone.trim() || '',
        cidade: cidade.trim() || '',
        email: email.trim() || '',
        cnpj_cpf: cnpjCpf.trim() || '',
        data_nascimento: dataNascimento ? new Date(dataNascimento).toISOString() : null,
        observacoes: observacoes.trim() || '',
        grande_cliente: grandeCliente,
        aceita_mensagens: aceitaMensagens,
        responsavel_id: podeEscolherResponsavel ? responsavelId || user?.id : user?.id,
      }

      let savedRecord: ClienteModel
      if (isEditing && cliente) {
        savedRecord = (await pb
          .collection('clientes')
          .update(cliente.id, payload, { expand: 'responsavel_id' })) as unknown as ClienteModel
        toast({
          title: 'Cliente atualizado',
          description: `Os dados de "${savedRecord.nome_contato}" foram salvos com sucesso.`,
        })
      } else {
        savedRecord = (await pb
          .collection('clientes')
          .create(payload, { expand: 'responsavel_id' })) as unknown as ClienteModel
        toast({
          title: 'Cliente cadastrado',
          description: `Cliente "${savedRecord.nome_contato}" criado com sucesso.`,
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
            : msg || 'Ocorreu um erro ao salvar o cliente. Verifique os dados.',
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
            <User className="w-5 h-5 text-[#16A34A]" />
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#64748B]">
            {isEditing
              ? 'Atualize as informações do cliente cadastrado.'
              : 'Preencha os dados abaixo para cadastrar um novo cliente na sua base.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Linha 1: Nome do Contato (obrigatório) e Nome da Empresa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome_contato" className="text-xs font-semibold text-[#0F172A]">
                Nome do Contato <span className="text-[#DC2626]">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="nome_contato"
                  value={nomeContato}
                  onChange={(e) => {
                    setNomeContato(e.target.value)
                    if (erros.nome_contato) setErros({ ...erros, nome_contato: '' })
                  }}
                  placeholder="Ex: Carlos Eduardo"
                  className={`pl-9 ${erros.nome_contato ? 'border-[#DC2626] focus-visible:ring-[#DC2626]' : ''}`}
                />
              </div>
              {erros.nome_contato && <p className="text-xs text-[#DC2626]">{erros.nome_contato}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome_empresa" className="text-xs font-semibold text-[#0F172A]">
                Nome da Empresa
              </Label>
              <div className="relative">
                <Building className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="nome_empresa"
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  placeholder="Ex: Construtora Horizonte Ltda"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Linha 2: Telefone e E-mail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  placeholder="(11) 98765-4321"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
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
                  placeholder="contato@empresa.com.br"
                  className={`pl-9 ${erros.email ? 'border-[#DC2626] focus-visible:ring-[#DC2626]' : ''}`}
                />
              </div>
              {erros.email && <p className="text-xs text-[#DC2626]">{erros.email}</p>}
            </div>
          </div>

          {/* Linha 3: Cidade e CNPJ/CPF */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cidade" className="text-xs font-semibold text-[#0F172A]">
                Cidade / UF
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="São Paulo, SP"
                  className="pl-9"
                />
              </div>
            </div>

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
          </div>

          {/* Linha 4: Data de Nascimento e Responsável */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="data_nascimento" className="text-xs font-semibold text-[#0F172A]">
                Data de Nascimento / Fundação
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="data_nascimento"
                  type="date"
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="responsavel_id" className="text-xs font-semibold text-[#0F172A]">
                Responsável
              </Label>
              {podeEscolherResponsavel ? (
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger id="responsavel_id" className="w-full">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.length > 0 ? (
                      usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome} ({u.perfil})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={user?.id || 'none'}>
                        {user?.nome || 'Usuário Atual'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={user?.nome ? `${user.nome} (Você)` : 'Você'}
                  disabled
                  className="bg-slate-100 text-[#64748B] cursor-not-allowed"
                />
              )}
              {!podeEscolherResponsavel && (
                <p className="text-[11px] text-[#64748B]">
                  Preenchido automaticamente com seu usuário.
                </p>
              )}
            </div>
          </div>

          {/* Linha 5: Toggles (Grande Cliente e Aceita Mensagens) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="space-y-0.5">
                <Label
                  htmlFor="grande_cliente"
                  className="text-xs font-semibold text-[#0F172A] cursor-pointer"
                >
                  Grande Cliente
                </Label>
                <p className="text-[11px] text-[#64748B]">
                  Classifica como conta VIP / estratégica
                </p>
              </div>
              <Switch
                id="grande_cliente"
                checked={grandeCliente}
                onCheckedChange={setGrandeCliente}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="space-y-0.5">
                <Label
                  htmlFor="aceita_mensagens"
                  className="text-xs font-semibold text-[#0F172A] cursor-pointer"
                >
                  Aceita Mensagens
                </Label>
                <p className="text-[11px] text-[#64748B]">
                  Autoriza recebimento via WhatsApp/E-mail
                </p>
              </div>
              <Switch
                id="aceita_mensagens"
                checked={aceitaMensagens}
                onCheckedChange={setAceitaMensagens}
              />
            </div>
          </div>

          {/* Linha 6: Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="observacoes" className="text-xs font-semibold text-[#0F172A]">
              Observações
            </Label>
            <Textarea
              id="observacoes"
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Informações adicionais, preferências, histórico ou notas comerciais..."
              className="resize-none"
            />
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
              className="bg-[#16A34A] hover:bg-[#15803D] text-white"
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
