#!/bin/bash
# 常駐ワーカーの起動スクリプト（launchd から呼ばれる）
# PATH を明示しないと launchd 環境では node が見つからない
export PATH="/usr/local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export TZ=Asia/Tokyo
cd "/Users/ijichiyuuta/.superset/projects/worker" || exit 1
exec caffeinate -i npm run dev
