# Relatório de Auditoria Técnica Completa — CRM Comercial Colesel 45

**Data da Auditoria:** 24 de Maio de 2025  
**Versão da Aplicação:** v0.0.18  
**Destinatário:** IA Executora de Correções / Equipe de Engenharia  
**Escopo:** Auditoria estática e diagnóstica de ponta a ponta (Banco de Dados, Migrações, RLS, Backend/Hooks, Autenticação, Rotas, Páginas, Regras de Negócio, Performance, Infraestrutura e Segurança).  
**Finalidade:** Diagnóstico exaustivo e acionável. Nenhuma correção foi aplicada nesta execução; cada item possui localização exata, impacto e prescrição técnica autocontida para aplicação direta.

---

## 1. Resumo Executivo

O CRM Comercial **Colesel 45** é uma aplicação corporativa moderna construída em React 19 + TypeScript + Vite + Tailwind CSS/shadcn com backend PocketBase na infraestrutura Skip Cloud. A aplicação atende a fluxos críticos de vendas B2B: gestão de clientes, funil kanban, registro telefônico, automação multicanal, marketing institucional e metas financeiras.

A auditoria revelou que a aplicação possui uma base visual e conceitual sólida, porém com **vulnerabilidades de segurança graves, incoerências severas de regras de acesso (RLS) e riscos de integridade operacional** que devem ser sanados antes do uso em produção:

1. **Gestão de Usuários e Autenticação (Crítico):** A coleção nativa `usuarios` não possui `createRule` nem `deleteRule` no PocketBase (`null`). Como resultado, qualquer tentativa de cadastrar ou excluir usuários pelo frontend em `/usuarios` falhará com erro `403 Forbidden` para qualquer usuário que não seja superusuário do banco. Além disso, há uma senha mestre hardcoded no código client-side (`Skip@Pass45#`) e um `useEffect` no client que tenta auto-provisionar contas de diretores caso não existam.
2. **Brecha de Integridade em Metas (Crítico):** A `updateRule` da coleção `metas` contém a cláusula `@request.auth.id = usuario_id`, permitindo que vendedores alterem arbitrariamente seus próprios alvos de faturamento e metas de propostas ganhas.
3. **Incompatibilidade Hierárquica em RLS (Alto):** O perfil `coordenador_vendas` não possui permissão de escrita/exclusão em `clientes`, `oportunidades`, `tarefas` e `ligacoes` de sua equipe, pois as regras de API exigem estritamente `responsavel_id = @request.auth.id` ou `perfil = 'ceo_financeiro'`.
4. **Desconexão de Estado no Backend Hook (Alto):** O hook PocketBase `fechamento_oportunidade.js` preenche `data_fechamento` quando o status vira `ganho` ou `perdido`, mas **não limpa** o campo se a oportunidade for reaberta (`status = 'aberto'`), poluindo os relatórios e distorcendo a taxa de conversão.
5. **Decisões de Produto Respeitadas:** As rotas administrativas (`/usuarios`, `/importacao`, `/metas`, `/primeiros-passos`) não constam no menu lateral principal por decisão deliberada do produto. Os módulos `/painel` e `/configuracoes` permanecem como telas de planejamento (`ModulePlaceholder`), o que é decisão consciente do roadmap e não deve ser modificado.

---

## 2. Banco de Dados e Migrações

### 2.1 Análise das Migrações Existentes (0001 a 0008)

O projeto possui 8 migrações em `pocketbase/migrations/`:

- `0001_create_usuarios.js`: Coleção do tipo `auth` (`usuarios`), campos `nome` (text), `perfil` (select), `ativo` (bool).
- `0002_seed_usuario_ceo.js`: Seed do primeiro usuário administrador (`junior.colesel@coleselengenharia.com`).
- `0003_create_tabelas_principais.js`: Coleções `etapas_funil` e `motivos_perda`.
- `0004_create_clientes.js`: Coleção `clientes` com dados cadastrais, responsável e campos de controle.
- `0005_create_oportunidades_tarefas_ligacoes.js`: Coleções centrais da esteira comercial (`oportunidades`, `tarefas`, `ligacoes`).
- `0006_create_automacoes_mensagens_canais.js`: Coleções do ecossistema de réguas e canais (`canais_marketing`, `automacoes`, `mensagens_enviadas`).
- `0007_create_campanhas_conteudos_publicacoes_aprovacoes.js`: Módulos de marketing (`campanhas`, `conteudos_gerados`, `publicacoes`, `aprovacoes_pendentes`).
- `0008_create_metas.js`: Coleção `metas` com index único composto `idx_metas_usuario_ano_mes`.

### 2.2 Inventário de Achados de Banco de Dados

#### [BD-01 CRÍTICO] Ausência de `createRule` e `deleteRule` na coleção `usuarios`

- **Localização:** `pocketbase/migrations/0001_create_usuarios.js`, linhas 63–66.
- **Descrição:** A coleção `usuarios` foi configurada com:
  ```javascript
  collection.listRule = "@request.auth.id != ''"
  collection.viewRule = "@request.auth.id != ''"
  collection.updateRule = "@request.auth.perfil = 'ceo_financeiro' || @request.auth.id = id"
  collection.deleteRule = null
  // createRule não declarada -> padrão do PocketBase é null
  ```
