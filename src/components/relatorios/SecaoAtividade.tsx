import {
  PhoneCall,
  CheckSquare,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  PhoneMissed,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarDuracao } from '@/types/clientes'
import type { LigacaoModel, TarefaModel } from '@/types/clientes'

interface SecaoAtividadeProps {
  ligacoesNoPeriodo: LigacaoModel[]
  tarefasConcluidasNoPeriodo: TarefaModel[]
}

export function SecaoAtividade({
  ligacoesNoPeriodo,
  tarefasConcluidasNoPeriodo,
}: SecaoAtividadeProps) {
  // Breakdown de ligações
  const totalLigacoes = ligacoesNoPeriodo.length
  const ligacoesEntrada = ligacoesNoPeriodo.filter((l) => l.tipo === 'entrada').length
  const ligacoesSaida = ligacoesNoPeriodo.filter((l) => l.tipo === 'saida').length
  const ligacoesPerdidas = ligacoesNoPeriodo.filter((l) => l.tipo === 'perdida').length

  // Duração média das ligações atendidas
  const ligacoesComDuracao = ligacoesNoPeriodo.filter(
    (l) => typeof l.duracao_segundos === 'number' && l.duracao_segundos > 0,
  )
  const duracaoMediaSegundos =
    ligacoesComDuracao.length > 0
      ? Math.round(
          ligacoesComDuracao.reduce((acc, curr) => acc + (curr.duracao_segundos || 0), 0) /
            ligacoesComDuracao.length,
        )
      : null

  // Tarefas concluídas
  const totalTarefasConcluidas = tarefasConcluidasNoPeriodo.length

  return (
    <Card className="border border-[#E2E8F0] shadow-sm">
      <CardHeader className="pb-3 border-b border-[#F1F5F9]">
        <CardTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-[#2563EB]" />
          Atividade do Time no Período
        </CardTitle>
        <p className="text-xs text-[#64748B]">
          Volume de contatos telefônicos realizados, tarefas executadas e tempos operacionais
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Ligações e Breakdown */}
          <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                Total de Ligações
              </span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-[#2563EB]">
                <PhoneCall className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#0F172A]">{totalLigacoes}</div>

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0] text-xs">
              <div className="flex flex-col items-start p-1.5 rounded bg-emerald-50 text-emerald-800">
                <span className="flex items-center gap-1 text-[11px] font-medium text-[#16A34A]">
                  <ArrowDownLeft className="w-3 h-3" /> Entrada
                </span>
                <span className="font-bold text-sm text-[#16A34A]">{ligacoesEntrada}</span>
              </div>
              <div className="flex flex-col items-start p-1.5 rounded bg-blue-50 text-blue-800">
                <span className="flex items-center gap-1 text-[11px] font-medium text-[#2563EB]">
                  <ArrowUpRight className="w-3 h-3" /> Saída
                </span>
                <span className="font-bold text-sm text-[#2563EB]">{ligacoesSaida}</span>
              </div>
              <div className="flex flex-col items-start p-1.5 rounded bg-rose-50 text-rose-800">
                <span className="flex items-center gap-1 text-[11px] font-medium text-[#DC2626]">
                  <PhoneMissed className="w-3 h-3" /> Perdida
                </span>
                <span className="font-bold text-sm text-[#DC2626]">{ligacoesPerdidas}</span>
              </div>
            </div>
          </div>

          {/* 2. Tarefas Concluídas */}
          <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                Tarefas Concluídas
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-[#16A34A]">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#16A34A]">{totalTarefasConcluidas}</div>
            <p className="text-xs text-[#64748B] pt-2 border-t border-[#E2E8F0]">
              Tarefas finalizadas dentro do período selecionado (visitas, propostas, ligações, etc.)
            </p>
          </div>

          {/* 3. Tempo Médio de Resposta / Duração */}
          <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                Duração Média das Ligações
              </span>
              <div className="p-1.5 rounded-lg bg-purple-50 text-[#7C3AED]">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#0F172A]">
              {duracaoMediaSegundos !== null ? formatarDuracao(duracaoMediaSegundos) : 'Sem dados'}
            </div>
            <p className="text-xs text-[#64748B] pt-2 border-t border-[#E2E8F0]">
              {ligacoesComDuracao.length > 0
                ? `Calculado sobre ${ligacoesComDuracao.length} ligação(ões) com registro de duração.`
                : 'Nenhuma ligação com registro de duração no período.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
