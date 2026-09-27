import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Compass,
  ExternalLink,
  Users,
  Target,
  Radio,
  UploadCloud,
  Megaphone,
  Filter,
  BarChart3,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'

interface EtapaConfig {
  id: string
  titulo: string
  descricao: string
  link: string
  icone: React.ComponentType<{ className?: string }>
}

const ETAPAS: EtapaConfig[] = [
  {
    id: 'usuarios',
    titulo: 'Cadastrar usuários do time',
    descricao:
      'Adicione coordenadores, vendedores, compras e estoque na tela de Gestão de Usuários',
    link: '/usuarios',
    icone: Users,
  },
  {
    id: 'metas',
    titulo: 'Definir metas mensais',
    descricao: 'Configure as metas de vendas para cada vendedor do mês corrente',
    link: '/metas',
    icone: Target,
  },
  {
    id: 'canais',
    titulo: 'Cadastrar canais de marketing',
    descricao: 'Adicione os canais de WhatsApp, e-mail e SMS para campanhas e automações',
    link: '/automacoes', // leva para /automacoes onde fica a aba Canais
    icone: Radio,
  },
  {
    id: 'importacao',
    titulo: 'Importar clientes do Bling',
    descricao: 'Faça upload dos CSVs de clientes e compras na tela de Importação',
    link: '/importacao',
    icone: UploadCloud,
  },
  {
    id: 'marketing',
    titulo: 'Criar primeira campanha',
    descricao: 'Teste o fluxo completo: gerar conteúdo → aprovar → agendar publicação',
    link: '/marketing',
    icone: Megaphone,
  },
  {
    id: 'funil',
    titulo: 'Testar fluxo de vendas',
    descricao: 'Crie uma oportunidade, adicione ligações, tarefas e acompanhe no funil',
    link: '/funil',
    icone: Filter,
  },
  {
    id: 'relatorios',
    titulo: 'Validar relatórios',
    descricao: 'Confira se os dados aparecem corretamente no Painel e Relatórios Detalhados',
    link: '/relatorios',
    icone: BarChart3,
  },
]

const STORAGE_KEY_CONCLUIDAS = 'crm_colesel45_primeiros_passos_concluidas'
const STORAGE_KEY_CLICADAS = 'crm_colesel45_primeiros_passos_clicadas'

