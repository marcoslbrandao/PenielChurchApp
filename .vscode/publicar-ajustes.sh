#!/bin/bash
# Publica a rodada de 23/10/2026 (5): abas do Admin coloridas, maiores e em ordem alfabetica.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat(admin): abas coloridas, maiores e em ordem alfabetica; rotulo Estatisticas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D93i4EeD1iC3MLvm9AJMV4"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add screens/AdminScreen.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Admin: abas coloridas e em ordem alfabetica" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