- **Impacto:** Como `createRule` e `deleteRule` são `null`, **somente superusuários do PocketBase (Admin Dashboard)** podem criar ou deletar registros via API REST. A página `/usuarios`, destinada ao `ceo_financeiro`, falha com HTTP `403 Forbidden` ao submeter um novo colaborador ou ao tentar excluir um colaborador desligado.
- **Correção Proposta:** Criar nova migração `0009_fix_usuarios_rules.js`:
  ```javascript
  migrate(
    (app) => {
      const col = app.findCollectionByNameOrId('usuarios')
      col.createRule = "@request.auth.perfil = 'ceo_financeiro'"
      col.deleteRule = "@request.auth.perfil = 'ceo_financeiro' && @request.auth.id != id"
      app.save(col)
    },
    (app) => {
      const col = app.findCollectionByNameOrId('usuarios')
      col.createRule = null
      col.deleteRule = null
      app.save(col)
    },
  )
  ```

#### [BD-02 MÉDIO] Duplicação de colunas de timestamp (`criado_em` / `atualizado_em` vs `created` / `updated`)

- **Localização:** Todas as migrações (0003 a 0008) e interfaces em `src/types/clientes.ts`.
- **Descrição:** As coleções definem campos de texto explícitos `criado_em` e `atualizado_em`, enquanto o PocketBase já gera e mantém de forma automática e imutável os campos nativos `created` e `updated` (em UTC ISO 8601). Em muitos pontos do frontend, os desenvolvedores populam manualmente `criado_em: new Date().toISOString()`, havendo concorrência e divergência de fusos.
- **Impacto:** Desperdício de payload de rede, risco de inconsistência quando atualizações ocorrem via backend ou integrações futuras que não preenchem os campos customizados.
- **Decisão / Prescrição:** _Decisão de Produto:_ Não remover os campos existentes para evitar breaking changes em registros legados já persistidos. Contudo, deve-se padronizar o frontend para usar `record.created` e `record.updated` como fontes de verdade primárias, tratando `criado_em` como fallback retrocompatível.

#### [BD-03 BAIXO] Inconsistência de gênero nos campos de data da coleção `automacoes`

- **Localização:** `pocketbase/migrations/0006_create_automacoes_mensagens_canais.js`, linhas 67–75.
- **Descrição:** Enquanto todas as outras coleções usam `criado_em` e `atualizado_em`, a coleção `automacoes` declarou `criada_em` e `atualizada_em` (flexionados no feminino).
- **Impacto:** Erros de tipagem sutil ao manipular records de automações dinamicamente ou em relatórios unificados.
- **Correção Proposta:** Manter o campo no backend por retrocompatibilidade ou criar migração que renomeie os campos, ajustando a interface `AutomacaoModel` em `src/types/clientes.ts`.

#### [BD-04 ALTO] Granularidade do campo `oportunidades.data_fechamento` como tipo `date`

- **Localização:** `pocketbase/migrations/0005_create_oportunidades_tarefas_ligacoes.js`, linha 34.
- **Descrição:** O campo `data_fechamento` está declarado como campo de data sem hora (`new Field({ name: 'data_fechamento', type: 'date' })`). No entanto, o hook `pocketbase/hooks/fechamento_oportunidade.js` insere `new Date().toISOString()`, que é uma string de data-hora completa (`2025-05-24T18:30:00.000Z`).
- **Impacto:** O PocketBase trunca a informação para `YYYY-MM-DD 00:00:00.000Z`, perdendo a hora exata da conversão comercial e dificultando relatórios intradiários ou auditorias de fechamento por turno.
- **Correção Proposta:** Se a aplicação necessitar de precisão temporal, alterar o tipo do campo para texto ISO ou registrar a data respeitando a formatação estrita `YYYY-MM-DD` para evitar distorções de fuso horário.

---

## 3. Matriz de RLS (Segurança de Acesso e Permissões)

### 3.1 Matriz Requerida pelo Modelo de Negócio vs Implementada

