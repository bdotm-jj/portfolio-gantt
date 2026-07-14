import React, { useMemo, useState } from "react";

/*
  Portfolio Gantt — View A: Planned vs. Actual, ordered by the manual priority list
  ---------------------------------------------------------------------------------
  Self-hosted, reads live from two Smartsheet sources joined on Project Name:
    - Portfolio Summary (8767740555775876): planned/actual dates, status, stage
    - Projects Intake Sheet (4414567862980484): Manual Ordering (the priority list),
      column "Manual Ordering" (col index 58). Ordering is scoped per Line of Business:
      0 = already in flight, 1/2/3… = the forward queue. Gaps are intentional (room
      to insert without renumbering).

  DATA LAYER (wire on deploy): the SNAPSHOT below is a static export, same spirit as
  the roster app's data.js. To go live, replace getProjects() with a join of the two
  sheets (regenerate on a schedule, or fetch via a token-holding proxy). Row shape:
    [name, pod, lob, status, stage, planStart, planEnd, actStart, actEnd, manualOrder]

  MODELING (agreed):
    - Planned dates are write-once at intake; actuals move. The delta IS the comparison.
    - End of the planned bar is the reference edge; actual past it renders red (overrun).
    - Rows sort by Manual Ordering within each pod (blank = unranked, sorts last),
      then planned start as the tiebreaker.
    - On-hold / not-started = "parked": muted + hatched, not a literal past bar.
    - Active view excludes Closed / Done / Backlog.
*/