export default function PrimeirosPassosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isCeoFinanceiro = user?.perfil === 'ceo_financeiro'

  // Estado das etapas concluídas (checkbox marcado)
  const [concluidas, setConcluidas] = useState<Record<string, boolean>>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_CONCLUIDAS)
      if (salvo) return JSON.parse(salvo)
    } catch {
      // Ignora erro de JSON
    }
    return {}
  })

  // Estado das etapas clicadas (usuário clicou no link mas ainda não marcou como concluída)
  const [clicadas, setClicadas] = useState<Record<string, boolean>>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_CLICADAS)
      if (salvo) return JSON.parse(salvo)
    } catch {
      // Ignora erro de JSON
    }
    return {}
  })

  // Salvar no localStorage sempre que houver mudanças
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONCLUIDAS, JSON.stringify(concluidas))
    } catch {
      // Ignora erro de cota
    }
  }, [concluidas])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CLICADAS, JSON.stringify(clicadas))
    } catch {
      // Ignora erro de cota
    }
  }, [clicadas])

  // Voltar: navigate(-1) com fallback para /painel
  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/painel')
    }
  }

  // Toggle individual do checkbox
  const handleToggleConcluida = (id: string, checked: boolean) => {
    setConcluidas((prev) => ({
      ...prev,
      [id]: checked,
    }))
  }

  // Marcar todas como concluídas
  const handleMarcarTodas = () => {
    const novo: Record<string, boolean> = {}
    ETAPAS.forEach((e) => {
      novo[e.id] = true
    })
    setConcluidas(novo)
  }

  // Reiniciar progresso (opcional para testes / conveniência do admin)
  const handleReiniciarProgresso = () => {
    setConcluidas({})
    setClicadas({})
    try {
      localStorage.removeItem(STORAGE_KEY_CONCLUIDAS)
      localStorage.removeItem(STORAGE_KEY_CLICADAS)
    } catch {
      // Ignora erro
    }
  }

  // Ao clicar no link de uma etapa
  const handleNavegarEtapa = (etapa: EtapaConfig) => {
    // Marca etapa como clicada se ainda não concluída
    if (!concluidas[etapa.id]) {
      setClicadas((prev) => ({
        ...prev,
        [etapa.id]: true,
      }))
    }
    navigate(etapa.link)
  }

  // Cálculo de progresso
  const totalEtapas = ETAPAS.length
  const totalConcluidas = ETAPAS.filter((e) => !!concluidas[e.id]).length
  const percentual = Math.round((totalConcluidas / totalEtapas) * 100)
  const todasConcluidas = totalConcluidas === totalEtapas

  // Cores da barra de progresso:
  // vermelho < 30%, amarelo 30-70%, verde > 70%
  let corBarra = 'bg-[#DC2626]'
  let corTrack = 'bg-red-100'
  let corTextoProgresso = 'text-[#DC2626]'
  if (percentual > 70) {
    corBarra = 'bg-[#16A34A]'
    corTrack = 'bg-emerald-100'
    corTextoProgresso = 'text-[#16A34A]'
  } else if (percentual >= 30) {
    corBarra = 'bg-[#EAB308]'
    corTrack = 'bg-yellow-100'
    corTextoProgresso = 'text-[#CA8A04]'
  }

  // Se NÃO for ceo_financeiro, exibe o aviso "Acesso restrito" com cadeado, idêntico ao padrão existente
  if (!isCeoFinanceiro) {
    return (
      <div className="space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleVoltar}
            className="text-[#64748B] hover:text-[#0F172A] -ml-2 mb-2 gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </div>

        <div className="py-16 px-4 max-w-lg mx-auto text-center animate-fade-in">
          <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[#0F172A]">Acesso restrito</h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                A tela de primeiros passos e configuração inicial é restrita exclusivamente ao
                perfil <strong>CEO / Diretor Financeiro</strong>.
              </p>
            </div>
            <div className="pt-2">
              <Badge
                variant="outline"
                className="text-xs text-amber-700 bg-amber-50/50 border-amber-200"
              >
                Permissão requerida: ceo_financeiro
              </Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-4xl mx-auto">
      {/* Topo com Botão Voltar e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleVoltar}
              className="text-[#64748B] hover:text-[#0F172A] gap-1.5 h-8 px-2.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </Button>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1"
            >
              <Compass className="w-3 h-3" />
              Onboarding Inicial
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1 flex items-center gap-2">
            Primeiros Passos
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Guia de configuração e ativação do CRM Colesel 45 para a sua equipe.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {totalConcluidas > 0 && !todasConcluidas && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReiniciarProgresso}
              className="text-[#64748B] hover:text-[#0F172A] text-xs h-9 gap-1"
              title="Redefinir checklist"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reiniciar</span>
            </Button>
          )}

          <Button
            onClick={handleMarcarTodas}
            disabled={todasConcluidas}
            className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs sm:text-sm h-9 shadow-sm gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            Marcar todas como concluídas
          </Button>
        </div>
      </div>

      {/* 2) BARRA DE PROGRESSO NO TOPO */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl bg-white overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm font-semibold">
            <span className="text-[#0F172A]">Progresso da Implantação</span>
            <span className={`font-bold ${corTextoProgresso}`}>
              {totalConcluidas} de {totalEtapas} etapas concluídas — {percentual}%
            </span>
          </div>

          {/* Barra de progresso com transição e cor dinâmica (<30% vermelho, 30-70% amarelo, >70% verde) */}
          <div className={`w-full h-3.5 rounded-full ${corTrack} overflow-hidden p-0.5`}>
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${corBarra}`}
              style={{ width: `${percentual}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-[#64748B] pt-0.5">
            <span>Comece pelas configurações de equipe e metas</span>
            <span>{totalEtapas - totalConcluidas} pendentes</span>
          </div>
        </CardContent>
      </Card>

      {/* 5) MENSAGEM FINAL (quando todas estiverem concluídas) */}
      {todasConcluidas && (
        <div className="p-5 sm:p-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 text-[#0F172A] shadow-sm animate-fade-in flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#16A34A] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-emerald-950">
                🎉 Parabéns! Seu CRM está pronto para uso. Libere o acesso para o time!
              </h3>
              <p className="text-xs sm:text-sm text-emerald-800 mt-0.5">
                Todas as 7 etapas essenciais de ativação foram concluídas com sucesso.
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/painel')}
            className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs sm:text-sm h-9 shadow-sm flex-shrink-0"
          >
            Ir para o Painel
          </Button>
        </div>
      )}

      {/* 1) CHECKLIST VISUAL (7 etapas) */}
      <div className="space-y-3">
        {ETAPAS.map((etapa, idx) => {
          const isConcluida = !!concluidas[etapa.id]
          const isClicada = !!clicadas[etapa.id]

          // Status: concluído (verde) > em progresso (azul) > pendente (cinza)
          let statusLabel = 'Pendente'
          let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-300'
          if (isConcluida) {
            statusLabel = 'Concluído'
            statusBadgeClass = 'bg-emerald-100 text-[#16A34A] border-emerald-200 font-semibold'
          } else if (isClicada) {
            statusLabel = 'Em progresso'
            statusBadgeClass = 'bg-blue-100 text-[#2563EB] border-blue-200 font-semibold'
          }

          const Icone = etapa.icone

          return (
            <div
              key={etapa.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 bg-white ${
                isConcluida
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : 'border-[#E2E8F0] hover:border-[#CBD5E1] shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3.5 sm:gap-4">
                {/* Checkbox */}
                <div className="pt-0.5">
                  <Checkbox
                    id={`etapa-${etapa.id}`}
                    checked={isConcluida}
                    onCheckedChange={(checked) => handleToggleConcluida(etapa.id, Boolean(checked))}
                    className="h-5 w-5 rounded border-[#CBD5E1] data-[state=checked]:bg-[#16A34A] data-[state=checked]:border-[#16A34A]"
                    aria-label={`Marcar etapa ${etapa.titulo}`}
                  />
                </div>

                {/* Ícone da etapa */}
                <div
                  className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0 ${
                    isConcluida
                      ? 'bg-emerald-100 text-[#16A34A]'
                      : isClicada
                        ? 'bg-blue-100 text-[#2563EB]'
                        : 'bg-slate-100 text-[#64748B]'
                  }`}
                >
                  <Icone className="w-5 h-5" />
                </div>

                {/* Conteúdo textual */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={`etapa-${etapa.id}`}
                      className={`text-sm sm:text-base font-bold cursor-pointer transition-colors ${
                        isConcluida
                          ? 'text-[#0F172A] line-through text-opacity-70'
                          : 'text-[#0F172A]'
                      }`}
                    >
                      {idx + 1}. {etapa.titulo}
                    </label>
                    <Badge
                      variant="outline"
                      className={`text-[11px] py-0 px-2 ${statusBadgeClass}`}
                    >
                      {statusLabel}
                    </Badge>
                  </div>

                  <p
                    className={`text-xs sm:text-sm text-[#64748B] leading-relaxed ${
                      isConcluida ? 'text-opacity-70' : ''
                    }`}
                  >
                    {etapa.descricao}
                  </p>

                  {/* Botão/Link para a tela correspondente */}
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleNavegarEtapa(etapa)}
                      className="h-8 px-3 text-xs text-[#0F172A] hover:text-[#16A34A] hover:bg-emerald-50 border-[#E2E8F0] gap-1.5 font-semibold"
                    >
                      <span>Acessar tela</span>
                      <ExternalLink className="w-3 h-3 text-[#64748B]" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
