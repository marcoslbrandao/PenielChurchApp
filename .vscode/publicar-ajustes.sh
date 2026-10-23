#!/bin/bash
# Publica a rodada de 23/10/2026 (2): Cantina sem conflito com outras escalas
# e escolha das areas no gerador.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat(escalas): area sem conflito (Cantina), escolher areas no gerador Escala Geral em cards por area e so primeiro nome + sobrenome

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D93i4EeD1iC3MLvm9AJMV4"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add lib/nomeCurto.ts screens/EscalasScreen.tsx screens/AdminScreen.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json supabase/migrations/20261023130000_escala_area_sem_conflito.sql supabase/conserto-2026-10-23-cantina.sql .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Escalas: Cantina sem conflito, areas no gerador e Escala Geral em cards" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