const SNAPSHOT = [
  ["2026 Wholesaler Onboarding","Nebula Team","Other","","","2026-03-03","2026-05-04","2026-01-01","2026-12-31",null],
  ["Agency Fees","Moonbase Team","Support/Specialty","On Hold","Blocked","2025-10-14","2026-02-04","2025-06-09","2026-01-21",0],
  ["Agency Fees Management","Support/Specialty","Support/Specialty","At Risk","Development","2025-10-14","2026-02-04","2025-10-15","2026-08-11",1],
  ["Atrium - PL","PL Pod","Personal Lines","","","2026-03-03","2026-06-03","2026-03-02","2026-06-01",null],
  ["Auto Renewals - PL","Mission Control","Support/Specialty","At Risk","UAT - Accounting","2025-09-02","2025-11-14","2024-09-02","2026-07-21",2],
  ["Automated Quote Logging and Locking","Launch Pad","Support/Specialty","In-Progress","Discovery","2026-03-20","2026-04-02",null,"2025-01-17",null],
  ["Automation: Self-Serve / rules","Motion Pod","Motion - HVH","In-Progress","Discovery","2026-02-17","2026-04-01","2026-01-30","2026-03-20",null],
  ["BI Reporting — Commercial Lines","Data Reporting Pod","Data Reporting Team","","","2026-04-14","2026-09-17","2026-02-25","2026-04-15",null],
  ["BI Reporting — Marketing","Data Reporting Pod","Data Reporting Team","","","2026-04-14","2026-10-01","2026-02-25","2026-04-15",null],
  ["BI Reporting — Personal Lines","Data Reporting Pod","Data Reporting Team","","","2026-04-14","2026-09-25","2026-02-25","2026-04-15",null],
  ["CertifID","Architecture","Tech Initiative","In-Progress","Discovery","2026-05-01","2026-06-30","2026-05-01","2026-08-19",2],
  ["Chubb API","PL Pod","Personal Lines","In-Progress","Development","2025-02-19","2026-04-30","2025-02-19","2026-09-25",1],
  ["Chubb Local Rating","PL Pod","Personal Lines","In-Progress","Hypercare","2025-12-17","2026-02-02","2024-11-18","2026-07-27",0],
  ["Condo Launch","Motion Pod","Motion - Condos","On Hold","Discovery","2026-06-18","2026-08-21","2026-02-25","2026-06-18",null],
  ["Condo Rater – New UI","PL Pod","Personal Lines","On Hold","Development","2026-02-04","2026-07-10","2025-07-25","2026-05-12",9],
  ["Coverforce SSO for Workers Comp","CL Pod","Commercial Lines","","","2026-07-13","2026-09-14","2026-02-25","2026-07-13",null],
  ["CPAC - External Facing Rater","CL Pod","Commercial Lines","In-Progress","Hypercare","2025-05-01","2026-02-03","2025-02-25","2026-06-18",0],
  ["Earthquake transition to MARS","PL Pod","Personal Lines","","","2026-08-12","2026-10-21","2026-02-25","2026-08-12",null],
  ["Excess Property - MA & NC","PL Pod","Personal Lines","","","2026-11-23","2027-02-03","2026-02-25","2026-11-23",null],
  ["Excess Wind transition to MARS","PL Pod","Personal Lines","","","2026-07-02","2026-11-19","2026-02-25","2026-07-02",null],
  ["GLISE Forms API","PL Pod","Personal Lines","On Hold","Development","2026-02-05","2026-04-01","2026-02-05","2026-04-29",4],
  ["GLISE Lifecycle API","PL Pod","Personal Lines","On Hold","Hypercare","2026-02-06","2026-03-05","2025-05-13","2026-04-08",0],
  ["GLISE State Expansion - Group 2","PL Pod","Personal Lines","","","2026-04-06","2026-05-15","2026-02-25","2026-04-06",null],
  ["GLISE State Expansion - Group 3","PL Pod","Personal Lines","","","2026-05-19","2026-07-01","2026-02-25","2026-05-19",null],
  ["HVH GLISE Contract Phase 1","Motion Pod","Motion - HVH","In-Progress","Hypercare","2026-02-12","2026-04-10","2026-02-12","2026-07-09",null],
  ["HVH: Indication API","Motion Pod","Motion - HVH","Not Started","Discovery","2025-12-03","2026-02-20","2025-12-03","2026-01-20",null],
  ["JJCM - New MARS Claims System","Support/Specialty","Support/Specialty","In-Progress","Discovery","2026-04-27","2026-05-20","2026-04-27","2026-07-01",4],
  ["JJPF Interest Income Optimization","Architecture","Tech Initiative","In-Progress","Discovery","2026-06-08","2026-06-22","2026-06-08","2026-06-08",4],
  ["Mailing Suppression","Support/Specialty","Support/Specialty","At Risk","UAT - Operations","2026-05-15","2026-07-07","2026-05-25","2026-06-18",3],
  ["Markel Capacity Program","CL Pod","Commercial Lines","In-Progress","Development","2026-02-02","2026-03-13","2026-02-02","2026-08-24",0],
  ["Markel Forms API","PL Pod","Personal Lines","On Hold","Development","2026-07-03","2026-08-27","2026-03-06","2026-04-07",6],
  ["Markel State Expansion - Group 3","PL Pod","Personal Lines","","","2026-08-31","2026-10-12","2026-02-25","2026-08-31",null],
  ["Markel State Expansion - Group 4","PL Pod","Personal Lines","","","2026-11-19","2027-01-04","2026-02-25","2026-11-19",null],
  ["Markel State Expansion - Group 5","PL Pod","Personal Lines","","","2026-10-14","2026-11-24","2026-02-25","2026-10-14",null],
  ["Markel State Expansion - Group 6","PL Pod","Personal Lines","","","2026-01-06","2026-02-16","2026-01-06","2026-02-25",null],
  ["Markel X-Wind Barrier Island API","PL Pod","Personal Lines","","","2026-02-26","2026-03-25","2026-02-25","2026-02-26",null],
  ["Markel X-Wind transition to MARS","PL Pod","Personal Lines","On Hold","Discovery","2026-06-11","2026-09-18","2025-07-25","2026-09-22",7],
  ["MARS Online Issuance","PL Pod","Personal Lines","On Hold","Hypercare","2025-10-30","2025-12-26","2025-10-15","2026-04-08",0],
  ["MeshVI Integration","JJOA","JJOA","In-Progress","Discovery","2026-04-06","2026-05-21","2026-04-06","2026-06-30",1],
  ["Moratorium Service","Architecture","Tech Initiative","In-Progress","Discovery","2026-05-01","2026-06-30","2026-05-01","2026-05-01",3],
  ["Motion HVH API","PL Pod","Personal Lines","On Hold","Development","2026-04-20","claims","2026-04-20","2026-05-15",5],
  ["Munich RE - Commercial","Flood Pod","Flood","In-Progress","QA - Internal","2026-02-18","2026-04-29","2026-02-18","2026-07-24",0],
  ["New Flood UI","Flood Pod","Flood","In-Progress","Discovery","2026-05-01","2026-09-08","2026-05-01","2026-05-01",1],
  ["P3: Quote and Printing Improvement","Program Pod","Program","In-Progress","Development","2026-03-12","2026-06-22","2026-03-12","2026-10-07",1],
  ["Premium & Income Dashboard","Data Reporting Pod","Data Reporting Team","In-Progress","QA - Internal","2026-01-05","2026-10-01","2026-01-05","2026-04-15",null],
  ["QBE New Company Setup","PL Pod","Personal Lines","In-Progress","Ready for QA","2026-06-01","2026-07-15","2026-02-25","2026-06-01",0],
  ["Quote Funnel Dashboard","Data Reporting Pod","Data Reporting Team","At Risk","Development","2026-05-13","2026-07-13","2026-05-13","2026-08-07",null],
  ["Quote Rush Integration","Flood Pod","Flood","On Hold","Discovery","2027-03-05","2027-05-13","2026-02-25","2027-03-05",3],
  ["ReAlign Risk Board","Data Reporting Pod","Data Reporting Team","In-Progress","Hypercare","2026-02-01","2026-09-11","2026-02-01","2026-04-15",null],
  ["Risk Based Pricing","PL Pod","Personal Lines","","","2026-05-04","2026-06-30","2026-02-25","2026-05-04",null],
  ["Rules Engine - PL","PL Pod","Personal Lines","","","2026-09-22","2026-12-31","2026-02-25","2026-09-22",null],
  ["Scottsdale API","PL Pod","Personal Lines","In-Progress","UAT - Operations","2025-10-13","2026-01-13","2025-09-22","2026-03-10",0],
  ["Texas Rates/forms for Co 0","PL Pod","Personal Lines","","","2026-07-14","2026-08-10","2026-02-25","2026-07-14",null],
  ["Transportation Installment Invoices","CL Pod","Commercial Lines","","","2026-07-13","2026-09-14","2026-02-25","2026-07-13",6],
  ["Transportation Rater Update","CL Pod","Commercial Lines","On Hold","Blocked","2026-06-01","2026-07-01","2026-05-19","2026-08-10",1],
  ["VAVE New Company Set Up","PL Pod","Personal Lines","In-Progress","UAT - Operations","2026-02-12","2026-04-09","2026-04-10","2026-07-08",0],
  ["VAVE State Expansion - Group 2","PL Pod","Personal Lines","","","2026-04-13","2026-05-22","2026-02-25","2026-04-13",null],
  ["VAVE State Expansion - Group 3","PL Pod","Personal Lines","","","2026-05-27","2026-07-08","2026-02-25","2026-05-27",null],
  ["VAVE State Expansion - Group 4","PL Pod","Personal Lines","","","2026-07-10","2026-07-20","2026-02-25","2026-07-10",null],
  ["VAVE State Expansion - Group 5","PL Pod","Personal Lines","","","2026-08-24","2026-10-05","2026-02-25","2026-08-24",null],
  ["Workflow Dashboard","Data Reporting Pod","Data Reporting Team","At Risk","UAT - Operations","2026-01-01","2026-07-01","2026-01-01","2026-04-15",null],
];

