import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const FEEDBACK_DIR = path.join(process.cwd(), "data/scanner-feedback");

// POST /api/scanner/feedback
// Upload a photo with the correct card label for training
export async function POST(request: NextRequest) {
  try {
    // Optional: require auth for feedback
    const session = await getServerSession(authOptions);

    const formData = await request.formData();
    const image = formData.get("image") as Blob | null;
    const cardName = formData.get("cardName") as string | null;
    const predictedName = formData.get("predictedName") as string | null;
    const confidence = formData.get("confidence") as string | null;

    if (!image || !cardName) {
      return NextResponse.json(
        { error: "Missing image or cardName" },
        { status: 400 }
      );
    }

    // Sanitize card name for filesystem
    const sanitizedName = cardName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
    const cardDir = path.join(FEEDBACK_DIR, "images", sanitizedName);

    // Create directory if needed
    await fs.mkdir(cardDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const userId = session?.user?.id || "anonymous";
    const filename = `${timestamp}_${userId}.jpg`;
    const filepath = path.join(cardDir, filename);

    // Save image
    const buffer = Buffer.from(await image.arrayBuffer());
    await fs.writeFile(filepath, buffer);

    // Log feedback for analysis
    const logEntry = {
      timestamp: new Date().toISOString(),
      cardName,
      predictedName,
      confidence: confidence ? parseFloat(confidence) : null,
      wasCorrect: cardName === predictedName,
      userId,
      imagePath: filepath,
    };

    const logPath = path.join(FEEDBACK_DIR, "feedback-log.jsonl");
    await fs.appendFile(logPath, JSON.stringify(logEntry) + "\n");

    console.log(
      `[Scanner Feedback] Saved ${filename} as "${cardName}" (predicted: "${predictedName}")`
    );

    return NextResponse.json({
      success: true,
      message: `Photo saved as "${cardName}"`,
      wasCorrection: cardName !== predictedName,
    });
  } catch (error) {
    console.error("[Scanner Feedback] Error:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}

// GET /api/scanner/feedback/stats
// Get feedback statistics
export async function GET() {
  try {
    const logPath = path.join(FEEDBACK_DIR, "feedback-log.jsonl");

    let entries: Array<{
      cardName: string;
      wasCorrect: boolean;
    }> = [];

    try {
      const content = await fs.readFile(logPath, "utf-8");
      entries = content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      // No log file yet
    }

    const stats = {
      totalFeedback: entries.length,
      corrections: entries.filter((e) => !e.wasCorrect).length,
      confirmations: entries.filter((e) => e.wasCorrect).length,
      uniqueCards: new Set(entries.map((e) => e.cardName)).size,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[Scanner Feedback] Stats error:", error);
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
}
