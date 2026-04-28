#!/usr/bin/env bash
# scripts/docker-push.sh — push the tagged release image to the registry.
#
# Assumes `npm run docker:tag` (or scripts/docker-tag.sh) has already run
# and emitted ${GATEWAY_CONSOLE_IMAGE_REPO}:v${version} locally.
#
# Env overrides (all optional, must match the tag step):
#   GATEWAY_CONSOLE_IMAGE_REPO  — destination     (default tztcloud/livepeer-gateway-console)
#   GATEWAY_CONSOLE_VERSION     — explicit tag    (default v$(package.json version))
#   PUSH_LATEST=0               — skip :latest    (default 1, both tags pushed)
#
# Auth is delegated to the docker daemon — `docker login` first if needed.

set -euo pipefail

cd "$(dirname "$0")/.."

REPO="${GATEWAY_CONSOLE_IMAGE_REPO:-tztcloud/livepeer-gateway-console}"
VERSION="${GATEWAY_CONSOLE_VERSION:-v$(node -p "require('./package.json').version")}"
PUSH_LATEST="${PUSH_LATEST:-1}"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not on PATH" >&2
  exit 1
fi

if ! docker image inspect "$REPO:$VERSION" >/dev/null 2>&1; then
  echo "error: $REPO:$VERSION not tagged locally." >&2
  echo "       run \`npm run docker:tag\` first." >&2
  exit 1
fi

echo "pushing $REPO:$VERSION"
docker push "$REPO:$VERSION"

if [[ "$PUSH_LATEST" != "0" ]]; then
  if docker image inspect "$REPO:latest" >/dev/null 2>&1; then
    echo "pushing $REPO:latest"
    docker push "$REPO:latest"
  else
    echo "skip: $REPO:latest is not tagged locally (run docker-tag.sh first)" >&2
  fi
fi
