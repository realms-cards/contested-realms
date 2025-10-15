import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";

function* walk(dir: string): Generator<string> {
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const root = path.join(process.cwd(), "logs", "training");
  const files: string[] = [];
  try {
    for (const fp of walk(root)) {
      if (fp.endsWith(".jsonl") && fp.includes(`${path.sep}match_`)) files.push(fp);
    }
  } catch {
    // ignore
  }

  let entries = 0;
  let nodesSum = 0;
  let depthSum = 0;
  let evalSum = 0;
  let timeSum = 0;
  let sampleCount = 0;
  type RecentEntry = { t?: number | null; nodes?: number; depth?: number; rootEval?: number; timeMs?: number };
  const recent: RecentEntry[] = [];

  // Trends (keep last N points across all logs)
  const trendLimit = 200;
  const trendRoot: Array<{ t: number; v: number }> = [];
  const trendNodes: Array<{ t: number; v: number }> = [];
  const trendDepth: Array<{ t: number; v: number }> = [];
  const trendTimeMs: Array<{ t: number; v: number }> = [];

  // Per-card influence (delta rootEval between consecutive decisions per file)
  type CardAgg = { key: string; name: string | null; count: number; sumDelta: number };
  const cardAgg = new Map<string, CardAgg>();

  // Limit scanning to last ~24 files to keep this light
  const scan = files.sort().slice(-24);
  for (const f of scan) {
    try {
      const txt = fs.readFileSync(f, "utf8");
      const lines = txt.split(/\r?\n/).filter(Boolean);
      entries += lines.length;
      // Track previous rootEval in this file for delta calc
      let prevEval: number | null = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        try {
          const obj = JSON.parse(line);
          if (obj && typeof obj === "object") {
            if (typeof obj.nodes === "number") { nodesSum += obj.nodes; sampleCount++; }
            if (typeof obj.depth === "number") { depthSum += obj.depth; }
            if (typeof obj.rootEval === "number") { evalSum += obj.rootEval; }
            if (typeof obj.timeMs === "number") { timeSum += obj.timeMs; }
            // Append to trends (trim later)
            const t = typeof obj.t === "number" ? obj.t : Date.now();
            if (typeof obj.rootEval === "number") trendRoot.push({ t, v: obj.rootEval });
            if (typeof obj.nodes === "number") trendNodes.push({ t, v: obj.nodes });
            if (typeof obj.depth === "number") trendDepth.push({ t, v: obj.depth });
            if (typeof obj.timeMs === "number") trendTimeMs.push({ t, v: obj.timeMs });
            // Recent sample window
            recent.push({ t, nodes: obj.nodes, depth: obj.depth, rootEval: obj.rootEval, timeMs: obj.timeMs });

            // Per-card delta accumulation
            const curEval = typeof obj.rootEval === "number" ? obj.rootEval : null;
            if (prevEval !== null && curEval !== null && obj.chosenCards && typeof obj.chosenCards === "object") {
              const delta = curEval - prevEval;
              const add = (slug?: string | null, name?: string | null) => {
                const key = (slug && String(slug)) || (name && `name:${String(name)}`) || null;
                if (!key) return;
                const prev = cardAgg.get(key) || { key, name: name || null, count: 0, sumDelta: 0 };
                prev.count += 1;
                prev.sumDelta += delta;
                if (!prev.name && name) prev.name = name;
                cardAgg.set(key, prev);
              };
              if (obj.chosenCards.playedSite) add(obj.chosenCards.playedSite.slug, obj.chosenCards.playedSite.name);
              if (obj.chosenCards.playedUnit) add(obj.chosenCards.playedUnit.slug, obj.chosenCards.playedUnit.name);
            }
            if (curEval !== null) prevEval = curEval;
          }
        } catch {}
      }
    } catch {}
  }

  // Trim trends to last N points
  function trimLastN<T>(arr: T[], n: number): T[] { return arr.length > n ? arr.slice(-n) : arr; }
  const trends = {
    rootEval: trimLastN(trendRoot.sort((a,b)=>a.t-b.t), trendLimit),
    nodes: trimLastN(trendNodes.sort((a,b)=>a.t-b.t), trendLimit),
    depth: trimLastN(trendDepth.sort((a,b)=>a.t-b.t), trendLimit),
    timeMs: trimLastN(trendTimeMs.sort((a,b)=>a.t-b.t), trendLimit),
  };

  // Build per-card top gainers/losers by avg delta
  const perCardAll = Array.from(cardAgg.values()).map((c) => ({
    key: c.key,
    name: c.name,
    count: c.count,
    avgDelta: c.count > 0 ? c.sumDelta / c.count : 0,
  }));
  const topGainers = perCardAll.filter(c=>c.count>=2).sort((a,b)=>b.avgDelta - a.avgDelta).slice(0, 12);
  const topLosers = perCardAll.filter(c=>c.count>=2).sort((a,b)=>a.avgDelta - b.avgDelta).slice(0, 12);

  // Elo ratings from head-to-head results
  const h2hFile = path.join(root, "headtohead", "results.jsonl");
  type Elo = { r: number; g: number };
  const elo = new Map<string, Elo>();
  const K = 24;
  function ensure(thetaId: string | null | undefined) {
    if (!thetaId) return null;
    if (!elo.has(thetaId)) elo.set(thetaId, { r: 1500, g: 0 });
    return thetaId;
  }
  try {
    if (fs.existsSync(h2hFile)) {
      const lines = fs.readFileSync(h2hFile, "utf8").split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const a = ensure(obj.thetaA);
          const b = ensure(obj.thetaB);
          if (!a || !b) continue;
          const recA = elo.get(a);
          const recB = elo.get(b);
          if (!recA || !recB) { continue; }
          const Ra = recA.r;
          const Rb = recB.r;
          const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
          const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
          let Sa = 0.5, Sb = 0.5;
          if (!obj.isDraw) {
            if (obj.winnerThetaId === a) { Sa = 1; Sb = 0; }
            else if (obj.winnerThetaId === b) { Sa = 0; Sb = 1; }
          }
          recA.r = Ra + K * (Sa - Ea);
          recA.g += 1;
          recB.r = Rb + K * (Sb - Eb);
          recB.g += 1;
        } catch {}
      }
    }
  } catch {}
  const eloRatings = Array.from(elo.entries()).map(([thetaId, v]) => ({ thetaId, rating: Math.round(v.r), games: v.g }))
    .sort((a,b)=>b.rating - a.rating);

  const out = {
    runs: scan.length,
    files: files.length,
    entries,
    avgNodes: sampleCount ? nodesSum / sampleCount : null,
    avgDepth: sampleCount ? depthSum / sampleCount : null,
    avgEval: sampleCount ? evalSum / sampleCount : null,
    avgTimeMs: sampleCount ? timeSum / sampleCount : null,
    recent: recent.slice(-16),
    trends,
    perCard: { topGainers, topLosers },
    elo: { ratings: eloRatings },
  };

  return NextResponse.json(out, { status: 200 });
}
