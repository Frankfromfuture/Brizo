#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [[ ! -x "node_modules/.bin/electron" ]]; then
  echo "Electron 依赖尚未安装。请先在此目录运行：npm install"
  echo
  read -r "?按回车键关闭…"
  exit 1
fi

if [[ ! -f "dist/client/index.html" ]]; then
  npm run build
fi

npm run desktop:run
