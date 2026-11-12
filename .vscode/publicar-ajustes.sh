#!/bin/bash
# Publica 12/11/2026: botao "Ouvir" do devocional na Home e nos Grupos + limite da fonte grande do celular + colar imagem no chat (expo-clipboard: aparece so a partir do proximo build).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: ouvir o devocional na Home e nos Grupos; limite de 1,3x para a fonte grande do celular; colar imagem copiada no chat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git"
limpar_locks
git add screens/HomeScreen.tsx screens/GruposScreen.tsx index.ts lib/fonteMaxima.ts components/CalendarioAnual.tsx .vscode/publicar-ajustes.sh \
  lib/colarImagem.ts components/ChatGeralModal.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json package.json package-lock.json
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Ouvir o devocional na Home e nos Grupos; fonte grande com limite" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
