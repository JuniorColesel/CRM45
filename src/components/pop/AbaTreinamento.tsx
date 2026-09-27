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
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  Loader2,
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

  // Ícones dinâmicos temáticos para dar um acabamento profissional
  const getSlideIcon = (num: number) => {
    switch (num) {
      case 1:
        return <Sparkles className="w-8 h-8 text-[#16A34A]" />
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
        return <BookOpen className="w-8 h-8 text-[#2563EB]" />
      case 10:
        return <CheckCircle2 className="w-8 h-8 text-[#16A34A]" />
      default:
        return <BookOpen className="w-8 h-8 text-[#16A34A]" />
    }
  }

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
              Para garantir a qualidade dos processos no CRM Colesel 45, finalize os 10 passos
              abaixo para desbloquear seu acesso.
            </span>
          </div>
        </div>
      )}

      {/* Barra de Progresso e Ações Superiores */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0F172A] tracking-tight">
              Slide {slideAtual + 1} de {totalSlides}
            </span>
            <span className="text-xs text-[#64748B] font-medium">
              ({porcentagemProgresso}% concluído)
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

        {/* Indicadores de slides (bolinhas/steps) */}
        <div className="flex items-center justify-between pt-1 px-1">
          {SLIDES_TREINAMENTO.map((s, idx) => {
            const isPassado = idx < slideAtual
            const isAtual = idx === slideAtual

            return (
              <button
                key={s.numero}
                type="button"
                onClick={() => setSlideAtual(idx)}
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

      {/* Card Principal do Slide */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6 sm:p-10 relative overflow-hidden min-h-[360px] flex flex-col justify-between">
        {/* Faixa decorativa superior */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#16A34A] via-[#2563EB] to-[#7C3AED]" />

        {/* Conteúdo Central do Slide */}
        <div className="space-y-6 pt-2">
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
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-6 sm:p-8">
            <p className="text-base sm:text-lg text-[#1E293B] leading-relaxed font-normal">
              {slideCorrente.conteudo}
            </p>
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
