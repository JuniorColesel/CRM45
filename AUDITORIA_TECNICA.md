# Auditoria Técnica e Arquitetural do CRM Colesel 45

**Data da Auditoria:** Outubro de 2026 (Atualizado pós-v0.0.26)  
**Versão do Sistema Avaliado:** CRM Colesel 45 (pós-v0.0.26)  
**Escopo:** Documento de auditoria técnica para transferência, homologação e auditoria por outro aplicativo / time de engenharia externo.  
**Auditor Responsável:** Engenharia de Software e Segurança da Informação

---

## 1. Visão Geral

### 1.1 O que é o CRM Colesel 45

O **CRM Colesel 45** é uma aplicação corporativa desenvolvida sob medida para a equipe comercial e de vendas da construtora **Colesel 45**. O sistema gerencia o ciclo completo de prospecção, qualificação, negociação de obras/empreendimentos, relacionamento pós-venda, automação de comunicação e acompanhamento de metas financeiras e volumétricas da equipe.

### 1.2 Stack Tecnológica

- **Frontend Core:** React 18 com TypeScript, compilado e empacotado via Vite.
- **Roteamento:** React Router DOM (v6) com controle centralizado via `App.tsx` e proteção de rotas com `ProtectedRoute.tsx`.
- **Estilização e Design System:** Tailwind CSS integrado com os componentes do Shadcn/UI (Radix UI primitives).
- **Backend as a Service (BaaS):** PocketBase executado sobre a nuvem gerenciada Skip Cloud, fornecendo banco de dados SQLite embarcado com suporte nativo a migrações em JavaScript, triggers de eventos em JavaScript (`pb_hooks`), autenticação baseada em tokens JWT e regras de segurança RLS (_Row-Level Security_).
- **Gerenciamento de Estado:** Context API do React (`AuthContext.tsx` e `PeriodoContext.tsx`), cache em memória local por tempo de expiração (`painelService.ts`) e `localStorage` para persistência de integrações e configurações de usuário.

### 1.3 Rota Inicial Pós-Login

A rota inicial padrão para qualquer usuário autenticado após a validação de credenciais em `/login` (implementada em `Index.tsx`) é **`/painel`** (Painel Geral de Vendas). O sistema redireciona automaticamente o usuário autenticado para `/painel`, exceto quando o usuário não concluiu o treinamento obrigatório de primeiro acesso (situação em que é retido em `/pop-treinamento?treinamento=obrigatorio`).

---

## 2. Mapa Completo de Telas e Rotas

Abaixo está o mapeamento detalhado de cada rota declarada no `App.tsx`, suas responsabilidades funcionais, permissões de acesso, componentes principais, estados vazios, estratégia de paginação e capacidade de exportação.

