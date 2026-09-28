/**
 * Backup Externo Cloudflare R2 - CRM Colesel 45 (v0.0.37)
 * Cron Job: "executar_backup_diario_persistente"
 * Frequência: Diária às 03:00 Horário de Brasília = 06:00 UTC (Cron: "0 6 * * *")
 * Retenção: 30 dias (rotação efetiva com DeleteObject na API S3)
 *
 * Módulo de Backup Externo Real:
 * 1. Leitura segura das variáveis de ambiente:
 *    - BACKUP_S3_BUCKET, BACKUP_S3_ENDPOINT, BACKUP_S3_KEY, BACKUP_S3_SECRET
 *    - Fail-secure: se alguma faltar, lança erro explícito sem vazar segredos.
 * 2. Dump estruturado completo das 23 coleções (incluindo users com avatar se houver).
 * 3. Envio autenticado para Cloudflare R2 usando AWS Signature Version 4 (SigV4) via $http.send.
 * 4. Rotação efetiva (DeleteObject) de backups com mais de 30 dias.
 * 5. Rotas administrativas restritas (/backend/v1/backup/create, /backend/v1/backup/list, /backend/v1/backup/restore).
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica de execução deve ficar inline dentro de cada callback!
 */

// -------------------------------------------------------------
// 1. CRON JOB DIÁRIO: 03:00 BRT = 06:00 UTC
// -------------------------------------------------------------
cronAdd('executar_backup_diario_persistente', '0 6 * * *', () => {
  const agora = new Date()
  const timestampIso = agora.toISOString()
  console.log('[BACKUP-R2] Iniciando execução diária programada (06:00 UTC):', timestampIso)

  // 1. Obter credenciais do ambiente (fail-secure, sem log de valores)
  let bucket = ''
  let endpoint = ''
  let accessKey = ''
  let secretKey = ''

  try {
    if (typeof $os !== 'undefined' && $os.getenv) {
      bucket = $os.getenv('BACKUP_S3_BUCKET') || ''
      endpoint = $os.getenv('BACKUP_S3_ENDPOINT') || ''
      accessKey = $os.getenv('BACKUP_S3_KEY') || ''
      secretKey = $os.getenv('BACKUP_S3_SECRET') || ''
    }
  } catch (_) {}

  if (!bucket || !endpoint || !accessKey || !secretKey) {
    try {
      if (typeof $secrets !== 'undefined' && $secrets.get) {
        if (!bucket) bucket = $secrets.get('BACKUP_S3_BUCKET') || ''
        if (!endpoint) endpoint = $secrets.get('BACKUP_S3_ENDPOINT') || ''
        if (!accessKey) accessKey = $secrets.get('BACKUP_S3_KEY') || ''
        if (!secretKey) secretKey = $secrets.get('BACKUP_S3_SECRET') || ''
      }
    } catch (_) {}
  }

  const faltantes = []
  if (!bucket) faltantes.push('BACKUP_S3_BUCKET')
  if (!endpoint) faltantes.push('BACKUP_S3_ENDPOINT')
  if (!accessKey) faltantes.push('BACKUP_S3_KEY')
  if (!secretKey) faltantes.push('BACKUP_S3_SECRET')

  if (faltantes.length > 0) {
    const msgErro =
      '[BACKUP-R2] FALHA CRÍTICA: Variáveis obrigatórias ausentes no ambiente: ' +
      faltantes.join(', ')
    console.error(msgErro)
    return
  }

  // 2. Coletar dados de todas as 23 coleções
  const colecoesAlvo = [
    'users',
    'usuarios',
    'etapas_funil',
    'motivos_perda',
    'clientes',
    'oportunidades',
    'tarefas',
    'ligacoes',
    'canais_marketing',
    'automacoes',
    'mensagens_enviadas',
    'campanhas',
    'conteudos_gerados',
    'publicacoes',
    'aprovacoes_pendentes',
    'metas',
    'treinamento_concluido',
    'conversas_whatsapp',
    'mensagens_whatsapp',
    'produtos',
    'sugestoes_ia',
    'integracoes_config',
    'webhook_logs',
  ]

  const dadosDump = {}
  const contagens = {}
  let totalRegistros = 0

  for (let i = 0; i < colecoesAlvo.length; i++) {
    const nomeCol = colecoesAlvo[i]
    try {
      const totalCol = $app.countRecords(nomeCol)
      contagens[nomeCol] = totalCol
      totalRegistros += totalCol

      const registros = []
      const batchSize = 200
      let offset = 0
      while (offset < totalCol) {
        const batch = $app.findRecordsByFilter(nomeCol, '', 'id', batchSize, offset)
        for (let j = 0; j < batch.length; j++) {
          registros.push(batch[j].publicExport())
        }
        offset += batch.length
        if (batch.length === 0) break
      }
      dadosDump[nomeCol] = registros
    } catch (errCol) {
      contagens[nomeCol] = 0
      dadosDump[nomeCol] = []
      console.warn(
        `[BACKUP-R2] Aviso ao catalogar coleção ${nomeCol}:`,
        errCol && errCol.message ? errCol.message : errCol,
      )
    }
  }

  const dataFormatada = agora.toISOString().replace(/[-:T]/g, '').slice(0, 15) // YYYYMMDDHHMMSS
  const nomeArquivo = `backup-${agora.toISOString().slice(0, 10)}-${dataFormatada.slice(8, 14)}.json`

  const payloadObjeto = {
    versao: '0.0.37',
    app: 'crm-colesel-45',
    timestamp: timestampIso,
    totalColecoes: colecoesAlvo.length,
    totalRegistros: totalRegistros,
    contagens: contagens,
    colecoes: dadosDump,
  }

  const payloadString = JSON.stringify(payloadObjeto)
  const tamanhoBytes = payloadString.length

  console.log(
    `[BACKUP-R2] Dump estruturado gerado com sucesso: ${nomeArquivo} (${tamanhoBytes} bytes, ${totalRegistros} registros)`,
  )

  // 3. Funções auxiliares SigV4
  function hexToBytes(hex) {
    const bytes = []
    for (let c = 0; c < hex.length; c += 2) {
      bytes.push(parseInt(hex.substr(c, 2), 16))
    }
    return bytes
  }

  function bytesToHex(byteArray) {
    let s = ''
    for (let i = 0; i < byteArray.length; i++) {
      let h = (byteArray[i] & 0xff).toString(16)
      if (h.length === 1) h = '0' + h
      s += h
    }
    return s
  }

  function hmacSha256Raw(text, keyBytesOrStr) {
    return $security.hs256(text, keyBytesOrStr)
  }

  function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDateHex = hmacSha256Raw(dateStamp, 'AWS4' + key)
    const kRegionHex = hmacSha256Raw(
      regionName,
      String.fromCharCode.apply(null, hexToBytes(kDateHex)),
    )
    const kServiceHex = hmacSha256Raw(
      serviceName,
      String.fromCharCode.apply(null, hexToBytes(kRegionHex)),
    )
    const kSigningHex = hmacSha256Raw(
      'aws4_request',
      String.fromCharCode.apply(null, hexToBytes(kServiceHex)),
    )
    return hexToBytes(kSigningHex)
  }

  function parseEndpoint(ep) {
    let clean = ep.trim()
    if (clean.startsWith('https://')) clean = clean.substring(8)
    if (clean.startsWith('http://')) clean = clean.substring(7)
    const slashIdx = clean.indexOf('/')
    let host = slashIdx !== -1 ? clean.substring(0, slashIdx) : clean
    let basePath = slashIdx !== -1 ? clean.substring(slashIdx) : ''
    if (basePath.endsWith('/')) basePath = basePath.slice(0, -1)
    return { host: host, basePath: basePath }
  }

  const epInfo = parseEndpoint(endpoint)
  const host = epInfo.host
  const region = 'auto'
  const service = 's3'

  const dateStamp = timestampIso.slice(0, 10).replace(/-/g, '')
  const amzDate = timestampIso.replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'

  // Upload PUT /<bucket>/<nomeArquivo>
  const objectPath = '/' + bucket + '/' + nomeArquivo
  const contentSha256 = $security.sha256(payloadString)

  const canonicalHeaders =
    'content-type:application/json\n' +
    'host:' +
    host +
    '\n' +
    'x-amz-content-sha256:' +
    contentSha256 +
    '\n' +
    'x-amz-date:' +
    amzDate +
    '\n'

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest =
    'PUT\n' +
    objectPath +
    '\n' +
    '\n' +
    canonicalHeaders +
    '\n' +
    signedHeaders +
    '\n' +
    contentSha256

  const stringToSign =
    'AWS4-HMAC-SHA256\n' +
    amzDate +
    '\n' +
    dateStamp +
    '/' +
    region +
    '/' +
    service +
    '/aws4_request\n' +
    $security.sha256(canonicalRequest)

  const signingKeyBytes = getSignatureKey(secretKey, dateStamp, region, service)
  const signatureHex = hmacSha256Raw(stringToSign, String.fromCharCode.apply(null, signingKeyBytes))

  const authHeader =
    'AWS4-HMAC-SHA256 Credential=' +
    accessKey +
    '/' +
    dateStamp +
    '/' +
    region +
    '/' +
    service +
    '/aws4_request, ' +
    'SignedHeaders=' +
    signedHeaders +
    ', ' +
    'Signature=' +
    signatureHex

  const targetUrl = 'https://' + host + objectPath
  console.log(`[BACKUP-R2] Despachando dump para R2 via SigV4: ${nomeArquivo} -> bucket ${bucket}`)

  try {
    const resPut = $http.send({
      url: targetUrl,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Host: host,
        'x-amz-content-sha256': contentSha256,
        'x-amz-date': amzDate,
        Authorization: authHeader,
      },
      body: payloadString,
      timeout: 120,
    })

    if (resPut.statusCode >= 200 && resPut.statusCode < 300) {
      console.log(
        `[BACKUP-R2] SUCESSO: Dump enviado para Cloudflare R2 com HTTP ${resPut.statusCode} (${nomeArquivo})`,
      )
    } else {
      console.error(
        `[BACKUP-R2] ERRO ao enviar dump para R2: HTTP ${resPut.statusCode} - ${resPut.raw}`,
      )
      return
    }
  } catch (errUpload) {
    console.error(
      '[BACKUP-R2] Exceção durante envio HTTP ao Cloudflare R2:',
      errUpload && errUpload.message ? errUpload.message : errUpload,
    )
    return
  }

  // 4. Executar rotação efetiva (excluir arquivos com mais de 30 dias via DeleteObject)
  try {
    console.log('[BACKUP-R2] Executando rotação no bucket R2 (retenção: 30 dias)...')
    const listPath = '/' + bucket
    const emptyPayloadSha256 = $security.sha256('')
    const listAmzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
    const listDateStamp = listAmzDate.slice(0, 8)

    const listCanonicalHeaders =
      'host:' +
      host +
      '\n' +
      'x-amz-content-sha256:' +
      emptyPayloadSha256 +
      '\n' +
      'x-amz-date:' +
      listAmzDate +
      '\n'
    const listSignedHeaders = 'host;x-amz-content-sha256;x-amz-date'

    const listCanonicalReq =
      'GET\n' +
      listPath +
      '\n' +
      '\n' +
      listCanonicalHeaders +
      '\n' +
      listSignedHeaders +
      '\n' +
      emptyPayloadSha256

    const listStringToSign =
      'AWS4-HMAC-SHA256\n' +
      listAmzDate +
      '\n' +
      listDateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request\n' +
      $security.sha256(listCanonicalReq)

    const listSigningKey = getSignatureKey(secretKey, listDateStamp, region, service)
    const listSignatureHex = hmacSha256Raw(
      listStringToSign,
      String.fromCharCode.apply(null, listSigningKey),
    )

    const listAuthHeader =
      'AWS4-HMAC-SHA256 Credential=' +
      accessKey +
      '/' +
      listDateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request, ' +
      'SignedHeaders=' +
      listSignedHeaders +
      ', ' +
      'Signature=' +
      listSignatureHex

    const resList = $http.send({
      url: 'https://' + host + listPath,
      method: 'GET',
      headers: {
        Host: host,
        'x-amz-content-sha256': emptyPayloadSha256,
        'x-amz-date': listAmzDate,
        Authorization: listAuthHeader,
      },
      timeout: 30,
    })

    if (resList.statusCode === 200) {
      const xmlBody = resList.raw || ''
      const keyMatches = xmlBody.match(/<Key>([^<]+)<\/Key>/g) || []
      const lastModMatches = xmlBody.match(/<LastModified>([^<]+)<\/LastModified>/g) || []

      const limiteRetencaoMs = 30 * 24 * 60 * 60 * 1000
      const agoraMs = Date.now()
      let excluidos = 0

      for (let k = 0; k < keyMatches.length; k++) {
        const itemKey = keyMatches[k].replace('<Key>', '').replace('</Key>', '')
        const itemLastMod = lastModMatches[k]
          ? lastModMatches[k].replace('<LastModified>', '').replace('</LastModified>', '')
          : ''

        let dataObjetoMs = 0
        if (itemLastMod) {
          dataObjetoMs = new Date(itemLastMod).getTime()
        } else {
          // Tenta extrair timestamp do nome (ex: backup-YYYY-MM-DD-HHMMSS.json)
          const parts = itemKey.match(/backup-(\d{4}-\d{2}-\d{2})/)
          if (parts && parts[1]) {
            dataObjetoMs = new Date(parts[1]).getTime()
          }
        }

        if (dataObjetoMs > 0 && agoraMs - dataObjetoMs > limiteRetencaoMs) {
          console.log(
            `[BACKUP-R2] Objeto expirado (>30 dias) identificado para remoção: ${itemKey}`,
          )
          // Executa DELETE
          const delPath = '/' + bucket + '/' + itemKey
          const delAmzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
          const delDateStamp = delAmzDate.slice(0, 8)
          const delCanonicalHeaders =
            'host:' +
            host +
            '\n' +
            'x-amz-content-sha256:' +
            emptyPayloadSha256 +
            '\n' +
            'x-amz-date:' +
            delAmzDate +
            '\n'
          const delSignedHeaders = 'host;x-amz-content-sha256;x-amz-date'

          const delCanonicalReq =
            'DELETE\n' +
            delPath +
            '\n' +
            '\n' +
            delCanonicalHeaders +
            '\n' +
            delSignedHeaders +
            '\n' +
            emptyPayloadSha256

          const delStringToSign =
            'AWS4-HMAC-SHA256\n' +
            delAmzDate +
            '\n' +
            delDateStamp +
            '/' +
            region +
            '/' +
            service +
            '/aws4_request\n' +
            $security.sha256(delCanonicalReq)

          const delSigningKey = getSignatureKey(secretKey, delDateStamp, region, service)
          const delSignatureHex = hmacSha256Raw(
            delStringToSign,
            String.fromCharCode.apply(null, delSigningKey),
          )

          const delAuthHeader =
            'AWS4-HMAC-SHA256 Credential=' +
            accessKey +
            '/' +
            delDateStamp +
            '/' +
            region +
            '/' +
            service +
            '/aws4_request, ' +
            'SignedHeaders=' +
            delSignedHeaders +
            ', ' +
            'Signature=' +
            delSignatureHex

          const resDel = $http.send({
            url: 'https://' + host + delPath,
            method: 'DELETE',
            headers: {
              Host: host,
              'x-amz-content-sha256': emptyPayloadSha256,
              'x-amz-date': delAmzDate,
              Authorization: delAuthHeader,
            },
            timeout: 30,
          })

          if (resDel.statusCode === 204 || resDel.statusCode === 200) {
            console.log(
              `[BACKUP-R2] Objeto antigo removido com sucesso via DeleteObject: ${itemKey}`,
            )
            excluidos++
          } else {
            console.warn(`[BACKUP-R2] Falha ao deletar ${itemKey}: HTTP ${resDel.statusCode}`)
          }
        }
      }
      console.log(
        `[BACKUP-R2] Rotação concluída com sucesso. Total de objetos expirados expurgados: ${excluidos}`,
      )
    } else {
      console.warn(
        `[BACKUP-R2] Não foi possível listar bucket para rotação: HTTP ${resList.statusCode}`,
      )
    }
  } catch (errRot) {
    console.error(
      '[BACKUP-R2] Erro durante a rotação:',
      errRot && errRot.message ? errRot.message : errRot,
    )
  }
})
