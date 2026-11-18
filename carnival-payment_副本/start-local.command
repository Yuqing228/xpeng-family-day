#!/bin/zsh
set -e
cd "$(dirname "$0")/local"
if ! command -v npm >/dev/null 2>&1; then
 echo '请先安装 Node.js 22 或更新版本：https://nodejs.org/'
 read -k 1
 exit 1
fi
if [ ! -f node_modules/vite/package.json ]; then
 npm install --ignore-scripts --no-audit --no-fund || { echo '依赖安装失败，请检查网络后重新双击。'; read -k 1; exit 1; }
fi
(open 'http://localhost:5173/employee?unbound=1') &
npm run dev
