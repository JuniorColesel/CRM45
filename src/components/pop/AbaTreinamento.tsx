import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SLIDES_TREINAMENTO, type SlideTreinamento } from '@/data/popTreinamentoData'
import {
  registrarTreinamentoConcluido,
  VERSAO_TREINAMENTO_ATUAL,
} from '@/services/treinamentoService'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  FastForward,
  CheckCircle2,
  Lightbulb,
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Layers,
  Compass,
  BarChart3,
  CheckSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface AbaTreinamentoProps {
  modoObrigatorio?: boolean
  aoConcluir?: () => void
}

export function AbaTreinamento({ modoObrigatorio = false, aoConcluir }: AbaTreinamentoProps) {
  const [slideAtual, setSlideAtual] = useState(0) // 0-indexed (slide 1 é índice 0)
  const [salvandoConclusao, setSalvandoConclusao] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const totalSlides = SLIDES_TREINAMENTO.length
  const slideCorrente: SlideTreinamento = SLIDES_TREINAMENTO[slideAtual]
  const isPrimeiroSlide = slideAtual === 0
  const isUltimoSlide = slideAtual === totalSlides - 1

  const porcentagemProgresso = Math.round(((slideAtual + 1) / totalSlides) * 100)

  const handleProximo = () => {
    if (slideAtual < totalSlides - 1) {
      setSlideAtual((prev) => prev + 1)
    }
  }

  const handleAnterior = () => {
    if (slideAtual > 0) {
      setSlideAtual((prev) => prev - 1)
    }
  }

  const handleReiniciar = () => {
    setSlideAtual(0)
  }

  const handlePularIntroducao = () => {
    // Requisito: "Botão 'Pular introdução' que vai direto ao slide 1 (para quem já conhece o sistema)"
    // No array 0-indexed, slide 1 é índice 0. Garantimos que fica no slide 1.
    setSlideAtual(0)
    toast({
      title: 'Slide 1 — Introdução',
      description: 'Você está no início do módulo de treinamento.',
    })
  }

  const handleConcluirTreinamento = async () => {
    setSalvandoConclusao(true)
    try {
      if (user?.id) {
        await registrarTreinamentoConcluido(user.id, VERSAO_TREINAMENTO_ATUAL)
      } else {
        // Modo visitante sem login
        localStorage.setItem(
          `treinamento_concluido_anonimo`,
          JSON.stringify({ concluido: true, versao: VERSAO_TREINAMENTO_ATUAL }),
        )
      }

      toast({
        title: 'Treinamento concluído com sucesso!',
        description: 'Seu acesso ao Colesel CRM foi liberado.',
      })

      if (aoConcluir) {
        aoConcluir()
      } else {
        navigate('/painel', { replace: true })
      }
    } catch (err) {
      console.error('Erro ao concluir treinamento:', err)
      toast({
        title: 'Sucesso',
        description: 'Treinamento finalizado. Redirecionando para o Painel...',
      })
      navigate('/painel', { replace: true })
    } finally {
      setSalvandoConclusao(false)
    }
  }

  // Cores e ícones temáticos por módulo
  const getModuloBadge = (moduloNum: number) => {
    switch (moduloNum) {
      case 1:
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dot: 'bg-emerald-500',
          icon: <Layers className="w-3.5 h-3.5 text-emerald-600" />,
        }
      case 2:
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          dot: 'bg-blue-500',
          icon: <Compass className="w-3.5 h-3.5 text-blue-600" />,
        }
      case 3:
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          dot: 'bg-indigo-500',
          icon: <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />,
        }
      case 4:
        return {
          bg: 'bg-amber-50 text-amber-900 border-amber-200',
          dot: 'bg-amber-500',
          icon: <CheckSquare className="w-3.5 h-3.5 text-amber-600" />,
        }
      default:
        return {
          bg: 'bg-slate-50 text-slate-800 border-slate-200',
          dot: 'bg-slate-500',
          icon: <BookOpen className="w-3.5 h-3.5 text-slate-600" />,
        }
    }
  }

  const getSlideIcon = (num: number) => {
    if (num === 1) {
      return <Sparkles className="w-8 h-8 text-[#16A34A]" />
    }
    if (num === 18) {
      return <CheckCircle2 className="w-8 h-8 text-[#16A34A]" />
    }
    if (num <= 4) {
      return <Layers className="w-8 h-8 text-[#16A34A]" />
    }
    if (num <= 10) {
      return <Compass className="w-8 h-8 text-[#2563EB]" />
    }
    if (num <= 15) {
      return <BarChart3 className="w-8 h-8 text-[#4F46E5]" />
    }
    return <CheckSquare className="w-8 h-8 text-[#D97706]" />
  }

  const moduloBadge = getModuloBadge(slideCorrente.moduloNumero)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Banner de Obrigatoriedade (se modoObrigatorio estiver ativo) */}
      {modoObrigatorio && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 shadow-sm animate-fade-in-fast">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="text-sm">
            <strong className="font-semibold block">
              Treinamento obrigatório — complete para acessar o sistema
            </strong>
            <span className="text-amber-700 text-xs">
              Para garantir a qualidade dos processos no CRM Colesel 45, finalize os {totalSlides}{' '}
              passos abaixo para desbloquear seu acesso.
            </span>
          </div>
        </div>
      )}

      {/* Barra de Progresso e Ações Superiores */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[#0F172A] tracking-tight">
              Slide {slideAtual + 1} de {totalSlides}
            </span>
            <span className="text-xs text-[#64748B] font-medium">
              ({porcentagemProgresso}% concluído)
            </span>
            <span className="hidden sm:inline-block text-[#CBD5E1]">•</span>
            <span className="text-xs font-semibold text-[#334155] bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              {slideCorrente.modulo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handlePularIntroducao}
              className="text-xs text-[#64748B] hover:text-[#0F172A] h-8 px-2.5"
              title="Ir para o slide 1"
            >
              <FastForward className="w-3.5 h-3.5 mr-1 text-[#2563EB]" />
              Pular introdução
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReiniciar}
              className="text-xs border-[#E2E8F0] h-8 px-2.5"
              title="Reiniciar apresentação"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1 text-[#64748B]" />
              Reiniciar
            </Button>
          </div>
        </div>

        {/* Linha visual de progresso */}
        <Progress value={porcentagemProgresso} className="h-2 bg-[#F1F5F9]" />

        {/* Indicadores de slides (18 steps responsivos em grid/scroll) */}
        <div className="pt-2">
          <div className="grid grid-cols-9 sm:grid-cols-18 gap-1 sm:gap-1.5 justify-items-center">
            {SLIDES_TREINAMENTO.map((s, idx) => {
              const isPassado = idx < slideAtual
              const isAtual = idx === slideAtual

              return (
                <button
                  key={s.numero}
                  type="button"
                  onClick={() => setSlideAtual(idx)}
                  title={`Slide ${s.numero}: ${s.titulo} (${s.modulo})`}
                  aria-label={`Ir para o slide ${s.numero}`}
                  className={[
                    'w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[11px] font-bold flex items-center justify-center transition-all duration-150',
                    isAtual
                      ? 'bg-[#16A34A] text-white ring-4 ring-emerald-100 scale-110 shadow-sm'
                      : isPassado
                        ? 'bg-emerald-100 text-[#166534] hover:bg-emerald-200'
                        : 'bg-[#F1F5F9] text-[#94A3B8] hover:bg-[#E2E8F0]',
                  ].join(' ')}
                >
                  {s.numero}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Card Principal do Slide */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 sm:p-10 relative overflow-hidden min-h-[420px] flex flex-col justify-between">
        {/* Faixa decorativa superior */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#16A34A] via-[#2563EB] to-[#7C3AED]" />

        {/* Conteúdo Central do Slide */}
        <div className="space-y-6 pt-2">
          {/* Tag / Header do Módulo no topo do slide */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#F1F5F9]">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${moduloBadge.bg}`}
            >
              {moduloBadge.icon}
              <span>{slideCorrente.modulo}</span>
            </div>
            <span className="text-xs font-semibold text-[#64748B]">
              Slide {slideCorrente.numero} de {totalSlides}
            </span>
          </div>

          {/* Cabeçalho do Slide */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-[#E2E8F0] flex items-center justify-center shadow-inner flex-shrink-0">
              {getSlideIcon(slideCorrente.numero)}
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#16A34A] block mb-1">
                Passo {slideCorrente.numero} de {totalSlides}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
                {slideCorrente.titulo}
              </h2>
            </div>
          </div>

          {/* Corpo do Texto do Slide */}
          <div className="space-y-5">
            {/* Texto principal e/ou introdução */}
            {slideCorrente.conteudo && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 sm:p-6">
                <p className="text-base sm:text-lg text-[#1E293B] leading-relaxed font-normal">
                  {slideCorrente.conteudo}
                </p>
              </div>
            )}

            {/* Lista com itens (se houver) */}
            {slideCorrente.itensLista && slideCorrente.itensLista.length > 0 && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 sm:p-6">
                {slideCorrente.tipoLista === 'ordered' ? (
                  <ol className="space-y-2.5 list-none">
                    {slideCorrente.itensLista.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-sm sm:text-base text-[#1E293B]"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-[#166534] font-bold text-xs flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ul className="space-y-2 list-none">
                    {slideCorrente.itensLista.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-sm sm:text-base text-[#1E293B]"
                      >
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-[#16A34A] mt-2" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {slideCorrente.fechamento && (
                  <div className="mt-4 pt-3 border-t border-slate-200/80 text-sm font-medium text-[#475569] italic">
                    {slideCorrente.fechamento}
                  </div>
                )}
              </div>
            )}

            {/* Fechamento simples sem lista (se houver) */}
            {!slideCorrente.itensLista && slideCorrente.fechamento && (
              <p className="text-sm font-medium text-[#475569] italic">
                {slideCorrente.fechamento}
              </p>
            )}

            {/* Box destacado de "Exemplo prático" */}
            {slideCorrente.exemploPratico && (
              <div className="bg-amber-50/80 border-2 border-amber-200/80 rounded-xl p-5 sm:p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Lightbulb className="w-5 h-5 text-amber-700" />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block">
                      Exemplo prático
                    </span>
                    <p className="text-sm sm:text-base text-amber-950 leading-relaxed font-normal">
                      {slideCorrente.exemploPratico}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controles de Navegação Inferiores */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 mt-6 border-t border-[#E2E8F0]">
          {/* Botão Anterior */}
          <Button
            type="button"
            variant="outline"
            onClick={handleAnterior}
            disabled={isPrimeiroSlide}
            className="w-full sm:w-auto border-[#CBD5E1] text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4 mr-1.5" />
            Anterior
          </Button>

          {/* Contador central informativo */}
          <div className="text-xs text-[#64748B] font-medium">
            Etapa {slideAtual + 1} de {totalSlides}
          </div>

          {/* Botão Próximo / Concluir */}
          {isUltimoSlide ? (
            <Button
              type="button"
              onClick={handleConcluirTreinamento}
              disabled={salvandoConclusao}
              className="w-full sm:w-auto bg-[#16A34A] hover:bg-[#15803D] text-white font-bold shadow-md px-6 py-2.5 h-auto transition-transform active:scale-95"
            >
              {salvandoConclusao ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando conclusão...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Concluir treinamento
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleProximo}
              className="w-full sm:w-auto bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold shadow-sm px-6"
            >
              <span>Próximo</span>
              <ChevronRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Dica de usabilidade */}
      <div className="text-center text-xs text-[#64748B] flex items-center justify-center gap-1.5">
        <ArrowRight className="w-3.5 h-3.5 text-[#16A34A]" />
        <span>
          Dica: você pode avançar ou retroceder a qualquer momento clicando nas etapas acima.
        </span>
      </div>
    </div>
  )
}
