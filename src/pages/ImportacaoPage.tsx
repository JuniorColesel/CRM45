import React, { useState, useEffect, useRef, useMemo } from 'react'
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
  Download,
  Save,
  RotateCcw,
  Sparkles,
  ArrowRight,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { formatarMoeda } from '@/types/clientes'
import {
  parseCSV,
  normalizarData,
  normalizarBooleano,
  normalizarValorDecimal,
  normalizarNomeColuna,
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

// Chaves dos campos de Clientes no CRM
export type CampoClienteCrm =
  | 'nome_contato'
  | 'nome_empresa'
  | 'telefone'
  | 'cidade'
  | 'email'
  | 'cnpj_cpf'
  | 'data_ultima_compra'
  | 'grande_cliente'

// Chaves dos campos de Compras no CRM
export type CampoCompraCrm = 'cliente' | 'data_compra' | 'valor'

const CAMPOS_CLIENTES_INFO: { id: CampoClienteCrm; label: string; desc: string }[] = [
  { id: 'nome_contato', label: 'Nome do Contato', desc: 'Obrigatório' },
  { id: 'nome_empresa', label: 'Nome da Empresa', desc: 'Opcional' },
  { id: 'telefone', label: 'Telefone', desc: 'Obrigatório se e-mail não mapeado' },
  { id: 'cidade', label: 'Cidade', desc: 'Opcional' },
  { id: 'email', label: 'E-mail', desc: 'Obrigatório se telefone/documento não mapeado' },
  { id: 'cnpj_cpf', label: 'CNPJ / CPF', desc: 'Obrigatório se e-mail não mapeado' },
  { id: 'data_ultima_compra', label: 'Data da Última Compra', desc: 'YYYY-MM-DD ou DD/MM/YYYY' },
  { id: 'grande_cliente', label: 'Grande Cliente (VIP)', desc: 'Sim/Não ou True/False' },
]

const CAMPOS_COMPRAS_INFO: { id: CampoCompraCrm; label: string; desc: string }[] = [
  { id: 'cliente', label: 'Cliente (CNPJ/CPF ou E-mail)', desc: 'Obrigatório para identificação' },
  { id: 'data_compra', label: 'Data da Compra', desc: 'Obrigatório (YYYY-MM-DD ou DD/MM/YYYY)' },
  { id: 'valor', label: 'Valor da Compra (R$)', desc: 'Obrigatório (ex: 1500,00)' },
]

const STORAGE_KEY_MAP_CLIENTES = 'crm_colesel45_map_clientes_padrao'
const STORAGE_KEY_MAP_COMPRAS = 'crm_colesel45_map_compras_padrao'
const STORAGE_KEY_LOGS = 'crm_colesel45_import_logs'

export default function ImportacaoPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isCeoFinanceiro = user?.perfil === 'ceo_financeiro'

  // Aba selecionada: 'clientes' ou 'compras'
  const [abaAtiva, setAbaAtiva] = useState<'clientes' | 'compras'>('clientes')

  // Refs de upload
  const inputClientesRef = useRef<HTMLInputElement>(null)
  const inputComprasRef = useRef<HTMLInputElement>(null)

  // ==========================================
  // ESTADO: SEÇÃO CLIENTES
  // ==========================================
  const [arquivoClientes, setArquivoClientes] = useState<File | null>(null)
  const [rawHeadersClientes, setRawHeadersClientes] = useState<string[]>([])
  const [rawRowsClientes, setRawRowsClientes] = useState<string[][]>([])
  const [mapeamentoClientes, setMapeamentoClientes] = useState<Record<CampoClienteCrm, string>>({
    nome_contato: '',
    nome_empresa: '',
    telefone: '',
    cidade: '',
    email: '',
    cnpj_cpf: '',
    data_ultima_compra: '',
    grande_cliente: '',
  })
  const [processandoClientes, setProcessandoClientes] = useState(false)
  const [resultadoClientes, setResultadoClientes] = useState<{
    criados: number
    atualizados: number
    falhas: number
    erros: string[]
  } | null>(null)

  // ==========================================
  // ESTADO: SEÇÃO COMPRAS
  // ==========================================
  const [arquivoCompras, setArquivoCompras] = useState<File | null>(null)
  const [rawHeadersCompras, setRawHeadersCompras] = useState<string[]>([])
  const [rawRowsCompras, setRawRowsCompras] = useState<string[][]>([])
  const [mapeamentoCompras, setMapeamentoCompras] = useState<Record<CampoCompraCrm, string>>({
    cliente: '',
    data_compra: '',
    valor: '',
  })
  const [processandoCompras, setProcessandoCompras] = useState(false)
  const [resultadoCompras, setResultadoCompras] = useState<{
    processadas: number
    clientesAtualizados: number
    falhas: number
    erros: string[]
  } | null>(null)

  // ==========================================
  // ESTADO: LOGS (Últimas 10)
  // ==========================================
  const [logs, setLogs] = useState<LogImportacaoItem[]>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_LOGS)
      if (salvo) return JSON.parse(salvo)
    } catch {
      // Ignora erro
    }
    return []
  })

  // Sincronizar logs com localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs.slice(0, 10)))
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
      navigate('/configuracoes')
    }
  }

  // ==========================================
  // AUTO-DETECÇÃO DE COLUNAS
  // ==========================================
  const autoDetectarColunasClientes = (headers: string[]) => {
    const novoMapeamento: Record<CampoClienteCrm, string> = {
      nome_contato: '',
      nome_empresa: '',
      telefone: '',
      cidade: '',
      email: '',
      cnpj_cpf: '',
      data_ultima_compra: '',
      grande_cliente: '',
    }

    headers.forEach((header) => {
      const norm = normalizarNomeColuna(header)
      if (norm === 'nome_contato' && !novoMapeamento.nome_contato) {
        novoMapeamento.nome_contato = header
      } else if (norm === 'nome_empresa' && !novoMapeamento.nome_empresa) {
        novoMapeamento.nome_empresa = header
      } else if (norm === 'telefone' && !novoMapeamento.telefone) {
        novoMapeamento.telefone = header
      } else if (norm === 'cidade' && !novoMapeamento.cidade) {
        novoMapeamento.cidade = header
      } else if (norm === 'email' && !novoMapeamento.email) {
        novoMapeamento.email = header
      } else if (norm === 'cnpj_cpf' && !novoMapeamento.cnpj_cpf) {
        novoMapeamento.cnpj_cpf = header
      } else if (norm === 'data_ultima_compra' && !novoMapeamento.data_ultima_compra) {
        novoMapeamento.data_ultima_compra = header
      } else if (norm === 'grande_cliente' && !novoMapeamento.grande_cliente) {
        novoMapeamento.grande_cliente = header
      }
    })

    return novoMapeamento
  }

  const autoDetectarColunasCompras = (headers: string[]) => {
    const novoMapeamento: Record<CampoCompraCrm, string> = {
      cliente: '',
      data_compra: '',
      valor: '',
    }

    headers.forEach((header) => {
      const norm = normalizarNomeColuna(header)
      if (norm === 'cliente' && !novoMapeamento.cliente) {
        novoMapeamento.cliente = header
      } else if (norm === 'data_compra' && !novoMapeamento.data_compra) {
        novoMapeamento.data_compra = header
      } else if (norm === 'valor' && !novoMapeamento.valor) {
        novoMapeamento.valor = header
      }
    })

    return novoMapeamento
  }

  // ==========================================
  // UPLOAD CSV / TXT
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
        const { headers, rawRows } = parseCSV(text)

        if (headers.length === 0 || rawRows.length === 0) {
          toast({
            variant: 'destructive',
            title: 'Arquivo sem dados válidos',
            description: 'O arquivo selecionado não contém cabeçalhos ou linhas de dados.',
          })
          setRawHeadersClientes([])
          setRawRowsClientes([])
          return
        }

        // Recupera primeira linha para pegar os cabeçalhos originais
        const primeiraLinha = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)[0] || ''
        const sep = primeiraLinha.includes('\t') ? '\t' : primeiraLinha.includes(';') ? ';' : ','
        const cabecalhosOriginais = primeiraLinha
          .split(sep)
          .map((c) => c.replace(/^["']|["']$/g, '').trim())

        const headersUsados = cabecalhosOriginais.length > 0 ? cabecalhosOriginais : headers
        setRawHeadersClientes(headersUsados)
        setRawRowsClientes(rawRows)

        // Tenta auto-detecção
        const autoMap = autoDetectarColunasClientes(headersUsados)
        setMapeamentoClientes(autoMap)

        toast({
          title: 'Arquivo de clientes carregado',
          description: `${rawRows.length} linhas detectadas. Confira o mapeamento e a prévia abaixo.`,
        })
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Erro ao processar arquivo',
          description: err instanceof Error ? err.message : 'Falha ao processar o formato CSV/TXT.',
        })
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleUploadCompras = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivoCompras(file)
    setResultadoCompras(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '')
        const { headers, rawRows } = parseCSV(text)

        if (headers.length === 0 || rawRows.length === 0) {
          toast({
            variant: 'destructive',
            title: 'Arquivo sem dados válidos',
            description: 'O arquivo selecionado não contém cabeçalhos ou linhas de dados.',
          })
          setRawHeadersCompras([])
          setRawRowsCompras([])
          return
        }

        const primeiraLinha = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)[0] || ''
        const sep = primeiraLinha.includes('\t') ? '\t' : primeiraLinha.includes(';') ? ';' : ','
        const cabecalhosOriginais = primeiraLinha
          .split(sep)
          .map((c) => c.replace(/^["']|["']$/g, '').trim())

        const headersUsados = cabecalhosOriginais.length > 0 ? cabecalhosOriginais : headers
        setRawHeadersCompras(headersUsados)
        setRawRowsCompras(rawRows)

        const autoMap = autoDetectarColunasCompras(headersUsados)
        setMapeamentoCompras(autoMap)

        toast({
          title: 'Arquivo de compras carregado',
          description: `${rawRows.length} compras detectadas. Confira o mapeamento e a prévia.`,
        })
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Erro ao processar arquivo',
          description: err instanceof Error ? err.message : 'Falha ao processar o formato CSV/TXT.',
        })
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  // ==========================================
  // VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS
  // ==========================================
  // Clientes:
  // nome_contato (obrigatório)
  // telefone (obrigatório se email não mapeado)
  // email (obrigatório se telefone não mapeado)
  // cnpj_cpf (obrigatório se email não mapeado)
  const validacaoClientes = useMemo(() => {
    const temNome = Boolean(mapeamentoClientes.nome_contato)
    const temEmail = Boolean(mapeamentoClientes.email)
    const temTelefone = Boolean(mapeamentoClientes.telefone)
    const temCnpjCpf = Boolean(mapeamentoClientes.cnpj_cpf)

    const errosCampos: Partial<Record<CampoClienteCrm, string>> = {}

    if (!temNome) {
      errosCampos.nome_contato = 'Campo obrigatório não mapeado'
    }

    if (!temEmail) {
      if (!temTelefone) {
        errosCampos.telefone = 'Campo obrigatório não mapeado (e-mail ausente)'
      }
      if (!temCnpjCpf) {
        errosCampos.cnpj_cpf = 'Campo obrigatório não mapeado (e-mail ausente)'
      }
      if (!temTelefone && !temCnpjCpf) {
        errosCampos.email = 'Campo obrigatório não mapeado'
      }
    }

    const valido = Object.keys(errosCampos).length === 0
    return { valido, errosCampos }
  }, [mapeamentoClientes])

  // Compras:
  // cliente (obrigatório)
  // data_compra (obrigatório)
  // valor (obrigatório)
  const validacaoCompras = useMemo(() => {
    const temCliente = Boolean(mapeamentoCompras.cliente)
    const temData = Boolean(mapeamentoCompras.data_compra)
    const temValor = Boolean(mapeamentoCompras.valor)

    const errosCampos: Partial<Record<CampoCompraCrm, string>> = {}

    if (!temCliente) errosCampos.cliente = 'Campo obrigatório não mapeado'
    if (!temData) errosCampos.data_compra = 'Campo obrigatório não mapeado'
    if (!temValor) errosCampos.valor = 'Campo obrigatório não mapeado'

    const valido = Object.keys(errosCampos).length === 0
    return { valido, errosCampos }
  }, [mapeamentoCompras])

  // ==========================================
  // SALVAR / RECUPERAR PERFIL DE MAPEAMENTO
  // ==========================================
  const handleSalvarPerfilClientes = () => {
    try {
      localStorage.setItem(STORAGE_KEY_MAP_CLIENTES, JSON.stringify(mapeamentoClientes))
      toast({
        title: 'Mapeamento salvo',
        description: 'O perfil de colunas de clientes foi salvo como padrão neste navegador.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o perfil de mapeamento no armazenamento local.',
      })
    }
  }

  const handleUsarPerfilClientes = () => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_MAP_CLIENTES)
      if (!salvo) {
        toast({
          title: 'Nenhum perfil salvo',
          description: 'Ainda não existe um perfil padrão de clientes salvo.',
        })
        return
      }
      const parsed = JSON.parse(salvo)
      // Ajusta apenas colunas que existam no cabeçalho atual se houver arquivo
      setMapeamentoClientes((prev) => ({
        ...prev,
        ...parsed,
      }))
      toast({
        title: 'Mapeamento aplicado',
        description: 'O perfil salvo de clientes foi carregado com sucesso.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Falha ao ler perfil salvo do armazenamento local.',
      })
    }
  }

  const handleSalvarPerfilCompras = () => {
    try {
      localStorage.setItem(STORAGE_KEY_MAP_COMPRAS, JSON.stringify(mapeamentoCompras))
      toast({
        title: 'Mapeamento salvo',
        description: 'O perfil de colunas de compras foi salvo como padrão neste navegador.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o perfil de mapeamento de compras.',
      })
    }
  }

  const handleUsarPerfilCompras = () => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_MAP_COMPRAS)
      if (!salvo) {
        toast({
          title: 'Nenhum perfil salvo',
          description: 'Ainda não existe um perfil padrão de compras salvo.',
        })
        return
      }
      const parsed = JSON.parse(salvo)
      setMapeamentoCompras((prev) => ({
        ...prev,
        ...parsed,
      }))
      toast({
        title: 'Mapeamento aplicado',
        description: 'O perfil salvo de compras foi carregado com sucesso.',
      })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Falha ao ler perfil salvo de compras.',
      })
    }
  }

  // ==========================================
  // DOWNLOAD MODELOS CSV
  // ==========================================
  const handleBaixarModelos = () => {
    // 1. clientes_modelo.csv com 2 linhas de exemplo
    const conteudoClientes =
      'nome_contato,nome_empresa,telefone,cidade,email,cnpj_cpf,data_ultima_compra,grande_cliente\n' +
      'Carlos Oliveira,Distribuidora Oliveira,(11) 98765-4321,São Paulo,carlos@oliveira.com.br,12.345.678/0001-90,2024-03-15,sim\n' +
      'Mariana Santos,Santos Alimentos,(19) 99876-5432,Campinas,mariana@santosalimentos.com.br,98.765.432/0001-10,10/02/2024,nao\n'

    // 2. compras_modelo.csv com 2 linhas de exemplo
    const conteudoCompras =
      'cliente,data_compra,valor\n' +
      '12.345.678/0001-90,2024-03-20,4500.50\n' +
      'mariana@santosalimentos.com.br,25/03/2024,1850.00\n'

    const downloadCsv = (nomeArquivo: string, conteudo: string) => {
      const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', nomeArquivo)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }

    downloadCsv('clientes_modelo.csv', conteudoClientes)
    setTimeout(() => {
      downloadCsv('compras_modelo.csv', conteudoCompras)
    }, 300)

    toast({
      title: 'Modelos CSV gerados',
      description: 'Os arquivos clientes_modelo.csv e compras_modelo.csv foram baixados.',
    })
  }

  // ==========================================
  // PROCESSAR IMPORTAÇÃO DE CLIENTES
  // ==========================================
  const handleProcessarClientes = async () => {
    if (!validacaoClientes.valido || rawRowsClientes.length === 0) return

    setProcessandoClientes(true)
    let criados = 0
    let atualizados = 0
    const erros: string[] = []

    try {
      // 1. Carregar clientes existentes para lookup em memória
      const clientesExistentes = await pb.collection('clientes').getFullList({
        sort: '-created',
        requestKey: null,
      })

      const limparDoc = (doc?: string) => (doc || '').replace(/[^\w]/g, '').trim().toLowerCase()
      const limparEmail = (em?: string) => (em || '').trim().toLowerCase()

      const mapPorCnpjCpf = new Map<string, (typeof clientesExistentes)[0]>()
      const mapPorEmail = new Map<string, (typeof clientesExistentes)[0]>()

      clientesExistentes.forEach((c) => {
        const docLimpo = limparDoc(c.cnpj_cpf)
        if (docLimpo) mapPorCnpjCpf.set(docLimpo, c)
        const emailLimpo = limparEmail(c.email)
        if (emailLimpo) mapPorEmail.set(emailLimpo, c)
      })

      // Mapear índices das colunas selecionadas
      const getColIdx = (colName: string) => rawHeadersClientes.indexOf(colName)

      const idxNome = getColIdx(mapeamentoClientes.nome_contato)
      const idxEmpresa = getColIdx(mapeamentoClientes.nome_empresa)
      const idxTelefone = getColIdx(mapeamentoClientes.telefone)
      const idxCidade = getColIdx(mapeamentoClientes.cidade)
      const idxEmail = getColIdx(mapeamentoClientes.email)
      const idxCnpjCpf = getColIdx(mapeamentoClientes.cnpj_cpf)
      const idxData = getColIdx(mapeamentoClientes.data_ultima_compra)
      const idxGrande = getColIdx(mapeamentoClientes.grande_cliente)

      for (let i = 0; i < rawRowsClientes.length; i++) {
        const row = rawRowsClientes[i]
        const numLinha = i + 2 // Linha 1 é cabeçalho

        const nome = idxNome >= 0 ? (row[idxNome] || '').trim() : ''
        if (!nome) {
          erros.push(`Linha ${numLinha}: Nome do contato está vazio.`)
          continue
        }

        const email = idxEmail >= 0 ? (row[idxEmail] || '').trim() : ''
        const cnpjCpf = idxCnpjCpf >= 0 ? (row[idxCnpjCpf] || '').trim() : ''
        const telefone = idxTelefone >= 0 ? (row[idxTelefone] || '').trim() : ''
        const empresa = idxEmpresa >= 0 ? (row[idxEmpresa] || '').trim() : ''
        const cidade = idxCidade >= 0 ? (row[idxCidade] || '').trim() : ''
        const dataCompraNorm = idxData >= 0 ? normalizarData(row[idxData]) : null
        const grandeCliente = idxGrande >= 0 ? normalizarBooleano(row[idxGrande]) : false

        const docLimpo = limparDoc(cnpjCpf)
        const emailLimpo = limparEmail(email)

        // Se ambos vazios e telefone vazio, erro
        if (!emailLimpo && !docLimpo && !telefone) {
          erros.push(`Linha ${numLinha} (${nome}): Nenhum e-mail, telefone ou documento informado.`)
          continue
        }

        const clienteExistente =
          (docLimpo ? mapPorCnpjCpf.get(docLimpo) : null) ||
          (emailLimpo ? mapPorEmail.get(emailLimpo) : null)

        const payload: Record<string, unknown> = {
          nome_contato: nome,
          responsavel_id: user?.id,
        }

        if (empresa) payload.nome_empresa = empresa
        if (telefone) payload.telefone = telefone
        if (cidade) payload.cidade = cidade
        if (email) payload.email = email
        if (cnpjCpf) payload.cnpj_cpf = cnpjCpf
        if (idxGrande >= 0) payload.grande_cliente = grandeCliente

        if (dataCompraNorm) {
          payload.data_ultima_compra = dataCompraNorm
        }

        try {
          if (clienteExistente) {
            // Atualizar
            if (dataCompraNorm) {
              payload.data_ultima_compra = dataMaisRecente(
                clienteExistente.data_ultima_compra,
                dataCompraNorm,
              )
            } else if (clienteExistente.data_ultima_compra) {
              delete payload.data_ultima_compra
            }

            const recAtualizado = await pb
              .collection('clientes')
              .update(clienteExistente.id, payload, { requestKey: null })

            atualizados++
            if (docLimpo) mapPorCnpjCpf.set(docLimpo, recAtualizado)
            if (emailLimpo) mapPorEmail.set(emailLimpo, recAtualizado)
          } else {
            // Criar novo
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

      const res = {
        criados,
        atualizados,
        falhas: erros.length,
        erros,
      }
      setResultadoClientes(res)

      // Contador final: "X criados, Y atualizados, Z erros"
      const resultadoTexto = `${criados} criados, ${atualizados} atualizados, ${erros.length} erros`
      registrarLog({
        tipo: 'clientes',
        arquivo: arquivoClientes?.name || 'clientes.csv',
        resultado: resultadoTexto,
        detalhes: res,
      })

      toast({
        title: 'Importação de clientes finalizada',
        description: resultadoTexto,
      })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erro crítico na importação',
        description: err instanceof Error ? err.message : 'Falha ao processar os registros.',
      })
    } finally {
      setProcessandoClientes(false)
    }
  }

  // ==========================================
  // PROCESSAR IMPORTAÇÃO DE COMPRAS
  // ==========================================
  const handleProcessarCompras = async () => {
    if (!validacaoCompras.valido || rawRowsCompras.length === 0) return

    setProcessandoCompras(true)
    let comprasProcessadas = 0
    let clientesAtualizados = 0
    const erros: string[] = []

    try {
      // 1. Carregar todos clientes para busca rápida
      const todosClientes = await pb.collection('clientes').getFullList({
        sort: '-created',
        requestKey: null,
      })

      const limparDoc = (doc?: string) => (doc || '').replace(/[^\w]/g, '').trim().toLowerCase()
      const limparEmail = (em?: string) => (em || '').trim().toLowerCase()

      const getColIdx = (colName: string) => rawHeadersCompras.indexOf(colName)

      const idxCliente = getColIdx(mapeamentoCompras.cliente)
      const idxData = getColIdx(mapeamentoCompras.data_compra)
      const idxValor = getColIdx(mapeamentoCompras.valor)

      // Agrupar compras por cliente
      const agrupadoPorCliente = new Map<
        string,
        {
          clienteRecord: (typeof todosClientes)[0]
          totalCompras: number
          dataMaisRecenteCompra: string | null
          comprasContador: number
        }
      >()

      for (let i = 0; i < rawRowsCompras.length; i++) {
        const row = rawRowsCompras[i]
        const numLinha = i + 2

        const ident = idxCliente >= 0 ? (row[idxCliente] || '').trim() : ''
        if (!ident) {
          erros.push(`Linha ${numLinha}: Identificador do cliente não informado.`)
          continue
        }

        const dataStr = idxData >= 0 ? row[idxData] : ''
        const valorStr = idxValor >= 0 ? row[idxValor] : ''

        const dataNorm = normalizarData(dataStr)
        const valorDecimal = normalizarValorDecimal(valorStr)

        const identDoc = limparDoc(ident)
        const identEmail = limparEmail(ident)

        const clienteEncontrado = todosClientes.find((c) => {
          const cDoc = limparDoc(c.cnpj_cpf)
          const cEmail = limparEmail(c.email)
          return (identDoc && cDoc === identDoc) || (identEmail && cEmail === identEmail)
        })

        if (!clienteEncontrado) {
          erros.push(`Linha ${numLinha}: Cliente "${ident}" não foi localizado na base do CRM.`)
          continue
        }

        comprasProcessadas++

        const atual = agrupadoPorCliente.get(clienteEncontrado.id)
        if (atual) {
          atual.totalCompras += valorDecimal
          atual.comprasContador += 1
          if (dataNorm) {
            atual.dataMaisRecenteCompra = dataMaisRecente(atual.dataMaisRecenteCompra, dataNorm)
          }
        } else {
          agrupadoPorCliente.set(clienteEncontrado.id, {
            clienteRecord: clienteEncontrado,
            totalCompras: valorDecimal,
            dataMaisRecenteCompra: dataNorm,
            comprasContador: 1,
          })
        }
      }

      // 2. Atualizar clientes: somar total nas observações sem apagar existente
      for (const [clienteId, dados] of agrupadoPorCliente.entries()) {
        try {
          const dataFinal = dataMaisRecente(
            dados.clienteRecord.data_ultima_compra,
            dados.dataMaisRecenteCompra,
          )

          const valorFormatado = formatarMoeda(dados.totalCompras)
          const textoImportado = `Total de compras importado: ${valorFormatado}`

          const obsExistente = dados.clienteRecord.observacoes
            ? dados.clienteRecord.observacoes.trim()
            : ''

          let novaObservacao: string
          if (obsExistente.length > 0) {
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

      const res = {
        processadas: comprasProcessadas,
        clientesAtualizados,
        falhas: erros.length,
        erros,
      }
      setResultadoCompras(res)

      // Contador: "X compras processadas, Y clientes atualizados, Z erros"
      const resultadoTexto = `${comprasProcessadas} compras processadas, ${clientesAtualizados} clientes atualizados, ${erros.length} erros`
      registrarLog({
        tipo: 'compras',
        arquivo: arquivoCompras?.name || 'compras.csv',
        resultado: resultadoTexto,
        detalhes: res,
      })

      toast({
        title: 'Importação de compras finalizada',
        description: resultadoTexto,
      })
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erro ao processar compras',
        description: err instanceof Error ? err.message : 'Falha crítica ao atualizar compras.',
      })
    } finally {
      setProcessandoCompras(false)
    }
  }

  // ==========================================
  // BLOQUEIO DE ACESSO RESTRITO
  // ==========================================
  if (!isCeoFinanceiro) {
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
                A importação de lotes de clientes e compras do Bling é restrita exclusivamente ao
                perfil <strong>CEO / Diretor Financeiro</strong>.
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

  return (
    <div className="space-y-8 animate-fade-in pb-16 max-w-6xl mx-auto">
      {/* Topo com Botão Voltar e Ações */}
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
              Importação Bling ERP
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1">
            Importação de Dados com Mapeamento
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Envie planilhas CSV ou TXT exportadas do Bling ERP com auto-detecção e mapeamento
            flexível de colunas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBaixarModelos}
            className="text-[#0F172A] border-slate-300 hover:bg-slate-100 font-semibold gap-1.5 text-xs h-9"
          >
            <Download className="w-4 h-4 text-[#16A34A]" />
            <span>Baixar modelo CSV</span>
          </Button>
        </div>
      </div>

      {/* Abas de Navegação entre Clientes e Compras */}
      <Tabs
        value={abaAtiva}
        onValueChange={(v) => setAbaAtiva(v as 'clientes' | 'compras')}
        className="space-y-6"
      >
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="clientes"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#16A34A] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            1. Importação de Clientes
            {rawRowsClientes.length > 0 && ` (${rawRowsClientes.length})`}
          </TabsTrigger>

          <TabsTrigger
            value="compras"
            className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#2563EB] data-[state=active]:shadow-sm flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            2. Importação de Compras
            {rawRowsCompras.length > 0 && ` (${rawRowsCompras.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ======================================================== */}
        {/* ABA 1: CLIENTES */}
        {/* ======================================================== */}
        <TabsContent value="clientes" className="space-y-6 focus-visible:outline-none">
          <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#16A34A] flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-[#0F172A]">
                      Importar Clientes com Mapeamento
                    </CardTitle>
                    <CardDescription className="text-xs text-[#64748B]">
                      Aceita arquivos .csv ou .txt com separador automático (vírgula,
                      ponto-e-vírgula ou tab).
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUsarPerfilClientes}
                    className="text-xs text-[#64748B] hover:text-[#0F172A] gap-1"
                    title="Carregar perfil salvo do localStorage"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Usar mapeamento salvo</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSalvarPerfilClientes}
                    className="text-xs text-[#16A34A] border-emerald-300 hover:bg-emerald-50 gap-1 font-semibold"
                    title="Salvar mapeamento atual como padrão"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar mapeamento</span>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {/* Botão de Selecionar Arquivo */}
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
                  {arquivoClientes
                    ? 'Trocar Arquivo de Clientes'
                    : 'Selecionar Arquivo .CSV ou .TXT'}
                </Button>

                {arquivoClientes && (
                  <div className="flex items-center gap-2 text-xs text-[#0F172A] bg-slate-100 py-1.5 px-3 rounded-lg w-full sm:w-auto truncate">
                    <FileSpreadsheet className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
                    <span className="font-semibold truncate">{arquivoClientes.name}</span>
                    <span className="text-[#64748B] text-[11px]">
                      ({(arquivoClientes.size / 1024).toFixed(1)} KB — {rawRowsClientes.length}{' '}
                      linhas)
                    </span>
                  </div>
                )}
              </div>

              {/* Resultado anterior */}
              {resultadoClientes && (
                <Alert
                  className={`rounded-xl ${
                    resultadoClientes.falhas === 0
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-amber-200 bg-amber-50 text-amber-950'
                  }`}
                >
                  {resultadoClientes.falhas === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  <AlertTitle className="font-bold text-sm">Resultado da Importação</AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <p className="font-semibold">
                      {resultadoClientes.criados} criados, {resultadoClientes.atualizados}{' '}
                      atualizados, {resultadoClientes.falhas} erros
                    </p>
                    {resultadoClientes.erros.length > 0 && (
                      <div className="mt-2 p-2 bg-white/80 rounded border border-amber-200 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
                        {resultadoClientes.erros.map((err, idx) => (
                          <div key={idx} className="text-red-700 flex items-start gap-1">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* SEÇÃO: MAPEAMENTO DE COLUNAS */}
              {rawHeadersClientes.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-[#E2E8F0]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#16A34A]" />
                        Mapear Colunas do CSV para os Campos do CRM
                      </h4>
                      <p className="text-xs text-[#64748B]">
                        Associe as colunas encontradas no seu arquivo aos campos correspondentes do
                        Colesel 45.
                      </p>
                    </div>

                    {!validacaoClientes.valido && (
                      <Badge variant="destructive" className="text-xs gap-1 py-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Campos obrigatórios pendentes
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    {CAMPOS_CLIENTES_INFO.map((campo) => {
                      const erro = validacaoClientes.errosCampos[campo.id]
                      const valorSelecionado = mapeamentoClientes[campo.id] || ''

                      return (
                        <div
                          key={campo.id}
                          className={`p-3 rounded-lg bg-white border transition-all ${
                            erro ? 'border-red-500 shadow-sm bg-red-50/20' : 'border-[#E2E8F0]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-[#0F172A] flex items-center gap-1">
                              {campo.label}
                              {(campo.id === 'nome_contato' ||
                                (campo.id === 'email' && !mapeamentoClientes.telefone) ||
                                (campo.id === 'telefone' && !mapeamentoClientes.email) ||
                                (campo.id === 'cnpj_cpf' && !mapeamentoClientes.email)) && (
                                <span className="text-red-500">*</span>
                              )}
                            </label>
                            <span className="text-[11px] text-[#64748B]">{campo.desc}</span>
                          </div>

                          <Select
                            value={valorSelecionado || '_none_'}
                            onValueChange={(val) =>
                              setMapeamentoClientes((prev) => ({
                                ...prev,
                                [campo.id]: val === '_none_' ? '' : val,
                              }))
                            }
                          >
                            <SelectTrigger
                              className={`h-9 text-xs bg-white ${
                                erro ? 'border-red-500 focus:ring-red-500' : ''
                              }`}
                            >
                              <SelectValue placeholder="Selecione a coluna do CSV..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none_">
                                <span className="text-slate-400 italic">-- Não mapear --</span>
                              </SelectItem>
                              {rawHeadersClientes.map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {erro && (
                            <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              {erro}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* BLOQUEIO DE IMPORTAÇÃO SE HOUVER ERRO DE OBRIGATÓRIOS */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-[#64748B]">
                      {!validacaoClientes.valido
                        ? '⚠️ Mapeie todos os campos obrigatórios em destaque vermelho para liberar a importação.'
                        : '✅ Todos os campos obrigatórios estão mapeados. Você já pode confirmar a importação.'}
                    </p>

                    <Button
                      onClick={handleProcessarClientes}
                      disabled={!validacaoClientes.valido || processandoClientes}
                      className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs shadow-sm gap-2 w-full sm:w-auto disabled:opacity-50"
                    >
                      {processandoClientes ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Gravando no banco...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmar Importação de Clientes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* SEÇÃO: PRÉVIA DAS 10 PRIMEIRAS LINHAS BRUTAS */}
              {rawHeadersClientes.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-[#E2E8F0]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Prévia das primeiras {Math.min(rawRowsClientes.length, 10)} linhas brutas do
                    arquivo
                  </h4>

                  <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto bg-white shadow-sm max-h-80">
                    <Table>
                      <TableHeader className="bg-slate-50 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="text-xs font-semibold text-[#0F172A] w-12">
                            #
                          </TableHead>
                          {rawHeadersClientes.map((col, idx) => (
                            <TableHead
                              key={idx}
                              className="text-xs font-semibold text-[#0F172A] whitespace-nowrap"
                            >
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-[#E2E8F0]">
                        {rawRowsClientes.slice(0, 10).map((row, rIdx) => (
                          <TableRow key={rIdx} className="hover:bg-slate-50/70 text-xs">
                            <TableCell className="text-[#64748B] font-mono text-[11px]">
                              {rIdx + 1}
                            </TableCell>
                            {rawHeadersClientes.map((_, cIdx) => (
                              <TableCell
                                key={cIdx}
                                className="text-[#0F172A] whitespace-nowrap font-mono text-[11px]"
                              >
                                {row[cIdx] || <span className="text-slate-300">-</span>}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 2: COMPRAS */}
        {/* ======================================================== */}
        <TabsContent value="compras" className="space-y-6 focus-visible:outline-none">
          <Card className="border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="bg-[#F8FAFC] border-b border-[#E2E8F0] pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-[#0F172A]">
                      Importar Compras com Mapeamento
                    </CardTitle>
                    <CardDescription className="text-xs text-[#64748B]">
                      Localiza clientes por CNPJ/CPF ou E-mail, atualiza data da última compra e
                      soma o total nas observações.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUsarPerfilCompras}
                    className="text-xs text-[#64748B] hover:text-[#0F172A] gap-1"
                    title="Carregar perfil salvo do localStorage"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Usar mapeamento salvo</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSalvarPerfilCompras}
                    className="text-xs text-[#2563EB] border-blue-300 hover:bg-blue-50 gap-1 font-semibold"
                    title="Salvar mapeamento atual como padrão"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar mapeamento</span>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {/* Botão de Selecionar Arquivo */}
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
                  {arquivoCompras
                    ? 'Trocar Arquivo de Compras'
                    : 'Selecionar Arquivo de Compras (.csv/.txt)'}
                </Button>

                {arquivoCompras && (
                  <div className="flex items-center gap-2 text-xs text-[#0F172A] bg-slate-100 py-1.5 px-3 rounded-lg w-full sm:w-auto truncate">
                    <FileSpreadsheet className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
                    <span className="font-semibold truncate">{arquivoCompras.name}</span>
                    <span className="text-[#64748B] text-[11px]">
                      ({(arquivoCompras.size / 1024).toFixed(1)} KB — {rawRowsCompras.length}{' '}
                      linhas)
                    </span>
                  </div>
                )}
              </div>

              {/* Resultado anterior */}
              {resultadoCompras && (
                <Alert
                  className={`rounded-xl ${
                    resultadoCompras.falhas === 0
                      ? 'border-blue-200 bg-blue-50 text-blue-950'
                      : 'border-amber-200 bg-amber-50 text-amber-950'
                  }`}
                >
                  {resultadoCompras.falhas === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-[#2563EB]" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  <AlertTitle className="font-bold text-sm">
                    Resultado da Importação de Compras
                  </AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <p className="font-semibold">
                      {resultadoCompras.processadas} compras processadas,{' '}
                      {resultadoCompras.clientesAtualizados} clientes atualizados,{' '}
                      {resultadoCompras.falhas} erros
                    </p>
                    {resultadoCompras.erros.length > 0 && (
                      <div className="mt-2 p-2 bg-white/80 rounded border border-amber-200 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
                        {resultadoCompras.erros.map((err, idx) => (
                          <div key={idx} className="text-red-700 flex items-start gap-1">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* SEÇÃO: MAPEAMENTO DE COLUNAS DE COMPRAS */}
              {rawHeadersCompras.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-[#E2E8F0]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#2563EB]" />
                        Mapear Colunas de Compras
                      </h4>
                      <p className="text-xs text-[#64748B]">
                        Associe a coluna do cliente (identificador), data da compra e valor.
                      </p>
                    </div>

                    {!validacaoCompras.valido && (
                      <Badge variant="destructive" className="text-xs gap-1 py-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Campos obrigatórios pendentes
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    {CAMPOS_COMPRAS_INFO.map((campo) => {
                      const erro = validacaoCompras.errosCampos[campo.id]
                      const valorSelecionado = mapeamentoCompras[campo.id] || ''

                      return (
                        <div
                          key={campo.id}
                          className={`p-3 rounded-lg bg-white border transition-all ${
                            erro ? 'border-red-500 shadow-sm bg-red-50/20' : 'border-[#E2E8F0]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-[#0F172A]">
                              {campo.label} <span className="text-red-500">*</span>
                            </label>
                          </div>
                          <p className="text-[11px] text-[#64748B] mb-2">{campo.desc}</p>

                          <Select
                            value={valorSelecionado || '_none_'}
                            onValueChange={(val) =>
                              setMapeamentoCompras((prev) => ({
                                ...prev,
                                [campo.id]: val === '_none_' ? '' : val,
                              }))
                            }
                          >
                            <SelectTrigger
                              className={`h-9 text-xs bg-white ${
                                erro ? 'border-red-500 focus:ring-red-500' : ''
                              }`}
                            >
                              <SelectValue placeholder="Selecione a coluna..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none_">
                                <span className="text-slate-400 italic">-- Não mapear --</span>
                              </SelectItem>
                              {rawHeadersCompras.map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {erro && (
                            <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              {erro}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* BLOQUEIO DE IMPORTAÇÃO SE HOUVER ERRO DE OBRIGATÓRIOS */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-[#64748B]">
                      {!validacaoCompras.valido
                        ? '⚠️ Mapeie todos os campos obrigatórios (cliente, data_compra, valor) para liberar a importação.'
                        : '✅ Campos de compras mapeados. Pronto para processar.'}
                    </p>

                    <Button
                      onClick={handleProcessarCompras}
                      disabled={!validacaoCompras.valido || processandoCompras}
                      className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs shadow-sm gap-2 w-full sm:w-auto disabled:opacity-50"
                    >
                      {processandoCompras ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Atualizando compras no banco...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmar Importação de Compras
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* SEÇÃO: PRÉVIA DAS 10 PRIMEIRAS LINHAS BRUTAS DE COMPRAS */}
              {rawHeadersCompras.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-[#E2E8F0]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Prévia das primeiras {Math.min(rawRowsCompras.length, 10)} linhas brutas do
                    arquivo
                  </h4>

                  <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto bg-white shadow-sm max-h-80">
                    <Table>
                      <TableHeader className="bg-slate-50 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="text-xs font-semibold text-[#0F172A] w-12">
                            #
                          </TableHead>
                          {rawHeadersCompras.map((col, idx) => (
                            <TableHead
                              key={idx}
                              className="text-xs font-semibold text-[#0F172A] whitespace-nowrap"
                            >
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-[#E2E8F0]">
                        {rawRowsCompras.slice(0, 10).map((row, rIdx) => (
                          <TableRow key={rIdx} className="hover:bg-slate-50/70 text-xs">
                            <TableCell className="text-[#64748B] font-mono text-[11px]">
                              {rIdx + 1}
                            </TableCell>
                            {rawHeadersCompras.map((_, cIdx) => (
                              <TableCell
                                key={cIdx}
                                className="text-[#0F172A] whitespace-nowrap font-mono text-[11px]"
                              >
                                {row[cIdx] || <span className="text-slate-300">-</span>}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                Histórico das Últimas 10 Importações
              </CardTitle>
              <CardDescription className="text-xs text-[#64748B]">
                Registro mantido no navegador das operações realizadas de clientes e compras.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {logs.length === 0 ? (
            <div className="py-12 text-center rounded-xl border border-dashed border-[#E2E8F0] bg-slate-50/50 space-y-2">
              <History className="w-8 h-8 text-[#94A3B8] mx-auto" />
              <p className="text-xs font-medium text-[#64748B]">
                Nenhuma importação realizada recentemente neste navegador.
              </p>
              <p className="text-[11px] text-[#94A3B8]">
                Os relatórios das importações aparecerão aqui automaticamente.
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
