import type { Locked } from "./parsers.js";

export type Bump = "major" | "minor" | "patch" | "other";

export interface Change {
  name: string;
  kind: "added" | "removed" | "upgraded" | "downgraded" | "changed";
  from: string[];
  to: string[];
  /** only for single-version upgrades/downgrades */
  bump?: Bump;
}

export interface DiffResult {
  changes: Change[];
  counts: Record<Change["kind"], number> & { major: number };
}

/** Split a version into numeric parts plus prerelease, tolerating Go's "v" prefix and pseudo-versions. */
export function parseVersion(v: string): { nums: number[]; pre: string } | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:[-.]?([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
  if (!m) return null;
  const nums = [m[1], m[2], m[3], m[4]].filter((x) => x !== undefined).map(Number);
  return { nums, pre: m[5] ?? "" };
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return a.localeCompare(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  // a release sorts after its prereleases
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre, undefined, { numeric: true });
}

/** Semver-style bump; for 0.x versions the minor number is treated as the breaking one (Cargo/npm convention). */
export function classifyBump(from: string, to: string): Bump {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (!a || !b) return "other";
  const [a0 = 0, a1 = 0, a2 = 0] = a.nums;
  const [b0 = 0, b1 = 0, b2 = 0] = b.nums;
  if (a0 !== b0) return "major";
  if (a0 === 0 && a1 !== b1) return "major";
  if (a1 !== b1) return "minor";
  if (a2 !== b2) return "patch";
  return a.pre !== b.pre || a.nums[3] !== b.nums[3] ? "patch" : "other";
}

export function diffLocked(before: Locked, after: Locked): DiffResult {
  const changes: Change[] = [];
  const names = [...new Set([...before.keys(), ...after.keys()])].sort((x, y) => x.localeCompare(y));
  for (const name of names) {
    const a = [...(before.get(name) ?? [])].sort(compareVersions);
    const b = [...(after.get(name) ?? [])].sort(compareVersions);
    if (a.join("\0") === b.join("\0")) continue;
    if (!a.length) changes.push({ name, kind: "added", from: [], to: b });
    else if (!b.length) changes.push({ name, kind: "removed", from: a, to: [] });
    else if (a.length === 1 && b.length === 1) {
      const up = compareVersions(b[0], a[0]) > 0;
      changes.push({ name, kind: up ? "upgraded" : "downgraded", from: a, to: b, bump: classifyBump(a[0], b[0]) });
    } else {
      // several copies of the same package: show which versions came and went
      const gone = a.filter((v) => !b.includes(v));
      const came = b.filter((v) => !a.includes(v));
      changes.push({ name, kind: "changed", from: gone, to: came });
    }
  }
  const counts = { added: 0, removed: 0, upgraded: 0, downgraded: 0, changed: 0, major: 0 };
  for (const c of changes) {
    counts[c.kind]++;
    if (c.bump === "major") counts.major++;
  }
  return { changes, counts };
}
