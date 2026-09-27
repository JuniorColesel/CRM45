/**
 * Hook para a coleção "oportunidades":
 * - Quando a oportunidade muda de status para "ganho" ou "perdido", preencher data_fechamento com a data/hora atual
 * - Quando a oportunidade muda de status de volta para "aberto", LIMPAR data_fechamento (setar para null / string vazia)
 * - Válido para qualquer transição, tanto na criação quanto na atualização
 */

onRecordCreate((e) => {
  const status = e.record.getString('status')
  if (status === 'ganho' || status === 'perdido') {
    e.record.set('data_fechamento', new Date().toISOString())
  } else {
    e.record.set('data_fechamento', null)
  }
  e.next()
}, 'oportunidades')

onRecordUpdate((e) => {
  const status = e.record.getString('status')
  const oldRecord = e.record.original()
  const oldStatus = oldRecord ? oldRecord.getString('status') : ''

  if (status === 'ganho' || status === 'perdido') {
    if (oldStatus !== status || !e.record.getString('data_fechamento')) {
      e.record.set('data_fechamento', new Date().toISOString())
    }
  } else if (status === 'aberto') {
    e.record.set('data_fechamento', null)
  }

  e.next()
}, 'oportunidades')
