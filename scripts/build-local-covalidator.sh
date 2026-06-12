#!/usr/bin/env bash
#
# Build a NATIVE (arm64) Inco covalidator for the `mainnet` pepper.
#
# Why: the published `inconetwork/local-node-covalidator-mainnet` image is amd64-only.
# On Apple Silicon (arm64) it runs under emulation, where the covalidator's post-quantum
# X-Wing / ML-KEM crypto computes incorrectly → `attestedDecrypt` fails with "invalid tag".
# Building the covalidator natively (arm64) from the inco-monorepo fixes that.
#
# On a native amd64 host (Linux x86 / CI / Intel Mac) you do NOT need this — just use the
# published image with `platform: linux/amd64`.
#
# Requires: docker, git, and `gh` authenticated with access to Inco-fhevm/inco-monorepo.
set -euo pipefail

TAG="${INCO_TAG:-v1.0.0-rc-8}"          # keep in sync with @inco/js / @inco/lightning
PEPPER_ENV="mainnet.latest.env"         # matches Lib.sol executor 0x4b9911…8624
IMAGE="inco-covalidator-mainnet:arm64"
SRC="${TMPDIR:-/tmp}/inco-monorepo"

echo "==> Sparse-cloning covalidator source from inco-monorepo @ ${TAG}"
rm -rf "$SRC"
gh repo clone Inco-fhevm/inco-monorepo "$SRC" -- --filter=blob:none --no-checkout --sparse --depth 1
cd "$SRC"
git sparse-checkout set --cone covalidator pkg local-node/covalidator
git fetch --depth 1 origin "refs/tags/${TAG}:refs/tags/${TAG}"
git checkout "$TAG"

echo "==> Staging matched ${PEPPER_ENV} (covalidator keys for the mainnet dump)"
mkdir -p local-node/dumps
docker run --rm --entrypoint cat "inconetwork/local-node-anvil-mainnet:${TAG}" "/dumps/${PEPPER_ENV}" \
  > "local-node/dumps/${PEPPER_ENV}"

echo "==> Building native covalidator image: ${IMAGE}"
docker build -f local-node/covalidator/Dockerfile \
  --build-arg "DUMP_ENV=${PEPPER_ENV}" \
  -t "${IMAGE}" .

echo "==> Done. docker-compose.yaml references ${IMAGE}."
echo "    Now run:  docker compose up -d && pnpm hardhat compile && bun test"