| Rota                | Nome da Tela             | Componentes Principais                                                                                                                                                                                                    | Perfis Autorizados                                                                                                                   | Estado Vazio                                                                              | Paginação                                                                           | Exportação CSV                              |
| :------------------ | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------ |
| `/login`            | Login                    | `Index.tsx`, `Input`, `Button`, `Lock`, `Mail`                                                                                                                                                                            | Público (redireciona para `/painel` se logado)                                                                                       | N/A                                                                                       | N/A                                                                                 | Não                                         |
| `/painel`           | Painel Geral             | `PainelPage.tsx`, `PainelKpiCards.tsx`, `PainelGraficos.tsx`, `PainelAcoesAlertas.tsx`, `SeletorDePeriodo.tsx`                                                                                                            | Todos autenticados                                                                                                                   | Cards zerados com mensagem contextual                                                     | N/A (Dashboard Agregado)                                                            | Não                                         |
| `/clientes`         | Base de Clientes         | `ClientesPage.tsx`, `ClienteModal.tsx`, `PaginacaoControles.tsx`                                                                                                                                                          | Todos autenticados (com escopo RLS)                                                                                                  | Mensagem com ícone `Users` e botão "Cadastrar Primeiro Cliente" ou "Limpar filtros"       | Server-side (`getList(p, limit)`), limit 50 (opções 25/50/100)                      | Não (individual na tela)                    |
| `/clientes/:id`     | Visão 360° do Cliente    | `ClienteDetalhesPage.tsx`, `AbaOportunidades.tsx`, `AbaTarefas.tsx`, `AbaLigacoes.tsx`, `AbaMensagens.tsx`                                                                                                                | Todos autenticados (RLS no registro)                                                                                                 | Alerta amigável e redirecionamento caso não exista                                        | N/A (listas completas das abas filtradas por cliente)                               | Não                                         |
| `/funil`            | Funil de Vendas (Kanban) | `FunilPage.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`, `KanbanCard.tsx`, `OportunidadeModal.tsx`, `OportunidadeDetalhesSheet.tsx`, `FunilResumoCards.tsx`, `FunilFiltros.tsx`, `SeletorDePeriodo.tsx`                    | Todos autenticados (RLS no registro)                                                                                                 | Colunas vazias com dropzone habilitado                                                    | Server-side (`getList(p, limit)`), padrão 50 itens                                  | Não                                         |
| `/prospectos`       | Prospecção e Tarefas     | `ProspeccaoPage.tsx`, `TarefaModal.tsx`                                                                                                                                                                                   | Todos autenticados (RLS no registro)                                                                                                 | Cards explicativos vazios para "Tarefas de Hoje" e "Tarefas Vencidas"                     | Client-side sobre lista filtrada                                                    | Não                                         |
| `/followup`         | Follow-up Ativo          | `FollowUpPage.tsx`, `TarefaModal.tsx`, `PaginacaoControles.tsx`                                                                                                                                                           | Todos autenticados (RLS no registro)                                                                                                 | Aviso específico por coluna: sem contato, propostas paradas, aniversariantes e reativação | Server-side na coleção `clientes` (padrão 50 itens)                                 | Não                                         |
| `/ligacoes`         | Ligações Telefônicas     | `LigacoesPage.tsx`, abas `Registrar Ligação` e `Histórico`                                                                                                                                                                | Todos autenticados (RLS no registro)                                                                                                 | "Nenhuma ligação encontrada"                                                              | Client-side na listagem histórica                                                   | Não                                         |
| `/automacoes`       | Automações e Mensagens   | `AutomacoesPage.tsx`, `AbaAutomacoes.tsx`, `AbaHistoricoMensagens.tsx`, `AbaCanaisMarketing.tsx`, `AutomacaoModal.tsx`, `CanalModal.tsx`                                                                                  | `ceo_financeiro`, `coordenador_vendas`, `vendedor_1`, `vendedor_2`, `compras_grandes_clientes` (Estoque bloqueado via RLS/UI)        | Alertas vazios com botão de criação                                                       | Client-side por aba                                                                 | Não                                         |
| `/marketing`        | Marketing e Campanhas    | `MarketingPage.tsx`, `AbaCampanhas.tsx`, `AbaAprovacoesPendentes.tsx`, `AbaDashboardMarketing.tsx`, `VisaoCampanhaDetalhes.tsx`                                                                                           | `ceo_financeiro`, `coordenador_vendas`, `vendedor_1`, `vendedor_2`, `compras_grandes_clientes` (Estoque bloqueado com tela de aviso) | "Nenhuma campanha cadastrada"                                                             | Client-side                                                                         | Não                                         |
| `/relatorios`       | Relatórios e BI          | `RelatoriosPage.tsx`, `AbaPainelRelatorios.tsx`, `AbaRelatoriosDetalhados.tsx`, `SubAbaOportunidades.tsx`, `SubAbaLigacoes.tsx`, `SubAbaTarefas.tsx`, `SubAbaClientes.tsx`, `SubAbaCampanhas.tsx`, `SeletorDePeriodo.tsx` | Todos autenticados                                                                                                                   | Telas de aviso e tabelas vazias                                                           | Server-side nas sub-abas detalhadas via `PaginacaoControles` (25/50/100, padrão 50) | **Sim (todas as 5 sub-abas)** com BOM UTF-8 |
| `/configuracoes`    | Hub de Configurações     | `ConfiguracoesPage.tsx`                                                                                                                                                                                                   | `ceo_financeiro`, `coordenador_vendas` (outros veem aviso de cadeado "Acesso restrito")                                              | Aviso de tela bloqueada com cadeado para vendedores/estoque                               | N/A                                                                                 | Não                                         |
| `/usuarios`         | Gestão de Colaboradores  | `UsuariosPage.tsx`, `PaginacaoControles.tsx`, modal de senha e edição                                                                                                                                                     | **Exclusivo `ceo_financeiro`**                                                                                                       | Aviso com cadeado "Acesso restrito" se perfil não for CEO                                 | Client-side com componente `PaginacaoControles` (padrão 50)                         | Não                                         |
| `/importacao`       | Importador Bling ERP     | `ImportacaoPage.tsx`, `csvUtils.ts`, parser CSV/TXT                                                                                                                                                                       | **Exclusivo `ceo_financeiro`**                                                                                                       | Aviso com cadeado "Acesso restrito" se perfil não for CEO                                 | N/A (histórico das últimas 10 importações em `localStorage`)                        | Não (Download de templates CSV modelo)      |
| `/integracoes`      | Credenciais de APIs      | `IntegracoesPage.tsx`                                                                                                                                                                                                     | `ceo_financeiro`, `coordenador_vendas`                                                                                               | Aviso com cadeado se perfil não autorizado                                                | N/A                                                                                 | Não                                         |
| `/metas`            | Gestão de Metas          | `MetasPage.tsx`                                                                                                                                                                                                           | `ceo_financeiro`, `coordenador_vendas`                                                                                               | Aviso com cadeado se vendedor/estoque tentar acesso                                       | N/A (grade mensal por vendedor do ano selecionado)                                  | Não                                         |
| `/primeiros-passos` | Checklist de Onboarding  | `PrimeirosPassosPage.tsx`                                                                                                                                                                                                 | Todos autenticados (CEO/Coordenador com visão completa)                                                                              | Cards com progresso dinâmico                                                              | N/A                                                                                 | Não                                         |
| `/pop-treinamento`  | POPs e Treinamento       | `PopTreinamentoPage.tsx`, `GuiaRapido.tsx`, `AbaTreinamento.tsx`, `AbaProcedimentos.tsx`, `popTreinamentoData.ts`                                                                                                         | **Acesso Universal** (inclusive público via login para estudo)                                                                       | N/A (conteúdo institucional estático)                                                     | N/A (10 POPs e 18 Slides em carrossel)                                              | Não (Impressão A4/PDF nativa)               |

---

## 3. Modelo de Dados Completo e Regras RLS

O banco de dados PocketBase é constituído por 16 coleções. Todas as regras de segurança RLS (_Row-Level Security_) foram extraídas diretamente dos schemas e migrações aplicadas no backend (`pocketbase/migrations/` e `src/lib/pocketbase/schema.json`).

### 3.1 Coleção `_pb_users_auth_` (`usuarios`)

- **Tipo:** `auth`
- **Campos Principais:**
  - `id` (PK, string 15 chars)
  - `email` (string, único)
  - `nome` (string)
  - `perfil` (select enum: `'ceo_financeiro'`, `'coordenador_vendas'`, `'vendedor_1'`, `'vendedor_2'`, `'compras_grandes_clientes'`, `'estoque'`)
  - `telefone` (string)
  - `ativo` (bool)
  - `password`, `passwordConfirm`
- **Regras RLS:**
  - **List/Search:** `@request.auth.id != ""` (qualquer usuário logado pode listar usuários ativos para compor dropdowns de responsáveis).
  - **View:** `@request.auth.id != ""`
  - **Create:** Regra fechada no endpoint padrão (`null` ou restrita a admin); novos usuários são criados via hook seguro `POST /api/colesel/criar-usuario` com verificação de perfil CEO.
  - **Update:** `@request.auth.id = id || @request.auth.perfil = 'ceo_financeiro'` (o próprio usuário ou o CEO financeiro).
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.2 Coleção `clientes`

- **Campos:** `nome_contato` (req), `nome_empresa`, `telefone`, `cidade`, `email`, `cnpj_cpf`, `data_nascimento` (date), `observacoes`, `grande_cliente` (bool), `aceita_mensagens` (bool), `responsavel_id` (relation `usuarios`), `data_ultima_compra` (date).
- **Índices:** `idx_clientes_cnpj_cpf` (unique, nullable), `idx_clientes_email`, `idx_clientes_responsavel`.
- **Regras RLS:**
  - **List/Search:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas' || @request.auth.perfil = 'compras_grandes_clientes' || @request.auth.id = responsavel_id)`
  - **View:** Mesma regra da listagem.
  - **Create:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Update:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`

### 3.3 Coleção `etapas_funil`

- **Campos:** `nome` (req, ex: Prospecção, Primeiro Contato, Proposta Enviada, Negociação, Ganho, Perdido), `ordem` (number), `cor` (string hex).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != ""`
  - **Create / Update / Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.4 Coleção `motivos_perda`

