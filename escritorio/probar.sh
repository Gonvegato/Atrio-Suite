#!/bin/sh
# Abre Atrio directamente, sin empaquetarlo. Uso: ./probar.sh
set -e
cd "$(dirname "$0")"
[ -d node_modules/electron ] || npm install
# npm 12 bloquea los scripts de instalación: descargamos Electron explícitamente si falta
[ -f node_modules/electron/path.txt ] || node node_modules/electron/install.js
npx electron .
