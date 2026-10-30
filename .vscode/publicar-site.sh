#!/bin/bash
# Publica so o site (23/10/2026): imagem de capa nos Eventos especiais da Agenda.
cd "$(dirname "$0")/../../peniel-site" || exit 1
for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done
git add src/pages/agenda.astro src/styles/global.css
git commit -m "fix: imagem de capa nos Eventos especiais da Agenda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EQcvYD1LjNq2RUGtugHCQ8" || echo "(nada novo no site)"
git push origin main && echo "== SITE PUBLICADO $(date) — no ar em ~2 min"
