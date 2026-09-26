import { AlertTriangle, Clock, Cake, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatarData } from '@/types/clientes'
import type { ClienteModel, TarefaModel, LigacaoModel, OportunidadeModel } from '@/types/clientes'

interface SecaoAlertasProps {
  clientes: ClienteModel[]
  tarefas: TarefaModel[]
  ligacoes: LigacaoModel[]
  oportunidades: OportunidadeModel[]
}

export function SecaoAlertas({ clientes, tarefas, ligacoes, oportunidades }: SecaoAlertasProps) {
  const agora = new Date()
  const msPorDia = 24 * 60 * 60 * 1000
  const seteDiasAtras = new Date(agora.getTime() - 7 * msPorDia)
  const cincoDiasAtras = new Date(agora.getTime() - 5 * msPorDia)

  // Pré-indexar tarefas por cliente
  const tarefasPorCliente = new Map<string, TarefaModel[]>()
  tarefas.forEach((t) => {
    const arr = tarefasPorCliente.get(t.cliente_id) || []
    arr.push(t)
    tarefasPorCliente.set(t.cliente_id, arr)
  })

  // Pré-indexar ligações por cliente
  const ligacoesPorCliente = new Map<string, LigacaoModel[]>()
  ligacoes.forEach((l) => {
    const arr = ligacoesPorCliente.get(l.cliente_id) || []
    arr.push(l)
    ligacoesPorCliente.set(l.cliente_id, arr)
  })

  // 1. Clientes sem contato há 7+ dias (mesma regra do Follow-up)
  const clientesSemContato7Dias = clientes.filter((c) => {
    const ligs = ligacoesPorCliente.get(c.id) || []
    const tars = tarefasPorCliente.get(c.id) || []

    const temLigacaoRecente = ligs.some((l) => {
      if (!l.data_hora) return false
      return new Date(l.data_hora) >= seteDiasAtras
    })

    const temTarefaConcluidaRecente = tars.some((t) => {
      if (!t.concluida) return false
      const dataRef = t.data_conclusao ? new Date(t.data_conclusao) : new Date(t.data_hora)
      return dataRef >= seteDiasAtras
    })

    return !temLigacaoRecente && !temTarefaConcluidaRecente
  })

  // 2. Oportunidades paradas há 5+ dias (mesma regra do Follow-up: abertas sem tarefas nos últimos 5 dias)
  const oportunidadesParadas = oportunidades.filter((op) => {
    if (op.status !== 'aberto') return false
    const tars = tarefasPorCliente.get(op.cliente_id) || []
    const temTarefaRecente = tars.some((t) => {
      const d = t.created ? new Date(t.created) : new Date(t.data_hora)
      return d >= cincoDiasAtras
    })
    return !temTarefaRecente
  })

  // 3. Aniversariantes da semana (lista com nome e data)
  interface AniversarianteItem {
    id: string
    nome: string
    empresa?: string
    dataNascimentoStr: string
    dataExibicao: string
  }

  const aniversariantesDaSemana: AniversarianteItem[] = []
  clientes.forEach((c) => {
    if (!c.data_nascimento) return
    const partes = c.data_nascimento.substring(0, 10).split('-')
    if (partes.length < 3) return
    const mesNasc = parseInt(partes[1], 10) - 1
    const diaNasc = parseInt(partes[2], 10)

    const anoAtual = agora.getFullYear()
    const anivEsteAno = new Date(anoAtual, mesNasc, diaNasc)
    const diffDias = (anivEsteAno.getTime() - agora.getTime()) / msPorDia

    let dentroDos7Dias = false
    if (diffDias >= -0.5 && diffDias <= 7) {
      dentroDos7Dias = true
    } else {
      const anivProxAno = new Date(anoAtual + 1, mesNasc, diaNasc)
      const diffProx = (anivProxAno.getTime() - agora.getTime()) / msPorDia
      if (diffProx >= -0.5 && diffProx <= 7) {
        dentroDos7Dias = true
      }
    }

    if (dentroDos7Dias) {
      const diaFmt = String(diaNasc).padStart(2, '0')
      const mesFmt = String(mesNasc + 1).padStart(2, '0')
      aniversariantesDaSemana.push({
        id: c.id,
        nome: c.nome_contato,
        empresa: c.nome_empresa,
        dataNascimentoStr: c.data_nascimento,
        dataExibicao: `${diaFmt}/${mesFmt}`,
      })
    }
  })

  // 4. Tarefas vencidas (não concluídas com data_hora < agora)
  const tarefasVencidas = tarefas.filter((t) => {
    if (t.concluida) return false
    if (!t.data_hora) return false
    return new Date(t.data_hora) < agora
  })

  return (
    <Card className="border border-[#E2E8F0] shadow-sm">
      <CardHeader className="pb-3 border-b border-[#F1F5F9]">
        <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#CA8A04]" />
          Alertas e Pontos de Atenção Operacionais
        </CardTitle>
        <p className="text-xs text-[#64748B]">
          Pendências, clientes sem interação recente e aniversariantes identificados
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Alerta 1: Clientes sem contato */}
          <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">Sem Contato há 7+ dias</span>
              <Clock className="w-4 h-4 text-[#2563EB]" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#2563EB]">
                {clientesSemContato7Dias.length}
              </div>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Clientes sem ligação ou tarefa concluída na última semana
              </p>
            </div>
          </div>

          {/* Alerta 2: Oportunidades paradas */}
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900">Oportunidades Paradas</span>
              <AlertTriangle className="w-4 h-4 text-[#CA8A04]" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#CA8A04]">{oportunidadesParadas.length}</div>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Propostas em aberto sem nenhuma ação registrada há 5+ dias
              </p>
            </div>
          </div>

          {/* Alerta 3: Tarefas Vencidas */}
          <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-900">Tarefas Vencidas</span>
              <AlertCircle className="w-4 h-4 text-[#DC2626]" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#DC2626]">{tarefasVencidas.length}</div>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Atividades não concluídas com prazo estourado
              </p>
            </div>
          </div>

          {/* Alerta 4: Aniversariantes da semana */}
          <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/40 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-900">
                Aniversariantes da Semana
              </span>
              <Cake className="w-4 h-4 text-[#7C3AED]" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#7C3AED]">
                {aniversariantesDaSemana.length}
              </div>
              <p className="text-[11px] text-purple-700 mt-0.5">
                Celebrando aniversário nos próximos 7 dias
              </p>
            </div>
          </div>
        </div>

        {/* Lista com os aniversariantes da semana se houver */}
        {aniversariantesDaSemana.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#F1F5F9]">
            <h5 className="text-xs font-bold text-[#0F172A] mb-2 flex items-center gap-1.5">
              <Cake className="w-3.5 h-3.5 text-[#7C3AED]" />
              Próximos Aniversariantes Identificados:
            </h5>
            <div className="flex flex-wrap gap-2">
              {aniversariantesDaSemana.map((a) => (
                <Badge
                  key={a.id}
                  variant="outline"
                  className="bg-purple-50 text-[#7C3AED] border-purple-200 py-1 px-2.5 flex items-center gap-1.5"
                >
                  <span className="font-semibold">{a.nome}</span>
                  {a.empresa && <span className="opacity-75 text-[10px]">({a.empresa})</span>}
                  <span className="font-bold bg-white px-1.5 py-0.2 rounded border border-purple-200 text-[10px]">
                    {a.dataExibicao}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
