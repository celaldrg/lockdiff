import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.js");
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, "--no-color", ...args], { cwd, encoding: "utf8" });

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lockdiff-"));
  const g = (...a: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir });
  g("init", "-q", "-b", "main");
  writeFileSync(join(dir, "Cargo.lock"), '[[package]]\nname = "serde"\nversion = "1.0.190"\n\n[[package]]\nname = "rand"\nversion = "0.8.5"\n');
  writeFileSync(join(dir, "README.md"), "hi\n");
  g("add", ".");
  g("commit", "-qm", "one");
  writeFileSync(join(dir, "Cargo.lock"), '[[package]]\nname = "serde"\nversion = "1.0.210"\n\n[[package]]\nname = "rand"\nversion = "0.9.0"\n\n[[package]]\nname = "log"\nversion = "0.4.22"\n');
  return dir;
}

test("working tree vs HEAD, text output", (t) => {
  const dir = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = run([], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Cargo\.lock \(cargo\) {2}2 upgraded · 1 added · 1 major/);
  assert.match(r.stdout, /↑ upgraded {3}rand {3}0\.8\.5 → 0\.9\.0 {2}major/);
  // major bumps are listed first
  assert.ok(r.stdout.indexOf("rand") < r.stdout.indexOf("serde"));
});

test("json, markdown and the --fail-on gate", (t) => {
  const dir = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const j = JSON.parse(run(["--format", "json"], dir).stdout);
  assert.equal(j[0].file, "Cargo.lock");
  assert.equal(j[0].counts.major, 1);
  const md = run(["-f", "md"], dir).stdout;
  assert.match(md, /\| ↑ \| `rand` \| upgraded \*\*major\*\* \| 0\.8\.5 → 0\.9\.0 \|/);
  assert.equal(run(["--fail-on", "major"], dir).status, 1);
  assert.equal(run(["--fail-on", "any"], dir).status, 1);
});

test("two files compared directly, and usage errors", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lockdiff-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "old.lock"), "github.com/a/b v1.0.0 h1:x=\n");
  writeFileSync(join(dir, "go.sum"), "github.com/a/b v1.0.1 h1:y=\n");
  const r = run(["old.lock", "go.sum"], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /github\.com\/a\/b {2}v1\.0\.0 → v1\.0\.1 {2}patch/);
  assert.equal(run(["--nope"], dir).status, 2);
  assert.equal(run(["no-such-ref"], dir).status, 2);
});
