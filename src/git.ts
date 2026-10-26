import { execFileSync } from "node:child_process";

export function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** Content of `path` at `ref`, or null if the file does not exist there. */
export function showAt(ref: string, path: string, cwd: string): string | null {
  try {
    return git(["show", `${ref}:${path}`], cwd);
  } catch {
    return null;
  }
}

export function isRef(ref: string, cwd: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/** Files that differ between `from` and `to` (or the working tree when `to` is undefined). */
export function changedFiles(from: string, to: string | undefined, cwd: string): string[] {
  const args = ["diff", "--name-only", "--no-renames", "-z", from];
  if (to) args.push(to);
  const root = git(["rev-parse", "--show-toplevel"], cwd).trim();
  return git(args, root).split("\0").filter(Boolean);
}

export function toplevel(cwd: string): string {
  return git(["rev-parse", "--show-toplevel"], cwd).trim();
}
