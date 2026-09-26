import React from 'react'

interface ModulePlaceholderProps {
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
}

export default function ModulePlaceholder({
  title,
  subtitle = 'Este módulo está em construção e será implementado em breve.',
  icon: Icon,
}: ModulePlaceholderProps) {
  return (
    <div className="relative min-h-[460px] flex items-center justify-center rounded-2xl border border-[#E2E8F0] bg-white p-8 sm:p-12 overflow-hidden shadow-sm animate-fade-in-fast">
      {/* Marca d'água suave do ícone atrás do título */}
      <div
        className="pointer-events-none absolute select-none text-[#7C3AED]/[0.05] transition-transform duration-700 hover:scale-105"
        aria-hidden="true"
      >
        <Icon className="w-72 h-72 sm:w-96 sm:h-96" />
      </div>

      {/* Conteúdo centralizado */}
      <div className="relative z-10 text-center max-w-lg mx-auto flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#16A34A]/10 to-[#7C3AED]/15 flex items-center justify-center text-[#16A34A] mb-6 shadow-sm border border-[#16A34A]/20">
          <Icon className="w-8 h-8 text-[#16A34A]" />
        </div>
        <h2 className="text-[28px] sm:text-[36px] font-bold text-[#0F172A] tracking-tight leading-tight mb-3">
          {title}
        </h2>
        <p className="text-base text-[#64748B] leading-relaxed max-w-md">{subtitle}</p>
        <div className="mt-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F1F5F9] text-xs font-medium text-[#64748B] border border-[#E2E8F0]">
          <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
          Módulo em planejamento — Colesel 45
        </div>
      </div>
    </div>
  )
}