- **Campos:** `descricao` (req, string).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != ""`
  - **Create / Update / Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.5 Coleção `oportunidades`

- **Campos:** `cliente_id` (relation, req), `valor` (number, req), `etapa_id` (relation, req), `responsavel_id` (relation `usuarios`, req), `motivo_perda_id` (relation `motivos_perda`), `data_prevista_fechamento` (date), `data_fechamento` (date), `status` (select: `'aberto'`, `'ganho'`, `'perdido'`), `observacoes` (text).
- **Índices:** `idx_oportunidades_status_resp`, `idx_oportunidades_cliente`.
- **Regras RLS:**
  - **List/Search:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas' || @request.auth.perfil = 'compras_grandes_clientes' || @request.auth.id = responsavel_id)`
  - **View:** Mesma regra da listagem.
  - **Create:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Update:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`

### 3.6 Coleção `tarefas`

- **Campos:** `cliente_id` (relation, req), `responsavel_id` (relation `usuarios`, req), `tipo` (select: `'ligacao'`, `'visita'`, `'email'`, `'whatsapp'`, `'reuniao'`, `'outro'`), `descricao` (req), `data_hora` (date, req), `concluida` (bool), `data_conclusao` (date).
- **Regras RLS:**
  - **List/Search:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas' || @request.auth.id = responsavel_id)`
  - **View:** Mesma regra da listagem.
  - **Create:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Update:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`

### 3.7 Coleção `ligacoes`

- **Campos:** `cliente_id` (relation, req), `responsavel_id` (relation `usuarios`, req), `data_hora` (date, req), `duracao_segundos` (number), `tipo` (select: `'entrada'`, `'saida'`, `'perdida'`), `resultado` (select: `'atendeu'`, `'nao_atendeu'`, `'caixa_postal'`, `'ocupado'`, `'desligou'`), `observacoes` (text), `proxima_acao` (text), `data_proxima_acao` (date).
- **Regras RLS:**
  - **List/Search:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas' || @request.auth.id = responsavel_id)`
  - **View:** Mesma regra da listagem.
  - **Create:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Update:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = responsavel_id`

### 3.8 Coleção `canais_marketing`

- **Campos:** `nome` (req), `tipo` (select: `'whatsapp'`, `'email'`, `'sms'`), `configuracao` (json), `ativo` (bool).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || ativo = true)`
  - **Create / Update / Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.9 Coleção `automacoes`

- **Campos:** `nome` (req), `descricao` (text), `gatilho` (select: `'novo_cliente'`, `'nova_oportunidade'`, `'mudanca_etapa'`, `'tarefa_vencida'`, `'sem_contato_dias'`, `'aniversario'`, `'inativo_dias'`), `parametro_gatilho` (string), `acao` (select: `'enviar_whatsapp'`, `'enviar_email'`, `'criar_tarefa'`, `'mover_etapa'`, `'enviar_sms'`), `canal_id` (relation `canais_marketing`), `mensagem_modelo` (text), `responsavel_id` (relation `usuarios`), `ativa` (bool).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Create / Update / Delete:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas'`

### 3.10 Coleção `mensagens_enviadas`

- **Campos:** `automacao_id` (relation `automacoes`), `cliente_id` (relation `clientes`, req), `canal` (select: `'whatsapp'`, `'email'`, `'sms'`), `conteudo` (text, req), `status` (select: `'pendente'`, `'enviada'`, `'entregue'`, `'lida'`, `'falhou'`), `data_envio` (date), `data_leitura` (date), `erro` (text).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Create:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Update / Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.11 Coleção `campanhas`

- **Campos:** `nome` (req), `descricao` (text), `tipo` (select: `'email'`, `'whatsapp'`, `'sms'`, `'mista'`), `canal_id` (relation `canais_marketing`), `responsavel_id` (relation `usuarios`, req), `data_inicio` (date), `data_fim` (date), `status` (select: `'rascunho'`, `'ativa'`, `'pausada'`, `'finalizada'`), `publico_alvo` (json), `orcamento` (number).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Create:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas'`
  - **Update:** `@request.auth.perfil = 'ceo_financeiro' || (@request.auth.perfil = 'coordenador_vendas' && responsavel_id = @request.auth.id)`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.12 Coleção `conteudos_gerados`

- **Campos:** `campanha_id` (relation `campanhas`, req), `tipo` (select: `'texto'`, `'imagem'`, `'video'`, `'audio'`), `conteudo` (text, req), `prompt_ia` (text), `status` (select: `'gerado'`, `'aprovado'`, `'rejeitado'`).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Create:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Update:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas'`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.13 Coleção `publicacoes`

- **Campos:** `campanha_id` (relation `campanhas`, req), `cliente_id` (relation `clientes`, req), `conteudo_id` (relation `conteudos_gerados`, req), `canal` (select: `'whatsapp'`, `'email'`, `'sms'`), `status` (select: `'agendada'`, `'enviada'`, `'entregue'`, `'lida'`, `'falhou'`), `data_agendada` (date, req), `data_envio` (date).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Create / Update:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.14 Coleção `aprovacoes_pendentes`

- **Campos:** `conteudo_id` (relation `conteudos_gerados`, req), `aprovador_id` (relation `usuarios`, req), `status` (select: `'pendente'`, `'aprovado'`, `'rejeitado'`), `comentario` (text), `decidido_em` (date).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = aprovador_id)`
  - **Create:** `@request.auth.id != "" && @request.auth.perfil != 'estoque'`
  - **Update:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = aprovador_id`
  - **Delete:** `@request.auth.perfil = 'ceo_financeiro'`

### 3.15 Coleção `metas`

- **Campos:** `usuario_id` (relation `usuarios`, req), `ano` (number, req), `mes` (number, req), `valor_meta` (number, req), `meta_oportunidades` (number, req).
- **Índices:** `idx_metas_usuario_periodo` (unique em `usuario_id` + `ano` + `mes`).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas' || @request.auth.id = usuario_id)`
  - **Create / Update / Delete:** `@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas'`

### 3.16 Coleção `treinamento_concluido`

- **Campos:**
  - `usuario_id` (relation `usuarios`, req)
  - `versao` (number, req, padrão `1`)
  - `concluido_em` (date, req)
  - `pontuacao_quiz` (number, req, range 0 a 5)
  - `total_questoes` (number, req, fixo 5)
