import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runLighthouseCiGate,
  LIGHTHOUSE_CI_GATE_ID,
  parseLighthouseManifest,
} from "./lighthouse-ci.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let root: string;
let lhciDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `lhci-${randomBytes(6).toString("hex")}`);
  lhciDir = join(root, ".lighthouseci");
  await fs.mkdir(lhciDir, { recursive: true });
  await fs.mkdir(join(root, "evidence"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function fakeRunner(outcome: Partial<CommandOutcome> = {}): RunCommandFn {
  return async () => ({
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 100,
    timedOut: false,
    ...outcome,
  });
}

function cfg(runner: RunCommandFn): GateConfig {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
    runCommand: runner,
  };
}

async function writeManifest(entries: object): Promise<void> {
  await fs.writeFile(join(lhciDir, "manifest.json"), JSON.stringify(entries));
}

describe("parseLighthouseManifest", () => {
  test("returns representative run scores", async () => {
    await writeManifest([
      {
        url: "http://localhost:3000/",
        isRepresentativeRun: false,
        summary: { performance: 0.5 },
      },
      {
        url: "http://localhost:3000/",
        isRepresentativeRun: true,
        summary: { performance: 0.95, accessibility: 1 },
      },
    ]);
    const scores = await parseLighthouseManifest(join(lhciDir, "manifest.json"));
    expect(scores.performance).toBe(0.95);
    expect(scores.accessibility).toBe(1);
  });

  test("averages multiple representative runs", async () => {
    await writeManifest([
      { isRepresentativeRun: true, summary: { performance: 0.8 } },
      { isRepresentativeRun: true, summary: { performance: 1 } },
    ]);
    const scores = await parseLighthouseManifest(join(lhciDir, "manifest.json"));
    expect(scores.performance).toBe(0.9);
  });

  test("throws on invalid manifest", async () => {
    await fs.writeFile(join(lhciDir, "manifest.json"), "{not json");
    await expect(
      parseLighthouseManifest(join(lhciDir, "manifest.json")),
    ).rejects.toThrow();
  });
});

describe("runLighthouseCiGate", () => {
  test("pass when all scores above thresholds", async () => {
    await writeManifest([
      {
        isRepresentativeRun: true,
        summary: {
          performance: 0.95,
          accessibility: 1,
          "best-practices": 0.95,
          seo: 0.95,
        },
      },
    ]);
    const result = await runLighthouseCiGate({
      config: cfg(fakeRunner()),
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(LIGHTHOUSE_CI_GATE_ID);
    expect((result.details as any).failures).toEqual([]);
  });

  test("fail when any category below threshold", async () => {
    await writeManifest([
      {
        isRepresentativeRun: true,
        summary: {
          performance: 0.5, // below default 0.8
          accessibility: 1,
          "best-practices": 0.95,
          seo: 0.95,
        },
      },
    ]);
    const result = await runLighthouseCiGate({
      config: cfg(fakeRunner()),
    });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.failures).toHaveLength(1);
    expect(details.failures[0].category).toBe("performance");
  });

  test("custom thresholds honored", async () => {
    await writeManifest([
      {
        isRepresentativeRun: true,
        summary: { performance: 0.5, accessibility: 0.9 },
      },
    ]);
    const result = await runLighthouseCiGate({
      config: cfg(fakeRunner()),
      thresholds: { performance: 0.4, accessibility: 0.85 },
    });
    expect(result.status).toBe("pass");
  });

  test("missing manifest → error", async () => {
    const result = await runLighthouseCiGate({
      config: cfg(fakeRunner()),
    });
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toBeDefined();
  });

  test("timeout → error", async () => {
    const result = await runLighthouseCiGate({
      config: cfg(fakeRunner({ timedOut: true })),
    });
    expect(result.status).toBe("error");
  });

  test("skips categories not reported by lhci", async () => {
    await writeManifest([
      {
        isRepresentativeRun: true,
        summary: { performance: 0.9 },
      },
    ]);
    const result = await runLighthouseCiGate({
      config: cfg(fakeRunner()),
    });
    expect(result.status).toBe("pass");
    expect((result.details as any).scores).toHaveLength(1);
  });
});
