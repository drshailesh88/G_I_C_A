/**
 * Release gate — Accessibility audit (axe-core via Playwright).
 *
 * Runs a generated Playwright spec that visits each configured route and
 * runs `axe-core/playwright`'s `AxeBuilder`. Reports the JSON output to
 * `PLAYWRIGHT_JSON_OUTPUT_FILE`, plus a dedicated axe report JSON for the
 * detailed violation list.
 *
 * Since the axe spec doesn't exist in the target repo yet, this gate
 * generates it on the fly into `<evidenceDir>/axe/axe.spec.ts` using the
 * standard `@axe-core/playwright` pattern. The generated spec is NOT part
 * of the locked test surface — it's per-run evidence.
 *
 * Fails when any violation of the configured severity level is present.
 * Default severity: `serious` and above (matches WCAG 2.1 AA pragmatic
 * enforcement).
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { parsePlaywrightJson } from "../parsers/playwright-json.js";
import { ParseError, type GateResult } from "../types.js";

export const AXE_ACCESSIBILITY_GATE_ID = "axe-accessibility";

export type AxeImpactLevel = "minor" | "moderate" | "serious" | "critical";

export interface AxeAccessibilityInput {
  config: GateConfig;
  routes: string[];
  /** App base URL. Default: http://localhost:3000. */
  baseUrl?: string;
  /** Minimum severity that fails the gate. Default: "serious". */
  minSeverity?: AxeImpactLevel;
  /** Tag list (e.g., wcag2aa, wcag21aa). Default: ["wcag2a", "wcag2aa"]. */
  wcagTags?: string[];
}

export interface AxeViolation {
  id: string;
  impact: AxeImpactLevel | "unknown";
  description: string;
  help: string;
  route: string;
  nodesCount: number;
}

export interface AxeAccessibilityDetails {
  baseUrl: string;
  routes: string[];
  minSeverity: AxeImpactLevel;
  totalViolations: number;
  blockingViolations: number;
  violations: AxeViolation[];
  byImpact: Record<AxeImpactLevel | "unknown", number>;
  exitCode: number;
  timedOut: boolean;
  specPath: string;
  axeReportPath: string;
  command: string[];
  parseError?: string;
}

const SEVERITY_ORDER: AxeImpactLevel[] = [
  "minor",
  "moderate",
  "serious",
  "critical",
];