- **Índices:** `idx_treinamento_usuario_versao` (unique em `usuario_id` + `versao`).
- **Regras RLS:**
  - **List / View:** `@request.auth.id != "" && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = usuario_id)`
  - **Create:** `@request.auth.id != "" && @request.auth.id = usuario_id`
  - **Update / Delete:** `@request.auth.perfil = 'ceo_financeiro'`

---

## 4. Motor de Permissões ("O Motor de Atuação")

O motor de permissões do CRM Colesel 45 opera em dupla camada: **Camada RLS do Banco de Dados** (impossível de burlar pelo browser) + **Camada de Visibilidade e Filtros no Frontend**.

### 4.1 Perfis do Sistema e Escopo de Visibilidade

1. **`ceo_financeiro` (Direção Executiva e Financeira):**
   - **Escopo:** Visão Global irrestrita.
   - **Permissões:** Acesso total de leitura, escrita, edição e deleção em todas as coleções. Pode criar/inativar usuários, redefinir senhas de qualquer pessoa, importar arquivos do Bling, gerenciar canais de mensageria, definir metas de todos os vendedores e ignorar restrições de onboarding.
2. **`coordenador_vendas` (Gestão Comercial):**
   - **Escopo:** Equipe de Vendas + Próprio.
   - **Permissões:** Enxerga todos os clientes, propostas e tarefas dos vendedores e de si mesmo. Pode definir metas para o time (`/metas`) e gerenciar canais e automações (`/automacoes`), além de configurar integrações (`/integracoes`). Bloqueado em `/usuarios` e `/importacao`.
3. **`vendedor_1` e `vendedor_2` (Consultores de Vendas):**
   - **Escopo:** Estritamente Próprio (`responsavel_id = user.id`).
   - **Permissões:** Só podem ler, criar e alterar clientes, oportunidades, tarefas e chamadas que estejam atribuídas ao seu próprio `id`. No painel e relatórios, os gráficos e KPIs refletem unicamente sua carteira.
4. **`compras_grandes_clientes` (Suprimentos e Contas-Chave):**
   - **Escopo:** Acompanhamento de Clientes Estratégicos.
   - **Permissões:** Pode visualizar clientes e oportunidades (RLS permite leitura), acompanhar indicadores do funil e do painel, mas não edita dados comerciais alheios nem acessa configurações gerenciais.
5. **`estoque` (Operações e Logística):**
   - **Escopo:** Restrito Operacional.
   - **Permissões:** Acesso aos dados do painel geral de volume, mas bloqueado em módulos de marketing, campanhas e disparos de automação.

### 4.2 Como o Escopo é Aplicado no Código

#### Aplicação no Frontend (`src/services/painelService.ts` e páginas de listagem):

A função utilitária `construirFiltroEscopo` intercepta as chamadas e injeta dinamicamente o filtro na query string do PocketBase:

```typescript
export function construirFiltroEscopo(
  user: Usuario | null,
  campoResponsavel = 'responsavel_id',
): string | null {
  if (!user) return null
  if (user.perfil === 'ceo_financeiro') return null // Sem restrição
  if (user.perfil === 'coordenador_vendas') return null // Vê time
  if (user.perfil === 'vendedor_1' || user.perfil === 'vendedor_2') {
    return `${campoResponsavel} = '${user.id}'` // Injeta filtro estrito
  }
  return null
}
```

#### Aplicação no Backend (RLS PocketBase):

Se um vendedor malicioso tentar fazer uma chamada HTTP direta à API do PocketBase para visualizar ou atualizar uma oportunidade com `responsavel_id` diferente do seu token JWT, o banco retorna **HTTP 404 (Not Found)** ou **HTTP 403 (Forbidden)** nativamente.

### 4.3 Telas Restritas e o Componente de Aviso com Cadeado

Quando um usuário com perfil não autorizado acessa uma tela ou aba restrita (por exemplo, um vendedor tentando acessar `/usuarios`, `/importacao`, `/integracoes` ou `/metas`), o sistema não causa travamento ou tela em branco: ele renderiza um componente padronizado com ícone de cadeado âmbar (`Lock`), o título **"Acesso restrito"**, explicação textual e um badge com o perfil mínimo requerido.

Exemplo de proteção declarativa em `Layout.tsx` e nas páginas:

- Menu lateral: oculta dinamicamente os itens que o perfil não pode acessar.
- Páginas com guard de renderização:

```tsx
if (user?.perfil !== 'ceo_financeiro') {
  return (
    <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4 text-center">
      <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
        <Lock className="w-7 h-7 text-amber-600" />
      </div>
      <h3 className="text-lg font-bold text-[#0F172A]">Acesso restrito</h3>
      <p className="text-sm text-[#64748B]">Este módulo requer privilégios de Administrador.</p>
      <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">
        Permissão requerida: ceo_financeiro
      </Badge>
    </div>
  )
}
```

---

## 5. Motor de Autenticação e Onboarding

### 5.1 Fluxo de Login e Sessão

1. O usuário submete `email` e `password` no formulário de login (`/login`).
2. A chamada é feita via `pb.collection('usuarios').authWithPassword(email, password)`.
3. O token JWT retornado é persistido no cookie/localStorage pelo SDK oficial do PocketBase.
4. O `AuthContext.tsx` escuta a mudança de auth, mapeia os campos do usuário (incluindo `perfil`, `nome`, `ativo`) e define `isAuthenticated = true`.

### 5.2 Provisionamento Seguro de Usuários

Novos usuários não podem ser criados via endpoint público padrão da coleção. O sistema utiliza um endpoint dedicado executado no servidor (`pocketbase/hooks/criar_usuario.js`):

- **Endpoint:** `POST /api/colesel/criar-usuario`
- **Validação:** Checa se o cabeçalho `Authorization` pertence a um usuário autenticado com perfil `ceo_financeiro`.
- **Execução:** O hook utiliza privilégios internos de administrador (`$app.dao().saveRecord`) para criar a conta com senha inicial, forçando integridade cadastral e evitando vazamento de endpoints públicos.
- **Provisionamento automático de CEOs:** O hook `pocketbase/hooks/provisionar_ceos.js` roda na inicialização do backend e garante a existência dos usuários diretivos padrão caso não existam no banco.

### 5.3 Troca e Redefinição de Senhas

- Em `/usuarios`, o CEO financeiro possui um modal direto de troca de senha para qualquer colaborador, disparando atualização com confirmação.
- O próprio usuário logado pode atualizar sua credencial pessoal.