| Coleção         | Ação            | Regra de Negócio Exigida                                   | Regra Implementada no Banco                                                                                                            | Status               |
| :-------------- | :-------------- | :--------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- | :------------------- |
| `usuarios`      | list / view     | Qualquer usuário logado                                    | `@request.auth.id != ''`                                                                                                               | **OK**               |
| `usuarios`      | create          | Apenas `ceo_financeiro`                                    | `null` (bloqueado na API)                                                                                                              | **CRÍTICO [BD-01]**  |
| `usuarios`      | update          | `ceo_financeiro` ou o próprio usuário                      | `@request.auth.perfil = 'ceo_financeiro' \|\| @request.auth.id = id`                                                                   | **OK**               |
| `usuarios`      | delete          | Apenas `ceo_financeiro` (exceto ele mesmo)                 | `null` (bloqueado na API)                                                                                                              | **CRÍTICO [BD-01]**  |
| `clientes`      | list / view     | Vendedores veem os seus; CEO/Coord veem todos              | `@request.auth.perfil = 'ceo_financeiro' \|\| @request.auth.perfil = 'coordenador_vendas' \|\| responsavel_id = @request.auth.id`      | **OK**               |
| `clientes`      | create          | Usuários de vendas e compras                               | `@request.auth.id != ''`                                                                                                               | **OK**               |
| `clientes`      | update          | CEO/Coord qualquer; Vendedor só o seu; Estoque NUNCA       | `@request.auth.perfil = 'ceo_financeiro' \|\| responsavel_id = @request.auth.id`                                                       | **ALTO [RLS-02]**    |
| `clientes`      | delete          | CEO/Coord qualquer; Vendedor só o seu; Estoque NUNCA       | `@request.auth.perfil = 'ceo_financeiro' \|\| responsavel_id = @request.auth.id`                                                       | **ALTO [RLS-02]**    |
| `oportunidades` | update / delete | CEO/Coord qualquer; Vendedor só a sua                      | `@request.auth.perfil = 'ceo_financeiro' \|\| responsavel_id = @request.auth.id`                                                       | **ALTO [RLS-02]**    |
| `tarefas`       | update / delete | CEO/Coord qualquer; Vendedor só a sua                      | `@request.auth.perfil = 'ceo_financeiro' \|\| responsavel_id = @request.auth.id`                                                       | **ALTO [RLS-02]**    |
| `ligacoes`      | update / delete | CEO/Coord qualquer; Vendedor só a sua                      | `@request.auth.perfil = 'ceo_financeiro' \|\| responsavel_id = @request.auth.id`                                                       | **ALTO [RLS-02]**    |
| `metas`         | list / view     | Vendedor vê a sua; CEO/Coord veem todas; Demais bloqueados | `@request.auth.perfil = 'ceo_financeiro' \|\| @request.auth.perfil = 'coordenador_vendas' \|\| usuario_id = @request.auth.id`          | **OK**               |
| `metas`         | create          | CEO e Coordenador                                          | `@request.auth.perfil = 'ceo_financeiro' \|\| (@request.auth.perfil = 'coordenador_vendas' && ...)`                                    | **OK**               |
| `metas`         | update          | CEO e Coordenador; **Vendedores NUNCA**                    | `@request.auth.perfil = 'ceo_financeiro' \|\| (@request.auth.perfil = 'coordenador_vendas' && ...) \|\| usuario_id = @request.auth.id` | **CRÍTICO [RLS-01]** |
| `metas`         | delete          | CEO e Coordenador; **Vendedores NUNCA**                    | `@request.auth.perfil = 'ceo_financeiro' \|\| (@request.auth.perfil = 'coordenador_vendas' && ...)`                                    | **OK**               |

### 3.2 Achados de RLS Detalhados

#### [RLS-01 CRÍTICO] Vendedor pode adulterar a própria meta (`metas.updateRule`)

- **Localização:** `pocketbase/migrations/0008_create_metas.js`, linhas 54–57.
- **Código Atual:**
  ```javascript
  collection.updateRule =
    "@request.auth.perfil = 'ceo_financeiro' || " +
    "(@request.auth.perfil = 'coordenador_vendas' && (@request.data.usuario_id.perfil = 'vendedor_1' || @request.data.usuario_id.perfil = 'vendedor_2')) || " +
    'usuario_id = @request.auth.id'
  ```
- **Impacto:** A cláusula final `usuario_id = @request.auth.id` autoriza qualquer vendedor a enviar requisições `PATCH /api/collections/metas/records/:id` alterando `valor_meta` e `meta_oportunidades`. Isso compromete totalmente a confiabilidade da remuneração variável e dos indicadores gerenciais.
- **Correção Proposta:** Criar migração retirando a cláusula `usuario_id = @request.auth.id` da `updateRule`:
  ```javascript
  col.updateRule =
    "@request.auth.perfil = 'ceo_financeiro' || " +
    "(@request.auth.perfil = 'coordenador_vendas' && (@request.data.usuario_id.perfil = 'vendedor_1' || @request.data.usuario_id.perfil = 'vendedor_2'))"
  ```

#### [RLS-02 ALTO] Coordenador de Vendas bloqueado em operações de escrita na equipe

- **Localização:** `pocketbase/migrations/0004_create_clientes.js` e `pocketbase/migrations/0005_create_oportunidades_tarefas_ligacoes.js`.
- **Descrição:** Nas coleções `clientes`, `oportunidades`, `tarefas` e `ligacoes`, a `listRule` contempla o coordenador (`@request.auth.perfil = 'coordenador_vendas'`), mas a `updateRule` e `deleteRule` foram escritas apenas como:
  `@request.auth.perfil = 'ceo_financeiro' || responsavel_id = @request.auth.id`.
- **Impacto:** O Coordenador de Vendas consegue visualizar os clientes e oportunidades dos seus vendedores no funil e nos relatórios, mas **não consegue reatribuir clientes, editar propostas nem excluir tarefas obsoletas** de seus subordinados, recebendo erro `403`.
- **Correção Proposta:** Criar migração adicionando `@request.auth.perfil = 'coordenador_vendas'` nas `updateRule` e `deleteRule` de `clientes`, `oportunidades`, `tarefas` e `ligacoes`.

