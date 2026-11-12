#!/bin/bash
# Publica 12/11/2026 (noite): audio do devocional/mensagem gerado assim que publica.
# ANTES: rodar supabase/migrations/20261112233000_audio_pronto_ao_publicar.sql no SQL Editor
#        (depois deste script, porque o SQL ja pede os audios a funcao nova).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat(audio): devocional e mensagem com audio pronto assim que publica (gatilho no banco, pre_gerar)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7ss5yv5jjSBzy6K1T"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git"
limpar_locks
git add supabase/functions/devocional-audio/index.ts supabase/migrations/20261112233000_audio_pronto_ao_publicar.sql .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/2 deploy devocional-audio"
npx --yes supabase@2 functions deploy devocional-audio --project-ref yudulaqsqhzbbarhxbnr --use-api --no-verify-jwt || { echo "FALHOU: deploy devocional-audio"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
