import { useState, useMemo } from 'react'
import { Download, Search, Inbox, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatarData } from '@/types/clientes'
import { exportarParaCsv } from './exportarCsv'
import type { ClienteModel } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'

interface SubAbaClientesProps {
  clientes: ClienteModel[]
  usuarios: Usuario[]
}

export function SubAbaClientes({ clientes, usuarios }: SubAbaClientesProps) {
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('todos')
  const [filtroCidade, setFiltroCidade] = useState('todas')
  const [filtroGrandeCliente, setFiltroGrandeCliente] = useState('todos')

  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios])

  // Cidades únicas extraídas da lista de clientes
  const listaCidades = useMemo(() => {
    const cidades = new Set<string>()
    clientes.forEach((c) => {
      if (c.cidade && c.cidade.trim()) {
        cidades.add(c.cidade.trim())
      }
    })
    return Array.from(cidades).sort()
  }, [clientes])

  // Filtragem dos clientes
  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      if (filtroResponsavel !== 'todos' && c.responsavel_id !== filtroResponsavel) {
        return false
      }
      if (filtroCidade !== 'todas' && c.cidade !== filtroCidade) {
        return false
      }
      if (filtroGrandeCliente === 'sim' && !c.grande_cliente) {
        return false
      }
      if (filtroGrandeCliente === 'nao' && c.grande_cliente) {
        return false
      }

      if (busca.trim()) {
        const termo = busca.toLowerCase().trim()
        const contato = c.nome_contato.toLowerCase()
        const empresa = c.nome_empresa?.toLowerCase() || ''
        const tel = c.telefone?.toLowerCase() || ''
        const cidade = c.cidade?.toLowerCase() || ''
        const respObj = usuariosMap.get(c.responsavel_id || '') || c.expand?.responsavel_id
        const respNome = respObj?.nome?.toLowerCase() || ''

        const match =
          contato.includes(termo) ||
          empresa.includes(termo) ||
          tel.includes(termo) ||
          cidade.includes(termo) ||
          respNome.includes(termo)
        if (!match) return false
      }

      return true
    })
  }, [clientes, filtroResponsavel, filtroCidade, filtroGrandeCliente, busca, usuariosMap])

  // Exportar CSV
  const handleExportarCsv = () => {
    const cabecalhos = [
      'Nome do Contato',
      'Empresa',
      'Telefone',
      'Cidade',
      'Responsável',
      'Data da Última Compra',
      'Grande Cliente',
      'E-mail',
      'CNPJ / CPF',
    ]

    const linhas = clientesFiltrados.map((c) => {
      const respObj = usuariosMap.get(c.responsavel_id || '') || c.expand?.responsavel_id

      return [
        c.nome_contato,
        c.nome_empresa || '',
        c.telefone || '',
        c.cidade || '',
        respObj?.nome || '',
        c.data_ultima_compra ? formatarData(c.data_ultima_compra) : '',
        c.grande_cliente ? 'Sim' : 'Não',
        c.email || '',
        c.cnpj_cpf || '',
      ]
    })

    exportarParaCsv('relatorio_clientes', cabecalhos, linhas)
  }

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Exportação */}
      <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Busca textual */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por contato, empresa, telefone ou cidade..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Filtro Responsável */}
          <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Responsáveis</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Cidade */}
          <Select value={filtroCidade} onValueChange={setFiltroCidade}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Cidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Cidades</SelectItem>
              {listaCidades.map((cidade) => (
                <SelectItem key={cidade} value={cidade}>
                  {cidade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Grande Cliente */}
          <Select value={filtroGrandeCliente} onValueChange={setFiltroGrandeCliente}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue placeholder="Grande Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Clientes</SelectItem>
              <SelectItem value="sim">Apenas Grandes Clientes</SelectItem>
              <SelectItem value="nao">Clientes Convencionais</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Botão Exportar CSV */}
        <Button
          onClick={handleExportarCsv}
          variant="outline"
          size="sm"
          className="h-9 border-[#E2E8F0] text-[#0F172A] hover:bg-slate-50 flex items-center gap-2 shrink-0 font-semibold"
        >
          <Download className="w-4 h-4 text-[#2563EB]" />
          Exportar CSV
        </Button>
      </div>

      {/* Resumo da listagem */}
      <div className="flex items-center justify-between text-xs text-[#64748B] px-1">
        <span>
          Mostrando <strong>{clientesFiltrados.length}</strong> de {clientes.length} clientes na
          carteira
        </span>
      </div>

      {/* Tabela de Clientes */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
        {clientesFiltrados.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <Inbox className="w-8 h-8 text-[#CBD5E1]" />
            <p className="font-medium text-[#64748B]">
              Nenhum cliente encontrado com os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8FAFC] text-[#64748B] uppercase tracking-wider font-semibold border-b border-[#E2E8F0]">
                <tr>
                  <th className="py-3 px-4">Nome do Contato</th>
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Telefone</th>
                  <th className="py-3 px-4">Cidade</th>
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-4">Última Compra</th>
                  <th className="py-3 px-4 text-center">Grande Cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                {clientesFiltrados.map((c) => {
                  const respObj =
                    usuariosMap.get(c.responsavel_id || '') || c.expand?.responsavel_id

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#0F172A]">{c.nome_contato}</td>
                      <td className="py-3 px-4 text-[#64748B]">{c.nome_empresa || '-'}</td>
                      <td className="py-3 px-4 font-mono text-[#0F172A]">{c.telefone || '-'}</td>
                      <td className="py-3 px-4 text-[#64748B]">{c.cidade || '-'}</td>
                      <td className="py-3 px-4 text-[#64748B]">
                        {respObj?.nome || 'Não atribuído'}
                      </td>
                      <td className="py-3 px-4 text-[#64748B]">
                        {c.data_ultima_compra ? formatarData(c.data_ultima_compra) : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {c.grande_cliente ? (
                          <Badge className="bg-amber-50 text-[#CA8A04] border-amber-200 inline-flex items-center gap-1 font-semibold">
                            <Star className="w-3 h-3 fill-amber-400 stroke-amber-500" /> Sim
                          </Badge>
                        ) : (
                          <span className="text-[#94A3B8]">Não</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
