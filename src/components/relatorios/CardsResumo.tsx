import { TrendingUp, DollarSign, Trophy, CheckCircle2, XCircle, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarMoeda } from '@/types/clientes'

export interface CardsResumoProps {
  totalAbertas: number
  valorPipeline: number
  totalGanhas: number
  valorGanho: number
  totalPerdidas: number
  taxaConversao: number
}

export function CardsResumo({
  totalAbertas,
  valorPipeline,
  totalGanhas,
  valorGanho,
  totalPerdidas,
  taxaConversao,
}: CardsResumoProps) {
  const cards = [
    {
      id: 'abertas',
      titulo: 'Oportunidades Abertas',
      valor: totalAbertas,
      subtitulo: 'Em negociação ativa',
      icone: TrendingUp,
      iconeBg: 'bg-blue-50 text-[#2563EB]',
      destaque: 'text-[#0F172A]',
    },
    {
      id: 'pipeline',
      titulo: 'Valor em Pipeline',
      valor: formatarMoeda(valorPipeline),
      subtitulo: 'Soma das abertas',
      icone: DollarSign,
      iconeBg: 'bg-indigo-50 text-[#4F46E5]',
      destaque: 'text-[#4F46E5]',
    },
    {
      id: 'ganhas',
      titulo: 'Ganhas no Período',
      valor: totalGanhas,
      subtitulo: 'Fechadas com sucesso',
      icone: Trophy,
      iconeBg: 'bg-emerald-50 text-[#16A34A]',
      destaque: 'text-[#16A34A]',
    },
    {
      id: 'valor-ganho',
      titulo: 'Valor Ganho no Período',
      valor: formatarMoeda(valorGanho),
      subtitulo: 'Receita confirmada',
      icone: CheckCircle2,
      iconeBg: 'bg-emerald-50 text-[#16A34A]',
      destaque: 'text-[#16A34A]',
    },
    {
      id: 'perdidas',
      titulo: 'Perdidas no Período',
      valor: totalPerdidas,
      subtitulo: 'Propostas não fechadas',
      icone: XCircle,
      iconeBg: 'bg-rose-50 text-[#DC2626]',
      destaque: 'text-[#DC2626]',
    },
    {
      id: 'conversao',
      titulo: 'Taxa de Conversão',
      valor: `${taxaConversao.toFixed(1)}%`,
      subtitulo: 'Ganhas / (Ganhas + Perdidas)',
      icone: Percent,
      iconeBg: 'bg-purple-50 text-[#7C3AED]',
      destaque: 'text-[#7C3AED]',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
      {cards.map((c) => {
        const Icone = c.icone
        return (
          <Card
            key={c.id}
            className="border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                {c.titulo}
              </CardTitle>
              <div className={`p-2 rounded-lg ${c.iconeBg}`}>
                <Icone className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-xl sm:text-2xl font-bold tracking-tight ${c.destaque}`}>
                {c.valor}
              </div>
              <p className="text-[11px] text-[#64748B] mt-1">{c.subtitulo}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
