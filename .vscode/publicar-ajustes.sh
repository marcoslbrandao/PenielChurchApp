#!/bin/bash
# Publica a rodada de 30/10/2026 (tarde):
#  1. Lembrete da escala com o texto novo ("Graca e paz, Fulano!...") - funcao escala-notifications
#  2. Traducao ao vivo desliga sozinha quando a live termina - funcao youtube-culto (+ SQL do cron)
#  3. "Notificacoes do Chat da Igreja" traduzido no Perfil (en/es/fr) - eas update
#  4. Site: capa dos eventos especiais na Agenda
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix: lembrete da escala com texto novo; traducao desliga no fim da live; Chat da Igreja traduzido no Perfil

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015HcwiAEHyYsb4uwFTiiSdJ"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/4 git do app"
limpar_locks
git add supabase/functions/escala-notifications/index.ts supabase/functions/youtube-culto/index.ts \
  supabase/migrations/20261030120000_traducao_desliga_no_fim_da_live.sql \
  locales/pt.json locales/en.json locales/es.json locales/fr.json \
  .vscode/tasks.json .vscode/publicar-ajustes.sh .vscode/publicar-site.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/4 funcoes do Supabase"
npx supabase@latest functions deploy escala-notifications --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy escala-notifications"; exit 1; }
npx supabase@latest functions deploy youtube-culto --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy youtube-culto"; exit 1; }

echo "== 3/4 eas update"
npx eas update --branch production --environment production --message "Chat da Igreja traduzido no Perfil" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== 4/4 site"
bash .vscode/publicar-site.sh || { echo "FALHOU: site"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
echo "Falta so: colar no SQL Editor do Supabase o arquivo supabase/migrations/20261030120000_traducao_desliga_no_fim_da_live.sql"
