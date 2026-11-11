#!/bin/bash
# Publica 12/11/2026: Eventos com inscricao e pagamento parcelado (Camping 2027),
# equipe do evento e tesouraria.
# ANTES: rodar supabase/migrations/20261112090000_eventos_inscricoes.sql no SQL Editor.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: eventos com inscricao e pagamento parcelado (Camping 2027), equipe e tesouraria

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/4 git do app"
limpar_locks
git add App.tsx lib/eventos.ts lib/destinoNotificacao.ts \
  screens/EventoScreen.tsx screens/AgendaScreen.tsx screens/AdminScreen.tsx \
  components/EventoGestaoModal.tsx components/TesourariaAdmin.tsx components/ChatGeralModal.tsx components/PlayerDeVideo.tsx \
  locales/pt.json locales/en.json locales/es.json locales/fr.json \
  supabase/migrations/20261112090000_eventos_inscricoes.sql supabase/migrations/20261111220000_conversas_privadas.sql \
  supabase/functions/evento-pagamento/index.ts supabase/functions/stripe-webhook/index.ts \
  .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/4 Edge Function evento-pagamento (nova)"
npx --yes supabase@2 functions deploy evento-pagamento --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy evento-pagamento"; exit 1; }

echo "== 3/4 Edge Function stripe-webhook (grava parcela de evento)"
npx --yes supabase@2 functions deploy stripe-webhook --project-ref yudulaqsqhzbbarhxbnr --use-api --no-verify-jwt || { echo "FALHOU: deploy stripe-webhook"; exit 1; }

echo "== 4/4 eas update"
npx eas update --branch production --environment production --message "Eventos com inscricao (Camping 2027)" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