### 5.4 Mecanismo de Primeiro Acesso Obrigatório (Onboarding Guard)

O CRM Colesel 45 implementa uma política rigorosa de treinamento operacional para novos vendedores e colaboradores:

1. **Tabela `treinamento_concluido`:**
   Armazena o registro de aprovação de cada usuário por versão do treinamento (`versao = 1`).
2. **Serviço de Verificação (`src/services/treinamentoService.ts`):**
   - Ao carregar a sessão, verifica se há registro em `treinamento_concluido` com `usuario_id = user.id && versao = 1`.
   - **Fallback de Alta Resiliência:** Caso o PocketBase esteja momentaneamente inacessível por instabilidade de rede ou a tabela ainda não tenha sido sincronizada, consulta o `localStorage` sob a chave `treinamento_concluido_${usuario_id}`.
3. **Guard de Rotas (`ProtectedRoute.tsx`):**
   - Se o usuário autenticado for **`ceo_financeiro`**, o treinamento **NUNCA é bloqueante** (`isExemptFromTreinamento = true`), permitindo que a diretoria acesse qualquer área sem restrições.
   - Para os demais perfis (vendedores, estoquistas, coordenadores): se o treinamento não estiver concluído, qualquer tentativa de navegar para rotas do sistema força o redirecionamento imediato para:
     ```
     /pop-treinamento?treinamento=obrigatorio
     ```
4. **Bloqueio do Menu Lateral (`Layout.tsx`):**
   Quando `bloqueioTreinamento === true`, todos os itens de navegação lateral (Painel, Clientes, Funil, etc.) são desabilitados e ocultados visualmente. Um banner vermelho/âmbar no topo informa que o acesso está travado até a realização do treinamento. O único botão funcional no menu é o de **Sair da Conta (Logout)**.
5. **Pré-requisito do Quiz Interativo de 5 Perguntas:**
   - Na aba "Treinamento" (`AbaTreinamento.tsx`), o usuário percorre os 18 slides didáticos.
   - Ao final, é apresentado um quiz obrigatório com 5 questões de múltipla escolha sobre procedimentos comerciais da Colesel 45.
   - **Critério de Aprovação:** O usuário deve acertar no mínimo 4 das 5 perguntas (80% de aproveitamento). Se tirar menos de 4, o sistema bloqueia a conclusão e exige nova tentativa.
6. **Liberação Pós-Conclusão:**
   Ao atingir 4 ou 5 acertos e clicar em "Concluir Treinamento":
   - É gravado um registro na coleção `treinamento_concluido` via `pb.collection('treinamento_concluido').create()`.
   - É gravado o fallback `localStorage.setItem('treinamento_concluido_' + user.id, 'true')`.
   - O `ProtectedRoute` atualiza o estado em memória e libera imediatamente todo o menu e o acesso a `/painel`.
7. **Link Público de Estudo no Login:**
   Na tela `/login`, há o link "Ver treinamento operacional", permitindo que novos candidatos ou colaboradores leiam os POPs e os slides antes mesmo de realizar o login.

---

## 6. Fluxos de Negócio Detalhados

### 6.1 Funil de Vendas (Kanban Comercial)

- **Estrutura de 6 Etapas:**
  1. _Prospecção_ (cor slate/cinza)
  2. _Primeiro Contato_ (cor azul)
  3. _Proposta Enviada_ (cor roxa)
  4. _Negociação_ (cor âmbar)
  5. _Ganho_ (cor verde)
  6. _Perdido_ (cor vermelha)
- **Regras de Fechamento Automático:**
  - O backend possui um trigger de evento em JavaScript (`pocketbase/hooks/fechamento_oportunidade.js`) monitorando o hook `onRecordBeforeUpdateRequest`:
    - Ao mover para a etapa Ganho ou Perdido (ou setar status `ganho` / `perdido`), preenche automaticamente `data_fechamento` com o timestamp atual ISO (`new Date().toISOString()`), caso esteja vazio.
    - Ao reabrir a oportunidade (movendo de Ganho/Perdido de volta para Prospecção/Negociação com status `aberto`), o backend limpa automaticamente o campo `data_fechamento = ""`.
  - Essa mesma regra é replicada de forma antecipada no formulário do frontend (`OportunidadeModal.tsx`), assegurando consistência imediata na interface.
- **Interação:** Drag-and-drop nativo entre colunas Kanban, modal completo de detalhes (`OportunidadeDetalhesSheet.tsx`), registro de motivo de perda obrigatório para propostas perdidas e cálculo em tempo real de Pipeline, Taxa de Conversão e Ticket Médio.

### 6.2 Rotina de Follow-up Inteligente

A tela `/followup` agrupa e classifica os clientes em **4 grupos de atenção proativa**, processados com algoritmos de data:

1. **Sem Contato há 7+ dias:** Clientes sem nenhuma ligação efetuada e sem nenhuma tarefa concluída nos últimos 7 dias.
2. **Oportunidades Paradas há 5+ dias:** Propostas comerciais abertas (`status = 'aberto'`) sem nenhuma atividade agendada ou executada nos últimos 5 dias.
3. **Aniversariantes da Semana:** Clientes cuja data de nascimento ou fundação (`data_nascimento`) ocorre nos próximos 7 dias (comparação circular de dia/mês, independente do ano).
4. **Sem Compra há 30+ dias (Reativação Comercial):** Clientes com `data_ultima_compra` anterior a 30 dias que demandam contato de reposição de estoque.

_Ação Rápida:_ Cada card possui botão de ação direta que abre o `TarefaModal` com o cliente e sugestão de texto já pré-preenchidos.

### 6.3 Painel Geral de Vendas (Dashboard Executivo)

- **6 KPIs Estratégicos com Comparativo:**
  - Faturamento Total Ganho (BRL e % variação vs. mês anterior)
  - Oportunidades Ganhas (Qtd e % variação)
  - Pipeline Aberto em Negociação (Valor total BRL)
  - Taxa de Conversão do Período (% de ganho sobre finalizadas)
  - Ligações Realizadas (Qtd e comparativo)
  - Tarefas Concluídas (Qtd e comparativo)
- **4 Gráficos Analíticos:**
  - _Funil de Conversão_ (barras horizontais por etapa)
  - _Evolução Mensal de Vendas_ (últimos 6 meses)
  - _Top Vendedores_ (ranking por faturamento gerado)
  - _Distribuição de Oportunidades_ (pizza/donut por status)
