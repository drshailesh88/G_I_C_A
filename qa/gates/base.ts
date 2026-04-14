/**
 * Shared gate infrastructure.
 *
 * - GateConfig: input shape every gate accepts.
 * - RunCommandFn: injected subprocess runner. The default wraps execa;
 *   tests inject their own to avoid shelling out.
 * - writeEvidence / readEvidence: standard on-disk evidence layout under
 *   `<evidenceDir>/<gateId>/...`.
 * - buildGateResult: small helper to keep result objects uniform.
 */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { execa } from "execa";
import type {
  GateResult,
  GateStatus,
  FeatureId,
  RunId,
} from "../types.js";

// ─── RunCommandFn ─────────────────────────────────────────────────────────────

export interface CommandOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface RunCommandOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}

export type RunCommandFn = (
  command: string,
  args: string[],
  options?: RunCommandOptions,
) => Promise<CommandOutcome>;

export function defaultRunCommand(): RunCommandFn {
  return async (command, args, options = {}) => {
    const start = Date.now();
    try {
      const result = await execa(command, args, {
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        ...(options.stdin !== undefined ? { input: options.stdin } : {}),
        reject: false,
      });
      return {
        exitCode: typeof result.exitCode === "number" ? result.exitCode : 1,
        stdout: typeof result.stdout === "string" ? result.stdout : "",
        stderr: typeof result.stderr === "string" ? result.stderr : "",
        durationMs: Date.now() - start,
        timedOut: Boolean(result.timedOut),
      };
    } catch (err) {
      // With reject: false execa should not throw on non-zero exit; if it
      // does throw, it's a spawn-level error (command not found, etc.)
      const errAny = err as { code?: string; message?: string; stderr?: string };
      return {
        exitCode: 127,
        stdout: "",
        stderr: errAny.stderr ?? errAny.message ?? String(err),
        durationMs: Date.now() - start,
        timedOut: false,
      };
    }
  };
}

// ─── GateConfig ───────────────────────────────────────────────────────────────

export interface GateConfig {
  runId: RunId;
  /** Target app root. */
  workingDir: string;
  /** `<runArtifactsDir>/evidence`. Each gate writes under a per-gate subdir. */
  evidenceDir: string;
  /** The feature this gate is running against, when applicable. */
  featureId?: FeatureId;
  /** The absolute path to the feature's contract directory
   *  (`.quality/contracts/<feature>/`), when a gate needs the index.yaml. */
  contractDir?: string;
  /** Subprocess runner. Default: execa-backed. Tests inject their own. */
  runCommand?: RunCommandFn;
  /** Override default timeout (ms). Default is gate-specific. */
  timeoutMs?: number;
}

// ─── Result helpers ───────────────────────────────────────────────────────────

export interface BuildGateResultInput {
  gateId: string;
  status: GateStatus;
  durationMs: number;
  details?: Record<string, unknown>;
  artifacts?: string[];
  shortCircuit?: boolean;
}

export function buildGateResult(input: BuildGateResultInput): GateResult {
  return {
    gateId: input.gateId,
    status: input.status,
    durationMs: input.durationMs,
    details: input.details ?? {},
    artifacts: input.artifacts ?? [],
    shortCircuit: Boolean(input.shortCircuit),
  };
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

/**
 * Write evidence for a gate under `<evidenceDir>/<gateId>/<name>`. Creates
 * the directory tree if missing. Returns the absolute path written.
 */
export async function writeEvidence(
  evidenceDir: string,
  gateId: string,
  name: string,
  contents: string | Buffer,
): Promise<string> {
  const fullPath = join(evidenceDir, gateId, name);
  await fs.mkdir(dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, contents);
  return fullPath;
}

// ─── Hashing helpers (used by integrity gates) ────────────────────────────────

/** Normalize SHA256 prefix: ensures output starts with `sha256:`. */
export function sha256Prefix(hex: string): string {
  return hex.startsWith("sha256:") ? hex : `sha256:${hex}`;
}

export async function computeFileHash(path: string): Promise<string> {
  const buf = await fs.readFile(path);
  return sha256Prefix(createHash("sha256").update(buf).digest("hex"));
}

export function computeStringHash(s: string): string {
  return sha256Prefix(createHash("sha256").update(s).digest("hex"));
}
