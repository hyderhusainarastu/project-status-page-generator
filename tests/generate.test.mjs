import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "generate-status-page.mjs");
const run = (args, cwd) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), "psg-"));
  copyFileSync(join(root, "examples", "status.json"), join(dir, "status.json"));
  return dir;
};

test("--help exits 0 and prints usage", () => {
  const r = run(["--help"], root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test("unknown flag exits 2", () => {
  assert.equal(run(["--nope"], root).status, 2);
});

test("generate then --check passes", () => {
  const dir = fixture();
  assert.equal(run([], dir).status, 0);
  assert.equal(run(["--check"], dir).status, 0);
});

test("--check fails and writes nothing when the page is stale", () => {
  const dir = fixture();
  run([], dir);
  const stale = readFileSync(join(dir, "status.html"), "utf8") + "<!-- edited -->";
  writeFileSync(join(dir, "status.html"), stale);
  const r = run(["--check"], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stale/);
  assert.equal(readFileSync(join(dir, "status.html"), "utf8"), stale);
});

test("--check fails when the output file is missing", () => {
  assert.equal(run(["--check"], fixture()).status, 1);
});

test("committed example page matches a fresh render", () => {
  const r = run(["--input", "examples/status.json", "--output", "examples/status.html", "--check"], root);
  assert.equal(r.status, 0, r.stderr);
});

test("invalid state is rejected", () => {
  const dir = fixture();
  const data = JSON.parse(readFileSync(join(dir, "status.json"), "utf8"));
  data.phases[0].state = "done";
  writeFileSync(join(dir, "status.json"), JSON.stringify(data));
  const r = run([], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Invalid status file/);
});
