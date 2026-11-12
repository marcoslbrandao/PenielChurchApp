#!/bin/bash
# Publica 12/11/2026: botao "Ouvir" do devocional tambem na Home e nos Grupos.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: ouvir o devocional tambem na Home e nos Grupos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git"
limpar_locks
git add screens/HomeScreen.tsx screens/GruposScreen.tsx .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Ouvir o devocional na Home e nos Grupos" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
