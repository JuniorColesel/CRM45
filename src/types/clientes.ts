import type { RecordModel } from 'pocketbase'
import type { PerfilUsuario, Usuario } from '@/contexts/AuthContext'

export interface ClienteModel extends RecordModel {
  nome_contato: string
  nome_empresa?: string
  telefone?: string
  cidade?: string
  email?: string
  cnpj_cpf?: string
  data_nascimento?: string
  observacoes?: string
  grande_cliente?: boolean
  aceita_mensagens?: boolean
  responsavel_id?: string
  data_ultima_compra?: string
  criado_em?: string
  atualizado_em?: string
  expand?: {
    responsavel_id?: Usuario
  }
}

export interface EtapaFunilModel extends RecordModel {
  nome: string
  ordem: number
  cor?: string
}

export interface MotivoPerdaModel extends RecordModel {
  descricao: string
}

export type StatusOportunidade = 'aberto' | 'ganho' | 'perdido'

export interface OportunidadeModel extends RecordModel {
  cliente_id: string
  valor: number
  etapa_id: string
  responsavel_id: string
  motivo_perda_id?: string
  data_prevista_fechamento?: string
  data_fechamento?: string
  status: StatusOportunidade
  observacoes?: string
  expand?: {
    etapa_id?: EtapaFunilModel
    responsavel_id?: Usuario
    cliente_id?: ClienteModel
    motivo_perda_id?: MotivoPerdaModel
  }
}

export type TipoTarefa = 'ligacao' | 'visita' | 'email' | 'whatsapp' | 'reuniao' | 'outro'

export interface MetaModel extends RecordModel {
  usuario_id: string
  ano: number
  mes: number
  valor_meta: number
  meta_oportunidades: number
  criado_em?: string
  atualizado_em?: string
  expand?: {
    usuario_id?: Usuario
  }
}

export interface TarefaModel extends RecordModel {
  cliente_id: string
  responsavel_id: string
  tipo: TipoTarefa
  descricao: string
  data_hora: string
  concluida?: boolean
  data_conclusao?: string
  expand?: {
    responsavel_id?: Usuario
    cliente_id?: ClienteModel
  }
}

export type TipoLigacao = 'entrada' | 'saida' | 'perdida'
export type ResultadoLigacao = 'atendeu' | 'nao_atendeu' | 'caixa_postal' | 'ocupado' | 'desligou'

export interface LigacaoModel extends RecordModel {
  cliente_id: string
  responsavel_id: string
  data_hora: string
  duracao_segundos?: number
  tipo: TipoLigacao
  resultado?: ResultadoLigacao
  observacoes?: string
  proxima_acao?: string
  data_proxima_acao?: string
  expand?: {
    responsavel_id?: Usuario
    cliente_id?: ClienteModel
  }
}

export type CanalMensagem = 'whatsapp' | 'email' | 'sms'
export type StatusMensagem = 'pendente' | 'enviada' | 'entregue' | 'lida' | 'falhou'

export interface CanalMarketingModel extends RecordModel {
  nome: string
  tipo: CanalMensagem
  configuracao?: Record<string, unknown> | string
  ativo: boolean
  criado_em?: string
}

export type GatilhoAutomacao =
  | 'novo_cliente'
  | 'nova_oportunidade'
  | 'mudanca_etapa'
  | 'tarefa_vencida'
  | 'sem_contato_dias'
  | 'aniversario'
  | 'inativo_dias'

export type AcaoAutomacao =
  | 'enviar_whatsapp'
  | 'enviar_email'
  | 'criar_tarefa'
  | 'mover_etapa'
  | 'enviar_sms'

export interface AutomacaoModel extends RecordModel {
  nome: string
  descricao?: string
  gatilho: GatilhoAutomacao
  parametro_gatilho?: string
  acao: AcaoAutomacao
  canal_id?: string
  mensagem_modelo?: string
  responsavel_id: string
  ativa: boolean
  criada_em?: string
  atualizada_em?: string
  expand?: {
    canal_id?: CanalMarketingModel
    responsavel_id?: Usuario
  }
}

export interface MensagemEnviadaModel extends RecordModel {
  automacao_id?: string
  cliente_id: string
  canal: CanalMensagem
  conteudo: string
  status: StatusMensagem
  data_envio?: string
  data_leitura?: string
  erro?: string
  expand?: {
    cliente_id?: ClienteModel
    automacao_id?: AutomacaoModel
  }
}

/**
 * Regra de permissão da RLS do PocketBase para edição/exclusão de clientes:
 * - ceo_financeiro pode editar/excluir qualquer um
 * - outros perfis (vendedores, etc.) só podem editar/excluir se forem o responsável (responsavel_id === user.id)
 */
export function podeEditarCliente(user: Usuario | null, cliente: ClienteModel): boolean {
  if (!user) return false
  if (user.perfil === 'estoque') return false
  if (user.perfil === 'ceo_financeiro') return true
  return cliente.responsavel_id === user.id
}

export function podeExcluirCliente(user: Usuario | null, cliente: ClienteModel): boolean {
  return podeEditarCliente(user, cliente)
}

/**
 * Regra de permissão da RLS do PocketBase para edição/exclusão de oportunidades:
 * - ceo_financeiro pode editar/excluir qualquer oportunidade
 * - outros perfis (vendedores, coordenador) só podem editar/excluir se forem o responsável (responsavel_id === user.id)
 */
export function podeEditarOportunidade(user: Usuario | null, op: OportunidadeModel): boolean {
  if (!user) return false
  if (user.perfil === 'estoque') return false
  if (user.perfil === 'ceo_financeiro') return true
  return op.responsavel_id === user.id
}

export function podeExcluirOportunidade(user: Usuario | null, op: OportunidadeModel): boolean {
  return podeEditarOportunidade(user, op)
}

/**
 * Formata moeda BRL (ex: R$ 1.500,00)
 */
export function formatarMoeda(valor?: number | null): string {
  if (valor === undefined || valor === null || isNaN(valor)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

/**
 * Formata data no padrão pt-BR (ex: 25/12/2025)
 */
export function formatarData(dataStr?: string | null): string {
  if (!dataStr) return '-'
  try {
    const d = new Date(dataStr)
    if (isNaN(d.getTime())) return '-'
    // Se a string contiver apenas YYYY-MM-DD, tratamos em UTC para evitar deslocamento de timezone
    if (dataStr.length === 10) {
      const [ano, mes, dia] = dataStr.split('-')
      return `${dia}/${mes}/${ano}`
    }
    return d.toLocaleDateString('pt-BR')
  } catch {
    return '-'
  }
}

/**
 * Formata data e hora no padrão pt-BR (ex: 25/12/2025 às 14:30)
 */
export function formatarDataHora(dataStr?: string | null): string {
  if (!dataStr) return '-'
  try {
    const d = new Date(dataStr)
    if (isNaN(d.getTime())) return '-'
    const dataFmt = d.toLocaleDateString('pt-BR')
    const horaFmt = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `${dataFmt} às ${horaFmt}`
  } catch {
    return '-'
  }
}

/**
 * Formata segundos em mm:ss
 */
export function formatarDuracao(segundos?: number | null): string {
  if (!segundos && segundos !== 0) return '-'
  const mins = Math.floor(segundos / 60)
  const secs = segundos % 60
  return `${mins}m ${secs.toString().padStart(2, '0')}s`
}
