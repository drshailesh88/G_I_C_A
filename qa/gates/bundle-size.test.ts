import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runBundleSizeGate,
  BUNDLE_SIZE_GATE_ID,
  matchGlob,
} from "./bundle-size.js";
import type { GateConfig } from "./base.js";

let root: string;
let buildDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `bundle-${randomBytes(6).toString("hex")}`);
  buildDir = join(root, ".next", "static", "chunks");
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(join(root, "evidence"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function cfg(): GateConfig {
  return { runId: "run-1", workingDir: root, evidenceDir: join(root, "evidence") };
}

async function writeFakeChunk(name: string, bytes: number): Promise<void> {
  await fs.mkdir(join(buildDir, ".."), { recursive: true });
  await fs.writeFile(join(buildDir, "..", name), Buffer.alloc(bytes));
}

describe("matchGlob", () => {
  test("basic wildcard within a segment", () => {
    expect(matchGlob("chunks/main-a1b2.js", "chunks/main-*.js")).toBe(true);
  });
  test("does not cross slashes with *", () => {
    expect(matchGlob("chunks/sub/main.js", "chunks/*.js")).toBe(false);
  });
  test("** crosses slashes", () => {
    expect(matchGlob("chunks/sub/deep/main.js", "chunks/**/*.js")).toBe(true);
  });
});

describe("runBundleSizeGate", () => {
  test("pass when all chunks under threshold", async () => {
    await writeFakeChunk("main.js", 50_000);
    await writeFakeChunk("framework.js", 100_000);
    const result = await runBundleSizeGate({
      config: cfg(),
      buildDir: ".next/static",
      thresholds: { "main.js": 60_000, "framework.js": 200_000 },
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(BUNDLE_SIZE_GATE_ID);
    expect((result.details as any).fileCount).toBe(2);
  });

  test("fail when chunk exceeds per-pattern threshold", async () => {
    await writeFakeChunk("main.js", 150_000);
    const result = await runBundleSizeGate({
      config: cfg(),
      buildDir: ".next/static",
      thresholds: { "main.js": 100_000 },
    });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.filesOverLimit).toHaveLength(1);
    expect(details.filesOverLimit[0].path).toBe("main.js");
  });

  test("fail when total size exceeds totalMaxBytes", async () => {
    await writeFakeChunk("a.js", 50_000);
    await writeFakeChunk("b.js", 60_000);
    const result = await runBundleSizeGate({
      config: cfg(),
      buildDir: ".next/static",
      totalMaxBytes: 100_000,
    });
    expect(result.status).toBe("fail");
    expect((result.details as any).exceededTotal).toBe(true);
  });

  test("longest-pattern-first wins when multiple match", async () => {
    await writeFakeChunk("framework-main.js", 150_000);
    const result = await runBundleSizeGate({
      config: cfg(),
      buildDir: ".next/static",
      thresholds: {
        "*.js": 50_000,                  // generic
        "framework-*.js": 200_000,       // specific
      },
    });
    expect(result.status).toBe("pass");
    const reports = (result.details as any).largestFiles;
    expect(reports[0].matchedPattern).toBe("framework-*.js");
  });

  test("defaultMaxBytes used when no pattern matches", async () => {
    await writeFakeChunk("orphan.js", 150_000);
    const result = await runBundleSizeGate({
      config: cfg(),
      buildDir: ".next/static",
      thresholds: { "main-*.js": 100_000 },
      defaultMaxBytes: 100_000,
    });
    expect(result.status).toBe("fail");
  });

  test("missing buildDir → error", async () => {
    const result = await runBundleSizeGate({
      config: cfg(),
      buildDir: "nonexistent",
    });
    expect(result.status).toBe("error");
    expect((result.details as any).message).toContain("did `next build` run");
  });

  test("largestFiles sorted descending", async () => {
    await writeFakeChunk("small.js", 1_000);
    await writeFakeChunk("medium.js", 50_000);
    await writeFakeChunk("large.js", 100_000);
    const result = await runBundleSizeGate({ config: cfg() });
    const largest = (result.details as any).largestFiles;
    expect(largest[0].path).toBe("large.js");
    expect(largest[1].path).toBe("medium.js");
    expect(largest[2].path).toBe("small.js");
  });

  test("writes JSON evidence", async () => {
    await writeFakeChunk("a.js", 100);
    const result = await runBundleSizeGate({ config: cfg() });
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body.fileCount).toBe(1);
  });
});
