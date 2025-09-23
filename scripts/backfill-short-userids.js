#!/usr/bin/env node
/*
  Backfill short, human-friendly user IDs for existing users.
  - Generates an 8-character base36 ID for users missing `shortId`
  - Ensures uniqueness against existing shortIds in the DB
  - Safe to run multiple times; only updates users with null shortId

  Usage:
    node scripts/backfill-short-userids.js
*/

try { require('dotenv').config(); } catch {}
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function toBase36(bytes) {
  // Convert random bytes to a base36 string
  const num = BigInt('0x' + bytes.toString('hex'));
  return num.toString(36);
}

function genShortId() {
  // 8 chars base36 from 6 random bytes (48 bits)
  const b = crypto.randomBytes(6);
  let s = toBase36(b);
  if (s.length < 8) s = s.padStart(8, '0');
  if (s.length > 8) s = s.slice(-8);
  return s;
}

async function main() {
  console.log('[shortId backfill] Starting...');
  const existing = await prisma.user.findMany({
    where: { shortId: { not: null } },
    select: { shortId: true },
  });
  const taken = new Set(existing.map((u) => (u.shortId || '').toLowerCase()).filter(Boolean));
  console.log(`[shortId backfill] Existing shortIds: ${taken.size}`);

  const targets = await prisma.user.findMany({
    where: { shortId: null },
    select: { id: true },
  });
  console.log(`[shortId backfill] Users missing shortId: ${targets.length}`);

  let updated = 0;
  for (const u of targets) {
    let candidate = null;
    for (let i = 0; i < 25; i++) {
      const s = genShortId();
      if (!taken.has(s)) { candidate = s; break; }
    }
    if (!candidate) {
      // In the rare case of repeated collisions, derive from user id hash
      const h = crypto.createHash('sha256').update(u.id).digest();
      candidate = toBase36(h).slice(0, 8);
      // If still collides, append random last char
      let suffixTries = 0;
      while (taken.has(candidate) && suffixTries < 36) {
        candidate = candidate.slice(0, 7) + (suffixTries.toString(36));
        suffixTries++;
      }
    }
    try {
      await prisma.user.update({ where: { id: u.id }, data: { shortId: candidate } });
      taken.add(candidate.toLowerCase());
      updated++;
    } catch (e) {
      console.warn(`[shortId backfill] Failed to update user ${u.id}:`, e?.message || e);
    }
  }
  console.log(`[shortId backfill] Completed. Updated ${updated} users.`);
}

main()
  .catch((e) => {
    console.error('[shortId backfill] Fatal error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
