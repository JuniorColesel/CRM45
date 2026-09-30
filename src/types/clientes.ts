import type { RecordModel } from 'pocketbase'
import type { PerfilUsuario, Usuario } from '@/contexts/AuthContext'

export type VendedorCliente = 'Alice' | 'Renan' | 'Karoline (Vendas 1)' | 'Vendas 2'
export type TipoContatoCliente = 'cliente' | 'fornecedor' | 'ambos'
export type StatusCliente = 'ativo' | 'para_reativacao'
export type GrandeClienteFlag = 'sim' | 'nao'

export interface ClienteModel extends RecordModel {
  bling_id?: string
  nome_empresa: string
  nome_contato?: string
  cnpj_cpf?: string
  telefone?: string
  email?: string
  cidade?: string
  estado?: string
  data_ultima_compra?: string
  data_primeira_compra?: string
  valor_total_compras?: number
  valor_total_vendas?: number
  grande_cliente?: GrandeClienteFlag | boolean | string
  tipo_contato?: TipoContatoCliente
  vendedor?: VendedorCliente | string
  status_cliente?: StatusCliente
  // Compatibilidade com campos legados
  data_nascimento?: string
  observacoes?: string
  aceita_mensagens?: boolean
  responsavel_id?: string
  status?: string
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

export type FonteAtingidoMeta = 'manual' | 'bling'

export interface MetaModel extends RecordModel {
  mes: number
  ano: number
  meta_geral: number
  valor_atingido: number
  fonte_atingido: FonteAtingidoMeta | string
  criado_por?: string
  expand?: {
    criado_por?: Usuario
    // Compatibilidade opcional
    usuario_id?: Usuario
  }
  // Campos de compatibilidade com interfaces legadas
  usuario_id?: string
  valor_meta?: number
  meta_oportunidades?: number
}

export interface MetaParticipanteModel extends RecordModel {
  meta_id: string
  usuario_id: string
  valor_individual: number
  percentual: number
  expand?: {
    usuario_id?: Usuario
    meta_id?: MetaModel
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
 * Determina se um usuário vendedor é o dono/responsável pelo cliente.
 * Checa tanto responsavel_id (id do usuário) quanto o campo textual vendedor
 * (ex: vendedor_1 -> 'Karoline (Vendas 1)', vendedor_2 -> 'Vendas 2', ou nome/email correspondente).
 */
export function ehVendedorDoCliente(user: Usuario | null, cliente?: ClienteModel | null): boolean {
  if (!user || !cliente) return false
  if (cliente.responsavel_id && cliente.responsavel_id === user.id) return true
  const cv = (cliente.vendedor || '').trim().toLowerCase()
  if (!cv) return false
  if (user.perfil === 'vendedor_1' && (cv.includes('vendas 1') || cv.includes('karoline')))
    return true
  if (user.perfil === 'vendedor_2' && cv.includes('vendas 2')) return true
  if (user.nome && cv.includes(user.nome.toLowerCase().trim())) return true
  return false
}

/**
 * Regra de permissão para edição de clientes:
 * - ceo_financeiro e coordenador_vendas têm acesso irrestrito para gerenciar e editar qualquer cliente.
 * - perfil estoque não pode editar clientes.
 * - Vendedores (vendedor_1, vendedor_2 ou outros perfis comerciais) só podem editar clientes que lhes pertençam
 *   (responsavel_id igual ou vendedor atribuído a ele), ou clientes liberados com status "para_reativacao".
 * - Se o cliente pertencer a outro vendedor, a edição é bloqueada.
 */
export function podeEditarCliente(user: Usuario | null, cliente?: ClienteModel | null): boolean {
  if (!user) return false
  if (user.perfil === 'estoque') return false
  if (user.perfil === 'ceo_financeiro' || user.perfil === 'coordenador_vendas') return true
  // Se o cliente estiver para reativação, qualquer vendedor pode assumir / editar
  if (cliente && cliente.status_cliente === 'para_reativacao') return true
  // Vendedores só podem editar se o cliente for deles
  return ehVendedorDoCliente(user, cliente)
}

export function podeExcluirCliente(user: Usuario | null, cliente?: ClienteModel | null): boolean {
  if (!user) return false
  if (user.perfil === 'ceo_financeiro' || user.perfil === 'coordenador_vendas') return true
  return false
}

export function podeCriarCliente(user: Usuario | null): boolean {
  if (!user) return false
  return user.perfil === 'ceo_financeiro' || user.perfil === 'coordenador_vendas'
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

export type StatusVinculoBlingPedido = 'vinculado' | 'pendente' | 'sem_cliente'

export interface BlingPedidoModel extends RecordModel {
  bling_pedido_id: string
  numero?: string
  cliente_id?: string
  bling_contato_id?: string
  contato_nome?: string
  documento?: string
  vendedor_bling?: string
  vendedor_crm?: string
  responsavel_id?: string
  data_pedido?: string
  data_atendimento?: string
  valor_total?: number
  situacao_bling_id?: string
  situacao_bling_nome?: string
  status_normalizado?: string
  status_vinculo?: StatusVinculoBlingPedido
  oportunidade_id?: string
  sincronizado_em?: string
  expand?: {
    cliente_id?: ClienteModel
    responsavel_id?: Usuario
    oportunidade_id?: OportunidadeModel
  }
}
