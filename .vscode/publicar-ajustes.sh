#!/bin/bash
# Publica a rodada de 22/10/2026 (noite): a aba Culto passa a ler as fotos
# dos pregadores na pasta "pregadores" (minusculo) do bucket culto-semana.
cd "$(dirname "$0")/.."
LOG=".vscode/publicar.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
MSG="fix(culto): fotos dos pregadores na pasta pregadores (minusculo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Rk3HJb9GTViy1kqrnfnm2k"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/2 git do app"
limpar_locks
git add components/CultoDaSemanaAdmin.tsx .vscode/publicar-ajustes.sh \
  store-assets/pregadores/marcos-5-terno-microfone.png store-assets/pregadores/marcos-6-camisa-azul.png \
  store-assets/pregadores/marcos-7-camisa-branca.png store-assets/pregadores/marcos-8-terno-pregando.png \
  store-assets/pregadores/marcos-9-camisa-azul-pregando.png
git commit -m "$MSG" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push do app"; exit 1; }

echo "== 2/2 eas update"
npx eas update --branch production --environment production --message "Culto: fotos na pasta pregadores" --non-interactive || { echo "FALHOU: eas update"; exit 1; }
echo "== TUDO PUBLICADO $(date)"
