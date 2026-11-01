#!/usr/bin/env bash
#
# Regenerate the app icons in public/ from art/icon-source.svg (a 1024 square, flat fills only:
# ImageMagick's built-in SVG renderer ignores gradients).
#
#   icon-512 / icon-192 / favicon-32   the shell filling the frame, transparent corners
#   icon-maskable-512                  inset for the safe zone, on paper
#   apple-touch-icon (180)             on paper, since iOS puts black behind transparency
#
# The PNGs are committed, so this never runs during a build or a deploy. Run it by hand when
# the artwork changes, then commit what it writes.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$ROOT/public"
SRC="$ROOT/art/icon-source.svg"
PAPER="#f6f0e2"

command -v magick >/dev/null || { echo "✗ ImageMagick (magick) not found: brew install imagemagick"; exit 1; }
[ -f "$SRC" ] || { echo "✗ Missing $SRC"; exit 1; }

render() { magick -background none -density 384 "$SRC" -resize "$1x$1" "${@:2}"; }

echo "→ Shell-fills-frame sizes (transparent)"
render 512 "$PUBLIC/icon-512.png"
render 192 "$PUBLIC/icon-192.png"
render 32 "$PUBLIC/favicon-32.png"

echo "→ Maskable (shell inset to 80%, on paper) and apple-touch"
magick -background none -density 384 "$SRC" -resize 410x410 -background "$PAPER" -gravity center -extent 512x512 -alpha remove -alpha off "$PUBLIC/icon-maskable-512.png"
magick -background none -density 384 "$SRC" -resize 150x150 -background "$PAPER" -gravity center -extent 180x180 -alpha remove -alpha off "$PUBLIC/apple-touch-icon.png"

echo "✓ Wrote icons to $PUBLIC"
