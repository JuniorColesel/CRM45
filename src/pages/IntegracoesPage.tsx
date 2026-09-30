import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Plug,
  ExternalLink,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  Lock,
  MessageSquare,
  Mail,
  Send,
  Layers,
  Info,
  Server,
  KeyRound,
  ShieldAlert,
  Bot,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  Loader2,
  RefreshCw,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PROMPT_IA_PADRAO, type AssistenteIaConfig } from '@/types/conversas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface ConfigsBackendResponse {
  bling_token_mascarado: string
  tem_bling_token: boolean
  whatsapp_token_mascarado: string
  tem_whatsapp_token: boolean
  whatsapp_provedor: string
  whatsapp_telefone: string
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_password_mascarada: string
  tem_smtp_password: boolean
  gateway_sms: string
  ia_api_key_mascarada: string
  tem_ia_api_key: boolean
  ia_ativo: boolean
  ia_permitir_preco: boolean
  ia_tom_de_voz: 'profissional' | 'amigavel' | 'direto'
  ia_prompt_sistema: string
}

export default function IntegracoesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perfil = user?.perfil

  // Acesso permitido APENAS a ceo_financeiro e coordenador_vendas
  const podeAcessar = perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas'
  const isCeo = perfil === 'ceo_financeiro'

  // Carregamento inicial do backend
  const [carregando, setCarregando] = useState(true)
  const [salvandoBling, setSalvandoBling] = useState(false)
  const [salvandoWhatsapp, setSalvandoWhatsapp] = useState(false)
  const [salvandoEmailSms, setSalvandoEmailSms] = useState(false)
  const [salvandoIa, setSalvandoIa] = useState(false)

  // ==========================================
  // ESTADO: SEÇÃO A - BLING (OAuth v3 + Sincronização)
  // ==========================================
  const [blingToken, setBlingToken] = useState<string>('')
  const [showBlingToken, setShowBlingToken] = useState(false)
  const [temBlingSalvo, setTemBlingSalvo] = useState(false)
  const [sincronizandoBling, setSincronizandoBling] = useState(false)
  const [iniciandoConexaoBling, setIniciandoConexaoBling] = useState(false)
  const [desconectandoBling, setDesconectandoBling] = useState(false)
  const [mostrarTokenLegado, setMostrarTokenLegado] = useState(false)
  const [blingStatusData, setBlingStatusData] = useState<{
    conectado: boolean
    status: 'conectado' | 'desconectado' | 'erro_renovacao' | string
    configurado_no_servidor: boolean
    tipo_autenticacao: string
    expires_at: string | null
    ultima_renovacao: string | null
    ultimo_erro: string | null
  }>({
    conectado: false,
    status: 'desconectado',
    configurado_no_servidor: false,
    tipo_autenticacao: 'nenhum',
    expires_at: null,
    ultima_renovacao: null,
    ultimo_erro: null,
  })
  const [resultadoSync, setResultadoSync] = useState<{
    iniciado_em: string
    finalizado_em: string
    duracao_ms: number
    clientes_consultados: number
    clientes_criados: number
    clientes_atualizados: number
    clientes_ignorados: number
    pedidos_consultados: number
    clientes_com_compras_atualizadas: number
    erros: string[]
    status: string
    mensagem: string
  } | null>(null)

  // ==========================================
  // ESTADO: SEÇÃO B - WHATSAPP / META
  // ==========================================
  const [whatsappProvedor, setWhatsappProvedor] = useState('zenvia')
  const [whatsappTelefone, setWhatsappTelefone] = useState('')
  const [whatsappToken, setWhatsappToken] = useState('')
  const [showWhatsappToken, setShowWhatsappToken] = useState(false)
  const [temWhatsappSalvo, setTemWhatsappSalvo] = useState(false)

  // ==========================================
  // ESTADO: SEÇÃO C - EMAIL / SMS
  // ==========================================
  const [smtpServidor, setSmtpServidor] = useState('')
  const [smtpPorta, setSmtpPorta] = useState('587')
  const [smtpUsuario, setSmtpUsuario] = useState('')
  const [smtpSenha, setSmtpSenha] = useState('')
  const [showSmtpSenha, setShowSmtpSenha] = useState(false)
  const [temSmtpSenhaSalva, setTemSmtpSenhaSalva] = useState(false)
  const [gatewaySms, setGatewaySms] = useState('zenvia')

  // ==========================================
  // ESTADO: SEÇÃO D - ASSISTENTE IA
  // ==========================================
  const [iaConfig, setIaConfig] = useState<AssistenteIaConfig>({
    ativo: true,
    permitirPreco: true,
    tomDeVoz: 'profissional',
    promptSistema: PROMPT_IA_PADRAO,
  })

  // Carregar status da conexão Bling OAuth
  const carregarBlingStatus = useCallback(async () => {
    try {
      const resStatus = await pb.send<
        Partial<{
          conectado: boolean
          status: string
          configurado_no_servidor: boolean
          tipo_autenticacao: string
          expires_at: string | null
          ultima_renovacao: string | null
          ultimo_erro: string | null
        }>
      >('/backend/v1/bling/status', {
        method: 'GET',
      })
      if (resStatus && typeof resStatus === 'object') {
        setBlingStatusData({
          conectado: Boolean(resStatus.conectado),
          status: resStatus.status || 'desconectado',
          configurado_no_servidor: Boolean(resStatus.configurado_no_servidor),
          tipo_autenticacao: resStatus.tipo_autenticacao || 'nenhum',
          expires_at: resStatus.expires_at || null,
          ultima_renovacao: resStatus.ultima_renovacao || null,
          ultimo_erro: resStatus.ultimo_erro || null,
        })
      }
    } catch (_) {
      // Falha silenciosa no status para não bloquear a página
    }
  }, [])

  // Carregar configurações reais do backend (com máscaras para campos sensíveis)
  const carregarConfiguracoes = useCallback(async () => {
    try {
      setCarregando(true)
      const res = await pb.send<ConfigsBackendResponse>('/backend/v1/integracoes/config', {
        method: 'GET',
      })

      if (res) {
        // Bling
        setBlingToken(res.bling_token_mascarado || '')
        setTemBlingSalvo(res.tem_bling_token)

        // WhatsApp
        setWhatsappProvedor(res.whatsapp_provedor || 'zenvia')
        setWhatsappTelefone(res.whatsapp_telefone || '')
        setWhatsappToken(res.whatsapp_token_mascarado || '')
        setTemWhatsappSalvo(res.tem_whatsapp_token)

        // SMTP
        setSmtpServidor(res.smtp_host || '')
        setSmtpPorta(res.smtp_port || '587')
        setSmtpUsuario(res.smtp_user || '')
        setSmtpSenha(res.smtp_password_mascarada || '')
        setTemSmtpSenhaSalva(res.tem_smtp_password)
        setGatewaySms(res.gateway_sms || 'zenvia')

        // IA
        setIaConfig({
          ativo: res.ia_ativo !== false,
          permitirPreco: res.ia_permitir_preco !== false,
          tomDeVoz: res.ia_tom_de_voz || 'profissional',
          promptSistema: res.ia_prompt_sistema || PROMPT_IA_PADRAO,
        })
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar configurações de integração',
        description: getErrorMessage(err),
      })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (podeAcessar) {
      carregarConfiguracoes()
      carregarBlingStatus()
    }
  }, [podeAcessar, carregarConfiguracoes, carregarBlingStatus])

  // Listener para quando a janela de autorização do Bling for fechada ou foco retornar
  useEffect(() => {
    const handleFocus = () => {
      if (iniciandoConexaoBling) {
        setIniciandoConexaoBling(false)
        carregarBlingStatus()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [iniciandoConexaoBling, carregarBlingStatus])

  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/configuracoes')
    }
  }

  // ==========================================
  // HANDLER: INICIAR FLUXO OAUTH BLING
  // ==========================================
  const handleConectarBlingOAuth = async () => {
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode conectar o CRM ao Bling.',
      })
      return
    }

    try {
      setIniciandoConexaoBling(true)
      const res = await pb.send<{
        success: boolean
        auth_url?: string
        message?: string
        configurado?: boolean
      }>('/backend/v1/bling/connect?format=json', {
        method: 'GET',
      })

      if (res && res.success && res.auth_url) {
        // Abrir janela popup centralizada para autorização segura no Bling
        const width = 650
        const height = 750
        const left = Math.max(0, (window.screen.width - width) / 2)
        const top = Math.max(0, (window.screen.height - height) / 2)

        const authWindow = window.open(
          res.auth_url,
          'oauth_bling_popup',
          `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no`,
        )

        if (authWindow) {
          authWindow.focus()
          toast({
            title: 'Aguardando autorização no Bling',
            description: 'Conclua a autorização na janela aberta e retorne ao CRM.',
          })
        } else {
          // Se popup foi bloqueado pelo navegador, redirecionar na própria aba
          window.location.href = res.auth_url
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Não configurado no servidor',
          description:
            res?.message ||
            'Segredos do Bling (BLING_CLIENT_ID / BLING_CLIENT_SECRET) ainda não configurados.',
        })
        setIniciandoConexaoBling(false)
      }
    } catch (err: unknown) {
      setIniciandoConexaoBling(false)
      toast({
        variant: 'destructive',
        title: 'Falha ao iniciar conexão OAuth',
        description: getErrorMessage(err),
      })
    }
  }

  // ==========================================
  // HANDLER: DESCONECTAR BLING
  // ==========================================
  const handleDesconectarBling = async () => {
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode desconectar a integração.',
      })
      return
    }

    if (!confirm('Deseja realmente desconectar a integração com o Bling ERP?')) {
      return
    }

    try {
      setDesconectandoBling(true)
      const res = await pb.send<{ success: boolean; message: string }>(
        '/backend/v1/bling/disconnect',
        { method: 'POST' },
      )
      if (res && res.success) {
        toast({
          title: 'Bling desconectado',
          description: 'A autorização foi revogada com sucesso no backend.',
        })
        await carregarBlingStatus()
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao desconectar',
        description: getErrorMessage(err),
      })
    } finally {
      setDesconectandoBling(false)
    }
  }

  // ==========================================
  // HANDLER: SINCRONIZAR BLING (SOMENTE LEITURA NO BLING)
  // ==========================================
  const handleSincronizarBling = async () => {
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode disparar a sincronização do Bling.',
      })
      return
    }

    if (!blingStatusData.conectado && !temBlingSalvo && !blingToken) {
      toast({
        variant: 'destructive',
        title: 'Bling desconectado',
        description: 'Conecte sua conta Bling via OAuth antes de disparar a sincronização.',
      })
      return
    }

    try {
      setSincronizandoBling(true)
      setResultadoSync(null)

      const res = await pb.send<{
        success: boolean
        status: string
        iniciado_em: string
        finalizado_em: string
        duracao_ms: number
        clientes_consultados: number
        clientes_criados: number
        clientes_atualizados: number
        clientes_ignorados: number
        pedidos_consultados: number
        clientes_com_compras_atualizadas: number
        erros: string[]
        mensagem: string
      }>('/backend/v1/bling/sincronizar', {
        method: 'POST',
      })

      if (res) {
        setResultadoSync(res)
        if (res.success) {
          toast({
            title: 'Sincronização com Bling concluída',
            description: `${res.clientes_consultados} clientes e ${res.pedidos_consultados} pedidos processados.`,
          })
          carregarBlingStatus()
        } else {
          toast({
            variant: 'destructive',
            title: 'Aviso na sincronização do Bling',
            description: res.mensagem || 'Houve falhas no processamento.',
          })
        }
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao sincronizar com o Bling ERP',
        description: msg,
      })
      setResultadoSync({
        iniciado_em: new Date().toISOString(),
        finalizado_em: new Date().toISOString(),
        duracao_ms: 0,
        clientes_consultados: 0,
        clientes_criados: 0,
        clientes_atualizados: 0,
        clientes_ignorados: 0,
        pedidos_consultados: 0,
        clientes_com_compras_atualizadas: 0,
        erros: [msg],
        status: 'erro',
        mensagem: 'Falha na conexão com o serviço: ' + msg,
      })
    } finally {
      setSincronizandoBling(false)
    }
  }

  // ==========================================
  // HANDLERS DE SALVAR NO BACKEND PROTEGIDO
  // ==========================================
  const handleSalvarBling = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode alterar credenciais de integrações.',
      })
      return
    }

    try {
      setSalvandoBling(true)
      const res = await pb.send<ConfigsBackendResponse>('/backend/v1/integracoes/config', {
        method: 'POST',
        body: JSON.stringify({
          bling_token: blingToken,
        }),
      })

      if (res) {
        setBlingToken(res.bling_token_mascarado || '')
        setTemBlingSalvo(res.tem_bling_token)
        toast({
          title: 'Integração Bling salva no servidor',
          description: 'O token da API do Bling foi armazenado com segurança no backend.',
        })
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar token do Bling',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoBling(false)
    }
  }

  const handleSalvarWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode alterar credenciais de integrações.',
      })
      return
    }

    try {
      setSalvandoWhatsapp(true)
      const res = await pb.send<ConfigsBackendResponse>('/backend/v1/integracoes/config', {
        method: 'POST',
        body: JSON.stringify({
          whatsapp_token: whatsappToken,
          whatsapp_provedor: whatsappProvedor,
          whatsapp_telefone: whatsappTelefone,
        }),
      })

      if (res) {
        setWhatsappToken(res.whatsapp_token_mascarado || '')
        setTemWhatsappSalvo(res.tem_whatsapp_token)
        setWhatsappProvedor(res.whatsapp_provedor || 'zenvia')
        setWhatsappTelefone(res.whatsapp_telefone || '')
        toast({
          title: 'Configurações de WhatsApp salvas no servidor',
          description: 'Credenciais protegidas no backend com isolamento seguro.',
        })
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar WhatsApp',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoWhatsapp(false)
    }
  }

  const handleSalvarEmailSms = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode alterar credenciais de integrações.',
      })
      return
    }

    try {
      setSalvandoEmailSms(true)
      const res = await pb.send<ConfigsBackendResponse>('/backend/v1/integracoes/config', {
        method: 'POST',
        body: JSON.stringify({
          smtp_host: smtpServidor,
          smtp_port: smtpPorta,
          smtp_user: smtpUsuario,
          smtp_password: smtpSenha,
          gateway_sms: gatewaySms,
        }),
      })

      if (res) {
        setSmtpSenha(res.smtp_password_mascarada || '')
        setTemSmtpSenhaSalva(res.tem_smtp_password)
        setSmtpServidor(res.smtp_host || '')
        setSmtpPorta(res.smtp_port || '587')
        setSmtpUsuario(res.smtp_user || '')
        setGatewaySms(res.gateway_sms || 'zenvia')
        toast({
          title: 'Servidores de E-mail/SMS salvos no servidor',
          description: 'Credenciais gravadas na coleção segura do backend.',
        })
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar E-mail/SMS',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoEmailSms(false)
    }
  }

  const handleSalvarIaConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode alterar configurações de integrações.',
      })
      return
    }

    try {
      setSalvandoIa(true)
      const res = await pb.send<ConfigsBackendResponse>('/backend/v1/integracoes/config', {
        method: 'POST',
        body: JSON.stringify({
          ia_ativo: iaConfig.ativo,
          ia_permitir_preco: iaConfig.permitirPreco,
          ia_tom_de_voz: iaConfig.tomDeVoz,
          ia_prompt_sistema: iaConfig.promptSistema,
        }),
      })

      if (res) {
        setIaConfig({
          ativo: res.ia_ativo,
          permitirPreco: res.ia_permitir_preco,
          tomDeVoz: res.ia_tom_de_voz || 'profissional',
          promptSistema: res.ia_prompt_sistema || PROMPT_IA_PADRAO,
        })
        toast({
          title: 'Assistente de IA configurado no servidor',
          description: 'Preferências salvas no backend com sucesso.',
        })
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar configurações da IA',
        description: getErrorMessage(err),
      })
    } finally {
      setSalvandoIa(false)
    }
  }

  const handleRestaurarPromptPadrao = () => {
    setIaConfig((prev) => ({ ...prev, promptSistema: PROMPT_IA_PADRAO }))
    toast({
      title: 'Prompt padrão restaurado',
      description: 'O texto original do prompt de vendas Colesel 45 foi restabelecido.',
    })
  }

  // Se perfil NÃO for ceo_financeiro nem coordenador_vendas
  if (!podeAcessar) {
    return (
      <div className="space-y-6 animate-fade-in pb-12 max-w-4xl mx-auto">
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
                A gestão e visualização de credenciais de integrações é restrita aos perfis{' '}
                <strong>CEO / Financeiro</strong> e <strong>Coordenador de Vendas</strong>.
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

  // Helper para formatar data/hora de diagnóstico com validação de NaN
  const formatarDataDiagnostico = (valor: string | null | undefined, fallback: string): string => {
    if (!valor || typeof valor !== 'string' || !valor.trim()) {
      return fallback
    }
    const d = new Date(valor)
    if (isNaN(d.getTime())) {
      return fallback
    }
    return d.toLocaleString('pt-BR')
  }

  // Helper para formatar data/hora geral de ISO string com validação de NaN
  const formatarDataHora = (valor: string | null | undefined): string => {
    if (!valor || typeof valor !== 'string' || !valor.trim()) {
      return '—'
    }
    const d = new Date(valor)
    if (isNaN(d.getTime())) {
      return '—'
    }
    return d.toLocaleString('pt-BR')
  }

  // Status calculado de WhatsApp: Configurado se tiver token salvo e telefone preenchidos
  const isWhatsappConfigurado = Boolean(temWhatsappSalvo && (whatsappTelefone || '').trim())

  return (
    <div className="space-y-8 animate-fade-in pb-16 max-w-5xl mx-auto">
      {/* Topo com Botão Voltar e Cabeçalho */}
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
              className="bg-slate-100 text-[#0F172A] border-slate-300 text-xs font-semibold gap-1"
            >
              <Plug className="w-3 h-3 text-[#16A34A]" />
              Conexões Externas
            </Badge>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-semibold gap-1"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Segurança v0.0.30 (Backend Vault)
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1">
            Integrações do Sistema
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Todas as chaves de API e senhas residem exclusivamente no servidor seguro. O navegador
            apenas manipula valores mascarados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {carregando && (
            <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Carregando do servidor...</span>
            </div>
          )}
          <Badge
            variant="outline"
            className="text-xs text-slate-600 bg-white border-slate-200 py-1.5 px-3"
          >
            Acesso concedido: <strong>{user?.nome || 'Gestor'}</strong>
          </Badge>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SEÇÃO A: BLING ERP (OAuth v3 + Sincronização Read-Only) */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#16A34A] flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-bold text-[#0F172A]">1. Bling ERP</CardTitle>
                  {blingStatusData.conectado ? (
                    <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[11px] font-semibold gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Status: Conectado
                    </Badge>
                  ) : iniciandoConexaoBling ? (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-semibold gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Status: Aguardando autorização
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[11px] font-semibold">
                      Status: Desconectado
                    </Badge>
                  )}
                  {blingStatusData.conectado && (
                    <Badge variant="outline" className="text-[10px] text-emerald-800 bg-white">
                      OAuth v3 Seguro
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs text-[#64748B]">
                  Conexão oficial via OAuth 2.0 com a API v3 do Bling e sincronização somente
                  leitura.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={carregarBlingStatus}
                className="text-xs text-[#64748B] hover:text-[#0F172A] h-8 px-2.5 gap-1.5"
                title="Atualizar status da conexão"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar status</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* BLOCO A: CONEXÃO OAUTH */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
                    Conexão OAuth v3 com o Bling
                  </h4>
                </div>
                <p className="text-xs text-[#64748B]">
                  {blingStatusData.conectado
                    ? 'O CRM está conectado com segurança ao Bling ERP via tokens gerenciados no backend.'
                    : 'Autorize o CRM a consultar clientes e vendas no Bling.'}
                </p>
              </div>

              {isCeo && (
                <div className="flex flex-wrap items-center gap-2">
                  {!blingStatusData.conectado ? (
                    <Button
                      type="button"
                      onClick={handleConectarBlingOAuth}
                      disabled={iniciandoConexaoBling}
                      className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2 h-9 px-4"
                    >
                      {iniciandoConexaoBling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plug className="w-4 h-4" />
                      )}
                      {iniciandoConexaoBling ? 'Aguardando autorização...' : 'CONECTAR AO BLING'}
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        onClick={handleConectarBlingOAuth}
                        disabled={iniciandoConexaoBling}
                        variant="outline"
                        className="border-slate-300 text-[#0F172A] font-semibold text-xs shadow-2xs gap-1.5 h-9 px-3 hover:bg-slate-100"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        RECONECTAR
                      </Button>
                      <Button
                        type="button"
                        onClick={handleDesconectarBling}
                        disabled={desconectandoBling}
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs font-semibold h-9 px-3"
                      >
                        {desconectandoBling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : null}
                        DESCONECTAR
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Aviso quando os segredos ainda não existem no ambiente */}
            {!blingStatusData.configurado_no_servidor && !blingStatusData.conectado && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-950">
                    Segredos do Bling ainda não configurados no servidor:
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Para habilitar o fluxo oficial, configure os secrets{' '}
                    <code>BLING_CLIENT_ID</code>, <code>BLING_CLIENT_SECRET</code> e{' '}
                    <code>BLING_REDIRECT_URI</code> no backend. O CRM falhará de forma segura e não
                    expõe nenhuma credencial no navegador.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* BLOCO B: SINCRONIZAÇÃO */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-[#2563EB]" />
                  Motor de Sincronização Read-Only
                </h4>
                <p className="text-xs text-[#64748B]">
                  Executa a leitura paginada de clientes e vendas do Bling com deduplicação, de-para
                  de vendedores e atualização idempotente de histórico comercial.
                </p>
              </div>

              {isCeo && (
                <Button
                  type="button"
                  onClick={handleSincronizarBling}
                  disabled={sincronizandoBling || iniciandoConexaoBling}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs shadow-sm gap-2 h-9 px-4 flex-shrink-0"
                >
                  {sincronizandoBling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {sincronizandoBling ? 'Sincronizando com o Bling...' : 'SINCRONIZAR BLING'}
                </Button>
              )}
            </div>

            {/* Painel de Resultados da Sincronização Bling */}
            {sincronizandoBling && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-[#0F172A] flex items-center gap-3 animate-pulse">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-blue-900">
                    Processando sincronização com a API do Bling ERP...
                  </p>
                  <p className="text-[11px] text-blue-700">
                    Percorrendo páginas de contatos e pedidos de venda em modo{' '}
                    <strong>somente leitura (GET)</strong> através do token OAuth seguro.
                  </p>
                </div>
              </div>
            )}

            {resultadoSync && !sincronizandoBling && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-3 ${
                  resultadoSync.status === 'erro'
                    ? 'bg-red-50/80 border-red-200 text-red-950'
                    : resultadoSync.status === 'sucesso_parcial'
                      ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-black/5 pb-2">
                  <div className="flex items-center gap-2">
                    {resultadoSync.status === 'erro' ? (
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    )}
                    <span className="font-bold text-sm">
                      {resultadoSync.status === 'erro'
                        ? 'Falha na Sincronização'
                        : resultadoSync.status === 'sucesso_parcial'
                          ? 'Sincronização Concluída com Avisos'
                          : 'Sincronização Concluída com Sucesso'}
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-white">
                      {resultadoSync.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Duração: {Math.round(resultadoSync.duracao_ms / 1000)}s (
                      {resultadoSync.duracao_ms} ms)
                    </span>
                  </div>
                </div>

                {/* Resumo em cards métricos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                  <div className="bg-white/90 p-2.5 rounded-lg border border-black/5 shadow-2xs">
                    <span className="block text-[10px] text-[#64748B] font-semibold">
                      Clientes Consultados
                    </span>
                    <span className="text-base font-bold text-[#0F172A]">
                      {resultadoSync.clientes_consultados}
                    </span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-lg border border-black/5 shadow-2xs">
                    <span className="block text-[10px] text-emerald-700 font-semibold">
                      Clientes Criados
                    </span>
                    <span className="text-base font-bold text-emerald-700">
                      {resultadoSync.clientes_criados}
                    </span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-lg border border-black/5 shadow-2xs">
                    <span className="block text-[10px] text-blue-700 font-semibold">
                      Clientes Atualizados
                    </span>
                    <span className="text-base font-bold text-blue-700">
                      {resultadoSync.clientes_atualizados}
                    </span>
                  </div>
                  <div className="bg-white/90 p-2.5 rounded-lg border border-black/5 shadow-2xs">
                    <span className="block text-[10px] text-purple-700 font-semibold">
                      Pedidos Consultados
                    </span>
                    <span className="text-base font-bold text-purple-700">
                      {resultadoSync.pedidos_consultados}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1">
                  <div>
                    <strong>Clientes com vendas consolidadas:</strong>{' '}
                    {resultadoSync.clientes_com_compras_atualizadas} |{' '}
                    <strong>Clientes sem alterações:</strong> {resultadoSync.clientes_ignorados}
                  </div>
                  <div>
                    <strong>Data/Hora:</strong> {formatarDataHora(resultadoSync.finalizado_em)}
                  </div>
                </div>

                {resultadoSync.mensagem && (
                  <p className="text-[11px] text-[#334155] italic bg-white/60 p-2 rounded border border-black/5">
                    {resultadoSync.mensagem}
                  </p>
                )}

                {Array.isArray(resultadoSync.erros) && resultadoSync.erros.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-red-100/70 border border-red-200 text-[11px] text-red-900 space-y-1">
                    <p className="font-bold flex items-center gap-1 text-red-800">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Ocorrências ({resultadoSync.erros.length}):
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                      {resultadoSync.erros.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {resultadoSync.erros.length > 5 && (
                        <li>
                          + {resultadoSync.erros.length - 5} outras ocorrências registradas em log.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BLOCO C: DIAGNÓSTICO (EXCLUSIVO CEO) */}
          {isCeo && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                  Diagnóstico Seguro da Conexão (Somente CEO)
                </h4>
                <Badge variant="outline" className="text-[10px] bg-white text-slate-600">
                  Zero Tokens Expostos
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[10px] font-semibold text-[#64748B]">
                    Status da Conexão
                  </span>
                  <span className="font-bold text-[#0F172A] capitalize">
                    {blingStatusData.conectado ? 'Conectado (Ativo)' : blingStatusData.status}
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[10px] font-semibold text-[#64748B]">
                    Expiração do Access Token
                  </span>
                  <span className="font-mono text-xs text-[#0F172A]">
                    {formatarDataDiagnostico(blingStatusData.expires_at, 'Não aplicável')}
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="block text-[10px] font-semibold text-[#64748B]">
                    Última Renovação (Refresh)
                  </span>
                  <span className="font-mono text-xs text-[#0F172A]">
                    {formatarDataDiagnostico(
                      blingStatusData.ultima_renovacao,
                      'Nenhuma renovação registrada',
                    )}
                  </span>
                </div>
              </div>

              {blingStatusData.ultimo_erro && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900">
                  <strong>Último Erro Registrado:</strong> {blingStatusData.ultimo_erro}
                </div>
              )}

              {/* Seção retrátil para o Token Manual Legado (Deprecated) */}
              <div className="pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setMostrarTokenLegado(!mostrarTokenLegado)}
                  className="text-xs text-[#64748B] hover:text-[#0F172A] underline font-medium"
                >
                  {mostrarTokenLegado
                    ? 'Ocultar configurações do token manual (legado)'
                    : 'Visualizar token de API manual (legado / deprecated)'}
                </button>

                {mostrarTokenLegado && (
                  <form onSubmit={handleSalvarBling} className="space-y-3 pt-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="bling-token" className="text-xs font-bold text-[#0F172A]">
                        Token de API Legado (Bling) — Mascarado
                      </Label>
                      <div className="relative">
                        <Input
                          id="bling-token"
                          type={showBlingToken ? 'text' : 'password'}
                          value={blingToken}
                          onChange={(e) => setBlingToken(e.target.value)}
                          placeholder={
                            temBlingSalvo
                              ? 'Token legado já configurado'
                              : 'Cole aqui seu token antigo'
                          }
                          className="pr-10 h-9 text-xs font-mono bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBlingToken(!showBlingToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                        >
                          {showBlingToken ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-[#64748B]">
                        Mecanismo legado mantido para retrocompatibilidade. Recomendamos utilizar o
                        fluxo oficial de conexão OAuth acima.
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={salvandoBling}
                        variant="outline"
                        className="text-xs h-8 px-3 gap-1.5"
                      >
                        {salvandoBling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Salvar Token Legado
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* SEÇÃO B: WHATSAPP / META */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#16A34A] flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[#0F172A]">
                  2. WhatsApp Business API (Meta)
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Envio de mensagens por proxy seguro <code>/backend/v1/whatsapp/enviar</code>.
                </CardDescription>
              </div>
            </div>

            <div>
              {isWhatsappConfigurado ? (
                <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1.5 py-1 px-3">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Configurado no Backend
                </Badge>
              ) : (
                <Badge className="bg-red-50 text-[#DC2626] border-red-200 text-xs font-semibold gap-1.5 py-1 px-3">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Não configurado
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-[#0F172A] flex items-start gap-3">
            <Info className="w-5 h-5 text-[#2563EB] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-800">Requisitos para envio oficial:</p>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Para enviar mensagens via WhatsApp Business API, você precisa de uma conta Meta
                Business, uma WhatsApp Business Account (WABA) e um número de telefone aprovado.
                Recomendamos contratar um provedor oficial (BSP) como Zenvia, Twilio, 360dialog ou
                Infobip.
              </p>
            </div>
          </div>

          <form onSubmit={handleSalvarWhatsapp} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Provedor */}
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-provedor" className="text-xs font-bold text-[#0F172A]">
                  Provedor BSP Oficial
                </Label>
                <Select
                  value={whatsappProvedor}
                  onValueChange={setWhatsappProvedor}
                  disabled={!isCeo}
                >
                  <SelectTrigger id="whatsapp-provedor" className="h-10 text-xs bg-white">
                    <SelectValue placeholder="Selecione o provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zenvia">Zenvia</SelectItem>
                    <SelectItem value="twilio">Twilio</SelectItem>
                    <SelectItem value="360dialog">360dialog</SelectItem>
                    <SelectItem value="infobip">Infobip</SelectItem>
                    <SelectItem value="outro">Outro (API Meta Cloud direta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Número de Telefone */}
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-telefone" className="text-xs font-bold text-[#0F172A]">
                  Número de Telefone Homologado (com DDI + DDD)
                </Label>
                <Input
                  id="whatsapp-telefone"
                  type="text"
                  value={whatsappTelefone}
                  onChange={(e) => setWhatsappTelefone(e.target.value)}
                  placeholder="Ex: +55 11 98765-4321"
                  className="h-10 text-xs bg-white"
                  disabled={!isCeo}
                />
              </div>
            </div>

            {/* Token de Acesso */}
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp-token" className="text-xs font-bold text-[#0F172A]">
                Token de Acesso (Access Token / API Key) — Mascarado
              </Label>
              <div className="relative">
                <Input
                  id="whatsapp-token"
                  type={showWhatsappToken ? 'text' : 'password'}
                  value={whatsappToken}
                  onChange={(e) => setWhatsappToken(e.target.value)}
                  placeholder={
                    temWhatsappSalvo
                      ? 'Token protegido no servidor'
                      : 'Cole aqui o token permanente da Meta/Zenvia'
                  }
                  className="pr-10 h-10 text-xs font-mono bg-white"
                  disabled={!isCeo}
                />
                <button
                  type="button"
                  onClick={() => setShowWhatsappToken(!showWhatsappToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                  title={showWhatsappToken ? 'Ocultar máscara' : 'Exibir máscara'}
                >
                  {showWhatsappToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isCeo && (
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={salvandoWhatsapp}
                  className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
                >
                  {salvandoWhatsapp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar WhatsApp no Servidor
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* SEÇÃO C: ASSISTENTE DE IA */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-[#7C3AED] flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                  <span>3. Assistente de IA de Vendas (WhatsApp)</span>
                  <Badge className="bg-purple-50 text-[#7C3AED] border-purple-200 text-[11px] font-semibold gap-1">
                    <Sparkles className="w-3 h-3" />
                    Skip AI Gateway Nativo
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Executado server-side via rota <code>/backend/v1/ia/sugerir</code>.
                </CardDescription>
              </div>
            </div>

            <div>
              {iaConfig.ativo ? (
                <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1.5 py-1 px-3">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ativo no Backend
                </Badge>
              ) : (
                <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-xs font-semibold gap-1.5 py-1 px-3">
                  Pausado
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs sm:text-sm text-[#0F172A] flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-[#16A34A] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-emerald-950">
                Chave da API de IA (Gerenciada pelo Backend):
              </p>
              <p className="text-xs text-emerald-900 leading-relaxed">
                A infraestrutura de IA utiliza o gateway nativo Skip Cloud configurado com segurança
                no servidor. Não é necessário inserir chaves de API manualmente: as conexões de LLM
                já estão operacionais, com isolamento de credenciais e faturamento unificado.
              </p>
            </div>
          </div>

          <form onSubmit={handleSalvarIaConfig} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="space-y-0.5 pr-2">
                  <Label
                    htmlFor="ia-ativo"
                    className="text-xs font-bold text-[#0F172A] cursor-pointer"
                  >
                    Ativar Assistente de IA
                  </Label>
                  <p className="text-[11px] text-[#64748B]">
                    Habilita a geração server-side de sugestões no módulo de Conversas.
                  </p>
                </div>
                <Switch
                  id="ia-ativo"
                  checked={iaConfig.ativo}
                  onCheckedChange={(val) => setIaConfig((prev) => ({ ...prev, ativo: val }))}
                  disabled={!isCeo}
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="space-y-0.5 pr-2">
                  <Label
                    htmlFor="ia-preco"
                    className="text-xs font-bold text-[#0F172A] cursor-pointer"
                  >
                    Permitir que a IA sugira preço
                  </Label>
                  <p className="text-[11px] text-[#64748B]">
                    Se desligado, a IA nunca cita valores e instrui aguardar proposta.
                  </p>
                </div>
                <Switch
                  id="ia-preco"
                  checked={iaConfig.permitirPreco}
                  onCheckedChange={(val) =>
                    setIaConfig((prev) => ({ ...prev, permitirPreco: val }))
                  }
                  disabled={!isCeo}
                />
              </div>
            </div>

            <div className="max-w-md space-y-1.5">
              <Label htmlFor="ia-tom" className="text-xs font-bold text-[#0F172A]">
                Tom de Voz do Assistente
              </Label>
              <Select
                value={iaConfig.tomDeVoz}
                onValueChange={(val: 'profissional' | 'amigavel' | 'direto') =>
                  setIaConfig((prev) => ({ ...prev, tomDeVoz: val }))
                }
                disabled={!isCeo}
              >
                <SelectTrigger id="ia-tom" className="h-10 text-xs bg-white">
                  <SelectValue placeholder="Selecione o tom de voz" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profissional">Profissional (Equilibrado e focado)</SelectItem>
                  <SelectItem value="amigavel">Amigável (Acolhedor e caloroso)</SelectItem>
                  <SelectItem value="direto">Direto (Ultra sucinto e pragmático)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="ia-prompt"
                  className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5"
                >
                  <span>Prompt de Sistema (Instruções Base da Colesel)</span>
                </Label>
                {isCeo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRestaurarPromptPadrao}
                    className="text-xs text-[#64748B] hover:text-[#0F172A] h-7 px-2 gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restaurar padrão
                  </Button>
                )}
              </div>

              <Textarea
                id="ia-prompt"
                rows={12}
                value={iaConfig.promptSistema}
                onChange={(e) =>
                  setIaConfig((prev) => ({ ...prev, promptSistema: e.target.value }))
                }
                className="text-xs font-mono bg-white leading-relaxed resize-y"
                placeholder="Insira as instruções do assistente..."
                disabled={!isCeo}
              />
            </div>

            {isCeo && (
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={salvandoIa}
                  className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
                >
                  {salvandoIa ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar Configurações da IA no Servidor
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* SEÇÃO D: E-MAIL / SMS */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-[#7C3AED] flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-[#0F172A]">
                4. E-mail SMTP e Gateway SMS
              </CardTitle>
              <CardDescription className="text-xs text-[#64748B]">
                Servidor de envio transacional via proxy <code>/backend/v1/smtp/enviar</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          <form onSubmit={handleSalvarEmailSms} className="space-y-5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5 mb-3">
                <Server className="w-3.5 h-3.5" />
                Configurações de E-mail (SMTP)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="smtp-servidor" className="text-xs font-bold text-[#0F172A]">
                    Servidor SMTP (Host)
                  </Label>
                  <Input
                    id="smtp-servidor"
                    type="text"
                    value={smtpServidor}
                    onChange={(e) => setSmtpServidor(e.target.value)}
                    placeholder="Ex: smtp.sendgrid.net ou smtp.office365.com"
                    className="h-10 text-xs bg-white"
                    disabled={!isCeo}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-porta" className="text-xs font-bold text-[#0F172A]">
                    Porta SMTP
                  </Label>
                  <Input
                    id="smtp-porta"
                    type="text"
                    value={smtpPorta}
                    onChange={(e) => setSmtpPorta(e.target.value)}
                    placeholder="Ex: 587 ou 465"
                    className="h-10 text-xs bg-white font-mono"
                    disabled={!isCeo}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="smtp-usuario" className="text-xs font-bold text-[#0F172A]">
                    Usuário / E-mail de Envio
                  </Label>
                  <Input
                    id="smtp-usuario"
                    type="text"
                    value={smtpUsuario}
                    onChange={(e) => setSmtpUsuario(e.target.value)}
                    placeholder="Ex: apikey ou contato@colesel45.com.br"
                    className="h-10 text-xs bg-white"
                    disabled={!isCeo}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-senha" className="text-xs font-bold text-[#0F172A]">
                    Senha / Chave SMTP — Mascarada
                  </Label>
                  <div className="relative">
                    <Input
                      id="smtp-senha"
                      type={showSmtpSenha ? 'text' : 'password'}
                      value={smtpSenha}
                      onChange={(e) => setSmtpSenha(e.target.value)}
                      placeholder={temSmtpSenhaSalva ? '••••••••••••' : 'Digite a senha do SMTP'}
                      className="pr-10 h-10 text-xs bg-white font-mono"
                      disabled={!isCeo}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpSenha(!showSmtpSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                      title={showSmtpSenha ? 'Ocultar senha' : 'Exibir senha'}
                    >
                      {showSmtpSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E2E8F0]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5 mb-3">
                <Send className="w-3.5 h-3.5" />
                Configurações de Disparo SMS
              </h4>

              <div className="max-w-md space-y-1.5">
                <Label htmlFor="gateway-sms" className="text-xs font-bold text-[#0F172A]">
                  Gateway SMS
                </Label>
                <Select value={gatewaySms} onValueChange={setGatewaySms} disabled={!isCeo}>
                  <SelectTrigger id="gateway-sms" className="h-10 text-xs bg-white">
                    <SelectValue placeholder="Selecione o provedor de SMS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zenvia">Zenvia SMS</SelectItem>
                    <SelectItem value="twilio">Twilio Programmable SMS</SelectItem>
                    <SelectItem value="locasms">LocaSMS</SelectItem>
                    <SelectItem value="comtele">Comtele SMS</SelectItem>
                    <SelectItem value="sinch">Sinch</SelectItem>
                    <SelectItem value="outro">Outro Gateway HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isCeo && (
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={salvandoEmailSms}
                  className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
                >
                  {salvandoEmailSms ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar E-mail e SMS no Servidor
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
