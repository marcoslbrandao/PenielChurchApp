#!/bin/bash
# Publica a rodada de 26/10/2026: lista de Membros = acesso de membro; ofertas do link do Stripe com nome de quem pagou.
# ANTES: colar "Claude outputs/membros-acesso-colar-no-sql-editor.sql" no SQL Editor do Supabase e rodar.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix(membros): quem esta na lista de Membros tem acesso; vincular conta libera o acesso; ofertas do link do Stripe com nome de quem pagou

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NuA4tKb7o3w8fxNNWRWmKS"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/3 webhook do Stripe"
npx supabase functions deploy stripe-webhook --no-verify-jwt || echo "AVISO: deploy do stripe-webhook falhou (o resto continua)"

echo "== 2/3 git do app"
limpar_locks
git add supabase/migrations/20261026140000_lista_de_membros_tem_acesso.sql supabase/functions/stripe-webhook/index.ts screens/AdminScreen.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 3/3 eas update"
npx eas update --branch production --environment production --message "Ofertas: nome de quem pagou pelo link do Stripe" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
