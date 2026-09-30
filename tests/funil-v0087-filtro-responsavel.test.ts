import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Testes de validação da v0.0.87:
 * - Filtro de datas por modo Origem vs Fechamento no Funil
 * - Exibição contextual da data no KanbanCard (Origem: vs Fechamento:)
 * - Propagação idempotente e contínua de responsavel_id em bling_importar.js e migração 0065
 * - Proteção contra regressão do cálculo decimal e agregação do painel comercial
 */

describe('v0.0.87 — Correção Final do Funil (Filtro de Datas + Responsável Bling)', () => {
  const funilPagePath = path.resolve(process.cwd(), 'src/pages/FunilPage.tsx')
  const kanbanCardPath = path.resolve(process.cwd(), 'src/components/funil/KanbanCard.tsx')
  const blingHookPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
  const comercialHookPath = path.resolve(process.cwd(), 'pocketbase/hooks/comercial_periodo.js')
  const migration0065Path = path.resolve(process.cwd(), 'pocketbase/migrations/0065_corrigir_responsavel_oportunidades.js')

  const funilPageCode = fs.readFileSync(funilPagePath, 'utf-8')
  const kanbanCardCode = fs.readFileSync(kanbanCardPath, 'utf-8')
  const blingHookCode = fs.readFileSync(blingHookPath, 'utf-8')
  const comercialHookCode = fs.readFileSync(comercialHookPath, 'utf-8')
  const migration0065Code = fs.readFileSync(migration0065Path, 'utf-8')

  it('1. Filtro do FunilPage unifica filtros.dataInicio/fim com modo de visão Origem e Fechamento', () => {
    expect(funilPageCode).toContain('efetivoInicioYmd = filtros.dataInicio || periodo.dataInicioYmd')
    expect(funilPageCode).toContain('efetivoFimYmd = filtros.dataFim || periodo.dataFimYmd')
    expect(funilPageCode).toContain("modoVisao === 'fechamento'")
    expect(funilPageCode).toContain("data_fechamento >= '${efetivoInicioYmd}'")
    expect(funilPageCode).toContain("data_fechamento <= '${efetivoFimYmd}'")
    expect(funilPageCode).toContain("data_origem >= '${efetivoInicioYmd}'")
    expect(funilPageCode).toContain("data_origem <= '${efetivoFimYmd}'")
  })

  it('2. KanbanCard recebe modoVisao e exibe rótulo contextual Origem vs Fechamento', () => {
    expect(kanbanCardCode).toContain("modoVisao === 'fechamento'")
    expect(kanbanCardCode).toContain('Fechamento:')
    expect(kanbanCardCode).toContain('Origem:')
  })

  it('3. Migração 0065 propaga responsavel_id de bling_pedidos para oportunidades por bling_pedido_id', () => {
    expect(migration0065Code).toContain('UPDATE oportunidades')
    expect(migration0065Code).toContain('SET responsavel_id = (')
    expect(migration0065Code).toContain('WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id')
    expect(migration0065Code).toContain("tipo_origem = 'bling_pedido'")
  })

  it('4. Motor oficial de sincronização (bling_importar.js) propaga responsavel_id sem sobrescrever com string vazia', () => {
    expect(blingHookCode).toContain('bp.responsavel_id IS NOT NULL AND bp.responsavel_id != \'\' THEN bp.responsavel_id ELSE NULL')
  })

  it('5. Regressão do Dashboard: comercial_periodo.js usa COALESCE e somas decimais nunca voltam como string nula silenciosa', () => {
    expect(comercialHookCode).toContain('CAST(COALESCE(sum(valor_total), 0) AS TEXT)')
    expect(comercialHookCode).toContain('CAST(COALESCE(sum(valor), 0) AS TEXT)')
    expect(comercialHookCode).toContain('toNum')
  })
})
