#!/bin/bash
# Publica 12/11/2026 (noite): corrige o app fechando ao abrir o Chat da Igreja pela tela Conversas.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix(conversas): Chat da Igreja pela tela Conversas fechava o app

O navigate do React Navigation 7 empilhava uma segunda Home por cima do
modal, e os canais Realtime com o mesmo nome lancavam erro. Agora volta
para a Home existente com popTo (tambem no toque do push) e cada canal
tem nome unico.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7ss5yv5jjSBzy6K1T"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git"
limpar_locks
git add screens/ConversasScreen.tsx App.tsx components/ChatGeralCard.tsx screens/HomeScreen.tsx .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Conversas: Chat da Igreja nao fecha mais o app" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
