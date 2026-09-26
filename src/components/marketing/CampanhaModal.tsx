import React, { useState, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Megaphone,
  Loader2,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  Code,
  CheckCircle,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { CanalMarketingModel } from '@/types/clientes'
import type { CampanhaModel, TipoCampanha, StatusCampanha } from '@/types/marketing'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface CampanhaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campanha?: CampanhaModel | null
  canais: CanalMarketingModel[]
  usuarios: Usuario[]
  onSuccess: (campanha: CampanhaModel) => void
}

export function CampanhaModal({
  open,
  onOpenChange,
  campanha,
  canais,
  usuarios,
  onSuccess,
}: CampanhaModalProps) {
  const { user } = useAuth()
  const isEditing = Boolean(campanha)

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<TipoCampanha>('whatsapp')
  const [canalId, setCanalId] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [status, setStatus] = useState<StatusCampanha>('rascunho')
  const [orcamento, setOrcamento] = useState('')

  // Editor de público-alvo (JSON com modo amigável e raw)
  const [filtroCidade, setFiltroCidade] = useState('')
  const [filtroGrandeCliente, setFiltroGrandeCliente] = useState(false)
  const [filtroEtapaFunil, setFiltroEtapaFunil] = useState('')
  const [filtroTags, setFiltroTags] = useState('')
  const [filtrosCustomizados, setFiltrosCustomizados] = useState<
    Array<{ chave: string; valor: string }>
  >([])
  const [novaChaveFiltro, setNovaChaveFiltro] = useState('')
  const [novoValorFiltro, setNovoValorFiltro] = useState('')
  const [modoRawJson, setModoRawJson] = useState(false)
  const [jsonRawString, setJsonRawString] = useState('{}')

  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Canais ativos disponíveis
  const canaisAtivos = canais.filter((c) => c.ativo !== false)

  // Regra de perfil: ceo_financeiro e coordenador_vendas escolhem qualquer usuário.
  // Vendedores ficam travados no próprio usuário logado.
  const podeEscolherResponsavel =
    user?.perfil === 'ceo_financeiro' || user?.perfil === 'coordenador_vendas'

  useEffect(() => {
    if (open) {
      if (campanha) {
        setNome(campanha.nome || '')
        setDescricao(campanha.descricao || '')
        setTipo(campanha.tipo || 'whatsapp')
        setCanalId(campanha.canal_id || '')
        setResponsavelId(campanha.responsavel_id || user?.id || '')
        setDataInicio(campanha.data_inicio ? campanha.data_inicio.substring(0, 10) : '')
        setDataFim(campanha.data_fim ? campanha.data_fim.substring(0, 10) : '')
        setStatus(campanha.status || 'rascunho')
        setOrcamento(
          campanha.orcamento !== undefined && campanha.orcamento !== null
            ? String(campanha.orcamento)
            : '',
        )

        // Carrega filtros do público_alvo
        let paObj: Record<string, unknown> = {}
        if (typeof campanha.publico_alvo === 'string') {
          try {
            paObj = JSON.parse(campanha.publico_alvo)
          } catch {
            paObj = {}
          }
        } else if (campanha.publico_alvo && typeof campanha.publico_alvo === 'object') {
          paObj = campanha.publico_alvo as Record<string, unknown>
        }

        setFiltroCidade(typeof paObj.cidade === 'string' ? paObj.cidade : '')
        setFiltroGrandeCliente(Boolean(paObj.grande_cliente))
        setFiltroEtapaFunil(typeof paObj.etapa_funil === 'string' ? paObj.etapa_funil : '')
        setFiltroTags(Array.isArray(paObj.tags) ? paObj.tags.join(', ') : '')

        // Outros campos customizados
        const conhecidos = ['cidade', 'grande_cliente', 'etapa_funil', 'tags']
        const custom: Array<{ chave: string; valor: string }> = []
        Object.entries(paObj).forEach(([k, v]) => {
          if (!conhecidos.includes(k) && v !== undefined && v !== null) {
            custom.push({ chave: k, valor: String(v) })
          }
        })
        setFiltrosCustomizados(custom)
        setJsonRawString(JSON.stringify(paObj, null, 2))
      } else {
        setNome('')
        setDescricao('')
        setTipo('whatsapp')
        setCanalId(canaisAtivos[0]?.id || '')
        setResponsavelId(user?.id || usuarios[0]?.id || '')
        setDataInicio('')
        setDataFim('')
        setStatus('rascunho')
        setOrcamento('')
        setFiltroCidade('')
        setFiltroGrandeCliente(false)
        setFiltroEtapaFunil('')
        setFiltroTags('')
        setFiltrosCustomizados([])
        setJsonRawString('{}')
      }
      setModoRawJson(false)
      setNovaChaveFiltro('')
      setNovoValorFiltro('')
      setErros({})
    }
  }, [open, campanha, user, usuarios])

  // Gerador automático da estrutura JSON a partir dos filtros
  const construirJsonPublicoAlvo = (): Record<string, unknown> => {
    if (modoRawJson) {
      try {
        return JSON.parse(jsonRawString)
      } catch {
        return {}
      }
    }

    const obj: Record<string, unknown> = {}
    if (filtroCidade.trim()) obj.cidade = filtroCidade.trim()
    if (filtroGrandeCliente) obj.grande_cliente = true
    if (filtroEtapaFunil.trim()) obj.etapa_funil = filtroEtapaFunil.trim()
    if (filtroTags.trim()) {
      obj.tags = filtroTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    }
    filtrosCustomizados.forEach((fc) => {
      if (fc.chave.trim()) {
        obj[fc.chave.trim()] = fc.valor.trim()
      }
    })
    return obj
  }

  const handleAdicionarFiltroCustomizado = () => {
    if (!novaChaveFiltro.trim()) return
    setFiltrosCustomizados([
      ...filtrosCustomizados,
      { chave: novaChaveFiltro.trim(), valor: novoValorFiltro.trim() },
    ])
    setNovaChaveFiltro('')
    setNovoValorFiltro('')
  }

  const handleRemoverFiltroCustomizado = (index: number) => {
    setFiltrosCustomizados(filtrosCustomizados.filter((_, i) => i !== index))
  }

  const validar = (): boolean => {
    const novosErros: Record<string, string> = {}
    if (!nome.trim()) {
      novosErros.nome = 'O nome da campanha é obrigatório.'
    }
    if (!canalId) {
      novosErros.canal_id = 'Selecione um canal de marketing ativo obrigatório.'
    }
    const respFinal = podeEscolherResponsavel ? responsavelId || user?.id : user?.id
    if (!respFinal) {
      novosErros.responsavel_id = 'Responsável é obrigatório.'
    }
    if (modoRawJson) {
      try {
        JSON.parse(jsonRawString)
      } catch {
        novosErros.publico_alvo = 'JSON de público-alvo com formato inválido.'
      }
    }
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      const publicoAlvoJson = construirJsonPublicoAlvo()
      const respFinal = podeEscolherResponsavel ? responsavelId || user?.id : user?.id

      const payload: Record<string, unknown> = {
        nome: nome.trim(),
        descricao: descricao.trim() || '',
        tipo,
        canal_id: canalId,
        responsavel_id: respFinal,
        data_inicio: dataInicio ? new Date(dataInicio).toISOString() : null,
        data_fim: dataFim ? new Date(dataFim).toISOString() : null,
        status,
        publico_alvo: publicoAlvoJson,
        orcamento: orcamento ? parseFloat(orcamento) : 0,
      }

      let savedRecord: CampanhaModel
      if (isEditing && campanha) {
        savedRecord = (await pb.collection('campanhas').update(campanha.id, payload, {
          expand: 'canal_id,responsavel_id',
        })) as unknown as CampanhaModel
        toast({
          title: 'Campanha atualizada',
          description: `A campanha "${savedRecord.nome}" foi atualizada com sucesso.`,
        })
      } else {
        savedRecord = (await pb.collection('campanhas').create(payload, {
          expand: 'canal_id,responsavel_id',
        })) as unknown as CampanhaModel
        toast({
          title: 'Campanha criada',
          description: `A campanha "${savedRecord.nome}" foi criada com sucesso.`,
        })
      }

      onSuccess(savedRecord)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar campanha',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para gerenciar esta campanha.'
            : msg || 'Ocorreu um erro ao salvar a campanha. Verifique os dados.',
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
            <Megaphone className="w-5 h-5 text-[#2563EB]" />
            {isEditing ? 'Editar Campanha' : 'Nova Campanha'}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#64748B]">
            {isEditing
              ? 'Atualize os dados, canal e público-alvo da campanha.'
              : 'Configure uma nova régua ou disparo de marketing direcionado.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Nome da Campanha (obrigatório) */}
          <div className="space-y-1.5">
            <Label htmlFor="camp_nome" className="text-xs font-semibold text-[#0F172A]">
              Nome da Campanha <span className="text-[#DC2626]">*</span>
            </Label>
            <Input
              id="camp_nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                if (erros.nome) setErros({ ...erros, nome: '' })
              }}
              placeholder="Ex: Campanha de Reativação Safra 2025"
              className={erros.nome ? 'border-[#DC2626]' : ''}
            />
            {erros.nome && <p className="text-xs text-[#DC2626]">{erros.nome}</p>}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="camp_desc" className="text-xs font-semibold text-[#0F172A]">
              Descrição
            </Label>
            <Textarea
              id="camp_desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Objetivo da campanha, público direcionado e estratégia comercial..."
              className="resize-none"
            />
          </div>

          {/* Tipo e Canal (ambos obrigatórios) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="camp_tipo" className="text-xs font-semibold text-[#0F172A]">
                Tipo de Disparo <span className="text-[#DC2626]">*</span>
              </Label>
              <Select value={tipo} onValueChange={(val: TipoCampanha) => setTipo(val)}>
                <SelectTrigger id="camp_tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp (Verde)</SelectItem>
                  <SelectItem value="email">E-mail (Azul)</SelectItem>
                  <SelectItem value="sms">SMS (Roxo)</SelectItem>
                  <SelectItem value="mista">Mista (Multicanal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="camp_canal" className="text-xs font-semibold text-[#0F172A]">
                Canal de Marketing <span className="text-[#DC2626]">*</span>
              </Label>
              <Select
                value={canalId}
                onValueChange={(val) => {
                  setCanalId(val)
                  if (erros.canal_id) setErros({ ...erros, canal_id: '' })
                }}
              >
                <SelectTrigger id="camp_canal" className={erros.canal_id ? 'border-[#DC2626]' : ''}>
                  <SelectValue placeholder="Selecione um canal ativo" />
                </SelectTrigger>
                <SelectContent>
                  {canaisAtivos.length === 0 ? (
                    <div className="p-2 text-xs text-center text-[#64748B]">
                      Nenhum canal ativo cadastrado
                    </div>
                  ) : (
                    canaisAtivos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({c.tipo.toUpperCase()})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {erros.canal_id && <p className="text-xs text-[#DC2626]">{erros.canal_id}</p>}
            </div>
          </div>

          {/* Responsável e Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="camp_resp" className="text-xs font-semibold text-[#0F172A]">
                Responsável <span className="text-[#DC2626]">*</span>
              </Label>
              {podeEscolherResponsavel ? (
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger id="camp_resp">
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome} ({u.perfil})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="camp_resp"
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
              {erros.responsavel_id && (
                <p className="text-xs text-[#DC2626]">{erros.responsavel_id}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="camp_status" className="text-xs font-semibold text-[#0F172A]">
                Status da Campanha
              </Label>
              <Select value={status} onValueChange={(val: StatusCampanha) => setStatus(val)}>
                <SelectTrigger id="camp_status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho (Cinza)</SelectItem>
                  <SelectItem value="ativa">Ativa (Verde)</SelectItem>
                  <SelectItem value="pausada">Pausada (Amarelo)</SelectItem>
                  <SelectItem value="finalizada">Finalizada (Azul Escuro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Datas de Início/Fim e Orçamento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="camp_inicio" className="text-xs font-semibold text-[#0F172A]">
                Data de Início
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="camp_inicio"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="camp_fim" className="text-xs font-semibold text-[#0F172A]">
                Data de Fim
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="camp_fim"
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="camp_orcamento" className="text-xs font-semibold text-[#0F172A]">
                Orçamento (R$)
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                <Input
                  id="camp_orcamento"
                  type="number"
                  step="0.01"
                  min="0"
                  value={orcamento}
                  onChange={(e) => setOrcamento(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Público-alvo (Editor JSON com botão 'Adicionar filtro' e modo amigável) */}
          <div className="pt-2 border-t border-[#E2E8F0] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold text-[#0F172A]">
                  Público-Alvo (Filtros JSON)
                </Label>
                <p className="text-[11px] text-[#64748B]">
                  Filtros estruturados para segmentação dos disparos da campanha.
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!modoRawJson) {
                    setJsonRawString(JSON.stringify(construirJsonPublicoAlvo(), null, 2))
                  }
                  setModoRawJson(!modoRawJson)
                }}
                className="text-xs text-[#2563EB] hover:text-[#1D4ED8] h-7"
              >
                <Code className="w-3.5 h-3.5 mr-1" />
                {modoRawJson ? 'Modo Assistido' : 'Editar JSON Puro'}
              </Button>
            </div>

            {modoRawJson ? (
              <div className="space-y-1.5">
                <Textarea
                  value={jsonRawString}
                  onChange={(e) => {
                    setJsonRawString(e.target.value)
                    if (erros.publico_alvo) setErros({ ...erros, publico_alvo: '' })
                  }}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder='{"cidade": "São Paulo", "grande_cliente": true}'
                />
                {erros.publico_alvo && (
                  <p className="text-xs text-[#DC2626]">{erros.publico_alvo}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3 p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-[#64748B]">
                      Filtro por Cidade
                    </Label>
                    <Input
                      value={filtroCidade}
                      onChange={(e) => setFiltroCidade(e.target.value)}
                      placeholder="Ex: São Paulo"
                      className="h-8 text-xs bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-[#64748B]">Etapa do Funil</Label>
                    <Input
                      value={filtroEtapaFunil}
                      onChange={(e) => setFiltroEtapaFunil(e.target.value)}
                      placeholder="Ex: Proposta Apresentada"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-[#64748B]">
                      Tags (separadas por vírgula)
                    </Label>
                    <Input
                      value={filtroTags}
                      onChange={(e) => setFiltroTags(e.target.value)}
                      placeholder="Ex: vip, atacado, prioritario"
                      className="h-8 text-xs bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-md border border-[#E2E8F0] bg-white mt-4 sm:mt-0">
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="filtro_gc"
                        className="text-xs font-semibold text-[#0F172A] cursor-pointer"
                      >
                        Apenas Grandes Clientes
                      </Label>
                      <p className="text-[10px] text-[#64748B]">Filtra contas VIP</p>
                    </div>
                    <Switch
                      id="filtro_gc"
                      checked={filtroGrandeCliente}
                      onCheckedChange={setFiltroGrandeCliente}
                    />
                  </div>
                </div>

                {/* Filtros customizados adicionados dinamicamente */}
                {filtrosCustomizados.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[#E2E8F0]">
                    <Label className="text-[11px] font-medium text-[#64748B]">
                      Filtros Adicionais Definidos:
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {filtrosCustomizados.map((fc, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="bg-white border border-[#E2E8F0] text-xs font-mono py-1 px-2 flex items-center gap-1.5"
                        >
                          <span className="font-semibold text-[#0F172A]">{fc.chave}:</span>
                          <span className="text-[#2563EB]">{fc.valor}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoverFiltroCustomizado(idx)}
                            className="text-[#94A3B8] hover:text-[#DC2626] ml-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formulário para Adicionar Filtro */}
                <div className="pt-2 border-t border-[#E2E8F0]">
                  <Label className="text-[11px] font-medium text-[#64748B] block mb-1.5">
                    Adicionar Novo Filtro ao JSON:
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Chave (ex: regiao)"
                      value={novaChaveFiltro}
                      onChange={(e) => setNovaChaveFiltro(e.target.value)}
                      className="h-8 text-xs bg-white flex-1"
                    />
                    <Input
                      placeholder="Valor (ex: Sul)"
                      value={novoValorFiltro}
                      onChange={(e) => setNovoValorFiltro(e.target.value)}
                      className="h-8 text-xs bg-white flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAdicionarFiltroCustomizado}
                      disabled={!novaChaveFiltro.trim()}
                      className="h-8 text-xs border-[#2563EB] text-[#2563EB] hover:bg-blue-50"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Adicionar Filtro
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : isEditing ? (
                'Salvar Alterações'
              ) : (
                'Criar Campanha'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
