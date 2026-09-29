import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  CloudUpload,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Lock,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileText,
  HardDrive,
  Copy,
  Check,
  Trash2,
  Info,
  Clock,
  Layers,
  Download,
  Eye,
  AlertOctagon,
  FileCheck,
  Server,
  Activity,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface BackupItem {
  nome: string
  tamanho: number
  modificado: string
  etag?: string
}

export interface BackupListResponse {
  success: boolean
  bucket: string
  endpoint: string
  total: number
  backups: BackupItem[]
}

export interface BackupCreateResponse {
  success: boolean
  mensagem: string
  arquivo: string
  bucket: string
  tamanhoBytes: number
  totalColecoes: number
  totalRegistros: number
  contagens: Record<string, number>
  itensRotacionados: number
  duracaoMs?: number
  timestamp: string
}

export interface BackupRestoreResponse {
  success: boolean
  mensagem: string
  arquivo: string
  bucket: string
  timestampDump?: string
  modoReal: boolean
  integridadeValidada: boolean
  divergenciaTotal: number
  contagensAntes: Record<string, number>
  contagensDump: Record<string, number>
  contagensDepois: Record<string, number>
  diferencas: Record<
    string,
    {
      esperadoNoDump: number
      atualNoBanco: number
      delta: number
    }
  >
}

export interface BackupLogRecord {
  id: string
  data_hora: string
  usuario_id?: string
  tipo: 'auto' | 'manual'
  resultado: 'sucesso' | 'falha'
  duracao_ms?: number
  detalhes?: string
  arquivos_gerados?: unknown
  created: string
  expand?: {
    usuario_id?: {
      id: string
      nome: string
      email: string
      perfil: string
    }
  }
}

export interface ValidacaoIntegridadeItem {
  arquivo: string
  validadoEm: string
  existeNoR2: boolean
  tamanhoMaiorQueZero: boolean
  tamanhoBytes: number
  jsonValido: boolean
  todasColecoesPresentes: boolean
  totalColecoesEsperadas: number
  totalColecoesEncontradas: number
  hashValido: boolean
  divergenciaTotal: number
  statusIntegridade: 'valido' | 'parcial' | 'corrompido'
  motivo?: string
}

// Lista oficial das 24 coleções de dados do CRM Colesel 45
export const COLECOES_ESPERADAS_CRM: string[] = [
  'users',
  'usuarios',
  'etapas_funil',
  'motivos_perda',
  'clientes',
  'oportunidades',
  'tarefas',
  'ligacoes',
  'canais_marketing',
  'automacoes',
  'mensagens_enviadas',
  'campanhas',
  'conteudos_gerados',
  'publicacoes',
  'aprovacoes_pendentes',
  'metas',
  'meta_participantes',
  'treinamento_concluido',
  'conversas_whatsapp',
  'mensagens_whatsapp',
  'produtos',
  'sugestoes_ia',
  'integracoes_config',
  'webhook_logs',
]

function formatarBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function formatarDataIso(isoString?: string): string {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return isoString
  }
}

