#!/bin/bash
# Publica a rodada de 23/10/2026 (6): evento em destaque logo abaixo do chat e capa nos eventos especiais e ordem pela proxima data (vira a meia-noite).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="style: botao Compartilhar convite menor e na linha do nome tambem na Agenda; cores padrao de Mensagem e Devocional; logo da Peniel com o P maior no circulo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D93i4EeD1iC3MLvm9AJMV4"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/3 git do app"
limpar_locks
git add locales/pt.json locales/en.json locales/es.json locales/fr.json screens/HomeScreen.tsx screens/AgendaScreen.tsx screens/MidiaScreen.tsx screens/DevocionaisScreen.tsx components/MensagemDetalheModal.tsx .vscode/publicar-ajustes.sh assets/peniel-logo.png assets/icon.png lib/logoPenielDataUri.ts
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/3 git do site (logo com o P maior)"
( cd ../peniel-site && { limpar_locks; true; } && git add public/img/logo.png public/favicon.png public/conecte/index.html && { git commit -m "style: logo da Peniel com o P maior no circulo (logo, favicon e /conecte)" || echo "(nada novo no site)"; } && git push origin main ) || { echo "FALHOU: git do site"; exit 1; }

echo "== 3/3 eas update"
npx eas update --branch production --environment production --message "Convite na Agenda e botao menor; cores padrao; logo com P maior" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
