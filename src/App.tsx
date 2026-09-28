import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import { AuthProvider } from './contexts/AuthContext'
import { PeriodoProvider } from './contexts/PeriodoContext'
import { ProtectedRoute } from './components/ProtectedRoute'

import Index from './pages/Index'
import Layout from './components/Layout'

// 10 páginas reais para os 10 módulos solicitados
import PainelPage from './pages/PainelPage'
import ClientesPage from './pages/ClientesPage'
import ClienteDetalhesPage from './pages/ClienteDetalhesPage'
import FunilPage from './pages/FunilPage'
import ProspeccaoPage from './pages/ProspeccaoPage'
import LigacoesPage from './pages/LigacoesPage'
import FollowUpPage from './pages/FollowUpPage'
import AutomacoesPage from './pages/AutomacoesPage'
import MarketingPage from './pages/MarketingPage'
import RelatoriosPage from './pages/RelatoriosPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'
import ImportacaoPage from './pages/ImportacaoPage'
import UsuariosPage from './pages/UsuariosPage'
import PrimeirosPassosPage from './pages/PrimeirosPassosPage'
import MetasPage from './pages/MetasPage'
import IntegracoesPage from './pages/IntegracoesPage'
import PopTreinamentoPage from './pages/PopTreinamentoPage'
import ConversasPage from './pages/ConversasPage'
import CatalogoProdutosPage from './pages/CatalogoProdutosPage'
import BackupTestPage from './pages/BackupTestPage'
import { useAuth } from './contexts/AuthContext'

/**
 * Componente que envolve /pop-treinamento para permitir acesso LIVRE
 * (caso não esteja logado, exibe a página em container próprio;
 * caso esteja logado, usa o Layout com menu lateral).
 */
const PopTreinamentoRouteWrapper = () => {
  const { user } = useAuth()

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
          <PopTreinamentoPage />
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <PopTreinamentoPage />
    </Layout>
  )
}

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <PeriodoProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Rota de Login independente */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Navigate to="/" replace />} />

            {/* Rota de POP & Treinamento: se deslogado, entra aqui livremente */}
            <Route path="/pop-treinamento" element={<PopTreinamentoRouteWrapper />} />

            {/* Rotas dos módulos protegidas e agrupadas com o Layout Global */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/painel" element={<PainelPage />} />
                <Route path="/clientes" element={<ClientesPage />} />
                <Route path="/clientes/:id" element={<ClienteDetalhesPage />} />
                <Route path="/funil" element={<FunilPage />} />
                <Route path="/prospeccao" element={<ProspeccaoPage />} />
                <Route path="/ligacoes" element={<LigacoesPage />} />
                <Route path="/follow-up" element={<FollowUpPage />} />
                <Route path="/conversas" element={<ConversasPage />} />
                <Route path="/produtos" element={<CatalogoProdutosPage />} />
                <Route path="/automacoes" element={<AutomacoesPage />} />
                <Route path="/marketing" element={<MarketingPage />} />
                <Route path="/relatorios" element={<RelatoriosPage />} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                <Route path="/importacao" element={<ImportacaoPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/primeiros-passos" element={<PrimeirosPassosPage />} />
                <Route path="/metas" element={<MetasPage />} />
                <Route path="/integracoes" element={<IntegracoesPage />} />
                <Route path="/admin/backup-test" element={<BackupTestPage />} />
              </Route>
            </Route>

            {/* Sem rota 404 além de redirecionar rota desconhecida para / */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </TooltipProvider>
      </PeriodoProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
