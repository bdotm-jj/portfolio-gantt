#!/usr/bin/env node
/*
  rm-extract.js  —  READ-ONLY full pull of the Resource Management resource layer.
  ---------------------------------------------------------------------------------
  Builds rm-data.js: for each real RM project, the phases and who's assigned to each
  (person + task description + date range), joined to our JJ project codes.

  READ-ONLY: only GET calls. Never writes to RM.

  Secrets (already set): RM_TOKEN, SMARTSHEET_TOKEN.

  RM nesting: Project -> Phase -> Assignment. An assignment's `assignable_id`
  points at the PHASE id (not the project), so we walk project -> phases -> assignments.

  Join strategy (name -> JJ code), in order:
    1. exact name match to a Portfolio Summary / Intake project name
    2. normalized match (lowercase, strip &nbsp;, parentheses, punctuation)
    3. FALLBACK_MAP explicit entries below
    4. otherwise: reported as unmatched (surfaced, never silently dropped)

  Projects whose name is in IGNORE_NAMES (RM scaffolding) are skipped entirely.
*/

const RM_TOKEN = process.env.RM_TOKEN;
const SS_TOKEN = process.env.SMARTSHEET_TOKEN;
if (!RM_TOKEN) { console.error("Missing RM_TOKEN"); process.exit(1); }
if (!SS_TOKEN) { console.error("Missing SMARTSHEET_TOKEN"); process.exit(1); }

const RM = "https://api.rm.smartsheet.com/api/v1";
const SS = "https://api.smartsheet.com/2.0";
const PORTFOLIO = "8767740555775876";
const INTAKE = "4414567862980484";

// RM utility/scaffolding projects that aren't real portfolio work — skipped.
const IGNORE_NAMES = new Set([
  "Tasks", "Jira", "Maintenance Sprint Tracker", "Project Plan",
  "RM Time Off Requests", "API Service",
]);

// Explicit name -> JJ code for the handful that won't auto-match.
// Fill/adjust these from the "UNMATCHED" list this script prints.
const FALLBACK_MAP = {
  "Project Plan - Markel Capacity Program": "JJ-1101",
  "Project Plan - Munich RE - Commercial": "JJ-1172",
  "Project Plan - CertifID": "JJ-1168",
  "HVH GLISE Contract": "JJ-1146", // HVH GLISE Contract Phase 1
};

