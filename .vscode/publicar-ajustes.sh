#!/bin/bash
# Publica a rodada de 26/10/2026 (tarde): criar encontro nao notifica mais; sino no card; tocar na notificacao leva ao lugar certo.
# ANTES: colar "Claude outputs/encontro-colar-no-sql-editor.sql" no SQL Editor do Supabase e rodar.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix(notificacoes): encontro nao notifica sozinho; sino no card; toque abre chat da Banda, link do aviso e cards do sininho; culto ao vivo com link e horario de inverno

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add supabase/migrations/20261026170000_encontro_nao_notifica_sozinho.sql supabase/migrations/20261026180000_culto_ao_vivo_com_link.sql screens/GruposScreen.tsx screens/HomeScreen.tsx screens/BandaScreen.tsx lib/destinoNotificacao.ts App.tsx locales/pt.json locales/en.json locales/es.json locales/fr.json .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Notificacoes levam ao lugar certo; encontros sem push automatico" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
