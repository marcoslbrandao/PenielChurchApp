#!/bin/bash
# Publica 12/11/2026: Novo Evento do Admin com todas as opcoes visiveis,
# editar evento, e inscricao "So inscricao" x "Com pagamento".
# ANTES: rodar supabase/migrations/20261112140000_evento_inscricao_sem_pagamento.sql no SQL Editor.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: editar evento, inscricao sem pagamento e opcoes visiveis no Novo Evento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/2 git do app"
limpar_locks
git add screens/AdminScreen.tsx screens/EventoScreen.tsx components/EventoGestaoModal.tsx lib/eventos.ts \
  locales/pt.json locales/en.json locales/es.json locales/fr.json \
  supabase/migrations/20261112140000_evento_inscricao_sem_pagamento.sql \
  "Claude outputs/textos_calendario.py" "Claude outputs/textos_inscricao_modo.py" .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Editar evento + inscricao sem pagamento" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
