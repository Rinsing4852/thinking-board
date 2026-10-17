import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { assessCatalog, unitRecords, browserRecords, auditedSourcePath } from "./feature-audit-model.mjs";

const root = path.resolve("docs/chessbook-audit");
const current = path.join(root, "reports/current");
fs.mkdirSync(current, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8"));
const read = filename => fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, "utf8")) : null;
function fingerprint() {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).trim().split("\n")
    .filter(auditedSourcePath).sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) if (fs.existsSync(file)) hash.update(file).update(fs.readFileSync(file));
  return hash.digest("hex");
}
let verification = read(path.join(current, "run.json"));
if (process.argv.includes("--verify")) {
  const before = fingerprint();
  const steps = [];
  function run(name, command, args, outputFile) {
    console.log(`Checking ${name}…`);
    const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
    if (outputFile) fs.writeFileSync(outputFile, result.stdout ?? "");
    else if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    steps.push({ name, passed: result.status === 0, exitCode: result.status, error: result.error?.message ?? null });
    return result.status === 0;
  }
  run("typecheck", "npm", ["run", "typecheck"]);
  run("unit and integration tests", "npx", ["vitest", "run", "--reporter=json", `--outputFile=${path.join(current, "unit.json")}`]);
  run("tracker assessment tests", "node", ["--test", "scripts/feature-audit-model.test.mjs"]);
  if (run("production build", "npm", ["run", "build"])) {
    run("full browser suite", "npx", ["playwright", "test", "--reporter=json"], path.join(current, "browser.json"));
  } else {
    fs.rmSync(path.join(current, "browser.json"), { force: true });
    steps.push({ name: "full browser suite", passed: false, exitCode: null, error: "Skipped because the production build failed" });
  }
  const after = fingerprint();
  verification = { measuredAt: new Date().toISOString(), sourceFingerprint: after,
    sourceUnchangedDuringRun: before === after, steps,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
  fs.writeFileSync(path.join(current, "run.json"), JSON.stringify(verification, null, 2) + "\n");
}

function safeReport(file, normalise) {
  try { const report = read(file); return report ? normalise(report) : []; }
  catch { return []; }
}
const baselineEvidencePath = path.join(root, "reports/baseline/evidence.json");
let baselineEvidence = read(baselineEvidencePath);
const rawBaseline = safeReport(path.join(root, "reports/baseline/unit.json"), unitRecords);
if (!baselineEvidence && rawBaseline.length) {
  baselineEvidence = { commit: catalog.baselineCommit, measuredAt: catalog.auditDate, records: rawBaseline };
  fs.writeFileSync(baselineEvidencePath, JSON.stringify(baselineEvidence, null, 2) + "\n");
}
const baselineRecords = baselineEvidence?.records ?? [];
const currentUnit = safeReport(path.join(current, "unit.json"), unitRecords);
const currentBrowser = safeReport(path.join(current, "browser.json"), browserRecords);
const stale = !verification || verification.sourceFingerprint !== fingerprint() || !verification.sourceUnchangedDuringRun;
// Stale results remain evidence history, but cannot earn present-day credit.
const validRecords = stale ? [] : currentUnit.concat(currentBrowser);
const baseline = assessCatalog(catalog, baselineRecords, "baseline");
const result = assessCatalog(catalog, validRecords);
const unitOnly = assessCatalog(catalog, stale ? [] : currentUnit);
const validationFailed = !verification || verification.steps.some(step => !step.passed) || stale;
const report = { auditDate: catalog.auditDate, generatedAt: new Date().toISOString(), stale,
  verification, baselineUnitOnly: { available: baselineRecords.length > 0, counts: baseline.counts, verifiedPercent: baselineRecords.length ? baseline.verifiedPercent : null },
  currentUnitOnly: { counts: unitOnly.counts, verifiedPercent: unitOnly.verifiedPercent },
  counts: result.counts, verifiedPercent: result.verifiedPercent,
  weightedPoints: { earned: result.earned, possible: result.possible },
  measurement: "Verified requirements, not an overall product-quality score or a Chessbook parity percentage.",
  tests: { unit: currentUnit.length, browser: currentBrowser.length,
    failed: currentUnit.concat(currentBrowser).filter(test => test.status === "failed"),
    flaky: currentBrowser.filter(test => test.status === "flaky"),
    skipped: currentUnit.concat(currentBrowser).filter(test => test.status === "skipped") },
  features: result.features };
fs.writeFileSync(path.join(root, "quality-report.json"), JSON.stringify(report, null, 2) + "\n");

const source = id => catalog.sources.find(value => value.id === id);
const link = id => { const entry = source(id); return entry.url ? `[${entry.title}](${entry.url})` : entry.title; };
const stateCounts = {};
for (const feature of result.features) stateCounts[feature.state] = (stateCounts[feature.state] ?? 0) + 1;
const changed = result.features.filter(feature => feature.currentState !== feature.baselineState);
const details = result.features.map(feature => `## ${feature.id} — ${feature.name}

**${feature.category} · ${feature.priority} · ${feature.state}**

Chessbook evidence: ${feature.chessbookObservation} ${feature.sourceIds.map(link).join("; ")}

Our feature description: ${feature.desiredBehavior}

Acceptance criteria:

${feature.checks.map(check => `- **${check.status}** — ${check.requirement}${check.evidence.length ? ` Evidence: ${[...new Set(check.evidence.map(item => `${item.kind}${item.project ? `/${item.project}` : ""}: ${item.title}`))].join("; ")}.` : ""}`).join("\n")}

Implementation: ${feature.implementationPaths.length ? feature.implementationPaths.map(file => `\`${file}\``).join(", ") : "No implementation identified."}

