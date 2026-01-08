/**
 * Bot authentication utilities.
 * The Discord bot authenticates using a shared secret in the Authorization header.
 */

import { NextRequest } from "next/server";

const BOT_SECRET = process.env.REALMS_BOT_SECRET;

export function validateBotAuth(request: NextRequest): boolean {
  if (!BOT_SECRET) {
    console.warn("[bot-auth] REALMS_BOT_SECRET not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  // Expected format: "Bearer <secret>"
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return false;
  }

  return token === BOT_SECRET;
}

export function botAuthError(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
