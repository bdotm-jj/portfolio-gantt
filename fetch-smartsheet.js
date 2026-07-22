#!/usr/bin/env node
/*
  fetch-smartsheet.js
  -------------------
  Pulls the two source sheets from the Smartsheet API and regenerates data.js.
  Run by .github/workflows/refresh-data.yml on a schedule. Requires one env var:

      SMARTSHEET_TOKEN   (a Smartsheet API access token, stored as a repo secret)

  It never hardcodes the token and never writes it anywhere. Column values are
  resolved by column *title* at runtime, so it keeps working if column IDs change.

  Sheets:
    Portfolio Summary  8767740555775876  -> planned/actual dates, status, stage
    Projects Intake    4414567862980484  -> Manual Ordering (the priority list)
  Joined on project name.
*/

const TOKEN = process.env.SMARTSHEET_TOKEN;
if (!TOKEN) { console.error("Missing SMARTSHEET_TOKEN"); process.exit(1); }

const PORTFOLIO = "8767740555775876";
const INTAKE = "4414567862980484";
const API = "https://api.smartsheet.com/2.0";

const EXCLUDE_STAGE = new Set(["Done", "Backlog", "13 - Done"]);

async function getSheet(id) {
  const res = await fetch(`${API}/sheets/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Smartsheet ${id} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// Build { columnId -> title } and a row accessor keyed by title.
function indexer(sheet) {
  const idToTitle = {};
  sheet.columns.forEach((c) => (idToTitle[c.id] = c.title));
  return function cell(row, title) {
    const c = row.cells.find((x) => idToTitle[x.columnId] === title);
    if (!c) return null;
    // prefer displayValue (formatted) then value
    const v = c.displayValue != null ? c.displayValue : c.value;
    return v == null || v === "" ? null : v;
  };
}

// Smartsheet date cells come back as ISO-ish strings; normalize to YYYY-MM-DD or null.
function ymd(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

(async () => {
  const [portfolio, intake] = await Promise.all([getSheet(PORTFOLIO), getSheet(INTAKE)]);
  const pc = indexer(portfolio);
  const ic = indexer(intake);

  // --- Manual Ordering lookup from the intake sheet, keyed by PROJECT CODE ---
  // Project Code (the SYS_UNIQUEID) is stable across both sheets; names drift and collide,
  // so we match on code and only use the name for display. Note: do NOT use "Project ID" —
  // Motion projects carry an MO- prefixed Project ID while their Project Code stays JJ-.
  const orderByCode = {};
  const intakeRows = intake.rows.map((r) => ({
    code: ic(r, "Project Code") != null ? String(ic(r, "Project Code")) : null,
    name: ic(r, "Project Name"),
    lob: ic(r, "Department") || ic(r, "POD") || "Other",
    pod: ic(r, "POD") || "Other",
    order: numOrNull(ic(r, "Manual Ordering")),
    stage: ic(r, "Overall Project Stage") || "",
    status: ic(r, "Overall Project Status") || "",
  })).filter((r) => r.name);
  intakeRows.forEach((r) => { if (r.code && r.order != null) orderByCode[r.code] = r.order; });

  // --- Active projects (bars): Portfolio Summary joined to Manual Ordering by code ---
  const SNAPSHOT = portfolio.rows.map((r) => {
    const name = pc(r, "Project Name");
    const code = pc(r, "Project Code") != null ? String(pc(r, "Project Code")) : null;
    return [
      name,
      pc(r, "POD") || "Other",
      pc(r, "Line of Business") || pc(r, "POD") || "Other",
      pc(r, "Overall Project Status") || "",
      pc(r, "Overall Project Stage") || "",
      ymd(pc(r, "Planned Start Date")),
      // planned end may legitimately be a bad value (e.g. text) — keep raw so the app can flag it
      (function () { const raw = pc(r, "Planned End Date"); return ymd(raw) || (raw ? String(raw) : null); })(),
      ymd(pc(r, "Actual Start Date")),
      ymd(pc(r, "Actual End Date")),
      code && orderByCode[code] != null ? orderByCode[code] : null,
    ];
  }).filter((row) => row[0] && !EXCLUDE_STAGE.has(row[4]) && row[3] !== "Closed");

  // --- Forward queue (On Deck): intake items with order >= 1 ---
  const QUEUE = intakeRows
    .filter((r) => r.order != null && r.order >= 1 && r.stage !== "13 - Done" && r.status !== "Closed")
    .map((r) => [r.name, r.lob, r.order, stageLabel(r.stage, r.status)]);

  // --- Backlog: intake items whose stage is Backlog ---
  const BACKLOG = intakeRows
    .filter((r) => r.stage === "Backlog")
    .map((r) => [r.name, r.lob, r.order]);

  writeDataFile(SNAPSHOT, QUEUE, BACKLOG);
  console.log(`data.js written — ${SNAPSHOT.length} active, ${QUEUE.length} queued, ${BACKLOG.length} backlog`);
})().catch((e) => { console.error(e); process.exit(1); });

function stageLabel(stage, status) {
  const s = stage || "Queued";
  return status === "On Hold" ? `${s} · on hold` : s;
}

function writeDataFile(SNAPSHOT, QUEUE, BACKLOG) {
  const fs = require("fs");
  const j = (x) => JSON.stringify(x).replace(/],\[/g, "],\n  [");
  const out =
`// data.js — regenerated by the GitHub Action (.github/workflows/refresh-data.yml).
// Do not hand-edit; edit the source Smartsheet sheets instead.
window.LAST_REFRESH = ${JSON.stringify(new Date().toISOString())};
var SNAPSHOT = [
  ${j(SNAPSHOT).slice(1, -1)}
];

var QUEUE = [
  ${j(QUEUE).slice(1, -1)}
];

var BACKLOG = [
  ${j(BACKLOG).slice(1, -1)}
];
`;
  fs.writeFileSync(__dirname + "/data.js", out);
}