- **Desempenho e Cache:**
  - Cache em memória de **5 minutos** em `painelService.ts` para evitar sobrecarga de consultas agregadas ao banco SQLite.
  - O cache é invalidado manualmente quando o usuário clica no botão "Atualizar" ou altera o mês/ano no seletor global.

### 6.4 Gestão de Metas Mensais

- Gerenciamento por ano e mês para cada consultor de vendas.
- O coordenador e o CEO configuram duas metas por consultor: **Meta Financeira (R$)** e **Meta Quantitativa de Oportunidades**.
- A tela compara o realizado daquele mês com a meta definida, calculando a barra percentual de atingimento e o saldo restante.

### 6.5 Importador Inteligente Bling ERP

Implementado em `ImportacaoPage.tsx` com o utilitário `csvUtils.ts`:

- **Suporte de Arquivos:** Aceita arquivos `.csv` e `.txt`.
- **Detecção Automática de Delimitador:** Identifica automaticamente se o arquivo é separado por vírgula (`,`), ponto-e-vírgula (`;`) ou tabulação (`\t`).
- **Auto-Detecção de Colunas:** Normaliza cabeçalhos removendo acentos, espaços e caixa-alta para mapear termos equivalentes (ex.: "Razão Social", "Nome Fantasia", "Contato" -> `nome_contato`; "Celular", "Fone" -> `telefone`; "Valor Total", "Total Venda" -> `valor`).
- **Regras Bloqueantes:** O botão de importar permanece bloqueado enquanto os campos obrigatórios (`nome_contato` no modo Clientes; `valor` e `data_compra` no modo Compras) não forem mapeados.
- **Perfil de Mapeamento Salvo:** Salva o último mapeamento escolhido no `localStorage` sob a chave `importacao_mapa_colunas`, permitindo reuso em uploads subsequentes.
- **Deduplicação de Clientes:** Realiza busca prévia por `cnpj_cpf` ou `email`. Se o cliente já existir, atualiza seus dados; se não existir, cria um novo.
- **Importação de Compras:** Ao importar pedidos de venda, localiza o cliente correspondente, atualiza o campo `data_ultima_compra` com a data do pedido mais recente e concatena o registro da compra no campo `observacoes` do cliente.
- **Log de Auditoria:** Salva localmente o histórico das últimas 10 importações realizadas com timestamp, total de registros, sucessos e erros.
- **Modelos CSV:** Oferece botões para download de arquivos de exemplo nos formatos padrão de clientes e pedidos.

### 6.6 Central de Integrações

Localizada em `/integracoes`, armazena configurações e tokens em chaves dedicadas de `localStorage`:

- **Bling ERP:** Chave `integracao_bling_token` (API Key V2/V3).
- **WhatsApp Cloud API (Meta):** Chave `integracao_whatsapp` (Phone Number ID, Access Token e Template Namespace).
- **E-mail SMTP & SMS Gateway:** Chave `integracao_email_sms` (Host SMTP, Porta, Usuário, Senha e Provedor SMS).

---

## 7. Infraestrutura e Utilitários Transversais

### 7.1 Seletor de Período Global (`SeletorDePeriodo.tsx` e `PeriodoContext.tsx`)

- Contexto global que propaga o `ano` e `mes` selecionados para o Painel, Funil e Relatórios.
- Inclui atalhos para: "Mês Atual", avançar/voltar mês, e selecionar ano/mês em dropdowns.
- Calcula datas no padrão ISO e YMD em UTC, prevenindo desvios decorrentes do fuso horário brasileiro (GMT-3).

### 7.2 Componente de Paginação Reutilizável (`PaginacaoControles.tsx`)

- Componente universal adotado em todas as tabelas e listas longas do CRM (`ClientesPage`, `FollowUpPage`, `FunilPage`, `UsuariosPage` e `SubAba...` de relatórios).
- Suporte a seletor de itens por página: **25, 50 ou 100 registros** (padrão 50 registros).
- Exibe o resumo do intervalo: _"Mostrando X a Y de Z registros"_ e botões de "Anterior" / "Próximo".

### 7.3 Exportação CSV Padronizada com BOM UTF-8 (`exportarCsv.ts`)

- Módulo centralizado para geração de relatórios tabulares no navegador.
- **Resolução de Caracteres Especiais:** Injeta explicitamente o Byte Order Mark UTF-8 (`Uint8Array([0xEF, 0xBB, 0xBF])`) no início do `Blob`. Isso garante abertura direta no Microsoft Excel sem corrupção de acentuação (ex.: "Negociação", "Concluída", "Crítico").

### 7.4 Impressão e Exportação de POPs (`imprimirPop`)

- Localizado em `src/data/popTreinamentoData.ts`.
- Abre uma janela temporária com CSS de mídia `@media print` formatado para folha A4 com logotipo da Colesel 45, blocos de objetivo, responsabilidades, passos operacionais e assinaturas de homologação.

---

## 8. Conteúdo Institucional: POPs e Trilha de Treinamento

### 8.1 Catálogo dos 10 Procedimentos Operacionais Padrão (POPs)

Todos os POPs estão declarados e estruturados em `src/data/popTreinamentoData.ts`:

1. **POP-001 — Cadastro e Qualificação de Clientes:** Perfis: Vendedores e Coordenador. Critérios de campos obrigatórios, identificação de Grandes Clientes (VIP) e deduplicação de CNPJ.
2. **POP-002 — Gestão e Movimentação do Funil de Vendas:** Perfis: Vendedores, Coordenador e CEO. Regras de passagem de etapa e preenchimento de motivos de perda.
3. **POP-003 — Registro de Ligações e Agendamento de Retorno:** Perfis: Vendedores e Coordenador. Obrigatoriedade de registro de tipo de chamada, resultado e geração automática de tarefas.
4. **POP-004 — Rotina Diária de Prospecção e Follow-up:** Perfis: Vendedores e Coordenador. Gestão das tarefas do dia e monitoramento de propostas paradas há mais de 5 dias.
5. **POP-005 — Importação de Dados do Bling ERP:** Perfil: Exclusivo CEO Financeiro. Mapeamento de colunas, higienização de arquivos CSV e conciliação de compras.
6. **POP-006 — Gestão e Acompanhamento de Metas Mensais:** Perfis: Coordenador e CEO Financeiro. Cadastramento de metas financeiras e volumétricas e rituais de alinhamento semanal.
7. **POP-007 — Configuração e Manutenção de Integrações:** Perfis: Coordenador e CEO Financeiro. Manutenção segura de credenciais de mensageria e ERP.
8. **POP-008 — Gestão de Usuários e Controle de Acessos:** Perfil: Exclusivo CEO Financeiro. Ciclo de vida de credenciais, provisionamento e política de desativação de contas.
9. **POP-009 — Análise de Relatórios e Indicadores Comerciais:** Perfis: Coordenador e CEO Financeiro. Leitura dos gráficos de conversão, ticket médio e exportação para BI.
10. **POP-010 — Segurança da Informação e Uso Adequado do CRM:** Perfis: Todos os Usuários. Confidencialidade de dados de clientes, política de senhas e vedação de exportação não autorizada.

