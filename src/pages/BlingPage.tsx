import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layers,
  ArrowLeft,
  Plug,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Loader2,
  Users,
  ShoppingBag,
  FileText,
  Sliders,
  Sparkles,
  Lock,
  ChevronRight,
  Database,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  iniciarConexaoBling,
  type IniciarConexaoBlingRetorno,
} from '@/lib/bling/iniciarConexaoBling'

interface BlingStatusData {
  conectado: boolean
  status: 'conectado' | 'desconectado' | 'erro_renovacao' | string
  configurado_no_servidor: boolean
  tipo_autenticacao: string
  expires_at: string | null
  ultima_renovacao: string | null
  ultimo_erro: string | null
}

interface SincronizacaoResultado {
  success?: boolean
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
}

interface BlingSyncLogItem {
  id: string
  iniciado_em: string
  finalizado_em: string
  status: 'processando' | 'sucesso' | 'sucesso_parcial' | 'erro' | string
  clientes_lidos: number
  clientes_criados: number
  clientes_atualizados: number
  clientes_ignorados: number
  pedidos_lidos: number
  duracao_ms: number
  mensagem_resumo: string
  erros: string[] | string
  usuario?: string
  expand?: {
    usuario?: {
      nome?: string
      email?: string
    }
  }
}

interface ClientesIndicadores {
  total: number
  comBlingId: number
  ativos: number
  paraReativacao: number
  comCompras: number
  valorTotalConsolidado: number
  ultimaDataProcessada: string | null
}

