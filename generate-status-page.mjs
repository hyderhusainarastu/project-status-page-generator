#!/usr/bin/env node
// Generates a static, self-contained HTML status page from a JSON status
// file that lists your project's phases and their items. Also acts as a
// CI staleness gate: run with --check to fail the build if the checked-in
// HTML doesn't match what the current JSON would produce.
//
// Usage:
//   node generate-status-page.mjs [--input status.json] [--output status.html] [--check]
//
// See examples/status.json for the input shape and examples/status.html
// for the page it produces.

import { readFile, writeFile } from "node:fs/promises";

const validStates = new Set(["planned", "in_progress", "blocked", "complete"]);

function fail(message) {
  throw new Error(`Invalid status file: ${message}`);
}

function text(value, pathName) {
  if (typeof value !== "string" || value.trim() === "") fail(`${pathName} must be a non-empty string`);
  return value;
}

function validateItems(items, pathPrefix) {
  if (!Array.isArray(items) || items.length === 0) fail(`${pathPrefix}.items must be a non-empty array`);
  for (const item of items) {
    text(item.id, `${pathPrefix} item.id`);
    text(item.title, `${pathPrefix} item ${item.id}.title`);
    text(item.summary, `${pathPrefix} item ${item.id}.summary`);
    if (!validStates.has(item.state)) fail(`${pathPrefix} item ${item.id}.state is not recognized`);
  }
}

