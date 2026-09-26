import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import Index from './pages/Index'
import Layout from './components/Layout'

// 10 páginas reais para os 10 módulos solicitados
import PainelPage from './pages/PainelPage'
import ClientesPage from './pages/ClientesPage'
import FunilPage from './pages/FunilPage'
import ProspeccaoPage from './pages/ProspeccaoPage'
import LigacoesPage from './pages/LigacoesPage'
import FollowUpPage from './pages/FollowUpPage'
import AutomacoesPage from './pages/AutomacoesPage'
import MarketingPage from './pages/MarketingPage'
import RelatoriosPage from './pages/RelatoriosPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        {/* Rota de Login independente */}
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Navigate to="/" replace />} />

        {/* Rotas dos 10 módulos agrupados com o Layout Global */}
        <Route element={<Layout />}>
          <Route path="/painel" element={<PainelPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/funil" element={<FunilPage />} />
          <Route path="/prospeccao" element={<ProspeccaoPage />} />
          <Route path="/ligacoes" element={<LigacoesPage />} />
          <Route path="/follow-up" element={<FollowUpPage />} />
          <Route path="/automacoes" element={<AutomacoesPage />} />
          <Route path="/marketing" element={<MarketingPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        </Route>

        {/* Sem rota 404 além de redirecionar rota desconhecida para / */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
