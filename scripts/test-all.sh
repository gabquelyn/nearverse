#!/usr/bin/env bash
# Everything that doesn't need a browser or a network to NEAR. Fails on the first problem.
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n== %s\n' "$1"; }
digest() { cat packages/economy/generated/rules.json packages/economy/fixtures/*.json | sha256sum; }

step "Generated rules and fixtures match the source files"
before=$(digest); npm run -s gen; npm run -s fixtures
[ "$before" = "$(digest)" ] || { echo "Generated files are stale. Run npm run gen && npm run fixtures and commit them."; exit 1; }

step "Type checks"
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p packages/economy/tsconfig.json
npx tsc --noEmit -p web/tsconfig.json

step "Economy tests"
npm test -w packages/economy

step "Contract tests, including Rust and TypeScript parity"
npm run -s test:contract

step "Contract build and wasm run"
npm run -s build:contract
npm run -s smoke:wasm

printf '\nAll tests passed.\n'