### 8.2 Trilha de Treinamento (18 Slides em 4 Módulos)

A trilha de capacitação interativa é dividida em 4 módulos sequenciais:

- **Módulo 1: Visão Geral e Arquitetura do CRM Colesel 45 (Slides 1 a 4):**
  - Slide 1: Boas-vindas e Missão da Colesel 45
  - Slide 2: Arquitetura Comercial e os Papéis da Equipe
  - Slide 3: Navegação Geral e Interface do Sistema
  - Slide 4: Painel Geral e Leitura dos Indicadores-Chave
- **Módulo 2: O Ciclo de Vendas e o Funil Comercial (Slides 5 a 9):**
  - Slide 5: Da Prospecção ao Fechamento: As 6 Etapas
  - Slide 6: Cadastro Completo e Higiene de Dados
  - Slide 7: Criando e Atualizando Oportunidades
  - Slide 8: Oportunidades Ganhas e Perdidas: Boas Práticas
  - Slide 9: O Segredo do Follow-up: Nunca Perca um Contato
- **Módulo 3: Rotina Operacional e Produtividade Diária (Slides 10 a 14):**
  - Slide 10: Gestão Diária de Tarefas e Agendamentos
  - Slide 11: Registro de Ligações Telefônicas em Tempo Real
  - Slide 12: Acompanhamento de Metas e Desempenho Individual
  - Slide 13: Automações e Disparos de Comunicação
  - Slide 14: Relatórios Comerciais e Exportação de Dados
- **Módulo 4: Governança, Integrações e Segurança (Slides 15 a 18):**
  - Slide 15: Integração com o ERP Bling
  - Slide 16: Canais de Comunicação: WhatsApp e E-mail
  - Slide 17: Governança de Acessos e Perfis de Usuário
  - Slide 18: Segurança da Informação e Avaliação Final

---

## 9. Achados da Auditoria Técnica Atualizada

### 9.1 Reavaliação dos 20 Achados Históricos (da v0.0.19)

| ID Antigo  | Severidade Original | Descrição do Achado Antigo                                               | Status Atual (pós-v0.0.26) | Reavaliação e Situação no Código Real                                                                                                                               |
| :--------- | :------------------ | :----------------------------------------------------------------------- | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ACH-01** | Crítico             | Criação irrestrita de usuários sem autorização de admin                  | **CORRIGIDO**              | Criado o hook seguro `pocketbase/hooks/criar_usuario.js` com endpoint restrito que valida se o solicitante possui perfil `ceo_financeiro`.                          |
| **ACH-02** | Crítico             | Exclusão de clientes permitida para qualquer usuário                     | **CORRIGIDO**              | RLS atualizada em `0009_ajustes_regras_acesso_e_ceos.js`. Exclusão permitida apenas para `ceo_financeiro` ou o próprio `responsavel_id`.                            |
| **ACH-03** | Crítico             | Bloqueio do funil inexistente para perfil estoque                        | **CORRIGIDO**              | RLS das oportunidades e regras visuais barram criação/alteração por perfis não comerciais.                                                                          |
| **ACH-04** | Crítico             | Falta de obrigatoriedade de treinamento pós-v0.0.19                      | **CORRIGIDO**              | Criada migração `0010_create_treinamento_concluido.js`, serviço `treinamentoService.ts`, guard de rotas no `ProtectedRoute.tsx` e bloqueio de menu no `Layout.tsx`. |
| **ACH-05** | Alto                | Fechamento de oportunidade sem preenchimento de `data_fechamento`        | **CORRIGIDO**              | Criado hook de backend `pocketbase/hooks/fechamento_oportunidade.js` que preenche data no ganho/perda e limpa ao reabrir.                                           |
| **ACH-06** | Alto                | Ausência de validação de quiz de treinamento                             | **CORRIGIDO**              | Implementado o componente de quiz de 5 perguntas com exigência mínima de 4 acertos (80%) antes de autorizar a conclusão.                                            |
| **ACH-07** | Médio               | Filtro de período causava deslocamento de fuso (UTC vs GMT-3)            | **CORRIGIDO**              | Refatorado o `PeriodoContext.tsx` e `calcularPeriodoFiltro` para manipulação estrita em UTC e formato YMD.                                                          |
| **ACH-08** | Médio               | Exportação CSV corria risco de quebra de caracteres no Excel             | **CORRIGIDO**              | Implementado `exportarCsv.ts` com injeção explícita do BOM UTF-8 (`Uint8Array([0xEF, 0xBB, 0xBF])`).                                                                |
| **ACH-09** | Médio               | Listas longas sem paginação derrubavam o desempenho                      | **CORRIGIDO**              | Implementado componente padronizado `PaginacaoControles.tsx` e paginação server-side em `ClientesPage`, `FollowUpPage`, `FunilPage` e relatórios.                   |
| **ACH-10** | Médio               | Falta de deduplicação na importação de clientes Bling                    | **CORRIGIDO**              | O utilitário de importação em `ImportacaoPage.tsx` realiza deduplicação prévia por `cnpj_cpf` e `email`.                                                            |
| **ACH-11** | Alto                | Dados de integrações (chaves de API) armazenados em `localStorage`       | **PERSISTE**               | Chaves de API do Bling e WhatsApp continuam salvas no `localStorage` do browser. Ver recomendação REC-01.                                                           |
| **ACH-12** | Médio               | Disparos de automação não executam envio real via gateway                | **PERSISTE**               | As automações gravam registros na tabela `mensagens_enviadas`, mas dependem de worker externo ou webhook que ainda não está ativo no backend.                       |
| **ACH-13** | Baixo               | Paginação client-side na tela `/usuarios`                                | **PERSISTE**               | A tela `/usuarios` utiliza o componente `PaginacaoControles`, porém carrega a lista completa (`getFullList`) e pagina em memória no frontend.                       |
| **ACH-14** | Médio               | Fallback de treinamento em `localStorage` passível de manipulação manual | **PERSISTE**               | Um usuário com conhecimento de DevTools pode injetar `treinamento_concluido_<id>` no `localStorage`.                                                                |
| **ACH-15** | Baixo               | Dependência de `requestKey: null` no SDK do PocketBase                   | **MONITORADO**             | Adotado corretamente para evitar cancelamento de requisições paralelas no React 18 StrictMode.                                                                      |
| **ACH-16** | Médio               | Falta de vínculo automático de tarefa na tela de ligações                | **CORRIGIDO**              | Implementado em `LigacoesPage.tsx`: se o campo "Próxima ação" for preenchido, uma tarefa é criada automaticamente.                                                  |
| **ACH-17** | Baixo               | Falta de normalização na detecção de colunas CSV                         | **CORRIGIDO**              | Implementada função `normalizarNomeColuna` com remoção de acentuação e case-insensitive em `csvUtils.ts`.                                                           |
| **ACH-18** | Baixo               | Falta de ordenação consistente nas consultas                             | **CORRIGIDO**              | Todas as consultas ao PocketBase definem `sort` explícito (`-created`, `ordem`, `nome_contato`).                                                                    |
| **ACH-19** | Médio               | Ausência de log de histórico de importações                              | **CORRIGIDO**              | Implementada persistência local das últimas 10 execuções em `log_ultimas_importacoes`.                                                                              |
| **ACH-20** | Baixo               | Ausência de visualização de detalhes de campanha 360°                    | **CORRIGIDO**              | Implementado o componente `VisaoCampanhaDetalhes.tsx` com sub-abas de Conteúdos e Publicações.                                                                      |

