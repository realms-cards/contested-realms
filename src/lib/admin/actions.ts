import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { AdminActionResult } from "./types";

async function runNodeScript(
  relativePath: string,
  args: string[] = []
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const scriptPath = path.resolve(process.cwd(), relativePath);
  const start = performance.now();

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 0,
        stdout,
        stderr,
        durationMs: performance.now() - start,
      });
    });
  });
}

export async function clearTournamentData(): Promise<AdminActionResult> {
  const summary = await prisma.$transaction(async (tx) => {
    const stats = await tx.tournamentStatistics.deleteMany({});
    const broadcastEvents = await tx.tournamentBroadcastEvent.deleteMany({});
    const matchResults = await tx.matchResult.deleteMany({
      where: { tournamentId: { not: null } },
    });
    const draftParticipants = await tx.draftParticipant.deleteMany({});
    const draftSessions = await tx.draftSession.deleteMany({});
    const standings = await tx.playerStanding.deleteMany({});
    const registrations = await tx.tournamentRegistration.deleteMany({});
    const rounds = await tx.tournamentRound.deleteMany({});
    const matches = await tx.match.deleteMany({
      where: { tournamentId: { not: null } },
    });
    const socketHealth = await tx.socketBroadcastHealth.deleteMany({
      where: { tournamentId: { not: null } },
    });
    const tournaments = await tx.tournament.deleteMany({});

    return {
      statistics: stats.count,
      broadcastEvents: broadcastEvents.count,
      matchResults: matchResults.count,
      draftParticipants: draftParticipants.count,
      draftSessions: draftSessions.count,
      standings: standings.count,
      registrations: registrations.count,
      rounds: rounds.count,
      matches: matches.count,
      socketHealth: socketHealth.count,
      tournaments: tournaments.count,
    };
  });

  return {
    action: "clearTournamentData",
    status: "ok",
    message: `Removed ${summary.tournaments} tournaments and related records.`,
    details: summary,
  };
}

export async function clearLeaderboard(): Promise<AdminActionResult> {
  const result = await prisma.leaderboardEntry.deleteMany({});
  return {
    action: "clearLeaderboard",
    status: "ok",
    message: `Cleared ${result.count} leaderboard entries.`,
    details: { deleted: result.count },
  };
}

export async function clearReplayRecordings(): Promise<AdminActionResult> {
  const summary = await prisma.$transaction(async (tx) => {
    const actionsDeleted = await tx.onlineMatchAction.deleteMany({});
    const sessionsDeleted = await tx.onlineMatchSession.deleteMany({});
    return {
      actions: actionsDeleted.count,
      sessions: sessionsDeleted.count,
    };
  });

  return {
    action: "clearReplayRecordings",
    status: "ok",
    message: `Removed ${summary.sessions} replay sessions and ${summary.actions} actions.`,
    details: summary,
  };
}

export async function runIngestCards(): Promise<AdminActionResult> {
  const outcome = await runNodeScript("scripts/ingest-cards.js");
  if (outcome.exitCode !== 0) {
    return {
      action: "runIngestCards",
      status: "error",
      message: "ingest-cards.js failed",
      details: outcome,
    };
  }
  return {
    action: "runIngestCards",
    status: "ok",
    message: "Card ingestion completed successfully.",
    details: outcome,
  };
}

export async function runSeedPackConfig(): Promise<AdminActionResult> {
  const outcome = await runNodeScript("scripts/seed-pack-config.js");
  if (outcome.exitCode !== 0) {
    return {
      action: "runSeedPackConfig",
      status: "error",
      message: "seed-pack-config.js failed",
      details: outcome,
    };
  }
  return {
    action: "runSeedPackConfig",
    status: "ok",
    message: "Pack configuration seeded successfully.",
    details: outcome,
  };
}

export async function runDatabaseSeed(): Promise<AdminActionResult> {
  const ingest = await runIngestCards();
  if (ingest.status === "error") {
    return {
      action: "runDatabaseSeed",
      status: "error",
      message: "Database seed aborted — ingest-cards.js failed.",
      details: ingest.details,
    };
  }

  const packs = await runSeedPackConfig();
  if (packs.status === "error") {
    return {
      action: "runDatabaseSeed",
      status: "error",
      message: "Database seed incomplete — seed-pack-config.js failed.",
      details: packs.details,
    };
  }

  return {
    action: "runDatabaseSeed",
    status: "ok",
    message: "Database seed scripts ran successfully.",
    details: {
      ingest: ingest.details,
      seedPacks: packs.details,
    },
  };
}

export const ADMIN_ACTIONS = [
  {
    id: "clearTournamentData",
    label: "Clear tournaments",
    description:
      "Delete all tournaments, rounds, matches, and associated standings/statistics.",
    dangerous: true,
  },
  {
    id: "clearLeaderboard",
    label: "Clear leaderboard",
    description: "Remove every leaderboard entry across all formats.",
    dangerous: true,
  },
  {
    id: "clearReplayRecordings",
    label: "Clear replay recordings",
    description:
      "Delete captured online match sessions and action logs (keeps match results).",
    dangerous: true,
  },
  {
    id: "runIngestCards",
    label: "Run ingest-cards.js",
    description:
      "Refresh card data from the external API using scripts/ingest-cards.js.",
    dangerous: false,
  },
  {
    id: "runSeedPackConfig",
    label: "Run seed-pack-config.js",
    description:
      "Populate booster configuration data via scripts/seed-pack-config.js.",
    dangerous: false,
  },
  {
    id: "runDatabaseSeed",
    label: "Run db:seed (ingest + seed packs)",
    description:
      "Run ingest-cards.js followed by seed-pack-config.js sequentially.",
    dangerous: false,
  },
] as const;

export type AdminActionId = (typeof ADMIN_ACTIONS)[number]["id"];

export async function executeAdminAction(
  actionId: AdminActionId
): Promise<AdminActionResult> {
  switch (actionId) {
    case "clearTournamentData":
      return clearTournamentData();
    case "clearLeaderboard":
      return clearLeaderboard();
    case "clearReplayRecordings":
      return clearReplayRecordings();
    case "runIngestCards":
      return runIngestCards();
    case "runSeedPackConfig":
      return runSeedPackConfig();
    case "runDatabaseSeed":
      return runDatabaseSeed();
    default:
      {
        const neverValue: never = actionId;
        throw new Error(`Unsupported admin action: ${neverValue as string}`);
      }
  }
}
