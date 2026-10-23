#!/bin/bash
# Publica a rodada de 23/10/2026 (6): evento em destaque logo abaixo do chat e capa nos eventos especiais e ordem pela proxima data (vira a meia-noite).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix(home): botao Compartilhar convite abaixo da imagem; Mensagem aberta na cor vinho do card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D93i4EeD1iC3MLvm9AJMV4"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add components/MensagemDetalheModal.tsx screens/HomeScreen.tsx .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Home: botao do convite e Mensagem na cor do card" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