---

## 4. Autenticação e Gestão de Usuários

#### [SEC-01 CRÍTICO] Senha mestre padrão hardcoded no código client-side

- **Localização:** `src/pages/UsuariosPage.tsx`, linhas 219–220 e 431–432.
- **Código Atual:**
  ```typescript
  password: 'Skip@Pass45#',
  passwordConfirm: 'Skip@Pass45#',
  ```
- **Impacto:** A senha mestre fica exposta no bundle JavaScript estático baixado por qualquer navegador (`dev-dist` ou `dist`). Qualquer usuário ou invasor que inspecione os arquivos compilados descobre a credencial padrão atribuída a novas contas.
- **Correção Proposta:**
  1. No formulário de criação de usuário em `UsuariosPage.tsx`, gerar uma senha temporária aleatória de alta entropia (ex: `crypto.randomUUID().slice(0, 12) + '!A9'`) e exibi-la em um modal seguro com botão "Copiar credenciais temporárias" para que o administrador a envie ao colaborador.
  2. Em seguida, disparar a solicitação de redefinição de senha nativa do PocketBase via `pb.collection('usuarios').requestPasswordReset(formEmail)`.

#### [SEC-02 CRÍTICO] Auto-provisionamento de CEOs executado em hook de ciclo de vida do componente

- **Localização:** `src/pages/UsuariosPage.tsx`, linhas 92–105 e 191–262.
- **Descrição:** O componente `UsuariosPage` possui uma lista `USUARIOS_INICIAIS` contendo Junior Colesel e Alice Paitra. Ao ser renderizado por um CEO, um `useEffect` varre o banco e tenta criar os usuários via REST caso não existam.
- **Impacto:**
  1. Criação de usuários do sistema não é atribuição de uma tela de frontend; deve residir em migrações de backend (`seed`).
  2. Cria requisições redundantes de busca e criação a cada abertura da tela por um CEO.
  3. Se a `createRule` estiver bloqueada (como está hoje), lança erros no console do navegador e exibe toasts de falha.
- **Correção Proposta:** Transferir o seed de usuários definitivos para uma migração PocketBase (`pocketbase/migrations/0009_seed_usuarios_diretoria.js`) e remover completamente o array `USUARIOS_INICIAIS` e o bloco de inicialização automática de `UsuariosPage.tsx`.

---

## 5. Hooks do Backend (PocketBase / pb_hooks)

#### [HOOK-01 ALTO] Hook não limpa `data_fechamento` ao reabrir oportunidade

- **Localização:** `pocketbase/hooks/fechamento_oportunidade.js`, linhas 6–13.
- **Código Atual:**
  ```javascript
  onRecordUpdate((e) => {
    const status = e.record.get('status')
    const oldRecord = e.record.original()
    const oldStatus = oldRecord ? oldRecord.get('status') : ''
    if ((status === 'ganho' || status === 'perdido') && oldStatus !== status) {
      e.record.set('data_fechamento', new Date().toISOString())
    }
    e.next()
  }, 'oportunidades')
  ```
- **Impacto:** Se um vendedor ou coordenador mover acidentalmente uma oportunidade para "Ganho" e depois devolvê-la para o estágio de "Negociação" (`status = 'aberto'`), o campo `data_fechamento` **permanece preenchido** com a data antiga. Em `src/pages/RelatoriosPage.tsx` e `src/pages/FunilPage.tsx`, os cálculos de conversão filtram propostas por `data_fechamento`, fazendo com que oportunidades reabertas continuem sendo computadas como finalizadas.
- **Correção Proposta:** Atualizar o hook para limpar explicitamente `data_fechamento` quando o status retornar para `'aberto'`:

  ```javascript
  onRecordUpdate((e) => {
    const status = e.record.get('status')
    const oldRecord = e.record.original()
    const oldStatus = oldRecord ? oldRecord.get('status') : ''

    if ((status === 'ganho' || status === 'perdido') && oldStatus !== status) {
      e.record.set('data_fechamento', new Date().toISOString().split('T')[0])
    } else if (status === 'aberto' && oldStatus !== 'aberto') {
      e.record.set('data_fechamento', null)
    }
    e.next()
  }, 'oportunidades')
  ```

#### [HOOK-02 MÉDIO] Divergência de fuso horário UTC (Data incorreta após 21:00 BRT)

- **Localização:** `pocketbase/hooks/fechamento_oportunidade.js`, linha 11.
- **Descrição:** `new Date().toISOString()` utiliza o horário zero (UTC). No Brasil (fuso UTC-3), qualquer oportunidade fechada entre as 21:00 e 23:59 registra o dia subsequente no banco.
- **Impacto:** Vendas fechadas no último dia do mês à noite caem no mês seguinte nas metas financeiras e relatórios de comissão.
- **Correção Proposta:** Calcular o deslocamento de timezone ou ajustar a data para o fuso brasileiro antes de persistir o valor em `data_fechamento`.

---

## 6. Frontend — Arquitetura e Roteamento

