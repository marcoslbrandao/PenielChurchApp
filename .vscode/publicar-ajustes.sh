#!/bin/bash
# Publica 12/11/2026: editar evento, "So inscricao" x "Com pagamento", botao
# Inscrever-se na Agenda, Novo Evento sem rolar para o lado, selos do Admin,
# entrada minima confirma a vaga, so a gestao cancela e relatorio (.xlsx).
# ANTES: rodar no SQL Editor, nesta ordem:
#   supabase/migrations/20261112140000_evento_inscricao_sem_pagamento.sql
#   supabase/migrations/20261112150000_eventos_entrada_cancelar_relatorio.sql
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="feat: eventos com entrada que confirma a vaga, so a gestao cancela, relatorio xlsx, editar evento e inscricao sem pagamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/4 git do app"
limpar_locks
git add screens/AdminScreen.tsx screens/AgendaScreen.tsx screens/EventoScreen.tsx components/EventoGestaoModal.tsx lib/eventos.ts \
  locales/pt.json locales/en.json locales/es.json locales/fr.json \
  supabase/migrations/20261112140000_evento_inscricao_sem_pagamento.sql \
  supabase/migrations/20261112150000_eventos_entrada_cancelar_relatorio.sql \
  supabase/functions/evento-pagamento/index.ts supabase/functions/evento-relatorio/index.ts \
  "Claude outputs/textos_calendario.py" "Claude outputs/textos_inscricao_modo.py" "Claude outputs/textos_entrada_relatorio.py" \
  .vscode/publicar-ajustes.sh
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/4 Edge Function evento-pagamento (aceita pagar a entrada)"
npx --yes supabase@2 functions deploy evento-pagamento --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy evento-pagamento"; exit 1; }

echo "== 3/4 Edge Function evento-relatorio (nova, planilha)"
npx --yes supabase@2 functions deploy evento-relatorio --project-ref yudulaqsqhzbbarhxbnr --use-api || { echo "FALHOU: deploy evento-relatorio"; exit 1; }

echo "== 4/4 eas update"
npx eas update --branch production --environment production --message "Eventos: entrada confirma vaga, relatorio, editar" --non-interactive || { echo "FALHOU: eas update"; exit 1; }

echo "== TUDO PUBLICADO $(date)"
