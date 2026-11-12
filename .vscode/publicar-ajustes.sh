#!/bin/bash
# Publica 12/11/2026: Novo Evento do Admin com todas as opcoes visiveis
# (tipo de local 2x2, repeticao em 3 colunas, 7 dias da semana numa linha).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix: Novo Evento com todas as opcoes visiveis, sem rolar para o lado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git do app"
limpar_locks
git add screens/AdminScreen.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json \
  "Claude outputs/textos_calendario.py" .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Novo Evento: opcoes visiveis" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
