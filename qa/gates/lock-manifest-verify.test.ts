import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runLockManifestVerify,
  LOCK_MANIFEST_GATE_ID,
} from "./lock-manifest-verify.js";
import type { GateConfig } from "./base.js";

let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `gate-lock-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, ".quality", "policies"), { recursive: true });
  await fs.mkdir(join(root, "runs", "evidence"), { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function baseConfig(): GateConfig {
  return {
    runId: "run-test-001",
    workingDir: root,
    evidenceDir: join(root, "runs", "evidence"),
  };
}

function sha256(contents: string): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

async function writeFileAt(relPath: string, contents: string): Promise<void> {
  const abs = join(root, relPath);
  await fs.mkdir(join(abs, ".."), { recursive: true });
  await fs.writeFile(abs, contents);
}

async function writeManifest(files: Record<string, string>): Promise<void> {
  await fs.writeFile(
    join(root, ".quality", "policies", "lock-manifest.json"),
    JSON.stringify({
      schema_version: 1,
      last_updated: "2026-04-14T22:00:00Z",
      files,
    }),
  );
}

describe("runLockManifestVerify — happy paths", () => {
  test("all files match → pass", async () => {
    await writeFileAt("vitest.config.ts", "// config");
    await writeFileAt("tsconfig.json", "{}");
    await writeManifest({
      "vitest.config.ts": sha256("// config"),
      "tsconfig.json": sha256("{}"),
    });

    const result = await runLockManifestVerify(baseConfig());
    expect(result.status).toBe("pass");
    expect(result.shortCircuit).toBe(false);
    expect(result.gateId).toBe(LOCK_MANIFEST_GATE_ID);
    const details = result.details as any;
    expect(details.filesChecked).toBe(2);
    expect(details.mismatches).toEqual([]);
  });

  test("empty files map → pass", async () => {
    await writeManifest({});
    const result = await runLockManifestVerify(baseConfig());
    expect(result.status).toBe("pass");
    expect((result.details as any).filesChecked).toBe(0);
  });
});

describe("runLockManifestVerify — failure paths", () => {
  test("manifest missing → fail with manifestError", async () => {
    const result = await runLockManifestVerify(baseConfig());
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.manifestError).toContain("not found");
  });

  test("manifest with bad hash format → fail", async () => {
    await fs.writeFile(
      join(root, ".quality", "policies", "lock-manifest.json"),
      JSON.stringify({
        schema_version: 1,
        files: { "x.ts": "not-a-hash" },
      }),
    );
    const result = await runLockManifestVerify(baseConfig());
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.manifestError).toContain("schema validation failed");
  });

  test("tampered file → fail with mismatch", async () => {
    await writeFileAt("vitest.config.ts", "// original");
    await writeManifest({ "vitest.config.ts": sha256("// original") });
    // Tamper
    await writeFileAt("vitest.config.ts", "// tampered");

    const result = await runLockManifestVerify(baseConfig());
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.mismatches).toHaveLength(1);
    expect(details.mismatches[0].file).toBe("vitest.config.ts");
  });

  test("missing file → fail with missingFiles", async () => {
    await writeManifest({ "does-not-exist.ts": sha256("whatever") });
    const result = await runLockManifestVerify(baseConfig());
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.missingFiles).toHaveLength(1);
    expect(details.missingFiles[0].file).toBe("does-not-exist.ts");
  });

  test("mixed: one match + one mismatch → fail", async () => {
    await writeFileAt("a.ts", "a");
    await writeFileAt("b.ts", "b");
    await writeManifest({
      "a.ts": sha256("a"),
      "b.ts": sha256("different"),
    });
    const result = await runLockManifestVerify(baseConfig());
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.mismatches).toHaveLength(1);
    expect(details.mismatches[0].file).toBe("b.ts");
  });
});

describe("runLockManifestVerify — evidence", () => {
  test("writes structured JSON evidence", async () => {
    await writeManifest({ "missing.ts": sha256("x") });
    const result = await runLockManifestVerify(baseConfig());
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body).toHaveProperty("manifestPath");
    expect(body).toHaveProperty("missingFiles");
  });
});
