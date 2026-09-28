migrate((app) => {
  // Leitura segura e execução de teste
  const bucket = $os.getenv('BACKUP_S3_BUCKET') || ''
  const endpoint = $os.getenv('BACKUP_S3_ENDPOINT') || ''
  const key = $os.getenv('BACKUP_S3_KEY') || ''
  const secret = $os.getenv('BACKUP_S3_SECRET') || ''
  const instanceUrl = $os.getenv('PB_INSTANCE_URL') || ''
  const superuserToken = $os.getenv('PB_SUPERUSER_TOKEN') || ''

  // Salvar em webhook_logs como log de teste
  const wlCol = app.findCollectionByNameOrId('webhook_logs')
  const rec = new Record(wlCol)
  rec.set('external_id', 'test-env-' + Date.now())
  rec.set('provider', 'env_test')
  rec.set('status', 'sucesso')
  rec.set('erro', JSON.stringify({
    hasBucket: !!bucket,
    bucketLength: bucket.length,
    hasEndpoint: !!endpoint,
    endpointPrefix: endpoint ? endpoint.slice(0, 12) : '',
    hasKey: !!key,
    keyLen: key.length,
    hasSecret: !!secret,
    secretLen: secret.length,
    hasInstanceUrl: !!instanceUrl,
    instanceUrl: instanceUrl,
    hasSuperuserToken: !!superuserToken,
    tokenLen: superuserToken.length,
  }))
  app.save(rec)
}, (app) => {
})
