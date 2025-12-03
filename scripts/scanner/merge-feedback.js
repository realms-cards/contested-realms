#!/usr/bin/env node
/**
 * Merge Scanner Feedback into Training Data
 *
 * Takes user-submitted photos from data/scanner-feedback/images/
 * and links them into data/scanner-training/images/ for retraining.
 *
 * Usage: node scripts/scanner/merge-feedback.js
 */

const fs = require("fs");
const path = require("path");

const FEEDBACK_DIR = path.join(__dirname, "../../data/scanner-feedback/images");
const TRAINING_DIR = path.join(__dirname, "../../data/scanner-training/images");
const LOG_PATH = path.join(
  __dirname,
  "../../data/scanner-feedback/feedback-log.jsonl"
);

function main() {
  console.log("📸 Merging Scanner Feedback into Training Data");
  console.log("=".repeat(50));

  // Check if feedback directory exists
  if (!fs.existsSync(FEEDBACK_DIR)) {
    console.log("❌ No feedback directory found. Collect some feedback first!");
    console.log(
      "   Run the scanner and use the 'Wrong' button to submit corrections."
    );
    process.exit(0);
  }

  // Read feedback log
  let feedbackEntries = [];
  if (fs.existsSync(LOG_PATH)) {
    const content = fs.readFileSync(LOG_PATH, "utf-8");
    feedbackEntries = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  console.log(`\n📊 Feedback Statistics:`);
  console.log(`   Total entries: ${feedbackEntries.length}`);
  console.log(
    `   Corrections: ${feedbackEntries.filter((e) => !e.wasCorrect).length}`
  );
  console.log(
    `   Confirmations: ${feedbackEntries.filter((e) => e.wasCorrect).length}`
  );
  console.log(
    `   Unique cards: ${new Set(feedbackEntries.map((e) => e.cardName)).size}`
  );

  // Get all feedback images
  const cardDirs = fs.readdirSync(FEEDBACK_DIR).filter((f) => {
    const stat = fs.statSync(path.join(FEEDBACK_DIR, f));
    return stat.isDirectory();
  });

  let linked = 0;
  let skipped = 0;

  for (const cardName of cardDirs) {
    const feedbackCardDir = path.join(FEEDBACK_DIR, cardName);
    const trainingCardDir = path.join(TRAINING_DIR, cardName);

    // Create training directory if needed
    if (!fs.existsSync(trainingCardDir)) {
      fs.mkdirSync(trainingCardDir, { recursive: true });
    }

    // Link each feedback image
    const images = fs
      .readdirSync(feedbackCardDir)
      .filter((f) => f.endsWith(".jpg"));

    for (const img of images) {
      const srcPath = path.join(feedbackCardDir, img);
      const destPath = path.join(trainingCardDir, `feedback_${img}`);

      if (fs.existsSync(destPath)) {
        skipped++;
        continue;
      }

      // Create symlink
      fs.symlinkSync(srcPath, destPath);
      linked++;
    }
  }

  console.log(
    `\n✅ Merged ${linked} feedback images (${skipped} already linked)`
  );
  console.log(`\n📝 To retrain the model with feedback data:`);
  console.log(`   python scripts/scanner/train-model.py --epochs 20`);
}

main();
