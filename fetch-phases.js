#!/usr/bin/env node
/*
  fetch-phases.js — generates phase-data.js for the Project Phases tab.
  ---------------------------------------------------------------------
  For every project that has a frozen baseline sheet, this reads:
    - PLANNED phase dates  <- the "Planned <project> Do Not Touch" baseline sheet
    - ACTUAL phase dates    <- the live "Project Plan - <project>" sheet (parent phase rows)
  and writes them paired into phase-data.js, joined by living in the same folder.

  Reads live on each run, so a CORRECTION to a baseline sheet (e.g. fixing a
  hypercare that was entered as 1 day instead of 2 weeks) flows through on the
  next run. The baseline is the source of truth; keep it locked so only
  intentional corrections change it.

  Requires: SMARTSHEET_TOKEN (repo secret).
*/

const SS_TOKEN = process.env.SMARTSHEET_TOKEN;
if (!SS_TOKEN) { console.error("Missing SMARTSHEET_TOKEN"); process.exit(1); }
const SS = "https://api.smartsheet.com/2.0";

// Canonical lifecycle phases we surface (parent phase rows). Order matters for display.
const CANON_PHASES = [
  "Planning & Discovery",
  "Requirements & Design",
  "Development",
  "Alpha Testing (Dev Testing)",
  "Acceptance Testing (UAT/Pre-Prod)",
  "Release",
  "Stabilization (Hypercare)",
  "Retrospective and Closeout",
];

async function ssGet(path) {
  const res = await fetch(`${SS}${path}`, { headers: { Authorization: `Bearer ${SS_TOKEN}` } });
  if (!res.ok) throw new Error(`Smartsheet ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// ---- search for all baseline sheets: name starts "Planned", ends "Do Not Touch" ----
async function findBaselineSheets() {
  const j = await ssGet(`/search?query=${encodeURIComponent("Planned Do Not Touch")}`);
  const results = (j.results || []).filter(
    (r) => r.objectType === "sheet" &&
      /^Planned .*Do Not Touch$/i.test(r.text || "")
  );
  // de-dupe by objectId
  const seen = {}; const out = [];
  results.forEach((r) => { if (!seen[r.objectId]) { seen[r.objectId] = 1; out.push({ id: r.objectId, name: r.text }); } });
  return out;
}

// ---- given a sheet id, find its containing folder, then the Project Plan sheet there ----
async function findPlanForBaseline(baselineId) {
  // walk up: get the sheet to find its parent folder, then list folder contents
  // Smartsheet: GET /sheets/{id} includes no parent; use /search for the plan by shared project name instead.
  // Baseline name: "Planned <PROJECT> Do Not Touch" -> extract <PROJECT>.
  return null; // (resolved by name below in main)
}

function ymd(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

function projectNameFromBaseline(name) {
  // "Planned Scottsdale Phase 3&4 Do Not Touch" -> "Scottsdale Phase 3&4"
  return String(name).replace(/^Planned\s+/i, "").replace(/\s+Do Not Touch$/i, "").trim();
}

// read planned phases from a baseline sheet (cols: Phase, Planned Start, Planned End, Planned Duration)
function readPlanned(sheet) {
  const col = {}; sheet.columns.forEach((c) => (col[c.title] = c.id));
  const cPhase = col["Phase"], cStart = col["Planned Start"], cEnd = col["Planned End"];
  const out = {};
  (sheet.rows || []).forEach((r) => {
    const g = (id) => { const c = r.cells.find((x) => x.columnId === id); return c ? (c.value != null ? c.value : c.displayValue) : null; };
    const phase = g(cPhase); if (!phase) return;
    out[phase] = { plannedStart: ymd(g(cStart)), plannedEnd: ymd(g(cEnd)) };
  });
  return out;
}

// read actual phase dates + code/pod/lob from a Project Plan sheet (parent phase rows)
function readActual(sheet) {
  const col = {}; sheet.columns.forEach((c) => (col[c.title] = c.id));
  const cTask = col["Task"], cStart = col["Start Date"], cEnd = col["End Date"],
        cPhase = col["Phase"], cCode = null, cPod = col["POD"], cLob = col["Line of Business"],
        cName = col["Project Name"];
  const g = (r, id) => { if (id == null) return null; const c = r.cells.find((x) => x.columnId === id); return c ? (c.displayValue != null ? c.displayValue : c.value) : null; };

  let code = null, pod = null, lob = null, projName = null;
  const actual = {};
  (sheet.rows || []).forEach((r) => {
    const task = g(r, cTask), phase = g(r, cPhase);
    pod = pod || g(r, cPod); lob = lob || g(r, cLob); projName = projName || g(r, cName);
    // Project Code lives in the Project Information block: a row whose Task == "Project Code"
    if (task === "Project Code") { const v = g(r, col["Notes"]) || g(r, col["Line of Business"]); if (v) code = String(v); }
    // parent phase row: Task equals the Phase name and it's one of our canonical phases
    if (task && phase && task === phase && CANON_PHASES.indexOf(task) >= 0) {
      const s = g(r, cStart), e = g(r, cEnd);
      if (s || e) actual[task] = { actualStart: ymd(s), actualEnd: ymd(e) };
    }
  });
  return { code, pod, lob, projName, actual };
}

(async () => {
  const baselines = await findBaselineSheets();
  console.log(`Found ${baselines.length} baseline sheet(s).`);

  // to pair a baseline with its plan, search for "Project Plan - <projectName>"
  const projects = [];
  for (const b of baselines) {
    const projName = projectNameFromBaseline(b.name);
    let planHit = null;
    try {
      const s = await ssGet(`/search?query=${encodeURIComponent("Project Plan " + projName)}`);
      planHit = (s.results || []).find((r) => r.objectType === "sheet" && /^Project Plan\b/i.test(r.text || ""));
    } catch (e) { /* ignore */ }
    if (!planHit) { console.log(`  ! No Project Plan found for "${projName}" — skipping`); continue; }

    const [baseSheet, planSheet] = await Promise.all([ ssGet(`/sheets/${b.id}`), ssGet(`/sheets/${planHit.objectId}`) ]);
    const planned = readPlanned(baseSheet);
    const { code, pod, lob, projName: pn, actual } = readActual(planSheet);

    const phases = CANON_PHASES
      .filter((ph) => planned[ph] || actual[ph])
      .map((ph) => ({
        phase: ph,
        plannedStart: (planned[ph] || {}).plannedStart || null,
        plannedEnd:   (planned[ph] || {}).plannedEnd   || null,
        actualStart:  (actual[ph]  || {}).actualStart  || null,
        actualEnd:    (actual[ph]  || {}).actualEnd     || null,
      }));

    projects.push({ code: code || null, name: pn || projName, pod: pod || "Other", lob: lob || "Other", phases });
    console.log(`  \u2713 ${pn || projName} (${code || "no code"}) — ${phases.length} phases`);
  }

  const fs = require("fs");
  const payload = { generatedAt: new Date().toISOString().slice(0, 10), projects };
  fs.writeFileSync(
    __dirname + "/phase-data.js",
    "// phase-data.js — per-project PHASE breakdown: planned baseline vs actual.\n" +
    "// Generated by fetch-phases.js. Planned <- baseline sheet, Actual <- Project Plan.\n" +
    "window.PHASE_DATA = " + JSON.stringify(payload, null, 2) + ";\n"
  );
  console.log(`Wrote phase-data.js with ${projects.length} project(s).`);
})().catch((e) => { console.error(e); process.exit(1); });
