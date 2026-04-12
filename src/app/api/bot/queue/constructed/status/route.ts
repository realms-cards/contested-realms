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

export async function GET(request: NextRequest) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  try {
    const incomingUrl = new URL(request.url);
    const target = new URL(`${getSocketHttpOrigin()}/bot/queue/constructed/status`);
    for (const [key, value] of incomingUrl.searchParams.entries()) {
      target.searchParams.set(key, value);
    }

    const response = await fetch(target.toString(), {
      method: "GET",
      headers: {
        Authorization: request.headers.get("authorization") || "",
      },
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    console.error("[bot/queue/constructed/status] Proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
