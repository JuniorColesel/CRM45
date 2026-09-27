import React, { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  verificarTreinamentoConcluido,
  VERSAO_TREINAMENTO_ATUAL,
} from '@/services/treinamentoService'

export const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [verificandoTreinamento, setVerificandoTreinamento] = useState(true)
  const [treinamentoConcluido, setTreinamentoConcluido] = useState<boolean | null>(null)

  useEffect(() => {
    let montado = true

    async function checarStatusTreinamento() {
      if (!user) {
        if (montado) {
          setVerificandoTreinamento(false)
        }
        return
      }

      // Exceção do requisito 5.d:
      // "perfis ceo_financeiro podem acessar a aba "Procedimentos" mesmo sem ter concluído o treinamento (para revisar conteúdo antes de treinar o time) — ou seja, o guard NÃO bloqueia o CEO"
      if (user.perfil === 'ceo_financeiro') {
        if (montado) {
          setTreinamentoConcluido(true)
          setVerificandoTreinamento(false)
        }
        return
      }

      try {
        const concluido = await verificarTreinamentoConcluido(user.id, VERSAO_TREINAMENTO_ATUAL)
        if (montado) {
          setTreinamentoConcluido(concluido)
        }
      } catch (err) {
        console.error('Erro ao verificar treinamento na rota protegida:', err)
        if (montado) {
          setTreinamentoConcluido(true) // Fallback defensivo
        }
      } finally {
        if (montado) {
          setVerificandoTreinamento(false)
        }
      }
    }

    if (!loading) {
      checarStatusTreinamento()
    }

    return () => {
      montado = false
    }
  }, [user, loading, location.pathname])

  if (loading || verificandoTreinamento) {
    return (
      <div className="min-h-screen w-full bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#16A34A] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#64748B]">Carregando sessão...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  // Se o usuário não concluiu o treinamento e não estiver em /pop-treinamento com ?treinamento=obrigatorio,
  // redireciona compulsoriamente para /pop-treinamento?treinamento=obrigatorio
  const searchParams = new URLSearchParams(location.search)
  const jaEstaNoTreinamentoObrigatorio =
    location.pathname === '/pop-treinamento' && searchParams.get('treinamento') === 'obrigatorio'

  if (treinamentoConcluido === false && !jaEstaNoTreinamentoObrigatorio) {
    return <Navigate to="/pop-treinamento?treinamento=obrigatorio" replace />
  }

  return <Outlet />
}
