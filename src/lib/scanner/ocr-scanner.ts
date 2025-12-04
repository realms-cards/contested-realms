/**
 * OCR-based Card Name Scanner
 * Uses Tesseract.js to read card names directly from images
 */

import Tesseract from "tesseract.js";

export interface OCRScanResult {
  cardName: string;
  confidence: number;
  rawText: string;
  matchedName: string | null;
}

// Normalize text for OCR comparison - handle common OCR mistakes
function normalizeForOCR(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      // Common OCR confusions
      .replace(/[1il|]/g, "i") // 1, l, |, I -> i
      .replace(/[0o]/g, "o") // 0, O -> o
      .replace(/[8b]/g, "b") // 8, B -> b
      .replace(/[5s]/g, "s") // 5, S -> s
      .replace(/[2z]/g, "z") // 2, Z -> z
      .replace(/[ck]/g, "c") // k often misread as c
      .replace(/rn/g, "m") // rn often misread as m
      .replace(/vv/g, "w") // vv often misread as w
      .replace(/[''`]/g, "'") // Normalize quotes
      .replace(/[^a-z ]/g, "")
  ); // Keep only letters and spaces
}

// Fuzzy match score (0-1) - OCR-aware similarity
function similarity(a: string, b: string): number {
  const la = normalizeForOCR(a);
  const lb = normalizeForOCR(b);

  if (la === lb) return 1;
  if (la.length === 0 || lb.length === 0) return 0;

  // Exact start match is very good (first word matches)
  const aWords = la.split(" ");
  const bWords = lb.split(" ");
  if (
    aWords[0] &&
    bWords[0] &&
    aWords[0] === bWords[0] &&
    aWords[0].length > 2
  ) {
    return 0.85;
  }

  // Contains check for partial matches
  if (la.includes(lb) || lb.includes(la)) {
    const ratio =
      Math.min(la.length, lb.length) / Math.max(la.length, lb.length);
    return 0.7 + ratio * 0.2; // 0.7-0.9 depending on length ratio
  }

  // Levenshtein distance with OCR-normalized strings
  const matrix: number[][] = [];
  for (let i = 0; i <= la.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= la.length; i++) {
    for (let j = 1; j <= lb.length; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[la.length][lb.length];
  const maxLen = Math.max(la.length, lb.length);
  return 1 - distance / maxLen;
}

export class OCRScanner {
  private worker: Tesseract.Worker | null = null;
  private cardNames: string[] = [];
  private loading: Promise<void> | null = null;

  async load(cardNames: string[]): Promise<void> {
    if (this.worker) return;
    if (this.loading) return this.loading;

    this.loading = this._load(cardNames);
    return this.loading;
  }

  private async _load(cardNames: string[]): Promise<void> {
    console.log("[OCRScanner] Loading Tesseract worker...");

    this.cardNames = cardNames;

    // Create and initialize worker
    this.worker = await Tesseract.createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          // Progress updates during recognition
        }
      },
    });

    // Optimize for card names (short text, specific characters)
    await this.worker.setParameters({
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '-,.",
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });

    console.log("[OCRScanner] Tesseract ready");
  }

  async scanCardName(
    imageElement: HTMLVideoElement | HTMLCanvasElement,
    cropRegion?: { x: number; y: number; width: number; height: number }
  ): Promise<OCRScanResult | null> {
    if (!this.worker) {
      throw new Error("OCR not loaded. Call load() first.");
    }

    // Create canvas to extract the name region
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Default crop: top portion where card name typically is
    const sourceWidth =
      imageElement instanceof HTMLVideoElement
        ? imageElement.videoWidth
        : imageElement.width;
    const sourceHeight =
      imageElement instanceof HTMLVideoElement
        ? imageElement.videoHeight
        : imageElement.height;

    // Detect if video is landscape (desktop) or portrait (phone)
    const isLandscape = sourceWidth > sourceHeight;

    // Adjust region based on orientation
    // For landscape: card is likely in center, narrower region
    // For portrait: card fills more of the frame
    const region =
      cropRegion ||
      (isLandscape
        ? {
            // Landscape: focus on center where card is held
            x: sourceWidth * 0.25, // 25% from left (center the card)
            y: sourceHeight * 0.08, // 8% from top
            width: sourceWidth * 0.5, // 50% width (just the card area)
            height: sourceHeight * 0.12, // 12% height for name area
          }
        : {
            // Portrait: card fills more of frame
            x: sourceWidth * 0.08, // 8% from left
            y: sourceHeight * 0.12, // 12% from top
            width: sourceWidth * 0.84, // 84% width
            height: sourceHeight * 0.1, // 10% height
          });

    // Scale up for better OCR (Tesseract works better with larger text)
    const scale = 3;
    canvas.width = region.width * scale;
    canvas.height = region.height * scale;

    // Draw scaled region
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      imageElement,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Preprocess for fantasy font OCR
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate histogram for adaptive thresholding
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      );
      histogram[gray]++;
    }

    // Find Otsu's threshold
    const total = canvas.width * canvas.height;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0,
      wB = 0,
      maxVariance = 0,
      threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    // Try both normal and inverted binarization
    // Some cards have light text on dark, others dark on light
    const tryBinarization = async (
      invert: boolean
    ): Promise<{ text: string; confidence: number }> => {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const binary = invert
          ? gray > threshold
            ? 0
            : 255 // Inverted: dark text
          : gray > threshold
          ? 255
          : 0; // Normal: light text
        d[i] = d[i + 1] = d[i + 2] = binary;
      }
      ctx.putImageData(imgData, 0, 0);

      if (!this.worker) {
        throw new Error("OCR worker not initialized");
      }
      const res = await this.worker.recognize(canvas);
      return {
        text: res.data.text.trim(),
        confidence: res.data.confidence / 100,
      };
    };

    // Try normal first
    let { text: rawText, confidence } = await tryBinarization(false);

    // If low confidence, try inverted
    if (confidence < 0.5 || !rawText) {
      const inverted = await tryBinarization(true);
      if (inverted.confidence > confidence) {
        rawText = inverted.text;
        confidence = inverted.confidence;
        console.log("[OCR] Using inverted binarization");
      }
    }

    // Debug logging
    console.log(
      "[OCR] Raw:",
      rawText,
      "| Conf:",
      (confidence * 100).toFixed(0) + "%"
    );

    if (!rawText) {
      return null;
    }

    // Clean up OCR text - remove common OCR errors
    const cleanText = rawText
      .replace(/[|\\\/\[\]{}()_]/g, "") // Remove common OCR artifacts
      .replace(/[0-9]/g, "") // Remove numbers (card names don't have them)
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

    // Find best matching card name
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const name of this.cardNames) {
      const score = similarity(cleanText, name);
      if (score > bestScore && score > 0.35) {
        bestScore = score;
        bestMatch = name;
      }
    }

    if (bestMatch) {
      console.log(
        "[OCR] Match:",
        bestMatch,
        "| Score:",
        (bestScore * 100).toFixed(0) + "%"
      );
    }

    return {
      cardName: bestMatch || cleanText,
      confidence: bestMatch ? bestScore : confidence * 0.3,
      rawText: cleanText,
      matchedName: bestMatch,
    };
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  get isLoaded(): boolean {
    return this.worker !== null;
  }
}

// Singleton instance
let ocrInstance: OCRScanner | null = null;

export function getOCRScanner(): OCRScanner {
  if (!ocrInstance) {
    ocrInstance = new OCRScanner();
  }
  return ocrInstance;
}
