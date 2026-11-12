#!/bin/bash
# Publica 12/11/2026 (noite): capa dos videos do chat com um quadro do video + ouvir as Mensagens.
# ANTES: rodar supabase/migrations/20261112230000_mensagem_audio.sql no SQL Editor.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: capa dos videos do chat com quadro do proprio video; ouvir as Mensagens (voz neural, 4 idiomas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7ss5yv5jjSBzy6K1T"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/3 git"
limpar_locks
git add components/CapaDoVideo.tsx components/ChatGeralModal.tsx components/OuvirDevocional.tsx components/MensagemDetalheModal.tsx \
  supabase/functions/devocional-audio/index.ts supabase/migrations/20261112230000_mensagem_audio.sql \
  locales/pt.json locales/en.json locales/es.json locales/fr.json .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 2/3 deploy devocional-audio"
npx --yes supabase@2 functions deploy devocional-audio --project-ref yudulaqsqhzbbarhxbnr --use-api --no-verify-jwt || { echo "FALHOU: deploy devocional-audio"; exit 1; }

echo "== 3/3 eas update"
npx eas update --branch production --environment production --message "Chat: capa dos videos; Mensagens em audio" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
