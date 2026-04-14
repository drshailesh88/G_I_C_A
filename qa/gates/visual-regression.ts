/**
 * Release gate — Visual regression.
 *
 * Generates a Playwright spec that navigates to each configured route at
 * each configured viewport, takes a screenshot, and compares against a
 * stored baseline via `toHaveScreenshot()`. Playwright's native snapshot
 * assertion handles diff thresholds and baseline storage.
 *
 * The generated spec points at `baselinesDir` (default
 * `.quality/visual-baselines/`) via the `snapshotDir` test config option.
 * Baselines are committed to the repo per the blueprint locked-set; if
 * a baseline is missing, Playwright creates it on first run.
 */
import { join } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { parsePlaywrightJson } from "../parsers/playwright-json.js";
import { ParseError, type GateResult, type PlaywrightResult } from "../types.js";

export const VISUAL_REGRESSION_GATE_ID = "visual-regression";

export interface VisualViewport {
  label: string;
  width: number;
  height: number;
}

export interface VisualRegressionInput {
  config: GateConfig;
  routes: string[];
  viewports?: VisualViewport[];
  baseUrl?: string;
  baselinesDir?: string;
  /** Max allowed pixel diff ratio (0..1). Default: 0.01 (1%). */
  maxDiffPixelRatio?: number;
}

export interface VisualRegressionDetails {
  baseUrl: string;
  routes: string[];
  viewports: VisualViewport[];
  maxDiffPixelRatio: number;
  baselinesDir: string;
  total: number;
  failed: number;
  passed: number;
  failures: PlaywrightResult["failures"];
  exitCode: number;
  timedOut: boolean;
  specPath: string;
  command: string[];
  parseError?: string;
}

const DEFAULT_VIEWPORTS: VisualViewport[] = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
];

export async function runVisualRegressionGate(
  input: VisualRegressionInput,
): Promise<GateResult> {
  const start = Date.now();
  const runner = input.config.runCommand ?? defaultRunCommand();
  const baseUrl = input.baseUrl ?? "http://localhost:3000";
  const viewports = input.viewports ?? DEFAULT_VIEWPORTS;
  const baselinesDir =
    input.baselinesDir ?? ".quality/visual-baselines";
  const maxDiffPixelRatio = input.maxDiffPixelRatio ?? 0.01;

  const specPath = await writeEvidence(
    input.config.evidenceDir,
    VISUAL_REGRESSION_GATE_ID,
    "visual.spec.ts",
    buildVisualSpec(input.routes, viewports, baseUrl, maxDiffPixelRatio),
  );
  const playwrightJsonPath = join(
    input.config.evidenceDir,
    VISUAL_REGRESSION_GATE_ID,
    "playwright.json",
  );

  const command = [
    "npx",
    "playwright",
    "test",
    specPath,
    "--reporter=json",
    `--config=playwright.config.ts`,
  ];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightJsonPath,
    QA_VISUAL_BASE_URL: baseUrl,
    QA_VISUAL_BASELINES_DIR: baselinesDir,
  };
  const result = await runner("npx", command.slice(1), {
    ...(input.config.workingDir !== undefined
      ? { cwd: input.config.workingDir }
      : {}),
    timeout: input.config.timeoutMs ?? 10 * 60 * 1000,
    env,
  });

  await writeEvidence(
    input.config.evidenceDir,
    VISUAL_REGRESSION_GATE_ID,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  const details: VisualRegressionDetails = {
    baseUrl,
    routes: input.routes,
    viewports,
    maxDiffPixelRatio,
    baselinesDir,
    total: 0,
    failed: 0,
    passed: 0,
    failures: [],
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    specPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: VISUAL_REGRESSION_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "visual regression timed out" } as unknown as Record<string, unknown>,
      artifacts: [specPath],
      shortCircuit: false,
    });
  }

  let parsed: PlaywrightResult;
  try {
    parsed = await parsePlaywrightJson(playwrightJsonPath);
  } catch (err) {
    if (err instanceof ParseError) {
      return buildGateResult({
        gateId: VISUAL_REGRESSION_GATE_ID,
        status: "error",
        durationMs: Date.now() - start,
        details: { ...details, parseError: err.message } as unknown as Record<string, unknown>,
        artifacts: [specPath],
        shortCircuit: false,
      });
    }
    throw err;
  }

  details.total = parsed.total;
  details.passed = parsed.passed;
  details.failed = parsed.failed;
  details.failures = parsed.failures;

  const pass = result.exitCode === 0 && parsed.failed === 0;
  return buildGateResult({
    gateId: VISUAL_REGRESSION_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [specPath, playwrightJsonPath],
    shortCircuit: false,
  });
}

function buildVisualSpec(
  routes: string[],
  viewports: VisualViewport[],
  baseUrl: string,
  maxDiffPixelRatio: number,
): string {
  return `// Auto-generated by the QA controller.
import { test, expect } from "@playwright/test";

const ROUTES = ${JSON.stringify(routes, null, 2)};
const VIEWPORTS = ${JSON.stringify(viewports, null, 2)};
const BASE_URL = process.env.QA_VISUAL_BASE_URL ?? "${baseUrl}";
const MAX_DIFF_PIXEL_RATIO = ${maxDiffPixelRatio};

test.describe("QA visual regression sweep", () => {
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      test(\`\${route} @ \${vp.label}\`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(\`\${BASE_URL}\${route}\`);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveScreenshot(\`\${route.replace(/\\//g, "_")}_\${vp.label}.png\`, {
          maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
          fullPage: true,
        });
      });
    }
  }
});
`;
}
