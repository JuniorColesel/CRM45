export interface ProcedimentoOperacionalPadrao {
  id: string
  codigo: string
  titulo: string
  perfilAplicavel: string
  perfisValidos: ('todos' | 'ceo' | 'coordenador' | 'vendedor' | 'compras' | 'estoque')[]
  descricaoCurta: string
  itens: string[]
  ultimaAtualizacao: string
  versao: string
}

export interface SlideTreinamento {
  numero: number
  titulo: string
  conteudo: string
}

export const LISTA_POPS: ProcedimentoOperacionalPadrao[] = [
  {
    id: 'pop-001',
    codigo: 'POP-001',
    titulo: 'Primeiro Acesso ao Sistema',
    perfilAplicavel: 'Todos',
    perfisValidos: ['todos', 'ceo', 'coordenador', 'vendedor', 'compras', 'estoque'],
    descricaoCurta: 'como funciona o primeiro acesso',
    itens: [
      'Ao receber o acesso, você receberá um e-mail com login e senha temporária',
      'No primeiro login, você será direcionado ao treinamento obrigatório',
      'Após concluir o treinamento, terá acesso completo ao sistema',
      'Em caso de esquecimento de senha, solicite ao administrador',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-002',
    codigo: 'POP-002',
    titulo: 'Navegação pelo Menu',
    perfilAplicavel: 'Todos',
    perfisValidos: ['todos', 'ceo', 'coordenador', 'vendedor', 'compras', 'estoque'],
    descricaoCurta: 'estrutura do menu lateral e comandos de navegação',
    itens: [
      'O menu lateral contém: Painel, Funil, Follow-up, Clientes, Relatórios, Automações, Configurações, POP & Treinamento',
      'Clique em qualquer item para acessar o módulo',
      'O botão "Voltar" retorna à tela anterior',
      'O ícone de perfil no canto superior direito mostra seu nome e permite logout',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-003',
    codigo: 'POP-003',
    titulo: 'Gestão de Clientes',
    perfilAplicavel: 'Vendedor, Coordenador, CEO',
    perfisValidos: ['vendedor', 'coordenador', 'ceo'],
    descricaoCurta: 'localização, cadastro e histórico da carteira de clientes',
    itens: [
      'Acesse "Clientes" no menu',
      'Use os filtros (nome, cidade, grande cliente) para localizar registros',
      'Clique em um cliente para ver detalhes e histórico',
      'Para editar, clique no ícone de lápis',
      'Para adicionar novo cliente, clique em "Novo cliente" e preencha os campos obrigatórios (nome, telefone ou email)',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-004',
    codigo: 'POP-004',
    titulo: 'Movimentação de Oportunidades no Funil',
    perfilAplicavel: 'Vendedor, Coordenador, CEO',
    perfisValidos: ['vendedor', 'coordenador', 'ceo'],
    descricaoCurta: 'avanço de etapas comerciais e registro de fechamento',
    itens: [
      'Acesse "Funil" no menu',
      'As oportunidades são agrupadas por etapa: Prospecção, Qualificação, Proposta, Negociação, Ganha, Perdida',
      'Para mover uma oportunidade, arraste o card para a nova etapa ou clique no card e altere a etapa no formulário',
      'Ao mover para "Ganha" ou "Perdida", a data de fechamento é registrada automaticamente',
      'Ao voltar para uma etapa aberta, a data de fechamento é limpa',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-005',
    codigo: 'POP-005',
    titulo: 'Registro de Follow-up',
    perfilAplicavel: 'Vendedor, Coordenador',
    perfisValidos: ['vendedor', 'coordenador'],
    descricaoCurta: 'rotina de contatos, tarefas e alertas de inatividade',
    itens: [
      'Acesse "Follow-up" no menu',
      'A tela mostra 4 grupos: Ligações pendentes, Tarefas pendentes, Clientes sem contato há 7+ dias, Oportunidades paradas há 5+ dias',
      'Para registrar uma ligação: clique em "Nova ligação", selecione o cliente, tipo (entrada/saída/perdida), data/hora e observações',
      'Para criar tarefa: clique em "Nova tarefa", defina título, descrição, data de vencimento e prioridade',
      'Marque como concluído clicando no checkbox',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-006',
    codigo: 'POP-006',
    titulo: 'Visualização de Relatórios',
    perfilAplicavel: 'Todos',
    perfisValidos: ['todos', 'ceo', 'coordenador', 'vendedor', 'compras', 'estoque'],
    descricaoCurta: 'acompanhamento de indicadores, gráficos e exportação de dados',
    itens: [
      'Acesse "Relatórios" no menu',
      'Use o seletor de período no topo (mês corrente é o padrão)',
      'A aba "Painel" mostra indicadores resumidos e gráficos',
      'As abas "Oportunidades", "Ligações", "Tarefas" e "Clientes" mostram relatórios detalhados com exportação CSV',
      'Para exportar: clique no botão "Exportar CSV" — o arquivo abre corretamente no Excel',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-007',
    codigo: 'POP-007',
    titulo: 'Importação de Dados do Bling',
    perfilAplicavel: 'CEO, Coordenador',
    perfisValidos: ['ceo', 'coordenador'],
    descricaoCurta: 'carga e mapeamento de planilhas de contatos e pedidos do ERP',
    itens: [
      'Acesse "Configurações" → "Importar dados do Bling"',
      'No Bling: Cadastros → Contatos → Exportar planilha (clientes) ou Vendas → Pedidos → Exportar (compras)',
      'Na tela de importação: clique em "Selecionar arquivo" e escolha o CSV',
      'O sistema detecta automaticamente as colunas; revise o mapeamento se necessário',
      'Campos obrigatórios não mapeados ficam em vermelho — associe antes de importar',
      'Clique em "Importar" e aguarde o resultado (X criados, Y atualizados, Z erros)',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-008',
    codigo: 'POP-008',
    titulo: 'Gestão de Usuários',
    perfilAplicavel: 'CEO',
    perfisValidos: ['ceo'],
    descricaoCurta: 'criação, permissões, senhas e controle de acessos da equipe',
    itens: [
      'Acesse "Configurações" → "Gestão de Usuários"',
      'Clique em "Novo usuário" e preencha: nome, email, perfil, ativo',
      'A senha é gerada automaticamente e exibida UMA VEZ no modal de criação — copie e envie ao colaborador',
      'Para editar: clique no ícone de lápis',
      'Para desativar: clique no toggle "Ativo"',
      'Para excluir: clique no ícone de lixeira (ação irreversível)',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-009',
    codigo: 'POP-009',
    titulo: 'Definição de Metas',
    perfilAplicavel: 'CEO, Coordenador',
    perfisValidos: ['ceo', 'coordenador'],
    descricaoCurta: 'estabelecimento de metas de faturamento, oportunidades e contatos',
    itens: [
      'Acesse "Configurações" → "Metas do Time"',
      'Selecione o mês e o vendedor',
      'Defina: valor meta (R$), oportunidades esperadas, ligações esperadas',
      'Clique em "Salvar"',
      'O vendedor vê apenas a própria meta (somente leitura)',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
  {
    id: 'pop-010',
    codigo: 'POP-010',
    titulo: 'Configuração de Integrações',
    perfilAplicavel: 'CEO, Coordenador',
    perfisValidos: ['ceo', 'coordenador'],
    descricaoCurta: 'conexão com Bling, WhatsApp Meta, SMTP e gateways',
    itens: [
      'Acesse "Configurações" → "Integrações"',
      'Bling: insira o token da API (obtido em Ajuda do Bling)',
      'WhatsApp/Meta: insira token, número e provedor (Zenvia, Twilio, 360dialog, Infobip)',
      'E-mail/SMS: configure servidor SMTP e gateway SMS',
      'Clique em "Salvar" em cada seção',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '1.0',
  },
]

export const SLIDES_TREINAMENTO: SlideTreinamento[] = [
  {
    numero: 1,
    titulo: 'Bem-vindo ao Colesel CRM',
    conteudo:
      'Este treinamento apresenta as funcionalidades essenciais do sistema. Duração: 10 minutos. Ao final, você terá acesso completo.',
  },
  {
    numero: 2,
    titulo: 'Visão geral',
    conteudo:
      'O Colesel CRM é um sistema de gestão de relacionamento com clientes que centraliza: carteira de clientes, funil de vendas, follow-up de ligações e tarefas, relatórios e metas.',
  },
  {
    numero: 3,
    titulo: 'Menu lateral',
    conteudo:
      "O menu lateral dá acesso a todos os módulos. Clique em qualquer item para navegar. O botão 'Voltar' retorna à tela anterior.",
  },
  {
    numero: 4,
    titulo: 'Gestão de clientes',
    conteudo:
      "Em 'Clientes' você visualiza, filtra, cria e edita registros. Campos obrigatórios: nome e (telefone ou email). Use os filtros para localizar rapidamente.",
  },
  {
    numero: 5,
    titulo: 'Oportunidades',
    conteudo:
      "Em 'Funil' você move oportunidades entre etapas: Prospecção → Qualificação → Proposta → Negociação → Ganha/Perdida. A data de fechamento é registrada automaticamente.",
  },
  {
    numero: 6,
    titulo: 'Ligações e tarefas',
    conteudo:
      "Em 'Follow-up' você registra ligações (entrada/saída/perdida) e cria tarefas com vencimento. A tela mostra alertas de clientes sem contato e oportunidades paradas.",
  },
  {
    numero: 7,
    titulo: 'Indicadores e exportação',
    conteudo:
      "Em 'Relatórios' você visualiza o painel com gráficos e exporta dados em CSV. Use o seletor de período para filtrar.",
  },
  {
    numero: 8,
    titulo: 'Integração com ERP',
    conteudo:
      "Em 'Configurações → Importar dados do Bling' você sobe CSVs de clientes e compras. O sistema detecta colunas automaticamente e trata duplicatas.",
  },
  {
    numero: 9,
    titulo: 'Acompanhamento de metas',
    conteudo:
      "Em 'Configurações → Metas do Time' o gestor define valores e oportunidades esperadas. O vendedor vê apenas a própria meta.",
  },
  {
    numero: 10,
    titulo: 'Treinamento concluído',
    conteudo:
      "Parabéns! Você concluiu o treinamento. Clique em 'Concluir treinamento' para acessar o sistema.",
  },
]

/**
 * Função utilitária para abrir versão limpa e formatada do POP para impressão em nova aba.
 */
export function imprimirPop(pop: ProcedimentoOperacionalPadrao) {
  const janela = window.open('', '_blank', 'width=800,height=900')
  if (!janela) {
    window.print()
    return
  }

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${pop.codigo} - ${pop.titulo} | Colesel 45</title>
  <style>
    @media print {
      body { margin: 0; padding: 20mm; font-size: 12pt; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background: #ffffff;
      margin: 40px auto;
      max-width: 760px;
      padding: 0 24px;
      line-height: 1.6;
    }
    .header {
      border-bottom: 2px solid #16A34A;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .title-group h1 {
      margin: 0 0 6px 0;
      font-size: 22px;
      color: #0F172A;
    }
    .code {
      display: inline-block;
      background: #DCFCE7;
      color: #166534;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .meta-box {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      font-size: 13px;
    }
    .meta-box strong {
      color: #334155;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      background: #EEF2FF;
      color: #4338CA;
      font-weight: 600;
    }
    h2 {
      font-size: 16px;
      color: #0F172A;
      border-left: 4px solid #16A34A;
      padding-left: 10px;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    ol {
      margin: 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 10px;
      color: #1E293B;
      font-size: 14px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #E2E8F0;
      font-size: 11px;
      color: #64748B;
      display: flex;
      justify-content: space-between;
    }
    .actions {
      margin-bottom: 20px;
      text-align: right;
    }
    .btn-print {
      background: #16A34A;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-print:hover {
      background: #15803D;
    }
  </style>
</head>
<body>
  <div class="actions no-print">
    <button class="btn-print" onclick="window.print()">Imprimir Agora</button>
  </div>

  <div class="header">
    <div class="title-group">
      <span class="code">${pop.codigo}</span>
      <h1>${pop.titulo}</h1>
      <div style="font-size: 13px; color: #64748B;">Procedimento Operacional Padrão — CRM Colesel 45</div>
    </div>
    <div style="text-align: right;">
      <strong style="color: #16A34A; font-size: 18px; display: block;">Colesel 45</strong>
      <span style="font-size: 12px; color: #64748B;">Versão ${pop.versao}</span>
    </div>
  </div>

  <div class="meta-box">
    <div><strong>Perfil Aplicável:</strong> <span class="badge">${pop.perfilAplicavel}</span></div>
    <div><strong>Última Atualização:</strong> ${pop.ultimaAtualizacao}</div>
    <div style="grid-column: span 2;"><strong>Descrição Curta:</strong> ${pop.descricaoCurta}</div>
  </div>

  <h2>Procedimento Passo a Passo</h2>
  <ol>
    ${pop.itens.map((item) => `<li>${item}</li>`).join('')}
  </ol>

  <div class="footer">
    <span>Colesel 45 — CRM Comercial & Gestão Integrada</span>
    <span>Documento de Consulta Interna • ${pop.codigo}</span>
  </div>

  <script>
    window.onload = function() {
      // Pequeno timeout para garantir renderização antes de disparar o print
      setTimeout(function() {
        window.print();
      }, 350);
    };
  </script>
</body>
</html>
`
  janela.document.open()
  janela.document.write(html)
  janela.document.close()
}
