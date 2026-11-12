#!/bin/bash
# Publica 12/11/2026 (feito durante a noite):
#   Area do Pastor (Face ID, agenda, anotacoes, lembretes) · Memes no chat ·
#   Devocional em audio (4 idiomas) · Shorts dos grupos (fila do lider + GitHub/YouTube)
# O SQL das 4 migracoes JA FOI RODADO no Supabase (20261112160000..190000).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: area do pastor, memes no chat, devocional em audio e shorts dos grupos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/5 git do app (+ workflow do GitHub para os Shorts)"
limpar_locks
mkdir -p .github/workflows && cp scripts/shorts/publicar-short.yml .github/workflows/publicar-short.yml
git add App.tsx lib/destinoNotificacao.ts lib/biometria.ts lib/pastor.ts lib/memes.ts \
  screens/PastorScreen.tsx screens/PerfilScreen.tsx screens/DevocionaisScreen.tsx screens/GruposScreen.tsx \
  components/ChatGeralModal.tsx components/MemesModal.tsx components/OuvirDevocional.tsx components/ShortsDoGrupo.tsx \
  locales/pt.json locales/en.json locales/es.json locales/fr.json supabase/config.toml \
  supabase/migrations/20261112160000_area_do_pastor.sql supabase/migrations/20261112170000_memes_do_chat.sql \
  supabase/migrations/20261112180000_devocional_audio.sql supabase/migrations/20261112190000_shorts_dos_grupos.sql \
  supabase/functions/devocional-audio/index.ts supabase/functions/shorts-publicar/index.ts supabase/functions/shorts-trabalho/index.ts \
  scripts/shorts .github/workflows/publicar-short.yml \
  "Claude outputs/textos_pastor.py" "Claude outputs/textos_shorts.py" .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/5 Edge Function devocional-audio (nova; visitante tambem ouve)"
npx --yes supabase@2 functions deploy devocional-audio --project-ref yudulaqsqhzbbarhxbnr --use-api --no-verify-jwt || { echo "FALHOU: deploy devocional-audio"; exit 1; }

echo "== 3/5 Edge Function shorts-publicar (nova)"
npx --yes supabase@2 functions deploy shorts-publicar --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy shorts-publicar"; exit 1; }

echo "== 4/5 Edge Function shorts-trabalho (nova; o GitHub chama com SHORTS_SEGREDO)"
npx --yes supabase@2 functions deploy shorts-trabalho --project-ref yudulaqsqhzbbarhxbnr --use-api --no-verify-jwt || { echo "FALHOU: deploy shorts-trabalho"; exit 1; }

echo "== 5/5 eas update"
npx eas update --branch production --environment production --message "Area do Pastor, memes, devocional em audio, shorts dos grupos" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
