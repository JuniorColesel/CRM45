# Relatório Técnico — CRM Colesel 45 (v0.0.67)

## Reestruturação do Bling ERP como Módulo Dedicado (`/bling`)

**Data:** 01 de Outubro de 2026  
**Versão:** v0.0.67  
**Escopo:** Migração da integração Bling ERP de `/integracoes` para módulo próprio `/bling`, limpeza da tela de integrações genéricas, correção e robustecimento do fluxo OAuth com popup neutro, validação de URL do Bling e polling assíncrono.

---

### 1. Resumo Executivo e Objetivos Alcançados

O Bling ERP deixou de ser um bloco secundário em `/integracoes` e passou a operar como um **módulo dedicado e expansível** do CRM Colesel 45, acessível diretamente pela rota `/bling` e pelo item de menu lateral **"Bling ERP"**.

A tela genérica `/integracoes` foi completamente limpa de controles operacionais do Bling: ela mantém apenas um card informativo resumido com status da conexão, data da última sincronização e o botão de ação rápida **"ABRIR INTEGRAÇÃO BLING"**.

Todas as premissas não negociáveis foram estritamente mantidas:

1. **Regra de READ-ONLY absoluta mantida e ampliada:** O CRM nunca envia POST/PUT/PATCH/DELETE para endpoints de negócio da API Bling (`api.bling.com.br`). A única exceção é a chamada POST do backend para a troca de token no endpoint OAuth `/oauth/token`.
2. **Motor de sincronização v0.0.64 e backend OAuth v0.0.65 preservados:** Reutilização total das coleções `bling_connections`, `bling_oauth_states`, `bling_sync_logs` e dos endpoints `/backend/v1/bling/connect`, `/callback`, `/status`, `/sincronizar`.
3. **Nenhum dado apagado:** Contatos, `bling_id`, históricos, logs e migrações anteriores foram 100% preservados.
4. **Zero tokens no frontend:** `access_token`, `refresh_token` e `client_secret` continuam restritos ao Vault e backend do servidor. O frontend nunca os recebe.

---

### 2. Arquitetura Antes vs. Depois

```
ANTES (v0.0.66):
Menu Lateral:
└── Configurações
    └── Integrações (/integracoes)
        ├── Bling (Token Legado manual, Botão OAuth, Sincronizar, Diagnóstico, Logs misturados)
        ├── WhatsApp (Zenvia / Meta)
        ├── Assistente IA
        └── SMTP / SMS

DEPOIS (v0.0.67):
Menu Lateral:
├── Painel
├── Clientes
├── ...
├── Bling ERP (/bling)  <-- NOVO MÓDULO DEDICADO (Restrito CEO / Coord. Vendas)
│   ├── 1. Cabeçalho (Status visual + Read-Only Badge)
│   ├── 2. Seção Conexão (OAuth v3, Reconectar, Desconectar)
│   ├── 3. Seção Sincronização (Disparo manual com estatísticas em tempo real)
│   ├── 4. Seção Clientes (Total, com bling_id, ativos, para reativação)
│   ├── 5. Seção Vendas (Consolidado, clientes com histórico, última data)
│   ├── 6. Seção Logs (Tabela de histórico de bling_sync_logs com modal de detalhes)
│   ├── 7. Seção Diagnóstico (Exclusivo CEO: status da API, expiração, callback)
│   └── 8. Seção Configurações (Read-only guard ativo + Extensões futuras)
└── Configurações
    └── Integrações (/integracoes)  <-- LIMPA E CONSOLIDADA
        ├── Bling ERP (Apenas Card Resumido + Botão "ABRIR INTEGRAÇÃO BLING")
        ├── WhatsApp Business API
        ├── Assistente IA
        └── SMTP / SMS
```

---

### 3. Arquivos Criados e Modificados

