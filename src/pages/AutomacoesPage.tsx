import { useState, useEffect, useCallback } from 'react'
import { Zap, History, Radio, RefreshCw, Lock } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import type { AutomacaoModel, CanalMarketingModel, MensagemEnviadaModel } from '@/types/clientes'
import { AbaAutomacoes } from '@/components/automacoes/AbaAutomacoes'
import { AbaHistoricoMensagens } from '@/components/automacoes/AbaHistoricoMensagens'
import { AbaCanaisMarketing } from '@/components/automacoes/AbaCanaisMarketing'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function AutomacoesPage() {
  const { user } = useAuth()
  const isCeoFinanceiro = user?.perfil === 'ceo_financeiro'

  // Sub-navegação por abas no topo do conteúdo:
  // 'automacoes' | 'historico' | 'canais'
  const [tabAtiva, setTabAtiva] = useState<string>('automacoes')

  // Estados dos dados
  const [automacoes, setAutomacoes] = useState<AutomacaoModel[]>([])
  const [mensagens, setMensagens] = useState<MensagemEnviadaModel[]>([])
  const [canais, setCanais] = useState<CanalMarketingModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const [loading, setLoading] = useState(true)

  // Carregar dados das coleções existentes respeitando a RLS
  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)

      // 1. Carrega automações (RLS permite list se não for estoque)
      const promessaAutomacoes = pb
        .collection('automacoes')
        .getFullList<AutomacaoModel>({
          sort: '-created',
          expand: 'canal_id,responsavel_id',
        })
        .catch((err) => {
          console.warn('Erro ao carregar automações:', err)
          return [] as AutomacaoModel[]
        })

      // 2. Carrega mensagens_enviadas (RLS permite list se não for estoque)
      const promessaMensagens = pb
        .collection('mensagens_enviadas')
        .getFullList<MensagemEnviadaModel>({
          sort: '-created',
          expand: 'cliente_id,automacao_id',
        })
        .catch((err) => {
          console.warn('Erro ao carregar mensagens_enviadas:', err)
          return [] as MensagemEnviadaModel[]
        })

      // 3. Carrega canais_marketing (RLS permite ceo_financeiro ou ativo = true)
      const promessaCanais = pb
        .collection('canais_marketing')
        .getFullList<CanalMarketingModel>({
          sort: 'nome',
        })
        .catch((err) => {
          console.warn('Erro ao carregar canais_marketing:', err)
          return [] as CanalMarketingModel[]
        })

      // 4. Carrega usuários para o seletor de responsáveis
      const promessaUsuarios = pb
        .collection('usuarios')
        .getFullList<Usuario>({
          sort: 'nome',
        })
        .catch(() => (user ? [user] : []))

      const [resAutomacoes, resMensagens, resCanais, resUsuarios] = await Promise.all([
        promessaAutomacoes,
        promessaMensagens,
        promessaCanais,
        promessaUsuarios,
      ])

      setAutomacoes(resAutomacoes)
      setMensagens(resMensagens)
      setCanais(resCanais)
      setUsuarios(resUsuarios.length > 0 ? resUsuarios : user ? [user] : [])
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar automações',
        description:
          msg.includes('permissão') || msg.includes('403')
            ? 'Você não tem permissão para visualizar alguns recursos de automação.'
            : 'Não foi possível carregar as informações do módulo.',
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#7C3AED]" />
            Automações
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Gerenciamento de réguas de comunicação automática, histórico de disparos e canais de
            marketing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="text-[#64748B] hover:text-[#0F172A]"
            title="Atualizar módulo"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar Tudo</span>
          </Button>
        </div>
      </div>

      {/* Navegação por Abas (Tabs no topo do conteúdo, consistente com LigaçõesPage) */}
      <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="automacoes"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Automações ({automacoes.length})
          </TabsTrigger>

          <TabsTrigger
            value="historico"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            Histórico de Mensagens ({mensagens.length})
          </TabsTrigger>

          <TabsTrigger
            value="canais"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <Radio className="w-4 h-4" />
            Canais {isCeoFinanceiro ? `(${canais.length})` : ''}
            {!isCeoFinanceiro && <Lock className="w-3 h-3 text-[#94A3B8] ml-1" />}
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA 1: AUTOMAÇÕES ================= */}
        <TabsContent value="automacoes" className="focus-visible:outline-none">
          <AbaAutomacoes
            automacoes={automacoes}
            canais={canais}
            usuarios={usuarios}
            loading={loading}
            onReload={carregarDados}
            onUpdateLista={setAutomacoes}
          />
        </TabsContent>

        {/* ================= ABA 2: HISTÓRICO DE MENSAGENS ================= */}
        <TabsContent value="historico" className="focus-visible:outline-none">
          <AbaHistoricoMensagens
            mensagens={mensagens}
            loading={loading}
            onReload={carregarDados}
            onUpdateLista={setMensagens}
          />
        </TabsContent>

        {/* ================= ABA 3: CANAIS DE MARKETING ================= */}
        <TabsContent value="canais" className="focus-visible:outline-none">
          <AbaCanaisMarketing
            canais={canais}
            loading={loading}
            onReload={carregarDados}
            onUpdateLista={setCanais}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