/*
  Forward queue (the "on deck" list) — sourced from Projects Intake Sheet Manual Ordering.
  Includes items with order >= 1 (the queue after what's currently in flight at order 0),
  INCLUDING backlog / ready-for-dev / intake items that have no dated bar above yet.
  Shape: [name, lob, order, stage]
*/
const QUEUE = [
  ["Chubb API","Personal Lines",1,"Development"],
  ["Scottsdale Phase 3","Personal Lines",2,"Ready for Dev"],
  ["Scottsdale Phase 4","Personal Lines",3,"Ready for Dev"],
  ["GLISE Forms API","Personal Lines",4,"Development · on hold"],
  ["Motion HVH API","Personal Lines",5,"Development · on hold"],
  ["Markel Forms API","Personal Lines",6,"Development · on hold"],
  ["Markel X-Wind transition to MARS","Personal Lines",7,"Discovery · on hold"],
  ["AMIG Watercraft API","Personal Lines",8,"Ready for Dev"],
  ["Condo Rater – New UI","Personal Lines",9,"Development · on hold"],
  ["MARS Circular Submission Logic Revision","Personal Lines",10,"Intake"],

  ["Transportation Rater Update","Commercial Lines",1,"Blocked · on hold"],
  ["Scottsdale Bind API","Commercial Lines",2,"Backlog"],
  ["Westchester Bind Api","Commercial Lines",3,"Backlog"],
  ["Scottsdale Artisan Rater","Commercial Lines",4,"Backlog"],
  ["Westchester Artisan Rater","Commercial Lines",5,"Backlog"],
  ["Transportation Installment Invoices","Commercial Lines",6,"Queued"],
  ["Guard - Capacity Provider","Commercial Lines",7,"Backlog"],

  ["New Flood UI","Flood",1,"Discovery"],
  ["CertifID - Flood","Flood",2,"Discovery"],
  ["Quote Rush Integration","Flood",3,"Discovery · on hold"],

  ["Agency Fees Management","Support/Specialty",1,"Development"],
  ["Auto Renewals - PL","Support/Specialty",2,"UAT - Accounting"],
  ["Mailing Suppression","Support/Specialty",3,"UAT - Operations"],
  ["JJCM - New MARS Claims System","Support/Specialty",4,"Discovery"],

  ["CertifID","Tech Initiative",2,"Discovery"],
  ["Moratorium Service","Tech Initiative",3,"Discovery"],
  ["JJPF Interest Income Optimization","Tech Initiative",4,"Discovery"],

  ["P3: Quote and Printing Improvement","Program",1,"Development"],
  ["UWM Portal 2.0","Program",2,"Backlog"],
  ["Expand Quote Logging - all Policy Types","Program",3,"Backlog"],
  ["5004 (QBE) - Mortgage, Title, WS Rating Update","Program",4,"Backlog"],
  ["5001 - EPL Base Rates MARS Updates","Program",5,"Backlog"],
  ["5001 - New Rates for Mini Correspondents","Program",6,"Backlog"],
  ["5007 (Facility B) - MFG E&O Rating Update","Program",7,"Backlog"],
  ["5003 - Excess Program in MARS","Program",8,"Backlog"],
  ["5041 - Community Banks in MARS","Program",9,"Backlog"],
  ["D&O EPL - Rater in MARS","Program",10,"Backlog"],
];

