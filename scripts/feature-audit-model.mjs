/** Only product, validation and release inputs invalidate acceptance evidence. */
export function auditedSourcePath(file) {
  return /^(?:apps\/|packages\/|migrations\/|tests\/|scripts\/|\.github\/workflows\/|(?:package(?:-lock)?\.json|(?:playwright|vitest)\.config\.[cm]?[jt]s|tsconfig(?:\.[^/]+)?\.json|Dockerfile|\.dockerignore)$|docs\/chessbook-audit\/catalog\.json$)/.test(file);
}

/** Evidence assessment: a code file or marketing claim cannot pass a behaviour check. */
export function assessCheck(check, records, implementationState) {
  if (implementationState === "not_targeted") return { status: "excluded", evidence: [] };
  if (implementationState === "absent") return { status: "unmet", evidence: [] };
  if (!check.evidence.length) return { status: "unknown", evidence: [] };
  const matched = [];
  for (const proof of check.evidence) {
    const matches = records.filter(record => record.kind === proof.kind && record.title === proof.title);
    if (proof.projects && !proof.projects.every(project => matches.some(record => record.project === project))) {
      return { status: "unknown", evidence: matched.concat(matches) };
    }
    if (!matches.length) return { status: "unknown", evidence: matched };
    matched.push(...matches);
  }
  const status = matched.some(record => record.status === "failed") ? "failed"
    : matched.some(record => record.status === "flaky") ? "flaky"
    : matched.every(record => record.status === "passed") ? "passed" : "unknown";
  return { status, evidence: matched };
}

export function assessCatalog(catalog, records, phase = "current") {
  const weights = { P0: 5, P1: 3, P2: 1 };
  let possible = 0;
  let earned = 0;
  const counts = { passed: 0, failed: 0, flaky: 0, unknown: 0, unmet: 0, excluded: 0 };
  const features = catalog.features.map(feature => {
    const state = phase === "baseline" ? feature.baselineState : feature.currentState;
    const checks = feature.acceptanceChecks.map(check => {
      const result = assessCheck(check, records, state);
      counts[result.status] += 1;
      if (result.status !== "excluded") {
        possible += weights[feature.priority];
        if (result.status === "passed") earned += weights[feature.priority];
      }
      return { ...check, ...result };
    });
    return { ...feature, state, checks };
  });
  return { features, counts, earned, possible, verifiedPercent: possible ? Math.round(1000 * earned / possible) / 10 : null };
}

export function unitRecords(report) {
  return report.testResults.flatMap(suite => suite.assertionResults.map(test => ({
    kind: "unit", title: test.title, file: suite.name.replaceAll("\\", "/").replace(/^.*\/(apps|packages)\//, "$1/"),
    status: test.status === "passed" ? "passed" : test.status === "failed" ? "failed" : "skipped",
    durationMs: test.duration ?? null,
  })));
}

export function browserRecords(report) {
  const records = [];
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
        const final = test.results?.at(-1)?.status;
        const status = test.status === "flaky" ? "flaky" : test.status === "unexpected" ? "failed"
          : final === "passed" && test.expectedStatus === "passed" ? "passed" : "skipped";
        records.push({ kind: "browser", title: spec.title, file: spec.file, project: test.projectName,
          status, durationMs: test.results?.at(-1)?.duration ?? null });
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  return records;
}
