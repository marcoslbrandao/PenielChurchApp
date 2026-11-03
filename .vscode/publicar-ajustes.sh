#!/bin/bash
# Publica a rodada de 03/11/2026: devocionais por serie + nova ordem da Home (so JS -> eas update)
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: devocionais por serie (selo na capa, lista por serie, anterior/proximo) e nova ordem da Home

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi6v8FEj8tVSfzi3EAr"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add lib/devocionalSeries.ts components/SeloSerie.tsx screens/HomeScreen.tsx screens/DevocionaisScreen.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Devocionais por serie e nova ordem da Home" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
