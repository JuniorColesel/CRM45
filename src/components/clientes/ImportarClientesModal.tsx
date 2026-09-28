import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { parseCSV, normalizarNomeColuna } from '@/lib/importacao/csvUtils'
import {
  agruparEDeduplicarClientes,
  normalizarVendedor,
  normalizarStatusCliente,
  normalizarGrandeCliente,
  normalizarTipoContato,
  type ClienteImportItem,
} from '@/lib/clientes/clienteUtils'
import { formatarMoeda } from '@/types/clientes'

interface ImportarClientesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export default function ImportarClientesModal({
  open,
  onOpenChange,
  onSuccess,
}: ImportarClientesModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [clientesAgrupados, setClientesAgrupados] = useState<ClienteImportItem[]>([])
  const [totalLinhasArquivo, setTotalLinhasArquivo] = useState(0)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{
    criados: number
    atualizados: number
    falhas: number
  } | null>(null)

  useEffect(() => {
    if (!open) {
      setArquivo(null)
      setClientesAgrupados([])
      setTotalLinhasArquivo(0)
      setProgresso(0)
      setResultado(null)
      setImportando(false)
    }
  }, [open])

  const handleArquivoSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setArquivo(file)
    setResultado(null)
    setProgresso(0)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '')
        const { headers, rawRows } = parseCSV(text)

        if (headers.length === 0 || rawRows.length === 0) {
          toast({
            variant: 'destructive',
            title: 'Arquivo sem dados válidos',
            description: 'O arquivo não contém cabeçalhos ou linhas reconhecíveis.',
          })
          return
        }

        // Mapear cabeçalhos normalizados para índices das colunas
        const headerMap = new Map<string, number>()
        headers.forEach((h, idx) => {
          const norm = normalizarNomeColuna(h)
          headerMap.set(norm, idx)
          // Mapear também variantes específicas do CSV
          if (norm.includes('empresa') || norm === 'nome_empresa')
            headerMap.set('nome_empresa', idx)
          if (norm.includes('contato') || norm === 'nome_contato')
            headerMap.set('nome_contato', idx)
          if (norm.includes('cnpj') || norm.includes('cpf')) headerMap.set('cnpj_cpf', idx)
          if (norm.includes('venda')) headerMap.set('valor_total_vendas', idx)
          if (norm.includes('compra') && !norm.includes('data'))
            headerMap.set('valor_total_compras', idx)
          if (norm.includes('vendedor')) headerMap.set('vendedor', idx)
          if (norm.includes('status')) headerMap.set('status_cliente', idx)
          if (norm.includes('grande')) headerMap.set('grande_cliente', idx)
          if (norm.includes('tipo')) headerMap.set('tipo_contato', idx)
          if (norm.includes('ultima')) headerMap.set('data_ultima_compra', idx)
          if (norm.includes('primeira')) headerMap.set('data_primeira_compra', idx)
        })

        const itensBrutos: ClienteImportItem[] = []

        for (const row of rawRows) {
          const getVal = (key: string): string => {
            const idx = headerMap.get(key)
            if (idx !== undefined && row[idx] !== undefined) {
              return String(row[idx]).trim()
            }
            return ''
          }

          const nomeEmpresa = getVal('nome_empresa') || getVal('nome_contato')
          if (!nomeEmpresa) continue

          const parseNumero = (valStr: string): number => {
            if (!valStr) return 0
            const limpo = valStr.replace(/[R$\s]/g, '')
            if (limpo.includes(',') && limpo.includes('.')) {
              return parseFloat(limpo.replace(/\./g, '').replace(',', '.')) || 0
            }
            if (limpo.includes(',')) {
              return parseFloat(limpo.replace(',', '.')) || 0
            }
            return parseFloat(limpo) || 0
          }

          const parseData = (dStr: string): string | undefined => {
            if (!dStr) return undefined
            const match = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
            if (match) return `${match[1]}-${match[2]}-${match[3]}`
            const matchBr = dStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
            if (matchBr) return `${matchBr[3]}-${matchBr[2]}-${matchBr[1]}`
            return undefined
          }

          itensBrutos.push({
            nome_empresa: nomeEmpresa,
            nome_contato: getVal('nome_contato') || nomeEmpresa,
            cnpj_cpf: getVal('cnpj_cpf') || undefined,
            telefone: getVal('telefone') || undefined,
            email: getVal('email') || undefined,
            cidade: getVal('cidade') || undefined,
            estado: getVal('estado') ? getVal('estado').substring(0, 2).toUpperCase() : undefined,
            data_ultima_compra: parseData(getVal('data_ultima_compra')),
            data_primeira_compra: parseData(getVal('data_primeira_compra')),
            valor_total_compras: parseNumero(getVal('valor_total_compras')),
            valor_total_vendas: parseNumero(getVal('valor_total_vendas')),
            grande_cliente: normalizarGrandeCliente(getVal('grande_cliente')),
            tipo_contato: normalizarTipoContato(getVal('tipo_contato')),
            vendedor: normalizarVendedor(getVal('vendedor')),
            status_cliente: normalizarStatusCliente(getVal('status_cliente')),
          })
        }

        // Deduplicação e agrupamento por sufixo societário somando valores numéricos
        const agrupados = agruparEDeduplicarClientes(itensBrutos)

        setTotalLinhasArquivo(rawRows.length)
        setClientesAgrupados(agrupados)

        toast({
          title: 'Arquivo processado com sucesso',
          description: `${rawRows.length} linhas lidas e agrupadas em ${agrupados.length} clientes únicos (valores somados).`,
        })
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Erro ao analisar arquivo',
          description: err instanceof Error ? err.message : 'Falha ao processar o CSV.',
        })
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const executarImportacao = async () => {
    if (clientesAgrupados.length === 0) return
    setImportando(true)
    setProgresso(0)

    let criados = 0
    let atualizados = 0
    let falhas = 0

    // Carregar clientes existentes para verificar deduplicação prévia no banco
    let existentesNoBanco: Record<string, string> = {}
    try {
      const records = await pb.collection('clientes').getFullList({
        fields: 'id,nome_empresa,cnpj_cpf,valor_total_vendas,valor_total_compras',
      })
      records.forEach((r) => {
        if (r.nome_empresa) {
          existentesNoBanco[r.nome_empresa.trim().toLowerCase()] = r.id
        }
      })
    } catch {
      existentesNoBanco = {}
    }

    const total = clientesAgrupados.length

    for (let i = 0; i < total; i++) {
      const item = clientesAgrupados[i]
      const chaveExistente = existentesNoBanco[item.nome_empresa.trim().toLowerCase()]

      const payload: Record<string, unknown> = {
        nome_empresa: item.nome_empresa,
        nome_contato: item.nome_contato || item.nome_empresa,
        cnpj_cpf: item.cnpj_cpf || '',
        telefone: item.telefone || '',
        email: item.email || '',
        cidade: item.cidade || '',
        estado: item.estado || '',
        vendedor: item.vendedor,
        tipo_contato: item.tipo_contato,
        status_cliente: item.status_cliente,
        grande_cliente: item.grande_cliente,
        valor_total_vendas: item.valor_total_vendas,
        valor_total_compras: item.valor_total_compras,
        data_ultima_compra: item.data_ultima_compra
          ? new Date(item.data_ultima_compra).toISOString()
          : null,
        data_primeira_compra: item.data_primeira_compra
          ? new Date(item.data_primeira_compra).toISOString()
          : null,
        status: item.status_cliente === 'ativo' ? 'ativo' : 'rascunho',
      }

      try {
        if (chaveExistente) {
          await pb.collection('clientes').update(chaveExistente, payload)
          atualizados++
        } else {
          const rec = await pb.collection('clientes').create(payload)
          existentesNoBanco[item.nome_empresa.trim().toLowerCase()] = rec.id
          criados++
        }
      } catch (err: unknown) {
        // Se falhou por conflito de chave única ou CNPJ duplicado, tenta localizar e atualizar
        try {
          const records = await pb.collection('clientes').getList(1, 1, {
            filter: `nome_empresa = '${item.nome_empresa.replace(/'/g, "\\'")}'`,
          })
          if (records.items.length > 0) {
            await pb.collection('clientes').update(records.items[0].id, payload)
            atualizados++
          } else {
            falhas++
          }
        } catch {
          falhas++
        }
      }

      setProgresso(Math.round(((i + 1) / total) * 100))
    }

    setImportando(false)
    setResultado({ criados, atualizados, falhas })

    toast({
      title: 'Importação concluída',
      description: `${criados} criados, ${atualizados} atualizados, ${falhas} falhas.`,
    })

    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Upload className="w-5 h-5 text-[#16A34A]" />
            Importar Clientes via CSV
          </DialogTitle>
          <DialogDescription className="text-sm text-[#64748B]">
            Faça upload do arquivo CSV com dados de clientes. O sistema realiza deduplicação
            automática pelo nome da empresa e agrupa sufixos societários (ex: LT vs LTDA) somando os
            valores de vendas e compras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Caixa de Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#CBD5E1] hover:border-[#16A34A] bg-[#F8FAFC] hover:bg-emerald-50/40 transition-colors rounded-2xl p-6 text-center cursor-pointer flex flex-col items-center justify-center space-y-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleArquivoSelecionado}
            />
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#16A34A] flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">
                {arquivo ? arquivo.name : 'Clique para selecionar o arquivo CSV de clientes'}
              </p>
              <p className="text-xs text-[#64748B] mt-0.5">
                {arquivo
                  ? `${(arquivo.size / 1024).toFixed(1)} KB`
                  : 'Compatível com CSV padrão Colesel (vírgula, ponto-e-vírgula ou tab)'}
              </p>
            </div>
          </div>

          {/* Resumo do arquivo e deduplicação */}
          {clientesAgrupados.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B]">
                  Linhas lidas no arquivo: <strong>{totalLinhasArquivo}</strong>
                </span>
                <span className="text-[#16A34A] font-semibold">
                  Registros únicos deduplicados: <strong>{clientesAgrupados.length}</strong>
                </span>
              </div>

              {totalLinhasArquivo > clientesAgrupados.length && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {totalLinhasArquivo - clientesAgrupados.length} registros com sufixos
                    societários semelhantes foram agrupados e tiveram seus valores financeiros
                    somados.
                  </span>
                </div>
              )}

              {/* Prévia dos primeiros 3 registros */}
              <div className="space-y-1.5 pt-1 border-t border-slate-200">
                <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                  Prévia dos dados prontos para importação:
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {clientesAgrupados.slice(0, 5).map((cli, idx) => (
                    <div
                      key={idx}
                      className="text-xs p-2 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-between"
                    >
                      <div className="truncate mr-2">
                        <span className="font-semibold text-[#0F172A]">{cli.nome_empresa}</span>
                        <span className="text-[11px] text-[#64748B] ml-2 font-mono">
                          ({cli.vendedor} • {cli.status_cliente})
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="font-semibold text-[#16A34A]">
                          {formatarMoeda(cli.valor_total_vendas)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Barra de Progresso */}
          {importando && (
            <div className="space-y-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="flex justify-between text-xs text-blue-900 font-medium">
                <span>Importando clientes para o banco...</span>
                <span>{progresso}%</span>
              </div>
              <Progress value={progresso} className="h-2" />
            </div>
          )}

          {/* Resultado final */}
          {resultado && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#16A34A] flex-shrink-0" />
              <div className="text-xs text-[#0F172A]">
                <p className="font-bold text-sm text-[#16A34A]">Importação concluída!</p>
                <p className="text-[#64748B] mt-0.5">
                  <strong>{resultado.criados}</strong> clientes criados,{' '}
                  <strong>{resultado.atualizados}</strong> atualizados e{' '}
                  <strong>{resultado.falhas}</strong> falhas.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 gap-2 border-t border-[#E2E8F0]">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importando}>
            {resultado ? 'Fechar' : 'Cancelar'}
          </Button>
          {!resultado && (
            <Button
              onClick={executarImportacao}
              disabled={clientesAgrupados.length === 0 || importando}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold"
            >
              {importando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importando ({progresso}%)
                </>
              ) : (
                `Importar ${clientesAgrupados.length} Clientes`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
