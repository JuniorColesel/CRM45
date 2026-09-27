import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TrendingUp, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function Index() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login } = useAuth()

  // Se já autenticado, redireciona para /painel
  useEffect(() => {
    if (user) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/painel'
      navigate(from, { replace: true })
    }
  }, [user, navigate, location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos para continuar.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const loggedUser = await login(email.trim(), password)
      if (loggedUser.ativo === false) {
        setError('Usuário inativo. Entre em contato com o administrador.')
        return
      }
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/painel'
      navigate(from, { replace: true })
    } catch {
      setError('E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col md:flex-row antialiased font-sans">
      {/* Lado esquerdo: painel visual com gradiente verde-azul (#16A34A → #2563EB) */}
      <div className="relative overflow-hidden md:w-1/2 bg-gradient-to-br from-[#16A34A] via-[#108940] to-[#2563EB] text-white flex flex-col justify-between p-8 sm:p-12 md:p-16">
        {/* Círculos translúcidos decorativos */}
        <div
          className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-2xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-white/10 blur-xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-blue-400/20 blur-2xl"
          aria-hidden="true"
        />

        {/* Topo: Logo Colesel 45 */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white shadow-lg">
            <TrendingUp className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="font-extrabold text-2xl tracking-tight leading-none block">
              Colesel 45
            </span>
            <span className="text-xs text-white/80 font-medium">CRM Comercial</span>
          </div>
        </div>

        {/* Centro: Título e subtítulo */}
        <div className="relative z-10 my-10 md:my-auto max-w-md">
          <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-semibold tracking-wider uppercase mb-4 border border-white/20">
            Força de Vendas
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight mb-4">
            CRM Comercial
          </h1>
          <p className="text-white/90 text-base sm:text-lg leading-relaxed">
            Gestão de vendas para a equipe Colesel 45
          </p>
        </div>

        {/* Rodapé da coluna visual */}
        <div className="relative z-10 text-xs text-white/70">
          Plataforma de alta produtividade comercial © {new Date().getFullYear()} Colesel 45
        </div>
      </div>

      {/* Lado direito: card de formulário de login */}
      <div className="md:w-1/2 flex items-center justify-center p-6 sm:p-10 md:p-12 lg:p-16">
        <div
          className="w-full max-w-[440px] bg-white rounded-[16px] p-8 sm:p-10 border border-[#E2E8F0] animate-fade-in-up"
          style={{
            boxShadow: '0px 10px 30px rgba(15, 23, 42, 0.08)',
          }}
        >
          {/* Cabeçalho do Card */}
          <div className="mb-8 text-left">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
              Bem-vindo de volta
            </h2>
            <p className="text-sm text-[#64748B] mt-1.5">Acesse sua conta</p>
          </div>

          {/* Mensagem de Erro (se houver) */}
          {error && (
            <div
              role="alert"
              className="mb-6 flex items-center gap-3 p-3.5 rounded-lg bg-red-50 border border-red-200 text-[#DC2626] text-sm animate-fade-in-fast"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Campo E-mail */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) setError(null)
                  }}
                  placeholder="seu@email.com"
                  className="w-full pl-11 pr-4 py-3 rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A] placeholder-[#64748B] text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError(null)
                  }}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A] placeholder-[#64748B] text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#64748B] hover:text-[#0F172A] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Botão Entrar */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-4 rounded-lg bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.98] text-white font-semibold text-sm shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <span>Entrar</span>
              )}
            </button>

            {/* Link Esqueceu a Senha e Link Ver Treinamento */}
            <div className="text-center pt-2 flex flex-col items-center gap-2">
              <button
                type="button"
                className="text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
                onClick={() => {
                  /* Link visual sem ação funcional conforme especificação */
                }}
              >
                Esqueceu a senha?
              </button>

              <div className="pt-2 border-t border-[#F1F5F9] w-full flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => navigate('/pop-treinamento')}
                  className="text-xs font-semibold text-[#16A34A] hover:text-[#15803D] hover:underline transition-colors flex items-center gap-1.5 py-1 px-3 rounded-md hover:bg-emerald-50"
                >
                  <span>Ver treinamento</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
