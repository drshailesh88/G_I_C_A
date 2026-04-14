import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  detectServices,
  matchGlobLike,
  writeDetectedServicesYaml,
  writeStubManifest,
} from "./service-detector.js";
import { loadServiceRegistry } from "./registry-loader.js";
import type { ServiceManifest } from "../types.js";

let root: string;
let registryDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `detect-${randomBytes(6).toString("hex")}`);
  registryDir = join(root, "registry");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(registryDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

async function writePackageJson(deps: Record<string, string>, dev?: Record<string, string>): Promise<void> {
  await fs.writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "target-app",
      dependencies: deps,
      devDependencies: dev ?? {},
    }),
  );
}

async function writeEnvExample(keys: string[]): Promise<void> {
  await fs.writeFile(
    join(root, ".env.example"),
    keys.map((k) => `${k}=`).join("\n"),
  );
}

async function writeManifest(
  filename: string,
  m: Partial<ServiceManifest> & { name: string; display_name: string; status: "validated" | "draft" | "stub" },
): Promise<void> {
  const full: ServiceManifest = {
    name: m.name,
    display_name: m.display_name,
    status: m.status,
    detection: m.detection ?? { package_patterns: [], env_patterns: [] },
    env_test_vars: m.env_test_vars ?? { required: [], optional: [] },
    ...(m.category_hint !== undefined ? { category_hint: m.category_hint } : {}),
    ...(m.snippets !== undefined ? { snippets: m.snippets } : {}),
    ...(m.tier_hints !== undefined ? { tier_hints: m.tier_hints } : {}),
    ...(m.documentation_url !== undefined ? { documentation_url: m.documentation_url } : {}),
    ...(m.security_notes !== undefined ? { security_notes: m.security_notes } : {}),
  };
  await fs.writeFile(join(registryDir, filename), yaml.dump(full));
}

// ─── matchGlobLike ────────────────────────────────────────────────────────────

describe("matchGlobLike", () => {
  test("literal match", () => {
    expect(matchGlobLike("stripe", "stripe")).toBe(true);
    expect(matchGlobLike("react", "stripe")).toBe(false);
  });

  test("* wildcard on scoped packages", () => {
    expect(matchGlobLike("@clerk/nextjs", "@clerk/*")).toBe(true);
    expect(matchGlobLike("@clerk/testing", "@clerk/*")).toBe(true);
    expect(matchGlobLike("next-auth", "@clerk/*")).toBe(false);
  });

  test("env var prefix match", () => {
    expect(matchGlobLike("CLERK_SECRET_KEY", "CLERK_*")).toBe(true);
    expect(matchGlobLike("NEXT_PUBLIC_CLERK_X", "NEXT_PUBLIC_CLERK_*")).toBe(true);
  });
});

// ─── loadServiceRegistry ─────────────────────────────────────────────────────

describe("loadServiceRegistry", () => {
  test("loads valid manifests, surfaces invalid ones separately", async () => {
    await writeManifest("clerk.yaml", {
      name: "clerk",
      display_name: "Clerk",
      status: "validated",
      detection: { package_patterns: ["@clerk/nextjs"], env_patterns: ["CLERK_*"] },
      env_test_vars: { required: [], optional: [] },
    });
    await fs.writeFile(join(registryDir, "broken.yaml"), "not: valid: schema: :");
    await fs.writeFile(join(registryDir, "invalid-shape.yaml"), yaml.dump({ hello: "world" }));
    const { loaded, invalid } = await loadServiceRegistry(registryDir);
    expect(loaded.map((l) => l.manifest.name)).toEqual(["clerk"]);
    expect(invalid.length).toBeGreaterThanOrEqual(1);
  });

  test("returns empty arrays when registry missing", async () => {
    const result = await loadServiceRegistry(join(root, "missing"));
    expect(result.loaded).toEqual([]);
    expect(result.invalid).toEqual([]);
  });
});

// ─── detectServices ─────────────────────────────────────────────────────────

