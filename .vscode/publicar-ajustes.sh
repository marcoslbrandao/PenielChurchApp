#!/bin/bash
# Publica a rodada de 23/10/2026 (3): push que nao chegava (token preso em
# outra conta) pergunta de notificacao na primeira abertura e aviso de atualizacao rapida (1 toque).
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix(push): token preso em outra conta (RPC registrar_push_token) e pergunta de notificacao na primeira abertura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D93i4EeD1iC3MLvm9AJMV4"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add App.tsx components/AtualizacaoRapida.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json lib/useNotifications.ts supabase/migrations/20261023150000_push_token_registro_seguro.sql .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Notificacoes corrigidas e aviso de atualizacao com 1 toque" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
