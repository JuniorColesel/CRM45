#!/usr/bin/env bash
set -e

echo "=========================================="
echo "🚀 CRM Colesel 45 - Pipeline de CI Local"
echo "=========================================="

echo "[1/4] Executando Análise Estática (Lint)..."
npm run lint

echo "[2/4] Executando Verificação de Tipos TypeScript (tsc)..."
npx tsc --noEmit

echo "[3/4] Executando Testes Automatizados (npm test)..."
npm test

echo "[4/4] Executando Build de Produção (npm run build)..."
npm run build

echo "=========================================="
echo "✅ Pipeline de CI concluído com sucesso!"
echo "=========================================="
