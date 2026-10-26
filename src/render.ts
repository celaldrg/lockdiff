import type { Change, DiffResult } from "./diff.js";

export interface FileDiff {
  file: string;
  ecosystem: string;
  result: DiffResult;
}

const SYMBOL: Record<Change["kind"], string> = { added: "+", removed: "-", upgraded: "↑", downgraded: "↓", changed: "~" };

function versions(c: Change): string {
  switch (c.kind) {
    case "added":
      return c.to.join(", ");
    case "removed":
      return c.from.join(", ");
    case "changed":
      return `${c.from.length ? "-" + c.from.join(", -") : ""}${c.from.length && c.to.length ? " " : ""}${c.to.length ? "+" + c.to.join(", +") : ""}`;
    default:
      return `${c.from[0]} → ${c.to[0]}`;
  }
}

export function summary(r: DiffResult): string {
  const parts: string[] = [];
  for (const k of ["upgraded", "downgraded", "added", "removed", "changed"] as const) {
    if (r.counts[k]) parts.push(`${r.counts[k]} ${k}`);
  }
  if (r.counts.major) parts.push(`${r.counts.major} major`);
  return parts.join(" · ") || "no package changes";
}

const ORDER: Change["kind"][] = ["upgraded", "downgraded", "added", "removed", "changed"];
function sorted(changes: Change[]): Change[] {
  return [...changes].sort(
    (a, b) =>
      Number(b.bump === "major") - Number(a.bump === "major") ||
      ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Collapse runs of packages from the same scope (or Rust/Go family prefix) that made the exact same move,
 * e.g. 23 x "@esbuild/<platform> 0.21.4 -> 0.23.0" becomes one "@esbuild/* (23)" row.
 */
export function groupChanges(changes: Change[], min = 3): Change[] {
  const family = (n: string) => {
    if (n.startsWith("@") && n.includes("/")) return n.slice(0, n.indexOf("/")) + "/*";
    const m = /^(.+?)[-_/]/.exec(n);
    return m ? m[1] + (n[m[1].length] === "/" ? "/*" : n[m[1].length] + "*") : null;
  };
  const buckets = new Map<string, Change[]>();
  for (const c of changes) {
    const f = family(c.name);
    const key = f ? `${f}\0${c.kind}\0${c.from.join(",")}\0${c.to.join(",")}` : `\0${c.name}`;
    const b = buckets.get(key);
    if (b) b.push(c);
    else buckets.set(key, [c]);
  }
  const out: Change[] = [];
  for (const [key, list] of buckets) {
    if (list.length >= min && !key.startsWith("\0")) {
      out.push({ ...list[0], name: `${key.split("\0")[0]} (${list.length})` });
    } else out.push(...list);
  }
  return out;
}

export function renderText(files: FileDiff[], color: boolean, group = true): string {
  const c = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const COLOR: Record<Change["kind"], string> = { added: "32", removed: "31", upgraded: "36", downgraded: "33", changed: "35" };
  const out: string[] = [];
  for (const f of files) {
    out.push(`${c("1", f.file)} ${c("2", `(${f.ecosystem})`)}  ${summary(f.result)}`);
    const rows = sorted(group ? groupChanges(f.result.changes) : f.result.changes);
    const w = Math.min(40, Math.max(0, ...rows.map((r) => r.name.length)));
    for (const ch of rows) {
      const tag = `${SYMBOL[ch.kind]} ${ch.kind.padEnd(10)}`;
      const bump = ch.bump && ch.bump !== "other" ? `  ${ch.bump === "major" ? c("1;33", "major") : c("2", ch.bump)}` : "";
      out.push(`  ${c(COLOR[ch.kind], tag)} ${ch.name.padEnd(w)}  ${versions(ch)}${bump}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export function renderMarkdown(files: FileDiff[], group = true): string {
  const out: string[] = [];
  for (const f of files) {
    out.push(`### \`${f.file}\``, "", `${summary(f.result)}`, "");
    if (!f.result.changes.length) continue;
    out.push("| | Package | Change | Versions |", "| --- | --- | --- | --- |");
    for (const ch of sorted(group ? groupChanges(f.result.changes) : f.result.changes)) {
      const bump = ch.bump === "major" ? " **major**" : ch.bump && ch.bump !== "other" ? ` ${ch.bump}` : "";
      out.push(`| ${SYMBOL[ch.kind]} | \`${ch.name}\` | ${ch.kind}${bump} | ${versions(ch).replace(/\|/g, "\\|")} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

export function render(files: FileDiff[], format: "text" | "markdown" | "json", color = false, group = true): string {
  if (format === "json") return JSON.stringify(files.map((f) => ({ file: f.file, ecosystem: f.ecosystem, ...f.result })), null, 2);
  if (format === "markdown") return renderMarkdown(files, group);
  return renderText(files, color, group);
}
