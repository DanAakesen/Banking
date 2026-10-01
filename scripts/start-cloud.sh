#!/bin/bash
set -euo pipefail
cd /home/site/wwwroot
export BANKING_PUBLIC_ORIGIN="$Cloud__Origin"
export BANKING_ADVISOR_STORAGE=/home/Banking/Advisor
export BANKING_ASSET_ROOT=/home/site/wwwroot/wwwroot
mkdir -p "$BANKING_ADVISOR_STORAGE"
chmod 700 "$BANKING_ADVISOR_STORAGE"
chmod +x runtime/node
runtime/node advisor/server.mjs &
advisor_pid=$!
dotnet Banking.Api.dll &
banking_pid=$!
trap 'kill "$advisor_pid" "$banking_pid" 2>/dev/null || true' EXIT TERM INT
wait -n "$advisor_pid" "$banking_pid"
