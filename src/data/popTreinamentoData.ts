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
  modulo: string
  moduloNumero: 0 | 1 | 2 | 3 | 4 | 5 | 6
  titulo: string
  conteudo: string
  itensLista?: string[]
  tipoLista?: 'bullet' | 'ordered'
  fechamento?: string
  exemploPratico?: string
}

export interface QuizPergunta {
  id: number
  pergunta: string
  opcoes: { id: string; texto: string }[]
  respostaCorreta: string
  explicacao?: string
}

/**
 * QUIZ ATUALIZADO DO CRM COLESEL 45
 * Cobre as regras críticas mapeadas na auditoria:
 * 1. Travas de duplicidade de clientes (CNPJ e Nome da Empresa)
 * 2. Trava de edição de clientes entre vendedores e exceção de reativação
 * 3. Regra de prefill de data/horário (+1h) na criação de tarefas
 * 4. Regra de redistribuição proporcional na remoção de participantes em Metas
 * 5. Matriz de permissões por perfil (quem cria metas, quem importa dados, visualização de vendedor)
 * 6. Teste de backup e restore seguro (/admin/backup-test no Cloudflare R2)
 */
export const QUIZ_TREINAMENTO: QuizPergunta[] = [
  {
    id: 1,
    pergunta:
      'O que o sistema exibe e faz ao tentar cadastrar um cliente com CNPJ ou Nome de Empresa já existente na base?',
    opcoes: [
      { id: 'a', texto: 'Sobrescreve o cliente antigo sem avisar.' },
      {
        id: 'b',
        texto:
          'Bloqueia o salvamento e exibe o toast de alerta: "Já existe um cliente cadastrado com esse CNPJ/nome."',
      },
      { id: 'c', texto: 'Permite criar normalmente gerando um sufixo numérico no final.' },
      { id: 'd', texto: 'Apaga os dois registros e solicita intervenção do suporte técnico.' },
    ],
    respostaCorreta: 'b',
    explicacao:
      'O CRM Colesel 45 possui trava estrita de duplicidade por CNPJ/CPF e Nome de Empresa, impedindo duplicatas com a mensagem exata: "Já existe um cliente cadastrado com esse CNPJ/nome."',
  },
  {
    id: 2,
    pergunta: 'Qual a regra de permissão para um Vendedor editar dados de um cliente?',
    opcoes: [
      { id: 'a', texto: 'Qualquer vendedor pode editar qualquer cliente a qualquer momento.' },
      {
        id: 'b',
        texto: 'Vendedores nunca podem editar clientes, apenas o CEO tem essa permissão.',
      },
      {
        id: 'c',
        texto:
          'O vendedor só pode editar seus próprios clientes da carteira, ou clientes com status "para_reativacao" (ao assumir). Clientes de outros vendedores têm a edição bloqueada.',
      },
      { id: 'd', texto: 'Apenas vendedores com mais de 1 ano de empresa podem editar contatos.' },
    ],
    respostaCorreta: 'c',
    explicacao:
      'Vendedores só têm permissão para editar clientes atribuídos a eles ou clientes livres na aba "Clientes para Reativação". A edição de clientes pertencentes a outro vendedor é bloqueada com aviso de acesso negado.',
  },
  {
    id: 3,
    pergunta:
      'Ao abrir o modal de "Nova Tarefa" no Follow-up ou na Prospecção, como o campo de data e hora é preenchido automaticamente?',
    opcoes: [
      { id: 'a', texto: 'Vem vazio e bloqueia o botão de salvar até você digitar.' },
      {
        id: 'b',
        texto:
          'Vem preenchido automaticamente com o horário atual somado em 1 hora (+1h) no fuso de São Paulo.',
      },
      { id: 'c', texto: 'Vem preenchido sempre com as 08:00 da manhã do dia seguinte.' },
      { id: 'd', texto: 'Vem com o horário exato do fechamento do expediente (18:00).' },
    ],
    respostaCorreta: 'b',
    explicacao:
      'O prefill padrão no CRM Colesel 45 calcula Date.now() + 1 hora no fuso horário America/Sao_Paulo (GMT-3), sugerindo o agendamento de retorno para dali a 1 hora.',
  },
  {
    id: 4,
    pergunta:
      'Na gestão de Metas, o que acontece quando o CEO remove um participante da meta mensal de vendas?',
    opcoes: [
      { id: 'a', texto: 'A meta geral do mês é reduzida no valor daquele participante.' },
      { id: 'b', texto: 'Os outros participantes são excluídos automaticamente da meta.' },
      {
        id: 'c',
        texto:
          'O valor individual do removido é redistribuído proporcionalmente entre os participantes restantes, mantendo a meta geral intacta.',
      },
      {
        id: 'd',
        texto:
          'O valor do participante removido é transferido obrigatoriamente e 100% para o Coordenador.',
      },
    ],
    respostaCorreta: 'c',
    explicacao:
      'A meta geral total é preservada. Ao remover um participante, seu valor é redistribuído proporcionalmente ao peso de cada vendedor restante (ex.: se o valor total era R$ 125.000, continuará R$ 125.000 após a remoção).',
  },
  {
    id: 5,
    pergunta: 'Qual o papel de cada perfil de acesso na tela de Metas do Time?',
    opcoes: [
      {
        id: 'a',
        texto:
          'O CEO cria e edita a meta geral e participantes; o Coordenador tem visualização geral (leitura); o Vendedor visualiza apenas a própria meta.',
      },
      {
        id: 'b',
        texto: 'Todos os usuários têm permissão para criar e alterar metas a qualquer momento.',
      },
      {
        id: 'c',
        texto:
          'Vendedores definem sua própria meta e o CEO apenas visualiza o relatório no fim do mês.',
      },
      { id: 'd', texto: 'A tela de Metas é exclusiva do perfil Estoque.' },
    ],
    respostaCorreta: 'a',
    explicacao:
      'CEO / Financeiro possui gestão executiva total (criação, edição e valor atingido manual). O Coordenador tem leitura completa da equipe. Vendedores têm visualização restrita à sua própria meta.',
  },
  {
    id: 6,
    pergunta:
      'Para que serve e como funciona a validação em /admin/backup-test (Compliance & Backup)?',
    opcoes: [
      {
        id: 'a',
        texto: 'Serve para formatar o banco de dados e reiniciar todos os cadastros do zero.',
      },
      { id: 'b', texto: 'Dispara e-mails de cobrança em massa para todos os clientes inativos.' },
      {
        id: 'c',
        texto:
          'Permite ao CEO e Coordenador gerar dumps no Cloudflare R2 e testar o restore em modo seguro (sem alterar registros no banco), comprovando divergência zero.',
      },
      {
        id: 'd',
        texto:
          'É uma tela acessível por qualquer vendedor para salvar cópias de suas propostas no computador.',
      },
    ],
    respostaCorreta: 'c',
    explicacao:
      'A tela /admin/backup-test realiza a auditoria e evidência de conformidade: aciona dumps para o bucket seguro R2 e executa a validação de restore em modo seguro (executar_real: false), conferindo a integridade dos dados sem tocar na base de produção.',
  },
]

