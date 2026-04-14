# qa-controller scaffold

**Source tree for the QA controller that `/playbook:install-qa-harness` copies into a target Next.js app as `qa/`.**

Do not invoke this directly inside the playbook repo. It ships into the target app.

Build order (per `docs/qa-pipeline-blueprint.md` Part 12):

- Phase 1 — `types.ts`, `state-manager.ts`, `parsers/` (this)
- Phase 2 — gates + diff audit
- Phase 3 — packet builder + provider + loop
- Phase 4 — recovery + report writer
- Phase 5 — CLI entrypoint (`controller.ts`)

## Local dev (in the scaffold)

```bash
npm install
npm run test
npm run typecheck
```

## When installed into a target app

The installer copies the entire tree to `<target-app>/qa/` and merges the relevant `dependencies`/`devDependencies` into the target app's `package.json`.
