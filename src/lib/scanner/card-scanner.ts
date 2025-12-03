/**
 * Card Scanner - TensorFlow.js based card recognition
 *
 * Note: @tensorflow/tfjs must be installed: npm install @tensorflow/tfjs
 */

// Dynamic import to avoid build issues when TF.js not installed
type TFModule = typeof import("@tensorflow/tfjs");
let tf: TFModule | null = null;

async function loadTF(): Promise<TFModule> {
  if (!tf) {
    tf = await import("@tensorflow/tfjs");
  }
  return tf;
}

export interface ScanResult {
  cardName: string;
  confidence: number;
  topK: Array<{ cardName: string; confidence: number }>;
}

export interface CardScannerConfig {
  modelUrl?: string;
  classMapUrl?: string;
  confidenceThreshold?: number;
  topK?: number;
}

const DEFAULT_CONFIG: Required<CardScannerConfig> = {
  modelUrl: "/models/card-scanner/tfjs/model.json",
  classMapUrl: "/models/card-scanner/tfjs/class_map.json",
  confidenceThreshold: 0.5,
  topK: 5,
};

// Model type - use unknown since TF.js is optional
interface TFModel {
  predict(input: unknown): unknown;
  dispose(): void;
}

export class CardScanner {
  private model: TFModel | null = null;
  private classMap: Record<string, string> | null = null;
  private config: Required<CardScannerConfig>;
  private loading: Promise<void> | null = null;
  private isGraphModel: boolean = false;

  constructor(config: CardScannerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async load(): Promise<void> {
    if (this.model) return;
    if (this.loading) return this.loading;

    this.loading = this._load();
    await this.loading;
  }

  private async _load(): Promise<void> {
    console.log("[CardScanner] Loading model...");

    const tfModule = await loadTF();

    // Load model and class map in parallel
    // Try graph model first (more compatible), fall back to layers model
    let model: TFModel;
    try {
      model = await tfModule.loadGraphModel(this.config.modelUrl);
      this.isGraphModel = true;
      console.log("[CardScanner] Loaded as graph model");
    } catch {
      console.log("[CardScanner] Graph model failed, trying layers model...");
      model = await tfModule.loadLayersModel(this.config.modelUrl);
      this.isGraphModel = false;
      console.log("[CardScanner] Loaded as layers model");
    }

    const classMapResponse = await fetch(this.config.classMapUrl);

    this.model = model;
    const classMapData = await classMapResponse.json();
    this.classMap = classMapData.indexToClass as Record<string, string>;

    const numClasses = this.classMap ? Object.keys(this.classMap).length : 0;
    console.log(`[CardScanner] Model loaded. ${numClasses} classes`);

    // Warm up the model with a dummy prediction
    const dummyInput = tfModule.zeros([1, 224, 224, 3]);
    await this.model.predict(dummyInput);
    dummyInput.dispose();
    console.log("[CardScanner] Model warmed up");
  }

  async predict(
    imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    cropToNameRegion: boolean = false
  ): Promise<ScanResult | null> {
    if (!this.model || !this.classMap) {
      throw new Error("Model not loaded. Call load() first.");
    }

    const tfModule = await loadTF();
    const classMap = this.classMap;

    // If cropping to name region, extract that portion first
    let sourceElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement =
      imageElement;

    if (cropToNameRegion) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const srcWidth =
          imageElement instanceof HTMLVideoElement
            ? imageElement.videoWidth
            : imageElement.width;
        const srcHeight =
          imageElement instanceof HTMLVideoElement
            ? imageElement.videoHeight
            : imageElement.height;

        // Same crop region as OCR scanner
        const cropX = srcWidth * 0.08;
        const cropY = srcHeight * 0.12;
        const cropW = srcWidth * 0.84;
        const cropH = srcHeight * 0.1;

        canvas.width = 224;
        canvas.height = 224;
        ctx.drawImage(imageElement, cropX, cropY, cropW, cropH, 0, 0, 224, 224);
        sourceElement = canvas;
      }
    }

    // Preprocess image
    const tensor = tfModule.tidy(() => {
      let img = tfModule.browser.fromPixels(sourceElement);

      // Resize to model input size (224x224)
      img = tfModule.image.resizeBilinear(img, [224, 224]);

      // Normalize to [-1, 1] for MobileNetV2
      // Formula: (pixel / 127.5) - 1
      img = img.toFloat().div(127.5).sub(1);

      // Add batch dimension
      return img.expandDims(0);
    });

    // Run inference - graph models use execute(), layers models use predict()
    let predictionResult: unknown;
    if (this.isGraphModel) {
      // Graph model - use execute with output node name
      const graphModel = this.model as unknown as {
        execute: (input: unknown) => unknown;
      };
      predictionResult = graphModel.execute(tensor);
    } else {
      predictionResult = this.model.predict(tensor);
    }

    const predictions = Array.isArray(predictionResult)
      ? predictionResult[0]
      : predictionResult;
    tensor.dispose();

    // Get top-K predictions
    const probabilities = await predictions.data();
    predictions.dispose();

    const indexed: Array<{ index: number; probability: number }> = [];
    for (let i = 0; i < probabilities.length; i++) {
      indexed.push({ index: i, probability: probabilities[i] });
    }

    indexed.sort((a, b) => b.probability - a.probability);
    const topK = indexed.slice(0, this.config.topK);

    const topPrediction = topK[0];
    if (
      !topPrediction ||
      topPrediction.probability < this.config.confidenceThreshold
    ) {
      return null;
    }

    return {
      cardName: classMap[topPrediction.index.toString()] ?? "Unknown",
      confidence: topPrediction.probability,
      topK: topK.map((p) => ({
        cardName: classMap[p.index.toString()] ?? "Unknown",
        confidence: p.probability,
      })),
    };
  }

  async predictFromVideo(
    video: HTMLVideoElement,
    cropToNameRegion: boolean = false
  ): Promise<ScanResult | null> {
    return this.predict(video, cropToNameRegion);
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.classMap = null;
    this.loading = null;
  }

  get isLoaded(): boolean {
    return this.model !== null;
  }
}

// Singleton instance
let scannerInstance: CardScanner | null = null;

export function getCardScanner(config?: CardScannerConfig): CardScanner {
  if (!scannerInstance) {
    scannerInstance = new CardScanner(config);
  }
  return scannerInstance;
}
