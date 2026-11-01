#!/bin/bash
# Publica a rodada de 01/11/2026 (2):
#  Culto de Ceia passa a se chamar "Culto da Familia & Santa Ceia"
#  - selo da thumb (lib/thumbCulto.ts) - eas update
#  - descricao/tags do live no YouTube - funcao youtube-culto
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: Culto da Familia & Santa Ceia (thumb e YouTube)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014bc2XFsDcZJEYgBEh5eWvR"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/3 git do app"
limpar_locks
git add lib/thumbCulto.ts supabase/functions/youtube-culto/index.ts .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/3 funcao youtube-culto"
npx supabase@latest functions deploy youtube-culto --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy youtube-culto"; exit 1; }

echo "== 3/3 eas update"
npx eas update --branch production --environment production --message "Culto da Familia & Santa Ceia" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
