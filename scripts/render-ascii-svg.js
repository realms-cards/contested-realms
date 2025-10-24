const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, vRaw] = a.split("=");
      const key = k.slice(2);
      if (typeof vRaw === "string") {
        args[key] = vRaw;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          args[key] = next;
          i++;
        } else {
          args[key] = true;
        }
      }
    } else if (a.startsWith("-")) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function isVisualBlank(s) {
  return s.replace(/[\s\u2800]+/g, "") === "";
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toSvg({
  lines,
  charWidth = 7,
  lineHeight = 10,
  fontSize = 10,
  padTop = 0,
  padBottom = 0,
  fill = "#000000",
  background = null,
  preserveAspectRatio = "xMidYMid meet",
}) {
  const measureLines = lines.map((l) => l.replace(/[\t ]+$/g, ""));
  const cols = measureLines.reduce((m, l) => Math.max(m, l.length), 0);
  const rows = lines.length + padTop + padBottom;
  const width = Math.max(1, cols) * charWidth;
  const height = Math.max(1, rows) * lineHeight;
  const DEFAULT_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';
  const tsTop = Array.from({ length: padTop })
    .map((_, i) => `<tspan x="0" y="${(i + 1) * lineHeight}"> </tspan>`)
    .join("");
  const tsContent = lines
    .map((line, i) => `<tspan x="0" y="${(padTop + i + 1) * lineHeight}">${escapeXmlText(line || " ")}</tspan>`)
    .join("");
  const tsBottom = Array.from({ length: padBottom })
    .map((_, i) => `<tspan x="0" y="${(padTop + lines.length + i + 1) * lineHeight}"> </tspan>`)
    .join("");
  const bgRect = background
    ? `<rect width="100%" height="100%" fill="${escapeXmlAttr(background)}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="${escapeXmlAttr(preserveAspectRatio)}">${bgRect}<text xml:space="preserve" font-family='${escapeXmlAttr(DEFAULT_FONT_STACK)}' font-size="${escapeXmlAttr(fontSize)}" fill="${escapeXmlAttr(fill)}">${tsTop}${tsContent}${tsBottom}</text></svg>`;
}

async function readTextFile(filePath) {
  const buf = await fs.promises.readFile(filePath);
  return buf.toString("utf8");
}

async function writeFileEnsured(filePath, contents) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, contents);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input || args.i || "public";
  const outDir = args.outDir || args.o || path.join("exports", "ascii-svg");
  const charWidth = Number(args.charWidth || args.cw || 7);
  const lineHeight = Number(args.lineHeight || args.lh || 10);
  const fontSize = Number(args.fontSize || args.fs || 10);
  const padTop = Number(args.padTop || 0);
  const padBottom = Number(args.padBottom || 0);
  const fill = args.fill || "#000000";
  const background = args.background || null;
  const preserveAspectRatio = args.preserveAspectRatio || "xMidYMid meet";
  const include = args.include ? String(args.include).split(",") : null;
  const recursive = Boolean(args.recursive);

  const stat = await fs.promises.stat(input);
  const inputs = [];
  if (stat.isDirectory()) {
    async function walk(dir) {
      const list = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const d of list) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) {
          if (recursive) await walk(p);
        } else if (d.isFile()) {
          if (p.endsWith(".txt")) inputs.push(p);
        }
      }
    }
    await walk(input);
  } else {
    inputs.push(input);
  }

  const filtered = include
    ? inputs.filter((p) => include.some((name) => p.includes(name)))
    : inputs;

  if (!filtered.length) {
    console.error("No input .txt files found.");
    process.exit(1);
  }

  const tasks = filtered.map(async (file) => {
    const raw = await readTextFile(file);
    const lines0 = raw.replace(/\r\n?/g, "\n").split("\n");
    while (lines0.length && isVisualBlank(lines0[0])) lines0.shift();
    while (lines0.length && isVisualBlank(lines0[lines0.length - 1])) lines0.pop();
    const svg = toSvg({
      lines: lines0,
      charWidth,
      lineHeight,
      fontSize,
      padTop,
      padBottom,
      fill,
      background,
      preserveAspectRatio,
    });
    const rel = path.relative(input, file);
    const base = path.basename(rel).replace(/\.txt$/i, ".svg");
    const dest = stat.isDirectory()
      ? path.join(outDir, base)
      : outDir.endsWith(".svg")
      ? outDir
      : path.join(outDir, base);
    await writeFileEnsured(dest, svg);
    return { src: file, dest };
  });

  const results = await Promise.all(tasks);
  for (const r of results) {
    console.log(`${r.src} -> ${r.dest}`);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
