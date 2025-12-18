import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_PLAYMATS_PER_USER = 5;
const REQUIRED_WIDTH = 2556;
const REQUIRED_HEIGHT = 1663;
const MAX_BYTES = 2_000_000;

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
    // JPEG - scan for SOF0/SOF2 marker to get dimensions
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // SOF0 (0xC0) or SOF2 (0xC2) contain dimensions
      if (marker === 0xc0 || marker === 0xc2) {
        const height = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0);
        const width = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0);
        return { width, height, mimeType: "image/jpeg" };
      }
      // Skip to next marker
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

    const [me, playmats] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { selectedPlaymatRef: true },
      }),
      prisma.customPlaymat.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          width: true,
          height: true,
          sizeBytes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return json({
      playmats,
      selectedPlaymatRef: me?.selectedPlaymatRef ?? null,
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
    const pngBase64Raw =
      typeof body?.pngBase64 === "string" ? body.pngBase64 : "";

    if (!nameRaw) return json({ error: "Missing or invalid name" }, 400);
    if (!pngBase64Raw) return json({ error: "Missing pngBase64" }, 400);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(pngBase64Raw, "base64");
    } catch {
      return json({ error: "Invalid base64" }, 400);
    }

    if (buffer.length <= 0) return json({ error: "Empty image" }, 400);
    if (buffer.length > MAX_BYTES) {
      return json({ error: `Image too large (max ${MAX_BYTES} bytes)` }, 400);
    }

    const dims = parseImageDimensions(new Uint8Array(buffer));
    if (!dims)
      return json({ error: "Invalid image (PNG or JPEG required)" }, 400);
    if (dims.width !== REQUIRED_WIDTH || dims.height !== REQUIRED_HEIGHT) {
      return json(
        {
          error: `Invalid dimensions (expected ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}, got ${dims.width}x${dims.height})`,
        },
        400
      );
    }

    const count = await prisma.customPlaymat.count({ where: { userId } });

    if (count >= MAX_PLAYMATS_PER_USER) {
      return json(
        {
          error: `Playmat limit reached (max ${MAX_PLAYMATS_PER_USER})`,
        },
        400
      );
    }

    const created = await prisma.customPlaymat.create({
      data: {
        userId,
        name: nameRaw,
        mimeType: dims.mimeType,
        width: dims.width,
        height: dims.height,
        sizeBytes: buffer.length,
        data: buffer,
      },
      select: {
        id: true,
        name: true,
        width: true,
        height: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json({ ok: true, playmat: created }, 201);
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
