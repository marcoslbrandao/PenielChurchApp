#!/bin/bash
# Publica a rodada de 30/10/2026: compartilhar devocional leva a foto junto com o texto.
# Nao tem SQL. So JS por OTA; o react-native-share entra de verdade no proximo build da loja.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat(devocional): compartilhar leva a foto do devocional junto com o texto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7Rv8PTzqDM5FBWwdz"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add components/BotaoCompartilharDevocional.tsx screens/DevocionaisScreen.tsx package.json package-lock.json .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Compartilhar devocional com a foto" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