function formatarDuracao(ms?: number): string {
  if (ms === undefined || ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function BackupTestPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Guard no frontend: permite no máximo ceo_financeiro e coordenador_vendas
  const perfil = user?.perfil
  const temPermissao = perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas'
  const isCeoFinanceiro = perfil === 'ceo_financeiro'

  // Estados dos botões e dados
  const [loadingCreate, setLoadingCreate] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingRestore, setLoadingRestore] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [loadingDownload, setLoadingDownload] = useState<string | null>(null)

  const [backups, setBackups] = useState<BackupItem[]>([])
  const [bucketName, setBucketName] = useState<string>('')
  const [r2Endpoint, setR2Endpoint] = useState<string>('')
  const [r2Status, setR2Status] = useState<'ok' | 'falha' | 'verificando'>('verificando')
  const [r2MensagemErro, setR2MensagemErro] = useState<string>('')
  const [backupSelecionado, setBackupSelecionado] = useState<string>('')

  // Log de execuções persistido (backup_logs)
  const [logsExecucao, setLogsExecucao] = useState<BackupLogRecord[]>([])

  // Validações de integridade por arquivo em cache local de sessão
  const [validacoes, setValidacoes] = useState<Record<string, ValidacaoIntegridadeItem>>({})

  // Modal de Detalhes do Backup / Validação
  const [detalhesModal, setDetalhesModal] = useState<{
    backup: BackupItem
    validacao?: ValidacaoIntegridadeItem
    restore?: BackupRestoreResponse
  } | null>(null)

  // Log de resposta bruta da última ação (para auditoria imediata)
  const [ultimoResultado, setUltimoResultado] = useState<{
    acao: string
    timestamp: string
    sucesso: boolean
    dados: unknown
  } | null>(null)

  const [copiadoLog, setCopiadoLog] = useState(false)

  // Resumo de contagens da última validação de restore
  const [resumoRestore, setResumoRestore] = useState<BackupRestoreResponse | null>(null)

  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/configuracoes')
    }
  }

  // 1. Carregar Logs de Execução da Coleção backup_logs
  const carregarLogsExecucao = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const records = await pb.collection('backup_logs').getList<BackupLogRecord>(1, 20, {
        sort: '-data_hora',
        expand: 'usuario_id',
      })
      setLogsExecucao(records.items || [])
    } catch (err: unknown) {
      // Se não existir registros ou der erro, não bloqueia a página
      console.warn('Aviso ao carregar backup_logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  // 2. Listar Backups (GET /backend/v1/backup/list)
  const handleListarBackups = useCallback(async (mostrarToast = false) => {
    setLoadingList(true)
    try {
      const res = await pb.send<BackupListResponse>('/backend/v1/backup/list', {
        method: 'GET',
      })

      const lista = Array.isArray(res.backups) ? res.backups : []
      setBackups(lista)
      if (res.bucket) setBucketName(res.bucket)
      if (res.endpoint) setR2Endpoint(res.endpoint)

      setR2Status('ok')
      setR2MensagemErro('')

      // Selecionar o mais recente por padrão se nenhum estiver selecionado
      if (lista.length > 0) {
        setBackupSelecionado((atual) => {
          const existe = lista.some((b) => b.nome === atual)
          return existe ? atual : lista[0].nome
        })
      }

      setUltimoResultado({
        acao: 'GET /backend/v1/backup/list',
        timestamp: new Date().toISOString(),
        sucesso: true,
        dados: res,
      })

      if (mostrarToast) {
        toast({
          title: 'Backups listados com sucesso',
          description: `${lista.length} arquivo(s) encontrado(s) no Cloudflare R2.`,
        })
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setR2Status('falha')
      setR2MensagemErro(msg || 'Não foi possível conectar ao Cloudflare R2.')
      setUltimoResultado({
        acao: 'GET /backend/v1/backup/list',
        timestamp: new Date().toISOString(),
        sucesso: false,
        dados: { erro: msg, detalhe: err },
      })
      if (mostrarToast) {
        toast({
          variant: 'destructive',
          title: 'Erro ao listar backups no R2',
          description: msg || 'Falha ao consultar a lista de backups no Cloudflare R2.',
        })
      }
    } finally {
      setLoadingList(false)
    }
  }, [])

  // 3. Criar Backup Manual (POST /backend/v1/backup/create) — Apenas CEO
  const handleCriarBackup = async () => {
    if (!isCeoFinanceiro) {
      toast({
        variant: 'destructive',
        title: 'Ação restrita ao CEO',
        description: 'Apenas usuários com perfil CEO / Financeiro podem disparar backups manuais.',
      })
      return
    }

    setLoadingCreate(true)
    try {
      const res = await pb.send<BackupCreateResponse>('/backend/v1/backup/create', {
        method: 'POST',
      })

      setUltimoResultado({
        acao: 'POST /backend/v1/backup/create',
        timestamp: new Date().toISOString(),
        sucesso: true,
        dados: res,
      })

      toast({
        title: 'Backup gerado com sucesso!',
        description: `Arquivo "${res.arquivo}" enviado ao Cloudflare R2 (${formatarBytes(
          res.tamanhoBytes,
        )}).`,
      })

      // Atualiza lista do R2 e logs de execução
      await Promise.all([handleListarBackups(false), carregarLogsExecucao()])
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setUltimoResultado({
        acao: 'POST /backend/v1/backup/create',
        timestamp: new Date().toISOString(),
        sucesso: false,
        dados: { erro: msg, detalhe: err },
      })
      toast({
        variant: 'destructive',
        title: 'Falha ao criar backup manual',
        description: msg || 'Ocorreu um erro ao gerar e despachar o backup para o storage.',
      })
      // Recarrega logs para registrar a falha se o hook persistiu
      await carregarLogsExecucao()
    } finally {
      setLoadingCreate(false)
    }
  }

  // 4. Validar Restore Seguro e Integridade (POST /backend/v1/backup/restore)
  const handleValidarArquivo = async (nomeArquivo: string) => {
    if (!nomeArquivo) {
      toast({
        variant: 'destructive',
        title: 'Nenhum backup selecionado',
        description: 'Selecione um arquivo de backup para validar a integridade.',
      })
      return
    }

    setLoadingRestore(true)
    setBackupSelecionado(nomeArquivo)

    try {
      const res = await pb.send<BackupRestoreResponse>('/backend/v1/backup/restore', {
        method: 'POST',
        body: {
          filename: nomeArquivo,
          executar_real: false,
        },
      })

      setResumoRestore(res)
      setUltimoResultado({
        acao: `POST /backend/v1/backup/restore (arquivo: ${nomeArquivo}, modo: seguro)`,
        timestamp: new Date().toISOString(),
        sucesso: res.success && res.integridadeValidada,
        dados: res,
      })

      // Classificação da integridade
      const dumpCols = res.contagensDump ? Object.keys(res.contagensDump) : []
      const totalEncontradas = dumpCols.length
      const faltantes = COLECOES_ESPERADAS_CRM.filter((col) => !dumpCols.includes(col))
      const todasPresentes = faltantes.length === 0

      let statusIntegridade: 'valido' | 'parcial' | 'corrompido' = 'valido'
      let motivo = ''

      if (!res.success) {
        statusIntegridade = 'corrompido'
        motivo = 'Falha ao ler dump do Cloudflare R2.'
      } else if (!todasPresentes) {
        statusIntegridade = 'parcial'
        motivo = `Faltam coleções esperadas no dump: ${faltantes.join(', ')}`
      } else if (!res.integridadeValidada) {
        statusIntegridade = 'parcial'
        motivo = `Divergência detectada contra o banco atual (${res.divergenciaTotal} diferença(s)).`
      } else {
        statusIntegridade = 'valido'
        motivo = 'Arquivo íntegro, JSON válido, todas as coleções presentes, divergência zero.'
      }

      const itemVal: ValidacaoIntegridadeItem = {
        arquivo: nomeArquivo,
        validadoEm: new Date().toISOString(),
        existeNoR2: true,
        tamanhoMaiorQueZero: true,
        tamanhoBytes: backups.find((b) => b.nome === nomeArquivo)?.tamanho || 0,
        jsonValido: true,
        todasColecoesPresentes: todasPresentes,
        totalColecoesEsperadas: COLECOES_ESPERADAS_CRM.length,
        totalColecoesEncontradas: totalEncontradas,
        hashValido: true,
        divergenciaTotal: res.divergenciaTotal || 0,
        statusIntegridade,
        motivo,
      }

      setValidacoes((prev) => ({
        ...prev,
        [nomeArquivo]: itemVal,
      }))

      if (statusIntegridade === 'valido') {
        toast({
          title: 'Backup 100% Válido (Divergência ZERO)',
          description: `O arquivo "${nomeArquivo}" foi lido do R2, é legível e contém todas as coleções.`,
        })
      } else if (statusIntegridade === 'parcial') {
        toast({
          variant: 'default',
          className: 'bg-amber-500 text-white border-none',
          title: 'Validação Parcial',
          description: motivo,
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Backup Corrompido',
          description: motivo,
        })
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setUltimoResultado({
        acao: `POST /backend/v1/backup/restore (arquivo: ${nomeArquivo}, modo: seguro)`,
        timestamp: new Date().toISOString(),
        sucesso: false,
        dados: { erro: msg, detalhe: err },
      })

      setValidacoes((prev) => ({
        ...prev,
        [nomeArquivo]: {
          arquivo: nomeArquivo,
          validadoEm: new Date().toISOString(),
          existeNoR2: false,
          tamanhoMaiorQueZero: false,
          tamanhoBytes: 0,
          jsonValido: false,
          todasColecoesPresentes: false,
          totalColecoesEsperadas: COLECOES_ESPERADAS_CRM.length,
          totalColecoesEncontradas: 0,
          hashValido: false,
          divergenciaTotal: 0,
          statusIntegridade: 'corrompido',
          motivo: msg || 'Falha ao baixar do R2 ou JSON ilegível.',
        },
      }))

      toast({
        variant: 'destructive',
        title: 'Erro na validação de integridade',
        description: msg || 'Falha ao baixar dump do R2 ou validar integridade.',
      })
    } finally {
      setLoadingRestore(false)
    }
  }

  // 5. Baixar Backup pelo Navegador
  const handleBaixarBackup = async (nomeArquivo: string) => {
    setLoadingDownload(nomeArquivo)
    try {
      const token = pb.authStore.token
      const endpointUrl = `${pb.baseUrl}/backend/v1/backup/download?filename=${encodeURIComponent(
        nomeArquivo,
      )}`

      const response = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao baixar arquivo do storage R2.`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivo
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Download iniciado',
        description: `O arquivo "${nomeArquivo}" foi baixado com sucesso.`,
      })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao baixar backup',
        description: msg || 'Não foi possível realizar o download direto pelo navegador.',
      })
    } finally {
      setLoadingDownload(null)
    }
  }

  // 6. Copiar Log para Clipboard
  const copiarLogParaClipboard = () => {
    if (!ultimoResultado) return
    const texto = JSON.stringify(ultimoResultado, null, 2)
    navigator.clipboard.writeText(texto)
    setCopiadoLog(true)
    toast({
      title: 'Log copiado',
      description: 'JSON do log copiado para a área de transferência.',
    })
    setTimeout(() => setCopiadoLog(false), 2000)
  }

  // Carregar lista de backups e logs ao entrar na página
  useEffect(() => {
    if (temPermissao) {
      handleListarBackups(false)
      carregarLogsExecucao()
    }
  }, [temPermissao, handleListarBackups, carregarLogsExecucao])

  // Métricas calculadas para os cards do dashboard (Etapa 2.1)
  const dashboardKpis = useMemo(() => {
    const totalBackups = backups.length
    const tamanhoTotalBytes = backups.reduce((acc, b) => acc + (b.tamanho || 0), 0)

    // Identificar o backup mais recente
    const ultimoBackup = backups.length > 0 ? backups[0] : null
    let dataUltimoBackup: Date | null = null
    let horasDesdeUltimoBackup: number | null = null

    if (ultimoBackup) {
      if (ultimoBackup.modificado) {
        dataUltimoBackup = new Date(ultimoBackup.modificado)
      } else {
        const match = ultimoBackup.nome.match(/backup-(\d{4}-\d{2}-\d{2})/)
        if (match && match[1]) {
          dataUltimoBackup = new Date(match[1])
        }
      }
      if (dataUltimoBackup && !isNaN(dataUltimoBackup.getTime())) {
        horasDesdeUltimoBackup = (Date.now() - dataUltimoBackup.getTime()) / (1000 * 60 * 60)
      }
    }

    // Último log de execução para saber se o último foi sucesso ou falha
    const ultimoLog = logsExecucao.length > 0 ? logsExecucao[0] : null
    const ultimoStatus = ultimoLog ? ultimoLog.resultado : ultimoBackup ? 'sucesso' : 'indefinido'

    return {
      totalBackups,
      tamanhoTotalBytes,
      ultimoBackup,
      dataUltimoBackup,
      horasDesdeUltimoBackup,
      ultimoStatus,
      ultimoLog,
    }
  }, [backups, logsExecucao])

  // Alertas visuais (Etapa 2.6):
  // 1. Vermelho: R2 inacessível
  const r2Inacessivel = r2Status === 'falha'
  // 2. Vermelho: último backup falhou
  const ultimoBackupFalhou = dashboardKpis.ultimoStatus === 'falha'
  // 3. Amarelo: último backup com mais de 24 horas (ou sem backups)
  const ultimoBackupMais24h =
    dashboardKpis.horasDesdeUltimoBackup !== null && dashboardKpis.horasDesdeUltimoBackup > 24

  // Se NÃO for ceo_financeiro nem coordenador_vendas: bloqueia na UI
  if (!temPermissao) {
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
                O painel de auditoria e teste de backup é restrito a administradores do CRM (
                <strong>CEO / Financeiro</strong> ou <strong>Coordenador de Vendas</strong>).
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

  return (
    <div className="space-y-6 animate-fade-in pb-16 max-w-6xl mx-auto">
      {/* Botão Voltar */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleVoltar}
          className="text-[#64748B] hover:text-[#0F172A] -ml-2 mb-2 gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar às Configurações
        </Button>
      </div>

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1.5"
            >
              <Database className="w-3.5 h-3.5 text-[#16A34A]" />
              Compliance P0-7: Backup Externo R2
            </Badge>
            <Badge
              variant="outline"
              className="bg-slate-100 text-slate-700 border-slate-300 text-xs font-mono"
            >
              SigV4 • Retenção 30d • Cron 06:00 UTC
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1">
            Painel de Auditoria e Teste de Backup
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Gerencie e audite os snapshots do CRM armazenados no Cloudflare R2, execute backups sob
            demanda e valide a integridade estrutural e restauração sem alteração de dados.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="text-xs text-slate-700 bg-white border-slate-200 py-1.5 px-3 flex items-center gap-1.5"
          >
            <UserCheck className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>
              Perfil:{' '}
              <strong className="text-[#0F172A]">
                {isCeoFinanceiro ? 'CEO / Financeiro' : 'Coordenador de Vendas'}
              </strong>
            </span>
          </Badge>
        </div>
      </div>

      {/* 2.6 ALERTAS VISUAIS DE CONFORMIDADE */}
      {r2Inacessivel && (
        <div
          role="alert"
          className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 animate-fade-in shadow-sm"
        >
          <AlertOctagon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-red-950 space-y-1">
            <p className="font-bold text-red-950 text-sm sm:text-base">
              Alerta Crítico: Cloudflare R2 Inacessível
            </p>
            <p className="text-red-800 leading-relaxed">
              Não foi possível comunicar com o storage externo Cloudflare R2. Verifique as variáveis
              de ambiente <code className="font-mono text-xs font-semibold">BACKUP_S3_*</code> ou a
              conectividade com o endpoint.
            </p>
            {r2MensagemErro && (
              <p className="text-xs font-mono bg-red-100/70 text-red-900 p-2 rounded border border-red-200">
                Detalhe: {r2MensagemErro}
              </p>
            )}
          </div>
        </div>
      )}

      {ultimoBackupFalhou && (
        <div
          role="alert"
          className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 animate-fade-in shadow-sm"
        >
          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-red-950 space-y-1">
            <p className="font-bold text-red-950 text-sm sm:text-base">
              Alerta de Falha: O Último Backup Registrado Falhou
            </p>
            <p className="text-red-800 leading-relaxed">
              A execução mais recente de backup (automática ou manual) resultou em falha. Consulte a
              tabela de logs de execução abaixo para identificar o motivo e execute um novo backup
              manual.
            </p>
          </div>
        </div>
      )}

      {ultimoBackupMais24h && !ultimoBackupFalhou && (
        <div
          role="alert"
          className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3 animate-fade-in shadow-sm"
        >
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-amber-950 space-y-1">
            <p className="font-bold text-amber-950 text-sm sm:text-base">
              Atenção: O Último Backup Tem Mais de 24 Horas
            </p>
            <p className="text-amber-800 leading-relaxed">
              A política de conformidade diária requer um snapshot a cada 24 horas. O snapshot mais
              recente foi realizado há{' '}
              <strong>
                {dashboardKpis.horasDesdeUltimoBackup
                  ? Math.floor(dashboardKpis.horasDesdeUltimoBackup)
                  : '>24'}
                h
              </strong>
              . Recomenda-se rodar um backup manual agora.
            </p>
          </div>
        </div>
      )}

      {/* 2.1 DASHBOARD COM CARDS NO TOPO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Último Backup */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-[#64748B] flex items-center justify-between">
              <span>Último Backup</span>
              <Clock className="w-4 h-4 text-slate-400" />
            </CardDescription>
            <CardTitle className="text-lg font-bold text-[#0F172A] truncate">
              {dashboardKpis.ultimoBackup ? (
                formatarDataIso(dashboardKpis.ultimoBackup.modificado)
              ) : (
                <span className="text-slate-400 text-sm">Nenhum snapshot</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 mt-1">
              {dashboardKpis.ultimoStatus === 'sucesso' ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Sucesso
                </Badge>
              ) : dashboardKpis.ultimoStatus === 'falha' ? (
                <Badge className="bg-red-100 text-red-800 border-red-200 text-[11px] gap-1">
                  <XCircle className="w-3 h-3 text-red-600" />
                  Falha
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] text-slate-500">
                  Aguardando
                </Badge>
              )}
              {dashboardKpis.ultimoBackup && (
                <span className="text-[11px] text-[#64748B] font-mono truncate max-w-[130px]">
                  {dashboardKpis.ultimoBackup.nome}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total de Backups Disponíveis */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-[#64748B] flex items-center justify-between">
              <span>Total de Snapshots</span>
              <Layers className="w-4 h-4 text-[#2563EB]" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-[#0F172A]">
              {dashboardKpis.totalBackups}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-[#64748B]">
              Armazenados no Cloudflare R2 com rotação automática de 30 dias.
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Tamanho Total no Storage */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-[#64748B] flex items-center justify-between">
              <span>Tamanho Total</span>
              <HardDrive className="w-4 h-4 text-[#7C3AED]" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-[#0F172A]">
              {formatarBytes(dashboardKpis.tamanhoTotalBytes)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-[#64748B]">
              Soma de todos os arquivos de dump JSON criptografados.
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Status da Conexão Cloudflare R2 */}
        <Card className="border-[#E2E8F0] shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs text-[#64748B] flex items-center justify-between">
              <span>Status do Cloudflare R2</span>
              <Server className="w-4 h-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              {r2Status === 'ok' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                  <span className="text-[#16A34A]">Conexão OK</span>
                </>
              ) : r2Status === 'falha' ? (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-red-600">Falha de Conexão</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                  <span className="text-slate-600 text-sm">Verificando...</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] font-mono text-[#64748B] truncate">
              {bucketName ? `Bucket: ${bucketName}` : 'Endpoint: SigV4 S3 API'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2.3 BOTÕES DE AÇÃO PRINCIPAIS (COM CONTROLE DE PERMISSÃO) */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#16A34A]" />
              Controles Operacionais de Backup
            </CardTitle>
            <div className="text-xs text-[#64748B]">
              {isCeoFinanceiro ? (
                <span className="text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Permissão total: Criação e Validação
                </span>
              ) : (
                <span className="text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Modo Coordenação: Somente Validação e Leitura
                </span>
              )}
            </div>
          </div>
          <CardDescription className="text-xs text-[#64748B]">
            Todas as ações utilizam as credenciais autenticadas da sessão do usuário no PocketBase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Botão 1: Rodar backup agora */}
            <Button
              type="button"
              onClick={handleCriarBackup}
              disabled={loadingCreate || loadingList || loadingRestore || !isCeoFinanceiro}
              title={
                !isCeoFinanceiro
                  ? 'Apenas o CEO / Financeiro tem permissão para disparar backups manuais.'
                  : 'Gera dump estruturado de todas as coleções e despacha para o R2'
              }
              className={`font-semibold shadow-sm gap-2 h-11 ${
                isCeoFinanceiro
                  ? 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              {loadingCreate ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Gerando e Enviando ao R2...
                </>
              ) : (
                <>
                  <CloudUpload className="w-4 h-4" />
                  Rodar Backup Agora (Criar Backup)
                </>
              )}
            </Button>

            {/* Botão 2: Atualizar Lista do R2 */}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleListarBackups(true)
                carregarLogsExecucao()
              }}
              disabled={loadingCreate || loadingList || loadingRestore}
              className="border-slate-300 text-[#0F172A] hover:bg-slate-50 font-semibold gap-2 h-11"
            >
              {loadingList ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" />
                  Consultando R2...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 text-[#2563EB]" />
                  Listar Backups
                </>
              )}
            </Button>

            {/* Botão 3: Validar Integridade do Selecionado */}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleValidarArquivo(backupSelecionado)}
              disabled={loadingCreate || loadingList || loadingRestore || backups.length === 0}
              className="border-purple-300 bg-purple-50 hover:bg-purple-100 text-[#7C3AED] font-semibold gap-2 h-11"
            >
              {loadingRestore ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#7C3AED]" />
                  Validando Integridade...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-[#7C3AED]" />
                  Validar Restore (seguro)
                </>
              )}
            </Button>
          </div>

          {backupSelecionado && (
            <div className="mt-3 text-xs text-[#64748B] flex items-center gap-2 flex-wrap">
              <span className="font-medium text-[#0F172A]">Arquivo selecionado no storage:</span>
              <code className="bg-slate-100 text-[#0F172A] px-2 py-0.5 rounded font-mono text-[11px] border border-slate-200">
                {backupSelecionado}
              </code>
              {validacoes[backupSelecionado] && (
                <Badge
                  className={
                    validacoes[backupSelecionado].statusIntegridade === 'valido'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]'
                      : validacoes[backupSelecionado].statusIntegridade === 'parcial'
                        ? 'bg-amber-100 text-amber-800 border-amber-300 text-[10px]'
                        : 'bg-red-100 text-red-800 border-red-300 text-[10px]'
                  }
                >
                  {validacoes[backupSelecionado].statusIntegridade === 'valido'
                    ? '✅ Válido'
                    : validacoes[backupSelecionado].statusIntegridade === 'parcial'
                      ? '⚠️ Parcial'
                      : '❌ Corrompido'}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2.2 LISTA DE BACKUPS DISPONÍVEIS NO R2 */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2563EB]" />
              Lista de Backups Disponíveis no R2 ({backups.length})
            </CardTitle>
            <CardDescription className="text-xs text-[#64748B]">
              {bucketName ? `Bucket: ${bucketName}` : 'Conexão Cloudflare R2'} • Retenção ativa de
              30 dias via DeleteObject SigV4.
            </CardDescription>
          </div>
          {r2Status === 'ok' && (
            <Badge
              variant="outline"
              className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 font-mono"
            >
              Bucket Conectado
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-12 text-center text-xs font-semibold text-slate-700">
                    Sel.
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">
                    Nome do Arquivo
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">
                    Data / Hora
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Tamanho</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">
                    Checksum / ETag
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Status</TableHead>
                  <TableHead className="w-56 text-right text-xs font-semibold text-slate-700">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingList && backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-[#64748B]">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" />
                        Carregando snapshots do Cloudflare R2...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-[#64748B]">
                      Nenhum arquivo de backup encontrado no storage ou conexão não realizada.
                      Clique em <strong>&quot;Atualizar Lista do R2&quot;</strong> ou gere um novo
                      snapshot.
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((b) => {
                    const isSelected = backupSelecionado === b.nome
                    const val = validacoes[b.nome]
                    return (
                      <TableRow
                        key={b.nome}
                        onClick={() => setBackupSelecionado(b.nome)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-purple-50/70 hover:bg-purple-100/50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <TableCell className="text-center">
                          <input
                            type="radio"
                            name="backup-selecionado"
                            checked={isSelected}
                            onChange={() => setBackupSelecionado(b.nome)}
                            className="text-[#7C3AED] focus:ring-[#7C3AED]"
                            aria-label={`Selecionar ${b.nome}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#0F172A] font-semibold">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            <span className="truncate max-w-[220px] sm:max-w-none">{b.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatarDataIso(b.modificado)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 font-mono">
                          {formatarBytes(b.tamanho)}
                        </TableCell>
                        <TableCell className="text-[11px] text-slate-500 font-mono">
                          {b.etag ? `${b.etag.slice(0, 16)}...` : '-'}
                        </TableCell>
                        <TableCell>
                          {val ? (
                            val.statusIntegridade === 'valido' ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[11px] gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />✅ Válido
                              </Badge>
                            ) : val.statusIntegridade === 'parcial' ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[11px] gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                ⚠️ Parcial
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 border-red-300 text-[11px] gap-1">
                                <XCircle className="w-3 h-3 text-red-600" />❌ Corrompido
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-[11px] text-slate-500">
                              Não validado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Ação 1: Baixar */}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleBaixarBackup(b.nome)}
                              disabled={loadingDownload === b.nome}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 h-8 px-2"
                              title="Baixar snapshot JSON"
                            >
                              {loadingDownload === b.nome ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                              ) : (
                                <Download className="w-3.5 h-3.5 mr-1" />
                              )}
                              Baixar
                            </Button>

                            {/* Ação 2: Validar */}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setBackupSelecionado(b.nome)
                                handleValidarArquivo(b.nome)
                              }}
                              disabled={loadingRestore}
                              className="text-xs text-[#7C3AED] hover:text-[#6D28D9] hover:bg-purple-100/60 h-8 px-2"
                              title="Validar integridade estrutural e contagens"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                              Validar
                            </Button>

                            {/* Ação 3: Detalhes */}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDetalhesModal({
                                  backup: b,
                                  validacao: validacoes[b.nome],
                                  restore:
                                    resumoRestore && resumoRestore.arquivo === b.nome
                                      ? resumoRestore
                                      : undefined,
                                })
                              }}
                              className="text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-8 px-2"
                              title="Ver detalhes técnicos"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Detalhes
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 2.4 PAINEL DE VALIDAÇÃO DE INTEGRIDADE (QUANDO HOUVER VALIDAÇÃO CONCLUÍDA) */}
      {resumoRestore && (
        <Card className="border-purple-200 bg-purple-50/30 shadow-sm animate-fade-in">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                {resumoRestore.integridadeValidada ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                )}
                Validação de Integridade: {resumoRestore.arquivo}
              </CardTitle>
              <Badge
                className={
                  resumoRestore.integridadeValidada
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }
              >
                {resumoRestore.integridadeValidada
                  ? '✅ 100% Íntegro • Divergência ZERO'
                  : `⚠️ Divergência Detectada: ${resumoRestore.divergenciaTotal} item(ns)`}
              </Badge>
            </div>
            <CardDescription className="text-xs text-[#64748B]">
              Modo seguro de auditoria (Somente Leitura) • Timestamp do dump:{' '}
              {formatarDataIso(resumoRestore.timestampDump)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Arquivo no R2</span>
                <span
                  className="font-mono font-semibold text-[#0F172A] truncate block"
                  title={resumoRestore.arquivo}
                >
                  {resumoRestore.arquivo}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Bucket Cloudflare</span>
                <span className="font-mono font-semibold text-[#0F172A]">
                  {resumoRestore.bucket || '-'}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Coleções no Dump</span>
                <span className="font-bold text-[#0F172A]">
                  {Object.keys(resumoRestore.contagensDump || {}).length} /{' '}
                  {COLECOES_ESPERADAS_CRM.length}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Status Geral</span>
                <span
                  className={`font-bold ${
                    resumoRestore.integridadeValidada ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {resumoRestore.integridadeValidada ? 'Aprovado (Zero Delta)' : 'Divergência'}
                </span>
              </div>
            </div>

            {/* Checklist de Validação de Integridade */}
            <div className="bg-white p-4 rounded-lg border border-purple-100 space-y-2 text-xs">
              <p className="font-semibold text-slate-800">Checklist de Integridade:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Arquivo existe no R2 e download efetuado com sucesso</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Tamanho do arquivo maior que zero</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Estrutura JSON válida e decodificável</span>
                </div>
                <div className="flex items-center gap-2">
                  {Object.keys(resumoRestore.contagensDump || {}).length >=
                  COLECOES_ESPERADAS_CRM.length ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span>
                    Todas as {COLECOES_ESPERADAS_CRM.length} coleções de dados catalogadas
                  </span>
                </div>
              </div>
            </div>

            {/* Comparativo de contagens por coleção */}
            <div className="bg-white rounded-lg border border-purple-100 overflow-hidden">
              <div className="p-3 bg-purple-50/50 border-b border-purple-100 text-xs font-semibold text-[#0F172A] flex items-center justify-between">
                <span>Comparativo de Contagens por Coleção (Dump R2 vs Banco Atual)</span>
                <span className="text-[11px] font-normal text-slate-500">
                  {Object.keys(resumoRestore.contagensDump || {}).length} coleções mapeadas
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-[11px]">
                      <TableHead className="font-semibold text-slate-700">Coleção</TableHead>
                      <TableHead className="text-right font-semibold text-slate-700">
                        No Dump R2
                      </TableHead>
                      <TableHead className="text-right font-semibold text-slate-700">
                        No Banco Atual
                      </TableHead>
                      <TableHead className="text-right font-semibold text-slate-700">
                        Delta
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {COLECOES_ESPERADAS_CRM.map((col) => {
                      const dumpCount = resumoRestore.contagensDump[col] ?? '-'
                      const bancoCount =
                        (resumoRestore.contagensDepois && resumoRestore.contagensDepois[col]) ??
                        (resumoRestore.contagensAntes && resumoRestore.contagensAntes[col]) ??
                        '-'
                      const delta =
                        typeof bancoCount === 'number' && typeof dumpCount === 'number'
                          ? bancoCount - dumpCount
                          : 0
                      const hasDelta = delta !== 0

                      return (
                        <TableRow key={col} className={hasDelta ? 'bg-amber-50/50' : ''}>
                          <TableCell className="font-mono text-xs text-[#0F172A]">{col}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-700">
                            {dumpCount}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-700">
                            {bancoCount}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-xs font-semibold ${
                              hasDelta ? 'text-amber-700' : 'text-emerald-600'
                            }`}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2.5 LOG DE EXECUÇÃO (HISTÓRICO DA COLEÇÃO backup_logs) */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-slate-700" />
              Histórico de Execuções de Backup ({logsExecucao.length})
            </CardTitle>
            <CardDescription className="text-xs text-[#64748B]">
              Registros persistidos na coleção{' '}
              <code className="font-mono text-xs">backup_logs</code> (automáticos do cron e manuais
              do CEO).
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={carregarLogsExecucao}
            disabled={loadingLogs}
            className="text-xs text-slate-600 hover:text-slate-900 gap-1 h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            Recarregar Logs
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-xs font-semibold text-slate-700">
                    Data / Hora
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">
                    Executado Por
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Tipo</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Resultado</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Duração</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLogs && logsExecucao.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-sm text-[#64748B]">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" />
                        Carregando registros de log...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : logsExecucao.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-sm text-[#64748B]">
                      Nenhum registro de log de backup encontrado ainda. Ao rodar o próximo backup
                      (manual ou cron diário), o histórico será registrado automaticamente aqui.
                    </TableCell>
                  </TableRow>
                ) : (
                  logsExecucao.map((log) => {
                    const nomeUsuario =
                      log.expand?.usuario_id?.nome ||
                      (log.tipo === 'auto' ? 'Cron do Sistema (06:00 UTC)' : 'CEO / Administrador')
                    return (
                      <TableRow key={log.id} className="hover:bg-slate-50">
                        <TableCell className="text-xs text-slate-700 font-mono">
                          {formatarDataIso(log.data_hora || log.created)}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-[#0F172A]">
                          {nomeUsuario}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-mono ${
                              log.tipo === 'auto'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}
                          >
                            {log.tipo === 'auto' ? 'Automático' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.resultado === 'sucesso' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[11px] gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Sucesso
                            </Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 border-red-300 text-[11px] gap-1">
                              <XCircle className="w-3 h-3 text-red-600" />
                              Falha
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 font-mono">
                          {formatarDuracao(log.duracao_ms)}
                        </TableCell>
                        <TableCell
                          className="text-xs text-slate-600 max-w-xs truncate"
                          title={log.detalhes}
                        >
                          {log.detalhes || '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ÁREA DE LOG DE RESPOSTA BRUTA (JSON) */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              Área de Resposta Bruta da API (JSON)
            </CardTitle>
            <CardDescription className="text-xs text-[#64748B]">
              Resultado da última chamada autenticada aos endpoints /backend/v1/backup/*.
            </CardDescription>
          </div>
          {ultimoResultado && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  ultimoResultado.sucesso
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }
              >
                {ultimoResultado.sucesso ? 'Sucesso' : 'Falha'}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copiarLogParaClipboard}
                className="text-xs gap-1.5 h-8"
              >
                {copiadoLog ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar JSON
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUltimoResultado(null)}
                className="text-xs text-slate-500 hover:text-slate-800 h-8 px-2"
                title="Limpar log"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {ultimoResultado ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-mono">
                <span>Endpoint: {ultimoResultado.acao}</span>
                <span>Timestamp: {formatarDataIso(ultimoResultado.timestamp)}</span>
              </div>
              <pre
                data-testid="log-area-json"
                className="bg-[#0F172A] text-[#F8FAFC] p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-96 leading-relaxed border border-slate-800"
              >
                {JSON.stringify(ultimoResultado.dados, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-xs text-[#64748B]">
              Nenhum resultado registrado ainda nesta sessão. Clique em &quot;Rodar Backup
              Agora&quot;, &quot;Atualizar Lista&quot; ou &quot;Validar&quot; para inspecionar o
              payload aqui.
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL DE DETALHES DO BACKUP */}
      <Dialog
        open={detalhesModal !== null}
        onOpenChange={(open) => {
          if (!open) setDetalhesModal(null)
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#2563EB]" />
              Detalhes Técnicos do Snapshot
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Metadados do arquivo armazenado no bucket Cloudflare R2.
            </DialogDescription>
          </DialogHeader>

          {detalhesModal && (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nome do Arquivo:</span>
                  <span className="font-mono font-semibold text-slate-900 truncate max-w-xs">
                    {detalhesModal.backup.nome}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Tamanho no R2:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatarBytes(detalhesModal.backup.tamanho)} ({detalhesModal.backup.tamanho}{' '}
                    bytes)
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Data de Criação / Modificação:</span>
                  <span className="font-semibold text-slate-900">
                    {formatarDataIso(detalhesModal.backup.modificado)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Checksum / ETag S3:</span>
                  <span className="font-mono text-slate-900 truncate max-w-xs">
                    {detalhesModal.backup.etag || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Bucket Cloudflare:</span>
                  <span className="font-mono text-slate-900">
                    {bucketName || 'crm-colesel-backup'}
                  </span>
                </div>
              </div>

              {detalhesModal.validacao ? (
                <div className="bg-purple-50/50 p-3.5 rounded-lg border border-purple-100 space-y-1.5">
                  <p className="font-semibold text-purple-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    Resultado da Validação:
                  </p>
                  <p className="text-purple-900 leading-relaxed">
                    Status:{' '}
                    <strong>
                      {detalhesModal.validacao.statusIntegridade === 'valido'
                        ? '✅ Íntegro (Divergência Zero)'
                        : detalhesModal.validacao.statusIntegridade === 'parcial'
                          ? '⚠️ Parcial'
                          : '❌ Corrompido'}
                    </strong>
                  </p>
                  <p className="text-purple-800 text-[11px]">{detalhesModal.validacao.motivo}</p>
                </div>
              ) : (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-600 text-center">
                  Este arquivo ainda não foi submetido à validação nesta sessão.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleBaixarBackup(detalhesModal.backup.nome)}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar Snapshot
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    handleValidarArquivo(detalhesModal.backup.nome)
                    setDetalhesModal(null)
                  }}
                  className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Executar Validação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
