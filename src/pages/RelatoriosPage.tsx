import { BarChart3 } from 'lucide-react'
import ModulePlaceholder from '@/components/ModulePlaceholder'
import { SeletorDePeriodo } from '@/components/common/SeletorDePeriodo'

export default function RelatoriosPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <SeletorDePeriodo />
      <ModulePlaceholder title="Relatórios" icon={BarChart3} />
    </div>
  )
}
