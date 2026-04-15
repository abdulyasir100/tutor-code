#!/usr/bin/env bash
set -e

echo "→ Installing dependencies..."
npm ci

echo "→ Building extension and webviews..."
npm run build

echo "→ Packaging VSIX..."
npx vsce package --no-dependencies

echo "✓ Done. Install with:"
echo "  code --install-extension tutorcode-*.vsix"
