# Card Scanner

Scan physical Sorcery TCG cards with your camera to add them to your digital collection.

## Overview

The card scanner uses a TensorFlow.js model trained on card artwork to recognize cards in real-time via webcam. It runs entirely in the browser—no server round-trips needed.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Training Pipeline                                          │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │ prepare-training │    │   train-model    │              │
│  │    -data.js      │───▶│      .py         │──┐           │
│  │ (downloads imgs) │    │ (MobileNetV2)    │  │           │
│  └──────────────────┘    └──────────────────┘  │           │
│                                                 ▼           │
│                          ┌──────────────────────────────┐  │
│                          │ public/models/card-scanner/  │  │
│                          │   tfjs/model.json            │  │
│                          │   tfjs/class_map.json        │  │
│                          └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Browser Runtime                                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Camera     │───▶│  CardScanner │───▶│  Collection  │  │
│  │  (webcam)    │    │  (TF.js)     │    │    API       │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Install TensorFlow.js (optional dependency)

```bash
npm install @tensorflow/tfjs
```

### 2. Prepare Training Data

Downloads card images from CDN and organizes them for training:

```bash
npm run scanner:prepare
```

**Options:**

- `--output-dir <path>` - Output directory (default: `data/scanner-training`)
- `--card-level true|false` - Group by card name (true) or variant slug (false)
- `--set <set>` - Filter to specific set: `alpha`, `beta`, `arthurian`, `dragonlord`
- `--limit <n>` - Limit number of cards (for testing)
- `--concurrency <n>` - Download concurrency (default: 10)

**Set-specific preparation** (for collectors who want Alpha/Beta distinction):

```bash
npm run scanner:prepare:alpha  # Only Alpha cards
npm run scanner:prepare:beta   # Only Beta cards
```

Test with a small subset first:

```bash
npm run scanner:prepare:test  # Downloads 100 images
```

### 3. Train the Model

Requires Python with TensorFlow:

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r scripts/scanner/requirements.txt

# Train
python scripts/scanner/train-model.py
```

Options:

- `--data-dir <path>` - Training data directory
- `--output-dir <path>` - Model output directory
- `--epochs <n>` - Training epochs (default: 20)
- `--batch-size <n>` - Batch size (default: 32)
- `--img-size <n>` - Image size (default: 224)

### 3b. Cloud Training (Alternative)

If local training fails (e.g., "AVX instructions not available" on older machines), use **Google Colab**:

1. **Prepare and zip training data:**

   ```bash
   npm run scanner:prepare
   cd data/scanner-training && zip -r images.zip images/
   ```

2. **Upload notebook to Colab:**

   - Open [Google Colab](https://colab.research.google.com/)
   - Upload `scripts/scanner/train_colab.ipynb`
   - Enable GPU: Runtime → Change runtime type → T4 GPU

3. **Run the notebook:**

   - Upload `images.zip` when prompted
   - Wait for training (~10-15 min on T4 GPU)
   - Download `card_scanner_model.zip`

4. **Install the model:**
   ```bash
   unzip card_scanner_model.zip -d public/models/card-scanner/
   ```

### 4. Use the Scanner

Navigate to `/collection/scan` to use the scanner.

## Files

| Path                                         | Description                             |
| -------------------------------------------- | --------------------------------------- |
| `scripts/scanner/prepare-training-data.js`   | Downloads and organizes training images |
| `scripts/scanner/train-model.py`             | Trains MobileNetV2 classifier           |
| `scripts/scanner/train_colab.ipynb`          | Google Colab notebook (cloud training)  |
| `scripts/scanner/requirements.txt`           | Python dependencies                     |
| `src/lib/scanner/card-scanner.ts`            | TensorFlow.js inference class           |
| `src/components/scanner/CardScannerView.tsx` | React scanner UI component              |
| `src/app/collection/scan/page.tsx`           | Scanner page                            |
| `public/models/card-scanner/tfjs/`           | Trained model files (generated)         |
| `data/scanner-training/`                     | Training data (generated)               |

## How It Works

### Training

1. **Data Preparation**: Downloads ~2,200 card images from CDN, organized by card name or variant slug
2. **Model Architecture**: Uses MobileNetV2 as a feature extractor with a custom classification head
3. **Training Strategy**: Two-phase training—first trains head only, then fine-tunes top layers
4. **Export**: Converts Keras model to TensorFlow.js format

### Inference

1. **Load**: Loads TF.js model and class map on first use
2. **Preprocess**: Resizes camera frame to 224x224, normalizes to [0,1]
3. **Predict**: Runs through MobileNetV2 + classification head
4. **Postprocess**: Returns top-K predictions with confidence scores

## Performance

- **Model size**: ~15MB (MobileNetV2 + head)
- **Inference time**: ~10-30ms per frame on modern devices
- **Accuracy**: ~95%+ on clean card images (varies with lighting/angle)

## Tips for Best Results

1. **Good lighting** - Even, diffuse light works best; avoid harsh shadows
2. **Card fills frame** - Position card to fill ~70% of the viewfinder
3. **Avoid glare** - Especially important for foil cards
4. **Steady hand** - Hold camera stable for a moment when scanning
5. **Clean cards** - Sleeves and surface damage may affect recognition

## Future Improvements

- [ ] Pre-trained model included in repo (currently requires training)
- [ ] Offline support via Service Worker
- [ ] Batch scanning (multiple cards at once)
- [ ] Foil card detection
- [ ] Card condition assessment
- [ ] Set/variant disambiguation
