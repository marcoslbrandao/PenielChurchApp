#!/bin/bash
# Publica 12/11/2026 (noite): Area do Pastor com o titulo em cima + sensor no devocional + camera propria dos Shorts (720p leve).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: camera propria nos Shorts (720p, 2,5 Mbps); sensor de proximidade no devocional; titulo da Area do Pastor em cima

A camera do sistema gravava em IFrame 960x540 (~30 Mbps): 18 s ja passavam
de 50 MB. Agora o expo-camera grava 720p H.264 a 2,5 Mbps (~19 MB/min). Video da fila sai do Storage depois de publicado ou recusado. Shorts ate 10 min.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7ss5yv5jjSBzy6K1T"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/3 git"
limpar_locks
git add screens/PastorScreen.tsx components/OuvirDevocional.tsx lib/saidaAudio.ts components/ShortsDoGrupo.tsx components/GravadorDeVideo.tsx supabase/functions/shorts-trabalho/index.ts scripts/shorts/publicar-short.yml .github/workflows/publicar-short.yml supabase/migrations/20261112210000_shorts_ate_10_min.sql locales/pt.json locales/en.json locales/es.json locales/fr.json .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/3 deploy shorts-trabalho"
npx --yes supabase@2 functions deploy shorts-trabalho --project-ref yudulaqsqhzbbarhxbnr --use-api --no-verify-jwt || { echo "FALHOU: deploy shorts-trabalho"; exit 1; }

echo "== 3/3 eas update"
npx eas update --branch production --environment production --message "Shorts: ate 10 min, camera leve 720p; devocional com sensor; Area do Pastor" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
