import type { RecordModel } from 'pocketbase'

export interface ProdutoModel extends RecordModel {
  nome: string
  preco: number
  unidade: string
  disponibilidade?: boolean
  prazo_entrega?: string
  criado_em?: string
  atualizado_em?: string
}

export type IntencaoConversa = 'alta' | 'media' | 'baixa'
export type StatusConversa = 'aberta' | 'fechada'

export interface ConversaWhatsappModel extends RecordModel {
  cliente_id?: string
  numero: string
  provedor?: string
  status?: StatusConversa
  ultima_mensagem?: string
  ultima_intencao?: IntencaoConversa
  ultima_resposta_ia?: string
  criado_em?: string
  atualizado_em?: string
  expand?: {
    cliente_id?: {
      id: string
      nome_contato: string
      nome_empresa?: string
      telefone?: string
      status?: string
      responsavel_id?: string
      expand?: {
        responsavel_id?: {
          id: string
          nome: string
          email: string
          perfil: string
        }
      }
    }
  }
}

export interface MensagemWhatsappModel extends RecordModel {
  conversa_id: string
  direcao: 'entrada' | 'saida'
  texto: string
  intencao_detectada?: IntencaoConversa
  sugestao_ia?: string
  usada_ia?: boolean
  criado_em?: string
}

export interface SugestaoIaModel extends RecordModel {
  conversa_id: string
  mensagem_cliente?: string
  sugestao_gerada: string
  usada?: boolean
  editada?: boolean
  criado_em?: string
}

export interface AssistenteIaConfig {
  ativo: boolean
  permitirPreco: boolean
  tomDeVoz: 'profissional' | 'amigavel' | 'direto'
  promptSistema: string
}

export const PROMPT_IA_PADRAO = `Você é o assistente de vendas da Colesel (materiais de construção). Sua função é SUGERIR respostas para mensagens de clientes. O vendedor sempre revisa antes de enviar.

REGRAS OBRIGATÓRIAS:

1. RESPONDA DIRETO: se o cliente perguntou preço, prazo ou disponibilidade, responda isso primeiro, sem enrolação.

2. AGREGE 1 VALOR: após responder, acrescente UM ÚNICO diferencial relevante (garantia, entrega, durabilidade, aplicação, condição de pagamento). Nunca liste vários.

3. QUALIFIQUE OU AVANCE: faça UMA pergunta objetiva (área do telhado, quantidade, prazo da obra) OU proponha o próximo passo (orçamento, visita, proposta).

4. CHAMADA PARA AÇÃO: termine com uma ação clara e simples (ex: 'te mando o orçamento', 'posso agendar a entrega').

5. TAMANHO: máximo 3 frases curtas ou 2 parágrafos curtos. Proibido texto longo, saudação exagerada ou enrolação.

6. TOM: profissional, simpático e direto. Linguagem de vendedor para cliente. Sem jargão técnico excessivo.

7. CONTEXTO: use o histórico do cliente (nome, compras anteriores, oportunidade aberta) quando existir. Personalize para não parecer robô.

8. NUNCA INVENTE: não crie preço, prazo ou estoque. Se não tiver o dado, responda 'vou confirmar e já te retorno' e gere uma tarefa para o vendedor verificar.

9. FORMATE: saída em texto puro, pronto para enviar no WhatsApp (sem markdown, sem emojis em excesso — no máximo 1).`
