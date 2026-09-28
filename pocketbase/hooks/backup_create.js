/**
 * Endpoint POST /backend/v1/backup/create
 * Cria backup completo do banco de dados (23 coleções), envia ao Cloudflare R2
 * via AWS Signature V4 e executa a rotação de arquivos com mais de 30 dias.
 * Restrito a superusuários e administradores do CRM (ceo_financeiro e coordenador_vendas).
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/backup/create',
  (e) => {
    // 1. Autenticação e Autorização Admin
    const authRecord = e.auth
    let isSuperuser = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false

    // Validação alternativa via secret PB_SUPERUSER_TOKEN no Authorization header (sem desabilitar auth)
    if (!isSuperuser && !authRecord) {
      try {
        const expectedSuperToken = ($os.getenv && $os.getenv('PB_SUPERUSER_TOKEN')) || ''
        const reqHeaders = e.requestInfo().headers || {}
        const rawAuth = reqHeaders['authorization'] || reqHeaders['Authorization'] || ''
        const bearerMatch = rawAuth.match(/^Bearer\s+(.+)$/i)
        const tokenSent = bearerMatch ? bearerMatch[1].trim() : rawAuth.trim()
        if (expectedSuperToken && tokenSent && tokenSent === expectedSuperToken) {
          isSuperuser = true
        }
      } catch (_) {}
    }

    if (!authRecord && !isSuperuser) {
      return e.json(401, { message: 'Autenticação necessária.' })
    }

    let isAdmin = isSuperuser
    if (authRecord) {
      const perfil = authRecord.getString('perfil')
      if (perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas') {
        isAdmin = true
      }
    }

    if (!isAdmin) {
      return e.json(403, { message: 'Acesso negado. Apenas administradores podem criar backups.' })
    }
    // 2. Leitura Segura de Credenciais do R2 ($os.getenv / $secrets.get)
    let bucket = ''
    let endpoint = ''
    let accessKey = ''
    let secretKey = ''

    try {
      if (typeof $os !== 'undefined' && $os.getenv) {
        bucket = $os.getenv('BACKUP_S3_BUCKET') || ''
        endpoint = $os.getenv('BACKUP_S3_ENDPOINT') || ''
        accessKey = $os.getenv('BACKUP_S3_ACCESS_KEY_ID') || $os.getenv('BACKUP_S3_KEY') || ''
        secretKey =
          $os.getenv('BACKUP_S3_SECRET_ACCESS_KEY') || $os.getenv('BACKUP_S3_SECRET') || ''
      }
    } catch (_) {}

    if (!bucket || !endpoint || !accessKey || !secretKey) {
      try {
        if (typeof $secrets !== 'undefined' && $secrets.get) {
          if (!bucket) bucket = $secrets.get('BACKUP_S3_BUCKET') || ''
          if (!endpoint) endpoint = $secrets.get('BACKUP_S3_ENDPOINT') || ''
          if (!accessKey)
            accessKey =
              $secrets.get('BACKUP_S3_ACCESS_KEY_ID') || $secrets.get('BACKUP_S3_KEY') || ''
          if (!secretKey)
            secretKey =
              $secrets.get('BACKUP_S3_SECRET_ACCESS_KEY') || $secrets.get('BACKUP_S3_SECRET') || ''
        }
      } catch (_) {}
    }

    const faltantes = []
    if (!bucket) faltantes.push('BACKUP_S3_BUCKET')
    if (!endpoint) faltantes.push('BACKUP_S3_ENDPOINT')
    if (!accessKey) faltantes.push('BACKUP_S3_ACCESS_KEY_ID')
    if (!secretKey) faltantes.push('BACKUP_S3_SECRET_ACCESS_KEY')

    if (faltantes.length > 0) {
      return e.json(500, {
        success: false,
        message: 'Variáveis de ambiente do storage externo ausentes: ' + faltantes.join(', '),
      })
    }

    // 3. Gerar Dump Estruturado de Todas as 23 Coleções
    const agora = new Date()
    const timestampIso = agora.toISOString()

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
      }
    }

    const dataFormatada = agora.toISOString().replace(/[-:T]/g, '').slice(0, 15)
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

    // 4. Funções Criptográficas SigV4
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

    const dateStamp = timestampIso.slice(0, 10).replace(/-/g, '')
    const amzDate = timestampIso.replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'

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

    const targetUrl = 'https://' + host + objectPath
    console.log(
      `[BACKUP-CREATE] Enviando dump para Cloudflare R2: ${nomeArquivo} (Tamanho: ${tamanhoBytes} bytes)`,
    )

    let uploadOk = false
    let httpStatusUpload = 0

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
      httpStatusUpload = resPut.statusCode
      if (resPut.statusCode >= 200 && resPut.statusCode < 300) {
        uploadOk = true
        console.log(`[BACKUP-CREATE] SUCESSO: Dump enviado com HTTP ${resPut.statusCode}`)
      } else {
        console.error(`[BACKUP-CREATE] Falha no upload: HTTP ${resPut.statusCode}`)
      }
    } catch (errUpload) {
      return e.json(500, {
        success: false,
        message:
          'Erro na conexão com Cloudflare R2: ' +
          (errUpload && errUpload.message ? errUpload.message : errUpload),
      })
    }

    if (!uploadOk) {
      return e.json(502, {
        success: false,
        message: 'Cloudflare R2 recusou o upload com status HTTP ' + httpStatusUpload,
      })
    }

    // 5. Executar Rotação Efetiva (DeleteObject de arquivos > 30 dias)
    let rotacionados = 0
    try {
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

        for (let k = 0; k < keyMatches.length; k++) {
          const itemKey = keyMatches[k].replace('<Key>', '').replace('</Key>', '')
          const itemLastMod = lastModMatches[k]
            ? lastModMatches[k].replace('<LastModified>', '').replace('</LastModified>', '')
            : ''

          let dataObjetoMs = 0
          if (itemLastMod) {
            dataObjetoMs = new Date(itemLastMod).getTime()
          } else {
            const parts = itemKey.match(/backup-(\d{4}-\d{2}-\d{2})/)
            if (parts && parts[1]) {
              dataObjetoMs = new Date(parts[1]).getTime()
            }
          }

          if (dataObjetoMs > 0 && agoraMs - dataObjetoMs > limiteRetencaoMs) {
            const delPath = '/' + bucket + '/' + itemKey
            const delAmzDate =
              new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
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
              rotacionados++
            }
          }
        }
      }
    } catch (errRot) {
      console.warn(
        '[BACKUP-CREATE] Aviso durante rotação:',
        errRot && errRot.message ? errRot.message : errRot,
      )
    }

    return e.json(200, {
      success: true,
      mensagem: 'Backup criado com sucesso e despachado para Cloudflare R2.',
      arquivo: nomeArquivo,
      bucket: bucket,
      tamanhoBytes: tamanhoBytes,
      totalColecoes: colecoesAlvo.length,
      totalRegistros: totalRegistros,
      contagens: contagens,
      itensRotacionados: rotacionados,
      timestamp: timestampIso,
    })
  },
  $apis.requireAuth(),
)
