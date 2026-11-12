#!/bin/bash
# Publica 12/11/2026 (noite): Area do Pastor com o titulo em cima + sensor de proximidade no devocional em audio.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: sensor de proximidade no devocional em audio; titulo da Area do Pastor em cima

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7ss5yv5jjSBzy6K1T"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git"
limpar_locks
git add screens/PastorScreen.tsx components/OuvirDevocional.tsx lib/saidaAudio.ts .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Devocional com sensor de proximidade; Area do Pastor com titulo em cima" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
