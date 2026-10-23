#!/bin/bash
# Publica a rodada de 23/10/2026 (6): evento em destaque logo abaixo do chat e capa nos eventos especiais e ordem pela proxima data (vira a meia-noite).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="style: Mensagem em vinho (inclusive a lista da aba Midia) e Devocionais em verde-petroleo em todas as telas; botao Compartilhar convite abaixo da imagem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D93i4EeD1iC3MLvm9AJMV4"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add screens/MidiaScreen.tsx components/MensagemDetalheModal.tsx screens/DevocionaisScreen.tsx screens/HomeScreen.tsx .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Cores padrao de Mensagem e Devocional; botao do convite" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
