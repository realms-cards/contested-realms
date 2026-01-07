import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Health check endpoint for Docker/Kubernetes probes
 * Returns 200 OK if the Next.js server is running
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
    },
    { status: 200 }
  );
}
