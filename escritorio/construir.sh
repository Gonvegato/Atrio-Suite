#!/bin/sh
# Construye el AppImage de Atrio. Uso: ./construir.sh
set -e
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Falta npm. Instálalo con:  sudo pacman -S nodejs npm"
  exit 1
fi
npm install
npx electron-builder --linux AppImage
echo
echo "Listo: $(ls "$(pwd)"/dist/*.AppImage)"
