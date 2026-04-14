import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runMigrationSafetyGate,
  MIGRATION_SAFETY_GATE_ID,
} from "./migration-safety.js";
import type { GateConfig } from "./base.js";

let root: string;
let drizzleDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `migsafe-${randomBytes(6).toString("hex")}`);
  drizzleDir = join(root, "drizzle");
  await fs.mkdir(drizzleDir, { recursive: true });
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

describe("runMigrationSafetyGate", () => {
  test("no migrations dir → pass with 0 findings", async () => {
    await fs.rm(drizzleDir, { recursive: true });
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(MIGRATION_SAFETY_GATE_ID);
    expect((result.details as any).filesScanned).toBe(0);
    expect((result.details as any).findings).toEqual([]);
  });

  test("clean migrations (CREATE only) → 0 findings", async () => {
    await fs.writeFile(
      join(drizzleDir, "0000_init.sql"),
      `CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
CREATE INDEX ix_users_email ON users(email);`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect(result.status).toBe("pass");
    expect((result.details as any).findingsCount).toBe(0);
  });

  test("detects DROP TABLE", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001_drop.sql"),
      `DROP TABLE users;`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect(result.status).toBe("pass"); // warn-only
    const details = result.details as any;
    expect(details.findingsCount).toBe(1);
    expect(details.findings[0].pattern).toBe("DROP_TABLE");
    expect(details.findings[0].file).toBe("drizzle/0001_drop.sql");
  });

  test("detects DROP COLUMN", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001.sql"),
      `ALTER TABLE users DROP COLUMN email;`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    const details = result.details as any;
    expect(details.findings[0].pattern).toBe("DROP_COLUMN");
  });

  test("detects TRUNCATE", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001.sql"),
      `TRUNCATE TABLE sessions;`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).findings[0].pattern).toBe("TRUNCATE");
  });

  test("detects DELETE FROM", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001.sql"),
      `DELETE FROM sessions WHERE expires_at < NOW();`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).findings[0].pattern).toBe("DELETE_FROM");
  });

  test("detects ALTER COLUMN TYPE", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001.sql"),
      `ALTER TABLE users ALTER COLUMN age SET DATA TYPE SMALLINT;`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).findings[0].pattern).toBe("ALTER_COLUMN_TYPE");
  });

  test("detects RENAME COLUMN", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001.sql"),
      `ALTER TABLE users RENAME COLUMN email TO email_address;`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).findings[0].pattern).toBe("RENAME_COLUMN");
  });

  test("ignores matches inside SQL comments", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001.sql"),
      `-- DROP TABLE users (commented out)
CREATE TABLE x (id INT);`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).findingsCount).toBe(0);
  });

  test("records line numbers", async () => {
    await fs.writeFile(
      join(drizzleDir, "0001.sql"),
      `CREATE TABLE x (id INT);
CREATE TABLE y (id INT);
DROP TABLE y;
CREATE TABLE z (id INT);`,
    );
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).findings[0].line).toBe(3);
  });

  test("scans subdirectories", async () => {
    const subDir = join(drizzleDir, "meta");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(join(subDir, "0001.sql"), `TRUNCATE audit_log;`);
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).findingsCount).toBe(1);
  });

  test("ignores non-.sql files", async () => {
    await fs.writeFile(
      join(drizzleDir, "meta.json"),
      `{"drop": "table should be ignored in json"}`,
    );
    await fs.writeFile(join(drizzleDir, "README.md"), `DROP TABLE users;`);
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect((result.details as any).filesScanned).toBe(0);
  });

  test("custom migrationsDir argument", async () => {
    const customDir = join(root, "migrations");
    await fs.mkdir(customDir, { recursive: true });
    await fs.writeFile(join(customDir, "x.sql"), `DROP TABLE users;`);
    const result = await runMigrationSafetyGate({
      config: cfg(),
      migrationsDir: "migrations",
    });
    expect((result.details as any).findingsCount).toBe(1);
  });

  test("writes evidence JSON", async () => {
    await fs.writeFile(join(drizzleDir, "0001.sql"), `DROP TABLE x;`);
    const result = await runMigrationSafetyGate({ config: cfg() });
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body.findingsCount).toBe(1);
  });
});
