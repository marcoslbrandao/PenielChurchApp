#!/bin/bash
# CORRECAO URGENTE 11/11/2026 22h30: app fechava ao abrir (useNavigation no chat montado fora da navegacao).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix: app fechava ao abrir - chat usava useNavigation fora do NavigationContainer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git do app"
limpar_locks
git add components/ChatGeralModal.tsx .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Corrige: app fechava ao abrir" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