#### [FE-01 DECISÃO DE PRODUTO] Rotas administrativas ausentes no menu lateral

- **Rotas:** `/importacao`, `/usuarios`, `/metas`, `/primeiros-passos`.
- **Análise:** Foi verificado que estas rotas não estão incluídas no array `NAVIGATION_ITEMS` em `src/components/Layout.tsx`.
- **Status:** **Decisão consciente de produto**. O usuário determinou explicitamente que essas páginas fiquem fora do menu principal e proibiu a alteração do menu. O acesso é feito via digitação direta de URL ou links internos (ex: onboarding em `/primeiros-passos`). Não constitui defeito.

#### [FE-02 DECISÃO DE PRODUTO] Módulos `/painel` e `/configuracoes` com placeholder

- **Arquivos:** `src/pages/PainelPage.tsx`, `src/pages/ConfiguracoesPage.tsx`.
- **Análise:** Ambas as páginas renderizam `<ModulePlaceholder />`.
- **Status:** **Planejamento previsto do produto**. Os módulos estão reservados para fases futuras de implementação do sistema. Não constitui defeito.

#### [SEC-03 ALTO] Ausência de trava de perfil no nível do roteador (`ProtectedRoute`)

- **Localização:** `src/App.tsx`, linhas 50–57 e `src/components/ProtectedRoute.tsx`.
- **Descrição:** O componente `ProtectedRoute` valida unicamente se o usuário está autenticado (`isAuthenticated`), sem checar perfil (`perfil`). As rotas restritas ao CEO (`/usuarios`, `/importacao`, `/primeiros-passos`) e aos gestores (`/metas`) são declaradas no `App.tsx` sem propriedade de perfis permitidos.
- **Impacto:** Embora cada página contenha uma verificação interna exibindo o card "Acesso restrito", todo o código do componente da página restrita é baixado, montado e executado no cliente, disparando requisições iniciais à API antes da renderização do bloqueio.
- **Correção Proposta:** Evoluir `ProtectedRoute` para aceitar a propriedade `allowedRoles?: PerfilUsuario[]`. Caso o perfil logado não conste na lista, redirecionar imediatamente para `/painel` com toast de aviso, impedindo a montagem dos componentes sensíveis.

---

## 7. Auditoria Página por Página

### 7.1 Login e Entrada (`src/pages/Index.tsx`)

- **[PG-01 MÉDIO] Ausência de redirecionamento para usuário já autenticado:**  
  _Descrição:_ Se um usuário já autenticado acessar `/`, a página exibe novamente o formulário de login em vez de redirecioná-lo automaticamente para o funil ou painel.  
  _Correção:_ No `Index.tsx`, incluir `useEffect` monitorando `isAuthenticated` e executar `navigate('/funil', { replace: true })`.

### 7.2 Clientes (`src/pages/ClientesPage.tsx` e `src/components/clientes/ClienteModal.tsx`)

- **[PG-02 ALTO] Vendedor pode alterar o responsável de clientes no modal:**  
  _Descrição:_ Em `ClienteModal.tsx`, se o select de responsável estiver disponível, um vendedor poderia tentar associar o cliente a outro usuário. Embora a RLS bloqueie se ele não for o responsável, o select de `responsavel_id` deve ficar desabilitado ou fixo no próprio usuário quando `perfil === 'vendedor_1' || perfil === 'vendedor_2'`.  
  _Correção:_ Desabilitar o campo `<Select>` de responsável quando o usuário logado for vendedor, atribuindo compulsoriamente seu próprio `id`.
- **[PERF-01 ALTO] Consulta sem paginação (`getFullList`):**  
  _Descrição:_ `ClientesPage.tsx` chama `pb.collection('clientes').getFullList()`. Conforme a carteira de clientes crescer além de mil contatos, causará degradação de memória no browser e tempo de carga lento.  
  _Correção:_ Substituir por paginação server-side com `getList(page, perPage, { ... })`.

### 7.3 Funil de Vendas (`src/pages/FunilPage.tsx`)

- **[PG-03 ALTO] Tratamento de rollback em drag-and-drop:**  
  _Descrição:_ O método `handleMudarEtapa` faz atualização otimista na tela e reverte em caso de erro no bloco `catch`. A checagem do frontend `podeEditarOportunidade` já previne ações indevidas. No entanto, se houver falha de rede intermitente, os cards podem apresentar piscamento visual. A lógica foi verificada e está correta, mas deve ser mantida com observância.

### 7.4 Ligações (`src/pages/LigacoesPage.tsx`)

- **[PG-04 ALTO] Operação não atômica ao criar ligação e agendar tarefa:**  
  _Descrição:_ Ao registrar uma ligação com "Próxima Ação" preenchida, o código primeiro cria a ligação (`pb.collection('ligacoes').create`) e, em seguida, cria a tarefa vinculada (`pb.collection('tarefas').create`). Se a criação da tarefa falhar (ex: payload rejeitado ou queda de rede), a ligação já foi persistida e a tarefa não é gerada, deixando o fluxo comercial em estado inconsistente sem notificação de falha parcial.  
  _Correção:_ Envolver a chamada de tarefa em bloco de contingência: se falhar, alertar o usuário especificamente com: _"Ligação registrada, mas houve falha ao agendar a tarefa de retorno. Por favor, crie-a manualmente."_

