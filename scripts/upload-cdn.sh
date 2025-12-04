#!/bin/bash
# Upload processed card images to CDN (Cloudflare R2 or S3-compatible)
#
# Prerequisites:
#   brew install s3cmd
#   s3cmd --configure  # Set up credentials (use R2 endpoint for Cloudflare)
#
# Usage:
#   ./scripts/upload-cdn.sh              # Upload all (webp + ktx2)
#   ./scripts/upload-cdn.sh webp         # Upload only webp
#   ./scripts/upload-cdn.sh ktx2         # Upload only ktx2
#   ./scripts/upload-cdn.sh --dry-run    # Preview what would be uploaded

set -e

# Configuration - DigitalOcean Spaces (fra1)
# CDN URL: https://cdn.realms.cards (points to this bucket)
BUCKET="${CDN_BUCKET:-contested-realms-cdn}"  # DigitalOcean Spaces bucket name
# s3cmd is configured via ~/.s3cfg (run: s3cmd --configure)

# Directories to upload
WEBP_DIR="data-webp"
KTX2_DIR="data-ktx2"

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
echo "Test with: curl -I https://cdn.realms.cards/data-ktx2/beta/b_s/abundance_b_s.ktx2"
