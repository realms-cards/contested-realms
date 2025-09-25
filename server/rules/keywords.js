// Keywords registry: parse from reference/codex.csv if present, else fallback to simple detection
const fs = require('fs');
const path = require('path');

// Map<string, string> where value is optional description
let _KEYWORDS = null;

function loadKeywords() {
  if (_KEYWORDS) return _KEYWORDS;
  const out = new Map();
  try {
    const p = path.join(__dirname, '..', '..', 'reference', 'codex.csv');
    const text = fs.readFileSync(p, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(',');
      const kw = String((parts[0] || '').trim());
      const desc = String((parts[1] || '').trim());
      if (kw) out.set(kw, desc);
    }
  } catch {
    // Ignore read errors; fallback keywords will be applied below
  }

  // Always ensure essential keywords exist even if codex omits them
  ['Genesis', 'Airborne'].forEach((k) => {
    if (!out.has(k)) out.set(k, '');
  });

  _KEYWORDS = out;
  return _KEYWORDS;
}

function getKeywordsFromCardText(text) {
  const kws = loadKeywords();
  const found = [];
  if (!text) return found;
  const t = String(text);
  for (const kw of kws.keys()) {
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

function getKeywordDefinition(keyword) {
  const map = loadKeywords();
  return map.get(String(keyword)) || '';
}

module.exports = { loadKeywords, getKeywordsFromCardText, getKeywordsForCard, getKeywordDefinition };
