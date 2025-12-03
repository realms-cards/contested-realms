"use client";

import {
  Camera,
  X,
  Check,
  RotateCcw,
  Loader2,
  AlertCircle,
  ChevronDown,
  ThumbsDown,
  Search,
  Video,
  Type,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  getCardScanner,
  type ScanResult,
  type CardScanner,
} from "@/lib/scanner/card-scanner";
import { getOCRScanner, type OCRScanner } from "@/lib/scanner/ocr-scanner";

type ScanMode = "ocr" | "hybrid" | "ml";

export type ScannerSet = "all" | "alpha" | "beta" | "arthurian";

const SET_OPTIONS: { value: ScannerSet; label: string }[] = [
  { value: "all", label: "All Sets" },
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "arthurian", label: "Arthurian Legends" },
];

interface CardScannerViewProps {
  onCardDetected?: (result: ScanResult) => void;
  onAddToCollection?: (cardName: string, set: ScannerSet) => void;
  onClose?: () => void;
  defaultSet?: ScannerSet;
}

export function CardScannerView({
  onCardDetected,
  onAddToCollection,
  onClose,
  defaultSet = "all",
}: CardScannerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<CardScanner | null>(null);
  const animationRef = useRef<number | null>(null);

  const [status, setStatus] = useState<
    "loading" | "ready" | "scanning" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null);
  const [confirmedCard, setConfirmedCard] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "environment"
  );
  const [selectedSet, setSelectedSet] = useState<ScannerSet>(defaultSet);
  const [showSetPicker, setShowSetPicker] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionSearch, setCorrectionSearch] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const feedbackCanvasRef = useRef<HTMLCanvasElement>(null);

  // Camera selection
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [showCameraPicker, setShowCameraPicker] = useState(false);

  // Result stabilization - require consistent results to reduce hopping
  const resultBufferRef = useRef<string[]>([]);
  const [stableResult, setStableResult] = useState<ScanResult | null>(null);
  const stickyResultRef = useRef<{ name: string; count: number } | null>(null);

  // All card names for correction search
  const [allCardNames, setAllCardNames] = useState<string[]>([]);

  // Scan mode: ML (image classification) or OCR (text recognition)
  const [scanMode, setScanMode] = useState<ScanMode>("ocr"); // Default to OCR
  const ocrScannerRef = useRef<OCRScanner | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false); // Track video orientation

  // Initialize scanner and camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function init() {
      try {
        setStatus("loading");
        setError(null);

        // Check if running in browser (not SSR)
        if (typeof window === "undefined" || typeof navigator === "undefined") {
          return;
        }

        // Check if camera API is available (requires HTTPS or localhost)
        if (!navigator.mediaDevices?.getUserMedia) {
          const isSecure =
            window.location.protocol === "https:" ||
            window.location.hostname === "localhost";
          if (!isSecure) {
            setError(
              "Camera requires HTTPS. Please access via https:// or localhost."
            );
          } else {
            setError("Camera not supported in this browser.");
          }
          setStatus("error");
          return;
        }

        // Initialize TensorFlow.js scanner
        const scanner = getCardScanner();
        scannerRef.current = scanner;

        // Check if model exists before loading
        try {
          const modelCheck = await fetch(
            "/models/card-scanner/tfjs/model.json",
            {
              method: "HEAD",
            }
          );
          if (!modelCheck.ok) {
            setError(
              "Model not trained yet. Run:\n1. node scripts/scanner/prepare-training-data.js\n2. python scripts/scanner/train-model.py"
            );
            setStatus("error");
            return;
          }
        } catch {
          setError(
            "Model not found. Train the model first:\n1. node scripts/scanner/prepare-training-data.js\n2. python scripts/scanner/train-model.py"
          );
          setStatus("error");
          return;
        }

        await scanner.load();

        // Load ALL card names from search index for correction search
        try {
          const indexRes = await fetch("/api/cards/search-index");
          if (indexRes.ok) {
            const index = await indexRes.json();
            // index.entries is [[cardId, variantId, setId, cardName, slug, setName, isFoil], ...]
            const uniqueNames = new Set<string>();
            for (const entry of index.entries || []) {
              const cardName = entry[3]; // cardName is at index 3
              if (typeof cardName === "string" && cardName.length > 0) {
                uniqueNames.add(cardName);
              }
            }
            const cardNamesArray = Array.from(uniqueNames).sort();
            setAllCardNames(cardNamesArray);
            console.log(
              `[CardScanner] Loaded ${uniqueNames.size} card names for correction`
            );

            // Initialize OCR scanner with card names for matching
            setOcrLoading(true);
            const ocrScanner = getOCRScanner();
            await ocrScanner.load(cardNamesArray);
            ocrScannerRef.current = ocrScanner;
            setOcrLoading(false);
            console.log("[CardScanner] OCR scanner ready");
          }
        } catch (e) {
          console.warn(
            "[CardScanner] Could not load card names for correction:",
            e
          );
        }

        // Request camera access first (needed before enumeration on many devices)
        // Use high resolution for better OCR accuracy
        const baseConstraints: MediaTrackConstraints = {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30 },
        };

        // Add device or facing mode constraint
        const initialConstraints: MediaTrackConstraints = selectedCameraId
          ? { ...baseConstraints, deviceId: { exact: selectedCameraId } }
          : { ...baseConstraints, facingMode };

        stream = await navigator.mediaDevices.getUserMedia({
          video: initialConstraints,
          audio: false,
        });

        // NOW enumerate cameras (labels are available after permission granted)
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        setCameras(videoDevices);

        // Get the active camera's deviceId
        const activeTrack = stream.getVideoTracks()[0];
        const activeDeviceId = activeTrack?.getSettings()?.deviceId;

        // If we have a selected camera and it's different from active, switch to it
        if (selectedCameraId && activeDeviceId !== selectedCameraId) {
          // Stop current stream and get the selected camera with high resolution
          stream.getTracks().forEach((t) => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              ...baseConstraints,
              deviceId: { exact: selectedCameraId },
            },
            audio: false,
          });
        } else if (!selectedCameraId && activeDeviceId) {
          // Set the active camera as selected
          setSelectedCameraId(activeDeviceId);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          // Log actual resolution and detect orientation
          const track = stream.getVideoTracks()[0];
          const settings = track?.getSettings();
          if (settings?.width && settings?.height) {
            console.log(
              `[CardScanner] Camera: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`
            );
            setIsLandscape(settings.width > settings.height);
          }
        }

        setStatus("ready");
      } catch (err) {
        console.error("[CardScanner] Init error:", err);
        if (err instanceof Error) {
          if (err.name === "NotAllowedError") {
            setError(
              "Camera access denied. Please allow camera access to scan cards."
            );
          } else if (err.name === "NotFoundError") {
            setError("No camera found. Please connect a camera to scan cards.");
          } else {
            setError(err.message);
          }
        }
        setStatus("error");
      }
    }

    init();

    return () => {
      // Cleanup
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [facingMode, selectedCameraId]);

  // Scanning loop
  const scan = useCallback(async () => {
    // Pause scanning if correction modal is open
    if (showCorrection) {
      // Keep the loop alive but don't scan
      animationRef.current = requestAnimationFrame(() => {
        setTimeout(scan, 200);
      });
      return;
    }

    if (status !== "scanning" || !videoRef.current) {
      return;
    }

    // Check if the appropriate scanner is ready
    const mlReady = scanMode === "ml" && scannerRef.current?.isLoaded;
    const ocrReady = scanMode === "ocr" && ocrScannerRef.current?.isLoaded;

    if (!mlReady && !ocrReady) {
      // Continue loop but don't scan yet
      animationRef.current = requestAnimationFrame(() => {
        setTimeout(scan, 200);
      });
      return;
    }

    try {
      let result: ScanResult | null = null;

      if (scanMode === "ocr" && ocrScannerRef.current) {
        // OCR mode - read text from card name region
        const ocrResult = await ocrScannerRef.current.scanCardName(
          videoRef.current
        );
        if (ocrResult) {
          const cardName =
            ocrResult.matchedName || `[OCR: ${ocrResult.rawText}]`;
          result = {
            cardName,
            confidence: ocrResult.confidence,
            topK: [{ cardName, confidence: ocrResult.confidence }],
          };
        }
      } else if ((scanMode as ScanMode) === "hybrid") {
        // Hybrid mode - combine OCR + ML on name region for best accuracy
        let ocrMatch: string | null = null;
        let ocrConf = 0;

        // Try OCR first
        if (ocrScannerRef.current) {
          const ocrResult = await ocrScannerRef.current.scanCardName(
            videoRef.current
          );
          if (ocrResult?.matchedName) {
            ocrMatch = ocrResult.matchedName;
            ocrConf = ocrResult.confidence;
          }
        }

        // Also try ML on name region
        let mlMatch: string | null = null;
        let mlConf = 0;
        if (scannerRef.current?.isLoaded) {
          const mlResult = await scannerRef.current.predictFromVideo(
            videoRef.current,
            true
          );
          if (mlResult) {
            mlMatch = mlResult.cardName;
            mlConf = mlResult.confidence;
          }
        }

        // Use the best result, prefer OCR if similar confidence
        if (ocrMatch && (!mlMatch || ocrConf >= mlConf * 0.8)) {
          result = {
            cardName: ocrMatch,
            confidence: ocrConf,
            topK: [{ cardName: ocrMatch, confidence: ocrConf }],
          };
        } else if (mlMatch) {
          result = {
            cardName: mlMatch,
            confidence: mlConf,
            topK: [{ cardName: mlMatch, confidence: mlConf }],
          };
        }

        // If both agree, boost confidence!
        if (ocrMatch && mlMatch && ocrMatch === mlMatch) {
          result = {
            cardName: ocrMatch,
            confidence: Math.min(1, ocrConf + mlConf * 0.3),
            topK: [
              { cardName: ocrMatch, confidence: Math.min(1, ocrConf + 0.2) },
            ],
          };
          console.log("[Hybrid] Both agree:", ocrMatch);
        }
      } else if (scanMode === "ml" && scannerRef.current) {
        // ML mode - image classification on full card
        result = await scannerRef.current.predictFromVideo(videoRef.current);
      }

      // Store raw result for feedback
      setCurrentResult(result);

      // Smart stabilization with sticky results
      // OCR is slower so needs fewer consistent results, ML needs more
      const stabilityThreshold = scanMode === "ocr" ? 2 : 3;

      if (result && !result.cardName.startsWith("[OCR:")) {
        const cardName = result.cardName;
        const confidence = result.confidence;

        // Track this result
        resultBufferRef.current.push(cardName);
        if (resultBufferRef.current.length > stabilityThreshold + 2) {
          resultBufferRef.current.shift();
        }

        // Check if we have consistent results
        const recentResults = resultBufferRef.current.slice(
          -stabilityThreshold
        );
        const isConsistent =
          recentResults.length >= stabilityThreshold &&
          recentResults.every((name) => name === cardName);

        // High confidence match (>60%) - show immediately and make sticky
        if (confidence > 0.6 || isConsistent) {
          setStableResult(result);
          onCardDetected?.(result);

          // Make this result sticky - keep showing it
          stickyResultRef.current = { name: cardName, count: 0 };
        }
      } else if (stickyResultRef.current) {
        // No good result - but we have a sticky result, keep showing it for a bit
        stickyResultRef.current.count++;

        // Only clear after 5 failed scans (2.5 seconds for OCR)
        if (stickyResultRef.current.count > 5) {
          stickyResultRef.current = null;
          resultBufferRef.current = [];
          setStableResult(null);
        }
        // Otherwise keep showing the sticky result
      }
    } catch (err) {
      console.error("[CardScanner] Scan error:", err);
    }

    // Continue scanning - OCR is slower so use lower framerate
    const delay = scanMode === "ocr" ? 500 : 100;
    animationRef.current = requestAnimationFrame(() => {
      setTimeout(scan, delay);
    });
  }, [status, onCardDetected, showCorrection, scanMode]);

  // Start/stop scanning
  const startScanning = useCallback(() => {
    setStatus("scanning");
    setCurrentResult(null);
    setStableResult(null);
    setConfirmedCard(null);
    resultBufferRef.current = [];
  }, []);

  const stopScanning = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setStatus("ready");
  }, []);

  // Trigger scan loop when status changes to scanning
  useEffect(() => {
    if (status === "scanning") {
      scan();
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [status, scan]);

  // Confirm detected card and continue scanning for next card
  const confirmCard = useCallback(() => {
    const resultToUse = stableResult || currentResult;
    if (resultToUse) {
      // Add to collection
      onAddToCollection?.(resultToUse.cardName, selectedSet);

      // Show brief confirmation then continue scanning
      setConfirmedCard(resultToUse.cardName);

      // Clear current detection and reset for next card
      setTimeout(() => {
        setConfirmedCard(null);
        setCurrentResult(null);
        setStableResult(null);
        stickyResultRef.current = null;
        resultBufferRef.current = [];
      }, 1000); // Show confirmation for 1 second

      // Don't stop scanning - continue for next card
    }
  }, [stableResult, currentResult, onAddToCollection, selectedSet]);

  // Switch camera
  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }, []);

  // Submit feedback with correction
  const submitFeedback = useCallback(
    async (correctCardName: string) => {
      if (!videoRef.current || !feedbackCanvasRef.current || !currentResult)
        return;

      setSubmittingFeedback(true);
      try {
        // Capture current frame
        const canvas = feedbackCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = 224;
        canvas.height = 224;
        ctx.drawImage(videoRef.current, 0, 0, 224, 224);

        // Convert to blob
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.9)
        );
        if (!blob) return;

        // Submit to API
        const formData = new FormData();
        formData.append("image", blob, "scan.jpg");
        formData.append("cardName", correctCardName);
        formData.append("predictedName", currentResult.cardName);
        formData.append("confidence", String(currentResult.confidence));

        const res = await fetch("/api/scanner/feedback", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          setConfirmedCard(correctCardName);
          setShowCorrection(false);
          setCorrectionSearch("");
          stopScanning();
        }
      } catch (err) {
        console.error("Feedback submission failed:", err);
      } finally {
        setSubmittingFeedback(false);
      }
    },
    [currentResult, stopScanning]
  );

  return (
    <div className="relative flex flex-col h-full bg-black">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/collection"
            className="flex items-center justify-center w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            title="Back to Collection"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <h2 className="text-lg font-bold text-white">Card Scanner</h2>
          {ocrLoading && (
            <span className="text-xs text-cyan-400 flex items-center">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Loading OCR...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Scan Mode Toggle - cycles through: OCR → Hybrid → ML → OCR */}
          <button
            onClick={() => {
              const modes: ScanMode[] = ["ocr", "hybrid", "ml"];
              const idx = modes.indexOf(scanMode);
              setScanMode(modes[(idx + 1) % modes.length]);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
              scanMode === "ocr"
                ? "bg-cyan-500/30 text-cyan-300 border border-cyan-500/50"
                : scanMode === "hybrid"
                ? "bg-green-500/30 text-green-300 border border-green-500/50"
                : "bg-purple-500/30 text-purple-300 border border-purple-500/50"
            }`}
            title={
              scanMode === "ocr"
                ? "OCR: Reading card name text"
                : scanMode === "hybrid"
                ? "Hybrid: OCR + ML combined (best accuracy)"
                : "ML: Full card image recognition"
            }
          >
            {scanMode === "ocr" ? (
              <>
                <Type className="w-4 h-4" />
                <span>OCR</span>
              </>
            ) : scanMode === "hybrid" ? (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Hybrid</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                <span>ML</span>
              </>
            )}
          </button>
          {/* Camera Picker - show if multiple cameras OR if any camera has a label */}
          {cameras.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowCameraPicker(!showCameraPicker)}
                className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-white text-sm transition-colors"
                title="Select camera"
              >
                <Video className="w-4 h-4" />
                {cameras.length > 1 && <ChevronDown className="w-3 h-3" />}
              </button>
              {showCameraPicker && (
                <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-white/20 rounded-md shadow-lg overflow-hidden min-w-[200px] max-w-[300px] z-50">
                  <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10">
                    {cameras.length} camera{cameras.length !== 1 ? "s" : ""}{" "}
                    available
                  </div>
                  {cameras.map((camera, index) => {
                    // Generate a readable label
                    const label =
                      camera.label ||
                      (camera.deviceId === selectedCameraId
                        ? "Current Camera"
                        : `Camera ${index + 1}`);
                    // Detect if it's likely front/back camera
                    const isFront =
                      label.toLowerCase().includes("front") ||
                      label.toLowerCase().includes("facetime");
                    const isBack =
                      label.toLowerCase().includes("back") ||
                      label.toLowerCase().includes("rear");

                    return (
                      <button
                        key={camera.deviceId || index}
                        onClick={() => {
                          setSelectedCameraId(camera.deviceId);
                          setShowCameraPicker(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors ${
                          selectedCameraId === camera.deviceId
                            ? "text-cyan-400 bg-white/5"
                            : "text-white"
                        }`}
                      >
                        <div className="truncate">{label}</div>
                        {(isFront || isBack) && (
                          <div className="text-xs text-white/40">
                            {isFront ? "📱 Front" : "📷 Back"}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Set Picker */}
          <div className="relative">
            <button
              onClick={() => setShowSetPicker(!showSetPicker)}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-white text-sm transition-colors"
            >
              {SET_OPTIONS.find((o) => o.value === selectedSet)?.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showSetPicker && (
              <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-white/20 rounded-md shadow-lg overflow-hidden min-w-[140px]">
                {SET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSelectedSet(option.value);
                      setShowSetPicker(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors ${
                      selectedSet === option.value
                        ? "text-cyan-400 bg-white/5"
                        : "text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Video feed */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Scanning overlay */}
        {status === "scanning" && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Scanning frame */}
            <div className="absolute inset-8 border-2 border-white/50 rounded-lg">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-cyan-400 rounded-br-lg" />
            </div>

            {/* OCR mode: highlight the card name reading region */}
            {(scanMode === "ocr" || (scanMode as ScanMode) === "hybrid") && (
              <div
                className="absolute border-2 border-cyan-400 bg-cyan-400/10 rounded animate-pulse"
                style={
                  isLandscape
                    ? {
                        // Landscape: narrower region in center
                        left: "25%",
                        top: "8%",
                        width: "50%",
                        height: "12%",
                      }
                    : {
                        // Portrait: wider region
                        left: "8%",
                        top: "12%",
                        width: "84%",
                        height: "10%",
                      }
                }
              >
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-cyan-400 bg-black/80 px-2 py-1 rounded whitespace-nowrap">
                  📖 Position card name in this area
                </div>
              </div>
            )}

            {/* ML mode: Scanning line animation */}
            {scanMode === "ml" && (
              <div className="absolute inset-8 overflow-hidden rounded-lg">
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan" />
              </div>
            )}

            {/* Show current detection while waiting for stability */}
            {currentResult && !stableResult && (
              <div className="absolute bottom-28 left-4 right-4 text-center pointer-events-auto">
                <span className="text-white/60 text-sm bg-black/50 px-3 py-1 rounded-full">
                  Detecting: {currentResult.cardName}...
                </span>
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
            <p className="text-white">Loading scanner...</p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-8">
            <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-white text-center whitespace-pre-line">
              {error}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Result overlay - show stable result to reduce hopping */}
        {stableResult && status === "scanning" && !showCorrection && (
          <div className="absolute bottom-24 left-4 right-4 bg-black/80 rounded-lg p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-cyan-400 font-bold text-lg">
                {stableResult.cardName}
              </span>
              <span className="text-white/70">
                {(stableResult.confidence * 100).toFixed(1)}%
              </span>
            </div>

            {/* Top alternatives - clickable for correction */}
            {stableResult.topK.length > 1 && (
              <div className="text-xs text-white/50 space-y-0.5 mb-2">
                {stableResult.topK
                  .slice(1, 4)
                  .map(
                    (
                      alt: { cardName: string; confidence: number },
                      i: number
                    ) => (
                      <button
                        key={i}
                        className="flex justify-between w-full hover:text-cyan-300 hover:bg-white/5 px-1 rounded transition-colors"
                        onClick={() => submitFeedback(alt.cardName)}
                        disabled={submittingFeedback}
                      >
                        <span>{alt.cardName}</span>
                        <span>{(alt.confidence * 100).toFixed(1)}%</span>
                      </button>
                    )
                  )}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <Button
                className="flex-1 bg-cyan-600 hover:bg-cyan-500"
                onClick={confirmCard}
              >
                <Check className="w-4 h-4 mr-2" />
                Correct
              </Button>
              <Button
                variant="outline"
                className="border-orange-500 text-orange-400 hover:bg-orange-500/20"
                onClick={() => setShowCorrection(true)}
              >
                <ThumbsDown className="w-4 h-4 mr-1" />
                Wrong
              </Button>
            </div>
          </div>
        )}

        {/* Correction modal */}
        {(stableResult || currentResult) && showCorrection && (
          <div className="absolute bottom-24 left-4 right-4 bg-black/90 rounded-lg p-4 backdrop-blur-sm max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-bold">Select correct card:</span>
              <button
                onClick={() => {
                  setShowCorrection(false);
                  setCorrectionSearch("");
                }}
                className="text-white/50 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input
                type="text"
                value={correctionSearch}
                onChange={(e) => setCorrectionSearch(e.target.value)}
                placeholder="Search cards..."
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-400"
                autoFocus
              />
            </div>

            {/* Show topK suggestions when no search, or all matching cards when searching */}
            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {correctionSearch.length >= 2 ? (
                // Search all cards
                <>
                  <div className="text-xs text-white/40 mb-2">
                    {
                      allCardNames.filter((name) =>
                        name
                          .toLowerCase()
                          .includes(correctionSearch.toLowerCase())
                      ).length
                    }{" "}
                    matches
                  </div>
                  {allCardNames
                    .filter((name) =>
                      name
                        .toLowerCase()
                        .includes(correctionSearch.toLowerCase())
                    )
                    .slice(0, 50) // Limit to 50 results for performance
                    .map((cardName, i) => (
                      <button
                        key={i}
                        className="flex justify-between w-full p-2 hover:bg-cyan-500/20 rounded transition-colors text-white text-left"
                        onClick={() => submitFeedback(cardName)}
                        disabled={submittingFeedback}
                      >
                        <span>{cardName}</span>
                      </button>
                    ))}
                </>
              ) : (
                // Show top predictions with confidence
                <>
                  <div className="text-xs text-white/40 mb-2">
                    Top predictions (type to search all {allCardNames.length}{" "}
                    cards)
                  </div>
                  {((stableResult || currentResult)?.topK ?? []).map(
                    (
                      alt: { cardName: string; confidence: number },
                      i: number
                    ) => (
                      <button
                        key={i}
                        className="flex justify-between w-full p-2 hover:bg-cyan-500/20 rounded transition-colors text-white text-left"
                        onClick={() => submitFeedback(alt.cardName)}
                        disabled={submittingFeedback}
                      >
                        <span>{alt.cardName}</span>
                        <span className="text-white/50 text-sm">
                          {(alt.confidence * 100).toFixed(1)}%
                        </span>
                      </button>
                    )
                  )}
                </>
              )}
            </div>

            {submittingFeedback && (
              <div className="flex items-center justify-center mt-3 text-cyan-400">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </div>
            )}
          </div>
        )}

        {/* Confirmed card toast - shows briefly then auto-dismisses */}
        {confirmedCard && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 animate-pulse">
            <div className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg">
              <Check className="w-5 h-5" />
              <span className="font-medium">{confirmedCard}</span>
              <span className="text-green-200 text-sm">added!</span>
            </div>
          </div>
        )}

        {/* Hidden canvas for processing */}
        <canvas ref={canvasRef} className="hidden" width={224} height={224} />
        <canvas
          ref={feedbackCanvasRef}
          className="hidden"
          width={224}
          height={224}
        />
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-4">
          {status === "ready" && (
            <Button
              size="lg"
              className="bg-cyan-600 hover:bg-cyan-500"
              onClick={startScanning}
            >
              <Camera className="w-5 h-5 mr-2" />
              Start Scanning
            </Button>
          )}

          {status === "scanning" && (
            <Button size="lg" variant="outline" onClick={stopScanning}>
              <X className="w-5 h-5 mr-2" />
              Stop
            </Button>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={switchCamera}
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* CSS for scan animation */}
      <style jsx>{`
        @keyframes scan {
          0% {
            top: 0;
          }
          50% {
            top: 100%;
          }
          100% {
            top: 0;
          }
        }
        .animate-scan {
          animation: scan 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
