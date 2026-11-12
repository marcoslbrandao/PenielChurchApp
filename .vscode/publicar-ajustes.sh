#!/bin/bash
# Publica 12/11/2026 (noite): Shorts gerais dos pastores na aba Midia + playlist do grupo "geral" no robo.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat(shorts): pastores gravam Shorts gerais na aba Midia (playlist Shorts · Peniel Church)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7ss5yv5jjSBzy6K1T"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git"
limpar_locks
git add screens/MidiaScreen.tsx scripts/shorts/publicar_short.py supabase/migrations/20261112220000_shorts_geral_midia_e_playlists.sql .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Midia: pastores gravam Shorts gerais" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