| Arquivo                                | Status         | Descrição                                                                                                                                                                                                      |
| -------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/bling/iniciarConexaoBling.ts` | **Criado**     | Helper centralizado do fluxo OAuth: abre popup neutro em `about:blank`, requisita `auth_url` ao backend, valida domínio oficial do Bling, navega o popup, roda polling e trata timeout / fechamento / unmount. |
| `src/pages/BlingPage.tsx`              | **Criado**     | Página dedicada `/bling` com as 8 seções obrigatórias, design alinhado ao padrão Colesel 45 e controle de perfil (`ceo_financeiro` e `coordenador_vendas`).                                                    |
| `src/App.tsx`                          | **Modificado** | Registro da nova rota `/bling` protegida pelo `ProtectedRoute`.                                                                                                                                                |
| `src/components/Layout.tsx`            | **Modificado** | Inclusão do item "Bling ERP" na navegação lateral com ícone `Layers` e filtro por `perfisPermitidos`.                                                                                                          |
| `src/pages/ConfiguracoesPage.tsx`      | **Modificado** | Inclusão do card de atalho "Bling ERP (Integração Direta)" na grade de configurações.                                                                                                                          |
| `src/pages/IntegracoesPage.tsx`        | **Modificado** | Remoção de todos os controles operacionais e legados do Bling (botão OAuth, sincronizar, diagnóstico, formulário de token legado manual). Implementação do Card Resumido com botão "ABRIR INTEGRAÇÃO BLING".   |
| `tests/bling-readonly.test.ts`         | **Modificado** | Atualização do guard estático de read-only para incluir `BlingPage.tsx` e `iniciarConexaoBling.ts`.                                                                                                            |
| `tests/bling-v0067-modulo.test.ts`     | **Criado**     | Suíte de testes automatizados com cobertura da nova rota, permissões, limpeza de `/integracoes`, popup neutro, validação anti-redirecionamento e segurança read-only.                                          |
| `RELATORIO_V0_0_67_MODULO_BLING.md`    | **Criado**     | Este relatório consolidado.                                                                                                                                                                                    |

---

### 4. Componentes e Controles Legados Removidos da Interface

Em atendimento ao requisito de remover o legado visual:

- **Campo "Token de API Legado (Bling)"**: Removido da tela `/integracoes`.
- **Botão "Salvar Token Legado"**: Removido da tela `/integracoes`.
- **Botão "CONECTAR AO BLING" e "RECONECTAR"**: Removidos de `/integracoes` (agora operam exclusivamente em `/bling`).
- **Botão "SINCRONIZAR BLING"**: Removido de `/integracoes` (agora opera com métricas completas em `/bling`).
- **Diagnóstico técnico do Bling**: Removido de `/integracoes` (centralizado na Seção 7 do `/bling`, restrito ao CEO).
- O campo `bling_token` no schema do backend e o hook `integracoes_config_save.js` foram mantidos com comportamento seguro e retrocompatível, sem causar quebras.

---

### 5. Correção do Fluxo OAuth (Diagnóstico do Popup Neutro)

Na versão anterior, existia risco de popup abrir URLs internas do CRM ou falhar em bloqueadores de popup caso o `window.open` aguardasse a resposta assíncrona da rede.

A nova função `iniciarConexaoBling()` resolveu isso através da seguinte sequência:

1. **Abertura imediata de Popup Neutro:** `window.open('about:blank', 'oauth_bling_popup', ...)` é disparado de forma síncrona dentro do evento de clique do usuário, contornando bloqueadores de popup;
2. **Interface neutra de transição:** Enquanto o backend responde, o popup exibe feedback visual amigável informando o início da conexão;
3. **Chamada ao Backend:** O CRM solicita `/backend/v1/bling/connect?format=json` com credenciais de sessão;
4. **Validação rígida de domínio:** O frontend valida que a `auth_url` inicia estritamente com `https://www.bling.com.br/` ou `https://bling.com.br/`. Se qualquer URL interna do CRM (`/integracoes`, `/bling`) for retornada, o popup é imediatamente fechado e um erro é emitido;
5. **Navegação do Popup:** O popup é navegado diretamente para a tela de autorização do Bling ERP;
6. **Polling Assíncrono com Fallback:** Polling a cada 2 segundos verifica `/backend/v1/bling/status`;
7. **Fechamento Automático:** Assim que `conectado === true`, o polling encerra, o popup fecha e a UI do CRM atualiza imediatamente;
8. **Tratamento de Timeout e Cancelamento:** Timeout máximo de 5 minutos e descarte limpo caso o componente seja desmontado.

---

### 6. Garantia de Read-Only

Todas as proteções contra mutação na API do Bling continuam ativas:

- O frontend nunca realiza chamadas `fetch`, `axios` ou chamadas diretas para `api.bling.com.br`;
- As requisições de contatos e pedidos no backend utilizam estritamente o método `GET`;
- A suíte de testes automatizados (`tests/bling-readonly.test.ts`) verifica em pipeline estático qualquer tentativa de POST/PUT/PATCH/DELETE para endpoints de negócio do Bling.

---

### 7. Extensões Futuras Preparadas (Layout "Em Breve")

A Seção 8 de `/bling` já disponibiliza a área visual para futuros módulos planejados da integração ERP:

- Produtos
- Estoque
- Pedidos Detalhados
- Sincronização Automática
- Mapeamentos de Campos Customizados
- Webhooks de Notificação em Tempo Real

---

### 8. Conclusão

A versão v0.0.67 entrega exatamente o que foi solicitado: moderniza a arquitetura visual da integração Bling ERP, promove-a a um módulo independente de primeira classe no CRM Colesel 45 e elimina o ruído da tela geral de integrações, mantendo 100% da segurança, RLS e estabilidade do motor de sincronização.
