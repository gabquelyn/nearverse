#!/usr/bin/env bash
# Builds the contract and lowers it to the wasm feature set the NEAR runtime accepts.
set -euo pipefail
cd "$(dirname "$0")/.."
# --cfg near switches near-sdk to real host calls; without it errors abort with no readable message.
RUSTFLAGS="--cfg near" cargo build --locked --manifest-path contracts/nearverse/Cargo.toml --target wasm32-unknown-unknown --release
IN=contracts/nearverse/target/wasm32-unknown-unknown/release/nearverse.wasm
mkdir -p out
npx wasm-opt "$IN" -Oz --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int --enable-mutable-globals --enable-multivalue --enable-reference-types \
  --signext-lowering --llvm-memory-copy-fill-lowering --llvm-nontrapping-fptoint-lowering --strip-debug --strip-producers -o out/nearverse.wasm
ls -la out/nearverse.wasm
sha256sum out/nearverse.wasm
