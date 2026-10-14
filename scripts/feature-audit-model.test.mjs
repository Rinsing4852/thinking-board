import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCheck, assessCatalog, browserRecords } from "./feature-audit-model.mjs";

const check = { id: "one", requirement: "Task", evidence: [{ kind: "browser", title: "Task", projects: ["chromium", "webkit"] }] };
const record = project => ({ kind: "browser", title: "Task", project, status: "passed" });
test("a missing browser and a skipped check cannot become a pass", () => {
  assert.equal(assessCheck(check, [record("chromium")], "existing").status, "unknown");
  assert.equal(assessCheck(check, [record("chromium"), { ...record("webkit"), status: "skipped" }], "existing").status, "unknown");
});
test("failures and flaky retries remain visible", () => {
  assert.equal(assessCheck(check, [record("chromium"), { ...record("webkit"), status: "failed" }], "existing").status, "failed");
  assert.equal(assessCheck(check, [record("chromium"), { ...record("webkit"), status: "flaky" }], "existing").status, "flaky");
});
test("missing features earn no credit and excluded features do not change the denominator", () => {
  const feature = (id, state) => ({ id, priority: "P0", currentState: state, baselineState: state, acceptanceChecks: [check] });
  const result = assessCatalog({ features: [feature("a", "existing"), feature("b", "absent"), feature("c", "not_targeted")] }, [record("chromium"), record("webkit")]);
  assert.equal(result.verifiedPercent, 50);
  assert.equal(result.counts.unmet, 1);
  assert.equal(result.counts.excluded, 1);
});
test("an empty denominator is unknown and manual checks require evidence", () => {
  assert.equal(assessCatalog({ features: [] }, []).verifiedPercent, null);
  assert.equal(assessCheck({ ...check, evidence: [] }, [record("chromium"), record("webkit")], "existing").status, "unknown");
});
test("the browser report does not hide a retry behind its final passing attempt", () => {
  const records = browserRecords({ suites: [{ specs: [{ title: "Task", tests: [{ projectName: "webkit", status: "flaky", expectedStatus: "passed", results: [{ status: "failed" }, { status: "passed" }] }] }] }] });
  assert.equal(records[0].status, "flaky");
});
