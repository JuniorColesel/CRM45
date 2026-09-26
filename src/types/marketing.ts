import type { RecordModel } from 'pocketbase'
import type { Usuario } from '@/contexts/AuthContext'
import type { CanalMarketingModel, ClienteModel } from './clientes'

export type TipoCampanha = 'email' | 'whatsapp' | 'sms' | 'mista'
export type StatusCampanha = 'rascunho' | 'ativa' | 'pausada' | 'finalizada'

export interface PublicoAlvoFiltros {
  cidade?: string
  grande_cliente?: boolean
  etapa_funil?: string
  tags?: string[]
  [key: string]: unknown
}

export interface CampanhaModel extends RecordModel {
  nome: string
  descricao?: string
  tipo: TipoCampanha
  canal_id: string
  responsavel_id: string
  data_inicio?: string
  data_fim?: string
  status: StatusCampanha
  publico_alvo?: PublicoAlvoFiltros | string | null
  orcamento?: number
  criado_em?: string
  atualizado_em?: string
  expand?: {
    canal_id?: CanalMarketingModel
    responsavel_id?: Usuario
  }
}

export type TipoConteudoGerado = 'texto' | 'imagem' | 'video' | 'audio'
export type StatusConteudoGerado = 'gerado' | 'aprovado' | 'rejeitado'

export interface ConteudoGeradoModel extends RecordModel {
  campanha_id: string
  tipo: TipoConteudoGerado
  conteudo: string
  prompt_ia?: string
  status: StatusConteudoGerado
  criado_em?: string
  expand?: {
    campanha_id?: CampanhaModel
  }
}

export type CanalPublicacao = 'whatsapp' | 'email' | 'sms'
export type StatusPublicacao = 'agendada' | 'enviada' | 'entregue' | 'lida' | 'falhou'

export interface PublicacaoModel extends RecordModel {
  campanha_id: string
  cliente_id: string
  conteudo_id: string
  canal: CanalPublicacao
  status: StatusPublicacao
  data_agendada: string
  data_envio?: string
  criado_em?: string
  expand?: {
    campanha_id?: CampanhaModel
    cliente_id?: ClienteModel
    conteudo_id?: ConteudoGeradoModel
  }
}

export type StatusAprovacao = 'pendente' | 'aprovado' | 'rejeitado'

export interface AprovacaoPendenteModel extends RecordModel {
  conteudo_id: string
  aprovador_id: string
  status: StatusAprovacao
  comentario?: string
  criado_em?: string
  decidido_em?: string
  expand?: {
    conteudo_id?: ConteudoGeradoModel & {
      expand?: {
        campanha_id?: CampanhaModel
      }
    }
    aprovador_id?: Usuario
  }
}

/**
 * Regras de permissão para Campanhas:
 * - ceo_financeiro: gerencia tudo (criar, editar, pausar/ativar, excluir)
 * - coordenador_vendas: gerencia apenas as próprias (responsavel_id === user.id)
 * - vendedor_1 / vendedor_2: apenas leitura (não criam, não editam, não excluem)
 * - compras_grandes_clientes: apenas leitura
 * - estoque: sem acesso
 */
export function podeCriarCampanha(user: Usuario | null): boolean {
  if (!user) return false
  return user.perfil === 'ceo_financeiro' || user.perfil === 'coordenador_vendas'
}

export function podeGerenciarCampanha(user: Usuario | null, campanha: CampanhaModel): boolean {
  if (!user) return false
  if (user.perfil === 'ceo_financeiro') return true
  if (user.perfil === 'coordenador_vendas') {
    return campanha.responsavel_id === user.id
  }
  return false
}

export function podeCriarConteudo(user: Usuario | null, campanha: CampanhaModel): boolean {
  if (!user) return false
  if (user.perfil === 'ceo_financeiro') return true
  if (user.perfil === 'coordenador_vendas') {
    return campanha.responsavel_id === user.id
  }
  if (user.perfil === 'vendedor_1' || user.perfil === 'vendedor_2') {
    return campanha.status === 'ativa'
  }
  return false
}

export function podeGerenciarConteudo(user: Usuario | null, campanha: CampanhaModel): boolean {
  if (!user) return false
  if (user.perfil === 'ceo_financeiro') return true
  if (user.perfil === 'coordenador_vendas') {
    return campanha.responsavel_id === user.id
  }
  // Vendedores só podem gerenciar conteúdos de campanhas próprias ou que criaram
  return false
}

export function podeCriarPublicacao(user: Usuario | null, campanha: CampanhaModel): boolean {
  if (!user) return false
  if (user.perfil === 'ceo_financeiro') return true
  if (user.perfil === 'coordenador_vendas') {
    return campanha.responsavel_id === user.id
  }
  if (user.perfil === 'vendedor_1' || user.perfil === 'vendedor_2') {
    return campanha.status === 'ativa'
  }
  return false
}

export function podeGerenciarPublicacao(user: Usuario | null, campanha: CampanhaModel): boolean {
  if (!user) return false
  if (user.perfil === 'ceo_financeiro') return true
  if (user.perfil === 'coordenador_vendas') {
    return campanha.responsavel_id === user.id
  }
  return false
}

export function podeAprovarConteudo(
  user: Usuario | null,
  aprovacao: AprovacaoPendenteModel,
): boolean {
  if (!user) return false
  if (user.perfil === 'ceo_financeiro') return true
  if (user.perfil === 'coordenador_vendas') {
    return aprovacao.aprovador_id === user.id
  }
  return false
}
