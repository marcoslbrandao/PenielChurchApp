#!/bin/bash
# Build da loja 1.5.3 (11/11/2026): icone novo (P-cruz), Face ID (Area do Pastor),
# camera nativa (QR e video no chat), alerta do Kids sensivel ao tempo + som proprio,
# audio em segundo plano e sensor de proximidade (modulo local modules/proximidade).
# runtimeVersion continua 1.5.0: os ajustes por OTA seguem chegando em 1.5.0 a 1.5.3.
cd "$(dirname "$0")/.."
LOG=".vscode/build.log"
exec > >(tee "$LOG") 2>&1
echo "== inicio $(date)"
limpar_locks() { for f in .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock; do [ -e "$f" ] && mv "$f" "$f.old-$(date +%s)"; done; true; }

echo "== 1/3 npm install"
npm install || { echo "FALHOU: npm install"; exit 1; }

echo "== 2/3 git"
limpar_locks
git add app.json package.json package-lock.json assets/adaptive-icon.png assets/favicon.png assets/sons \
  android/app/build.gradle android/app/src/main/res ios/PenielChurch.xcodeproj/project.pbxproj \
  ios/PenielChurch/Info.plist ios/PenielChurch/PenielChurch.entitlements ios/PenielChurch/alerta_kids.wav \
  ios/PenielChurch/Images.xcassets/AppIcon.appiconset modules lib/saidaAudio.ts lib/useNotifications.ts \
  components/AudioMensagem.tsx store-assets/android/icon-512.png .vscode/publicar-build.sh
git commit -m "feat: versao 1.5.3 - icone novo, Face ID, camera, alerta do Kids, audio em segundo plano e sensor de proximidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Hcwi7BhMk9vnfwpsFfPrU" || echo "(nada novo para commitar)"
git push origin main || { echo "FALHOU: git push"; exit 1; }

echo "== 3/3 EAS build iOS + Android, com envio automatico para as lojas"
npx eas build --platform all --profile production --auto-submit --non-interactive --no-wait || { echo "FALHOU: eas build"; exit 1; }
echo "== BUILD ENVIADO PARA A FILA $(date)"
echo "Acompanhe em expo.dev. Depois: App Store Connect -> versao 1.5.3 -> Enviar para revisao."
