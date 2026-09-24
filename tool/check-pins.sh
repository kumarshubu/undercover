#!/usr/bin/env bash
# Fails if the toolchain drifts off the versions this machine can actually build.
#
# WHY THIS EXISTS
#   macOS Sonoma 14.5 caps Xcode at 16.2, which caps Swift at 6.0.3.
#   Expo SDK 55+ ships iOS code written against Swift 6.1/6.2:
#     SDK 55  -> expo-modules-core uses `@MainActor` placement Swift 6.0 rejects
#     SDK 56+ -> expo-modules-jsi + expo-modules-macros-plugin declare
#                `swift-tools-version: 6.2`, so SPM refuses before compiling.
#   Measured on 2026-09-08: SDK 57 fails, 56 fails, 55 fails, 54 builds clean.
#   Do not bump `expo` past 54 until macOS is upgraded (Tahoe 26 is available).
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

expo_major=$(node -p "require('./package.json').dependencies.expo.replace(/[^0-9.]/g,'').split('.')[0]")
if [ "$expo_major" != "54" ]; then
  echo "FAIL: expo major is $expo_major, expected 54 (see header)"; fail=1
else
  echo "ok: expo pinned to 54.x"
fi

swift_minor=$(swift --version 2>/dev/null | sed -n 's/.*Apple Swift version \([0-9]*\.[0-9]*\).*/\1/p' | head -1)
if [ "$swift_minor" != "6.0" ]; then
  echo "note: Swift is $swift_minor, not 6.0 — if you upgraded Xcode, this pin can be lifted"
else
  echo "ok: Swift 6.0 (pin still required)"
fi

bad=$(find node_modules -name Package.swift -path '*apple*' 2>/dev/null \
      | xargs -I{} head -1 {} 2>/dev/null | grep -c '6\.2' || true)
if [ "$bad" != "0" ]; then
  echo "FAIL: $bad Package.swift files require swift-tools 6.2 — iOS build will not resolve"; fail=1
else
  echo "ok: no swift-tools 6.2 packages in tree"
fi

exit $fail
