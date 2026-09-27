import { useNavigate } from 'react-router-dom'
import {
  PlusCircle,
  PhoneCall,
  CheckSquare,
  Layers,
  Users,
  FileBarChart2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { AlertaPainel } from '@/services/painelService'

interface PainelAcoesAlertasProps {
  alertas: AlertaPainel[]
  esconderComercial?: boolean // true para perfis de compras/estoque
}

export function PainelAcoesAlertas({
  alertas,
  esconderComercial = false,
}: PainelAcoesAlertasProps) {
  const navigate = useNavigate()

  // Ações rápidas:
  // "Nova Oportunidade" → /funil?novo=1
  // "Nova Ligação" → /follow-up?novo=ligacao
  // "Nova Tarefa" → /follow-up?novo=tarefa
  // "Ver Funil" → /funil
  // "Ver Clientes" → /clientes
  // "Ver Relatórios" → /relatorios
  const acoes = [
    {
      id: 'nova-oportunidade',
      titulo: 'Nova Oportunidade',
      descricao: 'Cadastrar nova oportunidade no funil',
      icone: PlusCircle,
      corIcone: 'text-[#2563EB]',
      corBg: 'bg-blue-50 hover:bg-blue-100/80 border-blue-100',
      rota: '/funil?novo=1',
      comercialApenas: true,
    },
    {
      id: 'nova-ligacao',
      titulo: 'Nova Ligação',
      descricao: 'Registrar histórico ou agendar ligação',
      icone: PhoneCall,
      corIcone: 'text-[#16A34A]',
      corBg: 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-100',
      rota: '/follow-up?novo=ligacao',
      comercialApenas: false,
    },
    {
      id: 'nova-tarefa',
      titulo: 'Nova Tarefa',
      descricao: 'Criar tarefa ou follow-up com cliente',
      icone: CheckSquare,
      corIcone: 'text-[#CA8A04]',
      corBg: 'bg-amber-50 hover:bg-amber-100/80 border-amber-100',
      rota: '/follow-up?novo=tarefa',
      comercialApenas: false,
    },
    {
      id: 'ver-funil',
      titulo: 'Ver Funil',
      descricao: 'Acessar quadro Kanban e etapas de vendas',
      icone: Layers,
      corIcone: 'text-[#7C3AED]',
      corBg: 'bg-purple-50 hover:bg-purple-100/80 border-purple-100',
      rota: '/funil',
      comercialApenas: true,
    },
    {
      id: 'ver-clientes',
      titulo: 'Ver Clientes',
      descricao: 'Base completa de clientes e contatos',
      icone: Users,
      corIcone: 'text-[#0284C7]',
      corBg: 'bg-sky-50 hover:bg-sky-100/80 border-sky-100',
      rota: '/clientes',
      comercialApenas: false,
    },
    {
      id: 'ver-relatorios',
      titulo: 'Ver Relatórios',
      descricao: 'Consultar métricas e relatórios detalhados',
      icone: FileBarChart2,
      corIcone: 'text-[#475569]',
      corBg: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
      rota: '/relatorios',
      comercialApenas: false,
    },
  ]

  const acoesFiltradas = esconderComercial ? acoes.filter((a) => !a.comercialApenas) : acoes

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* ---------------- COLUNA ESQUERDA: AÇÕES RÁPIDAS ---------------- */}
      <Card className="border border-[#E2E8F0] shadow-sm bg-white flex flex-col">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#2563EB]" />
            Ações Rápidas
          </CardTitle>
          <p className="text-xs text-[#64748B]">
            Atalhos para as operações mais frequentes da equipe
          </p>
        </CardHeader>
        <CardContent className="pt-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {acoesFiltradas.map((acao) => {
              const Icone = acao.icone
              return (
                <button
                  key={acao.id}
                  type="button"
                  onClick={() => navigate(acao.rota)}
                  className={`flex items-start text-left p-3 rounded-xl border transition-all duration-200 group ${acao.corBg}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-white/80 shadow-xs flex items-center justify-center shrink-0 mr-3 mt-0.5 group-hover:scale-105 transition-transform">
                    <Icone className={`w-4 h-4 ${acao.corIcone}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-[#0F172A] group-hover:text-[#2563EB] transition-colors leading-tight">
                      {acao.titulo}
                    </h4>
                    <p className="text-[11px] text-[#64748B] mt-0.5 line-clamp-1">
                      {acao.descricao}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all shrink-0 ml-1 mt-1" />
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ---------------- COLUNA DIREITA: ALERTAS E PENDÊNCIAS ---------------- */}
      {/* Lista de até 10 alertas ordenados por prioridade (mais urgente primeiro)
          ícone colorido (amarelo pendente, vermelho urgente, verde meta batida) */}
      <Card className="border border-[#E2E8F0] shadow-sm bg-white flex flex-col">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#CA8A04]" />
              Alertas & Pendências
            </CardTitle>
            <p className="text-xs text-[#64748B]">Itens prioritários que demandam acompanhamento</p>
          </div>
          {alertas.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-[#0F172A]">
              {alertas.length}
            </span>
          )}
        </CardHeader>

        <CardContent className="pt-4 flex-1 flex flex-col">
          {alertas.length === 0 ? (
            <div className="flex-1 min-h-[220px] flex flex-col items-center justify-center text-center p-6 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#16A34A] opacity-80" />
              <div className="text-sm font-semibold text-[#0F172A]">Nenhum alerta no momento</div>
              <p className="text-xs text-[#64748B] max-w-xs">
                Todas as tarefas, ligações e acompanhamentos de clientes estão em dia!
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {alertas.map((alerta) => {
                // Configuração visual por severidade / tipo
                const isVermelho = alerta.iconeCor === 'vermelho'
                const isVerde = alerta.iconeCor === 'verde'
                const isAmarelo = alerta.iconeCor === 'amarelo'

                const IconeAlerta = isVerde
                  ? CheckCircle2
                  : isVermelho
                    ? AlertTriangle
                    : AlertCircle

                const bgCor = isVermelho
                  ? 'bg-red-50/70 border-red-200'
                  : isVerde
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : isAmarelo
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-blue-50/70 border-blue-200'

                const iconeCorCss = isVermelho
                  ? 'text-[#DC2626] bg-red-100'
                  : isVerde
                    ? 'text-[#16A34A] bg-emerald-100'
                    : isAmarelo
                      ? 'text-[#CA8A04] bg-amber-100'
                      : 'text-[#2563EB] bg-blue-100'

                return (
                  <div
                    key={alerta.id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${bgCor}`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconeCorCss}`}
                      >
                        <IconeAlerta className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-[#0F172A] leading-tight">
                          {alerta.titulo}
                        </h4>
                        <p className="text-[11px] text-[#475569] mt-0.5 leading-snug">
                          {alerta.descricao}
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(alerta.linkDestino)}
                      className="h-7 px-2.5 text-xs font-semibold bg-white hover:bg-slate-50 border-slate-200 shrink-0 self-end sm:self-center"
                    >
                      {alerta.linkRotulo || 'Ver detalhes'}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
