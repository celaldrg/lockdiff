/**
 * Lockfile parsers. Each returns a map from package name to the set of locked versions.
 * They are deliberately dependency-free: lockfiles are machine-written and regular enough
 * that small line-based readers are faster and more robust than a full YAML/TOML parser.
 */

export type Ecosystem =
  | "npm" | "pnpm" | "yarn" | "cargo" | "go" | "poetry" | "uv" | "pipenv" | "composer" | "bundler";

export type Locked = Map<string, Set<string>>;

export interface LockfileKind {
  ecosystem: Ecosystem;
  /** file names this parser handles */
  names: string[];
  parse(text: string): Locked;
}

function add(m: Locked, name: string, version: string): void {
  if (!name || !version) return;
  let s = m.get(name);
  if (!s) m.set(name, (s = new Set()));
  s.add(version);
}

/** package-lock.json / npm-shrinkwrap.json, lockfile v1, v2 and v3. */
export function parseNpm(text: string): Locked {
  const m: Locked = new Map();
  const j = JSON.parse(text);
  if (j.packages && typeof j.packages === "object") {
    for (const [key, info] of Object.entries<any>(j.packages)) {
      if (key === "" || !info || info.link) continue;
      const idx = key.lastIndexOf("node_modules/");
      if (idx < 0) continue; // workspace folders
      const name = info.name ?? key.slice(idx + "node_modules/".length);
      add(m, name, info.version);
    }
    return m;
  }
  const walk = (deps: Record<string, any> | undefined) => {
    for (const [name, info] of Object.entries<any>(deps ?? {})) {
      add(m, name, info?.version);
      walk(info?.dependencies);
    }
  };
  walk(j.dependencies);
  return m;
}

/** yarn.lock, both classic (v1) and Berry (v2+). */
export function parseYarn(text: string): Locked {
  const m: Locked = new Map();
  let names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    if (!line.startsWith(" ") && line.endsWith(":")) {
      // header: "lodash@^4.17.0, lodash@^4.17.21":   or   "@babel/core@npm:^7.0.0":
      names = line
        .slice(0, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .map((spec) => (spec.indexOf("@", 1) > 0 ? spec.slice(0, spec.indexOf("@", 1)) : spec))
        .filter(Boolean);
      continue;
    }
    const v = /^\s{2}version:?\s+"?([^"\s]+)"?/.exec(line);
    if (v && names.length) {
      for (const n of new Set(names)) add(m, n, v[1]);
      names = [];
    }
  }
  m.delete("__metadata");
  return m;
}

/** pnpm-lock.yaml, lockfile versions 5 to 9. Reads the keys of the `packages:` section. */
export function parsePnpm(text: string): Locked {
  const m: Locked = new Map();
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inPackages = line.trim() === "packages:";
      continue;
    }
    if (!inPackages) continue;
    const k = /^ {2}['"]?\/?((?:@[^/@]+\/)?[^/@(]+)[@/]([^:('"]+)/.exec(line);
    if (k && /^ {2}\S/.test(line)) add(m, k[1], k[2].replace(/_.*$/, ""));
  }
  return m;
}

/** TOML lockfiles made of [[package]] tables with name/version: Cargo.lock, poetry.lock, uv.lock. */
export function parseTomlPackages(text: string): Locked {
  const m: Locked = new Map();
  let inPkg = false;
  let name = "";
  let version = "";
  const flush = () => {
    if (inPkg) add(m, name, version);
    name = version = "";
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("[")) {
      if (t === "[[package]]") {
        flush();
        inPkg = true;
      } else if (/^\[\[?[^\]]+\]\]?$/.test(t) && !t.startsWith("[package.")) {
        flush();
        inPkg = false;
      }
      continue;
    }
    if (!inPkg) continue;
    const kv = /^(name|version)\s*=\s*"([^"]*)"/.exec(t);
    if (kv) {
      if (kv[1] === "name" && !name) name = kv[2];
      if (kv[1] === "version" && !version) version = kv[2];
    }
  }
  flush();
  return m;
}

/** go.sum: one module per line (the `/go.mod` hash lines are skipped). */
export function parseGoSum(text: string): Locked {
  const m: Locked = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [mod, ver] = line.trim().split(/\s+/);
    if (!mod || !ver || ver.endsWith("/go.mod")) continue;
    add(m, mod, ver);
  }
  // modules that only appear with /go.mod hashes are still part of the graph
  for (const line of text.split(/\r?\n/)) {
    const [mod, ver] = line.trim().split(/\s+/);
    if (mod && ver?.endsWith("/go.mod") && !m.has(mod)) add(m, mod, ver.slice(0, -"/go.mod".length));
  }
  return m;
}

/** Pipfile.lock: JSON with "default" and "develop" sections. */
export function parsePipenv(text: string): Locked {
  const m: Locked = new Map();
  const j = JSON.parse(text);
  for (const section of ["default", "develop"]) {
    for (const [name, info] of Object.entries<any>(j[section] ?? {})) {
      add(m, name.toLowerCase(), String(info?.version ?? "").replace(/^==/, ""));
    }
  }
  return m;
}

/** composer.lock: JSON with "packages" and "packages-dev" arrays. */
export function parseComposer(text: string): Locked {
  const m: Locked = new Map();
  const j = JSON.parse(text);
  for (const p of [...(j.packages ?? []), ...(j["packages-dev"] ?? [])]) {
    add(m, p.name, String(p.version ?? "").replace(/^v(?=\d)/, ""));
  }
  return m;
}

/** Gemfile.lock: "    name (version)" lines under "  specs:". */
export function parseBundler(text: string): Locked {
  const m: Locked = new Map();
  let inSpecs = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^ {2}specs:/.test(line)) {
      inSpecs = true;
      continue;
    }
    if (/^\S/.test(line) || line.trim() === "") inSpecs = false;
    if (!inSpecs) continue;
    const s = /^ {4}([^\s(]+) \(([^)]+)\)$/.exec(line);
    if (s) add(m, s[1], s[2].replace(/-(x86|arm|aarch|universal|java|x64).*$/, ""));
  }
  return m;
}

export const KINDS: LockfileKind[] = [
  { ecosystem: "npm", names: ["package-lock.json", "npm-shrinkwrap.json"], parse: parseNpm },
  { ecosystem: "pnpm", names: ["pnpm-lock.yaml"], parse: parsePnpm },
  { ecosystem: "yarn", names: ["yarn.lock"], parse: parseYarn },
  { ecosystem: "cargo", names: ["Cargo.lock"], parse: parseTomlPackages },
  { ecosystem: "go", names: ["go.sum"], parse: parseGoSum },
  { ecosystem: "poetry", names: ["poetry.lock"], parse: parseTomlPackages },
  { ecosystem: "uv", names: ["uv.lock"], parse: parseTomlPackages },
  { ecosystem: "pipenv", names: ["Pipfile.lock"], parse: parsePipenv },
  { ecosystem: "composer", names: ["composer.lock"], parse: parseComposer },
  { ecosystem: "bundler", names: ["Gemfile.lock"], parse: parseBundler },
];

export function kindFor(path: string): LockfileKind | undefined {
  const base = path.split(/[\\/]/).pop() ?? path;
  return KINDS.find((k) => k.names.includes(base));
}
