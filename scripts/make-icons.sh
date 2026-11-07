#!/usr/bin/env bash
#
# Regenerate the app icons in public/ from the Handheld icon, the same design as the Android launcher
# icon. Flat fills only, so any SVG renderer draws it the same.
#
#   art/icon-source.svg   the toy alone, cropped to its shell, transparent corners
#   art/icon-tile.svg     the toy on its ink square, exactly the Play Store icon
#
#   icon-512 / icon-192 / favicon-32   the shell filling the frame, transparent corners
#   icon-maskable-512                  the ink tile (the toy already sits inside the safe zone)
#   apple-touch-icon (180)             the ink tile, since iOS puts black behind transparency
#
# The PNGs are committed, so this never runs during a build or a deploy. Run it by hand when
# the artwork changes, then commit what it writes.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$ROOT/public"
SRC="$ROOT/art/icon-source.svg"
TILE="$ROOT/art/icon-tile.svg"

command -v magick >/dev/null || { echo "✗ ImageMagick (magick) not found: brew install imagemagick"; exit 1; }
command -v qlmanage >/dev/null || { echo "✗ qlmanage (macOS QuickLook) not found: this script needs macOS"; exit 1; }
for f in "$SRC" "$TILE"; do [ -f "$f" ] || { echo "✗ Missing $f"; exit 1; }; done

# Rendering goes through macOS QuickLook (WebKit), because ImageMagick's built-in SVG renderer
# turns circles into polygons and drops thin strokes. QuickLook paints a white background, so the
# toy's transparent corners come from a second render of just its silhouette, used as the alpha.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ql() { qlmanage -t -s 1024 -o "$TMP" "$1" >/dev/null 2>&1; echo "$TMP/$(basename "$1").png"; }

cat > "$TMP/silhouette.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="22.3 23 63.4 63.4" width="1024" height="1024">
<rect x="0" y="0" width="108" height="108" fill="#000"/>
<circle cx="54" cy="54" r="31" fill="#fff"/><circle cx="54" cy="55.4" r="31" fill="#fff"/>
</svg>
SVG

SHELL_PNG="$(ql "$SRC")"
MASK_PNG="$(ql "$TMP/silhouette.svg")"
TILE_PNG="$(ql "$TILE")"
magick "$SHELL_PNG" \( "$MASK_PNG" -colorspace gray \) -alpha off -compose CopyOpacity -composite "$TMP/shell.png"

echo "→ Shell-fills-frame sizes (transparent)"
for s in 512 192 32; do
  name="icon-$s.png"; [ "$s" = 32 ] && name="favicon-32.png"
  magick "$TMP/shell.png" -filter Lanczos -resize "${s}x${s}" "$PUBLIC/$name"
done

echo "→ Maskable and apple-touch (the ink tile)"
magick "$TILE_PNG" -filter Lanczos -resize 512x512 -alpha off "$PUBLIC/icon-maskable-512.png"
magick "$TILE_PNG" -filter Lanczos -resize 180x180 -alpha off "$PUBLIC/apple-touch-icon.png"

echo "✓ Wrote icons to $PUBLIC"
