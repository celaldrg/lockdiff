import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBump, compareVersions, diffLocked } from "../src/diff.js";

const L = (o: Record<string, string[]>) => new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)]));

test("version ordering", () => {
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("v0.9.1", "v0.10.0"), -1);
  assert.equal(compareVersions("2.0.0-rc.1", "2.0.0"), -1);
  assert.equal(compareVersions("2.0.0-rc.10", "2.0.0-rc.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("bump classification follows semver, with 0.x minor as breaking", () => {
  assert.equal(classifyBump("1.2.3", "2.0.0"), "major");
  assert.equal(classifyBump("1.2.3", "1.3.0"), "minor");
  assert.equal(classifyBump("1.2.3", "1.2.4"), "patch");
  assert.equal(classifyBump("0.2.13", "0.3.2"), "major");
  assert.equal(classifyBump("0.0.1", "0.0.2"), "patch");
  assert.equal(classifyBump("v0.0.0-20240101-abc", "v0.0.0-20240202-def"), "patch");
  assert.equal(classifyBump("latest", "1.0.0"), "other");
});

test("diff finds every kind of change", () => {
  const r = diffLocked(
    L({ a: ["1.0.0"], b: ["2.0.0"], c: ["1.0.0"], d: ["3.0.0"], e: ["1.0.0", "2.0.0"], same: ["1.0.0"] }),
    L({ a: ["1.1.0"], b: ["1.9.0"], d: ["3.0.0"], e: ["2.0.0", "3.0.0"], f: ["0.1.0"], same: ["1.0.0"] }),
  );
  const by = Object.fromEntries(r.changes.map((c) => [c.name, c]));
  assert.equal(by.a.kind, "upgraded");
  assert.equal(by.a.bump, "minor");
  assert.equal(by.b.kind, "downgraded");
  assert.equal(by.b.bump, "major");
  assert.equal(by.c.kind, "removed");
  assert.equal(by.f.kind, "added");
  assert.deepEqual([by.e.kind, by.e.from, by.e.to], ["changed", ["1.0.0"], ["3.0.0"]]);
  assert.equal(by.same, undefined);
  assert.equal(by.d, undefined);
  assert.deepEqual(r.counts, { added: 1, removed: 1, upgraded: 1, downgraded: 1, changed: 1, major: 1 });
});

import { groupChanges } from "../src/render.js";

test("families that moved together are collapsed", () => {
  const mk = (name: string) => ({ name, kind: "upgraded" as const, from: ["0.21.4"], to: ["0.23.0"], bump: "major" as const });
  const g = groupChanges([mk("@esbuild/linux-x64"), mk("@esbuild/darwin-arm64"), mk("@esbuild/win32-x64"), mk("esbuild"), {
    ...mk("@esbuild/aix-ppc64"), to: ["0.22.0"] }]);
  assert.deepEqual(g.map((c) => c.name).sort(), ["@esbuild/* (3)", "@esbuild/aix-ppc64", "esbuild"]);
  const w = groupChanges(["windows_x86_64_gnu", "windows_i686_msvc", "windows_aarch64_msvc"].map((n) => ({ ...mk(n), kind: "added" as const, from: [], to: ["0.52.6"] })));
  assert.deepEqual(w.map((c) => c.name), ["windows_* (3)"]);
});