/*
  Backlog stage projects (Overall Project Stage = Backlog) from the Intake Sheet.
  The BacklogPanel below shows only the ones NOT already accounted for — i.e. not an
  active bar in the Gantt and not already in the On Deck queue — so this surfaces the
  pipeline depth that isn't represented anywhere else. Shape: [name, lob, order|null]
*/
const BACKLOG = [
  ["5001 - EPL Base Rates MARS Updates","Program",5],
  ["5001 - New Rates for Mini Correspondents","Program",6],
  ["5003 - Excess Program in MARS","Program",8],
  ["5004 (QBE) - Mortgage, Title, WS Rating Update","Program",4],
  ["5004 (QBE) - New Package Policy Type","Program",4],
  ["5007 (Facility B) - MFG E&O Rating Update","Program",7],
  ["5041 - Community Banks in MARS","Program",9],
  ["D&O EPL - Rater in MARS","Program",10],
  ["Expand Quote Logging - all Policy Types","Program",3],
  ["UWM Portal 2.0","Program",2],
  ["Guard - Capacity Provider","Commercial Lines",7],
  ["Scottsdale Artisan Rater","Commercial Lines",4],
  ["Scottsdale Bind API","Commercial Lines",2],
  ["Westchester Artisan Rater","Commercial Lines",5],
  ["Westchester Bind Api","Commercial Lines",3],
  ["Markel State Expansion","Personal Lines",null],
  ["VAVE State Expansion","Personal Lines",null],
  ["Paperless Project | Insured Portal","Support/Specialty",null],
  ["Bookroll","Motion",null],
];

const LOB_COLOR = {
  "Personal Lines": "#2a78d6",
  "Commercial Lines": "#1f7a3d",
  "Flood": "#c0397a",
  "Motion - HVH": "#7a5cd0",
  "Motion - Condos": "#c85a2a",
  "Motion - Flood": "#5a86c0",
  "Data Reporting Team": "#b87500",
  "Support/Specialty": "#0f8a6d",
  "Tech Initiative": "#c0433f",
  "Program": "#8a6d1f",
  "JJOA": "#4a6b8a",
  "Other": "#7a786f",
};

const INK = "#16263d";
const CREAM = "#f4f0e6";
const CARD = "#faf7ef";
const RULE = "#d9d2c2";
const ACCENT = "#2e7d46";

const PARKED_STATUS = new Set(["On Hold", "Not Started", ""]);
const EXCLUDE_STAGE = new Set(["Done", "Backlog", "13 - Done"]);

