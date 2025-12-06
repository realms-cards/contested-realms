#!/bin/bash
# Upload processed card images to CDN (Cloudflare R2 or S3-compatible)
#
# Prerequisites:
#   brew install s3cmd
#   s3cmd --configure  # Set up credentials (use R2 endpoint for Cloudflare)
#
# Usage:
#   ./scripts/upload-cdn.sh              # Upload all (webp + ktx2 + root assets)
#   ./scripts/upload-cdn.sh webp         # Upload only webp
#   ./scripts/upload-cdn.sh ktx2         # Upload only ktx2
#   ./scripts/upload-cdn.sh root         # Upload only root assets (boosters, elements, etc.)
#   ./scripts/upload-cdn.sh --dry-run    # Preview what would be uploaded

set -e

# Configuration - DigitalOcean Spaces (fra1)
# CDN URL: https://cdn.realms.cards (points to this bucket)
BUCKET="${CDN_BUCKET:-contested-realms-cdn}"  # DigitalOcean Spaces bucket name
# s3cmd is configured via ~/.s3cfg (run: s3cmd --configure)

# Directories to upload
WEBP_DIR="data-webp"
KTX2_DIR="data-ktx2"
DATA_DIR="data"

# Root assets that need to be at CDN root (not under data-webp/)
# Boosters: uploaded as PNG
ROOT_BOOSTERS=(
  "alphabeta-booster.png"
  "arthurian-booster.png"
  "dragonlord-booster.png"
  "gothic-booster.png"
)

# Elements and cardbacks: uploaded as WebP (from data-webp/)
ROOT_WEBP_ASSETS=(
  "air.webp"
  "earth.webp"
  "fire.webp"
  "water.webp"
  "cardback_atlas.webp"
  "cardback_spellbook.webp"
  "skybox.webp"
)

# Other root assets (from data/)
ROOT_OTHER_ASSETS=(
  "playmat.jpg"
)

# Parse arguments
DRY_RUN=""
TARGET="all"

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN="--dry-run"
      ;;
    webp)
      TARGET="webp"
      ;;
    ktx2)
      TARGET="ktx2"
      ;;
    root)
      TARGET="root"
      ;;
    all)
      TARGET="all"
      ;;
  esac
done

echo "=== CDN Upload Script ==="
echo "Bucket: s3://$BUCKET"
echo "Target: $TARGET"
[ -n "$DRY_RUN" ] && echo "Mode: DRY RUN (no actual uploads)"
echo ""

upload_dir() {
  local src_dir=$1
  local dest_path=$2
  local content_type=$3
  
  if [ ! -d "$src_dir" ]; then
    echo "⚠️  Directory not found: $src_dir"
    return 1
  fi
  
  local file_count=$(find "$src_dir" -type f | wc -l | tr -d ' ')
  echo "📁 Uploading $src_dir ($file_count files) → s3://$BUCKET/$dest_path"
  
  s3cmd sync \
    $DRY_RUN \
    --acl-public \
    --no-mime-magic \
    --guess-mime-type \
    --add-header="Cache-Control:public, max-age=31536000, immutable" \
    "$src_dir/" "s3://$BUCKET/$dest_path/"
  
  echo "✅ Done: $src_dir"
  echo ""
}

upload_file() {
  local src_file=$1
  local dest_path=$2
  
  if [ ! -f "$src_file" ]; then
    echo "⚠️  File not found: $src_file"
    return 1
  fi
  
  echo "📄 Uploading $src_file → s3://$BUCKET/$dest_path"
  
  s3cmd put \
    $DRY_RUN \
    --acl-public \
    --no-mime-magic \
    --guess-mime-type \
    --add-header="Cache-Control:public, max-age=31536000, immutable" \
    "$src_file" "s3://$BUCKET/$dest_path"
}

upload_root_assets() {
  echo "📦 Uploading root assets to CDN root..."
  echo ""
  
  # Upload booster PNGs from data/
  echo "🎴 Booster pack images (PNG):"
  for asset in "${ROOT_BOOSTERS[@]}"; do
    if [ -f "$DATA_DIR/$asset" ]; then
      upload_file "$DATA_DIR/$asset" "$asset"
    else
      echo "⚠️  Missing: $DATA_DIR/$asset"
    fi
  done
  echo ""
  
  # Upload WebP assets from data-webp/
  echo "🖼️  Element and UI assets (WebP):"
  for asset in "${ROOT_WEBP_ASSETS[@]}"; do
    if [ -f "$WEBP_DIR/$asset" ]; then
      upload_file "$WEBP_DIR/$asset" "$asset"
    else
      echo "⚠️  Missing: $WEBP_DIR/$asset"
    fi
  done
  echo ""
  
  # Upload other root assets from data/
  echo "🎨 Other root assets:"
  for asset in "${ROOT_OTHER_ASSETS[@]}"; do
    if [ -f "$DATA_DIR/$asset" ]; then
      upload_file "$DATA_DIR/$asset" "$asset"
    else
      echo "⚠️  Missing: $DATA_DIR/$asset"
    fi
  done
  echo ""
  
  echo "✅ Root assets upload complete"
  echo ""
}

# Upload root assets (boosters, elements, cardbacks, playmat)
if [ "$TARGET" = "all" ] || [ "$TARGET" = "root" ]; then
  upload_root_assets
fi

# Upload WebP files
if [ "$TARGET" = "all" ] || [ "$TARGET" = "webp" ]; then
  upload_dir "$WEBP_DIR" "data-webp" "image/webp"
fi

# Upload KTX2 files
if [ "$TARGET" = "all" ] || [ "$TARGET" = "ktx2" ]; then
  upload_dir "$KTX2_DIR" "data-ktx2" "application/octet-stream"
fi

echo "=== Upload Complete ==="
echo ""
echo "CDN URL: https://cdn.realms.cards"
echo ""
echo "Test URLs:"
echo "  Booster:  curl -I https://cdn.realms.cards/gothic-booster.png"
echo "  Element:  curl -I https://cdn.realms.cards/fire.webp"
echo "  Cardback: curl -I https://cdn.realms.cards/cardback_spellbook.webp"
echo "  Card:     curl -I https://cdn.realms.cards/data-webp/gothic/vampire_b_s.webp"