function validate(status) {
  if (!status || typeof status !== "object") fail("root must be an object");
  if (status.schemaVersion !== 1) fail("schemaVersion must equal 1");
  text(status.updated, "updated");
  text(status.project?.name, "project.name");
  text(status.current?.headline, "current.headline");
  text(status.current?.summary, "current.summary");
  text(status.current?.nextAction, "current.nextAction");
  if (!Number.isInteger(status.current?.phase)) fail("current.phase must be an integer");
  if (!Array.isArray(status.phases) || status.phases.length === 0) fail("phases must be a non-empty array");

  // Phase numbers must be contiguous starting at zero, in order. This keeps
  // the roadmap section's "Phase N of M" framing meaningful without forcing
  // you to renumber earlier phases when you add a new one at the end.
  const expectedNumbers = Array.from({ length: status.phases.length }, (_, index) => index);
  const actualNumbers = status.phases.map((phase) => phase?.number);
  if (JSON.stringify(actualNumbers) !== JSON.stringify(expectedNumbers)) {
    fail(`phases must list phases 0 through ${status.phases.length - 1} exactly once, in order`);
  }
  if (!actualNumbers.includes(status.current.phase)) fail("current.phase must exist in phases");

  for (const phase of status.phases) {
    text(phase.title, `phase ${phase.number}.title`);
    text(phase.summary, `phase ${phase.number}.summary`);
    text(phase.confirmation, `phase ${phase.number}.confirmation`);
    if (!validStates.has(phase.state)) fail(`phase ${phase.number}.state is not recognized`);
    if (phase.tag != null) text(phase.tag, `phase ${phase.number}.tag`);
    if (phase.evidence != null && (!Array.isArray(phase.evidence) || phase.evidence.some((item) => typeof item !== "string"))) {
      fail(`phase ${phase.number}.evidence must be an array of strings`);
    }
    if (phase.items != null) validateItems(phase.items, `phase ${phase.number}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function label(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function evidenceList(items = []) {
  return items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
}

function renderItem(item) {
  return `<li class="item ${item.state}"><div><span class="item-id">${escapeHtml(item.id)}</span><h4>${escapeHtml(item.title)}</h4></div><span class="status ${item.state}">${escapeHtml(label(item.state))}</span><p>${escapeHtml(item.summary)}</p></li>`;
}

function renderPhase(phase) {
  const items = phase.items?.length
    ? `<ol class="items">${phase.items.map(renderItem).join("")}</ol>`
    : "";
  const tag = phase.tag ? `<p class="meta">Tag: <code>${escapeHtml(phase.tag)}</code></p>` : "";
  const itemCount = phase.items?.length
    ? `<p class="meta">${phase.items.filter((i) => i.state === "complete").length} / ${phase.items.length} items complete</p>`
    : "";
  return `<li class="phase ${phase.state}"><div class="phase-heading"><div><p class="eyebrow">Phase ${phase.number}</p><h3>${escapeHtml(phase.title)}</h3></div><span class="status ${phase.state}">${escapeHtml(label(phase.state))}</span></div><p>${escapeHtml(phase.summary)}</p>${tag}${itemCount}<p class="confirmation"><strong>Gate:</strong> ${escapeHtml(phase.confirmation)}</p>${evidenceList(phase.evidence)}${items}</li>`;
}

function render(status, sourceLabel) {
  const counts = Object.fromEntries([...validStates].map((state) => [state, status.phases.filter((phase) => phase.state === state).length]));
  const currentPhase = status.phases.find((phase) => phase.number === status.current.phase);
  const currentItems = currentPhase?.items ?? [];
  const completedItems = currentItems.filter((item) => item.state === "complete").length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(status.project.name)} — Project status</title>
  <style>
    :root { --ink:#25211d; --muted:#675f56; --paper:#fcfaf5; --panel:#fffdf9; --line:#ded7cc; --accent:#7c3f20; --complete:#2f6b4d; --progress:#9a5a19; --planned:#676a78; --blocked:#a23d34; }
    @media (prefers-color-scheme: dark) { :root { --ink:#ece6da; --muted:#b4aa9a; --paper:#1c1815; --panel:#242019; --line:#3c352b; --accent:#e0a06a; --complete:#7fcaa0; --progress:#e0b060; --planned:#a8a8b4; --blocked:#e08a80; } }
    * { box-sizing:border-box; } body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { max-width:72rem; margin:auto; padding:clamp(1.25rem,4vw,4rem) clamp(1rem,4vw,2rem) 4rem; overflow-x:hidden; } h1,h2,h3,h4,p { margin-top:0; } h1 { font:700 clamp(2.2rem,6vw,4.8rem)/1.02 Georgia,serif; letter-spacing:-.04em; max-width:14ch; } h2 { font:700 clamp(1.55rem,3vw,2.35rem)/1.1 Georgia,serif; letter-spacing:-.025em; } h3 { font:700 1.22rem/1.2 Georgia,serif; } h4 { margin:0; font-size:1rem; } a { color:var(--accent); } code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.88em; word-break:break-word; }
    header { border-bottom:1px solid var(--line); padding-bottom:2rem; } .eyebrow { margin-bottom:.4rem; color:var(--accent); font-size:.78rem; font-weight:750; letter-spacing:.1em; text-transform:uppercase; } .lede { max-width:61ch; color:var(--muted); font-size:1.1rem; }
    section { margin-top:3.5rem; } .overview { display:grid; grid-template-columns:minmax(0,2fr) minmax(13rem,1fr); gap:1.5rem; align-items:stretch; } .card,.metric,.phase { border:1px solid var(--line); background:var(--panel); border-radius:.75rem; box-shadow:0 .3rem 1.2rem rgba(69,50,27,.045); } .card { padding:1.4rem; } .metric { display:grid; place-content:center; padding:1.4rem; text-align:center; } .metric strong { font:700 2.45rem/1 Georgia,serif; } .metric span { color:var(--muted); margin-top:.5rem; }
    .counts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.7rem; margin-top:1.3rem; } .count { padding:.75rem; border:1px solid var(--line); border-radius:.5rem; } .count strong,.count span { display:block; } .count strong { font-size:1.35rem; } .count span { color:var(--muted); font-size:.8rem; }
    .phases { list-style:none; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin:0; padding:0; } .phase { padding:1.2rem; } .phase-heading,.item>div { display:flex; gap:.75rem; justify-content:space-between; align-items:flex-start; } .phase h3 { margin-bottom:.55rem; } .phase .eyebrow { margin:.1rem 0 .25rem; } .phase>p:not(.eyebrow) { color:var(--muted); } .meta,.confirmation { color:var(--muted); font-size:.88rem; } .confirmation strong { color:var(--ink); }
    .status { display:inline-flex; flex:none; align-items:center; border-radius:999px; padding:.18rem .55rem; font-size:.72rem; font-weight:750; line-height:1.2; white-space:nowrap; } .status.complete { background:#e5f2e9; color:var(--complete); } .status.in_progress { background:#fff0d9; color:var(--progress); } .status.blocked { background:#f9e4e1; color:var(--blocked); } .status.planned { background:#ececf0; color:var(--planned); }
    @media (prefers-color-scheme: dark) { .status.complete { background:#193024; } .status.in_progress { background:#332208; } .status.blocked { background:#331e1c; } .status.planned { background:#28262c; } }
    ul { padding-left:1.2rem; } li+li { margin-top:.4rem; } .phase ul { color:var(--muted); font-size:.88rem; } .items { list-style:none; margin:1rem 0 0; padding:0; border-top:1px solid var(--line); } .item { padding:1rem 0 0; } .item+li { margin-top:0; border-top:1px solid var(--line); } .item h4 { margin:.15rem 0 .35rem; } .item p { margin:.5rem 0 0; color:var(--muted); font-size:.9rem; } .item-id { color:var(--accent); font-size:.78rem; font-weight:750; }
    footer { margin-top:4rem; border-top:1px solid var(--line); padding-top:1rem; color:var(--muted); font-size:.88rem; }
    @media (max-width:44rem) { .overview,.phases { grid-template-columns:1fr; } .counts { grid-template-columns:repeat(2,minmax(0,1fr)); } } @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; transition:none!important; } }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">${escapeHtml(status.project.name)} · Generated project status</p>
      <h1>Progress, evidence, and the next gate.</h1>
      <p class="lede">This standalone page is generated from <code>${escapeHtml(sourceLabel)}</code>.</p>
    </header>
    <section class="overview" aria-labelledby="current-title">
      <div class="card">
        <p class="eyebrow">Current position</p>
        <h2 id="current-title">${escapeHtml(status.current.headline)}</h2>
        <p>${escapeHtml(status.current.summary)}</p>
        <p><strong>Next action:</strong> ${escapeHtml(status.current.nextAction)}</p>
        <div class="counts" aria-label="Phase totals">
          <div class="count"><strong>${counts.complete}</strong><span>complete</span></div>
          <div class="count"><strong>${counts.in_progress}</strong><span>in progress</span></div>
          <div class="count"><strong>${counts.blocked}</strong><span>blocked</span></div>
          <div class="count"><strong>${counts.planned}</strong><span>planned</span></div>
        </div>
      </div>
      <div class="metric"><strong>${completedItems} / ${currentItems.length}</strong><span>current-phase items complete</span></div>
    </section>
    <section aria-labelledby="roadmap-title">
      <p class="eyebrow">Roadmap</p><h2 id="roadmap-title">Phases 0–${status.phases.at(-1)?.number ?? 0}</h2>
      <ol class="phases">${status.phases.map(renderPhase).join("")}</ol>
    </section>
    <footer>Generated from <code>${escapeHtml(sourceLabel)}</code> on record date ${escapeHtml(status.updated)}. Run this script again after editing the source; pass <code>--check</code> in CI to reject a stale output file.</footer>
  </main>
</body>
</html>
`;
}

function parseArgs(argv) {
  const options = { input: "status.json", output: "status.html", check: false };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--check") {
      options.check = true;
    } else if (argument === "--input") {
      options.input = argv[++i];
    } else if (argument === "--output") {
      options.output = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${argument}\nUsage: node generate-status-page.mjs [--input status.json] [--output status.html] [--check]`);
    }
  }
  if (!options.input || !options.output) throw new Error("--input and --output require a value");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const status = JSON.parse(await readFile(options.input, "utf8"));
  validate(status);
  const output = render(status, options.input);

  if (options.check) {
    const existing = await readFile(options.output, "utf8").catch(() => "");
    if (existing !== output) {
      throw new Error(`${options.output} is stale. Run: node generate-status-page.mjs --input ${options.input} --output ${options.output}`);
    }
    console.log(`${options.output} is up to date.`);
  } else {
    await writeFile(options.output, output);
    console.log(`Wrote ${options.output}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
