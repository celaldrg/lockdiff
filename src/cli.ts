#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { diffLocked } from "./diff.js";
import { KINDS, kindFor, type Locked } from "./parsers.js";
import { render, type FileDiff } from "./render.js";
import { changedFiles, isRef, showAt, toplevel } from "./git.js";

const VERSION = "0.1.0";
const HELP = `lockdiff - readable diffs for lockfiles

Usage:
  lockdiff                      lockfile changes in the working tree vs HEAD
  lockdiff <ref>                working tree vs a git ref (branch, tag, commit)
  lockdiff <ref1> <ref2>        between two git refs, e.g. lockdiff main HEAD
  lockdiff <old-file> <new-file>  compare two lockfiles directly

Options:
  -f, --format <fmt>    text (default), markdown, json
  --fail-on <level>     exit 1 if there is any 'major' bump, or 'any' change
  -C <dir>              run in this directory
  --no-group            list every package instead of collapsing families
                        that moved together (e.g. @esbuild/* platform builds)
  --no-color            disable colors
  -h, --help            show help
  -v, --version         show version

Supported: ${KINDS.flatMap((k) => k.names).join(", ")}`;

class UsageError extends Error {}

function parseLock(file: string, text: string | null): Locked {
  if (text === null || text.trim() === "") return new Map();
  const kind = kindFor(file);
  if (!kind) throw new UsageError(`unsupported lockfile: ${file}`);
  try {
    return kind.parse(text);
  } catch (e) {
    throw new Error(`cannot parse ${file}: ${(e as Error).message}`);
  }
}

function main(argv: string[]): number {
  let format: "text" | "markdown" | "json" = "text";
  let failOn: "major" | "any" | undefined;
  let cwd = process.cwd();
  let color = process.stdout.isTTY && !process.env.NO_COLOR;
  let group = true;
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "-h" || a === "--help") {
      console.log(HELP);
      return 0;
    } else if (a === "-v" || a === "--version") {
      console.log(VERSION);
      return 0;
    } else if (a === "-f" || a === "--format") {
      const f = val();
      if (f === "md") format = "markdown";
      else if (f === "text" || f === "markdown" || f === "json") format = f;
      else throw new UsageError(`unknown format ${f}`);
    } else if (a === "--fail-on") {
      const f = val();
      if (f !== "major" && f !== "any") throw new UsageError("--fail-on must be major or any");
      failOn = f;
    } else if (a === "-C") cwd = resolve(val());
    else if (a === "--no-color") color = false;
    else if (a === "--no-group") group = false;
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}`);
    else pos.push(a);
  }
  if (pos.length > 2) throw new UsageError("too many arguments");

  const files: FileDiff[] = [];
  const isFile = (p: string) => existsSync(resolve(cwd, p)) && statSync(resolve(cwd, p)).isFile();
  if (pos.length === 2 && isFile(pos[0]) && isFile(pos[1])) {
    const [a, b] = pos.map((p) => resolve(cwd, p));
    const kind = kindFor(b) ?? kindFor(a);
    if (!kind) throw new UsageError(`unsupported lockfile: ${pos[1]}`);
    const before = kind.parse(readFileSync(a, "utf8"));
    const after = kind.parse(readFileSync(b, "utf8"));
    files.push({ file: pos[1], ecosystem: kind.ecosystem, result: diffLocked(before, after) });
  } else {
    const [from = "HEAD", to] = pos;
    for (const r of [from, to]) if (r && !isRef(r, cwd)) throw new UsageError(`not a file or git ref: ${r}`);
    const root = toplevel(cwd);
    for (const file of changedFiles(from, to, cwd)) {
      const kind = kindFor(file);
      if (!kind) continue;
      const before = parseLock(file, showAt(from, file, root));
      const afterText = to ? showAt(to, file, root) : existsSync(resolve(root, file)) ? readFileSync(resolve(root, file), "utf8") : null;
      const after = parseLock(file, afterText);
      const result = diffLocked(before, after);
      if (result.changes.length) files.push({ file: relative(cwd, resolve(root, file)) || file, ecosystem: kind.ecosystem, result });
    }
  }

  if (!files.length && format !== "json") {
    console.log("No dependency changes in lockfiles.");
  } else {
    process.stdout.write(render(files, format, color, group) + (format === "json" ? "\n" : ""));
  }
  const all = files.flatMap((f) => f.result.changes);
  if (failOn === "any" && all.length) return 1;
  if (failOn === "major" && all.some((c) => c.bump === "major")) return 1;
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`lockdiff: ${(e as Error).message}`);
  if (e instanceof UsageError) console.error("Run lockdiff --help for usage.");
  process.exitCode = 2;
}
