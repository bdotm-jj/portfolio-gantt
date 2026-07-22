#!/usr/bin/env node
/*
  rm-probe.js  —  READ-ONLY exploration of the Resource Management API.
  ---------------------------------------------------------------------
  Purpose: see the real shape of RM data and measure the name-matching gap
  against our Smartsheet projects BEFORE building anything on top of it.

  This script ONLY makes GET requests. It never writes to RM, never creates
  or modifies anything. It writes one local file, rm-sample.js, for us to read.

  Requires two repo secrets (already set):
      RM_TOKEN          Resource Management API service token
      SMARTSHEET_TOKEN  main Smartsheet token (to compare names against our sheets)

  RM API: base https://api.rm.smartsheet.com/api/v1/ , auth via "auth" header.
  Main API: https://api.smartsheet.com/2.0/ , auth via Bearer.
*/

const RM_TOKEN = process.env.RM_TOKEN;
const SS_TOKEN = process.env.SMARTSHEET_TOKEN;
if (!RM_TOKEN) { console.error("Missing RM_TOKEN"); process.exit(1); }
if (!SS_TOKEN) { console.error("Missing SMARTSHEET_TOKEN"); process.exit(1); }

const RM = "https://api.rm.smartsheet.com/api/v1";
const SS = "https://api.smartsheet.com/2.0";
const PORTFOLIO = "8767740555775876";

const SAMPLE_PROJECTS = 8;   // how many RM projects to pull in detail
const KEEP_KEYS = 40;        // cap on how many field names we list, for readability

async function rmGet(path) {
  const res = await fetch(`${RM}${path}`, {
    headers: { "Content-Type": "application/json", auth: RM_TOKEN },
  });
  if (!res.ok) throw new Error(`RM ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function ssSheet(id) {
  const res = await fetch(`${SS}/sheets/${id}`, { headers: { Authorization: `Bearer ${SS_TOKEN}` } });
  if (!res.ok) throw new Error(`Smartsheet ${id} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// normalize a project name for fuzzy comparison: lowercase, strip parenthetical
// state lists, punctuation, and collapse whitespace.
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")      // drop "(AZ, KY, ...)" and similar
    .replace(/[\u2013\u2014-]/g, " ") // en/em dash and hyphen -> space
    .replace(/[^a-z0-9 ]/g, " ")   // drop other punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function fieldShape(obj, prefix = "") {
  // returns a flat list of "key: type/sample" lines, one level deep (+ arrays noted)
  const out = [];
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    let desc;
    if (v === null) desc = "null";
    else if (Array.isArray(v)) desc = `array[${v.length}]` + (v.length && typeof v[0] === "object" ? " of objects" : v.length ? ` e.g. ${JSON.stringify(v[0]).slice(0, 40)}` : "");
    else if (typeof v === "object") desc = "object";
    else desc = `${typeof v} = ${JSON.stringify(v).slice(0, 48)}`;
    out.push(`${prefix}${k}: ${desc}`);
  }
  return out.slice(0, KEEP_KEYS);
}

(async () => {
  const report = [];
  const log = (s) => { report.push(s); console.log(s); };

  log("=== RM PROBE (read-only) ===\n");

  // 1) Who am I / does auth work — list a few users
  let users = [];
  try {
    const u = await rmGet("/users?per_page=5");
    users = u.data || u;
    log(`AUTH OK. Sample users (${(users || []).length}):`);
    (users || []).slice(0, 5).forEach((x) => log(`  - ${x.display_name || x.name || x.email || x.id}`));
    log("");
  } catch (e) { log(`USERS call failed: ${e.message}\n`); }

  // 2) Projects — list, show count, show the field shape of one
  let projects = [];
  try {
    const p = await rmGet("/projects?per_page=200");
    projects = p.data || p;
    log(`PROJECTS returned: ${(projects || []).length}`);
    if (projects && projects.length) {
      log("\nField shape of one project object:");
      fieldShape(projects[0]).forEach((l) => log("  " + l));
    }
    log("");
  } catch (e) { log(`PROJECTS call failed: ${e.message}\n`); }

  // 3) Assignments / time for a few projects — show structure incl. durations
  log(`Sampling assignments + task durations for up to ${SAMPLE_PROJECTS} projects:\n`);
  for (const proj of (projects || []).slice(0, SAMPLE_PROJECTS)) {
    const pid = proj.id;
    log(`• PROJECT "${proj.name}" (id ${pid})`);
    // assignments
    try {
      const a = await rmGet(`/projects/${pid}/assignments?per_page=5`);
      const arr = a.data || a;
      log(`    assignments: ${(arr || []).length}`);
      if (arr && arr.length) fieldShape(arr[0], "      ").forEach((l) => log(l));
    } catch (e) { log(`    assignments failed: ${e.message}`); }
    // phases / tasks (endpoint name varies; try phases then tasks)
    for (const ep of ["phases", "tasks"]) {
      try {
        const t = await rmGet(`/projects/${pid}/${ep}?per_page=5`);
        const arr = t.data || t;
        if (arr && arr.length) {
          log(`    ${ep}: ${arr.length}`);
          fieldShape(arr[0], "      ").forEach((l) => log(l));
          break;
        }
      } catch (e) { /* endpoint may not exist; keep quiet */ }
    }
    log("");
  }

  // 4) NAME-MATCH GAP against Portfolio Summary
  log("=== NAME-MATCH GAP vs Portfolio Summary ===");
  try {
    const sheet = await ssSheet(PORTFOLIO);
    const titleIdx = {};
    sheet.columns.forEach((c) => (titleIdx[c.title] = c.id));
    const nameCol = titleIdx["Project Name"], codeCol = titleIdx["Project Code"];
    const sheetProjects = sheet.rows.map((r) => {
      const nc = r.cells.find((c) => c.columnId === nameCol);
      const cc = r.cells.find((c) => c.columnId === codeCol);
      return { name: (nc && (nc.displayValue || nc.value)) || "", code: (cc && (cc.displayValue || cc.value)) || "" };
    }).filter((x) => x.name);

    const byExact = {}; const byNorm = {};
    sheetProjects.forEach((s) => { byExact[s.name] = s.code; byNorm[norm(s.name)] = s.code; });

    let exact = 0, fuzzy = 0; const unmatched = [];
    (projects || []).forEach((p) => {
      if (byExact[p.name] != null) exact++;
      else if (byNorm[norm(p.name)] != null) fuzzy++;
      else unmatched.push(p.name);
    });

    log(`RM projects: ${(projects || []).length}`);
    log(`  exact name match to a sheet project:      ${exact}`);
    log(`  matched only after normalizing:           ${fuzzy}`);
    log(`  UNMATCHED (would need a fallback entry):   ${unmatched.length}`);
    if (unmatched.length) {
      log("\n  Unmatched RM names — these become the fallback map:");
      unmatched.slice(0, 60).forEach((n) => log(`    "${n}"`));
    }
  } catch (e) { log(`Name-gap comparison failed: ${e.message}`); }

  require("fs").writeFileSync(
    __dirname + "/rm-sample.js",
    "// RM probe output — read-only sample for inspection. Safe to delete.\n" +
    "window.RM_PROBE = " + JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2) + ";\n"
  );
  log("\nWrote rm-sample.js");
})().catch((e) => { console.error(e); process.exit(1); });
