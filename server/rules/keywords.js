// Keywords registry: parse from reference/codex.csv if present, else fallback to simple detection
const fs = require('fs');
const path = require('path');

let _KEYWORDS = null;

function loadKeywords() {
  if (_KEYWORDS) return _KEYWORDS;
  const out = new Set();
  try {
    const p = path.join(__dirname, '..', '..', 'reference', 'codex.csv');
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [kw] = trimmed.split(',');
      if (kw) out.add(String(kw).trim());
    }
  } catch {
    // Fallback: seed with common keywords we care about now
    ['Genesis', 'Airborne'].forEach((k) => out.add(k));
  }
  _KEYWORDS = out;
  return _KEYWORDS;
}

function getKeywordsFromCardText(text) {
  const kws = loadKeywords();
  const found = [];
  if (!text) return found;
  const t = String(text);
  for (const kw of kws) {
    // Basic word boundary check; Sorcery keywords like 'Genesis' should match
    const re = new RegExp(`(^|[^A-Za-z])${kw}([^A-Za-z]|$)`);
    if (re.test(t)) found.push(kw);
  }
  return found;
}

function getKeywordsForCard(card) {
  // Prefer explicit keywords array if present
  if (Array.isArray(card && card.keywords)) return card.keywords;
  const rulesText = card && (card.rulesText || (card.setRulesText /* hypothetical */));
  return getKeywordsFromCardText(rulesText || '');
}

module.exports = { loadKeywords, getKeywordsFromCardText, getKeywordsForCard };
