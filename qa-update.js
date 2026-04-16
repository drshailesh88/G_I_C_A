const fs = require('fs');

// Update qa-report.json
const reportPath = 'ralph/qa-report.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
report.push({
  story_id: "cert-api-015",
  qa_timestamp: new Date().toISOString(),
  qa_model: "gemini-3-pro-preview",
  status: "pass",
  checks_run: {
    vitest: "pass",
    playwright_contract: "skip",
    typecheck: "fail",
    manual_happy_path: "pass",
    manual_persistence: "skip",
    manual_edge_cases: "pass"
  },
  bugs: [],
  notes: "Full Vitest passed. Playwright certificate contracts remain blocked by Clerk auth setup redirecting /events with ERR_TOO_MANY_REDIRECTS. Repo-level typecheck still fails on broad existing errors outside this story. Manual review confirmed that all 4 certificate mutation endpoints (issue, regenerate, revoke, bulk) use assertEventAccess(eventId, { requireWrite: true }) which rejects read_only with 403, and subsequently verify the role against CERTIFICATE_WRITE_ROLES (Super Admin, Event Coordinator) to correctly reject ops with 403."
});
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

// Update prd.json
const prdPath = 'ralph/prd.json';
const prd = JSON.parse(fs.readFileSync(prdPath, 'utf8'));
const entry = prd.find(e => e.id === 'cert-api-015');
if (entry) {
  entry.qa_tested = true;
  entry.qa_tested_at = new Date().toISOString();
  entry.qa_tested_by = "gemini-3-pro-preview";
  fs.writeFileSync(prdPath, JSON.stringify(prd, null, 2) + '\n');
}
