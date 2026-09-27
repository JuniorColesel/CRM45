import {
  Compass,
  LayoutGrid,
  CalendarCheck2,
  ShieldCheck,
  HelpCircle,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Users,
  PhoneCall,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface GuiaRapidoProps {
  onIrParaTreinamento: () => void
}

export function GuiaRapido({ onIrParaTreinamento }: GuiaRapidoProps) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho do Guia Rápido */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#16A34A] via-[#2563EB] to-[#7C3AED]" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#F1F5F9]">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Compass className="w-3.5 h-3.5 text-emerald-600" />
              Guia de Bolso • Consulta Expressa
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
              Guia Rápido do CRM Colesel 45
            </h2>
            <p className="text-sm sm:text-base text-[#64748B]">
              Resumo essencial em uma única página para consultar sua rotina e boas práticas a
              qualquer momento.
            </p>
          </div>

          <Button
            type="button"
            onClick={onIrParaTreinamento}
            className="bg-[#16A34A] hover:bg-[#15803D] text-white font-bold gap-2 shadow-sm shrink-0"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Ir para o treinamento completo</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {/* 5 Seções do Guia de Bolso */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-6">
          {/* 1. O que é */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-[#16A34A]">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-emerald-700" />
              </div>
              <h3 className="font-bold text-base text-[#0F172A]">O que é o CRM</h3>
            </div>
            <p className="text-sm text-[#334155] leading-relaxed">
              Sistema que centraliza clientes, vendas e contatos em um só lugar, permitindo que toda
              a equipe trabalhe alinhada sem perder oportunidades.
            </p>
          </div>

          {/* 2. Menu */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-[#2563EB]">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <LayoutGrid className="w-4 h-4 text-blue-700" />
              </div>
              <h3 className="font-bold text-base text-[#0F172A]">Módulos do Menu</h3>
            </div>
            <p className="text-sm text-[#334155] leading-relaxed">
              <strong>Painel</strong>, <strong>Funil</strong>, <strong>Follow-up</strong>,{' '}
              <strong>Clientes</strong>, <strong>Relatórios</strong>, <strong>Automações</strong>,{' '}
              <strong>Configurações</strong> e <strong>POP & Treinamento</strong>.
            </p>
          </div>

          {/* 3. Rotina */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-5 space-y-3 md:col-span-2">
            <div className="flex items-center gap-2.5 text-[#7C3AED]">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <CalendarCheck2 className="w-4 h-4 text-purple-700" />
              </div>
              <h3 className="font-bold text-base text-[#0F172A]">Rotina do Dia a Dia</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#334155] flex items-center gap-2 shadow-xs">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span>Abra e veja o Follow-up</span>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#334155] flex items-center gap-2 shadow-xs">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span>Ligue para quem está pendente</span>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#334155] flex items-center gap-2 shadow-xs">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <span>Registre ligações (tipo/nota)</span>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-3 text-xs text-[#334155] flex items-center gap-2 shadow-xs">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  4
                </span>
                <span>Mova oportunidades no funil</span>
              </div>
            </div>
          </div>

          {/* 4. Regras */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-amber-900">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
              </div>
              <h3 className="font-bold text-base text-amber-950">Regras e Boas Práticas</h3>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-amber-950">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Cadastre com telefone ou email</span>
              </li>
              <li className="flex items-start gap-2">
                <PhoneCall className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>Registre toda ligação</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Nunca duplique (busque antes)</span>
              </li>
              <li className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>Senha pessoal e intransferível</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>Não burle metas (sistema registra tudo)</span>
              </li>
            </ul>
          </div>

          {/* 5. Ajuda */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-emerald-900">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <HelpCircle className="w-4 h-4 text-emerald-700" />
              </div>
              <h3 className="font-bold text-base text-emerald-950">Canais de Ajuda</h3>
            </div>
            <p className="text-xs sm:text-sm text-emerald-950 leading-relaxed">
              Volte ao treinamento sempre que esquecer algo, consulte os Procedimentos Operacionais
              Padrão (POPs) ou pergunte diretamente ao coordenador da equipe.
            </p>
            <div className="pt-2 text-xs text-emerald-800 font-medium">
              💡 Não fique com dúvida: perguntar é sinal de profissionalismo.
            </div>
          </div>
        </div>

        {/* Rodapé do Guia com CTA final para o treinamento */}
        <div className="mt-6 pt-6 border-t border-[#F1F5F9] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-[#64748B]">
            Pronto para começar? Faça o treinamento interativo para testar e validar seus
            conhecimentos.
          </div>
          <Button
            type="button"
            onClick={onIrParaTreinamento}
            size="lg"
            className="w-full sm:w-auto bg-[#16A34A] hover:bg-[#15803D] text-white font-bold gap-2 shadow-sm"
          >
            <GraduationCap className="w-5 h-5" />
            <span>Ir para o treinamento completo</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