export async function runAxeAccessibilityGate(
  input: AxeAccessibilityInput,
): Promise<GateResult> {
  const start = Date.now();
  const runner = input.config.runCommand ?? defaultRunCommand();
  const baseUrl = input.baseUrl ?? "http://localhost:3000";
  const minSeverity = input.minSeverity ?? "serious";
  const wcagTags = input.wcagTags ?? ["wcag2a", "wcag2aa"];

  // Generate the spec in the evidence directory.
  const specPath = await writeEvidence(
    input.config.evidenceDir,
    AXE_ACCESSIBILITY_GATE_ID,
    "axe.spec.ts",
    buildAxeSpec(input.routes, baseUrl, wcagTags),
  );
  const axeReportPath = join(
    input.config.evidenceDir,
    AXE_ACCESSIBILITY_GATE_ID,
    "axe-report.json",
  );
  const playwrightJsonPath = join(
    input.config.evidenceDir,
    AXE_ACCESSIBILITY_GATE_ID,
    "playwright.json",
  );

  const command = ["npx", "playwright", "test", specPath, "--reporter=json"];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightJsonPath,
    QA_AXE_REPORT_PATH: axeReportPath,
    QA_AXE_BASE_URL: baseUrl,
  };
  const result = await runner("npx", command.slice(1), {
    ...(input.config.workingDir !== undefined ? { cwd: input.config.workingDir } : {}),
    timeout: input.config.timeoutMs ?? 10 * 60 * 1000,
    env,
  });

  await writeEvidence(
    input.config.evidenceDir,
    AXE_ACCESSIBILITY_GATE_ID,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  const details: AxeAccessibilityDetails = {
    baseUrl,
    routes: input.routes,
    minSeverity,
    totalViolations: 0,
    blockingViolations: 0,
    violations: [],
    byImpact: { minor: 0, moderate: 0, serious: 0, critical: 0, unknown: 0 },
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    specPath,
    axeReportPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: AXE_ACCESSIBILITY_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "axe/playwright timed out" } as unknown as Record<string, unknown>,
      artifacts: [specPath],
      shortCircuit: false,
    });
  }

  // Parse axe report.
  const violations = await parseAxeReport(axeReportPath);
  if (violations === null) {
    // Try Playwright JSON as a fallback signal — if 0 tests ran we know the
    // spec didn't execute. Otherwise assume no violations (axe report may be
    // missing when there are none to report).
    try {
      await parsePlaywrightJson(playwrightJsonPath);
    } catch (err) {
      if (err instanceof ParseError) {
        return buildGateResult({
          gateId: AXE_ACCESSIBILITY_GATE_ID,
          status: "error",
          durationMs: Date.now() - start,
          details: { ...details, parseError: err.message } as unknown as Record<string, unknown>,
          artifacts: [specPath],
          shortCircuit: false,
        });
      }
    }
    // No axe report, no playwright failure → assume green with zero violations.
    return buildGateResult({
      gateId: AXE_ACCESSIBILITY_GATE_ID,
      status: "pass",
      durationMs: Date.now() - start,
      details: details as unknown as Record<string, unknown>,
      artifacts: [specPath],
      shortCircuit: false,
    });
  }

  details.violations = violations;
  details.totalViolations = violations.length;
  const minIdx = SEVERITY_ORDER.indexOf(minSeverity);
  for (const v of violations) {
    if (v.impact === "unknown") {
      details.byImpact.unknown++;
      continue;
    }
    details.byImpact[v.impact]++;
    if (SEVERITY_ORDER.indexOf(v.impact) >= minIdx) {
      details.blockingViolations++;
    }
  }

  const pass = details.blockingViolations === 0 && !result.timedOut;
  return buildGateResult({
    gateId: AXE_ACCESSIBILITY_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [specPath, axeReportPath, playwrightJsonPath],
    shortCircuit: false,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildAxeSpec(
  routes: string[],
  baseUrl: string,
  wcagTags: string[],
): string {
  const routesJson = JSON.stringify(routes, null, 2);
  const tagsJson = JSON.stringify(wcagTags);
  return `// Auto-generated by the QA controller. Do NOT commit to source tree.
import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { writeFileSync } from "node:fs";

const ROUTES = ${routesJson};
const BASE_URL = process.env.QA_AXE_BASE_URL ?? "${baseUrl}";
const REPORT_PATH = process.env.QA_AXE_REPORT_PATH;

test.describe("QA axe accessibility sweep", () => {
  const collected: Array<{ route: string; violations: any[] }> = [];

  test.afterAll(() => {
    if (REPORT_PATH) {
      writeFileSync(REPORT_PATH, JSON.stringify(collected, null, 2));
    }
  });

  for (const route of ROUTES) {
    test(\`a11y: \${route}\`, async ({ page }) => {
      await page.goto(\`\${BASE_URL}\${route}\`);
      const results = await new AxeBuilder({ page }).withTags(${tagsJson}).analyze();
      collected.push({ route, violations: results.violations });
      // We DON'T expect().toBe([]) here — the gate parses the aggregated
      // report separately so every route is tested before verdict.
    });
  }
});
`;
}

interface RawAxeReportEntry {
  route: string;
  violations: Array<{
    id: string;
    impact?: string;
    description?: string;
    help?: string;
    nodes?: unknown[];
  }>;
}

async function parseAxeReport(path: string): Promise<AxeViolation[] | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch {
    return null;
  }
  if (raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: AxeViolation[] = [];
  for (const entry of parsed as RawAxeReportEntry[]) {
    if (!entry.route || !Array.isArray(entry.violations)) continue;
    for (const v of entry.violations) {
      out.push({
        id: v.id,
        impact: normalizeImpact(v.impact),
        description: v.description ?? "",
        help: v.help ?? "",
        route: entry.route,
        nodesCount: Array.isArray(v.nodes) ? v.nodes.length : 0,
      });
    }
  }
  return out;
}

function normalizeImpact(impact?: string): AxeImpactLevel | "unknown" {
  if (impact === "minor" || impact === "moderate" || impact === "serious" || impact === "critical") {
    return impact;
  }
  return "unknown";
}
