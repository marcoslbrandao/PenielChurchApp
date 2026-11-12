#!/bin/bash
# Publica 12/11/2026 (noite): Shorts aceitam a chave SHORTS_SEGREDO/GITHUB_TOKEN com quebra de linha no fim.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix(shorts): ignora quebra de linha no fim das chaves SHORTS_SEGREDO e GITHUB_TOKEN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7ss5yv5jjSBzy6K1T"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git"
limpar_locks
git add scripts/shorts/publicar_short.py supabase/functions/shorts-trabalho/index.ts supabase/functions/shorts-publicar/index.ts .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/2 deploy das funcoes"
npx --yes supabase@2 functions deploy shorts-trabalho --project-ref yudulaqsqhzbbarhxbnr --use-api --no-verify-jwt || { echo "FALHOU: deploy shorts-trabalho"; exit 1; }
npx --yes supabase@2 functions deploy shorts-publicar --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy shorts-publicar"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
