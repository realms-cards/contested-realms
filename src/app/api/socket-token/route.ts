import jwt from "jsonwebtoken";
import { getServerAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/socket-token
// Generate a long-lived JWT token for socket.io authentication
// Token is cached client-side and only refreshed when expired or rejected
export async function GET() {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      // Don't log 401s - they're expected for unauthenticated requests
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("[socket-token] NEXTAUTH_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }

    // Generate long-lived token (24 hours)
    // The socket server validates the token on each connection, so a longer
    // lifetime reduces API calls without compromising security.
    const userId = (session.user as { id?: string }).id;
    const userName = (session.user as { name?: string | null }).name;

    if (!userId) {
      console.error("[socket-token] User ID is missing from session");
      return new Response(JSON.stringify({ error: "User ID missing" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const token = jwt.sign(
      {
        userId,
        name: userName,
      },
      secret,
      { expiresIn: "24h" },
    );

    // Success - no logging needed for normal flow
    // Add browser-level caching as second layer of defense (in case localStorage fails)
    // private: only browser can cache (not CDN), max-age=300: 5 minutes
    // This dramatically reduces Vercel function invocations when localStorage fails
    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (e: unknown) {
    console.error("[socket-token] Error generating token:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}
