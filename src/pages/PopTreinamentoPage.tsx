import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AbaProcedimentos } from '@/components/pop/AbaProcedimentos'
import { AbaTreinamento } from '@/components/pop/AbaTreinamento'
import { BookOpen, GraduationCap, ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PopTreinamentoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const isObrigatorioParam = searchParams.get('treinamento') === 'obrigatorio'
  const isCeo = user?.perfil === 'ceo_financeiro'

  // Se for obrigatório e NÃO for CEO, a aba Procedimentos deve ficar oculta
  const bloquearAbaProcedimentos = isObrigatorioParam && !isCeo

  // Aba ativa: se bloquear procedimentos, forçamos 'treinamento'
  const [abaAtiva, setAbaAtiva] = useState<'procedimentos' | 'treinamento'>(() => {
    const tabUrl = searchParams.get('tab')
    if (tabUrl === 'treinamento' || isObrigatorioParam) {
      return 'treinamento'
    }
    return 'procedimentos'
  })

  // Sincroniza se os searchParams mudarem
  useEffect(() => {
    if (bloquearAbaProcedimentos) {
      setAbaAtiva('treinamento')
    } else {
      const tabUrl = searchParams.get('tab')
      if (tabUrl === 'treinamento') {
        setAbaAtiva('treinamento')
      } else if (tabUrl === 'procedimentos') {
        setAbaAtiva('procedimentos')
      }
    }
  }, [searchParams, bloquearAbaProcedimentos])

  const alternarAba = (novaAba: 'procedimentos' | 'treinamento') => {
    if (bloquearAbaProcedimentos && novaAba === 'procedimentos') {
      return
    }
    setAbaAtiva(novaAba)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('tab', novaAba)
    setSearchParams(newParams, { replace: true })
  }

  const handleConcluir = () => {
    // Remove parâmetro obrigatório e redireciona ao painel
    navigate('/painel', { replace: true })
  }

  return (
    <div className="space-y-6">
      {/* Banner de Boas-vindas / Contexto do Módulo */}
      <div className="bg-gradient-to-r from-emerald-700 via-[#16A34A] to-blue-700 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Base de Conhecimento & Capacitação</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              POP & Treinamento
            </h1>
            <p className="text-sm sm:text-base text-white/90">
              Procedimentos Operacionais Padrão e trilhas interativas de capacitação da equipe
              Colesel 45.
            </p>
          </div>

          {!user && (
            <div className="flex-shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/')}
                className="bg-white text-[#0F172A] hover:bg-slate-100 font-semibold gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao Login
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Se for obrigatório para o CEO, banner explicativo de que ele pode revisar procedimentos */}
      {isObrigatorioParam && isCeo && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="text-sm">
            <strong className="font-semibold block">Visão de Administrador (CEO)</strong>
            <span className="text-blue-700 text-xs">
              Como administrador, você tem acesso irrestrito para revisar a aba de Procedimentos e
              simular o treinamento do time.
            </span>
          </div>
        </div>
      )}

      {/* Abas Superiores (Procedimentos / Treinamento) */}
      <div className="border-b border-[#E2E8F0] flex items-center justify-between">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Aba Procedimentos: Oculta se não for CEO no modo obrigatório */}
          {!bloquearAbaProcedimentos && (
            <button
              type="button"
              onClick={() => alternarAba('procedimentos')}
              className={[
                'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all duration-150',
                abaAtiva === 'procedimentos'
                  ? 'border-[#16A34A] text-[#16A34A]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-[#CBD5E1]',
              ].join(' ')}
            >
              <BookOpen className="w-4 h-4" />
              <span>Procedimentos (POPs)</span>
            </button>
          )}

          {/* Aba Treinamento */}
          <button
            type="button"
            onClick={() => alternarAba('treinamento')}
            className={[
              'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all duration-150',
              abaAtiva === 'treinamento'
                ? 'border-[#16A34A] text-[#16A34A]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:border-[#CBD5E1]',
            ].join(' ')}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Treinamento Interativo</span>
            {isObrigatorioParam && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                Obrigatório
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba Selecionada */}
      <div>
        {abaAtiva === 'procedimentos' && !bloquearAbaProcedimentos && <AbaProcedimentos />}

        {abaAtiva === 'treinamento' && (
          <AbaTreinamento modoObrigatorio={isObrigatorioParam} aoConcluir={handleConcluir} />
        )}
      </div>
    </div>
  )
}

export default PopTreinamentoPage
