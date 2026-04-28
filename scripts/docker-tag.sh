#!/usr/bin/env bash
# scripts/docker-tag.sh — tag the locally-built image for release.
#
# Tags `livepeer-gateway-console:local` (produced by `npm run docker:build`)
# as `${GATEWAY_CONSOLE_IMAGE_REPO}:v${version}` plus `:latest`. The version
# comes from package.json unless GATEWAY_CONSOLE_VERSION overrides it.
#
# Env overrides (all optional):
#   LOCAL_IMAGE                    — source tag      (default livepeer-gateway-console:local)
#   GATEWAY_CONSOLE_IMAGE_REPO     — destination     (default tztcloud/livepeer-gateway-console)
#   GATEWAY_CONSOLE_VERSION        — explicit tag    (default v$(package.json version))
#   PUSH_LATEST=0                  — skip :latest    (default 1, both tags emitted)

set -euo pipefail

cd "$(dirname "$0")/.."

LOCAL_IMAGE="${LOCAL_IMAGE:-livepeer-gateway-console:local}"
REPO="${GATEWAY_CONSOLE_IMAGE_REPO:-tztcloud/livepeer-gateway-console}"
VERSION="${GATEWAY_CONSOLE_VERSION:-v$(node -p "require('./package.json').version")}"
PUSH_LATEST="${PUSH_LATEST:-1}"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not on PATH" >&2
  exit 1
fi

if ! docker image inspect "$LOCAL_IMAGE" >/dev/null 2>&1; then
  echo "error: local image '$LOCAL_IMAGE' not found." >&2
  echo "       run \`npm run docker:build\` first." >&2
  exit 1
fi

echo "tagging $LOCAL_IMAGE -> $REPO:$VERSION"
docker tag "$LOCAL_IMAGE" "$REPO:$VERSION"

if [[ "$PUSH_LATEST" != "0" ]]; then
  echo "tagging $LOCAL_IMAGE -> $REPO:latest"
  docker tag "$LOCAL_IMAGE" "$REPO:latest"
fi
