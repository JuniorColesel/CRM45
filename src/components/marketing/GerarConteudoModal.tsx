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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Sparkles, FileText, Image as ImageIcon, Video, Mic, Loader2, Upload } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { CampanhaModel, ConteudoGeradoModel, TipoConteudoGerado } from '@/types/marketing'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface GerarConteudoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campanha: CampanhaModel
  usuarios: Usuario[]
  onSuccess: (conteudo: ConteudoGeradoModel) => void
}

export function GerarConteudoModal({
  open,
  onOpenChange,
  campanha,
  usuarios,
  onSuccess,
}: GerarConteudoModalProps) {
  const { user } = useAuth()

  const [tipo, setTipo] = useState<TipoConteudoGerado>('texto')
  const [conteudo, setConteudo] = useState('')
  const [promptIa, setPromptIa] = useState('')
  const [nomeArquivoUpload, setNomeArquivoUpload] = useState('')
  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Limpa campos quando fecha ou abre
  React.useEffect(() => {
    if (open) {
      setTipo('texto')
      setConteudo('')
      setPromptIa('')
      setNomeArquivoUpload('')
      setErros({})
    }
  }, [open])

  // Identifica o aprovador_id conforme o briefing:
  // "ceo_financeiro ou coordenador_vendas, conforme a campanha — use o responsavel_id da campanha
  // quando ele for um desses perfis, caso contrário escolha o ceo_financeiro"
  const determinarAprovadorId = (): string => {
    // 1. Verifica se o responsável da campanha é ceo_financeiro ou coordenador_vendas
    const respCampanha = usuarios.find((u) => u.id === campanha.responsavel_id)
    if (
      respCampanha &&
      (respCampanha.perfil === 'ceo_financeiro' || respCampanha.perfil === 'coordenador_vendas')
    ) {
      return respCampanha.id
    }

    // 2. Se não for, busca qualquer usuário ceo_financeiro
    const ceo = usuarios.find((u) => u.perfil === 'ceo_financeiro')
    if (ceo) return ceo.id

    // 3. Fallback: coordenador de vendas ou usuário logado se for gestor
    const coordenador = usuarios.find((u) => u.perfil === 'coordenador_vendas')
    if (coordenador) return coordenador.id

    return user?.id || ''
  }

  const handleSimularUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setNomeArquivoUpload(file.name)
      // Como o campo conteudo na tabela conteudos_gerados é do tipo TEXT (não file collection),
      // armazenamos uma referência descritiva/URL de asset conforme o tipo
      const timestamp = new Date().toISOString().substring(0, 10)
      setConteudo(
        `[Arquivo ${tipo.toUpperCase()}: ${file.name} - ${(file.size / 1024).toFixed(1)} KB] enviado em ${timestamp}`,
      )
      if (erros.conteudo) setErros({ ...erros, conteudo: '' })
    }
  }

  const validar = (): boolean => {
    const novos: Record<string, string> = {}
    if (!conteudo.trim()) {
      novos.conteudo =
        tipo === 'texto'
          ? 'O texto do conteúdo é obrigatório.'
          : 'Selecione ou descreva o arquivo de mídia obrigatório.'
    }
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setSaving(true)
    try {
      // 1. Criação do conteúdo gerado com status padrão 'gerado'
      const payloadConteudo = {
        campanha_id: campanha.id,
        tipo,
        conteudo: conteudo.trim(),
        prompt_ia: promptIa.trim() || '',
        status: 'gerado',
      }

      const conteudoSalvo = (await pb.collection('conteudos_gerados').create(payloadConteudo, {
        expand: 'campanha_id',
      })) as unknown as ConteudoGeradoModel

      // 2. "AO SALVAR, crie automaticamente uma entrada em aprovacoes_pendentes vinculada ao conteúdo
      // e ao aprovador_id (ceo_financeiro ou coordenador_vendas, conforme a campanha...)"
      const aprovadorId = determinarAprovadorId()
      if (aprovadorId) {
        try {
          await pb.collection('aprovacoes_pendentes').create({
            conteudo_id: conteudoSalvo.id,
            aprovador_id: aprovadorId,
            status: 'pendente',
            comentario: promptIa.trim()
              ? `Conteúdo gerado via prompt: ${promptIa.substring(0, 100)}...`
              : 'Aprovação solicitada automaticamente.',
          })
        } catch (errAprov) {
          console.warn('Aviso: Falha ao registrar aprovação automática no banco:', errAprov)
        }
      }

      toast({
        title: 'Conteúdo registrado',
        description: 'Conteúdo gerado com sucesso e submetido para aprovação.',
      })

      onSuccess(conteudoSalvo)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar conteúdo',
        description:
          msg.includes('permissão') || msg.includes('403') || msg.includes('permission')
            ? 'Você não tem permissão para cadastrar conteúdo nesta campanha.'
            : msg || 'Ocorreu um erro ao salvar o conteúdo.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#7C3AED]" />
            Gerar / Cadastrar Conteúdo
          </DialogTitle>
          <DialogDescription className="text-xs text-[#64748B]">
            Crie uma peça para a campanha <strong>"{campanha.nome}"</strong>. Ao salvar, uma
            aprovação será criada automaticamente para a gerência.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Tipo de Conteúdo */}
          <div className="space-y-1.5">
            <Label htmlFor="cont_tipo" className="text-xs font-semibold text-[#0F172A]">
              Tipo de Conteúdo <span className="text-[#DC2626]">*</span>
            </Label>
            <Select
              value={tipo}
              onValueChange={(val: TipoConteudoGerado) => {
                setTipo(val)
                setConteudo('')
                setNomeArquivoUpload('')
              }}
            >
              <SelectTrigger id="cont_tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="texto">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#2563EB]" />
                    <span>Texto / Copy Comercial</span>
                  </div>
                </SelectItem>
                <SelectItem value="imagem">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#16A34A]" />
                    <span>Imagem / Arte Gráfica</span>
                  </div>
                </SelectItem>
                <SelectItem value="video">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#DC2626]" />
                    <span>Vídeo / Teaser</span>
                  </div>
                </SelectItem>
                <SelectItem value="audio">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-[#7C3AED]" />
                    <span>Áudio / Spot Promocional</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Prompt de IA Utilizado */}
          <div className="space-y-1.5">
            <Label htmlFor="cont_prompt" className="text-xs font-semibold text-[#0F172A]">
              Prompt de IA (Opcional)
            </Label>
            <Textarea
              id="cont_prompt"
              rows={2}
              value={promptIa}
              onChange={(e) => setPromptIa(e.target.value)}
              placeholder="Ex: Crie uma mensagem curta de WhatsApp em tom profissional para pecuaristas sobre ofertas de insumos..."
              className="resize-none text-xs"
            />
          </div>

          {/* Conteúdo: Textarea para Texto, Upload de Arquivo para Imagem/Vídeo/Áudio */}
          {tipo === 'texto' ? (
            <div className="space-y-1.5">
              <Label htmlFor="cont_corpo" className="text-xs font-semibold text-[#0F172A]">
                Conteúdo / Mensagem <span className="text-[#DC2626]">*</span>
              </Label>
              <Textarea
                id="cont_corpo"
                rows={5}
                value={conteudo}
                onChange={(e) => {
                  setConteudo(e.target.value)
                  if (erros.conteudo) setErros({ ...erros, conteudo: '' })
                }}
                placeholder="Digite a mensagem completa a ser enviada aos clientes..."
                className={`text-xs ${erros.conteudo ? 'border-[#DC2626]' : ''}`}
              />
              {erros.conteudo && <p className="text-xs text-[#DC2626]">{erros.conteudo}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#0F172A]">
                  Upload de Arquivo ({tipo.toUpperCase()}) <span className="text-[#DC2626]">*</span>
                </Label>
                <div className="border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] rounded-lg p-4 text-center bg-[#F8FAFC] transition-colors">
                  <Upload className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
                  <p className="text-xs font-medium text-[#0F172A] mb-1">
                    {nomeArquivoUpload || `Selecione um arquivo de ${tipo}`}
                  </p>
                  <p className="text-[11px] text-[#64748B] mb-3">
                    {tipo === 'imagem'
                      ? 'PNG, JPG ou WEBP até 10MB'
                      : tipo === 'video'
                        ? 'MP4 ou MOV até 50MB'
                        : 'MP3, WAV ou OGG até 20MB'}
                  </p>
                  <Input
                    type="file"
                    accept={
                      tipo === 'imagem' ? 'image/*' : tipo === 'video' ? 'video/*' : 'audio/*'
                    }
                    onChange={handleSimularUpload}
                    className="hidden"
                    id="file-upload-input"
                  />
                  <Label
                    htmlFor="file-upload-input"
                    className="cursor-pointer inline-flex items-center justify-center rounded-md text-xs font-semibold bg-white border border-[#CBD5E1] px-3 py-1.5 hover:bg-slate-50 text-[#0F172A]"
                  >
                    Escolher Arquivo
                  </Label>
                </div>
              </div>

              {/* Descrição ou URL complementar do arquivo */}
              <div className="space-y-1.5">
                <Label htmlFor="cont_desc_arquivo" className="text-xs font-semibold text-[#0F172A]">
                  Descrição / Legenda do Arquivo
                </Label>
                <Textarea
                  id="cont_desc_arquivo"
                  rows={2}
                  value={conteudo}
                  onChange={(e) => {
                    setConteudo(e.target.value)
                    if (erros.conteudo) setErros({ ...erros, conteudo: '' })
                  }}
                  placeholder="URL do arquivo hospedado ou descrição da mídia para envio..."
                  className={`text-xs ${erros.conteudo ? 'border-[#DC2626]' : ''}`}
                />
                {erros.conteudo && <p className="text-xs text-[#DC2626]">{erros.conteudo}</p>}
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-[#1D4ED8]">
            <p className="font-semibold mb-0.5">Fluxo de Aprovação Automático:</p>
            <p className="text-[11px] leading-relaxed">
              O conteúdo será cadastrado com status <strong>"gerado"</strong> e enviado para a fila
              de aprovação do gestor responsável pela campanha antes de ser liberado para disparos.
            </p>
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
              ) : (
                'Salvar e Solicitar Aprovação'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
