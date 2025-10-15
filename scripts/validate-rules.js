#!/usr/bin/env node
// Lightweight, non-destructive rules alignment validator.
// This script prints a checklist and runs a few static sanity checks against local data.
// Usage: npm run validate:rules

const fs = require('fs');
const path = require('path');

function loadCardsSnapshot() {
  try {
    const p = path.join(process.cwd(), 'data', 'cards_raw.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    console.warn('[validate:rules] Failed to read cards_raw.json:', e?.message || e);
  }
  return [];
}

function checklist() {
  // Coverage areas aligned with SorceryRulebook.pdf (reference path noted in repo guidelines)
  return [
    { key: 'sites_first_and_adjacency', title: 'Sites: first site at avatar, thereafter adjacent to owned' },
    { key: 'ownership_rules', title: 'Sites: ownership and placement restrictions enforced' },
    { key: 'timing_windows', title: 'Timing: Start -> Main transition, mulligans complete before actions' },
    { key: 'threshold_costs', title: 'Thresholds: provider counts respected for spell costs' },
    { key: 'mana_spend', title: 'Costs: do not overspend or spend non-existent resources' },
    { key: 'avatar_presence', title: 'Avatar: has valid card ref and legal movement/tap behavior' },
    { key: 'permanent_placement', title: 'Permanents: placed on legal cells; respect site occupancy' },
    { key: 'draft_pack_flow', title: 'Draft: pack selection, passing direction, and pick completion' },
  ];
}

function runStaticSanityChecks(cards) {
  const res = [];
  const sites = cards.filter((c) => typeof c?.type === 'string' && c.type.toLowerCase().includes('site'));
  const avatars = cards.filter((c) => typeof c?.type === 'string' && c.type.toLowerCase().includes('avatar'));
  res.push({ item: 'snapshot_presence', ok: cards.length > 0, info: `cards=${cards.length}` });
  res.push({ item: 'has_sites', ok: sites.length > 0, info: `sites=${sites.length}` });
  res.push({ item: 'has_avatars', ok: avatars.length > 0, info: `avatars=${avatars.length}` });
  return res;
}

(function main() {
  console.log('[validate:rules] Sorcery rules alignment checklist');
  const list = checklist();
  for (const entry of list) {
    console.log(`- [ ] ${entry.title}`);
  }
  console.log('');

  const cards = loadCardsSnapshot();
  const sanity = runStaticSanityChecks(cards);
  for (const s of sanity) {
    const mark = s.ok ? 'OK' : 'WARN';
    console.log(`[${mark}] ${s.item}${s.info ? ' - ' + s.info : ''}`);
  }

  console.log('\n[validate:rules] Note: This validator is non-destructive and does not hit the server.');
  console.log('[validate:rules] For server gating assertions, we will add simulated snapshots in a future revision.');

  process.exit(0);
})();
