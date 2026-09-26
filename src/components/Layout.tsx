import React, { useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  LayoutDashboard,
  Users,
  Filter,
  Target,
  Phone,
  RotateCcw,
  Zap,
  Megaphone,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'

export interface NavigationItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  ariaLabel: string
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    name: 'Painel',
    href: '/painel',
    icon: LayoutDashboard,
    ariaLabel: 'Acessar o Painel de controle',
  },
  { name: 'Clientes', href: '/clientes', icon: Users, ariaLabel: 'Acessar módulo de Clientes' },
  { name: 'Funil', href: '/funil', icon: Filter, ariaLabel: 'Acessar Funil de vendas' },
  {
    name: 'Prospecção',
    href: '/prospeccao',
    icon: Target,
    ariaLabel: 'Acessar módulo de Prospecção',
  },
  { name: 'Ligações', href: '/ligacoes', icon: Phone, ariaLabel: 'Acessar histórico de Ligações' },
  {
    name: 'Follow-up',
    href: '/follow-up',
    icon: RotateCcw,
    ariaLabel: 'Acessar rotina de Follow-up',
  },
  { name: 'Automações', href: '/automacoes', icon: Zap, ariaLabel: 'Acessar Automações de vendas' },
  {
    name: 'Marketing',
    href: '/marketing',
    icon: Megaphone,
    ariaLabel: 'Acessar módulo de Marketing',
  },
  {
    name: 'Relatórios',
    href: '/relatorios',
    icon: BarChart3,
    ariaLabel: 'Acessar Relatórios de desempenho',
  },
  {
    name: 'Configurações',
    href: '/configuracoes',
    icon: Settings,
    ariaLabel: 'Acessar Configurações do sistema',
  },
]

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const currentItem = NAVIGATION_ITEMS.find((item) => item.href === location.pathname)
  const pageTitle = currentItem ? currentItem.name : 'Painel'
  const currentYear = new Date().getFullYear()

  const handleLogout = () => {
    setMobileMenuOpen(false)
    navigate('/')
  }

  const renderNavContent = () => (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Top Logo */}
      <div className="h-16 flex items-center px-6 border-b border-[#E2E8F0] gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#16A34A] to-[#2563EB] flex items-center justify-center text-white shadow-sm flex-shrink-0">
          <TrendingUp className="w-5 h-5 stroke-[2.5]" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-lg leading-tight text-[#0F172A] tracking-tight">
            Colesel 45
          </span>
          <span className="text-xs text-[#64748B] font-medium leading-none">CRM Comercial</span>
        </div>
      </div>

      {/* Navigation items list */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Menu principal">
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.href

          return (
            <NavLink
              key={item.href}
              to={item.href}
              aria-label={item.ariaLabel}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive: isLinkActive }) =>
                [
                  'group flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[15px] font-medium transition-all duration-150',
                  isLinkActive
                    ? 'bg-[#16A34A] text-white shadow-sm font-semibold'
                    : 'text-[#0F172A] hover:bg-[#F1F5F9] hover:text-[#7C3AED]',
                ].join(' ')
              }
            >
              <Icon
                className={[
                  'w-5 h-5 flex-shrink-0 transition-colors duration-150',
                  isActive ? 'text-white' : 'text-[#64748B] group-hover:text-[#7C3AED]',
                ].join(' ')}
              />
              <span className="truncate">{item.name}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Footer do Menu / Usuário e Sair */}
      <div className="p-3 border-t border-[#E2E8F0] bg-white">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#16A34A] to-[#7C3AED] text-white font-bold text-sm flex items-center justify-center flex-shrink-0 shadow-sm">
              C45
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#0F172A] truncate leading-tight">
                Equipe Colesel 45
              </p>
              <p className="text-[11px] text-[#64748B] truncate leading-tight">Comercial</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sair da conta e voltar ao login"
            className="p-2 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 transition-colors duration-150 flex-shrink-0"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-[#0F172A] font-sans antialiased">
      {/* Desktop Sidebar (Fixo 280px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[280px] lg:fixed lg:inset-y-0 z-30 border-r border-[#E2E8F0] bg-white">
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer (Telas < 1024px) */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-200 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Overlay escuro */}
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-200"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />

        {/* Painel do drawer */}
        <aside
          className={`fixed inset-y-0 left-0 w-[80%] max-w-xs bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-label="Navegação móvel"
        >
          <div className="absolute top-3 right-3 z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {renderNavContent()}
        </aside>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-[280px] min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur border-b border-[#E2E8F0] px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hambúrguer visível apenas < 1024px */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#0F172A] hover:bg-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-6 h-6 text-[#0F172A]" />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              {pageTitle}
            </h1>
          </div>

          {/* Avatar + Equipe Colesel 45 à direita (Apenas no desktop) */}
          <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-[#E2E8F0]">
            <div className="text-right">
              <span className="block text-sm font-semibold text-[#0F172A] leading-tight">
                Equipe Colesel 45
              </span>
              <span className="block text-xs text-[#64748B]">CRM Comercial</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#16A34A] to-[#2563EB] text-white font-bold text-xs flex items-center justify-center shadow-sm">
              C45
            </div>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
          <Outlet />
        </main>

        {/* Rodapé discreto na base */}
        <footer className="py-4 px-6 border-t border-[#E2E8F0] bg-white text-center text-xs text-[#64748B]">
          Colesel 45 — CRM Comercial © {currentYear}
        </footer>
      </div>
    </div>
  )
}
