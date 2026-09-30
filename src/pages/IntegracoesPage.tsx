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
  ShieldAlert,
  Bot,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  Loader2,
  RefreshCw,
  Clock,
  AlertTriangle,
  KeyRound,
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
  bling_token_mascarado?: string
  tem_bling_token?: boolean
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
  const [salvandoWhatsapp, setSalvandoWhatsapp] = useState(false)
  const [salvandoEmailSms, setSalvandoEmailSms] = useState(false)
  const [salvandoIa, setSalvandoIa] = useState(false)

  // ==========================================
  // ESTADO: RESUMO BLING ERP (Card Resumido)
  // ==========================================
  const [blingStatusData, setBlingStatusData] = useState<{
    conectado: boolean
    status: string
    ultima_sincronizacao: string | null
  }>({
    conectado: false,
    status: 'desconectado',
    ultima_sincronizacao: null,
  })

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

  // Carregar status resumido do Bling
  const carregarBlingStatus = useCallback(async () => {
    try {
      const resStatus = await pb.send<
        Partial<{
          conectado: boolean
          status: string
        }>
      >('/backend/v1/bling/status', {
        method: 'GET',
      })

      // Buscar última sincronização nos logs
      let ultimaData: string | null = null
      try {
        const logs = await pb.collection('bling_sync_logs').getList(1, 1, {
          sort: '-created',
          fields: 'finalizado_em,iniciado_em',
        })
        if (logs.items.length > 0) {
          ultimaData =
            (logs.items[0] as unknown as { finalizado_em?: string; iniciado_em?: string })
              .finalizado_em ||
            (logs.items[0] as unknown as { finalizado_em?: string; iniciado_em?: string })
              .iniciado_em ||
            null
        }
      } catch {
        /* intentionally ignored */
      }

      setBlingStatusData({
        conectado: Boolean(resStatus?.conectado),
        status: resStatus?.status || 'desconectado',
        ultima_sincronizacao: ultimaData,
      })
    } catch (_) {
      // Falha silenciosa no status
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

  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/configuracoes')
    }
  }

  // ==========================================
  // HANDLERS DE SALVAR NO BACKEND PROTEGIDO
  // ==========================================
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
      {/* SEÇÃO A: BLING ERP — Card Resumido (Módulo Dedicado)   */}
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
                  ) : (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[11px] font-semibold">
                      Status: Desconectado
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] text-emerald-800 bg-white">
                    Módulo Dedicado
                  </Badge>
                </div>
                <CardDescription className="text-xs text-[#64748B]">
                  Integração oficial OAuth 2.0 com a API v3 do Bling e sincronização somente
                  leitura.
                </CardDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={carregarBlingStatus}
              className="text-xs text-[#64748B] hover:text-[#0F172A] h-8 px-2.5 gap-1.5 self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Atualizar status</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#0F172A]">
                Status da Conexão:{' '}
                <span className={blingStatusData.conectado ? 'text-[#16A34A]' : 'text-slate-600'}>
                  {blingStatusData.conectado ? 'Conectado (OAuth v3 Ativo)' : 'Desconectado'}
                </span>
              </p>
              <p className="text-xs text-[#64748B]">
                Última sincronização:{' '}
                <strong className="text-[#0F172A]">
                  {formatarDataHora(blingStatusData.ultima_sincronizacao)}
                </strong>
              </p>
              <p className="text-[11px] text-[#64748B]">
                Acesse a central dedicada do Bling para gerenciar autorização, sincronizar dados,
                visualizar logs e diagnóstico.
              </p>
            </div>

            <Button
              type="button"
              onClick={() => navigate('/bling')}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2 h-9 px-4 flex-shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              ABRIR INTEGRAÇÃO BLING
            </Button>
          </div>
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
