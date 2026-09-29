import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Target,
  Plus,
  Lock,
  RefreshCw,
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingUp,
  Users,
  Pencil,
  Trash2,
  CheckCircle2,
  Info,
  ChevronLeft,
  ChevronRight,
  Save,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth, type Usuario } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarMoeda, type MetaModel, type MetaParticipanteModel } from '@/types/clientes'
import { PERFIS_CONFIG } from '@/pages/UsuariosPage'
import {
  calcularPercentual,
  recalcularPercentuais,
  validarSomaMeta,
  redistribuirAoRemover,
} from '@/lib/metas/metasCalculos'
import {
  buscarMetaPorMesAno,
  buscarMetasDoAno,
  buscarParticipantesDoAno,
  salvarMetaComParticipantes,
  type MetaComParticipantes,
} from '@/services/metasService'

export const NOMES_MESES: string[] = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

interface ParticipanteLinha {
  id?: string
  usuario_id: string
  nome: string
  perfil: string
  email?: string
  valor_individual: number
  percentual: number
}

export default function MetasPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const perfil = user?.perfil

  // PERMISSÕES:
  // - CEO (ceo_financeiro): cria, edita, remove metas e participantes
  // - Coordenador (coordenador_vendas): somente leitura de tudo
  // - Vendedor (vendedor_1, vendedor_2): somente leitura, apenas onde é participante
  // - Outros (compras/estoque): acesso restrito
  const isCeo = perfil === 'ceo_financeiro'
  const isCoordenador = perfil === 'coordenador_vendas'
  const isVendedor = perfil === 'vendedor_1' || perfil === 'vendedor_2'
  const acessoNegado = perfil === 'compras_grandes_clientes' || perfil === 'estoque'

  // Data atual
  const dataHoje = new Date()
  const [anoSelecionado, setAnoSelecionado] = useState<number>(dataHoje.getFullYear())
  const [mesSelecionado, setMesSelecionado] = useState<number>(dataHoje.getMonth() + 1)

  // Anos disponíveis para seleção (passados e futuros para edição retroativa)
  const anosDisponiveis = useMemo(() => {
    const atual = dataHoje.getFullYear()
    return [atual - 2, atual - 1, atual, atual + 1, atual + 2]
  }, [dataHoje])

  // Estados principais da tela
  const [metaAtual, setMetaAtual] = useState<MetaComParticipantes | null>(null)
  const [metasAnuais, setMetasAnuais] = useState<MetaModel[]>([])
  const [participantesAnuais, setParticipantesAnuais] = useState<MetaParticipanteModel[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Estado editável da Meta Geral do mês selecionado
  const [metaGeralInput, setMetaGeralInput] = useState<string>('0')
  const [valorAtingidoInput, setValorAtingidoInput] = useState<string>('0')
  const [fonteAtingido, setFonteAtingido] = useState<string>('manual')
  const [participantes, setParticipantes] = useState<ParticipanteLinha[]>([])

  // Modal de Adicionar Participante
  const [modalParticipanteOpen, setModalParticipanteOpen] = useState(false)
  const [usuarioSelecionadoModal, setUsuarioSelecionadoModal] = useState<string>('')
  const [valorIndividualModal, setValorIndividualModal] = useState<string>('')
  const [buscaUsuarioModal, setBuscaUsuarioModal] = useState<string>('')

  // Modal de Edição de Participante Existente
  const [editandoParticipante, setEditandoParticipante] = useState<ParticipanteLinha | null>(null)
  const [valorEdicaoModal, setValorEdicaoModal] = useState<string>('')

  // Voltar
  const handleVoltar = () => {
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/configuracoes')
    }
  }

  // Carregar lista de usuários (para seleção no modal)
  const carregarUsuarios = useCallback(async () => {
    try {
      const records = await pb.collection('usuarios').getFullList<Usuario>({
        sort: 'nome',
        requestKey: null,
      })
      setUsuarios(records)
    } catch {
      if (user) setUsuarios([user])
    }
  }, [user])

  // Carregar dados da meta do mês e visão anual
  const carregarDadosMesEAno = useCallback(async () => {
    if (acessoNegado) return
    setLoading(true)
    try {
      // 1. Meta do mês selecionado com participantes
      const metaMes = await buscarMetaPorMesAno(mesSelecionado, anoSelecionado)
      setMetaAtual(metaMes)

      if (metaMes) {
        const mg = metaMes.meta_geral || 0
        setMetaGeralInput(String(mg))
        setValorAtingidoInput(String(metaMes.valor_atingido || 0))
        setFonteAtingido(metaMes.fonte_atingido || 'manual')

        const linhas: ParticipanteLinha[] = (metaMes.participantes || []).map((p) => {
          const u =
            (p.expand?.usuario_id as Usuario | undefined) ||
            usuarios.find((usr) => usr.id === p.usuario_id)
          return {
            id: p.id,
            usuario_id: p.usuario_id,
            nome: u?.nome || 'Colaborador',
            perfil: u?.perfil || '',
            email: u?.email || '',
            valor_individual: p.valor_individual || 0,
            percentual: p.percentual || calcularPercentual(p.valor_individual, mg),
          }
        })
        setParticipantes(linhas)
      } else {
        // Sem meta cadastrada para este mês ainda
        setMetaGeralInput('0')
        setValorAtingidoInput('0')
        setFonteAtingido('manual')
        setParticipantes([])
      }

      // 2. Visão anual
      const anuais = await buscarMetasDoAno(anoSelecionado)
      setMetasAnuais(anuais)

      // 3. Participantes do ano
      const metaIds = anuais.map((m) => m.id)
      const partesAno = await buscarParticipantesDoAno(metaIds)
      setParticipantesAnuais(partesAno)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dados de metas',
        description: msg || 'Não foi possível carregar as informações.',
      })
    } finally {
      setLoading(false)
    }
  }, [acessoNegado, mesSelecionado, anoSelecionado, usuarios])

  useEffect(() => {
    carregarUsuarios()
  }, [carregarUsuarios])

  useEffect(() => {
    carregarDadosMesEAno()
  }, [carregarDadosMesEAno])

  // Valores numéricos do formulário
  const metaGeralNum = useMemo(() => {
    const limpo = metaGeralInput.replace(/\./g, '').replace(',', '.')
    const v = parseFloat(limpo)
    return isNaN(v) ? 0 : v
  }, [metaGeralInput])

  const valorAtingidoNum = useMemo(() => {
    const limpo = valorAtingidoInput.replace(/\./g, '').replace(',', '.')
    const v = parseFloat(limpo)
    return isNaN(v) ? 0 : v
  }, [valorAtingidoInput])

  // Validação em tempo real: se a soma dos participantes ≠ meta geral
  const validacaoSoma = useMemo(() => {
    return validarSomaMeta(metaGeralNum, participantes)
  }, [metaGeralNum, participantes])

  // Progresso % da Meta Geral
  const percentualAtingidoGeral = useMemo(() => {
    if (metaGeralNum <= 0) return 0
    return Math.min(100, Math.max(0, (valorAtingidoNum / metaGeralNum) * 100))
  }, [metaGeralNum, valorAtingidoNum])

  const percentualAtingidoReal = useMemo(() => {
    if (metaGeralNum <= 0) return 0
    return (valorAtingidoNum / metaGeralNum) * 100
  }, [metaGeralNum, valorAtingidoNum])

  // Usuários elegíveis para adicionar como participante (aqueles que ainda não estão no mês)
  const usuariosElegiveisParaAdicionar = useMemo(() => {
    const jaAdicionados = new Set(participantes.map((p) => p.usuario_id))
    return usuarios
      .filter((u) => u.ativo !== false && !jaAdicionados.has(u.id))
      .filter((u) => {
        if (!buscaUsuarioModal.trim()) return true
        const termo = buscaUsuarioModal.toLowerCase().trim()
        return (
          (u.nome || '').toLowerCase().includes(termo) ||
          (u.email || '').toLowerCase().includes(termo)
        )
      })
  }, [usuarios, participantes, buscaUsuarioModal])

  // Participantes filtrados para o VENDEDOR logado (vê apenas a si mesmo)
  const participantesVisiveis = useMemo(() => {
    if (isVendedor && user) {
      return participantes.filter((p) => p.usuario_id === user.id)
    }
    return participantes
  }, [participantes, isVendedor, user])

  // QUANDO A META GERAL MUDA:
  // "Se a meta geral for alterada e já existirem participantes -> recalcular percentuais automaticamente
  // (os valores individuais NÃO mudam, só os %)."
  const handleMetaGeralChange = (valorStr: string) => {
    setMetaGeralInput(valorStr)
    const limpo = valorStr.replace(/\./g, '').replace(',', '.')
    const novoValor = parseFloat(limpo) || 0
    setParticipantes((prev) => recalcularPercentuais(prev, novoValor))
  }

  // ABRIR MODAL DE ADICIONAR PARTICIPANTE
  const handleAbrirAdicionarParticipante = () => {
    const primeiro = usuariosElegiveisParaAdicionar[0]
    setUsuarioSelecionadoModal(primeiro ? primeiro.id : '')
    // Sugere a diferença restante se houver
    if (validacaoSoma.diferenca > 0) {
      setValorIndividualModal(String(validacaoSoma.diferenca))
    } else {
      setValorIndividualModal('')
    }
    setBuscaUsuarioModal('')
    setModalParticipanteOpen(true)
  }

  // CONFIRMAR ADIÇÃO DE PARTICIPANTE
  const handleConfirmarAdicionarParticipante = () => {
    if (!usuarioSelecionadoModal) {
      toast({
        variant: 'destructive',
        title: 'Selecione um usuário',
        description: 'É necessário selecionar um colaborador para a meta.',
      })
      return
    }

    const valorLimpo = valorIndividualModal.replace(/\./g, '').replace(',', '.')
    const valorNum = parseFloat(valorLimpo)
    if (isNaN(valorNum) || valorNum < 0) {
      toast({
        variant: 'destructive',
        title: 'Valor individual inválido',
        description: 'Informe um valor em Reais maior ou igual a zero.',
      })
      return
    }

    const usr = usuarios.find((u) => u.id === usuarioSelecionadoModal)
    const pct = calcularPercentual(valorNum, metaGeralNum)

    const novaLinha: ParticipanteLinha = {
      usuario_id: usuarioSelecionadoModal,
      nome: usr?.nome || 'Colaborador',
      perfil: usr?.perfil || '',
      email: usr?.email || '',
      valor_individual: valorNum,
      percentual: pct,
    }

    setParticipantes((prev) => [...prev, novaLinha])
    setModalParticipanteOpen(false)
    toast({
      title: 'Participante adicionado',
      description: `${novaLinha.nome} incluído com meta de ${formatarMoeda(valorNum)} (${pct.toFixed(1)}%).`,
    })
  }

  // ABRIR EDIÇÃO DE VALOR INDIVIDUAL
  const handleEditarParticipante = (p: ParticipanteLinha) => {
    setEditandoParticipante(p)
    setValorEdicaoModal(String(p.valor_individual))
  }

  // CONFIRMAR EDIÇÃO DE VALOR INDIVIDUAL
  const handleSalvarEdicaoParticipante = () => {
    if (!editandoParticipante) return

    const valorLimpo = valorEdicaoModal.replace(/\./g, '').replace(',', '.')
    const valorNum = parseFloat(valorLimpo)
    if (isNaN(valorNum) || valorNum < 0) {
      toast({
        variant: 'destructive',
        title: 'Valor individual inválido',
        description: 'Informe um valor numérico válido.',
      })
      return
    }

    setParticipantes((prev) =>
      prev.map((item) => {
        if (item.usuario_id === editandoParticipante.usuario_id) {
          return {
            ...item,
            valor_individual: valorNum,
            percentual: calcularPercentual(valorNum, metaGeralNum),
          }
        }
        return item
      }),
    )

    setEditandoParticipante(null)
  }

  // REMOVER PARTICIPANTE COM REDISTRIBUIÇÃO PROPORCIONAL
  // "O valor individual do removido é redistribuído proporcionalmente entre os restantes, mantendo a proporção.
  // Exemplo: meta 125k, Renan 70k, V1 35k, V2 20k -> remove V2 -> Renan ~83,33k e V1 ~41,67k.
  // Percentuais recalculados automaticamente; nunca deixar valor 'sem dono' (se remover o último, volta como diferença)."
  const handleRemoverParticipante = (usuarioId: string) => {
    const removido = participantes.find((p) => p.usuario_id === usuarioId)
    const novos = redistribuirAoRemover(participantes, usuarioId, metaGeralNum)
    setParticipantes(novos)

    toast({
      title: 'Participante removido',
      description: removido
        ? `${removido.nome} foi removido e seu valor (${formatarMoeda(removido.valor_individual)}) foi redistribuído proporcionalmente entre os demais.`
        : 'Participante removido.',
    })
  }

  // SALVAR TODAS AS ALTERAÇÕES DA META
  const handleSalvarMetaGeral = async () => {
    if (!isCeo) {
      toast({
        variant: 'destructive',
        title: 'Ação não permitida',
        description: 'Apenas a diretoria executiva (CEO) pode alterar metas gerais.',
      })
      return
    }

    setSalvando(true)
    try {
      const salvo = await salvarMetaComParticipantes(
        {
          ano: anoSelecionado,
          mes: mesSelecionado,
          meta_geral: metaGeralNum,
          valor_atingido: valorAtingidoNum,
          fonte_atingido: (fonteAtingido as 'manual' | 'bling') || 'manual',
          criado_por: user?.id,
          participantes: participantes.map((p) => ({
            id: p.id,
            usuario_id: p.usuario_id,
            valor_individual: p.valor_individual,
            percentual: p.percentual,
          })),
        },
        metaAtual?.id,
      )

      setMetaAtual(salvo)
      toast({
        title: 'Meta salva com sucesso!',
        description: `Meta de ${NOMES_MESES[mesSelecionado - 1]} de ${anoSelecionado} atualizada no banco.`,
      })

      // Atualiza visão anual
      const anuais = await buscarMetasDoAno(anoSelecionado)
      setMetasAnuais(anuais)
      const metaIds = anuais.map((m) => m.id)
      const partesAno = await buscarParticipantesDoAno(metaIds)
      setParticipantesAnuais(partesAno)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar meta',
        description: msg || 'Não foi possível persistir as alterações da meta.',
      })
    } finally {
      setSalvando(false)
    }
  }

  // MUDANÇA DE MÊS / ANO COM NAVEGAÇÃO RETROATIVA
  const handleMudarMes = (mes: number) => {
    setMesSelecionado(mes)
  }

  const handleMudarAno = (ano: number) => {
    setAnoSelecionado(ano)
  }

  const handleMesAnterior = () => {
    if (mesSelecionado === 1) {
      setMesSelecionado(12)
      setAnoSelecionado((prev) => prev - 1)
    } else {
      setMesSelecionado((prev) => prev - 1)
    }
  }

  const handleProximoMes = () => {
    if (mesSelecionado === 12) {
      setMesSelecionado(1)
      setAnoSelecionado((prev) => prev + 1)
    } else {
      setMesSelecionado((prev) => prev + 1)
    }
  }

  // CÁLCULOS DA VISÃO ANUAL (12 MESES)
  const dadosVisaoAnual = useMemo(() => {
    const mapaMetas = new Map<number, MetaModel>()
    metasAnuais.forEach((m) => mapaMetas.set(m.mes, m))

    // Mapa de participantes por meta_id
    const contagemParticipantesPorMeta = new Map<string, number>()
    participantesAnuais.forEach((p) => {
      const count = contagemParticipantesPorMeta.get(p.meta_id) || 0
      contagemParticipantesPorMeta.set(p.meta_id, count + 1)
    })

    const meses = Array.from({ length: 12 }, (_, i) => {
      const numMes = i + 1
      const metaMes = mapaMetas.get(numMes)
      const metaVal = metaMes?.meta_geral || 0
      const atingidoVal = metaMes?.valor_atingido || 0
      const pct = metaVal > 0 ? (atingidoVal / metaVal) * 100 : 0
      const qtdParticipantes = metaMes ? contagemParticipantesPorMeta.get(metaMes.id) || 0 : 0

      return {
        mes: numMes,
        nomeMes: NOMES_MESES[i],
        meta: metaVal,
        atingido: atingidoVal,
        percentual: pct,
        qtdParticipantes,
        temMeta: !!metaMes,
      }
    })

    const somaMeta = meses.reduce((acc, m) => acc + m.meta, 0)
    const somaAtingido = meses.reduce((acc, m) => acc + m.atingido, 0)
    const mesesComMeta = meses.filter((m) => m.temMeta && m.meta > 0)
    const mediaAtingimento =
      mesesComMeta.length > 0
        ? mesesComMeta.reduce((acc, m) => acc + m.percentual, 0) / mesesComMeta.length
        : somaMeta > 0
          ? (somaAtingido / somaMeta) * 100
          : 0

    return {
      meses,
      somaMeta,
      somaAtingido,
      mediaAtingimento,
    }
  }, [metasAnuais, participantesAnuais])

  // ACESSO NEGADO (compras/estoque)
  if (acessoNegado) {
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
                A visualização e gestão de metas comerciais é restrita a vendedores e gestores de
                vendas.
              </p>
            </div>
            <div className="pt-2">
              <Badge
                variant="outline"
                className="text-xs text-amber-700 bg-amber-50/50 border-amber-200"
              >
                Permissão requerida: comercial ou financeiro
              </Badge>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-16 max-w-6xl mx-auto">
      {/* TOPO: NAVEGAÇÃO E TÍTULO */}
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
              <span>Voltar para Configurações</span>
            </Button>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-semibold gap-1"
            >
              <Target className="w-3 h-3" />
              Gestão de Metas
            </Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0F172A] pt-1 flex items-center gap-2">
            Metas Comerciais Colesel 45
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            {isCeo
              ? 'Defina a meta geral do mês, distribua entre os vendedores e acompanhe o percentual atingido.'
              : isCoordenador
                ? 'Acompanhamento consolidado das metas mensais e individuais da equipe de vendas (modo leitura).'
                : 'Acompanhe a sua meta estipulada e o percentual de atingimento do mês.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDadosMesEAno}
            disabled={loading || salvando}
            className="text-[#64748B] hover:text-[#0F172A] h-9"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">Atualizar</span>
          </Button>

          {isCeo && (
            <Button
              onClick={handleSalvarMetaGeral}
              disabled={salvando || loading}
              className="bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-xs sm:text-sm h-9 shadow-sm gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{salvando ? 'Salvando...' : 'Salvar Alterações'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 1. SELETOR DE MÊS / ANO NO TOPO (PADRÃO: MÊS/ANO ATUAL) */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMesAnterior}
            className="h-9 w-9 p-0 text-[#64748B] hover:text-[#0F172A]"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 flex-1 md:flex-none">
            <Select
              value={String(mesSelecionado)}
              onValueChange={(val: string) => handleMudarMes(Number(val))}
            >
              <SelectTrigger className="w-[160px] bg-[#F8FAFC] font-semibold text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOMES_MESES.map((nome, idx) => (
                  <SelectItem key={idx + 1} value={String(idx + 1)}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(anoSelecionado)}
              onValueChange={(val: string) => handleMudarAno(Number(val))}
            >
              <SelectTrigger className="w-[110px] bg-[#F8FAFC] font-semibold text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anosDisponiveis.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    Ano {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleProximoMes}
            className="h-9 w-9 p-0 text-[#64748B] hover:text-[#0F172A]"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#64748B]">
          <div className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>
              Período ativo:{' '}
              <strong className="text-[#0F172A]">
                {NOMES_MESES[mesSelecionado - 1]} de {anoSelecionado}
              </strong>
            </span>
          </div>

          {metaAtual ? (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]"
            >
              Meta cadastrada
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 text-[11px]"
            >
              Sem meta cadastrada
            </Badge>
          )}
        </div>
      </div>

      {/* 2. CARD "META GERAL" */}
      <Card className="border border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/70 border-b border-[#E2E8F0] py-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                <Target className="w-5 h-5 text-[#16A34A]" />
                Meta Geral do Mês
              </CardTitle>
              {/* Badge da fonte do atingido */}
              <Badge
                variant="outline"
                className={`text-xs font-semibold ${
                  fonteAtingido === 'bling'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                Fonte: {fonteAtingido === 'bling' ? 'Bling ERP' : 'Manual'}
              </Badge>
            </div>
            <p className="text-xs text-[#64748B]">
              Valor global de faturamento para {NOMES_MESES[mesSelecionado - 1]} de {anoSelecionado}
            </p>
          </div>

          {!isCeo && (
            <Badge variant="outline" className="text-xs text-slate-500 bg-white">
              Somente leitura
            </Badge>
          )}
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Campo da Meta Geral */}
            <div className="space-y-2">
              <Label htmlFor="meta-geral-input" className="text-xs font-bold text-[#0F172A]">
                Meta Geral Total (R$) {isCeo && <span className="text-red-500">*</span>}
              </Label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-sm font-semibold text-[#64748B]">
                  R$
                </span>
                <Input
                  id="meta-geral-input"
                  type="text"
                  disabled={!isCeo}
                  value={metaGeralInput}
                  onChange={(e) => handleMetaGeralChange(e.target.value)}
                  placeholder="125.000,00"
                  className="pl-11 text-base font-bold text-[#0F172A] bg-white border-[#E2E8F0] focus-visible:ring-emerald-500 disabled:opacity-90 disabled:bg-slate-50"
                />
              </div>
              <p className="text-[11px] text-[#64748B]">
                {isCeo
                  ? 'Ao alterar a meta geral, os percentuais dos participantes são recalculados automaticamente.'
                  : 'Valor definido pela diretoria para o faturamento da equipe neste mês.'}
              </p>
            </div>

            {/* Campo do Valor Atingido (preenchido manualmente agora; depois vem do Bling) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="valor-atingido-input" className="text-xs font-bold text-[#0F172A]">
                  Valor Atingido (R$)
                </Label>
                <span className="text-[11px] text-[#64748B] italic">
                  {fonteAtingido === 'bling'
                    ? 'Atualizado via Bling'
                    : 'Preenchimento CEO (manual)'}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-sm font-semibold text-[#64748B]">
                  R$
                </span>
                <Input
                  id="valor-atingido-input"
                  type="text"
                  disabled={!isCeo}
                  value={valorAtingidoInput}
                  onChange={(e) => setValorAtingidoInput(e.target.value)}
                  placeholder="0,00"
                  className="pl-11 text-base font-bold text-[#0F172A] bg-white border-[#E2E8F0] focus-visible:ring-emerald-500 disabled:opacity-90 disabled:bg-slate-50"
                />
              </div>
              <p className="text-[11px] text-[#64748B]">
                {/* [INTEGRAÇÃO BLING]: campo preparado para receber a soma de vendas faturadas */}
                {isCeo
                  ? 'Digite o valor já faturado. (Na próxima fase este valor será sincronizado via Bling ERP).'
                  : 'Faturamento realizado até o momento neste mês.'}
              </p>
            </div>
          </div>

          {/* Barra de Progresso % */}
          <div className="space-y-2 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#64748B] font-medium">Progresso de Atingimento Geral:</span>
              <span className="font-bold text-[#0F172A] flex items-center gap-2">
                <span>{percentualAtingidoReal.toFixed(1)}%</span>
                <span className="text-[11px] text-[#64748B] font-normal">
                  ({formatarMoeda(valorAtingidoNum)} de {formatarMoeda(metaGeralNum)})
                </span>
              </span>
            </div>

            <div className="w-full h-3.5 bg-slate-200 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentualAtingidoReal >= 100
                    ? 'bg-[#16A34A]'
                    : percentualAtingidoReal >= 70
                      ? 'bg-[#2563EB]'
                      : percentualAtingidoReal >= 40
                        ? 'bg-[#D97706]'
                        : 'bg-[#DC2626]'
                }`}
                style={{ width: `${percentualAtingidoGeral}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. VALIDAÇÃO EM TEMPO REAL: SE A SOMA DOS PARTICIPANTES ≠ META GERAL */}
      {metaGeralNum > 0 && participantes.length > 0 && !validacaoSoma.bate && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 shadow-sm animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold text-sm text-amber-900">
              Valores não somam a meta geral (diferença: {formatarMoeda(validacaoSoma.diferenca)})
            </h4>
            <p className="text-amber-800 leading-relaxed">
              A soma dos valores individuais ({formatarMoeda(validacaoSoma.soma)}) é{' '}
              {validacaoSoma.diferenca > 0 ? 'menor' : 'maior'} que a meta geral configurada (
              {formatarMoeda(metaGeralNum)}).
              {isCeo && ' Ajuste os valores dos participantes para fechar exatamente a meta.'}
            </p>
          </div>
        </div>
      )}

      {/* Alerta de Sucesso quando a soma bate */}
      {metaGeralNum > 0 && participantes.length > 0 && validacaoSoma.bate && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2.5 text-xs font-semibold shadow-sm animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
          <span>
            A soma dos valores individuais ({formatarMoeda(validacaoSoma.soma)}) fecha perfeitamente
            com a meta geral (100%).
          </span>
        </div>
      )}

      {/* 3. TABELA DE PARTICIPANTES */}
      <Card className="border border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/70 border-b border-[#E2E8F0] py-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#2563EB]" />
              Participantes da Meta
            </CardTitle>
            <p className="text-xs text-[#64748B]">
              Distribuição da meta geral entre os vendedores e colaboradores participantes
            </p>
          </div>

          {isCeo && (
            <Button
              onClick={handleAbrirAdicionarParticipante}
              disabled={usuariosElegiveisParaAdicionar.length === 0}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs h-9 gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar participante
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {participantesVisiveis.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A]">Nenhum participante adicionado</h3>
              <p className="text-xs text-[#64748B] max-w-sm">
                {isCeo
                  ? 'Adicione os vendedores que responderão por parcelas desta meta geral.'
                  : 'Você não está cadastrado como participante na meta deste mês.'}
              </p>
              {isCeo && usuariosElegiveisParaAdicionar.length > 0 && (
                <Button
                  onClick={handleAbrirAdicionarParticipante}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold mt-2"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Adicionar Primeiro Participante
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#F8FAFC]">
                  <TableRow>
                    <TableHead className="font-semibold text-xs text-[#0F172A] pl-6">
                      Nome
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">
                      Valor Individual (R$)
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-[#0F172A]">
                      % da Meta
                    </TableHead>
                    {isCeo && (
                      <TableHead className="font-semibold text-xs text-[#0F172A] text-right pr-6">
                        Ações
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E2E8F0]">
                  {participantesVisiveis.map((p) => {
                    const perfilInfo = p.perfil
                      ? PERFIS_CONFIG[p.perfil as keyof typeof PERFIS_CONFIG]
                      : null

                    return (
                      <TableRow
                        key={p.usuario_id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        {/* Nome */}
                        <TableCell className="py-3.5 pl-6 font-bold text-xs text-[#0F172A]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#16A34A] to-[#2563EB] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                              {p.nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span>{p.nome}</span>
                              {perfilInfo && (
                                <div className="mt-0.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] py-0 px-1.5 ${perfilInfo.badgeClass}`}
                                  >
                                    {perfilInfo.label}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Valor Individual */}
                        <TableCell className="py-3.5 text-xs font-bold text-[#0F172A]">
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-[#16A34A]" />
                            <span>{formatarMoeda(p.valor_individual)}</span>
                          </div>
                        </TableCell>

                        {/* % */}
                        <TableCell className="py-3.5 text-xs text-[#0F172A]">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="bg-blue-50 text-[#2563EB] border-blue-200 font-bold text-xs"
                            >
                              {p.percentual.toFixed(1)}%
                            </Badge>
                          </div>
                        </TableCell>

                        {/* Ações (CEO) */}
                        {isCeo && (
                          <TableCell className="py-3.5 pr-6 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditarParticipante(p)}
                                className="h-8 w-8 p-0 text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50"
                                title="Editar valor individual"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoverParticipante(p.usuario_id)}
                                className="h-8 w-8 p-0 text-[#64748B] hover:text-[#DC2626] hover:bg-red-50"
                                title="Remover participante (redistribui valor)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Rodapé com a soma dos valores individuais (deve bater com a meta geral) */}
          {participantes.length > 0 && (
            <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3 px-6">
              <div className="flex items-center gap-2 text-xs text-[#64748B]">
                <Info className="w-4 h-4 text-slate-400" />
                <span>
                  Total de participantes:{' '}
                  <strong className="text-[#0F172A]">{participantes.length}</strong>
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-[#64748B]">
                  Soma dos participantes:{' '}
                  <strong
                    className={
                      validacaoSoma.bate
                        ? 'text-[#16A34A] text-sm'
                        : 'text-amber-700 text-sm underline'
                    }
                  >
                    {formatarMoeda(validacaoSoma.soma)}
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-[#64748B]">
                  Meta Geral:{' '}
                  <strong className="text-[#0F172A] text-sm">{formatarMoeda(metaGeralNum)}</strong>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. VISÃO ANUAL (SEÇÃO ABAIXO: TABELA COM 12 MESES) */}
      <Card className="border border-[#E2E8F0] shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/70 border-b border-[#E2E8F0] py-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#2563EB]" />
              Visão Anual — {anoSelecionado}
            </CardTitle>
            <p className="text-xs text-[#64748B]">
              Acompanhamento mês a mês com metas, faturamento atingido e histórico retroativo
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={String(anoSelecionado)}
              onValueChange={(val: string) => handleMudarAno(Number(val))}
            >
              <SelectTrigger className="w-[120px] bg-white text-xs font-semibold h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anosDisponiveis.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    Ano {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-[#F8FAFC]">
                <TableRow>
                  <TableHead className="font-semibold text-xs text-[#0F172A] pl-6">Mês</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">Meta (R$)</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">
                    Atingido (R$)
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">% Atingido</TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A]">
                    Participantes
                  </TableHead>
                  <TableHead className="font-semibold text-xs text-[#0F172A] text-right pr-6">
                    Ação
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E2E8F0]">
                {dadosVisaoAnual.meses.map((m) => {
                  const isMesAtivo = m.mes === mesSelecionado
                  return (
                    <TableRow
                      key={m.mes}
                      className={`hover:bg-slate-50 transition-colors ${
                        isMesAtivo ? 'bg-emerald-50/50 font-medium' : ''
                      }`}
                    >
                      {/* Mês */}
                      <TableCell className="py-3 pl-6 text-xs text-[#0F172A]">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{m.nomeMes}</span>
                          {isMesAtivo && (
                            <Badge
                              variant="outline"
                              className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] py-0"
                            >
                              Selecionado
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      {/* Meta */}
                      <TableCell className="py-3 text-xs text-[#0F172A] font-semibold">
                        {m.meta > 0 ? (
                          formatarMoeda(m.meta)
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>

                      {/* Atingido */}
                      <TableCell className="py-3 text-xs text-[#0F172A] font-semibold">
                        {m.atingido > 0 ? (
                          formatarMoeda(m.atingido)
                        ) : (
                          <span className="text-slate-400">R$ 0,00</span>
                        )}
                      </TableCell>

                      {/* % */}
                      <TableCell className="py-3 text-xs">
                        {m.meta > 0 ? (
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-bold ${
                              m.percentual >= 100
                                ? 'bg-emerald-50 text-[#16A34A] border-emerald-200'
                                : m.percentual >= 70
                                  ? 'bg-blue-50 text-[#2563EB] border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {m.percentual.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>

                      {/* Participantes */}
                      <TableCell className="py-3 text-xs text-[#64748B]">
                        {m.qtdParticipantes > 0 ? (
                          <span>{m.qtdParticipantes} vendedores</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>

                      {/* Ação: Navegar e Editar retroativamente */}
                      <TableCell className="py-3 pr-6 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMudarMes(m.mes)}
                          className="h-7 text-xs text-[#2563EB] hover:text-[#1D4ED8] hover:bg-blue-50 px-2"
                        >
                          {isMesAtivo ? 'Editando' : 'Abrir Mês'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Rodapé da visão anual com soma anual de meta e atingido + média de atingimento */}
          <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-col md:flex-row items-center justify-between gap-4 px-6">
            <div className="text-xs text-[#64748B]">
              Resumo Anual Consolidado ({anoSelecionado})
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-semibold">
              <div>
                <span className="text-[#64748B]">Meta Anual: </span>
                <strong className="text-[#0F172A] text-sm">
                  {formatarMoeda(dadosVisaoAnual.somaMeta)}
                </strong>
              </div>

              <div>
                <span className="text-[#64748B]">Atingido Anual: </span>
                <strong className="text-[#16A34A] text-sm">
                  {formatarMoeda(dadosVisaoAnual.somaAtingido)}
                </strong>
              </div>

              <div>
                <span className="text-[#64748B]">Média de Atingimento: </span>
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-[#16A34A] border-emerald-200 text-xs font-bold ml-1"
                >
                  {dadosVisaoAnual.mediaAtingimento.toFixed(1)}%
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MODAL: ADICIONAR PARTICIPANTE */}
      <Dialog open={modalParticipanteOpen} onOpenChange={setModalParticipanteOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#2563EB]" />
              Adicionar Participante na Meta
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Selecione o vendedor ou colaborador e defina o valor individual para{' '}
              {NOMES_MESES[mesSelecionado - 1]}/{anoSelecionado}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Campo: Usuário */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#0F172A]">
                Colaborador <span className="text-red-500">*</span>
              </Label>
              <Select
                value={usuarioSelecionadoModal}
                onValueChange={(val: string) => setUsuarioSelecionadoModal(val)}
              >
                <SelectTrigger className="text-sm bg-white">
                  <SelectValue placeholder="Selecione o usuário" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {usuariosElegiveisParaAdicionar.length > 5 && (
                    <div className="p-2 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#64748B]" />
                        <Input
                          type="text"
                          placeholder="Buscar colaborador..."
                          value={buscaUsuarioModal}
                          onChange={(e) => setBuscaUsuarioModal(e.target.value)}
                          className="text-xs h-7 pl-8"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  )}
                  {usuariosElegiveisParaAdicionar.map((u) => {
                    const pInfo = PERFIS_CONFIG[u.perfil]
                    return (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{u.nome}</span>
                          {pInfo && (
                            <span className="text-[10px] text-slate-500">({pInfo.label})</span>
                          )}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Campo: Valor Individual */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#0F172A]">
                Valor Individual (R$) <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs text-[#64748B] font-semibold">
                  R$
                </span>
                <Input
                  type="text"
                  placeholder="35000,00"
                  value={valorIndividualModal}
                  onChange={(e) => setValorIndividualModal(e.target.value)}
                  className="pl-10 text-sm font-semibold"
                />
              </div>
              <p className="text-[11px] text-[#64748B]">
                {metaGeralNum > 0 && valorIndividualModal
                  ? `Representará ~${calcularPercentual(
                      parseFloat(valorIndividualModal.replace(',', '.')) || 0,
                      metaGeralNum,
                    ).toFixed(1)}% da meta geral.`
                  : 'O percentual será calculado automaticamente.'}
              </p>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalParticipanteOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarAdicionarParticipante}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: EDITAR VALOR INDIVIDUAL DE PARTICIPANTE */}
      <Dialog
        open={!!editandoParticipante}
        onOpenChange={(open) => !open && setEditandoParticipante(null)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Pencil className="w-4 h-4 text-[#2563EB]" />
              Editar Meta Individual — {editandoParticipante?.nome}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Altere o valor em R$ atribuído a este participante. O percentual será recalculado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#0F172A]">Novo Valor Individual (R$)</Label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs text-[#64748B] font-semibold">
                  R$
                </span>
                <Input
                  type="text"
                  placeholder="70000,00"
                  value={valorEdicaoModal}
                  onChange={(e) => setValorEdicaoModal(e.target.value)}
                  className="pl-10 text-sm font-semibold"
                />
              </div>
              <p className="text-[11px] text-[#64748B]">
                {metaGeralNum > 0 && valorEdicaoModal
                  ? `Novo percentual estimado: ~${calcularPercentual(
                      parseFloat(valorEdicaoModal.replace(',', '.')) || 0,
                      metaGeralNum,
                    ).toFixed(1)}%`
                  : ''}
              </p>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditandoParticipante(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvarEdicaoParticipante}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs"
            >
              Atualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
