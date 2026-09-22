#!/bin/sh
# Naming-boundary check for retire-v1 (#416). Run from the repository root.
# Exits 1, printing the offenders, when the v2 name survives in a tracked path,
# in one of the enumerated code identifiers, or as a served address.
# design.md "Naming boundary" is the authority for what is excluded and kept.
set -u
status=0
paths=$(git ls-files -- . ':!openspec/changes' ':!docs/scope' ':!.impeccable' ':!mockups' | grep -i 'v2' || true)
if [ -n "$paths" ]; then echo "PATHS:"; echo "$paths"; status=1; fi
idents=$(git grep -n -F \
  -e 'frontend-v2' -e 'parseV2Route' -e 'serializeV2Route' -e '_FRONTEND_V2' \
  -e 'V2_PAGE' -e 'V2_ASSET' -e 'V2_DESTINATION' -e 'V2_CONTEXT_KEYS' \
  -e 'V2_DEFAULT_DESTINATION' -e 'index_v2' -e 'HARMONIC_DIST_V2' -e 'distV2' \
  -e 'rootV2' -e 'indexV2' -e 'dev:v2' -e 'config.v2' \
  -- . ':!openspec/changes' ':!docs/scope' ':!.impeccable' ':!mockups' || true)
if [ -n "$idents" ]; then echo "IDENTIFIERS:"; echo "$idents"; status=1; fi
# A /v2 address may appear only where something asserts it answers 404: the
# route test and the ledger replay's R19 (the package proof is under mockups/).
addrs=$(git grep -n -e '/v2/' -e '/v2"' -e "/v2'" \
  -- . ':!openspec/changes' ':!docs/scope' ':!.impeccable' ':!mockups' \
     ':!tests/test_frontend_asset_routes.py' ':!frontend/desk-behavior.replay.mjs' || true)
if [ -n "$addrs" ]; then echo "ADDRESSES:"; echo "$addrs"; status=1; fi
exit $status
