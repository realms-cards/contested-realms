import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ENGINE_BUILD, ENGINE_RULES_FINGERPRINT, ENGINE_RULES_REVISION } from "../../shared/engine/build";
import upstream from "../../vendor/untested-realm/UPSTREAM.json";

const dir = join(__dirname, "../../shared/engine");

function fingerprint(): string {
  const hash = createHash("sha256");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "build.ts" && !f.includes(".test."))
    .sort();
  for (const f of files) {
    hash.update(`${f}\0`);
    hash.update(readFileSync(join(dir, f)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

describe("the engine build id", () => {
  it("changes when our engine code does", () => {
    // A client and a server on different rules must not be paired, and the id is how they
    // tell. If this fails you changed shared/engine: bump ENGINE_RULES_REVISION in
    // shared/engine/build.ts and set ENGINE_RULES_FINGERPRINT to the value below.
    expect(fingerprint(), `bump ENGINE_RULES_REVISION (now ${ENGINE_RULES_REVISION})`).toBe(ENGINE_RULES_FINGERPRINT);
  });

  it("names the vendored engine commit", () => {
    expect(ENGINE_BUILD.startsWith(upstream.commit.slice(0, 12))).toBe(true);
  });
});