async function rmGet(path) {
  const res = await fetch(`${RM}${path}`, {
    headers: { "Content-Type": "application/json", auth: RM_TOKEN },
  });
  if (!res.ok) throw new Error(`RM ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function rmAll(path) {
  // paginate ?page/per_page style; RM returns { data, paging } — fall back gracefully
  let page = 1, out = [];
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const j = await rmGet(`${path}${sep}page=${page}&per_page=200`);
    const rows = j.data || j;
    if (!Array.isArray(rows) || rows.length === 0) break;
    out = out.concat(rows);
    if (rows.length < 200) break;
    page++;
    if (page > 20) break; // safety
  }
  return out;
}
async function ssSheet(id) {
  const res = await fetch(`${SS}/sheets/${id}`, { headers: { Authorization: `Bearer ${SS_TOKEN}` } });
  if (!res.ok) throw new Error(`Smartsheet ${id} -> ${res.status} ${await res.text()}`);
  return res.json();
}

function norm(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")        // the GLISE bug: stray non-breaking space entity
    .replace(/\u00a0/g, " ")         // literal non-breaking space
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")        // drop "(AZ, KY, ...)"
    .replace(/[\u2013\u2014-]/g, " ") // dashes -> space
    .replace(/[^a-z0-9 ]/g, " ")     // other punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

function cellReader(sheet) {
  const t2id = {};
  sheet.columns.forEach((c) => (t2id[c.title] = c.id));
  return (row, title) => {
    const c = row.cells.find((x) => x.columnId === t2id[title]);
    if (!c) return null;
    const v = c.displayValue != null ? c.displayValue : c.value;
    return v == null || v === "" ? null : v;
  };
}

(async () => {
  const report = [];
  const log = (s) => { report.push(s); console.log(s); };

  // --- name -> code index from both sheets ---
  const [portfolio, intake] = await Promise.all([ssSheet(PORTFOLIO), ssSheet(INTAKE)]);
  const pRead = cellReader(portfolio), iRead = cellReader(intake);
  const byExact = {}, byNorm = {};
  const addNameCode = (name, code) => {
    if (!name || !code) return;
    byExact[name] = code;
    byNorm[norm(name)] = code;
  };
  portfolio.rows.forEach((r) => addNameCode(pRead(r, "Project Name"), pRead(r, "Project Code") && String(pRead(r, "Project Code"))));
  intake.rows.forEach((r) => addNameCode(iRead(r, "Project Name"), iRead(r, "Project Code") && String(iRead(r, "Project Code"))));

  function resolveCode(rmName) {
    if (byExact[rmName] != null) return byExact[rmName];
    if (byNorm[norm(rmName)] != null) return byNorm[norm(rmName)];
    if (FALLBACK_MAP[rmName] != null) return FALLBACK_MAP[rmName];
    // also try fallback keys through the normalizer, so "Project Plan - X" tolerates spacing
    for (const k of Object.keys(FALLBACK_MAP)) if (norm(k) === norm(rmName)) return FALLBACK_MAP[k];
    return null;
  }

  // --- pull RM projects, then phases + assignments for each real one ---
  const projects = await rmAll("/projects");
  const users = await rmAll("/users");
  const userName = {};
  users.forEach((u) => (userName[u.id] = u.display_name || u.name || u.email || String(u.id)));

  log(`RM projects: ${projects.length}, users: ${users.length}`);

  const out = [];        // resolved resource records
  const unmatched = [];  // real projects we couldn't map

  for (const p of projects) {
    if (IGNORE_NAMES.has(p.name)) continue;
    if (p.archived) continue;
    const code = resolveCode(p.name);
    if (!code) { unmatched.push(p.name); continue; }

    // phases carry their own date ranges; assignments hang off phases (assignable_id = phase id)
    let phases = [];
    try { phases = await rmAll(`/projects/${p.id}/phases`); } catch (e) { /* some projects have none */ }
    let assigns = [];
    try { assigns = await rmAll(`/projects/${p.id}/assignments`); } catch (e) { /* none */ }

    const phaseById = {};
    phases.forEach((ph) => (phaseById[ph.id] = ph));

    const tasks = assigns.map((a) => {
      const ph = phaseById[a.assignable_id];
      return {
        person: userName[a.user_id] || String(a.user_id),
        task: a.description || (ph && ph.phase_name) || "",
        phase: ph ? (ph.phase_name || ph.name) : null,
        starts_at: a.starts_at || (ph && ph.starts_at) || null,
        ends_at: a.ends_at || (ph && ph.ends_at) || null,
      };
    });

    out.push({
      code,
      rmName: p.name,
      rmStart: p.starts_at || null,
      rmEnd: p.ends_at || null,
      people: Array.from(new Set(tasks.map((t) => t.person))).filter(Boolean),
      tasks,
    });
  }

  log(`resolved: ${out.length} projects, unmatched: ${unmatched.length}`);
  if (unmatched.length) {
    log("UNMATCHED (add to FALLBACK_MAP or IGNORE_NAMES):");
    unmatched.forEach((n) => log(`  "${n}"`));
  }

  const fs = require("fs");
  const payload = { generatedAt: new Date().toISOString(), projects: out, unmatched };
  fs.writeFileSync(
    __dirname + "/rm-data.js",
    "// rm-data.js — READ-ONLY resource layer from Resource Management. Regenerated by rm-extract.js.\n" +
    "// Shape: projects[] = { code, rmName, rmStart, rmEnd, people[], tasks[]{person,task,phase,starts_at,ends_at} }\n" +
    "window.RM_DATA = " + JSON.stringify(payload, null, 2) + ";\n"
  );
  log("Wrote rm-data.js");
})().catch((e) => { console.error(e); process.exit(1); });
