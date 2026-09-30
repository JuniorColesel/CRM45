migrate(
  (app) => {
    // Ler diretamente do backup_logs
    let audit = null
    try {
      const bLogs = app.findRecordsByFilter('backup_logs', 'tipo = "manual"', '-created', 1, 0)
      if (bLogs && bLogs.length > 0) {
        const rawDet = bLogs[0].getString('detalhes')
        if (rawDet) {
          audit = JSON.parse(rawDet)
        }
      }
    } catch (errParse) {
      console.log('Erro ao ler backup_logs: ' + errParse)
    }

    // Criar uma representação ultra limpa em texto markdown
    let md = '# AUDITORIA V0.0.76 - CRM COLESEL 45\n\n'

    if (audit) {
      md += '## 1. TOTAIS E UNICIDADE\n'
      md += '- Total registros: ' + audit.totais.total + '\n'
      md += '- Total IDs distintos: ' + audit.totais.total_distintos + '\n'
      md += '- Duplicados: ' + audit.totais.duplicados + '\n'
      md += '- Visivel funil = true: ' + audit.totais.visivel_true + '\n'
      md += '- Visivel funil = false: ' + audit.totais.visivel_false + '\n'
      md += '- Vinculados: ' + audit.totais.vinculados + '\n'
      md += '- Pendentes: ' + audit.totais.pendentes + '\n'
      md += '- Sem cliente: ' + audit.totais.sem_cliente + '\n'
      md += '- Com situacao_bling_id: ' + audit.totais.com_sit_id + '\n'
      md += '- Com contato_nome: ' + audit.totais.com_contato_nome + '\n'
      md += '- Com documento: ' + audit.totais.com_documento + '\n'
      md += '- Com vendedor_bling: ' + audit.totais.com_vendedor_bling + '\n\n'

      md += '## 2. DISTRIBUICAO SITUACOES (RAW)\n'
      md += 'Chave (sit_id || sit_nome || status_norm || visivel) => Qtd\n'
      for (const k in audit.dist_situacoes) {
        md += k + ' => ' + audit.dist_situacoes[k] + '\n'
      }
      md += '\n'

      md += '## 3. DISTRIBUICAO STATUS NORMALIZADO\n'
      for (const k in audit.dist_status) {
        md += k + ': ' + audit.dist_status[k] + '\n'
      }
      md += '\n'

      md += '## 4. DISTRIBUICAO VENDEDOR\n'
      for (const k in audit.dist_vendedor) {
        md += k + ': ' + audit.dist_vendedor[k] + '\n'
      }
      md += '\n'

      md += '## 5. PENDENTES DETALHADOS\n'
      for (let p = 0; p < audit.pendentes_det.length; p++) {
        const it = audit.pendentes_det[p]
        md +=
          'PropID:' +
          it.bling_proposta_id +
          ' | Num:' +
          it.numero +
          ' | ContatoID:' +
          it.bling_contato_id +
          ' | Nome:' +
          it.contato_nome +
          ' | Doc:' +
          it.documento +
          ' | Sit:' +
          it.situacao_bling_nome +
          ' | StNorm:' +
          it.status_normalizado +
          ' | Vis:' +
          it.visivel_funil +
          ' | Val:' +
          it.valor_total +
          '\n'
      }
      md += '\n'

      md += '## 6. CHECAGEM DOS CONTATOS PENDENTES EM CLIENTES\n'
      for (let c = 0; c < audit.pendentes_checagem_contatos.length; c++) {
        const it = audit.pendentes_checagem_contatos[c]
        md +=
          'PropID:' +
          it.proposta_id +
          ' | ContatoBlingID:' +
          it.bling_contato_id +
          ' | ClienteID:' +
          it.cliente_encontrado_por_bling_id +
          ' | ClienteNome:' +
          it.cliente_nome +
          '\n'
      }
      md += '\n'

      md += '## 7. AVISOS E STATUS NAO MAPEADOS\n'
      md += 'Total Avisos Array: ' + audit.categorizacao_avisos.total_avisos_array + '\n'
      md +=
        'Avisos Unicidade Nome Empresa: ' + audit.categorizacao_avisos.unicidade_nome_empresa + '\n'
      md +=
        'Avisos Situacao Proposta Nao Mapeada: ' +
        audit.categorizacao_avisos.situacao_proposta_nao_mapeada +
        '\n'
      md += 'Outros Avisos: ' + audit.categorizacao_avisos.outros_avisos + '\n'
      md += 'Status Nao Mapeados Contador Log: ' + audit.log_status_nao_mapeados + '\n'
      if (
        audit.categorizacao_avisos.amostras_outros &&
        audit.categorizacao_avisos.amostras_outros.length > 0
      ) {
        md += 'Amostras outros avisos:\n'
        for (let o = 0; o < audit.categorizacao_avisos.amostras_outros.length; o++) {
          md += '- ' + audit.categorizacao_avisos.amostras_outros[o] + '\n'
        }
      }
      md += '\n'

      md += '## 8. AMOSTRAS POR SITUACAO\n'
      for (const sit in audit.amostras) {
        const amostras = audit.amostras[sit]
        md += '### ' + sit + ' (' + amostras.length + ' amostras)\n'
        for (let a = 0; a < amostras.length; a++) {
          const am = amostras[a]
          md +=
            'PropID:' +
            am.bling_proposta_id +
            ' | Num:' +
            am.numero +
            ' | Data:' +
            am.data_proposta +
            ' | Val:' +
            am.valor_total +
            ' | SitID:' +
            am.situacao_bling_id +
            ' | SitNome:' +
            am.situacao_bling_nome +
            ' | StNorm:' +
            am.status_normalizado +
            ' | Vis:' +
            am.visivel_funil +
            ' | VendBling:' +
            am.vendedor_bling +
            ' | VendCrm:' +
            am.vendedor_crm +
            ' | CliID:' +
            am.cliente_id +
            '\n'
        }
      }
    }

    // Gravar no campo ia_prompt_sistema da coleção integracoes_config
    try {
      const cfg = app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (cfg && cfg.length > 0) {
        cfg[0].set('ia_prompt_sistema', md)
        app.save(cfg[0])
      }
    } catch (errCfg) {
      console.log('Erro ao salvar em integracoes_config: ' + errCfg)
    }
  },
  (app) => {},
)