### 7.5 Follow-up Inteligente (`src/pages/FollowUpPage.tsx`)

- **[PG-05 MÉDIO] Risco de cálculo de aniversariantes em anos bissextos:**  
  _Descrição:_ O cálculo de dias para aniversário (`new Date(anoAtual, mesNasc, diaNasc)`) na linha 295 pode gerar comportamento inesperado para clientes nascidos em 29 de Fevereiro em anos não-bissextos (o JavaScript projeta para 1º de Março).  
  _Correção:_ Tratar explicitamente clientes de 29/02 para considerar 28/02 em anos comuns.
- **[PG-06 BAIXO] Clientes inativos há mais de 30 dias:**  
  _Descrição:_ A regra filtra `d < trintaDiasAtras`. Caso `data_ultima_compra` seja uma data futura inconsistente, ela é ignorada, o que está correto.

### 7.6 Gestão de Usuários (`src/pages/UsuariosPage.tsx`)

- **[PG-07 CRÍTICO] Falha de permissão de criação e exclusão:**  
  _Descrição:_ Relacionado a [BD-01] e [SEC-01]. A tela não conseguirá criar nem deletar registros até que a migração de RLS de `usuarios` seja executada no banco.

### 7.7 Importação de Dados (`src/pages/ImportacaoPage.tsx`)

- **[PG-08 ALTO] Deduplicação de CPF/CNPJ com formatações assimétricas:**  
  _Descrição:_ Ao importar clientes via CSV, a busca por duplicados compara strings. Se o banco possuir `12.345.678/0001-90` e a planilha contiver `12345678000190`, a duplicidade não é detectada e um cliente duplicado é criado.  
  _Correção:_ Normalizar ambos os lados com regex removendo caracteres não numéricos (`val.replace(/\D/g, '')`) antes de comparar.
- **[PG-09 MÉDIO] Concatenação infinita nas observações de importação:**  
  _Descrição:_ Ao reimportar compras de um cliente existente, o código concatena:
  `Total de compras importado: R$ X`. A cada nova importação da mesma planilha, a string é adicionada novamente, poluindo as observações.  
  _Correção:_ Substituir a menção antiga via regex antes de concatenar o novo valor importado.

### 7.8 Relatórios e Exportação (`src/components/relatorios/`)

- **[PG-10 ALTO] Falta de BOM UTF-8 no CSV exportado (`exportarCsv.ts`):**  
  _Descrição:_ O arquivo `src/components/relatorios/exportarCsv.ts` cria o blob CSV com `type: 'text/csv;charset=utf-8;'`, mas **não insere o Byte Order Mark (`\uFEFF`)** no início do conteúdo.  
  _Impacto:_ No Microsoft Excel para Windows (padrão em escritórios brasileiros), caracteres com acentuação (como "Comunicação", "Aprovação", "João") abrem corrompidos com caracteres estranhos (`ComunicaÃ§Ã£o`).  
  _Correção:_ Adicionar `\uFEFF` no início do blob:
  ```typescript
  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' })
  ```

### 7.9 Automações e Canais (`src/components/automacoes/CanalModal.tsx`)

- **[PG-11 MÉDIO] Credenciais de canais expostas em texto puro no formulário:**  
  _Descrição:_ Em `CanalModal.tsx`, campos de chave de API e tokens de webhook são exibidos em campos de texto padrão sem máscara (`type="password"` com botão de toggle de visibilidade).  
  _Impacto:_ Usuários ao redor podem visualizar credenciais corporativas de mensageria na tela.  
  _Correção:_ Aplicar máscara com toggle de visibilidade nos inputs de segredos de canal.

---

## 8. Regras de Negócio e Cálculos

| Indicador / Regra                       | Especificação de Negócio                                            | Implementação Atual                                            | Status do Diagnóstico                                       |
| :-------------------------------------- | :------------------------------------------------------------------ | :------------------------------------------------------------- | :---------------------------------------------------------- |
| **Taxa de Conversão do Funil**          | Ganhas / (Ganhas + Perdidas) \* 100                                 | `finalizadas > 0 ? (ganhas.length / finalizadas) * 100 : 0`    | **Correto** (evita divisão por zero)                        |
| **Ticket Médio**                        | Soma das Ganhas / Qtd Ganhas                                        | `ganhas.length > 0 ? somaGanhas / ganhas.length : 0`           | **Correto** (evita divisão por zero)                        |
| **Trava de Responsável (Vendedores)**   | Vendedor 1 e 2 só podem ser responsáveis por seus próprios clientes | Implementado no frontend (`ClienteModal`, `OportunidadeModal`) | **Parcialmente seguro** (depende de ajuste na RLS [RLS-02]) |
| **Data de Fechamento de Oportunidades** | Preenchida apenas quando Ganho ou Perdido; limpa quando Aberto      | Preenche ao ganhar/perder; **não limpa ao reabrir**            | **Incorreto [HOOK-01]**                                     |
| **Período Global de Análise**           | Filtragem síncrona por Mês/Ano corrente em Funil e Relatórios       | Contexto `PeriodoContext` integrado com `SeletorDePeriodo`     | **Correto e consistente**                                   |
| **Percentual de Meta Atingida**         | (Realizado / Meta) \* 100                                           | Tratado com barra visual e saturação em 100%                   | **Correto**                                                 |

