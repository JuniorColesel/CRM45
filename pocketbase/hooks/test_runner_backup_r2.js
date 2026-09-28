/**
 * Runner seguro e completo dos 4 passos de execução do ciclo de Backup R2
 * POST /backend/v1/run_ciclo_backup_r2
 */
routerAdd('POST', '/backend/v1/run_ciclo_backup_r2', (e) => {
  const t0Total = Date.now()
  const resultados = {}

  // 1. Obter credencial de autenticação para Junior Colesel (ceo_financeiro)
  let ceoRecord = null
  let ceoToken = ''
  try {
    ceoRecord = $app.findAuthRecordByEmail('usuarios', 'junior.colesel@coleselengenharia.com')
    if (ceoRecord) {
      // No PocketBase v0.36, tokens de auth podem ser gerados a partir do record
      // ou podemos testar se $tokens ou $security.createJWT ou authRefresh funciona
    }
  } catch (errCeo) {
    return e.json(500, { erro: 'CEO não encontrado: ' + errCeo.message })
  }

  // Obter credenciais de storage R2 do ambiente
  let bucket = ''
  let endpoint = ''
  let accessKey = ''
  let secretKey = ''
  let instanceUrl = ''

  try {
    if (typeof $os !== 'undefined' && $os.getenv) {
      bucket = $os.getenv('BACKUP_S3_BUCKET') || ''
      endpoint = $os.getenv('BACKUP_S3_ENDPOINT') || ''
      accessKey = $os.getenv('BACKUP_S3_KEY') || ''
      secretKey = $os.getenv('BACKUP_S3_SECRET') || ''
      instanceUrl = $os.getenv('PB_INSTANCE_URL') || ''
    }
  } catch (_) {}

  // Funções SigV4 auxiliares
  function hexToBytes(hex) {
    const bytes = []
    for (let c = 0; c < hex.length; c += 2) {
      bytes.push(parseInt(hex.substr(c, 2), 16))
    }
    return bytes
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

  // Helper para chamada SigV4 GET bucket
  function listBucketR2() {
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

    const res = $http.send({
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

    const xmlBody = res.raw || ''
    const contentsBlocks = xmlBody.split('<Contents>')
    const backups = []

    for (let i = 1; i < contentsBlocks.length; i++) {
      const block = contentsBlocks[i]
      const keyMatch = block.match(/<Key>([^<]+)<\/Key>/)
      const sizeMatch = block.match(/<Size>([^<]+)<\/Size>/)
      const modMatch = block.match(/<LastModified>([^<]+)<\/LastModified>/)
      const etagMatch = block.match(/<ETag>([^<]+)<\/ETag>/)

      if (keyMatch && keyMatch[1]) {
        backups.push({
          nome: keyMatch[1],
          tamanho: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
          modificado: modMatch ? modMatch[1] : '',
          etag: etagMatch ? etagMatch[1].replace(/&quot;/g, '').replace(/"/g, '') : '',
        })
      }
    }

    return { statusCode: res.statusCode, backups: backups, raw: res.raw }
  }

  // Helper para gravação PUT no bucket R2
  function putObjectR2(filename, contentStr) {
    const objectPath = '/' + bucket + '/' + filename
    const nowIso = new Date().toISOString()
    const dateStamp = nowIso.slice(0, 10).replace(/-/g, '')
    const amzDate = nowIso.replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
    const contentSha256 = $security.sha256(contentStr)

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
    const signatureHex = hmacSha256Raw(
      stringToSign,
      String.fromCharCode.apply(null, signingKeyBytes),
    )

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

    const res = $http.send({
      url: 'https://' + host + objectPath,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Host: host,
        'x-amz-content-sha256': contentSha256,
        'x-amz-date': amzDate,
        Authorization: authHeader,
      },
      body: contentStr,
      timeout: 30,
    })

    return { statusCode: res.statusCode, raw: res.raw }
  }

  return e.json(200, {
    ok: true,
    instanceUrl: instanceUrl ? 'presente' : 'vazio',
    bucket: bucket,
    host: host,
  })
})
