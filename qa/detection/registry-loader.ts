/**
 * Service registry loader.
 *
 * Walks `playbook/qa-scaffold/registry/services/*.yaml` (or a caller-provided
 * path), parses each manifest via Zod, and returns a typed array. Invalid
 * manifests are reported separately so the caller (installer) can surface
 * them without aborting the whole load.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { ServiceManifestSchema, type ServiceManifest } from "../types.js";

export interface LoadedManifest {
  path: string;
  manifest: ServiceManifest;
}

export interface LoadRegistryResult {
  loaded: LoadedManifest[];
  invalid: Array<{ path: string; error: string }>;
}

export async function loadServiceRegistry(
  registryDir: string,
): Promise<LoadRegistryResult> {
  const loaded: LoadedManifest[] = [];
  const invalid: Array<{ path: string; error: string }> = [];

  let entries: string[];
  try {
    entries = await fs.readdir(registryDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { loaded, invalid };
    }
    throw err;
  }

  for (const name of entries) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue;
    const path = join(registryDir, name);
    const raw = await fs.readFile(path, "utf8").catch(() => null);
    if (raw === null) {
      invalid.push({ path, error: "unreadable" });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = yaml.load(raw);
    } catch (err) {
      invalid.push({ path, error: `YAML parse failed: ${(err as Error).message}` });
      continue;
    }
    const result = ServiceManifestSchema.safeParse(parsed);
    if (!result.success) {
      const msg = result.error.issues
        .slice(0, 2)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ");
      invalid.push({ path, error: `schema: ${msg}` });
      continue;
    }
    loaded.push({ path, manifest: result.data });
  }

  return { loaded, invalid };
}
