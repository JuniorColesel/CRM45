import React, { useState, useEffect } from 'react'
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

  const [backups, setBackups] = useState<BackupItem[]>([])
  const [bucketName, setBucketName] = useState<string>('')
  const [backupSelecionado, setBackupSelecionado] = useState<string>('')

  // Log de execução
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

  // 1. Listar Backups (GET /backend/v1/backup/list)
  const handleListarBackups = async (mostrarToast = true) => {
    setLoadingList(true)
    try {
      const res = await pb.send<BackupListResponse>('/backend/v1/backup/list', {
        method: 'GET',
      })

      const lista = Array.isArray(res.backups) ? res.backups : []
      setBackups(lista)
      if (res.bucket) setBucketName(res.bucket)

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
          description: `${lista.length} arquivo(s) encontrado(s) no storage Cloudflare R2.`,
        })
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setUltimoResultado({
        acao: 'GET /backend/v1/backup/list',
        timestamp: new Date().toISOString(),
        sucesso: false,
        dados: { erro: msg, detalhe: err },
      })
      toast({
        variant: 'destructive',
        title: 'Erro ao listar backups',
        description: msg || 'Falha ao consultar a lista de backups no Cloudflare R2.',
      })
    } finally {
      setLoadingList(false)
    }
  }

  // 2. Criar Backup (POST /backend/v1/backup/create)
  const handleCriarBackup = async () => {
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
        title: 'Backup criado com sucesso',
        description: `Arquivo "${res.arquivo}" enviado ao bucket ${res.bucket || 'R2'}.`,
      })

      // Atualiza lista em seguida
      await handleListarBackups(false)
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
        title: 'Falha ao criar backup',
        description: msg || 'Ocorreu um erro ao gerar e despachar o backup para o storage.',
      })
    } finally {
      setLoadingCreate(false)
    }
  }

  // 3. Validar Restore Seguro (POST /backend/v1/backup/restore com { executar_real: false })
  const handleValidarRestore = async () => {
    // Escolhe arquivo selecionado ou o mais recente da lista
    let arquivoAlvo = backupSelecionado
    if (!arquivoAlvo && backups.length > 0) {
      arquivoAlvo = backups[0].nome
    }

    if (!arquivoAlvo) {
      toast({
        variant: 'destructive',
        title: 'Nenhum backup selecionado',
        description: 'Liste os backups e selecione um arquivo para testar a validação de restore.',
      })
      return
    }

    setLoadingRestore(true)
    setResumoRestore(null)

    try {
      const res = await pb.send<BackupRestoreResponse>('/backend/v1/backup/restore', {
        method: 'POST',
        body: {
          filename: arquivoAlvo,
          executar_real: false,
        },
      })

      setResumoRestore(res)
      setUltimoResultado({
        acao: `POST /backend/v1/backup/restore (arquivo: ${arquivoAlvo}, executar_real: false)`,
        timestamp: new Date().toISOString(),
        sucesso: res.success && res.integridadeValidada,
        dados: res,
      })

      if (res.integridadeValidada) {
        toast({
          title: 'Restore validado com sucesso (Divergência ZERO)',
          description: `Snapshot "${arquivoAlvo}" íntegro. Nenhuma alteração foi realizada no banco.`,
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Validação de restore concluída com alertas',
          description: `Divergência detectada: ${res.divergenciaTotal} diferença(s) entre snapshot e banco atual.`,
        })
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setUltimoResultado({
        acao: `POST /backend/v1/backup/restore (arquivo: ${arquivoAlvo}, executar_real: false)`,
        timestamp: new Date().toISOString(),
        sucesso: false,
        dados: { erro: msg, detalhe: err },
      })
      toast({
        variant: 'destructive',
        title: 'Erro na validação de restore',
        description: msg || 'Falha ao baixar dump do R2 ou validar integridade.',
      })
    } finally {
      setLoadingRestore(false)
    }
  }

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

  // Carregar lista automaticamente ao entrar na página se tiver permissão
  useEffect(() => {
    if (temPermissao) {
      handleListarBackups(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temPermissao])

  // Se NÃO for ceo_financeiro nem coordenador_vendas: bloqueia na UI com padrão idêntico a UsuariosPage
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
                O painel de teste de backup é restrito a administradores do sistema (
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
    <div className="space-y-6 animate-fade-in pb-12 max-w-6xl mx-auto">
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
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1.5"
            >
              <Database className="w-3.5 h-3.5 text-[#16A34A]" />
              Painel de Backup Externo (Cloudflare R2)
            </Badge>
            <Badge
              variant="outline"
              className="bg-slate-100 text-slate-700 border-slate-300 text-xs font-mono"
            >
              SigV4 • Retenção 30d
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1">
            Teste de Backup e Validação de Restore
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Execute backups sob demanda, liste snapshots armazenados no Cloudflare R2 e valide o
            restore de contagens em modo seguro diretamente pelo navegador.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs text-slate-600 bg-white border-slate-200 py-1.5 px-3"
          >
            Perfil:{' '}
            <strong>{isCeoFinanceiro ? 'CEO / Financeiro' : 'Coordenador de Vendas'}</strong>
          </Badge>
        </div>
      </div>

      {/* Banner de Aviso de Modo Seguro */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-blue-900 space-y-1">
          <p className="font-semibold text-blue-950">
            Validação de Restore em Modo Seguro (Somente Leitura)
          </p>
          <p className="text-blue-800 leading-relaxed">
            O botão <strong>&quot;Validar Restore (seguro)&quot;</strong> envia{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900 font-mono text-xs">
              {'{ "executar_real": false }'}
            </code>
            . O backend faz o download do dump criptografado do Cloudflare R2, valida a integridade
            do JSON, calcula o hash SHA-256 e compara as contagens de todas as coleções contra o
            banco atual — <strong>nenhum registro é sobrescrito ou apagado</strong>.
          </p>
          {!isCeoFinanceiro && (
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 mt-1">
              Nota: A rota server-side de restore exige perfil <strong>ceo_financeiro</strong>. Como
              você está conectado como <strong>coordenador_vendas</strong>, a criação e listagem
              funcionarão normalmente; o restore seguro retornará HTTP 403 se acionado.
            </p>
          )}
        </div>
      </div>

      {/* Card com os 3 botões de ação */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#16A34A]" />
            Ações de Backup
          </CardTitle>
          <CardDescription className="text-xs text-[#64748B]">
            Todas as ações utilizam o token da sua sessão atual autenticada no PocketBase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Botão 1: Criar Backup */}
            <Button
              type="button"
              onClick={handleCriarBackup}
              disabled={loadingCreate || loadingList || loadingRestore}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold shadow-sm gap-2 h-11"
            >
              {loadingCreate ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Criando Backup...
                </>
              ) : (
                <>
                  <CloudUpload className="w-4 h-4" />
                  Criar Backup
                </>
              )}
            </Button>

            {/* Botão 2: Listar Backups */}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleListarBackups(true)}
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

            {/* Botão 3: Validar Restore (seguro) */}
            <Button
              type="button"
              variant="outline"
              onClick={handleValidarRestore}
              disabled={loadingCreate || loadingList || loadingRestore || backups.length === 0}
              className="border-purple-300 bg-purple-50 hover:bg-purple-100 text-[#7C3AED] font-semibold gap-2 h-11"
              title={
                backups.length === 0
                  ? 'Liste os backups antes de validar restore'
                  : 'Valida contagens do dump selecionado contra o banco sem alterar dados'
              }
            >
              {loadingRestore ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#7C3AED]" />
                  Validando Restore...
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
            <div className="mt-3 text-xs text-[#64748B] flex items-center gap-2">
              <span className="font-medium text-[#0F172A]">
                Arquivo selecionado para validação:
              </span>
              <code className="bg-slate-100 text-[#0F172A] px-2 py-0.5 rounded font-mono text-[11px] border border-slate-200">
                {backupSelecionado}
              </code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Backups Listados */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2563EB]" />
              Snapshots no Storage ({backups.length})
            </CardTitle>
            <CardDescription className="text-xs text-[#64748B]">
              {bucketName ? `Bucket: ${bucketName}` : 'Conectado via Cloudflare R2'} • Clique em uma
              linha para selecioná-la para validação de restore.
            </CardDescription>
          </div>
          {backups.length > 0 && (
            <Badge
              variant="outline"
              className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 font-mono"
            >
              Online
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
                  <TableHead className="text-xs font-semibold text-slate-700">Tamanho</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">
                    Última Modificação
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-700">ETag</TableHead>
                  <TableHead className="w-32 text-right text-xs font-semibold text-slate-700">
                    Ação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingList && backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-[#64748B]">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" />
                        Carregando snapshots do bucket R2...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-[#64748B]">
                      Nenhum arquivo de backup encontrado no storage ou lista ainda não carregada.
                      Clique em <strong>&quot;Listar Backups&quot;</strong> ou gere um novo
                      snapshot.
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((b) => {
                    const isSelected = backupSelecionado === b.nome
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
                            <span className="truncate max-w-[260px] sm:max-w-none">{b.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 font-mono">
                          {formatarBytes(b.tamanho)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatarDataIso(b.modificado)}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] text-slate-500 font-mono">
                          {b.etag ? `${b.etag.slice(0, 16)}...` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              setBackupSelecionado(b.nome)
                              handleValidarRestore()
                            }}
                            disabled={loadingRestore}
                            className="text-xs text-[#7C3AED] hover:text-[#6D28D9] hover:bg-purple-100/60 h-8 px-2.5"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                            Validar
                          </Button>
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

      {/* Relatório de Contagens (aparece se houver resumo da última validação) */}
      {resumoRestore && (
        <Card className="border-purple-200 bg-purple-50/30 shadow-sm animate-fade-in">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                {resumoRestore.integridadeValidada ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                )}
                Relatório de Validação de Restore ({resumoRestore.arquivo})
              </CardTitle>
              <Badge
                className={
                  resumoRestore.integridadeValidada
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }
              >
                {resumoRestore.integridadeValidada
                  ? 'Divergência ZERO • 100% Íntegro'
                  : `Divergência: ${resumoRestore.divergenciaTotal} item(ns)`}
              </Badge>
            </div>
            <CardDescription className="text-xs text-[#64748B]">
              Modo seguro ({resumoRestore.modoReal ? 'REAL' : 'SOMENTE LEITURA'}) • Timestamp do
              dump: {formatarDataIso(resumoRestore.timestampDump)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Arquivo</span>
                <span
                  className="font-mono font-semibold text-[#0F172A] truncate block"
                  title={resumoRestore.arquivo}
                >
                  {resumoRestore.arquivo}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Bucket R2</span>
                <span className="font-mono font-semibold text-[#0F172A]">
                  {resumoRestore.bucket || '-'}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Total Coleções</span>
                <span className="font-bold text-[#0F172A]">
                  {Object.keys(resumoRestore.contagensDump || {}).length}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <span className="text-[#64748B] block">Status de Integridade</span>
                <span
                  className={`font-bold ${
                    resumoRestore.integridadeValidada ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {resumoRestore.integridadeValidada
                    ? 'Aprovado (Zero Delta)'
                    : 'Divergência Detectada'}
                </span>
              </div>
            </div>

            {/* Tabela de contagens comparativas */}
            <div className="bg-white rounded-lg border border-purple-100 overflow-hidden">
              <div className="p-3 bg-purple-50/50 border-b border-purple-100 text-xs font-semibold text-[#0F172A]">
                Comparativo de Contagens por Coleção (Dump R2 vs Banco Atual)
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
                    {Object.keys(resumoRestore.contagensDump || {}).map((col) => {
                      const dumpCount = resumoRestore.contagensDump[col] || 0
                      const bancoCount =
                        (resumoRestore.contagensDepois && resumoRestore.contagensDepois[col]) ??
                        (resumoRestore.contagensAntes && resumoRestore.contagensAntes[col]) ??
                        0
                      const delta = bancoCount - dumpCount
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

      {/* Área de Log JSON Formato */}
      <Card className="border-[#E2E8F0] shadow-sm bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              Área de Log de Resposta (JSON)
            </CardTitle>
            <CardDescription className="text-xs text-[#64748B]">
              Resultado bruto formatado da última chamada aos endpoints /backend/v1/backup/*.
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
                {ultimoResultado.sucesso ? 'Sucesso' : 'Erro / Falha'}
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
              Nenhum resultado registrado ainda nesta sessão. Dispare uma das ações acima para
              visualizar o retorno JSON formatado aqui.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
