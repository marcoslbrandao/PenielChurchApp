#!/bin/bash
# Publica a rodada de 11/11/2026 (noite): conversas privadas entre membros
# (JS -> eas update) + limpar-audios-chat com o bucket chat-privado.
# ANTES: rodar supabase/migrations/20261111220000_conversas_privadas.sql no SQL Editor.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: conversas privadas entre membros (protecao de menores, supervisores, vinculo de responsavel)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/3 git do app"
limpar_locks
git add App.tsx components/ChatGeralModal.tsx components/DenunciasAdmin.tsx components/SupervisoresAdmin.tsx \
  lib/chatFonte.ts lib/conversas.ts lib/destinoNotificacao.ts lib/moderacao.ts \
  locales/pt.json locales/en.json locales/es.json locales/fr.json \
  screens/AdminScreen.tsx screens/HomeScreen.tsx screens/ConversasScreen.tsx \
  supabase/functions/limpar-audios-chat/index.ts supabase/migrations/20261111220000_conversas_privadas.sql \
  .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/3 Edge Function limpar-audios-chat"
npx --yes supabase@2 functions deploy limpar-audios-chat --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy limpar-audios-chat"; exit 1; }

echo "== 3/3 eas update"
npx eas update --branch production --environment production --message "Conversas privadas entre membros" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