describe("detectServices", () => {
  test("detects a service via package pattern + env pattern", async () => {
    await writePackageJson({ "@clerk/nextjs": "^5" });
    await writeEnvExample(["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]);
    await writeManifest("clerk.yaml", {
      name: "clerk",
      display_name: "Clerk",
      status: "validated",
      detection: {
        package_patterns: ["@clerk/nextjs"],
        env_patterns: ["CLERK_*", "NEXT_PUBLIC_CLERK_*"],
      },
      env_test_vars: { required: [], optional: [] },
    });
    const report = await detectServices({ workingDir: root, registryDir });
    expect(report.detected).toHaveLength(1);
    const d = report.detected[0]!;
    expect(d.name).toBe("clerk");
    expect(d.matchedPackagePatterns).toContain("@clerk/nextjs");
    expect(d.matchedEnvPatterns).toContain("CLERK_*");
    expect(d.matchedEnvPatterns).toContain("NEXT_PUBLIC_CLERK_*");
  });

  test("sorts detected services alphabetically", async () => {
    await writePackageJson({ stripe: "^15", razorpay: "^2" });
    await writeManifest("stripe.yaml", {
      name: "stripe",
      display_name: "Stripe",
      status: "draft",
      detection: { package_patterns: ["stripe"], env_patterns: [] },
      env_test_vars: { required: [], optional: [] },
    });
    await writeManifest("razorpay.yaml", {
      name: "razorpay",
      display_name: "Razorpay",
      status: "validated",
      detection: { package_patterns: ["razorpay"], env_patterns: [] },
      env_test_vars: { required: [], optional: [] },
    });
    const report = await detectServices({ workingDir: root, registryDir });
    expect(report.detected.map((d) => d.name)).toEqual(["razorpay", "stripe"]);
  });

  test("no match for a service is ignored", async () => {
    await writePackageJson({ react: "^19" });
    await writeManifest("clerk.yaml", {
      name: "clerk",
      display_name: "Clerk",
      status: "validated",
      detection: { package_patterns: ["@clerk/nextjs"], env_patterns: ["CLERK_*"] },
      env_test_vars: { required: [], optional: [] },
    });
    const report = await detectServices({ workingDir: root, registryDir });
    expect(report.detected).toEqual([]);
  });

  test("unknowns list captures unmatched scoped/hinty deps", async () => {
    await writePackageJson({ "@some-auth/provider": "^1", react: "^19", "stripe-bogus": "^1" });
    const report = await detectServices({ workingDir: root, registryDir });
    const unknownValues = report.unknowns.map((u) => u.value);
    expect(unknownValues).toContain("@some-auth/provider"); // scoped → flagged
    expect(unknownValues).toContain("stripe-bogus"); // "stripe" hint → flagged
    expect(unknownValues).not.toContain("react"); // no hint → not flagged
  });

  test("strict mode aborts when unknowns present", async () => {
    await writePackageJson({ "@unknown/lib": "^1" });
    const report = await detectServices({
      workingDir: root,
      registryDir,
      mode: "strict",
    });
    expect(report.aborted).toBe(true);
  });

  test("default mode does not abort", async () => {
    await writePackageJson({ "@unknown/lib": "^1" });
    const report = await detectServices({ workingDir: root, registryDir });
    expect(report.aborted).toBe(false);
  });

  test("scansPackageJson=false when package.json missing", async () => {
    const report = await detectServices({ workingDir: root, registryDir });
    expect(report.scannedPackageJson).toBe(false);
  });

  test("reads .env.local.example when .env.example missing", async () => {
    await writePackageJson({});
    await fs.writeFile(
      join(root, ".env.local.example"),
      "CLERK_SECRET_KEY=\n",
    );
    await writeManifest("clerk.yaml", {
      name: "clerk",
      display_name: "Clerk",
      status: "validated",
      detection: { package_patterns: [], env_patterns: ["CLERK_*"] },
      env_test_vars: { required: [], optional: [] },
    });
    const report = await detectServices({ workingDir: root, registryDir });
    expect(report.detected).toHaveLength(1);
  });

  test("manifestsOverride bypasses filesystem", async () => {
    await writePackageJson({ "@my/lib": "^1" });
    const report = await detectServices({
      workingDir: root,
      registryDir: join(root, "does-not-exist"),
      manifestsOverride: [
        {
          path: "memory://my-lib.yaml",
          manifest: {
            name: "my-lib",
            display_name: "My Lib",
            status: "validated",
            detection: { package_patterns: ["@my/lib"], env_patterns: [] },
            env_test_vars: { required: [], optional: [] },
          },
        },
      ],
    });
    expect(report.detected.map((d) => d.name)).toEqual(["my-lib"]);
  });
});

// ─── writeDetectedServicesYaml ───────────────────────────────────────────────

describe("writeDetectedServicesYaml", () => {
  test("writes detected-services.yaml with provenance", async () => {
    await writePackageJson({ "@clerk/nextjs": "^5" });
    await writeManifest("clerk.yaml", {
      name: "clerk",
      display_name: "Clerk",
      status: "validated",
      detection: { package_patterns: ["@clerk/nextjs"], env_patterns: [] },
      env_test_vars: { required: [], optional: [] },
    });
    const report = await detectServices({ workingDir: root, registryDir });
    const path = await writeDetectedServicesYaml({ workingDir: root, report });
    const body = await fs.readFile(path, "utf8");
    expect(body).toContain("# GENERATED BY");
    expect(body).toContain("name: clerk");
    expect(body).toContain("installed_from_registry:");
  });
});

// ─── writeStubManifest ──────────────────────────────────────────────────────

describe("writeStubManifest", () => {
  test("creates a .yaml.stub for a package unknown", async () => {
    const stubPath = await writeStubManifest(registryDir, {
      kind: "package",
      value: "@supabase/supabase-js",
    });
    expect(stubPath).not.toBeNull();
    const body = await fs.readFile(stubPath!, "utf8");
    expect(body).toContain("# STUB manifest");
    expect(body).toContain("status: stub");
    expect(body).toContain("@supabase/supabase-js");
  });

  test("skips if stub already exists (no overwrite)", async () => {
    const first = await writeStubManifest(registryDir, {
      kind: "package",
      value: "@supabase/supabase-js",
    });
    const before = await fs.readFile(first!, "utf8");
    await fs.writeFile(first!, before + "\n# edited by user\n");
    const second = await writeStubManifest(registryDir, {
      kind: "package",
      value: "@supabase/supabase-js",
    });
    expect(second).toBe(first);
    const after = await fs.readFile(second!, "utf8");
    expect(after).toContain("# edited by user");
  });

  test("returns null for env-kind unknowns", async () => {
    const stubPath = await writeStubManifest(registryDir, {
      kind: "env",
      value: "MYSERVICE_API_KEY",
    });
    expect(stubPath).toBeNull();
  });
});
