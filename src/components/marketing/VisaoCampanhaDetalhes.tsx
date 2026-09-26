import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Megaphone,
  Layers,
  Send,
  Calendar,
  DollarSign,
  User,
  Radio,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import pb from '@/lib/pocketbase/client'
import type { Usuario } from '@/contexts/AuthContext'
import type { ClienteModel } from '@/types/clientes'
import type {
  CampanhaModel,
  ConteudoGeradoModel,
  PublicacaoModel,
  TipoCampanha,
  StatusCampanha,
} from '@/types/marketing'
import { formatarMoeda, formatarData } from '@/types/clientes'
import { SecaoConteudos } from './SecaoConteudos'
import { SecaoPublicacoes } from './SecaoPublicacoes'
import { toast } from '@/hooks/use-toast'

interface VisaoCampanhaDetalhesProps {
  campanha: CampanhaModel
  abaInicial?: 'conteudos' | 'publicacoes'
  usuarios: Usuario[]
  clientes: ClienteModel[]
  onVoltar: () => void
  onCampanhaAtualizada: (campanha: CampanhaModel) => void
}

export function VisaoCampanhaDetalhes({
  campanha,
  abaInicial = 'conteudos',
  usuarios,
  clientes,
  onVoltar,
  onCampanhaAtualizada,
}: VisaoCampanhaDetalhesProps) {
  const [subTab, setSubTab] = useState<'conteudos' | 'publicacoes'>(abaInicial)

  const [conteudos, setConteudos] = useState<ConteudoGeradoModel[]>([])
  const [publicacoes, setPublicacoes] = useState<PublicacaoModel[]>([])
  const [loading, setLoading] = useState(true)

  const carregarDadosCampanha = useCallback(async () => {
    try {
      setLoading(true)

      const promessaConteudos = pb
        .collection('conteudos_gerados')
        .getFullList<ConteudoGeradoModel>({
          filter: `campanha_id = "${campanha.id}"`,
          sort: '-created',
          expand: 'campanha_id',
        })
        .catch((err) => {
          console.warn('Erro ao carregar conteúdos:', err)
          return [] as ConteudoGeradoModel[]
        })

      const promessaPublicacoes = pb
        .collection('publicacoes')
        .getFullList<PublicacaoModel>({
          filter: `campanha_id = "${campanha.id}"`,
          sort: '-data_agendada',
          expand: 'campanha_id,cliente_id,conteudo_id',
        })
        .catch((err) => {
          console.warn('Erro ao carregar publicações:', err)
          return [] as PublicacaoModel[]
        })

      const [resConteudos, resPublicacoes] = await Promise.all([
        promessaConteudos,
        promessaPublicacoes,
      ])

      setConteudos(resConteudos)
      setPublicacoes(resPublicacoes)
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dados da campanha',
        description: 'Não foi possível carregar os conteúdos e publicações vinculados.',
      })
    } finally {
      setLoading(false)
    }
  }, [campanha.id])

  useEffect(() => {
    carregarDadosCampanha()
  }, [carregarDadosCampanha])

  // Filtra conteúdos com status 'aprovado' para alimentar publicações
  const conteudosAprovados = conteudos.filter((c) => c.status === 'aprovado')

  // Badges visuais do cabeçalho
  const renderTipoBadge = (tipo: TipoCampanha) => {
    switch (tipo) {
      case 'whatsapp':
        return <Badge className="bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC]">WhatsApp</Badge>
      case 'email':
        return <Badge className="bg-[#DBEAFE] text-[#2563EB] border-[#93C5FD]">E-mail</Badge>
      case 'sms':
        return <Badge className="bg-[#F3E8FF] text-[#7C3AED] border-[#D8B4FE]">SMS</Badge>
      default:
        return <Badge className="bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]">Mista</Badge>
    }
  }

  const renderStatusBadge = (status: StatusCampanha) => {
    switch (status) {
      case 'rascunho':
        return <Badge className="bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]">Rascunho</Badge>
      case 'ativa':
        return <Badge className="bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC]">Ativa</Badge>
      case 'pausada':
        return <Badge className="bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047]">Pausada</Badge>
      case 'finalizada':
        return <Badge className="bg-[#1E293B] text-white border-[#0F172A]">Finalizada</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const canalNome = campanha.expand?.canal_id?.nome || 'Canal de Marketing'
  const respNome = campanha.expand?.responsavel_id?.nome || 'Responsável'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Botão Voltar e Cartão de Resumo da Campanha */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onVoltar}
          className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] pl-0"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Voltar para Lista de Campanhas
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={carregarDadosCampanha}
          disabled={loading}
          className="h-8 text-xs text-[#64748B]"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Campanha
        </Button>
      </div>

      {/* Cartão de Identificação da Campanha (Estilo 360° do CRM) */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-[#2563EB]" />
              <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">{campanha.nome}</h2>
            </div>
            {campanha.descricao && (
              <p className="text-xs text-[#64748B] max-w-3xl leading-relaxed">
                {campanha.descricao}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {renderTipoBadge(campanha.tipo)}
            {renderStatusBadge(campanha.status)}
          </div>
        </div>

        {/* Metadados da Campanha */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#E2E8F0] text-xs">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#64748B] shrink-0" />
            <div>
              <span className="block text-[10px] text-[#94A3B8] uppercase font-semibold">
                Canal Vinculado
              </span>
              <span className="font-medium text-[#0F172A]">{canalNome}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#64748B] shrink-0" />
            <div>
              <span className="block text-[10px] text-[#94A3B8] uppercase font-semibold">
                Responsável
              </span>
              <span className="font-medium text-[#0F172A]">{respNome}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#64748B] shrink-0" />
            <div>
              <span className="block text-[10px] text-[#94A3B8] uppercase font-semibold">
                Vigência
              </span>
              <span className="font-medium text-[#0F172A]">
                {formatarData(campanha.data_inicio)} a {formatarData(campanha.data_fim)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#64748B] shrink-0" />
            <div>
              <span className="block text-[10px] text-[#94A3B8] uppercase font-semibold">
                Orçamento
              </span>
              <span className="font-medium text-[#0F172A]">
                {formatarMoeda(campanha.orcamento)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Abas Aninhadas da Campanha: Conteúdos vs Publicações */}
      <Tabs
        value={subTab}
        onValueChange={(val) => setSubTab(val as 'conteudos' | 'publicacoes')}
        className="space-y-4"
      >
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="conteudos"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <Layers className="w-4 h-4" />
            Conteúdos Gerados ({conteudos.length})
          </TabsTrigger>

          <TabsTrigger
            value="publicacoes"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#16A34A] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Publicações / Disparos ({publicacoes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conteudos" className="focus-visible:outline-none">
          <SecaoConteudos
            campanha={campanha}
            conteudos={conteudos}
            usuarios={usuarios}
            loading={loading}
            onReload={carregarDadosCampanha}
            onUpdateLista={setConteudos}
          />
        </TabsContent>

        <TabsContent value="publicacoes" className="focus-visible:outline-none">
          <SecaoPublicacoes
            campanha={campanha}
            publicacoes={publicacoes}
            conteudosAprovados={conteudosAprovados}
            clientes={clientes}
            loading={loading}
            onReload={carregarDadosCampanha}
            onUpdateLista={setPublicacoes}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