Repeatable comparison task: ${feature.benchmark.task} Competitor timing and our user-task timing remain unmeasured.
`).join("\n");
const md = `# Chessbook feature audit and quality tracker

Audit date: ${catalog.auditDate}. Baseline: \`${catalog.baselineCommit.slice(0, 7)}\`. Evidence status: **${stale ? "STALE — rerun verification" : validationFailed ? "FAILURES — inspect verification" : "CURRENT"}**.

${catalog.scope}

This is an independent behavioural specification. Chessbook source code, assets, trained models and private databases were not accessed. Public UI observations and documentation are not proof of hidden implementation or measured learning outcomes.

## Behaviour and quality review

The [17 October behaviour reconstruction](./RECONSTRUCTION.md) records fresh
build/practice/model-game observations, independent algorithm specifications,
nine task-quality gates and delivery priorities. Its user-task measurements
remain separate from the verified requirement counts below.

## What the tracker measures

- **${catalog.features.length} feature descriptions**, each with three acceptance criteria and a repeatable comparison task.
- Current inventory: ${Object.entries(stateCounts).map(([state, count]) => `${count} ${state}`).join(", ")}.
- Acceptance checks: ${Object.entries(result.counts).map(([status, count]) => `${count} ${status}`).join(", ")}.
- Priority-weighted verified requirement coverage: **${result.verifiedPercent ?? "unknown"}%** (${result.earned}/${result.possible} points). This is a conservative evidence measure, not “${result.verifiedPercent}% as good as Chessbook”. Untested manual criteria remain unknown; missing features remain unmet.
- Like-for-like unit-evidence baseline: ${baseline.verifiedPercent}% → ${unitOnly.verifiedPercent}%. Browser checks were measured only for the current revision, so their improvement is not attributed to product changes.
- Current validation records: ${currentUnit.length} unit/integration tests and ${currentBrowser.length} browser journeys; ${report.tests.failed.length} failures, ${report.tests.flaky.length} flaky results, ${report.tests.skipped.length} skipped.

## Implemented from this audit

${changed.map(feature => `- ${feature.id} ${feature.name}: ${feature.baselineState} → ${feature.currentState}.`).join("\n")}

Daily effort counts scheduled encounters once, excludes lapse repeats, and shows independent recall separately. Local calendar days use a validated player time zone. A streak records consecutive days with completed practice, not consecutive days meeting the goal. The compact display shows seven days; the activity endpoint retains a 28-day view. Recommended sessions use up to ten remaining goal positions; deliberate line practice remains available after the goal is reached.

## Measurement protocol

For each comparison task, use the same legal fixture, side, rating context, depth and data availability in both tools. Record completion, action count, user-task time, errors, recovery, mobile/keyboard access and data provenance. Run five repetitions after one warm-up and report median plus worst time. Benchmark warm-cache optional API requests separately. Test unaided recall with delayed retests; a green test suite is not evidence of better learning.

The audit has **no measured Chessbook latency or human-usability scores**. Those fields intentionally remain null. We also have no valid substitute for its trained learnability model or its 1–99 score calibration. Our target is independently specified useful behaviour rather than fabricated numerical parity.

To update: edit \`catalog.json\`, map exact tests to individual criteria, and run \`npm run audit:features:verify\`. To regenerate the report without rerunning tests, use \`npm run audit:features\`. Source fingerprints invalidate present-day credit if code, migrations, test definitions or the catalogue change. Tests which pass after retry are marked flaky rather than clean passes. The JSON report contains the exact test evidence.

## Largest remaining gaps

${result.features.filter(feature => feature.state === "absent" && feature.priority !== "P2").map(feature => `- ${feature.id} ${feature.name} (${feature.priority}).`).join("\n")}

Recommended next batches: master-game statistics and model-game study; then safe single-gap draft generation; then transparent repertoire quality reports. Speed filtering and Chess.com archive imports are separate bounded integrations. Cross-repertoire shared recall requires careful identity and alternative-move handling.

## Limits and access boundaries

Guest menus, board browsing, first-exposure practice, model-game entry and settings were inspected. Connected-account game review, account sync, native-app runtime, paid purchase, destructive controls and live autofill were not exercised. Automatic approval review rejected opening the autofill control because it could modify many repertoire moves; official documentation supplies its description, and execution remains unverified. Daily activity history is an independent extension, not a claimed Chessbook feature. Billing is documented but excluded from the personal self-hosted target.

## Feature specifications

${details}
## Sources

${catalog.sources.map(entry => `- **${entry.id}** ${entry.url ? `[${entry.title}](${entry.url})` : entry.title}; ${entry.method}; checked ${entry.observedAt}. Limit: ${entry.limits}`).join("\n")}
`;
// Keep counts and weighted points distinct in presentation.
fs.writeFileSync(path.join(root, "AUDIT.md"), md);

