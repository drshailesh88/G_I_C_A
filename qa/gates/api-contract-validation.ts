/**
 * Release gate — API contract validation.
 *
 * For every `.quality/contracts/<feature>/api-contract.json` present in the
 * contracts directory, hits each declared endpoint against the running app
 * and validates the response shape with a Zod schema built from the
 * contract's `input`/`output` declarations. Mismatches are gate failures.
 *
 * api-contract.json shape (from contract-pack.md, Part 3.2):
 *   {
 *     "feature": "name",
 *     "endpoints": [
 *       {
 *         "method": "POST",
 *         "path": "/api/resource",
 *         "input":  { "field1": "string", "field2": "number" },
 *         "output": { "id": "string", "created": "boolean" },
 *         "errorCases": [
 *           { "condition": "missing field1", "status": 400,
 *             "message": "field1 is required" }
 *         ]
 *       }
 *     ]
 *   }
 *
 * The gate makes a request to each endpoint. For the "happy path" it sends
 * a minimal valid-looking payload and expects the declared output shape.
 * Error cases are NOT exercised here — they require domain-specific
 * payloads. This gate catches frontend/backend drift, not error handling.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  buildGateResult,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const API_CONTRACT_VALIDATION_GATE_ID = "api-contract-validation";

const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const FieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "null",
]);

const EndpointSchema = z.object({
  method: HttpMethodSchema,
  path: z.string().min(1),
  input: z.record(z.string(), z.string()).optional(),
  output: z.record(z.string(), z.string()).optional(),
  errorCases: z
    .array(
      z.object({
        condition: z.string(),
        status: z.number().int(),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

const ApiContractSchema = z.object({
  feature: z.string().min(1),
  endpoints: z.array(EndpointSchema),
});

export type ApiContract = z.infer<typeof ApiContractSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;

export type FetchFn = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; text: () => Promise<string> }>;

export interface ApiContractMismatch {
  feature: string;
  method: string;
  path: string;
  reason: string;
  detail?: string;
}

export interface ApiContractValidationDetails {
  baseUrl: string;
  contractsChecked: number;
  endpointsChecked: number;
  mismatches: ApiContractMismatch[];
  unreachable: ApiContractMismatch[];
}

export interface ApiContractValidationInput {
  config: GateConfig;
  baseUrl?: string;
  /** Override fetch implementation for tests. */
  fetch?: FetchFn;
  /** Extra headers to send with each request (e.g. auth bearer). */
  headers?: Record<string, string>;
}

export async function runApiContractValidationGate(
  input: ApiContractValidationInput,
): Promise<GateResult> {
  const start = Date.now();
  const baseUrl = input.baseUrl ?? "http://localhost:3000";
  const fetchFn = input.fetch ?? defaultFetch;
  const contractsRoot = join(input.config.workingDir, ".quality", "contracts");

  const details: ApiContractValidationDetails = {
    baseUrl,
    contractsChecked: 0,
    endpointsChecked: 0,
    mismatches: [],
    unreachable: [],
  };

  const contracts = await loadApiContracts(contractsRoot);
  details.contractsChecked = contracts.length;

  for (const contract of contracts) {
    for (const endpoint of contract.endpoints) {
      details.endpointsChecked++;
      const url = `${baseUrl}${endpoint.path}`;

      let res: { status: number; text: () => Promise<string> };
      try {
        res = await fetchFn(url, {
          method: endpoint.method,
          headers: { "Content-Type": "application/json", ...(input.headers ?? {}) },
          ...(endpoint.input ? { body: JSON.stringify(buildSampleInput(endpoint.input)) } : {}),
        });
      } catch (err) {
        details.unreachable.push({
          feature: contract.feature,
          method: endpoint.method,
          path: endpoint.path,
          reason: "network error",
          detail: (err as Error).message,
        });
        continue;
      }

      const issues = await validateResponse(res, endpoint);
      for (const issue of issues) {
        details.mismatches.push({
          feature: contract.feature,
          method: endpoint.method,
          path: endpoint.path,
          reason: issue,
        });
      }
    }
  }

  const evidencePath = await writeEvidence(
    input.config.evidenceDir,
    API_CONTRACT_VALIDATION_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  const pass =
    details.mismatches.length === 0 && details.unreachable.length === 0;
  return buildGateResult({
    gateId: API_CONTRACT_VALIDATION_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: false,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function loadApiContracts(contractsRoot: string): Promise<ApiContract[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(contractsRoot);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const contracts: ApiContract[] = [];
  for (const name of entries) {
    const apiPath = join(contractsRoot, name, "api-contract.json");
    const raw = await fs.readFile(apiPath, "utf8").catch(() => null);
    if (raw === null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const result = ApiContractSchema.safeParse(parsed);
    if (result.success) contracts.push(result.data);
  }
  return contracts;
}

async function validateResponse(
  res: { status: number; text: () => Promise<string> },
  endpoint: Endpoint,
): Promise<string[]> {
  const issues: string[] = [];

  // 2xx happy-path expectation.
  if (res.status < 200 || res.status >= 300) {
    issues.push(`expected 2xx response, got ${res.status}`);
    return issues;
  }

  if (!endpoint.output) return issues;

  const bodyText = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    issues.push("response body is not valid JSON");
    return issues;
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    issues.push(`expected JSON object, got ${Array.isArray(body) ? "array" : typeof body}`);
    return issues;
  }

  const obj = body as Record<string, unknown>;
  for (const [field, expectedType] of Object.entries(endpoint.output)) {
    if (!(field in obj)) {
      issues.push(`missing field "${field}" (expected ${expectedType})`);
      continue;
    }
    const actual = jsType(obj[field]);
    if (!typesMatch(expectedType, actual)) {
      issues.push(
        `field "${field}": expected ${expectedType}, got ${actual}`,
      );
    }
  }
  return issues;
}

function buildSampleInput(
  input: Record<string, string>,
): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const [key, typeName] of Object.entries(input)) {
    switch (typeName) {
      case "string":
        sample[key] = "sample";
        break;
      case "number":
        sample[key] = 0;
        break;
      case "boolean":
        sample[key] = true;
        break;
      case "array":
        sample[key] = [];
        break;
      case "object":
        sample[key] = {};
        break;
      default:
        sample[key] = null;
    }
  }
  return sample;
}

function jsType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function typesMatch(declared: string, actual: string): boolean {
  if (declared === actual) return true;
  // Zod-style alternates: allow "string | null" etc. in a future version.
  return false;
}

/** Default fetch wrapper using the global fetch. Separated so tests can
 * inject a stub without having to monkey-patch global. */
async function defaultFetch(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; text: () => Promise<string> }> {
  const res = await fetch(url, init);
  return {
    status: res.status,
    text: () => res.text(),
  };
}
