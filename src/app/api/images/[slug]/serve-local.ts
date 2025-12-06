import fs from "fs";
import path from "path";

interface ServeLocalAssetArgs {
  base: string;
  suffix: string | null;
  wantKtx2: boolean;
  primarySetDir: string;
}

function dirVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const upperFirst = name.charAt(0).toUpperCase() + name.slice(1);
  return Array.from(new Set([name, lower, upperFirst].filter(Boolean)));
}

function resolveRoots(primarySetDir: string, wantKtx2: boolean): string[] {
  const variants = dirVariants(primarySetDir);
  const preferredBases = wantKtx2
    ? ["data-ktx2", "data"]
    : ["data-webp", "data"];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const baseDir of preferredBases) {
    for (const variant of variants) {
      const candidate = path.join(process.cwd(), baseDir, variant);
      if (!seen.has(candidate)) {
        seen.add(candidate);
        result.push(candidate);
      }
    }
  }

  return result;
}

function buildCrossSetRoots(
  primarySetDir: string,
  wantKtx2: boolean
): string[] {
  const preferredOrder = [
    "beta",
    "alpha",
    "arthurian_legends",
    "dragonlord",
    "gothic",
  ];
  const searchSets = preferredOrder.filter((set) => set !== primarySetDir);
  const seen = new Set<string>();
  const roots: string[] = [];

  for (const setName of searchSets) {
    const variants = dirVariants(setName);
    for (const variant of variants) {
      const baseDirs = wantKtx2
        ? [
            path.join(process.cwd(), "data-ktx2", variant),
            path.join(process.cwd(), "data", variant),
          ]
        : [
            path.join(process.cwd(), "data-webp", variant),
            path.join(process.cwd(), "data", variant),
          ];
      for (const baseDir of baseDirs) {
        if (!seen.has(baseDir)) {
          seen.add(baseDir);
          roots.push(baseDir);
        }
      }
    }
  }

  return roots;
}

function buildCandidates({
  base,
  suffix,
  primarySetDir,
  wantKtx2,
}: ServeLocalAssetArgs): string[] {
  const roots = resolveRoots(primarySetDir, wantKtx2);
  const exts = wantKtx2 ? ["ktx2"] : ["webp", "png", "jpg", "jpeg"];
  const candidates: string[] = [];

  for (const root of roots) {
    if (suffix) {
      for (const ext of exts) {
        candidates.push(path.join(root, suffix, `${base}.${ext}`));
      }
    }
    for (const ext of exts) {
      candidates.push(path.join(root, `${base}.${ext}`));
    }
  }

  return candidates;
}

function buildCrossSetCandidates(args: ServeLocalAssetArgs): string[] {
  const { base, suffix, primarySetDir, wantKtx2 } = args;
  const roots = buildCrossSetRoots(primarySetDir, wantKtx2);
  const exts = wantKtx2 ? ["ktx2"] : ["webp", "png", "jpg", "jpeg"];
  const candidates: string[] = [];

  for (const root of roots) {
    if (suffix) {
      for (const ext of exts) {
        candidates.push(path.join(root, suffix, `${base}.${ext}`));
      }
    }
    for (const ext of exts) {
      candidates.push(path.join(root, `${base}.${ext}`));
    }
  }

  return candidates;
}

async function findExistingPath(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // ignore access errors and continue
    }
  }
  return null;
}

function detectContentType(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "ktx2":
      // KTX2 doesn't have an official MIME type; use application/octet-stream
      // The KTX2Loader will handle it based on file extension/magic bytes
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

export async function serveLocalAsset(
  args: ServeLocalAssetArgs
): Promise<Response> {
  const primaryCandidates = buildCandidates(args);
  let found = await findExistingPath(primaryCandidates);

  if (!found) {
    const crossSetCandidates = buildCrossSetCandidates(args);
    found = await findExistingPath(crossSetCandidates);
  }

  if (!found) {
    // Log missing asset in dev for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[serve-local] Asset not found: ${args.base} (suffix: ${args.suffix}, ktx2: ${args.wantKtx2}, set: ${args.primarySetDir})`
      );
      console.log(`[serve-local] Tried paths:`, [
        ...primaryCandidates.slice(0, 3),
        "...",
      ]);
    }
    return new Response("Not found", { status: 404 });
  }

  const buffer = await fs.promises.readFile(found);
  const ext = path.extname(found).slice(1).toLowerCase();
  const contentType = detectContentType(ext);

  // Log successful KTX2 serve in dev
  if (process.env.NODE_ENV === "development" && ext === "ktx2") {
    console.log(
      `[serve-local] ✓ Serving KTX2: ${path.basename(found)} (${(
        buffer.length / 1024
      ).toFixed(1)}KB)`
    );
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Allow cross-origin requests for textures (needed for Three.js loaders)
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    },
  });
}
