# Card Image Processing Pipeline

Complete guide for processing card art from source images to CDN deployment.

## Overview

```
cardart/original/     →  data/{set}/          →  data-webp/{set}/    →  CDN
(source PNGs)            (processed PNGs)        data-ktx2/{set}/

alp-abundance-b-f.png →  alpha/b_s/abundance_b_s.png  →  .webp + .ktx2
got-vampire-b-s.png   →  gothic/vampire_b_s.png       →  .webp + .ktx2
pro-swap-op-s.png     →  promo/swap_op_s.png          →  .webp + .ktx2
```

## Source File Naming Convention

Files in `cardart/original/` follow Curiosa's download format:

```
{set_prefix}-{card_name}-{product}-{finish}.png

Examples:
  alp-abundance-b-f.png        # Alpha, Booster, Foil
  bet-fireball-b-s.png         # Beta, Booster, Standard
  art-king_arthur-b-s.png      # Arthurian, Booster, Standard
  got-vampire_lord-b-s.png     # Gothic, Booster, Standard
  pro-swap-op-s.png            # Promo, Organized_Play, Standard
  dra-dragonlord-b-s.png       # Dragonlord, Booster, Standard
```

### Set Prefixes

| Prefix       | Set Name             | Output Directory     |
| ------------ | -------------------- | -------------------- |
| `alp`        | Alpha                | `alpha/`             |
| `bet`        | Beta                 | `beta/`              |
| `art`, `arl` | Arthurian Legends    | `arthurian_legends/` |
| `got`, `gth` | Gothic               | `gothic/`            |
| `dra`, `drl` | Dragonlord           | `dragonlord/`        |
| `pro`        | Promo/Organized Play | `promo/`             |

### Product Codes

| Code | Product Type     |
| ---- | ---------------- |
| `b`  | Booster          |
| `bt` | Box Topper       |
| `d`  | Draft            |
| `p`  | Prerelease       |
| `pd` | Prerelease Draft |
| `pp` | Prerelease Promo |
| `op` | Organized Play   |

### Finish Codes

| Code | Finish   |
| ---- | -------- |
| `s`  | Standard |
| `f`  | Foil     |

## Directory Structure

### Sets WITH suffix subdirectories (legacy)

Alpha, Beta, and Arthurian use subdirectories for product/finish:

```
data/alpha/
├── b_s/        # Booster Standard
├── b_f/        # Booster Foil
├── bt_s/       # Box Topper Standard
├── d_s/        # Draft Standard
└── ...
```

### Sets WITHOUT subdirectories (current)

Gothic, Dragonlord, and Promo store files flat:

```
data/gothic/
├── vampire_lord_b_s.png
├── vampire_lord_b_f.png
└── ...
```

---

## Pipeline Commands (In Order)

### Step 0: Prerequisites

```bash
# Ensure dependencies are installed
npm install

# KTX2 tools (required for Step 3)
brew install ktx-software
```

### Step 1: Process Card Art

Converts source images from `cardart/original/` to normalized format in `data/`:

```bash
# Dry run first to preview
npm run assets:process -- --dryRun

# Process all sets
npm run assets:process -- --force

# Process specific set only
npm run assets:process -- --set gothic --force
npm run assets:process -- --set promo --force
```

**Output**: PNG files in `data/{set}/` with normalized names

### Step 2: Generate WebP

Converts PNGs to WebP for browser delivery:

```bash
# Generate WebP versions
npm run assets:webp:out

# With force (regenerate all)
npm run assets:webp:out -- --force
```

**Output**: WebP files in `data-webp/{set}/`

### Step 3: Generate KTX2

Converts PNGs to KTX2 for Three.js 3D rendering:

```bash
# Generate KTX2 (UASTC format - recommended)
npm run assets:compress:out

# With force (regenerate all)
npm run assets:compress:out -- --force

# Alternative: ETC1S (smaller files, lower quality)
npm run assets:compress:etc1s
```

**Output**: KTX2 files in `data-ktx2/{set}/`

### Step 4: Upload to CDN

Uploads processed assets to DigitalOcean Spaces:

```bash
# Prerequisites: Configure s3cmd
s3cmd --configure  # Set R2/Spaces credentials

# Dry run to preview
npm run cdn:upload -- --dry-run

# Upload all (webp + ktx2 + root assets)
npm run cdn:upload

# Upload only specific format
npm run cdn:upload:webp
npm run cdn:upload:ktx2

# Upload only root assets (boosters, elements, cardbacks)
npm run cdn:upload -- root
```

---

## Full Pipeline (Fresh Start)

```bash
# 1. Clear existing processed data (CAREFUL!)
rm -rf data/alpha data/beta data/arthurian_legends data/gothic data/dragonlord data/promo
rm -rf data-webp/alpha data-webp/beta data-webp/arthurian_legends data-webp/gothic data-webp/dragonlord data-webp/promo
rm -rf data-ktx2/alpha data-ktx2/beta data-ktx2/arthurian_legends data-ktx2/gothic data-ktx2/dragonlord data-ktx2/promo

# 2. Process all card art
npm run assets:process -- --force

# 3. Generate WebP
npm run assets:webp:out -- --force

# 4. Generate KTX2
npm run assets:compress:out -- --force

# 5. Upload to CDN
npm run cdn:upload
```

## Adding a New Set

1. Place source images in `cardart/original/` with correct naming
2. Add set prefix to `scripts/process-card-art.js` SET_PREFIXES (if new)
3. Add set prefix to `src/app/api/images/[slug]/route.ts` setDirFromSlug()
4. Add set to `src/app/api/images/[slug]/serve-local.ts` preferredOrder
5. Run the pipeline:
   ```bash
   npm run assets:process -- --set newset --force
   npm run assets:webp:out -- --force
   npm run assets:compress:out -- --force
   npm run cdn:upload
   ```

---

## CDN Structure

```
cdn.realms.cards/
├── data-webp/
│   ├── alpha/
│   │   ├── b_s/           # Suffix subdirs for legacy sets
│   │   └── b_f/
│   ├── gothic/            # Flat for newer sets
│   ├── promo/
│   └── tokens/
├── data-ktx2/
│   └── (same structure)
├── alphabeta-booster.png  # Root assets
├── gothic-booster.png
├── fire.webp
├── cardback_spellbook.webp
└── playmat.jpg
```

## Troubleshooting

### 404 errors for cards

1. Check if the image exists locally: `ls data-webp/{set}/{cardname}_b_s.webp`
2. Verify slug mapping in route.ts handles the set prefix
3. Ensure image was uploaded to CDN

### KTX2 compression fails

- Install KTX tools: `brew install ktx-software`
- Check image dimensions are multiples of 4 (auto-padded)
- Try `--tool toktx` flag for better format support

### Missing promo images

- Promo images need `pro-` prefix in cardart/original
- CDN needs `data-webp/promo/` and `data-ktx2/promo/` directories
