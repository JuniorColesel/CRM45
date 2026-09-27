import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Upload, Radio, Target, Settings, ChevronRight, Lock, Sliders } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth, type PerfilUsuario } from '@/contexts/AuthContext'

interface ConfigCardItem {
  id: string
  titulo: string
  descricao: string
  rota: string
  state?: Record<string, unknown>
  icone: React.ComponentType<{ className?: string }>
  corIcone: string
  bgIcone: string
  perfisPermitidos: PerfilUsuario[]
}

const CARDS_CONFIGURACOES: ConfigCardItem[] = [
  {
    id: 'usuarios',
    titulo: 'Gestão de Usuários',
    descricao: 'Cadastre novos colaboradores, gerencie perfis de acesso e senhas.',
    rota: '/usuarios',
    icone: Users,
    corIcone: 'text-[#7C3AED]',
    bgIcone: 'bg-purple-100',
    perfisPermitidos: ['ceo_financeiro'],
  },
  {
    id: 'importacao',
    titulo: 'Importar dados do Bling',
    descricao: 'Suba arquivos CSV/TXT de clientes e compras com mapeamento flexível de colunas.',
    rota: '/importacao',
    icone: Upload,
    corIcone: 'text-[#16A34A]',
    bgIcone: 'bg-emerald-100',
    perfisPermitidos: ['ceo_financeiro'],
  },
  {
    id: 'canais',
    titulo: 'Canais de Automação',
    descricao: 'Gerencie canais de WhatsApp, E-mail e SMS para réguas automáticas.',
    rota: '/automacoes?aba=canais',
    state: { aba: 'canais' },
    icone: Radio,
    corIcone: 'text-[#2563EB]',
    bgIcone: 'bg-blue-100',
    // ceo_financeiro e coordenador_vendas podem ver o card (ao abrir, se for coordenador_vendas verá o aviso restrito com cadeado na aba)
    perfisPermitidos: ['ceo_financeiro', 'coordenador_vendas'],
  },
  {
    id: 'metas',
    titulo: 'Metas do Time',
    descricao: 'Defina e acompanhe as metas mensais de faturamento e oportunidades por vendedor.',
    rota: '/metas',
    icone: Target,
    corIcone: 'text-[#DC2626]',
    bgIcone: 'bg-red-100',
    perfisPermitidos: ['ceo_financeiro', 'coordenador_vendas'],
  },
  {
    id: 'integracoes',
    titulo: 'Integrações',
    descricao:
      'Configure tokens de API do Bling ERP, WhatsApp Business (Meta) e provedores SMTP/SMS.',
    rota: '/integracoes',
    icone: Settings,
    corIcone: 'text-[#0F172A]',
    bgIcone: 'bg-slate-100',
    perfisPermitidos: ['ceo_financeiro', 'coordenador_vendas'],
  },
]

export default function ConfiguracoesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perfil = user?.perfil

  // ceo_financeiro e coordenador_vendas veem todos os cards permitidos.
  // Vendedores/compras/estoque veem apenas os permitidos pelo perfil.
  const cardsPermitidos = CARDS_CONFIGURACOES.filter((card) => {
    if (!perfil) return false
    return card.perfisPermitidos.includes(perfil)
  })

  const handleNavegar = (card: ConfigCardItem) => {
    navigate(card.rota, { state: card.state })
  }

  // Se não restar nenhum card permitido para o perfil (ex.: vendedor_1, vendedor_2, compras_grandes_clientes, estoque)
  if (cardsPermitidos.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in pb-12 max-w-4xl mx-auto">
        <div className="py-16 px-4 max-w-lg mx-auto text-center animate-fade-in">
          <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[#0F172A]">Acesso restrito</h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                As configurações avançadas e integrações do sistema são restritas a gestores e
                administradores.
              </p>
            </div>
            <div className="pt-2">
              <Badge
                variant="outline"
                className="text-xs text-amber-700 bg-amber-50/50 border-amber-200"
              >
                Permissão requerida: ceo_financeiro ou coordenador_vendas
              </Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-5xl mx-auto">
      {/* Cabeçalho da página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-slate-100 text-[#0F172A] border-slate-300 text-xs font-semibold gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-[#16A34A]" />
              Painel Administrativo
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1">
            Configurações e Integrações
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Gerencie os acessos, canais de comunicação, importações e conexões de serviços do CRM
            Colesel 45.
          </p>
        </div>

        <div>
          <Badge
            variant="outline"
            className="text-xs text-slate-600 bg-white border-slate-200 py-1.5 px-3"
          >
            Perfil atual: <strong>{user?.nome || 'Administrador'}</strong>
          </Badge>
        </div>
      </div>

      {/* Grade com os 5 cards clicáveis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {cardsPermitidos.map((card) => {
          const Icone = card.icone

          return (
            <Card
              key={card.id}
              onClick={() => handleNavegar(card)}
              className="border-[#E2E8F0] hover:border-[#16A34A]/60 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer bg-white group rounded-2xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]"
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleNavegar(card)
                }
              }}
            >
              <CardContent className="p-5 sm:p-6 flex items-center justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-xl ${card.bgIcone} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200`}
                  >
                    <Icone className={`w-6 h-6 ${card.corIcone}`} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-bold text-base text-[#0F172A] group-hover:text-[#16A34A] transition-colors duration-150 truncate">
                      {card.titulo}
                    </h3>
                    <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                      {card.descricao}
                    </p>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-emerald-50 flex items-center justify-center text-[#94A3B8] group-hover:text-[#16A34A] flex-shrink-0 transition-colors duration-150">
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-150" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
