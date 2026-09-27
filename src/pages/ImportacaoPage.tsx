import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  ShoppingCart,
  History,
  Lock,
  RefreshCw,
  FileText,
  HelpCircle,
  AlertCircle,
  TrendingUp,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { formatarMoeda } from '@/types/clientes'
import {
  parseCSV,
  normalizarData,
  normalizarBooleano,
  normalizarValorDecimal,
  dataMaisRecente,
  type ParsedCSVRow,
} from '@/lib/importacao/csvUtils'

// Tipos para Log de Importação na sessão
export interface LogImportacaoItem {
  id: string
  tipo: 'clientes' | 'compras'
  arquivo: string
  data: string
  resultado: string
  detalhes?: {
    criados?: number
    atualizados?: number
    processados?: number
    falhas?: number
    erros?: string[]
  }
}

interface LinhaClientePreview {
  nome_contato: string
  nome_empresa: string
  telefone: string
  cidade: string
  email: string
  cnpj_cpf: string
  data_ultima_compra: string | null
  grande_cliente: boolean
  raw: ParsedCSVRow
}

interface LinhaCompraPreview {
  cliente: string
  data_compra: string | null
  valor: number
  raw: ParsedCSVRow
}

export default function ImportacaoPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isCeoFinanceiro = user?.perfil === 'ceo_financeiro'

  // Ref para inputs de arquivo
  const inputClientesRef = useRef<HTMLInputElement>(null)
  const inputComprasRef = useRef<HTMLInputElement>(null)

  // ESTADO - Seção 1: Clientes
  const [arquivoClientes, setArquivoClientes] = useState<File | null>(null)
  const [linhasClientes, setLinhasClientes] = useState<LinhaClientePreview[]>([])
  const [totalLinhasClientes, setTotalLinhasClientes] = useState<number>(0)
  const [processandoClientes, setProcessandoClientes] = useState(false)
  const [resultadoClientes, setResultadoClientes] = useState<{
    criados: number
    atualizados: number
    falhas: number
    erros: string[]
  } | null>(null)

  // ESTADO - Seção 2: Compras
  const [arquivoCompras, setArquivoCompras] = useState<File | null>(null)
  const [linhasCompras, setLinhasCompras] = useState<LinhaCompraPreview[]>([])
  const [totalLinhasCompras, setTotalLinhasCompras] = useState<number>(0)
  const [processandoCompras, setProcessandoCompras] = useState(false)
  const [resultadoCompras, setResultadoCompras] = useState<{
    processadas: number
    clientesAtualizados: number
    falhas: number
    erros: string[]
  } | null>(null)

  // ESTADO - Seção 3: Log da Sessão
  const [logs, setLogs] = useState<LogImportacaoItem[]>(() => {
    try {
      const salvo = localStorage.getItem('crm_colesel45_import_logs')
      if (salvo) {
        return JSON.parse(salvo)
      }
    } catch {
      // Ignora erro de JSON
    }
    return []
  })

  // Sincroniza logs com localStorage
  useEffect(() => {
    try {
      localStorage.setItem('crm_colesel45_import_logs', JSON.stringify(logs.slice(0, 10)))
    } catch {
      // Ignora erro
    }
  }, [logs])

  const registrarLog = (novoLog: Omit<LogImportacaoItem, 'id' | 'data'>) => {
    const agora = new Date()
    const dataFormatada =
      agora.toLocaleDateString('pt-BR') +
      ' às ' +
      agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    const item: LogImportacaoItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      data: dataFormatada,
      ...novoLog,
    }

    setLogs((prev) => [item, ...prev].slice(0, 10))
  }

  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/clientes')
    }
  }

  // Se NÃO for ceo_financeiro, exibe o aviso "Acesso restrito" no padrão do módulo Automações
  if (!isCeoFinanceiro) {
    return (
      <div className="space-y-6">
        {/* Botão Voltar no topo */}
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
                A importação de lotes de clientes e movimentações de compras é restrita
                exclusivamente ao perfil <strong>CEO / Diretor Financeiro</strong>.
              </p>
            </div>
            <div className="pt-2">
              <Badge
                variant="outline"
                className="text-xs text-amber-700 bg-amber-50/50 border-amber-200"
              >
                Permissão requerida: ceo_financeiro
              </Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ==========================================
  // PARSER E UPLOAD: SEÇÃO 1 - CLIENTES
  // ==========================================
  const handleUploadClientes = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoClientes(file)
    setResultadoClientes(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '')
        const { rows } = parseCSV(text)

        if (rows.length === 0) {
          toast({
            variant: 'destructive',
            title: 'Arquivo vazio',
            description: 'O arquivo selecionado não contém linhas de dados válidas.',
          })
          setLinhasClientes([])
          setTotalLinhasClientes(0)
          return
        }

        const mapeadas: LinhaClientePreview[] = rows.map((r) => {
          return {
            nome_contato: r.nome_contato || r.nome || '',
            nome_empresa: r.nome_empresa || r.empresa || '',
            telefone: r.telefone || '',
            cidade: r.cidade || '',
            email: r.email || '',
            cnpj_cpf: r.cnpj_cpf || '',
            data_ultima_compra: normalizarData(r.data_ultima_compra),
            grande_cliente: normalizarBooleano(r.grande_cliente),
            raw: r,
          }
        })

        setLinhasClientes(mapeadas)
        setTotalLinhasClientes(mapeadas.length)
        toast({
          title: 'Arquivo carregado',
          description: `${mapeadas.length} clientes identificados. Confira a prévia abaixo antes de confirmar.`,
        })
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Erro ao ler arquivo',
          description: err instanceof Error ? err.message : 'Falha ao processar o formato CSV/TXT.',
        })
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleConfirmarImportacaoClientes = async () => {
    if (linhasClientes.length === 0) return
    setProcessandoClientes(true)

    let criados = 0
    let atualizados = 0
    const erros: string[] = []

    try {
      // 1. Carregar clientes existentes para lookup rápido em memória por cnpj_cpf e email
      // O ceo_financeiro tem acesso a todos os registros na regra RLS
      const clientesExistentes = await pb.collection('clientes').getFullList({
        sort: '-created',
        requestKey: null,
      })

      // Mapas auxiliares para deduplicação instantânea
      const mapPorCnpjCpf = new Map<string, (typeof clientesExistentes)[0]>()
      const mapPorEmail = new Map<string, (typeof clientesExistentes)[0]>()

      const limparDoc = (doc?: string) => (doc || '').replace(/[^\w]/g, '').trim().toLowerCase()
      const limparEmail = (em?: string) => (em || '').trim().toLowerCase()

      clientesExistentes.forEach((c) => {
        const docLimpo = limparDoc(c.cnpj_cpf)
        if (docLimpo) mapPorCnpjCpf.set(docLimpo, c)

        const emailLimpo = limparEmail(c.email)
        if (emailLimpo) mapPorEmail.set(emailLimpo, c)
      })

      // 2. Processar linha a linha individualmente (para isolar falhas)
      for (let i = 0; i < linhasClientes.length; i++) {
        const row = linhasClientes[i]
        const numLinha = i + 2 // Linha 1 é cabeçalho

        const nome = row.nome_contato.trim()
        if (!nome) {
          erros.push(`Linha ${numLinha}: nome_contato é obrigatório e está vazio.`)
          continue
        }

        const docLimpo = limparDoc(row.cnpj_cpf)
        const emailLimpo = limparEmail(row.email)

        // Verificar deduplicação: se existe por cnpj_cpf OU por email
        const clienteExistente =
          (docLimpo ? mapPorCnpjCpf.get(docLimpo) : null) ||
          (emailLimpo ? mapPorEmail.get(emailLimpo) : null)

        // Payload a ser salvo
        const payload: Record<string, unknown> = {
          nome_contato: nome,
          nome_empresa: row.nome_empresa.trim(),
          telefone: row.telefone.trim(),
          cidade: row.cidade.trim(),
          email: row.email.trim(),
          cnpj_cpf: row.cnpj_cpf.trim(),
          grande_cliente: row.grande_cliente,
          responsavel_id: user?.id,
        }

        if (row.data_ultima_compra) {
          payload.data_ultima_compra = row.data_ultima_compra
        }

        try {
          if (clienteExistente) {
            // Atualizar cliente
            // Se já existia data_ultima_compra, escolher a mais recente
            if (row.data_ultima_compra) {
              payload.data_ultima_compra = dataMaisRecente(
                clienteExistente.data_ultima_compra,
                row.data_ultima_compra,
              )
            } else if (clienteExistente.data_ultima_compra) {
              delete payload.data_ultima_compra // Preserva a data já existente
            }

            const recAtualizado = await pb
              .collection('clientes')
              .update(clienteExistente.id, payload, { requestKey: null })

            atualizados++
            // Atualiza os maps para refletir alterações
            if (docLimpo) mapPorCnpjCpf.set(docLimpo, recAtualizado)
            if (emailLimpo) mapPorEmail.set(emailLimpo, recAtualizado)
          } else {
            // Criar cliente novo
            const recNovo = await pb.collection('clientes').create(payload, { requestKey: null })

            criados++
            if (docLimpo) mapPorCnpjCpf.set(docLimpo, recNovo)
            if (emailLimpo) mapPorEmail.set(emailLimpo, recNovo)
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          erros.push(`Linha ${numLinha} (${nome}): ${msg}`)
        }
      }

      const resultado = {
        criados,
        atualizados,
        falhas: erros.length,
        erros,
      }

      setResultadoClientes(resultado)

      // Registrar log de importação
      const resultadoTexto = `${criados} criados, ${atualizados} atualizados${erros.length > 0 ? `, ${erros.length} falhas` : ''}`
      registrarLog({
        tipo: 'clientes',
        arquivo: arquivoClientes?.name || 'clientes.csv',
        resultado: resultadoTexto,
        detalhes: resultado,
      })

      toast({
        title: 'Importação de clientes concluída',
        description: resultadoTexto,
      })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erro na importação',
        description:
          err instanceof Error
            ? err.message
            : 'Falha crítica ao se comunicar com o banco de dados.',
      })
    } finally {
      setProcessandoClientes(false)
    }
  }

  // ==========================================
  // PARSER E UPLOAD: SEÇÃO 2 - COMPRAS
  // ==========================================
  const handleUploadCompras = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoCompras(file)
    setResultadoCompras(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '')
        const { rows } = parseCSV(text)

        if (rows.length === 0) {
          toast({
            variant: 'destructive',
            title: 'Arquivo vazio',
            description: 'O arquivo selecionado não contém linhas de compras válidas.',
          })
          setLinhasCompras([])
          setTotalLinhasCompras(0)
          return
        }

        const mapeadas: LinhaCompraPreview[] = rows.map((r) => {
          return {
            cliente: r.cliente || r.identificador || r.cnpj_cpf || r.email || '',
            data_compra: normalizarData(r.data_compra || r.data),
            valor: normalizarValorDecimal(r.valor),
            raw: r,
          }
        })

        setLinhasCompras(mapeadas)
        setTotalLinhasCompras(mapeadas.length)
        toast({
          title: 'Arquivo de compras carregado',
          description: `${mapeadas.length} compras identificadas. Confira a prévia antes de confirmar.`,
        })
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Erro ao ler arquivo',
          description: err instanceof Error ? err.message : 'Falha ao processar o formato CSV/TXT.',
        })
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleConfirmarImportacaoCompras = async () => {
    if (linhasCompras.length === 0) return
    setProcessandoCompras(true)

    let comprasProcessadas = 0
    let clientesAtualizados = 0
    const erros: string[] = []

    try {
      // 1. Carregar lista de clientes para busca por identificador (cnpj_cpf ou email)
      const todosClientes = await pb.collection('clientes').getFullList({
        sort: '-created',
        requestKey: null,
      })

      const limparDoc = (doc?: string) => (doc || '').replace(/[^\w]/g, '').trim().toLowerCase()
      const limparEmail = (em?: string) => (em || '').trim().toLowerCase()

      // Agrupar compras por cliente identificado
      // Map: clienteId -> { clienteRecord, totalCompras, dataMaisRecente }
      const agrupadoPorCliente = new Map<
        string,
        {
          clienteRecord: (typeof todosClientes)[0]
          totalCompras: number
          dataMaisRecenteCompra: string | null
          comprasContador: number
        }
      >()

      for (let i = 0; i < linhasCompras.length; i++) {
        const item = linhasCompras[i]
        const numLinha = i + 2
        const ident = item.cliente.trim()

        if (!ident) {
          erros.push(`Linha ${numLinha}: identificador do cliente vazio.`)
          continue
        }

        const identDoc = limparDoc(ident)
        const identEmail = limparEmail(ident)

        // Encontrar cliente por cnpj_cpf ou email
        const clienteEncontrado = todosClientes.find((c) => {
          const cDoc = limparDoc(c.cnpj_cpf)
          const cEmail = limparEmail(c.email)
          return (identDoc && cDoc === identDoc) || (identEmail && cEmail === identEmail)
        })

        if (!clienteEncontrado) {
          erros.push(`Linha ${numLinha}: cliente "${ident}" não foi encontrado na base.`)
          continue
        }

        comprasProcessadas++

        const atualAgrupado = agrupadoPorCliente.get(clienteEncontrado.id)
        if (atualAgrupado) {
          atualAgrupado.totalCompras += item.valor
          atualAgrupado.comprasContador += 1
          if (item.data_compra) {
            atualAgrupado.dataMaisRecenteCompra = dataMaisRecente(
              atualAgrupado.dataMaisRecenteCompra,
              item.data_compra,
            )
          }
        } else {
          agrupadoPorCliente.set(clienteEncontrado.id, {
            clienteRecord: clienteEncontrado,
            totalCompras: item.valor,
            dataMaisRecenteCompra: item.data_compra,
            comprasContador: 1,
          })
        }
      }

      // 2. Atualizar cada cliente no banco com data_ultima_compra e observacoes
      for (const [clienteId, dados] of agrupadoPorCliente.entries()) {
        try {
          const dataFinal = dataMaisRecente(
            dados.clienteRecord.data_ultima_compra,
            dados.dataMaisRecenteCompra,
          )

          const valorFormatado = formatarMoeda(dados.totalCompras)
          const textoImportado = `Total de compras importado: ${valorFormatado}`

          // Atualizar observações: se já existia, adiciona em nova linha
          const obsExistente = dados.clienteRecord.observacoes
            ? dados.clienteRecord.observacoes.trim()
            : ''

          let novaObservacao: string
          if (obsExistente.length > 0) {
            // Se já continha alguma menção prévia, concatena com quebra de linha limpa
            novaObservacao = `${obsExistente}\n${textoImportado}`
          } else {
            novaObservacao = textoImportado
          }

          const payloadUpdate: Record<string, unknown> = {
            observacoes: novaObservacao,
          }

          if (dataFinal) {
            payloadUpdate.data_ultima_compra = dataFinal
          }

          await pb.collection('clientes').update(clienteId, payloadUpdate, { requestKey: null })
          clientesAtualizados++
        } catch (err: unknown) {
          const nome = dados.clienteRecord.nome_contato || dados.clienteRecord.id
          erros.push(
            `Falha ao atualizar cliente "${nome}": ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      const resultado = {
        processadas: comprasProcessadas,
        clientesAtualizados,
        falhas: erros.length,
        erros,
      }

      setResultadoCompras(resultado)

      // Registrar log
      const resultadoTexto = `${comprasProcessadas} compras processadas, ${clientesAtualizados} clientes atualizados${erros.length > 0 ? `, ${erros.length} falhas` : ''}`
      registrarLog({
        tipo: 'compras',
        arquivo: arquivoCompras?.name || 'compras.csv',
        resultado: resultadoTexto,
        detalhes: resultado,
      })

      toast({
        title: 'Importação de compras concluída',
        description: resultadoTexto,
      })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erro na importação de compras',
        description: err instanceof Error ? err.message : 'Falha crítica ao atualizar compras.',
      })
    } finally {
      setProcessandoCompras(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* CABEÇALHO DA TELA COM BOTÃO VOLTAR */}
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
              className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1"
            >
              <TrendingUp className="w-3 h-3" />
              Módulo Administrativo
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1">
            Importação de Dados
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Envie arquivos CSV ou TXT para carga em massa de clientes e histórico de compras com
            deduplicação automática.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs text-slate-600 bg-white border-slate-200 py-1 px-2.5"
          >
            Perfil: <strong>{user?.nome || 'CEO / Financeiro'}</strong>
          </Badge>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SEÇÃO 1: IMPORTAÇÃO DE CLIENTES */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-[#16A34A] flex-shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-[#0F172A]">
                  1. Importação de Clientes
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Cadastra novos clientes ou atualiza existentes por <code>cnpj_cpf</code> ou{' '}
                  <code>email</code>.
                </CardDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-[11px] text-[#64748B] w-fit">
              Aceita .csv e .txt
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Instruções de colunas */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#64748B] flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-[#16A34A] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[#0F172A]">Colunas esperadas no arquivo CSV/TXT:</p>
              <div className="font-mono text-[11px] text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 inline-block">
                nome_contato, nome_empresa, telefone, cidade, email, cnpj_cpf, data_ultima_compra,
                grande_cliente
              </div>
              <p className="text-[11px] text-[#64748B] pt-0.5">
                • <code>data_ultima_compra</code> aceita <code>YYYY-MM-DD</code> ou{' '}
                <code>DD/MM/YYYY</code>.<br />• <code>grande_cliente</code> aceita{' '}
                <code>sim/nao</code> ou <code>true/false</code>.
              </p>
            </div>
          </div>

          {/* Área de Seleção de Arquivo */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <input
              type="file"
              ref={inputClientesRef}
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={handleUploadClientes}
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => inputClientesRef.current?.click()}
              className="w-full sm:w-auto border-dashed border-[#16A34A] hover:bg-emerald-50 text-[#16A34A] font-semibold gap-2"
            >
              <Upload className="w-4 h-4" />
              {arquivoClientes ? 'Trocar Arquivo CSV/TXT' : 'Selecionar Arquivo de Clientes'}
            </Button>

            {arquivoClientes && (
              <div className="flex items-center gap-2 text-xs text-[#0F172A] bg-slate-100 py-1.5 px-3 rounded-lg w-full sm:w-auto truncate">
                <FileSpreadsheet className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
                <span className="font-medium truncate">{arquivoClientes.name}</span>
                <span className="text-[#64748B] text-[11px]">
                  ({(arquivoClientes.size / 1024).toFixed(1)} KB — {totalLinhasClientes} linhas)
                </span>
              </div>
            )}
          </div>

          {/* Resultado da execução */}
          {resultadoClientes && (
            <Alert
              className={`rounded-xl ${
                resultadoClientes.falhas === 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {resultadoClientes.falhas === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              <AlertTitle className="font-bold text-sm">Resultado do Processamento</AlertTitle>
              <AlertDescription className="text-xs space-y-1">
                <p className="font-semibold">
                  {resultadoClientes.criados} clientes criados, {resultadoClientes.atualizados}{' '}
                  atualizados.
                  {resultadoClientes.falhas > 0 &&
                    ` (${resultadoClientes.falhas} linhas não puderam ser importadas)`}
                </p>
                {resultadoClientes.erros.length > 0 && (
                  <div className="mt-2 p-2 bg-white/70 rounded border border-amber-200 max-h-32 overflow-y-auto space-y-1 font-mono text-[11px]">
                    {resultadoClientes.erros.map((err, idx) => (
                      <div key={idx} className="text-red-700 flex items-center gap-1">
                        <XCircle className="w-3 h-3 flex-shrink-0" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Prévia das Primeiras 10 Linhas */}
          {linhasClientes.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Prévia dos Dados (Primeiras {Math.min(linhasClientes.length, 10)} de{' '}
                  {totalLinhasClientes} linhas)
                </h4>

                <Button
                  onClick={handleConfirmarImportacaoClientes}
                  disabled={processandoClientes}
                  className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2"
                >
                  {processandoClientes ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Gravando no PocketBase...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirmar Importação de Clientes
                    </>
                  )}
                </Button>
              </div>

              <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto bg-white shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">#</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">
                        Nome Contato
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">
                        Empresa
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">
                        Telefone
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">Cidade</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">E-mail</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">
                        CNPJ/CPF
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">
                        Última Compra
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">VIP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[#E2E8F0]">
                    {linhasClientes.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50/70 text-xs">
                        <TableCell className="text-[#64748B] font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-bold text-[#0F172A]">
                          {row.nome_contato || <span className="text-red-500 font-mono">-</span>}
                        </TableCell>
                        <TableCell className="text-[#64748B]">{row.nome_empresa || '-'}</TableCell>
                        <TableCell className="text-[#64748B]">{row.telefone || '-'}</TableCell>
                        <TableCell className="text-[#64748B]">{row.cidade || '-'}</TableCell>
                        <TableCell className="text-[#64748B]">{row.email || '-'}</TableCell>
                        <TableCell className="text-[#64748B] font-mono">
                          {row.cnpj_cpf || '-'}
                        </TableCell>
                        <TableCell className="text-[#64748B]">
                          {row.data_ultima_compra || '-'}
                        </TableCell>
                        <TableCell>
                          {row.grande_cliente ? (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
                              Sim
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-slate-500 border-slate-200 text-[10px]"
                            >
                              Não
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* SEÇÃO 2: IMPORTAÇÃO DE COMPRAS */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-[#2563EB] flex-shrink-0">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-[#0F172A]">
                  2. Importação de Compras
                </CardTitle>
                <CardDescription className="text-xs text-[#64748B]">
                  Atualiza <code>data_ultima_compra</code> e totaliza no campo{' '}
                  <code>observacoes</code> do cliente.
                </CardDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-[11px] text-[#64748B] w-fit">
              Aceita .csv e .txt
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Instruções de colunas */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#64748B] flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-[#2563EB] flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[#0F172A]">Colunas esperadas no arquivo CSV/TXT:</p>
              <div className="font-mono text-[11px] text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 inline-block">
                cliente, data_compra, valor
              </div>
              <p className="text-[11px] text-[#64748B] pt-0.5">
                • <code>cliente</code>: identificador por <strong>CNPJ/CPF</strong> ou{' '}
                <strong>e-mail</strong> já cadastrado.
                <br />• <code>data_compra</code>: aceita <code>YYYY-MM-DD</code> ou{' '}
                <code>DD/MM/YYYY</code>.<br />• <code>valor</code>: aceita vírgula ou ponto decimal
                (ex: <code>1500,50</code> ou <code>1.500,50</code>).
              </p>
            </div>
          </div>

          {/* Área de Seleção de Arquivo */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <input
              type="file"
              ref={inputComprasRef}
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={handleUploadCompras}
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => inputComprasRef.current?.click()}
              className="w-full sm:w-auto border-dashed border-[#2563EB] hover:bg-blue-50 text-[#2563EB] font-semibold gap-2"
            >
              <Upload className="w-4 h-4" />
              {arquivoCompras ? 'Trocar Arquivo de Compras' : 'Selecionar Arquivo de Compras'}
            </Button>

            {arquivoCompras && (
              <div className="flex items-center gap-2 text-xs text-[#0F172A] bg-slate-100 py-1.5 px-3 rounded-lg w-full sm:w-auto truncate">
                <FileSpreadsheet className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                <span className="font-medium truncate">{arquivoCompras.name}</span>
                <span className="text-[#64748B] text-[11px]">
                  ({(arquivoCompras.size / 1024).toFixed(1)} KB — {totalLinhasCompras} linhas)
                </span>
              </div>
            )}
          </div>

          {/* Resultado da execução de compras */}
          {resultadoCompras && (
            <Alert
              className={`rounded-xl ${
                resultadoCompras.falhas === 0
                  ? 'border-blue-200 bg-blue-50 text-blue-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {resultadoCompras.falhas === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-[#2563EB]" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              <AlertTitle className="font-bold text-sm">Resultado do Processamento</AlertTitle>
              <AlertDescription className="text-xs space-y-1">
                <p className="font-semibold">
                  {resultadoCompras.processadas} compras processadas,{' '}
                  {resultadoCompras.clientesAtualizados} clientes atualizados.
                  {resultadoCompras.falhas > 0 &&
                    ` (${resultadoCompras.falhas} linhas com inconsistência ou cliente não encontrado)`}
                </p>
                {resultadoCompras.erros.length > 0 && (
                  <div className="mt-2 p-2 bg-white/70 rounded border border-amber-200 max-h-32 overflow-y-auto space-y-1 font-mono text-[11px]">
                    {resultadoCompras.erros.map((err, idx) => (
                      <div key={idx} className="text-red-700 flex items-center gap-1">
                        <XCircle className="w-3 h-3 flex-shrink-0" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Prévia das Primeiras 10 Linhas de Compras */}
          {linhasCompras.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Prévia dos Dados (Primeiras {Math.min(linhasCompras.length, 10)} de{' '}
                  {totalLinhasCompras} linhas)
                </h4>

                <Button
                  onClick={handleConfirmarImportacaoCompras}
                  disabled={processandoCompras}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs shadow-sm gap-2"
                >
                  {processandoCompras ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Atualizando Clientes...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirmar Importação de Compras
                    </>
                  )}
                </Button>
              </div>

              <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto bg-white shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">#</TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">
                        Identificador (CNPJ/CPF ou E-mail)
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A]">
                        Data da Compra
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#0F172A] text-right">
                        Valor
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[#E2E8F0]">
                    {linhasCompras.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50/70 text-xs">
                        <TableCell className="text-[#64748B] font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-bold text-[#0F172A]">
                          {row.cliente || <span className="text-red-500 font-mono">vazio</span>}
                        </TableCell>
                        <TableCell className="text-[#64748B]">{row.data_compra || '-'}</TableCell>
                        <TableCell className="text-right font-semibold text-[#0F172A]">
                          {formatarMoeda(row.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* SEÇÃO 3: LOG DE IMPORTAÇÃO (ÚLTIMAS 10 DA SESSÃO) */}
      {/* ======================================================== */}
      <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-[#7C3AED] flex-shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-[#0F172A]">
                3. Log de Importações da Sessão
              </CardTitle>
              <CardDescription className="text-xs text-[#64748B]">
                Histórico das últimas 10 importações realizadas nesta sessão.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {logs.length === 0 ? (
            <div className="py-12 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-slate-50/50 space-y-2">
              <History className="w-8 h-8 text-[#94A3B8] mx-auto" />
              <p className="text-xs font-medium text-[#64748B]">
                Nenhuma importação realizada nesta sessão ainda.
              </p>
              <p className="text-[11px] text-[#94A3B8]">
                Os relatórios das importações de clientes e compras aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto bg-white shadow-sm">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold text-[#0F172A]">Tipo</TableHead>
                    <TableHead className="text-xs font-semibold text-[#0F172A]">Arquivo</TableHead>
                    <TableHead className="text-xs font-semibold text-[#0F172A]">
                      Data/Hora
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-[#0F172A]">
                      Resultado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E2E8F0]">
                  {logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50/70 text-xs">
                      <TableCell className="font-semibold">
                        {log.tipo === 'clientes' ? (
                          <Badge className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-[11px] gap-1 font-semibold">
                            <Users className="w-3 h-3" /> Clientes
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 text-[11px] gap-1 font-semibold">
                            <ShoppingCart className="w-3 h-3" /> Compras
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-slate-700 font-medium">
                        {log.arquivo}
                      </TableCell>
                      <TableCell className="text-[#64748B]">{log.data}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-[#0F172A]">{log.resultado}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