/**
 * PROCEDIMENTOS OPERACIONAIS PADRÃO (POPs)
 * Atualizados e alinhados com os 10 módulos reais do app CRM Colesel 45
 */
export const LISTA_POPS: ProcedimentoOperacionalPadrao[] = [
  {
    id: 'pop-001',
    codigo: 'POP-001',
    titulo: 'Primeiro Acesso e Treinamento Obrigatório',
    perfilAplicavel: 'Todos os Colaboradores',
    perfisValidos: ['todos', 'ceo', 'coordenador', 'vendedor', 'compras', 'estoque'],
    descricaoCurta: 'Como funciona o primeiro acesso, navegação e desbloqueio do sistema',
    itens: [
      'Acesse a URL do CRM Colesel 45 e informe seu e-mail corporativo e senha inicial fornecida pela diretoria.',
      'No primeiro acesso (ou em novas versões do sistema), você será direcionado automaticamente ao Treinamento Interativo Obrigatório.',
      'A barra lateral e demais rotas ficam bloqueadas até a aprovação no Quiz ao final da capacitação.',
      'Exceção: O perfil CEO / Financeiro possui acesso livre aos procedimentos e módulos para fins de governança e revisão.',
      'Ao concluir todos os módulos e acertar a nota mínima do Quiz, seu acesso total à plataforma é liberado imediatamente.',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
  {
    id: 'pop-002',
    codigo: 'POP-002',
    titulo: 'Gestão da Carteira de Clientes e Higienização',
    perfilAplicavel: 'Vendedor, Coordenador, CEO',
    perfisValidos: ['vendedor', 'coordenador', 'ceo'],
    descricaoCurta: 'Cadastro, edição, prevenção de duplicidade e higienização de contatos',
    itens: [
      'Acesse Clientes no menu lateral e utilize a busca ou filtros (vendedor, status, tipo de contato, grandes clientes).',
      'Para cadastrar: clique em "+ Novo Cliente" (CEO/Coordenador) ou use o cadastro inline em Tarefas/Ligações.',
      'Trava de Duplicidade: O sistema checa CNPJ/CPF e Nome da Empresa. Se já existir, o cadastro é bloqueado com a mensagem "Já existe um cliente cadastrado com esse CNPJ/nome."',
      'Higienização de Contatos: Ao editar um cliente com nome de contato confuso ou vindo de importação suja, preencha o campo "Nome do Contato" com a pessoa física e "Nome da Empresa" com a razão social.',
      'Reativação: Na aba "Clientes para Reativação", qualquer vendedor pode clicar em "Assumir cliente" para integrá-lo à sua carteira ativa com ordenação pelo maior histórico de compras.',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
  {
    id: 'pop-003',
    codigo: 'POP-003',
    titulo: 'Rotina Diária de Follow-up Comercial',
    perfilAplicavel: 'Vendedor, Coordenador',
    perfisValidos: ['vendedor', 'coordenador'],
    descricaoCurta: 'Priorização diária de contatos inativos e agendamento de tarefas',
    itens: [
      'Inicie seu expediente abrindo o módulo Follow-up no menu lateral.',
      'Analise os 4 cartões inteligentes: "Sem contato há 7+ dias", "Oportunidade parada há 5+ dias", "Aniversariantes da semana" e "Sem compra há 30+ dias".',
      'Nos cartões de alerta, clique em "Criar Tarefa" para abrir o modal pré-configurado com o cliente e ação sugerida.',
      'Ajuste a data, horário e descrição do contato e salve para mover a ação para sua agenda operacional.',
      'Acompanhe o indicador no topo: conforme você liga ou conclui contatos, as pendências somem automaticamente da lista.',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
  {
    id: 'pop-004',
    codigo: 'POP-004',
    titulo: 'Prospecção e Gestão de Tarefas Diárias',
    perfilAplicavel: 'Vendedor, Coordenador, CEO',
    perfisValidos: ['vendedor', 'coordenador', 'ceo'],
    descricaoCurta: 'Agendamento de ligações e visitas, regra +1h e conclusão de atividades',
    itens: [
      'Acesse Prospecção no menu lateral para visualizar suas "Tarefas de Hoje" e "Tarefas Vencidas".',
      'Para criar uma nova tarefa: clique no botão "+ Nova Tarefa" no topo da página.',
      'Regra de Horário (+1h): Ao abrir o modal, o sistema sugere automaticamente a data/hora para 1 hora à frente no horário de Brasília.',
      'Cadastro Inline: Se o cliente não existir, clique em "+ Cadastrar novo cliente" dentro do próprio modal sem perder as anotações.',
      'Conclusão: Após falar com o cliente, marque a caixinha de seleção da tarefa para registrá-la como concluída (somente o responsável pode concluir).',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
  {
    id: 'pop-005',
    codigo: 'POP-005',
    titulo: 'Registro de Chamadas Telefônicas',
    perfilAplicavel: 'Vendedor, Coordenador',
    perfisValidos: ['vendedor', 'coordenador'],
    descricaoCurta: 'Histórico de ligações, duração, desfecho comercial e próxima ação',
    itens: [
      'Acesse Ligações no menu lateral e clique em "+ Registrar Ligação".',
      'Selecione o cliente atendido, o tipo (Saída, Entrada ou Perdida) e o resultado (Atendeu, Não atendeu, Caixa postal, Ocupado, Desligou).',
      'Informe a duração em segundos (o sistema converte automaticamente para minutos e segundos).',
      'Anote o resumo da conversa em "Observações" e, se houver próximo passo, preencha "Próxima Ação" e a data programada.',
      'O registro alimenta instantaneamente os relatórios e tira o cliente da fila de inatividade do Follow-up.',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
  {
    id: 'pop-006',
    codigo: 'POP-006',
    titulo: 'Governança e Distribuição de Metas Comerciais',
    perfilAplicavel: 'CEO, Coordenador, Vendedor',
    perfisValidos: ['ceo', 'coordenador', 'vendedor'],
    descricaoCurta: 'Criação de metas mensais, redistribuição proporcional e acompanhamento',
    itens: [
      'Acesso: O CEO cria e edita; o Coordenador tem visão completa de leitura; o Vendedor visualiza exclusivamente sua própria meta individual.',
      'Criação da Meta: O CEO acessa Metas, seleciona o mês/ano, informa o valor geral total (ex: R$ 125.000,00) e adiciona os participantes.',
      'Validação de Soma: A soma dos valores individuais deve fechar exatamente 100% da meta geral (o sistema valida diferença em tempo real).',
      'Redistribuição Proporcional: Se um participante for removido da meta, sua cota é redistribuída proporcionalmente entre os vendedores restantes, mantendo a meta geral intacta.',
      'Valor Atingido: Atualmente é lançado manualmente pelo CEO no campo "Valor Atingido", enquanto a integração via API com o Bling ERP é ativada.',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
  {
    id: 'pop-007',
    codigo: 'POP-007',
    titulo: 'Compliance, Auditoria e Teste de Backup Externo',
    perfilAplicavel: 'CEO, Coordenador de Vendas',
    perfisValidos: ['ceo', 'coordenador'],
    descricaoCurta: 'Evidência de backup diário no Cloudflare R2 e restore em modo seguro',
    itens: [
      'Acesse a rota administrativa em Configurações → Teste de Backup & Restore (ou diretamente /admin/backup-test).',
      'Apenas os perfis CEO / Financeiro e Coordenador de Vendas têm permissão de acesso a este módulo.',
      'Para gerar cópia: clique em "Criar Backup Agora" para enviar um snapshot comprimido e autenticado ao Cloudflare R2.',
      'Para validar integridade: selecione o backup desejado e clique em "Validar Restore Seguro (Modo Simulado)".',
      'O sistema compara as contagens do arquivo com a base atual sem modificar dados, garantindo conformidade com Divergência ZERO.',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
  {
    id: 'pop-008',
    codigo: 'POP-008',
    titulo: 'Importação de Dados e Planilhas',
    perfilAplicavel: 'CEO / Financeiro',
    perfisValidos: ['ceo'],
    descricaoCurta: 'Carga de clientes e histórico de compras via CSV com deduplicação',
    itens: [
      'Acesse Configurações → Importar dados do Bling (rota /importacao). Exclusivo para o perfil CEO.',
      'Envie o arquivo CSV de contatos ou pedidos exportado do sistema de gestão.',
      'O motor de importação identifica cabeçalhos automaticamente e aplica deduplicação por CNPJ e Razão Social.',
      'Clientes já existentes têm seus telefones e compras atualizados sem duplicar registros na base.',
      'Acompanhe o log com a quantidade de criados, atualizados e eventuais erros de formato.',
    ],
    ultimaAtualizacao: '15/03/2025',
    versao: '2.0',
  },
]

/**
 * SLIDES DE TREINAMENTO DO CRM COLESEL 45 (18 ETAPAS)
 * Organizados em Módulos coerentes com o app atual:
 * Módulo 0: Boas-vindas, Objetivo, Perfis e Navegação
 * Módulo 1: Gestão de Clientes, Travas de Duplicidade e Higienização
 * Módulo 2: Follow-up Inteligente e Ações Preventivas
 * Módulo 3: Prospecção, Ligações e Regra de Horário (+1h)
 * Módulo 4: Metas do Time, Redistribuição Proporcional e Papéis
 * Módulo 5: Compliance e Painel de Backup Test (/admin/backup-test)
 * Módulo 6: Integrações Atuais, Futuras (Bling) e Quiz de Conclusão
 */
export const SLIDES_TREINAMENTO: SlideTreinamento[] = [
  // --- MÓDULO 0: BOAS-VINDAS E NAVEGAÇÃO ---
  {
    numero: 1,
    modulo: 'Módulo 0 — Boas-vindas & Perfis',
    moduloNumero: 0,
    titulo: 'Bem-vindo ao CRM Colesel 45',
    conteudo:
      'Este é o sistema comercial unificado da Colesel 45. Ele centraliza a inteligência de vendas, controle de contatos, tarefas e metas de faturamento da empresa em um único ambiente rápido e seguro.',
    itensLista: [
      'Objetivo: Garantir que nenhum cliente fique sem retorno e todas as oportunidades sejam rastreadas.',
      'Duração do Treinamento: Aproximadamente 12 minutos de leitura interativa.',
      'Conclusão Obrigatória: Ao final haverá um quiz rápido de validação para liberar seu acesso operacional aos módulos.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'Avançar com atenção garante que você domine as regras e ferramentas do seu dia a dia.',
  },
  {
    numero: 2,
    modulo: 'Módulo 0 — Boas-vindas & Perfis',
    moduloNumero: 0,
    titulo: 'Perfis de Acesso e Permissões',
    conteudo:
      'O CRM opera com controle rigoroso de papéis e responsabilidades para que cada colaborador tenha foco no seu trabalho com segurança:',
    itensLista: [
      'CEO / Financeiro: Gestão executiva total, criação e edição de metas, gestão de usuários, importações e backup.',
      'Coordenador de Vendas: Visão comercial consolidada, relatórios de toda a equipe, acompanhamento de metas (leitura) e teste de backup.',
      'Vendedores (1 e 2): Carteira própria de clientes, tarefas de prospecção, registro de ligações e visualização da sua própria meta.',
      'Compras e Estoque: Perfis de apoio operacional e suprimentos, sem acesso à gestão de vendas ou marketing.',
    ],
    tipoLista: 'bullet',
    exemploPratico:
      'Se você está logado como Vendedor 1 (Karoline), você visualiza sua carteira e suas tarefas. Clientes de outros vendedores ficam restritos para edição, evitando conflito de comissões.',
  },
  {
    numero: 3,
    modulo: 'Módulo 0 — Boas-vindas & Perfis',
    moduloNumero: 0,
    titulo: 'Estrutura do Menu Lateral',
    conteudo:
      'A barra de navegação à esquerda organiza os 10 módulos essenciais do CRM Colesel 45:',
    itensLista: [
      'Painel: Indicadores executivos, funil em tempo real e gráficos de desempenho.',
      'Clientes: Carteira de clientes ativa e aba dedicada para Reativação comercial.',
      'Funil: Pipeline visual Kanban das etapas de prospecção até o fechamento de propostas.',
      'Prospecção & Ligações: Agenda de tarefas do dia e histórico completo de chamadas.',
      'Follow-up: Alertas inteligentes de clientes sem contato e aniversariantes.',
      'Conversas & Marketing: Atendimento multicanal assistido por IA e campanhas.',
      'Metas: Metas mensais da equipe, percentuais e acompanhamento anual.',
      'Configurações & POPs: Gestão de acessos, integrações e procedimentos operacionais.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'No desktop a barra é fixa à esquerda. No celular ou tablet, use o botão de menu no topo.',
  },

  // --- MÓDULO 1: GESTÃO DE CLIENTES ---
  {
    numero: 4,
    modulo: 'Módulo 1 — Gestão de Clientes',
    moduloNumero: 1,
    titulo: 'Cadastro e Travas de Duplicidade',
    conteudo:
      'Manter a base comercial limpa é a regra de ouro da Colesel. O sistema possui travas ativas que impedem cadastros duplicados.',
    itensLista: [
      'Caminho: Menu lateral → Clientes → Clique em "+ Novo Cliente" no canto superior direito.',
      'Campos Obrigatórios: Nome da Empresa, Telefone ou E-mail, e identificação do Vendedor responsável.',
      'Trava de Unicidade: O sistema checa automaticamente se o CNPJ/CPF ou Razão Social já existem na base.',
      'Mensagem do App: Caso haja duplicata, o salvamento é bloqueado com o alerta: "Já existe um cliente cadastrado com esse CNPJ/nome."',
    ],
    tipoLista: 'ordered',
    exemploPratico:
      'Antes de cadastrar "Eletrotécnica União", use a barra de busca no topo de Clientes. Se ela já existir, abra o cadastro existente para atualizar os dados em vez de tentar criar um segundo registro.',
  },
  {
    numero: 5,
    modulo: 'Módulo 1 — Gestão de Clientes',
    moduloNumero: 1,
    titulo: 'Edição de Clientes e Regra de Carteira',
    conteudo:
      'Para proteger o relacionamento construído por cada vendedor, a edição de clientes segue regras estritas no sistema:',
    itensLista: [
      'Permissão do Vendedor: Você só pode editar clientes dos quais seja o responsável cadastrado ou onde seu nome esteja vinculado.',
      'Clientes de Outros: Ao tentar editar um cliente de outro colega, o sistema exibe "Acesso negado: Você não pode editar clientes de outros vendedores."',
      'CEO e Coordenador: Possuem autorização para editar e remanejar clientes entre carteiras quando necessário.',
    ],
    tipoLista: 'bullet',
    exemploPratico:
      'A Construtora Silva pertence ao Vendedor 2. Se o Vendedor 1 abrir o cadastro dela, visualizará as informações mas o botão de salvar ficará bloqueado. Para solicitar transferência, converse com a coordenação.',
  },
  {
    numero: 6,
    modulo: 'Módulo 1 — Gestão de Clientes',
    moduloNumero: 1,
    titulo: 'Higienização e Carteira de Reativação',
    conteudo:
      'Muitos cadastros migrados ou importados possuem campos incompletos. Na tela de Clientes você encontra ferramentas para higienizar e recuperar contas:',
    itensLista: [
      'Higienização de Nome de Contato: Ao identificar cadastros com o campo nome_contato misturado com razão social, clique no lápis e separe o nome da pessoa física (ex: "Carlos - Comprador") do nome da empresa.',
      'Aba "Clientes para Reativação": Acesse Clientes → selecione a aba "Clientes para Reativação".',
      'Clientes Liberados: Contas inativas são listadas por ordem do maior valor histórico de compras no topo.',
      'Assumir Cliente: Qualquer vendedor pode clicar no botão "Assumir cliente" para trazer a conta para sua carteira ativa imediatamente.',
    ],
    tipoLista: 'ordered',
    exemploPratico:
      'Na aba de reativação aparece um cliente com R$ 180.000 em compras passadas sem pedidos recentes. Você clica em "Assumir cliente", ele passa a ser seu e você já agenda um follow-up de reposição.',
  },

  // --- MÓDULO 2: FOLLOW-UP ---
  {
    numero: 7,
    modulo: 'Módulo 2 — Follow-up Inteligente',
    moduloNumero: 2,
    titulo: 'Como Funciona o Painel de Follow-up',
    conteudo:
      'O módulo de Follow-up analisa automaticamente toda a movimentação comercial do CRM e monta sua fila de prioridades todos os dias sem que você precise calcular datas na mão.',
    itensLista: [
      'Sem contato há 7+ dias: Clientes da sua carteira que não receberam nenhuma ligação ou tarefa concluída na última semana.',
      'Oportunidade parada há 5+ dias: Propostas em aberto no Funil sem nenhuma ação agendada recente.',
      'Aniversariantes da semana: Contatos que fazem aniversário nos próximos 7 dias (excelente gancho de relacionamento).',
      'Sem compra há 30+ dias: Clientes inativos sem pedidos há mais de um mês para sugerir reposição.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'A meta diária de todo vendedor é manter esses contadores o mais próximo de zero possível.',
  },
  {
    numero: 8,
    modulo: 'Módulo 2 — Follow-up Inteligente',
    moduloNumero: 2,
    titulo: 'Criando Tarefas Direto do Follow-up',
    conteudo:
      'A partir dos cartões de alerta do Follow-up, o agendamento de retorno é feito em 1 clique:',
    itensLista: [
      'Caminho: Menu lateral → Follow-up → Localize o cliente dentro do cartão de alerta.',
      'Ação: Clique no botão azul "Criar Tarefa" ao lado do contato.',
      'Modal Pré-preenchido: O modal abre automaticamente com o cliente selecionado e com a descrição recomendada (ex: "Reativação comercial: verificar reposição com...").',
      'Progresso em Tempo Real: Assim que a tarefa for criada e realizada, o cliente sai automaticamente da fila de inatividade.',
    ],
    tipoLista: 'ordered',
    exemploPratico:
      'Ao ver que a "Metalúrgica Progresso" está há 8 dias sem contato, clique em "Criar Tarefa", escolha "Ligação Telefônica", confirme a data e pronto: o compromisso entra na sua Prospecção.',
  },

  // --- MÓDULO 3: PROSPECÇÃO E LIGAÇÕES ---
  {
    numero: 9,
    modulo: 'Módulo 3 — Prospecção & Ligações',
    moduloNumero: 3,
    titulo: 'Agenda de Prospecção e Tarefas de Hoje',
    conteudo:
      'A tela de Prospecção (/prospeccao) é o seu cockpit de execução diária. Nela ficam separadas as tarefas de Hoje e as Vencidas.',
    itensLista: [
      'Tarefas de Hoje: Atividades com data e hora programadas para o dia de hoje, organizadas por ordem cronológica.',
      'Tarefas Vencidas: Ações de dias anteriores que não foram marcadas como concluídas (ficam em destaque vermelho para priorização imediata).',
      'Tipos de Ação: Ligação telefônica, Visita comercial, E-mail, WhatsApp, Reunião ou Outro.',
      'Filtros por Vendedor: O Coordenador e CEO podem alternar entre a visão de cada vendedor ou da equipe inteira.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'Abra a Prospecção no início de cada turno para planejar sua rota de visitas e ligações.',
  },
  {
    numero: 10,
    modulo: 'Módulo 3 — Prospecção & Ligações',
    moduloNumero: 3,
    titulo: 'Regra de Horário (+1h) e Cadastro Inline',
    conteudo:
      'O modal de Tarefas foi construído para economizar tempo do vendedor durante o atendimento com duas facilidades essenciais:',
    itensLista: [
      'Regra de Horário +1h no Prefill: Ao clicar em "+ Nova Tarefa", o campo "Data e Horário" vem preenchido automaticamente com o horário atual somado em 1 hora (+1h) no fuso de São Paulo.',
      'Por que +1h? Se agora são 14:15, o sistema sugere 15:15 para permitir que você organize o próximo contato sem precisar digitar data e hora do zero.',
      'Cadastro Inline de Cliente: Se você está criando a tarefa para uma empresa nova, não precisa sair da tela. No campo de cliente, clique em "Cadastrar novo cliente" para abrir o formulário rápido.',
      'Vinculação Automática: Ao salvar o cliente inline, ele já fica selecionado no modal da tarefa.',
    ],
    tipoLista: 'ordered',
    exemploPratico:
      'Você acabou de falar com um cliente novo pelo WhatsApp. Clica em Nova Tarefa, clica em Cadastrar novo cliente inline, digita os dados e a tarefa já fica agendada para dali a 1 hora.',
  },
  {
    numero: 11,
    modulo: 'Módulo 3 — Prospecção & Ligações',
    moduloNumero: 3,
    titulo: 'Registro de Chamadas e Conclusão de Tarefas',
    conteudo:
      'O registro fiel de cada conversa telefônica garante a memória técnica e comercial da empresa:',
    itensLista: [
      'Caminho: Menu lateral → Ligações → Clique em "+ Registrar Ligação".',
      'Preenchimento: Indique o cliente, o tipo (Saída, Entrada ou Perdida) e o resultado (Atendeu, Não atendeu, Caixa postal, Ocupado, Desligou).',
      'Duração Real: Digite a duração em segundos (ex: 150 segundos = 2m 30s).',
      'Próxima Ação: Registre se ficou acordado enviar catálogo ou retornar amanhã.',
      'Como Concluir uma Tarefa: Na tela de Prospecção, clique na caixinha de seleção da tarefa. Ela será marcada como concluída e registrará a data/hora exata do fechamento.',
    ],
    tipoLista: 'ordered',
    fechamento: 'Somente o responsável pela tarefa tem permissão para marcá-la como concluída.',
  },

  // --- MÓDULO 4: METAS DO TIME ---
  {
    numero: 12,
    modulo: 'Módulo 4 — Metas do Time',
    moduloNumero: 4,
    titulo: 'Como Funciona a Gestão de Metas Mensais',
    conteudo:
      'O módulo de Metas (/metas) define o faturamento esperado da Colesel mês a mês e distribui a responsabilidade entre os vendedores da equipe.',
    itensLista: [
      'Quem Cria e Edita: O perfil CEO / Financeiro é o único com permissão para criar, alterar valores e salvar metas.',
      'Visão do Coordenador: Acesso de leitura completa para acompanhar todas as metas individuais e a meta global.',
      'Visão do Vendedor: Acesso restrito em modo somente leitura, visualizando apenas a sua própria cota e seu percentual individual.',
      'Visão Anual e Retroativo: O seletor de mês e ano permite navegar no histórico passado e planejar os próximos períodos.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'A clareza nas metas permite que cada vendedor saiba exatamente quanto precisa faturar.',
  },
  {
    numero: 13,
    modulo: 'Módulo 4 — Metas do Time',
    moduloNumero: 4,
    titulo: 'Redistribuição Proporcional ao Remover Participantes',
    conteudo:
      'Uma das inteligências mais importantes da tela de Metas é a redistribuição proporcional automática quando um vendedor é removido da meta do mês:',
    itensLista: [
      'Regra da Meta Geral: A meta geral estipulada pela diretoria não diminui quando um participante sai.',
      'Cálculo Proporcional: O valor individual do participante removido é redistribuído entre os vendedores restantes proporcionalmente ao peso de cada um.',
      'Recálculo Automático: O sistema recalcula os novos valores individuais e percentuais imediatamente, sem erros de centavos.',
    ],
    tipoLista: 'bullet',
    exemploPratico:
      'Meta do mês: R$ 125.000,00. Renan responde por R$ 70.000 (56%), Vendedor 1 por R$ 35.000 (28%) e Vendedor 2 por R$ 20.000 (16%). Se o Vendedor 2 for removido, seus R$ 20.000 são redistribuídos na proporção de 70k para 35k (2 para 1): Renan assume R$ 83.333,33 e Vendedor 1 assume R$ 41.666,67. O total continua exatos R$ 125.000,00!',
  },
  {
    numero: 14,
    modulo: 'Módulo 4 — Metas do Time',
    moduloNumero: 4,
    titulo: 'Valor Atingido e Barra de Progresso',
    conteudo:
      'Acompanhar a evolução das vendas em relação à meta é simples e visual na tela de Metas e no Painel:',
    itensLista: [
      'Lançamento Manual (Atual): Atualmente, o CEO lança o valor já faturado no campo "Valor Atingido (R$)", selecionando a fonte como "Manual".',
      'Barra de Progresso Colorida: O sistema calcula a porcentagem (atingido / meta * 100) com indicadores visuais:',
      '• Verde: Atingimento acima de 80% ou meta superada.',
      '• Azul / Amarelo: Progresso regular entre 40% e 79%.',
      '• Vermelho / Âmbar: Alerta de atingimento inicial abaixo de 40%.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'No futuro breve, este campo será atualizado automaticamente via integração com o ERP Bling.',
  },

  // --- MÓDULO 5: COMPLIANCE E BACKUP ---
  {
    numero: 15,
    modulo: 'Módulo 5 — Compliance & Backup',
    moduloNumero: 5,
    titulo: 'Segurança de Dados e Teste de Backup R2',
    conteudo:
      'Para garantir a conformidade da Colesel e segurança contra perda de dados, o CRM possui um sistema automatizado de backup externo e uma página dedicada de testes:',
    itensLista: [
      'Rota: /admin/backup-test (acessível pelo card em Configurações → Teste de Backup & Restore).',
      'Quem pode acessar: Apenas CEO / Financeiro e Coordenador de Vendas. Outros perfis são bloqueados.',
      'Storage Externo: Os dados são criptografados e enviados para buckets independentes no Cloudflare R2.',
      'Rotina Automática: Cron diário executa backup todas as noites às 06:00 UTC com retenção de 30 dias.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'A existência de backups externos garante que informações de clientes nunca sejam perdidas.',
  },
  {
    numero: 16,
    modulo: 'Módulo 5 — Compliance & Backup',
    moduloNumero: 5,
    titulo: 'Como Acionar o Teste de Restore Seguro',
    conteudo:
      'A tela de backup permite gerar evidências técnicas de restauração sem colocar em risco os dados de produção:',
    itensLista: [
      'Passo 1: Acesse /admin/backup-test com seu login de CEO ou Coordenador.',
      'Passo 2: Clique em "Criar Backup Agora" para despachar uma cópia fresca para o Cloudflare R2.',
      'Passo 3: Na tabela de backups, selecione o arquivo mais recente.',
      'Passo 4: Clique em "Validar Restore Seguro (Modo Simulado)".',
      'Modo Seguro (executar_real: false): O backend baixa o dump e confere a integridade tabela por tabela sem alterar nem apagar nada no banco real, atestando Divergência ZERO.',
    ],
    tipoLista: 'ordered',
    exemploPratico:
      'Durante uma auditoria interna, a coordenação abre a página /admin/backup-test, clica em validar restore e o sistema exibe em verde: "Divergência ZERO - 100% íntegro", confirmando a segurança total da empresa.',
  },

  // --- MÓDULO 6: INTEGRAÇÕES E QUIZ ---
  {
    numero: 17,
    modulo: 'Módulo 6 — Integrações & Visão Futura',
    moduloNumero: 6,
    titulo: 'Integrações Conectadas e Placeholder Bling',
    conteudo:
      'O CRM Colesel 45 foi desenvolvido para dialogar com todo o ecossistema tecnológico da empresa:',
    itensLista: [
      'WhatsApp Business & IA: Suporte a envio de mensagens e sugestões automáticas de respostas comerciais com inteligência artificial assistida (o vendedor sempre revisa antes do envio).',
      'Importação CSV de Clientes e Compras: Já funcional em /importacao para carregar bases do Bling.',
      'Placeholder Bling em Metas: O banco de dados já possui os campos preparados (`valor_atingido` e `fonte_atingido`), operando em modo manual hoje e pronto para a sincronização via API na próxima fase.',
      'E-mail e Gateways: Estrutura pronta para conexões SMTP corporativas e disparos de campanhas.',
    ],
    tipoLista: 'bullet',
    fechamento:
      'Quando a integração Bling for conectada na nuvem, o faturamento será atualizado em tempo real.',
  },
  {
    numero: 18,
    modulo: 'Módulo 6 — Integrações & Visão Futura',
    moduloNumero: 6,
    titulo: 'Validação de Conhecimento e Conclusão',
    conteudo:
      'Parabéns por concluir todos os módulos educativos do CRM Colesel 45! Para liberar o seu acesso aos módulos operacionais do sistema, responda com atenção ao Quiz de Verificação abaixo:',
    itensLista: [
      'Quantidade de Questões: 6 perguntas de múltipla escolha cobrindo as regras do app.',
      'Nota Mínima para Aprovação: É necessário acertar pelo menos 5 de 6 perguntas (ou 80%+).',
      'Tentativas Ilimitadas: Se errar, você pode revisar o treinamento e clicar em "Tentar novamente" quantas vezes precisar sem travar o seu cadastro.',
      'Liberação Imediata: Ao ser aprovado, o botão "Concluir treinamento" fica verde e seu acesso é liberado!',
    ],
    tipoLista: 'ordered',
    fechamento: 'Sucesso nas suas vendas e no atendimento aos clientes Colesel!',
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
