#!/bin/bash
# Publica 11/11/2026 (22h40): capa do video no chat mostra quem enviou; privada notifica toda mensagem.
# ANTES: rodar supabase/migrations/20261111230000_privada_notifica_toda_mensagem.sql no SQL Editor.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat(chat): capa do video com quem enviou; conversa privada notifica toda mensagem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git do app"
limpar_locks
git add components/ChatGeralModal.tsx supabase/migrations/20261111230000_privada_notifica_toda_mensagem.sql .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Capa do video com quem enviou" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