function parseDate(v) {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function getProjects() {
  return SNAPSHOT.map((r) => {
    const [name, pod, lob, status, stage, ps, pe, as, ae, manualOrder] = r;
    const planStart = parseDate(ps);
    const planEnd = parseDate(pe);
    const actStart = parseDate(as);
    const actEnd = parseDate(ae);
    const gaps = [];
    if (!planStart) gaps.push("planned start");
    if (!planEnd) gaps.push("planned end");
    const parked = PARKED_STATUS.has(status || "");
    return {
      name, pod, lob: lob || "Other", status: status || "—", stage,
      planStart, planEnd, actStart, actEnd,
      rawPlanEnd: pe, rawActEnd: ae,
      manualOrder: (manualOrder === null || manualOrder === undefined) ? null : Number(manualOrder),
      gaps, parked,
    };
  });
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// Glossy, raised pill: vertical gradient + top highlight + drop shadow.
function bar3d(base) {
  return {
    backgroundImage: `linear-gradient(to bottom, ${shade(base, 48)} 0%, ${base} 52%, ${shade(base, -38)} 100%)`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 3px rgba(0,0,0,0.22), 0 1.5px 2.5px rgba(0,0,0,0.28)",
  };
}

function compareOrder(a, b) {
  const oa = a.manualOrder == null ? Infinity : a.manualOrder;
  const ob = b.manualOrder == null ? Infinity : b.manualOrder;
  if (oa !== ob) return oa - ob;
  return (a.planStart || 0) - (b.planStart || 0);
}

export default function PortfolioGantt() {
  const all = useMemo(getProjects, []);
  const active = useMemo(
    () => all.filter((p) => !EXCLUDE_STAGE.has(p.stage) && p.status !== "Closed"),
    [all]
  );

  const lobs = useMemo(() => [...new Set(active.map((p) => p.lob))].sort(), [active]);
  const [filter, setFilter] = useState("__all");
  const [collapsed, setCollapsed] = useState({});
  const rows = filter === "__all" ? active : active.filter((p) => p.lob === filter);

  const gapRows = active.filter((p) => p.gaps.length > 0);

  const { domainStart, span, ticks } = useMemo(() => {
    const FLOOR = new Date(2026, 0, 1);
    const ds = rows.flatMap((p) => [p.planStart, p.planEnd, p.actStart, p.actEnd]).filter(Boolean);
    if (!ds.length) return { domainStart: FLOOR, span: 1, ticks: [] };
    const max = new Date(Math.max(...ds.map((d) => +d)));
    const start = FLOOR;
    const pad = (max - start) * 0.03;
    const end = new Date(+max + pad);
    const sp = end - start;
    const t = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const stepMonths = sp > 400 * 86400000 * 2.2 ? 2 : 1;
    while (cur < end) {
      t.push(new Date(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + stepMonths, 1);
    }
    return { domainStart: start, span: sp, ticks: t };
  }, [rows]);


  const pct = (d) => (d ? ((d - domainStart) / span) * 100 : null);
  const today = new Date();
  const todayPct = pct(today);

  const byLob = {};
  rows.forEach((p) => {
    byLob[p.lob] = byLob[p.lob] || {};
    byLob[p.lob][p.pod] = byLob[p.lob][p.pod] || [];
    byLob[p.lob][p.pod].push(p);
  });
  const lobOrder = Object.keys(byLob).sort(
    (a, b) =>
      Object.values(byLob[b]).flat().length - Object.values(byLob[a]).flat().length ||
      a.localeCompare(b)
  );

  const LABEL_W = 250;

  return (
    <div style={{ background: CREAM, color: INK, fontFamily: "'Iowan Old Style', Georgia, 'Times New Roman', serif", padding: "28px 26px", minHeight: "100vh" }}>
      <style>{`
        .pg-sel { font: inherit; font-size: 13px; padding: 5px 10px; border: 0.5px solid ${INK}; background: ${CARD}; color: ${INK}; border-radius: 2px; }
        .pg-lobbar { display: flex; align-items: baseline; justify-content: space-between; background: ${INK}; color: ${CREAM}; padding: 9px 14px; border-radius: 3px; margin: 18px 0 2px; cursor: pointer; }
        .pg-row:hover { background: rgba(22,38,61,0.04); }
        .sans { font-family: 'Helvetica Neue', Arial, sans-serif; }
      `}</style>

      <header style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 14, marginBottom: 6 }}>
        <div className="sans" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b6656", display: "flex", justifyContent: "space-between" }}>
          <span>J&amp;J DIT — Development Portfolio</span>
          <span>Planned vs. actual · ordered by priority list · live from Smartsheet</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 }}>
          <h1 style={{ fontSize: 46, fontStyle: "italic", fontWeight: 500, margin: 0, lineHeight: 1 }}>
            The Timeline<span style={{ color: ACCENT }}>.</span>
          </h1>
          <div className="sans" style={{ textAlign: "right", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b6656" }}>
            <div style={{ fontSize: 26, fontFamily: "'Iowan Old Style', Georgia, serif", textTransform: "none", color: INK }}>{active.length}</div>
            active projects
          </div>
        </div>
      </header>

      <div className="sans" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", margin: "14px 0", fontSize: 12, color: "#4a463c" }}>
        <select className="pg-sel" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="__all">All lines of business</option>
          {lobs.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <Legend />
      </div>

      {gapRows.length > 0 && (
        <div className="sans" style={{ background: "#fbf1d8", border: `0.5px solid #d8b24a`, borderRadius: 4, padding: "10px 14px", margin: "6px 0 14px", fontSize: 12.5, color: "#6b5410" }}>
          <strong style={{ fontWeight: 600 }}>{gapRows.length} project{gapRows.length > 1 ? "s" : ""} can’t render fully — missing or invalid planned dates:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {gapRows.map((p) => (
              <li key={p.name} style={{ marginBottom: 2 }}>
                {p.name} <span style={{ color: "#8a7020" }}>
                  ({p.gaps.length ? `no ${p.gaps.join(" / ")}` : "check dates"}
                  {p.rawPlanEnd && !p.planEnd ? ` — planned end reads “${p.rawPlanEnd}”` : ""})
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 6, fontStyle: "italic", color: "#8a7020" }}>PJMs: fix at source and this clears on next refresh.</div>
        </div>
      )}

      <div style={{ position: "relative", display: "flex", fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 10.5, color: "#8a8474", borderBottom: `0.5px solid ${RULE}`, height: 20, marginLeft: LABEL_W }}>
        {ticks.map((t, i) => (
          <span key={i} style={{ position: "absolute", left: pct(t) + "%" }}>
            {t.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
          </span>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        {todayPct >= 0 && todayPct <= 100 && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${LABEL_W}px + ${todayPct}% * (100% - ${LABEL_W}px) / 100%)`, width: 1, background: "#c0433f", opacity: 0.5, zIndex: 1 }} />
        )}

        {lobOrder.map((lob) => {
          const pods = byLob[lob];
          const total = Object.values(pods).flat().length;
          const isCollapsed = collapsed[lob];
          const color = LOB_COLOR[lob] || LOB_COLOR.Other;
          return (
            <div key={lob}>
              <div className="pg-lobbar" onClick={() => setCollapsed((c) => ({ ...c, [lob]: !c[lob] }))}>
                <span style={{ fontStyle: "italic", fontSize: 18 }}>
                  <span style={{ display: "inline-block", width: 9, height: 9, background: color, borderRadius: 2, marginRight: 9 }} />
                  {lob}
                </span>
                <span className="sans" style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.8 }}>
                  {total} project{total > 1 ? "s" : ""} · {isCollapsed ? "show" : "hide"}
                </span>
              </div>
              {!isCollapsed &&
                Object.keys(pods).sort().map((pod) => (
                  <div key={pod}>
                    <div className="sans" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8474", padding: "9px 4px 3px", borderBottom: `0.5px solid ${RULE}` }}>
                      {pod} <span style={{ color: "#b4ad9a" }}>({pods[pod].length})</span>
                    </div>
                    {pods[pod].slice().sort(compareOrder).map((p) => (
                      <GanttRow key={p.name} p={p} pct={pct} color={color} labelW={LABEL_W} />
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      <QueuePanel active={active} />
      <BacklogPanel active={active} />

      <footer className="sans" style={{ marginTop: 22, paddingTop: 10, borderTop: `0.5px solid ${RULE}`, fontSize: 11, color: "#8a8474", display: "flex", justifyContent: "space-between" }}>
        <span>Badge = manual ordering (0 = in flight, 1+ = queue) · outline = planned · fill = actual · red = past planned end</span>
        <span>Excludes closed / done / backlog. Muted + hatched = On Hold or Not Started.</span>
      </footer>
    </div>
  );
}

function QueuePanel({ active }) {
  const lobs = [...new Set(QUEUE.map((q) => q[1]))];
  // count what's currently in flight (manual order 0) per LOB from live active data
  const inFlight = {};
  active.forEach((p) => {
    if (p.manualOrder === 0) inFlight[p.lob] = (inFlight[p.lob] || 0) + 1;
  });
  const byLob = {};
  QUEUE.forEach((q) => {
    (byLob[q[1]] = byLob[q[1]] || []).push({ name: q[0], order: q[2], stage: q[3] });
  });
  const order = lobs.sort((a, b) => byLob[b].length - byLob[a].length || a.localeCompare(b));

  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 8, marginBottom: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 30, fontStyle: "italic", fontWeight: 500, margin: 0 }}>On Deck<span style={{ color: ACCENT }}>.</span></h2>
        <span className="sans" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b6656" }}>Forward queue by line of business · manual ordering</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {order.map((lob) => {
          const color = LOB_COLOR[lob] || LOB_COLOR.Other;
          const items = byLob[lob].sort((a, b) => a.order - b.order);
          return (
            <div key={lob} style={{ background: CARD, border: `0.5px solid ${RULE}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: INK, color: CREAM, padding: "8px 12px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontStyle: "italic", fontSize: 15 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: color, borderRadius: 2, marginRight: 8 }} />
                  {lob}
                </span>
                <span className="sans" style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.8 }}>
                  {inFlight[lob] ? `${inFlight[lob]} in flight · ` : ""}{items.length} queued
                </span>
              </div>
              <ol style={{ listStyle: "none", margin: 0, padding: "4px 0" }}>
                {items.map((it) => (
                  <li key={it.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 12px", borderBottom: `0.5px solid #ede7d8` }}>
                    <span className="sans" style={{ flexShrink: 0, width: 19, height: 19, borderRadius: "50%", background: CREAM, border: `1px solid ${INK}`, color: INK, fontSize: 10.5, fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{it.order}</span>
                    <span style={{ flex: 1, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={it.name}>{it.name}</span>
                    <span className="sans" style={{ flexShrink: 0, fontSize: 9.5, letterSpacing: "0.03em", textTransform: "uppercase", color: "#8a8474" }}>{it.stage}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BacklogPanel({ active }) {
  const accounted = new Set([...active.map((p) => p.name), ...QUEUE.map((q) => q[0])]);
  const byLob = {};
  BACKLOG.forEach((b) => {
    const [name, lob, order] = b;
    byLob[lob] = byLob[lob] || { shown: [], queued: 0 };
    if (accounted.has(name)) byLob[lob].queued += 1;
    else byLob[lob].shown.push({ name, order });
  });
  const lobsWithItems = Object.keys(byLob).filter((l) => byLob[l].shown.length > 0);
  const totalShown = lobsWithItems.reduce((s, l) => s + byLob[l].shown.length, 0);
  if (totalShown === 0) return null;
  const order = lobsWithItems.sort((a, b) => byLob[b].shown.length - byLob[a].shown.length || a.localeCompare(b));

  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 8, marginBottom: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 30, fontStyle: "italic", fontWeight: 500, margin: 0 }}>Backlog<span style={{ color: ACCENT }}>.</span></h2>
        <span className="sans" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b6656" }}>{totalShown} not shown above · neither dated nor queued</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {order.map((lob) => {
          const color = LOB_COLOR[lob] || LOB_COLOR.Other;
          const { shown, queued } = byLob[lob];
          return (
            <div key={lob} style={{ background: CARD, border: `0.5px solid ${RULE}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#5a564c", color: CREAM, padding: "8px 12px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontStyle: "italic", fontSize: 15 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, background: color, borderRadius: 2, marginRight: 8 }} />
                  {lob}
                </span>
                <span className="sans" style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 }}>{shown.length} in backlog</span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: "4px 0" }}>
                {shown.map((it) => (
                  <li key={it.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 12px", borderBottom: `0.5px solid #ede7d8` }}>
                    <span className="sans" style={{ flexShrink: 0, width: 19, height: 19, borderRadius: "50%", background: "transparent", border: "1px dashed #b4ad9a", color: "#a49d88", fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{it.order == null ? "–" : it.order}</span>
                    <span style={{ flex: 1, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#5a564c" }} title={it.name}>{it.name}</span>
                  </li>
                ))}
              </ul>
              {queued > 0 && (
                <div className="sans" style={{ padding: "6px 12px", fontSize: 10.5, color: "#8a8474", fontStyle: "italic", borderTop: `0.5px solid #ede7d8` }}>
                  +{queued} more backlog item{queued > 1 ? "s" : ""} already queued in On Deck above
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GanttRow({ p, pct, color, labelW }) {
  const clamp = (v) => (v == null ? null : Math.max(0, v));
  const psP = clamp(pct(p.planStart));
  const peP = clamp(pct(p.planEnd));
  const asP = clamp(pct(p.actStart));
  const aeP = clamp(pct(p.actEnd));
  const hasPlan = psP != null && peP != null;
  const hasActual = asP != null && aeP != null;
  const overran = hasActual && p.planEnd && p.actEnd > p.planEnd;
  const splitP = overran ? Math.max(pct(p.planEnd), asP) : null;
  const overDays = overran ? daysBetween(p.planEnd, p.actEnd) : 0;
  const fill = p.parked ? "#b4ad9a" : color;
  const badge = p.manualOrder == null ? null : p.manualOrder;

  return (
    <div className="pg-row" style={{ display: "flex", alignItems: "center", height: 46, borderBottom: `0.5px solid #e8e1d0` }}>
      <div style={{ width: labelW, paddingRight: 10, flexShrink: 0, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 7 }} title={p.name}>
        <span className="sans" title={badge == null ? "Unranked" : `Manual ordering: ${badge}`} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, background: badge == null ? "transparent" : badge === 0 ? color : CARD, color: badge == null ? "#c4bda8" : badge === 0 ? "#fff" : INK, border: badge == null ? "1px dashed #c4bda8" : badge === 0 ? "none" : `1px solid ${INK}` }}>
          {badge == null ? "–" : badge}
        </span>
        {p.parked && <span className="sans" style={{ fontSize: 8.5, letterSpacing: "0.05em", textTransform: "uppercase", color: "#8a8474", border: "0.5px solid #b4ad9a", borderRadius: 2, padding: "0 4px", flexShrink: 0 }}>{p.status && p.status !== "—" ? p.status : "Not Started"}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      </div>
      <div style={{ position: "relative", flex: 1, height: "100%" }}>
        {hasPlan && (
          <div title={`Planned: ${p.planStart.toLocaleDateString()} – ${p.planEnd.toLocaleDateString()}`}
            style={{ position: "absolute", left: psP + "%", width: Math.max(peP - psP, 0.4) + "%", top: 7, height: 12, border: `1.5px solid ${p.parked ? "#b4ad9a" : "#6b6656"}`, borderRadius: 3, backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.06), rgba(255,255,255,0.35))", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.15), 0 0.5px 0 rgba(255,255,255,0.6)", boxSizing: "border-box" }} />
        )}
        {hasActual && !overran && (
          <div title={`Actual: ${p.actStart.toLocaleDateString()} – ${p.actEnd.toLocaleDateString()}${p.parked ? " · " + (p.status && p.status !== "—" ? p.status : "Not Started") : ""}`}
            style={{ position: "absolute", left: asP + "%", width: Math.max(aeP - asP, 0.4) + "%", top: 23, height: 16, borderRadius: 5,
              ...(p.parked
                ? { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.55) 4px, rgba(255,255,255,0.55) 8px), linear-gradient(to bottom, ${shade(fill, 40)}, ${fill} 55%, ${shade(fill, -30)})`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.18)", opacity: 0.7 }
                : bar3d(fill)) }} />
        )}
        {hasActual && overran && (
          <>
            <div title={`Actual to planned end: ${p.actStart.toLocaleDateString()} – ${p.planEnd.toLocaleDateString()}`}
              style={{ position: "absolute", left: asP + "%", width: Math.max(splitP - asP, 0.4) + "%", top: 23, height: 16, borderRadius: "5px 0 0 5px", ...bar3d(fill) }} />
            <div title={`Overrun: past planned end by ${overDays} days (→ ${p.actEnd.toLocaleDateString()})`}
              style={{ position: "absolute", left: splitP + "%", width: Math.max(aeP - splitP, 0.4) + "%", top: 23, height: 16, borderRadius: "0 5px 5px 0", ...bar3d("#c0433f") }} />
          </>
        )}
      </div>
    </div>
  );
}

function Legend() {
  const item = (node, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{node}<span>{label}</span></span>
  );
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
      {item(<span style={{ width: 16, height: 8, border: "1.5px solid #6b6656", borderRadius: 2, boxSizing: "border-box", display: "inline-block" }} />, "planned")}
      {item(<span style={{ width: 16, height: 8, background: "#2a78d6", borderRadius: 2, display: "inline-block" }} />, "actual")}
      {item(<span style={{ width: 16, height: 8, background: "#c0433f", borderRadius: 2, display: "inline-block" }} />, "past planned end")}
      {item(<span style={{ width: 16, height: 8, background: "#b4ad9a", borderRadius: 2, display: "inline-block", opacity: 0.6 }} />, "on hold / not started")}
    </div>
  );
}
