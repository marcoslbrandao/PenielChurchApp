#!/bin/bash
# Publica a rodada de 21-22/10/2026: aba "Culto" no Painel Admin (culto da semana
# com thumb automatica e live agendado no YouTube) + logo novo da Peniel
# (P-cruz) dentro do app e na thumb. Icone e splash novos so entram no
# proximo build das lojas (o eas update nao muda icone).
# ANTES: rodar no SQL Editor do Supabase o arquivo
#   supabase/migrations/20261021210000_culto_da_semana.sql
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: aba Culto (culto da semana no YouTube) e logo novo da Peniel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EQcvYD1LjNq2RUGtugHCQ8"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/3 git do app"
limpar_locks
git add supabase/migrations/20261021210000_culto_da_semana.sql supabase/functions/youtube-culto/index.ts \
  supabase/config.toml lib/thumbCulto.ts lib/logoPenielDataUri.ts components/ThumbCultoView.tsx \
  components/CultoDaSemanaAdmin.tsx screens/AdminScreen.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json \
  assets/peniel-logo.png assets/icon.png assets/adaptive-icon.png assets/splash-icon.png
git commit -m "$MSG" || echo "(nada novo para commitar no app)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 1b git do site (logo novo; o GitHub publica sozinho em ~2 min)"
( cd ../peniel-site && limpar_locks
  git add public/img/logo.png public/favicon.png public/conecte/index.html
  git commit -m "$MSG" || echo "(nada novo para commitar no site)"
  git push origin main ) || { echo "FALHOU: git push do site"; exit 1; }

echo "== 2/3 Edge Function youtube-culto"
npx supabase@latest functions deploy youtube-culto --use-api --no-verify-jwt || { echo "FALHOU: deploy da funcao"; exit 1; }

echo "== 3/3 eas update"
npx eas update --branch production --environment production --message "Admin: aba Culto + logo novo" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