const embedded = JSON.stringify({ report, sources: catalog.sources }).replaceAll("<", "\\u003c");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening feature quality tracker</title>
<style>body{margin:0;background:#101712;color:#e7efe8;font:16px/1.5 system-ui}main{max-width:1200px;margin:auto;padding:32px 20px}h1{font-size:32px;margin:0}p{max-width:900px;color:#becbc0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}.card,article{background:#1b261e;border:1px solid #374b3c;border-radius:12px;padding:18px}.card strong{display:block;color:#d0ef8b;font-size:30px}label{display:inline-grid;gap:5px;margin:0 12px 15px 0}input,select{font:inherit;background:#1b261e;border:1px solid #647368;border-radius:6px;padding:10px;color:inherit;max-width:100%}article{margin:12px 0}summary{cursor:pointer;font-weight:650;min-height:44px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}.pill{font-size:13px;color:#bdcebd;border:1px solid #526254;border-radius:20px;padding:2px 9px}.passed{color:#c9ef86}.unknown,.flaky{color:#ffd39c}.failed,.unmet{color:#ffad9b}a{color:#c9ef86}li{margin:10px 0}code{overflow-wrap:anywhere}.banner{background:#624133;padding:16px;border-radius:10px}.small{font-size:14px;color:#bfccbf}button{cursor:pointer;font:inherit;padding:10px 16px;border:0;border-radius:6px;background:#c9ef86;color:#102010}*:focus-visible{outline:3px solid #e8bf72;outline-offset:3px}</style>
<main><h1>Opening feature quality tracker</h1><p>Chessbook audit · ${catalog.auditDate} · Independent specifications and test evidence. Observed capability and proven quality are separate.</p><p><a href="RECONSTRUCTION.md">Behaviour reconstruction, nine task-quality gates and next improvements</a></p><div id="warning"></div><div class="cards" id="totals"></div><p id="summary"></p><p class="small">Weighted requirement coverage rewards verified acceptance checks (P0=5, P1=3, P2=1). Unknown checks and missing features earn no credit. This is not a percentage comparison of product quality with Chessbook. Competitor task timing and user-study ratings are unmeasured.</p>
<label>Find a feature<input id="search" type="search" placeholder="Model games, daily goal…"></label><label>Category<select id="category"><option value="">All categories</option></select></label><label>Implementation<select id="state"><option value="">All states</option></select></label><label>Priority<select id="priority"><option value="">All priorities</option><option>P0</option><option>P1</option><option>P2</option></select></label><button id="download">Download evidence JSON</button><p id="count" aria-live="polite"></p><div id="features"></div><p class="small">Edit the feature catalogue in the repository and rerun npm run audit:features:verify to update this snapshot. Code changes invalidate old current-result credit. This page contains no private game data.</p></main>
<script type="application/json" id="data">${embedded}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),r=data.report;const $=id=>document.getElementById(id);function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e}
if(r.stale||r.verification?.steps?.some(s=>!s.passed))$('warning').append(text('p',r.stale?'Evidence is stale. Rerun verification before relying on these results.':'Validation failed. Inspect failed checks before marking features complete.','banner'));
for(const [label,value] of [['Features',r.features.length],['Verified checks',r.counts.passed],['Unknown checks',r.counts.unknown],['Missing checks',r.counts.unmet],['Weighted coverage',r.verifiedPercent+'%']]){const e=text('div',label,'card');e.append(text('strong',value));$('totals').append(e)}
$('summary').textContent=r.tests.unit+' unit/integration tests · '+r.tests.browser+' browser journeys · '+r.tests.failed.length+' failures · '+r.tests.flaky.length+' flaky results. New daily goals, streaks and activity history are tested separately from unaided recall.';
for(const key of ['category','state'])for(const value of [...new Set(r.features.map(f=>f[key]))].sort()){const o=text('option',value);o.value=value;$(key).append(o)}
function render(){const q=$('search').value.toLowerCase();const selected=r.features.filter(f=>(!q||(f.id+' '+f.name+' '+f.desiredBehavior).toLowerCase().includes(q))&&(!$('category').value||f.category===$('category').value)&&(!$('state').value||f.state===$('state').value)&&(!$('priority').value||f.priority===$('priority').value));$('count').textContent=selected.length+' of '+r.features.length+' features';$('features').replaceChildren();for(const f of selected){const a=document.createElement('article'),d=document.createElement('details'),s=text('summary',f.id+' · '+f.name);s.append(text('span',f.priority+' · '+f.state,'pill'),text('span',f.checks.filter(c=>c.status==='passed').length+'/3 verified','pill'));d.append(s,text('p','Chessbook: '+f.chessbookObservation),text('p','Our target: '+f.desiredBehavior));const list=document.createElement('ul');for(const c of f.checks){const li=text('li',c.status.toUpperCase()+' — '+c.requirement,c.status);if(c.evidence.length)li.append(text('div',c.evidence.map(e=>e.kind+(e.project?'/'+e.project:'')+': '+e.title+' ['+e.status+']').join(' · '),'small'));list.append(li)}d.append(list,text('p','Comparison task: '+f.benchmark.task),text('p','Human task timing and competitor quality score: unmeasured.','small'));for(const id of f.sourceIds){const source=data.sources.find(s=>s.id===id);if(source.url){const link=text('a',source.title);link.href=source.url;link.target='_blank';link.rel='noreferrer';d.append(link,text('p',source.limits,'small'))}}a.append(d);$('features').append(a)}}
for(const id of ['search','category','state','priority'])$(id).addEventListener('input',render);$('download').addEventListener('click',()=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));a.href=url;a.download='opening-feature-quality.json';a.click();URL.revokeObjectURL(url)});render();
</script></html>`;
fs.writeFileSync(path.join(root, "tracker.html"), html);
console.log(`Feature audit: ${result.counts.passed} verified, ${result.counts.failed} failed, ${result.counts.unknown} unknown, ${result.counts.unmet} unmet. ${stale ? "STALE evidence." : validationFailed ? "VALIDATION FAILED — inspect the full test results." : "Current evidence."}`);
if (process.argv.includes("--verify") && validationFailed) process.exitCode = 1;
