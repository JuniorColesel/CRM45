import { Target, Users, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatarMoeda } from '@/types/clientes'
import type { MetaModel, OportunidadeModel } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'

interface SecaoMetasProps {
  usuarioLogado: Usuario | null
  usuarios: Usuario[]
  metas: MetaModel[]
  oportunidadesGanhasNoPeriodo: OportunidadeModel[]
}

interface ItemMetaCalculado {
  usuarioId: string
  usuarioNome: string
  usuarioPerfil: string
  valorMeta: number
  valorRealizado: number
  percentualValor: number
  metaOportunidades: number
  oportunidadesRealizadas: number
  percentualOps: number
}

export function SecaoMetas({
  usuarioLogado,
  usuarios,
  metas,
  oportunidadesGanhasNoPeriodo,
}: SecaoMetasProps) {
  const perfil = usuarioLogado?.perfil

  // Define se é visão individual ou do time
  const isVendedor = perfil === 'vendedor_1' || perfil === 'vendedor_2'
  const isCoordenador = perfil === 'coordenador_vendas'
  const isCeo = perfil === 'ceo_financeiro'
  const tituloSecao = isVendedor ? 'Minhas metas vs realizado' : 'Metas do time'

  // Filtrar metas de acordo com as regras de permissão / perfil:
  // - Vendedor vê só a própria meta
  // - Coordenador vê as metas dos vendedores
  // - CEO vê todas
  // - Outros (compras/estoque): caso acessem, filtram apenas as permitidas
  const metasVisiveis = metas.filter((m) => {
    if (isCeo) return true
    if (isVendedor) return m.usuario_id === usuarioLogado?.id
    if (isCoordenador) {
      // Coordenador vê vendedores (ou a sua se houver)
      const u = usuarios.find((usr) => usr.id === m.usuario_id)
      return (
        u?.perfil === 'vendedor_1' ||
        u?.perfil === 'vendedor_2' ||
        m.usuario_id === usuarioLogado?.id
      )
    }
    return m.usuario_id === usuarioLogado?.id
  })

  // Agrupar oportunidades ganhas no período por vendedor
  const ganhasPorUsuario = new Map<string, { totalValor: number; qtd: number }>()
  oportunidadesGanhasNoPeriodo.forEach((op) => {
    const atual = ganhasPorUsuario.get(op.responsavel_id) || { totalValor: 0, qtd: 0 }
    atual.totalValor += op.valor || 0
    atual.qtd += 1
    ganhasPorUsuario.set(op.responsavel_id, atual)
  })

  // Calcular itens com métricas
  const itensCalculados: ItemMetaCalculado[] = metasVisiveis.map((m) => {
    const usuario =
      usuarios.find((u) => u.id === m.usuario_id) ||
      (m.expand?.usuario_id as unknown as Usuario) ||
      (m.usuario_id === usuarioLogado?.id ? usuarioLogado : null)

    const realizados = ganhasPorUsuario.get(m.usuario_id) || { totalValor: 0, qtd: 0 }
    const valorMeta = m.valor_meta || 0
    const valorRealizado = realizados.totalValor
    const metaOportunidades = m.meta_oportunidades || 0
    const oportunidadesRealizadas = realizados.qtd

    const percentualValor = valorMeta > 0 ? (valorRealizado / valorMeta) * 100 : 0
    const percentualOps =
      metaOportunidades > 0 ? (oportunidadesRealizadas / metaOportunidades) * 100 : 0

    return {
      usuarioId: m.usuario_id,
      usuarioNome: usuario?.nome || 'Usuário Desconhecido',
      usuarioPerfil: usuario?.perfil || '',
      valorMeta,
      valorRealizado,
      percentualValor,
      metaOportunidades,
      oportunidadesRealizadas,
      percentualOps,
    }
  })

  // Cor da barra de progresso e badge:
  // Vermelho < 50%, Amarelo 50-99%, Verde >= 100%
  const obterCorProgresso = (pct: number) => {
    if (pct < 50) {
      return {
        bgBarra: 'bg-[#DC2626]',
        bgTrack: 'bg-rose-100',
        textoBadge: 'text-[#DC2626]',
        bgBadge: 'bg-rose-50 border-rose-200',
        label: 'Abaixo da meta',
      }
    }
    if (pct < 100) {
      return {
        bgBarra: 'bg-[#CA8A04]',
        bgTrack: 'bg-amber-100',
        textoBadge: 'text-[#CA8A04]',
        bgBadge: 'bg-amber-50 border-amber-200',
        label: 'Em andamento',
      }
    }
    return {
      bgBarra: 'bg-[#16A34A]',
      bgTrack: 'bg-emerald-100',
      textoBadge: 'text-[#16A34A]',
      bgBadge: 'bg-emerald-50 border-emerald-200',
      label: 'Meta atingida!',
    }
  }

  return (
    <Card className="border border-[#E2E8F0] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[#F1F5F9]">
        <div>
          <CardTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <Target className="w-5 h-5 text-[#2563EB]" />
            {tituloSecao}
          </CardTitle>
          <p className="text-xs text-[#64748B] mt-0.5">
            Acompanhamento de metas financeiras e volume de oportunidades ganhas no período
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
          {isVendedor ? (
            <Badge variant="outline" className="bg-blue-50 text-[#2563EB] border-blue-200">
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              Visão Individual
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-purple-50 text-[#7C3AED] border-purple-200">
              <Users className="w-3.5 h-3.5 mr-1" />
              {isCoordenador ? 'Coordenação de Vendas' : 'Visão Geral Executiva'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {itensCalculados.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#94A3B8] flex flex-col items-center justify-center space-y-2">
            <Target className="w-8 h-8 text-[#CBD5E1]" />
            <p className="font-medium text-[#64748B]">Nenhuma meta cadastrada para este período.</p>
            <p className="text-[11px] text-[#94A3B8] max-w-sm">
              As metas podem ser cadastradas na base de dados para cada vendedor e mês do ano.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {itensCalculados.map((item) => {
              const infoCor = obterCorProgresso(item.percentualValor)
              const larguraBarra = Math.min(100, Math.max(0, item.percentualValor))

              return (
                <div
                  key={item.usuarioId}
                  className="p-4 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#CBD5E1] transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-[#0F172A]">{item.usuarioNome}</h4>
                      <p className="text-[11px] text-[#64748B]">
                        {item.usuarioPerfil ? `Perfil: ${item.usuarioPerfil}` : 'Vendedor'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs font-semibold ${infoCor.bgBadge} ${infoCor.textoBadge}`}
                    >
                      {item.percentualValor.toFixed(1)}% • {infoCor.label}
                    </Badge>
                  </div>

                  {/* Barra de Progresso do Valor */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#64748B]">Valor Realizado vs Meta:</span>
                      <span className="font-bold text-[#0F172A]">
                        {formatarMoeda(item.valorRealizado)} / {formatarMoeda(item.valorMeta)}
                      </span>
                    </div>
                    <div
                      className={`w-full h-3 rounded-full ${infoCor.bgTrack} overflow-hidden p-0.5`}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${infoCor.bgBarra}`}
                        style={{ width: `${larguraBarra}%` }}
                      />
                    </div>
                  </div>

                  {/* Comparativo de Oportunidades Ganhas vs Meta de Oportunidades */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9] text-xs">
                    <span className="text-[#64748B]">Oportunidades ganhas:</span>
                    <span className="font-semibold text-[#0F172A]">
                      <strong className="text-[#2563EB]">{item.oportunidadesRealizadas}</strong> de{' '}
                      {item.metaOportunidades} propostas ({item.percentualOps.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
