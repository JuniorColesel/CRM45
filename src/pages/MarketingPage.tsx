import React, { useState, useEffect, useCallback } from 'react'
import { Megaphone, Clock, BarChart3, RefreshCw, ShieldAlert } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { CanalMarketingModel, ClienteModel } from '@/types/clientes'
import type {
  CampanhaModel,
  ConteudoGeradoModel,
  PublicacaoModel,
  AprovacaoPendenteModel,
} from '@/types/marketing'
import { AbaCampanhas } from '@/components/marketing/AbaCampanhas'
import { AbaAprovacoesPendentes } from '@/components/marketing/AbaAprovacoesPendentes'
import { AbaDashboardMarketing } from '@/components/marketing/AbaDashboardMarketing'
import { VisaoCampanhaDetalhes } from '@/components/marketing/VisaoCampanhaDetalhes'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function MarketingPage() {
  const { user } = useAuth()

  // Se o perfil for estoque, RLS e regras de negócio definem que não possui acesso ao marketing
  const isEstoque = user?.perfil === 'estoque'

  // Navegação por abas principais no topo: "campanhas" | "aprovacoes" | "dashboard"
  const [tabAtiva, setTabAtiva] = useState<string>('campanhas')

  // Estado da campanha selecionada para exibição de detalhes internos (estilo visão 360°)
  const [campanhaSelecionada, setCampanhaSelecionada] = useState<CampanhaModel | null>(null)
  const [subAbaCampanha, setSubAbaCampanha] = useState<'conteudos' | 'publicacoes'>('conteudos')

  // Estados dos dados gerais
  const [campanhas, setCampanhas] = useState<CampanhaModel[]>([])
  const [canais, setCanais] = useState<CanalMarketingModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [clientes, setClientes] = useState<ClienteModel[]>([])
  const [aprovacoes, setAprovacoes] = useState<AprovacaoPendenteModel[]>([])
  const [todosConteudos, setTodosConteudos] = useState<ConteudoGeradoModel[]>([])
  const [todasPublicacoes, setTodasPublicacoes] = useState<PublicacaoModel[]>([])

  const [loading, setLoading] = useState(true)

  // Carrega todas as coleções do módulo respeitando a RLS nativa do PocketBase
  const carregarDados = useCallback(async () => {
    if (isEstoque) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      // 1. Campanhas
      const promessaCampanhas = pb
        .collection('campanhas')
        .getFullList<CampanhaModel>({
          sort: '-created',
          expand: 'canal_id,responsavel_id',
        })
        .catch((err) => {
          console.warn('RLS ou erro ao carregar campanhas:', err)
          return [] as CampanhaModel[]
        })

      // 2. Canais de marketing
      const promessaCanais = pb
        .collection('canais_marketing')
        .getFullList<CanalMarketingModel>({
          sort: 'nome',
        })
        .catch(() => [] as CanalMarketingModel[])

      // 3. Usuários
      const promessaUsuarios = pb
        .collection('usuarios')
        .getFullList<Usuario>({
          sort: 'nome',
        })
        .catch(() => (user ? [user] : []))

      // 4. Clientes (para o seletor de publicações)
      const promessaClientes = pb
        .collection('clientes')
        .getFullList<ClienteModel>({
          sort: 'nome_contato',
        })
        .catch(() => [] as ClienteModel[])

      // 5. Aprovações pendentes
      const promessaAprovacoes = pb
        .collection('aprovacoes_pendentes')
        .getFullList<AprovacaoPendenteModel>({
          sort: '-created',
          expand: 'conteudo_id,conteudo_id.campanha_id,aprovador_id',
        })
        .catch(() => [] as AprovacaoPendenteModel[])

      // 6. Conteúdos e Publicações gerais para alimentar métricas do Dashboard
      const promessaConteudos = pb
        .collection('conteudos_gerados')
        .getFullList<ConteudoGeradoModel>({
          sort: '-created',
          expand: 'campanha_id',
        })
        .catch(() => [] as ConteudoGeradoModel[])

      const promessaPublicacoes = pb
        .collection('publicacoes')
        .getFullList<PublicacaoModel>({
          sort: '-created',
          expand: 'campanha_id,cliente_id,conteudo_id',
        })
        .catch(() => [] as PublicacaoModel[])

      const [
        resCampanhas,
        resCanais,
        resUsuarios,
        resClientes,
        resAprovacoes,
        resConteudos,
        resPublicacoes,
      ] = await Promise.all([
        promessaCampanhas,
        promessaCanais,
        promessaUsuarios,
        promessaClientes,
        promessaAprovacoes,
        promessaConteudos,
        promessaPublicacoes,
      ])

      setCampanhas(resCampanhas)
      setCanais(resCanais)
      setUsuarios(resUsuarios.length > 0 ? resUsuarios : user ? [user] : [])
      setClientes(resClientes)
      setAprovacoes(resAprovacoes)
      setTodosConteudos(resConteudos)
      setTodasPublicacoes(resPublicacoes)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Aviso de acesso',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Alguns dados foram limitados de acordo com seu perfil de acesso.'
            : 'Não foi possível carregar todas as informações do módulo Marketing.',
      })
    } finally {
      setLoading(false)
    }
  }, [user, isEstoque])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Contagem de aprovações pendentes para exibir no badge da aba
  const qtdAprovacoesPendentes = aprovacoes.filter((a) => {
    if (user?.perfil === 'ceo_financeiro') return a.status === 'pendente'
    return a.aprovador_id === user?.id && a.status === 'pendente'
  }).length

  // Handlers para abrir as visões de Conteúdo e Publicação da Campanha
  const handleAbrirConteudosCampanha = (campanha: CampanhaModel) => {
    setCampanhaSelecionada(campanha)
    setSubAbaCampanha('conteudos')
  }

  const handleAbrirPublicacoesCampanha = (campanha: CampanhaModel) => {
    setCampanhaSelecionada(campanha)
    setSubAbaCampanha('publicacoes')
  }

  // Se o perfil logado for Estoque, exibe aviso amigável de restrição conforme regra de negócio
  if (isEstoque) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-[#E2E8F0] space-y-3">
        <ShieldAlert className="w-12 h-12 text-[#94A3B8] mx-auto" />
        <h3 className="text-lg font-bold text-[#0F172A]">Acesso Restrito ao Módulo</h3>
        <p className="text-xs text-[#64748B] max-w-md mx-auto">
          O perfil de Estoque não possui permissões de acesso às campanhas e publicações de
          marketing. Entre em contato com a gestão caso precise de permissão.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho do Módulo de Marketing */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-[#2563EB]" />
            Marketing
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Gestão de campanhas promocionais, peças publicitárias, aprovações e régua de disparos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar dados de marketing"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar Tudo</span>
          </Button>
        </div>
      </div>

      {/* Se o usuário tiver clicado em 'Conteúdos' ou 'Publicações' de uma campanha,
          renderiza a visão detalhada interna daquela campanha */}
      {campanhaSelecionada ? (
        <VisaoCampanhaDetalhes
          campanha={campanhaSelecionada}
          abaInicial={subAbaCampanha}
          usuarios={usuarios}
          clientes={clientes}
          onVoltar={() => setCampanhaSelecionada(null)}
          onCampanhaAtualizada={(atualizada) => {
            setCampanhas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
            setCampanhaSelecionada(atualizada)
          }}
        />
      ) : (
        /* Navegação por Abas Principais: Campanhas, Aprovações e Dashboard */
        <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-6">
          <TabsList className="bg-slate-100 p-1 rounded-xl">
            <TabsTrigger
              value="campanhas"
              className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Megaphone className="w-4 h-4" />
              Campanhas ({campanhas.length})
            </TabsTrigger>

            <TabsTrigger
              value="aprovacoes"
              className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#CA8A04] data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Aprovações
              {qtdAprovacoesPendentes > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#FEF9C3] text-[#CA8A04] border border-[#FDE047]">
                  {qtdAprovacoesPendentes}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="dashboard"
              className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
          </TabsList>

          {/* ================= ABA 1: CAMPANHAS ================= */}
          <TabsContent value="campanhas" className="focus-visible:outline-none">
            <AbaCampanhas
              campanhas={campanhas}
              canais={canais}
              usuarios={usuarios}
              loading={loading}
              onReload={carregarDados}
              onUpdateLista={setCampanhas}
              onAbrirConteudos={handleAbrirConteudosCampanha}
              onAbrirPublicacoes={handleAbrirPublicacoesCampanha}
            />
          </TabsContent>

          {/* ================= ABA 2: APROVAÇÕES PENDENTES ================= */}
          <TabsContent value="aprovacoes" className="focus-visible:outline-none">
            <AbaAprovacoesPendentes
              aprovacoes={aprovacoes}
              loading={loading}
              onReload={carregarDados}
              onUpdateLista={setAprovacoes}
            />
          </TabsContent>

          {/* ================= ABA 3: DASHBOARD DE CAMPANHAS ================= */}
          <TabsContent value="dashboard" className="focus-visible:outline-none">
            <AbaDashboardMarketing
              campanhas={campanhas}
              conteudos={todosConteudos}
              publicacoes={todasPublicacoes}
              loading={loading}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
