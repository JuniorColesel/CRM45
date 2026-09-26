import { useState } from 'react'
import { TrendingUp, PhoneCall, Megaphone, Users } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SubAbaOportunidades } from './SubAbaOportunidades'
import { SubAbaLigacoes } from './SubAbaLigacoes'
import { SubAbaCampanhas } from './SubAbaCampanhas'
import { SubAbaClientes } from './SubAbaClientes'
import type {
  ClienteModel,
  EtapaFunilModel,
  LigacaoModel,
  OportunidadeModel,
  CanalMarketingModel,
} from '@/types/clientes'
import type { CampanhaModel, PublicacaoModel } from '@/types/marketing'
import type { Usuario } from '@/contexts/AuthContext'

interface AbaRelatoriosDetalhadosProps {
  oportunidadesDoPeriodo: OportunidadeModel[]
  ligacoesDoPeriodo: LigacaoModel[]
  campanhasDoPeriodo: CampanhaModel[]
  publicacoes: PublicacaoModel[]
  canais: CanalMarketingModel[]
  clientes: ClienteModel[]
  etapas: EtapaFunilModel[]
  usuarios: Usuario[]
  loading: boolean
}

export function AbaRelatoriosDetalhados({
  oportunidadesDoPeriodo,
  ligacoesDoPeriodo,
  campanhasDoPeriodo,
  publicacoes,
  canais,
  clientes,
  etapas,
  usuarios,
  loading,
}: AbaRelatoriosDetalhadosProps) {
  const [subTab, setSubTab] = useState<'oportunidades' | 'ligacoes' | 'campanhas' | 'clientes'>(
    'oportunidades',
  )

  if (loading) {
    return (
      <div className="py-16 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#64748B]">Carregando relatórios detalhados...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={subTab}
        onValueChange={(val) => setSubTab(val as typeof subTab)}
        className="space-y-4"
      >
        {/* Navegação entre as 4 sub-abas */}
        <div className="border-b border-[#E2E8F0] pb-2">
          <TabsList className="bg-slate-100 p-1 rounded-xl h-auto flex flex-wrap gap-1">
            <TabsTrigger
              value="oportunidades"
              className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm flex items-center gap-2 py-1.5 px-3"
            >
              <TrendingUp className="w-4 h-4" />
              Oportunidades ({oportunidadesDoPeriodo.length})
            </TabsTrigger>

            <TabsTrigger
              value="ligacoes"
              className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#16A34A] data-[state=active]:shadow-sm flex items-center gap-2 py-1.5 px-3"
            >
              <PhoneCall className="w-4 h-4" />
              Ligações ({ligacoesDoPeriodo.length})
            </TabsTrigger>

            <TabsTrigger
              value="campanhas"
              className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#CA8A04] data-[state=active]:shadow-sm flex items-center gap-2 py-1.5 px-3"
            >
              <Megaphone className="w-4 h-4" />
              Campanhas ({campanhasDoPeriodo.length})
            </TabsTrigger>

            <TabsTrigger
              value="clientes"
              className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#7C3AED] data-[state=active]:shadow-sm flex items-center gap-2 py-1.5 px-3"
            >
              <Users className="w-4 h-4" />
              Clientes ({clientes.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Sub-aba a) Oportunidades */}
        <TabsContent value="oportunidades" className="focus-visible:outline-none">
          <SubAbaOportunidades
            oportunidadesDoPeriodo={oportunidadesDoPeriodo}
            etapas={etapas}
            usuarios={usuarios}
            clientes={clientes}
          />
        </TabsContent>

        {/* Sub-aba b) Ligações */}
        <TabsContent value="ligacoes" className="focus-visible:outline-none">
          <SubAbaLigacoes
            ligacoesDoPeriodo={ligacoesDoPeriodo}
            usuarios={usuarios}
            clientes={clientes}
          />
        </TabsContent>

        {/* Sub-aba c) Campanhas */}
        <TabsContent value="campanhas" className="focus-visible:outline-none">
          <SubAbaCampanhas
            campanhasDoPeriodo={campanhasDoPeriodo}
            publicacoes={publicacoes}
            canais={canais}
            usuarios={usuarios}
          />
        </TabsContent>

        {/* Sub-aba d) Clientes */}
        <TabsContent value="clientes" className="focus-visible:outline-none">
          <SubAbaClientes clientes={clientes} usuarios={usuarios} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
