import React, { useState } from 'react'
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

// Chaves de localStorage
const STORAGE_BLING_TOKEN = 'integracao_bling_token'
const STORAGE_WHATSAPP = 'integracao_whatsapp'
const STORAGE_EMAIL_SMS = 'integracao_email_sms'
export const STORAGE_ASSISTENTE_IA = 'integracao_assistente_ia'

interface WhatsappConfig {
  provedor: string
  telefone: string
  token: string
}

interface EmailSmsConfig {
  smtpServidor: string
  smtpPorta: string
  smtpUsuario: string
  smtpSenha: string
  gatewaySms: string
}

export default function IntegracoesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perfil = user?.perfil

  // Acesso permitido APENAS a ceo_financeiro e coordenador_vendas
  const podeAcessar = perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas'

  // ==========================================
  // ESTADO: SEÇÃO A - BLING
  // ==========================================
  const [blingToken, setBlingToken] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_BLING_TOKEN) || ''
    } catch {
      return ''
    }
  })
  const [showBlingToken, setShowBlingToken] = useState(false)

  // ==========================================
  // ESTADO: SEÇÃO B - WHATSAPP / META
  // ==========================================
  const [whatsappData, setWhatsappData] = useState<WhatsappConfig>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_WHATSAPP)
      if (salvo) return JSON.parse(salvo)
    } catch {
      // Ignora erro
    }
    return {
      provedor: 'zenvia',
      telefone: '',
      token: '',
    }
  })
  const [showWhatsappToken, setShowWhatsappToken] = useState(false)

  // ==========================================
  // ESTADO: SEÇÃO C - EMAIL / SMS
  // ==========================================
  const [emailSmsData, setEmailSmsData] = useState<EmailSmsConfig>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_EMAIL_SMS)
      if (salvo) return JSON.parse(salvo)
    } catch {
      // Ignora erro
    }
    return {
      smtpServidor: '',
      smtpPorta: '587',
      smtpUsuario: '',
      smtpSenha: '',
      gatewaySms: 'zenvia',
    }
  })
  const [showSmtpSenha, setShowSmtpSenha] = useState(false)

  // ==========================================
  // ESTADO: SEÇÃO D - ASSISTENTE IA
  // ==========================================
  const [iaConfig, setIaConfig] = useState<AssistenteIaConfig>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_ASSISTENTE_IA)
      if (salvo) {
        const parsed = JSON.parse(salvo)
        return {
          ativo: parsed.ativo !== false,
          permitirPreco: parsed.permitirPreco !== false,
          tomDeVoz: parsed.tomDeVoz || 'profissional',
          promptSistema: parsed.promptSistema || PROMPT_IA_PADRAO,
        }
      }
    } catch {
      // Ignora erro
    }
    return {
      ativo: true,
      permitirPreco: true,
      tomDeVoz: 'profissional',
      promptSistema: PROMPT_IA_PADRAO,
    }
  })

  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/configuracoes')
    }
  }

  // ==========================================
  // HANDLERS DE SALVAR
  // ==========================================
  const handleSalvarBling = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      localStorage.setItem(STORAGE_BLING_TOKEN, blingToken.trim())
      toast({
        title: 'Integração Bling salva',
        description: 'O token da API do Bling foi gravado com sucesso no navegador.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível gravar os dados no armazenamento local.',
      })
    }
  }

  const handleSalvarWhatsapp = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      localStorage.setItem(STORAGE_WHATSAPP, JSON.stringify(whatsappData))
      toast({
        title: 'Configurações de WhatsApp salvas',
        description: 'Os parâmetros da API WhatsApp Business foram atualizados com sucesso.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível gravar os dados no armazenamento local.',
      })
    }
  }

  const handleSalvarEmailSms = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      localStorage.setItem(STORAGE_EMAIL_SMS, JSON.stringify(emailSmsData))
      toast({
        title: 'Servidores de E-mail/SMS salvos',
        description: 'As configurações SMTP e Gateway SMS foram gravadas com sucesso.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível gravar os dados no armazenamento local.',
      })
    }
  }

  const handleSalvarIaConfig = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      localStorage.setItem(STORAGE_ASSISTENTE_IA, JSON.stringify(iaConfig))
      toast({
        title: 'Assistente de IA configurado',
        description: 'As preferências e o prompt do assistente foram salvos com sucesso.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível gravar os dados no armazenamento local.',
      })
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

  // Status calculado de WhatsApp: Configurado se tiver token e telefone preenchidos
  const isWhatsappConfigurado = Boolean(whatsappData.token.trim() && whatsappData.telefone.trim())

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
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1">
            Integrações do Sistema
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Configure as chaves e credenciais para o Bling ERP, WhatsApp Business API (Meta) e
            serviços de E-mail/SMS.
          </p>
        </div>

        <div>
          <Badge
            variant="outline"
            className="text-xs text-slate-600 bg-white border-slate-200 py-1.5 px-3"
          >
            Acesso concedido: <strong>{user?.nome || 'Gestor'}</strong>
          </Badge>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SEÇÃO A: BLING */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#16A34A] flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[#0F172A]">1. Bling ERP</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Integração de pedidos de venda, contatos e sincronização de dados.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="https://ajuda.bling.com.br"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs text-[#2563EB] hover:text-[#1D4ED8] hover:underline font-semibold bg-blue-50/70 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <span>Como obter o token</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Instruções EXATAS solicitadas pelo usuário */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-[#0F172A] flex items-start gap-3">
            <Info className="w-5 h-5 text-[#16A34A] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-800">Como exportar suas planilhas no Bling:</p>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Exporte seus clientes em{' '}
                <strong>Cadastros &gt; Contatos &gt; Exportar planilha</strong> e suas vendas em{' '}
                <strong>Vendas &gt; Pedidos &gt; Exportar</strong>. Depois use a tela{' '}
                <button
                  type="button"
                  onClick={() => navigate('/importacao')}
                  className="text-[#16A34A] underline font-semibold hover:text-[#15803D]"
                >
                  Importação
                </button>{' '}
                para subir os arquivos.
              </p>
            </div>
          </div>

          <form onSubmit={handleSalvarBling} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bling-token" className="text-xs font-bold text-[#0F172A]">
                Token de API (Bling)
              </Label>
              <div className="relative">
                <Input
                  id="bling-token"
                  type={showBlingToken ? 'text' : 'password'}
                  value={blingToken}
                  onChange={(e) => setBlingToken(e.target.value)}
                  placeholder="Cole aqui seu token de API ou API key v2/v3 do Bling"
                  className="pr-10 h-10 text-xs font-mono bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowBlingToken(!showBlingToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                  title={showBlingToken ? 'Ocultar token' : 'Exibir token'}
                >
                  {showBlingToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[#64748B]">
                O token é armazenado com segurança localmente no seu navegador para as rotinas de
                sincronização.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar Token do Bling
              </Button>
            </div>
          </form>
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
                  Envio automático de mensagens e réguas de follow-up via WhatsApp oficial.
                </CardDescription>
              </div>
            </div>

            {/* Status: Não configurado (vermelho) ou Configurado (verde) */}
            <div>
              {isWhatsappConfigurado ? (
                <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1.5 py-1 px-3">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Configurado
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
          {/* Instruções EXATAS solicitadas pelo usuário */}
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
                  value={whatsappData.provedor}
                  onValueChange={(val) => setWhatsappData((prev) => ({ ...prev, provedor: val }))}
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
                  value={whatsappData.telefone}
                  onChange={(e) =>
                    setWhatsappData((prev) => ({ ...prev, telefone: e.target.value }))
                  }
                  placeholder="Ex: +55 11 98765-4321"
                  className="h-10 text-xs bg-white"
                />
              </div>
            </div>

            {/* Token de Acesso */}
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp-token" className="text-xs font-bold text-[#0F172A]">
                Token de Acesso (Access Token / API Key)
              </Label>
              <div className="relative">
                <Input
                  id="whatsapp-token"
                  type={showWhatsappToken ? 'text' : 'password'}
                  value={whatsappData.token}
                  onChange={(e) => setWhatsappData((prev) => ({ ...prev, token: e.target.value }))}
                  placeholder="Cole aqui o token permanente da Meta ou da chave do provedor"
                  className="pr-10 h-10 text-xs font-mono bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowWhatsappToken(!showWhatsappToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                  title={showWhatsappToken ? 'Ocultar token' : 'Exibir token'}
                >
                  {showWhatsappToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar Configurações de WhatsApp
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* SEÇÃO D: ASSISTENTE DE IA */}
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
                    Skip AI Gateway
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Sugere respostas personalizadas baseadas no histórico do cliente e no catálogo de
                  produtos.
                </CardDescription>
              </div>
            </div>

            <div>
              {iaConfig.ativo ? (
                <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1.5 py-1 px-3">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ativo
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
          {/* Informação sobre chave gerenciada pelo backend */}
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
            {/* Toggles principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Toggle Ativar Assistente */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="space-y-0.5 pr-2">
                  <Label
                    htmlFor="ia-ativo"
                    className="text-xs font-bold text-[#0F172A] cursor-pointer"
                  >
                    Ativar Assistente de IA
                  </Label>
                  <p className="text-[11px] text-[#64748B]">
                    Habilita o botão &quot;✨ Sugerir resposta&quot; na tela de conversas.
                  </p>
                </div>
                <Switch
                  id="ia-ativo"
                  checked={iaConfig.ativo}
                  onCheckedChange={(val) => setIaConfig((prev) => ({ ...prev, ativo: val }))}
                />
              </div>

              {/* Toggle Permitir Preço */}
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
                />
              </div>
            </div>

            {/* Tom de Voz */}
            <div className="max-w-md space-y-1.5">
              <Label htmlFor="ia-tom" className="text-xs font-bold text-[#0F172A]">
                Tom de Voz do Assistente
              </Label>
              <Select
                value={iaConfig.tomDeVoz}
                onValueChange={(val: 'profissional' | 'amigavel' | 'direto') =>
                  setIaConfig((prev) => ({ ...prev, tomDeVoz: val }))
                }
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
              <p className="text-[11px] text-[#64748B]">
                Ajusta as diretrizes do prompt dinamicamente para cada mensagem gerada.
              </p>
            </div>

            {/* Prompt de Sistema Editável */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="ia-prompt"
                  className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5"
                >
                  <span>Prompt de Sistema (Instruções Base da Colesel)</span>
                </Label>
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
              />
              <p className="text-[11px] text-[#64748B]">
                O vendedor <strong>sempre revisa antes de enviar</strong> — a IA nunca dispara
                mensagens automaticamente.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar Configurações da IA
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* SEÇÃO E: E-MAIL / SMS */}
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
                Servidor de envio de e-mails transacionais e campanhas por SMS.
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
                {/* Servidor SMTP */}
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="smtp-servidor" className="text-xs font-bold text-[#0F172A]">
                    Servidor SMTP (Host)
                  </Label>
                  <Input
                    id="smtp-servidor"
                    type="text"
                    value={emailSmsData.smtpServidor}
                    onChange={(e) =>
                      setEmailSmsData((prev) => ({ ...prev, smtpServidor: e.target.value }))
                    }
                    placeholder="Ex: smtp.sendgrid.net ou smtp.office365.com"
                    className="h-10 text-xs bg-white"
                  />
                </div>

                {/* Porta SMTP */}
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-porta" className="text-xs font-bold text-[#0F172A]">
                    Porta SMTP
                  </Label>
                  <Input
                    id="smtp-porta"
                    type="text"
                    value={emailSmsData.smtpPorta}
                    onChange={(e) =>
                      setEmailSmsData((prev) => ({ ...prev, smtpPorta: e.target.value }))
                    }
                    placeholder="Ex: 587 ou 465"
                    className="h-10 text-xs bg-white font-mono"
                  />
                </div>

                {/* Usuário SMTP */}
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="smtp-usuario" className="text-xs font-bold text-[#0F172A]">
                    Usuário / E-mail de Envio
                  </Label>
                  <Input
                    id="smtp-usuario"
                    type="text"
                    value={emailSmsData.smtpUsuario}
                    onChange={(e) =>
                      setEmailSmsData((prev) => ({ ...prev, smtpUsuario: e.target.value }))
                    }
                    placeholder="Ex: apikey ou contato@colesel45.com.br"
                    className="h-10 text-xs bg-white"
                  />
                </div>

                {/* Senha SMTP */}
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-senha" className="text-xs font-bold text-[#0F172A]">
                    Senha / Chave SMTP
                  </Label>
                  <div className="relative">
                    <Input
                      id="smtp-senha"
                      type={showSmtpSenha ? 'text' : 'password'}
                      value={emailSmsData.smtpSenha}
                      onChange={(e) =>
                        setEmailSmsData((prev) => ({ ...prev, smtpSenha: e.target.value }))
                      }
                      placeholder="••••••••••••"
                      className="pr-10 h-10 text-xs bg-white"
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
                <Select
                  value={emailSmsData.gatewaySms}
                  onValueChange={(val) => setEmailSmsData((prev) => ({ ...prev, gatewaySms: val }))}
                >
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
                <p className="text-[11px] text-[#64748B]">
                  Os disparos de SMS utilizam as credenciais cadastradas na aba de Canais de
                  Automação.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar E-mail e SMS
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
