#!/bin/bash
# Publica a rodada de 03/11/2026 (2): Painel Admin com series e agendamento de devocionais (so JS -> eas update)
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat(admin): series de devocionais, agendamento com imagem e fila de agendados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi6v8FEj8tVSfzi3EAr"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add components/DevocionaisAdmin.tsx screens/AdminScreen.tsx lib/datas.ts .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Admin: series e agendamento de devocionais" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
