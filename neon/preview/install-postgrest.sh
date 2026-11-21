#!/usr/bin/env bash
set -euo pipefail
archive=$(mktemp)
trap 'rm -f -- "$archive"' EXIT
curl --fail --location --silent --show-error --max-time 60 --output "$archive" \
  https://github.com/PostgREST/postgrest/releases/download/v16.6/postgrest-v16.6-linux-static-x86-64.tar.xz
printf '335ea29f00145705fb569b1268b9c8e53d062f8f6f9188192e92ea3781d2dca1  %s\n' "$archive" | sha256sum -c -
mkdir -p .runtime
tar -xJf "$archive" -C .runtime postgrest