---

## 9. Qualidade de Código e Tipagem

- **[CODE-01 MÉDIO] Tipos de modelos espalhados e tipagem inline:**  
  _Descrição:_ A maior parte dos modelos reside em `src/types/clientes.ts` e `src/types/marketing.ts`. No entanto, em páginas como `MetasPage.tsx` e `ImportacaoPage.tsx`, interfaces auxiliares (ex: `LogImportacaoItem`, estados de erro de formulário) são declaradas inline nos arquivos de página.  
  _Correção:_ Criar arquivos dedicados em `src/types/` (ex: `src/types/importacao.ts`, `src/types/metas.ts`) centralizando os tipos do domínio.
- **[CODE-02 BAIXO] Uso residual de chamadas `console.error`:**  
  _Descrição:_ Em `UsuariosPage.tsx` (linha 229) e `ImportacaoPage.tsx` (linha 609), há ocorrências de `console.error` residual em blocos de captura de exceção.  
  _Correção:_ Substituir por notificações de toast ou serviço centralizado de monitoramento de logs de cliente.
- **[CODE-03 BAIXO] Parse de `localStorage` sem try/catch em módulos isolados:**  
  _Descrição:_ Em `ImportacaoPage.tsx` (linha 118), o parsing de logs históricos salvos em `localStorage` é protegido por bloco try/catch. A implementação foi conferida e está segura contra dados malformados.

---

## 10. Responsividade e Experiência do Usuário (UX)

- **[UX-01 MÉDIO] Visualização móvel das tabelas de gestão:**  
  _Descrição:_ Em `UsuariosPage.tsx`, há alternância inteligente entre `<Table>` para desktop e cards individuais para mobile (`md:hidden`). No entanto, em `SubAbaClientes.tsx` e `SubAbaOportunidades.tsx` dos Relatórios, a tabela gera rolagem horizontal em telas menores que 640px sem indicação visual de scroll.  
  _Correção:_ Adicionar indicador sutil de gradiente lateral em tabelas com rolagem horizontal em mobile.
- **[UX-02 BAIXO] Navegação de retorno com histórico vazio:**  
  _Descrição:_ Páginas como `UsuariosPage`, `MetasPage` e `PrimeirosPassosPage` utilizam a lógica:
  ```typescript
  if (window.history.length > 2) navigate(-1) else navigate('/painel')
  ```
  Se o usuário acessar o link diretamente em uma nova aba, ele é enviado corretamente para `/painel` (ou `/funil`). Recomenda-se direcionar para `/funil` como rota principal de trabalho.

---

## 11. Performance e Escalabilidade

- **[PERF-01 ALTO] Carregamento irrestrito com `getFullList`:**  
  _Descrição:_ As páginas `ClientesPage.tsx`, `FollowUpPage.tsx` e `RelatoriosPage.tsx` realizam `pb.collection(...).getFullList()`.  
  _Impacto:_ Com bases de clientes acima de 2.000 registros e histórico acumulado de milhares de ligações e tarefas, o tempo de requisição e parsing de JSON na thread do navegador causará congelamento momentâneo da UI.  
  _Correção:_ Implementar paginação com `getList` e virtualização de lista para tabelas com mais de 500 linhas.

---

## 12. Configuração e Infraestrutura

- **Vite & Rolldown (`vite.config.ts`):**  
  Configurado adequadamente com minificação via `lightningcss` e aliases de caminho `@/` mapeados para `./src`.
- **TypeScript (`tsconfig.json`, `tsconfig.app.json`):**  
  Configurado com `strictNullChecks: true`, `noImplicitAny: false`, `skipLibCheck: true`. O typecheck (`tsc`) executa sem erros na versão atual.
- **Segredos e Variáveis de Ambiente:**  
  Não há segredos de produção ou tokens de backend expostos nos arquivos `.env` ou no repositório de frontend. Apenas `VITE_POCKETBASE_URL` é consumida no cliente. Segredos do servidor (`PB_SUPERUSER_TOKEN`, `SKIP_AI_GATEWAY_API_KEY`) estão isolados na infraestrutura de hooks da Skip Cloud.
- **Arquivos Protegidos (`.skip.config.json`):**  
  Configurações de infraestrutura e dependências preservadas conforme as diretrizes do projeto.

---

## 13. Checklist de Correções Recomendadas (Ordem de Prioridade)

