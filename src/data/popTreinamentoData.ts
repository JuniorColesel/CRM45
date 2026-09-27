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
  moduloNumero: 1 | 2 | 3 | 4
  titulo: string
  conteudo: string
  itensLista?: string[]
  tipoLista?: 'bullet' | 'ordered'
  fechamento?: string
  exemploPratico?: string
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
    modulo: 'Módulo 1 – Noções básicas',
    moduloNumero: 1,
    titulo: 'Bem-vindo ao seu novo CRM',
    conteudo:
      'Este treinamento vai te ensinar a usar o sistema de gestão que a Colesel adotou. Não se preocupe se nunca usou um CRM antes — vamos começar do absoluto zero, com linguagem simples e exemplos do nosso dia a dia. Ao final, você estará pronto para trabalhar. Duração: cerca de 15 minutos.',
  },
  {
    numero: 2,
    modulo: 'Módulo 1 – Noções básicas',
    moduloNumero: 1,
    titulo: 'Para que serve isso afinal?',
    conteudo:
      'CRM significa "Gestão de Relacionamento com o Cliente". É um sistema que guarda TODAS as informações dos seus clientes e das suas vendas em um só lugar. Antes, o vendedor anotava em caderno, agenda ou na memória. Com o CRM, tudo fica registrado e compartilhado com o time.',
    exemploPratico:
      'Você atendeu o Sr. Carlos na semana passada e ele pediu orçamento de um telhado. Sem o CRM, essa informação fica só na sua cabeça ou num papel. Se você faltar por doença, ninguém sabe do orçamento do Sr. Carlos. Com o CRM, qualquer colega abre o sistema, vê o cliente, vê o que você conversou e dá continuidade.',
  },
  {
    numero: 3,
    modulo: 'Módulo 1 – Noções básicas',
    moduloNumero: 1,
    titulo: 'Por que a Colesel adotou o CRM',
    conteudo:
      'Para não perder oportunidades, para ninguém esquecer de retornar contato, para a diretoria acompanhar o desempenho e para que a carteira da empresa não dependa da memória de uma única pessoa. O CRM garante que ninguém fique "na mão" e que todas as vendas sejam acompanhadas.',
    exemploPratico:
      'Imagine que o Renan (coordenador) precisa saber quantas propostas cada vendedor mandou este mês. Sem o CRM, ele teria que perguntar um por um. Com o CRM, ele abre um relatório e vê tudo em segundos.',
  },
  {
    numero: 4,
    modulo: 'Módulo 1 – Noções básicas',
    moduloNumero: 1,
    titulo: 'A rotina do vendedor no CRM',
    conteudo:
      'No dia a dia você vai: cadastrar e consultar clientes, registrar suas conversas e ligações, acompanhar suas oportunidades de venda no funil, criar tarefas (lembretes), bater suas metas e ver seus relatórios. Todos esses módulos aparecem no menu lateral.',
    exemploPratico:
      'Seu dia começa abrindo o CRM, vendo o "Follow-up" — ali aparece quem você precisa ligar hoje, porque está sem contato há dias. Isso é a sua "lista de tarefas do dia".',
  },
  {
    numero: 5,
    modulo: 'Módulo 2 – O dia a dia no CRM',
    moduloNumero: 2,
    titulo: 'Conhecendo o menu',
    conteudo: 'Cada item do menu é um módulo do sistema. Vamos passar por cada um:',
    itensLista: [
      'Painel: resumo geral do que está acontecendo',
      'Funil: suas oportunidades de venda organizadas por etapa',
      'Follow-up: ligações pendentes, tarefas e alertas de contato',
      'Clientes: sua carteira completa de clientes',
      'Relatórios: números e gráficos de desempenho',
      'Automações: disparos e lembretes automáticos',
      'Configurações: integrações, importação, usuários e metas',
      'POP & Treinamento: este manual e os procedimentos do sistema',
    ],
    tipoLista: 'bullet',
    fechamento: 'Não precisa decorar. Conforme usa, você grava com naturalidade.',
  },
  {
    numero: 6,
    modulo: 'Módulo 2 – O dia a dia no CRM',
    moduloNumero: 2,
    titulo: 'Cadastrando um cliente',
    conteudo:
      'Para cadastrar: acesse "Clientes", clique em "Novo cliente" e preencha os campos. Obrigatórios: nome e (telefone OU email). Os demais (empresa, cidade, CNPJ) são opcionais, mas quanto mais completo, melhor — facilita buscas futuras e relatórios.',
    exemploPratico:
      'Você conheceu a Dona Marta numa feira. Cadastre: Nome: Marta Silva, Telefone: (42) 99999-0000, Cidade: São Mateus do Sul. Pronto! Ela está na sua carteira e ninguém mais da equipe vai cadastrar duplicado.',
  },
  {
    numero: 7,
    modulo: 'Módulo 2 – O dia a dia no CRM',
    moduloNumero: 2,
    titulo: 'Encontrando e atualizando clientes',
    conteudo:
      'Use a busca/filtros (nome, cidade, grande cliente) para localizar. Clique no cliente para ver detalhes e histórico. Use o lápis para editar e a lixeira para excluir (apenas quem tem permissão). A busca é case-insensitive — funciona com maiúsculas ou minúsculas.',
    exemploPratico:
      'O cliente "João Construtor" mudou de telefone. Você busca por "joão", abre o registro, clica no lápis, atualiza o número e salva. Pronto — da próxima vez, o número certo já vai aparecer.',
  },
  {
    numero: 8,
    modulo: 'Módulo 2 – O dia a dia no CRM',
    moduloNumero: 2,
    titulo: 'O funil explica sua venda',
    conteudo:
      'O funil organiza suas vendas em etapas que vão do primeiro contato até o fechamento: Prospecção → Qualificação → Proposta → Negociação → Ganha/Perdida. Ele mostra em que estágio cada negócio está e ajuda a saber no que focar.',
    exemploPratico:
      'Tem 5 clientes no funil. 2 estão em "Prospecção" (primeiro contato), 2 em "Proposta" (enviou orçamento) e 1 em "Negociação" (perto de fechar). Seu foco do dia: empurrar os da proposta para a negociação e fechar o da negociação.',
  },
  {
    numero: 9,
    modulo: 'Módulo 2 – O dia a dia no CRM',
    moduloNumero: 2,
    titulo: 'Usando o funil',
    conteudo:
      'No "Funil", arraste o card da oportunidade para a etapa certa, ou abra o card e altere a etapa no formulário. Quando vai para "Ganha" ou "Perdida", o sistema grava a data de fechamento automaticamente. Se voltar para uma etapa aberta, a data é limpa — os relatórios ficam corretos.',
    exemploPratico:
      'Você mandou uma proposta para a Construtora Alfa. Arraste o card dela de "Prospecção" para "Proposta". Na semana seguinte, ela aceitou. Arraste para "Ganha". Pronto — a venda está registrada e entra no relatório de fechamentos desse mês.',
  },
  {
    numero: 10,
    modulo: 'Módulo 2 – O dia a dia no CRM',
    moduloNumero: 2,
    titulo: 'Não esqueça de voltar a falar',
    conteudo:
      'O "Follow-up" é seu melhor amigo. Ele mostra: ligações pendentes, tarefas pendentes, clientes sem contato há mais de 7 dias e oportunidades paradas há mais de 5 dias. Registre cada ligação (entrada/saída/perdida) e crie tarefas com data de vencimento.',
    exemploPratico:
      'Você ligou para o Sr. Roberto e ele pediu para "pensar com calma". Registre a ligação como "saída" com a observação "cliente pediu prazo até sexta". Crie uma tarefa pra sexta: "Retornar Sr. Roberto". O CRM vai te lembrar. Sem isso, você esquece — e o concorrente fecha.',
  },
  {
    numero: 11,
    modulo: 'Módulo 3 – Funil, metas e relatórios',
    moduloNumero: 3,
    titulo: 'O valor de registrar cada contato',
    conteudo:
      'Cada ligação, tarefa e atualização registrada vira dado. E dado vira informação para a empresa decidir melhor. Um vendedor que registra bem é valorizado. Quem não registra "some" do sistema e prejudica o próprio desempenho.',
    exemploPratico:
      'No fim do mês, o relatório mostra que você fez 80 ligações, mas fechou só 2 vendas. Com esse dado, a diretoria pode ver que suas propostas estão demorando e ajudar você a melhorar. Sem registro, ninguém sabe o que fazer para te ajudar.',
  },
  {
    numero: 12,
    modulo: 'Módulo 3 – Funil, metas e relatórios',
    moduloNumero: 3,
    titulo: 'Entendendo suas metas',
    conteudo:
      'As metas definem o que se espera de você no mês: valor de vendas (R$), número de oportunidades e de ligações. Acompanhe seu progresso nos relatórios. O vendedor vê a PRÓPRIA meta (somente leitura); o gestor define e acompanha todas.',
    exemploPratico:
      'Sua meta do mês é R$ 100.000 em vendas. Você já fechou R$ 40.000. No relatório, vê que está a 40% da meta. Falta R$ 60.000. Sabendo disso, você intensifica o follow-up nos clientes em negociação. A meta te orienta, não te pressiona — ela é o seu norte.',
  },
  {
    numero: 13,
    modulo: 'Módulo 3 – Funil, metas e relatórios',
    moduloNumero: 3,
    titulo: 'Lendo seus relatórios',
    conteudo:
      'Em "Relatórios" você vê o Painel (resumo e gráficos) e as abas de Oportunidades, Ligações, Tarefas e Clientes. Use o seletor de período (mês corrente por padrão). Tudo pode ser exportado em CSV — arquivo que abre direto no Excel.',
    exemploPratico:
      'Quer saber quantas ligações fez em setembro? Vá em Relatórios → Ligações, selecione setembro e veja o total e a lista. Precisa mostrar pra diretoria? Exporte o CSV e abra no Excel.',
  },
  {
    numero: 14,
    modulo: 'Módulo 3 – Funil, metas e relatórios',
    moduloNumero: 3,
    titulo: 'Sua carteira já importada',
    conteudo:
      'O Bling é o ERP (sistema financeiro/estoque) da empresa. Os clientes e compras já cadastrados lá podem ser importados para o CRM em lote. Isso evita recadastrar tudo na mão. A importação é feita por quem tem permissão (CEO/coordenador) na tela de Importação.',
    exemploPratico:
      'A Colesel tem 500 clientes no Bling. Em vez de cadastrar um a um, o coordenador exporta o CSV do Bling e importa no CRM. Em minutos, os 500 clientes estão na carteira, com histórico de compras. Você não precisa fazer nada — é automático.',
  },
  {
    numero: 15,
    modulo: 'Módulo 3 – Funil, metas e relatórios',
    moduloNumero: 3,
    titulo: 'Passo a passo da importação',
    conteudo:
      'Caso tenha permissão e precise importar: acesse Configurações → Importar dados do Bling. Selecione o arquivo CSV (clientes ou compras). O sistema detecta as colunas automaticamente; revise o mapeamento se necessário. Campos obrigatórios não mapeados ficam vermelhos — associe antes de importar. Clique em Importar e veja o resultado (X criados, Y atualizados, Z erros).',
    exemploPratico:
      'Você importou uma planilha nova de clientes. O sistema diz "30 criados, 5 atualizados, 0 erros". Os 5 "atualizados" já existiam e foram atualizados com dados novos. Nenhum duplicado foi criado. Eficiente, né?',
  },
  {
    numero: 16,
    modulo: 'Módulo 4 – Fechamento e regras',
    moduloNumero: 4,
    titulo: 'Boas práticas obrigatórias',
    conteudo: '',
    itensLista: [
      'Cadastre o cliente com telefone OU email — sempre.',
      'Registre TODA ligação e TODA tarefa. Nada de "eu lembro".',
      'Mantenha as oportunidades na etapa certa do funil.',
      'Nunca crie cliente duplicado (busque antes).',
      'Sua senha é pessoal e intransferível — nunca compartilhe.',
      'Não tente burlar metas: o sistema registra tudo.',
      'Se errar um lançamento, corrige imediatamente (não esconde).',
    ],
    tipoLista: 'ordered',
    fechamento: 'Seguir essas regras mantém o time organizado e a diretoria confiando nos dados.',
  },
  {
    numero: 17,
    modulo: 'Módulo 4 – Fechamento e regras',
    moduloNumero: 4,
    titulo: 'Suporte e dúvidas',
    conteudo: 'Tem três níveis de ajuda:',
    itensLista: [
      'Este módulo de treinamento — volte sempre que esquecer algo.',
      'A aba "Procedimentos" — tem os POPs (procedimentos padrão) de cada tarefa.',
      'O seu gestor/coordenador — para dúvidas de processo do dia a dia.',
    ],
    tipoLista: 'ordered',
    fechamento: 'Não fique com dúvida: perguntar é sinal de profissionalismo, não de fraqueza.',
  },
  {
    numero: 18,
    modulo: 'Módulo 4 – Fechamento e regras',
    moduloNumero: 4,
    titulo: 'Você está pronto!',
    conteudo:
      'Parabéns! Você completou o treinamento e agora entende o básico de CRM, do nosso sistema e do dia a dia. Pode explorar as telas à vontade. A prática é o melhor professor. Ao clicar em "Concluir treinamento", seu acesso completo será liberado.',
    exemploPratico:
      'Daqui a duas semanas, esse treinamento vai parecer simples. E se surgir dúvida, você sabe onde encontrar ajuda. Sucesso nas suas vendas!',
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
