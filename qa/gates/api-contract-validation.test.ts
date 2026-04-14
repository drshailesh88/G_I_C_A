import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runApiContractValidationGate,
  API_CONTRACT_VALIDATION_GATE_ID,
  type FetchFn,
} from "./api-contract-validation.js";
import type { GateConfig } from "./base.js";

let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `api-contract-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, ".quality", "contracts"), { recursive: true });
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
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
  };
}

async function writeApiContract(
  feature: string,
  contract: object,
): Promise<void> {
  const dir = join(root, ".quality", "contracts", feature);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, "api-contract.json"), JSON.stringify(contract));
}

function stubFetch(
  responses: Record<string, { status: number; body: any }>,
): FetchFn {
  return async (url, init) => {
    const key = `${init.method} ${url}`;
    const r = responses[key] ?? responses[url];
    if (!r) {
      throw new Error(`unexpected request: ${key}`);
    }
    return {
      status: r.status,
      text: async () =>
        typeof r.body === "string" ? r.body : JSON.stringify(r.body),
    };
  };
}

describe("runApiContractValidationGate", () => {
  test("pass when response matches declared shape", async () => {
    await writeApiContract("auth-login", {
      feature: "auth-login",
      endpoints: [
        {
          method: "POST",
          path: "/api/login",
          input: { email: "string", password: "string" },
          output: { token: "string", expires_at: "number" },
        },
      ],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      baseUrl: "http://localhost:3000",
      fetch: stubFetch({
        "POST http://localhost:3000/api/login": {
          status: 200,
          body: { token: "abc", expires_at: 1234 },
        },
      }),
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(API_CONTRACT_VALIDATION_GATE_ID);
    expect((result.details as any).endpointsChecked).toBe(1);
    expect((result.details as any).mismatches).toEqual([]);
  });

  test("fail on missing field", async () => {
    await writeApiContract("x", {
      feature: "x",
      endpoints: [
        {
          method: "GET",
          path: "/api/me",
          output: { id: "string", email: "string" },
        },
      ],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: stubFetch({
        "GET http://localhost:3000/api/me": {
          status: 200,
          body: { id: "u1" }, // email missing
        },
      }),
    });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.mismatches).toHaveLength(1);
    expect(details.mismatches[0].reason).toContain("missing field");
    expect(details.mismatches[0].reason).toContain("email");
  });

  test("fail on wrong type", async () => {
    await writeApiContract("x", {
      feature: "x",
      endpoints: [
        { method: "GET", path: "/api/count", output: { count: "number" } },
      ],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: stubFetch({
        "GET http://localhost:3000/api/count": {
          status: 200,
          body: { count: "not a number" },
        },
      }),
    });
    expect(result.status).toBe("fail");
    expect((result.details as any).mismatches[0].reason).toContain("expected number");
  });

  test("fail on non-2xx response", async () => {
    await writeApiContract("x", {
      feature: "x",
      endpoints: [{ method: "GET", path: "/api/ok", output: { ok: "boolean" } }],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: stubFetch({
        "GET http://localhost:3000/api/ok": { status: 500, body: "err" },
      }),
    });
    expect(result.status).toBe("fail");
    expect((result.details as any).mismatches[0].reason).toContain("2xx");
  });

  test("fail on non-JSON response body", async () => {
    await writeApiContract("x", {
      feature: "x",
      endpoints: [{ method: "GET", path: "/api/x", output: { a: "string" } }],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: stubFetch({
        "GET http://localhost:3000/api/x": { status: 200, body: "<html>" },
      }),
    });
    expect(result.status).toBe("fail");
    expect((result.details as any).mismatches[0].reason).toContain("JSON");
  });

  test("unreachable endpoint recorded", async () => {
    await writeApiContract("x", {
      feature: "x",
      endpoints: [{ method: "GET", path: "/api/x", output: { a: "string" } }],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(result.status).toBe("fail");
    expect((result.details as any).unreachable).toHaveLength(1);
  });

  test("no contracts → pass cleanly with 0 endpoints", async () => {
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: async () => ({ status: 200, text: async () => "{}" }),
    });
    expect(result.status).toBe("pass");
    expect((result.details as any).contractsChecked).toBe(0);
    expect((result.details as any).endpointsChecked).toBe(0);
  });

  test("aggregates across multiple contracts + endpoints", async () => {
    await writeApiContract("a", {
      feature: "a",
      endpoints: [
        { method: "GET", path: "/api/a", output: { x: "string" } },
        { method: "POST", path: "/api/a", input: { y: "number" }, output: { ok: "boolean" } },
      ],
    });
    await writeApiContract("b", {
      feature: "b",
      endpoints: [{ method: "GET", path: "/api/b", output: { z: "boolean" } }],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: stubFetch({
        "GET http://localhost:3000/api/a": { status: 200, body: { x: "" } },
        "POST http://localhost:3000/api/a": { status: 200, body: { ok: true } },
        "GET http://localhost:3000/api/b": { status: 200, body: { z: true } },
      }),
    });
    expect((result.details as any).endpointsChecked).toBe(3);
    expect(result.status).toBe("pass");
  });

  test("contract without output skips shape validation", async () => {
    await writeApiContract("x", {
      feature: "x",
      endpoints: [{ method: "GET", path: "/api/x" }], // no output declared
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: stubFetch({
        "GET http://localhost:3000/api/x": { status: 200, body: { anything: true } },
      }),
    });
    expect(result.status).toBe("pass");
  });

  test("ignores invalid api-contract.json", async () => {
    await writeApiContract("bad", { not: "valid contract schema" });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: async () => ({ status: 200, text: async () => "{}" }),
    });
    expect((result.details as any).contractsChecked).toBe(0);
  });

  test("writes evidence", async () => {
    await writeApiContract("x", {
      feature: "x",
      endpoints: [{ method: "GET", path: "/api/x", output: { ok: "boolean" } }],
    });
    const result = await runApiContractValidationGate({
      config: cfg(),
      fetch: stubFetch({
        "GET http://localhost:3000/api/x": { status: 200, body: { ok: true } },
      }),
    });
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body).toHaveProperty("endpointsChecked");
  });
});
