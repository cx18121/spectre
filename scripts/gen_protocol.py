#!/usr/bin/env python3
"""
DEPRECATED — DO NOT USE.

This script was replaced in Phase 1 (D-04) by ts-rs.
TypeScript bindings for shared/protocol.ts are now generated from Rust types
using the ts-rs derive macro.

To regenerate shared/protocol.ts:
    cd engine
    cargo test --manifest-path engine-core/Cargo.toml

The test run exports all #[ts(export)] types to the directory configured in
engine/.cargo/config.toml (TS_RS_EXPORT_DIR = ../../shared).

Running this script will raise an error to prevent accidental overwrites.
"""
import sys

print(
    "ERROR: gen_protocol.py is DEPRECATED (D-04).\n"
    "Run `cargo test` from engine/ to regenerate shared/protocol.ts via ts-rs.\n"
    "See .planning/phases/01-engine-core/01-CONTEXT.md decision D-04 for rationale.",
    file=sys.stderr,
)
sys.exit(1)