export default function BlingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perfil = user?.perfil

  // Acesso permitido para ceo_financeiro e coordenador_vendas (mesmos perfis do Bling)
  const podeAcessar = perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas'
  const isCeo = perfil === 'ceo_financeiro'

  // Estados principais
  const [carregando, setCarregando] = useState(true)
  const [iniciandoConexao, setIniciandoConexao] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  // Status da Conexão
  const [statusData, setStatusData] = useState<BlingStatusData>({
    conectado: false,
    status: 'desconectado',
    configurado_no_servidor: false,
    tipo_autenticacao: 'nenhum',
    expires_at: null,
    ultima_renovacao: null,
    ultimo_erro: null,
  })

  // Último resultado de sincronização em memória
  const [resultadoSync, setResultadoSync] = useState<SincronizacaoResultado | null>(null)

  // Histórico de Logs
  const [logs, setLogs] = useState<BlingSyncLogItem[]>([])
  const [carregandoLogs, setCarregandoLogs] = useState(false)
  const [logModalDetalhe, setLogModalDetalhe] = useState<BlingSyncLogItem | null>(null)

  // Indicadores de clientes e vendas consolidados
  const [indicadores, setIndicadores] = useState<ClientesIndicadores>({
    total: 0,
    comBlingId: 0,
    ativos: 0,
    paraReativacao: 0,
    comCompras: 0,
    valorTotalConsolidado: 0,
    ultimaDataProcessada: null,
  })

  // Referência para cancelar fluxo de conexão se o componente for desmontado
  const conexaoFluxoRef = useRef<IniciarConexaoBlingRetorno | null>(null)

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      if (conexaoFluxoRef.current) {
        conexaoFluxoRef.current.cancelar()
      }
    }
  }, [])

  // Carregar status oficial da conexão
  const carregarStatus = useCallback(async () => {
    try {
      const res = await pb.send<Partial<BlingStatusData>>('/backend/v1/bling/status', {
        method: 'GET',
      })
      if (res && typeof res === 'object') {
        setStatusData({
          conectado: Boolean(res.conectado),
          status: res.status || 'desconectado',
          configurado_no_servidor: Boolean(res.configurado_no_servidor),
          tipo_autenticacao: res.tipo_autenticacao || 'nenhum',
          expires_at: res.expires_at || null,
          ultima_renovacao: res.ultima_renovacao || null,
          ultimo_erro: res.ultimo_erro || null,
        })
      }
    } catch (_) {
      // Falha não crítica para manter UI responsiva
    }
  }, [])

  // Carregar histórico de logs da coleção bling_sync_logs
  const carregarLogs = useCallback(async () => {
    try {
      setCarregandoLogs(true)
      const res = await pb.collection('bling_sync_logs').getList<BlingSyncLogItem>(1, 20, {
        sort: '-created',
        expand: 'usuario',
      })
      setLogs(res.items || [])
    } catch (_) {
      // Se coleção não tiver registros ainda
      setLogs([])
    } finally {
      setCarregandoLogs(false)
    }
  }, [])

  // Carregar indicadores de clientes e compras do CRM
  const carregarIndicadores = useCallback(async () => {
    try {
      // Buscar clientes com campos relevantes para os blocos
      const lista = await pb.collection('clientes').getFullList({
        fields: 'id,bling_id,status_cliente,valor_total_vendas,data_ultima_compra',
      })

      let total = lista.length
      let comBlingId = 0
      let ativos = 0
      let paraReativacao = 0
      let comCompras = 0
      let somaVendas = 0
      let ultimaData: string | null = null

      for (const c of lista) {
        if (c.bling_id) comBlingId++
        if (c.status_cliente === 'ativo') ativos++
        if (c.status_cliente === 'para_reativacao') paraReativacao++

        const v = Number(c.valor_total_vendas) || 0
        if (v > 0) {
          comCompras++
          somaVendas += v
        }

        const dCompra = c.data_ultima_compra
        if (dCompra && (!ultimaData || dCompra > ultimaData)) {
          ultimaData = dCompra
        }
      }

      setIndicadores({
        total,
        comBlingId,
        ativos,
        paraReativacao,
        comCompras,
        valorTotalConsolidado: Math.round(somaVendas * 100) / 100,
        ultimaDataProcessada: ultimaData,
      })
    } catch (_) {
      // Falha tolerante
    }
  }, [])

  // Carga inicial
  useEffect(() => {
    if (podeAcessar) {
      setCarregando(true)
      Promise.all([carregarStatus(), carregarLogs(), carregarIndicadores()]).finally(() => {
        setCarregando(false)
      })
    }
  }, [podeAcessar, carregarStatus, carregarLogs, carregarIndicadores])

  // Recarregar status quando a janela recupera foco
  useEffect(() => {
    const onFocus = () => {
      carregarStatus()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [carregarStatus])

  // ==========================================================================
  // AÇÃO 1: INICIAR CONEXÃO OAUTH (popup neutro + validação + polling)
  // ==========================================================================
  const handleConectarBling = async () => {
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode conectar o CRM ao Bling.',
      })
      return
    }

    try {
      setIniciandoConexao(true)
      const fluxo = await iniciarConexaoBling({
        pollIntervalMs: 2000,
        maxTimeoutMs: 5 * 60 * 1000,
        onStatusChange: (s) => {
          setStatusData((prev) => ({
            ...prev,
            conectado: s.conectado,
            status: s.status,
            ultimo_erro: s.ultimo_erro ?? prev.ultimo_erro,
          }))
        },
        onSuccess: async () => {
          setIniciandoConexao(false)
          toast({
            title: 'Conexão com o Bling realizada com sucesso!',
            description: 'O CRM agora está integrado via OAuth v3.',
          })
          await carregarStatus()
          await carregarLogs()
        },
        onError: (msg) => {
          setIniciandoConexao(false)
          toast({
            variant: 'destructive',
            title: 'Falha na conexão com o Bling',
            description: msg,
          })
        },
      })
      conexaoFluxoRef.current = fluxo
    } catch (err) {
      setIniciandoConexao(false)
      toast({
        variant: 'destructive',
        title: 'Erro ao iniciar fluxo OAuth',
        description: getErrorMessage(err),
      })
    }
  }

  // ==========================================================================
  // AÇÃO 2: DESCONECTAR BLING
  // ==========================================================================
  const handleDesconectar = async () => {
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
      setDesconectando(true)
      const res = await pb.send<{ success: boolean; message: string }>(
        '/backend/v1/bling/disconnect',
        { method: 'POST' },
      )
      if (res && res.success) {
        toast({
          title: 'Bling desconectado',
          description: 'A autorização foi revogada no backend do CRM.',
        })
        await carregarStatus()
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao desconectar',
        description: getErrorMessage(err),
      })
    } finally {
      setDesconectando(false)
    }
  }

  // ==========================================================================
  // AÇÃO 3: SINCRONIZAR AGORA (Read-Only)
  // ==========================================================================
  const handleSincronizar = async () => {
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Permissão insuficiente',
        description: 'Apenas o perfil CEO / Financeiro pode disparar a sincronização.',
      })
      return
    }

    if (!statusData.conectado) {
      toast({
        variant: 'destructive',
        title: 'Bling desconectado',
        description: 'Conecte sua conta Bling via OAuth antes de disparar a sincronização.',
      })
      return
    }

    try {
      setSincronizando(true)
      setResultadoSync(null)

      const res = await pb.send<SincronizacaoResultado>('/backend/v1/bling/sincronizar', {
        method: 'POST',
      })

      if (res) {
        setResultadoSync(res)
        if (res.success) {
          toast({
            title: 'Sincronização concluída com sucesso',
            description: `${res.clientes_consultados} clientes e ${res.pedidos_consultados} pedidos processados.`,
          })
        } else {
          toast({
            variant: 'destructive',
            title: 'Aviso na sincronização',
            description: res.mensagem || 'Houve falhas no processamento.',
          })
        }
        await carregarStatus()
        await carregarLogs()
        await carregarIndicadores()
      }
    } catch (err) {
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
        mensagem: 'Falha na conexão: ' + msg,
      })
    } finally {
      setSincronizando(false)
    }
  }

  const formatarData = (val: string | null | undefined, fallback = '—'): string => {
    if (!val || typeof val !== 'string' || !val.trim()) return fallback
    const d = new Date(val)
    if (isNaN(d.getTime())) return fallback
    return d.toLocaleString('pt-BR')
  }

  const formatarMoeda = (val: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0)
  }

  // Se perfil não tem permissão
  if (!podeAcessar) {
    return (
      <div className="space-y-6 animate-fade-in pb-12 max-w-4xl mx-auto">
        <div className="py-16 px-4 max-w-lg mx-auto text-center animate-fade-in">
          <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-[#0F172A]">Acesso restrito</h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                O módulo do <strong>Bling ERP</strong> é restrito aos perfis{' '}
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

  // Badge de status do cabeçalho
  const renderBadgeStatus = () => {
    if (statusData.conectado) {
      return (
        <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1.5 py-1 px-3">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Conectado
        </Badge>
      )
    }
    if (iniciandoConexao) {
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-semibold gap-1.5 py-1 px-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Aguardando autorização
        </Badge>
      )
    }
    if (statusData.status === 'erro_renovacao' || statusData.ultimo_erro) {
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 text-xs font-semibold gap-1.5 py-1 px-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          Erro
        </Badge>
      )
    }
    return (
      <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-xs font-semibold gap-1.5 py-1 px-3">
        Desconectado
      </Badge>
    )
  }

  const ultimaSyncDoHistorico = logs.length > 0 ? logs[0] : null

  return (
    <div className="space-y-8 animate-fade-in pb-16 max-w-6xl mx-auto">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/configuracoes')}
              className="text-[#64748B] hover:text-[#0F172A] gap-1.5 h-8 px-2.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Configurações</span>
            </Button>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-semibold gap-1"
            >
              <Layers className="w-3.5 h-3.5 text-[#16A34A]" />
              Módulo Oficial ERP
            </Badge>
            <Badge
              variant="outline"
              className="bg-slate-100 text-[#0F172A] border-slate-300 text-xs font-semibold gap-1"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Modo Somente Leitura (Read-Only)
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
              Bling ERP
            </h2>
            {renderBadgeStatus()}
          </div>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Conexão e sincronização em modo somente leitura.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {carregando && (
            <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Carregando dados...</span>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              carregarStatus()
              carregarLogs()
              carregarIndicadores()
            }}
            className="text-xs h-8 px-3 gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* 2. SEÇÃO CONEXÃO — Card "Conexão com o Bling" */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#16A34A] flex items-center justify-center flex-shrink-0">
                <Plug className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[#0F172A]">
                  Conexão com o Bling
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Autenticação segura OAuth 2.0 (v3) com credenciais armazenadas estritamente no
                  backend do CRM.
                </CardDescription>
              </div>
            </div>

            {isCeo && (
              <div className="flex flex-wrap items-center gap-2">
                {!statusData.conectado ? (
                  <Button
                    type="button"
                    onClick={handleConectarBling}
                    disabled={iniciandoConexao}
                    className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2 h-9 px-4"
                  >
                    {iniciandoConexao ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plug className="w-4 h-4" />
                    )}
                    {iniciandoConexao ? 'Aguardando autorização...' : 'CONECTAR AO BLING'}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      onClick={handleConectarBling}
                      disabled={iniciandoConexao}
                      variant="outline"
                      className="border-slate-300 text-[#0F172A] font-semibold text-xs gap-1.5 h-9 px-3 hover:bg-slate-100"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      RECONECTAR
                    </Button>
                    <Button
                      type="button"
                      onClick={handleDesconectar}
                      disabled={desconectando}
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs font-semibold h-9 px-3"
                    >
                      {desconectando && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                      DESCONECTAR
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-[#64748B] block">Status OAuth</span>
              <span className="text-sm font-bold text-[#0F172A] capitalize flex items-center gap-1.5">
                {statusData.conectado ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Conectado (Ativo)
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    {statusData.status}
                  </>
                )}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-[#64748B] block">Ambiente</span>
              <span className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                Bling API v3 (Produção)
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-[#64748B] block">
                Última Renovação
              </span>
              <span className="text-xs font-mono font-medium text-[#0F172A]">
                {formatarData(statusData.ultima_renovacao, 'Nenhuma renovação')}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-[#64748B] block">
                Expiração do Access Token
              </span>
              <span className="text-xs font-mono font-medium text-[#0F172A]">
                {formatarData(statusData.expires_at, 'Não aplicável')}
              </span>
            </div>
          </div>

          {statusData.ultimo_erro && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">Último erro registrado:</strong>{' '}
                <span>{statusData.ultimo_erro}</span>
              </div>
            </div>
          )}

          {!statusData.configurado_no_servidor && !statusData.conectado && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-950">
                  Credenciais OAuth não configuradas no servidor:
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Para conectar ao Bling, os segredos <code>BLING_CLIENT_ID</code>,{' '}
                  <code>BLING_CLIENT_SECRET</code> e <code>BLING_REDIRECT_URI</code> precisam estar
                  configurados no ambiente do backend.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. SEÇÃO SINCRONIZAÇÃO — Card "Sincronização" */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[#0F172A]">Sincronização</CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Motor de leitura paginada de clientes e vendas com deduplicação, de-para e
                  idempotência.
                </CardDescription>
              </div>
            </div>

            {isCeo && (
              <Button
                type="button"
                onClick={handleSincronizar}
                disabled={sincronizando || iniciandoConexao}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs shadow-sm gap-2 h-9 px-4 flex-shrink-0"
              >
                {sincronizando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {sincronizando ? 'Sincronizando com o Bling...' : 'SINCRONIZAR AGORA'}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {sincronizando && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-[#0F172A] flex items-center gap-3 animate-pulse">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold text-blue-900">
                  Processando sincronização com a API do Bling ERP...
                </p>
                <p className="text-[11px] text-blue-700">
                  Percorrendo contatos e pedidos em modo <strong>somente leitura (GET)</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Resultado da sincronização recém-executada ou última do banco */}
          {resultadoSync && !sincronizando ? (
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
                        ? 'Sincronização com Avisos'
                        : 'Sincronização Concluída'}
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-white">
                    {resultadoSync.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duração: {Math.round(resultadoSync.duracao_ms / 1000)}s</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-white/90 p-2.5 rounded-lg border border-black/5">
                  <span className="block text-[10px] text-[#64748B] font-semibold">
                    Contatos Lidos
                  </span>
                  <span className="text-base font-bold text-[#0F172A]">
                    {resultadoSync.clientes_consultados}
                  </span>
                </div>
                <div className="bg-white/90 p-2.5 rounded-lg border border-black/5">
                  <span className="block text-[10px] text-emerald-700 font-semibold">
                    Clientes Criados
                  </span>
                  <span className="text-base font-bold text-emerald-700">
                    {resultadoSync.clientes_criados}
                  </span>
                </div>
                <div className="bg-white/90 p-2.5 rounded-lg border border-black/5">
                  <span className="block text-[10px] text-blue-700 font-semibold">Atualizados</span>
                  <span className="text-base font-bold text-blue-700">
                    {resultadoSync.clientes_atualizados}
                  </span>
                </div>
                <div className="bg-white/90 p-2.5 rounded-lg border border-black/5">
                  <span className="block text-[10px] text-purple-700 font-semibold">
                    Pedidos Lidos
                  </span>
                  <span className="text-base font-bold text-purple-700">
                    {resultadoSync.pedidos_consultados}
                  </span>
                </div>
              </div>

              {resultadoSync.mensagem && (
                <p className="text-[11px] text-[#334155] italic bg-white/70 p-2 rounded border border-black/5">
                  {resultadoSync.mensagem}
                </p>
              )}
            </div>
          ) : ultimaSyncDoHistorico ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#64748B]">
                    Última Sincronização:
                  </span>
                  <span className="font-bold text-[#0F172A]">
                    {formatarData(
                      ultimaSyncDoHistorico.finalizado_em || ultimaSyncDoHistorico.iniciado_em,
                    )}
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-white">
                    {ultimaSyncDoHistorico.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duração: {Math.round(ultimaSyncDoHistorico.duracao_ms / 1000)}s</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="block text-[10px] text-[#64748B] font-semibold">
                    Contatos Lidos
                  </span>
                  <span className="text-sm font-bold text-[#0F172A]">
                    {ultimaSyncDoHistorico.clientes_lidos}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="block text-[10px] text-emerald-700 font-semibold">Criados</span>
                  <span className="text-sm font-bold text-emerald-700">
                    {ultimaSyncDoHistorico.clientes_criados}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="block text-[10px] text-blue-700 font-semibold">Atualizados</span>
                  <span className="text-sm font-bold text-blue-700">
                    {ultimaSyncDoHistorico.clientes_atualizados}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="block text-[10px] text-purple-700 font-semibold">
                    Pedidos Lidos
                  </span>
                  <span className="text-sm font-bold text-purple-700">
                    {ultimaSyncDoHistorico.pedidos_lidos}
                  </span>
                </div>
              </div>

              {ultimaSyncDoHistorico.mensagem_resumo && (
                <p className="text-[11px] text-[#64748B] italic">
                  {ultimaSyncDoHistorico.mensagem_resumo}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-[#64748B]">
              Nenhuma sincronização foi registrada ainda. Clique em "SINCRONIZAR AGORA" para iniciar
              a primeira leitura.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. SEÇÃO CLIENTES & 5. SEÇÃO VENDAS (LADO A LADO) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SEÇÃO CLIENTES */}
        <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-[#7C3AED] flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-[#0F172A]">
                  Clientes do Bling
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Indicadores da base de clientes vinculada ao ERP.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-[#64748B] font-semibold block">
                  Total na Base
                </span>
                <span className="text-lg font-bold text-[#0F172A]">{indicadores.total}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-purple-700 font-semibold block">
                  Com Bling ID
                </span>
                <span className="text-lg font-bold text-purple-700">{indicadores.comBlingId}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
                <span className="text-[10px] text-emerald-800 font-semibold block">
                  Clientes Ativos (&lt; 6 meses)
                </span>
                <span className="text-lg font-bold text-emerald-700">{indicadores.ativos}</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
                <span className="text-[10px] text-amber-800 font-semibold block">
                  Para Reativação (&gt; 6 meses)
                </span>
                <span className="text-lg font-bold text-amber-700">
                  {indicadores.paraReativacao}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SEÇÃO VENDAS */}
        <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#16A34A] flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-[#0F172A]">
                  Vendas / Pedidos
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Consolidação do histórico comercial (sem mutação de dados).
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-[#64748B] font-semibold block">
                  Clientes com Histórico
                </span>
                <span className="text-lg font-bold text-[#0F172A]">{indicadores.comCompras}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-[#64748B] font-semibold block">
                  Última Data Processada
                </span>
                <span className="text-sm font-bold text-[#0F172A] mt-1 block">
                  {indicadores.ultimaDataProcessada || '—'}
                </span>
              </div>
              <div className="col-span-2 p-3.5 rounded-xl bg-blue-50/60 border border-blue-200">
                <span className="text-[10px] text-blue-800 font-semibold block">
                  Valor Total Consolidado em Vendas
                </span>
                <span className="text-xl font-bold text-blue-900 mt-0.5 block">
                  {formatarMoeda(indicadores.valorTotalConsolidado)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 6. SEÇÃO LOGS — Histórico da coleção bling_sync_logs */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#0F172A] flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[#0F172A]">
                  Histórico de Sincronizações (Logs)
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Auditoria completa das execuções na coleção <code>bling_sync_logs</code>. Tokens
                  nunca são registrados.
                </CardDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={carregarLogs}
              disabled={carregandoLogs}
              className="text-xs h-8 px-3 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${carregandoLogs ? 'animate-spin' : ''}`} />
              <span>Atualizar logs</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              Nenhum registro de log encontrado na coleção <code>bling_sync_logs</code>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                    <TableHead className="text-xs font-bold text-[#0F172A]">Data / Hora</TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A]">Usuário</TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A]">Status</TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A] text-right">
                      Contatos
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A] text-right">
                      Criados
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A] text-right">
                      Atualizados
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A] text-right">
                      Pedidos
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A] text-right">
                      Duração
                    </TableHead>
                    <TableHead className="text-xs font-bold text-[#0F172A] text-center">
                      Detalhes
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const statusClass =
                      log.status === 'sucesso'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : log.status === 'sucesso_parcial'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : log.status === 'processando'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-red-50 text-red-800 border-red-200'

                    const temErros =
                      (Array.isArray(log.erros) && log.erros.length > 0) ||
                      (typeof log.erros === 'string' && log.erros.length > 0)

                    return (
                      <TableRow key={log.id} className="text-xs hover:bg-slate-50/60">
                        <TableCell className="font-mono text-[11px]">
                          {formatarData(log.finalizado_em || log.iniciado_em)}
                        </TableCell>
                        <TableCell>
                          {log.expand?.usuario?.nome || log.expand?.usuario?.email || 'Sistema'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${statusClass}`}
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {log.clientes_lidos}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-700">
                          {log.clientes_criados}
                        </TableCell>
                        <TableCell className="text-right font-medium text-blue-700">
                          {log.clientes_atualizados}
                        </TableCell>
                        <TableCell className="text-right font-medium text-purple-700">
                          {log.pedidos_lidos}
                        </TableCell>
                        <TableCell className="text-right text-[#64748B]">
                          {Math.round((log.duracao_ms || 0) / 1000)}s
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setLogModalDetalhe(log)}
                            className="h-7 px-2 text-xs text-[#2563EB] hover:text-[#1D4ED8]"
                          >
                            Ver detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes do Log */}
      <Dialog
        open={Boolean(logModalDetalhe)}
        onOpenChange={(aberto) => !aberto && setLogModalDetalhe(null)}
      >
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#2563EB]" />
              Detalhes da Execução de Sincronização
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Identificador do log: <code>{logModalDetalhe?.id}</code>
            </DialogDescription>
          </DialogHeader>

          {logModalDetalhe && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-[#64748B] block">Início</span>
                  <span className="font-mono font-medium">
                    {formatarData(logModalDetalhe.iniciado_em)}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-[#64748B] block">Término</span>
                  <span className="font-mono font-medium">
                    {formatarData(logModalDetalhe.finalizado_em)}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-[#64748B] block">Duração Total</span>
                  <span className="font-medium">
                    {Math.round((logModalDetalhe.duracao_ms || 0) / 1000)}s (
                    {logModalDetalhe.duracao_ms} ms)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                  Resumo
                </span>
                <p className="text-xs text-[#0F172A] leading-relaxed">
                  {logModalDetalhe.mensagem_resumo || 'Sem mensagem descritiva.'}
                </p>
              </div>

              {/* Erros registrados */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                  Ocorrências e Erros (Sem tokens ou segredos)
                </span>
                {Array.isArray(logModalDetalhe.erros) && logModalDetalhe.erros.length > 0 ? (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 max-h-48 overflow-y-auto space-y-1 text-[11px] text-red-900">
                    <ul className="list-disc list-inside space-y-1 font-mono text-[10px]">
                      {logModalDetalhe.erros.map((e, idx) => (
                        <li key={idx}>{String(e)}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                    Nenhum erro registrado nesta execução.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 7. SEÇÃO DIAGNÓSTICO — Somente CEO */}
      {isCeo && (
        <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#0F172A] flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-[#0F172A]">
                    Diagnóstico da Conexão (Somente CEO)
                  </CardTitle>
                  <CardDescription className="text-xs text-[#64748B]">
                    Verificação técnica da infraestrutura OAuth e endpoints. Zero tokens expostos.
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] bg-white text-slate-600">
                Acesso Exclusivo CEO
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-semibold text-[#64748B] block">
                  OAuth Configurado no Servidor
                </span>
                <span className="text-sm font-bold text-[#0F172A]">
                  {statusData.configurado_no_servidor
                    ? 'Sim (Secrets ativos)'
                    : 'Pendente (Secrets ausentes)'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-semibold text-[#64748B] block">
                  Conexão Ativa
                </span>
                <span className="text-sm font-bold text-[#0F172A]">
                  {statusData.conectado ? 'Sim (Conectado)' : 'Não'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-semibold text-[#64748B] block">
                  Expiração do Access Token
                </span>
                <span className="text-xs font-mono font-medium text-[#0F172A]">
                  {formatarData(statusData.expires_at, 'Não aplicável')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-semibold text-[#64748B] block">
                  Última Renovação (Refresh)
                </span>
                <span className="text-xs font-mono font-medium text-[#0F172A]">
                  {formatarData(statusData.ultima_renovacao, 'Nenhuma')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-semibold text-[#64748B] block">
                  Callback do OAuth Disponível
                </span>
                <span className="text-xs font-mono text-emerald-700 font-semibold block truncate">
                  /backend/v1/bling/callback
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-semibold text-[#64748B] block">
                  Última Sincronização
                </span>
                <span className="text-xs font-mono font-medium text-[#0F172A]">
                  {ultimaSyncDoHistorico
                    ? formatarData(
                        ultimaSyncDoHistorico.finalizado_em || ultimaSyncDoHistorico.iniciado_em,
                      )
                    : 'Nenhuma'}
                </span>
              </div>
            </div>

            {statusData.ultimo_erro && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
                <strong>Último Erro:</strong> {statusData.ultimo_erro}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 8. SEÇÃO CONFIGURAÇÕES — Bloco somente leitura/visual */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#0F172A] flex items-center justify-center flex-shrink-0">
              <Sliders className="w-5 h-5 text-[#16A34A]" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-[#0F172A]">
                Configurações da Integração
              </CardTitle>
              <CardDescription className="text-xs text-[#64748B]">
                Parâmetros operacionais e travas de segurança do CRM Colesel 45.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-[#64748B] block">
                Modo de Operação
              </span>
              <span className="text-sm font-bold text-[#16A34A] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                SOMENTE LEITURA
              </span>
              <p className="text-[11px] text-[#64748B]">
                O CRM nunca altera dados na base do Bling ERP.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-[#64748B] block">
                Entidades Sincronizadas
              </span>
              <span className="text-sm font-bold text-[#0F172A]">
                Contatos / Clientes + Pedidos / Vendas
              </span>
              <p className="text-[11px] text-[#64748B]">
                Escopo de menor privilégio: contatos e pedidos de vendas.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-[#64748B] block">
                Tipo de Sincronização
              </span>
              <span className="text-sm font-bold text-[#0F172A]">Manual sob Demanda</span>
              <p className="text-[11px] text-[#64748B]">
                Disparo controlado pelo perfil CEO / Financeiro.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-[#64748B] block">
                Read-Only Guard
              </span>
              <span className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                ATIVO (CI + Testes Vitest)
              </span>
              <p className="text-[11px] text-[#64748B]">
                Verificação estática bloqueia qualquer método POST/PUT/DELETE.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-[#64748B] block">
                Status do Protocolo OAuth
              </span>
              <span className="text-sm font-bold text-[#0F172A]">RFC 6749 (Bling API v3)</span>
              <p className="text-[11px] text-[#64748B]">
                Troca e renovação de token segura no backend.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-semibold text-[#64748B] block">
                Métodos HTTP Permitidos
              </span>
              <span className="text-sm font-bold text-slate-700 font-mono">
                GET (dados) | POST (apenas /oauth/token)
              </span>
              <p className="text-[11px] text-[#64748B]">Travado por arquitetura imutável.</p>
            </div>
          </div>

          {/* FUTURAS EXTENSÕES: Preparação de layout (Em breve) */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-[#7C3AED]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                Extensões Planejadas do Módulo Bling ERP (Em Breve)
              </h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-500">
                <span className="block font-semibold text-[11px] text-[#0F172A]">Produtos</span>
                <span className="text-[10px] text-slate-400">Em breve</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-500">
                <span className="block font-semibold text-[11px] text-[#0F172A]">Estoque</span>
                <span className="text-[10px] text-slate-400">Em breve</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-500">
                <span className="block font-semibold text-[11px] text-[#0F172A]">
                  Pedidos Detalhados
                </span>
                <span className="text-[10px] text-slate-400">Em breve</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-500">
                <span className="block font-semibold text-[11px] text-[#0F172A]">
                  Sincronização Auto
                </span>
                <span className="text-[10px] text-slate-400">Em breve</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-500">
                <span className="block font-semibold text-[11px] text-[#0F172A]">Mapeamentos</span>
                <span className="text-[10px] text-slate-400">Em breve</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-500">
                <span className="block font-semibold text-[11px] text-[#0F172A]">Webhooks</span>
                <span className="text-[10px] text-slate-400">Em breve</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
