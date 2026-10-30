#!/bin/bash
# Build da loja 1.5.2 (30/10/2026): entra o react-native-share nativo,
# entao o devocional compartilha a FOTO junto com o texto tambem no Android.
# runtimeVersion continua 1.5.0: os ajustes por OTA seguem chegando em 1.5.0, 1.5.1 e 1.5.2.
cd "$(dirname "$0")/.."
LOG=".vscode/build.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; }

echo "== 1/3 npm install (react-native-share)"
npm install || { echo "FALHOU: npm install"; exit 1; }

echo "== 2/3 git"
limpar_locks
git add app.json android/app/build.gradle ios/PenielChurch.xcodeproj/project.pbxproj package.json package-lock.json .vscode/publicar-build.sh
git commit -m "chore: versao 1.5.2 (react-native-share nativo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015HcwiAEHyYsb4uwFTiiSdJ" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 3/3 EAS build iOS + Android, com envio automatico para as lojas"
npx eas build --platform all --profile production --auto-submit --non-interactive || { echo "FALHOU: eas build"; exit 1; }
echo "== BUILD ENVIADO $(date)"
echo "Depois: App Store Connect -> versao 1.5.2 -> Enviar para revisao. Google Play: vai direto para a faixa de producao."