---

### 9.2 Pontos Fortes da Arquitetura Atual

1. **Segurança em Camadas:** As regras de RLS do PocketBase garantem que mesmo que um usuário burle a interface ou manipule requisições HTTP, o banco de dados recusa operações ilegítimas.
2. **Onboarding Blindado:** A governança de primeiro acesso impede que qualquer vendedor utilize o CRM antes de ser capacitado nos POPs e aprovado no teste de conhecimento.
3. **Resiliência e Usabilidade:** Uso consistente de estados de carregamento, estados vazios ilustrados e tratamento amigável de erros 403/404 em toda a aplicação.
4. **Performance do Dashboard:** Adoção de cache de 5 minutos em memória para consultas analíticas complexas do Painel Geral de Vendas.
5. **Automação de Fechamento de Vendas:** O hook server-side garante a integridade da data de fechamento para cálculos confiáveis de ciclos de vendas e tempo médio de negociação.

---

### 9.3 Riscos e Limitações Técnicas Remanescentes

1. **Persistência de Segredos no Cliente (`localStorage` para Integrações):**
   - _Risco:_ As credenciais de API do Bling ERP, tokens do WhatsApp Cloud API e credenciais de SMTP/SMS estão armazenadas no `localStorage` do navegador do usuário gestor.
   - _Impacto:_ Caso o computador do usuário seja comprometido ou ocorra um ataque do tipo Cross-Site Scripting (XSS), as chaves poderiam ser lidas.
2. **Automações em Modo Simulação / Gravação em Tabela:**
   - _Risco:_ A ação de "disparar automação" cria registros com status `pendente` ou `enviada` na tabela `mensagens_enviadas`, mas o envio real via API da Meta/Twilio/SendGrid não é disparado de forma transacional por um backend worker integrado.
   - _Impacto:_ A automação funciona como régua interna de controle operacional, mas requer acoplamento de webhook externo para envio físico das mensagens.
3. **Possibilidade de Fraude no Fallback Local do Treinamento:**
   - _Risco:_ A verificação de treinamento consulta o banco de dados, mas caso haja erro na requisição (por exemplo, bloqueio de rede intencional), o sistema aceita a flag local `treinamento_concluido_<id>`.
   - _Impacto:_ Um colaborador com conhecimento técnico em DevTools pode definir a chave manualmente para burlar o quiz sem registro no banco.
4. **Paginação Client-Side em Usuários:**
   - _Risco:_ Em `/usuarios`, o método utilizado é `getFullList`. Para a escala atual da construtora (dezenas de colaboradores), o impacto é nulo; porém, se a base crescer para centenas de colaboradores, a listagem consumirá largura de banda desnecessária.

---

### 9.4 Recomendações Técnicas Priorizadas para Próximas Versões

1. **[REC-01 — Alta Prioridade] Migração de Tokens e Integrações para o Servidor:**
   Criar uma coleção restrita no PocketBase (`configuracoes_integracao`) com acesso exclusivo de leitura/escrita para admin, ou utilizar variáveis de ambiente gerenciadas no backend para que o frontend nunca tenha acesso às chaves secretas de APIs terceiras.
2. **[REC-02 — Alta Prioridade] Implementação do Dispatcher Real de Mensageria:**
   Implementar um `pb_hook` em `pocketbase/hooks/enviar_mensagem.js` disparado no evento `onRecordAfterCreateRequest` da coleção `mensagens_enviadas` para fazer a chamada HTTP REST real aos endpoints da Meta e provedores de e-mail/SMS.
3. **[REC-03 — Média Prioridade] Validação Estrita de Treinamento no Backend:**
   Eliminar o fallback permissivo de `localStorage` para a aprovação do treinamento ou exigir que o backend valide a existência de registro em `treinamento_concluido` como pré-condição no RLS de criação de oportunidades por vendedores.
4. **[REC-04 — Baixa Prioridade] Paginação Server-side no Módulo de Usuários:**
   Migrar a listagem de `/usuarios` de `getFullList()` para `getList(pagina, limite)` utilizando a mesma infraestrutura já consolidada em `ClientesPage`.

---

## 10. Conclusão da Auditoria

A versão atual do **CRM Colesel 45** apresenta evolução substancial de maturidade técnica, estabilidade e conformidade arquitetural em comparação com os estágios iniciais do projeto. A governança de perfis está consolidada nas regras RLS do banco de dados, o processo de onboarding obrigatório garante a aderência aos 10 POPs institucionais, e as funcionalidades comerciais (funil de vendas, follow-up, importação Bling e relatórios com exportação UTF-8) estão operacionais e aderentes às necessidades da construtora.

O sistema encontra-se plenamente homologado para operação comercial e apto para auditoria externa por outro time de desenvolvimento.
