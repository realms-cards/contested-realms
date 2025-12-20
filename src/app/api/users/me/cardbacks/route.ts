import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_CARDBACKS_PER_USER = 5;
const SPELLBOOK_WIDTH = 375;
const SPELLBOOK_HEIGHT = 525;
const ATLAS_WIDTH = 525;
const ATLAS_HEIGHT = 375;
const MAX_BYTES_PER_IMAGE = 500_000; // 500KB per image

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type ImageDimensions = { width: number; height: number; mimeType: string };

function parseImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  // Try PNG first
  if (bytes.length >= 24) {
    const pngSig = [137, 80, 78, 71, 13, 10, 26, 10];
    let isPng = true;
    for (let i = 0; i < pngSig.length; i++) {
      if (bytes[i] !== pngSig[i]) {
        isPng = false;
        break;
      }
    }
    if (isPng) {
      const typeOffset = 8 + 4;
      const type = String.fromCharCode(
        bytes[typeOffset] ?? 0,
        bytes[typeOffset + 1] ?? 0,
        bytes[typeOffset + 2] ?? 0,
        bytes[typeOffset + 3] ?? 0
      );
      if (type === "IHDR") {
        const dataOffset = 8 + 8;
        const width =
          ((bytes[dataOffset] ?? 0) << 24) |
          ((bytes[dataOffset + 1] ?? 0) << 16) |
          ((bytes[dataOffset + 2] ?? 0) << 8) |
          (bytes[dataOffset + 3] ?? 0);
        const height =
          ((bytes[dataOffset + 4] ?? 0) << 24) |
          ((bytes[dataOffset + 5] ?? 0) << 16) |
          ((bytes[dataOffset + 6] ?? 0) << 8) |
          (bytes[dataOffset + 7] ?? 0);
        return {
          width: width >>> 0,
          height: height >>> 0,
          mimeType: "image/png",
        };
      }
    }
  }

  // Try JPEG
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0);
        const width = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0);
        return { width, height, mimeType: "image/jpeg" };
      }
      const len = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
      i += 2 + len;
    }
  }

  return null;
}

async function requirePatronUserId(): Promise<string | null> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return null;

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, patronTier: true },
  });

  if (!me?.id) return null;
  if (!me.patronTier) return null;
  return me.id;
}

export async function GET(): Promise<Response> {
  try {
    const userId = await requirePatronUserId();
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const [me, cardbacks] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { selectedSpellbookRef: true, selectedAtlasRef: true },
      }),
      prisma.customCardback.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          spellbookWidth: true,
          spellbookHeight: true,
          spellbookSize: true,
          atlasWidth: true,
          atlasHeight: true,
          atlasSize: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return json({
      cardbacks,
      selectedSpellbookRef: me?.selectedSpellbookRef ?? null,
      selectedAtlasRef: me?.selectedAtlasRef ?? null,
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return json({ error: message }, 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const userId = await requirePatronUserId();
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const nameRaw = typeof body?.name === "string" ? body.name.trim() : "";
    const spellbookBase64 =
      typeof body?.spellbookBase64 === "string" ? body.spellbookBase64 : "";
    const atlasBase64 =
      typeof body?.atlasBase64 === "string" ? body.atlasBase64 : "";

    if (!nameRaw) return json({ error: "Missing or invalid name" }, 400);
    if (!spellbookBase64)
      return json({ error: "Missing spellbook image" }, 400);
    if (!atlasBase64) return json({ error: "Missing atlas image" }, 400);

    let spellbookBuffer: Buffer;
    let atlasBuffer: Buffer;
    try {
      spellbookBuffer = Buffer.from(spellbookBase64, "base64");
      atlasBuffer = Buffer.from(atlasBase64, "base64");
    } catch {
      return json({ error: "Invalid base64" }, 400);
    }

    if (spellbookBuffer.length <= 0)
      return json({ error: "Empty spellbook image" }, 400);
    if (atlasBuffer.length <= 0)
      return json({ error: "Empty atlas image" }, 400);
    if (spellbookBuffer.length > MAX_BYTES_PER_IMAGE) {
      return json(
        {
          error: `Spellbook image too large (max ${MAX_BYTES_PER_IMAGE} bytes)`,
        },
        400
      );
    }
    if (atlasBuffer.length > MAX_BYTES_PER_IMAGE) {
      return json(
        { error: `Atlas image too large (max ${MAX_BYTES_PER_IMAGE} bytes)` },
        400
      );
    }

    const spellbookDims = parseImageDimensions(new Uint8Array(spellbookBuffer));
    const atlasDims = parseImageDimensions(new Uint8Array(atlasBuffer));

    if (!spellbookDims)
      return json(
        { error: "Invalid spellbook image (PNG or JPEG required)" },
        400
      );
    if (!atlasDims)
      return json({ error: "Invalid atlas image (PNG or JPEG required)" }, 400);

    if (
      spellbookDims.width !== SPELLBOOK_WIDTH ||
      spellbookDims.height !== SPELLBOOK_HEIGHT
    ) {
      return json(
        {
          error: `Invalid spellbook dimensions (expected ${SPELLBOOK_WIDTH}x${SPELLBOOK_HEIGHT}, got ${spellbookDims.width}x${spellbookDims.height})`,
        },
        400
      );
    }

    if (atlasDims.width !== ATLAS_WIDTH || atlasDims.height !== ATLAS_HEIGHT) {
      return json(
        {
          error: `Invalid atlas dimensions (expected ${ATLAS_WIDTH}x${ATLAS_HEIGHT}, got ${atlasDims.width}x${atlasDims.height})`,
        },
        400
      );
    }

    const count = await prisma.customCardback.count({ where: { userId } });

    if (count >= MAX_CARDBACKS_PER_USER) {
      return json(
        {
          error: `Cardback limit reached (max ${MAX_CARDBACKS_PER_USER})`,
        },
        400
      );
    }

    const created = await prisma.customCardback.create({
      data: {
        userId,
        name: nameRaw,
        spellbookMime: spellbookDims.mimeType,
        spellbookWidth: spellbookDims.width,
        spellbookHeight: spellbookDims.height,
        spellbookSize: spellbookBuffer.length,
        spellbookData: spellbookBuffer,
        atlasMime: atlasDims.mimeType,
        atlasWidth: atlasDims.width,
        atlasHeight: atlasDims.height,
        atlasSize: atlasBuffer.length,
        atlasData: atlasBuffer,
      },
      select: {
        id: true,
        name: true,
        spellbookWidth: true,
        spellbookHeight: true,
        spellbookSize: true,
        atlasWidth: true,
        atlasHeight: true,
        atlasSize: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json({ ok: true, cardback: created }, 201);
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return json({ error: message }, 500);
  }
}
