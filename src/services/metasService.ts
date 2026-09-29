/**
 * metasService.ts
 * Camada de dados do Skip Cloud (PocketBase) para o módulo de Metas e MetaParticipantes.
 *
 * ESCOPO DESTA RODADA:
 * - Estrutura receptiva de dados, tela e lógica.
 * - O campo "valor_atingido" é mantido e preenchido manualmente pelo CEO por enquanto.
 * - NOTA PARA INTEGRAÇÃO FUTURA COM O BLING:
 *   [INTEGRAÇÃO BLING]: A integração com o Bling (puxar vendas atendidas + em aberto)
 *   injetará periodicamente o valor calculado das vendas faturadas no campo `valor_atingido`
 *   e atualizará `fonte_atingido` para "bling".
 */

import pb from '@/lib/pocketbase/client'
import type { MetaModel, MetaParticipanteModel } from '@/types/clientes'

export interface MetaComParticipantes extends MetaModel {
  participantes: MetaParticipanteModel[]
}

export interface SalvarMetaParams {
  ano: number
  mes: number
  meta_geral: number
  valor_atingido?: number
  fonte_atingido?: 'manual' | 'bling'
  criado_por?: string
  participantes: Array<{
    id?: string
    usuario_id: string
    valor_individual: number
    percentual: number
  }>
}

/**
 * Busca a meta do mês e ano selecionados com seus participantes expandidos.
 */
export async function buscarMetaPorMesAno(
  mes: number,
  ano: number,
): Promise<MetaComParticipantes | null> {
  try {
    const metaRecord = await pb
      .collection('metas')
      .getFirstListItem<MetaModel>(`mes = ${mes} && ano = ${ano}`, {
        expand: 'criado_por',
        requestKey: null,
      })

    // Buscar participantes da meta
    const participantes = await pb
      .collection('meta_participantes')
      .getFullList<MetaParticipanteModel>({
        filter: `meta_id = '${metaRecord.id}'`,
        expand: 'usuario_id',
        sort: '-valor_individual',
        requestKey: null,
      })

    return {
      ...metaRecord,
      participantes,
    }
  } catch (err: unknown) {
    // Se não encontrou registro, retorna null
    const errObj = err as { status?: number }
    if (errObj?.status === 404) {
      return null
    }
    // Erro de acesso/RLS ou rede
    throw err
  }
}

/**
 * Busca todas as metas de um determinado ano para compor a visão anual de 12 meses.
 */
export async function buscarMetasDoAno(ano: number): Promise<MetaModel[]> {
  try {
    const records = await pb.collection('metas').getFullList<MetaModel>({
      filter: `ano = ${ano}`,
      sort: 'mes',
      expand: 'criado_por',
      requestKey: null,
    })
    return records
  } catch {
    return []
  }
}

/**
 * Busca a contagem de participantes por meta do ano (útil para tabela da visão anual).
 */
export async function buscarParticipantesDoAno(
  metaIds: string[],
): Promise<MetaParticipanteModel[]> {
  if (!metaIds || metaIds.length === 0) return []
  try {
    const filterExp = metaIds.map((id) => `meta_id = '${id}'`).join(' || ')
    const records = await pb.collection('meta_participantes').getFullList<MetaParticipanteModel>({
      filter: filterExp,
      expand: 'usuario_id',
      requestKey: null,
    })
    return records
  } catch {
    return []
  }
}

/**
 * Cria ou atualiza a meta do mês e seus participantes de forma atômica/sincronizada.
 * Apenas o CEO tem permissão de escrita pelas regras do PocketBase.
 */
export async function salvarMetaComParticipantes(
  params: SalvarMetaParams,
  metaIdExistente?: string,
): Promise<MetaComParticipantes> {
  let metaRecord: MetaModel

  const payloadMeta = {
    ano: params.ano,
    mes: params.mes,
    meta_geral: Number(params.meta_geral) || 0,
    valor_atingido: Number(params.valor_atingido) || 0,
    fonte_atingido: params.fonte_atingido || 'manual',
    ...(params.criado_por ? { criado_por: params.criado_por } : {}),
  }

  if (metaIdExistente) {
    metaRecord = await pb.collection('metas').update<MetaModel>(metaIdExistente, payloadMeta, {
      expand: 'criado_por',
      requestKey: null,
    })
  } else {
    // Verifica se já existe por mes/ano antes de criar
    try {
      const existente = await pb
        .collection('metas')
        .getFirstListItem<MetaModel>(`mes = ${params.mes} && ano = ${params.ano}`, {
          requestKey: null,
        })
      metaRecord = await pb.collection('metas').update<MetaModel>(existente.id, payloadMeta, {
        expand: 'criado_por',
        requestKey: null,
      })
    } catch {
      metaRecord = await pb.collection('metas').create<MetaModel>(payloadMeta, {
        expand: 'criado_por',
        requestKey: null,
      })
    }
  }

  // Sincronizar participantes:
  // 1. Buscar participantes atuais no banco
  const participantesAtuais = await pb
    .collection('meta_participantes')
    .getFullList<MetaParticipanteModel>({
      filter: `meta_id = '${metaRecord.id}'`,
      requestKey: null,
    })

  const usuarioIdsDesejados = new Set(params.participantes.map((p) => p.usuario_id))

  // 2. Remover os que saíram
  for (const atual of participantesAtuais) {
    if (!usuarioIdsDesejados.has(atual.usuario_id)) {
      await pb.collection('meta_participantes').delete(atual.id, { requestKey: null })
    }
  }

  // 3. Atualizar ou criar os participantes desejados
  const participantesSalvos: MetaParticipanteModel[] = []
  for (const part of params.participantes) {
    const existente = participantesAtuais.find((p) => p.usuario_id === part.usuario_id)
    const partPayload = {
      meta_id: metaRecord.id,
      usuario_id: part.usuario_id,
      valor_individual: Number(part.valor_individual) || 0,
      percentual: Number(part.percentual) || 0,
    }

    if (existente) {
      const atualizado = await pb
        .collection('meta_participantes')
        .update<MetaParticipanteModel>(existente.id, partPayload, {
          expand: 'usuario_id',
          requestKey: null,
        })
      participantesSalvos.push(atualizado)
    } else {
      const criado = await pb
        .collection('meta_participantes')
        .create<MetaParticipanteModel>(partPayload, {
          expand: 'usuario_id',
          requestKey: null,
        })
      participantesSalvos.push(criado)
    }
  }

  return {
    ...metaRecord,
    participantes: participantesSalvos,
  }
}

/**
 * Atualiza apenas o valor atingido e a fonte (ex: CEO atualizando atingido no card).
 * NOTA: quando a integração com o Bling for conectada, ela chamará uma rota ou atualizará
 * diretamente o registro de metas com fonte_atingido = "bling".
 */
export async function atualizarValorAtingido(
  metaId: string,
  valorAtingido: number,
  fonte: 'manual' | 'bling' = 'manual',
): Promise<MetaModel> {
  return pb.collection('metas').update<MetaModel>(
    metaId,
    {
      valor_atingido: Number(valorAtingido) || 0,
      fonte_atingido: fonte,
    },
    { requestKey: null },
  )
}
