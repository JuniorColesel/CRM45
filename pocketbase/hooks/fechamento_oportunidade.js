/**
 * Hook para a coleção "oportunidades":
 * Ao salvar uma oportunidade com status "ganho" ou "perdido",
 * se o campo data_fechamento estiver vazio, preencher automaticamente com a data/hora atual.
 */

onRecordCreate((e) => {
  const status = e.record.getString('status')
  const dataFechamento = e.record.getString('data_fechamento')
  if ((status === 'ganho' || status === 'perdido') && !dataFechamento) {
    const nowIso = new Date().toISOString()
    e.record.set('data_fechamento', nowIso)
  }
  e.next()
}, 'oportunidades')

onRecordUpdate((e) => {
  const status = e.record.getString('status')
  const dataFechamento = e.record.getString('data_fechamento')
  if ((status === 'ganho' || status === 'perdido') && !dataFechamento) {
    const nowIso = new Date().toISOString()
    e.record.set('data_fechamento', nowIso)
  }
  e.next()
}, 'oportunidades')