|   #    | ID          | Severidade  | Localização                                     | Problema Identificado                                                         | Correção Proposta                                                                    |
| :----: | :---------- | :---------: | :---------------------------------------------- | :---------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **1**  | **BD-01**   | **CRÍTICO** | `pocketbase/migrations/0001_create_usuarios.js` | `usuarios` sem `createRule` e `deleteRule` (gera 403 no frontend)             | Criar migração adicionando regras de criação e deleção para `ceo_financeiro`.        |
| **2**  | **RLS-01**  | **CRÍTICO** | `pocketbase/migrations/0008_create_metas.js`    | Vendedor pode editar a própria meta via API (`usuario_id = @request.auth.id`) | Remover a cláusula de permissão do próprio usuário na `updateRule`.                  |
| **3**  | **SEC-01**  | **CRÍTICO** | `src/pages/UsuariosPage.tsx`                    | Senha padrão hardcoded (`Skip@Pass45#`) no código client-side                 | Gerar senha aleatória temporária e usar fluxo de redefinição por e-mail.             |
| **4**  | **SEC-02**  | **CRÍTICO** | `src/pages/UsuariosPage.tsx`                    | Auto-provisionamento de diretores em `useEffect` client-side                  | Mover o provisionamento para seed de migração PocketBase e remover do client.        |
| **5**  | **HOOK-01** |  **ALTO**   | `pocketbase/hooks/fechamento_oportunidade.js`   | `data_fechamento` não é limpa quando oportunidade volta para "Aberto"         | Atualizar o hook para setar `data_fechamento = null` na reabertura da proposta.      |
| **6**  | **RLS-02**  |  **ALTO**   | Migrações 0004 e 0005                           | Coordenador de vendas sem permissão de escrita/exclusão na equipe             | Incluir `@request.auth.perfil = 'coordenador_vendas'` nas `updateRule`/`deleteRule`. |
| **7**  | **PG-10**   |  **ALTO**   | `src/components/relatorios/exportarCsv.ts`      | Arquivo CSV gerado sem BOM (`\uFEFF`), corrompendo acentuação no Excel        | Adicionar o caractere `\uFEFF` antes do conteúdo ao criar o `Blob`.                  |
| **8**  | **PERF-01** |  **ALTO**   | Clientes, FollowUp e Relatórios                 | Uso massivo de `getFullList` sem paginação para grandes volumes               | Adicionar paginação e filtros no backend para listas extensas.                       |
| **9**  | **SEC-03**  |  **ALTO**   | `src/App.tsx` e `ProtectedRoute.tsx`            | Rotas de CEO e gestão sem restrição por perfil no roteador                    | Adicionar suporte a `allowedRoles` em `ProtectedRoute`.                              |
| **10** | **PG-08**   |  **ALTO**   | `src/pages/ImportacaoPage.tsx`                  | Deduplicação falha quando CPF/CNPJ possui máscara diferente no CSV            | Limpar pontuações de ambos os lados com `.replace(/\D/g, '')` antes de comparar.     |
| **11** | **PG-04**   |  **ALTO**   | `src/pages/LigacoesPage.tsx`                    | Falta de tratamento atômico/contingência ao criar ligação e tarefa            | Tratar falha da tarefa sem mascarar o resultado da gravação da ligação.              |
| **12** | **HOOK-02** |  **MÉDIO**  | `pocketbase/hooks/fechamento_oportunidade.js`   | Uso de UTC ISO puro gera data errada após 21:00 BRT                           | Ajustar para fuso horário local brasileiro (UTC-3).                                  |
| **13** | **PG-01**   |  **MÉDIO**  | `src/pages/Index.tsx`                           | Usuário logado que acessa `/` não é redirecionado automaticamente             | Adicionar redirect para `/funil` se `isAuthenticated === true`.                      |
| **14** | **PG-09**   |  **MÉDIO**  | `src/pages/ImportacaoPage.tsx`                  | Reimportação de cliente concatena linha de compras repetidas vezes            | Tratar substituição de texto nas observações em vez de simples concatenação.         |
| **15** | **PG-11**   |  **MÉDIO**  | `src/components/automacoes/CanalModal.tsx`      | Chaves de API e tokens de canais exibidos em texto aberto                     | Aplicar inputs tipo `password` com botão de alternância de visualização.             |
| **16** | **PG-05**   |  **MÉDIO**  | `src/pages/FollowUpPage.tsx`                    | Aniversário em ano bissexto (29/02) pode falhar em anos comuns                | Normalizar cálculo de dia/mês para anos comuns.                                      |
| **17** | **BD-04**   |  **ALTO**   | Migração 0005                                   | Campo `data_fechamento` do tipo `date` perde granularidade de horário         | Alterar tipo de campo ou ajustar padrão de persistência.                             |
| **18** | **CODE-01** |  **MÉDIO**  | Diversos arquivos de páginas                    | Tipos e interfaces de dados declarados inline em vez de `src/types/`          | Centralizar tipos em arquivos dedicados na pasta de tipos.                           |
| **19** | **BD-03**   |  **BAIXO**  | Migração 0006 e `src/types/clientes.ts`         | Campos `criada_em` e `atualizada_em` no feminino em `automacoes`              | Padronizar nomenclatura dos campos de timestamp.                                     |
| **20** | **CODE-02** |  **BAIXO**  | `UsuariosPage.tsx`, `ImportacaoPage.tsx`        | Presença de `console.error` residual no frontend                              | Remover ou substituir por tratamentos amigáveis com toast.                           |
