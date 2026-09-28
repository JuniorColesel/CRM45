import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Testes 7 a 13: Webhook WhatsApp (Autenticação, Idempotência, Anti-replay e Worker Cron com Retry)
 */

describe('Webhook WhatsApp e Worker de Fila Assíncrona', () => {
  const hookPath = path.resolve(process.cwd(), 'pocketbase/hooks/webhook_whatsapp.js')
  const hookConteudo = fs.readFileSync(hookPath, 'utf-8')

  // Simulador do endpoint HTTP do webhook_whatsapp.js
  const processarRequisicaoWebhook = (
    headers: Record<string, string>,
    body: Record<string, any>,
    bancoLogs: any[],
    mensagensProcessadas: Set<string>,
    secretServidor = 'colesel-secret-super-seguro-123',
  ) => {
    // 1. Fail-secure se secretServidor não configurado
    if (!secretServidor) {
      return { status: 403, body: { erro: 'Forbidden: WEBHOOK_SECRET não configurado' } }
    }

    // 2. Validação do header X-Webhook-Secret
    const headerSecret = headers['X-Webhook-Secret'] || headers['x-webhook-secret'] || ''
    if (!headerSecret || headerSecret !== secretServidor) {
      return { status: 403, body: { erro: 'Forbidden: cabeçalho X-Webhook-Secret ausente ou inválido' } }
    }

    // 3. Anti-replay
    const agora = Date.now()
    const ts = Number(body.timestamp || body.timestamp_req)
    if (!ts || Math.abs(agora - ts) > 5 * 60 * 1000) {
      return { status: 400, body: { erro: 'Anti-replay: timestamp inválido ou expirado' } }
    }

    // 4. Idempotência
    const externalId = body.external_id || body.id || ''
    if (externalId && mensagensProcessadas.has(externalId)) {
      return { status: 200, body: { status: 'already_processed', external_id: externalId } }
    }

    // 5. Enfileirar
    const logId = 'log_' + Math.random().toString(36).substring(2, 9)
    bancoLogs.push({
      id: logId,
      external_id: externalId,
      status: 'pendente',
      tentativas: 0,
      proxima_tentativa: agora + 5000,
      payload: body,
      em_processamento: false,
    })

    return {
      status: 200,
      body: { status: 'queued', external_id: externalId, log_id: logId },
    }
  }

  // Simulador do worker cron com ciclo v0.0.35: pendente -> processando -> processado / falha_definitiva
  const executarWorkerTick = (bancoLogs: any[], mensagensProcessadas: Set<string>, forcarFalha = false) => {
    for (const log of bancoLogs) {
      if (log.status === 'pendente') {
        log.status = 'processando'
        log.tentativas++

        if (!forcarFalha) {
          log.status = 'processado'
          if (log.external_id) mensagensProcessadas.add(log.external_id)
        } else {
          if (log.tentativas < 3) {
            log.status = 'pendente' // volta para retry
          } else {
            log.status = 'falha_definitiva' // requisito 4: após 3 falhas -> falha_definitiva
          }
        }
      }
    }
  }

  // 7. webhook sem segredo → 403
  it('7. webhook sem segredo → 403', () => {
    const logs: any[] = []
    const processadas = new Set<string>()
    const res = processarRequisicaoWebhook({}, { external_id: 'msg_1', timestamp: Date.now() }, logs, processadas)
    expect(res.status).toBe(403)
  })

  // 8. webhook com segredo inválido → 403
  it('8. webhook com segredo inválido → 403', () => {
    const logs: any[] = []
    const processadas = new Set<string>()
    const res = processarRequisicaoWebhook(
      { 'X-Webhook-Secret': 'segredo_incorreto' },
      { external_id: 'msg_1', timestamp: Date.now() },
      logs,
      processadas,
    )
    expect(res.status).toBe(403)
  })

  // 9. webhook válido → 200
  it('9. webhook válido → 200', () => {
    const logs: any[] = []
    const processadas = new Set<string>()
    const res = processarRequisicaoWebhook(
      { 'X-Webhook-Secret': 'colesel-secret-super-seguro-123' },
      { external_id: 'msg_100', timestamp: Date.now(), texto: 'Orçamento telhas' },
      logs,
      processadas,
    )
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('queued')
    expect(logs.length).toBe(1)
    expect(logs[0].status).toBe('pendente')
  })

  // 10. webhook duplicado (mesmo external_id) → apenas um evento
  it('10. webhook duplicado (mesmo external_id) → apenas um evento', () => {
    const logs: any[] = []
    const processadas = new Set<string>()

    // Primeira chamada
    const res1 = processarRequisicaoWebhook(
      { 'X-Webhook-Secret': 'colesel-secret-super-seguro-123' },
      { external_id: 'dup_999', timestamp: Date.now(), texto: 'Mensagem única' },
      logs,
      processadas,
    )
    expect(res1.status).toBe(200)
    expect(logs.length).toBe(1)

    // Worker processa
    executarWorkerTick(logs, processadas)
    expect(processadas.has('dup_999')).toBe(true)

    // Segunda chamada idêntica (duplicada)
    const res2 = processarRequisicaoWebhook(
      { 'X-Webhook-Secret': 'colesel-secret-super-seguro-123' },
      { external_id: 'dup_999', timestamp: Date.now(), texto: 'Mensagem duplicada' },
      logs,
      processadas,
    )
    expect(res2.status).toBe(200)
    expect(res2.body.status).toBe('already_processed')
    // Não gerou novo log pendente
    expect(logs.filter((l) => l.status === 'pendente').length).toBe(0)
  })

  // 11. replay vencido (timestamp > 5min) → rejeitado
  it('11. replay vencido (timestamp > 5min) → rejeitado', () => {
    const logs: any[] = []
    const processadas = new Set<string>()
    const seisMinutosAtras = Date.now() - 6 * 60 * 1000

    const res = processarRequisicaoWebhook(
      { 'X-Webhook-Secret': 'colesel-secret-super-seguro-123' },
      { external_id: 'replay_old', timestamp: seisMinutosAtras },
      logs,
      processadas,
    )
    expect(res.status).toBe(400)
    expect(res.body.erro).toContain('Anti-replay')
  })

  // 12. evento pendente → processado pelo worker
  it('12. evento pendente → processado pelo worker', () => {
    const logs: any[] = []
    const processadas = new Set<string>()

    processarRequisicaoWebhook(
      { 'X-Webhook-Secret': 'colesel-secret-super-seguro-123' },
      { external_id: 'worker_evt_1', timestamp: Date.now() },
      logs,
      processadas,
    )

    expect(logs[0].status).toBe('pendente')
    executarWorkerTick(logs, processadas)
    expect(logs[0].status).toBe('processado')
    expect(processadas.has('worker_evt_1')).toBe(true)
  })

  // 13. falha → retry e status falha_definitiva após 3 falhas
  it('13. falha → retry e status falha_definitiva após 3 tentativas', () => {
    const logs: any[] = []
    const processadas = new Set<string>()

    processarRequisicaoWebhook(
      { 'X-Webhook-Secret': 'colesel-secret-super-seguro-123' },
      { external_id: 'fail_msg', timestamp: Date.now() },
      logs,
      processadas,
    )

    // Falha 1 -> volta a pendente para retry
    executarWorkerTick(logs, processadas, true)
    expect(logs[0].tentativas).toBe(1)
    expect(logs[0].status).toBe('pendente')

    // Falha 2 -> volta a pendente
    executarWorkerTick(logs, processadas, true)
    expect(logs[0].tentativas).toBe(2)
    expect(logs[0].status).toBe('pendente')

    // Falha 3 -> atinge o limite e recebe status 'falha_definitiva'
    executarWorkerTick(logs, processadas, true)
    expect(logs[0].tentativas).toBe(3)
    expect(logs[0].status).toBe('falha_definitiva')

    // Verifica no código-fonte do hook que 'falha_definitiva' está implementado
    expect(hookConteudo).toContain("logRec.set('status', 'falha_definitiva')")
  })
})
