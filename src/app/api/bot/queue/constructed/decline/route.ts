import { NextRequest, NextResponse } from "next/server";
import { botAuthError, validateBotAuth } from "@/lib/bot-auth";

function getSocketHttpOrigin(): string {
  const explicit = (
    process.env.SOCKET_SERVER_URL ||
    process.env.NEXT_PUBLIC_WS_HTTP_ORIGIN ||
    process.env.WS_HTTP_ORIGIN ||
    ""
  ).trim();
  if (explicit) {
    return explicit.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
  }
  const ws = (process.env.NEXT_PUBLIC_WS_URL || "").trim();
  if (ws.startsWith("ws://")) return ws.replace(/^ws:\/\//, "http://");
  if (ws.startsWith("wss://")) return ws.replace(/^wss:\/\//, "https://");
  return "http://localhost:3010";
}

export async function POST(request: NextRequest) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  try {
    const body = await request.json();
    const response = await fetch(`${getSocketHttpOrigin()}/bot/queue/constructed/decline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    console.error("[bot/queue/constructed/decline] Proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
