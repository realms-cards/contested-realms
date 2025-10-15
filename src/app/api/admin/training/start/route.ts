import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";

export async function POST(req: Request) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData().catch(() => null);
    const minutesRaw = form?.get("minutes");
    const minutes = Number(minutesRaw) > 0 ? Math.floor(Number(minutesRaw)) : 2;
    const beam = Number(form?.get("beam"));
    const depth = Number(form?.get("depth"));
    const budget = Number(form?.get("budget"));
    const epsilon = Number(form?.get("epsilon"));
    const gamma = Number(form?.get("gamma"));

    const serverUrl = process.env.SOCKET_SERVER_URL || process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3010";
    const nodeBin = process.execPath;
    const script = path.join(process.cwd(), "scripts", "training", "selfplay.js");

    const args = [script, "--server", serverUrl, "--minutes", String(minutes)];
    if (Number.isFinite(beam)) { args.push("--beam", String(beam)); }
    if (Number.isFinite(depth)) { args.push("--depth", String(depth)); }
    if (Number.isFinite(budget)) { args.push("--budget", String(budget)); }
    if (Number.isFinite(epsilon)) { args.push("--epsilon", String(epsilon)); }
    if (Number.isFinite(gamma)) { args.push("--gamma", String(gamma)); }
    const child = spawn(nodeBin, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
      detached: true,
    });
    child.unref();

    return NextResponse.json({ ok: true, pid: child.pid, minutes }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
